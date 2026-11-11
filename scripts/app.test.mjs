// Checks the pure logic in assets/app.js: lanes, overlaps, contact time and THMMY2 backup codes. Run with: node --test
// app.js is a classic script that touches the DOM as it loads, so the functions under test are lifted out of its source.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');
const from=source.indexOf('function layoutEvents('),to=source.indexOf('let shownRows');
assert.ok(from>=0&&to>from,'layoutEvents…barLevel moved in assets/app.js');
const {layoutEvents,conflicts,contactMinutes,nowAndNext,nowMarks,checkParts,partnersOf,inTeachingPeriod,nextCard,barLevel}=new Function(source.slice(from,to)+';return {layoutEvents,conflicts,contactMinutes,nowAndNext,nowMarks,checkParts,partnersOf,inTeachingPeriod,nextCard,barLevel};')();

const event=(id,day,start,end)=>({id,day,start,end});

test('conflicts: overlapping meetings on the same day pair up',()=>{
 const a=event('a',0,540,660),b=event('b',0,600,720),c=event('c',1,540,660);
 assert.deepEqual(conflicts([a,b,c]),[[a,b]]);
});

test('conflicts: back-to-back meetings do not clash',()=>{
 assert.deepEqual(conflicts([event('a',0,540,660),event('b',0,660,780)]),[]);
});

test('conflicts: a meeting inside another clashes, and three-way overlaps give three pairs',()=>{
 assert.equal(conflicts([event('a',2,540,780),event('b',2,600,660)]).length,1);
 assert.equal(conflicts([event('a',2,540,780),event('b',2,600,660),event('c',2,630,700)]).length,3);
});

test('contactMinutes: overlapping time counts once, days add up',()=>{
 assert.equal(contactMinutes([event('a',0,540,660),event('b',0,600,720)]),180);
 assert.equal(contactMinutes([event('a',0,540,660),event('b',0,560,600)]),120);
 assert.equal(contactMinutes([event('a',0,540,660),event('b',4,540,660)]),240);
 assert.equal(contactMinutes([]),0);
});

test('layoutEvents: a lone meeting takes the full day width',()=>{
 const [a]=layoutEvents([event('a',0,540,660)]);
 assert.deepEqual([a.lane,a.lanes],[0,1]);
});

test('layoutEvents: overlapping meetings get separate lanes; a later one reuses a freed lane',()=>{
 const laid=Object.fromEntries(layoutEvents([event('a',0,540,660),event('b',0,600,720),event('c',0,660,780)]).map(e=>[e.id,e]));
 assert.deepEqual([laid.a.lane,laid.b.lane,laid.c.lane],[0,1,0]);
 assert.ok([laid.a,laid.b,laid.c].every(e=>e.lanes===2));
});

test('layoutEvents: separate clusters and days do not share lanes, and the input is not mutated',()=>{
 const input=[event('a',0,540,660),event('b',0,600,720),event('c',0,780,840),event('d',1,540,660)];
 const laid=Object.fromEntries(layoutEvents(input).map(e=>[e.id,e]));
 assert.equal(laid.c.lanes,1);
 assert.equal(laid.d.lanes,1);
 assert.ok(input.every(e=>!('lane' in e)));
});

test('fromAnyService: moves past failures, and reports a wrong page over an unreachable service',async()=>{
 const from=source.indexOf('async function fromAnyService('),to=source.indexOf('function preserveCatalog(');
 assert.ok(from>=0&&to>from,'fromAnyService moved in assets/app.js');
 const fromAnyService=new Function(source.slice(from,to)+';return fromAnyService;')();
 const tried=[];
 const found=await fromAnyService(['a','b','c'],async name=>{tried.push(name);if(name!=='b')throw new TypeError('network');return 'page';});
 assert.deepEqual(found,{service:'b',value:'page'});
 assert.deepEqual(tried,['a','b']);
 const failing=errors=>fromAnyService(errors.map((_,i)=>i),async i=>{throw errors[i];});
 await assert.rejects(failing([new TypeError('network'),new Error('SourceParser: bad page'),new Error('HTTP 429')]),/bad page/);
 await assert.rejects(failing([new Error('HTTP 429'),new TypeError('network')]),/HTTP 429/);
});

