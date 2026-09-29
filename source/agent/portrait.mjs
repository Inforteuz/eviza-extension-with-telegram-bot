import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {defaultPython} from './platform.mjs';

export async function inspectPassportPortrait(bytes,{python=process.env.PYTHON_BIN||defaultPython()}={}){
 let normalized=await sharp(bytes,{limitInputPixels:40000000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 const result=await new Promise((resolve,reject)=>{
  const child=spawn(python,[fileURLToPath(new URL('./detect-face.py',import.meta.url))],{stdio:['pipe','pipe','ignore'],windowsHide:true});
  let output='';const timer=setTimeout(()=>{child.kill();reject(Error('Portretni aniqlash vaqti tugadi.'));},20000);
  child.on('error',()=>{clearTimeout(timer);reject(Error('Portretni aniqlash uchun Python va OpenCV sozlang.'));});
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>4096)child.kill();});
  child.stdin.on('error',()=>{});child.stdin.end(normalized);
  child.on('close',code=>{clearTimeout(timer);try{if(code!==0)throw Error();resolve(JSON.parse(output));}catch{reject(Error('Portretni aniqlab bo‘lmadi.'));}});
 });
 if(result.error)throw Error(({no_face:'Yuz va tik yo‘nalish ishonchli aniqlanmadi. Tiniq pasport yoki alohida portret yuboring.',ambiguous_orientation:'Suratning tik yo‘nalishi noaniq. To‘g‘ri holatdagi tiniq pasport yuboring.',multiple_faces:'Bir nechta yuz yoki noaniq yo‘nalish topildi. Bitta pasportni tiniqroq yuboring.',detector_unavailable:'Portretni aniqlash modeli yoki Python/OpenCV o‘rnatilmagan.'})[result.error]||'Portret aniqlanmadi.');
 if(![0,90,180,270].includes(result.rotation))throw Error('Portret aylanishi noto‘g‘ri.');
 if(result.rotation)normalized=await sharp(normalized).rotate(result.rotation).png().toBuffer();
 const {width,height}=await sharp(normalized).metadata();
 return {normalized,face:result,width,height};
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

export async function uprightPassportForReading(bytes,{inspect=inspectPassportPortrait}={}){
 const original=await sharp(bytes,{limitInputPixels:40000000}).rotate().png().toBuffer();
 let rotation=0;
 try{rotation=(await inspect(original)).face.rotation;}catch{/* Text can still be read when the portrait is unclear. */}
 if(![0,90,180,270].includes(rotation))rotation=0;
 return sharp(original).rotate(rotation).resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).jpeg({quality:95}).toBuffer();
}
export async function renderPassportPortrait({normalized,face,width,height}){
 const rectangle=portraitCropRectangle(face,{x:0,y:0,width,height});
 const crop=await sharp(normalized).extract(rectangle).png().toBuffer();
 // Contain preserves the complete frame and face proportions. White margins
 // fill the 200px square; no generated facial pixels and no head clipping.
 const cropped=sharp(crop).resize(200,200,{fit:'contain',background:'#fff'});
 for(const quality of [95,100,90,85]){
  const portrait=await cropped.clone().jpeg({quality,chromaSubsampling:'4:4:4'}).toBuffer();
  if(portrait.length>=5000&&portrait.length<=100000)return portrait;
 }
 throw Error('Portret hajmi 5–100 KB talabiga mos kelmadi. Kesishni tekshiring.');
}
