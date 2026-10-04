'use strict';
// Smooth scroll (Lenis) and the hero's lazily loaded 3D week. Both step aside under reduced motion.
(()=>{
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 let lenis=null,tick=0;
 const sync=()=>{
  if(reduce.matches){cancelAnimationFrame(tick);tick=0;lenis?.destroy();lenis=null;return;}
  if(lenis||!globalThis.Lenis)return;
  // Nested scrollers (course list, horizontal week) and dialogs keep native scrolling.
  const l=lenis=new Lenis({lerp:.085,allowNestedScroll:true,anchors:{offset:-76},prevent:node=>!!node.closest?.('dialog')});
  // Ticked by hand, not autoRaf: Lenis runs only while it eases a scroll, instead of at every display refresh for the
  // life of the page. Every eased scroll (wheel, anchor) starts in scrollTo; a fresh run starts from no frame time, so
  // its first step is not the whole time since the last one.
  const step=t=>{l.raf(t);tick=l.isScrolling==='smooth'?requestAnimationFrame(step):0;};
  const scrollTo=l.scrollTo.bind(l);
  l.scrollTo=(...args)=>{scrollTo(...args);if(!tick){l.time=0;tick=requestAnimationFrame(step);}};
 };
 sync();
 reduce.addEventListener('change',sync);
 // Resolved from this script's own URL; inlined into an HTML backup it has none, and the 3D (never loadable from a
 // saved file) is skipped.
 let week3d=null;try{week3d=new URL('week3d.js?v=perf2',document.currentScript.src).href;}catch{}
 const can3d=week3d&&document.getElementById('week3d')&&'WebGL2RenderingContext' in window;
 // No 3D, no skeleton waiting for it in the hero.
 const no3d=()=>document.documentElement.classList.remove('has-3d');
 if(!can3d)no3d();
 // Download the 3D week now, at low priority: this deferred script runs once the stylesheet is in, so it never
 // competes with the first paint, and the board is ready the moment the page is idle.
 if(can3d)document.head.append(Object.assign(document.createElement('link'),{rel:'modulepreload',href:week3d,fetchPriority:'low'}));
 const start=()=>{if(can3d)import(week3d).catch(no3d);};
 addEventListener('load',()=>'requestIdleCallback' in window?requestIdleCallback(start,{timeout:900}):setTimeout(start,200),{once:true});
})();
