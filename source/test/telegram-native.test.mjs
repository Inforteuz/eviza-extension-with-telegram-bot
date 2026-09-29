import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const sharp=(await import(createRequire(new URL('../agent/package.json',import.meta.url)).resolve('sharp'))).default;
import {LocalStore} from '../agent/local-store.mjs';
import {TelegramNative,normalizeField} from '../agent/telegram-native.mjs';
import {blankApplicant,defaultTripDates} from '../lib/domain.ts';

function fixture(t){const dir=mkdtempSync(path.join(tmpdir(),'evisa-native-'));const store=new LocalStore(dir);t.after(()=>{try{store.close()}catch{}rmSync(dir,{recursive:true,force:true})});return {store,dir}}
const data={...blankApplicant,firstName:'TEST',lastName:'APPLICANT',nationality:'Uzbekistan',birthDate:'1990-01-01',gender:'Female',maritalStatus:'Married',birthCountry:'Uzbekistan',birthCity:'TEST CITY',profession:'None',residenceCountry:'Uzbekistan',city:'TEST CITY',address:'TEST ADDRESS',passportNumber:'ZZ1234567',issueDate:'2022-01-01',expiryDate:'2035-01-01',passportIssuePlace:'Uzbekistan',...defaultTripDates(),visitPurpose:'Umrah',accommodationType:'Hotel',accommodationName:'TEST HOTEL'};
async function image(){return sharp(randomBytes(200*200*3),{raw:{width:200,height:200,channels:3}}).jpeg({quality:90}).toBuffer()}
async function upload(store,id,bytes,kind='passport',lease){const f=new FormData();f.set('file',new Blob([bytes]),'test.jpg');f.set('kind',kind);if(lease)f.set('lease',lease);return store.request('applications/'+id+'/upload','POST',f,lease?'worker':'operator')}
const user=(text,id=41)=>({update_id:id,message:{message_id:id,chat:{type:'private',id:12345},from:{id:12345},text}});
const click=(data,id=55,from=12345)=>({update_id:id,callback_query:{id:String(id),from:{id:from},data,message:{message_id:1,chat:{type:'private',id:12345}}}});
function botFixture(store){const messages=[],photos=[];const bot=new TelegramNative({store,operatorId:'12345',submissionEnabled:true,call:async(method,body)=>{messages.push({method,body});return {message_id:messages.length}},download:async()=>image(),sendImage:async(bytes,caption)=>photos.push({bytes,caption})});return {bot,messages,photos}}

test('standalone Telegram intake is operator-only, idempotent and has no Site URLs',async t=>{
 const {store,dir}=fixture(t),{bot,messages}=botFixture(store);
 await bot.handle({...user('/start'),message:{...user('/start').message,from:{id:999}}});assert.equal(messages.length,0);
 await bot.handle(user('/start'));assert.ok(messages.some(x=>x.body.reply_markup?.keyboard));
 const u={...user(''),message:{...user('').message,document:{file_id:'image',file_size:50000}}};
 await bot.handle(u);await bot.handle(u);
 const apps=await store.request('applications');assert.equal(apps.length,1);assert.equal(apps[0].status,'queued');assert.equal(apps[0].passport,true);
 assert.equal(JSON.stringify(messages).includes('chatgpt'),false);assert.equal(JSON.stringify(messages).includes('web_app'),false);
 if(process.platform!=='win32')assert.equal(statSync(path.join(dir,'applications.sqlite')).mode&0o777,0o600);
 assert.equal(apps[0].data.visitPurpose,'Umrah');assert.equal(apps[0].data.accommodationType,'Hotel');assert.equal(apps[0].data.accommodationName,'Al Jabriy');
});

