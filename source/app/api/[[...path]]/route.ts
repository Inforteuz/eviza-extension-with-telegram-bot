import {createTelegramSession} from '@/lib/telegram-session';
import {identity,runtime,json,hash,event,decode} from '@/lib/server';
import {claimSql,expireSql} from '@/lib/queue-sql';
import {dimensions} from '@/lib/image';
import {blankApplicant,cleanApplicant,missingFields,paymentUrl,cleanTripDefaults,tripFields,officialDraftUrl,defaultTripDates} from '@/lib/domain';
export const dynamic='force-dynamic';
async function handle(req:Request){
 try{
 if(new URL(req.url).pathname==='/api/telegram/session'&&req.method==='POST')return createTelegramSession(req);
 const {owner,runner,telegram}=await identity(req);const db=runtime().DB;const bucket=runtime().BUCKET;
 const p=new URL(req.url).pathname.replace(/^\/api\/?/,'').split('/');const method=req.method;const now=Date.now();
 if(p[0]==='settings'&&method==='GET'){
  const row=await db.prepare('SELECT heartbeat,connections,runner_hash,trip_defaults,telegram_bot_id,telegram_bot_username,telegram_operator_id FROM settings WHERE owner=?').bind(owner).first<any>();
  return json({paired:!!row?.runner_hash,online:!!row?.heartbeat&&now-row.heartbeat<90000,connections:row?JSON.parse(row.connections):{},tripDefaults:row?JSON.parse(row.trip_defaults||'{}'):{},telegramApp:row?.telegram_bot_id?{botId:row.telegram_bot_id,botUsername:row.telegram_bot_username,operatorId:row.telegram_operator_id}:null});
 }
 if(p[0]==='telegram'&&p[1]==='register'&&method==='POST'){
  if(runner||telegram)return json({error:'Faqat panel egasi ulashi mumkin'},403);
  const b=await req.json() as any;if(!/^\d{5,20}$/.test(b.botId)||!/^\d{1,20}$/.test(b.operatorId)||!/^\w{5,32}$/.test(b.botUsername))return json({error:'Telegram bot yoki operator ma’lumoti noto‘g‘ri'},400);
  await db.batch([db.prepare('UPDATE settings SET telegram_bot_id=?,telegram_bot_username=?,telegram_operator_id=? WHERE owner=?').bind(b.botId,b.botUsername,b.operatorId,owner),db.prepare('DELETE FROM telegram_sessions WHERE owner=?').bind(owner)]);return json({ok:true});
 }
 if(p[0]==='trip-defaults'&&method==='POST'&&!runner){const b=await req.json() as any;const data=cleanTripDefaults(b.data||{});await db.prepare('INSERT INTO settings(owner,trip_defaults) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET trip_defaults=excluded.trip_defaults').bind(owner,JSON.stringify(data)).run();return json({ok:true});}
 if(p[0]==='pair'&&method==='POST'&&!runner&&!telegram){
  const token=crypto.randomUUID()+crypto.randomUUID();await db.prepare('INSERT INTO settings(owner,runner_hash) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET runner_hash=excluded.runner_hash').bind(owner,await hash(token)).run();return json({token});
 }
 if(p[0]==='heartbeat'&&method==='POST'&&runner){
  const b=await req.json() as any;const connections={telegram:!!b.telegram,gmail:!!b.gmail,visa:!!b.visa};await db.prepare('UPDATE settings SET heartbeat=?,connections=? WHERE owner=?').bind(now,JSON.stringify(connections),owner).run();return json({ok:true});
 }
 if(p[0]==='claim'&&method==='POST'&&runner){
  // A lost browser lease may have transmitted an application; never replay it automatically.
  await db.prepare(expireSql).bind(now,owner,now).run();
  const lease=crypto.randomUUID();const row=await db.prepare(claimSql).bind(lease,now+120000,now,owner,owner).first<any>();return json(row?{...decode(row),lease}:null);
 }
 if(p[0]!=='applications')return json({error:'Topilmadi'},404);
 if(p.length===1&&method==='GET'){const rows=await db.prepare('SELECT * FROM applications WHERE owner=? ORDER BY created_at DESC LIMIT 1000').bind(owner).all<any>();return json(rows.results.map(decode));}
 if(p.length===1&&method==='POST'){
  const b=await req.json() as any;const id=crypto.randomUUID();const data=cleanApplicant(b.data||blankApplicant);const source=runner?'telegram':telegram?'miniapp':'web';const settings=await db.prepare('SELECT trip_defaults FROM settings WHERE owner=?').bind(owner).first<any>();const defaults=JSON.parse(settings?.trip_defaults||'{}');for(const k of tripFields)if(!data[k]&&typeof defaults[k]==='string')data[k]=defaults[k];
  if(!data.travelDate)data.travelDate=defaultTripDates().travelDate;if(!data.departureDate)data.departureDate=defaultTripDates(data.travelDate).departureDate;
  const sourceKey=typeof b.sourceKey==='string'?source+':'+b.sourceKey.slice(0,150):null;
  if(sourceKey){const old=await db.prepare('SELECT * FROM applications WHERE owner=? AND source_key=?').bind(owner,sourceKey).first<any>();if(old)return json(decode(old));}
  await db.prepare('INSERT INTO applications(id,owner,source,source_key,data,status,step,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,owner,source,sourceKey,JSON.stringify(data),'draft','upload',now,now).run();await event(owner,id,'Ariza yaratildi');return json(decode(await db.prepare('SELECT * FROM applications WHERE owner=? AND id=?').bind(owner,id).first()),201);
 }
 const id=p[1];const row=await db.prepare('SELECT * FROM applications WHERE owner=? AND id=?').bind(owner,id).first<any>();if(!row)return json({error:'Ariza topilmadi'},404);
 if(p.length===2&&method==='GET')return json(decode(row));
 if(p[2]==='events'&&method==='GET'){return json((await db.prepare('SELECT message,created_at FROM events WHERE owner=? AND application_id=? ORDER BY created_at DESC LIMIT 100').bind(owner,id).all()).results);}
 if(p[2]==='file'&&method==='GET'){
  const kind=new URL(req.url).searchParams.get('kind');const key=kind==='portrait'?row.portrait_key:row.passport_key;if(!key)return json({error:'Fayl topilmadi'},404);const obj=await bucket.get(key);if(!obj)return json({error:'Fayl topilmadi'},404);return new Response(obj.body,{headers:{'Content-Type':obj.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(p[2]==='lease'&&method==='POST'&&runner){const b=await req.json() as any;const result=await db.prepare("UPDATE applications SET lease_until=? WHERE id=? AND owner=? AND status='running' AND lease=? AND lease_until>?").bind(now+120000,id,owner,b.lease,now).run();return json({ok:result.meta.changes===1},result.meta.changes?200:409);}
 if(p[2]==='checkpoint'&&method==='POST'&&runner){
  if(row.job_type!=='visa')return json({error:'Faqat rasmiy ariza ishi uchun'},409);
  const b=await req.json() as any;if(!officialDraftUrl(b.officialUrl)||!/^\d{10,25}$/.test(String(b.applicationNumber)))return json({error:'Qoralama manzili yoki ariza raqami noto‘g‘ri'},400);
  if(row.official_url&&new URL(row.official_url).pathname.split('/').at(-1)!==new URL(b.officialUrl).pathname.split('/').at(-1))return json({error:'Boshqa qoralamaga almashtirib bo‘lmaydi'},409);
  const r=await db.prepare("UPDATE applications SET official_url=?,application_number=?,step=?,updated_at=?,version=version+1 WHERE id=? AND owner=? AND status='running' AND lease=? AND lease_until>?").bind(b.officialUrl,String(b.applicationNumber),String(b.step||'passport').slice(0,100),Date.now(),id,owner,b.lease,Date.now()).run();return json({ok:!!r.meta.changes},r.meta.changes?200:409);
 }
 if(p[2]==='result'&&method==='POST'&&runner){
  const b=await req.json() as any;if(row.status!=='running'||row.lease!==b.lease||row.lease_until<now)return json({error:'Ariza ijara muddati tugadi'},409);
  const allowed=['draft','needs_input','needs_auth','needs_review','payment_ready','failed'];if(!allowed.includes(b.status))return json({error:'Noto‘g‘ri holat'},400);
  if(b.status==='payment_ready'&&(!paymentUrl(b.paymentUrl)||!b.applicationNumber||!b.paymentEvidence))return json({error:'To‘lov sahifasi dalili kerak'},400);
  const data=b.data?cleanApplicant(b.data):JSON.parse(row.data);const note=typeof b.note==='string'?b.note.slice(0,1000):'';
  const result=await db.prepare('UPDATE applications SET data=?,status=?,step=?,note=?,application_number=COALESCE(?,application_number),payment_url=COALESCE(?,payment_url),lease=NULL,lease_until=NULL,updated_at=?,version=version+1 WHERE id=? AND owner=? AND lease=? AND lease_until>?').bind(JSON.stringify(data),b.status,String(b.step||'review').slice(0,100),note,b.applicationNumber||null,b.status==='payment_ready'?b.paymentUrl:null,now,id,owner,b.lease,now).run();if(!result.meta.changes)return json({error:'Ijara muddati tugadi'},409);await event(owner,id,note||b.status);return json({ok:true});
 }
 if(p[2]==='upload'&&method==='POST'){
  const form=await req.formData();const file=form.get('file');const kind=form.get('kind');if(!(file instanceof File)||!['passport','portrait'].includes(String(kind)))return json({error:'Fayl kerak'},400);
  const leased=runner&&row.status==='running'&&row.job_type==='extract'&&kind==='portrait'&&form.get('lease')===row.lease&&row.lease_until>Date.now();
  if(['running','queued','payment_ready','paid'].includes(row.status)&&!leased)return json({error:'Avval navbatdan chiqaring'},409);
  if(leased&&row.portrait_key)return json({ok:true,keptExisting:true});
  if(file.size>10*1024*1024||file.size===0)return json({error:'Fayl hajmi 10 MB gacha bo‘lsin'},400);
  const bytes=new Uint8Array(await file.arrayBuffer());const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;const png=[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);if(!jpg&&!png)return json({error:'Faqat JPG yoki PNG'},400);
  const dim=dimensions(bytes);if(!dim||dim.width*dim.height>40000000)return json({error:'Rasm o‘lchami yaroqsiz yoki juda katta'},400);if(kind==='portrait'&&(dim.width!==200||dim.height!==200||bytes.length<5000||bytes.length>100000))return json({error:'Portret 200 × 200 va 5–100 KB bo‘lsin'},400);
  const key=owner+'/'+id+'/'+kind+'/'+crypto.randomUUID();await bucket.put(key,bytes,{httpMetadata:{contentType:png?'image/png':'image/jpeg'}});
  const col=kind==='portrait'?'portrait_key':'passport_key';const updated=leased?await db.prepare("UPDATE applications SET portrait_key=?,updated_at=?,version=version+1 WHERE id=? AND owner=? AND status='running' AND job_type='extract' AND lease=? AND lease_until>? AND portrait_key IS NULL").bind(key,now,id,owner,row.lease,Date.now()).run():await db.prepare(`UPDATE applications SET ${col}=?,${kind==='passport'?'portrait_key=NULL,':''}updated_at=?,version=version+1 WHERE id=? AND owner=? AND version=? AND status NOT IN ('running','queued','payment_ready','paid')`).bind(key,now,id,owner,row.version).run();if(!updated.meta.changes){await bucket.delete(key);return json({error:'Ariza o‘zgargan. Qayta oching.'},409);}if(row[col])await bucket.delete(row[col]);if(kind==='passport'&&row.portrait_key)await bucket.delete(row.portrait_key);await event(owner,id,kind==='portrait'?'Portret yuklandi':'Pasport yuklandi');return json({ok:true});
 }
 if(p.length===2&&method==='PATCH'){
  if(['running','queued','payment_ready','paid'].includes(row.status))return json({error:'Bu holatda tahrirlab bo‘lmaydi'},409);
  const b=await req.json() as any;const data=cleanApplicant(b.data);const result=await db.prepare("UPDATE applications SET data=?,status='draft',note='',updated_at=?,version=version+1 WHERE owner=? AND id=? AND version=?").bind(JSON.stringify(data),now,owner,id,b.version).run();if(!result.meta.changes)return json({error:'Ariza yangilangan. Qayta oching.'},409);await event(owner,id,'Ma’lumotlar saqlandi');return json({ok:true});
 }
 if(p[2]==='queue'&&method==='POST'){
  if(!['draft','needs_input','needs_auth','needs_review','failed'].includes(row.status))return json({error:'Ariza navbatda yoki bajarilgan'},409);
  const b=await req.json() as any;const job=b.job==='extract'?'extract':'visa';
  if(job==='extract'&&!row.passport_key)return json({error:'Pasport rasmini yuklang'},400);
  if(job==='visa'){if(runner)return json({error:'Avval mas’ul shaxs panelda ma’lumotlarni tekshirsin'},403);const missing=missingFields(JSON.parse(row.data),!!row.portrait_key);if(missing.length)return json({error:'Yetishmaydi: '+missing.join(', '),missing},400);if(b.confirmed!==true)return json({error:'Ma’lumotlar aniqligini tasdiqlang'},400);}
  const queued=await db.prepare("UPDATE applications SET status='queued',job_type=?,note='',updated_at=?,version=version+1 WHERE id=? AND owner=? AND status=? AND version=?").bind(job,now,id,owner,row.status,row.version).run();if(!queued.meta.changes)return json({error:'Ariza o‘zgargan. Qayta tekshiring.'},409);await event(owner,id,job==='extract'?'Pasportni o‘qish navbatiga qo‘shildi':'Saytda to‘ldirish navbatiga qo‘shildi');return json({ok:true});
 }
 if(p[2]==='pause'&&method==='POST'&&!runner){if(row.status!=='queued')return json({error:'Faqat navbatdagi arizani to‘xtatish mumkin'},409);await db.prepare("UPDATE applications SET status='draft',updated_at=?,version=version+1 WHERE owner=? AND id=? AND status='queued'").bind(now,owner,id).run();return json({ok:true});}
 return json({error:'Amal mavjud emas'},404);
 }catch(e){const message=e instanceof Error?e.message:'';if(message==='AUTH')return json({error:'Tizimga kiring'},401);if(message==='ORIGIN')return json({error:'So‘rov manbasi noto‘g‘ri'},403);console.error('Request failed',e instanceof Error?e.name:'unknown');return json({error:'Xizmat hozir ishlamadi. Ma’lumotlar saqlanmagan bo‘lishi mumkin; qayta tekshiring.'},503);}
}
export const GET=handle;export const POST=handle;export const PATCH=handle;
