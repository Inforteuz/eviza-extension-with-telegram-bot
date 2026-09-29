const ORIGIN='https://visa.visitsaudi.com';
const ENTRY=ORIGIN+'/Visa/Index';
export function closedBrowserError(error){return /Target (?:page, context or browser|page|context|browser) has been closed|Browser has been closed|browser.*disconnected/i.test(String(error?.message||''));}
const belongsToSaudi=page=>{try{return new URL(page.url()).origin===ORIGIN}catch{return false}};

// Own only the bot's persistent browser. A completed launch promise must never
// outlive a closed page or context, and reopening must keep the same profile.
export class SaudiBrowserSession {
 constructor({launch}){this.launch=launch;this.context=null;this.currentPage=null;this.opening=null;this.stopped=false;this.needsNavigation=false;}
 livePage(){
  const browser=this.context?.browser();
  return this.context&&browser?.isConnected()!==false&&this.currentPage&&!this.currentPage.isClosed()?this.currentPage:null;
 }
 signedIn(){const page=this.livePage();if(!page||!belongsToSaudi(page))return false;return new URL(page.url()).pathname.startsWith('/Visa/');}
 open(){
  if(this.stopped)return Promise.reject(Error('Saudi browser session is stopped.'));
  if(!this.opening)this.opening=this.openWithRecovery().finally(()=>{this.opening=null});
  return this.opening;
 }
 async openWithRecovery(){
  for(let attempt=0;attempt<2;attempt++){
   try{return await this.openCurrent()}
   catch(error){if(!closedBrowserError(error)||attempt===1||this.stopped)throw error;await this.discard();}
  }
 }
 async openCurrent(){
  if(this.stopped)throw Error('Saudi browser session is stopped.');
  if(this.context?.browser()?.isConnected()===false)await this.discard();
  if(!this.context){
   const context=await this.launch();
   if(this.stopped){await context.close();throw Error('Saudi browser session is stopped.');}
   this.context=context;
   const forget=()=>{if(this.context===context){this.context=null;this.currentPage=null;this.needsNavigation=false}};
   context.on('close',forget);context.browser()?.on('disconnected',forget);
  }
  if(!this.livePage()||!belongsToSaudi(this.currentPage)){
   const pages=this.context.pages().filter(page=>!page.isClosed());
   const page=pages.find(belongsToSaudi)||pages.find(page=>page.url()==='about:blank')||await this.context.newPage();
   this.currentPage=page;this.needsNavigation=!belongsToSaudi(page);page.setDefaultTimeout(15000);
   page.on('close',()=>{if(this.currentPage===page){this.currentPage=null;this.needsNavigation=false}});
  }
  const page=this.currentPage;
  if(this.needsNavigation){await page.goto(ENTRY,{waitUntil:'domcontentloaded'});this.needsNavigation=false;}
  await page.bringToFront();return page;
 }
 async discard(){const context=this.context;this.context=null;this.currentPage=null;this.needsNavigation=false;if(context)await context.close().catch(()=>{});}
 async close(){this.stopped=true;await this.opening?.catch(()=>{});await this.discard();}
}
