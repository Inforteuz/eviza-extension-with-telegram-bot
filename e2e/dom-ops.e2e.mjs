// The content-script DOM operations against a real Chromium DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const executablePath=process.env.CHROMIUM_PATH||['/opt/pw-browsers/chromium-1194/chrome-linux/chrome','/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
const html=`<!doctype html><body>
<label for="c1">City of Birth <span>*</span></label><input id="c1" value="ANDIJAN">
<label for="c2">City <span>*</span></label><input id="c2" value="">
<div style="display:none"><button type="button">Next</button></div>
<button type="submit">Next</button>
<label for="g">Gender</label><select id="g"><option value="">Select</option><option>Male</option><option>Female</option></select>
<select class="ui-datepicker-year" title="Change the year"><option>1990</option><option>1991</option></select>
<a id="btnAddMoreToGroup" href="/Visa/PersonalInfo?gName=x">Save &amp; Add Applicant</a>
<button id="discard" type="button">DISCARD</button>
<button id="btnPay" type="button">AGREE &amp; COMPLETE PAYMENT</button>
<button id="other" type="button">Pay later</button>
<input type="checkbox" id="t"><label for="t">I HAVE READ AND AGREE ALL THE ABOVE TERMS AND CONDITIONS.</label>
<aside data-evisa-script="1"><button type="button">Next</button></aside>
</body>`;

test('DOM operations match Playwright-style names and refuse payment in a real page',{timeout:60000},async t=>{
 const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chromium'}),headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();
 await page.route('https://visa.visitsaudi.com/**',r=>r.fulfill({status:200,contentType:'text/html',body:html}));
 await page.goto('https://visa.visitsaudi.com/Visa/Review/11111111-1111-1111-1111-111111111111');
 await page.addScriptTag({path:path.join(root,'extension/src/content/dom-ops.js')});
 const op=command=>page.evaluate(c=>{try{const r=globalThis.evisaDomOperation(c);return {value:r.value,click:!!r.click,navigate:r.navigate}}catch(e){return {error:e.message,code:e.code}}},command);
 const el=(selector,operation,value)=>op({action:'element',selector,operation,value});
 assert.equal((await el([{role:'textbox',name:'City',exact:true}],'value')).value,'','exact label, asterisk removed');
 assert.equal((await el([{role:'textbox',name:'City of Birth',exact:true}],'value')).value,'ANDIJAN');
 assert.equal((await el([{role:'button',name:'Next',exact:true}],'count')).value,1,'hidden and own-UI buttons are ignored');
 assert.equal((await el([{role:'combobox',name:'Change the year',exact:true}],'count')).value,1,'title gives the name');
 assert.equal((await el([{role:'combobox',name:'Gender',exact:true}],'select','Female')).value,true);
 assert.equal(await page.$eval('#g',s=>s.value),'Female');
 assert.equal((await el([{role:'combobox',name:'Gender',exact:true}],'select','Other')).code,'option_not_found');
 assert.equal((await el([{role:'textbox',name:'City',exact:true}],'type','Andijan')).value,true);
 assert.equal(await page.$eval('#c2',i=>i.value),'Andijan');
 assert.equal((await el([{role:'checkbox',name:{regex:'^I HAVE READ AND AGREE ALL THE ABOVE TERMS AND CONDITIONS\\.?$',flags:'i'}}],'click')).value,true);
 assert.equal(await page.$eval('#t',c=>c.checked),true);
 assert.equal((await el([{css:'#btnAddMoreToGroup'}],'click')).click,true,'Save & Add is allowed');
 for(const id of ['#btnPay','#other'])assert.equal((await el([{css:id}],'click')).code,'payment');
 assert.equal((await el([{css:'#discard'}],'click')).code,'forbidden');
 assert.match((await op({action:'goto',target:'https://visa.visitsaudi.com/Payment/Pay'})).error,/manzili/);
 const snap=(await op({action:'snapshot'})).value;
 assert.ok(snap.controls.some(c=>c.id==='btnPay'));assert.ok(!snap.text.includes('\nNext\nNext'),'own overlay hidden from page text');
});
