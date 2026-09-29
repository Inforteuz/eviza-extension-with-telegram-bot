import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {defaultPython,windowsInitialConfig} from '../agent/platform.mjs';
test('Windows configuration uses the target interpreter and requires fresh account connections',()=>{
 const python=String.raw`C:\Users\Operator Name\AppData\Local\eVisa Operator\python\Scripts\python.exe`;
 const config=windowsInitialConfig(python);assert.equal(config.PYTHON_BIN,python);assert.equal(config.BROWSER_CHANNEL,'msedge');assert.equal(config.RUN_MODE,'telegram');assert.equal(config.TELEGRAM_BOT_TOKEN,'');assert.equal(config.OPENAI_API_KEY,'');assert.equal(config.PANEL_URL,'');assert.equal(config.HEADLESS,'0');assert.equal(defaultPython('win32'),'python.exe');assert.equal(defaultPython('darwin'),'python3');
 for(const bad of ['/Users/test/python','python.exe','C:\\python.cmd'])assert.throws(()=>windowsInitialConfig(bad));
});
test('child process paths containing spaces and Unicode are passed without shell interpretation',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'evisa operator Ω '));t.after(()=>rm(dir,{recursive:true,force:true}));const script=path.join(dir,'image helper.mjs');await writeFile(script,"process.stdin.on('data',b=>process.stdout.write(b))");
 const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script],{windowsHide:true,stdio:['pipe','pipe','pipe']});let text='';child.stdout.on('data',b=>text+=b);child.on('error',reject);child.on('close',code=>code===0?resolve(text):reject(Error('child failed')));child.stdin.end('pasport');});assert.equal(result,'pasport');
});
