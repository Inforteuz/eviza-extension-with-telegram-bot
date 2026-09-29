import {fieldLabels,requiredApplicantFields} from '../lib/domain.js';
import {statusLabels,displayName,lockedStatuses} from '../lib/applicants.js';
import {putImage,deleteImages} from '../lib/images.js';
import {MAX_FILES_PER_DROP,DEFAULT_SERVER_URL} from '../config.js';

const $=id=>document.getElementById(id);
const KEYS=['auth','settings','applicants','run','log','pairing'];
let state={},view='main',editingId=null;
const portraitCache=new Map();
const som=n=>typeof n==='number'?String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,' ')+' so‘m':'—';
const placeholder='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#dbe5e2"/><circle cx="24" cy="19" r="8" fill="#9bb0ab"/><path d="M9 44c2-9 8-13 15-13s13 4 15 13" fill="#9bb0ab"/></svg>');

function h(tag,props={},...children){
 const el=document.createElement(tag);
 for(const [k,v] of Object.entries(props||{})){
  if(v===undefined||v===null||v===false)continue;
  if(k==='class')el.className=v;else if(k==='dataset')Object.assign(el.dataset,v);else if(k.startsWith('on'))el.addEventListener(k.slice(2),v);else if(k in el&&k!=='list')el[k]=v;else el.setAttribute(k,v===true?'':v);
 }
 for(const c of children.flat())if(c!==null&&c!==undefined&&c!==false)el.append(c instanceof Node?c:String(c));
 return el;
}
let toastTimer;
function toast(text,error=false){const t=$('toast');t.textContent=text;t.className='toast'+(error?' error':'');t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true},error?6000:3000)}
async function send(type,payload={},{quiet=false}={}){
 const r=await chrome.runtime.sendMessage({type,...payload});
 if(!r?.ok){if(!quiet)toast(r?.error||'Amal bajarilmadi.',true);throw Error(r?.error||'failed')}
 return r.result;
}
const busy=()=>['running','stopping'].includes(state.run?.state);

