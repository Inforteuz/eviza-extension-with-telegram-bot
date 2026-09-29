import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const serverRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

const int=(value,fallback)=>{const n=Number(String(value??'').replace(/[\s_]/g,''));return Number.isSafeInteger(n)&&n>=0?n:fallback};
const list=value=>String(value||'').split(/[\s,]+/).filter(Boolean);

// Process environment wins over server/.env, so Docker/systemd settings are authoritative.
export function loadConfig(env=process.env,{envFile=path.join(serverRoot,'.env')}={}){
 let file={};try{file=parseEnv(readFileSync(envFile,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
 const get=key=>env[key]??file[key]??'';
 const config={
  telegramToken:get('TELEGRAM_BOT_TOKEN'),
  telegramApiBase:(get('TELEGRAM_API_BASE')||'https://api.telegram.org').replace(/\/+$/,''),
  adminIds:list(get('ADMIN_IDS')).filter(id=>/^\d+$/.test(id)).map(Number),
  openaiKey:get('OPENAI_API_KEY'),
  passportModel:get('PASSPORT_AI_MODEL'),
  geminiKey:get('GEMINI_API_KEY'),
  geminiModel:get('GEMINI_MODEL'),
  geminiThinking:get('GEMINI_THINKING'),
  aiProvider:get('AI_PROVIDER'),
  pythonBin:get('PYTHON_BIN'),
  host:get('HOST')||'0.0.0.0',
  port:int(get('PORT'),8080),
  publicUrl:get('PUBLIC_URL').replace(/\/+$/,''),
  dataDir:path.resolve(serverRoot,get('DATA_DIR')||'data'),
  price:int(get('PRICE_PER_PASSPORT'),5000),
  welcomeBonus:int(get('WELCOME_BONUS'),0),
  paymentProviderToken:get('PAYMENT_PROVIDER_TOKEN'),
  cardNumber:get('CARD_NUMBER'),
  cardHolder:get('CARD_HOLDER'),
  minTopup:int(get('MIN_TOPUP'),20000),
  maxTopup:int(get('MAX_TOPUP'),10000000),
  topupAmounts:list(get('TOPUP_AMOUNTS')||'20000,50000,100000,200000,500000').map(v=>int(v,0)).filter(v=>v>0),
  supportUsername:get('SUPPORT_USERNAME').replace(/^@/,''),
  extensionUrl:get('EXTENSION_URL'),
  dedupeDays:int(get('DEDUPE_DAYS'),30),
 };
 return config;
}

export function assertRunnable(config){
 const problems=[];
 if(!/^\d+:[\w-]{20,}$/.test(config.telegramToken))problems.push('TELEGRAM_BOT_TOKEN');
 if(!config.adminIds.length)problems.push('ADMIN_IDS');
 if(problems.length)throw Error('Sozlanmagan: '+problems.join(', ')+'. server/.env.example faylini qarang.');
}
