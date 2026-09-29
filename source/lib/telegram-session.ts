import {hash,json,runtime} from './server';
import {verifyTelegramInitData,sessionCookie} from './telegram-auth';
export async function createTelegramSession(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'So‘rov manbasi noto‘g‘ri'},403);
 try{
 const b=await req.json() as {botId?:unknown;initData?:unknown};if(typeof b.botId!=='string'||typeof b.initData!=='string')return json({error:'Telegram orqali oching'},401);
 const user=await verifyTelegramInitData(b.initData,b.botId);
 const db=runtime().DB;const match=await db.prepare('SELECT owner FROM settings WHERE telegram_bot_id=? AND telegram_operator_id=?').bind(b.botId,user.id).first<{owner:string}>();
 if(!match)return json({error:'Faqat biriktirilgan operator kira oladi'},403);
 const token=crypto.randomUUID()+crypto.randomUUID();const expires=Date.now()+8*60*60*1000;
 await db.batch([db.prepare('DELETE FROM telegram_sessions WHERE expires_at<?').bind(Date.now()),db.prepare('INSERT INTO telegram_sessions(token_hash,owner,telegram_user_id,expires_at) VALUES(?,?,?,?)').bind(await hash(token),match.owner,user.id,expires)]);
 const response=json({ok:true});response.headers.set('Set-Cookie',sessionCookie+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800');return response;
 }catch(e){if(e instanceof Error&&e.message==='AUTH')return json({error:'Telegram kirishini qayta oching'},401);console.error('Telegram session failed');return json({error:'Kirishni tekshirib bo‘lmadi'},503);}
}
