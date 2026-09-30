import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForLogin,waitAfterSubmit,Attention,pickDate,setChoice,fillPassport,fillInsurance,fillTerms,verifyReview,paymentReady} from '../src/flow/visa.js';
import {visaDiagnostics} from '../src/flow/diagnostics.js';

test('a queued job waits for manual login and continues without a second confirmation',async()=>{
 let url='https://visa.visitsaudi.com/Login',waited=0;
 const notes=[];
 const page={locator:()=>({innerText:async()=>''}),goto:async()=>{},url:()=>url,getByRole:()=>({isVisible:async()=>url.endsWith('/Visa/Index'),fill:async()=>{}}),waitForURL:async target=>{waited++;url=target}};
 await waitForLogin(page,{},async progress=>notes.push(progress));
 assert.equal(waited,1);assert.equal(notes.length,1);assert.equal(notes[0].step,'login');
 await waitForLogin(page,{},async progress=>notes.push(progress));
 assert.equal(waited,1);assert.equal(notes.length,1);
});
test('manual login timeout leaves the application awaiting authentication',async()=>{
 const page={locator:()=>({innerText:async()=>''}),goto:async()=>{},url:()=> 'https://visa.visitsaudi.com/Login',getByRole:()=>({fill:async()=>{}}),waitForURL:async()=>{throw Error('timeout')}};
 await assert.rejects(waitForLogin(page,{}),e=>e instanceof Attention&&e.status==='needs_auth');
});
test('bot diagnostics refuse unrelated sites and login pages before reading content',async()=>{
 let reads=0;
 for(const url of ['https://example.test/private','https://visa.visitsaudi.com/Login/OTPAuth','https://visa.visitsaudi.com.evil.test/Visa/PersonalInfo']){
  assert.equal(await visaDiagnostics({url:()=>url,evaluate:()=>{reads++;throw Error('must not read')}}),null);
 }
 assert.equal(reads,0);
 const report=await visaDiagnostics({url:()=> 'https://visa.visitsaudi.com/Visa/PersonalInfo',evaluate:async()=>({text:'TESTNAME PRIVATEPASSPORT',controls:[]})},{firstName:'TESTNAME',passportNumber:'PRIVATEPASSPORT'});
 assert.equal(report.text,'[applicant] [applicant]');
});

test('editable date inputs use keyboard events and preserve an already accepted date',async()=>{
 let value='',typed=0;
 const field={inputValue:async()=>value,isEditable:async()=>true,fill:async v=>{value=v},pressSequentially:async v=>{typed++;value+=v},press:async()=>{}};
 const page={getByRole:(role)=>{assert.equal(role,'textbox');return field}};
 await pickDate(page,'Date of Birth','1968-09-05');assert.equal(value,'05/09/1968');assert.equal(typed,1);
 await pickDate(page,'Date of Birth','1968-09-05');assert.equal(typed,1);
});
test('a date field that rejects input and never opens its calendar fails after bounded retries',async()=>{
 let attempts=0;
 const field={inputValue:async()=>'',isEditable:async()=>false,press:async()=>{},click:async()=>{attempts++}};
 const page={getByRole:role=>role==='textbox'?field:{waitFor:async()=>{throw Error('not visible')}}};
 await assert.rejects(pickDate(page,'Date of Birth','1968-09-05'),e=>e instanceof Attention&&e.status==='needs_review');
 assert.equal(attempts,3);
});

test('readonly calendar activates the actual day link without closing it on blur',async()=>{
 let value='',selection=[];
 const field={inputValue:async()=>value,isEditable:async()=>false,press:async()=>{},click:async()=>{}};
 const page={getByRole:(role,{name})=>{
  if(role==='textbox')return field;
  if(role==='combobox')return {waitFor:async()=>{},selectOption:async({label})=>{selection.push(label)}};
  assert.equal(role,'link');assert.equal(name,'5');return {dispatchEvent:async event=>{assert.equal(event,'click');value='05/09/1968'}};
 },waitForFunction:async()=>{}};
 await pickDate(page,'Date of Birth','1968-09-05');assert.equal(value,'05/09/1968');assert.deepEqual(selection,['1968','September']);
});

