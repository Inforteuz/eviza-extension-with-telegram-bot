import {assertSaudiPageAvailable} from './rate-limit.js';
import {Attention} from './errors.js';
import {visaDiagnostics} from './diagnostics.js';
export {Attention} from './errors.js';
const ORIGIN='https://visa.visitsaudi.com';
const draftPattern=/^\/Visa\/(PersonalInfo|PassportInfo)\/[0-9a-f-]{36}$/i;
const insurancePattern=/^\/Insurance\/ChooseInsurance\/[0-9a-f-]{36}$/i;
const remainingPattern=/^\/(Insurance\/ChooseInsurance|Visa\/(Terms|Review))\/[0-9a-f-]{36}$/i;
export function validDraft(url){try{const u=new URL(url);return u.origin===ORIGIN&&draftPattern.test(u.pathname)&&!u.search&&!u.hash}catch{return false}}
export async function typeName(page,name,value){const field=page.getByRole('textbox',{name,exact:true});if(await field.inputValue()===value)return;await field.fill('');if(value)await field.pressSequentially(value);if(await field.inputValue()!==value)throw new Attention('needs_review','Sayt '+name+' maydonini saqlamadi.');}
export async function pickDate(page,label,iso){
 const [year,month,day]=iso.split('-');const expected=`${day}/${month}/${year}`;const field=page.getByRole('textbox',{name:label,exact:true});
 const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
 for(let attempt=0;attempt<3;attempt++){
  if(await field.inputValue()===expected)return;
  if(await field.isEditable()){
   await field.fill('');await field.pressSequentially(expected);await field.press('Tab');
   if(await field.inputValue()===expected)return;
  }
  await field.press('Tab');await field.click();
  const yearPicker=page.getByRole('combobox',{name:'Change the year',exact:true});
  try{await yearPicker.waitFor({state:'visible',timeout:1500})}catch{continue}
  await yearPicker.selectOption({label:year});
  await page.getByRole('combobox',{name:'Change the month',exact:true}).selectOption({label:months[Number(month)-1]});
  // The site places this popup below another form layer. Dispatch to the
  // observed day link without changing focus (blur closes the date picker).
  await page.getByRole('link',{name:String(Number(day)),exact:true}).dispatchEvent('click');
  try{await page.waitForFunction(({label,expected})=>Array.from(document.querySelectorAll('input')).some(x=>x.value===expected&&Array.from(x.labels||[]).some(l=>l.textContent.trim().replace(/\*$/,'').trim()===label)),{label,expected},{timeout:1200})}catch{}
 }
 if(await field.inputValue()!==expected)throw new Attention('needs_review',label+' sanasi saytga saqlanmadi.');
}
// OCR may preserve the document's uppercase country name. This changes only
// the site's option label; it never changes the confirmed applicant record.
export function countryOption(value){const label=String(value||'').trim();return /^(uzb|uzbekistan)$/i.test(label)?'Uzbekistan':label;}
async function select(page,label,value){
 const field=page.getByRole('combobox',{name:label,exact:true});
 try{await field.selectOption({label:value});}
 catch(error){if(error.name==='TimeoutError'||error.code==='option_not_found')throw new Attention('needs_input',`Saytda “${label}” uchun “${value}” varianti topilmadi. Ariza kartasidagi shu maydonni tekshiring.`,'personal');throw error;}
}
async function verifySelect(page,label,value){const selected=await page.getByRole('combobox',{name:label,exact:true}).locator('option:checked').innerText();if(selected.trim()!==value)throw new Attention('needs_review',label+' tanlovi tozalangan.');}
export async function setChoice(field,checked){
 if(await field.isChecked()===checked)return;
 // Custom labels cover these inputs. Target their normal click event and then
 // verify the browser's real checked state; never assume that a click worked.
 await field.dispatchEvent('click');
 if(await field.isChecked()!==checked)throw new Attention('needs_review','Saytdagi tanlov belgilanmadi.','passport');
}
const loginNote='Shu oynada Saudi akkauntiga kiring. Email kodi va CAPTCHA’ni o‘zingiz kiriting — kirishingiz bilan kengaytma arizani o‘zi davom ettiradi.';
export async function ensureLogin(page){
 await assertSaudiPageAvailable(page);
 // Reuse an already visible dashboard instead of issuing a second identical request.
 if(page.url()===ORIGIN+'/Visa/Index'&&await page.getByRole('link',{name:'Apply For Individual',exact:true}).isVisible())return;
 const response=await page.goto(ORIGIN+'/Visa/Index',{waitUntil:'domcontentloaded'});
 await assertSaudiPageAvailable(page,response);
 if(/^\/Login/i.test(new URL(page.url()).pathname))throw new Attention('needs_auth',loginNote,'login');
 if(!await page.getByRole('link',{name:'Apply For Individual',exact:true}).isVisible())throw new Attention('needs_review','Akkaunt sahifasi tanilmadi.');
}
export async function fillPersonal(page,a,portraitPath){
 await page.getByRole('radio',{name:'Yes',exact:true}).check();
 await select(page,'Country of Nationality',countryOption(a.nationality));
 for(const [label,key] of [['Gender','gender'],['Marital Status','maritalStatus']])await select(page,label,a[key]);
 await select(page,'Country of Birth',countryOption(a.birthCountry));
 await pickDate(page,'Date of Birth',a.birthDate);
 await select(page,'Country',countryOption(a.residenceCountry));
 await page.locator('#AttachmentPersonalPicture').setInputFiles(portraitPath);
 const textFields=[['First Name or Given Name (English)','firstName'],['Father Name or Middle Name (English)','middleName'],['Last Name or Family Name (English)','lastName'],['City of Birth','birthCity'],['Profession','profession'],['City','city'],['Address','address'],['Zip/Postal Code','postalCode']];
 for(const [label,key] of textFields)await typeName(page,label,a[key]||'');
 for(const [label,key] of textFields)if(await page.getByRole('textbox',{name:label,exact:true}).inputValue()!==(a[key]||''))throw new Attention('needs_review',label+' qiymati saqlanmadi.');
 if(await page.getByRole('textbox',{name:'Date of Birth',exact:true}).inputValue()!==a.birthDate.split('-').reverse().join('/'))throw new Attention('needs_review','Tug‘ilgan sana qiymati saqlanmadi.');
 for(const [label,key] of [['Country of Nationality','nationality'],['Country of Birth','birthCountry'],['Country','residenceCountry']])await verifySelect(page,label,countryOption(a[key]));
 for(const [label,key] of [['Gender','gender'],['Marital Status','maritalStatus']])await verifySelect(page,label,a[key]);
}
export async function fillPassport(page,a){
 await select(page,'Passport Type','Regular Passport');
 await typeName(page,'Passport No.',a.passportNumber);await typeName(page,'Passport Issue Place (Country or City)',a.passportIssuePlace);
 for(const [label,key] of [['Passport Issue Date','issueDate'],['Passport Expiry Date','expiryDate'],['Expected Date of Arrival','travelDate'],['Expected Date of Departure','departureDate']])await pickDate(page,label,a[key]);
 for(const purpose of ['Event','Family & Relatives','Leisure','Umrah'])await setChoice(page.getByRole('checkbox',{name:purpose,exact:true}),purpose===a.visitPurpose);
 await setChoice(page.locator('#rdEmailNo'),true);await setChoice(page.locator('#rdWhatsAppNo'),true);
 if(a.accommodationType==='Hotel'){await setChoice(page.locator('#AccomodationHotel'),true);await typeName(page,'Name of Hotel',a.accommodationName);await page.getByRole('textbox',{name:'Name of Hotel',exact:true}).press('Tab');}
 else{await setChoice(page.locator('#AccomodationResidency'),true);await typeName(page,'Name of Person',a.accommodationName);await select(page,'City',a.saudiCity);await typeName(page,'Address 1',a.saudiAddress);await typeName(page,'Address 2',a.saudiAddress2);}
 if(a.saudiPhone)await typeName(page,'Primary Contact Number',a.saudiPhone);if(a.saudiEmail)await typeName(page,'Email',a.saudiEmail);
 for(const purpose of ['Event','Family & Relatives','Leisure','Umrah'])if(await page.getByRole('checkbox',{name:purpose,exact:true}).isChecked()!==(purpose===a.visitPurpose))throw new Attention('needs_review','Safar maqsadi saytga saqlanmadi.','passport');
 for(const [label,key] of [['Passport No.','passportNumber'],['Passport Issue Place (Country or City)','passportIssuePlace'],...(a.accommodationType==='Hotel'?[['Name of Hotel','accommodationName']]:[])])if(await page.getByRole('textbox',{name:label,exact:true}).inputValue()!==a[key])throw new Attention('needs_review',label+' qiymati saytga saqlanmadi.','passport');
 for(const [label,key] of [['Passport Issue Date','issueDate'],['Passport Expiry Date','expiryDate'],['Expected Date of Arrival','travelDate'],['Expected Date of Departure','departureDate']])if(await page.getByRole('textbox',{name:label,exact:true}).inputValue()!==a[key].split('-').reverse().join('/'))throw new Attention('needs_review',label+' qiymati saytga saqlanmadi.','passport');
}
export function activeVisaMessage(text){
 const match=text.match(/cannot create new visa request while your current visa\s+\d+\s+is still valid for the same passport number, your current visa will expire on\s+(\d{2}\/\d{2}\/\d{4})/i);
 return match?'Bu pasportning amaldagi vizasi '+match[1]+' gacha. Saudi sayti yangi arizaga ruxsat bermadi.':'';
}
export async function waitForLogin(page,state,onProgress=async()=>{}){
 try{await ensureLogin(page)}catch(error){
  if(!(error instanceof Attention)||error.status!=='needs_auth')throw error;
  await onProgress({step:'login',note:error.message});
  try{await page.waitForURL(ORIGIN+'/Visa/Index',{timeout:20*60*1000});}catch{throw error}
  await assertSaudiPageAvailable(page);
  if(!await page.getByRole('link',{name:'Apply For Individual',exact:true}).isVisible())throw new Attention('needs_auth','Saudi akkauntiga kirish yakunlanmadi. Kirib bo‘lgach “Davom etish”ni bosing.','login');
 }
}
export async function fillInsurance(page){
 const original=page.url(),next=page.getByRole('button',{name:'Next',exact:true});
 // The owner approved the displayed 95 SAR coverage and this box; any other fee stops for review.
 const text=await page.locator('body').innerText();
 if(!/FEE OF\s*\(95\.00 SAR\)/i.test(text))throw new Attention('needs_review','Sug‘urta narxi yoki sharti o‘zgargan. Arizani tekshiring.','insurance');
 await setChoice(page.locator('#chkInsurance'),true);
 await next.click();try{await page.waitForURL(url=>url.href!==original,{timeout:15000,waitUntil:'domcontentloaded'})}catch{}
 if(page.url()===original)throw new Attention('needs_review','Sug‘urta bosqichi keyingi sahifaga o‘tmadi.','insurance');
}
const termsCheckbox=page=>page.getByRole('checkbox',{name:/^I HAVE READ AND AGREE ALL THE ABOVE TERMS AND CONDITIONS\.?$/i});
export async function fillTerms(page){
 const original=page.url();await setChoice(termsCheckbox(page),true);
 await page.getByRole('button',{name:'Next',exact:true}).click();
 try{await page.waitForURL(url=>url.href!==original,{timeout:15000,waitUntil:'domcontentloaded'})}catch{}
 if(page.url()===original)throw new Attention('needs_review','Shartlar sahifasi keyingi bosqichga o‘tmadi.','terms');
}
export function verifyApplicantReview(text,a,applicationNumber){
 const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
 const read=label=>{const i=lines.findIndex(x=>x===label);return i<0?undefined:lines[i+1]};
 const pairs=[['First Name or Given Name (English)',a.firstName],['Last Name or Family Name (English)',a.lastName],['Gender',a.gender],['Marital Status',a.maritalStatus],['Profession',a.profession],['Date of Birth',a.birthDate.split('-').reverse().join('/')],['Country of Birth',countryOption(a.birthCountry)],['City of Birth',a.birthCity],['Country of Nationality',countryOption(a.nationality)],['Country',countryOption(a.residenceCountry)],['City',a.city],['Address',a.address],['Passport Type','Regular Passport'],['Passport No.',a.passportNumber],['Passport Issue Place (Country or City)',a.passportIssuePlace],['Additional Purpose of Visit',a.visitPurpose],['Residence Address in Saudi Arabia',a.accommodationType==='Hotel'?'Commercial Accommodation':'Residential or Relative'],[a.accommodationType==='Hotel'?'Name of Hotel':'Name of Person',a.accommodationName]];
 if(a.middleName)pairs.push(['Father Name or Middle Name (English)',a.middleName]);
 for(const [label,key] of [['Passport Issue Date','issueDate'],['Passport Expiry Date','expiryDate'],['Expected Date of Arrival','travelDate'],['Expected Date of Departure','departureDate']])pairs.push([label,a[key].split('-').reverse().join('/')]);
 for(const [label,expected] of pairs)if(read(label)?.toLowerCase()!==expected?.toLowerCase())throw new Attention('needs_review','Yakuniy sahifada '+label+' ma’lumoti mos kelmadi.','review');
 if(!a.postalCode&&read('Zip/Postal Code')!=='Address')throw new Attention('needs_review','Yakuniy sahifada pochta indeksi tekshirilsin.','review');
 if(text.match(/Application No\.:\s*(\d+)/)?.[1]!==String(applicationNumber))throw new Attention('needs_review','Yakuniy ariza raqami mos kelmadi.','review');
 return {checkedFields:pairs.length};
}
export function verifyReview(text,a,applicationNumber){
 const proof=verifyApplicantReview(text,a,applicationNumber);
 if(!/Total Applicants\s*:\s*1(?:\s|$)/.test(text))throw new Attention('needs_review','Arizachilar soni tekshirilsin.','review');
 const total=text.match(/Total Amount\s+([\d,.]+)\s+SAR/i)?.[1];
 if(!total||!text.includes('Choose your payment method'))throw new Attention('needs_review','To‘lov summasi yoki usuli sahifada topilmadi.','review');
 return {...proof,totalSAR:total};
}
export async function paymentReady(page,job,applicationNumber){
 const at=new URL(page.url());
 if(at.origin!==ORIGIN||!/^\/Visa\/Review\/[0-9a-f-]{36}$/i.test(at.pathname)||at.search||at.hash)throw new Attention('needs_review','To‘lov sahifasi manzili tasdiqlanmadi.','review');
 const proof=verifyReview(await page.locator('body').innerText(),job.data,applicationNumber);
 const button=page.locator('#btnPay');
 if(!await button.isVisible()||(await button.innerText()).trim().toUpperCase()!=='AGREE & COMPLETE PAYMENT')throw new Attention('needs_review','To‘lov tugmasi ko‘rinmadi.','review');
 return {status:'payment_ready',step:'payment',applicationNumber,paymentUrl:page.url(),paymentEvidence:{...proof,applicationNumber,verifiedAt:new Date().toISOString(),paymentNotClicked:true},note:'Ariza to‘lovga tayyor. Yakuniy ma’lumotlar tekshirildi. Jami '+proof.totalSAR+' SAR. To‘lovni o‘zingiz bajaring.'};
}
export async function prepareVisa(page,job,portraitPath,state,checkpoint,onProgress=async()=>{}){
 const saved=state.get('draft:'+job.id);const prior=saved?JSON.parse(saved):null;
 const url=prior?.officialUrl||job.official_url;
 if(url&&!validDraft(url))throw new Attention('needs_review','Saqlangan rasmiy qoralama manzili tekshirilishi kerak.');
 const finishApplication=async()=>{
  const checkpointUrl=JSON.parse(state.get('draft:'+job.id)||'{}').officialUrl||url;
  const applicationId=checkpointUrl?new URL(checkpointUrl).pathname.split('/').at(-1):'';
  for(let i=0;i<3;i++){
   const at=new URL(page.url());
   if(at.origin!==ORIGIN||at.pathname.split('/').at(-1).toLowerCase()!==applicationId.toLowerCase())throw new Attention('needs_review','Keyingi sahifaning ariza raqami tekshirilishi kerak.','review');
   state.set('next-route:'+job.id,at.pathname);
   if(insurancePattern.test(at.pathname)){
    await onProgress({step:'insurance',note:'Tasdiqlangan 95 SAR sug‘urta roziligi belgilanmoqda.'});await fillInsurance(page);continue;
   }
   if(await termsCheckbox(page).isVisible()){
    await onProgress({step:'terms',note:'Shartlarga rozilik belgilanmoqda.'});await fillTerms(page);continue;
   }
   if(/^\/Visa\/Review\//i.test(at.pathname)){
    const applicationNumber=JSON.parse(state.get('draft:'+job.id)||'{}').applicationNumber||job.application_number;
    const result=await paymentReady(page,job,applicationNumber);state.set('payment-proof:'+job.id,JSON.stringify(result.paymentEvidence));return result;
   }
   const report=await visaDiagnostics(page,job.data,applicationId);if(report)state.set('stage-report:'+job.id,JSON.stringify(report));
   throw new Attention('needs_review','Sug‘urta va shartlar bosqichlari saqlandi. Keyingi sahifa: '+at.pathname,'review');
  }
  throw new Attention('needs_review','Keyingi bosqichni tekshiring.','review');
 };
 const current=new URL(page.url());
 if(current.origin===ORIGIN&&url&&!validDraft(page.url())&&current.pathname.split('/').at(-1).toLowerCase()===new URL(url).pathname.split('/').at(-1).toLowerCase())return finishApplication();
 await waitForLogin(page,state,onProgress);
 const next=state.get('next-route:'+job.id);
 if(url&&next&&remainingPattern.test(next)&&next.split('/').at(-1).toLowerCase()===new URL(url).pathname.split('/').at(-1).toLowerCase()){await page.goto(ORIGIN+next,{waitUntil:'domcontentloaded'});if(remainingPattern.test(new URL(page.url()).pathname))return finishApplication();}
 if(url)await page.goto(url,{waitUntil:'domcontentloaded'});
 else{
  const started=state.get('started:'+job.id);
  if(started&&started!=='editing')throw new Attention('needs_review','Oldingi urinish boshlangan. Yangi ariza yaratishdan oldin Saudi kabinetidagi qoralamani tekshiring.');
  state.set('started:'+job.id,'editing');await page.getByRole('link',{name:'Apply For Individual',exact:true}).click();
 }
 if(page.url().includes('/PersonalInfo')){
  await onProgress({step:'personal',note:'Shaxsiy ma’lumotlar, sana va portret kiritilmoqda.'});
  await fillPersonal(page,job.data,portraitPath);state.set('started:'+job.id,'saving');await page.getByRole('button',{name:'Next',exact:true}).click();
  try{await page.waitForURL('**/Visa/PassportInfo/*',{timeout:15000})}catch{throw new Attention('needs_review','Shaxsiy ma’lumotlar sahifasini tekshiring. Yangi ariza yaratilmaydi.');}
 }
 if(page.url().includes('/PassportInfo/')){
  const body=await page.locator('body').innerText();const applicationNumber=body.match(/Application No\.:\s*(\d+)/)?.[1];
  if(!applicationNumber||!validDraft(page.url()))throw new Attention('needs_review','Rasmiy qoralama raqami o‘qilmadi.','passport');
  const progress={officialUrl:page.url(),applicationNumber,step:'passport'};state.set('draft:'+job.id,JSON.stringify(progress));await checkpoint(progress);
  await fillPassport(page,job.data);const passportUrl=page.url();await page.getByRole('button',{name:'Next',exact:true}).click();
  try{await page.waitForURL(url=>url.href!==passportUrl,{timeout:15000,waitUntil:'domcontentloaded'})}catch{}
  const blocking=activeVisaMessage(await page.locator('body').innerText());if(blocking)throw new Attention('needs_review',blocking,'passport');
  if(new URL(page.url()).origin===ORIGIN)state.set('next-route:'+job.id,new URL(page.url()).pathname);
  if(remainingPattern.test(new URL(page.url()).pathname))return finishApplication();
  throw new Attention('needs_review','Sayt pasport va safar formasidan keyingi bosqichga o‘tmadi. Ko‘rsatilgan xatoni tekshiring. Mavjud qoralama saqlangan.','passport');
 }
 throw new Attention('needs_review','Arizaning joriy bosqichini tekshiring. Saqlangan qoralama takror yaratilmaydi.','review');
}
