import {createHash,randomUUID} from 'node:crypto';
import {unlinkSync} from 'node:fs';
import path from 'node:path';

const fail=message=>{throw Object.assign(Error(message),{status:409})};
const hash=value=>createHash('sha256').update(value).digest('hex');
export function groupDeletionRevision(group){return hash(JSON.stringify([group.version,group.members.map(m=>[m.id,m.version,m.status])])).slice(0,24)}
export function groupRosterStarted(group){
 const cp=typeof group.checkpoint==='string'?JSON.parse(group.checkpoint):group.checkpoint||{};
 return !!group.official_url||Object.keys(cp).some(k=>k==='members'?Object.keys(cp.members||{}).length:k==='phase'?cp.phase!=='collect':!['entryUrl','name'].includes(k));
}
export function initDeletion(store){
 store.db.exec(`PRAGMA secure_delete=ON;
 CREATE TABLE IF NOT EXISTS deleted_entities(id TEXT PRIMARY KEY,kind TEXT NOT NULL,source_hash TEXT,cleanup_pending INTEGER NOT NULL DEFAULT 1);
 CREATE INDEX IF NOT EXISTS deleted_source ON deleted_entities(kind,source_hash);
 CREATE TABLE IF NOT EXISTS deleted_files(key TEXT PRIMARY KEY);`);
 flushDeleted(store);
}
export function assertNotDeletedSource(store,kind,source){
 if(source&&store.db.prepare('SELECT id FROM deleted_entities WHERE kind=? AND source_hash=?').get(kind,hash(source)))fail('Bu eski xabar bo‘yicha ariza o‘chirilgan. Yangi ariza uchun pasportni qayta yuboring.');
}
export function flushDeleted(store){
 for(const {key} of store.db.prepare('SELECT key FROM deleted_files').all()){
  try{unlinkSync(path.join(store.files,key))}catch(e){if(e.code!=='ENOENT')continue}
  store.db.prepare('DELETE FROM deleted_files WHERE key=?').run(key);
 }
 if(store.cleanupDeleted)for(const row of store.db.prepare('SELECT id,kind FROM deleted_entities WHERE cleanup_pending=1').all()){
  try{store.cleanupDeleted(row);store.db.prepare('UPDATE deleted_entities SET cleanup_pending=0 WHERE id=?').run(row.id)}catch{}
 }
}
function removeRows(store,rows,group){
 const db=store.db,ids=new Set(rows.map(r=>r.id));
 for(const row of rows){
  db.prepare("INSERT INTO deleted_entities(id,kind,source_hash) VALUES(?,'application',?)").run(row.id,row.source_key?hash(row.source_key):null);
  for(const key of [row.passport_key,row.portrait_key])if(key)db.prepare('INSERT OR IGNORE INTO deleted_files VALUES(?)').run(key);
  db.prepare('DELETE FROM events WHERE application_id=?').run(row.id);
  db.prepare('DELETE FROM telegram_reviews WHERE application_id=?').run(row.id);
  if(store.getMeta('telegram-review-shown')?.id===row.id)store.setMeta('telegram-review-shown',null);
  db.prepare('DELETE FROM applications WHERE id=?').run(row.id);
  const dependents=db.prepare('SELECT DISTINCT group_id FROM applications WHERE duplicate_of=? AND group_id IS NOT NULL').all(row.id);
  db.prepare('UPDATE applications SET duplicate_of=NULL,version=version+1,updated_at=? WHERE duplicate_of=?').run(Date.now(),row.id);
  for(const g of dependents)db.prepare('UPDATE visa_groups SET version=version+1,updated_at=? WHERE id=?').run(Date.now(),g.group_id);
 }
 for(const key of ['telegram-input','telegram-suggestion']){
  const value=store.getMeta(key);if(value&&(ids.has(value.id)||group&&value.groupId===group.id))store.setMeta(key,null);
 }
 if(group){
  let source;
  for(const m of db.prepare("SELECT key,value FROM metadata WHERE key LIKE 'group-source:%'").all())if(JSON.parse(m.value)===group.id){source=m.key.slice('group-source:'.length);db.prepare('DELETE FROM metadata WHERE key=?').run(m.key)}
  db.prepare("INSERT INTO deleted_entities(id,kind,source_hash) VALUES(?,'group',?)").run(group.id,source?hash(source):null);
  db.prepare('DELETE FROM visa_groups WHERE id=?').run(group.id);
  if(store.getMeta('telegram-intake')?.groupId===group.id)store.setMeta('telegram-intake',{mode:'individual'});
 }
}
function transaction(store,fn){
 store.db.exec('BEGIN IMMEDIATE');
 try{fn();store.db.exec('COMMIT')}catch(e){store.db.exec('ROLLBACK');throw e}
 flushDeleted(store);return {ok:true};
}
export function deleteApplication(store,id,body){
 return transaction(store,()=>{
  const row=store.row(id);
  if(body.confirmed!==true||body.version!==row.version)fail('Ariza yangilangan. O‘chirishni qayta tasdiqlang.');
  if(row.status==='running')fail('Ariza hozir bajarilmoqda. Tugagach o‘chirishingiz mumkin.');
  if(row.group_id){
   const group=store.db.prepare('SELECT * FROM visa_groups WHERE id=?').get(row.group_id);
   if(['queued','running'].includes(group.status)||groupRosterStarted(group))fail('Rasmiy guruh ro‘yxati boshlangan yoki navbatda. Alohida a’zoni o‘chirish o‘rniga butun guruh kartasidan foydalaning.');
  }
  removeRows(store,[row]);
  if(row.group_id)store.db.prepare('UPDATE visa_groups SET version=version+1,updated_at=? WHERE id=?').run(Date.now(),row.group_id);
 });
}
export function deleteGroup(store,id,body){
 return transaction(store,()=>{
  const group=store.db.prepare('SELECT * FROM visa_groups WHERE id=?').get(id);
  if(!group)fail('Guruh topilmadi.');
  const rows=store.db.prepare('SELECT * FROM applications WHERE group_id=? ORDER BY group_position,created_at,id').all(id);
  if(body.confirmed!==true||body.revision!==groupDeletionRevision({...group,members:rows}))fail('Guruh yoki arizachi yangilangan. O‘chirishni qayta tasdiqlang.');
  if(group.status==='running'||rows.some(r=>r.status==='running'))fail('Guruh yoki arizachi hozir bajarilmoqda. Tugagach o‘chirishingiz mumkin.');
  removeRows(store,rows,group);
 });
}

