import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {Billing} from '../src/billing.mjs';
import {Auth} from '../src/auth.mjs';
import {Bot,menu,adminMenu} from '../src/bot.mjs';

const ADMIN=900,USER=100;
function setup(config={}){
 const db=openDatabase(':memory:'),billing=new Billing(db,{price:5000}),auth=new Auth(db),calls=[];
 const call=async(method,body)=>{calls.push({method,body});return {message_id:calls.length}};
 const bot=new Bot({billing,auth,call,botUsername:'evisa_test_bot',log:{warn(){},error(){}},sleep:async()=>{},config:{adminIds:[ADMIN],minTopup:20000,maxTopup:10000000,topupAmounts:[20000,50000],dedupeDays:30,welcomeBonus:0,paymentProviderToken:'provider:TEST',cardNumber:'8600 0000 0000 0000',cardHolder:'TEST HOLDER',supportUsername:'support',...config}});
 const from=id=>({id,first_name:'User'+id,is_bot:false});
 const text=(id,t)=>bot.handle({message:{message_id:1,from:from(id),chat:{id,type:'private'},text:t}});
 const click=(id,data,message={chat:{id,type:'private'},message_id:5,text:'…'})=>bot.handle({callback_query:{id:'cb',from:from(id),data,message}});
 const last=(method='sendMessage')=>calls.filter(c=>c.method===method).at(-1)?.body;
 // What the user sees last: a new message or the edited one.
 const shown=()=>calls.filter(c=>c.method==='sendMessage'||c.method==='editMessageText').at(-1)?.body;
 return {db,billing,auth,bot,calls,text,click,last,shown,from};
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
 await f.click(USER,'tok:new');const token=f.shown().text.match(/evx_[\w-]+/)[0];
 assert.equal(f.auth.verify(token).id,USER);
 await f.click(USER,'tok:revoke!');assert.equal(f.auth.verify(token),null);
});

test('pressed buttons disappear: pairing, revoke and amount choices replace their message',async()=>{
 const f=setup();await f.text(USER,'/start');
 const {code}=f.auth.createPairing();await f.text(USER,'/start pair_'+code);
 f.calls.length=0;await f.click(USER,'pair:'+code);
 assert.deepEqual(f.calls.map(c=>c.method),['answerCallbackQuery','deleteMessage','sendMessage']);
 assert.equal(f.calls[1].body.message_id,5);assert.match(f.last().text,/ulandi/);assert.ok(f.last().reply_markup.keyboard,'main menu comes back');
 await f.click(USER,'pairno');assert.equal(f.last('editMessageText').message_id,5);assert.equal(f.last('editMessageText').reply_markup,undefined);
 await f.click(USER,'tok:revoke');assert.equal(f.last('editMessageText').reply_markup.inline_keyboard[0][0].callback_data,'tok:revoke!');
 await f.click(USER,'tok:keep');assert.match(f.shown().text,/Bekor/);assert.equal(f.shown().reply_markup,undefined);
 await f.click(USER,'topup');assert.ok(f.shown().reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='amt:custom'));
 await f.click(USER,'amt:50000');const choice=f.last('editMessageText');assert.match(choice.text,/usulini/);
 f.calls.length=0;await f.click(USER,'pay:tg:50000');
 assert.equal(f.last('editMessageText').reply_markup,undefined,'method buttons removed before the invoice');assert.ok(f.last('sendInvoice'));
});

test('a decided receipt loses its buttons, also on another admin copy',async()=>{
 const f=setup({paymentProviderToken:'',adminIds:[ADMIN,901]});
 await f.text(USER,'/start');await f.click(USER,'amt:50000');
 await f.bot.handle({message:{from:f.from(USER),chat:{id:USER,type:'private'},photo:[{file_id:'r'}]}});
 const data=f.last('sendPhoto').reply_markup.inline_keyboard[0][1].callback_data;
 await f.click(ADMIN,data,{chat:{id:ADMIN,type:'private'},message_id:7,caption:'chek <b>'});
 const edit=f.last('editMessageCaption');assert.deepEqual(edit.reply_markup,{inline_keyboard:[]});assert.match(edit.caption,/Rad etildi/);assert.match(edit.caption,/&lt;b&gt;/);
 await f.click(901,data.replace('rj','ap'),{chat:{id:901,type:'private'},message_id:8,caption:'chek'});
 assert.equal(f.billing.user(USER).balance,0);assert.match(f.last('editMessageCaption').caption,/Rad etilgan/);
});

test('/admin opens the reply keyboard panel; users never see it',async()=>{
 const f=setup();await f.text(USER,'/start');await f.text(ADMIN,'/start');
 assert.ok(f.last().reply_markup.keyboard.flat().some(b=>b.text===menu.admin),'admin sees the panel button');
 await f.text(USER,'/start');assert.equal(f.last().reply_markup.keyboard.flat().some(b=>b.text===menu.admin),false);
 await f.text(USER,'/admin');assert.doesNotMatch(f.last().text,/Admin panel/);
 await f.text(USER,adminMenu.users);assert.doesNotMatch(f.last().text,/Foydalanuvchilar/);
 await f.text(ADMIN,'/admin');
 const panel=f.last();assert.match(panel.text,/Admin panel/);assert.match(panel.text,/Foydalanuvchilar: <b>2<\/b>/);
 assert.deepEqual(panel.reply_markup.keyboard.flat().map(b=>b.text),Object.values(adminMenu));
 await f.text(ADMIN,adminMenu.dashboard);assert.equal(f.last().reply_markup.inline_keyboard[0][0].callback_data,'adm:dash');
 await f.text(ADMIN,adminMenu.system);assert.match(f.last().text,/Tizim holati/);assert.match(f.last().text,/•••• 0000/);assert.doesNotMatch(f.last().text,/8600/);
 await f.text(ADMIN,adminMenu.back);assert.ok(f.last().reply_markup.keyboard.flat().some(b=>b.text===menu.connect));
 await f.click(USER,'adm:dash');assert.equal(f.last('answerCallbackQuery').show_alert,true);
});

