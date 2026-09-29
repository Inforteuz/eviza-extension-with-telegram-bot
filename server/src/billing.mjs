import {createHash,randomBytes} from 'node:crypto';
import {transaction,getSetting,setSetting} from './db.mjs';

export class InsufficientBalance extends Error {
 constructor(balance,price){super('Balans yetarli emas.');this.balance=balance;this.price=price;}
}
export const passportKey=number=>createHash('sha256').update(String(number||'').toUpperCase().replace(/\s+/g,'')).digest('hex');
const validPassport=number=>/^[A-Z0-9]{5,15}$/.test(String(number||'').toUpperCase().replace(/\s+/g,''));
const DAY=86400000;

// Rules: one passport is paid once per user for `dedupeDays`; an applicant that is
// already activated never pays again; unreadable passports and failures are free.
export class Billing {
 constructor(db,{price=5000,welcomeBonus=0,dedupeDays=30,now=()=>Date.now()}={}){Object.assign(this,{db,defaultPrice:price,welcomeBonus,dedupeDays,now});}
 price(){return getSetting(this.db,'price',this.defaultPrice)}
 setPrice(value){if(!Number.isSafeInteger(value)||value<0||value>100000000)throw Error('Narx noto‘g‘ri.');setSetting(this.db,'price',value)}
 user(id){return this.db.prepare('SELECT * FROM users WHERE id=?').get(id)||null}
 upsertUser(from){
  const now=this.now();
  return transaction(this.db,()=>{
   const existing=this.user(from.id);
   if(existing){this.db.prepare('UPDATE users SET username=?,first_name=?,last_name=?,updated_at=? WHERE id=?').run(from.username||null,from.first_name||null,from.last_name||null,now,from.id);return {user:this.user(from.id),created:false}}
   this.db.prepare('INSERT INTO users(id,username,first_name,last_name,balance,created_at,updated_at) VALUES(?,?,?,?,0,?,?)').run(from.id,from.username||null,from.first_name||null,from.last_name||null,now,now);
   if(this.welcomeBonus>0)this.#applyCredit(from.id,this.welcomeBonus,'bonus','welcome:'+from.id,'Xush kelibsiz bonusi');
   return {user:this.user(from.id),created:true};
  });
 }
 setState(userId,state,data=null){this.db.prepare('UPDATE users SET state=?,state_data=? WHERE id=?').run(state,data===null?null:JSON.stringify(data),userId)}
 state(userId){const u=this.user(userId);return u?.state?{name:u.state,data:u.state_data?JSON.parse(u.state_data):null}:null}
 setBlocked(userId,blocked){return this.db.prepare('UPDATE users SET blocked=? WHERE id=?').run(blocked?1:0,userId).changes>0}

