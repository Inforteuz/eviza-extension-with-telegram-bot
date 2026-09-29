import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {cropPassportPortrait,portraitCropRectangle,renderPassportPortrait} from '../src/passport/portrait.mjs';
import {recognizePassport} from '../src/recognize.mjs';

test('portrait framing reserves hair, ears and chin and rejects incomplete source margins',()=>{
 const face={x:100,y:100,width:100,height:140};
 const r=portraitCropRectangle(face,{x:0,y:0,width:400,height:400});
 assert.ok(r.left<face.x&&r.top<face.y-30);assert.ok(r.left+r.width>face.x+face.width);assert.ok(r.top+r.height>face.y+face.height);
 assert.ok(r.height>r.width,'portrait is not forcibly cut to a square');
 assert.throws(()=>portraitCropRectangle({...face,x:2},{x:0,y:0,width:400,height:400}),/to‘liq/);
 assert.throws(()=>portraitCropRectangle({...face,width:NaN},{x:0,y:0,width:400,height:400}),/aniq/);
});
test('render preserves full portrait height in 200px square without stretching or adjacent text',async()=>{
 const face={x:100,y:100,width:100,height:140},rectangle=portraitCropRectangle(face,{x:0,y:0,width:400,height:400});
 const photo=await sharp(randomBytes(rectangle.width*rectangle.height*3),{raw:{width:rectangle.width,height:rectangle.height,channels:3}}).tint('green').png().toBuffer();
 const hair=await sharp({create:{width:80,height:8,channels:3,background:'blue'}}).png().toBuffer();
 const chin=await sharp({create:{width:80,height:8,channels:3,background:'red'}}).png().toBuffer();
 const normalized=await sharp({create:{width:400,height:400,channels:3,background:'magenta'}}).composite([{input:photo,left:rectangle.left,top:rectangle.top},{input:hair,left:110,top:rectangle.top+4},{input:chin,left:110,top:rectangle.top+rectangle.height-12}]).png().toBuffer();
 const result=await renderPassportPortrait({normalized,face,width:400,height:400});
 const m=await sharp(result).metadata();assert.equal(m.width,200);assert.equal(m.height,200);assert.ok(result.length>=5000&&result.length<=100000);
 const mean=async box=>(await sharp(await sharp(result).extract(box).toBuffer()).stats()).channels.map(c=>c.mean);
 const top=await mean({left:90,top:5,width:20,height:5}),bottom=await mean({left:90,top:189,width:20,height:5}),margin=await mean({left:1,top:30,width:8,height:140});
 assert.ok(top[2]>top[0]+80,'hair retained');assert.ok(bottom[0]>bottom[2]+80,'chin retained');assert.ok(margin.every(n=>n>240),'contain uses white margins');
});
test('AI coordinates and rotation cannot bypass the independent portrait detector',async()=>{
 const bytes=await sharp({create:{width:400,height:400,channels:3,background:'white'}}).png().toBuffer();
 await assert.rejects(cropPassportPortrait(bytes,{python:'nonexistent-python-evisa',portraitBounds:{x:.1,y:.1,width:.8,height:.8},headBounds:{x:.2,y:.2,width:.6,height:.6},portraitRotation:180}),/Python/);
 const model=readFileSync(new URL('../src/passport/face_detection_yunet_2023mar.onnx',import.meta.url));
 assert.equal(createHash('sha256').update(model).digest('hex'),'8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4');
});
test('AI text survives crop failure and the portrait survives AI failure; the detector runs once',async()=>{
 let inspections=0;const config={openaiKey:'test'};
 const inspect=async()=>{inspections++;return {face:{rotation:0}}};
 const first=await recognizePassport(Buffer.from('fixture'),{config,inspect,render:async()=>{throw Error('crop failed')},readAi:async(_b,_c,{inspectPortrait})=>{await inspectPortrait();return {firstName:'TEST',lastName:'APPLICANT',passportNumber:'ZZ1234567',unverifiedMrz:true,conflicts:[]}}});
 assert.equal(first.data.firstName,'TEST');assert.equal(first.data.passportNumber,'ZZ1234567');assert.equal(first.portrait,null);assert.equal(first.portraitError,'crop failed');assert.equal(inspections,1);
 const second=await recognizePassport(Buffer.from('fixture'),{config,inspect,render:async()=>Buffer.from('jpeg'),readAi:async()=>{throw Object.assign(Error('AI xatosi'),{safeToDisplay:true})}});
 assert.equal(second.portrait,Buffer.from('jpeg').toString('base64'));assert.equal(second.aiError,'AI xatosi');assert.deepEqual(second.data,{});
 let aiCalls=0;const only=await recognizePassport(Buffer.from('fixture'),{config,inspect,render:async()=>Buffer.from('jpeg'),readAi:async()=>{aiCalls++}, portraitOnly:true});
 assert.equal(aiCalls,0);assert.ok(only.portrait);
});

test('upright AI input preserves original resolution and falls back when orientation is uncertain',async()=>{
 const {uprightPassportForReading}=await import('../src/passport/portrait.mjs');
 const original=await sharp({create:{width:1800,height:1200,channels:3,background:'green'}}).png().toBuffer();
 const rotated=await uprightPassportForReading(original,{inspect:async()=>({face:{rotation:90}})}),m=await sharp(rotated).metadata();assert.equal(m.width,1200);assert.equal(m.height,1800);
 const fallback=await uprightPassportForReading(original,{inspect:async()=>{throw Error('uncertain')}}),f=await sharp(fallback).metadata();assert.equal(f.width,1800);assert.equal(f.height,1200);
});

// Runs only where Python + OpenCV are installed (the Docker image has them).
test('the YuNet detector loads and rejects a page without a face',{skip:!process.env.PYTHON_BIN&&'PYTHON_BIN not set'},async()=>{
 const blank=await sharp({create:{width:800,height:560,channels:3,background:'#eee'}}).jpeg().toBuffer();
 await assert.rejects(cropPassportPortrait(blank,{python:process.env.PYTHON_BIN}),/Yuz va tik yo‘nalish/);
});
