// Fixed operations only: no eval, cookie access, API tokens or payment actions.
export function scriptDomOperation(command){
 const visible=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
 const clean=s=>String(s||'').replace(/\s+/g,' ').trim().replace(/\s*\*$/,'').trim();
 const name=e=>clean(e.getAttribute('aria-label')||Array.from(e.labels||[]).map(l=>l.textContent).join(' ')||e.getAttribute('placeholder')||e.textContent||e.value);
 const roleSelectors={textbox:'input:not([type]),input[type=text],input[type=email],input[type=tel],input[type=number],textarea',combobox:'select',checkbox:'input[type=checkbox]',radio:'input[type=radio]',button:'button,input[type=submit],input[type=button],[role=button]',link:'a[href],a[role=button]'};
 const all=selector=>{
  let roots=[document];
  for(const part of selector){
   if(part.css){if(typeof part.css!=='string'||part.css.length>150)throw Error('Maydon tanlovi noto‘g‘ri.');roots=roots.flatMap(r=>Array.from(r.querySelectorAll(part.css)))}
   else{if(!roleSelectors[part.role])throw Error('Maydon turi qo‘llanmagan.');roots=roots.flatMap(r=>Array.from(r.querySelectorAll(roleSelectors[part.role]))).filter(e=>{const n=name(e);return typeof part.name==='object'?new RegExp(part.name.regex,part.name.flags||'').test(n):part.exact?n===clean(part.name):n.includes(clean(part.name))})}
  }
  return [...new Set(roots)].filter(e=>!e.closest('[data-evisa-script]'));
 };
 const text=e=>{if(e!==document.body)return e.innerText||e.textContent||'';const ui=document.querySelector('[data-evisa-script]'),was=ui?.style.display;if(ui)ui.style.display='none';const out=e.innerText;if(ui)ui.style.display=was;return out};
 if(command.action==='goto'){
  const u=new URL(command.target);if(u.origin!=='https://visa.visitsaudi.com'||!/^\/(Visa\/(Index|PersonalInfo|PassportInfo|Terms|Review)(\/|$)|Insurance\/ChooseInsurance\/|Login(\/|$))/.test(u.pathname))throw Error('Sahifa manzili noto‘g‘ri.');
  return {value:true,navigate:command.target};
 }
 if(command.action==='snapshot')return {value:{text:text(document.body).slice(0,40000),controls:Array.from(document.querySelectorAll('input,select,textarea,button,a')).filter(e=>!e.closest('[data-evisa-script]')&&visible(e)&&!['hidden','password'].includes(e.type)).map(e=>({tag:e.tagName.toLowerCase(),id:e.id,type:e.type||'',label:name(e),text:/^(BUTTON|A)$/.test(e.tagName)?clean(e.innerText):'',required:!!e.required,...(e.tagName==='A'&&e.getAttribute('href')?.startsWith('/')?{href:e.getAttribute('href')}:{}),...(e.tagName==='SELECT'?{options:Array.from(e.options).map(o=>({label:o.text,value:o.value}))}:{}),...(['checkbox','radio'].includes(e.type)?{checked:e.checked}:{})}))}};
 if(command.action!=='element'||!Array.isArray(command.selector))throw Error('Amal qo‘llanmagan.');
 const elements=all(command.selector),op=command.operation;
 if(op==='count')return {value:elements.length};
 if(op==='visible')return {value:elements.some(visible)};
 if(elements.length!==1)throw Error(elements.length?'Bir nechta bir xil maydon topildi. Tekshiring.':'Kerakli maydon topilmadi. Sahifa o‘zgargan bo‘lishi mumkin.');
 const e=elements[0];if(e.type==='password'||e.type==='hidden')throw Error('Bu maydon o‘qilmaydi.');
 if(op==='value')return {value:e.value};if(op==='text')return {value:text(e)};if(op==='checked')return {value:!!e.checked};if(op==='editable')return {value:!e.disabled&&!e.readOnly};
 if(/^\/Login/.test(location.pathname))throw Error('Akkauntga kirish, kod va CAPTCHA’ni o‘zingiz yakunlang.');
 if(/access denied|too many requests|unusual traffic|verify you are human/i.test(text(document.body)))throw Error('Sayt tekshiruv yoki cheklov ko‘rsatmoqda. Operator tekshirsin.');
 if(Array.from(document.querySelectorAll('iframe[title*="challenge" i],iframe[title*="captcha" i],.g-recaptcha,.h-captcha')).some(visible))throw Error('CAPTCHA chiqdi. Operator yakunlasin.');
 if(e.disabled)throw Error('Maydon yoki tugma hozir faol emas.');
 const change=()=>{e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))};
 const setValue=v=>{const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,v)};
 if(op==='fill'||op==='type'){
  if(!e.matches(roleSelectors.textbox)||e.readOnly)throw Error('Maydon yozish uchun ochiq emas.');
  e.focus();if(op==='fill')setValue(String(command.value));else for(const char of String(command.value)){e.dispatchEvent(new KeyboardEvent('keydown',{key:char,bubbles:true}));e.dispatchEvent(new KeyboardEvent('keypress',{key:char,bubbles:true}));setValue(e.value+char);e.dispatchEvent(new InputEvent('input',{data:char,inputType:'insertText',bubbles:true}));e.dispatchEvent(new KeyboardEvent('keyup',{key:char,bubbles:true}))}change();return {value:true};
 }
 if(op==='press'){if(command.value!=='Tab')throw Error('Tugma qo‘llanmagan.');e.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));e.blur();e.dispatchEvent(new KeyboardEvent('keyup',{key:'Tab',bubbles:true}));return {value:true}}
 if(op==='select'){if(e.tagName!=='SELECT')throw Error('Tanlov maydoni emas.');const options=Array.from(e.options).filter(o=>clean(o.text)===clean(command.value));if(options.length!==1)throw Error('Kerakli tanlov topilmadi.');e.value=options[0].value;change();return {value:true}}
 if(op==='portrait'){
  if(e.id!=='AttachmentPersonalPicture'||e.type!=='file'||!/^[A-Za-z0-9+/=]+$/.test(command.value))throw Error('Portret maydoni noto‘g‘ri.');
  const bytes=Uint8Array.from(atob(command.value),c=>c.charCodeAt(0));if(bytes.length<5000||bytes.length>100000)throw Error('Portret hajmi mos emas.');
  const transfer=new DataTransfer();transfer.items.add(new File([bytes],'portrait.jpg',{type:'image/jpeg'}));e.files=transfer.files;change();return {value:true};
 }
 if(op==='click'){
  const n=name(e);if(e.id==='btnPay'||/payment|\bpay\b|checkout/i.test(n))throw Error('To‘lovni faqat operator bajaradi.');
  const choice=['radio','checkbox'].includes(e.type),calendar=e.matches('a')&&!!e.closest('#ui-datepicker-div')&&/^\d{1,2}$/.test(n),allowed=['btnApplyGroupVisa','btnCreateGroup'].includes(e.id)||/^(Next|Apply For Individual)$/i.test(n)||/^\+?\s*(?:save\s*(?:&|and)\s*)?add\s+(?:(?:another|new|more)\s+)?(?:person|applicant|member)\s*\+?$/i.test(n);
  if(!choice&&!calendar&&!allowed&&!e.matches('input[readonly]'))throw Error('Bu tugma avtomatik bosilmaydi.');
  if(e.matches('a[href]')&&e.getAttribute('href')!=='#'&&!e.getAttribute('href').startsWith('javascript:')){const u=new URL(e.href);if(u.origin!==location.origin)throw Error('Tashqi havola ochilmaydi.')}
  if(choice||calendar||e.matches('input[readonly]')){e.click();return {value:true}}
  if(!visible(e))throw Error('Tugma ko‘rinmayapti.');return {value:true,click:e};
 }
 throw Error('Amal qo‘llanmagan.');
}
