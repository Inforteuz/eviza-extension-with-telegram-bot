// MRZ has no birthplace. Only take text next to an explicit printed label.
export function readBirthplace(text){
 const lines=String(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 for(let i=0;i<lines.length;i++){
  const match=lines[i].match(/PLACE\s+OF\s+BIRTH\s*[:/.-]?\s*(.*)$/i);
  if(!match)continue;
  for(const candidate of [match[1],lines[i+1]]){
   const value=String(candidate||'').replace(/^[|:/.\s]+/,'').replace(/^[MF]\s*[|]\s*/,'').trim();
   if(value.length>=2&&value.length<=80&&/^[A-Z][A-Z '\-.,]+$/.test(value)&&!/(PASSPORT|DATE|ISSUE|EXPIR|AUTHORITY|NATIONALITY|SEX|SURNAME|GIVEN)/.test(value))return value;
  }
 }
 return '';
}

export function readPrintedDetails(text){
 const lines=String(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean),data={};
 const birthCity=readBirthplace(text);if(birthCity)data.birthCity=birthCity;
 for(const [key,label] of [['lastName',/\bSURNAME\b/i],['firstName',/\bGIVEN\s+NAMES\b/i],['middleName',/\bFATHER['’]?S\s+NAME\b/i],['nationality',/\bNATIONALITY\b/i]]){
  const at=lines.findIndex(line=>label.test(line));if(at<0)continue;
  const value=(lines[at+1]||'').replace(/[|:;,.\s]+$/,'').trim();
  if(!/^[A-Z][A-Z '\-]{1,79}$/.test(value)||/(DATE|ISSUE|EXPIR|AUTHORITY|NATIONALITY|SURNAME|GIVEN)/.test(value))continue;
  if(key==='nationality'){if(value==='UZBEKISTAN')data[key]='Uzbekistan';}else data[key]=value;
 }
 for(let i=0;i<lines.length;i++){
  if(!/DATE\s+OF\s+ISSUE/i.test(lines[i]))continue;
  const match=(lines[i+1]||'').match(/^[|;:.,\s]*(\d{2})[ .\/-]+(\d{2})[ .\/-]+(\d{4})(?!\d)/);if(!match)continue;
  const iso=`${match[3]}-${match[2]}-${match[1]}`,d=new Date(iso+'T00:00:00Z');
  if(!Number.isNaN(+d)&&d.toISOString().slice(0,10)===iso&&iso<=new Date().toISOString().slice(0,10))data.issueDate=iso;
 }
 return data;
}
