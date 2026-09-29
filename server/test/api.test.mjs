import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import sharp from 'sharp';
import {openDatabase} from '../src/db.mjs';
import {Billing} from '../src/billing.mjs';
import {Auth} from '../src/auth.mjs';
import {createApi} from '../src/api.mjs';
import {python,skipWithoutOpenCV} from './opencv.mjs';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const image=await sharp({create:{width:800,height:560,channels:3,background:'#ddd'}}).jpeg().toBuffer();

async function setup(t,{recognize}={}){
 const db=openDatabase(':memory:'),billing=new Billing(db,{price:5000}),auth=new Auth(db);
 billing.upsertUser({id:1,first_name:'Test'});
 const notes=[];const bot={notifyReady:async(id,e)=>notes.push({id,...e}),notifyLowBalance:async(id,balance)=>notes.push({id,low:balance})};
 let calls=0;
 const fake=recognize||(async(_bytes,{portraitOnly})=>{calls++;return {data:portraitOnly?{}:{firstName:'TEST',passportNumber:'AB1234567'},notes:[],conflicts:[],unverifiedMrz:false,aiError:null,portrait:'cG9ydHJhaXQ=',portraitError:null}});
 const api=createApi({billing,auth,bot,config:{dedupeDays:30,pythonBin:python},botUsername:'evisa_test_bot',recognize:fake,log:{error(){}},...(skipWithoutOpenCV?{assertImage:async()=>{}}:{})});
 const server=http.createServer(api);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}`,token=auth.issue(1);
 const request=async(method,path,{body,headers={},auth:useAuth=true}={})=>{const r=await fetch(base+path,{method,headers:{...(useAuth?{Authorization:'Bearer '+token}:{}),...headers},body});return {status:r.status,data:await r.json()}};
 const upload=(id,query='')=>request('POST',`/api/ext/passports?applicantId=${id}${query}`,{body:image,headers:{'Content-Type':'image/jpeg'}});
 return {db,billing,auth,notes,request,upload,calls:()=>calls,token};
}

test('passport read needs a token, then charges once and re-reads of the same applicant are free',async t=>{
 const f=await setup(t);
 assert.equal((await f.request('GET','/api/ext/me',{auth:false})).status,401);
 assert.equal((await f.upload(A)).status,402,'empty balance');
 assert.equal(f.calls(),0,'no AI call without balance');
 f.billing.credit(1,12000,'topup','t1');
 const first=await f.upload(A);assert.equal(first.status,200);assert.equal(first.data.charged,5000);assert.equal(first.data.balance,7000);assert.equal(first.data.data.firstName,'TEST');
 const again=await f.upload(A);assert.equal(again.data.charged,0);assert.equal(again.data.balance,7000);
 const same=await f.upload(B);assert.equal(same.data.charged,0,'same passport number as a new applicant');
 const me=await f.request('GET','/api/ext/me');assert.equal(me.data.balance,7000);assert.equal(me.data.price,5000);assert.equal(me.data.botUsername,'evisa_test_bot');
});

test('a failed read or unreadable passport number refunds the hold',async t=>{
 let mode='throw';
 const f=await setup(t,{recognize:async()=>{if(mode==='throw')throw Error('boom');return {data:{passportNumber:''},aiError:'AI xatosi',portrait:null,notes:[],conflicts:[]}}});
 f.billing.credit(1,5000,'topup','t1');
 assert.equal((await f.upload(A)).status,500);assert.equal(f.billing.user(1).balance,5000);
 mode='empty';const r=await f.upload(A);assert.equal(r.status,200);assert.equal(r.data.charged,0);assert.equal(r.data.activated,false);assert.equal(f.billing.user(1).balance,5000);
});

test('portrait-only recrop is free and never calls AI',async t=>{
 const f=await setup(t);
 const r=await f.upload(A,'&portraitOnly=1');assert.equal(r.status,200);assert.equal(r.data.charged,0);assert.ok(r.data.portrait);
});

test('input validation rejects bad ids, non-images and tiny images',{skip:skipWithoutOpenCV},async t=>{
 const f=await setup(t);f.billing.credit(1,50000,'topup','t1');
 assert.equal((await f.upload('not-a-uuid')).status,400);
 assert.equal((await f.request('POST',`/api/ext/passports?applicantId=${A}`,{body:'hello',headers:{'Content-Type':'text/plain'}})).status,415);
 const tiny=await sharp({create:{width:20,height:20,channels:3,background:'#fff'}}).png().toBuffer();
 assert.equal((await f.request('POST',`/api/ext/passports?applicantId=${A}`,{body:tiny,headers:{'Content-Type':'image/png'}})).status,415);
 assert.equal(f.calls(),0);
});

test('manual activation charges per passport and stops with 402 when the balance runs out',async t=>{
 const f=await setup(t);f.billing.credit(1,5000,'topup','t1');
 const body=JSON.stringify({items:[{applicantId:A,passportNumber:'AB1234567'},{applicantId:B,passportNumber:'CD7654321'}]});
 const r=await f.request('POST','/api/ext/activate',{body,headers:{'Content-Type':'application/json'}});
 assert.equal(r.status,402);assert.equal(f.billing.activated(1,A),true);assert.equal(f.billing.activated(1,B),false);assert.equal(f.billing.user(1).balance,0);
 assert.ok(f.notes.some(n=>n.low===0),'low balance notice');
});

test('payment-ready events notify the owner once',async t=>{
 const f=await setup(t);
 const event=JSON.stringify({id:'ready:'+A,type:'payment_ready',count:2,groupName:'Oila',totalSAR:'804.42',names:['TEST ONE','TEST TWO']});
 assert.equal((await f.request('POST','/api/ext/events',{body:event})).data.duplicate,false);
 assert.equal((await f.request('POST','/api/ext/events',{body:event})).data.duplicate,true);
 assert.equal(f.notes.length,1);assert.equal(f.notes[0].count,2);assert.equal(f.notes[0].groupName,'Oila');
 assert.equal((await f.request('POST','/api/ext/events',{body:JSON.stringify({id:'x',type:'other'})})).status,400);
});

test('pairing: create, pending, confirm in bot, collect token once',async t=>{
 const f=await setup(t);
 const pair=await f.request('POST','/api/ext/pair',{auth:false});assert.equal(pair.status,200);assert.match(pair.data.botUrl,/^https:\/\/t\.me\/evisa_test_bot\?start=pair_/);
 assert.equal((await f.request('GET','/api/ext/pair/'+pair.data.code,{auth:false})).status,202);
 f.auth.confirmPairing(pair.data.code,1);
 const done=await f.request('GET','/api/ext/pair/'+pair.data.code,{auth:false});assert.equal(done.status,200);assert.match(done.data.token,/^evx_/);
 assert.equal((await f.request('GET','/api/ext/pair/'+pair.data.code,{auth:false})).status,410);
});

test('blocked users and revoked tokens are refused; logout revokes only this token',async t=>{
 const f=await setup(t);const other=f.auth.issue(1);
 assert.equal((await f.request('POST','/api/ext/logout')).status,200);
 assert.equal((await f.request('GET','/api/ext/me')).status,401);
 assert.equal(f.auth.verify(other).id,1);
 f.billing.setBlocked(1,true);
 assert.equal((await f.request('GET','/api/ext/me',{auth:false,headers:{Authorization:'Bearer '+other}})).status,403);
});
