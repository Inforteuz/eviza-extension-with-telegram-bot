import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureLogin} from '../src/flow/visa.js';
import {detectSaudiRateLimit,SaudiRateLimit,assertSaudiPageAvailable} from '../src/flow/rate-limit.js';
const errorPage='Error 1015\nYou are being rate limited\nRay ID: a3c79bcf2994eec9';
test('rate limiting is recognized with no invented expiry and respects Retry-After seconds or dates',()=>{
 const now=1789642841000,limit=detectSaudiRateLimit(errorPage,0,'',now);assert.equal(limit.code,1015);assert.equal(limit.notBefore,null);assert.equal(limit.rayId,'a3c79bcf2994eec9');
 assert.equal(detectSaudiRateLimit('',429,'3600',now).notBefore,now+3600000);
 const later=now+7200000;assert.equal(detectSaudiRateLimit('',429,new Date(later).toUTCString(),now).notBefore,later);
 for(const bad of ['','invalid','-10'])assert.equal(detectSaudiRateLimit('',429,bad,now).notBefore,null);
 assert.equal(detectSaudiRateLimit('Application No. 1015 total 429 SAR'),null);
 assert.equal(detectSaudiRateLimit('Captcha verification'),null);
});

test('an already blocked page makes zero navigation or form requests, including a resumed group login',async()=>{
 let navigations=0,forms=0;
 const page={url:()=> 'https://visa.visitsaudi.com/Visa/Index',locator:()=>({innerText:async()=>errorPage}),goto:async()=>{navigations++},getByRole:()=>{forms++;throw Error('must not touch form')}};
 await assert.rejects(ensureLogin(page,{}),SaudiRateLimit);assert.equal(navigations,0);assert.equal(forms,0);
});

test('first blocked navigation stops immediately and unrelated pages are never inspected',async()=>{
 let content='Welcome',navigations=0;
 const page={url:()=> 'https://visa.visitsaudi.com/Visa/Index',locator:()=>({innerText:async()=>content}),goto:async()=>{navigations++;content=errorPage;return {status:()=>429,headers:()=>({'retry-after':'60'})}},getByRole:(role,{name})=>{assert.equal(role,'link');assert.equal(name,'Apply For Individual');return {isVisible:async()=>false}}};
 await assert.rejects(ensureLogin(page,{}),e=>e instanceof SaudiRateLimit&&e.rateLimit.notBefore>Date.now());assert.equal(navigations,1);
 await assertSaudiPageAvailable({url:()=> 'https://unrelated.example/private',locator:()=>{throw Error('must not read')}});
});