test('THMMY2 code: every choice survives encode and decode; a malformed code is refused',async()=>{
 const sourcesAt=source.indexOf('const SOURCES='),limitAt=source.indexOf('const TRANSFER_LIMIT'),decodeAt=source.indexOf('async function decodeTransfer');
 assert.ok(sourcesAt>=0&&limitAt>=0&&decodeAt>limitAt,'SOURCES or TRANSFER_LIMIT…decodeCompact moved in assets/app.js');
 const lift=source.slice(sourcesAt,source.indexOf('\n',sourcesAt))+source.slice(limitAt,decodeAt)+';return {encodeTransfer,decodeCompact};';
 const data=JSON.parse(readFileSync(new URL('../data/courses.json',import.meta.url),'utf8'));
 // Codes name a meeting by course, day and start, so use meetings that are alone in their slot.
 const unique=data.fall.events.filter(e=>data.fall.events.filter(o=>o.courseId===e.courseId&&o.day===e.day&&o.start===e.start).length===1);
 const [lab,skipped]=unique,other=data.catalog.find(c=>c.id!==lab.courseId).id;
 const state={season:'spring',selected:{fall:[lab.courseId],spring:[]},passed:[other],excluded:[skipped.id],labs:[lab.id],review:[other],creditTo:{[lab.courseId]:3},colors:{'semester-3':'#112233'},colorMode:'semester',entryYear:'new',studySemester:'5',passedComplete:true,provider:'direct'};
 const {encodeTransfer,decodeCompact}=new Function('state','data','themePreference',lift)(state,data,'dark');
 const decoded=decodeCompact(await encodeTransfer());
 assert.deepEqual(decoded.state,state);
 assert.equal(decoded.theme,'dark');
 assert.equal(decoded.dropped,0);
 assert.throws(()=>decodeCompact('THMMY2:f=1x'));
});

// 2026-11-09 is a Monday and 2026-11-14 a Saturday.
const monday=(h,m)=>new Date(2026,10,9,h,m),lesson=(id,day,start,end)=>({id,day,start,end,courseId:id,room:''});

test('nowAndNext: a meeting in progress is listed, the following one is next',()=>{
 const a=lesson('a',0,540,660),b=lesson('b',0,720,780),r=nowAndNext([b,a],monday(10,30));
 assert.deepEqual(r.now,[a]);assert.deepEqual(r.next,[b]);assert.equal(r.minutesToNext,90);
});

test('nowAndNext: two meetings at once are both in progress; the end minute is free',()=>{
 const a=lesson('a',0,540,660),b=lesson('b',0,600,720);
 assert.deepEqual(nowAndNext([a,b],monday(10,30)).now,[a,b]);
 assert.deepEqual(nowAndNext([a,b],monday(11,0)).now,[b]);
});

test('nowAndNext: between meetings only the next one today is returned',()=>{
 const a=lesson('a',0,540,600),b=lesson('b',0,780,840),c=lesson('c',1,600,660),r=nowAndNext([c,b,a],monday(12,0));
 assert.deepEqual(r.now,[]);assert.deepEqual(r.next,[b]);assert.equal(r.minutesToNext,60);
});

test('nowAndNext: nothing left today gives no next',()=>{
 const r=nowAndNext([lesson('a',0,540,600),lesson('c',1,600,660)],monday(18,0));
 assert.deepEqual(r,{now:[],next:[],minutesToNext:null});
});

test('nowAndNext: weekends have nothing in progress and no next',()=>{
 const r=nowAndNext([lesson('a',0,540,600)],new Date(2026,10,14,10,0));
 assert.deepEqual(r,{now:[],next:[],minutesToNext:null});
});

test('nowAndNext: every meeting starting at the earliest upcoming minute is next',()=>{
 const a=lesson('a',0,600,660),b=lesson('b',0,600,720),c=lesson('c',0,660,720),r=nowAndNext([c,b,a],monday(9,0));
 assert.deepEqual(r.next,[a,b]);assert.equal(r.minutesToNext,60);
});

test('inTeachingPeriod: fall runs September to January, spring February to June, summer is neither',()=>{
 assert.equal(inTeachingPeriod('fall',new Date(2026,9,15)),true);
 assert.equal(inTeachingPeriod('fall',new Date(2027,0,20)),true);
 assert.equal(inTeachingPeriod('fall',new Date(2026,2,10)),false);
 assert.equal(inTeachingPeriod('spring',new Date(2027,2,10)),true);
 assert.equal(inTeachingPeriod('spring',new Date(2026,9,15)),false);
 assert.equal(inTeachingPeriod('fall',new Date(2026,6,10)),false);
 assert.equal(inTeachingPeriod('spring',new Date(2026,6,10)),false);
});

test('nowMarks: every meeting in progress is "now" and the following one is "next"',()=>{
 const a=lesson('a',0,540,660),b=lesson('b',0,600,720),c=lesson('c',0,780,840);
 assert.deepEqual([...nowMarks(nowAndNext([a,b,c],monday(10,30)))],[['a','now'],['b','now'],['c','next']]);
});

test('nowMarks: meetings starting together are all "next"',()=>{
 const a=lesson('a',0,600,660),b=lesson('b',0,600,720),c=lesson('c',0,660,720);
 assert.deepEqual([...nowMarks(nowAndNext([a,b,c],monday(9,0)))],[['a','next'],['b','next']]);
});

