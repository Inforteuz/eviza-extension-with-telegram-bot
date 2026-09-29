// End-to-end: real Chromium + unpacked extension + real server modules
// (billing, auth, API, bot with a fake Telegram transport) + mock Saudi site.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {chromium} from 'playwright-core';
import {openDatabase} from '../server/src/db.mjs';
import {Billing} from '../server/src/billing.mjs';
import {Auth} from '../server/src/auth.mjs';
import {Bot} from '../server/src/bot.mjs';
import {createApi} from '../server/src/api.mjs';
import {createMockSaudi} from './mock-saudi.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sharp=createRequire(path.join(root,'server/package.json'))('sharp');
const executablePath=process.env.CHROMIUM_PATH||['/opt/pw-browsers/chromium-1194/chrome-linux/chrome','/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
const USER=100;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

let dump=async()=>{};
async function waitFor(fn,{timeout=60000,label='condition'}={}){
 const start=Date.now();let last;
 while(Date.now()-start<timeout){last=await fn();if(last)return last;await sleep(250)}
 await dump().catch(()=>{});
 throw Error('Timed out waiting for '+label);
}
const people=[
 {firstName:'ALISHER',middleName:'BAKHODIROVICH',lastName:'KARIMOV',gender:'Male',birthDate:'1985-03-14',nationality:'Uzbekistan',birthCountry:'',birthCity:'ANDIJAN REGION',passportNumber:'FA1234567',issueDate:'2022-05-10',expiryDate:'2032-05-09',passportIssuePlace:'Uzbekistan'},
 {firstName:'MALIKA',middleName:'',lastName:'YUSUPOVA',gender:'Female',birthDate:'1992-11-02',nationality:'UZBEKISTAN',birthCountry:'Uzbekistan',birthCity:'TASHKENT CITY',passportNumber:'FB7654321',issueDate:'2023-01-20',expiryDate:'2033-01-19',passportIssuePlace:'Uzbekistan'},
 {firstName:'DILSHOD',middleName:'',lastName:'RAHIMOV',gender:'Male',birthDate:'1978-07-30',nationality:'Uzbekistan',birthCountry:'Uzbekistan',birthCity:'SAMARKAND REGION',passportNumber:'FC1112223',issueDate:'2021-09-01',expiryDate:'2031-08-31',passportIssuePlace:'Uzbekistan'},
];

async function setup(t){
 // Server
 const db=openDatabase(':memory:'),billing=new Billing(db,{price:5000}),auth=new Auth(db),tg=[];
 const bot=new Bot({billing,auth,call:async(method,body)=>{tg.push({method,body});return {}},config:{adminIds:[900],dedupeDays:30,minTopup:20000,maxTopup:1e7,topupAmounts:[]},botUsername:'evisa_test_bot',log:{warn(){},error(){}}});
 billing.upsertUser({id:USER,first_name:'Operator',username:'operator'});billing.credit(USER,100000,'topup','seed');
 const portrait=await sharp(Buffer.from(Array.from({length:200*200*3},(_,i)=>(i*37)%251)),{raw:{width:200,height:200,channels:3}}).jpeg({quality:90}).toBuffer();
 assert.ok(portrait.length>=5000&&portrait.length<=100000);
 const passportsBySha=new Map(),images=[];
 for(const [i,p] of people.entries()){
  const bytes=await sharp({create:{width:900,height:620,channels:3,background:{r:40*i,g:120,b:200-40*i}}}).jpeg().toBuffer();
  passportsBySha.set(createHash('sha256').update(bytes).digest('hex'),p);images.push({name:`passport-${i+1}.jpg`,mimeType:'image/jpeg',buffer:bytes});
 }
 const recognize=async(bytes,{portraitOnly})=>{
  const p=passportsBySha.get(createHash('sha256').update(bytes).digest('hex'));
  return {data:portraitOnly?{}:{...p},notes:['Pasport matni AI orqali o‘qildi.'],conflicts:[],unverifiedMrz:false,aiError:p?null:'Noma’lum rasm',portrait:portrait.toString('base64'),portraitError:null};
 };
 const api=createApi({billing,auth,bot,config:{dedupeDays:30},botUsername:'evisa_test_bot',recognize,log:{error:e=>console.error(e)}});
 const server=http.createServer(api);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const serverUrl=`http://127.0.0.1:${server.address().port}`;
 // Browser
 const profile=mkdtempSync(path.join(tmpdir(),'evisa-e2e-'));
 const context=await chromium.launchPersistentContext(profile,{...(executablePath?{executablePath}:{channel:'chromium'}),headless:true,args:[`--disable-extensions-except=${path.join(root,'extension')}`,`--load-extension=${path.join(root,'extension')}`,'--no-first-run']});
 t.after(async()=>{await context.close();server.close();rmSync(profile,{recursive:true,force:true})});
 const mock=createMockSaudi();
 await context.route('https://visa.visitsaudi.com/**',route=>mock.handle(route));
 await context.route('https://t.me/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<h1>Telegram</h1>'}));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const extensionId=new URL(worker.url()).host;
 const panel=await context.newPage();
 panel.on('pageerror',e=>console.error('panel error:',e.message));
 await panel.goto(`chrome-extension://${extensionId}/src/panel/panel.html`);
 const storage=key=>worker.evaluate(k=>chrome.storage.local.get(k).then(r=>r[k]),key);
 dump=async()=>{const run=await storage('run'),log=await storage('log'),apps=await storage('applicants');console.error('DIAG',JSON.stringify({run,log:log?.slice(-20),apps:apps?.map(a=>({s:a.status,n:a.note,e:a.error,m:a.missing})),pages:context.pages().map(p=>p.url())},null,1))};
 return {db,billing,auth,bot,tg,serverUrl,context,panel,worker,storage,mock,images};
}

