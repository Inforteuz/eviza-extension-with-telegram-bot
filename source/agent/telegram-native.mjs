import {pauseKey,rateLimitNote} from './saudi-rate-limit.mjs';
import {randomUUID} from 'node:crypto';
import {blankApplicant,fieldLabels,statuses,applicantSuggestions,applicantPreview,requiredApplicantFields,missingFields,tripFields,optionalFields,validDate,paymentUrl,officialDraftUrl} from '../lib/domain.ts';
import {cropPassportPortrait} from './portrait.mjs';
import {resolveGroup,assertGroupMutable} from './group-store.mjs';
import {groupDeletionRevision,groupRosterStarted} from './delete-store.mjs';

const fields=Object.keys(blankApplicant);
const choices={gender:['Male','Female'],maritalStatus:['Married','Single','Divorced','Widow','Other'],visitPurpose:['Umrah','Leisure','Family & Relatives','Event'],accommodationType:['Hotel','Residential']};
const labels={Male:'Erkak',Female:'Ayol',Married:'Turmush qurgan',Single:'Turmush qurmagan',Divorced:'Ajrashgan',Widow:'Beva',Other:'Boshqa',Hotel:'Mehmonxona',Residential:'Mezbon',Umrah:'Umra',Leisure:'Turizm','Family & Relatives':'Qarindoshlar','Event':'Tadbir'};
const short=a=>a.id.slice(0,8);
const portraitCaption=a=>`${a.data.lastName||''} ${a.data.firstName||'Arizachi'}\nAriza: ${short(a)}${a.group_id?' · '+a.group_position+'-arizachi':''}\n200 × 200 portret. Suratni pasport bilan solishtiring.`.trim();
const cb=(text,data)=>({text,callback_data:data});
const editable=a=>!['queued','running','payment_ready','paid'].includes(a.status);
const home={keyboard:[[{text:'📂 Arizalar'},{text:'📷 Yangi ariza'}],[{text:'✅ Tasdiqlash navbati'},{text:'👥 Guruhlar'}],[{text:'📊 Holat'},{text:'⚙️ Safar sozlamalari'}]],resize_keyboard:true};
export const botCommands=[{command:'start',description:'Bot menyusi'},{command:'arizalar',description:'Arizalar va holatlar'},{command:'yangi',description:'Yangi pasport yuborish'},{command:'status',description:'Navbat va ulanishlar'},{command:'qidir',description:'Ism yoki pasport raqami bilan qidirish'},{command:'safar',description:'Umumiy safar sozlamalari'},{command:'saudi',description:'Kompyuterda Saudi akkauntiga kirish'},{command:'bekor',description:'Joriy tahrirni bekor qilish'}];
botCommands.push({command:'group',description:'Yangi guruh yaratish'},{command:'guruhlar',description:'Guruhlar va a’zolar'},{command:'individual',description:'Individual pasport rejimi'});
botCommands.push({command:'tozalash',description:'Barcha pasport va arizalarni tozalash'},{command:'saudi_davom',description:'Saudi cheklovi tugagach pauzani yechish'});
botCommands.push({command:'tasdiqlash',description:'Navbatdagi pasportni tekshirish va tasdiqlash'});

