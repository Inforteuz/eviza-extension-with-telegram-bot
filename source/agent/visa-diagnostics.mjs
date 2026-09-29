// Diagnostics belong only to the page that this bot is processing. Never inspect
// other browser windows, profiles, cookies, or unrelated tabs.
export async function visaDiagnostics(page,applicant={},applicationId=''){
 const url=new URL(page.url());
 const sameApplication=/^[0-9a-f-]{36}$/i.test(applicationId)&&url.pathname.split('/').at(-1).toLowerCase()===applicationId.toLowerCase();
 if(url.origin!=='https://visa.visitsaudi.com'||!(/^\/Visa\//.test(url.pathname)||/^\/Insurance\/ChooseInsurance\/[0-9a-f-]{36}$/i.test(url.pathname)||sameApplication))return null;
 const report=page.snapshot?await page.snapshot():await page.evaluate(()=>{
  const visible=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const label=e=>Array.from(e.labels||[]).map(l=>l.innerText.trim()).join(' ')||e.getAttribute('aria-label')||e.getAttribute('placeholder')||'';
  return {
   text:document.body.innerText.slice(0,30000),
   controls:Array.from(document.querySelectorAll('input,select,textarea,button,a')).filter(e=>visible(e)&&e.type!=='password'&&e.type!=='hidden').map(e=>({tag:e.tagName.toLowerCase(),id:e.id,label:label(e),type:e.type||'',text:/^(BUTTON|A)$/.test(e.tagName)?e.innerText.trim():'',required:!!e.required||e.getAttribute('data-val-required')||false,...(e.tagName==='SELECT'?{options:Array.from(e.options).map(o=>({label:o.text,value:o.value}))}:{}),...(e.tagName==='A'&&e.getAttribute('href')?.startsWith('/Visa/')?{href:e.getAttribute('href')}:{}),...(['checkbox','radio'].includes(e.type)?{checked:e.checked}:{})})),
  };
 });
 // Field values are not collected; mask identity text if the site repeats it.
 for(const value of Object.values(applicant).filter(v=>typeof v==='string'&&v.length>=3).sort((a,b)=>b.length-a.length))report.text=report.text.split(value).join('[applicant]');
 report.url=url.origin+url.pathname;
 return report;
}
