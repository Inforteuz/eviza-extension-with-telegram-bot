import {Attention} from './errors.js';
export const rateLimitNote='Saudi sayti so‘rovlarni vaqtincha chekladi (1015/429). To‘ldirish to‘xtatildi. Sahifani qayta-qayta yangilamang: biroz kuting, sayt yana ochilgach kengaytmada “Davom etish”ni bosing.';
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