test('calendar with short month names and a narrow year list steps to the wanted year',async()=>{
 let value='',low=2016;const picks=[];
 const notFound=label=>Object.assign(new Attention('needs_input','Kerakli tanlov topilmadi: '+label),{code:'option_not_found'});
 const field={inputValue:async()=>value,isEditable:async()=>false,press:async()=>{},click:async()=>{}};
 const page={
  getByRole:(role,{name})=>{
   if(role==='textbox')return field;
   if(role==='link')return {dispatchEvent:async()=>{value='05/09/1968'}};
   if(name==='Change the year')return {waitFor:async()=>{},selectOption:async({label})=>{const y=Number(label);if(y<low||y>low+20)throw notFound(label);picks.push(label);low=y-10}};
   return {selectOption:async({label})=>{if(label.length>3)throw notFound(label);picks.push(label)}};
  },
  snapshot:async()=>({controls:[{label:'Change the year',options:Array.from({length:21},(_,i)=>({label:String(low+i)}))}]}),
  waitForFunction:async()=>{},
 };
 await pickDate(page,'Date of Birth','1968-09-05');
 assert.equal(value,'05/09/1968');assert.deepEqual(picks,['2016','2006','1996','1986','1976','1968','Sep']);
});

test('after Next a same-URL reload or an active-visa message ends the wait at once',async()=>{
 const url='https://visa.visitsaudi.com/Visa/PassportInfo/1';let doc='a',text='',polls=0;
 const page={url:()=>url,documentId:()=>doc,locator:()=>({innerText:async()=>{polls++;return text}})};
 let started=Date.now();setTimeout(()=>{doc='b'},30);
 await waitAfterSubmit(page,url,{interval:10});assert.ok(Date.now()-started<1000,'reloaded document');
 doc='c';started=Date.now();setTimeout(()=>{text='Sorry, you cannot create new visa request while your current visa 6174758631 is still valid for the same passport number, your current visa will expire on 30/09/2027'},30);
 await waitAfterSubmit(page,url,{interval:10});assert.ok(Date.now()-started<1000,'message on the same page');
 text='';await waitAfterSubmit(page,url,{interval:5,timeout:40});assert.ok(polls>2,'gives up after the timeout');
 const stopped=Object.assign(new Attention('stopped','stop'),{stopped:true});
 await assert.rejects(waitAfterSubmit({...page,locator:()=>({innerText:async()=>{throw stopped}})},url,{interval:5,timeout:100}),e=>e===stopped,'Stop is not swallowed');
});

test('custom choices toggle only when needed and reject an unaccepted change',async()=>{
 let checked=false,clicks=0;
 const field={isChecked:async()=>checked,dispatchEvent:async()=>{checked=!checked;clicks++}};
 await setChoice(field,true);assert.equal(checked,true);await setChoice(field,true);assert.equal(clicks,1);
 await setChoice(field,false);assert.equal(checked,false);assert.equal(clicks,2);
 await assert.rejects(setChoice({isChecked:async()=>false,dispatchEvent:async()=>{}},true),e=>e instanceof Attention);
});

test('passport step selects only Umrah and commercial accommodation, then verifies hotel and dates',async()=>{
 const values=new Map(),checks=new Map([['Event',true],['Family & Relatives',true],['Leisure',false],['Umrah',false]]);
 const radio=new Map([['#rdEmailNo',true],['#rdWhatsAppNo',true],['#AccomodationHotel',false]]);
 const choice=(map,key)=>({isChecked:async()=>!!map.get(key),dispatchEvent:async()=>map.set(key,!map.get(key))});
 const page={locator:id=>{assert.ok(radio.has(id));return choice(radio,id)},getByRole:(role,{name})=>{
  if(role==='checkbox')return choice(checks,name);
  if(role==='combobox')return {selectOption:async({label})=>values.set(name,label)};
  assert.equal(role,'textbox');
  if(name==='Name of Hotel')assert.equal(radio.get('#AccomodationHotel'),true);
  return {inputValue:async()=>values.get(name)||'',isEditable:async()=>true,fill:async value=>values.set(name,value),pressSequentially:async value=>values.set(name,(values.get(name)||'')+value),press:async()=>{}};
 }};
 await fillPassport(page,{passportNumber:'ZZ1234567',passportIssuePlace:'Uzbekistan',issueDate:'2024-12-06',expiryDate:'2034-12-05',travelDate:'2026-09-15',departureDate:'2027-09-14',visitPurpose:'Umrah',accommodationType:'Hotel',accommodationName:'Al Jabriy'});
 assert.deepEqual([...checks.entries()],[['Event',false],['Family & Relatives',false],['Leisure',false],['Umrah',true]]);
 assert.equal(values.get('Name of Hotel'),'Al Jabriy');assert.equal(values.get('Expected Date of Departure'),'14/09/2027');
 assert.equal(values.has('Address 1'),false);assert.equal(values.has('Email'),false);
});

