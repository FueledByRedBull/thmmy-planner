'use strict';
const $=id=>document.getElementById(id);
const initialData=JSON.parse($('initial-data').textContent);
const GUIDE=JSON.parse($('guide-data').textContent);
const embeddedState=JSON.parse($('initial-state').textContent);
const STORE='thmmy-planner-v1-'+(embeddedState?.storageId||'original');
const SOURCES={fall:'https://www.e-ce.uth.gr/studies/undergraduate/fall-timetable/year/',spring:'https://www.e-ce.uth.gr/studies/undergraduate/spring-timetable/year/',catalog:'https://www.e-ce.uth.gr/studies/undergraduate/courses/'};
const DAYS=['Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή'];
const COLORS=['#a9c9de','#c5d9ae','#b9d8cd','#e6cb99','#d1c2dd','#e4b6a2','#abd1cf','#cbd0a0','#edc49c','#cec8c0'];
const blankState=()=>({season:'fall',selected:{fall:[],spring:[]},passed:[],excluded:[],labs:[],review:[],creditTo:{},colors:{},colorMode:'semester',entryYear:'',studySemester:'',passedComplete:false,provider:'jina'});
let data=initialData,state={...blankState(),...(embeddedState||{})},storageWarning='',detailId=null,busy=false;
try{const saved=JSON.parse(localStorage.getItem(STORE)||'null');if(saved?.version===1&&saved.data?.catalog&&saved.state?.selected){data=saved.data;state={...blankState(),...saved.state};}}catch(e){storageWarning='Η τοπική αποθήκευση δεν είναι διαθέσιμη ή δεν διαβάστηκε. Χρησιμοποίησε «Αποθήκευση αντιγράφου» για να κρατήσεις τη δουλειά σου.';}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el').replace(/ς/g,'σ');
const time=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const dateText=s=>s?new Date(s).toLocaleString('el-GR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Άγνωστη ημερομηνία';
const course=id=>data.catalog.find(c=>c.id===id);
const guideCourse=id=>(GUIDE.courses||[]).find(c=>c.id===id);
const chosen=()=>state.selected[state.season];
const declaration=()=>chosen().filter(id=>!state.review.includes(id));
const allMeetings=()=>data[state.season].events;
const meetings=id=>allMeetings().filter(e=>e.courseId===id);
const isLab=e=>norm(e.type).includes('εργαστηρ');
const included=e=>isLab(e)?state.labs.includes(e.id):!state.excluded.includes(e.id);
const activeEvents=()=>allMeetings().filter(e=>chosen().includes(e.courseId)&&included(e));
// The current 2023+ registration rules assign 2 ECTS to each English course.
const ects=c=>state.entryYear==='new'&&['ECE121','ECE122'].includes(c.id)?2:(guideCourse(c.id)?.ects??null);
const prerequisites=c=>guideCourse(c.id)?.prerequisites??null;
const outstanding=c=>(prerequisites(c)||[]).filter(id=>!state.passed.includes(id));
const mandatory=c=>typeof c.mandatory==='boolean'?c.mandatory:guideCourse(c.id)?.mandatory;
const credited=c=>mandatory(c)?c.semester:(Number(state.creditTo[c.id])||null);
const setIn=(array,value,on)=>on?[...new Set([...array,value])]:array.filter(v=>v!==value);
function persist(){try{localStorage.setItem(STORE,JSON.stringify({version:1,data,state}));}catch(e){notify('Ο browser δεν μπόρεσε να αποθηκεύσει τις αλλαγές. Κατέβασε ένα αντίγραφο HTML για να τις διατηρήσεις.',true);}}
function notify(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);$('notice').hidden=false;}
function available(c){return meetings(c.id).length>0;}
function courseIssues(c){
 const issues=[],pre=prerequisites(c),sem=Number(state.studySemester);
 if(pre===null)issues.push('Δεν υπάρχουν επαληθευμένα προαπαιτούμενα στον ενσωματωμένο οδηγό.');
 else if(outstanding(c).length)issues.push(`${state.passedComplete?'Μη περασμένα':'Δεν έχουν σημειωθεί ως περασμένα'} προαπαιτούμενα: ${outstanding(c).join(', ')}.`);
 if(state.passed.includes(c.id))issues.push('Το μάθημα έχει ήδη σημειωθεί ως περασμένο.');
 if(!available(c))issues.push('Δεν εμφανίζεται στο τρέχον ωρολόγιο αυτής της περιόδου.');
 if(sem&&c.id!=='ECE588'&&c.semester>sem&&(mandatory(c)||sem<5))issues.push('Το μάθημα ανήκει σε μεταγενέστερο εξάμηνο. Χρειάζεται έλεγχος δικαιώματος δήλωσης.');
 else if(sem&&sem>=5&&!mandatory(c)&&credited(c)!==null&&credited(c)>sem)issues.push('Η χρέωση είναι σε μεταγενέστερο εξάμηνο. Επίλεξε τη σωστή χρέωση στις λεπτομέρειες.');
 if(norm(c.name).includes('ειδικα θεματα')){issues.push('Απαιτείται αποδοχή επιβλέποντα και επίσημη αίτηση (σ. 21).');if(credited(c)===5)issues.push('Τα χειμερινά Ειδικά Θέματα χρεώνονται στο 7ο ή 9ο, όχι στο 5ο (σ. 21).');}
 if(c.id==='ECE588'){const passedCredits=state.passed.filter(id=>!['ECE588','ECE121','ECE122'].includes(id)).map(course).filter(Boolean).reduce((n,p)=>n+(ects(p)||0),0);if(passedCredits<180)issues.push(`Διπλωματική: ${passedCredits} καταχωρισμένα περασμένα ECTS έναντι του ελάχιστου 180 (σ. 25).`);issues.push('Η διπλωματική απαιτεί έγκριση του Τμήματος και επιβλέποντα.');}
 if(['ECE496','ECE567'].includes(c.id))issues.push('Πρακτική: απαιτείται έλεγχος της τρέχουσας προκήρυξης. Η σ. 27 απαιτεί περάτωση 6ου εξαμήνου· ο οδηγός εμφανίζει δύο κωδικούς πρακτικής.');
 return issues;
}
function colorKey(c){return state.colorMode==='course'?c.id:`semester-${c.semester}`;}
function baseColor(c){return state.colors[colorKey(c)]||COLORS[state.colorMode==='course'?data.catalog.findIndex(x=>x.id===c.id)%COLORS.length:(c.semester-1)%COLORS.length]||COLORS[0];}
function pale(hex){return '#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*.50+255*.50).toString(16).padStart(2,'0')).join('');}
function dark(hex){return '#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*.58).toString(16).padStart(2,'0')).join('');}
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
function renderList(){
 const focused=document.activeElement,focusKey=focused.closest('#courseList')&&['detail','toggle','passed'].find(key=>focused.dataset[key]);
 const q=norm($('search').value),sem=Number($('semesterFilter').value),filter=$('listFilter').value;
 const list=data.catalog.filter(c=>(!sem||c.semester===sem)&&(!q||norm(c.name+' '+c.id).includes(q))&&(filter==='all'||filter==='offered'&&available(c)||filter==='selected'&&chosen().includes(c.id)||filter==='passed'&&state.passed.includes(c.id)));
 $('catalogCount').textContent=`${list.length} / ${data.catalog.length}`;
 $('listHelp').textContent=filter==='offered'?'Μόνο όσα έχουν ώρες στην επίσημη πηγή.':filter==='all'?'Ο πλήρης κατάλογος. Η απουσία ωρών επισημαίνεται.':filter==='passed'?'Τα περασμένα σου, και από τις δύο περιόδους.':'Οι επιλογές σου για αυτή την περίοδο.';
 $('courseList').innerHTML=list.map(c=>{const selected=chosen().includes(c.id),passed=state.passed.includes(c.id),missing=outstanding(c);return `<article class="course ${selected?'selected':''}" data-course="${esc(c.id)}" style="--course-color:${baseColor(c)}"><div><button class="course-title" data-detail="${esc(c.id)}">${esc(c.name)}</button><div class="course-meta"><span>${esc(c.id)}</span><span>·</span><span>${c.semester}ο εξ.</span><span>·</span><span>${mandatory(c)?'Υποχρεωτικό':'Επιλογής'}</span></div>${selected?`<div class="course-meta"><span>${meetings(c.id).filter(included).length} ενεργές συναντήσεις</span><span class="credit-tag">${ects(c)??'?'} ECTS</span></div>`:''}<div class="course-meta">${passed?'<span class="tag">✓ Περασμένο</span>':''}${!available(c)?'<span class="tag">Χωρίς ώρες</span>':''}${missing.length?`<span class="tag warn">${missing.length} προαπαιτούμενα προς έλεγχο</span>`:''}</div></div><button class="course-add" data-toggle="${esc(c.id)}" aria-label="${selected?'Αφαίρεση':'Προσθήκη'}: ${esc(c.name)}" aria-pressed="${selected}">${selected?'−':'+'}</button>${filter==='all'||filter==='passed'?`<label class="course-pass"><input type="checkbox" data-passed="${esc(c.id)}" ${passed?'checked':''}>Το έχω περάσει</label>`:''}</article>`;}).join('')||'<div class="no-results">Δεν βρέθηκαν μαθήματα με αυτά τα φίλτρα.</div>';
 if(focusKey)$('courseList').querySelector(`[data-${focusKey}="${CSS.escape(focused.dataset[focusKey])}"]`)?.focus({preventScroll:true});
 hoveredCourse=$('courseList').querySelector('.course:hover')?.dataset.course||'';
 highlightCourse();
}
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let printLayoutActive=false,hoveredCourse='';
function highlightCourse(){
 const id=hoveredCourse||document.activeElement.closest('.course')?.dataset.course;
 for(const block of $('calendar').querySelectorAll('.meeting'))block.classList.toggle('course-highlight',block.dataset.detail===id);
}
function fitCalendar(){
 const calendar=$('calendar'),wrap=$('calendarWrap'),panel=wrap.closest('.schedule-panel'),sheet=panel.parentElement;
 const printing=printLayoutActive||matchMedia('print').matches;
 panel.style.removeProperty('--print-scale');
 panel.style.removeProperty('--print-width');
 if(printing){
  // Lay out full titles first, then shrink the complete panel to the A4 sheet.
  const lanes=parseFloat(calendar.style.getPropertyValue('--day-min'))/220;
  panel.style.setProperty('--print-width',Math.max(sheet.clientWidth,46+5*lanes*90)+'px');
 }
 calendar.style.removeProperty('--hour');
 if(!wrap.hidden){
  const hours=Number(calendar.style.getPropertyValue('--hours'));
  let hour=calendar.querySelector('.day-column').offsetHeight/hours;
  // Measure natural card content so short lessons grow the shared time scale too.
  calendar.classList.add('measuring');
  for(const block of calendar.querySelectorAll('.meeting')){
   const css=getComputedStyle(block),inset=['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((sum,key)=>sum+parseFloat(css[key]),0);
   const required=block.querySelector('.meeting-content').offsetHeight+inset+5;
   hour=Math.max(hour,required*60/Number(block.dataset.duration));
  }
  calendar.style.setProperty('--hour',Math.ceil(hour)+'px');
  calendar.classList.remove('measuring');
 }
 $('calendarHint').hidden=wrap.hidden||wrap.scrollWidth<=wrap.clientWidth+1;
 if(printing){
  const scale=Math.min(1,sheet.clientWidth/panel.offsetWidth,sheet.clientHeight/panel.offsetHeight);
  panel.style.setProperty('--print-scale',String(Math.floor(scale*100000)/100000));
 }
}
function renderSchedule(){
 const animate=!reducedMotion.matches&&!printLayoutActive&&!matchMedia('print').matches;
 const previous=new Map(animate?[...$('calendar').querySelectorAll('.meeting')].map(b=>[b.dataset.event,b.getBoundingClientRect()]):[]);
 const events=activeEvents(),pairs=conflicts(events),conflictIds=new Set(pairs.flat().map(e=>e.id));
 $('countStat').textContent=chosen().length;$('hoursStat').textContent=(contactMinutes(events)/60).toLocaleString('el-GR',{maximumFractionDigits:1});$('conflictStat').textContent=pairs.length;$('conflictStat').classList.toggle('has-conflict',!!pairs.length);
 const reviewCount=chosen().filter(id=>state.review.includes(id)).length;
 $('countBreakdown').hidden=reviewCount===0;
 $('countBreakdown').textContent=reviewCount?`(${chosen().length-reviewCount} + ${reviewCount} προς έλεγχο)`:'';
 $('scheduleTitle').textContent=chosen().length?`${state.season==='fall'?'Χειμερινό':'Εαρινό'} · εβδομαδιαίο πρόγραμμα`:'Μια εβδομάδα, στα μέτρα σου.';
 $('emptyState').hidden=events.length>0;$('calendarWrap').hidden=events.length===0;
 if(!events.length){$('emptyState').querySelector('h3').textContent=chosen().length?'Οι επιλογές σου κρατήθηκαν.':'Πρώτα, τα μαθήματά σου.';$('emptyState').querySelector('p').innerHTML=chosen().length?'Δεν υπάρχουν ενεργές ώρες για τις επιλογές σου.<br>Έλεγξε τη διαθεσιμότητα και τις συναντήσεις κάθε μαθήματος.':'Πάτησε + στον κατάλογο αριστερά.<br>Οι ώρες και οι αίθουσες θα μπουν αυτόματα εδώ.';}
 const min=Math.min(9*60,...events.map(e=>Math.floor(e.start/60)*60)),max=Math.max(22*60,...events.map(e=>Math.ceil(e.end/60)*60));
 const hours=(max-min)/60;$('calendar').style.setProperty('--hours',hours);
 let html='<div class="day-head time-head">ΩΡΑ</div>'+DAYS.map((d,i)=>`<div class="day-head"><b>${d}</b><small>${events.filter(e=>e.day===i).length} συναντήσεις · ${(contactMinutes(events.filter(e=>e.day===i))/60).toLocaleString('el-GR')} ώρες</small></div>`).join('');
 html+='<div class="time-axis">'+Array.from({length:hours+1},(_,i)=>`<span class="time-tick" style="top:${i/hours*100}%">${time(min+i*60)}</span>`).join('')+'</div>';
 const laidOut=layoutEvents(events);
 for(let d=0;d<5;d++)html+='<div class="day-column">'+Array.from({length:hours},(_,i)=>`<span class="hour-rule" style="top:${i/hours*100}%"></span>`).join('')+laidOut.filter(e=>e.day===d).map(e=>{const c=course(e.courseId);if(!c)return '';const detail=`${DAYS[d]} ${time(e.start)}–${time(e.end)} · ${c.name} · ${e.type} · ${e.room} · ${e.teacher}`;const review=state.review.includes(c.id);return `<button class="meeting ${conflictIds.has(e.id)?'conflict':''} ${review?'review':''}" data-detail="${esc(c.id)}" data-duration="${e.end-e.start}" data-event="${esc(e.id)}" title="${esc(detail)}" aria-label="${esc(detail)}" style="top:calc(${(e.start-min)/(max-min)*100}% + 2px);height:calc(${(e.end-e.start)/(max-min)*100}% - 4px);left:calc(${e.lane/e.lanes*100}% + 3px);width:calc(${100/e.lanes}% - 6px);--event-color:${baseColor(c)};--event-bg:${pale(baseColor(c))};--event-border:${dark(baseColor(c))}"><span class="meeting-content"><span class="event-time">${time(e.start)}–${time(e.end)}${conflictIds.has(e.id)?' ⚠':''}</span><strong class="full-title">${esc(c.name)}</strong><span class="event-room"><span class="event-type">${esc(e.type)} · </span>${esc(e.room)}</span><span class="event-teacher">${esc(e.teacher)}</span></span></button>`;}).join('')+'</div>';
 $('calendar').innerHTML=html;
 $('calendar').style.setProperty('--day-min',Math.max(1,...laidOut.map(e=>e.lanes))*220+'px');
 const legendCourses=chosen().map(course).filter(Boolean),seen=new Set();
 $('legend').innerHTML=legendCourses.filter(c=>{const key=colorKey(c);if(seen.has(key))return false;seen.add(key);return true;}).map(c=>`<label class="legend-item" style="--legend-bg:${baseColor(c)}"><span class="color-swatch" aria-hidden="true" style="background:${baseColor(c)}"></span><input type="color" value="${baseColor(c)}" data-color="${esc(colorKey(c))}" aria-label="Χρώμα ${esc(state.colorMode==='course'?c.name:c.semester+'ου εξαμήνου')}"><span>${esc(state.colorMode==='course'?c.id+' · '+c.name:c.semester+'ο εξάμηνο')}</span></label>`).join('')+(state.review.some(id=>chosen().includes(id))?'<span class="legend-item">▨ Προς έλεγχο</span>':'')+(pairs.length?'<span class="legend-item">⚠ Διακεκομμένο περίγραμμα: επικάλυψη</span>':'');
 renderChecks(pairs);
 fitCalendar();
 highlightCourse();
 if(animate)for(const block of $('calendar').querySelectorAll('.meeting')){
  const old=previous.get(block.dataset.event),now=block.getBoundingClientRect();
  if(old&&now.width&&now.height){
   const x=old.left-now.left,y=old.top-now.top,sx=old.width/now.width,sy=old.height/now.height;
   if(Math.abs(x)+Math.abs(y)+Math.abs(old.width-now.width)+Math.abs(old.height-now.height)>1)block.animate([{transform:`translate(${x}px,${y}px) scale(${sx},${sy})`},{transform:'none'}],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)'});
  }else block.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:180,easing:'ease-out'});
 }
}
function renderChecks(pairs){
 const issues=[],selected=chosen().map(course).filter(Boolean),planned=declaration().map(course).filter(Boolean),plannedIds=planned.map(c=>c.id),review=selected.filter(c=>state.review.includes(c.id)),offer=data.catalog.filter(available);
 const courseLabel=c=>`${c.name}${state.review.includes(c.id)?' (προς έλεγχο)':''}`;
 for(const c of selected){for(const issue of courseIssues(c))issues.push(`${courseLabel(c)}: ${issue}`);const labs=meetings(c.id).filter(isLab);if(labs.length&&!labs.some(included))issues.push(`${courseLabel(c)}: υπάρχουν εργαστηριακές ζώνες. Άνοιξε το μάθημα για να επιλέξεις το τμήμα σου· δεν προστέθηκαν αυτόματα.`);if(meetings(c.id).some(e=>!isLab(e)&&!included(e)))issues.push(`${courseLabel(c)}: έχεις κρύψει μία ή περισσότερες συναντήσεις της επίσημης πηγής.`);}
 for(const [a,b]of pairs)issues.push(`${DAYS[a.day]} ${time(Math.max(a.start,b.start))}–${time(Math.min(a.end,b.end))}: ${course(a.courseId)?.name} / ${course(b.courseId)?.name}${state.review.includes(a.courseId)||state.review.includes(b.courseId)?' (περιλαμβάνει μάθημα προς έλεγχο)':''}.`);
 if(selected.length&&!state.entryYear)issues.push('Συμπλήρωσε έτος εισαγωγής στο προφίλ για τους κανόνες δήλωσης.');
 if(selected.length&&!state.passedComplete)issues.push('Η λίστα περασμένων δεν έχει επιβεβαιωθεί ως πλήρης. Οι έλεγχοι προαπαιτουμένων είναι ενδείξεις.');
 if(state.entryYear==='new'&&planned.length){
  const count=planned.filter(c=>c.id!=='ECE588'&&ects(c)!==0).length;
  if(count>9)issues.push(`Όριο δήλωσης για εισαγωγή από 2023–24: ${count} μαθήματα με ECTS, με μέγιστο 9 ανά εξάμηνο, εκτός διπλωματικής.`);
  const english=state.season==='fall'?'ECE121':'ECE122';if(!state.passed.includes(english)&&!plannedIds.includes(english))issues.push(`${english}: απαιτείται δήλωση του οφειλόμενου μαθήματος Αγγλικών στην αντίστοιχη περίοδο. Οι τρέχοντες μεταβατικοί κανόνες το αναφέρουν με 2 ECTS.`);
  const missing=offer.filter(c=>mandatory(c)&&!state.passed.includes(c.id)&&!plannedIds.includes(c.id)&&prerequisites(c)!==null&&!outstanding(c).length&&(!state.studySemester||c.semester<=Number(state.studySemester)));
  if(planned.some(c=>!mandatory(c))&&missing.length)issues.push(`Προτεραιότητα υποχρεωτικών (σ. 20): δεν έχουν επιλεγεί ${missing.map(c=>c.id).join(', ')}. Η διαθεσιμότητα ελέγχεται από το ωρολόγιο και τα καταχωρισμένα περασμένα.`);
  const allocatedCourses=[...new Set([...state.passed,...plannedIds])].map(course).filter(Boolean);
  const unassigned=allocatedCourses.filter(c=>!mandatory(c)&&c.id!=='ECE588'&&credited(c)===null);
  if(unassigned.length)issues.push(`Δεν έχει οριστεί χρέωση για ${unassigned.map(c=>c.id+' · '+c.name).join(', ')}. Το εξάμηνο του καταλόγου δεν θεωρείται χρέωση. Όρισε στις λεπτομέρειες το εξάμηνο που καλύπτει κάθε επιλογής· ο έλεγχος χρεώσεων παραμένει ελλιπής.`);
  const allocations=Array.from({length:9},(_,i)=>({sem:i+1,items:allocatedCourses.filter(c=>!['ECE121','ECE122'].includes(c.id)&&credited(c)===i+1)}));
  for(const a of allocations)if(a.items.length>5)issues.push(`Χρέωση ${a.sem}ου εξαμήνου: ${a.items.length} περασμένα ή προς δήλωση για 5 θέσεις πτυχίου (${a.items.map(c=>c.id).join(', ')}). Πρόκειται για θέσεις αυτού του εξαμήνου στο πτυχίο, όχι για το σύνολο μαθημάτων που δίνεις τώρα. Έλεγξε τις χρεώσεις των επιλογής στις λεπτομέρειες.`);
  const ordered=planned.filter(c=>missing.some(m=>m.semester<credited(c)));if(ordered.length)issues.push('Σειρά εξαμήνων (σ. 20): έχουν μείνει διαθέσιμα υποχρεωτικά προηγούμενων εξαμήνων. Ο πλήρης έλεγχος σειράς και κάλυψης επιλογών χρειάζεται επιβεβαίωση στη Γραμματεία.');
 }
 const specials=[...new Set([...state.passed,...plannedIds])].map(course).filter(c=>c&&norm(c.name).includes('ειδικα θεματα'));
 if(specials.length>2)issues.push('Έχουν σημειωθεί περισσότερα από δύο «Ειδικά Θέματα – Εργασίες» συνολικά (οδηγός σ. 21).');
 if(state.entryYear==='old'&&selected.length)issues.push('Οι κανόνες δήλωσης στη σ. 20 αφορούν εισαγωγή από το 2023–24. Για προηγούμενα έτη απαιτείται ο αντίστοιχος κανονισμός.');
 const credits=planned.reduce((n,c)=>n+(ects(c)||0),0),unknown=planned.filter(c=>ects(c)===null).length;
 $('creditsStat').textContent=credits+(unknown?'+?':'');
 $('creditsStat').title='ECTS των μαθημάτων προς δήλωση, χωρίς τα προς έλεγχο';
 $('checkBadge').textContent=issues.length?`${issues.length} σημεία προς έλεγχο`:selected.length?'Χωρίς εντοπισμένες ενδείξεις':'Προσθήκη μαθημάτων';
 $('checkContent').innerHTML=`<p><b>Προς δήλωση: ${planned.length} μαθήματα</b>${review.length?` · ${review.length} προς έλεγχο, εκτός υπολογισμού δήλωσης`:""}.</p><p class="subtle">${credits} γνωστά ECTS προς δήλωση${unknown?` · ${unknown} μαθήματα με άγνωστα ECTS`:''}. Οι ώρες και οι επικαλύψεις περιλαμβάνουν όλα τα μαθήματα του ωρολογίου, μαζί με τα προς έλεγχο. Οι ώρες μετρούν τον χρόνο παρουσίας χωρίς διπλή μέτρηση επικαλύψεων. Οι επικαλύψεις μετρούν ζεύγη συναντήσεων.</p>`+(issues.length?'<ul>'+issues.map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>':'<p class="subtle">Δεν εντοπίστηκαν ενδείξεις με τα καταχωρισμένα στοιχεία.</p>')+'<p class="subtle">Συμβουλευτικός έλεγχος με βάση τον οδηγό 2024–25 και τους τρέχοντες μεταβατικούς κανόνες δήλωσης για εισαγωγή από 2023–24 (έλεγχος 18/09/2026). Δεν πιστοποιεί δικαίωμα δήλωσης. Η ανανέωση αφορά το ωρολόγιο και τον κατάλογο, όχι τους κανόνες του οδηγού. <button class="link-button" data-guide>Πεδίο ελέγχων και πηγές</button></p>';
}
function render(){
 for(const b of document.querySelectorAll('[data-season]'))b.setAttribute('aria-pressed',String(b.dataset.season===state.season));
 const snapshot=data[state.season];$('syncMeta').textContent='Ανάκτηση πηγής: '+dateText(snapshot.fetchedAt);
 $('periodLabel').textContent=`${new Set(snapshot.events.map(e=>e.courseId)).size} μαθήματα με δημοσιευμένες ώρες`;
 $('availabilityNote').hidden=snapshot.published!==false;$('availabilityNote').textContent='Η επίσημη σελίδα του εαρινού/χειμερινού που ανακτήθηκε είναι κενή. Δεν υπάρχουν δημοσιευμένες ώρες σε αυτή την πηγή. Οι επιλογές παραμένουν διαθέσιμες στον πλήρη κατάλογο.';
 $('colorMode').value=state.colorMode;$('provider').value=state.provider;
 $('profileButton').textContent=state.studySemester?`Προφίλ · ${state.studySemester}ο εξάμηνο ↗`:'Το προφίλ σπουδών μου ↗';
 renderList();renderSchedule();renderSources();
}
function toggleCourse(id){state.selected[state.season]=setIn(chosen(),id,!chosen().includes(id));persist();render();if(detailId===id&&$('courseDialog').open)renderDetail(id);}
function setPassed(id,on){state.passed=setIn(state.passed,id,on);persist();render();if(detailId===id&&$('courseDialog').open)renderDetail(id);}
function renderDetail(id){
 const c=course(id);if(!c)return;detailId=id;const g=guideCourse(id),pre=prerequisites(c),list=meetings(id);
 $('detailCode').textContent=`${c.id} · ${c.semester}ο εξάμηνο · ${mandatory(c)?'Υποχρεωτικό':'Επιλογής'}${ects(c)!==null?' · '+ects(c)+' ECTS':''}`;$('detailName').textContent=c.name;
 let html=`<div class="detail-actions"><button class="primary" data-toggle="${esc(id)}">${chosen().includes(id)?'− Αφαίρεση από πρόγραμμα':'+ Προσθήκη στο πρόγραμμα'}</button><label class="check-label"><input type="checkbox" data-passed="${esc(id)}" ${state.passed.includes(id)?'checked':''}>Το έχω περάσει</label></div>`;
 html+=`<label class="check-label"><input type="checkbox" data-review="${esc(id)}" ${state.review.includes(id)?'checked':''}>Προς έλεγχο: στο ωρολόγιο, εκτός σχεδίου δήλωσης</label>`;
 if(!mandatory(c)&&c.semester>=5){const options=c.semester%2?[5,7,9]:[6,8];html+=`<label style="margin-top:15px">Χρέωση μαθήματος στο εξάμηνο<select data-credit="${esc(id)}"><option value="" ${credited(c)===null?'selected':''}>Δεν έχει οριστεί</option>${options.map(s=>`<option value="${s}" ${credited(c)===s?'selected':''}>${s}ο εξάμηνο</option>`).join('')}</select></label><p class="subtle">Όρισε το εξάμηνο που καλύπτει στο πτυχίο σου, όχι αυτό του καταλόγου. Π.χ. επιλογής του 5ου ή 9ου μπορεί να χρεωθεί στο 7ο (οδηγός σ. 21). Η χρέωση ισχύει και για περασμένα· τα οφειλόμενα υποχρεωτικά κρατούν το δικό τους εξάμηνο.</p>`;}
 html+='<h3>Προαπαιτούμενα</h3>';
 html+=pre===null?'<p>Δεν βρέθηκαν επαληθευμένα στοιχεία στον οδηγό 2024–25. Έλεγξε την επίσημη περιγραφή.</p>':pre.length?'<ul>'+pre.map(p=>`<li>${state.passed.includes(p)?'✓':'○'} ${esc(p)} · ${esc(course(p)?.name||'Μάθημα εκτός τρέχοντος καταλόγου')}${state.passed.includes(p)?' — περασμένο':''}</li>`).join('')+'</ul>':'<p>Κανένα, σύμφωνα με τον οδηγό 2024–25.</p>';
 if(g)html+=`<p class="subtle">Πηγή: οδηγός σπουδών 2024–25, σ. ${esc((g.pages||[]).join(', '))}. ${esc(g.prerequisiteText||'')}</p>`;
 html+='<h3>Συναντήσεις στην επίσημη πηγή</h3><p class="subtle">Οι διαλέξεις και τα φροντιστήρια μπαίνουν αυτόματα. Για εργαστήρια, διάλεξε τις ζώνες του τμήματός σου. Μια πολύωρη ζώνη μπορεί να περιλαμβάνει περισσότερες ομάδες· επιβεβαίωσε το ακριβές τμήμα με τον διδάσκοντα.</p>';
 html+=list.length?list.slice().sort((a,b)=>a.day-b.day||a.start-b.start).map(e=>`<label class="meeting-option"><input type="checkbox" data-meeting="${esc(e.id)}" ${included(e)?'checked':''}><span><b>${DAYS[e.day]} ${time(e.start)}–${time(e.end)}</b><small>${esc(e.type)} · ${esc(e.room)}</small><small>${esc(e.teacher)}</small></span></label>`).join(''):'<p>Δεν υπάρχουν δημοσιευμένες ώρες για αυτό το μάθημα στην επιλεγμένη περίοδο.</p>';
 const url=c.url||SOURCES.catalog;html+=`<p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Επίσημη περιγραφή μαθήματος ↗</a></p>`;
 $('detailBody').innerHTML=html;
}
function openDetail(id){renderDetail(id);if(!$('courseDialog').open)$('courseDialog').showModal();}
function renderSources(){const labels={fall:'Χειμερινό ωρολόγιο ανά έτος',spring:'Εαρινό ωρολόγιο ανά έτος',catalog:'Πλήρης κατάλογος μαθημάτων'};$('sourceLinks').innerHTML=Object.entries(SOURCES).map(([kind,url])=>`<div><a href="${url}" target="_blank" rel="noopener noreferrer">${labels[kind]} ↗</a><small>Ανακτήθηκε ${dateText(kind==='catalog'?data.catalogFetchedAt:data[kind].fetchedAt)}</small></div>`).join('');}
function renderGuide(){
 $('guideContent').innerHTML=`<p>Οι παρακάτω έλεγχοι βασίζονται στον οδηγό <b>2024–25</b> που δόθηκε με την εφαρμογή. Η σημερινή προσφορά μαθημάτων και οι ώρες προκύπτουν από τα επίσημα ωρολόγια.</p><div class="guide-rule"><p><b>Προαπαιτούμενα · σ. 21, 25</b><br>Πρέπει να έχουν περαστεί σε προηγούμενο εξάμηνο. Η εφαρμογή συγκρίνει τους κωδικούς του οδηγού με όσα έχεις σημειώσει περασμένα.</p></div><div class="guide-rule"><p><b>Για εισαγωγή από το 2023–24 · σ. 20–21</b><br>Έως 9 μαθήματα με ECTS ανά περίοδο, πέρα από διπλωματική. Προτεραιότητα στα διαθέσιμα υποχρεωτικά και σειρά εξαμήνων. Δηλώνεται και το οφειλόμενο μάθημα Αγγλικών της αντίστοιχης περιόδου. Οι τρέχοντες <a href="https://www.e-ce.uth.gr/studies/undergraduate/" target="_blank" rel="noopener noreferrer">μεταβατικοί κανόνες του Τμήματος</a> το αναφέρουν με 2 ECTS, σε αντίθεση με τα 0 ECTS του οδηγού 2024–25· για εισαγωγή από 2023–24 η εφαρμογή το μετρά στο όριο των 9.</p></div><div class="guide-rule"><p><b>Επιλογής · σ. 21</b><br>Στο 5ο, 7ο και 9ο μπορούν να χρεωθούν επιλογής από τα 5ο/7ο/9ο. Στο 6ο και 8ο, από τα 6ο/8ο. Ορίζεις τη χρέωση στις λεπτομέρειες. Χωρίς ρητή χρέωση, η εφαρμογή δεν χρησιμοποιεί το εξάμηνο του καταλόγου ως εξάμηνο πτυχίου. Τα οφειλόμενα υποχρεωτικά προηγούμενων εξαμήνων μετρούν στο συνολικό όριο δήλωσης, όχι στις πέντε θέσεις επιλογής του 7ου. Έως δύο «Ειδικά Θέματα – Εργασίες» συνολικά, με έγκριση επιβλέποντα και την επίσημη διαδικασία αιτήσεων.</p></div><div class="guide-rule"><p><b>Διπλωματική · σ. 25</b><br>Τουλάχιστον 180 περασμένα ECTS και έγκριση του Τμήματος. Δεν δημιουργούνται πλασματικές εβδομαδιαίες ώρες για διπλωματική ή πρακτική.</p></div><p>Τα «προς έλεγχο» παραμένουν στο ωρολόγιο για σύγκριση ωρών. Δεν προσμετρώνται στο σχέδιο δήλωσης, στα ECTS δήλωσης, στις χρεώσεις ή στην κάλυψη υποχρεωτικών. Αφαίρεσε τη σήμανση όταν αποφασίσεις να τα δηλώσεις.</p><h3>Τι ελέγχεται αυτόματα</h3><p>Επικαλύψεις ενεργών συναντήσεων, προαπαιτούμενα που λείπουν από τα περασμένα, απουσία από το ωρολόγιο, όριο 9 μαθημάτων για το αντίστοιχο έτος εισαγωγής, Αγγλικά, διαθέσιμα υποχρεωτικά που παραλείφθηκαν, πάνω από 5 μαθήματα χρεωμένα ανά εξάμηνο και πάνω από 2 ειδικά θέματα.</p><h3>Τι χρειάζεται επιβεβαίωση</h3><p>Κανόνες εισαγωγής πριν το 2023–24, μεταβατικές διατάξεις, μερική φοίτηση, πλήρης σειρά δηλώσεων επιλογής, απαιτήσεις γνωστικών τομέων/αποφοίτησης, αλλαγές μετά το 2024–25 και εγκρίσεις διπλωματικής ή ειδικών θεμάτων. Η λίστα περασμένων δεν είναι αναλυτική βαθμολογία και οι προειδοποιήσεις δεν αποκλείουν την προσθήκη μαθημάτων.</p><p class="subtle">Ο ενσωματωμένος οδηγός περιλαμβάνει ${GUIDE.courses?.length||0} καταχωρίσεις μαθημάτων. Όταν ένα μάθημα δεν καλύπτεται, εμφανίζεται «δεν υπάρχουν επαληθευμένα στοιχεία», όχι «κανένα προαπαιτούμενο».</p>`;
}
async function fetchSource(kind){
 const url=SOURCES[kind],controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),35000);
 try{let endpoint=url,headers={};if(state.provider==='jina'){endpoint='https://r.jina.ai/'+url;headers={'X-Respond-With':'html','X-No-Cache':'true'};}else if(state.provider==='allorigins')endpoint='https://allorigins.hexlet.app/raw?url='+encodeURIComponent(url);
  const response=await fetch(endpoint,{headers,signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}`);const text=await response.text();if(text.length>4000000)throw new Error('Το αρχείο υπερβαίνει το επιτρεπόμενο μέγεθος.');return text;
 }finally{clearTimeout(timeout);}
}
function preserveCatalog(next){const ids=new Set(next.map(c=>c.id));for(const c of data.catalog)if(!ids.has(c.id)&&[...state.passed,...state.selected.fall,...state.selected.spring].includes(c.id))next.push({...c,archived:true});return next;}
async function refresh(){
 if(busy)return;busy=true;$('refresh').disabled=true;$('importFile').disabled=true;
 try{notify('Ανάκτηση καταλόγου μαθημάτων…');const catalog=SourceParser.parseCatalog(await fetchSource('catalog'));notify('Ανάκτηση χειμερινού ωρολογίου…');const fall=SourceParser.parseTimetable(await fetchSource('fall'),'fall',catalog);notify('Ανάκτηση εαρινού ωρολογίου…');const spring=SourceParser.parseTimetable(await fetchSource('spring'),'spring',catalog);
  const oldCount=data.fall.events.length+data.spring.events.length;data={catalog:preserveCatalog(catalog),fall,spring,catalogFetchedAt:new Date().toISOString()};persist();render();
  notify(`Η ανανέωση ολοκληρώθηκε: ${fall.events.length} χειμερινές και ${spring.events.length} εαρινές συναντήσεις (προηγουμένως ${oldCount} συνολικά). Οι επιλογές σου διατηρήθηκαν.${!spring.published?' Η εαρινή πηγή είναι κενή.':''}`);
 }catch(error){notify(`Η ανανέωση δεν ολοκληρώθηκε: ${error.name==='AbortError'?'η υπηρεσία δεν απάντησε εντός 35 δευτερολέπτων':error.message}. Διατηρήθηκαν όλα τα προηγούμενα δεδομένα. Στις «Πηγές & ενημέρωση» μπορείς να αλλάξεις υπηρεσία ή να εισαγάγεις αποθηκευμένη επίσημη σελίδα.`,true);}finally{busy=false;$('refresh').disabled=false;$('importFile').disabled=false;}
}
async function importHtml(){
 const file=$('importFile').files[0];if(!file)return;$('importStatus').textContent='Ανάγνωση αρχείου…';
 try{if(file.size>4000000)throw new Error('Το αρχείο είναι μεγαλύτερο από 4 MB.');const html=await file.text(),kind=$('importKind').value;if(kind==='catalog'){const catalog=SourceParser.parseCatalog(html);data={...data,catalog:preserveCatalog(catalog),catalogFetchedAt:new Date().toISOString()};}else{const snapshot=SourceParser.parseTimetable(html,kind,data.catalog);data={...data,[kind]:snapshot};}persist();render();$('importStatus').textContent='';$('sourcesDialog').close();notify('Η επίσημη σελίδα εισήχθη. Η ημερομηνία δείχνει την εισαγωγή· η σελίδα μπορεί να έχει αποθηκευτεί παλαιότερα.');}catch(error){$('importStatus').textContent='Η εισαγωγή απορρίφθηκε: '+error.message+' Τα προηγούμενα δεδομένα διατηρήθηκαν.';}finally{$('importFile').value='';}
}
function downloadCopy(){
 const root=document.documentElement.cloneNode(true),json=v=>JSON.stringify(v).replace(/</g,'\\u003c');root.querySelector('#initial-data').textContent=json(data);root.querySelector('#initial-state').textContent=json({...state,storageId:crypto.randomUUID()});root.querySelectorAll('dialog').forEach(d=>d.removeAttribute('open'));root.querySelector('#notice').hidden=true;root.querySelector('#refresh').disabled=false;
 const blob=new Blob(['<!doctype html>\n'+root.outerHTML],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='THMMY-programma-'+new Date().toISOString().slice(0,10)+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
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
async function encodeTransfer(){
 if(typeof CompressionStream==='undefined')throw new Error('Ο browser δεν υποστηρίζει κωδικούς μεταφοράς. Χρησιμοποίησε έναν ενημερωμένο browser ή την αποθήκευση αντιγράφου HTML.');
 const snapshot=validateTransfer({state,data,theme:themePreference}),bytes=new TextEncoder().encode(JSON.stringify(snapshot));
 if(bytes.length>TRANSFER_LIMIT)throw new Error('Το αντίγραφο είναι πολύ μεγάλο για κωδικό. Χρησιμοποίησε την αποθήκευση αντιγράφου HTML.');
 const compressed=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 const code='THMMY1.'+btoa(Array.from(compressed,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 if(code.length>200000)throw new Error('Το αντίγραφο είναι πολύ μεγάλο για κωδικό. Χρησιμοποίησε την αποθήκευση αντιγράφου HTML.');return code;
}
async function decodeTransfer(input){
 if(input.length>200000)throw new Error('Ο κωδικός ξεπερνά το επιτρεπόμενο μέγεθος.');
 const code=input.replace(/\s/g,'');
 if(/^THMMY\d+\./.test(code)&&!code.startsWith('THMMY1.'))throw new Error('Αυτή η έκδοση κωδικού δεν υποστηρίζεται. Άνοιξε την τελευταία έκδοση της εφαρμογής.');
 if(!/^THMMY1\.[A-Za-z0-9_-]+$/.test(code))throw new Error('Επικόλλησε ολόκληρο τον κωδικό που αρχίζει με THMMY1.');
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
  $('transferSummary').textContent=`${s.passed.length} περασμένα · ${s.selected.fall.length} χειμερινά (${review(s.selected.fall)} προς έλεγχο) · ${s.selected.spring.length} εαρινά (${review(s.selected.spring)} προς έλεγχο). ${Object.keys(s.creditTo).length} χρεώσεις εξαμήνων · ${s.labs.length} εργαστηριακές επιλογές · ${s.excluded.length} κρυμμένες συναντήσεις. Προφίλ: ${s.studySemester?s.studySemester+'ο εξάμηνο':'χωρίς εξάμηνο'}, ${s.passedComplete?'πλήρης λίστα περασμένων':'μη επιβεβαιωμένη λίστα περασμένων'}. Χειμερινή πηγή: ${dateText(decoded.data.fall.fetchedAt)} · εαρινή πηγή: ${dateText(decoded.data.spring.fetchedAt)}.`;
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
 $('search').value='';$('semesterFilter').value='';$('listFilter').value='offered';render();$('transferDialog').close();
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
$('downloadTransfer').onclick=()=>{const url=URL.createObjectURL(new Blob([$('exportCode').value+'\n'],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='THMMY-backup-'+new Date().toISOString().slice(0,10)+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
$('transferFile').onchange=async()=>{resetTransferPreview();const file=$('transferFile').files[0],attempt=transferAttempt;if(!file)return;try{if(file.size>200000)throw new Error('Το αρχείο είναι μεγαλύτερο από 200 KB.');const code=await file.text();if(attempt!==transferAttempt)return;$('importCode').value=code;await inspectTransfer();}catch(error){if(attempt===transferAttempt)$('transferStatus').textContent=error.message;}finally{$('transferFile').value='';}};
$('semesterFilter').length=1;$('studySemester').length=1;
$('theme').value=themePreference;
$('theme').onchange=()=>{
 themePreference=$('theme').value;applyTheme();
 try{localStorage.setItem('thmmy-planner-theme',themePreference);}catch{notify('Το θέμα άλλαξε, αλλά ο browser δεν μπόρεσε να αποθηκεύσει την προτίμησή σου.',true);}
};
for(let i=1;i<=10;i++)$('semesterFilter').add(new Option(`${i}ο εξάμηνο`,i));for(let i=1;i<=16;i++)$('studySemester').add(new Option(i===16?'16ο ή μεταγενέστερο':`${i}ο εξάμηνο`,i));
document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.detail)openDetail(b.dataset.detail);else if(b.dataset.toggle)toggleCourse(b.dataset.toggle);else if(b.dataset.close)$(b.dataset.close).close();else if(b.hasAttribute('data-guide'))$('guideDialog').showModal();else if(b.dataset.season){state.season=b.dataset.season;persist();render();}});
document.addEventListener('change',event=>{const e=event.target;if(e.dataset.passed)setPassed(e.dataset.passed,e.checked);if(e.dataset.review){state.review=setIn(state.review,e.dataset.review,e.checked);persist();renderSchedule();}if(e.dataset.meeting){const m=allMeetings().find(m=>m.id===e.dataset.meeting);if(m){if(isLab(m))state.labs=setIn(state.labs,m.id,e.checked);else state.excluded=setIn(state.excluded,m.id,!e.checked);persist();renderList();renderSchedule();}}if(e.dataset.credit){if(e.value)state.creditTo[e.dataset.credit]=Number(e.value);else delete state.creditTo[e.dataset.credit];persist();renderSchedule();}if(e.dataset.color){state.colors[e.dataset.color]=e.value;persist();renderList();renderSchedule();}});
$('search').addEventListener('input',renderList);$('semesterFilter').addEventListener('change',renderList);$('listFilter').addEventListener('change',renderList);$('colorMode').addEventListener('change',e=>{state.colorMode=e.target.value;persist();renderList();renderSchedule();});
$('profileButton').onclick=()=>{$('entryYear').value=state.entryYear;$('studySemester').value=state.studySemester;$('passedComplete').checked=state.passedComplete;$('profileDialog').showModal();};
$('saveProfile').onclick=()=>{state.entryYear=$('entryYear').value;state.studySemester=$('studySemester').value;state.passedComplete=$('passedComplete').checked;persist();render();$('profileDialog').close();};
$('sourcesButton').onclick=()=>$('sourcesDialog').showModal();$('guideButton').onclick=()=>$('guideDialog').showModal();$('provider').onchange=e=>{state.provider=e.target.value;persist();};$('refresh').onclick=refresh;$('importFile').onchange=importHtml;$('saveCopy').onclick=downloadCopy;$('printButton').onclick=()=>window.print();
$('focusSchedule').onclick=()=>{const wide=document.body.classList.toggle('wide-layout');$('focusSchedule').textContent=wide?'Εμφάνιση μαθημάτων':'Απόκρυψη μαθημάτων';$('focusSchedule').setAttribute('aria-expanded',String(!wide));hoveredCourse='';highlightCourse();fitCalendar();};
const dataMenu=$('dataMenu');
dataMenu.addEventListener('click',event=>{if(event.target.closest('button')){dataMenu.open=false;dataMenu.querySelector('summary').focus();}},true);
dataMenu.addEventListener('focusout',event=>{if(!dataMenu.contains(event.relatedTarget))dataMenu.open=false;});
document.addEventListener('click',event=>{if(!dataMenu.contains(event.target))dataMenu.open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&dataMenu.open){dataMenu.open=false;dataMenu.querySelector('summary').focus();event.preventDefault();}});
$('courseList').addEventListener('pointerover',event=>{if(event.pointerType==='touch')return;hoveredCourse=event.target.closest('.course')?.dataset.course||'';highlightCourse();});
$('courseList').addEventListener('pointerout',event=>{hoveredCourse=event.relatedTarget?.closest('.course')?.dataset.course||'';highlightCourse();});
for(const type of ['focusin','focusout'])$('courseList').addEventListener(type,()=>queueMicrotask(highlightCourse));
reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)document.getAnimations().forEach(a=>a.cancel());});
renderGuide();
$('guideContent').insertAdjacentHTML('beforeend','<details><summary>Αναλυτικές σημειώσεις οδηγού και παραπομπές</summary><ul>'+(GUIDE.rules||[]).map(r=>`<li>${esc(r.text)} <small>(σ. ${esc(r.pages.join(', '))})</small></li>`).join('')+'</ul></details>');
render();if(storageWarning)notify(storageWarning,true);

let calendarWidth=0;
new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(width!==calendarWidth){calendarWidth=width;fitCalendar();}}).observe($('calendarWrap'));
document.fonts.ready.then(fitCalendar);
matchMedia('print').addEventListener('change',fitCalendar);
const printRules=[...document.styleSheets].flatMap(sheet=>[...sheet.cssRules]).filter(rule=>rule.type===CSSRule.MEDIA_RULE&&rule.conditionText==='print');
window.addEventListener('beforeprint',()=>{
 // Chromium fires beforeprint while screen styles still apply. Measure print styles before pagination.
 printLayoutActive=true;
 document.getAnimations().forEach(a=>a.cancel());
 for(const rule of printRules)rule.media.mediaText='all';
 fitCalendar();
});
window.addEventListener('afterprint',()=>{
 for(const rule of printRules)rule.media.mediaText='print';
 printLayoutActive=false;
 fitCalendar();
});
