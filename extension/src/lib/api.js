export class ApiError extends Error {constructor(status,message,data={}){super(message);this.status=status;this.data=data}}

export function normalizeServerUrl(value){
 let u;try{u=new URL(String(value||'').trim())}catch{throw new ApiError(0,'Server manzili noto‘g‘ri. Masalan: https://evisa.example.uz')}
 const local=['localhost','127.0.0.1'].includes(u.hostname);
 if(u.protocol!=='https:'&&!(local&&u.protocol==='http:'))throw new ApiError(0,'Server manzili https:// bilan boshlanishi kerak.');
 if(u.username||u.password||u.search||u.hash)throw new ApiError(0,'Server manzili noto‘g‘ri.');
 return u.origin+u.pathname.replace(/\/+$/,'');
}

export async function apiRequest(serverUrl,path,{method='GET',token,body,contentType,timeout=30000,fetchImpl=fetch}={}){
 const headers={};
 if(token)headers.Authorization='Bearer '+token;
 if(body!==undefined)headers['Content-Type']=contentType||'application/json';
 let response;
 try{response=await fetchImpl(normalizeServerUrl(serverUrl)+path,{method,headers,body:body===undefined?undefined:contentType?body:JSON.stringify(body),signal:AbortSignal.timeout(timeout),credentials:'omit',cache:'no-store'})}
 catch(error){throw new ApiError(0,error?.name==='TimeoutError'?'Server javobi kechikdi. Qayta urinib ko‘ring.':'Serverga ulanib bo‘lmadi. Internet va server manzilini tekshiring.')}
 let data={};try{data=await response.json()}catch{/* empty or non-JSON body */}
 if(!response.ok)throw new ApiError(response.status,data.error||`Server xatosi (${response.status}).`,data);
 return {status:response.status,data};
}
