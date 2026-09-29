import {randomUUID} from 'node:crypto';
import {Attention} from './visa-errors.mjs';
export const pauseKey='saudi-rate-limit';
export const rateLimitNote='Saudi sayti so‘rovlarni vaqtincha chekladi (1015/429). eVisa ishlari pauzada. Sahifani qayta-qayta yangilamang. Biroz kuting; sayt yana ochilgach /saudi_davom orqali pauzani yeching.';
export class SaudiRateLimit extends Attention {
 constructor(details={}){super('needs_review',rateLimitNote,'review');this.rateLimit=details;}
}
export function detectSaudiRateLimit(text='',status=0,retryAfter='',now=Date.now()){
 const limited=status===429||/\berror\s*1015\b/i.test(text)||/you are being rate limited/i.test(text)||/\b429\b[\s\S]{0,80}too many requests/i.test(text);
 if(!limited)return null;
 let notBefore=null;
 if(String(retryAfter).trim()){
  const seconds=Number(retryAfter),date=Number.isFinite(seconds)&&seconds>=0?now+seconds*1000:Date.parse(retryAfter);
  if(Number.isFinite(date)&&date>now&&date<=8640000000000000)notBefore=date;
 }
 return {code:/1015/.test(text)?1015:429,notBefore,rayId:text.match(/Ray ID:\s*([a-f0-9]{8,32})/i)?.[1]||null};
}
export async function assertSaudiPageAvailable(page,response){
 let url;try{url=new URL(page.url());}catch{return;}
 if(url.origin!=='https://visa.visitsaudi.com')return;
 const status=response?.status?.()||0,headers=response?.headers?.()||{};
 const text=await page.locator('body').innerText();
 const limit=detectSaudiRateLimit(text,status,headers['retry-after']);
 if(limit)throw new SaudiRateLimit(limit);
}
export function assertSaudiNotPaused(store){if(store?.getMeta(pauseKey))throw new SaudiRateLimit(store.getMeta(pauseKey));}
export function pauseSaudi(store,details={}){
 const pause={id:randomUUID(),detectedAt:Date.now(),code:details.code===1015?1015:429,rayId:details.rayId||null,notBefore:details.notBefore||null};
 store.db.exec('BEGIN IMMEDIATE');
 try{
  store.setMeta(pauseKey,pause);
  store.db.prepare("UPDATE applications SET status='needs_review',note=?,version=version+1,updated_at=? WHERE status='queued' AND job_type='visa'").run(rateLimitNote,Date.now());
  store.db.prepare("UPDATE visa_groups SET status='needs_review',note=?,version=version+1,updated_at=? WHERE status='queued'").run(rateLimitNote,Date.now());
  const connections=store.getMeta('connections',{});store.setMeta('connections',{...connections,visa:false});
  store.db.exec('COMMIT');
 }catch(error){store.db.exec('ROLLBACK');throw error;}
 return pause;
}
export function resumeSaudi(store,body){
 const pause=store.getMeta(pauseKey),fail=message=>{throw Object.assign(Error(message),{status:409})};
 if(!pause||body.confirmed!==true||body.pauseId!==pause.id)fail('Pauza holati yangilangan. /saudi_davom orqali qayta oching.');
 if(pause.notBefore&&Date.now()<pause.notBefore)fail('Sayt belgilagan kutish muddati hali tugamadi: '+new Date(pause.notBefore).toLocaleString('uz-UZ',{timeZone:'Asia/Tashkent'}));
 store.setMeta(pauseKey,null);
 return {ok:true}; // Existing jobs stay paused; the operator chooses what to resume.
}
