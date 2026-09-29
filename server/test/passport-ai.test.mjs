import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readPassportAi,validateAiPassport,checkPassportAi,PassportAiError,passportSchema} from '../src/passport/ai.mjs';
// Image preparation (rotation/resize) is covered by the OpenCV tests in portrait.test.mjs.
const prepareImage=async bytes=>bytes;
const raw={documentType:'passport',firstName:'ANNA',middleName:'MARIA',lastName:'ERIKSSON',nationality:'UTO',birthDate:'1974-08-12',gender:'Female',birthCountry:'',birthCity:'TEST CITY',passportNumber:'L898902C3',issueDate:'2010-01-01',expiryDate:'2012-04-15',passportIssuePlace:'UTO',mrzLine1:'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',mrzLine2:'L898902C36UTO7408122F1204159ZE184226B<<<<<10',unreadableFields:[],portraitBounds:{x:.1,y:.2,width:.2,height:.3}};
test('AI uses only the official image API, no storage, a strict schema and no browser tools',async()=>{
 const bytes=await sharp({create:{width:400,height:600,channels:3,background:'#eee'}}).jpeg().toBuffer();let called=0;
 const data=await readPassportAi(bytes,{OPENAI_API_KEY:'fixture-secret'},{prepareImage,fetchImpl:async(url,options)=>{
  called++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.redirect,'error');
  const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.tools,undefined);assert.deepEqual(body.text.format.schema,passportSchema);assert.match(body.input[0].content[1].image_url,/^data:image\/jpeg;base64,/);
  return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(raw)}]}],usage:{input_tokens:100,output_tokens:80}})}
 }});assert.equal(data.firstName,'ANNA');assert.equal(data.source,'ai');assert.equal(called,1);assert.equal(data.usage.outputTokens,80);
});
test('missing AI key never falls back to local OCR or sends a request',async()=>{
 let called=0;await assert.rejects(readPassportAi(Buffer.from('image'),{},{fetchImpl:()=>{called++}}),/AI ulanmagan/);assert.equal(called,0);
});
test('unreadable fields, invalid dates, conflicting MRZ digits and unsafe crop bounds remain unresolved',()=>{
 assert.throws(()=>validateAiPassport({...raw,documentType:'uncertain'}),PassportAiError);
 const parsed=validateAiPassport({...raw,mrzLine1:raw.mrzLine1.padEnd(44,'<'),passportNumber:'ZZ1234567',issueDate:'2026-02-30',unreadableFields:['firstName'],portraitBounds:{x:-.1,y:0,width:.3,height:.4}});
 assert.equal(parsed.firstName,'');assert.equal(parsed.issueDate,'');assert.equal(parsed.portraitBounds,null);assert.equal(parsed.passportNumber,'');assert.ok(parsed.conflicts.includes('passportNumber'));
});
test('API errors and incomplete responses do not expose server contents or create passport data',async()=>{
 const image=await sharp({create:{width:40,height:40,channels:3,background:'white'}}).png().toBuffer();
 for(const status of [401,403,429,500])await assert.rejects(readPassportAi(image,{OPENAI_API_KEY:'secret'},{prepareImage,fetchImpl:async()=>({ok:false,status,json:async()=>({error:'secret passport'})})}),e=>e instanceof PassportAiError&&!e.message.includes('secret'));
 await assert.rejects(readPassportAi(image,{OPENAI_API_KEY:'secret'},{prepareImage,fetchImpl:async()=>({ok:true,json:async()=>({status:'incomplete',output:[]})})}),/yakunlamadi/);
 let url;await checkPassportAi({OPENAI_API_KEY:'secret'},{fetchImpl:async u=>{url=u;return {ok:true}}});assert.match(url,/^https:\/\/api.openai.com\/v1\/models\//);
});

test('AI head bounds must be inside the printed portrait and have a known upright rotation',()=>{
 const reading={...raw,headBounds:{x:.12,y:.22,width:.12,height:.15},portraitRotation:90};
 const good=validateAiPassport(reading);assert.deepEqual(good.headBounds,reading.headBounds);assert.equal(good.portraitRotation,90);
 assert.equal(validateAiPassport({...reading,headBounds:{x:.5,y:.5,width:.2,height:.2}}).headBounds,null);
 assert.equal(validateAiPassport({...reading,portraitRotation:45}).headBounds,null);
});

test('printed M/F and Uzbek sex labels populate gender automatically without surname inference',()=>{
 for(const gender of ['F',' f ','Female','Ayol'])assert.equal(validateAiPassport({...raw,gender}).gender,'Female');
 for(const gender of ['M',' m ','Male','Erkak'])assert.equal(validateAiPassport({...raw,lastName:'TESTOVA',gender,mrzLine1:'',mrzLine2:''}).gender,'Male');
 for(const lastName of ['TESTOV','TESTOVA'])assert.equal(validateAiPassport({...raw,lastName,gender:'',mrzLine1:'',mrzLine2:''}).gender,'');
 assert.equal(validateAiPassport({...raw,lastName:'TESTOV',gender:'F'}).gender,'Female');
 assert.equal(validateAiPassport({...raw,gender:'F',unreadableFields:['gender']}).gender,'');
});
test('MRZ can supply missing sex but a printed/MRZ conflict stays unresolved',()=>{
 const document={...raw,mrzLine1:raw.mrzLine1.padEnd(44,'<')};
 assert.equal(validateAiPassport({...document,gender:''}).gender,'Female');
 const conflict=validateAiPassport({...document,gender:'M'});assert.equal(conflict.gender,'');assert.ok(conflict.conflicts.includes('gender'));
});
