import {createHash,randomBytes} from 'node:crypto';
import {transaction} from './db.mjs';

const hash=token=>createHash('sha256').update(token).digest('hex');
export const PAIR_TTL=10*60000;
const MAX_SESSIONS=10;

// Extension tokens are stored hashed; the plain value is shown only once.
export class Auth {
 constructor(db,{now=()=>Date.now()}={}){this.db=db;this.now=now}
 #insert(userId,label){
  const token='evx_'+randomBytes(32).toString('base64url');
  this.db.prepare('INSERT INTO sessions(token_hash,user_id,label,created_at) VALUES(?,?,?,?)').run(hash(token),userId,label,this.now());
  // Keep only the newest sessions per user.
  this.db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?)').run(userId,userId,MAX_SESSIONS);
  return token;
 }
 issue(userId,label='Kengaytma'){return transaction(this.db,()=>this.#insert(userId,label))}
 verify(token){
  if(typeof token!=='string'||!/^evx_[\w-]{43}$/.test(token))return null;
  const row=this.db.prepare('SELECT s.token_hash,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?').get(hash(token));
  if(!row)return null;
  this.db.prepare('UPDATE sessions SET last_used_at=? WHERE token_hash=?').run(this.now(),row.token_hash);
  return row;
 }
 revoke(token){return this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(String(token))).changes>0}
 revokeAll(userId){return this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId).changes}
 sessionCount(userId){return this.db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(userId).n}

 // Deep-link pairing: extension creates a code, the user confirms it in the bot,
 // the extension collects its token once.
 createPairing(){
  const code=randomBytes(12).toString('base64url');
  this.db.prepare('DELETE FROM pairings WHERE expires_at<?').run(this.now());
  this.db.prepare('INSERT INTO pairings(code,created_at,expires_at) VALUES(?,?,?)').run(code,this.now(),this.now()+PAIR_TTL);
  return {code,expiresAt:this.now()+PAIR_TTL};
 }
 pairing(code){const row=this.db.prepare('SELECT * FROM pairings WHERE code=?').get(String(code));return row&&row.expires_at>=this.now()?row:null}
 confirmPairing(code,userId){
  return transaction(this.db,()=>{
   const row=this.pairing(code);if(!row||row.user_id)return false;
   this.db.prepare('UPDATE pairings SET user_id=?,token=? WHERE code=?').run(userId,this.#insert(userId,'Kengaytma (Telegram orqali)'),code);
   return true;
  });
 }
 collectPairing(code){
  return transaction(this.db,()=>{
   const row=this.pairing(code);if(!row)return {status:'expired'};
   if(!row.token)return {status:'pending'};
   this.db.prepare('DELETE FROM pairings WHERE code=?').run(code);
   return {status:'ok',token:row.token};
  });
 }
}