// ---------- Rendering ----------
function show(next){view=next;render()}
function render(){
 const connected=!!state.auth?.token;
 const current=!connected&&['main','editor'].includes(view)?'connect':connected&&view==='connect'?'main':view;
 for(const [name,id] of [['connect','connectView'],['main','mainView'],['editor','editorView'],['settings','settingsView']])$(id).hidden=current!==name;
 $('runBar').hidden=current!=='main';
 if(current==='connect')renderConnect();
 if(current==='main'){renderAccount();renderMode();renderList();renderRun()}
 if(current==='settings')renderSettings();
}
let resumed=false;
function renderConnect(){
 if(state.pairing&&!resumed){resumed=true;send('auth:pair-resume',{},{quiet:true}).catch(()=>{})}
 const input=$('serverUrl');if(document.activeElement!==input)input.value=state.settings?.serverUrl||DEFAULT_SERVER_URL||'';
 $('pairingBox').hidden=!state.pairing;$('pairBtn').disabled=!!state.pairing;
}
function renderAccount(){
 const acc=state.auth?.account;
 $('accName').textContent=acc?.user?.firstName?`${acc.user.firstName}${acc.user.username?' · @'+acc.user.username:''}`:'Hisob';
 $('accBalance').textContent=som(acc?.balance);
 $('accPrice').textContent=acc?`${som(acc.price)} / 1 pasport`:'';
 $('priceHint').textContent=acc?`1 pasport = ${som(acc.price)}. O‘qilmagan rasm uchun pul olinmaydi.`:'';
}
function renderMode(){
 const run=state.run||{},mode=run.mode||'individual';
 for(const r of document.querySelectorAll('input[name=mode]')){r.checked=r.value===mode;r.disabled=busy()}
 $('groupField').hidden=mode!=='group';
 const group=run.group;
 const input=$('groupName');if(document.activeElement!==input)input.value=group?.name||run.groupName||'';
 input.disabled=busy()||!!group?.checkpoint?.entryUrl;
 const gs=$('groupState');
 if(mode==='group'&&group){
  const members=Object.values(group.checkpoint?.members||{}),done=members.filter(m=>m.phase==='complete').length;
  gs.hidden=false;gs.replaceChildren(`Saqlangan guruh: “${group.name}”, ${done} kishi saytga kiritilgan. `,busy()?'':h('button',{class:'link',type:'button',onclick:resetGroup},'Yangi guruh boshlash'));
 }else gs.hidden=true;
}
async function portraitUrl(a){
 if(!a.hasPortrait)return placeholder;
 const cached=portraitCache.get(a.id);if(cached?.hash===a.portraitHash)return cached.url;
 const key='portrait:'+a.id,b64=(await chrome.storage.local.get(key))[key];
 const url=b64?'data:image/jpeg;base64,'+b64:placeholder;portraitCache.set(a.id,{hash:a.portraitHash,url});return url;
}
function describe(a){
 if(a.status==='reading')return 'Pasport o‘qilmoqda…';
 if(a.status==='payment_ready')return `Ariza ${a.result?.applicationNumber||''}${a.result?.totalSAR?` · ${a.result.totalSAR} SAR`:''} — to‘lovni o‘zingiz bajaring.`;
 if(a.error)return a.error;
 if(a.note)return a.note;
 if(a.missing?.length)return 'To‘ldirilmagan: '+a.missing.join(', ');
 if(a.status==='review'&&a.suggestions?.length)return 'Takliflar: '+a.suggestions.map(s=>`${fieldLabels[s.field]} = ${s.value}`).join(', ');
 return '';
}
let listToken=0;
async function renderList(){
 const token=++listToken,list=state.applicants||[],ul=$('list');
 $('emptyList').hidden=list.length>0;
 const ready=list.filter(a=>a.status==='confirmed').length,done=list.filter(a=>a.status==='payment_ready').length;
 $('counts').textContent=list.length?`${list.length} ta · ${ready} tayyor · ${done} to‘lovga tayyor`:'';
 $('confirmAllBtn').disabled=!list.some(a=>a.status==='review'&&!a.missing?.length);
 const items=await Promise.all(list.map(async a=>{
  const locked=lockedStatuses.includes(a.status)||a.status==='reading';
  const canConfirm=a.status==='review'&&!a.missing?.length;
  const attention=['needs_review','needs_input','needs_auth','error'].includes(a.status);
  return h('li',{class:`item s-${a.status}${state.run?.currentId===a.id&&busy()?' current':''}`},
   h('img',{class:'thumb',src:await portraitUrl(a),alt:''}),
   h('div',{class:'info'},
    h('div',{class:'name',title:displayName(a)},displayName(a)),
    h('div',{class:'meta'},h('span',{class:`chip s-${a.status}`},statusLabels[a.status]||a.status),[a.data.passportNumber,a.data.birthDate].filter(Boolean).join(' · ')),
    h('div',{class:'note',title:describe(a)},describe(a))),
   h('div',{class:'actions'},
    canConfirm&&h('button',{class:'icon-btn',type:'button',title:'Tasdiqlash',onclick:()=>send('applicant:save',{id:a.id,confirm:true}).then(()=>toast('Tasdiqlandi.')).catch(()=>{})},'✓'),
    !locked&&h('button',{class:'icon-btn',type:'button',title:'Ko‘rish va tahrirlash',onclick:()=>openEditor(a.id)},'✎'),
    attention&&a.confirmation&&!busy()&&h('button',{class:'icon-btn',type:'button',title:'Qayta urinish',onclick:()=>retry(a)},'↻'),
    a.status==='payment_ready'&&!busy()&&h('button',{class:'icon-btn',type:'button',title:'Yangi ariza sifatida qayta to‘ldirish',onclick:()=>refill(a)},'⟲'),
    !(a.status==='running')&&h('button',{class:'icon-btn',type:'button',title:'O‘chirish',onclick:()=>remove(a)},'✕')));
 }));
 if(token===listToken)ul.replaceChildren(...items);
}
function renderRun(){
 const run=state.run||{},p=run.progress||{done:0,total:0},list=state.applicants||[];
 $('progressBar').style.width=p.total?Math.round(p.done/p.total*100)+'%':'0%';
 const msg=$('runMessage');msg.textContent=run.message||(list.some(a=>a.status==='confirmed')?'Saudi saytiga kiring va ▶ Boshlash tugmasini bosing.':'Arizachilarni tasdiqlang.');
 msg.className='run-message'+(run.state==='attention'?' attention':'');
 $('startBtn').hidden=busy();$('stopBtn').hidden=!busy();
 $('startBtn').textContent=['waiting','attention'].includes(run.state)||run.group?'▶ Davom etish':'▶ Boshlash';
 $('startBtn').disabled=!list.some(a=>a.status==='confirmed')&&!run.group;
 $('stopBtn').disabled=run.state==='stopping';
 $('clearBtn').disabled=busy()||!list.length;
 $('log').replaceChildren(...(state.log||[]).slice(-60).reverse().map(l=>h('li',{class:l.level},new Date(l.at).toLocaleTimeString('uz-UZ',{hour:'2-digit',minute:'2-digit'})+'  '+l.text)));
}

