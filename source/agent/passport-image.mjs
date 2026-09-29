import {createHash} from 'node:crypto';
import sharp from 'sharp';

// Whole-document pixels only: this is duplicate-file screening, not face recognition.
export async function passportImageSignature(bytes){
 const pixels=await sharp(bytes,{limitInputPixels:40000000}).rotate().flatten({background:'#fff'}).greyscale().resize(32,32,{fit:'fill'}).raw().toBuffer();
 return {sha256:createHash('sha256').update(bytes).digest('hex'),fingerprint:pixels.toString('base64')};
}
export function similarPassportImages(left,right){
 const a=Buffer.from(left||'','base64');let b=Buffer.from(right||'','base64');
 if(a.length!==1024||b.length!==1024)return false;
 const mean=p=>p.reduce((s,x)=>s+x,0)/p.length,ma=mean(a),mb=mean(b);
 const variance=(p,m)=>p.reduce((s,x)=>s+(x-m)**2,0)/p.length;
 if(variance(a,ma)<100||variance(b,mb)<100)return false;
 for(let angle=0;angle<4;angle++){
  const distance=a.reduce((s,x,i)=>s+Math.abs(x-ma-b[i]+mb),0)/a.length;
  if(distance<=6)return true;
  b=Buffer.from(Array.from({length:1024},(_,i)=>b[(31-i%32)*32+Math.floor(i/32)]));
 }
 return false;
}
