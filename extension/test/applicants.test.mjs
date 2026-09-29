import test from 'node:test';
import assert from 'node:assert/strict';
import {newApplicant,mergeRecognition,normalizeData,derive,confirmationFor,readyToRun,previewData} from '../src/lib/applicants.js';
import {Store} from '../src/lib/store.js';
import {operatorTripTemplate} from '../src/lib/domain.js';

const id='11111111-1111-4111-8111-111111111111';
const read={data:{firstName:'Ali',lastName:'Valiyev',middleName:'',nationality:'Uzbekistan',birthDate:'1990-01-01',gender:'Male',birthCountry:'',birthCity:'ANDIJAN REGION',passportNumber:'fa 1234567',issueDate:'2022-01-01',expiryDate:'2032-01-01',passportIssuePlace:'Uzbekistan'},notes:['ok'],aiError:null,portrait:'x'};

test('an AI read fills identity fields, trip template and suggestions without inventing facts',()=>{
 const a=mergeRecognition(newApplicant({id,tripDefaults:operatorTripTemplate}),read,operatorTripTemplate);
 assert.equal(a.data.passportNumber,'FA1234567');assert.equal(a.data.firstName,'ALI');
 assert.equal(a.data.visitPurpose,'Umrah');assert.equal(a.data.birthCountry,'Uzbekistan');
 assert.equal(a.data.profession,'','a suggestion is not stored as data');
 assert.ok(a.suggestions.some(s=>s.field==='profession'&&s.value==='None'));
 assert.equal(previewData(a).profession,'None');
 assert.equal(a.status,'review');
});

test('a re-read keeps operator edits for fields the AI could not read',()=>{
 const base=mergeRecognition(newApplicant({id}),read,{});
 const edited={...base,data:{...base.data,birthCity:'TOSHKENT'}};
 const again=mergeRecognition(edited,{...read,data:{...read.data,birthCity:''}},{});
 assert.equal(again.data.birthCity,'TOSHKENT');
});

test('confirmation is bound to the exact data and portrait',async()=>{
 const a=derive({...newApplicant({id,source:'manual'}),data:normalizeData({...previewData(mergeRecognition(newApplicant({id}),read,operatorTripTemplate)),maritalStatus:'Married'}),hasPortrait:true,portraitHash:'p1'});
 const confirmed={...a,status:'confirmed',confirmation:await confirmationFor(a.data,'p1')};
 assert.equal(await readyToRun(confirmed),true);
 assert.equal(await readyToRun({...confirmed,portraitHash:'p2'}),false);
 assert.equal(await readyToRun({...confirmed,data:{...confirmed.data,firstName:'OTHER'}}),false);
});

test('store writes keep order and flow snapshots stay out of storage',async()=>{
 const saved={};const area={get:async keys=>Object.fromEntries([].concat(keys).filter(k=>k in saved).map(k=>[k,structuredClone(saved[k])])),set:async v=>{await new Promise(r=>setTimeout(r,Math.random()*5));Object.assign(saved,structuredClone(v))},remove:async keys=>{for(const k of [].concat(keys))delete saved[k]}};
 const store=await new Store(area).load();
 await Promise.all([1,2,3,4,5].map(n=>store.log('entry '+n)));
 assert.deepEqual(saved.log.map(l=>l.text),['entry 1','entry 2','entry 3','entry 4','entry 5']);
 const flow=store.flowState();flow.set('draft:'+id,'{"x":1}');flow.set('group-report:'+id,'big');await flow.flush();
 assert.equal(saved.flow['draft:'+id],'{"x":1}');assert.equal(saved.flow['group-report:'+id],undefined);assert.equal(flow.get('group-report:'+id),'big');
 await store.clearFlow(id);assert.deepEqual(saved.flow,{});
});
