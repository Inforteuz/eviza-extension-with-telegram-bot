import {prepareVisa} from '../flow/visa.js';
import {prepareGroup} from '../flow/group-visa.js';
import {Attention} from '../flow/errors.js';
import {SaudiRateLimit} from '../flow/rate-limit.js';
import {TabSession,ORIGIN,allowedScriptUrl} from './page.js';
import {readyToRun,displayName} from './applicants.js';

const activeStates=['running','stopping'];

// Drives one Saudi tab at a time. Individual applicants run in list order;
// a group adds every ready applicant with "Save & Add Applicant". Nothing here
// ever clicks the payment button: the flows stop on the Review page.
export class Runner {
 constructor({store,api,chromeApi=globalThis.chrome,notify=async()=>{},account}){
  Object.assign(this,{store,api,chrome:chromeApi,notify,account});this.session=null;this.stopRequested=false;this.keepAlive=null;
 }
 get run(){return this.store.get('run')}
 busy(){return activeStates.includes(this.run.state)}
 async setRun(patch){await this.store.set('run',{...this.run,...patch});await this.overlay()}
 async overlay(){
  const run=this.run;if(!run.tabId)return;
  const text=run.message||'';
  await this.chrome.tabs.sendMessage(run.tabId,{type:'evisa-status',status:{visible:run.state!=='idle'||!!text,running:this.busy(),text}},{frameId:0}).catch(()=>{});
 }
 observe(tabId,hello){this.session?.observe(tabId,hello)}

 // After a service worker restart an in-memory run is gone: say so, never auto-replay.
 async recover(){
  if(!this.busy())return;
  await this.store.mutate('applicants',list=>{for(const a of list)if(a.status==='running')a.status='confirmed'});
  await this.setRun({state:'attention',message:'Jarayon uzildi (kengaytma qayta yuklandi). Sahifadagi qoralamani tekshirib “Davom etish”ni bosing.'});
 }
 async stop(){if(!this.busy())return;this.stopRequested=true;await this.setRun({state:'stopping',message:'To‘xtatilmoqda…'})}

 async findTab(){
  const saved=this.run.tabId;
  if(saved){const tab=await this.chrome.tabs.get(saved).catch(()=>null);if(tab?.url?.startsWith(ORIGIN+'/'))return tab}
  const [active]=await this.chrome.tabs.query({active:true,lastFocusedWindow:true});
  if(active?.url?.startsWith(ORIGIN+'/'))return active;
  const [any]=await this.chrome.tabs.query({url:ORIGIN+'/*'});
  if(any)return any;
  return this.chrome.tabs.create({url:ORIGIN+'/Visa/Index',active:true});
 }

 async eligible(){
  const out=[];for(const a of this.store.get('applicants'))if(a.status==='confirmed'&&await readyToRun(a))out.push(a);return out;
 }

