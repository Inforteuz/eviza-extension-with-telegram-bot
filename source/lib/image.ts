export function dimensions(bytes:Uint8Array):{width:number;height:number}|null{
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return {width:d.getUint32(16),height:d.getUint32(20)};
 if(bytes[0]!==255||bytes[1]!==216)return null;
 let i=2;while(i+4<bytes.length){if(bytes[i++]!==255)return null;while(bytes[i]===255)i++;const marker=bytes[i++];if(marker===217||marker===218)return null;if(marker===216||marker===1||(marker>=208&&marker<=215))continue;if(i+2>bytes.length)return null;const len=d.getUint16(i);if(len<2||i+len>bytes.length)return null;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&len>=7)return {width:d.getUint16(i+5),height:d.getUint16(i+3)};i+=len;}
 return null;
}
