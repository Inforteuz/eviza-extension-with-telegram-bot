import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {agentRoot,readConfig,saveConfig,panelRequest} from './config.mjs';
import {checkGmailConnection} from './gmail-imap.mjs';
import {LocalStore} from './local-store.mjs';
import {checkPassportAi,defaultPassportModel,PassportAiError} from './passport-ai.mjs';
const port=47831,origin=`http://127.0.0.1:${port}`,csrf=randomBytes(32).toString('hex');let worker=null,stopping=false;
const settingsOnly=process.argv.includes('--settings-only')||process.env.EVISA_SETUP_SETTINGS_ONLY==='1';
const allowed=['TELEGRAM_BOT_TOKEN','TELEGRAM_OPERATOR_ID','GMAIL_EMAIL','GMAIL_APP_PASSWORD','GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN','GMAIL_OTP_SENDER'];
allowed.push('OPENAI_API_KEY','PASSPORT_AI_MODEL');
let telegramPair;
async function telegramCall(token,method,body={}){const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok||!d.ok)throw Error('Telegram ulanishi ishlamadi');return d.result;}
function start(){if(worker||settingsOnly)return;worker=spawn(process.execPath,[path.join(agentRoot,'index.mjs')],{cwd:agentRoot,stdio:['ignore','inherit','inherit','ipc'],env:{...process.env,EVISA_SETUP_PARENT:'1'}});worker.on('exit',()=>{worker=null;stopping=false});}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
const server=http.createServer(async(req,res)=>{try{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
 if(req.headers.host!==`127.0.0.1:${port}`)return send(res,403,{error:'Manba noto‘g‘ri'});
 const route=new URL(req.url,origin).pathname;
 if(req.method==='GET'&&route==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end((await readFile(path.join(agentRoot,'setup.html'),'utf8')).replace('__CSRF__',csrf));}
 if(req.method==='GET'&&route==='/evisa-operator.user.js'){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'});return res.end(await readFile(path.join(agentRoot,'evisa-operator.user.js'),'utf8'));}
 if(req.method==='GET'&&route==='/status'){
  const c=await readConfig({preferSaved:true});let panel;try{if(c.RUN_MODE==='telegram'){const local=new LocalStore(path.join(agentRoot,'data','standalone'));try{panel=await local.request('settings')}finally{local.close()}}else panel=await panelRequest(c,'settings')}catch{}
  return send(res,200,{running:settingsOnly?!!panel?.online:!!worker,settingsOnly,stopping,mode:c.RUN_MODE||'panel',browserMode:c.BROWSER_MODE||'playwright',panelConnected:!!panel,panelUrl:c.RUN_MODE==='telegram'?'https://t.me/Evisaa_bot':c.PANEL_URL,connections:panel?.connections||{},aiModel:c.PASSPORT_AI_MODEL||defaultPassportModel,configured:Object.fromEntries(allowed.map(k=>[k,!!c[k]]))});
 }
 if(req.method!=='POST')return send(res,404,{error:'Topilmadi'});
 if(req.headers.origin!==origin||req.headers['x-csrf-token']!==csrf)return send(res,403,{error:'Oynani qayta oching'});
 let body='';for await(const chunk of req){body+=chunk;if(body.length>30000)return send(res,413,{error:'So‘rov katta'})}const data=JSON.parse(body||'{}');
 if(route==='/script-enable'||route==='/script-disable'){
  const c=await readConfig({preferSaved:true});if(c.RUN_MODE!=='telegram')return send(res,400,{error:'Skript uchun Telegram rejimini ishga tushiring.'});
  const store=new LocalStore(path.join(agentRoot,'data','standalone'));let busy;try{busy=store.db.prepare("SELECT id FROM applications WHERE status='running' UNION ALL SELECT id FROM visa_groups WHERE status='running' LIMIT 1").get()}finally{store.close()}
  if(busy)return send(res,409,{error:'Joriy ariza tugashini kuting. Ish paytida brauzer rejimi almashtirilmaydi.'});
  const enable=route==='/script-enable',token=enable?(c.USERSCRIPT_TOKEN||randomBytes(32).toString('hex')):'';
  await saveConfig({BROWSER_MODE:enable?'userscript':'playwright',USERSCRIPT_TOKEN:token});
  return send(res,200,{message:enable?'Skript rejimi yoqildi. Ulash kodini eVisa sahifasidagi skriptga kiriting.':'Avvalgi brauzer rejimi yoqildi.',...(enable?{pairingCode:token}:{})});
 }
 if(route==='/ai-save'){
  const current=await readConfig({preferSaved:true}),key=String(data.OPENAI_API_KEY||'').trim(),model=String(data.PASSPORT_AI_MODEL||current.PASSPORT_AI_MODEL||defaultPassportModel).trim();
  if(!/^[a-zA-Z0-9._-]{1,100}$/.test(model)||key.length>1000)return send(res,400,{error:'AI sozlamasi noto‘g‘ri.'});
  const values={OPENAI_API_KEY:key||current.OPENAI_API_KEY,PASSPORT_AI_MODEL:model};
  await checkPassportAi(values);await saveConfig(values);return send(res,200,{message:'AI kaliti saqlandi va modelga kirish tekshirildi. Telegramda “AI’da qayta o‘qish”ni bosing. Botni qayta ishga tushirish shart emas.'});
 }
 if(route==='/ai-check'){const r=await checkPassportAi(await readConfig({preferSaved:true}));return send(res,200,{message:'AI kaliti ishladi. Model: '+r.model+'. Pasportni o‘qish hali alohida sinovdan o‘tadi.'})}
 if(settingsOnly)return send(res,409,{error:'Bot mustaqil xizmatda ishlayapti. Bu oynada AI’ni ulang; Saudi kirish uchun Telegramda /saudi buyrug‘ini yuboring.'});
 if(route==='/save'){
  if(worker)return send(res,409,{error:'Avval bajaruvchini to‘xtating, tugashini kuting va saqlang.'});
  const values={};for(const [key,value] of Object.entries(data)){if(!allowed.includes(key)||typeof value!=='string')return send(res,400,{error:'Sozlama noto‘g‘ri'});if(value.trim())values[key]=value.trim();}
  if(values.TELEGRAM_OPERATOR_ID&&!/^\d{1,20}$/.test(values.TELEGRAM_OPERATOR_ID))return send(res,400,{error:'Telegram ID faqat raqamlardan iborat bo‘lsin.'});
  if(values.GMAIL_EMAIL&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.GMAIL_EMAIL))return send(res,400,{error:'Gmail manzili noto‘g‘ri.'});
  if(values.GMAIL_APP_PASSWORD){values.GMAIL_APP_PASSWORD=values.GMAIL_APP_PASSWORD.replace(/\s/g,'');if(!/^[A-Za-z0-9]{16}$/.test(values.GMAIL_APP_PASSWORD))return send(res,400,{error:'Google ilova paroli 16 belgidan iborat bo‘lishi kerak.'});}
  if(values.TELEGRAM_BOT_TOKEN){const r=await fetch('https://api.telegram.org/bot'+values.TELEGRAM_BOT_TOKEN+'/getMe',{signal:AbortSignal.timeout(15000)});const x=await r.json();if(!r.ok||!x.ok)return send(res,400,{error:'Telegram bot tokeni ishlamadi.'});}
  const current=await readConfig({preferSaved:true});if(values.TELEGRAM_BOT_TOKEN&&values.TELEGRAM_BOT_TOKEN!==current.TELEGRAM_BOT_TOKEN){telegramPair=null;if(!values.TELEGRAM_OPERATOR_ID)values.TELEGRAM_OPERATOR_ID='';}
  await saveConfig(values);return send(res,200,{message:'Sozlamalar Kompyuterda saqlandi. Bajaruvchini ishga tushiring.'});
 }
 if(route==='/gmail-check'){const ok=await checkGmailConnection(await readConfig({preferSaved:true}));return send(res,ok?200:400,ok?{message:'Gmail ulanishi ishladi. Kod jo‘natuvchi emaili ham kiritilgan bo‘lsin.'}:{error:'Avval Gmail sozlamalarini saqlang.'});}
 if(route==='/telegram-link'){
  if(worker)return send(res,409,{error:'Avval bajaruvchini to‘xtating.'});
  const c=await readConfig({preferSaved:true});if(!c.TELEGRAM_BOT_TOKEN)return send(res,400,{error:'Avval bot tokenini saqlang.'});
  const bot=await telegramCall(c.TELEGRAM_BOT_TOKEN,'getMe');const webhook=await telegramCall(c.TELEGRAM_BOT_TOKEN,'getWebhookInfo');if(webhook.url)return send(res,409,{error:'Bu bot boshqa xizmatga ulangan. eVisa uchun alohida bot yarating.'});
  telegramPair={nonce:randomBytes(24).toString('base64url'),expires:Date.now()+600000,token:c.TELEGRAM_BOT_TOKEN};
  return send(res,200,{message:'Havolani ochib Telegram’da Start bosing, so‘ng “Ulanganini tekshirish”ni bosing.',url:'https://t.me/'+bot.username+'?start='+telegramPair.nonce});
 }
 if(route==='/telegram-check'){
  if(worker)return send(res,409,{error:'Avval bajaruvchini to‘xtating.'});
  if(!telegramPair||telegramPair.expires<Date.now())return send(res,400,{error:'Avval “Telegram orqali ulash”ni bosing.'});
  const updates=await telegramCall(telegramPair.token,'getUpdates',{timeout:0,limit:100,allowed_updates:['message']});
  const match=updates.find(u=>u.message?.text==='/start '+telegramPair.nonce&&u.message.chat.type==='private'&&u.message.from?.id===u.message.chat.id);
  if(!match)return send(res,400,{error:'Telegram’da havolani ochib Start bosing, keyin qayta tekshiring.'});
  await saveConfig({TELEGRAM_OPERATOR_ID:String(match.message.from.id)});telegramPair=null;return send(res,200,{message:'Telegram operatori ulandi. Endi bajaruvchini ishga tushiring.'});
 }
 if(route==='/start'){start();return send(res,200,{message:'Bajaruvchi ishga tushmoqda.'});}
 if(route==='/stop'){if(worker){stopping=true;worker.kill('SIGTERM')}return send(res,200,{message:'Joriy ish tugagach to‘xtaydi.'});}
 if(route==='/browser'){start();worker.send({action:'open-browser'});return send(res,200,{message:'Saudi akkaunti uchun Edge oynasi ochilmoqda. Bir marta kirishingiz kerak.'});}
 return send(res,404,{error:'Topilmadi'});
}catch(error){return send(res,503,{error:error instanceof PassportAiError?error.message:'Ulanish bajarilmadi. Sozlamalar va tarmoqni tekshiring.'})}});
server.on('error',error=>{if(error.code!=='EADDRINUSE')console.error('Sozlama oynasi ochilmadi.');});
server.listen(port,'127.0.0.1',()=>{console.log('Mahalliy sozlamalar: '+origin);start()});
process.on('SIGINT',()=>{worker?.kill('SIGTERM');server.close()});process.on('SIGTERM',()=>{worker?.kill('SIGTERM');server.close()});
