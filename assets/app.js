'use strict';
const $=id=>document.getElementById(id);
const initialData=JSON.parse($('initial-data').textContent);
const GUIDE=JSON.parse($('guide-data').textContent);
const embeddedState=JSON.parse($('initial-state').textContent);
const STORE='thmmy-planner-v1-'+(embeddedState?.storageId||'original');
const SOURCES={fall:'https://www.e-ce.uth.gr/studies/undergraduate/fall-timetable/year/',spring:'https://www.e-ce.uth.gr/studies/undergraduate/spring-timetable/year/',catalog:'https://www.e-ce.uth.gr/studies/undergraduate/courses/'};
const DAYS=['Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή'],SHORT_DAYS=['Δε','Τρ','Τε','Πε','Πα'];
// Vivid course palette (cobalt, hot pink, tangerine, violet, aqua, lemon, sky, orchid, periwinkle). No grey: on the studio ground it reads as disabled.
// No pure green, amber or red: passed, review and overlap are carried by those hues plus icons, dashes and outlines.
const COLORS=['#3b5bff','#ff4fa8','#ff7b2e','#8f5cff','#1fd1c1','#ffd43b','#3ab8ff','#d34df0','#9db4ff'];
const blankState=()=>({season:'fall',selected:{fall:[],spring:[]},passed:[],excluded:[],labs:[],review:[],creditTo:{},colors:{},colorMode:'course',entryYear:'',studySemester:'',passedComplete:false,provider:'jina'});
let data=initialData,state={...blankState(),...(embeddedState||{})},storageWarning='',detailId=null,busy=false;
try{const saved=JSON.parse(localStorage.getItem(STORE)||'null');if(saved?.version===1&&saved.data?.catalog&&saved.state?.selected){data=saved.data;state={...blankState(),...saved.state};}}catch(e){storageWarning='Η τοπική αποθήκευση δεν είναι διαθέσιμη ή δεν διαβάστηκε. Χρησιμοποίησε «Αποθήκευση αντιγράφου» για να κρατήσεις τη δουλειά σου.';}
// A hand-edited or older store must not put meetings off the five-day grid.
for(const season of ['fall','spring'])if(Array.isArray(data[season]?.events))data[season].events=data[season].events.filter(e=>Number.isInteger(e.day)&&e.day>=0&&e.day<5&&e.end>e.start);
const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Soft hyphens at Greek syllable breaks, so long names in narrow lanes break as "Μικροη-λεκτρο-νικών" in every browser
// instead of at an arbitrary letter. Consonants between vowels go to the next syllable when a Greek word can start with
// the first two, otherwise the first stays behind; fragments keep at least 3 letters.
// ponytail: never splits two adjacent vowels, so a few valid breaks are missed; swap for a dictionary if that matters.
const ONSET=new Set('βγ βδ βλ βρ γδ γκ γλ γν γρ δν δρ ζβ ζμ θλ θν θρ κλ κν κρ κτ μν μπ ντ πλ πν πρ πτ σβ σγ σθ σκ σλ σμ σν σπ στ σφ σχ τζ τμ τρ τσ φθ φλ φρ φτ χθ χλ χμ χν χρ χτ'.split(' ')),VOWEL=/[αεηιουωάέήίόύώϊϋΐΰ]/;
const hyphenate=text=>String(text??'').replace(/[Ά-ώ]{7,}/g,word=>{
 const w=word.toLowerCase();let out='',from=0;
 for(let i=0;i<w.length;){
  if(!VOWEL.test(w[i])){i++;continue;}
  let j=i+1;while(j<w.length&&VOWEL.test(w[j]))j++;
  let k=j;while(k<w.length&&!VOWEL.test(w[k]))k++;
  const cut=k-j===1||ONSET.has(w.slice(j,j+2))?j:j+1;
  if(k<w.length&&k>j&&cut>=from+3&&w.length-cut>=3){out+=word.slice(from,cut)+'­';from=cut;}
  i=k;
 }
 return out+word.slice(from);
});
const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el').replace(/ς/g,'σ');
const time=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const dateText=s=>s?new Date(s).toLocaleString('el-GR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Άγνωστη ημερομηνία';
const course=id=>data.catalog.find(c=>c.id===id);
const guideCourse=id=>(GUIDE.courses||[]).find(c=>c.id===id);
const chosen=()=>state.selected[state.season];
const declaration=()=>chosen().filter(id=>!state.review.includes(id)&&!state.passed.includes(id));
const allMeetings=()=>data[state.season].events;
const meetings=id=>allMeetings().filter(e=>e.courseId===id);
const isLab=e=>norm(e.type).includes('εργαστηρ');
const included=e=>isLab(e)?state.labs.includes(e.id):!state.excluded.includes(e.id);
const activeEvents=()=>allMeetings().filter(e=>chosen().includes(e.courseId)&&included(e));
const needsLab=c=>{const labs=meetings(c.id).filter(isLab);return labs.length>0&&!labs.some(included);};
const seasonName=(genitive=false)=>state.season==='fall'?(genitive?'χειμερινού':'χειμερινό'):(genitive?'εαρινού':'εαρινό');
const clock=n=>n%60?time(n):String(n/60);
// The row's week at a glance: lectures, or the labs of a course that has nothing else.
function slotSummary(c){const all=meetings(c.id),list=all.some(e=>!isLab(e))?all.filter(e=>!isLab(e)):all,slots=[...new Set(list.slice().sort((a,b)=>a.day-b.day||a.start-b.start).map(e=>`${SHORT_DAYS[e.day]} ${clock(e.start)}-${clock(e.end)}`))];return slots.slice(0,3).join(' · ')+(slots.length>3?` +${slots.length-3}`:'');}
// The current 2023+ registration rules assign 2 ECTS to each English course.
const ects=c=>state.entryYear==='new'&&['ECE121','ECE122'].includes(c.id)?2:(guideCourse(c.id)?.ects??null);
const prerequisites=c=>guideCourse(c.id)?.prerequisites??null;
const outstanding=c=>(prerequisites(c)||[]).filter(id=>!state.passed.includes(id));
const mandatory=c=>typeof c.mandatory==='boolean'?c.mandatory:guideCourse(c.id)?.mandatory;
const special=c=>guideCourse(c.id)?.course_type==='special_topics';
const practice=c=>['ECE496','ECE567'].includes(c.id);
const creditOptions=c=>practice(c)?[8]:c.semester%2?(special(c)?[7,9]:[5,7,9]):[6,8];
const credited=c=>mandatory(c)?c.semester:(creditOptions(c).includes(Number(state.creditTo[c.id]))?Number(state.creditTo[c.id]):null);
const invalidCredit=c=>!mandatory(c)&&state.creditTo[c.id]!=null&&credited(c)===null;
const staleMeetings=id=>[...state.labs,...state.excluded].filter(key=>key.startsWith(state.season+'|'+id+'|')&&!allMeetings().some(e=>e.id===key));
const setIn=(array,value,on)=>on?[...new Set([...array,value])]:array.filter(v=>v!==value);
const saveFile=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
function persist(){try{localStorage.setItem(STORE,JSON.stringify({version:1,data,state}));}catch(e){notify('Ο browser δεν μπόρεσε να αποθηκεύσει τις αλλαγές. Κατέβασε ένα αντίγραφο HTML για να τις διατηρήσεις.',true);}}
// Notices float under the header, so they are seen wherever the page is scrolled; a finished one can be dismissed.
function notify(text,error=false){
 $('updateReport').hidden=true;const notice=$('notice');
 // A notice replacing one still on screen plays its entrance again, so the change is seen.
 if(!notice.hidden)notice.getAnimations().forEach(a=>{a.cancel();a.play();});
 notice.textContent=text;notice.classList.toggle('error',error);notice.hidden=false;
 if(!text.endsWith('…')){const close=document.createElement('button');close.type='button';close.className='quiet icon-btn';close.setAttribute('aria-label','Κλείσιμο');close.innerHTML=icon('close');close.onclick=()=>{notice.hidden=true;};notice.append(close);}
}
// Failures in the student's language; the technical text stays in the console.
function plainError(error){
 console.error(error);
 const message=String(error?.message||'').replace(/\.$/,'');
 if(error?.name==='AbortError')return 'η υπηρεσία δεν απάντησε εντός 20 δευτερολέπτων';
 if(/^HTTP 429/.test(message))return 'η υπηρεσία δέχεται πολλά αιτήματα αυτή τη στιγμή· δοκίμασε ξανά σε λίγο';
 if(/^HTTP \d/.test(message))return 'η υπηρεσία απάντησε με σφάλμα';
 if(error instanceof TypeError||/NetworkError|Failed to fetch|Load failed/.test(message))return 'δεν υπάρχει σύνδεση ή η υπηρεσία δεν είναι διαθέσιμη';
 if(/^SourceParser/.test(message))return 'η σελίδα της πηγής δεν έχει τη μορφή που περιμένει η εφαρμογή';
 return /[Ά-ώ]/.test(message)?message:'προέκυψε απρόσμενο σφάλμα';
}
function available(c){return meetings(c.id).length>0;}
function courseIssues(c){
 const issues=[],pre=prerequisites(c),sem=Number(state.studySemester);
 if(pre===null)issues.push('Δεν υπάρχουν επαληθευμένα προαπαιτούμενα στον ενσωματωμένο οδηγό.');
 else if(outstanding(c).length)issues.push(`${state.passedComplete?'Μη περασμένα':'Δεν έχουν σημειωθεί ως περασμένα'} προαπαιτούμενα: ${outstanding(c).join(', ')}.`);
 if(state.passed.includes(c.id))issues.push('Το μάθημα είναι περασμένο: παραμένει στο ωρολόγιο, αλλά δεν μετρά στη δήλωση ή στα ECTS της.');
 if(!available(c))issues.push('Δεν εμφανίζεται στο τρέχον ωρολόγιο αυτής της περιόδου.');
 if(sem&&c.id!=='ECE588'&&c.semester>sem&&(mandatory(c)||sem<5))issues.push('Το μάθημα ανήκει σε μεταγενέστερο εξάμηνο. Χρειάζεται έλεγχος δικαιώματος δήλωσης.');
 else if(sem&&sem>=5&&!mandatory(c)&&credited(c)!==null&&credited(c)>sem)issues.push('Η χρέωση είναι σε μεταγενέστερο εξάμηνο. Επίλεξε τη σωστή χρέωση στις λεπτομέρειες.');
 if(special(c))issues.push('Απαιτείται αποδοχή επιβλέποντα και επίσημη αίτηση (σ. 21).');
 if(c.id==='ECE588'){const passedCredits=state.passed.filter(id=>!['ECE588','ECE121','ECE122'].includes(id)).map(course).filter(Boolean).reduce((n,p)=>n+(ects(p)||0),0);if(passedCredits<180)issues.push(`Διπλωματική: ${passedCredits} καταχωρισμένα περασμένα ECTS έναντι του ελάχιστου 180 (σ. 25).`);issues.push('Η διπλωματική απαιτεί έγκριση του Τμήματος και επιβλέποντα.');}
 if(practice(c))issues.push('Πρακτική: χρεώνεται μόνο στο 8ο εξάμηνο ως μάθημα επιλογής. Έλεγξε και τις προϋποθέσεις της τρέχουσας προκήρυξης.');
 return issues;
}
function colorKey(c){return state.colorMode==='course'?c.id:`semester-${c.semester}`;}
// Selected courses get distinct slots: each keeps its catalog slot unless another selected course holds it.
function courseSlot(id){const index=cid=>data.catalog.findIndex(x=>x.id===cid)%COLORS.length,used=new Set();for(const cid of chosen()){let slot=index(cid);for(let k=0;k<COLORS.length&&used.has(slot);k++)slot=(slot+1)%COLORS.length;if(cid===id)return slot;used.add(slot);}return index(id);}
function baseColor(c){return state.colors[colorKey(c)]||COLORS[state.colorMode==='course'?courseSlot(c.id):(c.semester-1)%COLORS.length]||COLORS[0];}
// Ink or white on a full course-colour block, whichever has the higher WCAG contrast.
function onColor(hex){const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4),l=.2126*r+.7152*g+.0722*b;return (l+.05)/.0544>=1.05/(l+.05)?'#0e0e0e':'#ffffff';}
// The dark theme paints blocks as 90% hue over --surface (#181818, styles.css), so their text is picked against that fill.
const mixDark=h=>'#'+[1,3,5].map(i=>Math.round(parseInt(h.slice(i,i+2),16)*.9+0x18*.1).toString(16).padStart(2,'0')).join('');
function layoutEvents(events){
 const result=[];
 for(let day=0;day<5;day++){
  const sorted=events.filter(e=>e.day===day).map(e=>({...e})).sort((a,b)=>a.start-b.start||b.end-a.end||a.id.localeCompare(b.id));
  let group=[],groupEnd=-1;
  const flush=()=>{const ends=[];for(const e of group){let lane=ends.findIndex(end=>end<=e.start);if(lane<0)lane=ends.length;ends[lane]=e.end;e.lane=lane;}for(const e of group){e.lanes=ends.length;result.push(e);}group=[];};
  for(const e of sorted){if(e.start>=groupEnd&&group.length)flush();group.push(e);groupEnd=Math.max(group.length===1?-1:groupEnd,e.end);}if(group.length)flush();
 }
 return result;
}
function conflicts(events){const result=[];for(let i=0;i<events.length;i++)for(let j=i+1;j<events.length;j++){const a=events[i],b=events[j];if(a.day===b.day&&a.start<b.end&&b.start<a.end)result.push([a,b]);}return result;}
function contactMinutes(events){let total=0;for(let d=0;d<5;d++){const entries=events.filter(e=>e.day===d).sort((a,b)=>a.start-b.start);let end=-1;for(const e of entries){total+=Math.max(0,e.end-Math.max(end,e.start));end=Math.max(end,e.end);}}return total;}
let shownRows=[];
// An empty list always says why and offers the way out.
function noResults(filter,q,sem){
 const all=`<button class="link-button" data-show-all>${q?'Ψάξε σε όλο τον κατάλογο':'Δες όλο τον κατάλογο'}</button>`;
 if(filter==='passed'&&!q&&!sem)return `<p>Δεν έχεις σημειώσει περασμένα ακόμα.</p><button class="link-button" data-open-passed>Σημείωσε τα περασμένα σου</button>`;
 if(filter==='selected'&&!q&&!sem)return `<p>Δεν έχεις επιλέξει μαθήματα για το ${seasonName()}.</p>${all}`;
 if(filter==='offered'&&data[state.season].published===false&&!q)return `<p>Το ${seasonName()} ωρολόγιο δεν έχει δημοσιευτεί ακόμα.</p>${all}`;
 return `<p>Δεν βρέθηκαν μαθήματα με αυτά τα φίλτρα.</p>${filter==='all'&&!sem?'':all}`;
}
function renderList(){
 const focused=document.activeElement,focusKey=focused.closest('#courseList')&&['detail','toggle','passed'].find(key=>focused.dataset[key]),focusRow=focusKey?[...$('courseList').children].indexOf(focused.closest('.course')):-1;
 const q=norm($('search').value),sem=Number($('semesterFilter').value),filter=$('listFilter').value;
 const list=data.catalog.filter(c=>(!sem||c.semester===sem)&&(!q||norm(c.name+' '+c.id).includes(q))&&(filter==='all'||filter==='offered'&&available(c)||filter==='selected'&&chosen().includes(c.id)||filter==='passed'&&state.passed.includes(c.id)));
 $('catalogCount').textContent=`${list.length} / ${data.catalog.length}`;$('listStatus').textContent=list.length?`${list.length} μαθήματα στη λίστα`:'Δεν βρέθηκαν μαθήματα';
 $('listHelp').hidden=filter==='offered';$('listHelp').textContent=filter==='offered'?'':filter==='all'?'Ο πλήρης κατάλογος. Η απουσία ωρών επισημαίνεται.':filter==='passed'?'Τα περασμένα σου, και από τις δύο περιόδους.':'Οι επιλογές σου για αυτή την περίοδο.';
 const rows=list.map(c=>{const selected=chosen().includes(c.id),passed=state.passed.includes(c.id),missing=outstanding(c);const gapped=selected&&meetings(c.id).some(e=>!isLab(e)&&!included(e));return `<article class="course ${c.id===justToggled?'just':''} ${selected?'selected':''} ${passed?'passed':''} ${state.review.includes(c.id)?'review':''} ${gapped?'gapped':''}" data-course="${esc(c.id)}" style="--course-color:${baseColor(c)}"><span class="link-mark" aria-hidden="true"></span><div><button class="course-title" data-detail="${esc(c.id)}">${esc(c.name)}</button><div class="course-meta"><span>${esc(c.id)}</span><span class="sep" aria-hidden="true"></span><span>${c.semester}ο εξ.</span><span class="sep" aria-hidden="true"></span><span>${mandatory(c)?'Υποχρεωτικό':'Επιλογής'}</span></div><div class="course-meta"><span>${slotSummary(c)}</span><span class="credit-tag">${ects(c)??'?'} ECTS</span></div><div class="course-meta">${passed?`<span class="tag">${icon('check')}Περασμένο</span>`:''}${!available(c)?'<span class="tag">Χωρίς ώρες</span>':''}${selected&&needsLab(c)?`<button class="tag warn tag-action" data-detail="${esc(c.id)}">Διάλεξε εργαστήριο</button>`:''}${missing.length?`<span class="tag warn">${missing.length} προαπαιτούμενα προς έλεγχο</span>`:''}</div></div><button class="course-add" data-toggle="${esc(c.id)}" aria-label="${selected?'Αφαίρεση':'Προσθήκη'}: ${esc(c.name)}" aria-pressed="${selected}">${icon(selected?'minus':'plus')}</button>${filter==='all'||filter==='passed'?`<label class="course-pass"><input type="checkbox" data-passed="${esc(c.id)}" ${passed?'checked':''}>Το έχω περάσει</label>`:''}</article>`;}),box=$('courseList');
 // A toggle changes a row or two: while the list shows the same courses in the same order, only the rows whose markup
 // changed are replaced, so the rest of the list keeps its layout.
 if(rows.length&&rows.length===shownRows.length&&list.every((c,i)=>box.children[i]?.dataset.course===c.id))rows.forEach((html,i)=>{if(html!==shownRows[i])box.children[i].outerHTML=html;});
 else box.innerHTML=rows.join('')||`<div class="no-results">${noResults(filter,q,sem)}</div>`;
 shownRows=rows;
 // Focus stays on its control; if that row left the list, it moves to the row that took its place.
 if(focusKey)($('courseList').querySelector(`[data-${focusKey}="${CSS.escape(focused.dataset[focusKey])}"]`)||box.children[Math.min(focusRow,box.children.length-1)]?.querySelector('[data-toggle]')||$('search')).focus({preventScroll:true});
 hoveredCourse=$('courseList').querySelector('.course:hover')?.dataset.course||'';
 highlightCourse();
}
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
// The strong ease-out, read from styles.css (--ease) so the JS exits never drift from the CSS ones.
const rootStyle=getComputedStyle(document.documentElement),EASE=rootStyle.getPropertyValue('--ease').trim();
// Spring curve for entrances and moves (--spring, which styles.css already falls back to the ease-out on older engines).
const SPRING=rootStyle.getPropertyValue('--spring').trim();
let justToggled='',renderedSeason='';
const heroSub=document.querySelector('.hero-sub'),heroDefault=heroSub.textContent;
// The hero's sentence: what the chosen week holds at this moment, read off the timetable alone (it knows no holidays
// or exam weeks). Empty with no lessons chosen.
function nowLine(date=new Date()){
 const day=(date.getDay()+6)%7,minute=date.getHours()*60+date.getMinutes();
 const events=activeEvents().slice().sort((a,b)=>a.day-b.day||a.start-b.start);
 if(!events.length)return '';
 const what=e=>{const c=course(e.courseId);return `${c?c.name:e.courseId}${e.room?', '+e.room:''}.`;};
 const current=events.find(e=>e.day===day&&e.start<=minute&&minute<e.end);
 if(current)return `Τώρα, ως τις ${time(current.end)}: ${what(current)}`;
 const later=events.find(e=>e.day===day&&e.start>minute);
 if(later)return `Σήμερα στις ${time(later.start)}: ${what(later)}`;
 const next=events.find(e=>e.day>day)||events[0];
 return `${(next.day-day+7)%7===1?'Αύριο':DAYS[next.day]} στις ${time(next.start)}: ${what(next)}`;
}
const showNow=()=>{const text=nowLine()||heroDefault;if(heroSub.textContent!==text)heroSub.textContent=text;};
// Leave the way it came in, then hide; instant under reduced motion. The fill holds the last frame until hidden.
function exit(el,to,hide,duration=160){
 if(reducedMotion.matches){hide();return;}
 const leaving=el.animate(to,{duration,easing:EASE,fill:'forwards'}),done=()=>{hide();leaving.cancel();};
 leaving.finished.then(done,done);
}
// Stat values roll like an odometer: every digit is a column that springs to its new value.
function countTo(el,value,suffix=''){
 const to=Number(value),text=(Number.isInteger(to)?to:Math.round(to*10)/10).toLocaleString('el-GR')+suffix,shape=text.replace(/\d/g,'0');
 if(el.dataset.text===text)return;
 el.dataset.text=text;
 let odo=el.querySelector('.odo');
 if(odo?.dataset.shape!==shape){
  el.innerHTML=`<span class="sr-only">${esc(text)}</span><span class="odo" aria-hidden="true" data-shape="${esc(shape)}">${[...text].map((ch,i)=>/\d/.test(ch)?`<span class="digit" style="--i:${i}"><span></span></span>`:`<span>${esc(ch)}</span>`).join('')}</span>`;
  odo=el.querySelector('.odo');odo.getBoundingClientRect();
 }else el.firstElementChild.textContent=text;
 const digits=text.match(/\d/g)||[];
 odo.querySelectorAll('.digit').forEach((d,i)=>d.style.setProperty('--n',digits[i]));
}
// A course just added flies from its row swatch into each new slot of the week.
function fly(block,delay){
 const mark=$('courseList').querySelector(`[data-course="${CSS.escape(block.dataset.detail)}"] .link-mark`);
 if(!mark)return false;
 // Only fly to a slot the student can actually see: not under the header, a drawer or the phone sheet.
 const center=block.getBoundingClientRect(),hit=document.elementFromPoint(center.left+center.width/2,center.top+center.height/2);
 if(!hit||!block.contains(hit))return false;
 const from=mark.getBoundingClientRect(),to=block.getBoundingClientRect(),view=$('calendarWrap').getBoundingClientRect();
 const visible=r=>r.width>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;
 if(!visible(from)||!visible(to)||to.left<view.left-1||to.right>view.right+1)return false;
 const ghost=document.createElement('div'),shape=document.createElement('i');
 ghost.className='flight';ghost.setAttribute('aria-hidden','true');ghost.dataset.course=block.dataset.detail;ghost.dataset.season=state.season;
 ghost.style.cssText=`left:${to.left}px;top:${to.top}px;width:${to.width}px;height:${to.height}px;--event-color:${block.style.getPropertyValue('--event-color')}`;
 ghost.append(shape);document.body.append(ghost);
 const dx=from.left+from.width/2-to.left-to.width/2,dy=from.top+from.height/2-to.top-to.height/2,timing={duration:420,delay,fill:'backwards'};
 // Horizontal and vertical travel run on different curves, so the path bends into an arc.
 ghost.animate([{transform:`translateX(${dx}px)`},{transform:'none'}],{...timing,easing:'cubic-bezier(.55,0,.3,1)'});
 // The arc also leaves the page: the block swells toward the viewer mid-flight and comes back down onto its slot.
 ghost.animate({scale:['1','1.2','1']},{...timing,easing:'cubic-bezier(.45,0,.55,1)'});
 shape.animate([{transform:`translateY(${dy}px) scale(${from.width/to.width},${from.height/to.height})`,borderRadius:'3px'},{transform:'none',borderRadius:'10px'}],{...timing,easing:'cubic-bezier(.2,.8,.25,1)'}).finished.then(()=>ghost.remove(),()=>ghost.remove());
 stampIn(block,delay+380);
 return true;
}
// One landing for the planner's blocks, the same as a 3D tile dealt onto the planner (stamp() in week3d.js): seen from
// above, a block arrives a touch larger and presses down to size. Blocks are dealt Monday to Friday, DEAL ms apart.
const DEAL=40;
// It comes down from the floating shadow to lie flat, so it reads as landing rather than zooming.
function stampIn(block,delay){block.animate([{opacity:0,transform:'scale(1.1)',boxShadow:'var(--shadow-lg)'},{opacity:1,transform:'none'}],{duration:240,delay,easing:EASE,fill:'backwards'});}
// A removed block lifts away where it stood: it rises a touch toward the viewer as it fades. It is the detached block
// itself, so it looks exactly as it did.
function leave(block,rect,delay=0){
 if(!rect?.width)return;
 const ghost=document.createElement('div');
 ghost.className='leaving';ghost.inert=true;
 ghost.style.cssText=`left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
 // Important, to beat the phone agenda's auto-sized blocks.
 for(const [key,value] of Object.entries({top:'0',left:'0',width:'100%',height:'100%'}))block.style.setProperty(key,value,'important');
 ghost.append(block);document.body.append(ghost);
 // The fade runs on a plain ease so it stays readable; on the ease-out it would be gone in two frames.
 const fade=ghost.animate({opacity:0},{duration:180,delay,easing:'ease',fill:'forwards'});
 ghost.animate({transform:'scale(1.04)'},{duration:180,delay,easing:EASE,fill:'forwards'});
 fade.finished.then(()=>ghost.remove(),()=>ghost.remove());
}
// Course details grow out of the block or title that opened them.
function morphOpen(trigger,id){
 const dialog=$('courseDialog'),root=document.documentElement;
 if(dialog.open||!document.startViewTransition||reducedMotion.matches||printLayoutActive){openDetail(id);return;}
 root.dataset.vt='detail';trigger.style.viewTransitionName='course-detail';
 const transition=document.startViewTransition(()=>{trigger.style.viewTransitionName='';openDetail(id);dialog.style.viewTransitionName='course-detail';});
 // data-vt stays until the dialog closes: dropping it here would re-arm dialog[open]'s entrance and play it a second time.
 transition.ready.catch(()=>{});
 transition.finished.catch(()=>{}).finally(()=>{dialog.style.viewTransitionName='';trigger.style.viewTransitionName='';});
}
let printLayoutActive=false,hoveredCourse='';
function highlightCourse(){
 const id=hoveredCourse||document.activeElement.closest('.course')?.dataset.course;
 for(const block of $('calendar').querySelectorAll('.meeting'))block.classList.toggle('course-highlight',block.dataset.detail===id);
}
function fitCalendar(){
 const calendar=$('calendar'),wrap=$('calendarWrap'),panel=wrap.closest('.schedule-panel'),sheet=panel.parentElement;
 const printing=printLayoutActive||matchMedia('print').matches;
 // Red margin notes move beside the sheet only when the whole week still fits next to them.
 // Day columns are equal, so the busiest day sets the width every column needs (150px per lane).
 const aside=!printing&&panel.clientWidth-320>=54+5*(Number(calendar.style.getPropertyValue('--lane-max'))||1)*150+40;
 if(panel.classList.contains('notes-aside')!==aside){panel.classList.toggle('notes-aside',aside);if(aside)$('checks').open=true;$('checks').firstElementChild.tabIndex=aside?-1:0;}
 panel.style.removeProperty('--print-scale');
 panel.style.removeProperty('--print-width');
 if(printing){
  // Lay out full titles first, then shrink the complete panel to the A4 sheet.
  const lanes=Number(calendar.style.getPropertyValue('--lane-total'))||5;
  panel.style.setProperty('--print-width',Math.max(sheet.clientWidth,46+lanes*90)+'px');
 }
 calendar.style.removeProperty('--hour');
 if(!wrap.hidden){
  const hours=Number(calendar.style.getPropertyValue('--hours'));
  let hour=calendar.querySelector('.day-column').offsetHeight/hours,need=0;
  // Measure natural card content so short lessons grow the shared time scale too.
  calendar.classList.add('measuring');
  for(const block of calendar.querySelectorAll('.meeting')){
   const css=getComputedStyle(block),inset=['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((sum,key)=>sum+parseFloat(css[key]),0);
   const required=block.querySelector('.meeting-content').offsetHeight+inset+5;
   need=Math.max(need,required*60/Number(block.dataset.duration));
  }
  // Capped: one very short lesson must not stretch the whole week (short blocks drop their room in styles.css).
 hour=Math.max(hour,Math.min(need,110));
  calendar.style.setProperty('--hour',Math.ceil(hour)+'px');
  calendar.classList.remove('measuring');
  if(printing){
   const rest=panel.offsetHeight-calendar.querySelector('.day-column').offsetHeight;
   // Never below what the blocks' text needs; the zoom below absorbs any remainder.
   calendar.style.setProperty('--hour',Math.ceil(Math.max(need,Math.min(hour,(sheet.clientHeight-rest)/hours)))+'px');
  }
 }
 if(printing){
  // Widen the sheet by the height-driven zoom so the zoomed week still spans the page width.
  const fitHeight=Math.min(1,sheet.clientHeight/panel.offsetHeight);
  if(fitHeight<1)panel.style.setProperty('--print-width',panel.offsetWidth/fitHeight+'px');
  const scale=Math.min(1,sheet.clientWidth/panel.offsetWidth,sheet.clientHeight/panel.offsetHeight);
  panel.style.setProperty('--print-scale',String(Math.floor(scale*100000)/100000));
 }
}
// Beside the sheet the checks stay open: the summary is a heading there, not a toggle (keyboard included).
$('checks').firstElementChild.onclick=event=>{if(event.currentTarget.closest('.notes-aside'))event.preventDefault();};
// The skip link hands keyboard focus to the planner (smooth scrolling takes over the jump itself).
document.querySelector('.skip').addEventListener('click',()=>$('planner').focus({preventScroll:true}));
function renderSchedule(){
 // A flight whose course was removed (or whose season was left) mid-air must not land in an empty slot.
 for(const ghost of document.querySelectorAll('.flight'))if(ghost.dataset.season!==state.season||!chosen().includes(ghost.dataset.course))ghost.remove();
 // While the 3D week stands in for the planner's blocks (mid-scroll, week3d.js holds --blocks below 1), the change
 // lands in 3D alone: the hidden 2D blocks do not animate too.
 const wrap=$('calendarWrap'),covered3d=parseFloat(getComputedStyle(wrap).getPropertyValue('--blocks'))<1&&!wrap.matches(':focus-within');
 const animate=!reducedMotion.matches&&!printLayoutActive&&!matchMedia('print').matches&&!covered3d;
 // Within a season, removed blocks lift away and new overlaps pulse. A season switch re-deals the week: the old blocks
 // lift away together, then the new season's are dealt in, the whole deal held to about half a second.
 const was=renderedSeason,sameSeason=was===state.season,swap=animate&&was!==''&&!sameSeason;renderedSeason=state.season;
 const blocks=animate?[...$('calendar').querySelectorAll('.meeting')]:[];
 const previous=new Map(blocks.map(b=>[b.dataset.event,b.getBoundingClientRect()])),wasConflict=new Set(blocks.filter(b=>b.classList.contains('conflict')).map(b=>b.dataset.event));
 const events=activeEvents(),pairs=conflicts(events),conflictIds=new Set(pairs.flat().map(e=>e.id)),hadConflicts=parseInt($('conflictStat').dataset.text)>0;
 document.querySelector('.stats').classList.toggle('is-empty',!chosen().length);
 $('conflictJump').setAttribute('aria-label',`Επικαλύψεις: ${pairs.length}. Μετάβαση στον έλεγχο προγράμματος`);
 showNow();
 const noLab=chosen().map(course).filter(c=>c&&needsLab(c));
 // Also on the printed sheet: a week without its labs must say so on paper.
 $('labNote').hidden=!noLab.length;$('labNote').innerHTML=noLab.length?`${icon('warn')}<span>Χωρίς εργαστήριο στο πρόγραμμα: ${noLab.map(c=>`<button class="link-button" data-detail="${esc(c.id)}">${esc(c.id)}</button>`).join(', ')}. Οι ώρες και οι επικαλύψεις δεν το μετρούν ακόμα.</span>`:'';
 if(hadConflicts&&!pairs.length&&animate)$('conflictStat').animate([{transform:'scale(1)'},{transform:'scale(1.04)'},{transform:'scale(1)'}],{duration:300,easing:'cubic-bezier(.77,0,.175,1)'});
 countTo($('countStat'),chosen().length);countTo($('hoursStat'),Math.round(contactMinutes(events)/6)/10);countTo($('conflictStat'),pairs.length);$('conflictStat').classList.toggle('has-conflict',!!pairs.length);
 const reviewCount=chosen().filter(id=>state.review.includes(id)).length,passedCount=chosen().filter(id=>state.passed.includes(id)&&!state.review.includes(id)).length;
 $('countBreakdown').hidden=reviewCount+passedCount===0;
 $('countBreakdown').textContent=reviewCount+passedCount?`${declaration().length}${passedCount?' προς δήλωση':''}${reviewCount?' + '+reviewCount+' προς έλεγχο':''}${passedCount?' + '+passedCount+(passedCount===1?' περασμένο':' περασμένα'):''}`:'';
 
 $('emptyState').hidden=events.length>0;$('calendarWrap').hidden=events.length===0;
 if(!events.length){
  const unpublished=data[state.season].published===false;
  $('emptyState').querySelector('h3').textContent=chosen().length?'Οι επιλογές σου κρατήθηκαν.':unpublished?`Το ${seasonName()} δεν έχει δημοσιευτεί ακόμα.`:'Πρώτα, τα μαθήματά σου.';
  $('emptyState').querySelector('p').innerHTML=chosen().length?'Δεν υπάρχουν ενεργές ώρες για τις επιλογές σου.<br>Έλεγξε τη διαθεσιμότητα και τις συναντήσεις κάθε μαθήματος.':unpublished?'Μπορείς να διαλέγεις ήδη από τον πλήρη κατάλογο.<br>Οι ώρες θα μπουν εδώ μόλις δημοσιευτούν.':'Πάτησε + στη λίστα μαθημάτων.<br>Οι ώρες και οι αίθουσες θα μπουν αυτόματα εδώ.';
 }
 const min=Math.min(9*60,...events.map(e=>Math.floor(e.start/60)*60)),max=Math.max(22*60,...events.map(e=>Math.ceil(e.end/60)*60));
 const hours=(max-min)/60;$('calendar').style.setProperty('--hours',hours);
 const today=(new Date().getDay()+6)%7;
 let html='<div class="day-head time-head">Ώρα</div>'+DAYS.map((d,i)=>`<div class="day-head${i===today?' today':''}"${i===today?' title="Σήμερα"':''}><b>${d}</b><small>${i===today?'<span class="today-word">Σήμερα</span>':''}${events.filter(e=>e.day===i).length===1?'1 συνάντηση':events.filter(e=>e.day===i).length+' συναντήσεις'} · ${(contactMinutes(events.filter(e=>e.day===i))/60).toLocaleString('el-GR',{maximumFractionDigits:1})} ώρες</small></div>`).join('');
 html+='<div class="time-axis">'+Array.from({length:hours+1},(_,i)=>`<span class="time-tick" style="top:${i/hours*100}%">${time(min+i*60)}</span>`).join('')+'</div>';
 const laidOut=layoutEvents(events),partners=new Map();
 for(const [a,b] of pairs){partners.set(a.id,[...(partners.get(a.id)||[]),b.id]);partners.set(b.id,[...(partners.get(b.id)||[]),a.id]);}
 for(let d=0;d<5;d++)html+=`<div class="day-column${d===today?' today':''}">`+Array.from({length:hours},(_,i)=>`<span class="hour-rule" style="top:${i/hours*100}%"></span>`).join('')+laidOut.filter(e=>e.day===d).map(e=>{const c=course(e.courseId);if(!c)return '';const review=state.review.includes(c.id),clash=[...new Set((partners.get(e.id)||[]).map(id=>course(events.find(x=>x.id===id)?.courseId)?.name).filter(Boolean))];const detail=[`${DAYS[d]} ${time(e.start)}-${time(e.end)}`,c.name,e.type,e.room,e.teacher,clash.length?`επικάλυψη με ${clash.join(' και ')}`:'',review?'προς έλεγχο':''].filter(Boolean).join(', ');return `<button class="meeting ${conflictIds.has(e.id)?'conflict':''} ${review?'review':''}" data-detail="${esc(c.id)}" data-duration="${e.end-e.start}" data-event="${esc(e.id)}" data-partners="${esc((partners.get(e.id)||[]).join(' '))}" title="${esc(detail)}" aria-label="${esc(detail)}" style="top:calc(${(e.start-min)/(max-min)*100}% + 2px);height:calc(${(e.end-e.start)/(max-min)*100}% - 4px);left:calc(${e.lane/e.lanes*100}% + 3px);width:calc(${100/e.lanes}% - 6px);--event-color:${baseColor(c)};--event-on:${onColor(baseColor(c))};--event-on-dark:${onColor(mixDark(baseColor(c)))}"><span class="meeting-content"><span class="event-time"><span>${time(e.start)}<span class="event-end">-${time(e.end)}</span></span>${conflictIds.has(e.id)?icon('warn'):''}</span><strong class="full-title">${esc(hyphenate(c.name))}</strong><strong class="event-code">${esc(c.id).replace(/^(\D+)(?=\d)/,prefix=>`<span class="code-pre">${prefix}</span>`)}</strong><span class="event-room"><span class="event-type">${esc(e.type)}${e.type&&e.room?' · ':''}</span>${esc(e.room)}</span><span class="event-teacher">${esc(e.teacher)}</span></span></button>`;}).join('')+'</div>';
 $('calendar').innerHTML=html;
 // Day columns stay equal (styles.css); the lane total only sizes the print sheet and the notes-aside check.
 const dayLanes=[0,1,2,3,4].map(d=>Math.max(1,...laidOut.filter(e=>e.day===d).map(e=>e.lanes)));
 $('calendar').style.setProperty('--lane-total',dayLanes.reduce((a,b)=>a+b,0));
 $('calendar').style.setProperty('--lane-max',Math.max(...dayLanes));
 const legendCourses=chosen().map(course).filter(Boolean),seen=new Set();
 document.querySelector('.legend-bar>.subtle').hidden=!legendCourses.length;
 $('legend').innerHTML=legendCourses.filter(c=>{const key=colorKey(c);if(seen.has(key))return false;seen.add(key);return true;}).map(c=>`<label class="legend-item" style="--legend-bg:${baseColor(c)}"><span class="color-swatch" aria-hidden="true" style="background:${baseColor(c)}"></span><input type="color" value="${baseColor(c)}" data-color="${esc(colorKey(c))}" aria-label="Χρώμα ${esc(state.colorMode==='course'?c.name:c.semester+'ου εξαμήνου')}"><span>${esc(state.colorMode==='course'?c.id+' · '+c.name:c.semester+'ο εξάμηνο')}</span></label>`).join('')+(state.review.some(id=>chosen().includes(id))?'<span class="legend-item"><span class="legend-hatch" aria-hidden="true"></span>Προς έλεγχο</span>':'')+(pairs.length?'<span class="legend-item"><span class="legend-conflict" aria-hidden="true"></span>Κόκκινο περίγραμμα: επικάλυψη</span>':'');
 renderChecks(pairs);
 fitCalendar();
 highlightCourse();
 // The hero's 3D week (assets/week3d.js) rebuilds from this model.
 window.weekModel={min,max,events:laidOut.map(e=>{const c=course(e.courseId);return c&&{id:e.id,course:c.id,name:c.name,day:e.day,start:e.start,end:e.end,lane:e.lane,lanes:e.lanes,color:baseColor(c),conflict:conflictIds.has(e.id),review:state.review.includes(c.id)};}).filter(Boolean)};
 document.dispatchEvent(new Event('weekmodel'));
 // The sign-off is built from the week's own tiles: its blocks take the lessons' colours, Monday to Friday, each as
 // tall as its lesson is long. With no lessons they keep their plain grey.
 const lessons=window.weekModel.events.slice().sort((a,b)=>a.day-b.day||a.start-b.start),longest=Math.max(60,...lessons.map(e=>e.end-e.start));
 document.querySelectorAll('.sign-off b:not(.stop)').forEach((el,i)=>{
  const e=lessons[i%Math.max(1,lessons.length)];
  el.style.setProperty('--c',e?e.color:'');el.style.setProperty('--h',e?(.6+.4*(e.end-e.start)/longest).toFixed(2):'');
 });
 // landing: when the last newcomer arrives (a flight lands at ~380ms, a dealt block at ~150ms past its stagger).
 const all=[...$('calendar').querySelectorAll('.meeting')],step=swap?Math.min(DEAL,360/Math.max(1,all.length)):DEAL;
 let entering=0,landing=150;const clashing=[],placed=[];
 if(animate)for(const block of all){
  const old=previous.get(block.dataset.event),now=block.getBoundingClientRect();
  placed.push(now);
  if(old&&now.width&&now.height){
   const x=old.left-now.left,y=old.top-now.top,sx=old.width/now.width,sy=old.height/now.height;
   if(Math.abs(x)+Math.abs(y)+Math.abs(old.width-now.width)+Math.abs(old.height-now.height)>1)block.animate([{transform:`translate(${x}px,${y}px) scale(${sx},${sy})`,transformOrigin:'0 0'},{transform:'none',transformOrigin:'0 0'}],{duration:360,easing:SPRING});
   if(sameSeason&&block.classList.contains('conflict')&&!wasConflict.has(block.dataset.event))clashing.push(block);
  }else{
   // New blocks are dealt in, Monday to Friday (after the old week has lifted away, on a season switch).
   const delay=swap?120+entering++*step:Math.min(entering++,12)*step,flew=block.dataset.detail===justToggled&&chosen().includes(justToggled)&&fly(block,delay);
   if(!flew)stampIn(block,delay);
   landing=Math.max(landing,delay+(flew?380:150));
  }
 }
 if(swap&&!phone.matches)blocks.forEach((b,i)=>leave(b,previous.get(b.dataset.event),Math.min(i*8,120)));
 // Already on the week and now overlapping: its red ring pulses inward once, as the newcomer lands.
 for(const block of clashing)block.animate([{outlineOffset:'-2px'},{outlineOffset:'-6px'},{outlineOffset:'-2px'}],{duration:400,delay:landing,easing:'cubic-bezier(.77,0,.175,1)'});
 // Removed blocks lift away where they stood, unless something moves into that spot (the phone agenda closing the gap,
 // a neighbour widening into a freed lane): the fade would double-expose over it.
 if(animate&&sameSeason&&events.length&&!phone.matches){
  const kept=new Set(all.map(b=>b.dataset.event));
  const covered=r=>placed.some(p=>p.left<r.right-2&&p.right>r.left+2&&p.top<r.bottom-2&&p.bottom>r.top+2);
  for(const b of blocks){const r=previous.get(b.dataset.event);if(!kept.has(b.dataset.event)&&!covered(r))leave(b,r);}
 }
}
function renderChecks(pairs){
 const issues=[],selected=chosen().map(course).filter(Boolean),planned=declaration().map(course).filter(Boolean),plannedIds=planned.map(c=>c.id),review=selected.filter(c=>state.review.includes(c.id)),passed=selected.filter(c=>state.passed.includes(c.id)&&!state.review.includes(c.id)),offer=data.catalog.filter(available);
 const allocatedCourses=[...new Set([...state.passed,...plannedIds])].map(course).filter(Boolean);
 const courseLabel=c=>`${c.name}${state.review.includes(c.id)?' (προς έλεγχο)':''}`;
 for(const c of selected){for(const issue of courseIssues(c))issues.push({group:'course',ids:[c.id],text:`${courseLabel(c)}: ${issue}`});if(needsLab(c))issues.push({group:'course',ids:[c.id],text:`${courseLabel(c)}: υπάρχουν εργαστηριακές ζώνες. Διάλεξε το τμήμα σου· δεν προστέθηκαν αυτόματα.`});if(meetings(c.id).some(e=>!isLab(e)&&!included(e)))issues.push({group:'course',ids:[c.id],text:`${courseLabel(c)}: έχεις κρύψει μία ή περισσότερες συναντήσεις της επίσημης πηγής.`});}
 for(const c of selected)if(staleMeetings(c.id).length)issues.push({group:'course',ids:[c.id],text:`${courseLabel(c)}: άλλαξαν ή αφαιρέθηκαν συναντήσεις, οπότε οι παλιές σου επιλογές μπορεί να μην ισχύουν. Διάλεξέ τις ξανά.`});
 for(const c of [...new Set([...state.passed,...chosen()])].map(course).filter(Boolean))if(invalidCredit(c))issues.push({group:'course',ids:[c.id],text:`${c.name}: η αποθηκευμένη χρέωση στο ${state.creditTo[c.id]}ο δεν είναι έγκυρη και δεν προσμετράται. Επιτρεπτά εξάμηνα: ${creditOptions(c).join(', ')}.`});
 for(const [a,b]of pairs)issues.push({tone:'danger',group:'conflict',ids:[a.courseId,b.courseId],text:`${DAYS[a.day]} ${time(Math.max(a.start,b.start))}-${time(Math.min(a.end,b.end))}: ${course(a.courseId)?.name} / ${course(b.courseId)?.name}${state.review.includes(a.courseId)||state.review.includes(b.courseId)?' (περιλαμβάνει μάθημα προς έλεγχο)':''}.`});
 if(selected.length&&!state.entryYear)issues.push({group:'profile',text:'Συμπλήρωσε έτος εισαγωγής στο προφίλ για τους κανόνες δήλωσης.'});
 if(planned.length>9&&!state.entryYear)issues.push({group:'profile',text:`Έχεις ${planned.length} μαθήματα προς δήλωση· για εισαγωγή από το 2023-24 το όριο είναι 9. Συμπλήρωσε έτος εισαγωγής για τον πλήρη έλεγχο.`});
 if(selected.length&&!state.passedComplete)issues.push({group:'profile',text:'Η λίστα περασμένων δεν έχει επιβεβαιωθεί ως πλήρης. Οι έλεγχοι προαπαιτουμένων είναι ενδείξεις.'});
 if(state.entryYear==='new'&&planned.length){
  const count=planned.filter(c=>c.id!=='ECE588'&&ects(c)!==0).length;
  if(count>9)issues.push(`Όριο δήλωσης για εισαγωγή από 2023-24: ${count} μαθήματα με ECTS, με μέγιστο 9 ανά εξάμηνο, εκτός διπλωματικής.`);
  const english=state.season==='fall'?'ECE121':'ECE122';if(!state.passed.includes(english)&&!plannedIds.includes(english))issues.push(`${english}: απαιτείται δήλωση του οφειλόμενου μαθήματος Αγγλικών στην αντίστοιχη περίοδο. Οι τρέχοντες μεταβατικοί κανόνες το αναφέρουν με 2 ECTS.`);
  const missing=offer.filter(c=>mandatory(c)&&!state.passed.includes(c.id)&&!plannedIds.includes(c.id)&&prerequisites(c)!==null&&!outstanding(c).length&&(!state.studySemester||c.semester<=Number(state.studySemester)));
  if(planned.some(c=>!mandatory(c))&&missing.length)issues.push(`Προτεραιότητα υποχρεωτικών (σ. 20): δεν έχουν επιλεγεί ${missing.map(c=>c.id).join(', ')}. Η διαθεσιμότητα ελέγχεται από το ωρολόγιο και τα καταχωρισμένα περασμένα.`);
  const unassigned=allocatedCourses.filter(c=>!mandatory(c)&&c.id!=='ECE588'&&credited(c)===null);
  if(unassigned.length)issues.push(`Δεν έχει οριστεί χρέωση (σε ποιο εξάμηνο μετρά το μάθημα στο πτυχίο) ή υπάρχει μη έγκυρη χρέωση για ${unassigned.map(c=>c.id+' · '+c.name).join(', ')}. Το εξάμηνο του καταλόγου δεν θεωρείται χρέωση. Όρισε στις λεπτομέρειες το εξάμηνο που καλύπτει κάθε επιλογής· δεν μπορεί ακόμη να επιβεβαιωθεί η κάλυψη προηγούμενων εξαμήνων.`);
  const allocations=Array.from({length:9},(_,i)=>({sem:i+1,items:allocatedCourses.filter(c=>!['ECE121','ECE122'].includes(c.id)&&credited(c)===i+1)}));
  for(const a of allocations)if(a.items.length>5)issues.push(`Χρέωση ${a.sem}ου εξαμήνου: ${a.items.length} περασμένα ή προς δήλωση για 5 θέσεις πτυχίου (${a.items.map(c=>c.id).join(', ')}). Πρόκειται για θέσεις αυτού του εξαμήνου στο πτυχίο, όχι για το σύνολο μαθημάτων που δίνεις τώρα. Έλεγξε τις χρεώσεις των επιλογής στις λεπτομέρειες.`);
  for(const a of allocations.filter(a=>a.sem>=5)){
   const capacity=a.sem<=6?2:5,count=a.items.filter(c=>!mandatory(c)).length;
   if(count>capacity&&a.items.length<=5)issues.push(`Χρέωση ${a.sem}ου εξαμήνου: ${count} επιλογής για ${capacity} θέσεις επιλογής. Τα οφειλόμενα υποχρεωτικά δεν δημιουργούν επιπλέον θέσεις επιλογής.`);
   if(count<capacity&&planned.some(c=>credited(c)>a.sem&&credited(c)%2===a.sem%2)&&!unassigned.some(c=>creditOptions(c).includes(a.sem)))issues.push(`Κάλυψη επιλογής ${a.sem}ου εξαμήνου: ${count}/${capacity} θέσεις από περασμένα και προς δήλωση${state.passedComplete?'':' με μη επιβεβαιωμένη λίστα περασμένων'}. Πριν χρεώσεις επιλογές σε επόμενο εξάμηνο, έλεγξε τις ${capacity-count} ακάλυπτες θέσεις και ποια μαθήματα είναι διαθέσιμα στην Ηλεκτρονική Γραμματεία.`);
  }
  const ordered=planned.filter(c=>missing.some(m=>m.semester<credited(c)));if(ordered.length)issues.push('Σειρά εξαμήνων (σ. 20): έχουν μείνει διαθέσιμα υποχρεωτικά προηγούμενων εξαμήνων. Ο πλήρης έλεγχος σειράς και κάλυψης επιλογών χρειάζεται επιβεβαίωση στη Γραμματεία.');
 }
 const specials=allocatedCourses.filter(special);
 if(specials.length>2)issues.push('Έχουν σημειωθεί περισσότερα από δύο «Ειδικά Θέματα - Εργασίες» συνολικά (οδηγός σ. 21).');
 if(state.entryYear==='old'&&selected.length)issues.push({group:'profile',text:'Οι κανόνες δήλωσης στη σ. 20 αφορούν εισαγωγή από το 2023-24. Για προηγούμενα έτη απαιτείται ο αντίστοιχος κανονισμός.'});
 const credits=planned.reduce((n,c)=>n+(ects(c)||0),0),unknown=planned.filter(c=>ects(c)===null).length;
 countTo($('creditsStat'),credits,unknown?'+?':'');
 $('creditsStat').title='ECTS των μαθημάτων προς δήλωση, χωρίς τα προς έλεγχο και τα περασμένα';
 $('checkBadge').dataset.tone=pairs.length?'danger':issues.length?'warning':selected.length?'success':'neutral';$('checkBadge').innerHTML=(pairs.length?icon('warn'):'')+(issues.length?(issues.length===1?'1 ένδειξη':`${issues.length} ενδείξεις`):selected.length?'Χωρίς εντοπισμένες ενδείξεις':'Χωρίς μαθήματα ακόμα');
 // Conflicts first, then what can be fixed on a course, then the profile, then the rules; each item links to its fix.
 const issueGroups=[['conflict','Επικαλύψεις'],['course','Ανά μάθημα'],['profile','Προφίλ'],['rules','Κανόνες δήλωσης']].map(([key,label])=>{
  const items=issues.filter(x=>(x.group||'rules')===key);
  return items.length?`<h3 class="check-group">${label} (${items.length})</h3><ul>${items.map(x=>{const actions=key==='profile'?'<button class="link-button" data-open-profile>Άνοιγμα προφίλ</button>':(x.ids||[]).map(id=>`<button class="link-button" data-detail="${esc(id)}">${x.ids.length>1?esc(id):'Άνοιγμα μαθήματος'}</button>`).join(' ');return `<li class="${x.tone||'warning'}">${x.tone==='danger'?icon('warn'):''}${esc(x.text||x)}${actions?` <span class="check-actions">${actions}</span>`:''}</li>`;}).join('')}</ul>`:'';
 }).join('');
 $('checkContent').innerHTML=`<p><b>Προς δήλωση: ${planned.length} μαθήματα</b>${review.length?` · ${review.length} προς έλεγχο, εκτός υπολογισμού δήλωσης`:""}${passed.length?` · ${passed.length} ${passed.length===1?'περασμένο':'περασμένα'}, μόνο στο ωρολόγιο`:''}.</p><p class="subtle">${credits} γνωστά ECTS προς δήλωση${unknown?` · ${unknown} μαθήματα με άγνωστα ECTS`:''}. Οι ώρες και οι επικαλύψεις περιλαμβάνουν όλα τα μαθήματα του ωρολογίου, μαζί με τα προς έλεγχο και τα περασμένα. Οι ώρες μετρούν τον χρόνο παρουσίας χωρίς διπλή μέτρηση επικαλύψεων. Οι επικαλύψεις μετρούν ζεύγη συναντήσεων.</p>`+(issues.length?issueGroups:`<p class="subtle">Δεν εντοπίστηκαν ενδείξεις με τα καταχωρισμένα στοιχεία.</p>${selected.length?'<p><button class="primary" data-print>Εκτύπωση προγράμματος</button></p>':''}`)+'<p class="subtle">Συμβουλευτικός έλεγχος με βάση τον οδηγό 2024-25 και τους τρέχοντες μεταβατικούς κανόνες δήλωσης για εισαγωγή από 2023-24 (έλεγχος 18/09/2026). Δεν πιστοποιεί δικαίωμα δήλωσης. Η ανανέωση αφορά το ωρολόγιο και τον κατάλογο, όχι τους κανόνες του οδηγού. <button class="link-button" data-guide>Πεδίο ελέγχων και πηγές</button></p>';
}
function render(){
 for(const b of document.querySelectorAll('button[data-season]'))b.setAttribute('aria-pressed',String(b.dataset.season===state.season));
 // The poster's field is the season's colour (styles.css); the key lets index.html colour the very first paint.
 const root=document.documentElement;
 if(root.dataset.season!==state.season){root.dataset.season=state.season;try{localStorage.setItem('thmmy-planner-season',state.season);}catch{}globalThis.applyTheme?.();}
 const snapshot=data[state.season];$('syncMeta').textContent='Τελευταία ενημέρωση: '+dateText(snapshot.fetchedAt);
 // The printed title says which season and data date it shows (styles.css, print).
 $('scheduleTitle').dataset.print=document.querySelector(`.season-switch [data-season="${state.season}"]`).textContent+' · πηγή '+dateText(snapshot.fetchedAt);
 $('periodLabel').textContent=`${new Set(snapshot.events.map(e=>e.courseId)).size} μαθήματα με δημοσιευμένες ώρες`;
 const skipped=snapshot.skipped||[];
 $('availabilityNote').hidden=snapshot.published!==false&&!skipped.length;
 $('availabilityNote').textContent=snapshot.published===false?`Η επίσημη σελίδα του ${seasonName(true)} που ανακτήθηκε είναι κενή. Δεν υπάρχουν δημοσιευμένες ώρες σε αυτή την πηγή. Οι επιλογές παραμένουν διαθέσιμες στον πλήρη κατάλογο.`:`Η επίσημη πηγή έχει ${skipped.length===1?'μία γραμμή με μη έγκυρη ώρα, που δεν μπήκε':skipped.length+' γραμμές με μη έγκυρη ώρα, που δεν μπήκαν'} στο πρόγραμμα: ${skipped.map(s=>`${s.name} (${DAYS[s.day]} ${s.time})`).join(', ')}.`;
 $('colorMode').value=state.colorMode;$('provider').value=state.provider;
 $('profileButton').querySelector('.btn-label').textContent=state.studySemester?`Προφίλ · ${state.studySemester}ο εξάμηνο`:'Το προφίλ σπουδών μου';
 $('railFabCount').textContent=chosen().length;$('railFabCount').hidden=!chosen().length;
 // The back pages' two live figures; an HTML backup leaves those pages (and their pictures) out.
 if($('stepsCatalog')){$('stepsCatalog').textContent=data.catalog.length;$('placeMeta').textContent=dateText(snapshot.fetchedAt);}
 renderList();renderSchedule();renderSources();
}
function toggleCourse(id,flourish=true){state.selected[state.season]=setIn(chosen(),id,!chosen().includes(id));persist();justToggled=flourish?id:'';render();justToggled='';if(detailId===id&&$('courseDialog').open)renderDetail(id);}
function setPassed(id,on){state.passed=setIn(state.passed,id,on);persist();render();syncPassedChecklist();if(detailId===id&&$('courseDialog').open)renderDetail(id);}
// The profile's checklist of passed courses, grouped by semester, with one tick for a whole semester.
function renderPassedChecklist(){
 const semesters=[...new Set(data.catalog.filter(c=>!c.archived).map(c=>c.semester))].sort((a,b)=>a-b);
 $('passedChecklist').innerHTML=semesters.map(s=>`<fieldset class="passed-semester"><legend>${s}ο εξάμηνο</legend><label class="check-label passed-all"><input type="checkbox" data-pass-all="${s}">Τα πέρασα όλα</label>${data.catalog.filter(c=>c.semester===s&&!c.archived).map(c=>`<label class="check-label"><input type="checkbox" data-passed="${esc(c.id)}">${esc(c.id)} · ${esc(c.name)}</label>`).join('')}</fieldset>`).join('');
 syncPassedChecklist();
}
function syncPassedChecklist(){
 const box=$('passedChecklist');$('passedCount').textContent=state.passed.length;
 for(const input of box.querySelectorAll('[data-passed]'))input.checked=state.passed.includes(input.dataset.passed);
 for(const input of box.querySelectorAll('[data-pass-all]')){const ids=data.catalog.filter(c=>c.semester===Number(input.dataset.passAll)&&!c.archived).map(c=>c.id),done=ids.filter(id=>state.passed.includes(id)).length;input.checked=done===ids.length;input.indeterminate=done>0&&done<ids.length;}
}
function openProfile(showPassed=false){$('entryYear').value=state.entryYear;$('studySemester').value=state.studySemester;$('passedComplete').checked=state.passedComplete;renderPassedChecklist();$('passedPanel').open=showPassed;$('profileDialog').showModal();}
function resetMeetings(id){const prefix=state.season+'|'+id+'|';for(const key of ['labs','excluded'])state[key]=state[key].filter(value=>!value.startsWith(prefix));persist();render();renderDetail(id);}
function renderDetail(id){
 const c=course(id);if(!c)return;detailId=id;const g=guideCourse(id),pre=prerequisites(c),list=meetings(id);
 $('detailCode').innerHTML=[c.id,`${c.semester}ο εξάμηνο`,mandatory(c)?'Υποχρεωτικό':'Επιλογής',...(ects(c)!==null?[ects(c)+' ECTS']:[])].map(part=>`<span>${esc(part)}</span>`).join('');$('detailName').textContent=c.name;
 let html=`<div class="detail-actions"><button class="primary" data-toggle="${esc(id)}">${chosen().includes(id)?icon('minus')+'Αφαίρεση από πρόγραμμα':icon('plus')+'Προσθήκη στο πρόγραμμα'}</button><label class="check-label"><input type="checkbox" data-passed="${esc(id)}" ${state.passed.includes(id)?'checked':''}>Το έχω περάσει</label></div>`;
 html+=`<label class="check-label"><input type="checkbox" data-review="${esc(id)}" ${state.review.includes(id)?'checked':''}>Προς έλεγχο: στο ωρολόγιο, εκτός σχεδίου δήλωσης</label>`;
 if(!mandatory(c)&&c.semester>=5){const options=creditOptions(c);html+=`<label style="margin-top:15px">Χρέωση μαθήματος στο εξάμηνο<select data-credit="${esc(id)}"><option value="" ${credited(c)===null?'selected':''}>Δεν έχει οριστεί</option>${options.map(s=>`<option value="${s}" ${credited(c)===s?'selected':''}>${s}ο εξάμηνο</option>`).join('')}</select></label><p class="subtle">${practice(c)?'Η Πρακτική Άσκηση καλύπτει αποκλειστικά μία θέση επιλογής του 8ου εξαμήνου, σύμφωνα με την τρέχουσα ρύθμιση του Τμήματος.':special(c)?'Τα «Ειδικά Θέματα - Εργασίες» χρεώνονται στο 7ο/9ο για χειμερινά ή στο 6ο/8ο για εαρινά.':'Όρισε το εξάμηνο που καλύπτει στο πτυχίο σου, όχι αυτό του καταλόγου. Π.χ. επιλογής του 5ου ή 9ου μπορεί να χρεωθεί στο 7ο (οδηγός σ. 21).'} Η χρέωση ισχύει και για περασμένα· τα οφειλόμενα υποχρεωτικά κρατούν το δικό τους εξάμηνο.</p>${invalidCredit(c)?`<p role="alert">Η αποθηκευμένη χρέωση στο ${esc(state.creditTo[id])}ο δεν είναι έγκυρη και δεν προσμετράται. Επίλεξε ένα επιτρεπτό εξάμηνο.</p>`:''}`;}
 html+='<h3>Προαπαιτούμενα</h3>';
 html+=pre===null?'<p>Δεν βρέθηκαν επαληθευμένα στοιχεία στον οδηγό 2024-25. Έλεγξε την επίσημη περιγραφή.</p>':pre.length?'<ul>'+pre.map(p=>`<li>${icon(state.passed.includes(p)?'check':'circle')}${esc(p)} · ${esc(course(p)?.name||'Μάθημα εκτός τρέχοντος καταλόγου')}${state.passed.includes(p)?' (περασμένο)':''}</li>`).join('')+'</ul>':'<p>Κανένα, σύμφωνα με τον οδηγό 2024-25.</p>';
 if(g)html+=`<p class="subtle">Πηγή: οδηγός σπουδών 2024-25, σ. ${esc((g.pages||[]).join(', '))}. ${pre&&pre.length?esc(g.prerequisiteText||''):''}</p>`;
 html+='<h3>Συναντήσεις στην επίσημη πηγή</h3><p class="subtle">Οι διαλέξεις και τα φροντιστήρια μπαίνουν αυτόματα. Για εργαστήρια, διάλεξε τις ζώνες του τμήματός σου. Μια πολύωρη ζώνη μπορεί να περιλαμβάνει περισσότερες ομάδες· επιβεβαίωσε το ακριβές τμήμα με τον διδάσκοντα.</p>';
 if(staleMeetings(id).length)html+=`<p role="alert">Οι παλιές επιλογές δεν αντιστοιχίστηκαν με βεβαιότητα στο νέο ωρολόγιο. Η επαναφορά εμφανίζει τις διαλέξεις και τα φροντιστήρια και αποεπιλέγει τα εργαστήρια αυτού του μαθήματος· μετά διάλεξε ξανά τις συναντήσεις σου.</p><button data-reset-meetings="${esc(id)}">Επαναφορά συναντήσεων αυτού του μαθήματος</button>`;
 html+=list.length?list.slice().sort((a,b)=>a.day-b.day||a.start-b.start).map(e=>`<label class="meeting-option"><input type="checkbox" data-meeting="${esc(e.id)}" ${included(e)?'checked':''}><span><b>${DAYS[e.day]} ${time(e.start)}-${time(e.end)}</b><small>${esc([e.type,e.room].filter(Boolean).join(' · '))}</small><small>${esc(e.teacher)}</small></span></label>`).join(''):'<p>Δεν υπάρχουν δημοσιευμένες ώρες για αυτό το μάθημα στην επιλεγμένη περίοδο.</p>';
 const url=c.url||SOURCES.catalog;html+=`<p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Επίσημη περιγραφή μαθήματος${icon('ext')}</a></p>`;
 $('detailBody').innerHTML=html;
}
function openDetail(id){renderDetail(id);if(!$('courseDialog').open)$('courseDialog').showModal();}
// Dialogs fade and drop on close (phone sheets slide back down) instead of vanishing.
function closeDialog(dialog){
 if(!dialog.open||dialog.classList.contains('closing'))return;
 dialog.classList.add('closing');
 const sheet=phone.matches;
 exit(dialog,sheet?{transform:'translateY(100%)'}:{opacity:0,transform:'translateY(8px) scale(.98)'},()=>{dialog.close();dialog.classList.remove('closing');},sheet?200:160);
}
function renderSources(){const labels={fall:'Χειμερινό ωρολόγιο ανά έτος',spring:'Εαρινό ωρολόγιο ανά έτος',catalog:'Πλήρης κατάλογος μαθημάτων'};$('sourceLinks').innerHTML=Object.entries(SOURCES).map(([kind,url])=>`<div><a href="${url}" target="_blank" rel="noopener noreferrer">${labels[kind]}${icon('ext')}</a><small>Ανακτήθηκε ${dateText(kind==='catalog'?data.catalogFetchedAt:data[kind].fetchedAt)}</small></div>`).join('');}
function renderGuide(){
 $('guideContent').innerHTML=`<p>Οι παρακάτω έλεγχοι βασίζονται στον οδηγό <b>2024-25</b> που δόθηκε με την εφαρμογή. Η σημερινή προσφορά μαθημάτων και οι ώρες προκύπτουν από τα επίσημα ωρολόγια.</p><div class="guide-rule"><p><b>Προαπαιτούμενα · σ. 21, 25</b><br>Πρέπει να έχουν περαστεί σε προηγούμενο εξάμηνο. Η εφαρμογή συγκρίνει τους κωδικούς του οδηγού με όσα έχεις σημειώσει περασμένα.</p></div><div class="guide-rule"><p><b>Για εισαγωγή από το 2023-24 · σ. 20-21</b><br>Έως 9 μαθήματα με ECTS ανά περίοδο, πέρα από διπλωματική. Προτεραιότητα στα διαθέσιμα υποχρεωτικά και σειρά εξαμήνων. Δηλώνεται και το οφειλόμενο μάθημα Αγγλικών της αντίστοιχης περιόδου. Οι τρέχοντες <a href="https://www.e-ce.uth.gr/studies/undergraduate/" target="_blank" rel="noopener noreferrer">μεταβατικοί κανόνες του Τμήματος</a> το αναφέρουν με 2 ECTS, σε αντίθεση με τα 0 ECTS του οδηγού 2024-25· για εισαγωγή από 2023-24 η εφαρμογή το μετρά στο όριο των 9.</p></div><div class="guide-rule"><p><b>Επιλογής · σ. 21</b><br>Στο 5ο, 7ο και 9ο μπορούν να χρεωθούν επιλογής από τα 5ο/7ο/9ο. Στο 6ο και 8ο, από τα 6ο/8ο. Ορίζεις τη χρέωση στις λεπτομέρειες. Χωρίς ρητή χρέωση, η εφαρμογή δεν χρησιμοποιεί το εξάμηνο του καταλόγου ως εξάμηνο πτυχίου. Τα οφειλόμενα υποχρεωτικά προηγούμενων εξαμήνων μετρούν στο συνολικό όριο δήλωσης, όχι στις πέντε θέσεις επιλογής του 7ου. Έως δύο «Ειδικά Θέματα - Εργασίες» συνολικά, με έγκριση επιβλέποντα και την επίσημη διαδικασία αιτήσεων.</p></div><div class="guide-rule"><p><b>Διπλωματική · σ. 25</b><br>Τουλάχιστον 180 περασμένα ECTS και έγκριση του Τμήματος. Δεν δημιουργούνται πλασματικές εβδομαδιαίες ώρες για διπλωματική ή πρακτική.</p></div><p>Τα «προς έλεγχο» και τα ήδη περασμένα παραμένουν στο ωρολόγιο, αλλά δεν προσμετρώνται στο σχέδιο δήλωσης ή στα ECTS της δήλωσης. Τα περασμένα εξακολουθούν να καλύπτουν τις αντίστοιχες θέσεις πτυχίου και τα προαπαιτούμενα. Οι δοκιμαστικές επιλογές δεν καλύπτουν υποχρεώσεις δήλωσης. Αφαίρεσε τη σήμανση όταν αποφασίσεις να τα δηλώσεις.</p><h3>Τι ελέγχεται αυτόματα</h3><p>Επικαλύψεις ενεργών συναντήσεων, προαπαιτούμενα που λείπουν από τα περασμένα, απουσία από το ωρολόγιο, όριο 9 μαθημάτων για το αντίστοιχο έτος εισαγωγής, Αγγλικά, διαθέσιμα υποχρεωτικά που παραλείφθηκαν, πάνω από 5 μαθήματα χρεωμένα ανά εξάμηνο, πάνω από 2 επιλογής στο 5ο/6ο ή 5 επιλογής στο 7ο/8ο/9ο, ενδείξεις ακάλυπτων προηγούμενων θέσεων επιλογής και πάνω από 2 ειδικά θέματα-εργασίες. Οι ασαφείς ή ελλιπείς χρεώσεις επισημαίνονται χωρίς να θεωρούνται βέβαια κενά. Η Πρακτική Άσκηση χρεώνεται μόνο στο 8ο, σύμφωνα με την τρέχουσα ρύθμιση του Τμήματος.</p><h3>Τι χρειάζεται επιβεβαίωση</h3><p>Κανόνες εισαγωγής πριν το 2023-24, μεταβατικές διατάξεις, μερική φοίτηση, πλήρης σειρά δηλώσεων επιλογής, απαιτήσεις γνωστικών τομέων/αποφοίτησης, αλλαγές μετά το 2024-25 και εγκρίσεις διπλωματικής ή ειδικών θεμάτων. Η λίστα περασμένων δεν είναι αναλυτική βαθμολογία και οι προειδοποιήσεις δεν αποκλείουν την προσθήκη μαθημάτων.</p><p class="subtle">Ο ενσωματωμένος οδηγός περιλαμβάνει ${GUIDE.courses?.length||0} καταχωρίσεις μαθημάτων. Όταν ένα μάθημα δεν καλύπτεται, εμφανίζεται «δεν υπάρχουν επαληθευμένα στοιχεία», όχι «κανένα προαπαιτούμενο».</p>`;
}
async function fetchSource(kind,provider){
 const url=SOURCES[kind],controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{let endpoint=url,headers={};if(provider==='jina'){endpoint='https://r.jina.ai/'+url;headers={'X-Respond-With':'html','X-No-Cache':'true'};}else if(provider==='allorigins')endpoint='https://allorigins.hexlet.app/raw?url='+encodeURIComponent(url);
  const response=await fetch(endpoint,{headers,signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}`);const text=await response.text();if(text.length>4000000)throw new Error('Το αρχείο υπερβαίνει το επιτρεπόμενο μέγεθος.');return text;
 }finally{clearTimeout(timeout);}
}
// Tries the services in turn until one gives a page that parses and looks right. If none does, a page that came back
// wrong says more than a service that could not be reached.
async function fromAnyService(services,attempt){
 const errors=[];
 for(const service of services){try{return {service,value:await attempt(service)};}catch(error){errors.push(error);}}
 throw errors.find(e=>e.name!=='AbortError'&&!(e instanceof TypeError)&&!/^HTTP/.test(e.message))||errors[0];
}
function preserveCatalog(next){const ids=new Set(next.map(c=>c.id));for(const c of data.catalog)if(!ids.has(c.id)&&[...state.passed,...state.selected.fall,...state.selected.spring].includes(c.id))next.push({...c,archived:true});return next;}
// What a refresh or import changed against the previous data, for the report under the notice.
function sourceChanges(before,after,replacements){
 const changes=[],catalog=new Map([...before.catalog,...after.catalog].map(c=>[c.id,c]));
 const title=id=>catalog.get(id)?.name||id;
 const slot=e=>`${DAYS[e.day]} ${time(e.start)}-${time(e.end)}`;
 const meeting=e=>`${slot(e)}, ${e.type}${e.room?', '+e.room:''}`;
 for(const season of ['fall','spring']){
  const next=new Map(after[season].events.map(e=>[e.id,e])),matched=new Set();
  for(const old of before[season].events){
   const current=next.get(replacements.get(old.id)||old.id);
   if(!current){changes.push({kind:'removed',season,courseId:old.courseId,name:title(old.courseId),detail:meeting(old)});continue;}
   matched.add(current.id);
   const differences=[];
   if(slot(old)!==slot(current))differences.push(`${slot(old)} → ${slot(current)}`);
   for(const [field,label] of [['type','τύπος'],['room','αίθουσα'],['teacher','διδάσκων'],['semester','εξάμηνο']])if(old[field]!==current[field])differences.push(`${label}: ${old[field]||'-'} → ${current[field]||'-'}`);
   if(differences.length)changes.push({kind:'changed',season,courseId:old.courseId,name:title(old.courseId),detail:differences.join(' · ')});
  }
  for(const event of after[season].events)if(!matched.has(event.id))changes.push({kind:'added',season,courseId:event.courseId,name:title(event.courseId),detail:meeting(event)});
 }
 const oldCourses=new Map(before.catalog.filter(c=>!c.archived).map(c=>[c.id,c]));
 const newCourses=new Map(after.catalog.filter(c=>!c.archived).map(c=>[c.id,c]));
 for(const old of oldCourses.values()){
  const current=newCourses.get(old.id);
  if(!current){changes.push({kind:'catalogRemoved',courseId:old.id,name:old.name,detail:''});continue;}
  const fields=[['name','τίτλος'],['semester','εξάμηνο'],['mandatory','χαρακτήρας'],['domain','τομέας']].filter(([key])=>old[key]!==current[key]).map(([key,label])=>`${label}: ${old[key]??'-'} → ${current[key]??'-'}`);
  if(fields.length)changes.push({kind:'catalogChanged',courseId:old.id,name:current.name,detail:fields.join(' · ')});
 }
 for(const current of newCourses.values())if(!oldCourses.has(current.id))changes.push({kind:'catalogAdded',courseId:current.id,name:current.name,detail:''});
 return changes;
}
function showUpdateReport(changes){
 const groups=[['changed','Αλλαγές συναντήσεων'],['added','Νέες συναντήσεις'],['removed','Συναντήσεις που αφαιρέθηκαν'],['catalogChanged','Αλλαγές στον κατάλογο'],['catalogAdded','Νέα μαθήματα στον κατάλογο'],['catalogRemoved','Μαθήματα που αφαιρέθηκαν από τον κατάλογο']];
 const report=$('updateReport');report.querySelector('summary').textContent=changes.length?`Τι άλλαξε · ${changes.length} ${changes.length===1?'αλλαγή':'αλλαγές'}`:'Τι άλλαξε · καμία αλλαγή';
 $('updateReportBody').innerHTML=changes.length?groups.map(([kind,label])=>{
  const items=changes.filter(c=>c.kind===kind);return items.length?`<section><h3>${label} (${items.length})</h3><ul>${items.map(c=>`<li><strong>${c.season==='fall'?'Χειμερινό · ':c.season==='spring'?'Εαρινό · ':''}${esc(c.courseId)} · ${esc(c.name)}</strong>${c.detail?': '+esc(c.detail):''}</li>`).join('')}</ul></section>`:'';
 }).join(''):'<p>Δεν εντοπίστηκαν διαφορές στο ωρολόγιο ή στον κατάλογο σε σχέση με τα προηγούμενα δεδομένα σου.</p>';
 report.hidden=false;
}
function replaceSources(next){
 const replacements=new Map();
 for(const season of ['fall','spring']){
  let previous=data[season].events.filter(e=>!next[season].events.some(n=>n.id===e.id)),incoming=next[season].events.filter(e=>!data[season].events.some(o=>o.id===e.id));
  const same=(a,b)=>a.courseId===b.courseId&&norm(a.type)===norm(b.type);
  // ponytail: source rows have no stable IDs; match unique changes and ask for ambiguous groups.
  for(const anchor of [(a,b)=>a.day===b.day&&a.start===b.start&&a.end===b.end,(a,b)=>a.day===b.day&&a.room===b.room,(a,b)=>a.start===b.start&&a.end===b.end&&a.room===b.room,()=>true]){
   const pairs=[];
   for(const old of previous){const matches=incoming.filter(e=>same(old,e)&&anchor(old,e));if(matches.length===1&&previous.filter(e=>same(e,matches[0])&&anchor(e,matches[0])).length===1)pairs.push([old.id,matches[0].id]);}
   for(const [oldId,newId]of pairs)replacements.set(oldId,newId);
   previous=previous.filter(e=>!pairs.some(([id])=>e.id===id));incoming=incoming.filter(e=>!pairs.some(([,id])=>e.id===id));
  }
 }
 const changes=sourceChanges(data,next,replacements);
 for(const key of ['labs','excluded'])state[key]=[...new Set(state[key].map(id=>replacements.get(id)||id))];
 data=next;
 const ids=new Set([...data.fall.events,...data.spring.events].map(e=>e.id));
 return {unresolved:[...state.labs,...state.excluded].filter(id=>!ids.has(id)).length,changes};
}
async function refresh(){
 if(busy)return;busy=true;$('refresh').disabled=true;$('importFile').disabled=true;
 try{
  if(navigator.onLine===false)throw new Error('δεν υπάρχει σύνδεση στο διαδίκτυο');
  // The chosen service first, then whichever worked last. Direct only if chosen: the department's site blocks browsers.
  let services=[...new Set([state.provider,'jina','allorigins'])];
  const load=async(kind,parse)=>{const {service,value}=await fromAnyService(services,async name=>parse(await fetchSource(kind,name)));services=[...new Set([service,...services])];return value;};
  // The same rules as the nightly job (scripts/refresh-data.mjs): a page that looks broken never replaces good data.
  notify('1/3 · Ανάκτηση καταλόγου μαθημάτων…');
  const catalog=await load('catalog',html=>{const parsed=SourceParser.parseCatalog(html);if(parsed.length<Math.max(20,data.catalog.filter(c=>!c.archived).length*.8))throw new Error(`η πηγή επέστρεψε μόνο ${parsed.length} μαθήματα στον κατάλογο`);return parsed;});
  const timetable=season=>html=>{const snapshot=SourceParser.parseTimetable(html,season,catalog),before=data[season].events.length,after=snapshot.events.length;if(data[season].published&&!after||after<before*.5)throw new Error(`η πηγή επέστρεψε μόνο ${after} από τις ${before} συναντήσεις του ${season==='fall'?'χειμερινού':'εαρινού'}`);return snapshot;};
  notify('2/3 · Ανάκτηση χειμερινού ωρολογίου…');const fall=await load('fall',timetable('fall'));
  notify('3/3 · Ανάκτηση εαρινού ωρολογίου…');const spring=await load('spring',timetable('spring'));
  const oldCount=data.fall.events.length+data.spring.events.length,{unresolved,changes}=replaceSources({catalog:preserveCatalog(catalog),fall,spring,catalogFetchedAt:new Date().toISOString()});persist();render();
  notify(`Η ανανέωση ολοκληρώθηκε: ${fall.events.length} χειμερινές και ${spring.events.length} εαρινές συναντήσεις (προηγουμένως ${oldCount} συνολικά). Οι επιλογές μαθημάτων διατηρήθηκαν.${unresolved?' Υπάρχουν παλιές επιλογές συναντήσεων που χρειάζονται επανέλεγχο στις λεπτομέρειες των μαθημάτων.':''}${!spring.published?' Η εαρινή πηγή είναι κενή.':''}`,unresolved>0);
  showUpdateReport(changes);
 }catch(error){notify(`Η ανανέωση δεν ολοκληρώθηκε: ${plainError(error)}. ${navigator.onLine===false?'':'Δοκιμάστηκαν όλες οι υπηρεσίες. '}Διατηρήθηκαν όλα τα προηγούμενα δεδομένα. Δοκίμασε ξανά σε λίγο ή εισήγαγε μια αποθηκευμένη επίσημη σελίδα από τις «Πηγές & ενημέρωση».`,true);}finally{busy=false;$('refresh').disabled=false;$('importFile').disabled=false;}
}
async function importHtml(){
 const file=$('importFile').files[0];if(!file)return;$('importStatus').textContent='Ανάγνωση αρχείου…';
 try{if(file.size>4000000)throw new Error('Το αρχείο είναι μεγαλύτερο από 4 MB.');const html=await file.text(),kind=$('importKind').value;let next;if(kind==='catalog'){const catalog=SourceParser.parseCatalog(html);next={...data,catalog:preserveCatalog(catalog),catalogFetchedAt:new Date().toISOString()};}else{const snapshot=SourceParser.parseTimetable(html,kind,data.catalog);next={...data,[kind]:snapshot};}const {unresolved,changes}=replaceSources(next);persist();render();$('importStatus').textContent='';closeDialog($('sourcesDialog'));notify('Η επίσημη σελίδα εισήχθη. Η ημερομηνία δείχνει την εισαγωγή· η σελίδα μπορεί να έχει αποθηκευτεί παλαιότερα.'+(unresolved?' Υπάρχουν παλιές επιλογές συναντήσεων που χρειάζονται επανέλεγχο στις λεπτομέρειες των μαθημάτων.':''),unresolved>0);showUpdateReport(changes);}catch(error){$('importStatus').textContent='Η εισαγωγή απορρίφθηκε: '+plainError(error)+'. Τα προηγούμενα δεδομένα διατηρήθηκαν.';}finally{$('importFile').value='';}
}
async function downloadCopy(){
 $('saveCopy').disabled=true;
 try{
 const root=document.documentElement.cloneNode(true),json=v=>JSON.stringify(v).replace(/</g,'\\u003c');root.querySelector('#initial-data').textContent=json(data);root.querySelector('#guide-data').textContent=json(GUIDE);root.querySelector('#initial-state').textContent=json({...state,storageId:crypto.randomUUID()});root.querySelectorAll('dialog').forEach(d=>d.removeAttribute('open'));root.querySelector('#notice').hidden=true;root.querySelector('#updateReport').hidden=true;root.querySelector('#refresh').disabled=false;
 root.querySelector('#saveCopy').disabled=false;root.classList.remove('is-loading','is-intro');root.querySelector('#load-data')?.remove();root.querySelector('.dock-mark')?.remove();root.querySelectorAll('link[rel=preload],link[rel=modulepreload],link[rel=manifest],link[rel=apple-touch-icon]').forEach(link=>link.remove());root.querySelector('#updateToast').hidden=true;root.querySelector('#dataMenu')?.removeAttribute('open');
 // The back pages are pictures and a film, which a single file cannot carry: the copy is the planner alone.
 root.querySelectorAll('.poster').forEach(section=>section.remove());
 const fetchAsset=async url=>{const response=await fetch(url);if(!response.ok)throw Error('HTTP '+response.status+'.');return response;};
 await Promise.all([
  ...[...root.querySelectorAll('script[src]')].map(async script=>{const code=await(await fetchAsset(new URL(script.getAttribute('src'),document.baseURI))).text();script.removeAttribute('src');script.textContent=code;}),
  ...[...root.querySelectorAll('link[rel="stylesheet"]')].map(async link=>{
   const url=new URL(link.getAttribute('href'),document.baseURI);let css=await(await fetchAsset(url)).text();
   const urls=await Promise.all([...css.matchAll(/url\(([^)]+)\)/g)].map(async match=>{
    const path=match[1].trim().replace(/^['"]|['"]$/g,'');if(path.startsWith('data:'))return [match[0],match[0]];
    const blob=await(await fetchAsset(new URL(path,url))).blob(),encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Δεν διαβάστηκε η γραμματοσειρά.'));reader.readAsDataURL(blob);});
    return [match[0],`url("${encoded}")`];
   }));
   for(const [from,to]of urls)css=css.replace(from,to);const style=document.createElement('style');style.textContent=css;link.replaceWith(style);
  })
 ]);
 saveFile(new Blob(['<!doctype html>\n'+root.outerHTML],{type:'text/html;charset=utf-8'}),'THMMY-programma-'+new Date().toISOString().slice(0,10)+'.html');
 }catch(error){notify('Δεν δημιουργήθηκε το αυτοτελές αντίγραφο: '+plainError(error)+'. Έλεγξε τη σύνδεση και δοκίμασε ξανά. Τα δεδομένα σου δεν άλλαξαν.',true);}finally{$('saveCopy').disabled=false;}
}
const TRANSFER_LIMIT=1000000;
let pendingTransfer=null,transferAttempt=0;
function validateTransfer(payload){
 const fail=()=>{throw new Error('Ο κωδικός περιέχει μη έγκυρα ή ελλιπή δεδομένα.');};
 const object=v=>{if(!v||typeof v!=='object'||Array.isArray(v))fail();return v;};
 const text=(v,max=500)=>{if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))fail();return v;};
 const integer=(v,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)fail();return v;};
 const choice=(v,options)=>{if(!options.includes(v))fail();return v;};
 const flag=v=>choice(v,[true,false]);
 const array=(v,max)=>{if(!Array.isArray(v)||v.length>max)fail();return v;};
 const code=v=>{if(!/^ECE\d{3}$/.test(text(v,6)))fail();return v;};
 const ids=(v,meeting=false)=>{const list=array(v,meeting?5000:1000).map(x=>meeting?text(x,2048):code(x));if(new Set(list).size!==list.length||meeting&&list.some(x=>!/^(fall|spring)\|ECE\d{3}\|/.test(x)))fail();return list;};
 const date=v=>{text(v,40);if(!Number.isFinite(Date.parse(v)))fail();return v;};
 const officialUrl=v=>{let url;try{url=new URL(text(v,2048));}catch{fail();}if(url.origin!=='https://www.e-ce.uth.gr'||url.username||url.password)fail();return url.href;};
 object(payload);object(payload.data);const source=payload.data;
 const catalog=array(source.catalog,1000).map(c=>{object(c);const item={id:code(c.id),name:text(c.name,300),semester:integer(c.semester,1,10),domain:c.domain===null?null:text(c.domain,300),mandatory:flag(c.mandatory),url:c.url===null?null:officialUrl(c.url)};if(!item.name.trim())fail();if(c.wpId!==undefined){if(!/^\d{1,16}$/.test(text(c.wpId,16)))fail();item.wpId=c.wpId;}if(c.archived!==undefined)item.archived=flag(c.archived);return item;});
 const known=new Set(catalog.map(c=>c.id));if(!catalog.length||known.size!==catalog.length)fail();
 const snapshot=season=>{const s=object(source[season]);if(s.sourceUrl!==SOURCES[season])fail();const events=array(s.events,3000).map(e=>{
  object(e);const item={id:text(e.id,2048),courseId:code(e.courseId),semester:integer(e.semester,1,10),day:integer(e.day,0,4),start:integer(e.start,0,1439),end:integer(e.end,1,1440),type:text(e.type,150),room:text(e.room,300),teacher:text(e.teacher,500),url:officialUrl(e.url)};
  const expected=[season,item.courseId,item.day,item.start,item.end,item.type,item.room].map(v=>encodeURIComponent(String(v))).join('|');
  if(item.end<=item.start||!known.has(item.courseId)||item.id!==expected)fail();return item;
 });if(new Set(events.map(e=>e.id)).size!==events.length)fail();return{events,published:flag(s.published),sourceUrl:SOURCES[season],fetchedAt:date(s.fetchedAt)};};
 const nextData={catalog,fall:snapshot('fall'),spring:snapshot('spring'),catalogFetchedAt:date(source.catalogFetchedAt)};
 const s=object(payload.state);object(s.selected);
 const nextState={season:choice(s.season,['fall','spring']),selected:{fall:ids(s.selected.fall),spring:ids(s.selected.spring)},passed:ids(s.passed),excluded:ids(s.excluded,true),labs:ids(s.labs,true),review:ids(s.review),creditTo:{},colors:{},colorMode:choice(s.colorMode,['semester','course']),entryYear:choice(s.entryYear,['','new','old']),studySemester:choice(s.studySemester,['',...Array.from({length:16},(_,i)=>String(i+1))]),passedComplete:flag(s.passedComplete),provider:choice(s.provider,['jina','allorigins','direct'])};
 for(const id of [...nextState.passed,...nextState.selected.fall,...nextState.selected.spring])if(!known.has(id))fail();
 const credits=Object.entries(object(s.creditTo)),colors=Object.entries(object(s.colors));if(credits.length>1000||colors.length>1010)fail();
 for(const [key,value]of credits)nextState.creditTo[code(key)]=integer(value,1,10);
 for(const [key,value]of colors){if(!/^(ECE\d{3}|semester-(10|[1-9]))$/.test(key)||!/^#[\da-f]{6}$/i.test(text(value,7)))fail();nextState.colors[key]=value;}
 return{state:nextState,data:nextData,theme:choice(payload.theme,['system','light','dark'])};
}
// THMMY2 codes carry only the user's choices; the timetable itself comes from the public source.
// Format: THMMY2:key=value;... with course codes as their 3 digits and meetings as <f|s><course>-<day>-<start>.
async function encodeTransfer(){
 validateTransfer({state,data,theme:themePreference});
 const num=ids=>ids.map(id=>id.slice(3)).join(','),events=[...data.fall.events,...data.spring.events];
 const meet=keys=>keys.map(key=>events.find(e=>e.id===key)).filter(Boolean).map(e=>`${e.id[0]}${e.courseId.slice(3)}-${e.day}-${e.start}`).join(',');
 const fields={t:state.season==='spring'?'s':'',f:num(state.selected.fall),s:num(state.selected.spring),p:num(state.passed),r:num(state.review),
  c:Object.entries(state.creditTo).map(([id,n])=>id.slice(3)+':'+n).join(','),
  k:Object.entries(state.colors).map(([key,hex])=>(key.startsWith('semester-')?'s'+key.slice(9):key.slice(3))+':'+hex.slice(1)).join(','),
  l:meet(state.labs),x:meet(state.excluded),m:state.colorMode==='course'?'c':'',y:{new:'n',old:'o'}[state.entryYear]||'',e:state.studySemester,
  q:state.passedComplete?'1':'',v:{allorigins:'a',direct:'d'}[state.provider]||'',h:{light:'l',dark:'d'}[themePreference]||''};
 return 'THMMY2:'+Object.entries(fields).filter(([,value])=>value).map(([key,value])=>key+'='+value).join(';');
}
function decodeCompact(code){
 const fail=()=>{throw new Error('Ο κωδικός είναι αλλοιωμένος ή ελλιπής. Αντέγραψέ τον ξανά ολόκληρο.');};
 const fields={};for(const part of code.slice(7).split(';').filter(Boolean)){const i=part.indexOf('=');if(i<1||fields[part.slice(0,i)]!==undefined)fail();fields[part.slice(0,i)]=part.slice(i+1);}
 const list=key=>fields[key]?fields[key].split(','):[],known=new Set(data.catalog.map(c=>c.id));let dropped=0;
 const ids=key=>[...new Set(list(key).map(n=>{if(!/^\d{3}$/.test(n))fail();return 'ECE'+n;}))].filter(id=>known.has(id)||(dropped++,false));
 const meetings=key=>[...new Set(list(key).flatMap(ref=>{const m=/^([fs])(\d{3})-([0-4])-(\d{1,4})$/.exec(ref);if(!m)fail();const found=data[m[1]==='f'?'fall':'spring'].events.filter(e=>e.courseId==='ECE'+m[2]&&e.day===Number(m[3])&&e.start===Number(m[4])).map(e=>e.id);if(!found.length)dropped++;return found;}))];
 const pairs=key=>list(key).map(item=>{const i=item.indexOf(':');if(i<1)fail();return [item.slice(0,i),item.slice(i+1)];});
 const creditTo={},colors={};
 for(const [n,value]of pairs('c')){if(!/^\d{3}$/.test(n)||!/^\d{1,2}$/.test(value))fail();if(known.has('ECE'+n))creditTo['ECE'+n]=Number(value);}
 for(const [key,hex]of pairs('k'))colors[key.startsWith('s')?'semester-'+key.slice(1):'ECE'+key]='#'+hex;
 const next={season:fields.t==='s'?'spring':'fall',selected:{fall:ids('f'),spring:ids('s')},passed:ids('p'),review:ids('r'),excluded:meetings('x'),labs:meetings('l'),creditTo,colors,
  colorMode:fields.m==='c'?'course':'semester',entryYear:{n:'new',o:'old'}[fields.y]||'',studySemester:fields.e||'',passedComplete:fields.q==='1',provider:{a:'allorigins',d:'direct'}[fields.v]||'jina'};
 return {...validateTransfer({state:next,data,theme:{l:'light',d:'dark'}[fields.h]||'system'}),dropped};
}
async function decodeTransfer(input){
 if(input.length>200000)throw new Error('Ο κωδικός ξεπερνά το επιτρεπόμενο μέγεθος.');
 const code=input.replace(/\s/g,'');
 if(code.startsWith('THMMY2:')){if(!/^THMMY2:[A-Za-z0-9=;,:-]*$/.test(code))throw new Error('Ο κωδικός είναι αλλοιωμένος ή ελλιπής. Αντέγραψέ τον ξανά ολόκληρο.');return decodeCompact(code);}
 if(/^THMMY\d+[.:]/.test(code)&&!code.startsWith('THMMY1.'))throw new Error('Αυτή η έκδοση κωδικού δεν υποστηρίζεται. Άνοιξε την τελευταία έκδοση της εφαρμογής.');
 if(!/^THMMY1\.[A-Za-z0-9_-]+$/.test(code))throw new Error('Επικόλλησε ολόκληρο τον κωδικό που αρχίζει με THMMY.');
 if(typeof DecompressionStream==='undefined')throw new Error('Ο browser δεν υποστηρίζει εισαγωγή κωδικών. Χρησιμοποίησε έναν ενημερωμένο browser.');
 let payload;
 try{
  const compressed=Uint8Array.from(atob(code.slice(7).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>TRANSFER_LIMIT){await reader.cancel();throw new Error('size');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }catch{throw new Error('Ο κωδικός είναι αλλοιωμένος, ελλιπής ή υπερβολικά μεγάλος. Δημιούργησε ή αντέγραψέ τον ξανά.');}
 return validateTransfer(payload);
}
function resetTransferPreview(){pendingTransfer=null;transferAttempt++;$('transferPreview').hidden=true;$('restoreTransfer').disabled=true;$('inspectTransfer').disabled=false;$('transferStatus').textContent='';}
async function inspectTransfer(){
 resetTransferPreview();const attempt=transferAttempt;$('inspectTransfer').disabled=true;$('transferStatus').textContent='Έλεγχος αντιγράφου…';
 try{
  const decoded=await decodeTransfer($('importCode').value);if(attempt!==transferAttempt)return;pendingTransfer=decoded;
  const s=decoded.state,review=ids=>ids.filter(id=>s.review.includes(id)).length;
  $('transferSummary').textContent=`${s.passed.length} περασμένα, ${s.selected.fall.length} χειμερινά (${review(s.selected.fall)} προς έλεγχο), ${s.selected.spring.length} εαρινά (${review(s.selected.spring)} προς έλεγχο). ${Object.keys(s.creditTo).length} χρεώσεις εξαμήνων, ${s.labs.length} εργαστηριακές επιλογές, ${s.excluded.length} κρυμμένες συναντήσεις. Προφίλ: ${s.studySemester?s.studySemester+'ο εξάμηνο':'χωρίς εξάμηνο'}, ${s.passedComplete?'πλήρης λίστα περασμένων':'μη επιβεβαιωμένη λίστα περασμένων'}. Χειμερινή πηγή: ${dateText(decoded.data.fall.fetchedAt)}, εαρινή πηγή: ${dateText(decoded.data.spring.fetchedAt)}.${decoded.dropped?` ${decoded.dropped} στοιχεία δεν υπάρχουν στο τρέχον ωρολόγιο και παραλείπονται.`:''}`;
  $('transferPreview').hidden=false;$('restoreTransfer').disabled=false;$('transferStatus').textContent='Ο κωδικός είναι έγκυρος. Δεν έχει αλλάξει τίποτα ακόμα.';
 }catch(error){if(attempt===transferAttempt)$('transferStatus').textContent=error.message;}finally{if(attempt===transferAttempt)$('inspectTransfer').disabled=false;}
}
function restoreTransfer(){
 if(!pendingTransfer)return;
 if(busy){$('transferStatus').textContent='Περίμενε να ολοκληρωθεί η ανανέωση των πηγών και πάτησε ξανά επαναφορά.';return;}
 const next=pendingTransfer,nextState={...next.state};if(state.storageId)nextState.storageId=state.storageId;
 try{localStorage.setItem(STORE,JSON.stringify({version:1,data:next.data,state:nextState}));}catch{$('transferStatus').textContent='Η αποθήκευση απέτυχε. Δεν άλλαξαν τα δεδομένα σου. Έλεγξε τον διαθέσιμο χώρο και τις ρυθμίσεις αποθήκευσης του browser.';return;}
 data=next.data;state=nextState;themePreference=next.theme;applyTheme();$('theme').value=themePreference;
 let themeSaved=true;try{localStorage.setItem('thmmy-planner-theme',themePreference);}catch{themeSaved=false;}
 $('search').value='';$('semesterFilter').value='';$('listFilter').value='offered';render();closeDialog($('transferDialog'));
 notify('Το αντίγραφο επαναφέρθηκε και αποθηκεύτηκε σε αυτόν τον browser.'+(themeSaved?'':' Το θέμα εφαρμόστηκε, αλλά δεν μπόρεσε να αποθηκευτεί η προτίμησή του.'),!themeSaved);
}
$('transferButton').onclick=()=>{resetTransferPreview();$('importCode').value='';$('transferFile').value='';$('exportCode').value='';$('exportTransfer').hidden=true;$('exportStatus').textContent='';$('transferDialog').showModal();};
$('transferDialog').addEventListener('close',resetTransferPreview);
$('importCode').addEventListener('input',resetTransferPreview);
$('inspectTransfer').onclick=inspectTransfer;$('restoreTransfer').onclick=restoreTransfer;
$('generateTransfer').onclick=async()=>{
 $('generateTransfer').disabled=true;$('exportTransfer').hidden=true;$('exportCode').value='';$('exportStatus').textContent='Δημιουργία αντιγράφου…';
 try{$('exportCode').value=await encodeTransfer();$('exportTransfer').hidden=false;$('exportStatus').textContent='Έτοιμο. Αντέγραψε ολόκληρο τον κωδικό ή κράτησε το αρχείο .txt.';}catch(error){$('exportStatus').textContent=error.message;}finally{$('generateTransfer').disabled=false;}
};
$('copyTransfer').onclick=async()=>{try{await navigator.clipboard.writeText($('exportCode').value);$('exportStatus').textContent='Ο κωδικός αντιγράφηκε.';}catch{$('exportCode').focus();$('exportCode').select();$('exportStatus').textContent='Η αυτόματη αντιγραφή δεν επιτρέπεται. Ο κωδικός επιλέχθηκε: χρησιμοποίησε Ctrl+C ή την εντολή Αντιγραφή.';}};
$('downloadTransfer').onclick=()=>saveFile(new Blob([$('exportCode').value+'\n'],{type:'text/plain;charset=utf-8'}),'THMMY-backup-'+new Date().toISOString().slice(0,10)+'.txt');
$('transferFile').onchange=async()=>{resetTransferPreview();const file=$('transferFile').files[0],attempt=transferAttempt;if(!file)return;try{if(file.size>200000)throw new Error('Το αρχείο είναι μεγαλύτερο από 200 KB.');const code=await file.text();if(attempt!==transferAttempt)return;$('importCode').value=code;await inspectTransfer();}catch(error){if(attempt===transferAttempt)$('transferStatus').textContent=error.message;}finally{$('transferFile').value='';}};
$('semesterFilter').length=1;$('studySemester').length=1;
// The theme pill shows the icon of the current choice: sun, moon, or both for the system setting.
const themeIcon=()=>$('themeIcon').setAttribute('href','#i-'+({system:'sunmoon',light:'sun',dark:'moon'}[themePreference]||'sunmoon'));
$('theme').value=themePreference;themeIcon();
$('theme').onchange=()=>{
 themePreference=$('theme').value;applyTheme();themeIcon();
 try{localStorage.setItem('thmmy-planner-theme',themePreference);}catch{notify('Το θέμα άλλαξε, αλλά ο browser δεν μπόρεσε να αποθηκεύσει την προτίμησή σου.',true);}
};
for(let i=1;i<=10;i++)$('semesterFilter').add(new Option(`${i}ο εξάμηνο`,i));for(let i=1;i<=16;i++)$('studySemester').add(new Option(i===16?'16ο ή μεταγενέστερο':`${i}ο εξάμηνο`,i));
// event.detail is 0 for keyboard activation: those stay instant, with no morph or flight.
let detailOpener=null;
document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.detail){detailOpener={event:b.dataset.event,detail:b.dataset.detail};if(event.detail===0)openDetail(b.dataset.detail);else morphOpen(b,b.dataset.detail);}else if(b.dataset.toggle)toggleCourse(b.dataset.toggle,event.detail!==0);else if(b.hasAttribute('data-show-all')){$('semesterFilter').value='';$('listFilter').value='all';renderList();}else if(b.hasAttribute('data-open-passed'))openProfile(true);else if(b.hasAttribute('data-open-profile'))openProfile();else if(b.hasAttribute('data-print'))window.print();else if(b.dataset.resetMeetings)resetMeetings(b.dataset.resetMeetings);else if(b.dataset.close)closeDialog($(b.dataset.close));else if(b.hasAttribute('data-guide'))$('guideDialog').showModal();else if(b.hasAttribute('data-sources'))$('sourcesDialog').showModal();else if(b.hasAttribute('data-transfer'))$('transferButton').click();else if(b.classList.contains('step-name'))openStep(b.closest('.step'),event.detail!==0);else if(b.dataset.season){const next=b.dataset.season;if(next===state.season)return;state.season=next;persist();render();}});
// Escape closes through the same exit. The browser only lets the page delay it after a click or key that opened it.
for(const dialog of document.querySelectorAll('dialog')){
 dialog.addEventListener('cancel',event=>{if(!event.cancelable)return;event.preventDefault();closeDialog(dialog);});
 // A click on the backdrop lands on the dialog itself, outside its box.
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog(dialog);});
}
// The block that opened the details may have been re-rendered meanwhile: hand focus back to its replacement.
$('courseDialog').addEventListener('close',()=>{
 delete document.documentElement.dataset.vt;
 const from=detailOpener;detailOpener=null;if(!from)return;
 requestAnimationFrame(()=>{const a=document.activeElement;if(a&&a!==document.body&&!$('courseDialog').contains(a))return;(from.event&&$('calendar').querySelector(`[data-event="${CSS.escape(from.event)}"]`)||$('calendar').querySelector(`[data-detail="${CSS.escape(from.detail)}"]`)||$('courseList').querySelector(`[data-detail="${CSS.escape(from.detail)}"]`)||$('search')).focus({preventScroll:true});});
});
document.addEventListener('change',event=>{const e=event.target;if(e.dataset.passAll){for(const c of data.catalog)if(c.semester===Number(e.dataset.passAll)&&!c.archived)state.passed=setIn(state.passed,c.id,e.checked);persist();render();syncPassedChecklist();}if(e.dataset.passed)setPassed(e.dataset.passed,e.checked);if(e.dataset.review){state.review=setIn(state.review,e.dataset.review,e.checked);persist();renderSchedule();}if(e.dataset.meeting){const m=allMeetings().find(m=>m.id===e.dataset.meeting);if(m){if(isLab(m))state.labs=setIn(state.labs,m.id,e.checked);else state.excluded=setIn(state.excluded,m.id,!e.checked);persist();renderList();renderSchedule();}}if(e.dataset.credit){const id=e.dataset.credit;if(e.value)state.creditTo[id]=Number(e.value);else delete state.creditTo[id];persist();renderSchedule();if(detailId===id&&$('courseDialog').open){renderDetail(id);$('detailBody').querySelector('[data-credit]')?.focus();}}if(e.dataset.color){state.colors[e.dataset.color]=e.value;persist();renderList();renderSchedule();}});
$('search').addEventListener('input',renderList);$('semesterFilter').addEventListener('change',renderList);$('listFilter').addEventListener('change',renderList);$('colorMode').addEventListener('change',e=>{state.colorMode=e.target.value;persist();renderList();renderSchedule();});
$('profileButton').onclick=()=>openProfile();
// The profile saves as it changes, like everything else here; closing it can no longer lose an edit.
const studyFilter=()=>{if(state.studySemester&&Number(state.studySemester)<=10)$('semesterFilter').value=state.studySemester;};
for(const id of ['entryYear','studySemester','passedComplete'])$(id).addEventListener('change',()=>{state.entryYear=$('entryYear').value;const semester=$('studySemester').value,moved=semester!==state.studySemester;state.studySemester=semester;state.passedComplete=$('passedComplete').checked;persist();if(moved)studyFilter();render();});
$('saveProfile').onclick=()=>closeDialog($('profileDialog'));
// "/" jumps to the search; Enter there adds the course when only one is left.
document.addEventListener('keydown',event=>{if(event.key!=='/'||event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,textarea,select')||document.querySelector('dialog[open]'))return;event.preventDefault();if(drawerMode.matches&&!railOpen())setRail(true);$('search').focus();});
$('search').addEventListener('keydown',event=>{if(event.key!=='Enter')return;const rows=$('courseList').querySelectorAll('.course');if(rows.length===1)toggleCourse(rows[0].dataset.course,false);});
$('sourcesButton').onclick=()=>$('sourcesDialog').showModal();$('guideButton').onclick=()=>$('guideDialog').showModal();$('provider').onchange=e=>{state.provider=e.target.value;persist();};$('refresh').onclick=refresh;$('importFile').onchange=importHtml;$('saveCopy').onclick=downloadCopy;$('printButton').onclick=()=>window.print();
// The course rail: docked beside the week on wide screens; up to 1180px a drawer (side panel on tablets,
// bottom sheet on phones). The floating button reaches it from anywhere in a long week.
// The steps row: one panel is open at a time. The row re-flows at once; for a pointer, where the browser can, a view
// transition carries the change (snapshots moved by the compositor), so no layout property is ever animated. Opened
// from the keyboard it simply changes.
const steps=[...document.querySelectorAll('.step')],film=document.querySelector('.step video');
function openStep(step,animate){
 if(step.classList.contains('open'))return;
 const swap=()=>{for(const s of steps){const on=s===step;s.classList.toggle('open',on);s.querySelector('.step-name').setAttribute('aria-expanded',String(on));}playFilm();};
 const root=document.documentElement;
 if(!animate||!document.startViewTransition||reducedMotion.matches||printLayoutActive){swap();return;}
 root.dataset.vt='steps';
 document.startViewTransition(swap).finished.finally(()=>{if(root.dataset.vt==='steps')delete root.dataset.vt;});
}
// The film of the week being dealt plays only while its panel is open and on screen, and never under reduced motion
// (there it keeps its poster and gets the browser's own controls).
let filmSeen=false;
function playFilm(){
 if(!film)return;
 const on=filmSeen&&film.closest('.step').classList.contains('open')&&!reducedMotion.matches&&document.visibilityState==='visible';
 film.controls=reducedMotion.matches;
 if(on)film.play().catch(()=>{});else film.pause();
}
if(film){
 new IntersectionObserver(([entry])=>{filmSeen=entry.isIntersecting;playFilm();},{threshold:.35}).observe(film);
 reducedMotion.addEventListener('change',playFilm);document.addEventListener('visibilitychange',playFilm);
}
// The hero's sentence follows the clock.
setInterval(()=>{if(document.visibilityState==='visible')showNow();},30000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')showNow();});
const drawerMode=matchMedia('(max-width:1180px)'),phone=matchMedia('(max-width:860px)');
let railOpener=null;
function railOpen(){return drawerMode.matches?document.body.classList.contains('rail-open'):!document.body.classList.contains('wide-layout');}
function setRail(open,opener){
 if(drawerMode.matches)document.body.classList.toggle('rail-open',open);else document.body.classList.toggle('wide-layout',!open);
 const shown=railOpen();
 for(const attr of ['aria-label','title'])$('focusSchedule').setAttribute(attr,shown?'Απόκρυψη μαθημάτων':'Εμφάνιση μαθημάτων');
 for(const id of ['focusSchedule','railFab'])$(id).setAttribute('aria-expanded',String(shown));
 hoveredCourse='';highlightCourse();fitCalendar();
 if(shown&&opener&&(drawerMode.matches||opener.id==='railFab')){railOpener=drawerMode.matches?opener:null;(phone.matches?$('railClose'):$('search')).focus({preventScroll:true});}
 // A frame later: the rail button only becomes visible (and focusable) once its visibility transition has started.
 // Only if focus is still in the drawer or was dropped: a click on the week or a Tab out already moved it on.
 else if(!shown&&railOpener){
  const back=railOpener;railOpener=null;
  const give=()=>{const a=document.activeElement;if(!a||a===document.body||$('courseSidebar').contains(a))back.focus({preventScroll:true});};
  // A frame may still be too early on the phone, so it tries again once the button's transition has run.
  requestAnimationFrame(()=>{give();if(document.activeElement!==back)back.addEventListener('transitionrun',give,{once:true});});
 }
}
$('focusSchedule').onclick=event=>{
 const change=()=>setRail(!railOpen(),$('focusSchedule'));
 // The week's width would snap: a short crossfade bridges it (not from the keyboard, not under reduced motion).
 if(document.startViewTransition&&!reducedMotion.matches&&event.detail!==0)document.startViewTransition(change).ready.catch(()=>{});else change();
};
$('skipToWeek').onclick=()=>($('calendarWrap').hidden?$('scheduleTitle'):$('calendarWrap')).focus();
$('conflictJump').onclick=()=>{$('checks').open=true;$('checks').scrollIntoView({block:'start'});$('checks').firstElementChild.focus({preventScroll:true});};
$('railFab').onclick=()=>setRail(true,$('railFab'));
$('railClose').onclick=()=>setRail(false);
drawerMode.addEventListener('change',()=>{document.body.classList.remove('rail-open');railOpener=null;setRail(railOpen());});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&drawerMode.matches&&railOpen()&&!document.querySelector('dialog[open]'))setRail(false);});
// Tablets close the drawer as the press starts; the phone's scrim waits for the click, or that click would fall through
// to the block under the scrim once it is gone.
document.addEventListener('pointerdown',event=>{if(!phone.matches&&drawerMode.matches&&railOpen()&&!event.target.closest('#courseSidebar,#focusSchedule,#railFab,dialog'))setRail(false);});
document.addEventListener('click',event=>{if(phone.matches&&railOpen()&&!event.target.closest('#courseSidebar,#railFab,dialog'))setRail(false);});
// Tabbing out of the drawer closes it instead of leaving it open over the page.
$('courseSidebar').addEventListener('focusout',event=>{if(drawerMode.matches&&railOpen()&&event.relatedTarget&&!event.relatedTarget.closest('#courseSidebar,dialog'))setRail(false);});
// The phone sheet follows a finger dragged down from its handle or heading. Velocity is averaged over the last 80ms. It
// closes past 80px, or past 24px when that speed would carry it (projected 499ms on) past half its height; a flick back
// up or a cancelled touch springs it back. Dragged up it meets a rubber band, and a press mid-flight catches it there.
const sidebar=$('courseSidebar');let sheetDrag=null;
const sheetVelocity=now=>{const recent=sheetDrag.samples.filter(s=>now-s[0]<=80),a=recent[0],b=recent.at(-1);return recent.length>1&&b[0]>a[0]?(b[1]-a[1])/(b[0]-a[0]):0;};
sidebar.addEventListener('pointerdown',event=>{if(sheetDrag||!event.isPrimary||event.pointerType!=='touch'||!phone.matches||!railOpen()||event.target.closest('button')||event.clientY>sidebar.querySelector('.panel-heading').getBoundingClientRect().bottom)return;const from=Math.max(0,new DOMMatrix(getComputedStyle(sidebar).transform).m42);sheetDrag={id:event.pointerId,y:event.clientY-from,dy:from,samples:[[event.timeStamp,event.clientY]]};sidebar.setPointerCapture(event.pointerId);sidebar.style.transition='none';sidebar.style.transform=`translateY(${from}px)`;});
sidebar.addEventListener('pointermove',event=>{if(sheetDrag?.id!==event.pointerId)return;const raw=event.clientY-sheetDrag.y;sheetDrag.dy=Math.max(0,raw);sheetDrag.samples.push([event.timeStamp,event.clientY]);sidebar.style.transform=`translateY(${raw<0?-40*(1-1/(-raw/40+1)):raw}px)`;});
for(const type of ['pointerup','pointercancel'])sidebar.addEventListener(type,event=>{if(sheetDrag?.id!==event.pointerId)return;const v=sheetVelocity(event.timeStamp),dy=sheetDrag.dy,close=type==='pointerup'&&v>-.2&&(dy>80||dy>24&&dy+v*499>sidebar.offsetHeight/2);sheetDrag=null;sidebar.style.transform='';sidebar.style.transition='';if(close)setRail(false);});
setRail(railOpen());
const dataMenu=$('dataMenu');
dataMenu.addEventListener('click',event=>{if(event.target.closest('button')){dataMenu.open=false;dataMenu.querySelector('summary').focus();}},true);
dataMenu.addEventListener('focusout',event=>{if(!dataMenu.contains(event.relatedTarget))dataMenu.open=false;});
document.addEventListener('click',event=>{if(!dataMenu.contains(event.target))dataMenu.open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&dataMenu.open){dataMenu.open=false;dataMenu.querySelector('summary').focus();event.preventDefault();}});
$('courseList').addEventListener('pointerover',event=>{if(event.pointerType==='touch')return;hoveredCourse=event.target.closest('.course')?.dataset.course||'';highlightCourse();});
$('courseList').addEventListener('pointerout',event=>{hoveredCourse=event.relatedTarget?.closest('.course')?.dataset.course||'';highlightCourse();});
for(const type of ['focusin','focusout'])$('courseList').addEventListener(type,()=>queueMicrotask(highlightCourse));
// Hovering or focusing a conflicting block traces the blocks it collides with.
function tracePartners(event){
 for(const b of $('calendar').querySelectorAll('.trace'))b.classList.remove('trace');
 const block=event.type==='pointerout'||event.type==='focusout'?null:event.target.closest('.meeting.conflict');
 if(block)for(const id of block.dataset.partners.split(' ').filter(Boolean))$('calendar').querySelector(`[data-event="${CSS.escape(id)}"]`)?.classList.add('trace');
}
for(const type of ['pointerover','pointerout','focusin','focusout'])$('calendar').addEventListener(type,tracePartners);

reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)document.getAnimations().forEach(a=>a.cancel());});
renderGuide();
$('guideContent').insertAdjacentHTML('beforeend','<details><summary>Αναλυτικές σημειώσεις οδηγού και παραπομπές</summary><ul>'+(GUIDE.rules||[]).map(r=>`<li>${esc(r.text)} <small>(σ. ${esc(r.pages.join(', '))})</small></li>`).join('')+'</ul></details>');
// A published snapshot newer than the saved data (the nightly refresh, .github/workflows/refresh-data.yml) is taken in
// the way a manual refresh is: meeting choices are remapped, selected courses that left the catalog are kept, and the
// report lists what changed. Data the visitor refreshed more recently than the snapshot stays.
const fetchedAt=d=>Math.max(...[d.catalogFetchedAt,d.fall?.fetchedAt,d.spring?.fetchedAt].map(t=>Date.parse(t)||0));
let adopted=null;
if(data!==initialData&&fetchedAt(initialData)>fetchedAt(data)){
 const next=structuredClone(initialData);next.catalog=preserveCatalog(next.catalog);
 adopted=replaceSources(next);persist();
}
studyFilter();render();if(storageWarning)notify(storageWarning,true);
if(adopted?.changes.length){
 notify('Το ωρολόγιο ενημερώθηκε αυτόματα από την επίσημη πηγή. Οι επιλογές μαθημάτων διατηρήθηκαν.'+(adopted.unresolved?' Υπάρχουν παλιές επιλογές συναντήσεων που χρειάζονται επανέλεγχο στις λεπτομέρειες των μαθημάτων.':''),adopted.unresolved>0);
 showUpdateReport(adopted.changes);
}