// ---------- Editor ----------
const groups=[
 ['Shaxsiy ma’lumotlar',['firstName','middleName','lastName','gender','birthDate','nationality','birthCountry','birthCity','maritalStatus','profession']],
 ['Yashash joyi',['residenceCountry','city','address']],
 ['Pasport',['passportNumber','passportIssuePlace','issueDate','expiryDate']],
 ['Safar',['travelDate','departureDate','visitPurpose','accommodationType','accommodationName','saudiCity','saudiAddress','saudiAddress2','saudiPhone','saudiEmail']],
];
const selects={gender:[['','—'],['Male','Erkak (Male)'],['Female','Ayol (Female)']],maritalStatus:[['','—'],['Single','Single'],['Married','Married'],['Divorced','Divorced'],['Widow','Widow'],['Other','Other']],visitPurpose:[['Umrah','Umrah'],['Leisure','Leisure'],['Family & Relatives','Family & Relatives'],['Event','Event']],accommodationType:[['Hotel','Hotel'],['Residential','Residential']]};
const dates=['birthDate','issueDate','expiryDate','travelDate','departureDate'];
const countries=['Uzbekistan','Kazakhstan','Kyrgyzstan','Tajikistan','Turkmenistan','Afghanistan','Russia','Turkey','Azerbaijan','Pakistan','India'];
async function openEditor(id){editingId=id;show('editor');await renderEditor()}
async function renderEditor(){
 const a=(state.applicants||[]).find(x=>x.id===editingId);if(!a){show('main');return}
 $('editorTitle').textContent=displayName(a);
 $('editorPortrait').src=await portraitUrl(a);
 $('portraitRecrop').hidden=$('rereadBtn').hidden=!a.hasImage;
 const notes=[...(a.error?[a.error]:[]),...(a.notes||[])];const box=$('editorNotes');box.hidden=!notes.length;box.className='notice'+(a.error?' error':'');box.replaceChildren(...notes.map(n=>h('div',{},n)));
 const suggestions=Object.fromEntries((a.suggestions||[]).map(s=>[s.field,s]));
 const missing=new Set(a.missing||[]),required=new Set(requiredApplicantFields(a.data));
 const form=$('editorForm');
 form.replaceChildren(h('datalist',{id:'countries'},countries.map(c=>h('option',{value:c}))),...groups.map(([title,fields])=>h('fieldset',{},h('legend',{},title),h('div',{class:'grid2'},fields.map(key=>{
  const value=a.data[key]||suggestions[key]?.value||'',label=fieldLabels[key]+(required.has(key)?' *':'');
  const cls=['field',suggestions[key]&&!a.data[key]?'suggested':'',missing.has(fieldLabels[key])&&!value?'missing':''].filter(Boolean).join(' ');
  const input=selects[key]?h('select',{name:key},selects[key].map(([v,t])=>h('option',{value:v,selected:v===value},t))):h('input',{name:key,type:dates.includes(key)?'date':key==='saudiEmail'?'email':'text',value,...(['nationality','birthCountry','residenceCountry','passportIssuePlace'].includes(key)?{list:'countries'}:{})});
  return h('label',{class:cls},h('span',{},label),input,suggestions[key]&&!a.data[key]?h('small',{class:'hint'},'Taklif: '+suggestions[key].reason):null);
 })))));
}
function formData(){const data={};for(const el of $('editorForm').elements)if(el.name)data[el.name]=el.value;return data}
async function saveEditor(confirm){
 try{await send('applicant:save',{id:editingId,data:formData(),confirm});toast(confirm?'Saqlandi va tasdiqlandi.':'Saqlandi.');if(confirm)show('main');else await renderEditor()}catch{}
}
// Fit any photo into a 200x200 JPEG between 5 and 100 KB (white margins, no stretching).
async function portraitFromFile(file){
 const bitmap=await createImageBitmap(file);
 const canvas=new OffscreenCanvas(200,200),ctx=canvas.getContext('2d');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,200,200);
 const scale=Math.min(200/bitmap.width,200/bitmap.height),w=bitmap.width*scale,h2=bitmap.height*scale;
 ctx.drawImage(bitmap,(200-w)/2,(200-h2)/2,w,h2);
 for(const quality of [0.95,0.98,0.9,0.85]){
  const blob=await canvas.convertToBlob({type:'image/jpeg',quality});
  if(blob.size>=5000&&blob.size<=100000){const bytes=new Uint8Array(await blob.arrayBuffer());let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}
 }
 throw Error('Portretni 5–100 KB JPEG ga keltirib bo‘lmadi. Boshqa rasm tanlang.');
}

