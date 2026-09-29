import test from 'node:test';
import assert from 'node:assert/strict';
import {blankApplicant,missingFields,validDate,paymentUrl,applicantSuggestions,cleanApplicant,cleanTripDefaults,officialDraftUrl,defaultTripDates,applyPreparationDefaults,countryForBirthplace,operatorTripTemplate,applicantPreview} from '../src/lib/domain.js';
import {activeVisaMessage,ensureLogin,Attention} from '../src/flow/visa.js';
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
test('confirmed departure rule is a calendar year minus one day',()=>{assert.deepEqual(defaultTripDates('2026-09-15'),{travelDate:'2026-09-15',departureDate:'2027-09-14'});assert.equal(defaultTripDates('2027-12-31').departureDate,'2028-12-30');assert.equal(defaultTripDates('2028-02-29').departureDate,'2029-02-27');});
test('an existing valid visa stops new application processing',()=>{assert.match(activeVisaMessage('Sorry, you cannot create new visa request while your current visa 1234567890 is still valid for the same passport number, your current visa will expire on 23/10/2026'),/23\/10\/2026/);assert.equal(activeVisaMessage('Medical Insurance'),'');});

test('a login page asks the operator to sign in manually and never touches the form',async()=>{
 let interacted=false;
 await assert.rejects(ensureLogin({locator:()=>({innerText:async()=>''}),goto:async()=>{},url:()=> 'https://visa.visitsaudi.com/Login/OTPAuth',getByRole:()=>{interacted=true;return {isVisible:async()=>false}}}),e=>e instanceof Attention&&e.status==='needs_auth'&&e.step==='login');
});