test('insurance accepts the approved fee once and a changed fee requires review',async()=>{
 let url='https://visa.visitsaudi.com/Insurance/ChooseInsurance/123',checked=false,next=0;
 const page={url:()=>url,locator:selector=>selector==='body'?{innerText:async()=> 'BY CHECKING THIS BOX I AGREE TO THE INSURANCE COVERAGE LISTED ABOVE WITH A FEE OF (95.00 SAR)'}:{isChecked:async()=>checked,dispatchEvent:async()=>{checked=true}},getByRole:()=>({click:async()=>{assert.equal(checked,true);next++;url='https://visa.visitsaudi.com/Visa/Terms/123'}}),waitForURL:async()=>{}};
 await fillInsurance(page);assert.equal(next,1);
 page.locator=()=>({innerText:async()=> 'FEE OF (200.00 SAR)'});
 await assert.rejects(fillInsurance(page),e=>e instanceof Attention&&e.step==='insurance');assert.equal(next,1);
});
test('terms only checks the named agreement and Next, never a payment control',async()=>{
 let checked=false,url='https://visa.visitsaudi.com/Visa/Terms/123';
 const page={url:()=>url,getByRole:(role,{name})=>{
  if(role==='checkbox'){assert.match('I HAVE READ AND AGREE ALL THE ABOVE TERMS AND CONDITIONS.',name);return {isChecked:async()=>checked,dispatchEvent:async()=>{checked=true}}}
  assert.equal(role,'button');assert.equal(name,'Next');return {click:async()=>{assert.equal(checked,true);url='https://visa.visitsaudi.com/Visa/Review/123'}};
 },waitForURL:async()=>{}};
 await fillTerms(page);assert.match(url,/Review/);
});

const reviewApplicant={firstName:'TEST',middleName:'MIDDLE',lastName:'APPLICANT',gender:'Female',maritalStatus:'Married',profession:'None',birthDate:'1968-09-05',birthCountry:'Uzbekistan',birthCity:'ANDIJAN REGION',nationality:'Uzbekistan',residenceCountry:'Uzbekistan',city:'Andijan',address:'Andijan',postalCode:'',passportNumber:'ZZ1234567',passportIssuePlace:'Uzbekistan',issueDate:'2024-12-06',expiryDate:'2034-12-05',travelDate:'2026-09-15',departureDate:'2027-09-14',visitPurpose:'Umrah',accommodationType:'Hotel',accommodationName:'Al Jabriy'};
const reviewText=`Application No.: 123456789012345\nTotal Applicants :1\nFirst Name or Given Name (English)\nTEST\nFather Name or Middle Name (English)\nMIDDLE\nLast Name or Family Name (English)\nAPPLICANT\nGender\nFemale\nMarital Status\nMarried\nProfession\nNone\nDate of Birth\n05/09/1968\nCountry of Birth\nUzbekistan\nCity of Birth\nANDIJAN REGION\nCountry of Nationality\nUzbekistan\nCurrent Residence Address\nCountry\nUzbekistan\nCity\nAndijan\nZip/Postal Code\n\nAddress\nAndijan\nPassport Type\nRegular Passport\nPassport No.\nZZ1234567\nPassport Issue Place (Country or City)\nUzbekistan\nPassport Issue Date\n06/12/2024\nPassport Expiry Date\n05/12/2034\nExpected Date of Arrival\n15/09/2026\nExpected Date of Departure\n14/09/2027\nAdditional Purpose of Visit\nUmrah\nResidence Address in Saudi Arabia\nCommercial Accommodation\nName of Hotel\nAl Jabriy\nChoose your payment method\nTotal Amount 402.21 SAR`;
test('payment handoff compares every required summary field and stops before the payment button',async()=>{
 let clicks=0;
 const page={url:()=> 'https://visa.visitsaudi.com/Visa/Review/12345678-1234-1234-1234-123456789012',locator:selector=>{if(selector==='body')return {innerText:async()=>reviewText};assert.equal(selector,'#btnPay');return {innerText:async()=> 'Agree & Complete Payment',isVisible:async()=>true,click:async()=>{clicks++}}}};
 const result=await paymentReady(page,{data:reviewApplicant},'123456789012345');
 assert.equal(result.status,'payment_ready');assert.equal(result.paymentEvidence.totalSAR,'402.21');assert.equal(result.paymentEvidence.checkedFields,23);assert.equal(clicks,0);
 for(const [good,bad] of [['ZZ1234567','ZZ1234568'],['14/09/2027','14/09/2026'],['Umrah','Event'],['Al Jabriy','Wrong hotel'],['Total Applicants :1','Total Applicants :2'],['123456789012345','999999999999999']])assert.throws(()=>verifyReview(reviewText.replace(good,bad),reviewApplicant,'123456789012345'),Attention);
 await assert.rejects(paymentReady({...page,url:()=> 'https://visa.visitsaudi.com/Visa/Index'},{data:reviewApplicant},'123456789012345'),Attention);
 await assert.rejects(paymentReady({...page,locator:selector=>selector==='body'?{innerText:async()=>reviewText}:{isVisible:async()=>false}},{data:reviewApplicant},'123456789012345'),Attention);
});

