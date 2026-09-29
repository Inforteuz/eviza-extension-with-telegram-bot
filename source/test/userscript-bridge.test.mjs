import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {UserscriptBridge,allowedScriptUrl} from '../agent/userscript-bridge.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const token='a'.repeat(64),url='https://visa.visitsaudi.com/Visa/Index';
async function setup(t,options={}){
 const bridge=await new UserscriptBridge({config:async()=>({BROWSER_MODE:'userscript',USERSCRIPT_TOKEN:token}),port:0,...options}).start();t.after(()=>bridge.close());
 const tab={clientId:randomUUID(),documentId:randomUUID(),url};
 const post=async(route,data={},headers={})=>{const r=await fetch(`http://127.0.0.1:${bridge.port}`+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...headers},body:JSON.stringify({...tab,...data})});return {status:r.status,data:await r.json()}};
 return {bridge,tab,post};
}
test('bridge accepts only Saudi form/login routes, not payment gateways or lookalike hosts',()=>{
 for(const path of ['/Visa/Index','/Login/OTPAuth','/Visa/PersonalInfo?gName=test','/Visa/PassportInfo/abc','/Insurance/ChooseInsurance/abc'])assert.equal(allowedScriptUrl('https://visa.visitsaudi.com'+path),true);
 for(const value of ['https://evil.test/Visa/Index','https://visa.visitsaudi.com.evil.test/Visa/Index','https://visa.visitsaudi.com/Payment/Pay','https://visa.visitsaudi.com/Visa/IndexEvil','https://u:p@visa.visitsaudi.com/Visa/Index'])assert.equal(allowedScriptUrl(value),false);
});
test('loopback bridge denies missing credential, hostile Origin, unsupported pages and a second tab',async t=>{
 const {post}=await setup(t);
 assert.equal((await post('/poll',{}, {Authorization:''})).status,401);
 assert.equal((await post('/poll',{}, {Origin:'https://evil.test'})).status,403);
 assert.equal((await post('/poll',{url:'https://evil.test/Visa/Index'})).status,400);
 assert.equal((await post('/poll')).status,200);
 assert.equal((await post('/poll',{clientId:randomUUID()})).status,409);
});
test('commands are delivered once and results are bound to the document and command ID',async t=>{
 const {post,bridge}=await setup(t);await post('/poll');
 const answer=bridge.rpc('element',{selector:[{css:'#FirstName'}],operation:'value'});
 const first=await post('/poll');assert.ok(first.data.command.id);assert.equal((await post('/poll')).data.command,undefined);
 assert.equal((await post('/result',{id:first.data.command.id,documentId:randomUUID(),value:'WRONG'})).status,409);
 assert.equal((await post('/result',{id:first.data.command.id,value:'TEST'})).status,200);assert.equal(await answer,'TEST');
 assert.equal((await post('/result',{id:first.data.command.id,value:'REPLAY'})).status,409);
});
test('uncertain clicks time out without re-delivery; late acknowledgements cannot revive them',async t=>{
 const {post,bridge}=await setup(t,{commandTimeout:30});await post('/poll');
 const answer=bridge.rpc('element',{selector:[{css:'#Next'}],operation:'click'});const rejection=assert.rejects(answer,/Skript bilan aloqa/);
 const first=await post('/poll');await sleep(45);await rejection;
 assert.equal((await post('/poll')).data.command,undefined);
 assert.equal((await post('/result',{id:first.data.command.id,value:true})).status,409);
});
test('pausing rejects a pending operation and no commands run while paused',async t=>{
 const {post,bridge}=await setup(t);await post('/poll');const answer=bridge.rpc('snapshot');const rejection=assert.rejects(answer,/to‘xtatildi/);
 await post('/poll',{paused:true});await rejection;assert.equal(bridge.connected(),false);await assert.rejects(bridge.open());
});
test('navigating before delivery cancels the pending operation instead of filling another page',async t=>{
 const {post,bridge}=await setup(t);await post('/poll');const answer=bridge.rpc('element',{operation:'fill',value:'TEST'});const rejection=assert.rejects(answer);
 assert.equal((await post('/poll',{url:'https://visa.visitsaudi.com/Visa/PersonalInfo',documentId:randomUUID()})).status,409);await rejection;
 assert.equal((await post('/poll')).data.command,undefined);
});
test('goto waits for a new document heartbeat before returning to the form worker',async t=>{
 const {post,bridge,tab}=await setup(t);await post('/poll');let done=false;
 const answer=bridge.page.goto('https://visa.visitsaudi.com/Visa/PersonalInfo').then(()=>{done=true});
 const {data}=await post('/poll');await post('/result',{id:data.command.id,value:true});await sleep(180);assert.equal(done,false);
 tab.url='https://visa.visitsaudi.com/Visa/PersonalInfo';tab.documentId=randomUUID();await post('/poll');await answer;assert.equal(done,true);
});
