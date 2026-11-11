'use strict';
// Smooth scroll (Lenis) and the hero's lazily loaded 3D week. Both step aside under reduced motion.
(()=>{
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 let lenis=null,tick=0;
 const sync=()=>{
  if(reduce.matches){cancelAnimationFrame(tick);tick=0;lenis?.destroy();lenis=null;return;}
  if(lenis||!globalThis.Lenis)return;
  // Nested scrollers (course list, horizontal week) and dialogs keep native scrolling.
  // Anchors take their offset from the page's own scroll-padding, as a native jump does.
  const l=lenis=new Lenis({lerp:.12,allowNestedScroll:true,anchors:true,prevent:node=>!!node.closest?.('dialog')});
  // Ticked by hand, not autoRaf: Lenis runs only while it eases a scroll, instead of at every display refresh for the
  // life of the page. Every eased scroll (wheel, anchor) starts in scrollTo; a fresh run starts from no frame time, so
  // its first step is not the whole time since the last one.
  const step=t=>{l.raf(t);tick=l.isScrolling==='smooth'?requestAnimationFrame(step):0;};
  const scrollTo=l.scrollTo.bind(l);
  l.scrollTo=(...args)=>{scrollTo(...args);if(!tick){l.time=0;tick=requestAnimationFrame(step);}};
 };
 sync();
 reduce.addEventListener('change',sync);
 // A key can start a native jump (focus, find, Page Down) mid-glide: the glide must not pull the page back from it.
 addEventListener('keydown',()=>{if(tick)lenis?.reset();},true);
 // Whether the sheet has reached the header, as a class: for engines without scroll timelines and for reduced motion,
 // which both lose the CSS scroll animations (styles.css), and for the browser bar's colour (applyTheme in index.html).
 const planner=document.getElementById('planner');
 if(planner)new IntersectionObserver(([entry])=>{document.documentElement.classList.toggle('scroll-docked',entry.isIntersecting);globalThis.applyTheme?.();},{rootMargin:'0px 0px -80%'}).observe(planner);
 // Resolved from this script's own URL; inlined into an HTML backup it has none, and the 3D (never loadable from a
 // saved file) is skipped.
 let week3d=null;try{week3d=new URL('week3d.js?v=polish1',document.currentScript.src).href;}catch{}
 const can3d=week3d&&document.getElementById('week3d')&&'WebGL2RenderingContext' in window;
 // No 3D, no skeleton waiting for it in the hero.
 const no3d=()=>document.documentElement.classList.remove('has-3d');
 if(!can3d)no3d();
 // Download the 3D week now, at low priority: this deferred script runs once the stylesheet is in, so it never
 // competes with the first paint, and the board is ready the moment the page is idle.
 if(can3d)document.head.append(Object.assign(document.createElement('link'),{rel:'modulepreload',href:week3d,fetchPriority:'low'}));
 const start=()=>{if(can3d)import(week3d).catch(no3d);};
 addEventListener('load',()=>'requestIdleCallback' in window?requestIdleCallback(start,{timeout:900}):setTimeout(start,200),{once:true});
 // The hero button leans up to 6px toward a mouse pointer within 80px of it. The individual `translate` property
 // leaves the :active scale alone, and styles.css eases it back.
 const cta=document.querySelector('.hero-cta'),mouse=matchMedia('(hover: hover) and (pointer: fine)');
 if(cta){
  const REACH=80,LEAN=6,toward=(d,half)=>Math.max(-1,Math.min(1,d/(half+REACH)))*LEAN;
  let frame=0,x=0,y=0,tx=0,ty=0;
  const lean=()=>{
   frame=0;
   let nx=0,ny=0;
   if(mouse.matches&&!reduce.matches&&scrollY<innerHeight){
    const r=cta.getBoundingClientRect(),w=r.width/2,h=r.height/2;
    // The box moves with the lean, so measure from where it rests.
    const dx=x-(r.left+w-tx),dy=y-(r.top+h-ty);
    if(Math.abs(dx)<w+REACH&&Math.abs(dy)<h+REACH){nx=toward(dx,w);ny=toward(dy,h);}
   }
   if(nx!==tx||ny!==ty){tx=nx;ty=ny;cta.style.translate=nx||ny?`${nx}px ${ny}px`:'';}
  };
  const queue=()=>{if(!frame)frame=requestAnimationFrame(lean);};
  addEventListener('pointermove',event=>{if(event.pointerType!=='mouse')return;x=event.clientX;y=event.clientY;queue();},{passive:true});
  document.documentElement.addEventListener('pointerleave',()=>{x=y=-1e4;queue();});
 }
})();
