import {Store,defaults} from './lib/store.js';
import {apiRequest,ApiError,normalizeServerUrl} from './lib/api.js';
import {getImage,deleteImages} from './lib/images.js';
import {Runner} from './lib/runner.js';
import {newApplicant,normalizeData,derive,previewData,confirmationFor,mergeRecognition,lockedStatuses,sha256,displayName} from './lib/applicants.js';
import {applyPreparationDefaults,missingFields,cleanTripDefaults} from './lib/domain.js';
import {MAX_APPLICANTS} from './config.js';

const store=new Store();
// MV3 stops an idle worker after ~30 s; any extension API call resets that timer.
let holders=0,beat=null;
const keepAlive={acquire(){if(holders++===0)beat=setInterval(()=>chrome.runtime.getPlatformInfo().catch(()=>{}),20000)},release(){if(--holders<=0){holders=0;clearInterval(beat);beat=null}}};
const ready=store.load();
const server=()=>store.get('auth')?.serverUrl||store.get('settings').serverUrl;
const token=()=>store.get('auth')?.token;

async function api(path,options={}){
 try{return (await apiRequest(server(),path,{token:token(),...options})).data}
 catch(error){if(error instanceof ApiError&&error.status===401&&token()){await store.set('auth',null);await store.log('Kengaytma hisobdan uzildi. Qayta ulang.','warn')}throw error}
}
async function refreshAccount(){
 if(!token())throw Error('Avval Telegram hisobingizni ulang.');
 const account=await api('/api/ext/me');
 await store.set('auth',{...store.get('auth'),account,checkedAt:Date.now()});
 return account;
}
const setBalance=balance=>{if(typeof balance==='number'&&store.get('auth'))return store.set('auth',{...store.get('auth'),account:{...store.get('auth').account,balance}})};

const runner=new Runner({store,account:refreshAccount,
 api:{activate:async items=>{
  try{const r=await api('/api/ext/activate',{method:'POST',body:{items}});await setBalance(r.balance);return r}
  catch(error){if(error.status===402){await setBalance(error.data?.balance);throw Error('Balans yetarli emas: '+error.data?.price+' so‘m kerak. Telegram botda balansni to‘ldiring.')}throw error}
 }},
 notify:event=>api('/api/ext/events',{method:'POST',body:event}),
});
ready.then(async()=>{
 await runner.recover();
 pollPairing();
 // Uploads interrupted by a worker restart are read again (a finished read is never charged twice).
 for(const a of store.get('applicants'))if(a.status==='reading')enqueue(a.id);
});

// ---- Passport recognition queue (max 2 parallel uploads) ----
const queue=[];let reading=0;
function enqueue(id,portraitOnly=false){if(!queue.some(q=>q.id===id))queue.push({id,portraitOnly});pump()}
function pump(){
 while(reading<2&&queue.length){
  const job=queue.shift();reading++;keepAlive.acquire();
  recognize(job).catch(()=>{}).finally(()=>{reading--;keepAlive.release();pump()});
 }
}
async function recognize({id,portraitOnly}){
 const a=store.applicant(id);if(!a)return;
 const blob=await getImage(id);
 if(!blob){await store.updateApplicant(id,{status:'error',error:'Pasport rasmi topilmadi. Rasmni qayta yuklang.'});return}
 if(!portraitOnly)await store.updateApplicant(id,{status:'reading',error:''});
 try{
  const result=await api(`/api/ext/passports?applicantId=${id}${portraitOnly?'&portraitOnly=1':''}`,{method:'POST',body:blob,contentType:blob.type||'image/jpeg',timeout:120000});
  await setBalance(result.balance);
  const current=store.applicant(id);if(!current)return;
  let next=portraitOnly?{...current}:mergeRecognition(current,result,store.get('settings').tripDefaults);
  if(result.portrait){await store.setPortrait(id,result.portrait);next={...next,hasPortrait:true,portraitHash:await sha256(result.portrait),confirmation:''};if(next.status==='confirmed')next.status='review'}
  else if(portraitOnly)next.notes=[result.portraitError||'Portretni kesib bo‘lmadi.'];
  next.activated=!!result.activated||current.activated;
  await store.updateApplicant(id,derive(next));
  if(!portraitOnly)await store.log(`${displayName(next)}: pasport o‘qildi${result.charged?` (−${result.charged} so‘m)`:''}.`);
 }catch(error){
  if(error.status===402)await setBalance(error.data?.balance);
  await store.updateApplicant(id,{status:portraitOnly?store.applicant(id)?.status:'error',error:error.message});
  await store.log(`${store.applicant(id)?.fileName||'Rasm'}: ${error.message}`,'error');
 }
}

