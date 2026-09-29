// Fixed page operations for visa.visitsaudi.com only: no eval, no cookies,
// no tokens and never a payment action. Loaded as a classic content script
// and imported by the Node tests, so it only assigns a global.
(function(){
 const ORIGIN='https://visa.visitsaudi.com';
 const allowedPath=/^\/(Visa\/(Index|PersonalInfo|PassportInfo|Terms|Review)(\/|$)|Insurance\/ChooseInsurance\/|Login(\/|$))/;
 const roleSelectors={textbox:'input:not([type]),input[type=text],input[type=email],input[type=tel],input[type=number],input[type=search],textarea',combobox:'select',checkbox:'input[type=checkbox]',radio:'input[type=radio]',button:'button,input[type=submit],input[type=button],[role=button]',link:'a[href],a[role=button]'};
 const addMember=/^\+?\s*(?:save\s*(?:&|and)\s*)?add\s+(?:(?:another|new|more)\s+)?(?:person|applicant|member)\s*\+?$/i;
 const fail=(message,code)=>Object.assign(Error(message),code?{code}:{});
 const clean=s=>String(s||'').replace(/\s+/g,' ').trim().replace(/\s*\*$/,'').trim();
 const visible=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
 // Role queries follow Playwright: elements removed from the accessibility tree
 // (display:none ancestors, hidden, aria-hidden, inert) never match.
 const inAccessibilityTree=e=>{
  if(e.closest?.('[aria-hidden="true"],[hidden],[inert]'))return false;
  if(typeof e.checkVisibility==='function')return e.checkVisibility({visibilityProperty:true});
  return true;
 };
 const byIds=ids=>ids.split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ');
 const contentRole=e=>/^(BUTTON|A)$/.test(e.tagName)||e.getAttribute?.('role')==='button';
 // Accessible name, close to what Playwright's getByRole({name}) compares.
 const name=e=>{
  const labelledBy=e.getAttribute('aria-labelledby');if(labelledBy&&clean(byIds(labelledBy)))return clean(byIds(labelledBy));
  const aria=e.getAttribute('aria-label');if(clean(aria))return clean(aria);
  const labels=Array.from(e.labels||[]).map(l=>l.textContent).join(' ');if(clean(labels))return clean(labels);
  if(contentRole(e)&&clean(e.textContent))return clean(e.textContent);
  if(e.tagName==='INPUT'&&['submit','button'].includes(e.type)&&clean(e.value))return clean(e.value);
  const title=e.getAttribute('title');if(clean(title))return clean(title);
  return clean(e.getAttribute('placeholder'));
 };
 const matchesName=(e,wanted,exact)=>{
  const n=name(e);
  if(wanted&&typeof wanted==='object')return new RegExp(wanted.regex,wanted.flags||'').test(n);
  if(wanted===undefined||wanted===null)return true;
  return exact?n===clean(wanted):n.toLowerCase().includes(clean(wanted).toLowerCase());
 };
 const own=e=>!e.closest('[data-evisa-script]');
 const all=selector=>{
  let roots=[document];
  for(const part of selector){
   if(part.css){if(typeof part.css!=='string'||part.css.length>150)throw fail('Maydon tanlovi noto‘g‘ri.');roots=roots.flatMap(r=>Array.from(r.querySelectorAll(part.css)))}
   else{if(!roleSelectors[part.role])throw fail('Maydon turi qo‘llanmagan.');roots=roots.flatMap(r=>Array.from(r.querySelectorAll(roleSelectors[part.role]))).filter(e=>inAccessibilityTree(e)&&matchesName(e,part.name,part.exact))}
  }
  return [...new Set(roots)].filter(own);
 };
 const text=e=>{if(e!==document.body)return e.innerText||e.textContent||'';const ui=document.querySelector('[data-evisa-script]'),was=ui?.style.display;if(ui)ui.style.display='none';const out=e.innerText;if(ui)ui.style.display=was;return out};
 function evisaDomOperation(command){
  if(command.action==='goto'){
   const u=new URL(command.target);if(u.origin!==ORIGIN||!allowedPath.test(u.pathname))throw fail('Sahifa manzili noto‘g‘ri.');
   return {value:true,navigate:command.target};
  }
  if(command.action==='snapshot')return {value:{text:text(document.body).slice(0,40000),controls:Array.from(document.querySelectorAll('input,select,textarea,button,a')).filter(e=>own(e)&&visible(e)&&!['hidden','password'].includes(e.type)).map(e=>({tag:e.tagName.toLowerCase(),id:e.id,type:e.type||'',label:name(e),text:/^(BUTTON|A)$/.test(e.tagName)?clean(e.innerText):'',required:!!e.required,...(e.tagName==='A'&&e.getAttribute('href')?.startsWith('/')?{href:e.getAttribute('href')}:{}),...(e.tagName==='SELECT'?{options:Array.from(e.options).map(o=>({label:o.text,value:o.value}))}:{}),...(['checkbox','radio'].includes(e.type)?{checked:e.checked}:{})}))}};
  if(command.action!=='element'||!Array.isArray(command.selector))throw fail('Amal qo‘llanmagan.');
  const elements=all(command.selector),op=command.operation;
  if(op==='count')return {value:elements.length};
  if(op==='visible')return {value:elements.some(visible)};
  if(elements.length!==1)throw fail(elements.length?'Bir nechta bir xil maydon topildi. Tekshiring.':'Kerakli maydon topilmadi. Sahifa o‘zgargan bo‘lishi mumkin.',elements.length?'ambiguous':'not_found');
  const e=elements[0];if(e.type==='password'||e.type==='hidden')throw fail('Bu maydon o‘qilmaydi.');
  if(op==='value')return {value:e.value};if(op==='text')return {value:text(e)};if(op==='checked')return {value:!!e.checked};if(op==='editable')return {value:!e.disabled&&!e.readOnly};
  if(/^\/Login/.test(location.pathname))throw fail('Akkauntga kirish, kod va CAPTCHA’ni o‘zingiz yakunlang.','login');
  if(/access denied|too many requests|unusual traffic|verify you are human/i.test(text(document.body)))throw fail('Sayt tekshiruv yoki cheklov ko‘rsatmoqda. Operator tekshirsin.','blocked');
  if(Array.from(document.querySelectorAll('iframe[title*="challenge" i],iframe[title*="captcha" i],.g-recaptcha,.h-captcha')).some(visible))throw fail('CAPTCHA chiqdi. Operator yakunlasin.','captcha');
  if(e.disabled)throw fail('Maydon yoki tugma hozir faol emas.');
  const change=()=>{e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))};
  const setValue=v=>{const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,v)};
  if(op==='fill'||op==='type'){
   if(!e.matches(roleSelectors.textbox)||e.readOnly)throw fail('Maydon yozish uchun ochiq emas.');
   e.focus();if(op==='fill')setValue(String(command.value));else for(const char of String(command.value)){e.dispatchEvent(new KeyboardEvent('keydown',{key:char,bubbles:true}));e.dispatchEvent(new KeyboardEvent('keypress',{key:char,bubbles:true}));setValue(e.value+char);e.dispatchEvent(new InputEvent('input',{data:char,inputType:'insertText',bubbles:true}));e.dispatchEvent(new KeyboardEvent('keyup',{key:char,bubbles:true}))}change();return {value:true};
  }
  if(op==='press'){if(command.value!=='Tab')throw fail('Tugma qo‘llanmagan.');e.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));e.blur();e.dispatchEvent(new KeyboardEvent('keyup',{key:'Tab',bubbles:true}));return {value:true}}
  if(op==='select'){if(e.tagName!=='SELECT')throw fail('Tanlov maydoni emas.');const options=Array.from(e.options).filter(o=>clean(o.text)===clean(command.value));if(options.length!==1)throw fail('Kerakli tanlov topilmadi: '+clean(command.value),'option_not_found');e.value=options[0].value;change();return {value:true}}
  if(op==='portrait'){
   if(e.id!=='AttachmentPersonalPicture'||e.type!=='file'||!/^[A-Za-z0-9+/=]+$/.test(command.value))throw fail('Portret maydoni noto‘g‘ri.');
   const bytes=Uint8Array.from(atob(command.value),c=>c.charCodeAt(0));if(bytes.length<5000||bytes.length>100000)throw fail('Portret hajmi mos emas.');
   const transfer=new DataTransfer();transfer.items.add(new File([bytes],'portrait.jpg',{type:'image/jpeg'}));e.files=transfer.files;change();return {value:true};
  }
  if(op==='click'){
   const n=name(e)||clean(e.textContent),everything=[n,clean(e.textContent),clean(e.value),e.id].join(' ');
   if(e.id==='btnPay'||/payment|\bpay\b|checkout/i.test(everything))throw fail('To‘lovni faqat operator bajaradi.','payment');
   const choice=['radio','checkbox'].includes(e.type),calendar=e.matches('a')&&!!e.closest('#ui-datepicker-div')&&/^\d{1,2}$/.test(n),field=e.matches(roleSelectors.textbox),allowed=['btnApplyGroupVisa','btnCreateGroup'].includes(e.id)||/^(Next|Apply For Individual)$/i.test(n)||addMember.test(n);
   if(!choice&&!calendar&&!field&&!allowed)throw fail('Bu tugma avtomatik bosilmaydi.','forbidden');
   if(e.matches('a[href]')&&e.getAttribute('href')!=='#'&&!e.getAttribute('href').startsWith('javascript:')){const u=new URL(e.href);if(u.origin!==location.origin)throw fail('Tashqi havola ochilmaydi.')}
   if(choice||calendar||field){e.click();return {value:true}}
   if(!visible(e))throw fail('Tugma ko‘rinmayapti.');return {value:true,click:e};
  }
  throw fail('Amal qo‘llanmagan.');
 }
 globalThis.evisaDomOperation=evisaDomOperation;
})();
