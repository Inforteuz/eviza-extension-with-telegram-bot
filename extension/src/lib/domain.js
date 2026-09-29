export const blankApplicant={firstName:'',middleName:'',lastName:'',nationality:'',birthDate:'',gender:'',maritalStatus:'',birthCountry:'',birthCity:'',profession:'',residenceCountry:'',city:'',address:'',postalCode:'',passportNumber:'',issueDate:'',expiryDate:'',travelDate:'',passportIssuePlace:'',departureDate:'',visitPurpose:'',accommodationType:'',accommodationName:'',saudiCity:'',saudiAddress:'',saudiAddress2:'',saudiPhone:'',saudiEmail:''};
export const fieldLabels={firstName:'Ismi',middleName:'Otasining ismi',lastName:'Familiyasi',nationality:'Fuqaroligi',birthDate:'Tug‘ilgan sana',gender:'Jinsi',maritalStatus:'Oilaviy holati',birthCountry:'Tug‘ilgan davlati',birthCity:'Tug‘ilgan joyi',profession:'Kasbi',residenceCountry:'Yashash davlati',city:'Shahar / tuman',address:'Manzil',postalCode:'Pochta indeksi',passportNumber:'Pasport raqami',issueDate:'Berilgan sana',expiryDate:'Amal qilish muddati',travelDate:'Kirish sanasi',passportIssuePlace:'Pasport berilgan davlat / shahar',departureDate:'Chiqish sanasi',visitPurpose:'Safar maqsadi',accommodationType:'Saudiyadagi turar joy turi',accommodationName:'Mehmonxona / mezbon nomi',saudiCity:'Saudiyadagi shahar',saudiAddress:'Saudiyadagi manzil',saudiAddress2:'Qo‘shimcha manzil',saudiPhone:'Saudiyadagi aloqa raqami',saudiEmail:'Saudiyadagi aloqa emaili'};
export const statuses={draft:'Ma’lumot kerak',queued:'Navbatda',running:'Bajarilmoqda',needs_input:'Ma’lumot kerak',needs_auth:'Kirish kerak',needs_review:'Tekshirish kerak',payment_ready:'To‘lovga tayyor',paid:'To‘langan',failed:'Xatolik'};
export function cleanApplicant(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Ma’lumot formati noto‘g‘ri');
 const data={...blankApplicant};for(const k of Object.keys(data)){const v=input[k];if(v!==undefined){if(typeof v!=='string'||v.length>500)throw Error('Maydon uzunligi yoki turi noto‘g‘ri');data[k]=v.trim();}}
 data.postalCode='';return data;
}
export function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===s;}
// These are operator-requested suggestions, never verified facts or automatic submission defaults.
export function applicantSuggestions(a,today=defaultTripDates().travelDate){
 const result=[];
 const add=(field,value,reason)=>{if(!a[field]&&value)result.push({field,value,reason});};
 if(validDate(a.birthDate)&&validDate(today)&&a.birthDate<today){
  const age=Number(today.slice(0,4))-Number(a.birthDate.slice(0,4))-(today.slice(5)<a.birthDate.slice(5)?1:0);
  const limit=a.gender==='Female'?20:a.gender==='Male'?22:null;
  if(limit!==null&&age!==limit)add('maritalStatus',age>limit?'Married':'Single',`${age} yosh uchun siz belgilagan taxmin. Haqiqiy oilaviy holatni tekshiring.`);
 }
 add('profession','None','Kasb noma’lumligi “None” ekanini anglatmaydi. Arizachidan tekshiring.');
 if(a.birthCity){
  add('residenceCountry',a.birthCountry||(/^(UZB|UZBEKISTAN)$/i.test(a.nationality)?'Uzbekistan':''),'Tug‘ilgan davlat yoki fuqarolik asosidagi taklif. Hozirgi yashash davlatini tekshiring.');
  add('city',a.birthCity,'Pasportdagi tug‘ilgan joy asosida. Hozir ham shu yerda yashashini tekshiring.');
  add('address',a.birthCity,'Tug‘ilgan joy to‘liq yashash manzilini tasdiqlamaydi. Manzilni tekshiring.');
 }
 return result;
}
export function missingFields(a,portrait){
 const required=requiredApplicantFields(a);
 const errors=required.filter(k=>!a[k]).map(k=>fieldLabels[k]);
 for(const k of ['birthDate','issueDate','expiryDate','travelDate','departureDate'])if(a[k]&&!validDate(a[k]))errors.push(fieldLabels[k]+' formati');
 if(a.gender&&!['Male','Female'].includes(a.gender))errors.push('Jins qiymati');
 if(a.maritalStatus&&!['Single','Married','Divorced','Widow','Other'].includes(a.maritalStatus))errors.push('Oilaviy holat qiymati');
 if(a.passportNumber&&!/^[A-Z0-9]{5,15}$/.test(a.passportNumber))errors.push('Pasport raqami formati');
 if(validDate(a.birthDate)&&a.birthDate>=new Date().toISOString().slice(0,10))errors.push('Tug‘ilgan sana kelajakda');
 if(validDate(a.issueDate)&&validDate(a.expiryDate)&&a.issueDate>=a.expiryDate)errors.push('Pasport sanalari');
 if(validDate(a.expiryDate)){const d=new Date(new Date().toISOString().slice(0,10)+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+6);if(new Date(a.expiryDate+'T00:00:00Z')<d)errors.push('Pasport ariza topshirish sanasidan 6 oy amal qilishi kerak');}
 if(validDate(a.travelDate)&&validDate(a.departureDate)&&a.departureDate<a.travelDate)errors.push('Chiqish sanasi kirishdan oldin');
 if(a.visitPurpose&&!['Umrah','Leisure','Family & Relatives','Event'].includes(a.visitPurpose))errors.push('Safar maqsadi qiymati');
 if(a.accommodationType&&!['Hotel','Residential'].includes(a.accommodationType))errors.push('Turar joy turi');
 if(!portrait)errors.push('200 × 200 portret');return errors;
}
export function paymentUrl(value){if(typeof value!=='string')return false;try{const u=new URL(value);return u.origin==='https://visa.visitsaudi.com'&&/^\/Visa\//.test(u.pathname)&&!/logout/i.test(u.pathname);}catch{return false}}

export const optionalFields=['middleName','postalCode','saudiAddress2','saudiPhone','saudiEmail'];
export const tripFields=['travelDate','departureDate','visitPurpose','accommodationType','accommodationName','saudiCity','saudiAddress','saudiAddress2','saudiPhone','saudiEmail'];
export function requiredApplicantFields(a){return Object.keys(blankApplicant).filter(k=>!optionalFields.includes(k)&&!(a.accommodationType==='Hotel'&&['saudiCity','saudiAddress'].includes(k)));}
export const operatorTripTemplate={visitPurpose:'Umrah',accommodationType:'Hotel',accommodationName:'Al Jabriy'};
// Map an explicit, recognized birthplace; citizenship alone does not establish birthplace.
export function countryForBirthplace(place){
 const name=place.toUpperCase().replace(/[‘’ʻʼ']/g,'').replace(/[.,]/g,' ').replace(/\s+/g,' ').trim();
 if(/^(UZBEKISTAN|OZBEKISTON)$/.test(name))return 'Uzbekistan';
 if(/^(ANDIJAN|ANDIJON|TASHKENT|TOSHKENT|FERGANA|FERGHANA|FARGONA|NAMANGAN|SAMARKAND|SAMARQAND|BUKHARA|BUXORO|NAVOI|NAVOIY|JIZZAKH|JIZZAX|KHOREZM|XORAZM|KASHKADARYA|QASHQADARYO|SURKHANDARYA|SURXONDARYO|SYRDARYA|SIRDARYO|NUKUS)( (REGION|CITY|VILOYATI|SHAHRI))?$/.test(name))return 'Uzbekistan';
 if(/^(REPUBLIC OF KARAKALPAKSTAN|KARAKALPAKSTAN|QORAQALPOGISTON RESPUBLIKASI)$/.test(name))return 'Uzbekistan';
 return '';
}
export function applyPreparationDefaults(input,trip={},today=defaultTripDates().travelDate){
 const data=cleanApplicant(input);
 for(const key of tripFields){
  if(['accommodationName','saudiCity','saudiAddress','saudiAddress2','saudiPhone','saudiEmail'].includes(key)&&data.accommodationType&&trip.accommodationType&&data.accommodationType!==trip.accommodationType)continue;
  if(!data[key]&&trip[key])data[key]=trip[key];
 }
 if(!data.travelDate)data.travelDate=today;
 if(!data.departureDate)data.departureDate=defaultTripDates(data.travelDate).departureDate;
 if(!data.birthCountry)data.birthCountry=countryForBirthplace(data.birthCity);
 return data;
}
export function applicantPreview(a,today=defaultTripDates().travelDate){
 const suggestions=applicantSuggestions(a,today);
 return {data:{...a,...Object.fromEntries(suggestions.map(s=>[s.field,s.value]))},suggestions};
}
export function cleanTripDefaults(input){const a=cleanApplicant(input);return Object.fromEntries(tripFields.map(k=>[k,a[k]]));}
export function officialDraftUrl(value){if(typeof value!=='string')return false;try{const u=new URL(value);return u.origin==='https://visa.visitsaudi.com'&&/^\/Visa\/(PersonalInfo|PassportInfo)\/[0-9a-f-]{36}$/i.test(u.pathname)&&!u.search&&!u.hash;}catch{return false;}}

export function defaultTripDates(arrival=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Tashkent'})){
 if(!validDate(arrival))return {travelDate:arrival,departureDate:''};
 const [year,month,day]=arrival.split('-').map(Number);const maxDay=new Date(Date.UTC(year+1,month,0)).getUTCDate();
 const departure=new Date(Date.UTC(year+1,month-1,Math.min(day,maxDay)));departure.setUTCDate(departure.getUTCDate()-1);
 return {travelDate:arrival,departureDate:departure.toISOString().slice(0,10)};
}
