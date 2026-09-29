import {randomUUID} from 'node:crypto';
import {InsufficientBalance} from './billing.mjs';
import {assertImage,recognizePassport,MAX_IMAGE_BYTES} from './recognize.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class HttpError extends Error {constructor(status,message,extra={}){super(message);this.status=status;this.extra=extra}}
const insufficient=(e,price)=>new HttpError(402,'Balans yetarli emas. Telegram botda balansni to‘ldiring.',{balance:e.balance,price});

// Small in-memory limiter: per key, `limit` hits per `windowMs`.
export class RateLimiter {
 constructor(limit,windowMs){this.limit=limit;this.windowMs=windowMs;this.hits=new Map()}
 take(key){const now=Date.now(),list=(this.hits.get(key)||[]).filter(t=>now-t<this.windowMs);if(list.length>=this.limit){this.hits.set(key,list);return false}list.push(now);this.hits.set(key,list);if(this.hits.size>10000)this.hits.clear();return true}
}

async function readBody(req,limit){
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>limit)throw new HttpError(413,'So‘rov hajmi juda katta.');chunks.push(chunk)}
 return Buffer.concat(chunks);
}
async function readJson(req){const raw=await readBody(req,64*1024);try{return raw.length?JSON.parse(raw.toString('utf8')):{}}catch{throw new HttpError(400,'JSON noto‘g‘ri.')}}

