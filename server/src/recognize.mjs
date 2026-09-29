import {readPassportAi} from './passport/ai.mjs';
import {inspectPassportPortrait,renderPassportPortrait} from './passport/portrait.mjs';
import {imageInfo} from './passport/image.mjs';

export const MAX_IMAGE_BYTES=10*1024*1024;
const identityFields=['firstName','middleName','lastName','nationality','birthDate','gender','birthCountry','birthCity','passportNumber','issueDate','expiryDate','passportIssuePlace'];

const formatOf=b=>b[0]===0xff&&b[1]===0xd8&&b[2]===0xff?'jpeg':b.readUInt32BE(0)===0x89504e47?'png':b.toString('latin1',0,4)==='RIFF'&&b.toString('latin1',8,12)==='WEBP'?'webp':'';
export async function assertImage(bytes,{python}={}){
 if(!bytes?.length||bytes.length>MAX_IMAGE_BYTES)throw Object.assign(Error('Rasm 10 MB dan kichik bo‘lishi kerak.'),{status:413});
 const invalid=()=>Object.assign(Error('JPG yoki PNG formatidagi tiniq pasport rasmini yuboring.'),{status:415});
 if(bytes.length<16||!formatOf(bytes))throw invalid();
 let info;try{info=await imageInfo(bytes,python?{python}:{})}catch(error){if(error.code==='opencv_unavailable')throw Object.assign(Error(error.message),{status:503});throw invalid()}
 if(Math.max(info.width,info.height)<300||Math.min(info.width,info.height)<200)throw invalid();
}

// Text and portrait are independent: an AI failure keeps the portrait and vice versa.
// The face detector runs once and is shared by both steps.
export async function recognizePassport(bytes,{config,readAi=readPassportAi,inspect=inspectPassportPortrait,render=renderPassportPortrait,portraitOnly=false}={}){
 let inspection;
 const inspectOnce=()=>inspection||=inspect(bytes,config.pythonBin?{python:config.pythonBin}:{});
 const portraitTask=inspectOnce().then(render);
 const aiTask=portraitOnly?Promise.resolve(null):readAi(bytes,{OPENAI_API_KEY:config.openaiKey,PASSPORT_AI_MODEL:config.passportModel,PYTHON_BIN:config.pythonBin},{inspectPortrait:()=>inspectOnce()});
 const [ai,portrait]=await Promise.allSettled([aiTask,portraitTask]);
 const result={data:{},notes:[],conflicts:[],unverifiedMrz:true,aiError:null,portrait:null,portraitError:null};
 if(portrait.status==='fulfilled')result.portrait=portrait.value.toString('base64');
 else result.portraitError=portrait.reason?.message||'Portretni kesib bo‘lmadi.';
 if(!portraitOnly){
  if(ai.status==='fulfilled'){
   for(const key of identityFields)result.data[key]=ai.value[key]||'';
   result.conflicts=ai.value.conflicts||[];result.unverifiedMrz=!!ai.value.unverifiedMrz;
   result.notes.push('Pasport matni AI orqali o‘qildi.');
   if(result.conflicts.length)result.notes.push('AI o‘qigan matn va MRZ orasida farq bor. Mos kelmagan qiymatlarni tekshiring.');
   result.notes.push(result.unverifiedMrz?'MRZ qatori ishonchli o‘qilmadi. O‘qilmagan maydonlarni tekshiring.':'MRZ raqam va sanalarining nazorat raqamlari tekshirildi. Ism va familiyani surat bilan solishtiring.');
  }else result.aiError=ai.reason?.safeToDisplay?ai.reason.message:'Pasport matnini o‘qib bo‘lmadi. Maydonlarni qo‘lda to‘ldiring yoki tiniqroq rasm yuklang.';
 }
 if(result.portrait)result.notes.push('200 × 200 portret pasportdan avtomatik kesildi.');
 else result.notes.push(result.portraitError);
 return result;
}
