// Retakes the README screenshots in docs/screenshots: the hero and the planner at 1440x900, the phone hero at 390x844
// (2x), each in light and dark, with the same sample week selected.
// Serve the folder first (python -m http.server 8000), then: node scripts/screenshots.mjs [http://localhost:8000/]
// Needs Node 22+ (global fetch and WebSocket) and Chrome (CHROME_PATH, or the usual install location).
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

const URL_=process.argv[2]||'http://localhost:8000/';
const CHROME=process.env.CHROME_PATH||{win32:'C:/Program Files/Google/Chrome/Application/chrome.exe',darwin:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}[process.platform]||'google-chrome';
const OUT=new URL('../docs/screenshots/',import.meta.url);
// A full third-year week, with parallel lessons and a few clashes so the lanes and the red rings show.
const WEEK=['Κατασκευή Μικροηλεκτρονικών Διατάξεων','Ανάλυση Κυκλωμάτων ΙΙ','Γραμμική Άλγεβρα','Τεχνητή Νοημοσύνη','Οργάνωση και Σχεδίαση Η/Υ','Λογικός και Συναρτησιακός Προγραμματισμός','Τεχνολογίες Εκπαίδευσης','Σχεδιαστική Σκέψη'];

const profile=mkdtempSync(join(tmpdir(),'thmmy-shots-'));
// Port 0 lets Chrome pick a free port and write it to DevToolsActivePort, so a busy port can never stall the start.
const chrome=spawn(CHROME,['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--hide-scrollbars','about:blank'],{stdio:['ignore','ignore','pipe']});
let stderr='';
chrome.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-2000);});
let socket,id=0;
const pending=new Map();
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,m=>m.error?reject(new Error(method+': '+m.error.message)):resolve(m.result));socket.send(JSON.stringify({id:n,method,params}));});
const run=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};

async function load(theme,width,height,scale){
 await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:width<768});
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
 await send('Page.navigate',{url:URL_});
 // Ready once the catalogue is in and the 3D week is live (its deal takes about a second more).
 for(let i=0;i<150;i++){if(await run(`!document.documentElement.classList.contains('is-loading')&&!!document.querySelector('.hero-stage.live')`))break;await sleep(200);}
 await sleep(2500);
}
async function shot(name){
 const {data}=await send('Page.captureScreenshot',{format:'webp',quality:82});
 writeFileSync(new URL(name,OUT),Buffer.from(data,'base64'));
 console.log('wrote docs/screenshots/'+name);
}

try{
 let target;
 for(let i=0;i<150&&!target;i++){try{const port=readFileSync(join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];target=(await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.type==='page');}catch{}if(!target)await sleep(200);}
 if(!target)throw new Error('Chrome did not start within 30s. Its last output:\n'+stderr);
 socket=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 socket.onmessage=event=>{const m=JSON.parse(event.data);pending.get(m.id)?.(m);pending.delete(m.id);};
 await send('Page.enable');
 // Choices live in this throwaway profile's storage, so the week is selected once and every later load shows it.
 await load('light',1440,900,1);
 const missing=await run(`(async()=>{const want=${JSON.stringify(WEEK)},missing=[];for(const name of want){const row=[...document.querySelectorAll('#courseList .course')].find(r=>r.querySelector('.course-title')?.textContent.trim()===name);if(!row){missing.push(name);continue;}if(!row.classList.contains('selected')){row.querySelector('.course-add').click();await new Promise(r=>setTimeout(r,300));}}return missing;})()`);
 if(missing.length)console.warn('not in the current timetable:',missing.join(', '));
 for(const theme of ['light','dark']){
  await load(theme,1440,900,1);
  await shot(`hero-${theme}.webp`);
  // The planner docked under the header: its heading, the stats and the week's first hours in view.
  await run(`scrollTo(0,document.getElementById('planner').getBoundingClientRect().top+scrollY-76+85)`);
  await sleep(3000);
  await shot(`planner-${theme}.webp`);
  await load(theme,390,844,2);
  await shot(`phone-${theme}.webp`);
 }
}finally{
 socket?.close();chrome.kill();
 // Chrome lets go of its profile a moment after it exits.
 await sleep(1000);
 try{rmSync(profile,{recursive:true,force:true});}catch{}
}