test('admin panel: paginated users, search, user card actions and price',async()=>{
 const f=setup();await f.text(ADMIN,'/start');
 for(let i=1;i<=10;i++)f.billing.upsertUser({id:USER+i,first_name:'Ali'+i,username:'ali'+i});
 f.billing.upsertUser({id:555,first_name:'Vali',last_name:'Karimov',username:'vali_k'});
 await f.text(ADMIN,adminMenu.users);
 let list=f.last();assert.match(list.text,/12 ta/);assert.equal(list.reply_markup.inline_keyboard.length,9,'8 users + navigation');
 assert.equal(list.reply_markup.inline_keyboard.at(-1)[0].callback_data,'adm:users:1');
 await f.click(ADMIN,'adm:users:1');list=f.last('editMessageText');assert.match(list.text,/Sahifa 2\/2/);
 await f.text(ADMIN,adminMenu.find);await f.text(ADMIN,'nobody');assert.match(f.last().text,/topilmadi/);
 await f.text(ADMIN,'@VALI_K');let card=f.last();assert.match(card.text,/Vali Karimov/);assert.match(card.text,/<code>555<\/code>/);
 await f.text(ADMIN,adminMenu.find);await f.text(ADMIN,'karim');assert.match(f.last().text,/Vali Karimov/);
 await f.text(ADMIN,adminMenu.find);await f.text(ADMIN,'ali');assert.match(f.last().text,/Topildi: 10/);
 await f.text(ADMIN,adminMenu.find);await f.bot.handle({message:{message_id:3,from:f.from(ADMIN),chat:{id:ADMIN,type:'private'},text:'hi',forward_origin:{type:'user',sender_user:{id:555}}}});assert.match(f.last().text,/Vali/);
 await f.click(ADMIN,'adm:add:555');await f.text(ADMIN,'50 000 naqd to‘lov');
 assert.equal(f.billing.user(555).balance,50000);assert.ok(f.calls.some(c=>c.body?.chat_id===555&&/\+50 000/.test(c.body.text)),'user notified');
 assert.match(f.billing.history(555)[0].note,/naqd to‘lov/);
 await f.click(ADMIN,'adm:sub:555');await f.text(ADMIN,'90000');assert.match(f.last().text,/yetarli emas/);
 await f.text(ADMIN,'20000');assert.equal(f.billing.user(555).balance,30000);
 const token=f.auth.issue(555,'t');
 await f.click(ADMIN,'adm:block:555');assert.equal(f.billing.user(555).blocked,1);assert.equal(f.auth.verify(token),null);
 card=f.last('editMessageText');assert.equal(card.reply_markup.inline_keyboard[1][0].callback_data,'adm:unblock:555');
 await f.click(ADMIN,'adm:unblock:555');assert.equal(f.billing.user(555).blocked,0);
 await f.click(ADMIN,'adm:block:'+ADMIN);assert.equal(f.billing.user(ADMIN).blocked,0,'admins cannot be blocked');
 await f.click(ADMIN,'adm:hist:555');assert.match(f.last().text,/oxirgi operatsiyalar/);
 await f.text(ADMIN,adminMenu.price);await f.text(ADMIN,'abc');assert.equal(f.billing.price(),5000);
 await f.text(ADMIN,'7 500');assert.equal(f.billing.price(),7500);
 await f.text(ADMIN,adminMenu.price);await f.text(ADMIN,adminMenu.users);assert.equal(f.billing.state(ADMIN),null,'menu press leaves the prompt');
 await f.text(ADMIN,adminMenu.find);await f.click(ADMIN,'adm:cancel');assert.equal(f.billing.state(ADMIN),null);assert.match(f.shown().text,/Bekor/);
});

test('broadcast copies the message to active users after confirmation, in the background',async()=>{
 const f=setup();await f.text(ADMIN,'/start');
 for(const id of [1,2,3])f.billing.upsertUser({id,first_name:'U'+id});
 f.billing.setBlocked(3,true);
 await f.text(ADMIN,adminMenu.broadcast);
 await f.bot.handle({message:{message_id:42,from:f.from(ADMIN),chat:{id:ADMIN,type:'private'},photo:[{file_id:'p'}],caption:'Yangilik'}});
 const confirm=f.last();assert.match(confirm.text,/<b>2<\/b> ta/);assert.equal(confirm.reply_markup.inline_keyboard[0][0].callback_data,'adm:bc:42');
 assert.equal(f.calls.filter(c=>c.method==='copyMessage').length,0,'nothing sent before confirmation');
 await f.click(ADMIN,'adm:bc:42');await f.bot.broadcasting;
 const copies=f.calls.filter(c=>c.method==='copyMessage').map(c=>c.body);
 assert.deepEqual(copies.map(c=>c.chat_id),[1,2]);assert.ok(copies.every(c=>c.from_chat_id===ADMIN&&c.message_id===42));
 assert.match(f.last().text,/Yetkazildi: <b>2<\/b>/);
});