// ---------- Actions ----------
async function addFiles(files){
 const images=[...files].filter(f=>/^image\/(jpeg|png|webp)$/.test(f.type));
 if(!images.length)return toast('Faqat JPG yoki PNG rasm tanlang.',true);
 if(images.length>MAX_FILES_PER_DROP)return toast(`Bir martada ${MAX_FILES_PER_DROP} tagacha rasm yuklang.`,true);
 const big=images.find(f=>f.size>10*1024*1024);if(big)return toast(`${big.name}: rasm 10 MB dan kichik bo‘lsin.`,true);
 const items=[];
 for(const file of images){const id=crypto.randomUUID();await putImage(id,file);items.push({id,fileName:file.name})}
 try{await send('applicants:add',{items});toast(`${items.length} ta rasm o‘qishga yuborildi.`)}catch{await deleteImages(items.map(i=>i.id)).catch(()=>{})}
}
async function retry(a){
 const fresh=a.status==='needs_review'&&confirm('Qoralama holati ham tozalansinmi?\n\nOK — kengaytma bu arizani saytda YANGIDAN yaratadi (avval Saudi kabinetida eski qoralama yo‘qligini tekshiring).\nBekor — saqlangan joyidan davom etadi.');
 await send('applicant:retry',{id:a.id,fresh}).catch(()=>{});
}
async function refill(a){
 if(!confirm(`${displayName(a)} uchun saytda YANGI ariza yaratilsinmi? Eski arizani to‘lamagan bo‘lsangiz, dublikat paydo bo‘lishi mumkin.`))return;
 await send('applicant:retry',{id:a.id,fresh:true}).catch(()=>{});
}
async function remove(a){
 if(!confirm(`${displayName(a)} ro‘yxatdan o‘chirilsinmi? Rasm va ma’lumotlar shu kompyuterdan o‘chadi.`))return;
 await send('applicant:remove',{id:a.id}).catch(()=>{});
}
async function resetGroup(){
 if(!confirm('Saqlangan guruh holati tozalansinmi? Keyingi “Boshlash” saytda YANGI guruh yaratadi. Avval Saudi kabinetidagi eski guruhni tekshiring.'))return;
 await send('run:reset-group').catch(()=>{});
}
function renderSettings(){
 const f=$('settingsForm'),s=state.settings||{};
 for(const key of ['visitPurpose','accommodationType','accommodationName','saudiCity','saudiAddress'])f.elements[key].value=s.tripDefaults?.[key]||'';
 f.elements.pauseAfterEach.checked=!!s.pauseAfterEach;
 f.elements.serverUrl.value=s.serverUrl||'';f.elements.serverUrl.disabled=!!state.auth?.token;
 $('logoutBtn').hidden=!state.auth?.token;
}

