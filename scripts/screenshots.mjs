// Retakes the README screenshots in docs/screenshots: the hero and the planner at 1440x900, the phone hero at 390x844
// (2x), each in light and dark, with the same sample week selected.
// With --page it retakes the page's own pictures instead (the steps row in index.html): the course list, the checks,
// the printed sheet and the phone in assets/img, and the short film of the week being dealt in assets/film with its
// poster frame. They are taken in the dark theme. After a retake, bump their ?v= in index.html.
// Serve the folder first (python -m http.server 8000), then: node scripts/screenshots.mjs [http://localhost:8000/] [--page]
// Needs Node 22+ (global fetch and WebSocket) and Chrome (CHROME_PATH, or the usual install location).
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

const args=process.argv.slice(2),PAGE=args.includes('--page');
const URL_=args.find(a=>!a.startsWith('--'))||'http://localhost:8000/';
const CHROME=process.env.CHROME_PATH||{win32:'C:/Program Files/Google/Chrome/Application/chrome.exe',darwin:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}[process.platform]||'google-chrome';
const OUT=new URL('../docs/screenshots/',import.meta.url),ASSETS=new URL('../assets/',import.meta.url);
// A full third-year week, with parallel lessons and a few clashes so the lanes and the red rings show.
const WEEK=['Κατασκευή Μικροηλεκτρονικών Διατάξεων','Ανάλυση Κυκλωμάτων ΙΙ','Γραμμική Άλγεβρα','Τεχνητή Νοημοσύνη','Οργάνωση και Σχεδίαση Η/Υ','Λογικός και Συναρτησιακός Προγραμματισμός','Τεχνολογίες Εκπαίδευσης','Σχεδιαστική Σκέψη'];

const profile=mkdtempSync(join(tmpdir(),'thmmy-shots-'));
const port=9300+Math.floor(Math.random()*600);
const chrome=spawn(CHROME,['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--hide-scrollbars','about:blank'],{stdio:'ignore'});
let socket,id=0;
const pending=new Map();
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,m=>m.error?reject(new Error(method+': '+m.error.message)):resolve(m.result));socket.send(JSON.stringify({id:n,method,params}));});
const run=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};

async function load(theme,width,height,scale,settle=2500){
 await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:width<768});
 await send('Emulation.setEmulatedMedia',{media:'',features:[{name:'prefers-color-scheme',value:theme}]});
 await send('Page.navigate',{url:URL_});
 // Ready once the catalogue is in and the 3D week is live (its deal takes about a second more).
 for(let i=0;i<150;i++){if(await run(`!document.documentElement.classList.contains('is-loading')&&!!document.querySelector('.hero-stage.live')`))break;await sleep(200);}
 await sleep(settle);
}
// clip: a rectangle of the page in CSS pixels, or a selector whose box (cut to at most w x h from its top left) is
// taken; either way it has to be on screen, so the fixed header is not painted into it.
async function shot(name,base=OUT,clip=null){
 if(typeof clip?.of==='string'){
  const box=await run(`(()=>{const r=document.querySelector(${JSON.stringify(clip.of)}).getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:Math.min(r.width,${clip.w}),height:Math.min(r.height,${clip.h})};})()`);
  clip={...box,scale:1};
 }
 const {data}=await send('Page.captureScreenshot',{format:'webp',quality:82,...(clip&&{clip})});
 writeFileSync(new URL(name,base),Buffer.from(data,'base64'));
 console.log('wrote '+new URL(name,base).pathname.split('/').slice(-3).join('/'));
}
const dock=()=>run(`scrollTo(0,document.getElementById('planner').getBoundingClientRect().top+scrollY-76+85)`);

// The film: the hero's 3D week from its first frame to the settled board, on the bare field (title, header and
// planner hidden), as the page itself paints it. The page runs on a stepped clock, so every frame is exactly one
// thirtieth of a second after the last however long its screenshot takes; the browser then replays the square around
// the board into a canvas at that pace and records it as WebM (VP9).
const FILM={width:1440,height:1100,x:440,y:100,size:1000,out:720,fps:30,seconds:5.2};
const CLOCK=`(()=>{let now=0,id=0;const queue=new Map();performance.now=()=>now;
 requestAnimationFrame=f=>{queue.set(++id,f);return id;};cancelAnimationFrame=i=>queue.delete(i);
 globalThis.__step=(n,dt)=>{for(let k=0;k<n;k++){now+=dt;const due=[...queue.values()];queue.clear();for(const f of due)f(now);}};
 addEventListener('DOMContentLoaded',()=>document.head.append(Object.assign(document.createElement('style'),{textContent:'.masthead,.hero-copy,main,.rail-fab,.notice{visibility:hidden!important}'})));})()`;
