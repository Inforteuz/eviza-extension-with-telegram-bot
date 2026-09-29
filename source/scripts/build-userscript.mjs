import {build} from 'esbuild';
import {writeFile,mkdir} from 'node:fs/promises';
const header=`// ==UserScript==
// @name         eVisa Operator — Telegram
// @namespace    local.evisa.operator
// @version      0.1.1
// @description  Telegram navbatidagi arizani to‘lovgacha tayyorlash. To‘lovni bosmaydi.
// @match        https://visa.visitsaudi.com/Visa/*
// @match        https://visa.visitsaudi.com/Insurance/ChooseInsurance/*
// @match        https://visa.visitsaudi.com/Login*
// @connect      127.0.0.1
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @noframes
// ==/UserScript==
`;
const result=await build({entryPoints:['agent/userscript-client.mjs'],bundle:true,write:false,format:'iife',platform:'browser',target:'chrome110',legalComments:'none'});
const text=header+result.outputFiles[0].text;await writeFile('agent/evisa-operator.user.js',text);await mkdir('outputs',{recursive:true});await writeFile('outputs/evisa-operator.user.js',text);console.log('Userscript built without credentials.');
