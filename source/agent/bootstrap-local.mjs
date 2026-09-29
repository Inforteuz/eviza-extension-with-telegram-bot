import {readConfig,saveConfig,panelRequest} from './config.mjs';
// Initial owner credential arrives on stdin, never argv or logs.
let input='';for await(const chunk of process.stdin)input+=chunk;const supplied=JSON.parse(input);
const config={...await readConfig(),...supplied};
let status;
try{status=await panelRequest(config,'settings');}catch(e){if(config.PANEL_TOKEN)throw Error('Mavjud panel kaliti ishlamadi; kalitni tekshiring.');throw e;}
if(!config.PANEL_TOKEN){if(status.online)throw Error('Boshqa bajaruvchi ishlayapti; ulash kaliti o‘zgartirilmadi.');const pair=await panelRequest(config,'pair','POST',{});config.PANEL_TOKEN=pair.token;}
await saveConfig(config);
console.log('Panel ulanishi shu Mac uchun saqlandi. Maxfiy kalitlar ekranga chiqarilmadi.');
