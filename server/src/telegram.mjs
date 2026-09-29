const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export class TelegramError extends Error {constructor(method,status,description){super(`Telegram ${method}: ${description||status}`);this.status=status;this.description=description||''}}

// Minimal Bot API client. The token never appears in errors or logs.
export function telegramClient(token,{fetchImpl=fetch,base='https://api.telegram.org'}={}){
 return async function call(method,body={},{timeout=35000,retries=2}={}){
  for(let attempt=0;;attempt++){
   const form=body instanceof FormData;
   let response,data;
   try{
    response=await fetchImpl(`${base}/bot${token}/${method}`,{method:'POST',headers:form?{}:{'Content-Type':'application/json'},body:form?body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
    data=await response.json();
   }catch{
    if(attempt<retries){await sleep(1000*(attempt+1));continue}
    throw new TelegramError(method,0,'network');
   }
   if(data.ok)return data.result;
   const retryAfter=data.parameters?.retry_after;
   if(response.status===429&&retryAfter&&attempt<retries){await sleep(Math.min(retryAfter,30)*1000);continue}
   throw new TelegramError(method,response.status,data.description);
  }
 };
}
