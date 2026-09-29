import {applyPreparationDefaults,applicantSuggestions,missingFields} from '../lib/domain.ts';

// Reading and portrait extraction are independent: an OCR failure must not lose the photo.
export async function preparePassport(job,image,{readPassport,cropPortrait,savePortrait,tripDefaults={}}){
 let data={...job.data},portraitReady=!!job.portrait;const notes=[];
 if(job.job_type!=='portrait')try{
  const extracted=await readPassport(image);
  if(extracted.source==='ai')notes.push('Pasport matni AI orqali o‘qildi.');
  if(extracted.conflicts?.length)notes.push('AI o‘qigan matn va MRZ orasida farq bor. Mos kelmagan qiymatlarni tekshiring.');
  for(const [key,value] of Object.entries(extracted))if(key in data&&typeof value==='string'&&!data[key])data[key]=value;
  notes.push(extracted.unverifiedMrz?'MRZ qatori ishonchli o‘qilmadi. O‘qilmagan maydonlarni tekshiring.':'MRZ raqam va sanalarining nazorat raqamlari tekshirildi. Ism va familiyani surat bilan solishtiring.');
 }catch(error){notes.push(error.safeToDisplay?error.message:'Pasport matnini o‘qib bo‘lmadi. O‘qilmagan maydonlarni tekshiring.');}
 if(!portraitReady||job.job_type==='portrait'){
  try{const portrait=await cropPortrait(image);await savePortrait(portrait);portraitReady=true;notes.push('200 × 200 portret pasportdan avtomatik kesilib saqlandi.');}
  catch(error){notes.push(error.message||'Portretni kesib bo‘lmadi.');if(portraitReady)notes.push('Avvalgi portret saqlanib qoldi.');}
 }
 data=applyPreparationDefaults(data,tripDefaults);
 const missing=missingFields(data,portraitReady),suggestions=applicantSuggestions(data);
 notes.push(suggestions.length?'Shablon takliflari kartada ko‘rsatilgan; haqiqiy ma’lumotlarga mosligini tekshiring.':'Ma’lumotlar va portretni tekshiring.');
 return {data,portraitReady,status:missing.length?'needs_input':'needs_review',step:'review',note:notes.join(' ')};
}