function bind(){
 $('settingsBtn').onclick=()=>show(view==='settings'?'main':'settings');
 $('settingsBack').onclick=$('editorBack').onclick=()=>show('main');
 $('pairBtn').onclick=async()=>{try{const r=await send('auth:pair',{serverUrl:$('serverUrl').value});if(r?.botUrl)toast('Telegram’da “✅ Ulash”ni bosing.')}catch{}};
 $('pairCancel').onclick=()=>send('auth:pair-cancel').catch(()=>{});
 $('tokenBtn').onclick=async()=>{try{await send('auth:token',{serverUrl:$('serverUrl').value,token:$('tokenInput').value});$('tokenInput').value='';toast('Ulandi.')}catch{}};
 $('refreshBtn').onclick=()=>send('auth:refresh').then(()=>toast('Balans yangilandi.')).catch(()=>{});
 $('topupBtn').onclick=()=>{const url=state.auth?.account?.topupUrl;if(url)chrome.tabs.create({url});else toast('Bot manzili topilmadi.',true)};
 for(const r of document.querySelectorAll('input[name=mode]'))r.onchange=()=>send('run:prefs',{mode:r.value}).catch(()=>{});
 $('groupName').onchange=e=>send('run:prefs',{groupName:e.target.value.trim()}).catch(()=>{});
 const drop=$('drop'),input=$('fileInput');
 drop.onclick=e=>{if(e.target!==input)input.click()};
 input.onchange=()=>{addFiles(input.files);input.value=''};
 drop.ondragover=e=>{e.preventDefault();drop.classList.add('over')};
 drop.ondragleave=()=>drop.classList.remove('over');
 drop.ondrop=e=>{e.preventDefault();drop.classList.remove('over');addFiles(e.dataTransfer.files)};
 $('manualBtn').onclick=async()=>{try{const r=await send('applicants:manual');await openEditor(r.id)}catch{}};
 $('confirmAllBtn').onclick=async()=>{
  if(!confirm('Barcha “Tekshiring” holatidagi arizachilar tasdiqlansinmi? Har birining ma’lumoti va portretini tekshirganingizga ishonch hosil qiling.'))return;
  try{const r=await send('applicants:confirm-all');toast(`${r.confirmed} ta tasdiqlandi.`+(r.skipped.length?` ${r.skipped.length} tasi o‘tkazib yuborildi.`:''),!!r.skipped.length)}catch{}
 };
 $('startBtn').onclick=async()=>{
  const mode=document.querySelector('input[name=mode]:checked').value;
  try{await send('run:start',{mode,groupName:$('groupName').value.trim()})}catch{}
 };
 $('stopBtn').onclick=()=>send('run:stop').catch(()=>{});
 $('clearBtn').onclick=async()=>{if(confirm('Butun ro‘yxat, portretlar va jurnal o‘chirilsinmi? Saytdagi arizalarga ta’sir qilmaydi.'))await send('run:clear').catch(()=>{})};
 $('editorSave').onclick=()=>saveEditor(false);
 $('editorConfirm').onclick=()=>saveEditor(true);
 $('portraitUpload').onclick=()=>$('portraitInput').click();
 $('portraitInput').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{const base64=await portraitFromFile(file);await send('applicant:portrait',{id:editingId,base64});toast('Portret saqlandi.')}catch(error){toast(error.message,true)}};
 $('portraitRecrop').onclick=()=>send('applicant:recrop',{id:editingId}).then(()=>toast('Portret qayta kesilmoqda…')).catch(()=>{});
 $('rereadBtn').onclick=()=>send('applicant:reread',{id:editingId}).then(()=>{toast('Pasport qayta o‘qilmoqda…');show('main')}).catch(()=>{});
 $('settingsForm').onsubmit=async e=>{
  e.preventDefault();const f=e.target;
  const settings={pauseAfterEach:f.elements.pauseAfterEach.checked,tripDefaults:Object.fromEntries(['visitPurpose','accommodationType','accommodationName','saudiCity','saudiAddress'].map(k=>[k,f.elements[k].value.trim()]))};
  if(!state.auth?.token)settings.serverUrl=f.elements.serverUrl.value.trim();
  try{await send('settings:save',{settings});toast('Sozlamalar saqlandi.')}catch{}
 };
 $('applyTrip').onclick=()=>send('trip:apply').then(()=>toast('Shablon bo‘sh maydonlarga qo‘llandi.')).catch(()=>{});
 $('logoutBtn').onclick=async()=>{if(confirm('Hisobdan chiqilsinmi?'))await send('auth:logout').then(()=>show('connect')).catch(()=>{})};
}

async function load(){state=await chrome.storage.local.get(KEYS);state.settings||={};state.run||={};render()}
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area!=='local')return;let relevant=false;
 for(const [key,{newValue}] of Object.entries(changes))if(KEYS.includes(key)){state[key]=newValue;relevant=true}
 if(!relevant)return;
 // Keep the editor stable while typing; refresh it only if its applicant changed status.
 if(view==='editor'&&changes.applicants){const before=changes.applicants.oldValue?.find(a=>a.id===editingId),after=changes.applicants.newValue?.find(a=>a.id===editingId);if(!after){show('main');return}if(before?.status!==after.status||before?.portraitHash!==after.portraitHash)renderEditor();return}
 render();
});
bind();load();
send('auth:refresh',{},{quiet:true}).catch(()=>{});
