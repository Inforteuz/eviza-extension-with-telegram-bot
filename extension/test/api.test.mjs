import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeServerUrl,apiRequest,ApiError} from '../src/lib/api.js';

test('server address may carry a path prefix and must be https (except localhost)',async()=>{
 assert.equal(normalizeServerUrl('https://mail.flyadeal.uz/evisa/'),'https://mail.flyadeal.uz/evisa');
 assert.equal(normalizeServerUrl(' https://evisa.example.uz '),'https://evisa.example.uz');
 assert.equal(normalizeServerUrl('http://127.0.0.1:8080'),'http://127.0.0.1:8080');
 for(const bad of ['http://evisa.example.uz','https://u:p@x.uz','https://x.uz/?a=1','not a url'])assert.throws(()=>normalizeServerUrl(bad),ApiError);
 let requested;
 await apiRequest('https://mail.flyadeal.uz/evisa','/api/ext/me',{token:'t',fetchImpl:async url=>{requested=url;return new Response('{"ok":true}',{status:200})}});
 assert.equal(requested,'https://mail.flyadeal.uz/evisa/api/ext/me');
});
