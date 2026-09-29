import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const tests=readdirSync(new URL('../test/',import.meta.url)).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'test/'+name);
const r=spawnSync(process.execPath,['--test',...tests],{cwd:root,stdio:'inherit'});process.exit(r.status??1);
