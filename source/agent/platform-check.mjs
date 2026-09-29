import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {LocalStore} from './local-store.mjs';
import {readConfig} from './config.mjs';
import {defaultPython} from './platform.mjs';
const config=await readConfig(),directory=mkdtempSync(path.join(tmpdir(),'evisa-check-'));
try{
 if(Number(process.versions.node.split('.')[0])<24)throw Error('Node.js 24+ required.');
 const store=new LocalStore(directory);store.close();
 const image=await sharp({create:{width:200,height:200,channels:3,background:'white'}}).jpeg().toBuffer();if(!image.length)throw Error('Image runtime failed.');
 const python=spawnSync(config.PYTHON_BIN||defaultPython(),['-c','import cv2,sys; cv2.FaceDetectorYN.create(sys.argv[1],"",(320,320))',fileURLToPath(new URL('./face_detection_yunet_2023mar.onnx',import.meta.url))],{windowsHide:true,timeout:20000,stdio:'pipe'});
 if(python.status!==0)throw Error('Python/OpenCV runtime is unavailable.');
 const {chromium}=await import('playwright');if(!chromium)throw Error('Browser library unavailable.');
 console.log(JSON.stringify({node:true,sqlite:true,images:true,portraitDetector:true,browserLibrary:true,platform:process.platform,liveVisaTest:false}));
}finally{rmSync(directory,{recursive:true,force:true})}
