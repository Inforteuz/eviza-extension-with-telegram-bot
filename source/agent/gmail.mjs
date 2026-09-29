function flatten(p){return (p?.body?.data?Buffer.from(p.body.data,'base64url').toString('utf8'):'')+(p?.parts||[]).map(flatten).join('\n');}
export function extractOtp(message,{sender,after,used=[]}){
 if(used.includes(message.id)||Number(message.internalDate)<after)return null;
 const headers=message.payload?.headers||[];const from=headers.find(h=>h.name.toLowerCase()==='from')?.value||'';
 const actual=(from.match(/<([^>]+)>/)?.[1]||from).trim().toLowerCase();if(actual!==sender.toLowerCase())return null;
 const subject=headers.find(h=>h.name.toLowerCase()==='subject')?.value||'';
 const body=subject+'\n'+flatten(message.payload);const match=body.match(/(?:verification\s*code|one[ -]time\s*(?:password|code)|OTP|code)\s*(?:is|:|\s)*[^\d]{0,30}(\d{4,8})\b/i);return match?.[1]||null;
}
export async function gmailOtp(after,state){
 const e=process.env;if(e.GMAIL_EMAIL&&e.GMAIL_APP_PASSWORD){const {imapOtp}=await import('./gmail-imap.mjs');return imapOtp(after,state,e);}if(!e.GMAIL_CLIENT_ID||!e.GMAIL_CLIENT_SECRET||!e.GMAIL_REFRESH_TOKEN||!e.GMAIL_OTP_SENDER)return null;
 const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:e.GMAIL_CLIENT_ID,client_secret:e.GMAIL_CLIENT_SECRET,refresh_token:e.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});if(!tokenResponse.ok)throw Error('Gmail ulanishini tekshiring');const token=await tokenResponse.json();
 const get=async path=>{const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/'+path,{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Gmail xabarini o‘qib bo‘lmadi');return r.json()};
 const query=`from:${e.GMAIL_OTP_SENDER} after:${Math.floor(after/1000)}`;const list=await get('messages?maxResults=10&q='+encodeURIComponent(query));
 for(const item of list.messages||[]){const m=await get('messages/'+encodeURIComponent(item.id)+'?format=full');const code=extractOtp(m,{sender:e.GMAIL_OTP_SENDER,after,used:state.usedOtp()});if(code){state.useOtp(item.id);return code;}}
 return null;
}
