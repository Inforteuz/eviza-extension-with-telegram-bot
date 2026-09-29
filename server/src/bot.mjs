import {InsufficientBalance} from './billing.mjs';

export const menu={connect:'🔌 Kengaytmani ulash',balance:'💰 Balans',topup:'➕ Balansni to‘ldirish',stats:'📊 Statistika',history:'🧾 Tarix',help:'❓ Yordam',admin:'🛠 Admin panel'};
export const adminMenu={dashboard:'📈 Hisobot',users:'👥 Foydalanuvchilar',find:'🔎 Qidirish',receipts:'🧾 Cheklar',price:'💲 Narx',broadcast:'📣 Xabar yuborish',system:'⚙️ Tizim holati',back:'⬅️ Asosiy menyu'};
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
 {command:'admin',description:'Admin panel'},
 {command:'narx',description:'Admin: narx — /narx 5000'},
 {command:'qoshish',description:'Admin: balans — /qoshish ID 50000 izoh'},
 {command:'user',description:'Admin: foydalanuvchi — /user ID'},
 {command:'kutilayotgan',description:'Admin: tasdiq kutayotgan cheklar'},
 {command:'bloklash',description:'Admin: bloklash — /bloklash ID'},
 {command:'ochish',description:'Admin: blokdan chiqarish — /ochish ID'},
];
export const som=n=>String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,' ')+' so‘m';
const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]);
const time=ms=>new Date(ms).toLocaleString('uz-UZ',{timeZone:'Asia/Tashkent',day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
const kindLabel={topup:'To‘lov',charge:'Pasport',bonus:'Bonus',admin:'Administrator',refund:'Qaytarildi'};
const parseAmount=text=>{const n=Number(String(text).replace(/[\s_.,]|so['‘’]?m/gi,''));return Number.isSafeInteger(n)?n:NaN};
const fullName=u=>[u?.first_name,u?.last_name].filter(Boolean).join(' ')||'—';
const rows=labels=>labels.map(r=>r.map(text=>({text})));
const cancelButton={inline_keyboard:[[{text:'❌ Bekor qilish',callback_data:'adm:cancel'}]]};
const USERS_PAGE=8;

export class Bot {
 constructor({billing,auth,call,config,botUsername='',log=console,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){Object.assign(this,{billing,auth,call,config,botUsername,log,sleep});this.broadcasting=null}
 isAdmin(id){return this.config.adminIds.includes(Number(id))}
 // In private chats the chat ID is the user ID.
 keyboard(userId){
  const labels=[[menu.connect,menu.balance],[menu.topup,menu.stats],[menu.history,menu.help]];
  if(this.isAdmin(userId))labels.push([menu.admin]);
  return {keyboard:rows(labels),resize_keyboard:true,is_persistent:true};
 }
 adminKeyboard(){
  const a=adminMenu;
  return {keyboard:rows([[a.dashboard,a.users],[a.find,a.receipts],[a.price,a.broadcast],[a.system,a.back]]),resize_keyboard:true,is_persistent:true,input_field_placeholder:'Admin panel'};
 }
 async send(chatId,text,extra={}){return this.call('sendMessage',{chat_id:chatId,text,parse_mode:'HTML',link_preview_options:{is_disabled:true},...extra})}
 sender(chatId){return (text,extra)=>this.send(chatId,text,extra)}
 // Notifications must never break the caller (the user may have blocked the bot).
 async notify(userId,text,extra={}){try{await this.send(userId,text,extra);return true}catch(error){this.log.warn?.('Telegram xabari yuborilmadi:',error.status||error.message);return false}}
 support(){return this.config.supportUsername?'@'+this.config.supportUsername:'administrator'}

 // Shows the result in place of the message whose button was pressed, so its buttons
 // cannot be pressed twice. A reply keyboard needs a new message; media keeps its buttons.
 async replace(q,text,extra={}){
  const m=q.message;
  if(!m||m.text===undefined)return this.send(m?.chat?.id||q.from.id,text,extra);
  const markup=extra.reply_markup;
  if(markup&&!markup.inline_keyboard){
   await this.call('deleteMessage',{chat_id:m.chat.id,message_id:m.message_id}).catch(()=>this.clearButtons(q));
   return this.send(m.chat.id,text,extra);
  }
  try{return await this.call('editMessageText',{chat_id:m.chat.id,message_id:m.message_id,text,parse_mode:'HTML',link_preview_options:{is_disabled:true},...extra})}
  catch(error){if(/not modified/i.test(error.description||''))return;await this.clearButtons(q);return this.send(m.chat.id,text,extra)}
 }
 clearButtons(q){const m=q.message;if(!m)return;return this.call('editMessageReplyMarkup',{chat_id:m.chat.id,message_id:m.message_id,reply_markup:{inline_keyboard:[]}}).catch(()=>{})}

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
  const state=this.billing.state(user.id),admin=this.isAdmin(user.id);
  const text=(m.text||'').trim();
  const [command,...args]=text.split(/\s+/);const cmd=command.replace(/@\w+$/,'').toLowerCase();
  if(admin&&state?.name?.startsWith('adm_')){
   const pressed=cmd.startsWith('/')||Object.values(menu).includes(text)||Object.values(adminMenu).includes(text);
   if(!pressed)return this.onAdminInput(m,state);
   this.billing.setState(user.id,null);
   if(cmd==='/bekor')return this.send(m.chat.id,'Bekor qilindi.',{reply_markup:this.adminKeyboard()});
  }
  if(state?.name==='await_receipt'&&(m.photo||m.document))return this.onReceipt(m,state.data);
  if(cmd==='/start'){
   this.billing.setState(user.id,null);
   const payload=args[0]||'';
   if(payload.startsWith('pair_'))return this.askPairing(m.chat.id,payload.slice(5));
   if(payload==='topup')return this.topupMenu(m.chat.id,user.id);
   return this.welcome(m.chat.id,user,created);
  }
  if(cmd==='/bekor'){this.billing.setState(user.id,null);return this.send(m.chat.id,'Bekor qilindi.',{reply_markup:this.keyboard(user.id)})}
  if(admin){
   if(cmd==='/admin'||text===menu.admin)return this.adminHome(m.chat.id);
   const action=Object.keys(adminMenu).find(key=>adminMenu[key]===text);
   if(action)return this.onAdminMenu(m.chat.id,user.id,action);
   if(cmd.startsWith('/')){const handled=await this.onAdmin(m.chat.id,user.id,cmd,args);if(handled!==false)return}
  }
  if(cmd==='/ulash'||text===menu.connect)return this.connectInfo(m.chat.id);
  if(cmd==='/balans'||text===menu.balance)return this.balance(m.chat.id,user.id);
  if(cmd==='/tolov'||text===menu.topup)return this.topupMenu(m.chat.id,user.id);
  if(cmd==='/statistika'||text===menu.stats)return this.stats(m.chat.id,user.id);
  if(cmd==='/tarix'||text===menu.history)return this.history(m.chat.id,user.id);
  if(cmd==='/yordam'||text===menu.help)return this.help(m.chat.id);
  if(state?.name==='await_amount'){
   const amount=parseAmount(text);
   if(!Number.isFinite(amount))return this.send(m.chat.id,'Summani faqat raqam bilan yozing, masalan: <b>75000</b>. Bekor qilish: /bekor');
   return this.chooseAmount(m.chat.id,user.id,amount);
  }
  if(state?.name==='await_receipt')return this.send(m.chat.id,'To‘lov chekining rasmini (skrinshot) yuboring. Bekor qilish: /bekor');
  return this.send(m.chat.id,'Quyidagi menyudan tanlang.',{reply_markup:this.keyboard(user.id)});
 }

 async welcome(chatId,user,created){
  const price=this.billing.price();
  const lines=[`Assalomu alaykum, <b>${esc(user.first_name||'foydalanuvchi')}</b>!`,'','<b>eVisa Auto-Filler</b> — Saudi eVisa (visa.visitsaudi.com) arizalarini pasport rasmidan avtomatik to‘ldiradigan brauzer kengaytmasi. Ariza to‘lov sahifasigacha tayyorlanadi, to‘lovni operator o‘zi bajaradi.','',`💳 Narx: <b>${som(price)}</b> / 1 pasport`,`💰 Balansingiz: <b>${som(user.balance)}</b>`];
  if(created&&this.config.welcomeBonus>0)lines.push('',`🎁 Sizga ${som(this.config.welcomeBonus)} bonus berildi.`);
  lines.push('','Boshlash uchun “🔌 Kengaytmani ulash”ni bosing.');
  return this.send(chatId,lines.join('\n'),{reply_markup:this.keyboard(user.id)});
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
 async topupMenu(chatId,userId,out=this.sender(chatId)){
  const methods=this.methods();
  if(!methods.telegram&&!methods.card)return out('To‘lov usullari hali sozlanmagan. Balansni to‘ldirish uchun '+esc(this.support())+' ga yozing.');
  const amounts=this.config.topupAmounts.filter(a=>a>=this.config.minTopup&&a<=this.config.maxTopup);
  const keys=[];for(let i=0;i<amounts.length;i+=2)keys.push(amounts.slice(i,i+2).map(a=>({text:som(a),callback_data:'amt:'+a})));
  keys.push([{text:'✍️ Boshqa summa',callback_data:'amt:custom'}]);
  const balance=this.billing.user(userId)?.balance??0;
  return out(`➕ <b>Balansni to‘ldirish</b>\n\n💰 Balans: ${som(balance)}\n📄 Narx: ${som(this.billing.price())} / 1 pasport\n\nQancha summaga to‘ldirasiz?`,{reply_markup:{inline_keyboard:keys}});
 }
 // `out` is set when the choice came from a button: that message is replaced.
 async chooseAmount(chatId,userId,amount,out=null){
  const reply=out||this.sender(chatId);
  if(!this.validAmount(amount)){
   this.billing.setState(userId,'await_amount');
   return reply(`Summa ${som(this.config.minTopup)} dan ${som(this.config.maxTopup)} gacha bo‘lishi kerak. Qaytadan yozing yoki /bekor.`);
  }
  this.billing.setState(userId,null);
  const methods=this.methods();
  if(methods.telegram&&methods.card)return reply(`<b>${som(amount)}</b> — to‘lov usulini tanlang:`,{reply_markup:{inline_keyboard:[[{text:'💳 Click / Payme (Telegram)',callback_data:'pay:tg:'+amount}],[{text:'🧾 Kartaga o‘tkazma (chek bilan)',callback_data:'pay:card:'+amount}]]}});
  if(methods.card)return this.cardInstructions(chatId,userId,amount,reply);
  if(out)await out(`💳 <b>${som(amount)}</b> — to‘lov oynasi quyida.`);
  return this.invoice(chatId,userId,amount);
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
 async cardInstructions(chatId,userId,amount,out=this.sender(chatId)){
  const topup=this.billing.createTopup(userId,amount,'card');
  this.billing.setState(userId,'await_receipt',{topupId:topup.id});
  const lines=['<b>Kartaga o‘tkazma</b>','',`Summa: <b>${som(amount)}</b>`,`Karta: <code>${esc(this.config.cardNumber)}</code>`];
  if(this.config.cardHolder)lines.push(`Egasi: ${esc(this.config.cardHolder)}`);
  lines.push('','O‘tkazmani bajarib, <b>chek rasmini (skrinshot) shu chatga yuboring</b>. Administrator tasdiqlagach balans to‘ldiriladi.','Bekor qilish: /bekor');
  return out(lines.join('\n'));
 }
 receiptKeyboard(topup){return {inline_keyboard:[[{text:'✅ Tasdiqlash',callback_data:'ap:'+topup.id},{text:'❌ Rad etish',callback_data:'rj:'+topup.id}],[{text:'👤 Foydalanuvchi',callback_data:'adm:u:'+topup.user_id}]]}}
 async onReceipt(m,data){
  const topup=data?.topupId&&this.billing.topup(data.topupId);
  if(!topup||topup.user_id!==m.from.id||topup.status!=='pending'){this.billing.setState(m.from.id,null);return this.send(m.chat.id,'Bu to‘lov so‘rovi eskirgan. “➕ Balansni to‘ldirish” orqali qayta boshlang.')}
  const photo=m.photo?.at(-1),doc=m.document;
  if(doc&&!/^(image\/|application\/pdf)/.test(doc.mime_type||''))return this.send(m.chat.id,'Chekni rasm yoki PDF ko‘rinishida yuboring.');
  const fileId=photo?.file_id||doc.file_id;
  this.billing.attachReceipt(topup.id,fileId);this.billing.setState(m.from.id,null);
  const caption=[`🧾 <b>Yangi chek</b> — ${som(topup.amount)}`,`Foydalanuvchi: ${esc(m.from.first_name||'')} ${m.from.username?'@'+esc(m.from.username):''} (<code>${m.from.id}</code>)`,`So‘rov: <code>${topup.id}</code>`].join('\n');
  let delivered=0;
  for(const admin of this.config.adminIds){
   try{await this.call(photo?'sendPhoto':'sendDocument',{chat_id:admin,[photo?'photo':'document']:fileId,caption,parse_mode:'HTML',reply_markup:this.receiptKeyboard(topup)});delivered++}catch(error){this.log.warn?.('Adminga chek yuborilmadi:',error.status||error.message)}
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
  return this.send(m.chat.id,`✅ Balans to‘ldirildi: <b>+${som(result.topup.amount)}</b>\n💰 Joriy balans: <b>${som(result.balance)}</b>`,{reply_markup:this.keyboard(m.from.id)});
 }
 async stats(chatId,userId){
  const s=this.billing.userStats(userId),row=(name,x)=>`<b>${name}</b>: ${x.passports} pasport, ${x.ready} ariza to‘lovga tayyor, sarf ${som(x.spent)}`;
  return this.send(chatId,['📊 <b>Statistika</b>','',row('Bugun',s.today),row('7 kun',s.week),row('30 kun',s.month),row('Jami',s.all)].join('\n'));
 }
 historyText(userId,title='🧾 <b>Oxirgi operatsiyalar</b>'){
  const rows=this.billing.history(userId,15);
  if(!rows.length)return 'Hali operatsiyalar yo‘q.';
  return [title,'',...rows.map(r=>`${r.amount>0?'+':'−'}${som(Math.abs(r.amount))} — ${kindLabel[r.kind]||r.kind}${r.note?' ('+esc(r.note)+')':''} · ${time(r.created_at)}`)].join('\n');
 }
 async history(chatId,userId){return this.send(chatId,this.historyText(userId))}
 async help(chatId){
  const price=this.billing.price();
  return this.send(chatId,['❓ <b>Qanday ishlaydi</b>','','1. Botda balansni to‘ldiring.','2. Chrome/Edge’ga kengaytmani o‘rnating va “Telegram orqali ulash”ni bosing.','3. visa.visitsaudi.com saytiga o‘z akkauntingiz bilan kiring.','4. Kengaytma paneliga pasport rasmlarini tashlang, ma’lumot va portretni tekshirib “Tasdiqlash”ni bosing.','5. Individual yoki Group rejimini tanlab ▶ Boshlash — kengaytma formalarni to‘lov sahifasigacha to‘ldiradi.','6. To‘lovni saytda o‘zingiz bajarasiz.','',`💳 Narx: ${som(price)} / 1 pasport. Pul faqat pasport muvaffaqiyatli o‘qilganda yechiladi; o‘qilmagan rasm uchun pul olinmaydi. Bitta pasport ${this.config.dedupeDays} kun ichida qayta yuklansa, qayta to‘lanmaydi.`,'',`Yordam: ${esc(this.support())}`].join('\n'),{reply_markup:this.keyboard(chatId)});
 }
 async askPairing(chatId,code){
  const pairing=this.auth.pairing(code);
  if(!pairing||pairing.user_id)return this.send(chatId,'Ulash havolasi eskirgan yoki ishlatilgan. Kengaytmada “Telegram orqali ulash”ni qayta bosing.',{reply_markup:this.keyboard(chatId)});
  return this.send(chatId,'🔌 Brauzer kengaytmasi hisobingizga ulanmoqda. Buni o‘zingiz boshlagan bo‘lsangiz tasdiqlang.',{reply_markup:{inline_keyboard:[[{text:'✅ Ulash',callback_data:'pair:'+code},{text:'❌ Bekor',callback_data:'pairno'}]]}});
 }

 async onCallback(q){
  const answer=(text='',alert=false)=>this.call('answerCallbackQuery',{callback_query_id:q.id,...(text?{text,show_alert:alert}:{})}).catch(()=>{});
  const data=String(q.data||''),chatId=q.message?.chat?.id??q.from.id,userId=q.from.id;
  if(q.message?.chat?.type&&q.message.chat.type!=='private')return answer();
  const {user}=this.billing.upsertUser(q.from);
  if(user.blocked)return answer('Hisob bloklangan.',true);
  if(data.startsWith('ap:')||data.startsWith('rj:'))return this.onDecision(q,answer);
  if(data.startsWith('adm:'))return this.onAdminCallback(q,answer);
  await answer();
  const out=(text,extra)=>this.replace(q,text,extra);
  if(data.startsWith('pair:')){
   const ok=this.auth.confirmPairing(data.slice(5),userId);
   return out(ok?'✅ Kengaytma ulandi. Brauzerga qayting — panel avtomatik yangilanadi.':'Ulash havolasi eskirgan. Kengaytmada qayta urinib ko‘ring.',{reply_markup:this.keyboard(userId)});
  }
  if(data==='pairno')return out('❌ Ulash bekor qilindi.');
  if(data==='tok:new'){const token=this.auth.issue(userId,'Kengaytma (token)');return out(`🔑 Kengaytma tokeningiz:\n\n<code>${token}</code>\n\nUni panelning “Token bilan ulash” maydoniga joylang. Tokenni hech kimga bermang — u orqali balansingizdan foydalanish mumkin.`)}
  if(data==='tok:revoke')return out('Barcha ulangan kengaytmalar uziladi. Davom etasizmi?',{reply_markup:{inline_keyboard:[[{text:'Ha, uzish',callback_data:'tok:revoke!'},{text:'Yo‘q',callback_data:'tok:keep'}]]}});
  if(data==='tok:revoke!'){const n=this.auth.revokeAll(userId);return out(`🚪 ${n} ta qurilma uzildi. Qayta ulash uchun “🔌 Kengaytmani ulash”.`)}
  if(data==='tok:keep'||data==='noop')return out('Bekor qilindi. Qurilmalar ulangan holda qoldi.');
  if(data==='topup')return this.topupMenu(chatId,userId,out);
  if(data==='amt:custom'){this.billing.setState(userId,'await_amount');return out(`✍️ Summani yozing (${som(this.config.minTopup)} — ${som(this.config.maxTopup)}). Bekor qilish: /bekor`)}
  if(data.startsWith('amt:'))return this.chooseAmount(chatId,userId,Number(data.slice(4)),out);
  if(data.startsWith('pay:tg:')){
   const amount=Number(data.slice(7));if(!this.methods().telegram||!this.validAmount(amount))return this.clearButtons(q);
   await out(`💳 <b>${som(amount)}</b> — Click / Payme orqali to‘lov oynasi quyida.`);
   return this.invoice(chatId,userId,amount);
  }
  if(data.startsWith('pay:card:')){const amount=Number(data.slice(9));if(this.methods().card&&this.validAmount(amount))return this.cardInstructions(chatId,userId,amount,out);return this.clearButtons(q)}
  return this.clearButtons(q);
 }
 validAmount(amount){return Number.isSafeInteger(amount)&&amount>=this.config.minTopup&&amount<=this.config.maxTopup}
 async onDecision(q,answer){
  if(!this.isAdmin(q.from.id))return answer('Faqat administrator uchun.',true);
  const approve=q.data.startsWith('ap:'),id=q.data.slice(3),topup=this.billing.topup(id);
  if(!topup){await answer('So‘rov topilmadi.',true);return this.markDecided(q,'⚠️ So‘rov topilmadi')}
  if(topup.status!=='pending'){await answer('Bu so‘rov allaqachon ko‘rib chiqilgan.',true);return this.markDecided(q,topup.status==='approved'?'✅ Tasdiqlangan':'❌ Rad etilgan')}
  let status;
  if(approve){const r=this.billing.completeTopup(id,{decidedBy:q.from.id});if(r.applied)await this.notify(topup.user_id,`✅ To‘lovingiz tasdiqlandi: <b>+${som(topup.amount)}</b>\n💰 Joriy balans: <b>${som(r.balance)}</b>`);status=`✅ Tasdiqlandi (${esc(q.from.first_name||q.from.id)})`}
  else{const r=this.billing.rejectTopup(id,q.from.id);if(r.applied)await this.notify(topup.user_id,`❌ ${som(topup.amount)} lik to‘lov tasdiqlanmadi. Savollar bo‘lsa: ${esc(this.support())}`);status=`❌ Rad etildi (${esc(q.from.first_name||q.from.id)})`}
  await answer(approve?'Tasdiqlandi':'Rad etildi');
  return this.markDecided(q,status);
 }
 // Receipts are photos/documents (caption) or text rows from the pending list.
 markDecided(q,status){
  const m=q.message;if(!m)return;
  const base={chat_id:m.chat.id,message_id:m.message_id,parse_mode:'HTML',reply_markup:{inline_keyboard:[]}};
  const edit=m.text!==undefined?this.call('editMessageText',{...base,text:esc(m.text)+'\n\n'+status}):this.call('editMessageCaption',{...base,caption:esc(m.caption||'')+'\n\n'+status});
  return edit.catch(()=>this.clearButtons(q));
 }

 // ---- Admin panel ----
 dashboardText(){
  const s=this.billing.adminStats(),line=(n,x)=>`${n}: <b>${som(x.revenue)}</b> · ${x.passports} pasport · ${x.ready} ariza`;
  return ['🛠 <b>Admin panel</b>','',
   `👥 Foydalanuvchilar: <b>${s.users}</b> (bugun +${s.newToday}, 7 kunda +${s.newWeek})`,
   `🟢 7 kunda faol: <b>${s.activeWeek}</b>${s.blocked?` · 🚫 bloklangan: ${s.blocked}`:''}`,
   `💰 Balanslar jami: <b>${som(s.balances)}</b>`,
   `🧾 Tasdiq kutayotgan cheklar: <b>${s.pendingTopups}</b>`,
   `💲 Narx: <b>${som(this.billing.price())}</b> / 1 pasport`,
   '','<b>Tushum · pasportlar · tayyor arizalar</b>',line('Bugun',s.today),line('30 kun',s.month),line('Jami',s.all),
   '',`<i>Yangilandi: ${time(this.billing.now())}</i>`].join('\n');
 }
 dashboardButtons(){
  const pending=this.billing.adminStats().pendingTopups,row=[{text:'🔄 Yangilash',callback_data:'adm:dash'}];
  if(pending)row.push({text:`🧾 Cheklar (${pending})`,callback_data:'adm:receipts'});
  return {inline_keyboard:[row]};
 }
 adminHome(chatId){return this.send(chatId,this.dashboardText()+'\n\nPastdagi tugmalardan bo‘limni tanlang.',{reply_markup:this.adminKeyboard()})}
 systemText(){
  const c=this.config,on=v=>v?'✅':'❌',card=String(c.cardNumber||'').replace(/\D/g,'');
  return ['⚙️ <b>Tizim holati</b>','',
   `${on(c.openaiKey||c.geminiKey)} Tizim paketi (pasport matnini o‘qish)`,
   `${on(c.paymentProviderToken)} Click / Payme (Telegram to‘lovi)`,
   `${on(card)} Kartaga o‘tkazma${card?' · •••• '+card.slice(-4):''}`,
   `${on(c.extensionUrl)} Kengaytmani yuklab olish havolasi`,
   '',`💲 Narx: ${som(this.billing.price())} / 1 pasport`,
   `🔁 Qayta yuklangan pasport bepul: ${c.dedupeDays} kun`,
   `🎁 Yangi foydalanuvchi bonusi: ${som(c.welcomeBonus||0)}`,
   `↕️ To‘lov chegarasi: ${som(c.minTopup)} — ${som(c.maxTopup)}`,
   `🛠 Administratorlar: ${c.adminIds.length} · yordam: ${esc(this.support())}`,
   this.broadcasting?'\n📣 Xabar yuborilmoqda…':''].join('\n').trim();
 }
 usersPage(page,out){
  const {total,rows:list}=this.billing.listUsers({offset:page*USERS_PAGE,limit:USERS_PAGE});
  if(!total)return out('Hali foydalanuvchilar yo‘q.');
  const pages=Math.ceil(total/USERS_PAGE);
  if(!list.length)return this.usersPage(pages-1,out);
  const lines=[`👥 <b>Foydalanuvchilar</b> — ${total} ta`,'',...list.map((u,i)=>`${page*USERS_PAGE+i+1}. ${esc(fullName(u))}${u.username?' @'+esc(u.username):''} · <code>${u.id}</code> · ${som(u.balance)}${u.blocked?' · 🚫':''}`),'',`Sahifa ${page+1}/${pages} · oxirgi faollik bo‘yicha. Kartani ochish uchun tugmani bosing.`];
  const keys=list.map(u=>[{text:`${u.blocked?'🚫 ':''}${fullName(u).slice(0,24)} · ${som(u.balance)}`,callback_data:'adm:u:'+u.id}]);
  const nav=[];
  if(page>0)nav.push({text:'◀️ Oldingi',callback_data:'adm:users:'+(page-1)});
  if(page<pages-1)nav.push({text:'Keyingi ▶️',callback_data:'adm:users:'+(page+1)});
  if(nav.length)keys.push(nav);
  return out(lines.join('\n'),{reply_markup:{inline_keyboard:keys}});
 }
 userCard(id,out){
  const u=this.billing.user(id);if(!u)return out('Foydalanuvchi topilmadi.');
  const s=this.billing.userStats(id);
  const text=[`👤 <b>${esc(fullName(u))}</b>${u.username?' @'+esc(u.username):''}`,
   `🆔 <code>${u.id}</code> · ${u.blocked?'🚫 bloklangan':'✅ faol'}${this.isAdmin(u.id)?' · 🛠 administrator':''}`,'',
   `💰 Balans: <b>${som(u.balance)}</b>`,
   `➕ To‘ldirgan: ${som(this.billing.topupTotal(id))} · 💸 Sarflagan: ${som(s.all.spent)}`,
   `📄 Pasportlar: ${s.all.passports} (30 kun: ${s.month.passports}) · ✅ tayyor arizalar: ${s.all.ready}`,
   `🔌 Ulangan qurilmalar: ${this.auth.sessionCount(id)}`,
   `📅 Ro‘yxatdan o‘tgan: ${time(u.created_at)}`,`🕘 Oxirgi faollik: ${time(u.updated_at)}`].join('\n');
  const keys=[[{text:'➕ Balans qo‘shish',callback_data:'adm:add:'+id},{text:'➖ Balansdan ayirish',callback_data:'adm:sub:'+id}],
   [u.blocked?{text:'✅ Blokdan chiqarish',callback_data:'adm:unblock:'+id}:{text:'🚫 Bloklash',callback_data:'adm:block:'+id},{text:'🚪 Qurilmalarni uzish',callback_data:'adm:revoke:'+id}],
   [{text:'🧾 Operatsiyalar',callback_data:'adm:hist:'+id},{text:'🔄 Yangilash',callback_data:'adm:u:'+id}],
   [{text:'⬅️ Ro‘yxatga',callback_data:'adm:users:0'}]];
  return out(text,{reply_markup:{inline_keyboard:keys}});
 }
 searchResults(found,out){
  if(found.length===1)return this.userCard(found[0].id,out);
  return out(`🔎 Topildi: ${found.length} ta. Kerakli foydalanuvchini tanlang.`,{reply_markup:{inline_keyboard:found.map(u=>[{text:`${u.blocked?'🚫 ':''}${fullName(u).slice(0,24)}${u.username?' @'+u.username:''} · ${u.id}`,callback_data:'adm:u:'+u.id}])}});
 }
 async receipts(chatId){
  const list=this.billing.pendingReceipts(20);
  if(!list.length)return this.send(chatId,'✅ Tasdiq kutayotgan cheklar yo‘q.');
  await this.send(chatId,`🧾 Tasdiq kutayotgan cheklar: <b>${list.length}</b>`);
  for(const t of list){
   const u=this.billing.user(t.user_id);
   const caption=`🧾 <b>${som(t.amount)}</b> — ${esc(fullName(u))}${u?.username?' @'+esc(u.username):''} (<code>${t.user_id}</code>)\nSo‘rov: <code>${t.id}</code> · ${time(t.created_at)}`;
   const extra={caption,parse_mode:'HTML',reply_markup:this.receiptKeyboard(t)};
   // The stored file ID does not say whether it was a photo or a document.
   let shown=false;
   for(const [method,key] of [['sendPhoto','photo'],['sendDocument','document']]){
    try{await this.call(method,{chat_id:chatId,[key]:t.receipt_file_id,...extra});shown=true;break}catch{/* try the other kind */}
   }
   if(!shown)await this.send(chatId,caption,{reply_markup:this.receiptKeyboard(t)});
  }
 }
 async onAdminMenu(chatId,adminId,action){
  const send=this.sender(chatId);
  switch(action){
   case 'dashboard':return send(this.dashboardText(),{reply_markup:this.dashboardButtons()});
   case 'users':return this.usersPage(0,send);
   case 'find':this.billing.setState(adminId,'adm_find');return send('🔎 Foydalanuvchining <b>ID raqami</b>, <b>@username</b> yoki <b>ismini</b> yozing.\nUning xabarini shu yerga forward qilsangiz ham bo‘ladi.',{reply_markup:cancelButton});
   case 'receipts':return this.receipts(chatId);
   case 'price':this.billing.setState(adminId,'adm_price');return send(`💲 Joriy narx: <b>${som(this.billing.price())}</b> / 1 pasport\n\nYangi narxni so‘mda yozing, masalan: <code>5000</code>. 0 — bepul.`,{reply_markup:cancelButton});
   case 'broadcast':{
    if(this.broadcasting)return send('📣 Oldingi xabar hali yuborilmoqda. Tugashini kuting.');
    const n=this.billing.broadcastTargets().filter(id=>id!==chatId).length;
    this.billing.setState(adminId,'adm_broadcast');
    return send(`📣 <b>Xabar yuborish</b>\n\nBarcha faol foydalanuvchilarga (${n} ta) yuboriladigan xabarni shu yerga yuboring: matn, rasm, video yoki fayl.\nYuborishdan oldin tasdiq so‘raladi.`,{reply_markup:cancelButton});
   }
   case 'system':return send(this.systemText());
   case 'back':return send('Asosiy menyu.',{reply_markup:this.keyboard(adminId)});
  }
 }
 async onAdminInput(m,state){
  const chatId=m.chat.id,adminId=m.from.id,send=this.sender(chatId),text=(m.text||'').trim();
  switch(state.name){
   case 'adm_find':{
    const forwarded=m.forward_origin?.sender_user?.id||m.forward_from?.id;
    const found=this.billing.findUsers(forwarded?String(forwarded):text);
    if(!found.length)return send('Hech kim topilmadi. Boshqa so‘rov yozing yoki /bekor.',{reply_markup:cancelButton});
    this.billing.setState(adminId,null);
    return this.searchResults(found,send);
   }
   case 'adm_price':{
    const price=parseAmount(text);
    try{this.billing.setPrice(price)}catch(e){return send(e.message+' Faqat raqam yozing, masalan: <code>5000</code>. Bekor qilish: /bekor')}
    this.billing.setState(adminId,null);
    return send(`✅ Yangi narx: <b>${som(price)}</b> / 1 pasport`);
   }
   case 'adm_amount':{
    const {target,sign}=state.data||{},match=text.match(/^(\d{1,3}(?:[ _.,]\d{3})+|\d+)\s*(?:so['‘’]?m)?\s*(.*)$/is);
    const amount=match?parseAmount(match[1]):NaN;
    if(!this.billing.user(target)){this.billing.setState(adminId,null);return send('Foydalanuvchi topilmadi.')}
    if(!Number.isSafeInteger(amount)||amount<=0)return send('Summani raqam bilan yozing, masalan: <code>50000 naqd to‘lov</code>. Bekor qilish: /bekor',{reply_markup:cancelButton});
    const delta=sign<0?-amount:amount;
    try{
     const r=this.billing.adjust(target,delta,match[2].trim(),adminId);
     this.billing.setState(adminId,null);
     await this.notify(target,`${delta>0?'➕':'➖'} Balansingiz o‘zgartirildi: ${delta>0?'+':'−'}${som(amount)}\n💰 Joriy balans: <b>${som(r.balance)}</b>`);
     await send(`✅ ${delta>0?'Qo‘shildi':'Ayirildi'}: ${som(amount)} · yangi balans ${som(r.balance)}`);
     return this.userCard(target,send);
    }catch(e){
     if(e instanceof InsufficientBalance)return send(`Balans yetarli emas: joriy balans ${som(e.balance)}. Kichikroq summa yozing yoki /bekor.`,{reply_markup:cancelButton});
     return send(esc(e.message));
    }
   }
   case 'adm_broadcast':{
    if(this.broadcasting)return send('📣 Oldingi xabar hali yuborilmoqda.');
    this.billing.setState(adminId,null);
    const n=this.billing.broadcastTargets().filter(id=>id!==chatId).length;
    return send(`📣 Yuqoridagi xabar <b>${n}</b> ta foydalanuvchiga yuboriladi. Tasdiqlaysizmi?`,{reply_parameters:{message_id:m.message_id,allow_sending_without_reply:true},reply_markup:{inline_keyboard:[[{text:'✅ Yuborish',callback_data:'adm:bc:'+m.message_id},{text:'❌ Bekor',callback_data:'adm:cancel'}]]}});
   }
  }
  this.billing.setState(adminId,null);
 }
 async onAdminCallback(q,answer){
  if(!this.isAdmin(q.from.id))return answer('Faqat administrator uchun.',true);
  const [,action,arg='']=String(q.data).split(':'),adminId=q.from.id,chatId=q.message?.chat?.id??adminId;
  const out=(text,extra)=>this.replace(q,text,extra),send=this.sender(chatId),id=Number(arg);
  switch(action){
   case 'dash':await answer('Yangilandi');return out(this.dashboardText(),{reply_markup:this.dashboardButtons()});
   case 'receipts':await answer();return this.receipts(chatId);
   case 'users':await answer();return this.usersPage(Math.max(0,Number(arg)||0),out);
   case 'u':await answer();return this.userCard(id,out);
   case 'hist':await answer();return send(this.historyText(id,`🧾 <b>${esc(fullName(this.billing.user(id)))}</b> — oxirgi operatsiyalar`));
   case 'add':case 'sub':{
    const u=this.billing.user(id);if(!u)return answer('Foydalanuvchi topilmadi.',true);
    await answer();
    this.billing.setState(adminId,'adm_amount',{target:id,sign:action==='add'?1:-1});
    return send(`${action==='add'?'➕':'➖'} <b>${esc(fullName(u))}</b> (<code>${id}</code>) — joriy balans ${som(u.balance)}\n\n${action==='add'?'Qo‘shiladigan':'Ayiriladigan'} summani yozing. Izoh qo‘shish mumkin:\n<code>50000 naqd to‘lov</code>`,{reply_markup:cancelButton});
   }
   case 'block':case 'unblock':{
    if(!this.billing.user(id))return answer('Foydalanuvchi topilmadi.',true);
    const blocked=action==='block';
    if(blocked&&this.isAdmin(id))return answer('Administratorni bloklab bo‘lmaydi.',true);
    this.billing.setBlocked(id,blocked);if(blocked)this.auth.revokeAll(id);
    await answer(blocked?'Bloklandi, qurilmalari uzildi.':'Blokdan chiqarildi.');
    return this.userCard(id,out);
   }
   case 'revoke':{
    if(!this.billing.user(id))return answer('Foydalanuvchi topilmadi.',true);
    const n=this.auth.revokeAll(id);await answer(`${n} ta qurilma uzildi.`);
    return this.userCard(id,out);
   }
   case 'cancel':this.billing.setState(adminId,null);await answer();return out('Bekor qilindi.');
   case 'bc':{
    if(this.broadcasting)return answer('Oldingi xabar hali yuborilmoqda.',true);
    if(!Number.isSafeInteger(id)||id<=0)return answer();
    await answer('Yuborish boshlandi');
    const targets=this.billing.broadcastTargets().filter(t=>t!==chatId);
    await out(`📣 Yuborilmoqda: ${targets.length} ta foydalanuvchi…`);
    // Runs in the background so the bot keeps answering while thousands of messages go out.
    this.broadcasting=this.broadcast(chatId,id,targets).finally(()=>{this.broadcasting=null});
    return;
   }
  }
  return answer();
 }
 async broadcast(chatId,messageId,targets){
  let sent=0,failed=0;
  for(const id of targets){
   try{await this.call('copyMessage',{chat_id:id,from_chat_id:chatId,message_id:messageId});sent++}catch{failed++}
   // Telegram allows about 30 messages per second.
   await this.sleep(40);
  }
  await this.notify(chatId,`📣 Xabar yuborildi.\n✅ Yetkazildi: <b>${sent}</b>\n❌ Yetkazilmadi: <b>${failed}</b>${failed?' (botni bloklagan yoki o‘chirilgan)':''}`);
  return {sent,failed};
 }

 // Slash commands stay for quick access. Returns false when the command is not an admin command.
 async onAdmin(chatId,adminId,cmd,args){
  const reply=text=>this.send(chatId,text);
  const target=()=>{const id=Number(args[0]);return Number.isSafeInteger(id)&&this.billing.user(id)?id:null};
  switch(cmd){
   case '/narx':{
    if(!args.length)return reply(`Joriy narx: ${som(this.billing.price())}. O‘zgartirish: /narx 5000`);
    const price=parseAmount(args[0]);try{this.billing.setPrice(price)}catch(e){return reply(e.message)}
    return reply(`✅ Yangi narx: ${som(price)} / 1 pasport`);
   }
   case '/qoshish':{
    const id=target(),amount=parseAmount(args[1]||'');
    if(!id||!Number.isSafeInteger(amount)||amount===0)return reply('Foydalanish: /qoshish ID SUMMA [izoh]. Ayirish uchun manfiy summa: /qoshish ID -5000');
    try{const r=this.billing.adjust(id,amount,args.slice(2).join(' '),adminId);await this.notify(id,`${amount>0?'➕':'➖'} Balansingiz o‘zgartirildi: ${amount>0?'+':'−'}${som(Math.abs(amount))}\n💰 Joriy balans: <b>${som(r.balance)}</b>`);return reply(`✅ ${id}: yangi balans ${som(r.balance)}`)}
    catch(e){return reply(e instanceof InsufficientBalance?'Balans manfiy bo‘lib qoladi.':esc(e.message))}
   }
   case '/user':{
    const found=args.length?this.billing.findUsers(args.join(' ')):[];
    if(!found.length)return reply('Foydalanish: /user ID yoki /user @username');
    return this.searchResults(found,this.sender(chatId));
   }
   case '/kutilayotgan':return this.receipts(chatId);
   case '/bloklash':case '/ochish':{
    const id=target();if(!id)return reply(`Foydalanish: ${cmd} ID`);
    const blocked=cmd==='/bloklash';
    if(blocked&&this.isAdmin(id))return reply('Administratorni bloklab bo‘lmaydi.');
    this.billing.setBlocked(id,blocked);if(blocked)this.auth.revokeAll(id);
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
