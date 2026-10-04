// Checks the week's pure logic in assets/app.js: lanes, overlaps and contact time. Run with: node --test
// app.js is a classic script that touches the DOM as it loads, so the three functions are lifted out of its source.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');
const from=source.indexOf('function layoutEvents('),to=source.indexOf('let shownRows');
assert.ok(from>=0&&to>from,'layoutEvents…contactMinutes moved in assets/app.js');
const {layoutEvents,conflicts,contactMinutes}=new Function(source.slice(from,to)+';return {layoutEvents,conflicts,contactMinutes};')();

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
