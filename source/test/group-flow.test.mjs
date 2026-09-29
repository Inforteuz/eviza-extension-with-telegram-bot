import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareGroup} from '../agent/group-visa.mjs';
import {scriptDomOperation} from '../agent/userscript-dom.mjs';

const origin='https://visa.visitsaudi.com';
function fixture({size=3,completed=0,failAdd=false,nationality='Uzbekistan'}={}){
 const members=Array.from({length:size},(_,i)=>({id:'member-'+i,group_confirmation:'confirmed-'+i,data:{firstName:'TEST'+i,middleName:'MIDDLE',lastName:'APPLICANT',gender:'Female',maritalStatus:'Married',profession:'None',birthDate:'1970-01-01',birthCountry:'Uzbekistan',birthCity:'ANDIJAN REGION',nationality,residenceCountry:'Uzbekistan',city:'Andijan',address:'Andijan',postalCode:'',passportNumber:'ZZ000000'+i,passportIssuePlace:'Uzbekistan',issueDate:'2024-01-01',expiryDate:'2034-01-01',travelDate:'2026-09-17',departureDate:'2027-09-16',visitPurpose:'Umrah',accommodationType:'Hotel',accommodationName:'Al Jabriy'}}));
 const uuid=i=>'11111111-1111-1111-1111-'+String(i+1).padStart(12,'0');
 const number=i=>'2609172111850'+String(i+1).padStart(2,'0');
 const review=i=>origin+'/Visa/Review/'+uuid(i),personal=origin+'/Visa/PersonalInfo?gName=test';
 let current=Math.max(0,completed-1),created=completed,url=origin+'/Visa/Index',values=new Map(),checks=new Map(),added=0,pays=0,portraitIds=[],notes=[];
 const checkpoint={entryUrl:personal,phase:'collect',name:'test',members:{}};
 for(let i=0;i<completed;i++)checkpoint.members[members[i].id]={phase:'complete',confirmation:members[i].group_confirmation,currentUrl:review(i),visaId:uuid(i),applicationNumber:number(i),proof:{checkedFields:23}};
 if(completed)checkpoint.currentUrl=review(completed-1);
 const group={id:'group-fixture',name:'test',job_type:'group',members,checkpoint};
 const stage=()=>new URL(url).pathname.split('/')[2];
 const text=()=>{
  const a=members[current].data;
  const pairs=[['First Name or Given Name (English)',a.firstName],['Father Name or Middle Name (English)',a.middleName],['Last Name or Family Name (English)',a.lastName],['Gender',a.gender],['Marital Status',a.maritalStatus],['Profession',a.profession],['Date of Birth','01/01/1970'],['Country of Birth',a.birthCountry],['City of Birth',a.birthCity],['Country of Nationality',a.nationality],['Country',a.residenceCountry],['City',a.city],['Zip/Postal Code',''],['Address',a.address],['Passport Type','Regular Passport'],['Passport No.',a.passportNumber],['Passport Issue Place (Country or City)',a.passportIssuePlace],['Passport Issue Date','01/01/2024'],['Passport Expiry Date','01/01/2034'],['Expected Date of Arrival','17/09/2026'],['Expected Date of Departure','16/09/2027'],['Additional Purpose of Visit',a.visitPurpose],['Residence Address in Saudi Arabia','Commercial Accommodation'],['Name of Hotel',a.accommodationName]];
  return 'Group Name : test\nApplication No.: '+number(current)+'\nTotal Applicants :'+created+'\n'+(stage()==='Review'?pairs.flat().join('\n')+'\n'+members.slice(0,created).map(m=>m.data.passportNumber).join('\n')+'\nChoose your payment method\nTotal Amount '+(created*402.21).toFixed(2)+' SAR':'FEE OF (95.00 SAR)');
 };
 const choose=key=>({isChecked:async()=>!!checks.get(key),dispatchEvent:async()=>checks.set(key,!checks.get(key)),check:async()=>checks.set(key,true)});
 const next=async()=>{
  if(stage()==='PersonalInfo'){created++;url=origin+'/Visa/PassportInfo/'+uuid(current)}
  else if(stage()==='PassportInfo')url=origin+'/Insurance/ChooseInsurance/'+uuid(current);
  else if(stage()==='ChooseInsurance')url=origin+'/Visa/Terms/'+uuid(current);
  else if(stage()==='Terms')url=review(current);
  else throw Error('Unexpected Next on '+url);
 };
 const page={
  url:()=>url,
  goto:async target=>{url=target;const i=members.findIndex((_,i)=>target.endsWith(uuid(i)));if(i>=0)current=i;else if(stage()==='PersonalInfo')current=created},
  snapshot:async()=>({text:text(),controls:stage()==='Review'?[{tag:'button',id:'btnPay',text:'AGREE & COMPLETE PAYMENT'},{tag:'button',id:'btnAddMoreToGroup',text:'Save & Add Applicant'}]:[]}),
  waitForURL:async matcher=>{if(typeof matcher==='function')assert.ok(matcher(new URL(url)));else if(matcher.includes('*'))assert.match(url,/\/Visa\/PassportInfo\//);else assert.equal(url,matcher)},
  locator:selector=>{
   if(selector==='body')return {innerText:async()=>text()};
   if(selector==='#AttachmentPersonalPicture')return {setInputFiles:async path=>{assert.equal(path,'portrait-'+members[current].id);portraitIds.push(members[current].id)}};
   if(selector==='#btnPay')return {isVisible:async()=>stage()==='Review',innerText:async()=> 'AGREE & COMPLETE PAYMENT',click:async()=>{pays++;throw Error('Must never pay')}};
   if(selector==='#btnAddMoreToGroup')return {count:async()=>1,click:async()=>{assert.equal(stage(),'Review');added++;if(failAdd)throw Error('navigation uncertain');assert.ok(created<size,'must not add after last applicant');current=created;url=personal+'&gid=observed-group';values=new Map();checks=new Map()}};
   return choose(selector);
  },
  getByRole:(role,{name}={})=>{
   if(role==='link'&&name==='Apply For Individual')return {isVisible:async()=>stage()==='Index'};
   if(role==='button'&&name==='Next')return {click:next};
   if(role==='checkbox'&&name instanceof RegExp)return {...choose('terms'),isVisible:async()=>stage()==='Terms'};
   if(role==='checkbox'||role==='radio')return choose(name);
   if(role==='combobox')return {selectOption:async({label})=>{if(['Country of Nationality','Country of Birth','Country'].includes(name))assert.equal(label,'Uzbekistan','must match the actual country option');values.set(name,label)},locator:()=>({innerText:async()=>values.get(name)})};
   if(role==='textbox')return {inputValue:async()=>values.get(name)||'',isEditable:async()=>true,fill:async value=>values.set(name,value),pressSequentially:async value=>values.set(name,(values.get(name)||'')+value),press:async()=>{}};
   throw Error('Unexpected locator '+role+' '+String(name));
  }
 };
 const callbacks={progress:async p=>notes.push(p.note),checkpoint:async cp=>{group.checkpoint=structuredClone(cp)},portraitFor:async m=>'portrait-'+m.id};
 return {group,page,callbacks,state:{set:()=>{}},stats:()=>({added,pays,portraitIds,notes,created}),run:()=>prepareGroup(page,group,{set:()=>{}},callbacks)};
}

test('a three-person group repeats Save & Add twice, fills each new applicant and stops before payment',async()=>{
 const f=fixture(),result=await f.run();
 assert.equal(result.status,'payment_ready');assert.equal(result.paymentEvidence.memberCount,3);
 assert.equal(result.paymentEvidence.totalSAR,'1206.63');assert.equal(result.paymentEvidence.paymentNotClicked,true);
 assert.deepEqual(f.stats().portraitIds,['member-0','member-1','member-2']);assert.equal(f.stats().added,2);assert.equal(f.stats().pays,0);
 assert.equal(Object.values(f.group.checkpoint.members).filter(m=>m.phase==='complete').length,3);
});
test('resuming after the first review adds only remaining people and does not recreate the saved applicant',async()=>{
 const f=fixture({completed:1}),original=structuredClone(f.group.checkpoint.members['member-0']);
 assert.equal((await f.run()).status,'payment_ready');assert.deepEqual(f.group.checkpoint.members['member-0'],original);
 assert.deepEqual(f.stats().portraitIds,['member-1','member-2']);assert.equal(f.stats().added,2);assert.equal(f.stats().created,3);
});
test('an uncertain Add click is checkpointed and never repeated automatically',async()=>{
 const f=fixture({completed:1,failAdd:true});await assert.rejects(f.run(),/navigation uncertain/);
 assert.equal(f.group.checkpoint.adding,'member-1');assert.equal(f.stats().added,1);
 await assert.rejects(f.run(),/avval bosilgan/);assert.equal(f.stats().added,1);assert.equal(f.stats().pays,0);
});
test('a one-person group never opens an extra applicant',async()=>{
 const f=fixture({size:1});assert.equal((await f.run()).status,'payment_ready');assert.equal(f.stats().added,0);assert.equal(f.stats().pays,0);
});
test('userscript allows the observed Save & Add control and still rejects payment, discard and generic save',t=>{
 const originals={document:globalThis.document,location:globalThis.location,getComputedStyle:globalThis.getComputedStyle};
 t.after(()=>{for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}});
 const element={id:'btnAddMoreToGroup',type:'button',tagName:'BUTTON',textContent:'Save & Add Applicant',getAttribute:()=>null,closest:()=>null,getClientRects:()=>[{}],matches:()=>false};
 globalThis.location={pathname:'/Visa/Review/fixture',origin};globalThis.getComputedStyle=()=>({visibility:'visible'});
 globalThis.document={body:{innerText:'Review application'},querySelector:()=>null,querySelectorAll:selector=>selector==='#add'?[element]:[]};
 const command={action:'element',selector:[{css:'#add'}],operation:'click'};
 assert.equal(scriptDomOperation(command).click,element);
 for(const name of ['AGREE & COMPLETE PAYMENT','Save & Add Applicant and Pay','DISCARD','SAVE']){element.textContent=name;assert.throws(()=>scriptDomOperation(command))}
 element.textContent='Save & Add Applicant';element.id='btnPay';assert.throws(()=>scriptDomOperation(command),/To‘lov/);
});


test('uppercase OCR nationality passes the actual country option through every group member without changing data',async()=>{
 const f=fixture({nationality:'UZBEKISTAN'}),original=f.group.members.map(m=>structuredClone(m.data));
 assert.equal((await f.run()).status,'payment_ready');assert.equal(f.stats().added,2);assert.equal(f.stats().pays,0);
 assert.deepEqual(f.group.members.map(m=>m.data),original);
});