 async start({mode,groupName}){
  if(this.busy())throw Error('Jarayon allaqachon ishlayapti.');
  mode=mode==='group'?'group':'individual';groupName=String(groupName||'').trim();
  const existingGroup=this.run.group;
  if(mode==='group'&&!groupName&&!existingGroup)throw Error('Guruh nomini kiriting.');
  if(mode==='group'&&groupName&&!/^[\p{L}\p{N} ._-]{2,40}$/u.test(groupName))throw Error('Guruh nomi 2–40 ta harf/raqamdan iborat bo‘lsin.');
  const ready=await this.eligible();
  if(!ready.length)throw Error('To‘ldirishga tayyor (tasdiqlangan) arizachi yo‘q.');
  await this.account();
  await this.activate(ready);
  const tab=await this.findTab();
  this.stopRequested=false;
  await this.setRun({state:'running',mode,groupName:mode==='group'?(existingGroup?.name||groupName):'',tabId:tab.id,currentId:null,message:'Boshlanmoqda…',progress:{done:0,total:ready.length}});
  if(tab.url&&!allowedScriptUrl(tab.url))await this.chrome.tabs.update(tab.id,{url:ORIGIN+'/Visa/Index'});
  const flow=this.store.flowState();
  this.session=new TabSession({tabId:tab.id,api:this.chrome,isStopped:()=>this.stopRequested,beforeCommand:()=>flow.flush()});
  this.keepAlive=setInterval(()=>this.chrome.runtime.getPlatformInfo?.().catch(()=>{}),20000);
  await this.store.log(mode==='group'?`Guruh “${this.run.groupName}”: ${ready.length} kishi.`:`Individual: ${ready.length} ta ariza.`);
  // The panel waits only for the start; the run continues in the background.
  this.task=(async()=>{
   // Bind to the current document first so a resumed draft sees its real URL.
   try{await this.session.ensurePeer()}catch(error){await this.fail(error,null);return}
   await (mode==='group'?this.runGroup(flow):this.runIndividual(flow));
  })().catch(error=>this.fail(error,null)).finally(async()=>{clearInterval(this.keepAlive);this.session=null;this.task=null;await this.overlay()});
 }

 // Every applicant is paid once on the server before any form is touched.
 async activate(applicants){
  const pending=applicants.filter(a=>!a.activated);if(!pending.length)return;
  const response=await this.api.activate(pending.map(a=>({applicantId:a.id,passportNumber:a.data.passportNumber})));
  await this.store.mutate('applicants',list=>{for(const r of response.results||[]){const a=list.find(x=>x.id===r.applicantId);if(a&&r.activated)a.activated=true}});
  const failed=(response.results||[]).filter(r=>!r.activated);
  if(failed.length)throw Error('Ayrim arizachilar faollashtirilmadi: '+failed.map(r=>r.error).join('; '));
 }

 async runIndividual(flow){
  const page=this.session.page;let done=0;
  for(const candidate of await this.eligible()){
   const a=this.store.applicant(candidate.id);if(!a||a.status!=='confirmed')continue;
   const portrait=await this.store.portrait(a.id);
   await this.store.updateApplicant(a.id,{status:'running'});
   await this.setRun({currentId:a.id,message:`${displayName(a)}: to‘ldirilmoqda…`});
   const job={id:a.id,data:a.data,official_url:a.result?.officialUrl||'',application_number:a.result?.applicationNumber||''};
   try{
    const result=await prepareVisa(page,job,portrait,flow,
     async progress=>{await this.store.updateApplicant(a.id,x=>({result:{...(x.result||{}),...progress}}))},
     async progress=>{await this.setRun({message:`${displayName(a)}: ${progress.note}`});await this.store.log(`${displayName(a)}: ${progress.note}`)});
    await flow.flush();
    await this.store.updateApplicant(a.id,x=>({status:'payment_ready',result:{...(x.result||{}),...result,readyAt:Date.now()}}));
    done++;await this.setRun({progress:{...this.run.progress,done}});
    await this.store.log(`✅ ${displayName(a)}: to‘lovga tayyor (ariza ${result.applicationNumber}, ${result.paymentEvidence?.totalSAR||'?'} SAR).`);
    this.notify({id:'ready:'+a.id,type:'payment_ready',mode:'individual',count:1,totalSAR:result.paymentEvidence?.totalSAR||'',names:[displayName(a)]}).catch(()=>{});
    const more=(await this.eligible()).length>0;
    if(more&&this.store.get('settings').pauseAfterEach){
     await this.setRun({state:'waiting',currentId:a.id,message:`${displayName(a)} to‘lovga tayyor. To‘lovni bajaring, so‘ng “Davom etish”ni bosing.`});
     return;
    }
   }catch(error){await this.fail(error,a);return}
  }
  await this.setRun({state:'done',currentId:null,message:done?`Tayyor: ${done} ta ariza to‘lov sahifasigacha yetdi. To‘lovni o‘zingiz bajaring.`:'Bajariladigan ariza qolmadi.'});
 }