function collection(store){
 const rows=store.db.prepare('SELECT * FROM applications ORDER BY id').all();
 const groups=store.db.prepare('SELECT * FROM visa_groups ORDER BY id').all();
 const revision=hash(JSON.stringify([rows.map(r=>[r.id,r.version,r.status]),groups.map(g=>[g.id,g.version,g.status])]));
 return {rows,groups,revision};
}
function assertIdle({rows,groups}){
 if([...rows,...groups].some(r=>r.status==='running'))fail('Hozir ariza bajarilmoqda. Tugagach /tozalash buyrug‘ini qayta yuboring.');
}
export function prepareClearAll(store){
 const current=collection(store);assertIdle(current);
 const token=randomUUID();
 store.setMeta('telegram-clear-all',{token,revision:current.revision,expires:Date.now()+300000});
 return {token,applications:current.rows.length,groups:current.groups.length};
}
export function clearAll(store,body){
 return transaction(store,()=>{
  const confirmation=store.getMeta('telegram-clear-all'),current=collection(store);
  if(body.confirmed!==true||!confirmation||confirmation.token!==body.token||confirmation.expires<Date.now())fail('Tasdiq eskirgan. /tozalash buyrug‘ini qayta yuboring.');
  if(confirmation.revision!==current.revision)fail('Arizalar ro‘yxati yangilangan. /tozalash orqali qayta tekshiring.');
  assertIdle(current);
  for(const group of current.groups)removeRows(store,current.rows.filter(r=>r.group_id===group.id),group);
  removeRows(store,current.rows.filter(r=>!r.group_id||!current.groups.some(g=>g.id===r.group_id)));
  for(const key of ['telegram-clear-all','telegram-input','telegram-suggestion','telegram-mode-choice','telegram-review-shown'])store.setMeta(key,null);
  store.setMeta('telegram-intake',{mode:'individual'});store.setMeta('telegram-search','');
 });
}
