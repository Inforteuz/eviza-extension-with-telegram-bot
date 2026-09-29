import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

test('the server starts, registers commands, answers /start through long polling and serves the API',{timeout:30000},async t=>{
 const calls=[];let delivered=false;
 const telegram=http.createServer(async(req,res)=>{
  let body='';for await(const c of req)body+=c;const method=req.url.split('/').pop();calls.push({method,body:body?JSON.parse(body):{}});
  const result=method==='getMe'?{id:1,is_bot:true,username:'evisa_test_bot'}:method==='getUpdates'?(delivered?[]:(delivered=true,[{update_id:10,message:{message_id:1,from:{id:100,first_name:'Test'},chat:{id:100,type:'private'},text:'/start'}}])):method==='sendMessage'?{message_id:2}:true;
  if(method==='getUpdates'&&delivered&&calls.filter(c=>c.method==='getUpdates').length>1)await sleep(300);
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,result}));
 });
 await new Promise(ok=>telegram.listen(0,'127.0.0.1',ok));
 const data=mkdtempSync(path.join(tmpdir(),'evisa-start-'));
 const port=20000+Math.floor(Math.random()*20000);
 const child=spawn(process.execPath,['src/index.mjs'],{cwd:root,env:{...process.env,TELEGRAM_BOT_TOKEN:'123456:TEST_TOKEN_abcdefghijklmnopqrstuvwxyz',TELEGRAM_API_BASE:`http://127.0.0.1:${telegram.address().port}`,ADMIN_IDS:'900',PORT:String(port),HOST:'127.0.0.1',DATA_DIR:data,OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
 t.after(()=>{child.kill();telegram.close();rmSync(data,{recursive:true,force:true})});
 const start=Date.now();let health;
 while(Date.now()-start<15000){try{health=await (await fetch(`http://127.0.0.1:${port}/health`)).json();break}catch{await sleep(200)}}
 assert.deepEqual(health,{ok:true},output);
 while(Date.now()-start<15000&&!calls.some(c=>c.method==='sendMessage'))await sleep(100);
 const hello=calls.find(c=>c.method==='sendMessage');
 assert.equal(hello.body.chat_id,100);assert.match(hello.body.text,/eVisa Auto-Filler/);
 assert.ok(calls.some(c=>c.method==='setMyCommands'&&c.body.scope?.chat_id===900),'admin commands');
 const pair=await (await fetch(`http://127.0.0.1:${port}/api/ext/pair`,{method:'POST'})).json();
 assert.match(pair.botUrl,/t\.me\/evisa_test_bot\?start=pair_/);
 const later=calls.filter(c=>c.method==='getUpdates').at(-1);assert.equal(later.body.offset,11,'offset persisted after handling');
});
