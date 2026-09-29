import {DEFAULT_SERVER_URL} from '../config.js';
import {operatorTripTemplate} from './domain.js';

export const defaults=()=>({
 auth:null,
 settings:{serverUrl:DEFAULT_SERVER_URL,tripDefaults:{...operatorTripTemplate},pauseAfterEach:true},
 applicants:[],
 run:{state:'idle',mode:'individual',groupName:'',tabId:null,currentId:null,message:'',progress:{done:0,total:0},group:null},
 log:[],
 flow:{},
 pairing:null,
});
const KEYS=Object.keys(defaults());

// Single writer (the service worker). Every write goes through one promise
// chain, so storage always reflects the order of in-memory updates.
export class Store {
 constructor(area=globalThis.chrome?.storage.local){this.area=area;this.cache=defaults();this.chain=Promise.resolve();this.flowDirty=false}
 async load(){const saved=await this.area.get(KEYS);for(const key of KEYS)if(saved[key]!==undefined)this.cache[key]=key==='settings'?{...defaults().settings,...saved[key]}:saved[key];return this}
 get(key){return this.cache[key]}
 #write(values){const next=this.chain.then(()=>this.area.set(values));this.chain=next.catch(()=>{});return next}
 set(key,value){this.cache[key]=value;return this.#write({[key]:value})}
 mutate(key,fn){const draft=structuredClone(this.cache[key]);const result=fn(draft);return this.set(key,result===undefined?draft:result)}
 applicant(id){return this.cache.applicants.find(a=>a.id===id)||null}
 updateApplicant(id,patch){return this.mutate('applicants',list=>{const a=list.find(x=>x.id===id);if(a)Object.assign(a,typeof patch==='function'?patch(structuredClone(a)):patch)})}
 async log(text,level='info'){await this.mutate('log',log=>{log.push({at:Date.now(),level,text:String(text).slice(0,500)});return log.slice(-200)})}
 async portrait(id){return (await this.area.get('portrait:'+id))['portrait:'+id]||null}
 setPortrait(id,base64){return base64?this.#write({['portrait:'+id]:base64}):this.chain.then(()=>this.area.remove('portrait:'+id))}
 removePortraits(ids){return this.chain.then(()=>this.area.remove(ids.map(id=>'portrait:'+id)))}
 // Key/value view used by the form flows. set() is synchronous for the flow;
 // flush() persists before the next page command.
 flowState(){
  // Page snapshots (*-report:) are diagnostics only and stay in memory.
  const memory=new Map();
  return {get:k=>/-report:/.test(k)?memory.get(k):this.cache.flow[k],set:(k,v)=>{if(/-report:/.test(k)){memory.set(k,String(v));return}this.cache.flow[k]=String(v);this.flowDirty=true},flush:async()=>{if(this.flowDirty){this.flowDirty=false;await this.set('flow',this.cache.flow)}}};
 }
 clearFlow(id){for(const key of Object.keys(this.cache.flow))if(key.endsWith(':'+id))delete this.cache.flow[key];return this.set('flow',this.cache.flow)}
}