let calendarWidth=0;
new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(width!==calendarWidth){calendarWidth=width;fitCalendar();}}).observe($('calendarWrap'));
document.fonts.ready.then(fitCalendar);
matchMedia('print').addEventListener('change',fitCalendar);
const mediaRules=[...document.styleSheets].flatMap(sheet=>[...sheet.cssRules]).filter(rule=>rule.type===CSSRule.MEDIA_RULE);
const printRules=mediaRules.filter(rule=>rule.conditionText==='print');
// Screen-only breakpoints (drawer, phone agenda) must not shape the print measurement, even from a phone.
const screenRules=mediaRules.filter(rule=>rule.conditionText.startsWith('screen')).map(rule=>[rule,rule.media.mediaText]);
window.addEventListener('beforeprint',()=>{
 // Chromium fires beforeprint while screen styles still apply. Measure print styles before pagination.
 printLayoutActive=true;
 // Scroll-linked animations (header dock, floating button, hero recede) must survive printing.
 document.getAnimations().filter(a=>a.timeline===document.timeline).forEach(a=>a.cancel());
 for(const rule of printRules)rule.media.mediaText='all';
 for(const [rule] of screenRules)rule.media.mediaText='not all';
 fitCalendar();
});
window.addEventListener('afterprint',()=>{
 for(const rule of printRules)rule.media.mediaText='print';
 for(const [rule,text] of screenRules)rule.media.mediaText=text;
 printLayoutActive=false;
 fitCalendar();
});

