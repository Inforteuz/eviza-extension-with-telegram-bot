import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {LocalStore} from '../agent/local-store.mjs';
import {TelegramNative} from '../agent/telegram-native.mjs';
import {ensureLogin} from '../agent/visa.mjs';
import {detectSaudiRateLimit,SaudiRateLimit,assertSaudiPageAvailable,pauseSaudi,pauseKey} from '../agent/saudi-rate-limit.mjs';
const errorPage='Error 1015\nYou are being rate limited\nRay ID: a3c79bcf2994eec9';
function storeFixture(t){const dir=mkdtempSync(path.join(tmpdir(),'saudi-pause-'));let s=new LocalStore(dir);t.after(()=>{s.close();rmSync(dir,{recursive:true,force:true})});return {get s(){return s},reopen(){s.close();s=new LocalStore(dir);return s}};}
const op=(s,route,method,body)=>s.request(route,method,body,'operator');

test('rate limiting is recognized with no invented expiry and respects Retry-After seconds or dates',()=>{
 const now=1789642841000,limit=detectSaudiRateLimit(errorPage,0,'',now);assert.equal(limit.code,1015);assert.equal(limit.notBefore,null);assert.equal(limit.rayId,'a3c79bcf2994eec9');
 assert.equal(detectSaudiRateLimit('',429,'3600',now).notBefore,now+3600000);
 const later=now+7200000;assert.equal(detectSaudiRateLimit('',429,new Date(later).toUTCString(),now).notBefore,later);
 for(const bad of ['','invalid','-10'])assert.equal(detectSaudiRateLimit('',429,bad,now).notBefore,null);
 assert.equal(detectSaudiRateLimit('Application No. 1015 total 429 SAR'),null);
 assert.equal(detectSaudiRateLimit('Captcha verification'),null);
});

test('an already blocked page makes zero navigation or form requests, including a resumed group login',async()=>{
 let navigations=0,forms=0;
 const page={url:()=> 'https://visa.visitsaudi.com/Visa/Index',locator:()=>({innerText:async()=>errorPage}),goto:async()=>{navigations++},getByRole:()=>{forms++;throw Error('must not touch form')}};
 await assert.rejects(ensureLogin(page,{}),SaudiRateLimit);assert.equal(navigations,0);assert.equal(forms,0);
});

test('first blocked navigation stops immediately and unrelated pages are never inspected',async()=>{
 let content='Welcome',navigations=0;
 const page={url:()=> 'https://visa.visitsaudi.com/Visa/Index',locator:()=>({innerText:async()=>content}),goto:async()=>{navigations++;content=errorPage;return {status:()=>429,headers:()=>({'retry-after':'60'})}},getByRole:(role,{name})=>{assert.equal(role,'link');assert.equal(name,'Apply For Individual');return {isVisible:async()=>false}}};
 await assert.rejects(ensureLogin(page,{}),e=>e instanceof SaudiRateLimit&&e.rateLimit.notBefore>Date.now());assert.equal(navigations,1);
 await assertSaudiPageAvailable({url:()=> 'https://unrelated.example/private',locator:()=>{throw Error('must not read')}});
});

test('site pause stops all visa queues but preserves applicant data, group checkpoints and local extraction',async t=>{
 const {s}=storeFixture(t),group=await op(s,'groups','POST',{name:'test'}),a=await op(s,'applications','POST',{data:{firstName:'TEST'}}),b=await op(s,'applications','POST',{});
 const data=s.row(a.id).data,checkpoint='{"members":{"saved":{"phase":"complete"}}}';
 s.db.prepare("UPDATE visa_groups SET status='queued',checkpoint=? WHERE id=?").run(checkpoint,group.id);
 s.db.prepare("UPDATE applications SET status='queued',job_type='visa' WHERE id=?").run(a.id);
 s.db.prepare("UPDATE applications SET status='queued',job_type='extract' WHERE id=?").run(b.id);
 pauseSaudi(s,detectSaudiRateLimit(errorPage));
 assert.equal(s.row(a.id).status,'needs_review');assert.equal(s.row(a.id).data,data);assert.equal((await s.request('groups/'+group.id)).checkpoint.members.saved.phase,'complete');
 assert.equal(s.row(b.id).status,'queued');assert.equal((await s.request('claim','POST',{})).id,b.id);
 await assert.rejects(op(s,'applications/'+a.id+'/queue','POST',{job:'visa'}),SaudiRateLimit);
 const current=await s.request('groups/'+group.id);await assert.rejects(op(s,'groups/'+group.id+'/queue','POST',{version:current.version,confirmed:true}),SaudiRateLimit);
 assert.equal((await s.request('settings')).connections.visa,false);
});

test('pause survives restart, suppresses even stale queued jobs and clears only for the operator with a current confirmation',async t=>{
 const f=storeFixture(t),a=await op(f.s,'applications','POST',{}),g=await op(f.s,'groups','POST',{name:'pending'});const pause=pauseSaudi(f.s,detectSaudiRateLimit(errorPage));
 const s=f.reopen();assert.equal(s.getMeta(pauseKey).id,pause.id);
 // A stale producer cannot bypass claim protection simply by leaving a queued row.
 s.db.prepare("UPDATE applications SET status='queued',job_type='visa' WHERE id=?").run(a.id);s.db.prepare("UPDATE visa_groups SET status='queued' WHERE id=?").run(g.id);
 assert.equal(await s.request('claim','POST',{}),null);
 await assert.rejects(s.request('saudi/resume','POST',{pauseId:pause.id,confirmed:true}),/Mas’ul/);
 await assert.rejects(op(s,'saudi/resume','POST',{pauseId:'stale',confirmed:true}),/yangilangan/);
 const newer=pauseSaudi(s,{code:429,notBefore:Date.now()+60000});
 await assert.rejects(op(s,'saudi/resume','POST',{pauseId:newer.id,confirmed:true}),/kutish muddati/);
 const final=pauseSaudi(s,detectSaudiRateLimit(errorPage));await op(s,'saudi/resume','POST',{pauseId:final.id,confirmed:true});
 assert.equal(s.getMeta(pauseKey),null);assert.equal(await s.request('claim','POST',{}),null);assert.equal(s.row(a.id).status,'needs_review');
});

test('Telegram shows the actual pause, does not open a blocked site and rejects stale or foreign resume buttons',async t=>{
 const {s}=storeFixture(t),pause=pauseSaudi(s,detectSaudiRateLimit(errorPage));let opens=0;const messages=[];
 const bot=new TelegramNative({store:s,operatorId:123,call:async(method,body)=>{messages.push(body);return {message_id:messages.length}},openSaudi:async()=>{opens++}});
 const message=text=>({message:{from:{id:123},chat:{type:'private',id:123},text}});
 const click=(id,from=123)=>({callback_query:{id:'callback',data:'saudiresume:'+id,from:{id:from},message:{chat:{type:'private',id:123}}}});
 await bot.handle(message('/saudi'));assert.equal(opens,0);assert.match(messages.at(-1).text,/1015\/429/);assert.match(messages.at(-1).text,/muddatini ko‘rsatmadi/);
 await bot.handle(message('/status'));assert.match(messages.at(-1).text,/1015\/429 — pauzada/);
 await bot.handle(click(pause.id,999));assert.ok(s.getMeta(pauseKey));
 await bot.handle(click('stale'));assert.ok(s.getMeta(pauseKey));
 await bot.handle(click(pause.id));assert.equal(s.getMeta(pauseKey),null);assert.equal(opens,0);
});
