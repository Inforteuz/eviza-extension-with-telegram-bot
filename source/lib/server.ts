import {env} from 'cloudflare:workers';
import {readSessionCookie} from './telegram-auth';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export const runtime=()=>env as unknown as {DB:D1Database;BUCKET:R2Bucket};
export async function hash(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function identity(req:Request){
 const db=runtime().DB;if(!db)throw Error('STORAGE');
 const bearer=req.headers.get('authorization');
 if(bearer?.startsWith('Bearer ')){const match=await db.prepare('SELECT owner FROM settings WHERE runner_hash = ?').bind(await hash(bearer.slice(7))).first<{owner:string}>();if(!match)throw Error('AUTH');return {owner:match.owner,runner:true};}
 const session=readSessionCookie(req);if(session){const match=await db.prepare('SELECT s.owner FROM telegram_sessions s JOIN settings t ON t.owner=s.owner AND t.telegram_operator_id=s.telegram_user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await hash(session),Date.now()).first<{owner:string}>();if(match){if(!['GET','HEAD'].includes(req.method)&&req.headers.get('origin')!==new URL(req.url).origin)throw Error('ORIGIN');return {owner:match.owner,runner:false,telegram:true};}}
 const user=await getChatGPTUser();if(!user||!await db.prepare('SELECT owner FROM settings WHERE owner=?').bind(user.userId).first())throw Error('AUTH');
 if(!['GET','HEAD'].includes(req.method)){const origin=req.headers.get('origin');if(!origin||origin!==new URL(req.url).origin)throw Error('ORIGIN');}
 return {owner:user.userId,runner:false};
}
export function json(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
export async function event(owner:string,id:string,message:string){await runtime().DB.prepare('INSERT INTO events(id,owner,application_id,message,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),owner,id,message,Date.now()).run()}
export function decode(row:any){return {...row,data:JSON.parse(row.data),passport:!!row.passport_key,portrait:!!row.portrait_key,passport_key:undefined,portrait_key:undefined,lease:undefined};}
