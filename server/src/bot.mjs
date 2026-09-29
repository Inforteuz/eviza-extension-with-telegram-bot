import {InsufficientBalance} from './billing.mjs';

export const menu={connect:'🔌 Kengaytmani ulash',balance:'💰 Balans',topup:'➕ Balansni to‘ldirish',stats:'📊 Statistika',history:'🧾 Tarix',help:'❓ Yordam'};
export const userCommands=[
 {command:'start',description:'Bosh menyu'},
 {command:'ulash',description:'Kengaytmani ulash / token'},
 {command:'balans',description:'Balans va narx'},
 {command:'tolov',description:'Balansni to‘ldirish'},
 {command:'statistika',description:'Statistika'},
 {command:'tarix',description:'To‘lovlar tarixi'},
 {command:'yordam',description:'Yordam'},
];
export const adminCommands=[
 {command:'admin',description:'Admin: umumiy statistika'},
 {command:'narx',description:'Admin: narx — /narx 5000'},
 {command:'qoshish',description:'Admin: balans — /qoshish ID 50000 izoh'},
 {command:'user',description:'Admin: foydalanuvchi — /user ID'},
 {command:'kutilayotgan',description:'Admin: tasdiq kutayotgan cheklar'},
 {command:'bloklash',description:'Admin: bloklash — /bloklash ID'},
 {command:'ochish',description:'Admin: blokdan chiqarish — /ochish ID'},
];
export const som=n=>String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,' ')+' so‘m';
const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]);
const time=ms=>new Date(ms).toLocaleString('uz-UZ',{timeZone:'Asia/Tashkent',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const kindLabel={topup:'To‘lov',charge:'Pasport',bonus:'Bonus',admin:'Administrator',refund:'Qaytarildi'};
const parseAmount=text=>{const n=Number(String(text).replace(/[\s_.,]|so['‘’]?m/gi,''));return Number.isSafeInteger(n)?n:NaN};

export class Bot {
 constructor({billing,auth,call,config,botUsername='',log=console}){Object.assign(this,{billing,auth,call,config,botUsername,log})}
 isAdmin(id){return this.config.adminIds.includes(Number(id))}
 keyboard(){return {keyboard:[[{text:menu.connect},{text:menu.balance}],[{text:menu.topup},{text:menu.stats}],[{text:menu.history},{text:menu.help}]],resize_keyboard:true,is_persistent:true}}
 async send(chatId,text,extra={}){return this.call('sendMessage',{chat_id:chatId,text,parse_mode:'HTML',link_preview_options:{is_disabled:true},...extra})}
 // Notifications must never break the caller (the user may have blocked the bot).
 async notify(userId,text,extra={}){try{await this.send(userId,text,extra);return true}catch(error){this.log.warn?.('Telegram xabari yuborilmadi:',error.status||error.message);return false}}
 support(){return this.config.supportUsername?'@'+this.config.supportUsername:'administrator'}

 async handle(update){
  try{
   if(update.pre_checkout_query)return await this.onPreCheckout(update.pre_checkout_query);
   if(update.callback_query)return await this.onCallback(update.callback_query);
   if(update.message)return await this.onMessage(update.message);
  }catch(error){this.log.error?.('Bot xatosi:',error.message)}
 }

 async onMessage(m){
  if(m.chat?.type!=='private'||!m.from||m.from.is_bot)return;
  const {user,created}=this.billing.upsertUser(m.from);
  if(user.blocked)return this.send(m.chat.id,'Hisobingiz vaqtincha bloklangan. Yordam: '+esc(this.support()));
  if(m.successful_payment)return this.onPaid(m);
  const state=this.billing.state(user.id);
  if(state?.name==='await_receipt'&&(m.photo||m.document))return this.onReceipt(m,state.data);
  const text=(m.text||'').trim();
  const [command,...args]=text.split(/\s+/);const cmd=command.replace(/@\w+$/,'').toLowerCase();
  if(cmd==='/start'){
   this.billing.setState(user.id,null);
   const payload=args[0]||'';
   if(payload.startsWith('pair_'))return this.askPairing(m.chat.id,payload.slice(5));
   if(payload==='topup')return this.topupMenu(m.chat.id);
   return this.welcome(m.chat.id,user,created);
  }
  if(cmd==='/bekor'){this.billing.setState(user.id,null);return this.send(m.chat.id,'Bekor qilindi.',{reply_markup:this.keyboard()})}
  if(this.isAdmin(user.id)&&cmd.startsWith('/')){const handled=await this.onAdmin(m.chat.id,user.id,cmd,args);if(handled!==false)return}
  if(cmd==='/ulash'||text===menu.connect)return this.connectInfo(m.chat.id);
  if(cmd==='/balans'||text===menu.balance)return this.balance(m.chat.id,user.id);
  if(cmd==='/tolov'||text===menu.topup)return this.topupMenu(m.chat.id);
  if(cmd==='/statistika'||text===menu.stats)return this.stats(m.chat.id,user.id);
  if(cmd==='/tarix'||text===menu.history)return this.history(m.chat.id,user.id);
  if(cmd==='/yordam'||text===menu.help)return this.help(m.chat.id);
  if(state?.name==='await_amount'){
   const amount=parseAmount(text);
   if(!Number.isFinite(amount))return this.send(m.chat.id,'Summani faqat raqam bilan yozing, masalan: <b>75000</b>. Bekor qilish: /bekor');
   return this.chooseAmount(m.chat.id,user.id,amount);
  }
  if(state?.name==='await_receipt')return this.send(m.chat.id,'To‘lov chekining rasmini (skrinshot) yuboring. Bekor qilish: /bekor');
  return this.send(m.chat.id,'Quyidagi menyudan tanlang.',{reply_markup:this.keyboard()});
 }

 async welcome(chatId,user,created){
  const price=this.billing.price();
  const lines=[`Assalomu alaykum, <b>${esc(user.first_name||'foydalanuvchi')}</b>!`,'','<b>eVisa Auto-Filler</b> — Saudi eVisa (visa.visitsaudi.com) arizalarini pasport rasmidan avtomatik to‘ldiradigan brauzer kengaytmasi. Ariza to‘lov sahifasigacha tayyorlanadi, to‘lovni operator o‘zi bajaradi.','',`💳 Narx: <b>${som(price)}</b> / 1 pasport`,`💰 Balansingiz: <b>${som(user.balance)}</b>`];
  if(created&&this.config.welcomeBonus>0)lines.push('',`🎁 Sizga ${som(this.config.welcomeBonus)} bonus berildi.`);
  lines.push('','Boshlash uchun “🔌 Kengaytmani ulash”ni bosing.');
  return this.send(chatId,lines.join('\n'),{reply_markup:this.keyboard()});
 }
 async connectInfo(chatId){
  const install=this.config.extensionUrl?`<a href="${esc(this.config.extensionUrl)}">Kengaytmani o‘rnating</a> (Chrome yoki Edge).`:'Kengaytmani o‘rnating (Chrome yoki Edge). O‘rnatish fayli uchun '+esc(this.support())+' ga murojaat qiling.';
  const text=['<b>Kengaytmani ulash</b>','',`1. ${install}`,'2. Kengaytma panelida <b>“Telegram orqali ulash”</b>ni bosing — shu bot ochiladi va tasdiq so‘raydi.','','Yoki pastdagi tugma bilan token oling va uni panelning “Token bilan ulash” maydoniga joylang.'].join('\n');
  return this.send(chatId,text,{reply_markup:{inline_keyboard:[[{text:'🔑 Token olish',callback_data:'tok:new'}],[{text:'🚪 Barcha qurilmalarni uzish',callback_data:'tok:revoke'}]]}});
 }
 async balance(chatId,userId){
  const user=this.billing.user(userId),price=this.billing.price();
  const lines=[`💰 Balans: <b>${som(user.balance)}</b>`,`📄 Narx: <b>${som(price)}</b> / 1 pasport`];
  if(price>0)lines.push(`≈ ${Math.floor(user.balance/price)} ta pasportga yetadi`);
  return this.send(chatId,lines.join('\n'),{reply_markup:{inline_keyboard:[[{text:menu.topup,callback_data:'topup'}]]}});
 }
 methods(){return {telegram:!!this.config.paymentProviderToken,card:!!this.config.cardNumber}}
 async topupMenu(chatId){
  const methods=this.methods();
  if(!methods.telegram&&!methods.card)return this.send(chatId,'To‘lov usullari hali sozlanmagan. Balansni to‘ldirish uchun '+esc(this.support())+' ga yozing.');
  const amounts=this.config.topupAmounts.filter(a=>a>=this.config.minTopup&&a<=this.config.maxTopup);
  const rows=[];for(let i=0;i<amounts.length;i+=2)rows.push(amounts.slice(i,i+2).map(a=>({text:som(a),callback_data:'amt:'+a})));
  rows.push([{text:'✍️ Boshqa summa',callback_data:'amt:custom'}]);
  return this.send(chatId,`Qancha summaga to‘ldirasiz?\nNarx: ${som(this.billing.price())} / 1 pasport`,{reply_markup:{inline_keyboard:rows}});
 }
 async chooseAmount(chatId,userId,amount){
  if(!Number.isSafeInteger(amount)||amount<this.config.minTopup||amount>this.config.maxTopup){
   this.billing.setState(userId,'await_amount');
   return this.send(chatId,`Summa ${som(this.config.minTopup)} dan ${som(this.config.maxTopup)} gacha bo‘lishi kerak. Qaytadan yozing yoki /bekor.`);
  }
  this.billing.setState(userId,null);
  const methods=this.methods();
  if(methods.telegram&&methods.card)return this.send(chatId,`${som(amount)} — to‘lov usulini tanlang:`,{reply_markup:{inline_keyboard:[[{text:'💳 Click / Payme (Telegram)',callback_data:'pay:tg:'+amount}],[{text:'🧾 Kartaga o‘tkazma (chek bilan)',callback_data:'pay:card:'+amount}]]}});
  return methods.telegram?this.invoice(chatId,userId,amount):this.cardInstructions(chatId,userId,amount);
 }
 async invoice(chatId,userId,amount){
  const topup=this.billing.createTopup(userId,amount,'telegram');
  try{
   await this.call('sendInvoice',{chat_id:chatId,title:'Balansni to‘ldirish',description:`eVisa Auto-Filler balansi: ${som(amount)}`,payload:'topup:'+topup.id,provider_token:this.config.paymentProviderToken,currency:'UZS',prices:[{label:'Balans',amount:amount*100}],start_parameter:'topup'});
  }catch(error){
   this.billing.rejectTopup(topup.id,0);
   this.log.warn?.('Invoice yuborilmadi:',error.description||error.message);
   return this.send(chatId,'To‘lov oynasini ochib bo‘lmadi'+(/amount/i.test(error.description||'')?' (summa to‘lov tizimi chegarasidan tashqarida)':'')+'. Boshqa summa tanlang yoki '+esc(this.support())+' ga yozing.');
  }
 }
 async cardInstructions(chatId,userId,amount){
  const topup=this.billing.createTopup(userId,amount,'card');
  this.billing.setState(userId,'await_receipt',{topupId:topup.id});
  const lines=['<b>Kartaga o‘tkazma</b>','',`Summa: <b>${som(amount)}</b>`,`Karta: <code>${esc(this.config.cardNumber)}</code>`];
  if(this.config.cardHolder)lines.push(`Egasi: ${esc(this.config.cardHolder)}`);
  lines.push('','O‘tkazmani bajarib, <b>chek rasmini (skrinshot) shu chatga yuboring</b>. Administrator tasdiqlagach balans to‘ldiriladi.','Bekor qilish: /bekor');
  return this.send(chatId,lines.join('\n'));
 }
 async onReceipt(m,data){
  const topup=data?.topupId&&this.billing.topup(data.topupId);
  if(!topup||topup.user_id!==m.from.id||topup.status!=='pending'){this.billing.setState(m.from.id,null);return this.send(m.chat.id,'Bu to‘lov so‘rovi eskirgan. “➕ Balansni to‘ldirish” orqali qayta boshlang.')}
  const photo=m.photo?.at(-1),doc=m.document;
  if(doc&&!/^(image\/|application\/pdf)/.test(doc.mime_type||''))return this.send(m.chat.id,'Chekni rasm yoki PDF ko‘rinishida yuboring.');
  const fileId=photo?.file_id||doc.file_id;
  this.billing.attachReceipt(topup.id,fileId);this.billing.setState(m.from.id,null);
  const caption=[`🧾 <b>Yangi chek</b> — ${som(topup.amount)}`,`Foydalanuvchi: ${esc(m.from.first_name||'')} ${m.from.username?'@'+esc(m.from.username):''} (<code>${m.from.id}</code>)`,`So‘rov: <code>${topup.id}</code>`].join('\n');
  const reply_markup={inline_keyboard:[[{text:'✅ Tasdiqlash',callback_data:'ap:'+topup.id},{text:'❌ Rad etish',callback_data:'rj:'+topup.id}]]};
  let delivered=0;
  for(const admin of this.config.adminIds){
   try{await this.call(photo?'sendPhoto':'sendDocument',{chat_id:admin,[photo?'photo':'document']:fileId,caption,parse_mode:'HTML',reply_markup});delivered++}catch(error){this.log.warn?.('Adminga chek yuborilmadi:',error.status||error.message)}
  }
  return this.send(m.chat.id,delivered?'✅ Chek administratorga yuborildi. Tasdiqlangach sizga xabar keladi.':'Chekni administratorga yuborib bo‘lmadi. '+esc(this.support())+' ga yozing.');
 }
 async onPreCheckout(q){
  const topup=q.invoice_payload?.startsWith('topup:')&&this.billing.topup(q.invoice_payload.slice(6));
  const ok=!!topup&&topup.status==='pending'&&topup.method==='telegram'&&topup.user_id===q.from.id&&q.currency==='UZS'&&q.total_amount===topup.amount*100;
  return this.call('answerPreCheckoutQuery',{pre_checkout_query_id:q.id,ok,...(ok?{}:{error_message:'To‘lov so‘rovi eskirgan. Botda qaytadan boshlang.'})});
 }
 async onPaid(m){
  const p=m.successful_payment,id=p.invoice_payload?.startsWith('topup:')?p.invoice_payload.slice(6):'';
  const topup=id&&this.billing.topup(id);
  if(!topup||topup.user_id!==m.from.id||p.currency!=='UZS'){this.log.error?.('Noma’lum to‘lov:',p.telegram_payment_charge_id);return this.send(m.chat.id,'To‘lov qabul qilindi, lekin so‘rov topilmadi. '+esc(this.support())+' ga murojaat qiling, to‘lov ID: <code>'+esc(p.telegram_payment_charge_id)+'</code>')}
  const result=this.billing.completeTopup(id,{chargeId:p.telegram_payment_charge_id,amount:Math.floor(p.total_amount/100)});
  if(result.applied)for(const admin of this.config.adminIds)await this.notify(admin,`💳 Telegram to‘lovi: +${som(result.topup.amount)} — <code>${m.from.id}</code>`);
  return this.send(m.chat.id,`✅ Balans to‘ldirildi: <b>+${som(result.topup.amount)}</b>\n💰 Joriy balans: <b>${som(result.balance)}</b>`,{reply_markup:this.keyboard()});
 }
 async stats(chatId,userId){
  const s=this.billing.userStats(userId),row=(name,x)=>`<b>${name}</b>: ${x.passports} pasport, ${x.ready} ariza to‘lovga tayyor, sarf ${som(x.spent)}`;
  return this.send(chatId,['📊 <b>Statistika</b>','',row('Bugun',s.today),row('7 kun',s.week),row('30 kun',s.month),row('Jami',s.all)].join('\n'));
 }
 async history(chatId,userId){
  const rows=this.billing.history(userId,15);
  if(!rows.length)return this.send(chatId,'Hali operatsiyalar yo‘q.');
  return this.send(chatId,['🧾 <b>Oxirgi operatsiyalar</b>','',...rows.map(r=>`${r.amount>0?'+':'−'}${som(Math.abs(r.amount))} — ${kindLabel[r.kind]||r.kind}${r.note?' ('+esc(r.note)+')':''} · ${time(r.created_at)}`)].join('\n'));
 }
 async help(chatId){
  const price=this.billing.price();
  return this.send(chatId,['❓ <b>Qanday ishlaydi</b>','','1. Botda balansni to‘ldiring.','2. Chrome/Edge’ga kengaytmani o‘rnating va “Telegram orqali ulash”ni bosing.','3. visa.visitsaudi.com saytiga o‘z akkauntingiz bilan kiring.','4. Kengaytma paneliga pasport rasmlarini tashlang, ma’lumot va portretni tekshirib “Tasdiqlash”ni bosing.','5. Individual yoki Group rejimini tanlab ▶ Boshlash — kengaytma formalarni to‘lov sahifasigacha to‘ldiradi.','6. To‘lovni saytda o‘zingiz bajarasiz.','',`💳 Narx: ${som(price)} / 1 pasport. Pul faqat pasport muvaffaqiyatli o‘qilganda yechiladi; o‘qilmagan rasm uchun pul olinmaydi. Bitta pasport ${this.config.dedupeDays} kun ichida qayta yuklansa, qayta to‘lanmaydi.`,'',`Yordam: ${esc(this.support())}`].join('\n'),{reply_markup:this.keyboard()});
 }
 async askPairing(chatId,code){
  const pairing=this.auth.pairing(code);
  if(!pairing||pairing.user_id)return this.send(chatId,'Ulash havolasi eskirgan yoki ishlatilgan. Kengaytmada “Telegram orqali ulash”ni qayta bosing.',{reply_markup:this.keyboard()});
  return this.send(chatId,'🔌 Brauzer kengaytmasi hisobingizga ulanmoqda. Buni o‘zingiz boshlagan bo‘lsangiz tasdiqlang.',{reply_markup:{inline_keyboard:[[{text:'✅ Ulash',callback_data:'pair:'+code},{text:'❌ Bekor',callback_data:'pairno'}]]}});
 }

 async onCallback(q){
  const answer=(text='',alert=false)=>this.call('answerCallbackQuery',{callback_query_id:q.id,...(text?{text,show_alert:alert}:{})}).catch(()=>{});
  const data=String(q.data||''),chatId=q.message?.chat?.id,userId=q.from.id;
  if(q.message?.chat?.type&&q.message.chat.type!=='private')return answer();
  const {user}=this.billing.upsertUser(q.from);
  if(user.blocked)return answer('Hisob bloklangan.',true);
  if(data.startsWith('ap:')||data.startsWith('rj:'))return this.onDecision(q,answer);
  await answer();
  if(data.startsWith('pair:')){
   const ok=this.auth.confirmPairing(data.slice(5),userId);
   return this.send(chatId,ok?'✅ Kengaytma ulandi. Brauzerga qayting — panel avtomatik yangilanadi.':'Ulash havolasi eskirgan. Kengaytmada qayta urinib ko‘ring.',{reply_markup:this.keyboard()});
  }
  if(data==='pairno')return this.send(chatId,'Ulash bekor qilindi.');
  if(data==='tok:new'){const token=this.auth.issue(userId,'Kengaytma (token)');return this.send(chatId,`🔑 Kengaytma tokeningiz:\n\n<code>${token}</code>\n\nUni panelning “Token bilan ulash” maydoniga joylang. Tokenni hech kimga bermang — u orqali balansingizdan foydalanish mumkin.`)}
  if(data==='tok:revoke')return this.send(chatId,'Barcha ulangan kengaytmalar uziladi. Davom etasizmi?',{reply_markup:{inline_keyboard:[[{text:'Ha, uzish',callback_data:'tok:revoke!'},{text:'Yo‘q',callback_data:'noop'}]]}});
  if(data==='tok:revoke!'){const n=this.auth.revokeAll(userId);return this.send(chatId,`🚪 ${n} ta qurilma uzildi. Qayta ulash uchun “🔌 Kengaytmani ulash”.`)}
  if(data==='topup')return this.topupMenu(chatId);
  if(data==='amt:custom'){this.billing.setState(userId,'await_amount');return this.send(chatId,`Summani yozing (${som(this.config.minTopup)} — ${som(this.config.maxTopup)}). Bekor qilish: /bekor`)}
  if(data.startsWith('amt:'))return this.chooseAmount(chatId,userId,Number(data.slice(4)));
  if(data.startsWith('pay:tg:')){const amount=Number(data.slice(7));if(this.methods().telegram&&this.validAmount(amount))return this.invoice(chatId,userId,amount);return}
  if(data.startsWith('pay:card:')){const amount=Number(data.slice(9));if(this.methods().card&&this.validAmount(amount))return this.cardInstructions(chatId,userId,amount);return}
 }
 validAmount(amount){return Number.isSafeInteger(amount)&&amount>=this.config.minTopup&&amount<=this.config.maxTopup}
 async onDecision(q,answer){
  if(!this.isAdmin(q.from.id))return answer('Faqat administrator uchun.',true);
  const approve=q.data.startsWith('ap:'),id=q.data.slice(3),topup=this.billing.topup(id);
  if(!topup)return answer('So‘rov topilmadi.',true);
  if(topup.status!=='pending'){await answer('Bu so‘rov allaqachon ko‘rib chiqilgan.',true);return}
  let status;
  if(approve){const r=this.billing.completeTopup(id,{decidedBy:q.from.id});if(r.applied)await this.notify(topup.user_id,`✅ To‘lovingiz tasdiqlandi: <b>+${som(topup.amount)}</b>\n💰 Joriy balans: <b>${som(r.balance)}</b>`);status=`✅ Tasdiqlandi (${esc(q.from.first_name||q.from.id)})`}
  else{const r=this.billing.rejectTopup(id,q.from.id);if(r.applied)await this.notify(topup.user_id,`❌ ${som(topup.amount)} lik to‘lov tasdiqlanmadi. Savollar bo‘lsa: ${esc(this.support())}`);status=`❌ Rad etildi (${esc(q.from.first_name||q.from.id)})`}
  await answer(approve?'Tasdiqlandi':'Rad etildi');
  if(q.message)await this.call('editMessageCaption',{chat_id:q.message.chat.id,message_id:q.message.message_id,caption:(q.message.caption||'')+'\n\n'+status,parse_mode:'HTML'}).catch(()=>{});
 }

 // Returns false when the command is not an admin command.
 async onAdmin(chatId,adminId,cmd,args){
  const reply=text=>this.send(chatId,text);
  const target=()=>{const id=Number(args[0]);return Number.isSafeInteger(id)&&this.billing.user(id)?id:null};
  switch(cmd){
   case '/admin':{
    const s=this.billing.adminStats(),line=(n,x)=>`<b>${n}</b>: tushum ${som(x.revenue)}, ${x.passports} pasport, ${x.ready} ariza tayyor`;
    return reply(['🛠 <b>Admin</b>','',`Foydalanuvchilar: ${s.users} (7 kunda faol: ${s.activeWeek})`,`Balanslar jami: ${som(s.balances)}`,`Tasdiq kutayotgan cheklar: ${s.pendingTopups}`,'',line('Bugun',s.today),line('30 kun',s.month),line('Jami',s.all),'',`Narx: ${som(this.billing.price())}`,'','/narx 5000 · /qoshish ID 50000 izoh · /user ID · /kutilayotgan · /bloklash ID · /ochish ID'].join('\n'));
   }
   case '/narx':{
    if(!args.length)return reply(`Joriy narx: ${som(this.billing.price())}. O‘zgartirish: /narx 5000`);
    const price=parseAmount(args[0]);try{this.billing.setPrice(price)}catch(e){return reply(e.message)}
    return reply(`✅ Yangi narx: ${som(price)} / 1 pasport`);
   }
   case '/qoshish':{
    const id=target(),amount=parseAmount(args[1]||'');
    if(!id||!Number.isSafeInteger(amount)||amount===0)return reply('Foydalanish: /qoshish ID SUMMA [izoh]. Ayirish uchun manfiy summa: /qoshish ID -5000');
    try{const r=this.billing.adjust(id,amount,args.slice(2).join(' '),adminId);await this.notify(id,`${amount>0?'➕':'➖'} Balansingiz o‘zgartirildi: ${amount>0?'+':'−'}${som(Math.abs(amount))}\n💰 Joriy balans: <b>${som(r.balance)}</b>`);return reply(`✅ ${id}: yangi balans ${som(r.balance)}`)}
    catch(e){return reply(e instanceof InsufficientBalance?'Balans manfiy bo‘lib qoladi.':e.message)}
   }
   case '/user':{
    const id=target();if(!id)return reply('Foydalanish: /user ID');
    const u=this.billing.user(id),s=this.billing.userStats(id).all;
    return reply([`👤 <b>${esc(u.first_name||'')} ${esc(u.last_name||'')}</b> ${u.username?'@'+esc(u.username):''}`,`ID: <code>${u.id}</code>${u.blocked?' · 🚫 bloklangan':''}`,`Balans: ${som(u.balance)}`,`Pasportlar: ${s.passports}, tayyor arizalar: ${s.ready}, sarf: ${som(s.spent)}`,`Ulangan qurilmalar: ${this.auth.sessionCount(id)}`,`Ro‘yxatdan o‘tgan: ${time(u.created_at)}`].join('\n'));
   }
   case '/kutilayotgan':{
    const rows=this.billing.db.prepare("SELECT * FROM topups WHERE status='pending' AND receipt_file_id IS NOT NULL ORDER BY created_at LIMIT 20").all();
    if(!rows.length)return reply('Tasdiq kutayotgan cheklar yo‘q.');
    for(const t of rows)await this.call('sendMessage',{chat_id:chatId,text:`🧾 ${som(t.amount)} — <code>${t.user_id}</code> · ${time(t.created_at)}`,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'✅ Tasdiqlash',callback_data:'ap:'+t.id},{text:'❌ Rad etish',callback_data:'rj:'+t.id}]]}});
    return;
   }
   case '/bloklash':case '/ochish':{
    const id=target();if(!id)return reply(`Foydalanish: ${cmd} ID`);
    const blocked=cmd==='/bloklash';this.billing.setBlocked(id,blocked);if(blocked)this.auth.revokeAll(id);
    return reply(blocked?`🚫 ${id} bloklandi, qurilmalari uzildi.`:`✅ ${id} blokdan chiqarildi.`);
   }
  }
  return false;
 }

 async notifyReady(userId,event){
  const names=(event.names||[]).slice(0,10).map(n=>'• '+esc(n)).join('\n');
  const lines=[`✅ <b>${event.count} ta ariza to‘lovga tayyor</b>${event.groupName?` (Guruh: ${esc(event.groupName)})`:''}`];
  if(event.totalSAR)lines.push(`Jami: <b>${esc(event.totalSAR)} SAR</b>`);
  if(names)lines.push('',names);
  lines.push('','To‘lovni eVisa sahifasida o‘zingiz bajaring.');
  return this.notify(userId,lines.join('\n'));
 }
 async notifyLowBalance(userId,balance){
  return this.notify(userId,`⚠️ Balans kam qoldi: <b>${som(balance)}</b>. Keyingi pasport uchun ${som(this.billing.price())} kerak.`,{reply_markup:{inline_keyboard:[[{text:menu.topup,callback_data:'topup'}]]}});
 }
}