test('personal country options accept document capitals and codes while preserving confirmed data',async()=>{
 const {fillPersonal,countryOption}=await import('../src/flow/visa.js');
 assert.equal(countryOption(' uzb '),'Uzbekistan');assert.equal(countryOption('UZBEKISTAN'),'Uzbekistan');assert.equal(countryOption('Kazakhstan'),'Kazakhstan');assert.equal(countryOption('TURKMENISTAN'),'TURKMENISTAN');assert.equal(countryOption(''),'');
 for(const country of ['UZBEKISTAN',' uzbekistan ','UZB','Uzbekistan']){
  const a=Object.freeze({...reviewApplicant,nationality:country,birthCountry:country,residenceCountry:country}),values=new Map();let uploads=0;
  const page={locator:selector=>{assert.equal(selector,'#AttachmentPersonalPicture');return {setInputFiles:async p=>{assert.equal(p,'fixture.jpg');uploads++}}},getByRole:(role,{name})=>{
   if(role==='radio')return {check:async()=>{}};
   if(role==='combobox')return {selectOption:async({label})=>{if(name.startsWith('Country'))assert.equal(label,'Uzbekistan');values.set(name,label)},locator:()=>({innerText:async()=>values.get(name)})};
   return {inputValue:async()=>values.get(name)||'',isEditable:async()=>true,fill:async v=>values.set(name,v),pressSequentially:async v=>values.set(name,(values.get(name)||'')+v),press:async()=>{}};
  }};
  await fillPersonal(page,a,'fixture.jpg');assert.equal(a.nationality,country);assert.equal(uploads,1);assert.equal(values.get('First Name or Given Name (English)'),a.firstName);
 }
});

test('unavailable nationality reports the exact blocked field without guessing a country or saving a form',async()=>{
 const {fillPersonal}=await import('../src/flow/visa.js');let attempted;
 const page={getByRole:role=>role==='radio'?{check:async()=>{}}:{selectOption:async({label})=>{attempted=label;throw Object.assign(Error('option timeout'),{name:'TimeoutError'})}},locator:()=>{throw Error('must not upload')}};
 await assert.rejects(fillPersonal(page,{...reviewApplicant,nationality:'UNKNOWN'},'fixture.jpg'),e=>e instanceof Attention&&e.status==='needs_input'&&e.message.includes('Country of Nationality')&&e.message.includes('UNKNOWN'));
 assert.equal(attempted,'UNKNOWN');
});

test('an already visible dashboard is reused without navigation; unrelated routes still require login verification',async()=>{
 const {ensureLogin}=await import('../src/flow/visa.js');let url='https://visa.visitsaudi.com/Visa/Index',navigations=0;
 const page={url:()=>url,locator:()=>({innerText:async()=> 'Welcome'}),getByRole:(role,{name})=>{assert.equal(role,'link');assert.equal(name,'Apply For Individual');return {isVisible:async()=>url.endsWith('/Visa/Index')}},goto:async target=>{navigations++;url=target}};
 await ensureLogin(page,{});assert.equal(navigations,0);
 url='https://visa.visitsaudi.com/Visa/Review/existing';await ensureLogin(page,{});assert.equal(navigations,1);
});

test('correct text values are not cleared or typed again, but changed values still use verified input events',async()=>{
 const {typeName}=await import('../src/flow/visa.js');let value='Al Jabriy',clears=0,typed=0;
 const page={getByRole:()=>({inputValue:async()=>value,fill:async v=>{clears++;value=v},pressSequentially:async v=>{typed++;value+=v}})};
 await typeName(page,'Name of Hotel','Al Jabriy');assert.equal(clears,0);assert.equal(typed,0);
 await typeName(page,'Name of Hotel','Confirmed Hotel');assert.equal(value,'Confirmed Hotel');assert.equal(clears,1);assert.equal(typed,1);
});