test('Telegram previews suggestions without storing them; one fresh approval can queue the complete application',async t=>{
 const {store}=fixture(t),{bot,messages}=botFixture(store),bytes=await image();
 const a=await store.request('applications','POST',{data:{...data,maritalStatus:'',profession:'',address:''}},'operator');await upload(store,a.id,bytes,'portrait');
 await bot.show(a.id);const current=await store.request('applications/'+a.id),card=messages.at(-1).body;
 assert.equal(current.data.profession,'');assert.match(card.text,/Kasbi: None \(taklif, tekshiring\)/);
 assert.equal(card.text.includes('Saudiyadagi shahar: —'),false);
 await bot.handle(click('approve:'+a.id.slice(0,8)+':'+a.version));assert.equal((await store.request('applications/'+a.id)).status,'draft');
 await bot.handle(click('approve:'+a.id.slice(0,8)+':'+current.version,90));
 const approved=await store.request('applications/'+a.id);assert.equal(approved.data.profession,'None');assert.equal(approved.status,'queued');assert.equal(approved.job_type,'visa');
});

test('approving a template does not start untested Saudi automation and never fills a blank passport number',async t=>{
 const {store}=fixture(t),{bot}=botFixture(store);bot.submissionEnabled=false;
 const a=await store.request('applications','POST',{data:{...data,profession:'',passportNumber:''}},'operator');
 await bot.handle(click('approve:'+a.id.slice(0,8)+':'+a.version));
 const current=await store.request('applications/'+a.id);assert.equal(current.data.passportNumber,'');assert.equal(current.data.profession,'None');assert.equal(current.status,'draft');assert.equal(await store.request('claim','POST',{}),null);
});

test('local storage serializes jobs, protects leases, preserves files and requires fresh human confirmation',async t=>{
 const {store}=fixture(t),bytes=await image();
 const a=await store.request('applications','POST',{data},'operator');await upload(store,a.id,bytes);
 await store.request('applications/'+a.id+'/queue','POST',{job:'extract'},'operator');
 const job=await store.request('claim','POST',{});assert.equal(job.id,a.id);assert.equal(await store.request('claim','POST',{}),null);
 await assert.rejects(store.request('applications/'+a.id,'PATCH',{data,version:job.version},'operator'),/navbatdan/);
 await upload(store,a.id,bytes,'portrait',job.lease);
 await assert.rejects(store.request('applications/'+a.id+'/result','POST',{lease:'wrong',status:'needs_input'}),/muddati/);
 await store.request('applications/'+a.id+'/result','POST',{lease:job.lease,status:'needs_input',data,note:'Fixture OCR done'});
 let current=await store.request('applications/'+a.id);assert.equal(current.portrait,true);
 assert.deepEqual(await store.request('applications/'+a.id+'/file?kind=passport'),bytes);
 await assert.rejects(store.request('applications/'+a.id+'/queue','POST',{job:'visa',confirmed:true,version:current.version}),/shaxs/);
 await assert.rejects(store.request('applications/'+a.id+'/queue','POST',{job:'visa',confirmed:true,version:current.version-1},'operator'),/tasdiqlang/);
 await store.request('applications/'+a.id+'/queue','POST',{job:'visa',confirmed:true,version:current.version},'operator');
 await store.request('applications/'+a.id+'/pause','POST',{},'operator');assert.equal((await store.request('applications/'+a.id)).status,'draft');
});

test('Telegram edits stay in chat, old field buttons cannot change the next field, and unauthorized callbacks do nothing',async t=>{
 const {store}=fixture(t),{bot,messages}=botFixture(store);const a=await store.request('applications','POST',{data},'operator');
 await bot.askField(a.id,'gender');const p=bot.pending();
 await bot.handle(click('value:'+p.nonce+':0',99,999));assert.equal((await store.request('applications/'+a.id)).data.gender,'Female');
 await bot.handle(click('value:'+p.nonce+':0'));assert.equal((await store.request('applications/'+a.id)).data.gender,'Male');
 await bot.askField(a.id,'maritalStatus');await bot.handle(click('value:'+p.nonce+':1',56));assert.equal((await store.request('applications/'+a.id)).data.maritalStatus,'Married');
 await bot.handle(user('Ajrashgan',60));assert.equal((await store.request('applications/'+a.id)).data.maritalStatus,'Divorced');
 await bot.handle(user('/safar',61));const output=JSON.stringify(messages);assert.equal(output.includes('web_app'),false);assert.equal(output.includes('chatgpt.site'),false);
 assert.equal(normalizeField('birthDate','8.7.1971'),'1971-07-08');assert.throws(()=>normalizeField('birthDate','31.02.2000'));
});