 #applyCredit(userId,amount,kind,ref,note){
  if(ref&&this.db.prepare('SELECT 1 FROM ledger WHERE ref=?').get(ref))return false;
  this.db.prepare('INSERT INTO ledger(user_id,amount,kind,ref,note,created_at) VALUES(?,?,?,?,?,?)').run(userId,amount,kind,ref,note||null,this.now());
  this.db.prepare('UPDATE users SET balance=balance+?,updated_at=? WHERE id=?').run(amount,this.now(),userId);
  return true;
 }
 // Idempotent by `ref`: repeating a Telegram payment or an admin approval never credits twice.
 credit(userId,amount,kind,ref,note){
  if(!Number.isSafeInteger(amount)||amount<=0)throw Error('Summa noto‘g‘ri.');
  return transaction(this.db,()=>{if(!this.user(userId))throw Error('Foydalanuvchi topilmadi.');const applied=this.#applyCredit(userId,amount,kind,ref,note);return {applied,balance:this.user(userId).balance}});
 }
 adjust(userId,delta,note,adminId){
  if(!Number.isSafeInteger(delta)||delta===0)throw Error('Summa noto‘g‘ri.');
  return transaction(this.db,()=>{
   const user=this.user(userId);if(!user)throw Error('Foydalanuvchi topilmadi.');
   if(user.balance+delta<0)throw new InsufficientBalance(user.balance,-delta);
   this.#applyCredit(userId,delta,'admin','admin:'+randomBytes(8).toString('hex'),(note||'Administrator tuzatishi')+' ('+adminId+')');
   return {balance:this.user(userId).balance};
  });
 }

 #activation(userId,applicantId,key){
  const own=this.db.prepare('SELECT * FROM activations WHERE user_id=? AND applicant_id=?').get(userId,applicantId);
  if(own)return own;
  return this.db.prepare('SELECT * FROM activations WHERE user_id=? AND passport_key=? AND created_at>? ORDER BY created_at DESC LIMIT 1').get(userId,key,this.now()-this.dedupeDays*DAY)||null;
 }
 #recordActivation(userId,applicantId,key,amount){this.db.prepare('INSERT OR IGNORE INTO activations(user_id,applicant_id,passport_key,amount,created_at) VALUES(?,?,?,?,?)').run(userId,applicantId,key,amount,this.now())}
 activated(userId,applicantId){return !!this.db.prepare('SELECT 1 FROM activations WHERE user_id=? AND applicant_id=?').get(userId,applicantId)}

 // Reserve the price before an AI request so parallel uploads cannot overdraw.
 hold(userId,amount,ref){
  return transaction(this.db,()=>{
   const user=this.user(userId);if(!user)throw Error('Foydalanuvchi topilmadi.');
   if(amount<=0)return null;
   if(user.balance<amount)throw new InsufficientBalance(user.balance,amount);
   const r=this.db.prepare("INSERT INTO ledger(user_id,amount,kind,ref,note,created_at) VALUES(?,?,'hold',?,?,?)").run(userId,-amount,ref,'Pasport o‘qish uchun band qilindi',this.now());
   this.db.prepare('UPDATE users SET balance=balance-?,updated_at=? WHERE id=?').run(amount,this.now(),userId);
   return Number(r.lastInsertRowid);
  });
 }
 #release(hold){this.db.prepare('DELETE FROM ledger WHERE id=?').run(hold.id);this.db.prepare('UPDATE users SET balance=balance+?,updated_at=? WHERE id=?').run(-hold.amount,this.now(),hold.user_id)}
 releaseHold(holdId){
  if(!holdId)return false;
  return transaction(this.db,()=>{const hold=this.db.prepare("SELECT * FROM ledger WHERE id=? AND kind='hold'").get(holdId);if(!hold)return false;this.#release(hold);return true});
 }
 // Turn the hold into the passport charge, or give it back when this passport is already paid.
 finalizeHold(holdId,{userId,applicantId,passportNumber}){
  return transaction(this.db,()=>{
   const hold=holdId?this.db.prepare("SELECT * FROM ledger WHERE id=? AND kind='hold' AND user_id=?").get(holdId,userId):null;
   if(!validPassport(passportNumber)){if(hold)this.#release(hold);return {charged:0,activated:this.activated(userId,applicantId)}}
   const key=passportKey(passportNumber),prior=this.#activation(userId,applicantId,key);
   if(prior||!hold){if(hold)this.#release(hold);this.#recordActivation(userId,applicantId,key,0);return {charged:0,activated:true}}
   this.db.prepare("UPDATE ledger SET kind='charge',ref=?,note=? WHERE id=?").run('act:'+userId+':'+applicantId,'Pasport: …'+String(passportNumber).slice(-3),hold.id);
   this.#recordActivation(userId,applicantId,key,-hold.amount);
   return {charged:-hold.amount,activated:true};
  });
 }
 // Manual entries (no AI) are activated with the same once-per-passport rule.
 activate(userId,applicantId,passportNumber){
  if(!validPassport(passportNumber))throw Error('Pasport raqami noto‘g‘ri.');
  return transaction(this.db,()=>{
   const key=passportKey(passportNumber),prior=this.#activation(userId,applicantId,key);
   if(prior){this.#recordActivation(userId,applicantId,key,0);return {charged:0,activated:true}}
   const price=this.price(),user=this.user(userId);
   if(user.balance<price)throw new InsufficientBalance(user.balance,price);
   if(price>0)this.#applyCredit(userId,-price,'charge','act:'+userId+':'+applicantId,'Pasport: …'+String(passportNumber).slice(-3));
   this.#recordActivation(userId,applicantId,key,price);
   return {charged:price,activated:true};
  });
 }
 releaseStaleHolds(olderThanMs=10*60000){
  return transaction(this.db,()=>{const stale=this.db.prepare("SELECT * FROM ledger WHERE kind='hold' AND created_at<?").all(this.now()-olderThanMs);for(const hold of stale)this.#release(hold);return stale.length});
 }

 createTopup(userId,amount,method){
  const id=randomBytes(6).toString('base64url');
  this.db.prepare("INSERT INTO topups(id,user_id,amount,method,status,created_at) VALUES(?,?,?,?,'pending',?)").run(id,userId,amount,method,this.now());
  return this.topup(id);
 }
 topup(id){return this.db.prepare('SELECT * FROM topups WHERE id=?').get(id)||null}
 attachReceipt(id,fileId){this.db.prepare("UPDATE topups SET receipt_file_id=? WHERE id=? AND status='pending'").run(fileId,id)}
 completeTopup(id,{chargeId=null,decidedBy=null,amount}={}){
  return transaction(this.db,()=>{
   const topup=this.topup(id);if(!topup)throw Error('To‘lov topilmadi.');
   if(topup.status!=='pending')return {applied:false,topup,balance:this.user(topup.user_id).balance};
   const credited=amount??topup.amount;
   this.db.prepare("UPDATE topups SET status='approved',amount=?,charge_id=?,decided_at=?,decided_by=? WHERE id=?").run(credited,chargeId,this.now(),decidedBy,id);
   this.#applyCredit(topup.user_id,credited,'topup','topup:'+id,topup.method==='telegram'?'Telegram to‘lovi':'Karta orqali to‘lov');
   return {applied:true,topup:this.topup(id),balance:this.user(topup.user_id).balance};
  });
 }
 rejectTopup(id,decidedBy){
  return transaction(this.db,()=>{
   const topup=this.topup(id);if(!topup||topup.status!=='pending')return {applied:false,topup};
   this.db.prepare("UPDATE topups SET status='rejected',decided_at=?,decided_by=? WHERE id=?").run(this.now(),decidedBy,id);
   return {applied:true,topup:this.topup(id)};
  });
 }

 recordRecognition(id,userId,applicantId,ok){this.db.prepare('INSERT OR IGNORE INTO recognitions(id,user_id,applicant_id,ok,created_at) VALUES(?,?,?,?,?)').run(id,userId,applicantId||null,ok?1:0,this.now())}
 recordEvent(userId,id,type,count){return this.db.prepare('INSERT OR IGNORE INTO events(user_id,id,type,count,created_at) VALUES(?,?,?,?,?)').run(userId,id,type,count,this.now()).changes>0}
 history(userId,limit=10){return this.db.prepare("SELECT amount,kind,note,created_at FROM ledger WHERE user_id=? AND kind<>'hold' ORDER BY id DESC LIMIT ?").all(userId,limit)}
 userStats(userId){
  const now=this.now(),periods={today:startOfDay(now),week:now-7*DAY,month:now-30*DAY,all:0};
  const out={};
  for(const [name,since] of Object.entries(periods)){
   out[name]={
    passports:this.db.prepare('SELECT COUNT(*) n FROM activations WHERE user_id=? AND created_at>=?').get(userId,since).n,
    reads:this.db.prepare('SELECT COUNT(*) n FROM recognitions WHERE user_id=? AND ok=1 AND created_at>=?').get(userId,since).n,
    ready:this.db.prepare("SELECT COALESCE(SUM(count),0) n FROM events WHERE user_id=? AND type='payment_ready' AND created_at>=?").get(userId,since).n,
    spent:-this.db.prepare("SELECT COALESCE(SUM(amount),0) n FROM ledger WHERE user_id=? AND kind='charge' AND created_at>=?").get(userId,since).n,
   };
  }
  return out;
 }
 adminStats(){
  const now=this.now(),since={today:startOfDay(now),month:now-30*DAY,all:0},out={
   users:this.db.prepare('SELECT COUNT(*) n FROM users').get().n,
   activeWeek:this.db.prepare('SELECT COUNT(DISTINCT user_id) n FROM activations WHERE created_at>=?').get(now-7*DAY).n,
   balances:this.db.prepare('SELECT COALESCE(SUM(balance),0) n FROM users').get().n,
   pendingTopups:this.db.prepare("SELECT COUNT(*) n FROM topups WHERE status='pending' AND receipt_file_id IS NOT NULL").get().n,
  };
  for(const [name,from] of Object.entries(since))out[name]={
   revenue:this.db.prepare("SELECT COALESCE(SUM(amount),0) n FROM topups WHERE status='approved' AND decided_at>=?").get(from).n,
   passports:this.db.prepare('SELECT COUNT(*) n FROM activations WHERE created_at>=?').get(from).n,
   ready:this.db.prepare("SELECT COALESCE(SUM(count),0) n FROM events WHERE type='payment_ready' AND created_at>=?").get(from).n,
  };
  return out;
 }
}
// Business day in Tashkent (UTC+5, no DST).
function startOfDay(now){const offset=5*3600000;return Math.floor((now+offset)/DAY)*DAY-offset}
