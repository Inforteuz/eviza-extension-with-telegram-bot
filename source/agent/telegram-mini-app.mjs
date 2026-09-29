import {panelRequest,saveConfig} from './config.mjs';
export async function connectMiniApp(config,{allowPrivate=false}={}){
 if(!config.TELEGRAM_BOT_TOKEN||!config.TELEGRAM_OPERATOR_ID)throw Error('Avval Telegram bot va operatorni ulang.');
 const origin=new URL(config.PANEL_URL).origin;if(!origin.startsWith('https://'))throw Error('Mini App uchun HTTPS manzil kerak.');
 const settings=await panelRequest(config,'settings');const app=settings.telegramApp;
 if(!app||app.botId!==config.TELEGRAM_BOT_TOKEN.split(':')[0]||app.operatorId!==config.TELEGRAM_OPERATOR_ID)throw Error('Panelda shu bot va Telegram operatorini ro‘yxatdan o‘tkazing.');
 const url=origin+'/telegram';const publicPage=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});
 let access='telegram';
 if(publicPage.status!==200||!publicPage.headers.get('content-type')?.includes('text/html')){
  if(!allowPrivate||!config.OAI_SITES_AUTH_TOKEN)throw Error('Sayt xususiy. ChatGPT hisobiga kirish bilan ulash uchun --private parametridan foydalaning.');
  const privatePage=await fetch(url,{redirect:'manual',headers:{'OAI-Sites-Authorization':'Bearer '+config.OAI_SITES_AUTH_TOKEN},signal:AbortSignal.timeout(15000)});
  if(privatePage.status!==200||!privatePage.headers.get('content-type')?.includes('text/html'))throw Error('Xususiy Mini App sahifasiga ulanish tekshirilmadi.');
  access='private-login';
 }
 const r=await fetch('https://api.telegram.org/bot'+config.TELEGRAM_BOT_TOKEN+'/setChatMenuButton',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:config.TELEGRAM_OPERATOR_ID,menu_button:{type:'web_app',text:'Ilovani ochish',web_app:{url}}}),signal:AbortSignal.timeout(15000)});
 const result=await r.json();if(!r.ok||!result.ok)throw Error('Telegram menyusini ulab bo‘lmadi.');
 await saveConfig({TELEGRAM_MINI_APP_ENABLED:'1'});return {ok:true,url,access};
}
