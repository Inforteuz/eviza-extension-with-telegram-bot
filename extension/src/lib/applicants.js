import {blankApplicant,cleanApplicant,missingFields,applicantPreview,applyPreparationDefaults} from './domain.js';

export const identityFields=['firstName','middleName','lastName','nationality','birthDate','gender','birthCountry','birthCity','passportNumber','issueDate','expiryDate','passportIssuePlace'];
export const statusLabels={reading:'O‘qilmoqda…',error:'Xato',review:'Tekshiring',confirmed:'Tayyor',running:'To‘ldirilmoqda',payment_ready:'To‘lovga tayyor',needs_input:'Ma’lumot kerak',needs_review:'E’tibor kerak',needs_auth:'Kirish kerak'};
// Statuses in which data can no longer be edited without a reset.
export const lockedStatuses=['running','payment_ready'];

export function newApplicant({id,fileName='',source='ai',tripDefaults={}}){
 const a={id,createdAt:Date.now(),fileName,source,status:source==='ai'?'reading':'review',data:applyPreparationDefaults({...blankApplicant},tripDefaults),notes:[],error:'',hasPortrait:false,portraitHash:'',confirmation:'',activated:false,result:null,hasImage:source==='ai'};
 return derive(a);
}
export function normalizeData(input){
 const data=cleanApplicant(input);
 data.passportNumber=data.passportNumber.toUpperCase().replace(/\s+/g,'');
 for(const key of ['firstName','middleName','lastName'])data[key]=data[key].toUpperCase();
 return data;
}
// Suggestions are shown for review; confirming the card accepts the preview.
export function derive(a){
 const preview=applicantPreview(a.data);
 return {...a,suggestions:preview.suggestions,missing:missingFields(preview.data,a.hasPortrait)};
}
export function previewData(a){return applicantPreview(a.data).data}
export async function sha256(text){const bytes=new TextEncoder().encode(text);const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')}
export async function confirmationFor(data,portraitHash){return sha256(JSON.stringify(data)+'|'+portraitHash)}
export const displayName=a=>[a.data.firstName,a.data.lastName].filter(Boolean).join(' ')||a.fileName||'Yangi arizachi';

// A fresh server read replaces the identity fields it could read and keeps the rest.
export function mergeRecognition(a,result,tripDefaults){
 const data={...a.data};
 for(const key of identityFields){const value=result.data?.[key];if(typeof value==='string'&&value)data[key]=value}
 return derive({...a,data:applyPreparationDefaults(normalizeData(data),tripDefaults),notes:[...(result.aiError?[result.aiError]:[]),...(result.notes||[])].filter(Boolean),error:result.aiError&&!result.portrait?result.aiError:'',status:'review',confirmation:''});
}
export async function readyToRun(a){
 if(a.status!=='confirmed'||!a.hasPortrait||!a.confirmation)return false;
 return a.confirmation===await confirmationFor(a.data,a.portraitHash)&&!missingFields(a.data,a.hasPortrait).length;
}
