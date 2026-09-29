import {readConfig} from './config.mjs';
import {connectMiniApp} from './telegram-mini-app.mjs';
try{console.log(await connectMiniApp(await readConfig(),{allowPrivate:process.argv.includes('--private')}))}catch(e){console.error(e.message);process.exitCode=1}
