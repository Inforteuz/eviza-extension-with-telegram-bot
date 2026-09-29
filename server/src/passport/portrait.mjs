import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {imagePipeline,pngSize,defaultPython} from './image.mjs';

export {defaultPython};
export async function inspectPassportPortrait(bytes,{python=defaultPython()}={}){
 let normalized=await imagePipeline(bytes,[{op:'resize_inside',max:1600}],{format:'png'},{python});
 const result=await new Promise((resolve,reject)=>{
  const child=spawn(python,[fileURLToPath(new URL('./detect-face.py',import.meta.url))],{stdio:['pipe','pipe','ignore'],windowsHide:true});
  let output='';const timer=setTimeout(()=>{child.kill();reject(Error('Portretni aniqlash vaqti tugadi.'));},20000);
  child.on('error',()=>{clearTimeout(timer);reject(Error('Serverda portret aniqlash (Python/OpenCV) sozlanmagan.'));});
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>4096)child.kill();});
  child.stdin.on('error',()=>{});child.stdin.end(normalized);
  child.on('close',code=>{clearTimeout(timer);try{if(code!==0)throw Error();resolve(JSON.parse(output));}catch{reject(Error('Portretni aniqlab bo‘lmadi.'));}});
 });
 if(result.error)throw Error(({no_face:'Yuz va tik yo‘nalish ishonchli aniqlanmadi. Tiniq pasport yoki alohida portret yuboring.',ambiguous_orientation:'Suratning tik yo‘nalishi noaniq. To‘g‘ri holatdagi tiniq pasport yuboring.',multiple_faces:'Bir nechta yuz yoki noaniq yo‘nalish topildi. Bitta pasportni tiniqroq yuboring.',detector_unavailable:'Portretni aniqlash modeli yoki Python/OpenCV o‘rnatilmagan.'})[result.error]||'Portret aniqlanmadi.');
 if(![0,90,180,270].includes(result.rotation))throw Error('Portret aylanishi noto‘g‘ri.');
 if(result.rotation)normalized=await imagePipeline(normalized,[{op:'rotate',deg:result.rotation}],{format:'png'},{python});
 const {width,height}=pngSize(normalized);
 return {normalized,face:result,width,height,python};
}

export function portraitCropRectangle(face,limits){
 const f=face,b=limits;
 if(![f.x,f.y,f.width,f.height,b.x,b.y,b.width,b.height].every(Number.isFinite)||Math.min(f.width,f.height)<40)throw Error('Yuz chegarasi yetarlicha aniq emas.');
 // YuNet bounds cover the face, not the hair. Keep space above hair, ears and
 // below the chin. A square crop would pull adjacent passport text into frame.
 const left=Math.floor(f.x-f.width*.25),top=Math.floor(f.y-f.height*.28);
 const right=Math.ceil(f.x+f.width*1.25),bottom=Math.ceil(f.y+f.height*1.12);
 if(left<b.x||top<b.y||right>b.x+b.width||bottom>b.y+b.height)throw Error('Boshni to‘liq sig‘dirish uchun rasm chetida joy yetmadi. To‘liq pasport yoki portret yuboring.');
 return {left,top,width:right-left,height:bottom-top};
}
export async function cropPassportPortrait(bytes,options={}){
 // GPT coordinates and angles are approximate: never use them to cut a face
 // without independently locating it in the original pixels.
 const result=await inspectPassportPortrait(bytes,options);
 return renderPassportPortrait(result);
}

export async function uprightPassportForReading(bytes,{inspect,python=defaultPython()}={}){
 let rotation=0;
 try{rotation=(await (inspect?inspect(bytes):inspectPassportPortrait(bytes,{python}))).face.rotation;}catch{/* Text can still be read when the portrait is unclear. */}
 if(![0,90,180,270].includes(rotation))rotation=0;
 return imagePipeline(bytes,[{op:'rotate',deg:rotation},{op:'resize_inside',max:2000}],{format:'jpeg',quality:95},{python});
}
export async function renderPassportPortrait({normalized,face,width,height,python=defaultPython()}){
 const rectangle=portraitCropRectangle(face,{x:0,y:0,width,height});
 // Contain preserves the complete frame and face proportions. White margins
 // fill the 200px square; no generated facial pixels and no head clipping.
 const steps=[{op:'crop',...rectangle},{op:'contain',size:200}];
 for(const quality of [95,100,90,85]){
  const portrait=await imagePipeline(normalized,steps,{format:'jpeg',quality},{python});
  if(portrait.length>=5000&&portrait.length<=100000)return portrait;
 }
 throw Error('Portret hajmi 5–100 KB talabiga mos kelmadi. Kesishni tekshiring.');
}