 async runGroup(flow){
  const page=this.session.page;
  let group=this.run.group;
  if(!group){group={id:crypto.randomUUID(),name:this.run.groupName,checkpoint:{}};await this.setRun({group})}
  // Members: every confirmed applicant, in list order. Saved members keep their place.
  const members=(await this.eligible()).map(a=>({id:a.id,data:a.data,group_confirmation:a.confirmation}));
  const ids=members.map(m=>m.id);
  await this.store.mutate('applicants',list=>{for(const a of list)if(ids.includes(a.id))a.status='running'});
  try{
   const result=await prepareGroup(page,{id:group.id,name:group.name,job_type:'group',members,checkpoint:structuredClone(group.checkpoint||{})},flow,{
    progress:async p=>{await this.setRun({message:p.note});await this.store.log(p.note)},
    checkpoint:async cp=>{
     const done=Object.values(cp.members||{}).filter(m=>m.phase==='complete').length;
     await this.setRun({group:{...this.run.group,checkpoint:structuredClone(cp)},progress:{done,total:members.length}});
    },
    portraitFor:async member=>{const b64=await this.store.portrait(member.id);if(!b64)throw new Attention('needs_input','Portret topilmadi: '+member.data.firstName,'personal');return b64},
   });
   await flow.flush();await this.store.clearFlow(group.id);
   const cp=this.run.group.checkpoint||{};
   await this.store.mutate('applicants',list=>{for(const a of list)if(ids.includes(a.id)){a.status='payment_ready';a.result={...(a.result||{}),groupName:group.name,applicationNumber:cp.members?.[a.id]?.applicationNumber||'',paymentUrl:result.paymentUrl,totalSAR:result.paymentEvidence.totalSAR,readyAt:Date.now()}}});
   await this.setRun({state:'done',group:null,lastGroup:{name:group.name,count:members.length,totalSAR:result.paymentEvidence.totalSAR},progress:{done:members.length,total:members.length},message:`✅ Guruh “${group.name}”: ${members.length} kishi to‘lovga tayyor. Jami ${result.paymentEvidence.totalSAR} SAR. To‘lovni o‘zingiz bajaring.`});
   await this.store.log(this.run.message);
   this.notify({id:'ready:'+group.id,type:'payment_ready',mode:'group',groupName:group.name,count:members.length,totalSAR:result.paymentEvidence.totalSAR,names:members.map(m=>[m.data.firstName,m.data.lastName].join(' '))}).catch(()=>{});
  }catch(error){
   await this.store.mutate('applicants',list=>{for(const a of list)if(ids.includes(a.id)&&a.status==='running')a.status='confirmed'});
   await this.fail(error,null);
  }
 }

 async fail(error,applicant){
  const name=applicant?displayName(applicant)+': ':'';
  let message=error?.message||'Kutilmagan xato.',applicantStatus='confirmed';
  if(error?.stopped){await this.setRun({state:'idle',message:'To‘xtatildi.'});if(applicant)await this.store.updateApplicant(applicant.id,{status:'confirmed'});await this.store.log(name+'to‘xtatildi.','warn');return}
  if(error instanceof SaudiRateLimit){const until=error.rateLimit?.notBefore?' Sayt kutish muddati: '+new Date(error.rateLimit.notBefore).toLocaleString('uz-UZ',{timeZone:'Asia/Tashkent'})+'.':'';message+=until}
  else if(error instanceof Attention){if(['needs_review','needs_input'].includes(error.status))applicantStatus=error.status}
  else{message='Kutilmagan xato: '+message;applicantStatus='needs_review'}
  if(applicant)await this.store.updateApplicant(applicant.id,{status:applicantStatus,note:message});
  await this.setRun({state:'attention',message:name+message});
  await this.store.log(name+message,'error');
 }
}
