import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const defaultPython=()=>process.env.PYTHON_BIN||(process.platform==='win32'?'python':'python3');
const script=fileURLToPath(new URL('./image.py',import.meta.url));
const messages={invalid_image:'Rasmni o‘qib bo‘lmadi. JPG yoki PNG pasport rasmini yuboring.',too_large:'Rasm juda katta.',too_many_pixels:'Rasm o‘lchami juda katta.',bad_crop:'Portret chegarasi rasmdan tashqariga chiqdi.',opencv_unavailable:'Serverda rasm bilan ishlash (Python/OpenCV) sozlanmagan.'};
export class ImageError extends Error {constructor(code){super(messages[code]||'Rasmni qayta ishlab bo‘lmadi.');this.code=code;this.safeToDisplay=true}}

// Runs one OpenCV pipeline (see image.py). Returns the encoded image, or {width,height} for "info".
export function imagePipeline(bytes,steps,output,{python=defaultPython(),timeout=20000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(python,[script,JSON.stringify({steps,output})],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  const out=[],err=[];let size=0;
  const timer=setTimeout(()=>{child.kill();reject(new ImageError('timeout'))},timeout);
  child.on('error',()=>{clearTimeout(timer);reject(new ImageError('opencv_unavailable'))});
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>40*1024*1024)child.kill();else out.push(chunk)});
  child.stderr.on('data',chunk=>{if(err.length<16)err.push(chunk)});
  child.stdin.on('error',()=>{});child.stdin.end(bytes);
  child.on('close',code=>{
   clearTimeout(timer);
   if(code!==0){let error='failed';try{error=JSON.parse(Buffer.concat(err).toString()).error||error}catch{/* not JSON */}return reject(new ImageError(error))}
   const result=Buffer.concat(out);
   if(output.format==='info'){try{resolve(JSON.parse(result.toString()))}catch{reject(new ImageError('failed'))}}
   else resolve(result);
  });
 });
}
export const imageInfo=(bytes,options)=>imagePipeline(bytes,[],{format:'info'},options);
export function pngSize(png){
 if(png.length<24||png.readUInt32BE(0)!==0x89504e47)throw new ImageError('failed');
 return {width:png.readUInt32BE(16),height:png.readUInt32BE(20)};
}
