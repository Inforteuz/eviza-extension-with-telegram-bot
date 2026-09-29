import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {SaudiBrowserSession} from '../agent/saudi-browser.mjs';

class Page extends EventEmitter {
 constructor(url='about:blank'){super();this.location=url;this.closed=false;this.visits=[];this.focuses=0;}
 isClosed(){return this.closed}
 url(){return this.location}
 setDefaultTimeout(){}
 async goto(url){this.visits.push(url);this.location=url;}
 async bringToFront(){if(this.closed)throw Error('page.bringToFront: Target page, context or browser has been closed');this.focuses++;}
 close(){this.closed=true;this.emit('close')}
}
class Context extends EventEmitter {
 constructor(pages=[new Page()]){super();this.tabs=pages;this.connected=true;this.transport=new EventEmitter();this.transport.isConnected=()=>this.connected;}
 browser(){return this.transport}
 pages(){return this.tabs}
 async newPage(){const page=new Page();this.tabs.push(page);return page}
 async close(){this.connected=false;for(const page of this.tabs)page.close();this.emit('close');this.transport.emit('disconnected')}
}
const fixture=()=>{const contexts=[];const session=new SaudiBrowserSession({launch:async()=>{const context=new Context();contexts.push(context);return context}});return {session,contexts}};

test('simultaneous /saudi commands share one launch and preserve the current form on later commands',async()=>{
 const {session,contexts}=fixture();const [first,second]=await Promise.all([session.open(),session.open()]);
 assert.equal(contexts.length,1);assert.equal(first,second);assert.equal(first.visits.length,1);
 first.location='https://visa.visitsaudi.com/Visa/PassportInfo/existing-draft';
 assert.equal(await session.open(),first);assert.equal(first.visits.length,1);assert.equal(first.location,'https://visa.visitsaudi.com/Visa/PassportInfo/existing-draft');
 await session.close();
});
test('closing the entire browser clears the stale signed-in status and the next /saudi relaunches',async()=>{
 const {session,contexts}=fixture();const first=await session.open();assert.equal(session.signedIn(),true);
 await contexts[0].close();assert.equal(session.signedIn(),false);
 const next=await session.open();assert.notEqual(next,first);assert.equal(contexts.length,2);assert.equal(next.focuses,1);await session.close();
});
test('closing only the Saudi tab opens a fresh tab in the existing context without touching unrelated tabs',async()=>{
 const unrelated=new Page('https://example.test/private'),context=new Context([unrelated]);let launches=0;
 const session=new SaudiBrowserSession({launch:async()=>{launches++;return context}});
 const first=await session.open();assert.notEqual(first,unrelated);first.close();
 const next=await session.open();assert.notEqual(next,first);assert.equal(launches,1);assert.equal(unrelated.visits.length,0);assert.equal(unrelated.focuses,0);await session.close();
});
test('a close racing bringToFront is recovered once, and repeated closure is bounded',async()=>{
 let launches=0;
 const session=new SaudiBrowserSession({launch:async()=>{const ctx=new Context();if(launches++===0)ctx.tabs[0].bringToFront=async()=>{await ctx.close();throw Error('page.bringToFront: Target page, context or browser has been closed')};return ctx}});
 assert.ok(await session.open());assert.equal(launches,2);await session.close();
 let failedLaunches=0;const broken=new SaudiBrowserSession({launch:async()=>{failedLaunches++;const ctx=new Context();ctx.tabs[0].bringToFront=async()=>{throw Error('Target page, context or browser has been closed')};return ctx}});
 await assert.rejects(broken.open(),/closed/);assert.equal(failedLaunches,2);await broken.close();
});
test('failed launch and navigation promises do not poison later commands',async()=>{
 let launches=0;const context=new Context();const session=new SaudiBrowserSession({launch:async()=>{if(launches++===0)throw Error('Launch failed');return context}});
 await assert.rejects(session.open(),/Launch failed/);
 const page=context.tabs[0];let attempts=0;page.goto=async url=>{page.location=url;if(attempts++===0)throw Error('Network unavailable');page.visits.push(url)};
 await assert.rejects(session.open(),/Network unavailable/);assert.equal(await session.open(),page);assert.equal(attempts,2);assert.equal(launches,2);await session.close();
});
test('shutdown during launch closes the new context and never leaves an orphan window',async()=>{
 let resolve;const context=new Context();const session=new SaudiBrowserSession({launch:()=>new Promise(r=>{resolve=r})});
 const opening=session.open();const closing=session.close();resolve(context);
 await assert.rejects(opening,/stopped/);await closing;assert.equal(context.connected,false);assert.equal(session.signedIn(),false);await assert.rejects(session.open(),/stopped/);
});
