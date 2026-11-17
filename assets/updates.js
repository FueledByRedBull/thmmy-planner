'use strict';
// Offline and instant loads through the service worker (sw.js). It is asked to check for a new version when the page
// loads, when it comes back into view and every half hour; a new version shows the update toast. Not in an HTML backup.
// Its own file, apart from app.js: a page whose app crashes (a bad saved state, a broken data file) still finds and
// offers the fixed version.
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
 const $=id=>document.getElementById(id);
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
 $('updateClose').onclick=()=>{
  const hide=()=>{toast.hidden=true;if(toast.contains(document.activeElement)||document.activeElement===document.body)$('printButton').focus({preventScroll:true});};
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){hide();return;}
  const ease=getComputedStyle(document.documentElement).getPropertyValue('--ease').trim()||'ease-out';
  const leaving=toast.animate({opacity:0,transform:'translate(-50%,-10px) scale(.96)'},{duration:200,easing:ease,fill:'forwards'}),done=()=>{hide();leaving.cancel();};
  leaving.finished.then(done,done);
 };
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
