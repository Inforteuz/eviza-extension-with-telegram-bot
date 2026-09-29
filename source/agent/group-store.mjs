import {assertSaudiNotPaused} from './saudi-rate-limit.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {missingFields,paymentUrl} from '../lib/domain.ts';
import {deleteGroup,assertNotDeletedSource,groupRosterStarted} from './delete-store.mjs';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const locked=new Set(['queued','running','payment_ready','paid']);
const decode=row=>row?{...row,data:JSON.parse(row.data),passport:!!row.passport_key,portrait:!!row.portrait_key,passport_key:undefined,portrait_key:undefined}:null;
export const groupMemberSignature=row=>createHash('sha256').update(row.data+'\n'+(row.portrait_key||'')).digest('hex');
export function initGroups(store){
 const db=store.db;
 db.exec(`CREATE TABLE IF NOT EXISTS visa_groups(id TEXT PRIMARY KEY,name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',job_type TEXT NOT NULL DEFAULT 'group',step TEXT DEFAULT 'collect',note TEXT DEFAULT '',official_url TEXT,application_number TEXT,payment_url TEXT,checkpoint TEXT DEFAULT '{}',lease TEXT,lease_until INTEGER,created_at INTEGER,updated_at INTEGER,version INTEGER NOT NULL DEFAULT 1);
 CREATE INDEX IF NOT EXISTS groups_queue ON visa_groups(status,created_at);`);
 const columns=new Set(db.prepare('PRAGMA table_info(applications)').all().map(x=>x.name));
 for(const [name,type] of [['group_id','TEXT'],['group_position','INTEGER'],['group_confirmation','TEXT']])if(!columns.has(name))db.exec(`ALTER TABLE applications ADD COLUMN ${name} ${type}`);
 db.exec('CREATE INDEX IF NOT EXISTS group_members ON applications(group_id,group_position)');
}
export function groupRow(store,id){const row=store.db.prepare('SELECT * FROM visa_groups WHERE id=?').get(id);if(!row)fail('Guruh topilmadi',404);return row}
export function groupMembers(store,id){return store.db.prepare('SELECT * FROM applications WHERE group_id=? ORDER BY group_position,created_at,id').all(id)}
export function assertGroupMutable(store,id){if(id&&locked.has(groupRow(store,id).status))fail('Guruh bajarilmoqda yoki yakunlangan. Avval guruh navbatini to‘xtating.',409)}
export function touchGroup(store,id){if(id)store.db.prepare("UPDATE visa_groups SET version=version+1,updated_at=? WHERE id=?").run(Date.now(),id)}
export function groupView(store,id){
 const row=groupRow(store,id);
 return {...row,checkpoint:JSON.parse(row.checkpoint),members:groupMembers(store,id).map(m=>({...decode(m),confirmed:m.group_confirmation===groupMemberSignature(m)}))};
}
export function resolveGroup(store,short){
 if(!/^[a-f0-9-]{8,36}$/i.test(short))fail('Guruh raqami noto‘g‘ri');
 const rows=store.db.prepare('SELECT id FROM visa_groups WHERE id LIKE ?').all(short+'%');if(rows.length!==1)fail('Guruh topilmadi',404);return rows[0].id;
}
export function expireGroupJobs(store,now){store.db.prepare("UPDATE visa_groups SET status='needs_review',note='Guruh bajaruvchisi bilan aloqa uzildi. Saqlangan a’zolarni tekshirib davom eting.',lease=NULL,lease_until=NULL,version=version+1,updated_at=? WHERE status='running' AND lease_until<=?").run(now,now)}
export function hasRunningGroup(store){return !!store.db.prepare("SELECT id FROM visa_groups WHERE status='running'").get()}
export function claimGroup(store,now){
 if(store.db.prepare("SELECT id FROM applications WHERE status='running'").get()||hasRunningGroup(store))return null;
 const group=store.db.prepare("SELECT * FROM visa_groups WHERE status='queued' ORDER BY created_at,id LIMIT 1").get();if(!group)return null;
 const app=store.db.prepare("SELECT created_at FROM applications WHERE status='queued' ORDER BY created_at LIMIT 1").get();if(app&&app.created_at<group.created_at)return null;
 const row=store.db.prepare("UPDATE visa_groups SET status='running',lease=?,lease_until=?,updated_at=?,version=version+1 WHERE id=? AND status='queued' AND NOT EXISTS(SELECT 1 FROM applications WHERE status='running') AND NOT EXISTS(SELECT 1 FROM visa_groups WHERE status='running') RETURNING *").get(randomUUID(),now+120000,now,group.id);
 return row?{...groupView(store,row.id),entity:'group'}:null;
}
export async function groupRequest(store,url,method,body,actor){
 const p=url.pathname.slice(1).split('/'),now=Date.now(),db=store.db;
 const operator=()=>{if(actor!=='operator')fail('Mas’ul shaxs tasdig‘i kerak.',403)};
 const worker=()=>{if(actor!=='worker')fail('Bajaruvchiga tegishli amal.',403)};
 if(p.length===1&&method==='GET')return db.prepare('SELECT id FROM visa_groups ORDER BY created_at DESC').all().map(r=>groupView(store,r.id));
 if(p.length===1&&method==='POST'){
  operator();const name=String(body.name||'').trim();if(!name||name.length>80||/[\r\n\x00-\x1f]/.test(name))fail('Guruh nomi 1–80 belgidan iborat bo‘lsin.');
  // Telegram group-name retries must return the same local group.
  const sourceKey=String(body.sourceKey||'');assertNotDeletedSource(store,'group',sourceKey);if(sourceKey){const old=store.getMeta('group-source:'+sourceKey);if(old)return groupView(store,old)}
  const id=randomUUID();db.prepare('INSERT INTO visa_groups(id,name,created_at,updated_at) VALUES(?,?,?,?)').run(id,name,now,now);if(sourceKey)store.setMeta('group-source:'+sourceKey,id);return groupView(store,id);
 }
 const id=p[1],group=groupRow(store,id);
 if(p.length===2&&method==='GET')return groupView(store,id);
 if(p.length===2&&method==='DELETE'){operator();return deleteGroup(store,id,body)}
 if(p[2]==='confirm-member'&&method==='POST'){
  operator();assertGroupMutable(store,id);const row=store.row(body.memberId);if(row.group_id!==id)fail('Bu arizachi boshqa guruhga tegishli.',409);store.mutable(row);
  store.assertPassportReviewed(row);
  if(row.version!==body.version)fail('Ariza yangilangan. Qayta tekshiring.',409);
  const missing=missingFields(JSON.parse(row.data),!!row.portrait_key);if(missing.length)fail('Yetishmaydi: '+missing.join(', '));
  db.prepare('UPDATE applications SET group_confirmation=? WHERE id=?').run(groupMemberSignature(row),row.id);touchGroup(store,id);store.event(row.id,'Guruh uchun ma’lumotlar va portret tasdiqlandi');return groupView(store,id);
 }
 if(p[2]==='remove-member'&&method==='POST'){
  operator();assertGroupMutable(store,id);if(groupRosterStarted(group))fail('Rasmiy guruh boshlangan. A’zoni o‘chirishdan oldin arizani tekshiring.',409);
  const row=store.row(body.memberId);if(row.group_id!==id)fail('Arizachi guruhda topilmadi');store.mutable(row);if(row.version!==body.version)fail('Ariza yangilangan.',409);
  db.prepare('UPDATE applications SET group_id=NULL,group_position=NULL,group_confirmation=NULL,version=version+1 WHERE id=?').run(row.id);touchGroup(store,id);return groupView(store,id);
 }
 if(['queue','inspect'].includes(p[2])&&method==='POST'){
  assertSaudiNotPaused(store);
  operator();assertGroupMutable(store,id);if(body.version!==group.version||body.confirmed!==true)fail('Guruhning joriy ro‘yxatini tekshirib tasdiqlang.',409);
  const members=groupMembers(store,id);
  if(p[2]==='queue'){
   if(!members.length)fail('Avval guruhga pasport yuboring.');
   const numbers=new Set();
   for(const member of members){
    store.assertPassportReviewed(member);
    const a=JSON.parse(member.data),missing=missingFields(a,!!member.portrait_key);
    if(locked.has(member.status)||member.group_confirmation!==groupMemberSignature(member)||missing.length)fail((a.firstName||member.id.slice(0,8))+': ma’lumotlar va portret hali tasdiqlanmagan.');
    const saved=JSON.parse(group.checkpoint).members?.[member.id];if(saved?.confirmation&&saved.confirmation!==member.group_confirmation)fail('Rasmiy arizachi boshlanganidan keyin ma’lumotlari o‘zgargan. Avval qoralamani tekshiring.');
    const passport=a.passportNumber.toUpperCase();if(numbers.has(passport))fail('Guruhda bir xil pasport ikki marta bor.');numbers.add(passport);
   }
  }
  db.prepare("UPDATE visa_groups SET status='queued',job_type=?,note='',updated_at=?,version=version+1 WHERE id=?").run(p[2]==='inspect'?'group_probe':'group',now,id);
  return groupView(store,id);
 }
 if(p[2]==='pause'&&method==='POST'){
  operator();if(group.status!=='queued')fail('Faqat navbatdagi guruhni to‘xtatish mumkin.',409);db.prepare("UPDATE visa_groups SET status='draft',version=version+1,updated_at=? WHERE id=?").run(now,id);return groupView(store,id);
 }
 if(['lease','progress','checkpoint','result'].includes(p[2])&&method==='POST'){
  worker();store.leased(group,body);
  if(p[2]==='lease'){db.prepare('UPDATE visa_groups SET lease_until=? WHERE id=?').run(now+120000,id);return {ok:true}}
  if(p[2]==='progress'){db.prepare('UPDATE visa_groups SET step=?,note=?,updated_at=? WHERE id=?').run(String(body.step||'group'),String(body.note||'').slice(0,1500),now,id);return {ok:true}}
  if(p[2]==='checkpoint'){
   if(!body.checkpoint||typeof body.checkpoint!=='object'||Array.isArray(body.checkpoint))fail('Guruh bosqichi noto‘g‘ri');
   db.prepare('UPDATE visa_groups SET checkpoint=?,updated_at=? WHERE id=?').run(JSON.stringify(body.checkpoint),now,id);return {ok:true};
  }
  if(!['draft','needs_input','needs_auth','needs_review','payment_ready','failed'].includes(body.status))fail('Guruh holati noto‘g‘ri');
  if(body.officialUrl&&!paymentUrl(body.officialUrl))fail('Guruh manzili noto‘g‘ri');
  if(body.status==='payment_ready'&&(!paymentUrl(body.paymentUrl)||!body.applicationNumber||!body.paymentEvidence||body.paymentEvidence.paymentNotClicked!==true||body.paymentEvidence.memberCount!==groupMembers(store,id).length))fail('Guruh to‘lov sahifasi tekshirilmagan');
  db.prepare('UPDATE visa_groups SET status=?,step=?,note=?,official_url=COALESCE(?,official_url),application_number=COALESCE(?,application_number),payment_url=COALESCE(?,payment_url),lease=NULL,lease_until=NULL,version=version+1,updated_at=? WHERE id=?').run(body.status,body.step||'group',String(body.note||'').slice(0,1500),body.officialUrl||null,body.applicationNumber||null,body.status==='payment_ready'?body.paymentUrl:null,now,id);
  return groupView(store,id);
 }
 fail('Guruh amali topilmadi',404);
}
