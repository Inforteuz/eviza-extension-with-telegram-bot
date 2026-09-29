import {mkdir,writeFile,chmod,readFile,cp,readdir,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import path from 'node:path';
import {agentRoot,readConfig} from './config.mjs';

// launchd owns the worker so closing Codex or a terminal does not stop the bot.
if(process.platform!=='darwin')throw Error('Windows uchun windows/Install.cmd faylini ishga tushiring.');
const label='uz.evisa.operator',domain='gui/'+process.getuid();
const config=await readConfig();if(config.RUN_MODE!=='telegram')throw Error('Avval mustaqil Telegram rejimiga o‘ting.');
const base=path.join(homedir(),'Library','Application Support','eVisa Operator'),installedAgent=path.join(base,'agent');
const check=spawnSync('/bin/launchctl',['print',domain+'/'+label],{encoding:'utf8'});
if(/state = running/.test(check.stdout||''))throw Error('Avval faol botni to‘xtating. Ishlayotgan ma’lumotlar ustiga yozilmaydi.');
if(check.status===0){const out=spawnSync('/bin/launchctl',['bootout',domain+'/'+label],{encoding:'utf8'});if(out.status!==0)throw Error('Eski xizmatni to‘xtatib bo‘lmadi.');}
await mkdir(installedAgent,{recursive:true,mode:0o700});await mkdir(path.join(base,'lib'),{recursive:true,mode:0o700});await mkdir(path.join(base,'bin'),{recursive:true,mode:0o700});
for(const f of await readdir(agentRoot))if(/\.(mjs|js|py|json|txt|html|onnx)$/.test(f))await cp(path.join(agentRoot,f),path.join(installedAgent,f));
await cp(path.join(agentRoot,'node_modules'),path.join(installedAgent,'node_modules'),{recursive:true,verbatimSymlinks:true});
await cp(path.join(agentRoot,'..','lib','domain.ts'),path.join(base,'lib','domain.ts'));
await cp(process.execPath,path.join(base,'bin','node'));await chmod(path.join(base,'bin','node'),0o755);
let hasData=false;try{await access(path.join(installedAgent,'data','config.json'));hasData=true}catch{}
if(!hasData){
 await cp(path.join(agentRoot,'data'),path.join(installedAgent,'data'),{recursive:true});
 if(config.PYTHON_BIN?.includes('portrait-venv/bin/')){
  const pythonRoot=path.dirname(path.dirname(config.PYTHON_BIN));await cp(pythonRoot,path.join(base,'python'),{recursive:true,verbatimSymlinks:true});
  config.PYTHON_BIN=path.join(base,'python','bin',path.basename(config.PYTHON_BIN));
 }
 await writeFile(path.join(installedAgent,'data','config.json'),JSON.stringify(config,null,2),{mode:0o600});
}
await chmod(path.join(installedAgent,'data'),0o700);await chmod(path.join(installedAgent,'data','config.json'),0o600);
const logDir=path.join(installedAgent,'data','standalone');await mkdir(logDir,{recursive:true,mode:0o700});
const log=path.join(logDir,'worker.log');await writeFile(log,'',{flag:'a',mode:0o600});await chmod(log,0o600);
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const xml=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${escape(path.join(base,'bin','node'))}</string><string>${escape(path.join(installedAgent,'index.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${escape(installedAgent)}</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>15</integer>
<key>ExitTimeOut</key><integer>90</integer>
<key>StandardOutPath</key><string>${escape(log)}</string><key>StandardErrorPath</key><string>${escape(log)}</string>
<key>Umask</key><integer>63</integer>
</dict></plist>`;
const agents=path.join(homedir(),'Library','LaunchAgents'),file=path.join(agents,label+'.plist');
await mkdir(agents,{recursive:true});
let existing='';try{existing=await readFile(file,'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
if(existing&&!existing.includes(escape(path.join(agentRoot,'index.mjs')))&&!existing.includes(escape(path.join(installedAgent,'index.mjs'))))throw Error('Boshqa loyiha xizmati mavjud; almashtirilmadi.');
await writeFile(file,xml,{mode:0o600});await chmod(file,0o600);
const r=spawnSync('/bin/launchctl',['bootstrap',domain,file],{encoding:'utf8'});if(r.status!==0)throw Error('Mac xizmati ishga tushmadi: '+String(r.stderr).slice(0,400));
await new Promise(r=>setTimeout(r,3000));
const status=spawnSync('/bin/launchctl',['print',domain+'/'+label],{encoding:'utf8'}).stdout;
if(!/state = running/.test(status))throw Error('Mac xizmati hali ishlamayapti. Xizmat jurnalini tekshiring.');
console.log(JSON.stringify({ok:true,label,pid:status.match(/\n\s*pid = (\d+)/)?.[1],autoStartAtLogin:true,independentOfCodex:true,runtimeDirectory:base}));