// ---- Pairing through the Telegram bot ----
let pairingLoop=null;
function pollPairing(){
 const pairing=store.get('pairing');if(!pairing||pairingLoop)return;
 const base=pairing.serverUrl;keepAlive.acquire();
 pairingLoop=(async()=>{
  try{
   while(store.get('pairing')&&Date.now()<store.get('pairing').expiresAt){
    await new Promise(r=>setTimeout(r,2000));
    const current=store.get('pairing');if(!current)break;
    try{
     const r=await apiRequest(base,'/api/ext/pair/'+current.code);
     if(r.data.status==='ok'){await store.set('auth',{serverUrl:base,token:r.data.token});await store.set('pairing',null);await refreshAccount();await store.log('Telegram hisobi ulandi.');break}
    }catch(error){if(error.status===410){await store.set('pairing',null);break}}
   }
   if(store.get('pairing')&&Date.now()>=store.get('pairing').expiresAt)await store.set('pairing',null);
  }finally{pairingLoop=null;keepAlive.release()}
 })();
}
async function startPairing(serverUrl){
 const base=normalizeServerUrl(serverUrl);
 await store.set('settings',{...store.get('settings'),serverUrl:base});
 const {data}=await apiRequest(base,'/api/ext/pair',{method:'POST'});
 await store.set('pairing',{code:data.code,botUrl:data.botUrl,expiresAt:data.expiresAt,serverUrl:base});
 await chrome.tabs.create({url:data.botUrl,active:true});
 pollPairing();
 return {botUrl:data.botUrl};
}

