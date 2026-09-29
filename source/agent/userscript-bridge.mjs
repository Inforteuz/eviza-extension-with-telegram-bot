import http from 'node:http';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Attention} from './visa-errors.mjs';
export const SCRIPT_PORT=47832;
const ORIGIN='https://visa.visitsaudi.com';
export function allowedScriptUrl(value){try{const u=new URL(value);return u.origin===ORIGIN&&!u.username&&!u.password&&/^\/(?:Visa\/(?:Index|PersonalInfo|PassportInfo|Terms|Review)(?:\/|$)|Insurance\/ChooseInsurance\/|Login(?:\/|$))/.test(u.pathname)}catch{return false}}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const stopped=()=>new Attention('needs_auth','Skript bilan aloqa uzildi yoki to‘xtatildi. Saudi sahifasidagi eVisa skriptini ulang; takrorlashdan oldin qoralamani tekshiring.','login');
export class UserscriptBridge {
 constructor({config,port=SCRIPT_PORT,commandTimeout=20000}){this.config=config;this.port=port;this.commandTimeout=commandTimeout;this.peer=null;this.pending=null;this.server=null;this.page=new ScriptPage(this)}
 async start(){this.server=http.createServer((req,res)=>this.handle(req,res));await new Promise((ok,no)=>{this.server.once('error',no);this.server.listen(this.port,'127.0.0.1',ok)});this.port=this.server.address().port;return this}
 connected(){return !!this.peer&&Date.now()-this.peer.seen<12000&&!this.peer.paused}
 signedIn(){return this.connected()&&new URL(this.peer.url).pathname.startsWith('/Visa/')}
 async open(){if(!this.connected())throw stopped();return this.page}
 rejectPending(){if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(stopped());this.pending=null}}
 async close(){this.rejectPending();if(this.server)await new Promise(ok=>{this.server.close(ok);this.server.closeAllConnections()})}
 async handle(req,res){
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};
  try{
   if(req.headers.host!==`127.0.0.1:${this.port}`||req.method!=='POST')return send(403,{error:'Manba noto‘g‘ri.'});
   const origin=req.headers.origin;if(origin&&origin!==ORIGIN&&origin!=='null'&&!/^(?:chrome|moz)-extension:\/\/[a-zA-Z0-9-]+$/.test(origin))return send(403,{error:'Manba noto‘g‘ri.'});
   const c=await this.config(),given=Buffer.from(String(req.headers.authorization||'')),expected=Buffer.from('Bearer '+(c.USERSCRIPT_TOKEN||''));
   if(c.BROWSER_MODE!=='userscript'||!c.USERSCRIPT_TOKEN||given.length!==expected.length||!timingSafeEqual(given,expected))return send(401,{error:'Skript ulanish kodi yoki rejimi mos kelmadi.'});
   let raw='';for await(const b of req){raw+=b;if(raw.length>200000)return send(413,{error:'So‘rov katta.'})}const data=JSON.parse(raw||'{}');
   if(!/^[a-f0-9-]{36}$/i.test(data.clientId||'')||!/^[a-f0-9-]{36}$/i.test(data.documentId||'')||!allowedScriptUrl(data.url))return send(400,{error:'Faqat Saudi eVisa sahifasini ulang.'});
   if(this.peer&&this.peer.clientId!==data.clientId){if(Date.now()-this.peer.seen<15000||this.pending)return send(409,{error:'Boshqa eVisa oynasi ulangan. Avval uni to‘xtating.'});this.peer=null}
   if(req.url==='/poll'){
    this.peer={clientId:data.clientId,documentId:data.documentId,url:data.url,seen:Date.now(),paused:!!data.paused};
    if(data.paused){this.rejectPending();return send(200,{paused:true})}
    const p=this.pending;
    if(p&&!p.delivered){
     if(p.command.url!==data.url||p.command.documentId!==data.documentId){this.rejectPending();return send(409,{error:'Sahifa o‘zgargan. Arizani tekshiring.'})}
     p.delivered=true;return send(200,{command:p.command});
    }
    return send(200,{});
   }
   if(req.url==='/result'){
    const p=this.pending;if(!p||p.command.id!==data.id||!p.delivered||p.command.documentId!==data.documentId||p.command.url!==data.url)return send(409,{error:'Amal muddati tugagan. Qayta bajarilmaydi.'});
    clearTimeout(p.timer);this.pending=null;if(data.error)p.reject(new Attention('needs_review',String(data.error).slice(0,400)));else p.resolve(data.value);return send(200,{ok:true});
   }
   return send(404,{error:'Topilmadi.'});
  }catch{if(!res.headersSent)send(400,{error:'Skript so‘rovi qabul qilinmadi.'})}
 }
 rpc(action,payload={}){
  if(!this.connected())return Promise.reject(stopped());if(this.pending)return Promise.reject(Error('Parallel script commands are not allowed.'));
  return new Promise((resolve,reject)=>{const command={id:randomUUID(),action,...payload,url:this.peer.url,documentId:this.peer.documentId};const timer=setTimeout(()=>{if(this.pending?.command.id===command.id){this.pending=null;reject(stopped())}},this.commandTimeout);this.pending={command,resolve,reject,timer,delivered:false}});
 }
}
function matchUrl(target,url){if(typeof target==='function')return target(new URL(url));if(!target.includes('*'))return url===target;const regex=target.split('*').map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');return new RegExp('^'+regex+'$').test(url)}
export class ScriptPage {
 constructor(bridge){this.bridge=bridge;this.manualLogin=true}
 url(){return this.bridge.peer?.url||ORIGIN+'/Visa/Index'}
 async goto(target){if(!allowedScriptUrl(target))throw Error('Unsupported navigation.');const doc=this.bridge.peer?.documentId;await this.bridge.rpc('goto',{target});await this.until(()=>this.bridge.peer?.documentId!==doc,20000)}
 async until(predicate,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){if(!this.bridge.connected())throw stopped();if(predicate())return;await sleep(150)}throw new Attention('needs_review','Sahifa kutilgan bosqichga o‘tmadi. Qoralamani tekshiring.')}
 async waitForURL(target,{timeout=15000}={}){await this.until(()=>matchUrl(target,this.url()),timeout)}
 async waitForFunction(_fn,{label,expected},{timeout=1200}={}){const start=Date.now();while(Date.now()-start<timeout){if(await this.getByRole('textbox',{name:label,exact:true}).inputValue()===expected)return;await sleep(100)}throw Error('Date not accepted.')}
 locator(selector){return new ScriptLocator(this,[{css:selector}])}
 getByRole(role,{name,exact=false}={}){return new ScriptLocator(this,[{role,name:name instanceof RegExp?{regex:name.source,flags:name.flags}:name,exact}])}
 snapshot(){return this.bridge.rpc('snapshot')}
 async bringToFront(){}
 isClosed(){return !this.bridge.connected()}
}
class ScriptLocator {
 constructor(page,selector){this.page=page;this.selector=selector}
 locator(css){return new ScriptLocator(this.page,[...this.selector,{css}])}
 op(operation,value){return this.page.bridge.rpc('element',{selector:this.selector,operation,value})}
 fill(v){return this.op('fill',v)} pressSequentially(v){return this.op('type',v)} press(v){return this.op('press',v)} click(){return this.op('click')} dispatchEvent(v){if(v!=='click')throw Error('Unsupported event.');return this.click()}
 selectOption(v){return this.op('select',v.label)} inputValue(){return this.op('value')} innerText(){return this.op('text')} isVisible(){return this.op('visible')} isEditable(){return this.op('editable')} isChecked(){return this.op('checked')} count(){return this.op('count')}
 async check(){if(!await this.isChecked())await this.click();if(!await this.isChecked())throw Error('Choice not accepted.')}
 async waitFor({state='visible',timeout=15000}={}){const start=Date.now();while(Date.now()-start<timeout){if(await this.isVisible()===(state==='visible'))return;await sleep(100)}throw Error('Field unavailable.')}
 async setInputFiles(file){const bytes=await readFile(file);if(bytes.length<5000||bytes.length>100000)throw Error('Invalid portrait size.');return this.op('portrait',bytes.toString('base64'))}
}
