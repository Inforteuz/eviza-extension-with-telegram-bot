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
import {pauseSaudi,pauseKey} from '../agent/saudi-rate-limit.mjs';
const sharp=(await import(createRequire(new URL('../agent/package.json',import.meta.url)).resolve('sharp'))).default;
const op=(s,r,m,b)=>s.request(r,m,b,'operator');
const data={...blankApplicant,firstName:'TEST',lastName:'APPLICANT',nationality:'Uzbekistan',birthDate:'1990-01-01',gender:'Female',maritalStatus:'Married',birthCountry:'Uzbekistan',birthCity:'TEST CITY',profession:'None',residenceCountry:'Uzbekistan',city:'TEST CITY',address:'TEST ADDRESS',passportNumber:'ZZ1234567',issueDate:'2022-01-01',expiryDate:'2035-01-01',passportIssuePlace:'Uzbekistan',...defaultTripDates(),visitPurpose:'Umrah',accommodationType:'Hotel',accommodationName:'TEST HOTEL'};
function fixture(t){
 const dir=mkdtempSync(path.join(tmpdir(),'evisa-review-'));let store=new LocalStore(dir);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 return {get store(){return store},restart(){store.close();store=new LocalStore(dir);return store}};
}
async function photo(){return sharp(randomBytes(200*200*3),{raw:{width:200,height:200,channels:3}}).jpeg({quality:95}).toBuffer();}
async function passport(){return sharp(randomBytes(32*32*3),{raw:{width:32,height:32,channels:3}}).resize(640,800,{kernel:'nearest'}).jpeg({quality:98}).toBuffer();}
async function upload(s,id,bytes,kind='passport',lease){const f=new FormData();f.set('file',new Blob([bytes]),'test.jpg');f.set('kind',kind);if(lease)f.set('lease',lease);return s.request('applications/'+id+'/upload','POST',f,lease?'worker':'operator');}
async function applicant(s,n,{ready=true,groupId,missing=false}={}){
 const a=await op(s,'applications','POST',{data:{...data,firstName:'PERSON'+n,passportNumber:missing?'':'ZZ'+String(n).padStart(7,'0')},groupId});
 await upload(s,a.id,await passport());const image=await photo();await upload(s,a.id,image,'portrait');if(!ready)s.reviews.pending(a.id);
 return {id:a.id,image};
}
function bot(s){
 const messages=[],photos=[];let serial=1;
 const client=new TelegramNative({store:s,operatorId:'123',submissionEnabled:true,call:async(method,body)=>{const id=serial++;messages.push({id,method,...body});await Promise.resolve();return {message_id:id}},download:async()=>passport(),sendImage:async(bytes,caption,options)=>photos.push({bytes,caption,...options})});
 return {client,messages,photos,cards:()=>messages.filter(m=>m.text?.includes('Ariza: '))};
}
const click=(value,from=123)=>({callback_query:{id:'callback',from:{id:from},message:{chat:{type:'private',id:123}},data:value}});
const update=(text,n=1)=>({update_id:n,message:{message_id:n,from:{id:123},chat:{type:'private',id:123},text}});
const approval=(s,id)=>'qapprove:'+id.slice(0,8)+':'+s.row(id).version;

