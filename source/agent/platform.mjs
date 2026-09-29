import path from 'node:path';
export function defaultPython(platform=process.platform){return platform==='win32'?'python.exe':'python3'}
export function windowsInitialConfig(python){
 if(!path.win32.isAbsolute(python)||path.win32.extname(python).toLowerCase()!=='.exe')throw Error('Windows Python must be an absolute executable path.');
 return {RUN_MODE:'telegram',TELEGRAM_MINI_APP_ENABLED:'0',PANEL_URL:'',PANEL_TOKEN:'',OAI_SITES_AUTH_TOKEN:'',TELEGRAM_BOT_TOKEN:'',TELEGRAM_OPERATOR_ID:'',OPENAI_API_KEY:'',PASSPORT_AI_MODEL:'gpt-4.1',PYTHON_BIN:python,BROWSER_CHANNEL:'msedge',HEADLESS:'0',ENABLE_VISA_SUBMISSION:'1'};
}
