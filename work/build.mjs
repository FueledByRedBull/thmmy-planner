import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const read=name=>readFile('work/'+name,'utf8');
const [template,css,app,parser,seed,guideText,fonts,licenses]=await Promise.all(['template.html','app.css','app.js','source-parser.js','source-seed.json','guide-rules.json','fonts.css','font-licenses.txt'].map(read));
const guide=JSON.parse(guideText);
for(const c of guide.courses)c.prerequisiteText=c.prerequisite_text||'';
const safeJson=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const html=template.replace('/*__CSS__*/',()=>`/* ${licenses} */\n`+fonts+'\n'+css).replace('/*__APP__*/',()=>app).replace('/*__PARSER__*/',()=>parser).replace('__DATA__',()=>safeJson(JSON.parse(seed))).replace('__GUIDE__',()=>safeJson(guide));
await mkdir('outputs',{recursive:true});
await writeFile('outputs/THMMY-programma.html',html,'utf8');
await Promise.all(['assets/fonts','data'].map(path=>mkdir(path,{recursive:true})));
const version=content=>createHash('sha256').update(content).digest('hex').slice(0,12);
const asset=(path,content)=>'./'+path+'?v='+version(content);
let webFonts=fonts,index=0;
for(const match of fonts.matchAll(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/g)){
 const binary=Buffer.from(match[1],'base64'),name=`font-${++index}.woff2`;
 await writeFile('assets/fonts/'+name,binary);
 webFonts=webFonts.replace(match[0],`fonts/${name}?v=${version(binary)}`);
}
const styles=`/* ${licenses} */\n`+webFonts+'\n'+css,courses=JSON.stringify(JSON.parse(seed)),guideJson=JSON.stringify(guide);
await Promise.all([['assets/styles.css',styles],['assets/app.js',app],['assets/source-parser.js',parser],['data/courses.json',courses],['data/guide.json',guideJson]].map(([path,content])=>writeFile(path,content,'utf8')));
const loader=`<script id="load-data">
(async()=>{
 const notice=document.getElementById('notice'),loading='Φόρτωση μαθημάτων…';
 const controls=[...document.querySelectorAll('button,select,input,textarea')].filter(el=>!el.disabled);
 controls.forEach(el=>el.disabled=true);document.getElementById('emptyState').hidden=true;notice.hidden=false;notice.textContent=loading;
 try{
  if(location.protocol==='file:')throw Error('Άνοιξε το αυτοτελές THMMY-programma.html για χρήση χωρίς server ή χρησιμοποίησε την έκδοση GitHub Pages.');
  if(!globalThis.SourceParser)throw Error('Δεν φορτώθηκε ο αναγνώστης του ωρολογίου.');
  const files=await Promise.all(${JSON.stringify([asset('data/courses.json',courses),asset('data/guide.json',guideJson)])}.map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('HTTP '+r.status);return r.json();}));
  document.getElementById('initial-data').textContent=JSON.stringify(files[0]);
  document.getElementById('guide-data').textContent=JSON.stringify(files[1]);
  await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=${JSON.stringify(asset('assets/app.js',app))};script.onload=resolve;script.onerror=()=>reject(Error('Δεν φορτώθηκε η εφαρμογή.'));document.body.append(script);});
  controls.forEach(el=>el.disabled=false);if(notice.textContent===loading)notice.hidden=true;
 }catch(error){notice.hidden=false;notice.classList.add('error');notice.textContent='Η φόρτωση δεν ολοκληρώθηκε. '+error.message+' Δοκίμασε επαναφόρτωση της σελίδας. Τα αποθηκευμένα δεδομένα σου παραμένουν στον browser.';}
})();
</script>`;
const web=template.replace("script-src 'unsafe-inline'","script-src 'self' 'unsafe-inline'").replace("style-src 'unsafe-inline'","style-src 'self' 'unsafe-inline'").replace('font-src data:',"font-src 'self' data:").replace('connect-src https:',"connect-src 'self' https:")
 .replace('<style>/*__CSS__*/</style>',`<link rel="stylesheet" href="${asset('assets/styles.css',styles)}">`)
 .replace('__DATA__','null').replace('__GUIDE__','null')
 .replace('<script>/*__PARSER__*/</script>',`<script src="${asset('assets/source-parser.js',parser)}"></script>`)
 .replace('<script>/*__APP__*/</script>',loader);
await writeFile('index.html',web,'utf8');
console.log(`Built Pages HTML: ${Buffer.byteLength(web)} bytes + assets/data; standalone HTML: ${Buffer.byteLength(html)} bytes.`);