// ---- Commands from the side panel ----
const handlers={
 'auth:pair':async({serverUrl})=>startPairing(serverUrl),
 'auth:pair-cancel':async()=>{await store.set('pairing',null)},
 'auth:pair-resume':async()=>pollPairing(),
 'auth:token':async({serverUrl,token:value})=>{
  const base=normalizeServerUrl(serverUrl);const t=String(value||'').trim();
  if(!/^evx_[\w-]{43}$/.test(t))throw Error('Token noto‘g‘ri. Botdagi “Token olish” tugmasidan oling.');
  const {data}=await apiRequest(base,'/api/ext/me',{token:t});
  await store.set('settings',{...store.get('settings'),serverUrl:base});
  await store.set('auth',{serverUrl:base,token:t,account:data,checkedAt:Date.now()});await store.log('Token orqali ulandi.');
 },
 'auth:refresh':async()=>refreshAccount(),
 'auth:logout':async()=>{if(runner.busy())throw Error('Avval jarayonni to‘xtating.');await api('/api/ext/logout',{method:'POST'}).catch(()=>{});await store.set('auth',null)},
 'settings:save':async({settings})=>{
  const current=store.get('settings');
  const next={...current,pauseAfterEach:!!settings.pauseAfterEach,tripDefaults:cleanTripDefaults({...current.tripDefaults,...settings.tripDefaults})};
  if(settings.serverUrl!==undefined&&settings.serverUrl!==current.serverUrl){if(token())throw Error('Server manzilini o‘zgartirishdan oldin hisobdan chiqing.');next.serverUrl=settings.serverUrl?normalizeServerUrl(settings.serverUrl):''}
  await store.set('settings',next);
 },
 'applicants:add':async({items})=>{
  if(!token())throw Error('Avval Telegram hisobingizni ulang.');
  const list=store.get('applicants');if(list.length+items.length>MAX_APPLICANTS)throw Error(`Ro‘yxatda ko‘pi bilan ${MAX_APPLICANTS} ta arizachi bo‘lishi mumkin.`);
  const trip=store.get('settings').tripDefaults;
  await store.set('applicants',[...list,...items.map(i=>newApplicant({id:i.id,fileName:String(i.fileName||'').slice(0,120),tripDefaults:trip}))]);
  for(const i of items)enqueue(i.id);
 },
 'applicants:manual':async()=>{
  const id=crypto.randomUUID();
  await store.set('applicants',[...store.get('applicants'),newApplicant({id,source:'manual',tripDefaults:store.get('settings').tripDefaults})]);
  return {id};
 },
 'applicant:reread':async({id})=>{const a=store.applicant(id);if(!a||lockedStatuses.includes(a.status)||a.status==='reading')throw Error('Hozir qayta o‘qib bo‘lmaydi.');enqueue(id)},
 'applicant:recrop':async({id})=>{const a=store.applicant(id);if(!a||lockedStatuses.includes(a.status))throw Error('Hozir portretni o‘zgartirib bo‘lmaydi.');enqueue(id,true)},
 'applicant:portrait':async({id,base64})=>{
  const a=store.applicant(id);if(!a||lockedStatuses.includes(a.status))throw Error('Hozir portretni o‘zgartirib bo‘lmaydi.');
  const size=Math.floor(String(base64).length*3/4);if(!/^[A-Za-z0-9+/=]+$/.test(base64)||size<5000||size>100000)throw Error('Portret 200 × 200 va 5–100 KB bo‘lishi kerak.');
  await store.setPortrait(id,base64);
  await store.updateApplicant(id,derive({...a,hasPortrait:true,portraitHash:await sha256(base64),confirmation:'',status:a.status==='reading'?'reading':'review'}));
 },
 // Save edits; `confirm` accepts the shown data (including suggestions) for filling.
 'applicant:save':async({id,data,confirm})=>{
  const a=store.applicant(id);if(!a)throw Error('Arizachi topilmadi.');
  if(lockedStatuses.includes(a.status))throw Error('Bu ariza to‘ldirilgan yoki to‘ldirilmoqda. Avval holatini tiklang.');
  let next=derive({...a,data:normalizeData(data??a.data)});
  if(confirm){
   const final=normalizeData(previewData(next)),missing=missingFields(final,next.hasPortrait);
   if(missing.length)throw Error('To‘ldirilmagan: '+missing.join(', '));
   const duplicate=store.get('applicants').find(x=>x.id!==id&&x.data.passportNumber===final.passportNumber&&x.status!=='error');
   if(duplicate)throw Error('Bu pasport ro‘yxatda allaqachon bor: '+displayName(duplicate));
   next=derive({...next,data:final,status:'confirmed',note:'',confirmation:await confirmationFor(final,next.portraitHash)});
  }else if(JSON.stringify(next.data)!==JSON.stringify(a.data)||a.status==='confirmed')next={...next,status:a.status==='reading'?'reading':'review',confirmation:''};
  await store.updateApplicant(id,next);
 },
 'applicants:confirm-all':async()=>{
  let confirmed=0;const skipped=[];
  for(const a of store.get('applicants').filter(x=>x.status==='review')){
   try{await handlers['applicant:save']({id:a.id,confirm:true});confirmed++}catch(error){skipped.push(displayName(a)+': '+error.message)}
  }
  return {confirmed,skipped};
 },
 // Back to "confirmed" to retry from the saved checkpoint, or `fresh` to forget it.
 'applicant:retry':async({id,fresh})=>{
  if(runner.busy())throw Error('Avval jarayonni to‘xtating.');
  const a=store.applicant(id);if(!a)throw Error('Arizachi topilmadi.');
  if(fresh){await store.clearFlow(id);await store.updateApplicant(id,{result:null})}
  await store.updateApplicant(id,{status:a.confirmation?'confirmed':'review',note:''});
 },
 'applicant:remove':async({id})=>{
  const a=store.applicant(id);if(!a)return;
  if(a.status==='running'||(runner.busy()&&store.get('run').group))throw Error('To‘ldirilayotgan arizachini o‘chirib bo‘lmaydi.');
  await store.set('applicants',store.get('applicants').filter(x=>x.id!==id));
  await store.setPortrait(id,null);await store.clearFlow(id);await deleteImages([id]).catch(()=>{});
 },
 'run:start':async({mode,groupName})=>{await runner.start({mode,groupName})},
 'run:stop':async()=>runner.stop(),
 'run:prefs':async({mode,groupName})=>{
  if(runner.busy())return;const run=store.get('run'),next={...run};
  if(mode!==undefined)next.mode=mode==='group'?'group':'individual';
  if(groupName!==undefined&&!run.group)next.groupName=String(groupName).slice(0,40);
  await store.set('run',next);
 },
 'run:reset-group':async()=>{if(runner.busy())throw Error('Avval jarayonni to‘xtating.');await store.set('run',{...store.get('run'),group:null,state:'idle',message:'Guruh holati tozalandi. Yangi guruh yaratiladi.'})},
 'run:clear':async()=>{
  if(runner.busy())throw Error('Avval jarayonni to‘xtating.');
  const ids=store.get('applicants').map(a=>a.id);
  // Only the cleared applicants' images: the operator may already be adding new files.
  // The list empties last, once everything else is gone.
  await deleteImages(ids).catch(()=>{});await store.removePortraits(ids);await store.set('flow',{});await store.set('applicants',[]);
  await store.set('run',{...defaults().run,mode:store.get('run').mode});await store.set('log',[]);
 },
 'trip:apply':async()=>{
  const trip=store.get('settings').tripDefaults;
  await store.mutate('applicants',list=>list.map(a=>lockedStatuses.includes(a.status)?a:derive({...a,data:applyPreparationDefaults(a.data,trip)})));
 },
};

chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
 if(sender.id!==chrome.runtime.id)return;
 if(message?.type==='evisa-hello'){if(sender.tab&&sender.frameId===0)runner.observe(sender.tab.id,message);return}
 const handler=handlers[message?.type];if(!handler)return;
 ready.then(()=>handler(message)).then(result=>sendResponse({ok:true,result}),error=>sendResponse({ok:false,error:error?.message||String(error)}));
 return true;
});
chrome.sidePanel?.setPanelBehavior?.({openPanelOnActionClick:true}).catch(()=>{});
chrome.runtime.onInstalled.addListener(async()=>{
 // Tabs opened before installation get the content script now.
 const tabs=await chrome.tabs.query({url:'https://visa.visitsaudi.com/*'}).catch(()=>[]);
 for(const tab of tabs)chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},files:['src/content/dom-ops.js','src/content/content.js']}).catch(()=>{});
});
