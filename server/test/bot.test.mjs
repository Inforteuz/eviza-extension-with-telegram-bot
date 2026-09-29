import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {Billing} from '../src/billing.mjs';
import {Auth} from '../src/auth.mjs';
import {Bot} from '../src/bot.mjs';

const ADMIN=900,USER=100;
function setup(config={}){
 const db=openDatabase(':memory:'),billing=new Billing(db,{price:5000}),auth=new Auth(db),calls=[];
 const call=async(method,body)=>{calls.push({method,body});return {message_id:calls.length}};
 const bot=new Bot({billing,auth,call,botUsername:'evisa_test_bot',log:{warn(){},error(){}},config:{adminIds:[ADMIN],minTopup:20000,maxTopup:10000000,topupAmounts:[20000,50000],dedupeDays:30,welcomeBonus:0,paymentProviderToken:'provider:TEST',cardNumber:'8600 0000 0000 0000',cardHolder:'TEST HOLDER',supportUsername:'support',...config}});
 const from=id=>({id,first_name:'User'+id,is_bot:false});
 const text=(id,t)=>bot.handle({message:{message_id:1,from:from(id),chat:{id,type:'private'},text:t}});
 const click=(id,data,message={chat:{id,type:'private'},message_id:5})=>bot.handle({callback_query:{id:'cb',from:from(id),data,message}});
 const last=(method='sendMessage')=>calls.filter(c=>c.method===method).at(-1)?.body;
 return {db,billing,auth,bot,calls,text,click,last,from};
}

test('/start registers the user, shows price, balance and the persistent menu; groups are ignored',async()=>{
 const f=setup();
 await f.bot.handle({message:{from:f.from(5),chat:{id:-100,type:'group'},text:'/start'}});
 assert.equal(f.calls.length,0);
 await f.text(USER,'/start');
 assert.ok(f.billing.user(USER));assert.match(f.last().text,/5 000 so‘m/);assert.ok(f.last().reply_markup.keyboard);
});

test('pairing link asks for confirmation and binds the extension only after the button',async()=>{
 const f=setup();const {code}=f.auth.createPairing();
 await f.text(USER,'/start pair_'+code);
 assert.equal(f.auth.pairing(code).user_id,null);
 assert.equal(f.last().reply_markup.inline_keyboard[0][0].callback_data,'pair:'+code);
 await f.click(USER,'pair:'+code);
 assert.equal(f.auth.collectPairing(code).status,'ok');
 await f.text(USER,'/start pair_'+code);assert.match(f.last().text,/eskirgan/);
});

test('Telegram payment: invoice, validated pre-checkout and a single credit even if the update repeats',async()=>{
 const f=setup({cardNumber:''});
 await f.text(USER,'/start');await f.click(USER,'amt:50000');
 const invoice=f.last('sendInvoice');assert.equal(invoice.currency,'UZS');assert.equal(invoice.prices[0].amount,5000000);
 const payload=invoice.payload;
 await f.bot.handle({pre_checkout_query:{id:'q1',from:f.from(USER),currency:'UZS',total_amount:4000000,invoice_payload:payload}});
 assert.equal(f.last('answerPreCheckoutQuery').ok,false,'amount mismatch');
 await f.bot.handle({pre_checkout_query:{id:'q2',from:f.from(999),currency:'UZS',total_amount:5000000,invoice_payload:payload}});
 assert.equal(f.last('answerPreCheckoutQuery').ok,false,'foreign user');
 await f.bot.handle({pre_checkout_query:{id:'q3',from:f.from(USER),currency:'UZS',total_amount:5000000,invoice_payload:payload}});
 assert.equal(f.last('answerPreCheckoutQuery').ok,true);
 const paid={message:{from:f.from(USER),chat:{id:USER,type:'private'},successful_payment:{currency:'UZS',total_amount:5000000,invoice_payload:payload,telegram_payment_charge_id:'tg-1',provider_payment_charge_id:'p-1'}}};
 await f.bot.handle(paid);await f.bot.handle(paid);
 assert.equal(f.billing.user(USER).balance,50000);
 assert.equal(f.calls.filter(c=>c.method==='sendMessage'&&c.body.chat_id===ADMIN).length,1,'admin informed once');
});

test('card transfer: receipt goes to admins, only an admin can approve, and approval credits once',async()=>{
 const f=setup({paymentProviderToken:''});
 await f.text(USER,'/start');await f.click(USER,'amt:custom');await f.text(USER,'abc');
 assert.match(f.last().text,/raqam/);
 await f.text(USER,'5000');assert.match(f.last().text,/dan/,'below minimum');
 await f.text(USER,'75 000');assert.match(f.last().text,/8600 0000 0000 0000/);
 await f.bot.handle({message:{from:f.from(USER),chat:{id:USER,type:'private'},photo:[{file_id:'small'},{file_id:'big'}]}});
 const toAdmin=f.last('sendPhoto');assert.equal(toAdmin.chat_id,ADMIN);assert.equal(toAdmin.photo,'big');
 const approve=toAdmin.reply_markup.inline_keyboard[0][0].callback_data;
 await f.click(USER,approve);assert.equal(f.billing.user(USER).balance,0,'user cannot approve own receipt');
 await f.click(ADMIN,approve,{chat:{id:ADMIN,type:'private'},message_id:7,caption:'chek'});
 await f.click(ADMIN,approve,{chat:{id:ADMIN,type:'private'},message_id:7,caption:'chek'});
 assert.equal(f.billing.user(USER).balance,75000);
 assert.ok(f.calls.some(c=>c.method==='editMessageCaption'&&/Tasdiqlandi/.test(c.body.caption)));
 assert.ok(f.calls.some(c=>c.method==='sendMessage'&&c.body.chat_id===USER&&/tasdiqlandi/.test(c.body.text)));
});

test('admin commands change price and balances; the same commands do nothing for users',async()=>{
 const f=setup();
 await f.text(USER,'/start');await f.text(ADMIN,'/start');
 await f.text(USER,'/narx 1');assert.equal(f.billing.price(),5000);
 await f.text(ADMIN,'/narx 7000');assert.equal(f.billing.price(),7000);
 await f.text(ADMIN,`/qoshish ${USER} 30000 bonus`);assert.equal(f.billing.user(USER).balance,30000);
 await f.text(ADMIN,`/qoshish ${USER} -40000`);assert.equal(f.billing.user(USER).balance,30000);
 await f.text(ADMIN,`/bloklash ${USER}`);assert.equal(f.billing.user(USER).blocked,1);
 await f.text(USER,'/balans');assert.match(f.last().text,/bloklangan/);
});

test('token button issues a working token and revoke-all disconnects every device',async()=>{
 const f=setup();await f.text(USER,'/start');
 await f.click(USER,'tok:new');const token=f.last().text.match(/evx_[\w-]+/)[0];
 assert.equal(f.auth.verify(token).id,USER);
 await f.click(USER,'tok:revoke!');assert.equal(f.auth.verify(token),null);
});
