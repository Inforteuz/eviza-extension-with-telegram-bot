// A small stand-in for visa.visitsaudi.com, served through Playwright routing.
// Labels, ids and page order follow what the form flows were live-tested on.
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';

// Date fields on the real site are readonly jQuery UI datepickers that open on focus.
// The mock uses the hardest variant: short month names and a narrow, re-centred year list.
const assets={'/__assets/jquery.js':readFileSync(new URL('./node_modules/jquery/dist/jquery.min.js',import.meta.url)),'/__assets/jquery-ui.js':readFileSync(new URL('./node_modules/jquery-ui/dist/jquery-ui.min.js',import.meta.url))};
const datepicker=`<script src="/__assets/jquery.js"></script><script src="/__assets/jquery-ui.js"></script><script>$(function(){$('input.date').datepicker({dateFormat:'dd/mm/yy',changeMonth:true,changeYear:true,yearRange:'c-10:c+10',selectMonthLabel:'Change the month',selectYearLabel:'Change the year'})})</script>`;

const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const page=(title,body)=>`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px sans-serif;margin:20px}label{display:block;margin-top:6px}.fake-file{opacity:0;position:absolute;width:1px}</style></head><body><h1>${esc(title)}</h1>${body}${body.includes('class="date"')?datepicker:''}</body></html>`;
const options=(list,sel='')=>['<option value="">Select</option>',...list.map(o=>`<option value="${esc(o)}"${o===sel?' selected':''}>${esc(o)}</option>`)].join('');
const countries=['Kazakhstan','Russia','Saudi Arabia','Turkey','Uzbekistan'];
const iso=v=>{const m=String(v||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:''};
const dmy=v=>v?v.split('-').reverse().join('/'):'';
const text=(label,name,value='')=>`<label for="${name}">${esc(label)} <span class="req">*</span></label><input type="text" id="${name}" name="${name}" value="${esc(value)}">`;
const date=(label,name)=>`<label for="${name}">${esc(label)} <span class="req">*</span></label><input type="text" class="date" readonly id="${name}" name="${name}" value="">`;
const select=(label,name,list)=>`<label for="${name}">${esc(label)} <span>*</span></label><select id="${name}" name="${name}">${options(list)}</select>`;

function parseMultipart(buffer,contentType){
 const boundary=contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.slice(1).find(Boolean);
 const fields={},files={};if(!boundary)return {fields,files};
 const raw=buffer.toString('latin1');
 for(const part of raw.split('--'+boundary)){
  const [head,...rest]=part.split('\r\n\r\n');if(!rest.length)continue;
  const name=head.match(/name="([^"]+)"/)?.[1];if(!name)continue;
  const body=rest.join('\r\n\r\n').replace(/\r\n$/,'');
  if(/filename="/.test(head))files[name]={filename:head.match(/filename="([^"]*)"/)[1],size:Buffer.from(body,'latin1').length,jpeg:body.startsWith('\xff\xd8')};
  else fields[name]=Buffer.from(body,'latin1').toString('utf8');
 }
 return {fields,files};
}
const parseForm=request=>{
 const type=request.headers()['content-type']||'',buffer=request.postDataBuffer()||Buffer.alloc(0);
 if(type.startsWith('multipart/'))return parseMultipart(buffer,type);
 return {fields:Object.fromEntries(new URLSearchParams(buffer.toString('utf8'))),files:{}};
};

export function createMockSaudi(){
 // latency: {path: ms} delays page loads like the real site (a click only starts the navigation).
 const site={loggedIn:true,apps:new Map(),groups:new Map(),payClicks:0,next:260929000,posts:[],rateLimited:false,latency:{}};
 const groupHeader=g=>g?`<p>Group Name : ${esc(g)}</p>`:'';
 const reviewLines=a=>{
  const p=a.personal,q=a.passport;
  const pairs=[['First Name or Given Name (English)',p.FirstName],['Father Name or Middle Name (English)',p.MiddleName],['Last Name or Family Name (English)',p.LastName],['Gender',p.Gender],['Marital Status',p.MaritalStatus],['Profession',p.Profession],['Date of Birth',p.BirthDate],['Country of Birth',p.BirthCountry],['City of Birth',p.BirthCity],['Country of Nationality',p.Nationality],['Country',p.Country],['City',p.City],['Zip/Postal Code',p.Zip],['Address',p.Address],['Passport Type',q.PassportType],['Passport No.',q.PassportNo],['Passport Issue Place (Country or City)',q.IssuePlace],['Passport Issue Date',q.IssueDate],['Passport Expiry Date',q.ExpiryDate],['Expected Date of Arrival',q.Arrival],['Expected Date of Departure',q.Departure],['Additional Purpose of Visit',q.Purpose],['Residence Address in Saudi Arabia',q.Accommodation==='Hotel'?'Commercial Accommodation':'Residential or Relative'],[q.Accommodation==='Hotel'?'Name of Hotel':'Name of Person',q.HotelName||q.PersonName]];
  return pairs.map(([l,v])=>`<div class="label">${esc(l)}</div><div class="value">${esc(v||'')}</div>`).join('');
 };
 const routes={
  login:()=>page('Login',`<form method="post" action="/Login"><label for="Email">Email</label><input id="Email" name="Email"><label for="Password">Password</label><input type="password" id="Password" name="Password"><button type="submit">Login</button></form>`),
  index:()=>page('Dashboard',`<a href="/Visa/PersonalInfo">Apply For Individual</a>
<button type="button" id="btnApplyGroupVisa" onclick="document.getElementById('groupBox').hidden=false">Apply For Group</button>
<div id="groupBox" hidden><label for="txtGroupName">Group Name</label><input id="txtGroupName"><button type="button" id="btnCreateGroup" onclick="location.href='/Visa/PersonalInfo?gName='+encodeURIComponent(document.getElementById('txtGroupName').value)">Create Group</button></div>`),
  personal:group=>page('Personal Information',`${groupHeader(group)}<form method="post" enctype="multipart/form-data">
<fieldset><legend>Are you applying from outside your country of residence?</legend><input type="radio" id="q1y" name="Q1" value="yes"><label for="q1y">Yes</label><input type="radio" id="q1n" name="Q1" value="no"><label for="q1n">No</label></fieldset>
${select('Country of Nationality','Nationality',countries)}${select('Gender','Gender',['Male','Female'])}${select('Marital Status','MaritalStatus',['Single','Married','Divorced','Widow','Other'])}
${select('Country of Birth','BirthCountry',countries)}${date('Date of Birth','BirthDate')}${select('Country','Country',countries)}
<label for="AttachmentPersonalPicture">Personal Photo</label><input type="file" class="fake-file" id="AttachmentPersonalPicture" name="Picture" accept="image/*">
${text('First Name or Given Name (English)','FirstName')}${text('Father Name or Middle Name (English)','MiddleName')}${text('Last Name or Family Name (English)','LastName')}
${text('City of Birth','BirthCity')}${text('Profession','Profession')}${text('City','City')}${text('Address','Address')}<label for="Zip">Zip/Postal Code</label><input type="text" id="Zip" name="Zip">
<button type="submit">Next</button><a href="/Visa/Index">Back</a></form>`),
  passport:a=>page('Passport Information',`${groupHeader(a.group)}<p>Application No.: ${a.number}</p><form method="post">
${select('Passport Type','PassportType',['Regular Passport','Diplomatic Passport'])}${text('Passport No.','PassportNo')}${text('Passport Issue Place (Country or City)','IssuePlace')}
${date('Passport Issue Date','IssueDate')}${date('Passport Expiry Date','ExpiryDate')}${date('Expected Date of Arrival','Arrival')}${date('Expected Date of Departure','Departure')}
<fieldset><legend>Additional Purpose of Visit</legend>${['Event','Family & Relatives','Leisure','Umrah'].map((p,i)=>`<input type="checkbox" id="purpose${i}" name="Purpose" value="${esc(p)}"><label for="purpose${i}">${esc(p)}</label>`).join('')}</fieldset>
<input type="radio" id="rdEmailYes" name="EmailNotify" value="yes"><label for="rdEmailYes">Send by email</label><input type="radio" id="rdEmailNo" name="EmailNotify" value="no"><label for="rdEmailNo">Do not send by email</label>
<input type="radio" id="rdWhatsAppYes" name="WhatsApp" value="yes"><label for="rdWhatsAppYes">Send by WhatsApp</label><input type="radio" id="rdWhatsAppNo" name="WhatsApp" value="no"><label for="rdWhatsAppNo">Do not send by WhatsApp</label>
<input type="radio" id="AccomodationHotel" name="Accommodation" value="Hotel"><label for="AccomodationHotel">Commercial Accommodation</label><input type="radio" id="AccomodationResidency" name="Accommodation" value="Residential"><label for="AccomodationResidency">Residential or Relative</label>
${text('Name of Hotel','HotelName')}
<button type="submit">Next</button></form>`),
  insurance:a=>page('Insurance',`${groupHeader(a.group)}<p>MEDICAL INSURANCE COVERAGE WITH A FEE OF (95.00 SAR)</p><form method="post"><input type="checkbox" id="chkInsurance" name="Insurance" value="1"><label for="chkInsurance">I accept the insurance</label><button type="submit">Next</button></form>`),
  terms:a=>page('Terms',`${groupHeader(a.group)}<p>Terms and conditions text…</p><form method="post"><input type="checkbox" id="chkTerms" name="Terms" value="1"><label for="chkTerms">I HAVE READ AND AGREE ALL THE ABOVE TERMS AND CONDITIONS.</label><button type="submit">Next</button></form>`),
  review:a=>{
   const members=a.group?[...site.apps.values()].filter(x=>x.group===a.group&&x.stage==='review'):[a];
   return page('Review',`${groupHeader(a.group)}<div>Application No.: ${a.number}</div>${reviewLines(a)}
<div>Total Applicants : ${members.length}</div>${members.map(m=>`<div>${esc(m.passport.PassportNo)} — ${esc(m.personal.FirstName)}</div>`).join('')}
<h3>Choose your payment method</h3><div>Total Amount ${(members.length*402.21).toFixed(2)} SAR</div>
${a.group?`<a id="btnAddMoreToGroup" href="/Visa/PersonalInfo?gName=${encodeURIComponent(a.group)}">Save &amp; Add Applicant</a>`:''}
<button type="button" id="btnPay" onclick="fetch('/__pay',{method:'POST'})">AGREE &amp; COMPLETE PAYMENT</button>`);
  },
 };
 const html=body=>({status:200,contentType:'text/html; charset=utf-8',body});
 // Playwright does not route the follow-up of a fulfilled HTTP redirect, so the
 // mock redirects in the page instead (the real site uses 302s; both work).
 const redirect=location=>({status:200,contentType:'text/html',body:`<!doctype html><script>location.replace(${JSON.stringify(location)})</script>`});

 async function handle(route){
  const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();
  if(path==='/__pay'){site.payClicks++;return route.fulfill({status:204})}
  if(path==='/favicon.ico')return route.fulfill({status:404});
  if(assets[path])return route.fulfill({status:200,contentType:'text/javascript',body:assets[path]});
  if(site.rateLimited)return route.fulfill({status:429,contentType:'text/html',body:page('Error 1015','<p>You are being rate limited</p><p>Ray ID: a3c79bcf2994eec9</p>')});
  if(path.startsWith('/Login')){if(method==='POST'){site.loggedIn=true;return route.fulfill(redirect('/Visa/Index'))}return route.fulfill(html(routes.login()))}
  if(!site.loggedIn)return route.fulfill(redirect('/Login'));
  if(path==='/Visa/Index'||path==='/')return route.fulfill(html(routes.index()));
  if(path==='/Visa/PersonalInfo'){
   const group=url.searchParams.get('gName')||'';
   if(method==='GET'){if(site.latency[path])await new Promise(r=>setTimeout(r,site.latency[path]));return route.fulfill(html(routes.personal(group)))}
   const {fields,files}=parseForm(request);site.posts.push({path,fields,files});
   if(!fields.Q1||!fields.FirstName||!files.Picture?.jpeg)return route.fulfill(html(routes.personal(group).replace('<form','<p class="error">Please complete all required fields.</p><form')));
   const id=randomUUID(),a={id,number:String(++site.next),group,stage:'passport',portrait:files.Picture,personal:{...fields,BirthDate:fields.BirthDate},passport:{}};
   site.apps.set(id,a);if(group)site.groups.set(group,[...(site.groups.get(group)||[]),id]);
   return route.fulfill(redirect('/Visa/PassportInfo/'+id));
  }
  const m=path.match(/^\/(Visa\/PassportInfo|Insurance\/ChooseInsurance|Visa\/Terms|Visa\/Review)\/([0-9a-f-]{36})$/);
  const a=m&&site.apps.get(m[2]);
  if(!a)return route.fulfill({status:404,contentType:'text/html',body:page('Not found','')});
  const kind=m[1].split('/').pop();
  if(method==='GET')return route.fulfill(html({PassportInfo:routes.passport,ChooseInsurance:routes.insurance,Terms:routes.terms,Review:routes.review}[kind](a)));
  const {fields}=parseForm(request);site.posts.push({path,fields});
  if(kind==='PassportInfo'){
   if(!fields.PassportNo||!fields.Purpose||fields.EmailNotify!=='no'||fields.WhatsApp!=='no')return route.fulfill(html(routes.passport(a).replace('<form','<p class="error">Required.</p><form')));
   a.passport=fields;a.stage='insurance';return route.fulfill(redirect('/Insurance/ChooseInsurance/'+a.id));
  }
  if(kind==='ChooseInsurance'){if(fields.Insurance!=='1')return route.fulfill(html(routes.insurance(a)));a.stage='terms';return route.fulfill(redirect('/Visa/Terms/'+a.id))}
  if(kind==='Terms'){if(fields.Terms!=='1')return route.fulfill(html(routes.terms(a)));a.stage='review';return route.fulfill(redirect('/Visa/Review/'+a.id))}
  return route.fulfill({status:405});
 }
 return {site,handle,iso,dmy};
}