// Offline and instant loads through the service worker (sw.js). It is asked to check for a new version when the page
// loads, when it comes back into view and every half hour; a new version shows the update toast. Not in an HTML backup.
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
 // A first visit installs a worker too, and it can claim this page before its "installed" event arrives: only a page
 // that already had a worker, or a worker found while another was active, is a new version.
 const sw=navigator.serviceWorker,toast=$('updateToast'),returning=!!sw.controller;
 let registration=null,taking=false;
 // The text is set again once shown: screen readers skip a live region that only turns visible.
 const offer=()=>{if(!toast.hidden)return;const s=toast.firstElementChild,text=s.textContent;s.textContent='';toast.hidden=false;requestAnimationFrame(()=>s.textContent=text);};
 sw.addEventListener('message',event=>{if(event.data==='update')offer();});
 // A new service worker took over (after "Ανανέωση"): load the page it serves.
 sw.addEventListener('controllerchange',()=>{if(taking)location.reload();});
 $('updateReload').onclick=()=>{
  if(registration?.waiting){taking=true;registration.waiting.postMessage('skip-waiting');}
  else location.reload();
 };
 $('updateClose').onclick=()=>exit(toast,{opacity:0,transform:'translate(-50%,-10px) scale(.96)'},()=>{toast.hidden=true;if(toast.contains(document.activeElement)||document.activeElement===document.body)$('printButton').focus({preventScroll:true});},200);
 const check=()=>{registration?.update().catch(()=>{});sw.controller?.postMessage('check');};
 const start=async()=>{
  try{registration=await sw.register('./sw.js',{updateViaCache:'none'});}catch{return;}
  // A new service worker waiting behind the current one is a new version too.
  if(registration.waiting&&returning)offer();
  registration.addEventListener('updatefound',()=>{const next=registration.installing,update=!!registration.active;next?.addEventListener('statechange',()=>{if(next.state==='installed'&&update&&registration.waiting)offer();});});
  check();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});
  setInterval(()=>{if(document.visibilityState==='visible')check();},30*60*1000);
 };
 if(document.readyState==='complete')start();else addEventListener('load',start,{once:true});
}
// Read by the loader in index.html: a script that threw part-way still fires onload.
window.plannerBooted=true;
