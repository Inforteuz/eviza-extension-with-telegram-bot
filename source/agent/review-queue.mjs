import {createHash} from 'node:crypto';
import {groupMemberSignature} from './group-store.mjs';
const fingerprint=row=>createHash('sha256').update(JSON.stringify([row.data,row.passport_key,row.portrait_key])).digest('hex');
const shownKey='telegram-review-shown';
export class ReviewQueue {
 constructor(store){
  this.store=store;
  store.db.exec('CREATE TABLE IF NOT EXISTS telegram_reviews(sequence INTEGER PRIMARY KEY AUTOINCREMENT,application_id TEXT UNIQUE NOT NULL,ready INTEGER NOT NULL DEFAULT 0,confirmed TEXT)');
 }
 enroll(id,ready=false){this.store.db.prepare('INSERT OR IGNORE INTO telegram_reviews(application_id,ready) VALUES(?,?)').run(id,Number(ready));}
 pending(id){this.enroll(id);this.store.db.prepare('UPDATE telegram_reviews SET ready=0 WHERE application_id=?').run(id);}
 ready(id){this.enroll(id,true);this.store.db.prepare('UPDATE telegram_reviews SET ready=1 WHERE application_id=?').run(id);}
 confirm(id){this.store.db.prepare('UPDATE telegram_reviews SET confirmed=? WHERE application_id=?').run(fingerprint(this.store.row(id)),id);}
 has(id){return !!this.store.db.prepare('SELECT sequence FROM telegram_reviews WHERE application_id=?').get(id);}
 view(){
  const rows=this.store.db.prepare(`SELECT a.*,r.sequence,r.ready,r.confirmed AS review_confirmation,g.status AS group_status,g.checkpoint AS group_checkpoint
   FROM telegram_reviews r JOIN applications a ON a.id=r.application_id LEFT JOIN visa_groups g ON g.id=a.group_id ORDER BY r.sequence`).all();
  const items=rows.filter(r=>{
   if(!r.passport_key||r.official_url||['paid','payment_ready'].includes(r.status)||['queued','running','paid','payment_ready'].includes(r.group_status))return false;
   if(r.group_id&&JSON.parse(r.group_checkpoint||'{}').members?.[r.id]?.applicationNumber)return false;
   if(r.review_confirmation===fingerprint(r)||r.group_id&&r.group_confirmation===groupMemberSignature(r))return false;
   if(['queued','running'].includes(r.status)&&r.job_type==='visa')return false;
   return true;
  }).map(r=>({id:r.id,version:r.version,groupId:r.group_id,ready:(!!r.ready||['needs_review','needs_input','failed'].includes(r.status))&&!['queued','running'].includes(r.status)}));
  return {head:items[0]||null,count:items.length,reading:items.filter(r=>!r.ready).length};
 }
 shown(){return this.store.getMeta(shownKey);}
 markShown(id,version){this.store.setMeta(shownKey,{id,version});}
 clearShown(){this.store.setMeta(shownKey,null);}
 backfill(){
  if(this.store.getMeta('telegram-review-queue-v1'))return;
  for(const row of this.store.db.prepare('SELECT id,status FROM applications WHERE passport_key IS NOT NULL ORDER BY created_at,rowid').all())this.enroll(row.id,!['queued','running'].includes(row.status));
  this.store.setMeta('telegram-review-queue-v1',true);
 }
}
