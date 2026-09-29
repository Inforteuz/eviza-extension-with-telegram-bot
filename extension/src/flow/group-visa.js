import {Attention,waitForLogin,fillPersonal,fillPassport,fillInsurance,fillTerms,activeVisaMessage,verifyApplicantReview} from './visa.js';
import {assertGroupName,addMemberControl,verifyGroupPayment} from './group-review.js';
const ORIGIN='https://visa.visitsaudi.com';

export async function observeGroup(page){
 const at=new URL(page.url());if(at.origin!==ORIGIN||/^\/Login/i.test(at.pathname))throw new Attention('needs_auth','Shu oynada Saudi akkauntiga kirishni yakunlang.','login');
 const report=page.snapshot?await page.snapshot():await page.evaluate(()=>{
  const visible=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  return {text:document.body.innerText.slice(0,40000),controls:Array.from(document.querySelectorAll('input,select,textarea,button,a')).filter(e=>visible(e)&&!['hidden','password'].includes(e.type)).map(e=>({tag:e.tagName.toLowerCase(),id:e.id,type:e.type||'',label:Array.from(e.labels||[]).map(l=>l.innerText.trim()).join(' ')||e.getAttribute('aria-label')||e.getAttribute('placeholder')||'',text:/^(BUTTON|A)$/.test(e.tagName)?e.innerText.trim():'',href:e.tagName==='A'&&e.getAttribute('href')?.startsWith('/')?e.getAttribute('href'):undefined,...(e.tagName==='SELECT'?{options:Array.from(e.options).map(o=>({value:o.value,label:o.text}))}:{})}))};
 });return {...report,url:at.href};
}

