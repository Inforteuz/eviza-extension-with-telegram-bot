import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {LocalStore} from '../agent/local-store.mjs';
import {TelegramNative} from '../agent/telegram-native.mjs';
import {groupDeletionRevision} from '../agent/delete-store.mjs';
const op=(s,route,method='GET',body={})=>s.request(route,method,body,'operator');
function fixture(t,options){const dir=mkdtempSync(path.join(tmpdir(),'evisa-delete-'));const s=new LocalStore(dir,options);t.after(()=>{s.close();rmSync(dir,{recursive:true,force:true})});return s}
async function app(s,extra={}){return op(s,'applications','POST',{sourceKey:'fixture:'+crypto.randomUUID(),...extra})}
async function group(s){return op(s,'groups','POST',{name:'TEST',sourceKey:crypto.randomUUID()})}
const currentGroup=(s,g)=>op(s,'groups/'+g.id);
const deleteApp=(s,a)=>op(s,'applications/'+a.id,'DELETE',{confirmed:true,version:a.version});
const deleteGroup=async(s,g)=>op(s,'groups/'+g.id,'DELETE',{confirmed:true,revision:groupDeletionRevision(await currentGroup(s,g))});

test('application delete requires operator and fresh confirmation, removes its files and prevents replay',async t=>{
 const cleaned=[],s=fixture(t,{cleanupDeleted:r=>cleaned.push(r.id)}),a=await app(s,{sourceKey:'telegram:100'}),other=await app(s);
 const key=s.saveFile(Buffer.from('fixture')),otherKey=s.saveFile(Buffer.from('keep'));
 s.db.prepare('UPDATE applications SET passport_key=?,portrait_key=? WHERE id=?').run(key,key,a.id);
 s.db.prepare('UPDATE applications SET passport_key=? WHERE id=?').run(otherKey,other.id);
 s.setMeta('telegram-input',{id:a.id});s.setMeta('telegram-suggestion',{id:a.id});
 for(const [actor,body] of [['worker',{confirmed:true,version:a.version}],['operator',{version:a.version}],['operator',{confirmed:true,version:a.version-1}]])await assert.rejects(s.request('applications/'+a.id,'DELETE',body,actor));
 assert.ok(existsSync(path.join(s.files,key)));await deleteApp(s,a);
 await assert.rejects(op(s,'applications/'+a.id),/topilmadi/);assert.equal(existsSync(path.join(s.files,key)),false);assert.ok(existsSync(path.join(s.files,otherKey)));
 assert.equal(s.db.prepare('SELECT count(*) n FROM events WHERE application_id=?').get(a.id).n,0);assert.equal(s.getMeta('telegram-input'),null);assert.equal(s.getMeta('telegram-suggestion'),null);assert.deepEqual(cleaned,[a.id]);
 await assert.rejects(app(s,{sourceKey:'telegram:100'}),/o‘chirilgan/);assert.equal((await op(s,'applications')).length,1);
});
test('deleting a queued application cancels it but a running job cannot be deleted',async t=>{
 const s=fixture(t),a=await app(s),key=s.saveFile(Buffer.from('fixture'));s.db.prepare('UPDATE applications SET passport_key=? WHERE id=?').run(key,a.id);
 await op(s,'applications/'+a.id+'/queue','POST',{job:'extract'});const job=await s.request('claim','POST');
 await assert.rejects(deleteApp(s,job),/bajarilmoqda/);assert.ok(existsSync(path.join(s.files,key)));
 await s.request('applications/'+a.id+'/result','POST',{lease:job.lease,status:'needs_input'});
 await op(s,'applications/'+a.id+'/queue','POST',{job:'extract'});await deleteApp(s,await op(s,'applications/'+a.id));assert.equal(await s.request('claim','POST'),null);
});
test('group deletion detects member changes, cascades data and files, clears intake and deduplicates deleted groups',async t=>{
 const s=fixture(t),g=await op(s,'groups','POST',{name:'TEST',sourceKey:'group-fixture'}),a=await app(s,{groupId:g.id,sourceKey:'telegram:200'}),b=await app(s,{groupId:g.id}),other=await app(s);
 const key=s.saveFile(Buffer.from('fixture'));s.db.prepare('UPDATE applications SET passport_key=? WHERE id=?').run(key,a.id);
 s.setMeta('telegram-intake',{mode:'group',groupId:g.id});s.setMeta('telegram-input',{id:b.id});
 const before=await currentGroup(s,g);s.db.prepare('UPDATE applications SET version=version+1 WHERE id=?').run(a.id);
 await assert.rejects(op(s,'groups/'+g.id,'DELETE',{confirmed:true,revision:groupDeletionRevision(before)}),/yangilangan/);
 assert.equal((await currentGroup(s,g)).members.length,2);await deleteGroup(s,g);
 assert.equal((await op(s,'applications')).length,1);assert.equal((await op(s,'applications'))[0].id,other.id);assert.equal(existsSync(path.join(s.files,key)),false);assert.equal(s.getMeta('telegram-input'),null);assert.deepEqual(s.getMeta('telegram-intake'),{mode:'individual'});
 await assert.rejects(op(s,'groups','POST',{name:'TEST',sourceKey:'group-fixture'}),/o‘chirilgan/);await assert.rejects(app(s,{sourceKey:'telegram:200'}),/o‘chirilgan/);
});
test('group cannot be deleted during member work and saved official rosters cannot lose one member',async t=>{
 const s=fixture(t),g=await group(s),a=await app(s,{groupId:g.id});
 s.db.prepare("UPDATE applications SET status='running' WHERE id=?").run(a.id);await assert.rejects(deleteGroup(s,g),/bajarilmoqda/);
 s.db.prepare("UPDATE applications SET status='draft' WHERE id=?").run(a.id);
 s.db.prepare('UPDATE visa_groups SET checkpoint=? WHERE id=?').run(JSON.stringify({phase:'collect',name:'TEST',entryUrl:'https://visa.visitsaudi.com/Visa/PersonalInfo?gName=TEST',members:{}}),g.id);
 const b=await app(s,{groupId:g.id});await deleteApp(s,b);assert.equal((await currentGroup(s,g)).members.length,1);
 s.db.prepare('UPDATE visa_groups SET checkpoint=? WHERE id=?').run(JSON.stringify({phase:'members',members:{[a.id]:{applicationNumber:'fixture'}}}),g.id);
 await assert.rejects(deleteApp(s,a),/Rasmiy guruh/);await deleteGroup(s,g);assert.equal((await op(s,'groups')).length,0);
});
test('Telegram delete is a two-step action and old or unauthorized buttons cannot erase data',async t=>{
 const s=fixture(t),messages=[],a=await app(s),bot=new TelegramNative({store:s,operatorId:123,call:async(m,b)=>messages.push(b)});
 const click=(data,from=123)=>({callback_query:{id:'fixture',from:{id:from},message:{chat:{type:'private',id:123}},data}}),short=a.id.slice(0,8);
 await bot.show(a.id);assert.ok(JSON.stringify(messages.at(-1)).includes('Arizani o‘chirish'));
 await bot.handle(click('delete:'+short+':'+a.version));assert.equal((await op(s,'applications')).length,1);assert.match(messages.at(-1).text,/Saudi saytidagi/);
 await bot.handle(click('delconfirm:'+short+':'+a.version,999));assert.equal((await op(s,'applications')).length,1);
 await op(s,'applications/'+a.id,'PATCH',{version:a.version,data:{firstName:'CHANGED'}});
 await bot.handle(click('delconfirm:'+short+':'+a.version));assert.equal((await op(s,'applications')).length,1);
 const fresh=await op(s,'applications/'+a.id);await bot.handle(click('delete:'+short+':'+fresh.version));await bot.handle(click('delconfirm:'+short+':'+fresh.version));assert.equal((await op(s,'applications')).length,0);
 const g=await group(s);await app(s,{groupId:g.id});await bot.showGroup(g.id);const button=messages.at(-1).reply_markup.inline_keyboard.flat().find(b=>b.callback_data?.startsWith('gdelete:'));assert.ok(button);await bot.handle(click(button.callback_data));assert.equal((await op(s,'groups')).length,1);
 const confirm=messages.at(-1).reply_markup.inline_keyboard[0][0].callback_data;assert.ok(Buffer.byteLength(confirm)<=64);await bot.handle(click(confirm));assert.equal((await op(s,'groups')).length,0);
});
test('diagnostic cleanup is retried after restart without restoring a deleted record',async t=>{
 const s=fixture(t,{cleanupDeleted:()=>{throw Error('busy')}}),a=await app(s);await deleteApp(s,a);assert.equal(s.db.prepare('SELECT cleanup_pending FROM deleted_entities WHERE id=?').get(a.id).cleanup_pending,1);
 const cleaned=[],again=new LocalStore(s.directory,{cleanupDeleted:r=>cleaned.push(r.id)});try{assert.deepEqual(cleaned,[a.id]);assert.equal((await op(again,'applications')).length,0);assert.equal(again.db.prepare('SELECT cleanup_pending FROM deleted_entities WHERE id=?').get(a.id).cleanup_pending,0)}finally{again.close()}
});