test('nowMarks: between meetings only the next is marked, and with nothing left or no day there are no marks',()=>{
 const a=lesson('a',0,540,600),b=lesson('b',0,780,840);
 assert.deepEqual([...nowMarks(nowAndNext([a,b],monday(12,0)))],[['b','next']]);
 assert.equal(nowMarks(nowAndNext([a,b],monday(18,0))).size,0);
 assert.equal(nowMarks(nowAndNext([a,b],new Date(2026,10,14,10,0))).size,0);
});

test('checkParts: overlaps and other findings are counted apart, and a kind with none is left out',()=>{
 assert.deepEqual(checkParts(3,4),[{tone:'danger',text:'3 επικαλύψεις'},{tone:'warning',text:'4 υποδείξεις'}]);
 assert.deepEqual(checkParts(1,1),[{tone:'danger',text:'1 επικάλυψη'},{tone:'warning',text:'1 υπόδειξη'}]);
 assert.deepEqual(checkParts(2,0),[{tone:'danger',text:'2 επικαλύψεις'}]);
 assert.deepEqual(checkParts(0,5),[{tone:'warning',text:'5 υποδείξεις'}]);
 assert.deepEqual(checkParts(0,0),[]);
});

test('partnersOf: each meeting in a clash lists the ones it overlaps',()=>{
 const a=event('a',0,540,660),b=event('b',0,600,720),c=event('c',0,630,700),map=partnersOf(conflicts([a,b,c]));
 assert.deepEqual(map.get('a'),['b','c']);
 assert.deepEqual(map.get('b'),['a','c']);
 assert.deepEqual(map.get('c'),['a','b']);
 assert.equal(partnersOf([]).size,0);
});

const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const names={a:'Ανάλυση',b:'Φυσική',c:'Άλγεβρα'},nameOf=id=>names[id];
const meet=(id,courseId,start,end,room='')=>({...lesson(id,0,start,end),courseId,room});
const cardAt=(events,h,m)=>{const date=monday(h,m);return nextCard(nowAndNext(events,date),date,nameOf,clock);};

test('nextCard: a meeting in progress shows the minutes left, its end and how far along it is',()=>{
 const card=cardAt([meet('1','a',540,660,'Α1')],10,0);
 assert.deepEqual(card,{kind:'now',label:'Τώρα · ως 11:00',names:'Ανάλυση',meta:'Α1 · 09:00–11:00',number:'60',prime:true,progress:.5});
});

test('nextCard: the next meeting within 99 minutes counts down, with a bar only inside the hour',()=>{
 const soon=cardAt([meet('1','a',600,660,'Α1')],9,30);
 assert.deepEqual(soon,{kind:'next',label:'Επόμενο',names:'Ανάλυση',meta:'Α1 · 10:00–11:00',number:'30',prime:true,progress:.5});
 const far=cardAt([meet('1','a',600,660)],8,30);
 assert.equal(far.number,'90');assert.equal(far.prime,true);assert.equal(far.progress,null);
 assert.equal(far.meta,'10:00–11:00');
});

test('nextCard: past 99 minutes the start time stands in for the countdown',()=>{
 const card=cardAt([meet('1','a',900,960)],12,0);
 assert.equal(card.number,'15:00');assert.equal(card.prime,false);assert.equal(card.progress,null);
});

test('nextCard: two meetings at once are joined, a repeated course once, and the latest end counts',()=>{
 const card=cardAt([meet('1','a',540,660,'Α1'),meet('2','b',600,720,'Β2'),meet('3','a',540,600,'Α1')],10,30);
 assert.equal(card.names,'Ανάλυση και Φυσική');
 assert.equal(card.meta,'Α1, Β2 · 09:00–12:00');
 assert.equal(card.label,'Τώρα · ως 12:00');assert.equal(card.number,'90');
});

test('nextCard: meetings starting together are joined in the next card',()=>{
 const card=cardAt([meet('1','a',600,660,'Α1'),meet('2','b',600,720,'Β2')],9,30);
 assert.equal(card.names,'Ανάλυση και Φυσική');
 assert.equal(card.meta,'Α1, Β2 · 10:00–12:00');
 assert.equal(card.number,'30');
});

test('nextCard: nothing on or next gives no card',()=>{
 assert.equal(cardAt([meet('1','a',540,600)],18,0),null);
 assert.equal(cardAt([meet('1','zz',540,600)],8,0),null);
});

test('barLevel: value over the ceiling, held between 35% and the full track',()=>{
 assert.equal(barLevel(0,10),.35);
 assert.equal(barLevel(2,10),.35);
 assert.equal(barLevel(5,10),.5);
 assert.equal(barLevel(30,10),1);
});
