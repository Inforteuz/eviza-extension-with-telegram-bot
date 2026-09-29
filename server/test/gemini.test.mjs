import test from 'node:test';
import assert from 'node:assert/strict';
import {readPassportAi,geminiSchema,passportSchema,geminiOrder,resetGeminiPreference,defaultGeminiModels,aiProvider,PassportAiError} from '../src/passport/ai.mjs';

const prepareImage=async bytes=>bytes;
const sleep=async()=>{};
const raw={documentType:'passport',firstName:'ANNA',middleName:'MARIA',lastName:'ERIKSSON',nationality:'UTO',birthDate:'1974-08-12',gender:'Female',birthCountry:'',birthCity:'TEST CITY',passportNumber:'L898902C3',issueDate:'2010-01-01',expiryDate:'2012-04-15',passportIssuePlace:'UTO',mrzLine1:'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',mrzLine2:'L898902C36UTO7408122F1204159ZE184226B<<<<<10',unreadableFields:[],portraitBounds:{x:.1,y:.2,width:.2,height:.3}};
const ok=()=>({ok:true,status:200,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:'thinking…',thought:true},{text:JSON.stringify(raw)}]}}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:20,thoughtsTokenCount:30}})});
const fail=(status,message='secret passport')=>({ok:false,status,json:async()=>({error:{code:status,message}})});
const modelOf=url=>decodeURIComponent(url.match(/models\/([^:]+):/)[1]);
const quiet=fn=>async()=>{const warn=console.warn;console.warn=()=>{};try{await fn()}finally{console.warn=warn;resetGeminiPreference()}};

test('Gemini schema keeps the fields but uses the OpenAPI subset',()=>{
 const s=geminiSchema(passportSchema);
 assert.equal(s.type,'OBJECT');assert.deepEqual(s.required,passportSchema.required);
 assert.equal(JSON.stringify(s).includes('additionalProperties'),false);
 assert.equal(s.properties.portraitBounds.nullable,true);assert.equal(s.properties.portraitBounds.type,'OBJECT');
 assert.equal(s.properties.unreadableFields.type,'ARRAY');
 for(const e of JSON.stringify(s).match(/"enum":\[[^\]]*\]/g)||[])assert.equal(e.includes('""'),false);
});

test('provider: explicit choice, else OpenAI key, else Gemini key',()=>{
 assert.equal(aiProvider({GEMINI_API_KEY:'g'}),'gemini');
 assert.equal(aiProvider({OPENAI_API_KEY:'o',GEMINI_API_KEY:'g'}),'openai');
 assert.equal(aiProvider({OPENAI_API_KEY:'o',GEMINI_API_KEY:'g',AI_PROVIDER:'gemini'}),'gemini');
 assert.equal(aiProvider({}),'');
});

test('Gemini: 3.7 flash first, key in a header, high thinking, JSON answer without thoughts',quiet(async()=>{
 const seen=[];
 const data=await readPassportAi(Buffer.from('jpeg'),{GEMINI_API_KEY:'g-secret'},{prepareImage,sleep,fetchImpl:async(url,options)=>{
  seen.push(modelOf(url));
  assert.match(url,/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[^/]+:generateContent$/);
  assert.equal(url.includes('g-secret'),false);assert.equal(options.headers['x-goog-api-key'],'g-secret');assert.equal(options.redirect,'error');
  const body=JSON.parse(options.body);
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'high');
  assert.equal(body.generationConfig.responseMimeType,'application/json');
  assert.equal(body.contents[0].parts[1].inlineData.mimeType,'image/jpeg');
  assert.equal(body.tools,undefined);
  return ok();
 }});
 assert.deepEqual(seen,['gemini-3.7-flash']);assert.deepEqual(defaultGeminiModels,['gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash']);
 assert.equal(data.firstName,'ANNA');assert.equal(data.provider,'gemini');assert.equal(data.model,'gemini-3.7-flash');
 assert.deepEqual(data.usage,{inputTokens:10,outputTokens:20,thinkingTokens:30});
}));

