import test from 'node:test';
import assert from 'node:assert/strict';
import {TabSession,allowedScriptUrl} from '../src/lib/page.js';
import {Attention} from '../src/flow/errors.js';

const url='https://visa.visitsaudi.com/Visa/PersonalInfo';
function fakeChrome({respond=()=>({value:true}),tabUrl=url}={}){
 const sent=[],updates=[];let alive=true;const doc={documentId:'doc-1',activatedAt:1,url:tabUrl};
 const api={
  tabs:{
   get:async()=>{if(!alive)throw Error('No tab');return {id:7,url:doc.url,status:'complete'}},
   update:async(_id,{url:target})=>{updates.push(target);setTimeout(()=>{doc.documentId='doc-'+(updates.length+1);doc.activatedAt++;doc.url=target;session.observe(7,{...doc})},20)},
   sendMessage:async(_id,message)=>{
    if(message.type==='evisa-ping')return {...doc};
    sent.push(message.command);
    if(message.command.documentId!==doc.documentId)return {error:'stale',code:'stale_document'};
    return respond(message.command);
   },
  },
  scripting:{executeScript:async()=>{}},
 };
 let stopped=false;
 const session=new TabSession({tabId:7,api,isStopped:()=>stopped,pace:0,clickPause:0});
 return {api,session,sent,updates,doc,close:()=>{alive=false},stop:()=>{stopped=true}};
}

test('only Saudi form routes are reachable by navigation',()=>{
 assert.equal(allowedScriptUrl('https://visa.visitsaudi.com/Visa/Review/abc'),true);
 for(const bad of ['https://visa.visitsaudi.com/Payment/Checkout','https://visa.visitsaudi.com.evil.test/Visa/Index','http://visa.visitsaudi.com/Visa/Index'])assert.equal(allowedScriptUrl(bad),false);
});

test('commands carry the observed document and an older document never replaces a newer one',async()=>{
 const f=fakeChrome();
 assert.equal(await f.session.page.getByRole('textbox',{name:'City',exact:true}).inputValue(),true);
 assert.equal(f.sent[0].documentId,'doc-1');assert.deepEqual(f.sent[0].selector,[{role:'textbox',name:'City',exact:true}]);
 f.session.observe(7,{documentId:'doc-2',activatedAt:5,url});
 f.session.observe(7,{documentId:'doc-1',activatedAt:1,url});
 assert.equal(f.session.peer.documentId,'doc-2');
 f.session.observe(8,{documentId:'other-tab',activatedAt:9,url});
 assert.equal(f.session.peer.documentId,'doc-2','other tabs are ignored');
});

test('goto waits for a new document; content errors become Attention with a status',async()=>{
 const f=fakeChrome({respond:c=>c.operation==='select'?{error:'Kerakli tanlov topilmadi: X',code:'option_not_found'}:c.operation==='click'?{error:'To‘lovni faqat operator bajaradi.',code:'payment'}:{value:'ok'}});
 await f.session.page.goto('https://visa.visitsaudi.com/Visa/Index');
 assert.equal(f.session.page.url(),'https://visa.visitsaudi.com/Visa/Index');
 await assert.rejects(f.session.page.getByRole('combobox',{name:'Gender'}).selectOption({label:'X'}),e=>e instanceof Attention&&e.status==='needs_input'&&e.code==='option_not_found');
 await assert.rejects(f.session.page.locator('#btnPay').click(),e=>e instanceof Attention&&/operator/.test(e.message));
 await assert.rejects(f.session.page.goto('https://visa.visitsaudi.com/Payment/Pay'),Attention);
});

test('stop and a closed tab end the run without sending further commands',async()=>{
 const f=fakeChrome();
 f.stop();await assert.rejects(f.session.page.locator('body').innerText(),e=>e.stopped===true);
 assert.equal(f.sent.length,0);
 const g=fakeChrome();g.close();
 await assert.rejects(g.session.page.waitForURL('https://visa.visitsaudi.com/never',{timeout:3000}),e=>e instanceof Attention&&e.status==='needs_auth');
});

test('portrait upload size is checked before it reaches the page',async()=>{
 const f=fakeChrome();
 await assert.rejects(f.session.page.locator('#AttachmentPersonalPicture').setInputFiles('AAAA'),e=>e.status==='needs_input');
 assert.equal(f.sent.length,0);
});
