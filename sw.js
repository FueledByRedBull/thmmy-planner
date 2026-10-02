'use strict';
// Service worker: the planner opens instantly and works offline, and the page is told when a new version is out.
// - Every file the page uses is cached. Versioned files (?v=) never change once published, so they are served from
//   the cache; files without a version (fonts) are served from the cache and refreshed in the background.
// - The page itself (index.html) is served from the cache. The page asks for a check when it loads, when it comes back
//   into view and every half hour. A changed page has its files fetched first, then becomes current and open pages
//   are told, so the "new version" reload is instant and works offline. One previous version is kept for open tabs.
// - Everything cross-origin (the timetable refresh goes through public proxies) and anything but GET is left alone.
// Kill switch: if this file ever misbehaves, publish one whose install/activate call self.registration.unregister().
const CACHE='thmmy-planner-1',SCOPE=new URL('./',self.location).href,INDEX=SCOPE,PREVIOUS=SCOPE+'?sw-previous';

const fetchOk=async(url,init)=>{const response=await fetch(url,init);if(!response.ok)throw new Error(`HTTP ${response.status} ${url}`);return response;};

// The files a version of the page needs, read from the page itself (its links and scripts, the 3D module named in
// assets/motion.js, the fonts named in assets/styles.css), so nothing here has to be kept in sync by hand.
async function assetsOf(cache,html){
 const urls=new Set();
 for(const [,path] of html.matchAll(/["'](\.\/(?:assets|data)\/[^"'\s>]+)["']/g))urls.add(new URL(path,SCOPE).href);
 for(const url of [...urls]){
  if(!/\/(?:motion\.js|styles\.css)\?/.test(url))continue;
  const text=await ((await cache.match(url))||await fetchOk(url)).text();
  for(const [,ref] of text.matchAll(/["'(]([\w./-]+\.(?:js|woff2)(?:\?v=[\w-]+)?)["')]/g))urls.add(new URL(ref,url).href);
 }
 return urls;
}
async function precache(cache,html){
 const urls=await assetsOf(cache,html);
 await Promise.all([...urls].map(async url=>{if(!await cache.match(url))await cache.put(url,await fetchOk(url));}));
 return urls;
}

self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE),page=await fetchOk(INDEX,{cache:'no-cache'});
 await precache(cache,await page.clone().text());
 await cache.put(INDEX,page);
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys())if(key!==CACHE&&key.startsWith('thmmy-planner-'))await caches.delete(key);
 await self.clients.claim();
})()));

self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||!request.url.startsWith(SCOPE))return;
 if(request.mode==='navigate'){
  // The planner is one page: any query on it gets the cached page; other in-scope documents go to the network.
  if(url.pathname===new URL(SCOPE).pathname||url.pathname===new URL('index.html',SCOPE).pathname)event.respondWith(page());
  return;
 }
 event.respondWith(file(event));
});
async function page(){
 const cache=await caches.open(CACHE);
 return (await cache.match(INDEX))||fetch(INDEX);
}
async function file(event){
 const request=event.request,cache=await caches.open(CACHE),hit=await cache.match(request);
 const update=()=>fetch(request).then(response=>{if(response.ok&&response.type==='basic')event.waitUntil(cache.put(request,response.clone()));return response;});
 if(!hit)return update();
 // Versioned files never change; the rest (fonts without a version) refresh in the background for next time.
 if(!new URL(request.url).searchParams.has('v'))event.waitUntil(update().catch(()=>{}));
 return hit;
}

let checking=null;
function check(){
 return checking||=(async()=>{
  try{
   const cache=await caches.open(CACHE),[current,fresh]=await Promise.all([cache.match(INDEX),fetchOk(INDEX,{cache:'no-cache'})]);
   const html=await fresh.clone().text(),old=current&&await current.clone().text();
   if(old===html)return;
   // A new version: its files first, then it becomes the page; the old one stays one step back for open tabs.
   const urls=await precache(cache,html);
   if(current)await cache.put(PREVIOUS,current);
   await cache.put(INDEX,fresh);
   const keep=new Set([INDEX,PREVIOUS,...urls,...(old?await assetsOf(cache,old):[])]);
   for(const request of await cache.keys())if(!keep.has(request.url))await cache.delete(request);
   if(old)for(const client of await self.clients.matchAll({type:'window'}))client.postMessage('update');
  }catch{
   // Offline or mid-deploy: try again at the next check.
  }finally{checking=null;}
 })();
}

self.addEventListener('message',event=>{
 if(event.data==='check')event.waitUntil(check());
 // The page's "Ανανέωση" for a new service worker: take over now, and the page reloads on controllerchange.
 if(event.data==='skip-waiting')self.skipWaiting();
});
