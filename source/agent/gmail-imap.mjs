import {extractOtp} from './gmail.mjs';
export async function withGmailImap(config,fn){
 const {ImapFlow}=await import('imapflow');
 const client=new ImapFlow({host:'imap.gmail.com',port:993,secure:true,auth:{user:config.GMAIL_EMAIL,pass:config.GMAIL_APP_PASSWORD.replace(/\s/g,'')},logger:false,disableAutoIdle:true,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
 client.on('error',()=>{});
 try{await client.connect();return await fn(client)}finally{await client.logout().catch(()=>client.close())}
}
export async function imapOtp(after,state,config){
 if(!config.GMAIL_EMAIL||!config.GMAIL_APP_PASSWORD||!config.GMAIL_OTP_SENDER)return null;
 return withGmailImap(config,async client=>{
  const lock=await client.getMailboxLock('INBOX',{readOnly:true});
  try{
   const uids=await client.search({from:config.GMAIL_OTP_SENDER,since:new Date(after),smaller:1048576},{uid:true});
   for(const uid of (uids||[]).slice(-15).reverse()){
    const message=await client.fetchOne(uid,{source:true,internalDate:true},{uid:true});if(!message||+message.internalDate<after)continue;
    const {simpleParser}=await import('mailparser');const parsed=await simpleParser(message.source,{skipHtmlToText:false,skipTextToHtml:true});
    const id='imap:'+config.GMAIL_EMAIL+':'+client.mailbox.uidValidity+':'+uid;
    const data={id,internalDate:String(+message.internalDate),payload:{headers:[{name:'From',value:parsed.from?.text||''},{name:'Subject',value:parsed.subject||''}],body:{data:Buffer.from(parsed.text||'').toString('base64url')}}};
    const code=extractOtp(data,{sender:config.GMAIL_OTP_SENDER,after,used:state.usedOtp()});if(code){state.useOtp(id);return code;}
   }
   return null;
  }finally{lock.release()}
 });
}
export async function checkGmailConnection(config){
 if(config.GMAIL_EMAIL&&config.GMAIL_APP_PASSWORD){await withGmailImap(config,async()=>true);return true;}
 if(!config.GMAIL_CLIENT_ID||!config.GMAIL_CLIENT_SECRET||!config.GMAIL_REFRESH_TOKEN)return false;
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:config.GMAIL_CLIENT_ID,client_secret:config.GMAIL_CLIENT_SECRET,refresh_token:config.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Gmail ulanishi ishlamadi');const t=await r.json();
 const profile=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:'Bearer '+t.access_token},signal:AbortSignal.timeout(15000)});if(!profile.ok)throw Error('Gmail ruxsati ishlamadi');return true;
}
