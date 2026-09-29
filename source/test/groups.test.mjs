import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {LocalStore} from '../agent/local-store.mjs';
import {TelegramNative} from '../agent/telegram-native.mjs';
import {blankApplicant,defaultTripDates} from '../lib/domain.ts';
const sharp=(await import(createRequire(new URL('../agent/package.json',import.meta.url)).resolve('sharp'))).default;
function fixture(t){const dir=mkdtempSync(path.join(tmpdir(),'evisa-group-'));const store=new LocalStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})});return store}
const data={...blankApplicant,firstName:'TEST',lastName:'APPLICANT',nationality:'Uzbekistan',birthDate:'1990-01-01',gender:'Female',maritalStatus:'Married',birthCountry:'Uzbekistan',birthCity:'TEST CITY',profession:'None',residenceCountry:'Uzbekistan',city:'TEST CITY',address:'TEST ADDRESS',passportNumber:'ZZ1234567',issueDate:'2022-01-01',expiryDate:'2035-01-01',passportIssuePlace:'Uzbekistan',...defaultTripDates(),visitPurpose:'Umrah',accommodationType:'Hotel',accommodationName:'TEST HOTEL'};
const image=()=>sharp(randomBytes(200*200*3),{raw:{width:200,height:200,channels:3}}).jpeg({quality:90}).toBuffer();
async function member(store,g,n=0){const a=await store.request('applications','POST',{groupId:g.id,data:{...data,passportNumber:'ZZ123456'+n}},'operator');const f=new FormData();f.set('file',new Blob([await image()]),'photo.jpg');f.set('kind','portrait');await store.request('applications/'+a.id+'/upload','POST',f,'operator');return store.request('applications/'+a.id)}
const confirm=(s,g,a)=>s.request('groups/'+g.id+'/confirm-member','POST',{memberId:a.id,version:a.version},'operator');
const user=(text,id=1)=>({update_id:id,message:{chat:{type:'private',id:12345},from:{id:12345},text}});
const click=data=>({callback_query:{id:'test',from:{id:12345},message:{chat:{type:'private',id:12345}},data}});

test('group intake asks its name, preserves upload order, deduplicates updates and switches back to individual',async t=>{
 const store=fixture(t),messages=[];const bot=new TelegramNative({store,operatorId:12345,call:async(m,b)=>messages.push(b),download:async()=>image(),sendImage:async()=>{}});
 await bot.handle(user('/yangi'));const nonce=store.getMeta('telegram-mode-choice');assert.match(JSON.stringify(messages.at(-1)),/Individual/);
 await bot.handle(click('intake:group:'+nonce));assert.equal(bot.pending().mode,'group_name');await bot.handle(user('test',2));
 const [g]=await store.request('groups');assert.equal(g.name,'test');
 const photo=id=>({...user('',id),message:{...user('').message,photo:[{file_id:'fixture',file_size:25000}]}});
 await bot.handle(photo(3));await bot.handle(photo(4));await bot.handle(photo(3));
 let current=await store.request('groups/'+g.id);assert.equal(current.members.length,2);assert.deepEqual(current.members.map(m=>m.group_position),[1,2]);
 await bot.handle(user('/individual',5));await bot.handle(photo(6));
 const apps=await store.request('applications');assert.equal(apps.length,3);assert.equal(apps.filter(a=>!a.group_id).length,1);
 await bot.handle(click('intake:group:'+nonce));assert.equal(bot.pending(),null);
});
test('group confirmation is invalidated by an edit and group jobs serialize with individual jobs',async t=>{
 const store=fixture(t),g=await store.request('groups','POST',{name:'test'},'operator');
 const a=await member(store,g,1),b=await member(store,g,2);await confirm(store,g,a);await confirm(store,g,b);
 const ready=await store.request('groups/'+g.id);assert.ok(ready.members.every(m=>m.confirmed));
 await store.request('applications/'+a.id,'PATCH',{version:a.version,data:{...a.data,address:'CHANGED'}},'operator');
 assert.equal((await store.request('groups/'+g.id)).members[0].confirmed,false);
 await assert.rejects(store.request('groups/'+g.id+'/queue','POST',{version:ready.version,confirmed:true},'operator'),/joriy/);
 await confirm(store,g,await store.request('applications/'+a.id));const latest=await store.request('groups/'+g.id);
 await store.request('groups/'+g.id+'/queue','POST',{version:latest.version,confirmed:true},'operator');
 await assert.rejects(member(store,g,3),/Guruh/);
 const job=await store.request('claim','POST',{});assert.equal(job.entity,'group');assert.equal(job.members.length,2);assert.equal(await store.request('claim','POST',{}),null);
 await assert.rejects(store.request('applications/'+b.id,'PATCH',{version:b.version,data:b.data},'operator'),/Guruh/);
 await assert.rejects(store.request('groups/'+g.id+'/result','POST',{lease:'wrong',status:'needs_review'}),/muddati/);
 await store.request('groups/'+g.id+'/checkpoint','POST',{lease:job.lease,checkpoint:{completed:[a.id]}});
 await store.request('groups/'+g.id+'/result','POST',{lease:job.lease,status:'needs_review',note:'Paused safely'});
 assert.deepEqual((await store.request('groups/'+g.id)).checkpoint.completed,[a.id]);
 await assert.rejects(store.request('applications/'+b.id+'/queue','POST',{job:'visa',confirmed:true,version:b.version},'operator'),/guruh/);
});
test('groups reject duplicate passports, foreign member confirmations and worker queue requests',async t=>{
 const store=fixture(t),g=await store.request('groups','POST',{name:'test'},'operator'),other=await store.request('groups','POST',{name:'other'},'operator');
 const a=await member(store,g,1),b=await member(store,g,1);await confirm(store,g,a);await confirm(store,g,b);
 await assert.rejects(confirm(store,other,a),/boshqa guruh/);
 const latest=await store.request('groups/'+g.id);
 await assert.rejects(store.request('groups/'+g.id+'/queue','POST',{version:latest.version,confirmed:true},'operator'),/bir xil pasport/);
 await assert.rejects(store.request('groups/'+g.id+'/queue','POST',{version:latest.version,confirmed:true}),/Mas’ul/);
});