export function normalizeField(key,text){
 let value=String(text).trim();if(value==='-')return '';
 if(['birthDate','issueDate','expiryDate','travelDate','departureDate'].includes(key)){
  const m=value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);if(m)value=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  if(!validDate(value))throw Error('Sana YYYY-MM-DD yoki DD.MM.YYYY ko‘rinishida bo‘lsin.');
 }
 const synonyms={ayol:'Female',erkak:'Male',oilali:'Married','turmush qurgan':'Married','turmush qurmagan':'Single',ajrashgan:'Divorced',beva:'Widow',umra:'Umrah',turizm:'Leisure',mehmonxona:'Hotel',mezbon:'Residential'};
 if(choices[key]){value=synonyms[value.toLowerCase()]||choices[key].find(x=>x.toLowerCase()===value.toLowerCase())||value;if(!choices[key].includes(value))throw Error('Ko‘rsatilgan variantlardan birini tanlang.');}
 if(['nationality','birthCountry','residenceCountry','passportIssuePlace'].includes(key)&&/^(uzb|uzbekistan|o[‘’'ʻ]?zbekiston)$/i.test(value))value='Uzbekistan';
 if(key==='passportNumber')value=value.replace(/\s/g,'').toUpperCase();
 if(value.length>500)throw Error('Maydon 500 belgidan oshmasin.');return value;
}

export class TelegramNative {
 constructor({store,operatorId,call,download,sendImage,openSaudi,aiStatus=async()=>null,submissionEnabled=false}){Object.assign(this,{store,operatorId:String(operatorId),call,download,sendImage,openSaudi,aiStatus,submissionEnabled})}
 api(route,method='GET',body){return this.store.request(route,method,body,'operator')}
 say(text,buttons){return this.call('sendMessage',{chat_id:this.operatorId,text:String(text).slice(0,4000),reply_markup:buttons?{inline_keyboard:buttons}:home,protect_content:true})}
 pending(){const s=this.store.getMeta('telegram-input');return s?.expires>Date.now()?s:null}
 setPending(value){this.store.setMeta('telegram-input',value?{...value,expires:Date.now()+1800000}:null)}
 reviewNext({force=false,announce=false}={}){
  // OCR finishes independently of Telegram callbacks. Serialize delivery so two
  // completed jobs cannot send the same card at once or overtake the queue head.
  const next=(this.reviewDelivery||Promise.resolve()).catch(()=>{}).then(async()=>{
   const {head,count}=this.store.reviews.view();
   if(!head){if(force||announce)await this.say('Tasdiqlash navbati tugadi. Tayyor ariza yoki guruhni o‘z kartasidan eVisaga yuborishingiz mumkin.');return;}
   if(!head.ready){if(force||announce)await this.say(`Navbatda ${count} ta pasport. Birinchi pasport o‘qilmoqda; tayyor bo‘lganda kartasi shu yerga chiqadi.`);return;}
   const shown=this.store.reviews.shown();
   if(!force&&shown?.id===head.id&&shown.version===head.version)return;
   await this.show(head.id,{portrait:true});
  });
  this.reviewDelivery=next;return next;
 }
 async clearAllPreview(){
  this.setPending(null);const p=await this.api('clear-all/preview','POST');
  if(!p.applications&&!p.groups){this.store.setMeta('telegram-clear-all',null);return this.say('Tozalash uchun pasport yoki ariza yo‘q.');}
  return this.say(`Barcha pasportlarni tozalash\n${p.applications} ta ariza (to‘lovga tayyorlari ham), ularning pasport va portret rasmlari hamda ${p.groups} ta guruh botdan o‘chiriladi. Bu amalni qaytarib bo‘lmaydi.\nSaudi saytidagi arizalar, Telegramdagi oldingi xabarlar va bot ulanish sozlamalari saqlanadi.\nTasdiq 5 daqiqa amal qiladi.`,[[cb('Ha, barchasini o‘chirish','clearall:'+p.token)],[cb('Bekor qilish','clearcancel:'+p.token)]]);
 }
 async saudiPause(){
  const pause=this.store.getMeta(pauseKey);if(!pause)return this.say('Saudi cheklovi uchun pauza yo‘q. /saudi orqali oching; ariza yoki guruhni o‘z kartasidan davom ettiring.');
  const wait=pause.notBefore?'\nSayt belgilagan eng erta vaqt: '+new Date(pause.notBefore).toLocaleString('uz-UZ',{timeZone:'Asia/Tashkent'}):'\nSayt kutish muddatini ko‘rsatmadi. Cheklov tugagach davom eting.';
  return this.say(rateLimitNote+wait+'\nPauza yechilganda eski arizalar avtomatik yuborilmaydi.',[[cb('Sayt ochildi — pauzani yechish','saudiresume:'+pause.id)]]);
 }
 async chooseMode(){
  this.setPending(null);const nonce=randomUUID().slice(0,8);this.store.setMeta('telegram-mode-choice',nonce);
  await this.say('Ariza turini tanlang:',[[cb('👤 Individual','intake:individual:'+nonce),cb('👥 Group','intake:group:'+nonce)]]);
 }
 async askGroupName(){this.setPending({mode:'group_name',nonce:randomUUID()});await this.say('Guruh nomini yozing. Masalan: Umra sentabr.');}
 async groupList(){const groups=await this.api('groups');await this.say(groups.length?'Guruhni tanlang:':'Hali guruh yo‘q. /group orqali yarating.',groups.slice(0,30).map(g=>[cb(`${g.name} · ${g.members.length} kishi · ${statuses[g.status]||g.status}`,'gview:'+g.id.slice(0,8))]));}
 async showGroup(id){
  const g=await this.api('groups/'+id),s=id.slice(0,8),done=g.members.filter(m=>m.confirmed).length;
  const lines=[`Guruh: ${g.name} · ${statuses[g.status]||g.status}`,`Pasportlar: ${g.members.length} · Tasdiqlangan: ${done}`, ...g.members.map((m,i)=>`${i+1}. ${m.data.lastName||''} ${m.data.firstName||'O‘qilmoqda'} — ${m.duplicate_of?'⚠️ takroriy surat':m.confirmed?'tasdiqlangan':statuses[m.status]||m.status}`),g.note||''];
  const buttons=g.members.map(m=>[cb(`${m.group_position}. ${m.data.firstName||'Arizachi'} · ko‘rish`,'view:'+m.id.slice(0,8))]);
  if(editable(g))buttons.push([cb('➕ Pasport qo‘shish','gadd:'+s)],[cb('AI’da qayta o‘qish','gextract:'+s+':'+g.version)],[cb('Pasportlar tugadi — tayyorlash','gqueue:'+s+':'+g.version)]);
  if(this.store.getMeta(pauseKey)){lines.unshift('⏸ '+rateLimitNote);for(let i=buttons.length-1;i>=0;i--)if(buttons[i].some(b=>b.callback_data?.startsWith('gqueue:')))buttons.splice(i,1);buttons.push([cb('Saudi pauzasi','saudipause')]);}
  if(g.status==='queued')buttons.push([cb('⏸ Guruhni navbatdan olish','gpause:'+s)]);
  if(g.status==='payment_ready'&&paymentUrl(g.payment_url))buttons.push([{text:'Guruh to‘loviga o‘tish',url:g.payment_url}]);
  if(g.status!=='running'&&!g.members.some(m=>m.status==='running'))buttons.push([cb('🗑 Guruhni o‘chirish','gdelete:'+s+':'+groupDeletionRevision(g))]);
  buttons.push([cb('Guruhlar','glist')]);await this.say(lines.filter(Boolean).join('\n'),buttons);
 }
 async list(offset=0,query){
  if(query!==undefined)this.store.setMeta('telegram-search',query);
  const q=this.store.getMeta('telegram-search','').toLowerCase();let apps=await this.api('applications');
  if(q)apps=apps.filter(a=>[a.data.firstName,a.data.lastName,a.data.passportNumber,a.id].some(x=>x?.toLowerCase().includes(q)));
  offset=Math.max(0,Number(offset)||0);const part=apps.slice(offset,offset+8);
  const buttons=part.map(a=>[cb(`${a.data.lastName||'Yangi'} ${a.data.firstName||'ariza'} · ${statuses[a.status]||a.status}`,`view:${short(a)}`)]);
  const pages=[];if(offset>0)pages.push(cb('← Oldingi',`list:${Math.max(0,offset-8)}`));if(offset+8<apps.length)pages.push(cb('Keyingi →',`list:${offset+8}`));if(pages.length)buttons.push(pages);
  await this.say(`Arizalar: ${apps.length}${q?'\nQidiruv: '+q:''}\n${apps.length?'Arizani tanlang.':'Yangi ariza uchun pasport rasmini shu chatga yuboring.'}`,buttons.length?buttons:undefined);
 }
 async show(id,{portrait=false}={}){
  const a=await this.api('applications/'+id),s=short(a),group=a.group_id?await this.api('groups/'+a.group_id):null,canEdit=editable(a)&&(!group||editable(group)),preview=canEdit?applicantPreview(a.data):{data:a.data,suggestions:[]};
  const review=this.store.reviews.view(),inReview=review.head?.id===id&&review.head.ready;
  if(inReview)portrait=true;
  const proposed=new Set(preview.suggestions.map(x=>x.field)),required=requiredApplicantFields(preview.data),missing=missingFields(preview.data,a.portrait);
  const text=[`Ariza: ${s} · ${statuses[a.status]||a.status}`,a.note?.includes('AI ulanmagan')?'⚠️ AI ulanmagan: pasport matnini o‘qish uchun bot sozlamalarida API kalitini kiriting.':'',...fields.filter(k=>preview.data[k]||required.includes(k)).map(k=>`${fieldLabels[k]}: ${labels[preview.data[k]]||preview.data[k]||'—'}${proposed.has(k)?' (taklif, tekshiring)':''}`),`Portret: ${a.portrait?'tayyor':'kerak'}`,a.note?`Izoh: ${a.note}`:'',missing.length?'Yetishmaydi: '+missing.join(', '):'Majburiy maydonlar to‘ldirilgan.',preview.suggestions.length?'Shablon takliflari arizachining haqiqiy ma’lumotlariga mosligini tekshiring.':''].filter(Boolean).join('\n');
  const buttons=[];
  if(a.duplicate_of){
   buttons.push([cb('Avvalgi arizani ko‘rish','view:'+a.duplicate_of.slice(0,8))]);
   if(canEdit)buttons.push([cb('Bu boshqa pasport — o‘qish',`distinct:${s}:${a.version}`)]);
  }
  if(group)buttons.push([cb('👥 '+group.name+' · '+(statuses[group.status]||group.status),'gview:'+group.id.slice(0,8))]);
  if(canEdit&&!a.duplicate_of&&inReview&&!missing.length)buttons.push([cb('✅ Tasdiqlash — keyingisi',`qapprove:${s}:${a.version}`)]);
  if(canEdit&&!a.duplicate_of&&!inReview&&preview.suggestions.length)buttons.push([cb('Ma’lumotlar to‘g‘ri, davom etish',`approve:${s}:${a.version}`)]);
  if(canEdit&&!a.duplicate_of){
   buttons.push([cb('✏️ Tahrirlash',`fields:${s}:0`),cb('To‘ldirish',`fill:${s}`)],[cb('Takliflarni ko‘rish',`suggest:${s}`),cb('🖼 Portret',`portrait:${s}`)],[cb('Pasportni qayta o‘qish',`extract:${s}`)]);
   if(!inReview)buttons.push([cb(a.group_id?'Guruh uchun tasdiqlash':'eVisaga tayyorlash',a.group_id?`gmember:${s}:${a.version}`:`queue:${s}`)]);
  }
  if(canEdit&&group&&!groupRosterStarted(group))buttons.push([cb('Guruhdan chiqarish',`gremove:${s}:${a.version}`)]);
  else if(a.status==='queued')buttons.push([cb('⏸ Navbatdan chiqarish',`pause:${s}`)]);
  buttons.push([cb('Tarix',`history:${s}`),cb('Arizalar',`list:0`)]);
  if(a.status!=='running'&&(!group||!['queued','running'].includes(group.status)&&!groupRosterStarted(group)))buttons.push([cb('🗑 Arizani o‘chirish',`delete:${s}:${a.version}`)]);
  if(a.official_url&&officialDraftUrl(a.official_url))buttons.push([{text:'Saudi qoralamasi',url:a.official_url}]);
  if(a.status==='payment_ready'&&paymentUrl(a.payment_url))buttons.push([{text:'To‘lovga o‘tish',url:a.payment_url}]);
  // Capture the matching photo before sending the card. A later upload must not
  // pair a new image with an earlier version of the applicant's information.
  const photo=portrait&&a.portrait?await this.api(`applications/${id}/file?kind=portrait&version=${a.version}`):null;
  const warning=a.duplicate_of?`⚠️ Bu surat ${a.duplicate_of.slice(0,8)} arizasidagi pasportga o‘xshaydi. O‘qish va eVisa navbati to‘xtatildi. Ikkala suratni tekshiring. Takroriy bo‘lsa, shu arizani o‘chiring.\n\n`:'';
  const heading=inReview?`Tasdiqlash navbati: ${review.count} ta. Shu arizani tasdiqlasangiz keyingisi chiqadi.\n\n`:'';
  const message=await this.say(heading+warning+text,buttons);
  if(photo)await this.sendImage(photo,portraitCaption(a),{replyTo:message.message_id});
  if(inReview)this.store.reviews.markShown(id,a.version);
 }
 async fieldMenu(id,page=0){const a=await this.api('applications/'+id);this.store.mutable(a);const part=fields.filter(k=>k!=='postalCode').slice(page*8,page*8+8);const rows=part.map(k=>[cb(fieldLabels[k],`edit:${short(a)}:${a.version}:${fields.indexOf(k)}`)]);const nav=[];if(page>0)nav.push(cb('←',`fields:${short(a)}:${page-1}`));if((page+1)*8<fields.length-1)nav.push(cb('→',`fields:${short(a)}:${page+1}`));if(nav.length)rows.push(nav);rows.push([cb('Arizaga qaytish',`view:${short(a)}`)]);await this.say('Qaysi ma’lumotni o‘zgartirasiz?',rows)}
 async askField(id,key,{wizard=false,trip=false,version}={}){
  const a=trip?null:await this.api('applications/'+id);if(a)this.store.mutable(a);
  if(!fields.includes(key))throw Error('Maydon topilmadi. Menyuni qayta oching.');
  const nonce=randomUUID().slice(0,8);this.setPending({mode:'field',id,key,wizard,trip,version:version??a?.version,values:choices[key]||[],nonce});
  const rows=choices[key]?.map((v,i)=>[cb(labels[v]||v,'value:'+nonce+':'+i)]);
  await this.say(`${fieldLabels[key]} qiymatini yuboring.${['birthDate','issueDate','expiryDate','travelDate','departureDate'].includes(key)?'\nMasalan: 08.07.1971':''}${optionalFields.includes(key)?'\nBo‘sh qoldirish uchun - yuboring.':''}\nBekor qilish: /bekor`,rows);
 }
 async fillNext(id){const a=await this.api('applications/'+id),preview=applicantPreview(a.data);let k=requiredApplicantFields(preview.data).find(k=>!preview.data[k]);if(k==='birthCountry'&&!preview.data.birthCity)k='birthCity';if(k)await this.askField(id,k,{wizard:true});else await this.show(id)}
 async trip(){const d=(await this.api('settings')).tripDefaults;await this.say(['Umumiy safar sozlamalari','Yangi arizalarda kirish — bugun, chiqish — keyingi yil bir kun oldin.',...tripFields.filter(k=>!['travelDate','departureDate'].includes(k)).map(k=>`${fieldLabels[k]}: ${labels[d[k]]||d[k]||'—'}`)].join('\n'),tripFields.filter(k=>!['travelDate','departureDate'].includes(k)).map(k=>[cb(fieldLabels[k],'trip:'+fields.indexOf(k))]))}
 async textInput(text){
  const p=this.pending();if(!p)return false;
  if(p.mode==='group_name'){
   const g=await this.api('groups','POST',{name:text,sourceKey:p.nonce});this.store.setMeta('telegram-intake',{mode:'group',groupId:g.id});this.setPending(null);
   await this.say(`“${g.name}” guruhi yaratildi. Shu guruhdagi pasportlarni bittalab yoki albom qilib yuboring. Har birini tekshirib tasdiqlang, so‘ng guruhdagi “Pasportlar tugadi — tayyorlash”ni bosing.`);await this.showGroup(g.id);return true;
  }
  if(p.mode==='field'){
   const value=normalizeField(p.key,text);
   if(p.trip){const old=(await this.api('settings')).tripDefaults;await this.api('trip-defaults','POST',{data:{...old,[p.key]:value,travelDate:'',departureDate:''}});this.setPending(null);await this.trip();return true}
   const a=await this.api('applications/'+p.id);await this.api('applications/'+p.id,'PATCH',{version:p.version,data:{...a.data,[p.key]:value}});this.setPending(null);
   if(p.wizard)await this.fillNext(p.id);else await this.show(p.id);return true;
  }
  if(['portrait','passport'].includes(p.mode)){await this.say('Rasm yuboring yoki /bekor buyrug‘ini bering.');return true}
  return false;
 }
 async image(m,updateId){
  const doc=m.document||m.photo?.at(-1);if(doc.file_size>10*1024*1024)throw Error('Rasm 10 MB dan kichik bo‘lsin.');
  const p=this.pending();if(p?.mode==='group_name')throw Error('Avval guruh nomini yozing yoxud /bekor yuboring.');
  const bytes=await this.download(doc.file_id);await this.store.validateFile(bytes,'passport');let kind='passport',id;
  if(p&&['portrait','passport'].includes(p.mode)){id=p.id;kind=p.mode}else{
   // The source key makes Telegram update retries idempotent.
   const intake=this.store.getMeta('telegram-intake');
   const a=await this.api('applications','POST',{sourceKey:'telegram:'+updateId,data:{},groupId:intake?.mode==='group'?intake.groupId:undefined});id=a.id;
   if(a.passport){await this.reviewNext();return}
  }
  let image=bytes;
  if(kind==='portrait'){try{await this.store.validateFile(bytes,'portrait')}catch{image=await cropPassportPortrait(bytes)}}
  const form=new FormData();form.set('file',new Blob([image]),kind+'.jpg');form.set('kind',kind);
  await this.api('applications/'+id+'/upload','POST',form);if(p&&['portrait','passport'].includes(p.mode))this.setPending(null);
  if(kind==='passport'&&(await this.api('applications/'+id)).duplicate_of){this.store.reviews.ready(id);await this.say('Pasport qabul qilindi: '+id.slice(0,8)+'. O‘xshash surat bor; o‘z navbatida tekshirish uchun chiqadi.');return this.reviewNext();}
  if(kind==='passport'){await this.api('applications/'+id+'/queue','POST',{job:'extract'});const a=await this.api('applications/'+id),group=a.group_id?await this.api('groups/'+a.group_id):null;await this.say('Pasport qabul qilindi: '+id.slice(0,8)+(group?'\nGuruh: '+group.name+' · '+a.group_position+'-arizachi':'\nIndividual ariza')+'\nBot o‘qib tayyorlaydi. Kartalar bittadan tasdiqlash uchun chiqadi. /tasdiqlash',group?[[cb('Guruhni ko‘rish','gview:'+group.id.slice(0,8))]]:undefined);}else await this.show(id,{portrait:true});
 }
 async callback(c){
  await this.call('answerCallbackQuery',{callback_query_id:c.id}).catch(()=>{});
  const [action,s,v,k]=String(c.data||'').split(':');
  if(action==='reviewnext')return this.reviewNext({force:true});
  if(action==='saudipause')return this.saudiPause();
  if(action==='saudiresume'){await this.api('saudi/resume','POST',{confirmed:true,pauseId:s});return this.say('eVisa pauzasi yechildi. /saudi orqali oching, keyin ariza yoki guruhni o‘z kartasidan davom ettiring.');}
  if(action==='clearcancel'){
   if(this.store.getMeta('telegram-clear-all')?.token===s)this.store.setMeta('telegram-clear-all',null);
   return this.say('Tozalash bekor qilindi.');
  }
  if(action==='clearall'){
   await this.api('clear-all/confirm','POST',{confirmed:true,token:s});
   return this.say('Barcha pasportlar, portretlar, arizalar va guruhlar botdan tozalandi. Yangi pasport yuborishingiz mumkin.');
  }
  if(action==='intake'){
   if(this.store.getMeta('telegram-mode-choice')!==v)throw Error('Tanlov eskirgan. /yangi orqali qayta tanlang.');this.store.setMeta('telegram-mode-choice',null);
   if(s==='group')return this.askGroupName();
   if(s!=='individual')throw Error('Ariza turi noto‘g‘ri.');this.setPending(null);this.store.setMeta('telegram-intake',{mode:'individual'});return this.say('Individual rejim. Pasport rasmini yuboring.');
  }
  if(action==='glist')return this.groupList();
  if(['gview','gadd','gqueue','gconfirm','gpause','gextract','gdelete','gdelconfirm'].includes(action)){
   const id=resolveGroup(this.store,s),g=await this.api('groups/'+id);
   if(action==='gview')return this.showGroup(id);
   if(action==='gdelete'||action==='gdelconfirm'){
    if(v!==groupDeletionRevision(g))throw Error('Guruh yoki arizachi yangilangan. Guruhni qayta oching.');
    if(action==='gdelete')return this.say(`“${g.name}” guruhi va undagi ${g.members.length} ta ariza, pasport va portret botdan o‘chiriladi. Bu amalni qaytarib bo‘lmaydi. Saudi saytidagi arizalar hamda Telegramdagi oldingi xabarlar saqlanib qoladi.`,[[cb('Ha, guruh va arizalarni o‘chirish','gdelconfirm:'+s+':'+v)],[cb('Bekor qilish','gview:'+s)]]);
    await this.api('groups/'+id,'DELETE',{confirmed:true,revision:v});await this.say('Guruh va undagi arizalar botdan o‘chirildi.');await this.reviewNext();return this.groupList();
   }
   if(action==='gadd'){assertGroupMutable(this.store,id);this.setPending(null);this.store.setMeta('telegram-intake',{mode:'group',groupId:id});return this.say('“'+g.name+'” guruhiga keyingi pasportlarni yuboring.',[[cb('Guruhni ko‘rish','gview:'+s)]]);}
   if(action==='gpause'){await this.api('groups/'+id+'/pause','POST',{});return this.showGroup(id)}
   if(action==='gextract'){
    assertGroupMutable(this.store,id);if(Number(v)!==g.version)throw Error('Guruh yangilangan. Qayta oching.');
    const members=g.members.filter(m=>m.passport&&!m.duplicate_of&&!m.confirmed&&editable(m)&&!g.checkpoint.members?.[m.id]);
    if(!members.length)return this.say('AI’da qayta o‘qiladigan, tasdiqlanmagan pasport topilmadi.');
    for(const m of members)await this.api('applications/'+m.id+'/queue','POST',{job:'extract'});
    return this.say(members.length+' ta pasport AI’da o‘qish navbatiga qo‘shildi. Natijalar shu chatga keladi.');
   }
   if(!this.submissionEnabled)throw Error('Saudi avtomatik to‘ldirish o‘chiq.');
   if(g.version!==Number(v))throw Error('Guruh ro‘yxati o‘zgargan. Guruhni qayta oching.');
   if(action==='gqueue'){
    if(!g.members.length)throw Error('Avval guruhga pasport yuboring.');
    const pending=g.members.filter(m=>!m.confirmed||!editable(m));if(pending.length)return this.say('Avval quyidagi arizachilarni tekshirib tasdiqlang:\n'+pending.map(m=>m.data.firstName||m.id.slice(0,8)).join('\n'),[[cb('✅ Tasdiqlash navbati','reviewnext')],[cb('Guruhni ko‘rish','gview:'+s)]]);
    return this.say(`“${g.name}” guruhida ${g.members.length} kishi. Bot shu ro‘yxatni Saudi Group arizasiga ketma-ket qo‘shib, to‘lovgacha tayyorlaydi.`,[[cb('Tasdiqlayman, guruhni boshlash','gconfirm:'+s+':'+g.version)],[cb('Guruhga qaytish','gview:'+s)]]);
   }
   await this.api('groups/'+id+'/queue','POST',{version:g.version,confirmed:true});return this.say('Guruh navbatga qo‘shildi. A’zolar navbat bilan to‘ldiriladi.');
  }
  if(action==='list'){this.setPending(null);return this.list(s)}
  if(action==='trip')return this.askField(null,fields[Number(s)],{trip:true});
  if(action==='value'){const p=this.pending();if(p?.nonce!==s||!p?.values?.[Number(v)])throw Error('Bu tanlov eskirgan. Maydonni qayta oching.');return this.textInput(p.values[Number(v)])}
  if(action==='apply'){
   const p=this.store.getMeta('telegram-suggestion');if(!p||p.nonce!==s||p.expires<Date.now())throw Error('Taklif eskirgan. Qayta oching.');
   const a=await this.api('applications/'+p.id);if(a.version!==p.version)throw Error('Ariza o‘zgargan. Takliflarni qayta tekshiring.');
   await this.api('applications/'+p.id,'PATCH',{version:p.version,data:{...a.data,...Object.fromEntries(p.items.map(x=>[x.field,x.value]))}});this.store.setMeta('telegram-suggestion',null);return this.show(p.id);
  }
  const id=this.store.resolve(s),a=await this.api('applications/'+id);
  if(action==='qapprove'){
   await this.api('applications/'+id+'/review-confirm','POST',{confirmed:true,version:Number(v),data:applicantPreview(a.data).data});
   if(this.pending()?.id===id)this.setPending(null);
   const link=a.group_id?cb('Guruhni ko‘rish','gview:'+a.group_id.slice(0,8)):cb('eVisaga tayyorlash','queue:'+s);
   await this.say(`${a.data.lastName||''} ${a.data.firstName||s}: ma’lumotlar va portret tasdiqlandi.`,[[link]]);
   await this.reviewNext({announce:true});
   if(!this.store.reviews.view().count&&a.group_id)await this.showGroup(a.group_id);
   return;
  }
  if(action==='distinct'){
   await this.api('applications/'+id+'/duplicate-distinct','POST',{confirmed:true,version:Number(v)});
   await this.api('applications/'+id+'/queue','POST',{job:'extract'});return this.say('Bu surat alohida pasport sifatida o‘qish navbatiga qo‘shildi: '+s);
  }
  if(action==='delete'||action==='delconfirm'){
   if(Number(v)!==a.version)throw Error('Ariza yangilangan. Arizani qayta oching.');
   if(action==='delete')return this.say(`${a.data.lastName||''} ${a.data.firstName||s}\nAriza, pasport va portret botdan o‘chiriladi. Bu amalni qaytarib bo‘lmaydi. Saudi saytidagi ariza hamda Telegramdagi oldingi xabarlar saqlanib qoladi.`,[[cb('Ha, arizani o‘chirish','delconfirm:'+s+':'+v)],[cb('Bekor qilish','view:'+s)]]);
   await this.api('applications/'+id,'DELETE',{confirmed:true,version:Number(v)});await this.say('Ariza botdan o‘chirildi.');await this.reviewNext();return a.group_id?this.showGroup(a.group_id):this.list(0,'');
  }
  if(action==='gmember'){
   if(!a.group_id)throw Error('Ariza guruhga tegishli emas.');await this.api('groups/'+a.group_id+'/confirm-member','POST',{memberId:id,version:Number(v)});await this.reviewNext();return this.showGroup(a.group_id);
  }
  if(action==='gremove'){
   if(!a.group_id)throw Error('Ariza guruhga tegishli emas.');await this.api('groups/'+a.group_id+'/remove-member','POST',{memberId:id,version:Number(v)});return this.showGroup(a.group_id);
  }
  if(action==='approve'){
   this.store.mutable(a);if(a.version!==Number(v))throw Error('Ariza o‘zgargan. Qayta ochib tekshiring.');
   const preview=applicantPreview(a.data);
   if(!preview.suggestions.length)throw Error('Takliflar yangilangan. Arizani qayta oching.');
   await this.api('applications/'+id,'PATCH',{version:a.version,data:preview.data});
   const current=await this.api('applications/'+id);
   if(!missingFields(current.data,current.portrait).length){
    if(current.group_id){await this.api('groups/'+current.group_id+'/confirm-member','POST',{memberId:id,version:current.version});await this.reviewNext();return this.showGroup(current.group_id);}
    if(this.submissionEnabled){await this.api('applications/'+id+'/queue','POST',{job:'visa',confirmed:true,version:current.version});await this.say('Ma’lumotlar tasdiqlandi. Ariza eVisa’da tayyorlash navbatiga qo‘shildi.');return this.reviewNext();}
    await this.say('Ma’lumotlar tasdiqlandi va tayyor. eVisa’da avtomatik to‘ldirish sinovi tugagach ishga tushiriladi.');
   }
   return this.show(id);
  }
  if(action==='view'){this.setPending(null);return this.show(id)}
  if(action==='fields')return this.fieldMenu(id,Number(v)||0);
  if(action==='edit'){if(a.version!==Number(v))throw Error('Ariza o‘zgargan. Qayta oching.');return this.askField(id,fields[Number(k)],{version:Number(v)})}
  if(action==='fill')return this.fillNext(id);
  if(action==='suggest'){
   this.store.mutable(a);const items=applicantSuggestions(a.data);if(!items.length)return this.say('Yangi taklif yo‘q. Ma’lumotlarni Tahrirlash orqali o‘zgartiring.');
   const nonce=randomUUID().slice(0,8);this.store.setMeta('telegram-suggestion',{nonce,id,version:a.version,items,expires:Date.now()+600000});
   return this.say('Quyidagilar taxminiy takliflar. Arizachining haqiqiy ma’lumotlariga mos bo‘lsagina tasdiqlang:\n\n'+items.map(x=>`${fieldLabels[x.field]}: ${labels[x.value]||x.value}\n${x.reason}`).join('\n\n'),[[cb('Ma’lumotlar to‘g‘ri, qo‘llash','apply:'+nonce)],[cb('Orqaga','view:'+s)]]);
  }
  if(action==='portrait'){
   if(a.portrait)await this.show(id,{portrait:true});
   return this.say('Saqlangan pasportdan portretni qayta kesish yoki yangi rasm yuborishni tanlang.',[[cb('✂️ Qayta kesish','recrop:'+s)],[cb('Portret yuborish','replace:'+s)],[cb('Orqaga','view:'+s)]]);
  }
  if(action==='recrop'){await this.api('applications/'+id+'/queue','POST',{job:'portrait'});return this.say('Portret qayta kesish navbatiga qo‘shildi. Yangi portret tayyor bo‘lguncha avvalgisi saqlanadi.')}
  if(action==='replace'){this.store.mutable(a);this.setPending({mode:'portrait',id});return this.say('Yuz aniq ko‘ringan rasm yuboring. Bot 200 × 200 qilib kesadi. Bekor qilish: /bekor')}
  if(action==='history'){const events=await this.api('applications/'+id+'/events');return this.say(events.map(x=>new Date(x.created_at).toLocaleString('uz-UZ',{timeZone:'Asia/Tashkent'})+' — '+x.message).join('\n')||'Tarix bo‘sh.',[[cb('Arizaga qaytish','view:'+s)]])}
  if(action==='extract'){await this.api('applications/'+id+'/queue','POST',{job:'extract'});return this.say('Pasportni o‘qish navbatiga qo‘shildi.')}
  if(action==='pause'){await this.api('applications/'+id+'/pause','POST',{});return this.show(id)}
  if(action==='queue'){
   this.store.mutable(a);const missing=missingFields(a.data,a.portrait);if(missing.length)return this.say('Yetishmaydi / tekshiring: '+missing.join(', '),[[cb('To‘ldirish','fill:'+s)],[cb('Tahrirlash','fields:'+s+':0')]]);
   if(!this.submissionEnabled)return this.say('Ma’lumotlar tayyor. Saudi saytining sug‘urta va keyingi bosqichlari hali tekshirilmagani uchun rasmiy avtomatik yuborish o‘chiq. Ariza saqlangan.');
   return this.say('Arizadagi ma’lumotlar va portretni tekshirdingizmi? Tasdiqdan keyin mavjud Saudi akkauntida to‘ldirish boshlanadi.',[[cb('Tasdiqlayman, navbatga','confirm:'+s+':'+a.version)],[cb('Qayta ko‘rish','view:'+s)]]);
  }
  if(action==='confirm'){
   if(!this.submissionEnabled)throw Error('Rasmiy avtomatik yuborish hali yoqilmagan.');
   await this.api('applications/'+id+'/queue','POST',{job:'visa',confirmed:true,version:Number(v)});await this.say('Ariza navbatga qo‘shildi. To‘lov bajarilmaydi.');return this.reviewNext();
  }
  throw Error('Tugma eskirgan. /arizalar orqali qayta oching.');
 }
 async handle(update){
  const m=update.message,c=update.callback_query,source=c?.message||m,user=c?.from||m?.from;
  if(!source||source.chat?.type!=='private'||String(source.chat.id)!==this.operatorId||String(user?.id)!==this.operatorId)return false;
  try{
   if(c){await this.callback(c);return true}
   if(m.document||m.photo){await this.image(m,update.update_id);return true}
   const text=(m.text||'').trim();const command=text.split(/\s/)[0].split('@')[0];
   if(['/start','/app','/help','/bekor','/cancel'].includes(command)){this.setPending(null);this.store.setMeta('telegram-clear-all',null);await this.say('eVisa bot tayyor. Pasportning tiniq JPG yoki PNG rasmini shu chatga yuboring.\nMa’lumotlar, portret va ariza boshqaruvi shu yerda.\n/tasdiqlash — pasportlarni bittadan tekshirish\n/arizalar — arizalar\n/status — holat\n/safar — safar sozlamalari\n/tozalash — barcha pasportlarni tozalash');}
   else if(command==='/tozalash')await this.clearAllPreview();
   else if(command==='/tasdiqlash'||text==='✅ Tasdiqlash navbati')await this.reviewNext({force:true});
   else if(['/arizalar','/list'].includes(command)||text==='📂 Arizalar'){this.setPending(null);await this.list(0,'')}
   else if(command==='/qidir'){this.setPending(null);await this.list(0,text.slice(text.indexOf(' ')+1).trim()===text?'':text.slice(text.indexOf(' ')+1).trim())}
   else if(command==='/status'||text==='📊 Holat'){
    const ai=await this.aiStatus();if(ai)await this.say('Pasport AI: '+(ai.configured?'API kaliti saqlangan · '+ai.model:'ulanmagan. Kompyuterda eVisa Operator sozlamalaridagi “Pasportni AI orqali o‘qish” bo‘limiga API kalitini kiriting.'));
    const apps=await this.api('applications'),groups=await this.api('groups'),s=await this.api('settings');await this.say(`Jami arizachilar: ${apps.length}\nTasdiqlash navbatida: ${this.store.reviews.view().count}\nIndividual navbatda: ${apps.filter(x=>x.status==='queued'&&!x.group_id).length}\nGuruhlar: ${groups.length} · navbatda ${groups.filter(g=>g.status==='queued').length} · bajarilmoqda ${groups.filter(g=>g.status==='running').length}\nIndividual bajarilmoqda: ${apps.filter(x=>x.status==='running'&&!x.group_id).length}\nTo‘lovga tayyor: ${apps.filter(x=>x.status==='payment_ready'&&!x.group_id).length} individual, ${groups.filter(g=>g.status==='payment_ready').length} guruh\nSaudi akkaunti: ${s.saudiPause?'1015/429 — pauzada':s.connections.visa?'kirgan':'kirish kerak'}\nGmail: ${s.connections.gmail?'ulangan':'keyin ulanadi; kod qo‘lda'}\nRasmiy yuborish: ${s.saudiPause?'pauzada · /saudi_davom':this.submissionEnabled?'yoqilgan':'o‘chiq'}`);
   }else if(command==='/saudi_davom')return this.saudiPause();
   else if(command==='/saudi'){if(this.store.getMeta(pauseKey))return this.saudiPause();if(!this.openSaudi)throw Error('Saudi brauzeri bu ishga tushirishda mavjud emas.');const page=await this.openSaudi();await this.say(page?.manualLogin?'Brauzer skripti ulangan. Saudi akkauntiga shu sahifada kiring, so‘ng Telegramda ariza yoki guruhni boshlang.':'Kompyuterda Saudi brauzeri ochildi. Akkauntga kirish, kod yoki CAPTCHA chiqsa, shu oynada yakunlang.');}
   else if(command==='/safar'||text==='⚙️ Safar sozlamalari'){this.setPending(null);await this.trip()}
   else if(command==='/group')await this.askGroupName();
   else if(command==='/guruhlar'||text==='👥 Guruhlar')await this.groupList();
   else if(command==='/individual'){this.setPending(null);this.store.setMeta('telegram-intake',{mode:'individual'});await this.say('Individual rejim. Pasport rasmini yuboring.');}
   else if(command==='/yangi'||['📷 Pasport yuborish','📷 Yangi ariza'].includes(text))await this.chooseMode();
   else if(!await this.textInput(text))await this.say('Pasport rasmini yuboring yoki menyudan amal tanlang.');
  }catch(e){await this.say(e.status||e.message&&!/fetch|SQLITE|ENOENT|token/i.test(e.message)?String(e.message):'Amal bajarilmadi. /arizalar orqali holatni tekshiring.').catch(()=>{});}
  return true;
 }
}
