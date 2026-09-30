// Runs on visa.visitsaudi.com pages. It executes one fixed DOM operation per
// command from the extension background and never acts on its own.
(function(){
 if(globalThis.__evisaContent)return;globalThis.__evisaContent=true;
 let documentId=crypto.randomUUID(),activatedAt=Date.now();
 const hello=()=>{try{chrome.runtime.sendMessage({type:'evisa-hello',documentId,activatedAt,url:location.href}).catch(()=>{})}catch{/* extension reloaded */}};
 // A page restored from the back/forward cache is a new document for the worker.
 addEventListener('pageshow',event=>{if(event.persisted){documentId=crypto.randomUUID();activatedAt=Date.now();hello()}});
 hello();setInterval(hello,3000);

 let overlay=null,hideTimer=null;
 // The overlay sits bottom-right; when idle it closes itself so it never hides the payment button.
 function showStatus(status){
  clearTimeout(hideTimer);
  if(!status?.visible){overlay?.remove();overlay=null;return}
  if(!overlay){
   overlay=document.createElement('aside');overlay.dataset.evisaScript='1';
   overlay.style.cssText='position:fixed;right:14px;bottom:14px;z-index:2147483647;width:280px;background:#fff;color:#12352f;border:2px solid #0c8571;border-radius:12px;padding:12px 14px;box-shadow:0 6px 24px #0003;font:13px/1.4 system-ui,sans-serif';
   const title=document.createElement('strong');title.textContent='eVisa Auto-Filler';title.style.display='block';
   const close=document.createElement('button');close.type='button';const NS='http://www.w3.org/2000/svg',svg=document.createElementNS(NS,'svg'),path=document.createElementNS(NS,'path');
   for(const [k,v] of Object.entries({viewBox:'0 0 24 24',width:'14',height:'14',fill:'none',stroke:'currentColor','stroke-width':'2.2','stroke-linecap':'round','aria-hidden':'true'}))svg.setAttribute(k,v);
   path.setAttribute('d','M18 6 6 18M6 6l12 12');svg.append(path);close.append(svg);close.setAttribute('aria-label','Yopish');
   close.style.cssText='position:absolute;top:6px;right:8px;border:0;background:none;font:18px system-ui;color:#5f746f;cursor:pointer';
   close.onclick=()=>{overlay?.remove();overlay=null};
   const note=document.createElement('div');note.dataset.role='note';note.style.margin='6px 0 8px';
   const stop=document.createElement('button');stop.type='button';stop.textContent='To‘xtatish';
   stop.style.cssText='border:0;border-radius:8px;padding:7px 12px;background:#b42318;color:#fff;cursor:pointer;font:600 13px system-ui';
   stop.onclick=()=>chrome.runtime.sendMessage({type:'run:stop'}).catch(()=>{});
   overlay.append(close,title,note,stop);document.documentElement.append(overlay);
  }
  overlay.querySelector('[data-role=note]').textContent=status.text||'';
  overlay.querySelector('button:last-of-type').style.display=status.running?'':'none';
  if(!status.running)hideTimer=setTimeout(()=>{overlay?.remove();overlay=null},15000);
 }

 chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(sender.id!==chrome.runtime.id)return;
  if(message.type==='evisa-ping'){sendResponse({documentId,activatedAt,url:location.href});return}
  if(message.type==='evisa-status'){showStatus(message.status);return}
  if(message.type!=='evisa-command')return;
  const command=message.command;
  if(command.documentId!==documentId||command.url!==location.href){sendResponse({error:'Sahifa o‘zgargan. Qoralamani tekshiring.',code:'stale_document'});return}
  let operation;
  try{operation=globalThis.evisaDomOperation(command)}catch(error){sendResponse({error:String(error.message||error).slice(0,400),code:error.code||''});return}
  // Acknowledge before a navigating click so an unload never loses the answer.
  sendResponse({value:operation.value});
  if(operation.navigate)setTimeout(()=>location.assign(operation.navigate),0);
  else if(operation.click)setTimeout(()=>operation.click.click(),0);
 });
})();