test('Gemini: busy models switch to the next one, and the one that answered stays first',quiet(async()=>{
 const seen=[];
 const fetchImpl=async url=>{const m=modelOf(url);seen.push(m);return m==='gemini-3.5-flash'?ok():fail(m==='gemini-3.7-flash'?503:429)};
 const data=await readPassportAi(Buffer.from('jpeg'),{GEMINI_API_KEY:'g'},{prepareImage,sleep,fetchImpl});
 assert.deepEqual(seen,['gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash']);assert.equal(data.model,'gemini-3.5-flash');
 assert.deepEqual(geminiOrder(defaultGeminiModels),['gemini-3.5-flash','gemini-3.7-flash','gemini-3.6-flash']);
 seen.length=0;await readPassportAi(Buffer.from('jpeg'),{GEMINI_API_KEY:'g'},{prepareImage,sleep,fetchImpl});
 assert.deepEqual(seen,['gemini-3.5-flash']);
 // The preference expires, so a recovered 3.7 is used again.
 assert.deepEqual(geminiOrder(defaultGeminiModels,Date.now()+11*60000),defaultGeminiModels);
}));

test('Gemini: a demand spike on every model is retried in later rounds',quiet(async()=>{
 let calls=0,pauses=0;
 const data=await readPassportAi(Buffer.from('jpeg'),{GEMINI_API_KEY:'g'},{prepareImage,sleep:async()=>{pauses++},fetchImpl:async()=>++calls<=4?fail(503):ok()});
 assert.equal(calls,5);assert.equal(pauses,1);assert.equal(data.lastName,'ERIKSSON');
}));

test('Gemini: GEMINI_MODEL overrides the list; thinking can be turned off or dropped for older models',quiet(async()=>{
 const bodies=[];
 await readPassportAi(Buffer.from('jpeg'),{GEMINI_API_KEY:'g',GEMINI_MODEL:'custom-a, custom-b',GEMINI_THINKING:'off'},{prepareImage,sleep,fetchImpl:async(url,o)=>{bodies.push([modelOf(url),JSON.parse(o.body)]);return ok()}});
 assert.equal(bodies[0][0],'custom-a');assert.equal(bodies[0][1].generationConfig.thinkingConfig,undefined);
 bodies.length=0;resetGeminiPreference();
 await readPassportAi(Buffer.from('jpeg'),{GEMINI_API_KEY:'g',GEMINI_MODEL:'old-model'},{prepareImage,sleep,fetchImpl:async(url,o)=>{const b=JSON.parse(o.body);bodies.push(b);return b.generationConfig.thinkingConfig?fail(400,'Thinking level is not supported for this model.'):ok()}});
 assert.equal(bodies.length,2);assert.equal(bodies[1].generationConfig.thinkingConfig,undefined);
}));

test('Gemini: errors are neutral, never mention the vendor or leak response text',quiet(async()=>{
 const cases=[[400,'API key not valid. Please pass a valid API key.',/sozlanmagan/],[400,'User location is not supported for the API use.',/hudud/],[403,'secret',/sozlanmagan/],[503,'secret',/band/],[400,'secret',/bajarilmadi/]];
 for(const [status,message,expected]of cases){
  await assert.rejects(readPassportAi(Buffer.from('jpeg'),{GEMINI_API_KEY:'g'},{prepareImage,sleep,fetchImpl:async()=>fail(status,message)}),e=>e instanceof PassportAiError&&expected.test(e.message)&&!/secret|gemini|google|\bAI\b/i.test(e.message));
 }
 await assert.rejects(readPassportAi(Buffer.from('jpeg'),{GEMINI_API_KEY:'g'},{prepareImage,sleep,fetchImpl:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[]}}]})})}),/yakunlamadi/);
 await assert.rejects(readPassportAi(Buffer.from('jpeg'),{GEMINI_API_KEY:'g'},{prepareImage,sleep,fetchImpl:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:'not json'}]}}]})})}),/formati/);
}));

test('Gemini: the time budget stops the fallback before the extension gives up',quiet(async()=>{
 let t=0,calls=0;
 await assert.rejects(readPassportAi(Buffer.from('jpeg'),{GEMINI_API_KEY:'g'},{prepareImage,sleep:async ms=>{t+=ms},now:()=>t,budgetMs:30000,fetchImpl:async()=>{calls++;t+=9000;return fail(503)}}),/band/);
 assert.ok(calls<=4,'calls: '+calls);
 calls=0;t=0;
 await assert.rejects(readPassportAi(Buffer.from('jpeg'),{GEMINI_API_KEY:'g'},{prepareImage,sleep,now:()=>t,budgetMs:100000,fetchImpl:async(url,o)=>{calls++;assert.ok(o.signal instanceof AbortSignal);t+=40000;throw new DOMException('timeout','TimeoutError')}}),/vaqtida/);
 assert.equal(calls,3);
}));
