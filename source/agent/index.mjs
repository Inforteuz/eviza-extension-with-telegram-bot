import {pauseKey,SaudiRateLimit,assertSaudiNotPaused,assertSaudiPageAvailable,detectSaudiRateLimit,pauseSaudi} from './saudi-rate-limit.mjs';
import {mkdir,chmod,writeFile,unlink,stat} from 'node:fs/promises';
import {unlinkSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readConfig,panelRequest} from './config.mjs';
import {checkGmailConnection} from './gmail-imap.mjs';
import {readPassportAi,defaultPassportModel} from './passport-ai.mjs';
import {cropPassportPortrait} from './portrait.mjs';
import {preparePassport} from './prepare-passport.mjs';
import {Attention} from './visa-errors.mjs';
import {LocalStore} from './local-store.mjs';
import {TelegramNative,botCommands} from './telegram-native.mjs';
import {SaudiBrowserSession,closedBrowserError} from './saudi-browser.mjs';
import {visaDiagnostics} from './visa-diagnostics.mjs';
import {UserscriptBridge} from './userscript-bridge.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));process.chdir(root);
Object.assign(process.env,await readConfig());const e=process.env;const standalone=e.RUN_MODE==='telegram';
if(standalone&&(!e.TELEGRAM_BOT_TOKEN||!/^\d+$/.test(e.TELEGRAM_OPERATOR_ID)))throw Error('Telegram bot va operatorni sozlang.');
if(!standalone&&(!e.PANEL_URL||!e.PANEL_TOKEN))throw Error('PANEL_URL va PANEL_TOKEN sozlang. agent/.env.example ga qarang.');
const origin=standalone?null:new URL(e.PANEL_URL);if(origin&&origin.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(origin.hostname))throw Error('HTTPS panel manzili kerak');
await mkdir('data',{recursive:true,mode:0o700});await chmod('data',0o700);
const db=new DatabaseSync('data/state.sqlite');db.exec('CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE IF NOT EXISTS otp(id TEXT PRIMARY KEY);');await chmod('data/state.sqlite',0o600);
const state={get:k=>db.prepare('SELECT value FROM state WHERE key=?').get(k)?.value,set:(k,v)=>db.prepare('INSERT INTO state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,String(v)),usedOtp:()=>db.prepare('SELECT id FROM otp').all().map(r=>r.id),useOtp:id=>db.prepare('INSERT OR IGNORE INTO otp VALUES(?)').run(id)};
const local=standalone?new LocalStore(path.join(root,'data','standalone'),{cleanupDeleted:({id})=>{
 db.prepare('DELETE FROM state WHERE key LIKE ?').run('%:'+id);
 for(const suffix of ['.diagnostic.json','.jpg'])try{unlinkSync(path.join(root,'data',id+suffix))}catch(e){if(e.code!=='ENOENT')throw e}
}}):null;
if(standalone&&e.EVISA_SETUP_PARENT!=='1'){e.EVISA_SETUP_SETTINGS_ONLY='1';await import('./setup.mjs');}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let alive=true,telegramOk=false,gmailOk=false;
checkGmailConnection(e).then(ok=>gmailOk=ok&&!!e.GMAIL_OTP_SENDER).catch(()=>{gmailOk=false});
const saudiBrowser=new SaudiBrowserSession({launch:async()=>{const {chromium}=await import('playwright');return chromium.launchPersistentContext(path.join(root,'data','saudi-profile'),{...(e.BROWSER_CHANNEL?{channel:e.BROWSER_CHANNEL}:{}),headless:e.HEADLESS==='1',viewport:{width:1280,height:900}})}});
const scriptBrowser=standalone?await new UserscriptBridge({config:()=>readConfig({preferSaved:true})}).start():null;
async function openBrowser(){
 assertSaudiNotPaused(local);
 try{
  const c=await readConfig({preferSaved:true});let page;
  if(c.BROWSER_MODE==='userscript'){if(!scriptBrowser)throw new Attention('needs_auth','Skript rejimi Telegram bajaruvchisida ishlaydi.','login');page=await scriptBrowser.open();}
  else page=await saudiBrowser.open();
  await assertSaudiPageAvailable(page);return page;
 }catch(error){
  if(error instanceof SaudiRateLimit){if(local)pauseSaudi(local,error.rateLimit);throw error;}
  if(error instanceof Attention)throw error;
  throw new Attention('needs_auth','Saudi oynasi ochilmadi. Internet aloqasini tekshirib, /saudi buyrug‘ini qayta yuboring.','login');
 }
}
process.on('message',message=>{if(message?.action==='open-browser')openBrowser().catch(()=>{console.error('Saudi brauzeri ochilmadi.');});});
process.on('SIGINT',()=>{alive=false});process.on('SIGTERM',()=>{alive=false});
async function panel(route,method='GET',body){return local?local.request(route,method,body):panelRequest(e,route,method,body);}
async function tg(method,body){const form=body instanceof FormData;const r=await fetch('https://api.telegram.org/bot'+e.TELEGRAM_BOT_TOKEN+'/'+method,{method:'POST',headers:form?{}:{'Content-Type':'application/json'},body:form?body:JSON.stringify(body),signal:AbortSignal.timeout(35000)});const d=await r.json();if(!r.ok||!d.ok)throw Error('Telegram so‘rovi bajarilmadi');return d.result;}
const miniAppUrl=origin?origin.origin+'/telegram':null;
async function notify(text){if(native)return native.say(text);if(e.TELEGRAM_BOT_TOKEN&&e.TELEGRAM_OPERATOR_ID)await tg('sendMessage',{chat_id:e.TELEGRAM_OPERATOR_ID,text,...(e.TELEGRAM_MINI_APP_ENABLED==='1'?{reply_markup:{inline_keyboard:[[{text:'Ilovani ochish',web_app:{url:miniAppUrl}}]]}}:{})});}
const native=local?new TelegramNative({store:local,operatorId:e.TELEGRAM_OPERATOR_ID,call:tg,openSaudi:openBrowser,aiStatus:async()=>{const c=await readConfig({preferSaved:true});return {configured:!!c.OPENAI_API_KEY,model:c.PASSPORT_AI_MODEL||defaultPassportModel}},submissionEnabled:e.ENABLE_VISA_SUBMISSION==='1',download:async fileId=>{
 const file=await tg('getFile',{file_id:fileId});if(!/^[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+$/.test(file.file_path)||file.file_path.includes('..')||file.file_path.startsWith('/'))throw Error('Fayl manzili noto‘g‘ri.');
 const r=await fetch('https://api.telegram.org/file/bot'+e.TELEGRAM_BOT_TOKEN+'/'+file.file_path,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Telegram fayli yuklanmadi.');
 const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>10*1024*1024)throw Error('Rasm 10 MB dan kichik bo‘lsin.');chunks.push(chunk)}return Buffer.concat(chunks);
},sendImage:async(bytes,caption,{replyTo}={})=>{const form=new FormData();form.set('chat_id',e.TELEGRAM_OPERATOR_ID);form.set('photo',new Blob([bytes],{type:'image/jpeg'}),'portrait.jpg');form.set('caption',caption);form.set('protect_content','true');if(replyTo)form.set('reply_parameters',JSON.stringify({message_id:replyTo,allow_sending_without_reply:true}));return tg('sendPhoto',form)}}):null;
async function telegram(){
 if(!e.TELEGRAM_BOT_TOKEN||!/^\d+$/.test(e.TELEGRAM_OPERATOR_ID||''))return;
 if(native)await tg('setMyCommands',{scope:{type:'chat',chat_id:e.TELEGRAM_OPERATOR_ID},commands:botCommands}).catch(()=>console.error('Telegram buyruqlar menyusi yangilanmadi; buyruqlarni yozib ishlatish mumkin.'));
 while(alive){try{const updates=await tg('getUpdates',{offset:Number(state.get('telegram_offset')||0),timeout:20,allowed_updates:native?['message','callback_query']:['message']});telegramOk=true;for(const update of updates){if(native){await native.handle(update);state.set('telegram_offset',update.update_id+1);continue}try{const m=update.message;
 if(m&&m.chat.type==='private'&&String(m.from?.id)===e.TELEGRAM_OPERATOR_ID&&String(m.chat.id)===e.TELEGRAM_OPERATOR_ID){
  const doc=m.document||m.photo?.at(-1);if(doc){if(doc.file_size>10*1024*1024){await notify('Rasm 10 MB dan kichik bo‘lsin.')}else{
   const app=await panel('applications','POST',{sourceKey:'telegram:'+update.update_id,data:{}});
   if(app.status==='draft'&&!app.passport){const file=await tg('getFile',{file_id:doc.file_id});const res=await fetch('https://api.telegram.org/file/bot'+e.TELEGRAM_BOT_TOKEN+'/'+file.file_path,{signal:AbortSignal.timeout(30000)});if(!res.ok)throw Error('Telegram fayli yuklanmadi');const bytes=await res.arrayBuffer();if(bytes.byteLength>10*1024*1024)throw Error('Fayl katta');const form=new FormData();form.set('file',new Blob([bytes]),'passport.jpg');form.set('kind','passport');await panel('applications/'+app.id+'/upload','POST',form);}
   if(app.status==='draft')await panel('applications/'+app.id+'/queue','POST',{job:'extract'});
   await notify('Pasport qabul qilindi. Ariza: '+app.id.slice(0,8)+'\nMa’lumotlarni panelda tekshiring: '+origin.origin);
  }}else if(m.text?.startsWith('/app')){await notify(e.TELEGRAM_MINI_APP_ENABLED==='1'?'Arizalarni quyidagi tugma orqali boshqaring.':'Mini App ulanishi hali yakunlanmoqda. Pasportni shu chatga yuborishingiz mumkin.');}else if(m.text?.startsWith('/status')){const apps=await panel('applications');const pending=apps.filter(x=>x.status==='queued').length;const ready=apps.filter(x=>x.status==='payment_ready').length;await notify(`Navbatda: ${pending}\nTo‘lovga tayyor: ${ready}\n${origin.origin}`);}else await notify('Pasportning tiniq JPG yoki PNG rasmini yuboring. /status — navbat holati. Qo‘shimcha ma’lumotlar va portret: '+origin.origin);
 }
 }catch(err){if(![400,404,409].includes(err.status))throw err;await notify('Fayl yoki ariza ma’lumotlari qabul qilinmadi. Panelda tekshiring: '+origin.origin);}
 state.set('telegram_offset',update.update_id+1);}
 }catch{telegramOk=false;console.error('Telegram ulanishida xatolik; qayta tekshiriladi.');await sleep(10000);}}
}
async function runJob(job){let leaseLost=false,visaPage;const resource=(job.entity==='group'?'groups/':'applications/')+job.id;const heartbeat=setInterval(()=>panel(resource+'/lease','POST',{lease:job.lease}).catch(()=>{leaseLost=true}),30000);const temp=path.join(root,'data',job.id+'.jpg'),groupTemps=[];
 try{
 if(job.entity==='group'){
  if(e.ENABLE_VISA_SUBMISSION!=='1')throw new Attention('needs_review','Saudi avtomatik to‘ldirish o‘chiq.','group');
  const page=visaPage=await openBrowser();
  const {prepareGroup}=await import('./group-visa.mjs?version='+(await stat(path.join(root,'group-visa.mjs'))).mtimeMs);
  const result=await prepareGroup(page,job,state,{
   progress:async p=>{if(leaseLost)throw Error('lease');await panel(resource+'/progress','POST',{lease:job.lease,...p});await notify('Guruh '+job.name+': '+p.note)},
   checkpoint:async checkpoint=>{if(leaseLost)throw Error('lease');await panel(resource+'/checkpoint','POST',{lease:job.lease,checkpoint})},
   portraitFor:async member=>{if(leaseLost)throw Error('lease');if(!job.members.some(m=>m.id===member.id))throw Error('Guruh a’zosi mos kelmadi.');const bytes=await panel('applications/'+member.id+'/file?kind=portrait');const sharp=(await import('sharp')).default;const meta=await sharp(bytes).metadata();if(meta.width!==200||meta.height!==200||bytes.length<5000||bytes.length>100000)throw new Attention('needs_input','Arizachi portreti 200 × 200 va 5–100 KB bo‘lsin.','personal');const file=path.join(root,'data',job.id+'-'+member.id+'.jpg');await writeFile(file,bytes,{mode:0o600});groupTemps.push(file);return file},
  });
  if(result){if(leaseLost)throw Error('lease');await panel(resource+'/result','POST',{lease:job.lease,...result})}
 }else if(['extract','portrait'].includes(job.job_type)){
  const image=await panel('applications/'+job.id+'/file?kind=passport');
  const result=await preparePassport(job,image,{
   tripDefaults:(await panel('settings')).tripDefaults,
   readPassport:async bytes=>readPassportAi(bytes,await readConfig({preferSaved:true})),
   cropPortrait:async bytes=>cropPassportPortrait(bytes),
   savePortrait:async portrait=>{if(leaseLost)throw Error('Portret saqlanmadi: bajarish muddati tugadi.');const form=new FormData();form.set('file',new Blob([portrait],{type:'image/jpeg'}),'portrait.jpg');form.set('kind','portrait');form.set('lease',job.lease);await panel('applications/'+job.id+'/upload','POST',form)},
  });
  if(leaseLost)throw Error('lease');await panel('applications/'+job.id+'/result','POST',{lease:job.lease,...result});
 }else{
  if(e.ENABLE_VISA_SUBMISSION!=='1')throw new Attention('needs_review','Sayt adapteri hali to‘liq sinovdan o‘tmagan. Ishga tushirish sozlamasi o‘chiq.');
  const page=visaPage=await openBrowser();
  await notify('Ariza '+job.id.slice(0,8)+': bot Saudi saytida to‘ldirishni boshladi. Natija shu chatga keladi.');
  const bytes=await panel('applications/'+job.id+'/file?kind=portrait');const sharp=(await import('sharp')).default;const meta=await sharp(bytes).metadata();if(meta.width!==200||meta.height!==200||bytes.length<5000||bytes.length>100000)throw new Attention('needs_input','Portret 200 × 200 va 5–100 KB bo‘lishi kerak.');
  // Load a released adapter once per job, so site fixes do not close a signed-in
  // browser. An in-progress application keeps the version it started with.
  const {prepareVisa}=await import('./visa.mjs?version='+(await stat(path.join(root,'visa.mjs'))).mtimeMs);
  await writeFile(temp,bytes,{mode:0o600});if(leaseLost)throw Error('lease');const result=await prepareVisa(page,job,temp,state,async progress=>{if(leaseLost)throw Error('lease');await panel('applications/'+job.id+'/checkpoint','POST',{lease:job.lease,...progress});await notify('Ariza '+job.id.slice(0,8)+': '+(progress.step==='passport'?'shaxsiy ma’lumotlar va portret saqlandi. Pasport va safar ma’lumotlari kiritilmoqda.':'bosqich saqlandi — '+progress.step));},async progress=>{if(leaseLost)throw Error('lease');await panel('applications/'+job.id+'/progress','POST',{lease:job.lease,...progress});await notify('Ariza '+job.id.slice(0,8)+': '+progress.note);});
  if(result){if(leaseLost)throw Error('lease');await panel('applications/'+job.id+'/result','POST',{lease:job.lease,...result});}
 }
 if(native){if(job.entity==='group')await native.showGroup(job.id);else if(['extract','portrait'].includes(job.job_type))await native.reviewNext();else await native.show(job.id);}else await notify('Ariza yangilandi: '+job.id.slice(0,8)+'\n'+origin.origin);
 }catch(err){let limit=err instanceof SaudiRateLimit?err.rateLimit:null;if(visaPage)try{const report=await visaDiagnostics(visaPage,job.data);if(report){limit=limit||detectSaudiRateLimit(report.text);await writeFile(path.join(root,'data',job.id+'.diagnostic.json'),JSON.stringify({...report,error:String(err.message).slice(0,1800),at:new Date().toISOString()},null,2),{mode:0o600});}}catch{}
  if(limit){if(local)pauseSaudi(local,limit);err=new SaudiRateLimit(limit);}
  if(!leaseLost){if(closedBrowserError(err))err=new Attention('needs_auth','Saudi oynasi yopilgan. /saudi orqali qayta oching; saqlangan qoralamani tekshirib davom eting.','login');const attention=err instanceof Attention;await panel(resource+'/result','POST',{lease:job.lease,status:attention?err.status:'needs_review',step:attention?err.step:'review',note:attention?err.message:'Bajarish to‘xtadi. Takrorlashdan oldin arizani tekshiring.'}).catch(()=>{});if(native)await (job.entity==='group'?native.showGroup(job.id):['extract','portrait'].includes(job.job_type)?native.reviewNext():native.show(job.id)).catch(()=>{});else await notify('Arizaga e’tibor kerak: '+job.id.slice(0,8)+'\n'+origin.origin).catch(()=>{});}}
 finally{clearInterval(heartbeat);await unlink(temp).catch(()=>{});for(const file of groupTemps)await unlink(file).catch(()=>{});}
}
const telegramTask=telegram();
while(alive){try{
 const browserConfig=await readConfig({preferSaved:true});const visa=!local?.getMeta(pauseKey)&&(browserConfig.BROWSER_MODE==='userscript'?scriptBrowser?.signedIn():saudiBrowser.signedIn());await panel('heartbeat','POST',{telegram:telegramOk,gmail:gmailOk,visa});
 const job=await panel('claim','POST',{});if(job)await runJob(job);await native?.reviewNext().catch(()=>{});if(!job)await sleep(5000);
}catch{console.error(native?'Mahalliy ariza navbatida xatolik.':'Panelga ulanish bajarilmadi. Kalit va tarmoqni tekshiring.');await sleep(10000);}}
await telegramTask;await saudiBrowser.close();await scriptBrowser?.close();local?.close();db.close();
// Release the setup parent's IPC channel after graceful shutdown.
if(process.connected)process.disconnect();
