import {Attention} from './errors.js';
export function assertGroupName(text,name){
 const visible=String(text).match(/Group Name\s*:\s*([^\n]+)/i)?.[1]?.trim();
 if(visible!==name)throw new Attention('needs_review','Rasmiy sahifadagi guruh nomi mos kelmadi.','group');
}
export function addMemberControl(report){
 const matches=report.controls.filter(c=>['a','button'].includes(c.tag)&&/^\+?\s*(?:save\s*(?:&|and)\s*)?add\s+(?:(?:another|new|more)\s+)?(?:person|applicant|member)\s*\+?$/i.test(String(c.text||'').trim()));
 if(matches.length!==1)throw new Attention('needs_review','Guruhga keyingi arizachini qo‘shish tugmasini tekshirish kerak.','group');
 return matches[0];
}
export function verifyGroupPayment(report,group,checkpoint){
 assertGroupName(report.text,group.name);
 const count=Number(report.text.match(/Total Applicants\s*:\s*(\d+)/i)?.[1]);
 if(count!==group.members.length||count<1)throw new Attention('needs_review','Rasmiy guruhdagi odamlar soni kengaytmadagi ro‘yxatga mos kelmadi.','review');
 const numbers=new Set();
 for(const member of group.members){
  const saved=checkpoint.members?.[member.id];
  if(saved?.phase!=='complete'||saved.confirmation!==member.group_confirmation||!saved.proof?.checkedFields||!saved.applicationNumber||numbers.has(saved.applicationNumber))throw new Attention('needs_review','Guruhdagi barcha arizachilar yakuniy tekshiruvdan o‘tmadi.','review');
  numbers.add(saved.applicationNumber);
  if(!report.text.includes(member.data.passportNumber))throw new Attention('needs_review','Yakuniy guruh ro‘yxatida '+member.data.firstName+' pasporti ko‘rinmadi.','review');
 }
 const total=report.text.match(/Total Amount\s+([\d,.]+)\s+SAR/i)?.[1];
 if(!total||!report.text.includes('Choose your payment method'))throw new Attention('needs_review','Guruhning umumiy to‘lov summasi ko‘rinmadi.','review');
 return {memberCount:count,totalSAR:total,applicationNumbers:[...numbers],paymentNotClicked:true,verifiedAt:new Date().toISOString()};
}
