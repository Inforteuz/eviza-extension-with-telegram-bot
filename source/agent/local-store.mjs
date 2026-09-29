import {ReviewQueue} from './review-queue.mjs';
import {pauseKey,assertSaudiNotPaused,resumeSaudi} from './saudi-rate-limit.mjs';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {cleanApplicant,cleanTripDefaults,operatorTripTemplate,applyPreparationDefaults,missingFields,officialDraftUrl,paymentUrl} from '../lib/domain.ts';
import {initGroups,groupRequest,groupMemberSignature,assertGroupMutable,touchGroup,groupRow,claimGroup,expireGroupJobs,hasRunningGroup} from './group-store.mjs';
import {initDeletion,deleteApplication,assertNotDeletedSource,prepareClearAll,clearAll} from './delete-store.mjs';
import {passportImageSignature,similarPassportImages} from './passport-image.mjs';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const locked=['queued','running','payment_ready','paid'];
const decode=row=>row?{...row,data:JSON.parse(row.data),passport:!!row.passport_key,portrait:!!row.portrait_key,passport_key:undefined,portrait_key:undefined}:null;

// Private, in-process storage. The Telegram worker never needs an HTTP panel.
export class LocalStore {
 constructor(directory,{cleanupDeleted}={}){
  this.cleanupDeleted=cleanupDeleted;
  this.directory=directory;this.files=path.join(directory,'files');
  mkdirSync(this.files,{recursive:true,mode:0o700});chmodSync(directory,0o700);chmodSync(this.files,0o700);
  this.db=new DatabaseSync(path.join(directory,'applications.sqlite'));
  chmodSync(path.join(directory,'applications.sqlite'),0o600);
  this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=MEMORY;
   CREATE TABLE IF NOT EXISTS applications(id TEXT PRIMARY KEY,source TEXT,source_key TEXT UNIQUE,data TEXT NOT NULL,status TEXT NOT NULL,job_type TEXT DEFAULT 'extract',step TEXT DEFAULT 'upload',note TEXT DEFAULT '',passport_key TEXT,portrait_key TEXT,application_number TEXT,official_url TEXT,payment_url TEXT,lease TEXT,lease_until INTEGER,created_at INTEGER,updated_at INTEGER,version INTEGER DEFAULT 1);
   CREATE INDEX IF NOT EXISTS app_queue ON applications(status,created_at);
   CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,application_id TEXT,message TEXT,created_at INTEGER);
   CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  initGroups(this);
  const columns=this.db.prepare('PRAGMA table_info(applications)').all().map(c=>c.name);
  for(const name of ['passport_sha256','passport_fingerprint','duplicate_of'])if(!columns.includes(name))this.db.exec('ALTER TABLE applications ADD COLUMN '+name+' TEXT');
  this.db.exec('CREATE INDEX IF NOT EXISTS passport_sha ON applications(passport_sha256)');
  this.reviews=new ReviewQueue(this);
  initDeletion(this);
  this.reviews.backfill();
  if(!this.getMeta('operator-template-v1')){
   const defaults=this.getMeta('tripDefaults',{});
   for(const [key,value] of Object.entries(operatorTripTemplate))if(!defaults[key])defaults[key]=value;
   this.setMeta('tripDefaults',cleanTripDefaults(defaults));this.setMeta('operator-template-v1',true);
  }
 }
 close(){this.db.close()}
 getMeta(key,fallback=null){const r=this.db.prepare('SELECT value FROM metadata WHERE key=?').get(key);return r?JSON.parse(r.value):fallback}
 setMeta(key,value){this.db.prepare('INSERT INTO metadata VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value))}
 row(id){const row=this.db.prepare('SELECT * FROM applications WHERE id=?').get(id);if(!row)fail('Ariza topilmadi',404);return row}
 resolve(short){if(!/^[a-f0-9-]{8,36}$/i.test(short))fail('Ariza raqami noto‘g‘ri');const rows=this.db.prepare('SELECT id FROM applications WHERE id LIKE ?').all(short+'%');if(rows.length!==1)fail('Ariza topilmadi yoki raqam noaniq',404);return rows[0].id}
 event(id,message){this.db.prepare('INSERT INTO events(application_id,message,created_at) VALUES(?,?,?)').run(id,String(message).slice(0,1500),Date.now())}
 restoreCheckpoint(id,checkpoint){
  const row=this.row(id);if(!officialDraftUrl(checkpoint?.officialUrl)||!/^\d{10,25}$/.test(String(checkpoint?.applicationNumber)))fail('Saqlangan qoralama yaroqsiz');
  if(row.official_url){if(new URL(row.official_url).pathname.split('/').at(-1)!==new URL(checkpoint.officialUrl).pathname.split('/').at(-1))fail('Qoralama mos kelmadi',409);return false}
  this.changes(this.db.prepare('UPDATE applications SET official_url=?,application_number=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND official_url IS NULL').run(checkpoint.officialUrl,String(checkpoint.applicationNumber),Date.now(),id,row.version));
  this.event(id,'Oldindan saqlangan Saudi qoralamasi ariza kartasiga tiklandi.');return true;
 }
 changes(result){if(!result.changes)fail('Ariza yangilangan. Qayta oching.',409)}
 mutable(row){if(locked.includes(row.status))fail('Avval arizani navbatdan chiqaring.',409);assertGroupMutable(this,row.group_id)}
 leased(row,body){if(row.status!=='running'||row.lease!==body.lease||row.lease_until<=Date.now())fail('Bajarish muddati tugadi. Arizani tekshiring.',409)}
 saveFile(bytes){const key=randomUUID();writeFileSync(path.join(this.files,key),bytes,{mode:0o600});return key}
 removeFile(key){if(key)try{unlinkSync(path.join(this.files,key))}catch{}}
 assertPassportReviewed(row){if(row.duplicate_of)fail('Bu pasport avvalgi arizaga o‘xshaydi. Takroriy arizani tekshiring yoki “Bu boshqa pasport” tugmasini bosing.',409)}
 findDuplicatePassport(signature,excludeId){
  const rows=this.db.prepare('SELECT id,passport_sha256,passport_fingerprint FROM applications WHERE passport_key IS NOT NULL AND id!=? ORDER BY created_at,id').all(excludeId||'');
  const exact=rows.find(r=>r.passport_sha256===signature.sha256);
  return {duplicateOf:exact?.id||rows.find(r=>similarPassportImages(signature.fingerprint,r.passport_fingerprint))?.id||null,exact:!!exact};
 }
 async duplicatePassport(bytes,excludeId){
  const signature=await passportImageSignature(bytes);
  const rows=this.db.prepare('SELECT id,passport_key,passport_sha256,passport_fingerprint FROM applications WHERE passport_key IS NOT NULL AND id!=? ORDER BY created_at,id').all(excludeId||'');
  for(const row of rows){
   let old={sha256:row.passport_sha256,fingerprint:row.passport_fingerprint};
   if(!old.sha256||!old.fingerprint){
    try{old=await passportImageSignature(readFileSync(path.join(this.files,row.passport_key)))}catch{continue}
    this.db.prepare('UPDATE applications SET passport_sha256=?,passport_fingerprint=? WHERE id=? AND passport_key=?').run(old.sha256,old.fingerprint,row.id,row.passport_key);
   }
  }
  return {...signature,...this.findDuplicatePassport(signature,excludeId)};
 }
 async validateFile(bytes,kind){
  if(!bytes.length||bytes.length>10*1024*1024)fail('Rasm 10 MB dan kichik bo‘lsin.');
  let m;try{m=await sharp(bytes,{limitInputPixels:40000000}).metadata()}catch{fail('Yaroqli JPG yoki PNG rasm yuboring.')}
  if(!['jpeg','png'].includes(m.format)||!m.width||!m.height||m.width*m.height>40000000)fail('Faqat JPG yoki PNG, 40 megapikselgacha.');
  if(kind==='portrait'&&(m.width!==200||m.height!==200||bytes.length<5000||bytes.length>100000))fail('Portret 200 × 200 va 5–100 KB bo‘lsin.');
 }
 async importApplication(app,files={},events=[]){
  if(!/^[a-f0-9-]{36}$/i.test(app.id))fail('Import ariza raqami noto‘g‘ri');
  if(this.db.prepare('SELECT id FROM applications WHERE id=?').get(app.id))return false;
  for(const kind of ['passport','portrait'])if(files[kind])await this.validateFile(files[kind],kind);
  if(app.official_url&&!officialDraftUrl(app.official_url))fail('Qoralama havolasi noto‘g‘ri');
  if(app.payment_url&&!paymentUrl(app.payment_url))fail('To‘lov havolasi noto‘g‘ri');
  const status=['running','queued'].includes(app.status)?'needs_review':app.status;
  const passport=files.passport?this.saveFile(files.passport):null,portrait=files.portrait?this.saveFile(files.portrait):null;
  this.db.prepare('INSERT INTO applications(id,source,source_key,data,status,job_type,step,note,passport_key,portrait_key,application_number,official_url,payment_url,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(app.id,app.source||'import',app.source_key||null,JSON.stringify(cleanApplicant(app.data)),status,app.job_type||'extract',app.step||'review',app.note||'',passport,portrait,app.application_number||null,app.official_url||null,app.payment_url||null,app.created_at||Date.now(),Date.now(),Number(app.version)||1);
  for(const e of events)this.db.prepare('INSERT INTO events(application_id,message,created_at) VALUES(?,?,?)').run(app.id,String(e.message).slice(0,1500),Number(e.created_at)||Date.now());
  this.event(app.id,'Ariza Telegram botning kompyuter xotirasiga ko‘chirildi.');return true;
 }
 async request(route,method='GET',body={},actor='worker'){
  const url=new URL(route,'http://local/');const p=url.pathname.slice(1).split('/'),now=Date.now();
  const operator=()=>{if(actor!=='operator')fail('Mas’ul shaxs tasdig‘i kerak.',403)};
  const worker=()=>{if(actor!=='worker')fail('Bajaruvchiga tegishli amal.',403)};
  if(route==='clear-all/preview'&&method==='POST'){operator();return prepareClearAll(this)}
  if(route==='clear-all/confirm'&&method==='POST'){operator();return clearAll(this,body)}
  if(p[0]==='settings')return {online:now-this.getMeta('heartbeat',0)<90000,connections:{...this.getMeta('connections',{}),...(this.getMeta(pauseKey)?{visa:false}:{})},saudiPause:this.getMeta(pauseKey),tripDefaults:this.getMeta('tripDefaults',{})};
  if(route==='saudi/resume'&&method==='POST'){operator();return resumeSaudi(this,body)}
  if(p[0]==='trip-defaults'&&method==='POST'){operator();this.setMeta('tripDefaults',cleanTripDefaults(body.data||{}));return {ok:true}}
  if(p[0]==='heartbeat'&&method==='POST'){worker();this.setMeta('heartbeat',now);this.setMeta('connections',{telegram:!!body.telegram,gmail:!!body.gmail,visa:!!body.visa});return {ok:true}}
  if(p[0]==='claim'&&method==='POST'){
   worker();this.db.prepare("UPDATE applications SET status='needs_review',note='Bajaruvchi bilan aloqa uzildi. Arizani tekshiring.',lease=NULL,lease_until=NULL,updated_at=?,version=version+1 WHERE status='running' AND lease_until<=?").run(now,now);
   expireGroupJobs(this,now);if(hasRunningGroup(this))return null;const paused=!!this.getMeta(pauseKey),groupJob=paused?null:claimGroup(this,now);if(groupJob)return groupJob;
   return decode(this.db.prepare("UPDATE applications SET status='running',lease=?,lease_until=?,updated_at=?,version=version+1 WHERE id=(SELECT id FROM applications WHERE status='queued' AND (?=0 OR job_type IN ('extract','portrait')) ORDER BY created_at LIMIT 1) AND NOT EXISTS(SELECT 1 FROM applications WHERE status='running') AND NOT EXISTS(SELECT 1 FROM visa_groups WHERE status='running') RETURNING *").get(randomUUID(),now+120000,now,Number(paused)));
  }
  if(p[0]==='groups')return groupRequest(this,url,method,body,actor);
  if(p[0]!=='applications')fail('Amal topilmadi',404);
  if(p.length===1&&method==='GET')return this.db.prepare('SELECT * FROM applications ORDER BY created_at DESC').all().map(decode);
  if(p.length===1&&method==='POST'){
   operator();const sourceKey=typeof body.sourceKey==='string'?body.sourceKey.slice(0,150):null;
   assertNotDeletedSource(this,'application',sourceKey);
   if(sourceKey){const old=this.db.prepare('SELECT * FROM applications WHERE source_key=?').get(sourceKey);if(old)return decode(old)}
   const data=applyPreparationDefaults(cleanApplicant(body.data||{}),this.getMeta('tripDefaults',{}));
   const groupId=body.groupId||null;if(groupId){groupRow(this,groupId);assertGroupMutable(this,groupId)}
   const position=groupId?this.db.prepare('SELECT COALESCE(MAX(group_position),0)+1 AS n FROM applications WHERE group_id=?').get(groupId).n:null;
   const id=randomUUID();this.db.prepare("INSERT INTO applications(id,source,source_key,data,status,created_at,updated_at,group_id,group_position) VALUES(?,'telegram',?,?,'draft',?,?,?,?)").run(id,sourceKey,JSON.stringify(data),now,now,groupId,position);touchGroup(this,groupId);
   this.event(id,'Telegram orqali ariza yaratildi');return decode(this.row(id));
  }
  const id=p[1],row=this.row(id);
  if(p.length===2&&method==='GET')return decode(row);
  if(p.length===2&&method==='DELETE'){operator();return deleteApplication(this,id,body)}
  if(p[2]==='duplicate-distinct'&&method==='POST'){
   operator();this.mutable(row);if(!row.duplicate_of||body.confirmed!==true||body.version!==row.version)fail('Ariza yangilangan. Pasportni qayta tekshiring.',409);
   this.db.prepare("UPDATE applications SET duplicate_of=NULL,group_confirmation=NULL,note='',version=version+1,updated_at=? WHERE id=?").run(now,id);touchGroup(this,row.group_id);this.event(id,'Operator surat boshqa pasport ekanini tekshirib tasdiqladi');return {ok:true};
  }
  if(p[2]==='review-confirm'&&method==='POST'){
   operator();this.mutable(row);this.assertPassportReviewed(row);
   const head=this.reviews.view().head;
   if(body.confirmed!==true||body.version!==row.version||head?.id!==id||!head.ready)fail('Tasdiqlash navbati yoki ariza yangilangan. /tasdiqlash orqali qayta oching.',409);
   const data=applyPreparationDefaults(cleanApplicant(body.data),this.getMeta('tripDefaults',{})),missing=missingFields(data,!!row.portrait_key);
   if(missing.length)fail('Yetishmaydi: '+missing.join(', '));
   this.db.exec('BEGIN IMMEDIATE');
   try{
    this.changes(this.db.prepare("UPDATE applications SET data=?,status='draft',note='',updated_at=?,version=version+1 WHERE id=? AND version=?").run(JSON.stringify(data),now,id,row.version));
    if(row.group_id)this.db.prepare('UPDATE applications SET group_confirmation=? WHERE id=?').run(groupMemberSignature(this.row(id)),id);
    this.reviews.confirm(id);this.reviews.clearShown();touchGroup(this,row.group_id);this.event(id,'Ma’lumotlar va portret tasdiqlandi; tasdiqlash navbatida keyingi arizaga o‘tildi.');
    this.db.exec('COMMIT');
   }catch(error){this.db.exec('ROLLBACK');throw error;}
   return {ok:true};
  }
  if(p[2]==='events'&&method==='GET')return this.db.prepare('SELECT message,created_at FROM events WHERE application_id=? ORDER BY id DESC LIMIT 30').all(id);
  if(p[2]==='file'&&method==='GET'){if(url.searchParams.has('version')&&Number(url.searchParams.get('version'))!==row.version)fail('Ariza yangilangan. Qayta oching.',409);const key=url.searchParams.get('kind')==='portrait'?row.portrait_key:row.passport_key;if(!key)fail('Rasm topilmadi',404);return readFileSync(path.join(this.files,key))}
  if(p[2]==='lease'&&method==='POST'){worker();this.leased(row,body);this.changes(this.db.prepare("UPDATE applications SET lease_until=? WHERE id=? AND lease=? AND status='running'").run(now+120000,id,body.lease));return {ok:true}}
  if(p[2]==='progress'&&method==='POST'){
   worker();this.leased(row,body);if(!['login','personal','passport','insurance','terms','review','payment'].includes(body.step))fail('Bosqich noto‘g‘ri');
   this.db.prepare('UPDATE applications SET step=?,note=?,updated_at=? WHERE id=?').run(body.step,String(body.note||'').slice(0,1500),now,id);return {ok:true};
  }
  if(p[2]==='checkpoint'&&method==='POST'){
   worker();this.leased(row,body);if(row.job_type!=='visa'||!officialDraftUrl(body.officialUrl)||!/^\d{10,25}$/.test(String(body.applicationNumber)))fail('Qoralama ma’lumoti noto‘g‘ri');
   if(row.official_url&&new URL(row.official_url).pathname.split('/').at(-1)!==new URL(body.officialUrl).pathname.split('/').at(-1))fail('Boshqa qoralamaga almashtirib bo‘lmaydi',409);
   this.db.prepare('UPDATE applications SET official_url=?,application_number=?,step=?,updated_at=?,version=version+1 WHERE id=?').run(body.officialUrl,String(body.applicationNumber),String(body.step||'passport'),now,id);return {ok:true};
  }
  if(p[2]==='result'&&method==='POST'){
   worker();this.leased(row,body);if(!['draft','needs_input','needs_auth','needs_review','payment_ready','failed'].includes(body.status))fail('Noto‘g‘ri holat');
   if(body.status==='payment_ready'&&(!paymentUrl(body.paymentUrl)||!body.applicationNumber||!body.paymentEvidence))fail('To‘lov sahifasi tekshirilmagan');
   const note=String(body.note||'').slice(0,1500);
   this.db.prepare('UPDATE applications SET data=?,status=?,step=?,note=?,application_number=COALESCE(?,application_number),payment_url=COALESCE(?,payment_url),lease=NULL,lease_until=NULL,updated_at=?,version=version+1 WHERE id=?').run(JSON.stringify(body.data?cleanApplicant(body.data):JSON.parse(row.data)),body.status,body.step||'review',note,body.applicationNumber||null,body.status==='payment_ready'?body.paymentUrl:null,now,id);
   if(['extract','portrait'].includes(row.job_type))this.reviews.ready(id);
   this.event(id,note||body.status);return {ok:true};
  }
  if(p[2]==='upload'&&method==='POST'){
   const file=body.get('file'),kind=body.get('kind');if(!file?.arrayBuffer||!['passport','portrait'].includes(kind))fail('Rasm kerak');
   const leased=actor==='worker'&&row.status==='running'&&['extract','portrait'].includes(row.job_type)&&kind==='portrait';
   if(leased){this.leased(row,{lease:body.get('lease')});if(row.portrait_key&&row.job_type!=='portrait')return {ok:true,keptExisting:true}}else{operator();this.mutable(row)}
   const bytes=Buffer.from(await file.arrayBuffer());await this.validateFile(bytes,kind);
   const signature=kind==='passport'?await this.duplicatePassport(bytes,id):null;
   const current=this.row(id);if(current.version!==row.version)fail('Ariza yangilandi. Qayta tekshiring.',409);
   if(leased)this.leased(current,{lease:body.get('lease')});else this.mutable(current);
   // Recheck after all awaits, then commit synchronously: a concurrent upload
   // may have installed its signature while this image was being decoded.
   if(signature)Object.assign(signature,this.findDuplicatePassport(signature,id));
   const key=this.saveFile(bytes),column=kind==='portrait'?'portrait_key':'passport_key';
   try{this.changes(this.db.prepare(`UPDATE applications SET ${column}=?,${kind==='passport'?'portrait_key=NULL,':''}updated_at=?,version=version+1 WHERE id=? AND version=?`).run(key,now,id,row.version))}catch(e){this.removeFile(key);throw e}
   if(signature)this.db.prepare('UPDATE applications SET passport_sha256=?,passport_fingerprint=?,duplicate_of=?,group_confirmation=NULL WHERE id=?').run(signature.sha256,signature.fingerprint,signature.duplicateOf,id);
   this.removeFile(row[column]);if(kind==='passport')this.removeFile(row.portrait_key);
   if(kind==='passport')this.reviews.pending(id);else if(!leased&&this.reviews.has(id))this.reviews.ready(id);
   touchGroup(this,row.group_id);
   this.event(id,kind==='portrait'?'Portret saqlandi':'Pasport saqlandi');return {ok:true};
  }
  if(p.length===2&&method==='PATCH'){
   operator();this.mutable(row);const data=applyPreparationDefaults(cleanApplicant(body.data),this.getMeta('tripDefaults',{}));
   this.changes(this.db.prepare("UPDATE applications SET data=?,status='draft',note='',updated_at=?,version=version+1 WHERE id=? AND version=?").run(JSON.stringify(data),now,id,body.version));touchGroup(this,row.group_id);this.event(id,'Ma’lumotlar Telegram orqali tahrirlandi');return {ok:true};
  }
  if(p[2]==='queue'&&method==='POST'){
   operator();this.mutable(row);const job=['extract','portrait'].includes(body.job)?body.job:'visa';
   this.assertPassportReviewed(row);
   if(job!=='visa'&&!row.passport_key)fail('Pasport rasmini yuboring');
   if(job==='visa'){
    assertSaudiNotPaused(this);
    if(row.group_id)fail('Bu arizachi guruhga tegishli. Guruh kartasidan ishga tushiring.');
    const missing=missingFields(JSON.parse(row.data),!!row.portrait_key);if(missing.length)fail('Yetishmaydi: '+missing.join(', '));
    if(body.confirmed!==true||body.version!==row.version)fail('Arizaning hozirgi ma’lumotlarini tekshirib tasdiqlang.',409);
   }
   if(job!=='visa')this.reviews.pending(id);else this.reviews.confirm(id);
   this.changes(this.db.prepare("UPDATE applications SET status='queued',job_type=?,note='',updated_at=?,version=version+1 WHERE id=? AND version=?").run(job,now,id,row.version));this.event(id,job==='extract'?'Pasportni o‘qish navbatiga qo‘shildi':job==='portrait'?'Portretni qayta kesish navbatiga qo‘shildi':'Saytda to‘ldirish uchun operator tasdiqladi');return {ok:true};
  }
  if(p[2]==='pause'&&method==='POST'){operator();this.changes(this.db.prepare("UPDATE applications SET status='draft',updated_at=?,version=version+1 WHERE id=? AND status='queued'").run(now,id));if(['extract','portrait'].includes(row.job_type))this.reviews.ready(id);this.event(id,'Navbatdan chiqarildi');return {ok:true}}
  fail('Amal topilmadi',404);
 }
}