async function film(){
 await send('Emulation.setDeviceMetricsOverride',{width:FILM.width,height:FILM.height,deviceScaleFactor:1,mobile:false});
 await send('Emulation.setEmulatedMedia',{media:'',features:[{name:'prefers-color-scheme',value:'dark'}]});
 const clock=await send('Page.addScriptToEvaluateOnNewDocument',{source:CLOCK});
 await send('Page.navigate',{url:URL_});
 // The board goes live on its first drawn frame: pump frames without moving the clock until it has (shaders compile
 // in real time).
 let live=false;
 for(let i=0;i<600&&!live;i++){await sleep(50);live=await run(`(globalThis.__step?.(1,0),!!document.querySelector('.hero-stage.live'))`);}
 if(!live)throw new Error('the 3D week did not start');
 const take=[],clip={x:FILM.x,y:FILM.y,width:FILM.size,height:FILM.size,scale:FILM.out/FILM.size};
 for(let k=0;k<FILM.fps*FILM.seconds;k++){
  await run(`__step(2,${1000/FILM.fps/2})`);
  take.push((await send('Page.captureScreenshot',{format:'jpeg',quality:92,clip})).data);
 }
 await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:clock.identifier});
 await send('Page.navigate',{url:'about:blank'});
 await run(`globalThis.frames_=[]`);
 for(const data of take)await run(`frames_.push('data:image/jpeg;base64,${data}')`);
 const result=JSON.parse(await run(`(async()=>{
  const c=document.createElement('canvas');c.width=c.height=${FILM.out};const x=c.getContext('2d');
  const pics=await Promise.all(frames_.map(async url=>{const i=new Image();i.src=url;await i.decode();return i;}));
  const draw=i=>x.drawImage(i,0,0,${FILM.out},${FILM.out});
  draw(pics[0]);
  const rec=new MediaRecorder(c.captureStream(30),{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:1100000}),chunks=[];
  rec.ondataavailable=e=>chunks.push(e.data);
  const done=new Promise(r=>rec.onstop=r);
  rec.start();
  const start=performance.now();
  for(let k=0;k<pics.length;k++){const at=start+k*${1000/FILM.fps};while(performance.now()<at)await new Promise(r=>setTimeout(r,2));draw(pics[k]);}
  // The settled board holds for a moment before the loop starts over.
  await new Promise(r=>setTimeout(r,900));
  rec.stop();await done;
  const b64=async blob=>{const bytes=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
  const poster=await new Promise(r=>c.toBlob(r,'image/webp',.82));
  return JSON.stringify({film:await b64(new Blob(chunks,{type:'video/webm'})),poster:await b64(poster)});
 })()`));
 writeFileSync(new URL('film/week.webm',ASSETS),Buffer.from(result.film,'base64'));
 writeFileSync(new URL('img/film-poster.webp',ASSETS),Buffer.from(result.poster,'base64'));
 console.log(`wrote assets/film/week.webm (${take.length} frames, ${Math.round(result.film.length*.75/1024)} KB) and assets/img/film-poster.webp`);
}

try{
 let target;
 for(let i=0;i<100&&!target;i++){try{target=(await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.type==='page');}catch{}if(!target)await sleep(200);}
 if(!target)throw new Error('Chrome did not start');
 socket=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 socket.onmessage=event=>{const m=JSON.parse(event.data);pending.get(m.id)?.(m);pending.delete(m.id);};
 await send('Page.enable');
 // Choices live in this throwaway profile's storage, so the week is selected once and every later load shows it.
 await load('light',1440,900,1);
 const missing=await run(`(async()=>{const want=${JSON.stringify(WEEK)},missing=[];for(const name of want){const row=[...document.querySelectorAll('#courseList .course')].find(r=>r.querySelector('.course-title')?.textContent.trim()===name);if(!row){missing.push(name);continue;}if(!row.classList.contains('selected')){row.querySelector('.course-add').click();await new Promise(r=>setTimeout(r,300));}}return missing;})()`);
 if(missing.length)console.warn('not in the current timetable:',missing.join(', '));
 if(PAGE){
  const IMG=new URL('img/',ASSETS);
  await load('dark',1440,1100,2);
  await dock();await sleep(3000);
  await shot('step-pick.webp',IMG,{of:'#courseSidebar',w:356,h:520});
  await run(`(()=>{const c=document.getElementById('checks');c.open=true;scrollTo(0,c.getBoundingClientRect().top+scrollY-90);})()`);
  await sleep(600);
  await shot('step-check.webp',IMG,{of:'#checks',w:560,h:600});
  // The printed sheet: A4 landscape at 96 dpi, under print styles (the app refits the week when the medium changes).
  await send('Emulation.setDeviceMetricsOverride',{width:1123,height:794,deviceScaleFactor:1.25,mobile:false});
  await send('Emulation.setEmulatedMedia',{media:'print',features:[{name:'prefers-color-scheme',value:'dark'}]});
  await sleep(1200);
  await shot('step-print.webp',IMG,{x:0,y:0,width:1123,height:794,scale:1});
  await load('dark',390,844,2);
  await dock();await sleep(1500);
  await shot('step-carry.webp',IMG,{of:'.schedule-panel',w:390,h:560});
  await film();
 }else for(const theme of ['light','dark']){
  await load(theme,1440,900,1);
  await shot(`hero-${theme}.webp`);
  // The planner docked under the header: its heading, the stats and the week's first hours in view.
  await dock();
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