export async function prepareGroup(page,group,state,{progress,checkpoint,portraitFor}){
 await waitForLogin(page,state,progress);
 await progress({step:'group',note:'Saudi Group arizasi to‘ldirilmoqda.'});
 const cp={...group.checkpoint};
 if(cp.entryUrl){
  if(new URL(cp.entryUrl).origin!==ORIGIN)throw new Attention('needs_review','Guruhning rasmiy manzili noto‘g‘ri.','group');
  const resume=cp.currentUrl||cp.entryUrl;if(new URL(resume).origin!==ORIGIN)throw new Attention('needs_review','Guruhning saqlangan bosqichi noto‘g‘ri.','group');
  await page.goto(resume,{waitUntil:'domcontentloaded'});
 }else{
  if(cp.phase==='creating')throw new Attention('needs_review','Guruh yaratish avval boshlangan. Takror guruh ochishdan oldin Saudi kabinetini tekshiring.','group');
  state.set('group-report:'+group.id,JSON.stringify(await observeGroup(page)));
  const button=page.locator('#btnApplyGroupVisa');
  if(!await button.isVisible())throw new Attention('needs_review','Saudi kabinetida Apply For Group tugmasi topilmadi.','group');
  await button.click();const field=page.locator('#txtGroupName');await field.fill('');await field.pressSequentially(group.name);
  if(await field.inputValue()!==group.name)throw new Attention('needs_review','Guruh nomi saytga saqlanmadi.','group');
  await checkpoint({...cp,phase:'creating',name:group.name});
  const before=page.url();await page.locator('#btnCreateGroup').click();try{await page.waitForURL(url=>url.href!==before,{timeout:15000,waitUntil:'domcontentloaded'})}catch{}
  if(page.url()!==before){cp.entryUrl=page.url();cp.phase='collect';cp.name=group.name;cp.members={};await checkpoint(cp)}
 }
 if(group.job_type==='group_probe'||!group.members.length){const report=await observeGroup(page);state.set('group-report:'+group.id,JSON.stringify(report));throw new Attention('needs_input','“'+group.name+'” guruhi ochildi. Pasport ma’lumotlarini tasdiqlab guruhni boshlang.','group');}
 cp.members||={};
 for(let i=0;i<group.members.length;i++){
  const member=group.members[i],saved=cp.members[member.id]||{};
  if(saved.confirmation&&saved.confirmation!==member.group_confirmation)throw new Attention('needs_review','Rasmiy arizachi boshlanganidan keyin ma’lumotlari o‘zgargan.','group');
  if(saved.phase==='complete')continue;
  if(saved.phase==='saving_personal'&&!saved.applicationNumber)throw new Attention('needs_review','Oldingi arizachi saqlanishi boshlangan. Dublikat yaratishdan oldin Saudi guruhini tekshiring.','personal');
  if(saved.currentUrl){
   if(new URL(saved.currentUrl).origin!==ORIGIN)throw new Attention('needs_review','Arizachi manzili noto‘g‘ri.','group');
   await page.goto(saved.currentUrl,{waitUntil:'domcontentloaded'});
  }else if(i>0){
   const report=await observeGroup(page);state.set('group-report:'+group.id,JSON.stringify(report));assertGroupName(report.text,group.name);
   const previous=cp.members[group.members[i-1].id];
   if(previous?.phase!=='complete'||new URL(page.url()).pathname!==('/Visa/Review/'+previous.visaId)||report.text.match(/Application No\.:\s*(\d+)/)?.[1]!==previous.applicationNumber||Number(report.text.match(/Total Applicants\s*:\s*(\d+)/i)?.[1])!==i)throw new Attention('needs_review','Keyingi odamni qo‘shishdan oldin saqlangan arizachi va guruh soni tekshirilsin.','group');
   if(cp.adding===member.id)throw new Attention('needs_review','Keyingi odamni qo‘shish avval bosilgan. Dublikat yaratishdan oldin guruhni tekshiring.','group');
   const control=addMemberControl(report);cp.adding=member.id;await checkpoint(cp);
   await progress({step:'group',note:`${i}/${group.members.length} tayyor. Save & Add Applicant orqali ${i+1}-odamga o‘tilmoqda.`});
   const locator=/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(control.id||'')?page.locator('#'+control.id):page.getByRole(control.tag==='a'?'link':'button',{name:control.text,exact:true});
   if(await locator.count()!==1)throw new Attention('needs_review','Arizachi qo‘shish tugmasi bir nechta.','group');
   const before=page.url();await locator.click();try{await page.waitForURL(u=>u.href!==before,{timeout:15000,waitUntil:'domcontentloaded'})}catch{}
   const next=await observeGroup(page);state.set('group-report:'+group.id,JSON.stringify(next));assertGroupName(next.text,group.name);
   if(!new URL(page.url()).pathname.startsWith('/Visa/PersonalInfo'))throw new Attention('needs_review','Keyingi arizachining shaxsiy formasi ochilmadi.','group');
   Object.assign(saved,{currentUrl:page.url(),phase:'personal'});cp.members[member.id]=saved;cp.currentUrl=page.url();delete cp.adding;await checkpoint(cp);
  }
  await progress({step:'personal',note:`${i+1}/${group.members.length}: ${member.data.firstName} ma’lumotlari kiritilmoqda.`});
  if(new URL(page.url()).pathname.startsWith('/Visa/PersonalInfo')){
   assertGroupName(await page.locator('body').innerText(),group.name);
   await fillPersonal(page,member.data,await portraitFor(member));
   Object.assign(saved,{phase:'saving_personal',currentUrl:page.url(),confirmation:member.group_confirmation});cp.members[member.id]=saved;await checkpoint(cp);
   await page.getByRole('button',{name:'Next',exact:true}).click();
   try{await page.waitForURL('**/Visa/PassportInfo/*',{timeout:15000,waitUntil:'domcontentloaded'})}catch{state.set('group-report:'+group.id,JSON.stringify(await observeGroup(page)));throw new Attention('needs_review','Guruh arizachisining shaxsiy sahifasi saqlanmadi.','personal');}
  }
  if(new URL(page.url()).pathname.startsWith('/Visa/PassportInfo/')){
   const text=await page.locator('body').innerText(),number=text.match(/Application No\.:\s*(\d+)/)?.[1];if(!number)throw new Attention('needs_review','Guruh arizachisining rasmiy raqami o‘qilmadi.','passport');
   const visaId=new URL(page.url()).pathname.split('/').at(-1);if(!/^[a-f0-9-]{36}$/i.test(visaId)||saved.visaId&&saved.visaId!==visaId)throw new Attention('needs_review','Guruhdagi rasmiy arizachi raqami mos kelmadi.','passport');
   Object.assign(saved,{phase:'passport',currentUrl:page.url(),applicationNumber:number,visaId});cp.currentUrl=page.url();cp.members[member.id]=saved;await checkpoint(cp);
   await fillPassport(page,member.data);const before=page.url();await page.getByRole('button',{name:'Next',exact:true}).click();
   try{await page.waitForURL(url=>url.href!==before,{timeout:15000,waitUntil:'domcontentloaded'})}catch{}
   const blocking=activeVisaMessage(await page.locator('body').innerText());if(blocking)throw new Attention('needs_review',member.data.firstName+': '+blocking,'passport');
   if(page.url()===before){state.set('group-report:'+group.id,JSON.stringify(await observeGroup(page)));throw new Attention('needs_review','Guruhdagi pasport formasi keyingi bosqichga o‘tmadi.','passport');}
   Object.assign(saved,{phase:'insurance',currentUrl:page.url()});cp.currentUrl=page.url();await checkpoint(cp);
  }
  const sameApplicant=()=>{const u=new URL(page.url());if(u.origin!==ORIGIN||u.pathname.split('/').at(-1)!==saved.visaId)throw new Attention('needs_review','Keyingi bosqich boshqa rasmiy arizachiga tegishli.','group');};
  sameApplicant();
  if(new URL(page.url()).pathname.startsWith('/Insurance/ChooseInsurance/')){await fillInsurance(page);sameApplicant();Object.assign(saved,{phase:'terms',currentUrl:page.url()});cp.currentUrl=page.url();await checkpoint(cp);}
  if(await page.getByRole('checkbox',{name:/^I HAVE READ AND AGREE ALL THE ABOVE TERMS AND CONDITIONS\.?$/i}).isVisible()){await fillTerms(page);sameApplicant();Object.assign(saved,{phase:'review',currentUrl:page.url()});cp.currentUrl=page.url();await checkpoint(cp);}
  const report=await observeGroup(page);state.set('group-report:'+group.id,JSON.stringify(report));assertGroupName(report.text,group.name);
  if(!new URL(page.url()).pathname.startsWith('/Visa/Review/'))throw new Attention('needs_review','Guruh arizachisining yakuniy sahifasi tekshirilsin.','review');
  saved.proof=verifyApplicantReview(report.text,member.data,saved.applicationNumber);saved.phase='complete';cp.currentUrl=page.url();await checkpoint(cp);
  await progress({step:'review',note:`${i+1}/${group.members.length}: ${member.data.firstName} guruhda saqlandi va tekshirildi.`});
 }
 const report=await observeGroup(page);state.set('group-report:'+group.id,JSON.stringify(report));
 if(!/^\/Visa\/Review\/[0-9a-f-]{36}$/i.test(new URL(page.url()).pathname))throw new Attention('needs_review','Guruh to‘lov sahifasi tekshirilsin.','review');
 const paymentEvidence=verifyGroupPayment(report,group,cp),pay=page.locator('#btnPay');
 if(!await pay.isVisible()||(await pay.innerText()).trim().toUpperCase()!=='AGREE & COMPLETE PAYMENT')throw new Attention('needs_review','Guruh to‘lov tugmasi ko‘rinmadi.','review');
 state.set('group-payment-proof:'+group.id,JSON.stringify(paymentEvidence));
 return {status:'payment_ready',step:'payment',officialUrl:page.url(),paymentUrl:page.url(),applicationNumber:paymentEvidence.applicationNumbers[0],paymentEvidence,note:`${group.members.length} kishi to‘lovga tayyor. Jami ${paymentEvidence.totalSAR} SAR. To‘lovni o‘zingiz bajaring.`};
}
