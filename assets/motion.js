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
 const start=()=>{
  if(!document.getElementById('week3d')||!('WebGL2RenderingContext' in window))return;
  import('./week3d.js?v=engrave2').catch(()=>{});
 };
 addEventListener('load',()=>'requestIdleCallback' in window?requestIdleCallback(start,{timeout:900}):setTimeout(start,200),{once:true});
})();
