// Refreshes data/courses.json from the official ΤΗΜΜΥ pages. Run nightly by .github/workflows/refresh-data.yml, or by
// hand: `node scripts/refresh-data.mjs` (add --dry-run to only report what changed).
//
// The pages are parsed by the app's own assets/source-parser.js inside headless Chrome (it needs a real DOMParser), so
// the snapshot is exactly what a manual refresh in the app would produce. Nothing is written unless something changed,
// and nothing is written if a page fails or the result looks broken. On a change the file's content version in
// index.html is updated too, so browsers and the service worker pick the new data up.
// Needs Node 22+ (global fetch and WebSocket) and Chrome (CHROME_PATH, or the usual install location).
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

const ROOT=new URL('../',import.meta.url),DATA=new URL('data/courses.json',ROOT),INDEX=new URL('index.html',ROOT);
const dryRun=process.argv.includes('--dry-run');
// Same pages as SOURCES in assets/app.js.
const SOURCES={
 catalog:'https://www.e-ce.uth.gr/studies/undergraduate/courses/',
 fall:'https://www.e-ce.uth.gr/studies/undergraduate/fall-timetable/year/',
 spring:'https://www.e-ce.uth.gr/studies/undergraduate/spring-timetable/year/'
};
const CHROME=process.env.CHROME_PATH||{win32:'C:/Program Files/Google/Chrome/Application/chrome.exe',darwin:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}[process.platform]||'google-chrome';

async function download(url){
 for(let attempt=1;;attempt++){
  try{
   const response=await fetch(url,{headers:{'user-agent':'thmmy-planner data refresh (+https://github.com/FueledByRedBull/thmmy-planner)'},signal:AbortSignal.timeout(60000)});
   if(!response.ok)throw new Error(`HTTP ${response.status}`);
   return await response.text();
  }catch(error){
   if(attempt===3)throw new Error(`${url}: ${error.message}`);
   await sleep(attempt*15000);
  }
 }
}

// Runs the app's parser on the downloaded pages in headless Chrome, over the DevTools protocol.
async function parse(pages){
 const profile=mkdtempSync(join(tmpdir(),'thmmy-refresh-')),port=9300+Math.floor(Math.random()*600);
 // CI runners cannot always use Chrome's sandbox; the pages are only read by DOMParser, which runs no scripts.
 const chrome=spawn(CHROME,['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run',...(process.env.CI?['--no-sandbox']:[]),'about:blank'],{stdio:'ignore'});
 try{
  let target;
  for(let i=0;i<100&&!target;i++){try{target=(await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.type==='page');}catch{}if(!target)await sleep(200);}
  if(!target)throw new Error('Chrome did not start');
  const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0;const pending=new Map();
  socket.onmessage=event=>{const message=JSON.parse(event.data);pending.get(message.id)?.(message);pending.delete(message.id);};
  const evaluate=async expression=>{
   const reply=await new Promise(resolve=>{const n=++id;pending.set(n,resolve);socket.send(JSON.stringify({id:n,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));});
   const failure=reply.result?.exceptionDetails;
   if(failure)throw new Error(failure.exception?.description||failure.text);
   return reply.result.result.value;
  };
  await evaluate(readFileSync(new URL('assets/source-parser.js',ROOT),'utf8'));
  const result=await evaluate(`(pages=>{const catalog=SourceParser.parseCatalog(pages.catalog);return {catalog,fall:SourceParser.parseTimetable(pages.fall,'fall',catalog),spring:SourceParser.parseTimetable(pages.spring,'spring',catalog)};})(${JSON.stringify(pages)})`);
  socket.close();
  return result;
 }finally{
  chrome.kill();
  await sleep(500);
  rmSync(profile,{recursive:true,force:true});
 }
}

// Refuse results that look like a broken page rather than a real change.
function check(previous,next){
 const problems=[];
 if(next.catalog.length<Math.max(20,previous.catalog.filter(c=>!c.archived).length*.8))problems.push(`the catalog shrank to ${next.catalog.length} courses`);
 for(const season of ['fall','spring']){
  const before=previous[season].events.length,after=next[season].events.length;
  if(previous[season].published&&!after)problems.push(`the published ${season} timetable came back empty`);
  else if(after<before*.5)problems.push(`the ${season} timetable dropped from ${before} to ${after} meetings`);
 }
 if(problems.length)throw new Error(`Not writing: ${problems.join('; ')}. Check the official pages by hand.`);
}

// What a visitor would see, without the fetch timestamps.
const content=d=>JSON.stringify([d.catalog,...['fall','spring'].map(s=>[d[s].events,d[s].published,d[s].sourceUrl])]);

function summary(previous,next){
 const ids=list=>new Set(list.map(e=>e.id)),lines=[];
 const courses=[ids(previous.catalog),ids(next.catalog)];
 const added=[...courses[1]].filter(id=>!courses[0].has(id)),removed=[...courses[0]].filter(id=>!courses[1].has(id));
 lines.push(`Catalog: ${next.catalog.length} courses${added.length?`, added ${added.join(', ')}`:''}${removed.length?`, removed ${removed.join(', ')}`:''}.`);
 for(const season of ['fall','spring']){
  const before=ids(previous[season].events),after=ids(next[season].events);
  const plus=[...after].filter(id=>!before.has(id)).length,minus=[...before].filter(id=>!after.has(id)).length;
  lines.push(`${season==='fall'?'Fall':'Spring'}: ${after.size} meetings${next[season].published?'':' (not published)'}, ${plus} new or changed, ${minus} removed or changed.`);
 }
 return lines.join('\n');
}

const previous=JSON.parse(readFileSync(DATA,'utf8'));
const pages=Object.fromEntries(await Promise.all(Object.entries(SOURCES).map(async([kind,url])=>[kind,await download(url)])));
const parsed=await parse(pages);
const next={catalog:parsed.catalog,fall:parsed.fall,spring:parsed.spring,catalogFetchedAt:new Date().toISOString()};
check(previous,next);

const changed=content(previous)!==content(next),report=changed?summary(previous,next):'No changes since the last snapshot.';
console.log(report);
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`### Timetable data\n\n${report.replace(/\n/g,'\n\n')}\n`);
if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`changed=${changed&&!dryRun}\n`);
if(process.env.SUMMARY_FILE)writeFileSync(process.env.SUMMARY_FILE,report+'\n');
if(changed&&!dryRun){
 const json=JSON.stringify(next),version=createHash('sha256').update(json).digest('hex').slice(0,12);
 writeFileSync(DATA,json);
 const html=readFileSync(INDEX,'utf8'),updated=html.replace(/courses\.json\?v=[0-9a-f]+/g,`courses.json?v=${version}`);
 if(updated===html)throw new Error('index.html has no courses.json?v= to update');
 writeFileSync(INDEX,updated);
 console.log(`Wrote data/courses.json (v=${version}) and updated index.html.`);
}
