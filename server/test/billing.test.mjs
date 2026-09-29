import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {Billing,InsufficientBalance} from '../src/billing.mjs';
import {Auth} from '../src/auth.mjs';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
function setup(options={}){
 let now=Date.UTC(2026,8,29,10);const db=openDatabase(':memory:');
 const billing=new Billing(db,{price:5000,now:()=>now,...options}),auth=new Auth(db,{now:()=>now});
 billing.upsertUser({id:1,first_name:'Test'});
 return {db,billing,auth,tick:ms=>{now+=ms}};
}

test('welcome bonus is granted once and topups are idempotent by reference',()=>{
 const {billing}=setup({welcomeBonus:3000});
 billing.upsertUser({id:2,first_name:'New'});billing.upsertUser({id:2,first_name:'New'});
 assert.equal(billing.user(2).balance,3000);
 const t=billing.createTopup(2,50000,'card');
 assert.equal(billing.completeTopup(t.id,{decidedBy:9}).applied,true);
 assert.equal(billing.completeTopup(t.id,{decidedBy:9}).applied,false);
 assert.equal(billing.user(2).balance,53000);
 const r=billing.createTopup(2,10000,'card');billing.rejectTopup(r.id,9);
 assert.equal(billing.completeTopup(r.id).applied,false);assert.equal(billing.user(2).balance,53000);
});

test('a hold reserves the price, a readable passport is charged once and a repeat upload is free',()=>{
 const {billing}=setup();billing.credit(1,12000,'topup','t1');
 const h1=billing.hold(1,5000,'h1');assert.equal(billing.user(1).balance,7000);
 assert.deepEqual(billing.finalizeHold(h1,{userId:1,applicantId:A,passportNumber:'AB1234567'}),{charged:5000,activated:true});
 assert.equal(billing.user(1).balance,7000);
 // Same passport as a new applicant within the dedupe window: hold is returned.
 const h2=billing.hold(1,5000,'h2');
 assert.equal(billing.finalizeHold(h2,{userId:1,applicantId:B,passportNumber:'ab1234567'}).charged,0);
 assert.equal(billing.user(1).balance,7000);assert.equal(billing.activated(1,B),true);
 // Unreadable passport: nothing is charged and the applicant stays unpaid.
 const h3=billing.hold(1,5000,'h3');
 assert.deepEqual(billing.finalizeHold(h3,{userId:1,applicantId:C,passportNumber:''}),{charged:0,activated:false});
 assert.equal(billing.user(1).balance,7000);
 assert.equal(billing.history(1).filter(r=>r.kind==='charge').length,1);
});

test('holds cannot overdraw, and stale holds from a crash are returned',()=>{
 const {billing,tick}=setup();billing.credit(1,6000,'topup','t1');
 billing.hold(1,5000,'h1');
 assert.throws(()=>billing.hold(1,5000,'h2'),InsufficientBalance);
 tick(11*60000);assert.equal(billing.releaseStaleHolds(),1);assert.equal(billing.user(1).balance,6000);
});

test('manual activation uses the same once-per-passport rule and dedupe expires',()=>{
 const {billing,tick}=setup({dedupeDays:30});billing.credit(1,20000,'topup','t1');
 assert.equal(billing.activate(1,A,'AB1234567').charged,5000);
 assert.equal(billing.activate(1,A,'AB1234567').charged,0);
 assert.equal(billing.activate(1,B,'AB1234567').charged,0);
 tick(31*86400000);
 assert.equal(billing.activate(1,C,'AB1234567').charged,5000);
 assert.equal(billing.user(1).balance,10000);
 assert.throws(()=>billing.activate(1,'44444444-4444-4444-8444-444444444444','bad!'),/Pasport raqami/);
 billing.setPrice(15000);assert.throws(()=>billing.activate(1,'55555555-5555-4555-8555-555555555555','CD7654321'),InsufficientBalance);
});

test('admin adjustments cannot make a balance negative',()=>{
 const {billing}=setup();billing.credit(1,1000,'topup','t1');
 assert.throws(()=>billing.adjust(1,-2000,'x',9),InsufficientBalance);
 assert.equal(billing.adjust(1,-1000,'x',9).balance,0);
});

test('tokens are stored hashed, verified, revocable and pairing tokens are collected once',()=>{
 const {db,auth,tick}=setup();
 const token=auth.issue(1);
 assert.equal(auth.verify(token).id,1);assert.equal(auth.verify(token+'x'),null);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE token_hash=?').get(token).n,0,'plain token is never stored');
 auth.revoke(token);assert.equal(auth.verify(token),null);
 const {code}=auth.createPairing();
 assert.deepEqual(auth.collectPairing(code),{status:'pending'});
 assert.equal(auth.confirmPairing(code,1),true);assert.equal(auth.confirmPairing(code,1),false);
 const collected=auth.collectPairing(code);assert.equal(collected.status,'ok');assert.equal(auth.verify(collected.token).id,1);
 assert.equal(auth.collectPairing(code).status,'expired');
 const late=auth.createPairing();tick(11*60000);assert.equal(auth.confirmPairing(late.code,1),false);
});
