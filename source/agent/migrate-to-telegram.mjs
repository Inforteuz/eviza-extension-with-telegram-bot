import {readConfig,saveConfig,panelRequest,agentRoot} from './config.mjs';
import {LocalStore} from './local-store.mjs';
import {botCommands} from './telegram-native.mjs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

// Run with the old worker stopped. One-time transfer preserves original IDs and drafts.
const config=await readConfig();
if(!config.TELEGRAM_BOT_TOKEN||!config.TELEGRAM_OPERATOR_ID)throw Error('Telegram hali ulanmagan.');
const local=new LocalStore(path.join(agentRoot,'data','standalone'));
try{
 let imported=0;
 if(!local.getMeta('panelMigrationComplete')){
  const settings=await panelRequest(config,'settings'),apps=await panelRequest(config,'applications');
  for(const app of apps){
   const files={};for(const kind of ['passport','portrait'])if(app[kind])files[kind]=await panelRequest(config,`applications/${app.id}/file?kind=${kind}`);
   const events=await panelRequest(config,'applications/'+app.id+'/events');
   if(await local.importApplication(app,files,events))imported++;
  }
  // Arrival/departure must be computed for each new application, not frozen at migration.
  local.setMeta('tripDefaults',{...settings.tripDefaults,travelDate:'',departureDate:''});
  local.setMeta('panelMigrationComplete',true);
 }
 const state=new DatabaseSync(path.join(agentRoot,'data','state.sqlite'),{readOnly:true});
 try{for(const app of await local.request('applications')){const value=state.prepare('SELECT value FROM state WHERE key=?').get('draft:'+app.id)?.value;if(value)local.restoreCheckpoint(app.id,JSON.parse(value));}}finally{state.close()}
 async function tg(method,body){const r=await fetch('https://api.telegram.org/bot'+config.TELEGRAM_BOT_TOKEN+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const b=await r.json();if(!r.ok||!b.ok)throw Error('Telegram menyusi saqlanmadi.');return b.result}
 await tg('setMyCommands',{scope:{type:'chat',chat_id:config.TELEGRAM_OPERATOR_ID},commands:botCommands});
 await tg('setChatMenuButton',{chat_id:config.TELEGRAM_OPERATOR_ID,menu_button:{type:'commands'}});
 await saveConfig({RUN_MODE:'telegram',TELEGRAM_MINI_APP_ENABLED:'0',PANEL_URL:'',PANEL_TOKEN:'',OAI_SITES_AUTH_TOKEN:''});
 console.log(JSON.stringify({ok:true,imported,total:(await local.request('applications')).length,mode:'telegram',menu:'commands'}));
}finally{local.close()}
