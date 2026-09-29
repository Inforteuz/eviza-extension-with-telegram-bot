import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {LocalStore} from '../agent/local-store.mjs';
import {TelegramNative} from '../agent/telegram-native.mjs';
import {passportImageSignature,similarPassportImages} from '../agent/passport-image.mjs';
const sharp=(await import(createRequire(new URL('../agent/package.json',import.meta.url)).resolve('sharp'))).default;
const op=(s,r,m,b)=>s.request(r,m,b,'operator');
function fixture(t){const dir=mkdtempSync(path.join(tmpdir(),'evisa-batch-')),store=new LocalStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})});return store;}
async function passport(){return sharp(randomBytes(32*32*3),{raw:{width:32,height:32,channels:3}}).resize(640,800,{kernel:'nearest'}).jpeg({quality:98}).toBuffer();}
async function portrait(){return sharp(randomBytes(200*200*3),{raw:{width:200,height:200,channels:3}}).jpeg({quality:90}).toBuffer();}
async function upload(s,id,bytes,kind='passport'){const f=new FormData();f.set('file',new Blob([bytes]),'test.jpg');f.set('kind',kind);return op(s,'applications/'+id+'/upload','POST',f);}
function bot(s,files=new Map()){
 const messages=[],photos=[];let messageId=100;
 const client=new TelegramNative({store:s,operatorId: '123',call:async(method,body)=>{const id=++messageId;await new Promise(r=>setTimeout(r,id%3));messages.push({id,method,...body});return {message_id:id}},download:async id=>{await new Promise(r=>setTimeout(r,Number(id)%5));return files.get(id)},sendImage:async(bytes,caption,options)=>photos.push({bytes,caption,...options})});return {client,messages,photos};
}
const imageUpdate=n=>({update_id:n,message:{message_id:n,from:{id:123},chat:{id:123,type:'private'},media_group_id:'album-1',document:{file_id:String(n)}}});
const callback=(data,from=123)=>({callback_query:{id:'callback',from:{id:from},message:{chat:{type:'private',id:123}},data}});

test('whole-document duplicate screening covers identical, rotated, recompressed and transparent images',async()=>{
 const bytes=await passport(),a=await passportImageSignature(bytes);
 for(const angle of [0,90,180,270]){
  const rotated=await sharp(bytes).rotate(angle).jpeg({quality:85}).toBuffer(),b=await passportImageSignature(rotated);
  assert.equal(similarPassportImages(a.fingerprint,b.fingerprint),true);
 }
 const alpha=await passportImageSignature(await sharp(bytes).ensureAlpha().png().toBuffer());assert.equal(Buffer.from(alpha.fingerprint,'base64').length,1024);assert.equal(similarPassportImages(a.fingerprint,alpha.fingerprint),true);
 assert.equal(similarPassportImages(a.fingerprint,(await passportImageSignature(await passport())).fingerprint),false);
 const blank=await passportImageSignature(await sharp({create:{width:100,height:100,channels:3,background:'white'}}).png().toBuffer());assert.equal(similarPassportImages(blank.fingerprint,blank.fingerprint),false);
});

test('simultaneous duplicate uploads retain separate originals, flag one and block extraction and visa submission',async t=>{
 const s=fixture(t),bytes=await passport();const a=await op(s,'applications','POST',{}),b=await op(s,'applications','POST',{});
 await Promise.all([upload(s,a.id,bytes),upload(s,b.id,bytes)]);
 const apps=await s.request('applications'),flagged=apps.filter(a=>a.duplicate_of);assert.equal(flagged.length,1);
 for(const a of apps)assert.deepEqual(await s.request('applications/'+a.id+'/file?kind=passport'),bytes);
 assert.notEqual(s.row(a.id).passport_key,s.row(b.id).passport_key);
 for(const job of ['extract','visa','portrait'])await assert.rejects(op(s,'applications/'+flagged[0].id+'/queue','POST',{job}),/o‘xshaydi/);
});

