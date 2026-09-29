import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMrz} from '../src/passport/mrz.mjs';
test('reads ICAO TD3 sample with valid checksums',()=>{const parsed=parseMrz('P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10');assert.equal(parsed.lastName,'ERIKSSON');assert.equal(parsed.firstName,'ANNA');assert.equal(parsed.birthDate,'1974-08-12');});
test('damaged passport digit never silently accepted',()=>{assert.throws(()=>parseMrz('P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C46UTO7408122F1204159ZE184226B<<<<<10'))});
test('country fields outside MRZ checksums still reject numeric OCR substitutions',()=>{assert.throws(()=>parseMrz('P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36U2B7408122F1204159ZE184226B<<<<<10'))});
test('a nationality OCR substitution requires independent printed evidence and a matching issuing state',()=>{
 const mrz='P<UZBERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36U2B7408122F1204159ZE184226B<<<<<10';
 assert.throws(()=>parseMrz(mrz));assert.throws(()=>parseMrz(mrz,{printedNationality:'France'}));
 assert.equal(parseMrz(mrz,{printedNationality:'Uzbekistan'}).nationality,'Uzbekistan');
 assert.equal(parseMrz(mrz,{printedNationality:'Uzbekistan'}).passportIssuePlace,'Uzbekistan');
});
