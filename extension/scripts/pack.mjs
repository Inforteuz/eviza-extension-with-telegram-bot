// Builds dist/evisa-auto-filler-<version>.zip for distribution.
//   node scripts/pack.mjs --server https://evisa.example.uz
// The server address is written into src/config.js inside the zip only.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync} from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),flag=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined};
const server=flag('--server')||'';
if(server&&!/^https:\/\/[^/\s]+(\/[\w.~-]+)*$/.test(server.replace(/\/+$/,'')))throw Error('--server must look like https://your-domain.uz');
const manifest=JSON.parse(readFileSync(path.join(root,'manifest.json'),'utf8'));
const include=['manifest.json','icons','src'];
const files=[];
const walk=rel=>{const abs=path.join(root,rel);if(statSync(abs).isDirectory())for(const name of readdirSync(abs).sort())walk(path.join(rel,name));else files.push(rel.split(path.sep).join('/'))};
include.forEach(walk);

const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
const crc32=buf=>{let c=0xffffffff;for(const b of buf)c=crcTable[(c^b)&0xff]^(c>>>8);return (c^0xffffffff)>>>0};
const locals=[],centrals=[];let offset=0;
for(const name of files){
 let data=readFileSync(path.join(root,name));
 if(name==='src/config.js'&&server)data=Buffer.from(data.toString('utf8').replace(/export const DEFAULT_SERVER_URL='[^']*';/,`export const DEFAULT_SERVER_URL=${JSON.stringify(server.replace(/\/+$/,'')).replace(/"/g,"'")};`));
 const packed=deflateRawSync(data,{level:9}),nameBuf=Buffer.from(name),crc=crc32(data);
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);local.writeUInt16LE(8,8);local.writeUInt32LE(0,10);local.writeUInt32LE(crc,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBuf.length,26);
 locals.push(local,nameBuf,packed);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x0800,8);central.writeUInt16LE(8,10);central.writeUInt32LE(0,12);central.writeUInt32LE(crc,16);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(nameBuf.length,28);central.writeUInt32LE(offset,42);
 centrals.push(central,nameBuf);offset+=30+nameBuf.length+packed.length;
}
const centralSize=centrals.reduce((s,b)=>s+b.length,0),end=Buffer.alloc(22);
end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
mkdirSync(path.join(root,'dist'),{recursive:true});
const out=path.join(root,'dist',`evisa-auto-filler-${manifest.version}.zip`),zip=Buffer.concat([...locals,...centrals,end]);
writeFileSync(out,zip);
// Stable name for the download link served by Caddy (/download/evisa-auto-filler.zip).
writeFileSync(path.join(root,'dist','evisa-auto-filler.zip'),zip);
console.log(`${out} (${files.length} files${server?', server: '+server:''})`);
