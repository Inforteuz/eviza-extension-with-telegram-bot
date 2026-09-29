import sharp from 'sharp';
import {parseMrz} from './mrz.mjs';
import {readPrintedDetails} from './passport-text.mjs';
import {inspectPassportPortrait} from './portrait.mjs';
export async function extractPassport(worker,bytes,options={}){
 const image=await sharp(bytes,{limitInputPixels:40000000}).rotate().toBuffer();
 const meta=await sharp(image).metadata();
 await worker.setParameters({tessedit_pageseg_mode:'3',tessedit_char_whitelist:''});
 const full=await worker.recognize(await sharp(image).resize({width:2000}).greyscale().normalize().toBuffer());
 let extra=readPrintedDetails(full.data.text);
 // Uzbek passport labels are printed to the right of the portrait. Reading
 // this area without contrast normalization avoids amplifying the hologram.
 if(/UZBEKISTAN|P<UZB|ZBEKISTON/i.test(full.data.text)){
  try{
   await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''});
   const {normalized,face,width,height}=await inspectPassportPortrait(bytes,options);
   const left=Math.max(0,Math.round(face.x+face.width*1.15)),top=Math.max(0,Math.round(face.y-face.height*.6));
   const right=Math.min(width,Math.round(width*.95)),bottom=Math.min(height,Math.round(face.y+face.height*1.7));
   const details=await worker.recognize(await sharp(normalized).extract({left,top,width:right-left,height:bottom-top}).resize({width:1400}).greyscale().toBuffer());
   extra={...extra,...readPrintedDetails(details.data.text)};
  }catch{}finally{await worker.setParameters({tessedit_pageseg_mode:'3',tessedit_char_whitelist:''});}
 }
 try{return {...parseMrz(full.data.text,{printedNationality:extra.nationality}),...extra}}catch{}
 // Deskew and enlarge the printed MRZ strip. Only checksum-verified text is accepted.
 const strip=await sharp(image).extract({left:0,top:Math.floor(meta.height*.70),width:meta.width,height:meta.height-Math.floor(meta.height*.70)}).resize({width:2600}).greyscale().normalize().toBuffer();
 await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<'});
 try{for(const angle of [0,3,-3,6,-6]){
  const candidate=await sharp(strip).rotate(angle,{background:'white'}).toBuffer();const result=await worker.recognize(candidate);
  try{return {...parseMrz(result.data.text,{printedNationality:extra.nationality}),...extra}}catch{}
 }}finally{await worker.setParameters({tessedit_pageseg_mode:'3',tessedit_char_whitelist:''});}
 return {...extra,unverifiedMrz:true};
}
