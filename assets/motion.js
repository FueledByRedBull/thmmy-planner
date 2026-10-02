'use strict';
// Smooth scroll (Lenis) and the hero's lazily loaded 3D week. Both step aside under reduced motion.
(()=>{
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 let lenis=null;
 const sync=()=>{
  if(reduce.matches){lenis?.destroy();lenis=null;return;}
  // Nested scrollers (course list, horizontal week) and dialogs keep native scrolling.
  if(!lenis&&globalThis.Lenis)lenis=new Lenis({autoRaf:true,lerp:.085,allowNestedScroll:true,anchors:{offset:-76},prevent:node=>!!node.closest?.('dialog')});
 };
 sync();
 reduce.addEventListener('change',sync);
 // Resolved from this script's own URL; inlined into an HTML backup it has none, and the 3D (never loadable from a
 // saved file) is skipped.
 let week3d=null;try{week3d=new URL('week3d.js?v=deal7',document.currentScript.src).href;}catch{}
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
