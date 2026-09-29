import test from 'node:test';
import assert from 'node:assert/strict';
import {assertGroupName,addMemberControl,verifyGroupPayment} from '../src/flow/group-review.js';
import {Attention} from '../src/flow/errors.js';
import {prepareGroup} from '../src/flow/group-visa.js';
test('group only uses the uniquely labelled add-person control, never the payment button',()=>{
 const button={tag:'button',id:'observed-add',text:'ADD ANOTHER APPLICANT'};
 assert.equal(addMemberControl({controls:[button,{tag:'button',text:'AGREE & COMPLETE PAYMENT'}]}),button);
 const observed={tag:'button',id:'btnAddMoreToGroup',text:'Save & Add Applicant'};
 assert.equal(addMemberControl({controls:[observed,{tag:'a',text:'SAVE'},{tag:'button',text:'AGREE & COMPLETE PAYMENT'}]}),observed);
 assert.equal(addMemberControl({controls:[{...observed,text:' + Save & Add Applicant '}]}).id,observed.id);
 for(const text of ['SAVE','Save & Complete Payment','Save & Add Applicant and Pay','DISCARD'])assert.throws(()=>addMemberControl({controls:[{...observed,text}]}),Attention);
 assert.throws(()=>addMemberControl({controls:[{tag:'button',text:'AGREE & COMPLETE PAYMENT'}]}),Attention);
 assert.throws(()=>addMemberControl({controls:[button,button]}),Attention);
 assert.throws(()=>assertGroupName('Group Name : other','test'),Attention);
});
test('group payment needs every confirmed member, unique application IDs, matching passports, count and amount',()=>{
 const group={name:'test',members:[{id:'a',group_confirmation:'a-sig',data:{firstName:'A',passportNumber:'ZZ0000001'}},{id:'b',group_confirmation:'b-sig',data:{firstName:'B',passportNumber:'ZZ0000002'}}]};
 const checkpoint={members:{a:{phase:'complete',confirmation:'a-sig',applicationNumber:'111',proof:{checkedFields:23}},b:{phase:'complete',confirmation:'b-sig',applicationNumber:'222',proof:{checkedFields:23}}}};
 const report={text:'Group Name : test\nTotal Applicants :2\nZZ0000001\nZZ0000002\nChoose your payment method\nTotal Amount 804.42 SAR'};
 assert.equal(verifyGroupPayment(report,group,checkpoint).memberCount,2);
 for(const [from,to] of [['test','wrong'],['Applicants :2','Applicants :1'],['ZZ0000002','missing'],['Total Amount','Unknown']])assert.throws(()=>verifyGroupPayment({text:report.text.replace(from,to)},group,checkpoint),Attention);
 const changed=structuredClone(group);changed.members[1].group_confirmation='edited';assert.throws(()=>verifyGroupPayment(report,changed,checkpoint),Attention);
 checkpoint.members.b.applicationNumber='111';assert.throws(()=>verifyGroupPayment(report,group,checkpoint),Attention);
});
test('group discovery never fills or submits passports even when unconfirmed members exist',async()=>{
 let url='https://visa.visitsaudi.com/Visa/Index',fills=0;
 const page={locator:()=>({innerText:async()=>''}),url:()=>url,goto:async u=>url=u,getByRole:()=>({isVisible:async()=>true,fill:async()=>{fills++}}),evaluate:async()=>({text:'Group Name : test',controls:[]})};
 const group={id:'test',name:'test',job_type:'group_probe',checkpoint:{entryUrl:'https://visa.visitsaudi.com/Visa/PersonalInfo?gName=test'},members:[{id:'a',data:{}}]};
 await assert.rejects(prepareGroup(page,group,{set:()=>{}},{progress:async()=>{},checkpoint:async()=>{},portraitFor:async()=>{throw Error('must not read passport')}}),e=>e instanceof Attention&&e.status==='needs_input');assert.equal(fills,0);
});
