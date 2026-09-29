import http from 'node:http';
import path from 'node:path';
import {loadConfig,assertRunnable} from './config.mjs';
import {openDatabase,getSetting,setSetting} from './db.mjs';
import {Billing} from './billing.mjs';
import {Auth} from './auth.mjs';
import {Bot,userCommands,adminCommands} from './bot.mjs';
import {createApi} from './api.mjs';
import {telegramClient} from './telegram.mjs';

const config=loadConfig();assertRunnable(config);
if(!config.openaiKey)console.warn('OPENAI_API_KEY berilmagan: pasport matni o‘qilmaydi, faqat portret kesiladi.');
const db=openDatabase(path.join(config.dataDir,'evisa.sqlite'));
const billing=new Billing(db,{price:config.price,welcomeBonus:config.welcomeBonus,dedupeDays:config.dedupeDays});
const auth=new Auth(db);
const call=telegramClient(config.telegramToken,{base:config.telegramApiBase});
const me=await call('getMe');
const bot=new Bot({billing,auth,call,config,botUsername:me.username});
const api=createApi({billing,auth,bot,config,botUsername:me.username});

await call('setMyCommands',{commands:userCommands}).catch(e=>console.warn('Buyruqlar menyusi yangilanmadi:',e.message));
for(const admin of config.adminIds)await call('setMyCommands',{commands:[...userCommands,...adminCommands],scope:{type:'chat',chat_id:admin}}).catch(()=>console.warn('Admin menyusi yangilanmadi (admin botga /start yozmagan bo‘lishi mumkin):',admin));

billing.releaseStaleHolds(0);
const holdTimer=setInterval(()=>billing.releaseStaleHolds(),5*60000);holdTimer.unref();

const server=http.createServer((req,res)=>api(req,res));
server.requestTimeout=120000;
await new Promise(ok=>server.listen(config.port,config.host,ok));
console.log(`eVisa server: http://${config.host}:${config.port} · bot @${me.username}`);

let alive=true;
const stop=()=>{alive=false;server.close();};
process.on('SIGINT',stop);process.on('SIGTERM',stop);

// Long polling in the same process; the offset survives restarts.
while(alive){
 try{
  const updates=await call('getUpdates',{offset:getSetting(db,'telegram_offset',0),timeout:25,allowed_updates:['message','callback_query','pre_checkout_query']},{timeout:40000,retries:0});
  // At-least-once: handlers are idempotent and bot.handle never throws.
  for(const update of updates){await bot.handle(update);setSetting(db,'telegram_offset',update.update_id+1)}
 }catch(error){
  if(!alive)break;
  if(error.status===409)console.error('Shu bot tokeni bilan boshqa nusxa ishlayapti yoki webhook yoqilgan. Uni to‘xtating.');
  else console.error('Telegram ulanishida xatolik:',error.message);
  await new Promise(r=>setTimeout(r,5000));
 }
}
db.close();
