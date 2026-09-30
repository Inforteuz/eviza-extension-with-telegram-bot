import {Attention} from '../flow/errors.js';
export const ORIGIN='https://visa.visitsaudi.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function allowedScriptUrl(value){try{const u=new URL(value);return u.origin===ORIGIN&&!u.username&&!u.password&&/^\/(?:Visa\/(?:Index|PersonalInfo|PassportInfo|Terms|Review)(?:\/|$)|Insurance\/ChooseInsurance\/|Login(?:\/|$))/.test(u.pathname)}catch{return false}}
export const stoppedError=()=>Object.assign(new Attention('stopped','To‘ldirish to‘xtatildi. Davom ettirishdan oldin sahifadagi qoralamani tekshiring.','stopped'),{stopped:true});
const lostError=()=>new Attention('needs_auth','eVisa oynasi yopildi yoki javob bermayapti. Oynani qayta oching va “Davom etish”ni bosing.','login');

// One Saudi tab bound to one run. Commands go only to the document that the
// worker last observed; a newer document never receives an older command.
export class TabSession {
 constructor({tabId,api=globalThis.chrome,isStopped=()=>false,beforeCommand=async()=>{},pace=60,clickPause=450,peerTimeout=30000}){
  Object.assign(this,{tabId,api,isStopped,beforeCommand,pace,clickPause,peerTimeout});this.peer=null;this.page=new TabPage(this);
 }
 observe(tabId,hello){
  if(tabId!==this.tabId||!hello?.documentId)return;
  if(this.peer&&hello.documentId!==this.peer.documentId&&(hello.activatedAt||0)<(this.peer.activatedAt||0))return;
  this.peer={documentId:hello.documentId,activatedAt:hello.activatedAt||0,url:hello.url,seen:Date.now()};
 }
 async alive(){try{return !!await this.api.tabs.get(this.tabId)}catch{return false}}
 async inject(){
  await this.api.scripting.executeScript({target:{tabId:this.tabId,frameIds:[0]},files:['src/content/dom-ops.js','src/content/content.js']});
 }
 // Ask the current document directly; inject the content script if the tab
 // was opened before the extension was installed or reloaded.
 async ping(){
  try{const r=await this.api.tabs.sendMessage(this.tabId,{type:'evisa-ping'},{frameId:0});if(r?.documentId){this.observe(this.tabId,r);return true}}catch{/* no receiver yet */}
  return false;
 }
 async ensurePeer(){
  const start=Date.now();let injected=false;
  while(Date.now()-start<this.peerTimeout){
   if(this.isStopped())throw stoppedError();
   if(this.peer&&Date.now()-this.peer.seen<8000)return this.peer;
   if(!await this.alive())throw lostError();
   if(await this.ping())return this.peer;
   const tab=await this.api.tabs.get(this.tabId).catch(()=>null);
   if(!injected&&tab?.status==='complete'&&allowedScriptUrl(tab.url||'')){injected=true;await this.inject().catch(()=>{});continue}
   await sleep(300);
  }
  throw lostError();
 }
 async rpc(action,payload={}){
  if(this.isStopped())throw stoppedError();
  await this.beforeCommand();
  const peer=await this.ensurePeer();
  const command={id:crypto.randomUUID(),action,...payload,url:peer.url,documentId:peer.documentId};
  let response;
  try{response=await this.api.tabs.sendMessage(this.tabId,{type:'evisa-command',command},{frameId:0})}
  catch{throw new Attention('needs_review','Sahifa bilan aloqa uzildi. Sahifadagi qoralamani tekshirib “Davom etish”ni bosing.')}
  if(!response)throw new Attention('needs_review','Sahifa javob bermadi. Qoralamani tekshiring.');
  if(response.error){
   const code=response.code||'';
   const status=code==='login'||code==='captcha'?'needs_auth':code==='option_not_found'?'needs_input':'needs_review';
   throw Object.assign(new Attention(status,response.error,code==='login'?'login':'personal'),{code});
  }
  await sleep(action==='element'&&payload.operation==='click'?this.clickPause:this.pace);
  return response.value;
 }
 async until(predicate,timeout=15000){
  const start=Date.now();let checked=0;
  while(Date.now()-start<timeout){
   if(this.isStopped())throw stoppedError();
   if(predicate())return;
   // Each extension API call also keeps the MV3 service worker alive.
   if(Date.now()-checked>1000){checked=Date.now();if(!await this.alive())throw lostError()}
   await sleep(150);
  }
  throw new Attention('needs_review','Sahifa kutilgan bosqichga o‘tmadi. Qoralamani tekshiring.');
 }
}
function matchUrl(target,url){if(typeof target==='function')return target(new URL(url));if(!target.includes('*'))return url===target;const regex=target.split('*').map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');return new RegExp('^'+regex+'$').test(url)}
export class TabPage {
 constructor(session){this.session=session;this.manualLogin=true}
 url(){return this.session.peer?.url||ORIGIN+'/Visa/Index'}
 documentId(){return this.session.peer?.documentId||''}
 async goto(target){
  if(!allowedScriptUrl(target))throw new Attention('needs_review','Bu manzil avtomatik ochilmaydi.');
  if(this.session.isStopped())throw stoppedError();
  const doc=this.session.peer?.documentId;
  await this.session.api.tabs.update(this.session.tabId,{url:target});
  await this.session.until(()=>!!this.session.peer&&this.session.peer.documentId!==doc,30000);
 }
 async waitForURL(target,{timeout=15000}={}){await this.session.until(()=>matchUrl(target,this.url()),timeout)}
 async waitForFunction(_fn,{label,expected},{timeout=1200}={}){const start=Date.now();while(Date.now()-start<timeout){if(await this.getByRole('textbox',{name:label,exact:true}).inputValue()===expected)return;await sleep(100)}throw Error('Date not accepted.')}
 locator(selector){return new TabLocator(this,[{css:selector}])}
 getByRole(role,{name,exact=false}={}){return new TabLocator(this,[{role,name:name instanceof RegExp?{regex:name.source,flags:name.flags}:name,exact}])}
 snapshot(){return this.session.rpc('snapshot')}
 async bringToFront(){}
 isClosed(){return false}
}
class TabLocator {
 constructor(page,selector){this.page=page;this.selector=selector}
 locator(css){return new TabLocator(this.page,[...this.selector,{css}])}
 op(operation,value){return this.page.session.rpc('element',{selector:this.selector,operation,value})}
 fill(v){return this.op('fill',v)} setDate(v){return this.op('date',v)} pressSequentially(v){return this.op('type',v)} press(v){return this.op('press',v)} click(){return this.op('click')}
 dispatchEvent(v){if(v!=='click')throw Error('Unsupported event.');return this.click()}
 selectOption(v){return this.op('select',v.label)} inputValue(){return this.op('value')} innerText(){return this.op('text')} isVisible(){return this.op('visible')} isEditable(){return this.op('editable')} isChecked(){return this.op('checked')} count(){return this.op('count')}
 async check(){if(!await this.isChecked())await this.click();if(!await this.isChecked())throw new Attention('needs_review','Saytdagi tanlov belgilanmadi.')}
 async waitFor({state='visible',timeout=15000}={}){const start=Date.now();while(Date.now()-start<timeout){if(await this.isVisible()===(state==='visible'))return;await sleep(100)}throw Error('Field unavailable.')}
 // The flow passes the confirmed 200x200 portrait as base64 JPEG.
 async setInputFiles(base64){const size=Math.floor(String(base64).length*3/4);if(size<5000||size>100000)throw new Attention('needs_input','Portret 200 × 200 va 5–100 KB bo‘lishi kerak.');return this.op('portrait',base64)}
}