export function createApi({billing,auth,bot,config,botUsername='',recognize=recognizePassport,log=console}){
 const readLimiter=new RateLimiter(40,60000),pairLimiter=new RateLimiter(20,60000),active=new Map();
 const botUrl=payload=>botUsername?`https://t.me/${botUsername}${payload?'?start='+payload:''}`:'';
 const account=user=>({user:{id:user.id,firstName:user.first_name||'',username:user.username||''},balance:billing.user(user.id).balance,price:billing.price(),currency:'UZS',botUsername,topupUrl:botUrl('topup'),dedupeDays:config.dedupeDays});
 const authenticate=req=>{
  const header=String(req.headers.authorization||''),user=auth.verify(header.startsWith('Bearer ')?header.slice(7):'');
  if(!user)throw new HttpError(401,'Kengaytma ulanmagan yoki tokeni bekor qilingan. Qayta ulang.');
  if(user.blocked)throw new HttpError(403,'Hisob bloklangan.');
  return user;
 };
 const afterCharge=async(user,charged,balance)=>{const price=billing.price();if(charged>0&&balance<price&&balance+charged>=price)await bot?.notifyLowBalance(user.id,balance)};

 const routes={
  'GET /health':async()=>({ok:true}),
  'POST /api/ext/pair':async(req)=>{
   if(!pairLimiter.take('pair:'+(req.socket.remoteAddress||'')))throw new HttpError(429,'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.');
   if(!botUsername)throw new HttpError(503,'Bot hali ishga tushmagan.');
   const {code,expiresAt}=auth.createPairing();
   return {code,expiresAt,botUrl:botUrl('pair_'+code)};
  },
  'GET /api/ext/pair/:code':async(req,{code})=>{
   const r=auth.collectPairing(code);
   if(r.status==='expired')throw new HttpError(410,'Ulash muddati tugadi. Qaytadan boshlang.');
   return r;
  },
  'GET /api/ext/me':async req=>account(authenticate(req)),
  'POST /api/ext/logout':async req=>{authenticate(req);auth.revoke(String(req.headers.authorization).slice(7));return {ok:true}},
  'POST /api/ext/passports':async(req,params,url)=>{
   const user=authenticate(req),applicantId=url.searchParams.get('applicantId')||'',portraitOnly=url.searchParams.get('portraitOnly')==='1';
   if(!uuid.test(applicantId))throw new HttpError(400,'applicantId noto‘g‘ri.');
   if(!/^image\//.test(String(req.headers['content-type']||'')))throw new HttpError(415,'Faqat rasm yuboring (JPG/PNG).');
   if(!readLimiter.take('read:'+user.id))throw new HttpError(429,'Bir daqiqada juda ko‘p rasm yuborildi. Birozdan keyin davom eting.');
   if((active.get(user.id)||0)>=3)throw new HttpError(429,'Bir vaqtda 3 tadan ortiq rasm o‘qilmaydi. Navbat tugashini kuting.');
   const bytes=await readBody(req,MAX_IMAGE_BYTES);
   try{await assertImage(bytes)}catch(e){throw new HttpError(e.status||415,e.message)}
   active.set(user.id,(active.get(user.id)||0)+1);
   let hold=null;
   try{
    const needsPayment=!portraitOnly&&!billing.activated(user.id,applicantId),price=billing.price();
    if(needsPayment&&price>0)try{hold=billing.hold(user.id,price,'hold:'+randomUUID())}catch(e){if(e instanceof InsufficientBalance)throw insufficient(e,price);throw e}
    const result=await recognize(bytes,{config,portraitOnly});
    let charged=0,activated=billing.activated(user.id,applicantId);
    if(!portraitOnly){
     const f=billing.finalizeHold(hold,{userId:user.id,applicantId,passportNumber:result.data.passportNumber});hold=null;
     charged=f.charged;activated=f.activated;
     billing.recordRecognition(randomUUID(),user.id,applicantId,!result.aiError);
    }
    const balance=billing.user(user.id).balance;
    await afterCharge(user,charged,balance);
    return {...result,charged,activated,balance,price};
   }finally{
    if(hold)billing.releaseHold(hold);
    active.set(user.id,Math.max(0,(active.get(user.id)||1)-1));
   }
  },
  // Manually typed applicants pay once per passport, the same as AI reads.
  'POST /api/ext/activate':async req=>{
   const user=authenticate(req),body=await readJson(req);
   const items=Array.isArray(body.items)?body.items.slice(0,50):[];
   const results=[];let charged=0;
   for(const item of items){
    if(!uuid.test(String(item?.applicantId||'')))throw new HttpError(400,'applicantId noto‘g‘ri.');
    try{const r=billing.activate(user.id,item.applicantId,String(item.passportNumber||''));charged+=r.charged;results.push({applicantId:item.applicantId,...r})}
    catch(e){
     if(e instanceof InsufficientBalance){const balance=billing.user(user.id).balance;await afterCharge(user,charged,balance);throw insufficient(e,billing.price())}
     results.push({applicantId:item.applicantId,activated:false,error:e.message});
    }
   }
   const balance=billing.user(user.id).balance;await afterCharge(user,charged,balance);
   return {results,charged,balance,price:billing.price()};
  },
  'POST /api/ext/events':async req=>{
   const user=authenticate(req),e=await readJson(req);
   if(e.type!=='payment_ready'||typeof e.id!=='string'||!/^[\w:-]{8,120}$/.test(e.id))throw new HttpError(400,'Hodisa noto‘g‘ri.');
   const count=Math.max(1,Math.min(100,Number(e.count)||1));
   const fresh=billing.recordEvent(user.id,e.id,'payment_ready',count);
   if(fresh)await bot?.notifyReady(user.id,{count,groupName:String(e.groupName||'').slice(0,100),totalSAR:/^[\d,.]{1,20}$/.test(String(e.totalSAR||''))?String(e.totalSAR):'',names:(Array.isArray(e.names)?e.names:[]).map(n=>String(n).slice(0,80))});
   return {ok:true,duplicate:!fresh};
  },
 };
 const table=Object.entries(routes).map(([key,handler])=>{const [method,pattern]=key.split(' ');const names=[];const regex=new RegExp('^'+pattern.replace(/:(\w+)/g,(_,n)=>{names.push(n);return '([\\w-]{1,100})'})+'$');return {method,regex,names,handler}});

 return async function handle(req,res){
  const origin=String(req.headers.origin||''),cors=/^(chrome|moz)-extension:\/\/[a-z0-9-]+$/i.test(origin)||/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)?{'Access-Control-Allow-Origin':origin,Vary:'Origin'}:{};
  const send=(status,data)=>{if(res.headersSent)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...cors});res.end(JSON.stringify(data))};
  try{
   if(req.method==='OPTIONS'){res.writeHead(204,{...cors,'Access-Control-Allow-Methods':'GET,POST','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Max-Age':'600'});return res.end()}
   const url=new URL(req.url,'http://localhost');
   for(const route of table){
    if(route.method!==req.method)continue;const m=url.pathname.match(route.regex);if(!m)continue;
    const params=Object.fromEntries(route.names.map((n,i)=>[n,m[i+1]]));
    const data=await route.handler(req,params,url);
    return send(data?.status==='pending'?202:200,data);
   }
   send(404,{error:'Topilmadi.'});
  }catch(error){
   if(error instanceof HttpError)return send(error.status,{error:error.message,...error.extra});
   log.error?.('API xatosi:',error.message);send(500,{error:'Serverda xatolik. Birozdan keyin qayta urinib ko‘ring.'});
  }
 };
}
