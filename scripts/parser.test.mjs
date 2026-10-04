// Checks assets/source-parser.js against small copies of the official pages' markup. Run with: node --test
// The parser needs a real DOMParser, so it runs in headless Chrome over the DevTools protocol, as in refresh-data.mjs.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

const CHROME=process.env.CHROME_PATH||{win32:'C:/Program Files/Google/Chrome/Application/chrome.exe',darwin:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}[process.platform]||'/usr/bin/google-chrome';
const skip=existsSync(CHROME)?false:`Chrome not found at ${CHROME} (set CHROME_PATH)`;

let chrome,profile,socket,id=0;
const pending=new Map();
// Runs `call` (a SourceParser expression) in the page; returns its value, or {error} with the parser's message.
async function run(call){
 const expression=`(()=>{try{return ${call};}catch(error){return {error:error.message};}})()`;
 const reply=await new Promise(resolve=>{const n=++id;pending.set(n,resolve);socket.send(JSON.stringify({id:n,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));});
 const failure=reply.result?.exceptionDetails;
 if(failure)throw new Error(failure.exception?.description||failure.text);
 return reply.result.result.value;
}

before(async()=>{
 if(skip)return;
 profile=mkdtempSync(join(tmpdir(),'thmmy-test-'));
 const port=9300+Math.floor(Math.random()*600);
 chrome=spawn(CHROME,['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run',...(process.env.CI?['--no-sandbox']:[]),'about:blank'],{stdio:'ignore'});
 let target;
 for(let i=0;i<100&&!target;i++){try{target=(await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.type==='page');}catch{}if(!target)await sleep(200);}
 assert.ok(target,'Chrome did not start');
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 socket.onmessage=event=>{const message=JSON.parse(event.data);pending.get(message.id)?.(message);pending.delete(message.id);};
 await run(readFileSync(new URL('../assets/source-parser.js',import.meta.url),'utf8')+';0');
});
after(async()=>{
 socket?.close();chrome?.kill();
 if(profile){await sleep(500);rmSync(profile,{recursive:true,force:true});}
});

// The catalog page: three tabs (by domain, by semester, by requirement), each a list of accordion sections.
const item=(wpId,heading)=>`<div class="toggle_ajax-wrap" id="${wpId}"><h3>${heading}</h3><a href="https://www.e-ce.uth.gr/?p=${wpId}">more</a></div>`;
const section=(header,items)=>`<h4><a>${header}</a></h4><div class="accordion_content">${items.join('')}</div>`;
const PHYSICS=item(653,'ECE111 Φυσική'),CALCULUS=item(4722,'ECE113 Λογισμός Ι');
const catalogPage=({semesters=section('Εξάμηνο 1',[PHYSICS,CALCULUS])}={})=>`<html><head><title>Προπτυχιακά Μαθήματα</title></head><body><div class="tabs">
 <div class="tab_content" id="tabs-1-1">${section('Ενέργειας (Ε)',[PHYSICS])}${section('Θεμελιώσεων (ΕΘ)',[CALCULUS])}</div>
 <div class="tab_content" id="tabs-1-2">${semesters}</div>
 <div class="tab_content" id="tabs-1-3">${section('Υποχρεωτικά',[PHYSICS])}${section('Επιλογής',[CALCULUS])}</div>
</div></body></html>`;

// A timetable page: one tab per semester, five day blocks in each, one table row per meeting.
const row=(time,name,type='Θεωρία',room='Αμφ. 1',teacher='Διδάσκων')=>`<tr class="sbody"><td>${time}</td><td>${name}</td><td>${type}</td><td>${room}</td><td>${teacher}</td></tr>`;
const DAYS=['Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή'];
const timetablePage=(rows,{title='Ωρολόγιο Πρόγραμμα Χειμερινού Εξαμήνου',days=DAYS}={})=>`<html><head><title>${title}</title></head><body><div class="tabs">
 <div class="tab_content"><h2>1ο Εξάμηνο</h2>${days.map((day,i)=>`<div class="toggle-wrap"><span class="trigger">${day}</span><table>${(rows[i]||[]).join('')}</table></div>`).join('')}</div>
</div></body></html>`;

const parseCatalog=html=>run(`SourceParser.parseCatalog(${JSON.stringify(html)})`);
const parseTimetable=(html,season='fall')=>run(`SourceParser.parseTimetable(${JSON.stringify(html)},${JSON.stringify(season)},SourceParser.parseCatalog(${JSON.stringify(catalogPage())}))`);

test('parseCatalog: courses carry semester, domain, requirement and link from the three tabs',{skip},async()=>{
 assert.deepEqual(await parseCatalog(catalogPage()),[
  {id:'ECE111',wpId:'653',name:'Φυσική',semester:1,domain:'Ενέργειας (Ε)',mandatory:true,url:'https://www.e-ce.uth.gr/?p=653'},
  {id:'ECE113',wpId:'4722',name:'Λογισμός Ι',semester:1,domain:'Θεμελιώσεων (ΕΘ)',mandatory:false,url:'https://www.e-ce.uth.gr/?p=4722'}
 ]);
});

test('parseCatalog: refuses a page that is not the catalog, or one that disagrees with itself',{skip},async()=>{
 assert.match((await parseCatalog('<title>Νέα</title><div class="tabs"></div>')).error,/not the undergraduate course catalog/);
 assert.match((await parseCatalog(catalogPage({semesters:section('Εξάμηνο 1',[PHYSICS,CALCULUS])+section('Εξάμηνο 2',[PHYSICS])}))).error,/conflicting semester for ECE111/);
 assert.match((await parseCatalog(catalogPage({semesters:section('Εξάμηνο 1',[PHYSICS,item(653,'ECE113 Λογισμός Ι')])}))).error,/WP id 653 is reused/);
 assert.match((await parseCatalog(catalogPage({semesters:section('Εξάμηνο 1',[PHYSICS,'<div class="toggle_ajax-wrap" id="4722"><h3>ECE113 Λογισμός Ι</h3><a href="https://evil.example/">x</a></div>'])}))).error,/unsafe URL/);
});

test('parseTimetable: rows become events with day, minutes and course matched by name or link',{skip},async()=>{
 const result=await parseTimetable(timetablePage([[row('9:00 – 11:00','Φυσική')],[],[row('14:15-16:00','<a href="https://www.e-ce.uth.gr/?p=4722">Λογισμός 1</a>','Εργαστήριο','Εργ. 2','')]]));
 assert.equal(result.published,true);
 assert.deepEqual(result.events.map(({courseId,semester,day,start,end,type,room})=>({courseId,semester,day,start,end,type,room})),[
  {courseId:'ECE111',semester:1,day:0,start:540,end:660,type:'Θεωρία',room:'Αμφ. 1'},
  {courseId:'ECE113',semester:1,day:2,start:855,end:960,type:'Εργαστήριο',room:'Εργ. 2'}
 ]);
 assert.equal(new Set(result.events.map(e=>e.id)).size,2);
});

test('parseTimetable: an identical repeated row is one event; an empty timetable is unpublished',{skip},async()=>{
 assert.equal((await parseTimetable(timetablePage([[row('9:00-11:00','Φυσική'),row('9:00-11:00','Φυσική')]]))).events.length,1);
 const empty=await parseTimetable(timetablePage([]));
 assert.deepEqual([empty.events.length,empty.published],[0,false]);
});

test('parseTimetable: refuses broken or mismatched pages',{skip},async()=>{
 const error=async(...args)=>(await parseTimetable(...args)).error;
 assert.match(await error(timetablePage([[row('9:00-11:00','Φυσική')]]),'spring'),/does not match spring/);
 assert.match(await error(timetablePage([[row('11:00-9:00','Φυσική')]])),/does not advance/);
 assert.match(await error(timetablePage([[row('25:00-26:00','Φυσική')]])),/invalid time range/);
 assert.match(await error(timetablePage([[row('9:00-11:00','Χημεία')]])),/not in the catalog/);
 assert.match(await error(timetablePage([],{days:DAYS.slice(0,4)})),/five day blocks/);
 assert.match(await error(timetablePage([],{days:['Δευτέρα','Δευτέρα','Τετάρτη','Πέμπτη','Παρασκευή']})),/repeats a day/);
 assert.match(await error(timetablePage([['<tr class="sbody"><td>9:00-11:00</td><td>Φυσική</td></tr>']])),/partial row/);
});
