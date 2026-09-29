const weights=[7,3,1];
export function checksum(text){return [...text].reduce((s,c,i)=>s+(c==='<'?0:/\d/.test(c)?Number(c):c.charCodeAt(0)-55)*weights[i%3],0)%10;}
function date(s,birth=false){if(!/^\d{6}$/.test(s))throw Error('MRZ sana xatosi');let y=2000+Number(s.slice(0,2));if(birth&&y>new Date().getFullYear())y-=100;const iso=`${y}-${s.slice(2,4)}-${s.slice(4)}`;const d=new Date(iso+'T00:00:00Z');if(Number.isNaN(+d)||d.toISOString().slice(0,10)!==iso)throw Error('MRZ sana xatosi');return iso;}
export function parseMrz(text,{printedNationality}={}){
 const lines=text.toUpperCase().split(/\r?\n/).map(s=>s.replace(/\s/g,'')).filter(s=>/^[A-Z0-9<]+$/.test(s));
 for(let i=0;i<lines.length-1;i++){
  const a=lines[i];let b=lines[i+1];if(a.length!==44||b.length!==44||!a.startsWith('P<'))continue;
  // Correct this observed Z/2 OCR error only when the printed nationality
  // independently says Uzbekistan and the issuing state is also UZB.
  if(printedNationality==='Uzbekistan'&&a.slice(2,5)==='UZB'&&b.slice(10,13)==='U2B')b=b.slice(0,10)+'UZB'+b.slice(13);
  // Country/name fields have no checksum. Reject impossible OCR characters there.
  if(!/^[A-Z]{3}$/.test(a.slice(2,5))||! /^[A-Z<]{3}$/.test(b.slice(10,13))||! /^[A-Z<]+$/.test(a.slice(5)))continue;
  if(checksum(b.slice(0,9))!==Number(b[9])||checksum(b.slice(13,19))!==Number(b[19])||checksum(b.slice(21,27))!==Number(b[27])||checksum(b.slice(0,10)+b.slice(13,20)+b.slice(21,43))!==Number(b[43]))continue;
  const [surname,given='']=a.slice(5).split('<<');const names=given.split('<').filter(Boolean);
  return {lastName:surname.replaceAll('<',' ').trim(),firstName:names[0]||'',middleName:names.slice(1).join(' '),passportNumber:b.slice(0,9).replaceAll('<',''),birthDate:date(b.slice(13,19),true),expiryDate:date(b.slice(21,27)),gender:b[20]==='F'?'Female':b[20]==='M'?'Male':'',nationality:b.slice(10,13)==='UZB'?'Uzbekistan':b.slice(10,13),...(a.slice(2,5)==='UZB'?{passportIssuePlace:'Uzbekistan'}:{})};
 }
 throw Error('Pasportning MRZ qatori aniq o‘qilmadi. Tekis, tiniq surat yuboring yoki panelda ma’lumotlarni kiriting.');
}
