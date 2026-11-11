'use strict';
// The cursor-motion layer: headline weight, block tilt, time label, sign-off rise, and the now line's arrival. Values
// are described in DESIGN.md (Pointer). The pointer effects run only for a fine pointer without reduced motion; one
// shared frame loop runs only while something is still moving.
(()=>{
 const fine=matchMedia('(hover: hover) and (pointer: fine)'),reduce=matchMedia('(prefers-reduced-motion: reduce)'),wide=matchMedia('(min-width: 861px)');
 const on=()=>fine.matches&&!reduce.matches;
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 let frame=0,last=0,px=-1e4,py=-1e4,target=null,epoch=0;
 const effects=[];
 // Semi-implicit Euler spring on {x,v}; false once it has settled on its target.
 const spring=(s,to,k,c,dt)=>{
  s.v+=(k*(to-s.x)-c*s.v)*dt;s.x+=s.v*dt;
  if(Math.abs(s.v)<.01&&Math.abs(to-s.x)<.01){s.x=to;s.v=0;return false;}
  return true;
 };
 const run=t=>{
  frame=0;
  const dt=last?Math.min((t-last)/1000,1/30):1/60;last=t;
  let busy=false;
  for(const e of effects)if(e.step(dt))busy=true;
  if(busy)frame=requestAnimationFrame(run);else last=0;
 };
 const wake=()=>{if(!frame)frame=requestAnimationFrame(run);};
 // Rects are cached per epoch; scroll and resize only bump it.
 const stale=()=>{epoch++;wake();};
 addEventListener('resize',stale,{passive:true});
 addEventListener('scroll',stale,{passive:true});
 addEventListener('pointermove',event=>{
  if(event.pointerType==='touch'||!on())return;
  px=event.clientX;py=event.clientY;target=event.target;wake();
 },{passive:true});
 document.documentElement.addEventListener('pointerleave',()=>{px=py=-1e4;target=null;wake();});
 const resetAll=()=>{for(const e of effects)e.reset();};
 for(const query of [fine,reduce,wide])query.addEventListener('change',()=>{if(!on())resetAll();wake();});

 // 1. Headline under the hand: each letter's weight follows the pointer.
 const hero=document.querySelector('.hero'),title=document.querySelector('.hero-title');
 if(hero&&title){
  const WEIGHT=800,DEEP=380,REACH=300,LIFT=6;
  let letters=null,visible=false,rectEpoch=-1,splitting=false;
  new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;wake();}).observe(hero);
  const split=()=>{
   if(letters||splitting)return;
   splitting=true;
   (document.fonts?.ready||Promise.resolve()).then(()=>{
    const made=[];
    for(const span of title.querySelectorAll('.line>span')){
     for(const node of [...span.childNodes]){
      if(node.nodeType!==3)continue;
      const frag=document.createDocumentFragment();
      for(const ch of node.data){
       if(/\s/.test(ch)){frag.append(ch);continue;}
       const el=document.createElement('span');el.className='hl-ch';el.textContent=ch;frag.append(el);made.push(el);
      }
      node.replaceWith(frag);
     }
    }
    // Pin each letter to its width at the rest weight, the widest, so the line never reflows under the hand.
    const widths=made.map(el=>parseFloat(getComputedStyle(el).width)/parseFloat(getComputedStyle(el).fontSize));
    made.forEach((el,i)=>{el.style.width=widths[i]+'em';});
    letters=made.map(el=>({el,s:{x:WEIGHT,v:0},cx:0,cy:0,w:'',t:''}));
    wake();
   });
  };
  const measure=()=>{
   for(const l of letters){const r=l.el.getBoundingClientRect(),lift=l.s.x<WEIGHT?(WEIGHT-l.s.x)/DEEP*LIFT:0;l.cx=r.left+r.width/2;l.cy=r.top+r.height/2+lift;}
   rectEpoch=epoch;
  };
  const apply=l=>{
   const w=l.s.x.toFixed(1),t=l.s.x<WEIGHT?((l.s.x-WEIGHT)/DEEP*LIFT).toFixed(2):'';
   if(w!==l.w){l.w=w;l.el.style.fontVariationSettings=w==='800.0'?'':`'wght' ${w}`;}
   if(t!==l.t){l.t=t;l.el.style.translate=t?`0 ${t}px`:'';}
  };
  effects.push({
   step(dt){
    if(!letters){if(on()&&visible&&px>-1e3)split();return false;}
    const live=on()&&visible&&px>-1e3;
    if(live&&rectEpoch!==epoch)measure();
    let busy=false;
    for(const l of letters){
     let to=WEIGHT;
     if(live){const t=clamp(Math.hypot(px-l.cx,py-l.cy)/REACH,0,1);to=WEIGHT-DEEP*(1-t*t*(3-2*t));}
     if(spring(l.s,to,170,26,dt))busy=true;
     apply(l);
    }
    return busy;
   },
   reset(){if(!letters)return;for(const l of letters){l.s.x=WEIGHT;l.s.v=0;apply(l);}}
  });
 }

 // 2. Block under the hand: the tilt springs toward the pointer; the lift, scale and shadow are CSS (styles.css).
 const cal=document.getElementById('calendar');
 if(cal){
  const TILT=4,tracked=new Map();
  let hovered=null;
  const release=el=>{el.classList.remove('is-tilting');el.style.removeProperty('--rx');el.style.removeProperty('--ry');tracked.delete(el);};
  cal.addEventListener('pointerover',event=>{
   if(event.pointerType==='touch'||!on()||!wide.matches)return;
   const el=event.target.closest?.('.meeting');
   if(!el||el===hovered)return;
   hovered=el;
   let s=tracked.get(el);
   if(!s){s={rx:{x:0,v:0},ry:{x:0,v:0},ex:0,ey:0,rect:null,rectEpoch:-1};tracked.set(el,s);el.classList.add('is-tilting');}
   s.rectEpoch=-1;wake();
  });
  cal.addEventListener('pointerout',event=>{
   if(hovered&&!hovered.contains(event.relatedTarget)){hovered=null;wake();}
  });
  effects.push({
   step(dt){
    let busy=false;
    for(const [el,s] of tracked){
     if(!el.isConnected){tracked.delete(el);continue;}
     let tx=0,ty=0;
     if(el===hovered&&on()&&wide.matches){
      if(s.rectEpoch!==epoch){s.rect=el.getBoundingClientRect();s.rectEpoch=epoch;}
      const r=s.rect;
      ty=(clamp((py-r.top)/r.height,0,1)-.5)*2*TILT;
      tx=-(clamp((px-r.left)/r.width,0,1)-.5)*2*TILT;
     }
     const a=spring(s.rx,ty,300,30,dt),b=spring(s.ry,tx,300,30,dt);
     if(a||b)busy=true;
     if(a||b||el===hovered){
      el.style.setProperty('--rx',s.rx.x.toFixed(2)+'deg');el.style.setProperty('--ry',s.ry.x.toFixed(2)+'deg');
     }else release(el);
    }
    return busy;
   },
   reset(){hovered=null;for(const el of [...tracked.keys()])release(el);}
  });
 }

 // 3. Time under the hand: a label in the hour axis at the pointer's height, and a wash on the day column.
 if(cal){
  const pill=document.createElement('div');
  pill.className='time-pill';pill.setAttribute('aria-hidden','true');document.body.append(pill);
  const wrap=cal.closest('#calendarWrap');
  let cols=[],rects=[],axis=null,rectEpoch=-1,hot=null,shown=false,label='';
  const unhot=()=>{if(hot){hot.classList.remove('is-hot');hot=null;}if(shown){shown=false;pill.classList.remove('is-on');}};
  new MutationObserver(()=>{cols=[];rectEpoch=-1;wake();}).observe(cal,{childList:true});
  const two=n=>String(n).padStart(2,'0');
  effects.push({
   step(){
    const [lo,hi]=typeof gridRange==='undefined'?[0,1]:gridRange;
    // Mid-morph the 3D week stands in for the grid: no label then.
    const real=!wrap||(wrap.style.getPropertyValue('--blocks')||'1')>=.99;
    if(!on()||!wide.matches||!real||px<-1e3||!target||!cal.contains(target)||hi<=lo){unhot();return false;}
    if(!cols.length||rectEpoch!==epoch){
     if(!cols.length)cols=[...cal.querySelectorAll('.day-column')];
     rects=cols.map(c=>c.getBoundingClientRect());axis=cal.querySelector('.time-axis')?.getBoundingClientRect();rectEpoch=epoch;
    }
    const i=rects.findIndex(r=>px>=r.left&&px<r.right&&py>=r.top&&py<r.bottom);
    if(i<0||!axis){unhot();return false;}
    if(hot!==cols[i]){hot?.classList.remove('is-hot');hot=cols[i];hot.classList.add('is-hot');}
    const r=rects[i],minutes=Math.round((lo+(py-r.top)/r.height*(hi-lo))/5)*5,text=two(Math.floor(minutes/60))+':'+two(minutes%60);
    if(text!==label){label=text;pill.textContent=text;}
    pill.style.translate=`calc(${axis.right-6}px - 100%) calc(${py}px - 50%)`;
    if(!shown){shown=true;pill.classList.add('is-on');}
    return false;
   },
   reset(){unhot();}
  });
 }

 // 4. Sign-off rises to the hand: each block rises with a gaussian falloff of its distance from the pointer.
 const foot=document.querySelector('footer'),blocks=[...document.querySelectorAll('.sign-off b')];
 if(foot&&blocks.length){
  const RISE=18,SIGMA=110;
  const states=blocks.map(el=>({el,s:{x:0,v:0},cx:0,t:''}));
  let rectEpoch=-1,top=0,bottom=0;
  const apply=b=>{const t=b.s.x>.05?(-b.s.x).toFixed(2):'';if(t!==b.t){b.t=t;b.el.style.translate=t?`0 ${t}px`:'';}};
  effects.push({
   step(dt){
    const live=on()&&wide.matches&&px>-1e3;
    if(live&&rectEpoch!==epoch){
     const f=foot.getBoundingClientRect();top=f.top-120;bottom=f.bottom;
     for(const b of states){const r=b.el.getBoundingClientRect();b.cx=r.left+r.width/2;}
     rectEpoch=epoch;
    }
    const near=live&&py>=top&&py<=bottom;
    let busy=false;
    for(const b of states){
     const to=near?RISE*Math.exp(-((px-b.cx)**2)/(2*SIGMA*SIGMA)):0;
     if(spring(b.s,to,1005,52,dt))busy=true;
     apply(b);
    }
    return busy;
   },
   reset(){for(const b of states){b.s.x=0;b.s.v=0;apply(b);}}
  });
 }

 // 5. The now line arrives the first time it is seen: the dot pops, then the line draws (styles.css). Not pointer-driven.
 if(cal){
  let arrived=false;
  const seen=new IntersectionObserver(entries=>{
   for(const entry of entries){
    if(!entry.isIntersecting||arrived)continue;
    arrived=true;seen.disconnect();
    entry.target.classList.replace('now-pre','now-arrive');
   }
  });
  const scan=()=>{
   if(arrived||reduce.matches)return;
   for(const line of cal.querySelectorAll('.now-line:not(.now-pre)')){line.classList.add('now-pre');seen.observe(line);}
  };
  new MutationObserver(scan).observe(cal,{childList:true});
  scan();
  reduce.addEventListener('change',()=>{
   if(reduce.matches){seen.disconnect();cal.querySelectorAll('.now-pre').forEach(line=>line.classList.remove('now-pre'));}
   else scan();
  });
 }
})();