test('clear all needs fresh one-time operator consent and atomically removes queued, ready and group records',async t=>{
 const cleaned=[],s=fixture(t,{cleanupDeleted:r=>cleaned.push(r.id)}),g=await group(s),a=await app(s,{groupId:g.id,sourceKey:'telegram:clear-all'}),b=await app(s);
 s.db.prepare("UPDATE applications SET status='queued' WHERE id=?").run(a.id);s.db.prepare("UPDATE applications SET status='payment_ready' WHERE id=?").run(b.id);
 const key=s.saveFile(Buffer.from('fixture'));s.db.prepare('UPDATE applications SET passport_key=?,portrait_key=? WHERE id=?').run(key,key,a.id);
 s.setMeta('telegram-intake',{mode:'group',groupId:g.id});s.setMeta('telegram-input',{id:a.id});s.setMeta('tripDefaults',{accommodationName:'KEEP'});
 await assert.rejects(s.request('clear-all/preview','POST'),/shaxs/);
 const p=await op(s,'clear-all/preview','POST');assert.equal(p.applications,2);assert.equal(p.groups,1);
 for(const [actor,body] of [['worker',{confirmed:true,token:p.token}],['operator',{token:p.token}],['operator',{confirmed:true,token:'wrong'}]])await assert.rejects(s.request('clear-all/confirm','POST',body,actor));
 assert.equal((await op(s,'applications')).length,2);
 await op(s,'clear-all/confirm','POST',{confirmed:true,token:p.token});
 assert.equal((await op(s,'applications')).length,0);assert.equal((await op(s,'groups')).length,0);assert.equal(existsSync(path.join(s.files,key)),false);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM events').get().n,0);
 assert.equal(s.getMeta('telegram-input'),null);assert.deepEqual(s.getMeta('telegram-intake'),{mode:'individual'});assert.deepEqual(s.getMeta('tripDefaults'),{accommodationName:'KEEP'});assert.equal(cleaned.length,3);
 assert.equal(await s.request('claim','POST'),null);await assert.rejects(app(s,{sourceKey:'telegram:clear-all'}),/o‘chirilgan/);
 const newer=await app(s);await assert.rejects(op(s,'clear-all/confirm','POST',{confirmed:true,token:p.token}),/eskirgan/);assert.ok(s.row(newer.id));
});
test('clear all rejects changes, active jobs and expired confirmations without partial deletion',async t=>{
 const s=fixture(t),a=await app(s),g=await group(s);await app(s,{groupId:g.id});
 const p=await op(s,'clear-all/preview','POST');await app(s);
 await assert.rejects(op(s,'clear-all/confirm','POST',{confirmed:true,token:p.token}),/yangilangan/);assert.equal((await op(s,'applications')).length,3);
 const q=await op(s,'clear-all/preview','POST');s.db.prepare("UPDATE visa_groups SET status='running' WHERE id=?").run(g.id);
 await assert.rejects(op(s,'clear-all/preview','POST'),/bajarilmoqda/);await assert.rejects(op(s,'clear-all/confirm','POST',{confirmed:true,token:q.token}));
 s.db.prepare("UPDATE visa_groups SET status='draft' WHERE id=?").run(g.id);s.db.prepare("UPDATE applications SET status='running' WHERE id=?").run(a.id);
 await assert.rejects(op(s,'clear-all/preview','POST'),/bajarilmoqda/);
 s.db.prepare("UPDATE applications SET status='draft' WHERE id=?").run(a.id);
 const r=await op(s,'clear-all/preview','POST');s.setMeta('telegram-clear-all',{...s.getMeta('telegram-clear-all'),expires:Date.now()-1});
 await assert.rejects(op(s,'clear-all/confirm','POST',{confirmed:true,token:r.token}),/eskirgan/);assert.equal((await op(s,'groups')).length,1);assert.equal((await op(s,'applications')).length,3);
});
test('Telegram /tozalash previews counts, supports cancel, rejects strangers and consumes confirmation once',async t=>{
 const s=fixture(t),messages=[],bot=new TelegramNative({store:s,operatorId:123,call:async(m,b)=>messages.push(b)});await app(s);
 const text=text=>({message:{chat:{type:'private',id:123},from:{id:123},text}}),click=(data,from=123)=>({callback_query:{id:'fixture',from:{id:from},message:{chat:{type:'private',id:123}},data}});
 await bot.handle(text('/tozalash'));assert.equal((await op(s,'applications')).length,1);assert.match(messages.at(-1).text,/1 ta ariza/);assert.match(messages.at(-1).text,/Saudi/);
 const [confirm,cancel]=messages.at(-1).reply_markup.inline_keyboard.map(row=>row[0].callback_data);assert.ok(Buffer.byteLength(confirm)<64);
 await bot.handle(click(confirm,999));assert.equal((await op(s,'applications')).length,1);await bot.handle(click(cancel));await bot.handle(click(confirm));assert.equal((await op(s,'applications')).length,1);
 await bot.handle(text('/tozalash'));let next=messages.at(-1).reply_markup.inline_keyboard[0][0].callback_data;await bot.handle(text('/bekor'));await bot.handle(click(next));assert.equal((await op(s,'applications')).length,1);
 await bot.handle(text('/tozalash'));next=messages.at(-1).reply_markup.inline_keyboard[0][0].callback_data;await bot.handle(click(next));assert.equal((await op(s,'applications')).length,0);
 await app(s);await bot.handle(click(next));assert.equal((await op(s,'applications')).length,1);
});
