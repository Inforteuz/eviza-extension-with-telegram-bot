// Original passport images stay on this computer (IndexedDB of the extension
// origin) so a re-read does not need the file again. Shared by panel and worker.
const DB='evisa-images',STORE='images';
function open(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
}
async function tx(mode,fn){
 const db=await open();
 try{return await new Promise((resolve,reject)=>{const t=db.transaction(STORE,mode),store=t.objectStore(STORE);const result=fn(store);t.oncomplete=()=>resolve(result?.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error)})}
 finally{db.close()}
}
export const putImage=(id,blob)=>tx('readwrite',s=>{s.put(blob,id)});
export const getImage=id=>tx('readonly',s=>s.get(id));
export const deleteImages=ids=>tx('readwrite',s=>{for(const id of ids)s.delete(id)});