test('six passports may finish out of order, but one card and its own portrait appear per fresh confirmation',async t=>{
 const {store:s}=fixture(t),b=bot(s),apps=[];
 for(let n=1;n<=6;n++)apps.push(await applicant(s,n,{ready:false}));
 for(const a of apps.slice(1).reverse()){s.reviews.ready(a.id);await b.client.reviewNext();}
 assert.equal(b.cards().length,0);assert.equal(s.reviews.view().count,6);
 s.reviews.ready(apps[0].id);await Promise.all([b.client.reviewNext(),b.client.reviewNext(),b.client.reviewNext()]);assert.equal(b.cards().length,1);
 for(let i=0;i<apps.length;i++){
  const a=apps[i],command=approval(s,a.id);assert.equal(s.reviews.view().head.id,a.id);
  assert.equal(b.cards().length,i+1);assert.equal(b.photos.length,i+1);
  const card=b.cards()[i],portrait=b.photos[i];assert.ok(card.text.includes('PERSON'+(i+1)));assert.ok(card.text.includes(a.id.slice(0,8)));assert.deepEqual(portrait.bytes,a.image);assert.equal(portrait.replyTo,card.id);
  await b.client.handle(click(command,999));assert.equal(s.reviews.view().head.id,a.id);
  await b.client.handle(click(command));const remaining=s.reviews.view().count;assert.equal(remaining,apps.length-i-1);
  await b.client.handle(click(command));assert.equal(s.reviews.view().count,remaining,'old double-click cannot approve the next person');
 }
 assert.equal(s.reviews.view().head,null);assert.equal(await s.request('claim','POST',{}),null,'review alone must not submit an official application');
});

test('missing data keeps the first card active; incoming passports do not cancel its field edit',async t=>{
 const {store:s}=fixture(t),a=await applicant(s,1,{missing:true}),b=await applicant(s,2),ui=bot(s);
 await ui.client.reviewNext();assert.equal(ui.cards().length,1);assert.equal(ui.cards()[0].reply_markup.inline_keyboard.flat().some(x=>x.callback_data?.startsWith('qapprove:')),false);
 await ui.client.handle(click(approval(s,a.id)));assert.equal(s.reviews.view().head.id,a.id);
 await ui.client.askField(a.id,'passportNumber');const pending=ui.client.pending();
 const incoming=update('',99);incoming.message.document={file_id:'new'};await ui.client.handle(incoming);
 assert.deepEqual(ui.client.pending(),pending);assert.equal(s.reviews.view().count,3);assert.equal(ui.cards().length,1);
 await ui.client.handle(update('ZZ1111111'));assert.equal(s.row(a.id).status,'draft');assert.equal(s.reviews.view().head.id,a.id);
 await ui.client.handle(click(approval(s,a.id)));assert.equal(s.reviews.view().head.id,b.id);assert.ok(ui.cards().at(-1).text.includes('PERSON2'));
});

test('group approvals continue during Saudi pause, persist across restart and finish without queuing Saudi',async t=>{
 const f=fixture(t),s=f.store,g=await op(s,'groups','POST',{name:'synthetic group'}),a=await applicant(s,1,{groupId:g.id}),b=await applicant(s,2,{groupId:g.id});
 pauseSaudi(s,{code:1015,rayId:'synthetic',notBefore:null});const pause=s.getMeta(pauseKey),ui=bot(s);
 await ui.client.reviewNext();await ui.client.handle(click(approval(s,a.id)));
 assert.equal((await s.request('groups/'+g.id)).members[0].confirmed,true);
 const restarted=f.restart(),next=bot(restarted);assert.equal(restarted.reviews.view().head.id,b.id);await next.client.reviewNext();assert.equal(next.cards().length,0,'already delivered head should not be sent again on restart');
 await next.client.handle(update('/tasdiqlash'));assert.equal(next.cards().length,1);
 await next.client.handle(click(approval(restarted,b.id)));assert.equal(restarted.reviews.view().count,0);
 const group=await restarted.request('groups/'+g.id);assert.ok(group.members.every(m=>m.confirmed));assert.equal(group.status,'draft');assert.equal(await restarted.request('claim','POST',{}),null);assert.deepEqual(restarted.getMeta(pauseKey),pause);
});

