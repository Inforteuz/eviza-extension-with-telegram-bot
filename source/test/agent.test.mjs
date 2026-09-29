import test from 'node:test';import assert from 'node:assert/strict';
import {parseMrz,checksum} from '../agent/mrz.mjs';import {extractOtp} from '../agent/gmail.mjs';
import {blankApplicant,missingFields,validDate,paymentUrl,applicantSuggestions,cleanApplicant,cleanTripDefaults,officialDraftUrl,defaultTripDates,applyPreparationDefaults,countryForBirthplace,operatorTripTemplate,applicantPreview} from '../lib/domain.ts';
import {readBirthplace,readPrintedDetails} from '../agent/passport-text.mjs';
import {preparePassport} from '../agent/prepare-passport.mjs';
test('suggestions leave confirmed facts intact and handle birthdays and unspecified threshold ages',()=>{
 const a={...blankApplicant,gender:'Female',birthDate:'2005-09-16',birthCity:'ANDIJAN REGION',nationality:'UZB'};
 assert.equal(applicantSuggestions(a,'2026-09-15').find(s=>s.field==='maritalStatus'),undefined);
 assert.equal(applicantSuggestions(a,'2026-09-16').find(s=>s.field==='maritalStatus').value,'Married');
 assert.equal(applicantSuggestions({...a,birthDate:'2007-09-16'},'2026-09-15').find(s=>s.field==='maritalStatus').value,'Single');
 assert.equal(applicantSuggestions({...a,gender:'Male',birthDate:'2004-09-15'},'2026-09-15').find(s=>s.field==='maritalStatus'),undefined);
 assert.equal(applicantSuggestions({...a,gender:'Male',birthDate:'2003-09-15'},'2026-09-15').find(s=>s.field==='maritalStatus').value,'Married');
 assert.equal(applicantSuggestions({...a,gender:'Male',birthDate:'2005-09-15'},'2026-09-15').find(s=>s.field==='maritalStatus').value,'Single');
 assert.equal(applicantSuggestions({...a,gender:'Male',birthDate:'2003-09-16'},'2026-09-15').find(s=>s.field==='maritalStatus'),undefined);
 assert.equal(applicantSuggestions({...a,gender:'',lastName:'TESTOVA'},'2026-09-15').some(s=>['gender','maritalStatus'].includes(s.field)),false);
 assert.equal(applicantSuggestions({...a,birthDate:'2005-02-30'},'2026-09-15').some(s=>s.field==='maritalStatus'),false);
 const existing={...a,maritalStatus:'Divorced',profession:'Teacher',residenceCountry:'France',city:'Paris',address:'Confirmed address'};
 assert.deepEqual(applicantSuggestions(existing,'2026-09-15'),[]);
 assert.equal(a.maritalStatus,'');assert.equal(a.city,'');
 assert.equal(cleanApplicant({...a,postalCode:'123'}).postalCode,'');
});
test('the template fills trip details and recognized birthplace without inventing personal facts',()=>{
 const a=applyPreparationDefaults({...blankApplicant,nationality:'Uzbekistan',birthCity:'ANDIJAN REGION',gender:'Female',birthDate:'1970-01-01'},operatorTripTemplate,'2026-09-15');
 assert.equal(a.visitPurpose,'Umrah');assert.equal(a.accommodationName,'Al Jabriy');assert.equal(a.departureDate,'2027-09-14');assert.equal(a.birthCountry,'Uzbekistan');
 assert.equal(a.maritalStatus,'');assert.equal(a.profession,'');assert.equal(a.address,'');
 assert.equal(applicantPreview(a).data.profession,'None');assert.equal(a.profession,'');
 assert.equal(countryForBirthplace('MOSCOW'),'');assert.equal(countryForBirthplace('TOSHKENT VILOYATI'),'Uzbekistan');
 assert.equal(applyPreparationDefaults({...a,birthCity:'MOSCOW',birthCountry:''},operatorTripTemplate).birthCountry,'');
 const existing=applyPreparationDefaults({...a,visitPurpose:'Event',accommodationType:'Residential',accommodationName:''},operatorTripTemplate);
 assert.equal(existing.visitPurpose,'Event');assert.equal(existing.accommodationName,'');
});
test('portrait is saved even if the OCR service fails; existing portraits and personal facts survive',async()=>{
 let saved=0;const a={...blankApplicant,profession:'Teacher',maritalStatus:'Divorced'};
 const handlers={tripDefaults:operatorTripTemplate,readPassport:async()=>{throw Error('OCR unavailable')},cropPortrait:async()=>Buffer.from('fixture'),savePortrait:async()=>{saved++}};
 const result=await preparePassport({data:a,portrait:false},Buffer.from('input'),handlers);
 assert.equal(saved,1);assert.equal(result.portraitReady,true);assert.equal(result.data.accommodationType,'Hotel');assert.equal(result.data.profession,'Teacher');assert.equal(result.data.maritalStatus,'Divorced');
 assert.equal(missingFields(result.data,result.portraitReady).includes('200 × 200 portret'),false);
 await preparePassport({data:a,portrait:true},Buffer.from('input'),handlers);assert.equal(saved,1);
 const failed=await preparePassport({data:a,portrait:false},Buffer.from('input'),{...handlers,savePortrait:async()=>{throw Error('upload failed')}});assert.equal(failed.portraitReady,false);
});
test('printed birthplace and issue date use their own labels, including two-column passport text',()=>{
 const details=readPrintedDetails("FAMILIYASI / SURNAME\nTESTOVA\nISMI / GIVEN NAMES\nANNA\nOTASINING ISMI / FATHER'S NAME\nTESTOVNA\nFUQAROLIGI / NATIONALITY\nUZBEKISTAN\nJINSI / SEX TUGILGAN JOYI / PLACE OF BIRTH 2\nF | ANDIJAN REGION\nDATE OF ISSUE / AUTHORITY\n06 12 2024 MIA 1234\nDATE OF EXPIRY\n05 12 2034");
 assert.equal(details.middleName,'TESTOVNA');assert.equal(details.birthCity,'ANDIJAN REGION');assert.equal(details.issueDate,'2024-12-06');assert.equal(details.nationality,'Uzbekistan');
 assert.equal(readPrintedDetails('DATE OF ISSUE\nDATE OF EXPIRY\n05 12 2034').issueDate,undefined);
 assert.equal(readPrintedDetails('DATE OF ISSUE\n31 02 2024').issueDate,undefined);
 assert.equal(readPrintedDetails('SURNAME XXX\n\nTESTOVA\n\nDATE OF ISSUE\n\n; 06 12 2024 MIA 1234').issueDate,'2024-12-06');
 assert.equal(readPrintedDetails('SURNAME XXX\n\nTESTOVA').lastName,'TESTOVA');
 assert.equal(readBirthplace('PLACE OF BIRTH o\n\nF | ANDIJAN REGION'),'ANDIJAN REGION');
});
test('birthplace requires its printed label and cannot swallow the next passport field',()=>{
 assert.equal(readBirthplace('PLACE OF BIRTH\nANDIJAN REGION\nDATE OF ISSUE'), 'ANDIJAN REGION');
 assert.equal(readBirthplace('PLACE OF BIRTH: TASHKENT CITY'),'TASHKENT CITY');
 assert.equal(readBirthplace('ANDIJAN REGION\nNATIONALITY UZBEKISTAN'),'');
 assert.equal(readBirthplace('PLACE OF BIRTH\nDATE OF ISSUE'),'');
 assert.equal(readBirthplace('PLACE OF BIRTH\n08 07 1971'),'');
});
test('reads ICAO TD3 sample with valid checksums',()=>{const parsed=parseMrz('P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10');assert.equal(parsed.lastName,'ERIKSSON');assert.equal(parsed.firstName,'ANNA');assert.equal(parsed.birthDate,'1974-08-12');});
test('damaged passport digit never silently accepted',()=>{assert.throws(()=>parseMrz('P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C46UTO7408122F1204159ZE184226B<<<<<10'))});
test('country fields outside MRZ checksums still reject numeric OCR substitutions',()=>{assert.throws(()=>parseMrz('P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36U2B7408122F1204159ZE184226B<<<<<10'))});
test('a nationality OCR substitution requires independent printed evidence and a matching issuing state',()=>{
 const mrz='P<UZBERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36U2B7408122F1204159ZE184226B<<<<<10';
 assert.throws(()=>parseMrz(mrz));assert.throws(()=>parseMrz(mrz,{printedNationality:'France'}));
 assert.equal(parseMrz(mrz,{printedNationality:'Uzbekistan'}).nationality,'Uzbekistan');
 assert.equal(parseMrz(mrz,{printedNationality:'Uzbekistan'}).passportIssuePlace,'Uzbekistan');
});
test('dates and incomplete applications are blocked',()=>{assert.equal(validDate('2025-02-29'),false);assert.equal(validDate('2024-02-29'),true);assert.ok(missingFields(blankApplicant,false).includes('Oilaviy holati'));assert.equal(paymentUrl('https://attacker.test/Visa/Payment'),false);assert.equal(paymentUrl('javascript:alert(1)'),false);});
test('trip defaults exclude identity and require real trip dates and accommodation fields',()=>{
 const trip={travelDate:'2026-10-01',departureDate:'2026-10-14',visitPurpose:'Umrah',accommodationType:'Hotel',accommodationName:'TEST HOTEL'};
 assert.equal(cleanTripDefaults({...trip,passportNumber:'PRIVATE'}).passportNumber,undefined);
 assert.equal(cleanTripDefaults(trip).departureDate,'2026-10-14');
 const hotel=missingFields({...blankApplicant,...trip},true);assert.equal(hotel.includes('Saudiyadagi shahar'),false);
 assert.ok(missingFields({...blankApplicant,...trip,accommodationType:'Residential'},true).includes('Saudiyadagi shahar'));
 assert.ok(missingFields({...blankApplicant,...trip,departureDate:'2026-09-01'},true).includes('Chiqish sanasi kirishdan oldin'));
});
test('checkpoint accepts only observed official draft pages',()=>{
 const path='/Visa/PassportInfo/12345678-1234-1234-1234-123456789012';assert.equal(officialDraftUrl('https://visa.visitsaudi.com'+path),true);
 for(const url of ['https://attacker.test'+path,'https://visa.visitsaudi.com.evil.test'+path,'https://visa.visitsaudi.com'+path+'?next=https://evil.test','http://visa.visitsaudi.com'+path,'https://visa.visitsaudi.com/Login'])assert.equal(officialDraftUrl(url),false);
});
test('OTP checks sender, request time and replay',()=>{const m={id:'x',internalDate:'10000',payload:{headers:[{name:'From',value:'Saudi <visa@example.com>'}],body:{data:Buffer.from('Verification code: 123456').toString('base64url')}}};assert.equal(extractOtp(m,{sender:'visa@example.com',after:9000}), '123456');assert.equal(extractOtp(m,{sender:'evil@example.com',after:9000}),null);assert.equal(extractOtp(m,{sender:'visa@example.com',after:11000}),null);assert.equal(extractOtp(m,{sender:'visa@example.com',after:9000,used:['x']}),null)});
import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';import {claimSql,expireSql} from '../lib/queue-sql.ts';
test('only one applicant per account runs; expired work is reviewed, never blindly replayed',()=>{const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../drizzle/0000_tiny_starhawk.sql',import.meta.url),'utf8'));const insert=db.prepare('INSERT INTO applications(id,owner,source,data,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)');insert.run('a','owner','web','{}','queued',1,1);insert.run('b','owner','web','{}','queued',2,2);insert.run('c','other','web','{}','queued',1,1);assert.equal(db.prepare(claimSql).get('lease-a',100,0,'owner','owner').id,'a');assert.equal(db.prepare(claimSql).get('lease-b',100,0,'owner','owner'),undefined);assert.equal(db.prepare(claimSql).get('lease-c',100,0,'other','other').id,'c');db.prepare(expireSql).run(101,'owner',101);assert.equal(db.prepare('SELECT status FROM applications WHERE id=?').get('a').status,'needs_review');assert.equal(db.prepare(claimSql).get('lease-b',200,101,'owner','owner').id,'b');db.close()});

import {activeVisaMessage,gmailConnectionConfigured,ensureLogin,Attention} from '../agent/visa.mjs';
test('Gmail automation requires a sender and a complete configured connection',()=>{
 assert.equal(gmailConnectionConfigured({}),false);
 assert.equal(gmailConnectionConfigured({GMAIL_OTP_SENDER:'sender@example.com',GMAIL_APP_PASSWORD:'saved'}),false);
 assert.equal(gmailConnectionConfigured({GMAIL_OTP_SENDER:'sender@example.com',GMAIL_EMAIL:'user@example.com',GMAIL_APP_PASSWORD:'saved'}),true);
 assert.equal(gmailConnectionConfigured({GMAIL_OTP_SENDER:'sender@example.com',GMAIL_CLIENT_ID:'id',GMAIL_CLIENT_SECRET:'secret',GMAIL_REFRESH_TOKEN:'refresh'}),true);
});
test('without Gmail, an OTP page immediately requests manual login without sending another code',async()=>{
 const old=process.env.GMAIL_OTP_SENDER;delete process.env.GMAIL_OTP_SENDER;let interacted=false;
 try{await assert.rejects(ensureLogin({locator:()=>({innerText:async()=>''}),goto:async()=>{},url:()=> 'https://visa.visitsaudi.com/Login/OTPAuth',getByRole:()=>{interacted=true;throw Error('Unexpected interaction')}},{}),e=>e instanceof Attention&&e.status==='needs_auth'&&e.step==='login'&&e.message.includes('/saudi'));assert.equal(interacted,false);}finally{if(old===undefined)delete process.env.GMAIL_OTP_SENDER;else process.env.GMAIL_OTP_SENDER=old}
});
test('confirmed departure rule is a calendar year minus one day',()=>{assert.deepEqual(defaultTripDates('2026-09-15'),{travelDate:'2026-09-15',departureDate:'2027-09-14'});assert.equal(defaultTripDates('2027-12-31').departureDate,'2028-12-30');assert.equal(defaultTripDates('2028-02-29').departureDate,'2029-02-27');});
test('an existing valid visa stops new application processing',()=>{assert.match(activeVisaMessage('Sorry, you cannot create new visa request while your current visa 1234567890 is still valid for the same passport number, your current visa will expire on 23/10/2026'),/23\/10\/2026/);assert.equal(activeVisaMessage('Medical Insurance'),'');});