test('pair via Telegram, read passports, fill individual applications and a group up to payment',{timeout:240000},async t=>{
 const f=await setup(t);const {panel,mock,storage}=f;
 // The real site takes seconds to open the personal form after “Apply For Individual”.
 mock.site.latency['/Visa/PersonalInfo']=2500;

 // 1. Pair through the bot deep link.
 await panel.fill('#serverUrl',f.serverUrl);
 await panel.click('#pairBtn');
 const pairing=await waitFor(()=>storage('pairing'),{label:'pairing'});
 assert.match(pairing.botUrl,/^https:\/\/t\.me\/evisa_test_bot\?start=pair_/);
 await f.bot.handle({message:{from:{id:USER,first_name:'Operator'},chat:{id:USER,type:'private'},text:'/start pair_'+pairing.code}});
 await f.bot.handle({callback_query:{id:'cb',from:{id:USER,first_name:'Operator'},data:'pair:'+pairing.code,message:{chat:{id:USER,type:'private'},message_id:1}}});
 await waitFor(()=>panel.isVisible('#mainView'),{label:'main view'});
 await waitFor(async()=>(await panel.textContent('#accBalance')).includes('100 000'),{label:'balance'});

 // 2. Upload two passports; each is read once and charged once.
 await panel.setInputFiles('#fileInput',f.images.slice(0,2));
 await waitFor(async()=>{const list=await storage('applicants');return list?.length===2&&list.every(a=>a.status==='review')},{label:'recognition'});
 assert.equal(f.billing.user(USER).balance,90000);
 let list=await storage('applicants');
 assert.equal(list[0].data.firstName,'ALISHER');assert.equal(list[0].data.visitPurpose,'Umrah');assert.equal(list[0].data.accommodationName,'Al Jabriy');
 assert.equal(list[0].data.birthCountry,'Uzbekistan','birthplace-derived country');
 assert.ok(list[0].suggestions.some(s=>s.field==='profession'),'profession suggestion shown, not stored');
 assert.equal(list[0].data.profession,'');

 // 3. Confirm both (accepting suggestions) and start the individual run.
 panel.on('dialog',d=>d.accept());
 await panel.click('#confirmAllBtn');
 await waitFor(async()=>(await storage('applicants')).every(a=>a.status==='confirmed'),{label:'confirmation'});
 list=await storage('applicants');assert.equal(list[0].data.profession,'None');
 const saudi=await f.context.newPage();await saudi.goto('https://visa.visitsaudi.com/Visa/Index');await saudi.bringToFront();
 await panel.click('#startBtn');
 await waitFor(async()=>(await storage('run'))?.state==='waiting',{label:'first applicant ready',timeout:90000});
 list=await storage('applicants');
 assert.equal(list[0].status,'payment_ready');assert.equal(list[1].status,'confirmed');
 assert.match(saudi.url(),/\/Visa\/Review\//);
 const first=[...mock.site.apps.values()][0];
 assert.equal(first.personal.FirstName,'ALISHER');assert.equal(first.personal.Nationality,'Uzbekistan');assert.equal(first.personal.BirthDate,'14/03/1985');
 assert.equal(first.passport.PassportNo,'FA1234567');assert.equal(first.passport.Purpose,'Umrah');assert.equal(first.passport.HotelName,'Al Jabriy');
 assert.ok(first.portrait.jpeg&&first.portrait.size>5000,'portrait uploaded');
 assert.equal(list[0].result.applicationNumber,first.number);
 assert.equal(mock.site.payClicks,0);

 // 4. Continue after the operator's payment; the second applicant uses the uppercase nationality.
 await panel.click('#startBtn');
 await waitFor(async()=>(await storage('run'))?.state==='done',{label:'second applicant ready',timeout:90000});
 list=await storage('applicants');assert.ok(list.every(a=>a.status==='payment_ready'));
 const second=[...mock.site.apps.values()][1];assert.equal(second.personal.Nationality,'Uzbekistan');assert.equal(second.personal.Gender,'Female');
 assert.equal(mock.site.payClicks,0);
 assert.equal(f.db.prepare("SELECT COALESCE(SUM(count),0) n FROM events WHERE user_id=?").get(USER).n,2);
 assert.ok(f.tg.some(c=>c.method==='sendMessage'&&/to‘lovga tayyor/.test(c.body.text)),'Telegram notification');

 // 5. Group of three: the first two passports are re-uploaded (free within 30 days) plus a new one.
 await panel.click('#clearBtn');
 await waitFor(async()=>(await storage('applicants')).length===0,{label:'clear'});
 await panel.setInputFiles('#fileInput',f.images);
 await waitFor(async()=>{const l=await storage('applicants');return l?.length===3&&l.every(a=>a.status==='review')},{label:'group recognition'});
 assert.equal(f.billing.user(USER).balance,85000,'only the new passport is charged');
 const shots=process.env.SCREENSHOT_DIR;
 if(shots){await panel.setViewportSize({width:380,height:760});await sleep(500);await panel.screenshot({path:path.join(shots,'panel-review.png')});await panel.click('#list .item button[title="Ko‘rish va tahrirlash"]');await sleep(500);await panel.screenshot({path:path.join(shots,'panel-editor.png'),fullPage:true});await panel.click('#editorBack')}
 await panel.click('#confirmAllBtn');
 await waitFor(async()=>(await storage('applicants')).every(a=>a.status==='confirmed'),{label:'group confirmation'});
 await panel.check('input[name=mode][value=group]',{force:true});
 await panel.fill('#groupName','Umra oktabr');await panel.press('#groupName','Tab');
 await saudi.goto('https://visa.visitsaudi.com/Visa/Index');
 await panel.click('#startBtn');
 if(shots){await waitFor(async()=>/\/Visa\/PassportInfo\//.test(saudi.url()),{label:'filling'});await sleep(1500);await panel.screenshot({path:path.join(shots,'panel-running.png')});await saudi.screenshot({path:path.join(shots,'saudi-overlay.png')})}
 await waitFor(async()=>{const r=await storage('run');if(r?.state==='attention')throw Error('Run stopped: '+r.message);return r?.state==='done'},{label:'group ready',timeout:150000});
 if(shots){await sleep(500);await panel.screenshot({path:path.join(shots,'panel-done.png')})}
 const group=[...mock.site.apps.values()].filter(a=>a.group==='Umra oktabr');
 assert.equal(group.length,3);assert.deepEqual(group.map(a=>a.passport.PassportNo),['FA1234567','FB7654321','FC1112223']);
 assert.ok(group.every(a=>a.stage==='review'));
 list=await storage('applicants');assert.ok(list.every(a=>a.status==='payment_ready'&&a.result.groupName==='Umra oktabr'));
 assert.match((await storage('run')).message,/1206\.63 SAR/);
 assert.equal(mock.site.payClicks,0);
});

test('a signed-out operator is asked to log in and the run continues after login; a rate limit stops the run',{timeout:180000},async t=>{
 const f=await setup(t);const {panel,mock,storage}=f;
 const token=f.auth.issue(USER);
 await panel.fill('#serverUrl',f.serverUrl);
 await panel.click('.token-box summary');await panel.fill('#tokenInput',token);await panel.click('#tokenBtn');
 await waitFor(()=>panel.isVisible('#mainView'),{label:'main view'});
 await panel.setInputFiles('#fileInput',f.images.slice(2,3));
 await waitFor(async()=>(await storage('applicants'))?.[0]?.status==='review',{label:'recognition'});
 const id=(await storage('applicants'))[0].id;
 panel.on('dialog',d=>d.accept());
 await panel.click(`#list .item button[title="Tasdiqlash"]`);
 await waitFor(async()=>(await storage('applicants'))[0].status==='confirmed',{label:'confirm'});

 mock.site.loggedIn=false;
 const saudi=await f.context.newPage();await saudi.goto('https://visa.visitsaudi.com/Visa/Index');
 assert.match(saudi.url(),/\/Login/);
 await saudi.bringToFront();
 await panel.click('#startBtn');
 await waitFor(async()=>/Saudi akkauntiga kiring/.test((await storage('run'))?.message||''),{label:'login request'});
 assert.equal(mock.site.apps.size,0,'nothing is filled before login');
 // Operator signs in on the same tab.
 await saudi.fill('#Email','operator@example.com');await saudi.fill('#Password','secret');await saudi.click('button[type=submit]');
 await waitFor(async()=>(await storage('run'))?.state==='done',{label:'ready after login',timeout:90000});
 assert.equal((await storage('applicants'))[0].status,'payment_ready');
 assert.equal(mock.site.payClicks,0);

 // Rate limit: the run stops with the site pause message instead of retrying.
 await panel.click('button[title="Yangi ariza sifatida qayta to‘ldirish"]');
 await waitFor(async()=>(await storage('applicants'))[0].status==='confirmed',{label:'reset'});
 mock.site.rateLimited=true;
 await panel.click('#startBtn');
 await waitFor(async()=>(await storage('run'))?.state==='attention',{label:'rate limit stop'});
 assert.match((await storage('run')).message,/1015\/429/);
 assert.equal((await storage('applicants')).find(a=>a.id===id).status,'confirmed');
});
