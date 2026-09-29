import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';

const schema=`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY,
 username TEXT, first_name TEXT, last_name TEXT,
 balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0),
 blocked INTEGER NOT NULL DEFAULT 0,
 state TEXT, state_data TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions(
 token_hash TEXT PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id),
 label TEXT, created_at INTEGER NOT NULL, last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS pairings(
 code TEXT PRIMARY KEY,
 user_id INTEGER, token TEXT,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id),
 amount INTEGER NOT NULL,
 kind TEXT NOT NULL,
 ref TEXT UNIQUE,
 note TEXT,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id,created_at);
CREATE TABLE IF NOT EXISTS activations(
 user_id INTEGER NOT NULL,
 applicant_id TEXT NOT NULL,
 passport_key TEXT NOT NULL,
 amount INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,applicant_id)
);
CREATE INDEX IF NOT EXISTS activations_passport ON activations(user_id,passport_key,created_at);
CREATE TABLE IF NOT EXISTS recognitions(
 id TEXT PRIMARY KEY,
 user_id INTEGER NOT NULL,
 applicant_id TEXT,
 ok INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS recognitions_user ON recognitions(user_id,created_at);
CREATE TABLE IF NOT EXISTS topups(
 id TEXT PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id),
 amount INTEGER NOT NULL,
 method TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 receipt_file_id TEXT, charge_id TEXT UNIQUE,
 created_at INTEGER NOT NULL, decided_at INTEGER, decided_by INTEGER
);
CREATE INDEX IF NOT EXISTS topups_user ON topups(user_id,created_at);
CREATE TABLE IF NOT EXISTS events(
 user_id INTEGER NOT NULL,
 id TEXT NOT NULL,
 type TEXT NOT NULL,
 count INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,id)
);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
`;

export function openDatabase(file){
 if(file!==':memory:')mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 const db=new DatabaseSync(file);
 db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 db.exec(schema);
 return db;
}

// node:sqlite is synchronous, so one IMMEDIATE transaction is atomic for this process.
export function transaction(db,fn){
 db.exec('BEGIN IMMEDIATE');
 try{const result=fn();db.exec('COMMIT');return result}
 catch(error){db.exec('ROLLBACK');throw error}
}

export function getSetting(db,key,fallback=null){const row=db.prepare('SELECT value FROM settings WHERE key=?').get(key);return row?JSON.parse(row.value):fallback}
export function setSetting(db,key,value){db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value))}
