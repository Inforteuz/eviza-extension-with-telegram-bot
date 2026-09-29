import {scriptDomOperation} from './userscript-dom.mjs';
// This file is bundled into the Tampermonkey installable. GM storage stays out
// of the Saudi page. Only a local bridge credential is stored here.
const base='http://127.0.0.1:47832';
const documentId=crypto.randomUUID();
let clientId=sessionStorage.getItem('evisa-script-tab');if(!clientId){clientId=crypto.randomUUID();sessionStorage.setItem('evisa-script-tab',clientId)}
let token=GM_getValue('bridge-token',''),enabled=sessionStorage.getItem('evisa-script-enabled')==='1';
const root=document.createElement('aside');root.dataset.evisaScript='1';root.style.cssText='position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#fff;color:#163b35;border:2px solid #0c8571;border-radius:12px;padding:14px;width:285px;box-shadow:0 3px 18px #0003;font:14px system-ui;';
const title=document.createElement('strong');title.textContent='eVisa — Telegram skripti';const status=document.createElement('p');status.textContent='To‘lovni operator bajaradi.';
const connect=document.createElement('button'),toggle=document.createElement('button');connect.textContent='Ulash';
for(const b of [connect,toggle])b.style.cssText='padding:9px;margin-right:7px;border:0;border-radius:6px;background:#087560;color:white;cursor:pointer';
root.append(title,status,connect,toggle);document.body.append(root);
const toggleText=()=>toggle.textContent=enabled?'To‘xtatish':'Ishga ruxsat';toggleText();
const request=(route,data={})=>new Promise((resolve,reject)=>GM_xmlhttpRequest({method:'POST',url:base+route,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},data:JSON.stringify({clientId,documentId,url:location.href,...data}),timeout:7000,onload:r=>{try{const x=JSON.parse(r.responseText);if(r.status!==200)throw Error(x.error||'Ulanish ishlamadi.');resolve(x)}catch(e){reject(e)}},onerror:()=>reject(Error('Kompyuterdagi bot ishlayotganini tekshiring.')),ontimeout:()=>reject(Error('Bot bilan aloqa vaqti tugadi.'))}));
connect.onclick=()=>{const value=prompt('http://127.0.0.1:47831/ dagi “Brauzer skripti” ulash kodini kiriting. API kaliti yoki Telegram tokenini kiritmang.');if(!value)return;if(!/^[a-f0-9]{64}$/i.test(value.trim())){status.textContent='Ulash kodi 64 belgidan iborat.';return}token=value.trim();GM_setValue('bridge-token',token);status.textContent='Kod saqlandi. “Ishga ruxsat”ni bosing.'};
toggle.onclick=async()=>{enabled=!enabled;sessionStorage.setItem('evisa-script-enabled',enabled?'1':'0');toggleText();if(!enabled&&token)await request('/poll',{paused:true}).catch(()=>{});status.textContent=enabled?'Telegram navbati kutilmoqda…':'Skript to‘xtatilgan.'};
async function tick(){
 let delay=1000;
 try{
  if(!token||!enabled)return;
  const result=await request('/poll');if(!enabled)return;const cmd=result.command;if(cmd)delay=100;if(!cmd){status.textContent='Ulangan. Telegram navbati kutilmoqda.';return}
  if(cmd.documentId!==documentId||cmd.url!==location.href)throw Error('Sahifa o‘zgargan. Qoralamani tekshiring.');
  let operation;
  try{operation=scriptDomOperation(cmd)}catch(error){await request('/result',{id:cmd.id,error:error.message});enabled=false;sessionStorage.setItem('evisa-script-enabled','0');toggleText();status.textContent=error.message;return}
  // Acknowledge BEFORE a navigation click. If acknowledgement fails, do not
  // click; the worker never redelivers uncertain commands or duplicates drafts.
  await request('/result',{id:cmd.id,value:operation.value});
  if(!enabled)return;
  if(operation.navigate){location.assign(operation.navigate);return}
  if(operation.click){operation.click.click();await new Promise(r=>setTimeout(r,450))}
  status.textContent='Ariza to‘ldirilmoqda…';
 }catch(error){status.textContent=error.message}
 finally{setTimeout(tick,delay)}
}
tick();
