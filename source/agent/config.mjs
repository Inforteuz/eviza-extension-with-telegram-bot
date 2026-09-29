import {readFile,writeFile,rename,mkdir,chmod} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const agentRoot=path.dirname(fileURLToPath(import.meta.url));
export const configKeys=['RUN_MODE','PANEL_URL','PANEL_TOKEN','OAI_SITES_AUTH_TOKEN','TELEGRAM_BOT_TOKEN','TELEGRAM_OPERATOR_ID','TELEGRAM_MINI_APP_ENABLED','SAUDI_EMAIL','SAUDI_PASSWORD','GMAIL_EMAIL','GMAIL_APP_PASSWORD','GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN','GMAIL_OTP_SENDER','ENABLE_VISA_SUBMISSION','HEADLESS','PYTHON_BIN','BROWSER_CHANNEL'];
configKeys.push('OPENAI_API_KEY','PASSPORT_AI_MODEL','BROWSER_MODE','USERSCRIPT_TOKEN');
const configPath=path.join(agentRoot,'data','config.json');
async function optional(file){try{return await readFile(file,'utf8')}catch(e){if(e.code==='ENOENT')return '';throw e;}}
export async function readConfig({preferSaved=false}={}){
 const dotenv=parseEnv(await optional(path.join(agentRoot,'.env')));const saved=JSON.parse(await optional(configPath)||'{}');
 return Object.fromEntries(configKeys.map(k=>[k,String((preferSaved?saved[k]??process.env[k]:process.env[k]??saved[k])??dotenv[k]??'')]));
}
export async function saveConfig(values){
 const current=await readConfig({preferSaved:true});for(const [key,value] of Object.entries(values)){if(!configKeys.includes(key)||typeof value!=='string'||value.length>12000)throw Error('Sozlama formati noto‘g‘ri');current[key]=value;}
 await mkdir(path.dirname(configPath),{recursive:true,mode:0o700});await chmod(path.dirname(configPath),0o700);
 const temp=configPath+'.'+crypto.randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(current,null,2),{mode:0o600});await rename(temp,configPath);await chmod(configPath,0o600);return current;
}
export function panelOrigin(config){const u=new URL(config.PANEL_URL);if(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname))throw Error('Panel HTTPS manzilda bo‘lishi kerak');return u.origin;}
export async function panelRequest(config,route,method='GET',body){
 const origin=panelOrigin(config);const res=await fetch(new URL('/api/'+route,origin),{method,headers:{Origin:origin,...(config.PANEL_TOKEN?{Authorization:'Bearer '+config.PANEL_TOKEN}:{}),...(config.OAI_SITES_AUTH_TOKEN?{'OAI-Sites-Authorization':'Bearer '+config.OAI_SITES_AUTH_TOKEN}:{}),...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body?body instanceof FormData?body:JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(25000)});
 if(!res.ok)throw Object.assign(Error('Panelga ulanish bajarilmadi: '+res.status),{status:res.status});if(route.includes('/file?'))return Buffer.from(await res.arrayBuffer());return res.json();
}
