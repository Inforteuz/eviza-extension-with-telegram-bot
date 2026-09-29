const PUBLIC_KEY='e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d';
const encode=new TextEncoder();
export async function verifyTelegramInitData(raw:string,botId:string,now=Math.floor(Date.now()/1000),publicKey=PUBLIC_KEY){
 if(typeof raw!=='string'||raw.length>16384||!/^\d{5,20}$/.test(botId))throw Error('AUTH');
 const values=new URLSearchParams(raw);const keys=[...values.keys()];if(new Set(keys).size!==keys.length)throw Error('AUTH');
 const date=Number(values.get('auth_date'));if(!Number.isSafeInteger(date)||date>now+30||now-date>600)throw Error('AUTH');
 const signature=values.get('signature')||'';if(!/^[A-Za-z0-9_-]{86}={0,2}$/.test(signature))throw Error('AUTH');
 const bytes=Uint8Array.from(atob(signature.replace(/-/g,'+').replace(/_/g,'/').padEnd(88,'=')),c=>c.charCodeAt(0));
 const fields=[...values.entries()].filter(([k])=>k!=='hash'&&k!=='signature').sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('\n');
 const keyBytes=Uint8Array.from(publicKey.match(/../g)!,s=>parseInt(s,16));const key=await crypto.subtle.importKey('raw',keyBytes,{name:'Ed25519'},false,['verify']);
 if(!await crypto.subtle.verify('Ed25519',key,bytes,encode.encode(botId+':WebAppData\n'+fields)))throw Error('AUTH');
 let user;try{user=JSON.parse(values.get('user')||'null')}catch{throw Error('AUTH')}
 if(!Number.isSafeInteger(user?.id)||user.id<=0||user.is_bot)throw Error('AUTH');
 return {id:String(user.id)};
}
export const sessionCookie='evisa_telegram';
export function readSessionCookie(req:Request){return req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(sessionCookie+'='))?.slice(sessionCookie.length+1)||'';}