test('album burst preserves source-to-record and portrait-to-card association even with interleaved messages',async t=>{
 const s=fixture(t),files=new Map(await Promise.all([1,2,3,4,5,6].map(async n=>[String(n),await passport()]))),{client,messages,photos}=bot(s,files);
 await Promise.all([1,2,3,4,5,6].map(n=>client.handle(imageUpdate(n))));
 const apps=await s.request('applications');assert.equal(apps.length,6);
 const expected=new Map();
 for(const a of apps){
  assert.equal(a.status,'queued');assert.equal(a.duplicate_of,null);
  const n=a.source_key.split(':')[1];assert.deepEqual(await s.request('applications/'+a.id+'/file?kind=passport'),files.get(n));
  await op(s,'applications/'+a.id+'/pause','POST',{});const current=await s.request('applications/'+a.id);
  await op(s,'applications/'+a.id,'PATCH',{version:current.version,data:{...current.data,firstName:'PERSON'+n,lastName:'TEST'}});
  const photo=await portrait();expected.set(a.id,photo);await upload(s,a.id,photo,'portrait');
 }
 await Promise.all(apps.map(a=>client.show(a.id,{portrait:true})));
 assert.equal(photos.length,6);
 for(const a of apps){const photo=photos.find(p=>p.caption.includes(a.id.slice(0,8)));assert.ok(photo);assert.deepEqual(photo.bytes,expected.get(a.id));const message=messages.find(m=>m.id===photo.replyTo);assert.ok(message.text.includes(a.id.slice(0,8)));assert.ok(message.text.includes('PERSON'+a.source_key.split(':')[1]));}
});

test('near-duplicate stops before AI despite different record names/numbers; only a fresh operator override resumes',async t=>{
 const s=fixture(t),bytes=await passport(),other=await sharp(bytes).rotate(90).jpeg({quality:87}).toBuffer(),{client,messages}=bot(s,new Map([['1',bytes],['2',other]]));
 await client.handle(imageUpdate(1));await client.handle(imageUpdate(2));
 let duplicate=(await s.request('applications')).find(a=>a.duplicate_of);assert.ok(duplicate);assert.equal(duplicate.status,'draft');
 assert.equal(messages.some(m=>m.text?.includes('Bu surat')),false,'later duplicate waits behind the first passport');
 await client.show(duplicate.id); // An operator can still explicitly open a later record.
 const card=messages.find(m=>m.text?.includes('Bu surat'));assert.ok(card);assert.match(card.text,/navbati to‘xtatildi/);
 const buttons=card.reply_markup.inline_keyboard.flat().map(b=>b.callback_data);assert.ok(buttons.some(b=>b.startsWith('distinct:')));assert.equal(buttons.some(b=>b.startsWith('approve:')||b.startsWith('queue:')),false);
 const command='distinct:'+duplicate.id.slice(0,8)+':'+duplicate.version;
 await client.handle(callback(command,999));assert.equal(s.row(duplicate.id).status,'draft');
 await assert.rejects(op(s,'applications/'+duplicate.id+'/duplicate-distinct','POST',{version:duplicate.version-1,confirmed:true}),/yangilangan/);
 await client.handle(callback(command));duplicate=await s.request('applications/'+duplicate.id);assert.equal(duplicate.duplicate_of,null);assert.equal(duplicate.status,'queued');
});

test('deleting the earlier draft releases a flagged copy without deleting its original image',async t=>{
 const s=fixture(t),bytes=await passport(),a=await op(s,'applications','POST',{}),b=await op(s,'applications','POST',{});
 await upload(s,a.id,bytes);await upload(s,b.id,bytes);assert.equal(s.row(b.id).duplicate_of,a.id);
 await op(s,'applications/'+a.id,'DELETE',{confirmed:true,version:s.row(a.id).version});assert.equal(s.row(b.id).duplicate_of,null);assert.deepEqual(await s.request('applications/'+b.id+'/file?kind=passport'),bytes);
 await op(s,'applications/'+b.id+'/queue','POST',{job:'extract'});assert.equal(s.row(b.id).status,'queued');
});

test('old card revision cannot retrieve a newly replaced portrait',async t=>{
 const s=fixture(t),a=await op(s,'applications','POST',{});await upload(s,a.id,await portrait(),'portrait');const version=s.row(a.id).version;
 await upload(s,a.id,await portrait(),'portrait');await assert.rejects(s.request('applications/'+a.id+'/file?kind=portrait&version='+version),/yangilangan/);
});

test('group member confirmation and group queue also reject a flagged passport',async t=>{
 const s=fixture(t),g=await op(s,'groups','POST',{name:'batch'}),bytes=await passport();
 const a=await op(s,'applications','POST',{groupId:g.id}),b=await op(s,'applications','POST',{groupId:g.id});await upload(s,a.id,bytes);await upload(s,b.id,bytes);
 await assert.rejects(op(s,'groups/'+g.id+'/confirm-member','POST',{memberId:b.id,version:s.row(b.id).version}),/o‘xshaydi/);
 // Keep just the flagged copy in this group so its guard is checked first.
 await op(s,'groups/'+g.id+'/remove-member','POST',{memberId:a.id,version:s.row(a.id).version});const group=await s.request('groups/'+g.id);
 await assert.rejects(op(s,'groups/'+g.id+'/queue','POST',{confirmed:true,version:group.version}),/o‘xshaydi/);
});