test('suggestions need explicit matching revision; existing verified fields survive',async t=>{
 const {store}=fixture(t),{bot}=botFixture(store);const a=await store.request('applications','POST',{data:{...data,profession:'',address:''}},'operator');
 await bot.handle(click('suggest:'+a.id.slice(0,8)));const proposal=store.getMeta('telegram-suggestion');
 assert.equal((await store.request('applications/'+a.id)).data.profession,'');
 await store.request('applications/'+a.id,'PATCH',{version:a.version,data:{...a.data,profession:'Teacher'}},'operator');
 await bot.handle(click('apply:'+proposal.nonce,80));assert.equal((await store.request('applications/'+a.id)).data.profession,'Teacher');
 await bot.handle(click('suggest:'+a.id.slice(0,8),81));const current=store.getMeta('telegram-suggestion');await bot.handle(click('apply:'+current.nonce,82));
 const updated=await store.request('applications/'+a.id);assert.equal(updated.data.profession,'Teacher');assert.equal(updated.data.address,data.birthCity);
});

test('migration preserves draft IDs and files; restart does not replay uncertain visa work',async t=>{
 const {store}=fixture(t),bytes=await image();const a={id:'12345678-1234-1234-1234-123456789abc',source:'web',data,status:'running',job_type:'visa',official_url:'https://visa.visitsaudi.com/Visa/PassportInfo/11111111-1111-1111-1111-111111111111',application_number:'260915123456',version:8};
 assert.equal(await store.importApplication(a,{passport:bytes,portrait:bytes},[{message:'Original event',created_at:1}]),true);
 assert.equal(await store.importApplication(a,{passport:bytes}),false);
 const saved=await store.request('applications/'+a.id);assert.equal(saved.status,'needs_review');assert.equal(saved.official_url,a.official_url);assert.equal(saved.application_number,a.application_number);assert.equal(saved.portrait,true);
 assert.equal(await store.request('claim','POST',{}),null);assert.ok((await store.request('applications/'+a.id+'/events')).some(x=>x.message==='Original event'));
 const other=await store.request('applications','POST',{data},'operator');
 assert.equal(store.restoreCheckpoint(other.id,{officialUrl:a.official_url,applicationNumber:a.application_number}),true);
 assert.equal((await store.request('applications/'+other.id)).official_url,a.official_url);
 assert.throws(()=>store.restoreCheckpoint(other.id,{officialUrl:'https://attacker.test/Visa/PassportInfo/11111111-1111-1111-1111-111111111111',applicationNumber:a.application_number}));
});

test('portrait refresh replaces the file only after a valid new crop has been saved',async t=>{
 const {store}=fixture(t),bytes=await image(),a=await store.request('applications','POST',{data},'operator');await upload(store,a.id,bytes);await upload(store,a.id,bytes,'portrait');
 const old=store.row(a.id).portrait_key;
 await store.request('applications/'+a.id+'/queue','POST',{job:'portrait'},'operator');const job=await store.request('claim','POST',{});
 await assert.rejects(upload(store,a.id,Buffer.from('not an image'),'portrait',job.lease));assert.equal(store.row(a.id).portrait_key,old);
 await upload(store,a.id,await image(),'portrait',job.lease);assert.notEqual(store.row(a.id).portrait_key,old);
 await store.request('applications/'+a.id+'/result','POST',{lease:job.lease,status:'needs_review',data});assert.equal((await store.request('applications/'+a.id)).portrait,true);
});