test('deleting the current passport advances, while deleting its group and clearing all leave no stale queue entries',async t=>{
 const {store:s}=fixture(t),g=await op(s,'groups','POST',{name:'delete test'}),a=await applicant(s,1,{groupId:g.id}),b=await applicant(s,2,{groupId:g.id}),c=await applicant(s,3),ui=bot(s);
 await ui.client.reviewNext();await ui.client.handle(click('delconfirm:'+a.id.slice(0,8)+':'+s.row(a.id).version));assert.equal(s.reviews.view().head.id,b.id);assert.ok(ui.cards().at(-1).text.includes('PERSON2'));
 const {groupDeletionRevision}=await import('../agent/delete-store.mjs');const group=await s.request('groups/'+g.id);
 await ui.client.handle(click('gdelconfirm:'+g.id.slice(0,8)+':'+groupDeletionRevision(group)));assert.equal(s.reviews.view().head.id,c.id);assert.ok(ui.cards().at(-1).text.includes('PERSON3'));
 const preview=await op(s,'clear-all/preview','POST');await op(s,'clear-all/confirm','POST',{confirmed:true,token:preview.token});assert.equal(s.reviews.view().count,0);assert.equal(s.reviews.shown(),null);assert.equal(s.db.prepare('SELECT count(*) n FROM telegram_reviews').get().n,0);
});

test('failed photo delivery does not advance and can be retried; changed portraits invalidate earlier confirmation',async t=>{
 const {store:s}=fixture(t),a=await applicant(s,1),b=await applicant(s,2),ui=bot(s),send=ui.client.sendImage;
 ui.client.sendImage=async()=>{throw Error('delivery unavailable')};await assert.rejects(ui.client.reviewNext(),/delivery/);assert.equal(s.reviews.shown(),null);assert.equal(s.reviews.view().head.id,a.id);
 ui.client.sendImage=send;await ui.client.reviewNext();await ui.client.handle(click(approval(s,a.id)));assert.equal(s.reviews.view().head.id,b.id);
 await upload(s,a.id,await photo(),'portrait');assert.equal(s.reviews.view().head.id,a.id,'a different image must be reviewed again');
 await ui.client.reviewNext();assert.ok(ui.cards().at(-1).text.includes('PERSON1'));
});

test('API rejects out-of-order, stale, duplicate and worker approvals',async t=>{
 const {store:s}=fixture(t),a=await applicant(s,1),b=await applicant(s,2);
 const confirm=id=>({version:s.row(id).version,data:JSON.parse(s.row(id).data),confirmed:true});
 await assert.rejects(op(s,'applications/'+b.id+'/review-confirm','POST',confirm(b.id)),/navbati/);
 await assert.rejects(s.request('applications/'+a.id+'/review-confirm','POST',confirm(a.id)),/shaxs/);
 await assert.rejects(op(s,'applications/'+a.id+'/review-confirm','POST',{...confirm(a.id),version:1}),/yangilangan/);
 s.db.prepare('UPDATE applications SET duplicate_of=? WHERE id=?').run(b.id,a.id);
 await assert.rejects(op(s,'applications/'+a.id+'/review-confirm','POST',confirm(a.id)),/o‘xshaydi/);assert.equal(s.reviews.view().head.id,a.id);
});

test('real extract and portrait job results release the head; a crashed extraction becomes reviewable after lease expiry',async t=>{
 const {store:s}=fixture(t),a=await applicant(s,1),ui=bot(s);
 await op(s,'applications/'+a.id+'/queue','POST',{job:'extract'});let job=await s.request('claim','POST',{});await ui.client.reviewNext();assert.equal(ui.cards().length,0);
 await s.request('applications/'+a.id+'/result','POST',{lease:job.lease,status:'needs_input',data});await ui.client.reviewNext();assert.equal(ui.cards().length,1);
 await op(s,'applications/'+a.id+'/queue','POST',{job:'portrait'});job=await s.request('claim','POST',{});await upload(s,a.id,await photo(),'portrait',job.lease);await s.request('applications/'+a.id+'/result','POST',{lease:job.lease,status:'needs_review'});await ui.client.reviewNext();assert.equal(ui.cards().length,2);
 await op(s,'applications/'+a.id+'/queue','POST',{job:'extract'});job=await s.request('claim','POST',{});s.db.prepare('UPDATE applications SET lease_until=0 WHERE id=?').run(a.id);await s.request('claim','POST',{});await ui.client.reviewNext();assert.equal(ui.cards().length,3);assert.equal(s.reviews.view().head.ready,true);
});
