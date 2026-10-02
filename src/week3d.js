// The hero's 3D week: every meeting of the current timetable as a glossy slab on a floating board.
// Scrolling down, the board comes forward, turns flat and lands exactly on the planner's week grid, which then
// takes over; scrolling back up lifts it into the hero again. Phones (agenda layout) tilt it away instead.
// app.js publishes window.weekModel and fires `weekmodel`; with no meetings yet, a chrome sample week stands in.
// Build (three is tree-shaken into one file):
//   npm i three@0.186.1 esbuild
//   npx esbuild src/week3d.js --bundle --minify --format=esm --legal-comments=eof --outfile=assets/week3d.js
import {
 CanvasTexture, Color, DirectionalLight, EdgesGeometry, ExtrudeGeometry, Group, HemisphereLight,
 LineBasicMaterial, LineSegments, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, NeutralToneMapping,
 PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Raycaster, SRGBColorSpace, Scene,
 ShadowMaterial, Shape, Vector2, Vector3, WebGLRenderer
} from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

const canvas=document.getElementById('week3d'),stage=canvas.parentElement,hero=document.querySelector('.hero'),tip=document.getElementById('heroTip');
const planner=document.getElementById('planner'),calendarWrap=document.getElementById('calendarWrap'),emptyState=document.getElementById('emptyState');
const root=document.documentElement,reduce=matchMedia('(prefers-reduced-motion: reduce)'),coarse=matchMedia('(pointer: coarse)'),grid=matchMedia('(min-width: 861px)');
const DAYS=['Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή'];
// Board metrics in world units: day grid width, gap between days, one hour, time axis band, day label band, outer pad, thickness.
const GRID=7.6,GAP=.06,HOUR=.46,AXIS=.82,HEAD=.66,PAD=.26,BOARD=.2;
// Camera framing knob: how much of the target box the board's radius may fill.
const FIT=.8;
// A sample week shown before any course is chosen; rendered as chrome so it never reads as real data.
const SAMPLE=[[0,540,660],[0,720,840],[1,600,780],[1,900,1020],[2,540,720],[2,780,840],[2,1020,1140],[3,660,780],[3,960,1140],[4,600,720],[4,840,960]]
 .map(([day,start,end],i)=>({id:'sample'+i,day,start,end,lane:0,lanes:1,ects:3+(i*3)%7,sample:true}));

const renderer=new WebGLRenderer({canvas,alpha:true,antialias:devicePixelRatio<2,powerPreference:'high-performance'});
renderer.setClearColor(0,0);
renderer.toneMapping=NeutralToneMapping;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=PCFSoftShadowMap;
let pixelRatio=Math.min(devicePixelRatio,coarse.matches?1.5:1.75);
renderer.setPixelRatio(pixelRatio);

const scene=new Scene(),camera=new PerspectiveCamera(24,1,.5,200),week=new Group();
const pmrem=new PMREMGenerator(renderer);
scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;
pmrem.dispose();
// A strong key from the upper left shades slab sides against their tops; a cool rim from behind draws the edges.
const key=new DirectionalLight('#ffffff',2.2);
key.position.set(-6,13,8);
key.castShadow=true;
key.shadow.mapSize.set(1024,1024);
key.shadow.bias=-.0004;
key.shadow.normalBias=.02;
const rim=new DirectionalLight('#dfe6ff',1);
rim.position.set(7,5,-10);
const fill=new HemisphereLight('#ffffff','#9aa1ad',.25);
const floor=new Mesh(new PlaneGeometry(80,80),new ShadowMaterial({opacity:.2}));
floor.rotation.x=-Math.PI/2;
floor.position.y=-1.15;
floor.receiveShadow=true;
scene.add(key,key.target,rim,fill,floor,week);

let pal=palette(),danger=new Color(pal.danger),size={w:9,d:7},hours={min:-1,max:-1},board=null,labels=null,edges=null;
const slabs=new Map(),dying=new Set(),geometries=new Map();
const springs={intro:{x:reduce.matches?1:0,v:0},cx:{x:0,v:0},cy:{x:0,v:0},push:{x:0,v:0}};
let pointer={x:0,y:0,inside:false,dirty:false,type:'mouse'},hovered=null,raf=0,last=0,live=false,firstBuild=true;
const ray=new Raycaster(),ndc=new Vector2();
let view={w:1,h:1,dist:30,ox:0,oy:0},dock=1,docked=false,stageOp=-1,targetEl=null,targetKey='',clip='';
const sidebar=document.getElementById('courseSidebar'),drawer=matchMedia('(max-width: 1180px)');
const copy=hero.querySelector('.hero-copy'),copyParts=[...copy.querySelectorAll('.line>span,.hero-sub,.hero-cta')];
const corner=new Vector3();
// Keep the headline in front at any orbit or zoom: project the board's outline and pan the camera just enough that it
// never enters the copy's box (right of it on wide screens, above it when the copy spans a phone).
function clearance(){
 if(parseFloat(getComputedStyle(copy).opacity)<=.05)return 0;
 const boxes=copyParts.map(el=>el.getBoundingClientRect()),box={l:Math.min(...boxes.map(b=>b.left)),r:Math.max(...boxes.map(b=>b.right)),t:Math.min(...boxes.map(b=>b.top)),b:Math.max(...boxes.map(b=>b.bottom))};
 week.updateMatrixWorld();camera.updateMatrixWorld();
 const quad=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sz])=>{corner.set(sx*size.w/2,0,sz*size.d/2).applyMatrix4(week.matrixWorld).project(camera);return[(corner.x+1)/2*view.w,(1-corner.y)/2*view.h];});
 // Clip the projected quad to the copy's band, then measure how far it reaches into the copy.
 const axis=view.stacked?0:1,lo=view.stacked?box.l:box.t,hi=view.stacked?box.r:box.b;
 const cut=(poly,keep,edge)=>{const out=[];poly.forEach((a,i)=>{const b=poly[(i+1)%poly.length],ia=keep(a),ib=keep(b);if(ia)out.push(a);if(ia!==ib){const k=(edge-a[axis])/(b[axis]-a[axis]);out.push([a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k]);}});return out;};
 const band=cut(cut(quad,p=>p[axis]>=lo,lo),p=>p[axis]<=hi,hi);
 if(!band.length)return 0;
 // Margins sit inside the home framing's own gap, so the untouched hero never moves; only orbit or zoom engage it.
 return view.stacked?Math.max(0,Math.max(...band.map(p=>p[1]))-(box.t-12)):Math.max(0,box.r+4-Math.min(...band.map(p=>p[0])));
}
// Free view: drag the hero board to orbit it (pinch or Ctrl+wheel zooms), double-click to reset. It glides home as soon
// as the page scrolls, so the landing on the planner always starts from the hero pose. Offsets from the hero pose:
const orbit={yaw:{x:0,v:0},pitch:{x:0,v:0},zoom:{x:1,v:0},aim:{yaw:0,pitch:0,zoom:1},drag:null,home:false};
// Free view (orbit, zoom, reset) only with the page at the top: once it scrolls, the morph owns the board, and a hand
// still holding it lets go to the homing spring rather than spinning a board that is flying onto the planner.
const FREE=.002;
const PITCH=[-.4,.86],ZOOM=[.8,1.6];
const clampPitch=x=>Math.min(PITCH[1],Math.max(PITCH[0],x));
// Past its limits, pitch meets a rubber band (at most .1 rad further) instead of a wall.
const STRETCH=.1,rubber=x=>x<PITCH[0]?PITCH[0]-STRETCH*(1-1/((PITCH[0]-x)/STRETCH+1)):x>PITCH[1]?PITCH[1]+STRETCH*(1-1/((x-PITCH[1])/STRETCH+1)):x;
// Physical feel: the board lifts while held and drops back with a bounce, banks into its spin and nods with its tilt.
const feel={lift:{x:0,v:0},bank:{x:0,v:0},nod:{x:0,v:0}};
let suppressClick=false,down=null;

function palette(){
 const dark=root.dataset.theme==='dark';
 return{dark,board:dark?'#262626':'#fbfbfb',edge:dark?'#454545':'#c9c9c9',ink:dark?'#f2f2f2':'#0e0e0e',accent:dark?'#ff4fa8':'#ef1a84',danger:dark?'#ff5c6c':'#d61f3a',warning:dark?'#fbbf24':'#985200',shadow:dark?.6:.24,chrome:dark?'#a3a7ae':'#dcdfe4'};
}
function light(){
 key.intensity=pal.dark?1.9:2.3;
 rim.intensity=pal.dark?1.5:.7;
 scene.environmentIntensity=pal.dark?.85:.7;
 floor.material.opacity=pal.shadow;
}
const rgba=(hex,a)=>{const c=new Color(hex);return`rgba(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)},${a})`;};
const hhmm=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=x=>{x=Math.min(1,Math.max(0,x));return x*x*(3-2*x);};
// Five equal day columns, exactly like the planner's grid, so slabs land on their blocks.
const colW=()=>(GRID-4*GAP)/5;
function colX(day){let x=-size.w/2+AXIS;for(let d=0;d<day;d++)x+=colW(d)+GAP;return x;}
const timeZ=m=>-size.d/2+HEAD+(m-hours.min)/60*HOUR;

function slabGeometry(w,d,h,r){
 const id=`${w.toFixed(3)}|${d.toFixed(3)}|${h.toFixed(3)}|${r}`;
 if(geometries.has(id))return geometries.get(id);
 const bevel=Math.min(.05,h/4,w/5,d/5),x=w/2-bevel,z=d/2-bevel,c=Math.max(.001,Math.min(r,x*.9,z*.9)),s=new Shape();
 s.moveTo(-x+c,-z);s.lineTo(x-c,-z);s.quadraticCurveTo(x,-z,x,-z+c);s.lineTo(x,z-c);s.quadraticCurveTo(x,z,x-c,z);
 s.lineTo(-x+c,z);s.quadraticCurveTo(-x,z,-x,z-c);s.lineTo(-x,-z+c);s.quadraticCurveTo(-x,-z,-x+c,-z);
 const g=new ExtrudeGeometry(s,{depth:Math.max(.001,h-2*bevel),bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:3,curveSegments:6});
 // Extrusion runs along +z; turn it upright so the slab stands on y=0.
 g.rotateX(-Math.PI/2);
 g.translate(0,bevel,0);
 g.userData.bevel=bevel;
 geometries.set(id,g);
 return g;
}

function drawLabels(){
 const k=200,cw=Math.round(size.w*k),ch=Math.round(size.d*k),canvas2d=document.createElement('canvas');
 canvas2d.width=cw;canvas2d.height=ch;
 const g=canvas2d.getContext('2d'),today=(new Date().getDay()+6)%7,font='Geologica,"Noto Sans",system-ui,sans-serif';
 const left=(AXIS-.08)*k,top=HEAD*k,bottom=(size.d-PAD*.6)*k,px=x=>(x+size.w/2)*k;
 g.strokeStyle=rgba(pal.ink,pal.dark?.14:.12);g.lineWidth=2;
 for(let d=0;d<5;d++){
  const x=px(colX(d)),w=colW(d)*k;
  if(d===today){g.fillStyle=rgba(pal.accent,pal.dark?.1:.06);g.fillRect(x,top,w,bottom-top);}
  if(d){g.beginPath();g.moveTo(x-GAP*k/2,top);g.lineTo(x-GAP*k/2,bottom);g.stroke();}
  g.font=`600 ${Math.round(k*.17)}px ${font}`;g.textAlign='center';g.textBaseline='middle';
  const cx=x+w/2,cy=HEAD*k*.52;
  // Today wears the same accent pill as the day header in the planner.
  if(d===today){const pw=g.measureText(DAYS[d]).width+k*.24;g.fillStyle=pal.accent;g.beginPath();g.roundRect(cx-pw/2,cy-k*.15,pw,k*.3,k*.15);g.fill();}
  g.fillStyle=d===today?'#0e0e0e':rgba(pal.ink,.72);
  g.fillText(DAYS[d],cx,cy);
 }
 g.fillStyle=rgba(pal.ink,.5);g.font=`600 ${Math.round(k*.13)}px ${font}`;g.textAlign='right';
 const span=(hours.max-hours.min)/60;
 for(let i=0;i<=span;i++){
  const y=top+i*HOUR*k;
  g.beginPath();g.moveTo(left,y);g.lineTo((size.w-PAD*.5)*k,y);g.stroke();
  g.fillText(hhmm(hours.min+i*60),left-14,y+(i===0?14:0));
  // Half hours: a fainter, dashed line, as fine as the planner's own grid can be read.
  if(i<span){g.save();g.setLineDash([10,12]);g.strokeStyle=rgba(pal.ink,pal.dark?.07:.06);g.beginPath();g.moveTo(left,y+HOUR*k/2);g.lineTo((size.w-PAD*.5)*k,y+HOUR*k/2);g.stroke();g.restore();}
 }
 const texture=new CanvasTexture(canvas2d);
 texture.colorSpace=SRGBColorSpace;
 texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 if(labels.material.map)labels.material.map.dispose();
 labels.material.map=texture;
 labels.material.needsUpdate=true;
}

function makeBoard(model){
 hours={min:model.min,max:model.max};
 size={w:AXIS+GRID+PAD,d:HEAD+(hours.max-hours.min)/60*HOUR+PAD};
 if(board){week.remove(board,labels);board.material.dispose();edges.geometry.dispose();edges.material.dispose();labels.geometry.dispose();labels.material.map?.dispose();labels.material.dispose();}
 // Transparent so the board can dissolve into the planner sheet as it lands.
 board=new Mesh(slabGeometry(size.w,size.d,BOARD,.34),new MeshPhysicalMaterial({color:pal.board,roughness:pal.dark?.7:.5,clearcoat:pal.dark?.15:.5,clearcoatRoughness:.3,transparent:true}));
 board.position.y=-BOARD;board.receiveShadow=board.castShadow=true;
 edges=new LineSegments(new EdgesGeometry(board.geometry,40),new LineBasicMaterial({color:pal.edge,transparent:true}));
 board.add(edges);
 labels=new Mesh(new PlaneGeometry(size.w,size.d),new MeshStandardMaterial({transparent:true,roughness:.95,depthWrite:false}));
 labels.rotation.x=-Math.PI/2;labels.position.y=.004;labels.receiveShadow=true;
 week.add(board,labels);
 drawLabels();
 const reach=Math.max(size.w,size.d)/2+1.5,shadow=key.shadow.camera;
 shadow.left=shadow.bottom=-reach;shadow.right=shadow.top=reach;shadow.near=1;shadow.far=40;shadow.updateProjectionMatrix();
}

function slabMaterial(e){
 if(e.sample)return new MeshPhysicalMaterial({color:pal.chrome,metalness:1,roughness:.16,clearcoat:.5,clearcoatRoughness:.1});
 // Course colours are already vivid; a touch darker keeps the clearcoat highlights from blowing out.
 const c=new Color(e.color),hsl={};
 c.getHSL(hsl,SRGBColorSpace);
 c.setHSL(hsl.h,hsl.s,hsl.l*.9,SRGBColorSpace);
 const m=new MeshPhysicalMaterial({color:c,roughness:.16,clearcoat:1,clearcoatRoughness:.03,transparent:e.review,opacity:e.review?.6:1});
 if(e.conflict)m.emissive.set(pal.danger);
 return m;
}

// The flat fill a block has in the planner: the course colour, 10% into the surface on the dark theme (styles.css .meeting).
function flatColor(e){
 const hex=e.color||'#888888',a=parseInt(hex.slice(1),16),b=pal.dark?0x181818:a,t=pal.dark?.1:0;
 const ch=s=>Math.round(((a>>s)&255)*(1-t)+((b>>s)&255)*t);
 return new Color(`rgb(${ch(16)},${ch(8)},${ch(0)})`);
}
// As slabs land, their lit tops hand over to the exact flat fill of the planner's blocks, so the crossfade never shifts hue.
function tint(slab,k,pulse){
 const m=slab.mesh.material,e=slab.e;
 if(e.sample)return;
 m.color.copy(slab.base).multiplyScalar(1-k*.94);
 m.clearcoat=1-k*.9;m.envMapIntensity=1-k*.9;m.roughness=.16+k*.5;
 if(e.review)m.opacity=.6+.4*k;
 if(e.conflict){m.emissive.copy(danger).lerp(slab.flat,k);m.emissiveIntensity=lerp(pulse,1,k);}
 else{m.emissive.copy(slab.flat);m.emissiveIntensity=k;}
}

function makeSlab(e,order,meetings){
 const lane=colW(e.day)/e.lanes,w=lane-.08,d=Math.max(.14,(e.end-e.start)/60*HOUR-.06),h=.18+(Math.min(5,Math.max(1,meetings||1))-1)*.22;
 const mesh=new Mesh(slabGeometry(w,d,h,.13),slabMaterial(e));
 mesh.castShadow=mesh.receiveShadow=true;
 mesh.position.set(colX(e.day)+(e.lane+.5)*lane,0,timeZ((e.start+e.end)/2));
 const edge=e.conflict||e.review?new LineSegments(new EdgesGeometry(mesh.geometry,35),new LineBasicMaterial({color:e.conflict?pal.danger:pal.warning})):null;
 if(edge)mesh.add(edge);
 const still=reduce.matches;
 const slab={e,mesh,w,d,h,edge,decal:null,rx:{x:0,v:0},rz:{x:0,v:0},base:mesh.material.color.clone(),flat:flatColor(e),y:still?0:2.4+order*.05,v:0,lift:0,lv:0,s:1,start:performance.now()+(still?0:(firstBuild?520:0)+Math.min(order,16)*45)};
 mesh.position.y=slab.y;mesh.visible=still;mesh.userData.slab=slab;
 week.add(mesh);
 decal(slab);
 return slab;
}

// The course code engraved into the slab top: a darker, matte groove cut through the clearcoat, whose walls are a
// normal map built from the lettering, so they catch the scene's light and shift as the board turns.
// Narrow tops shrink the code (dropping the ECE prefix last); a top too small for it stays plain.
const DECAL=300,WALL=2,SLOPE=9;
function decal(slab){
 const e=slab.e;
 if(e.sample)return;
 const b=slab.mesh.geometry.userData.bevel,fw=slab.w-2*b,fd=slab.d-2*b,k=Math.min(DECAL,1024/Math.max(fw,fd)),W=Math.round(fw*k),H=Math.round(fd*k);
 const mask=slab.mask||(slab.mask=document.createElement('canvas')),bump=slab.bump||(slab.bump=document.createElement('canvas'));
 mask.width=bump.width=W;mask.height=bump.height=H;
 const g=mask.getContext('2d',{willReadFrequently:true}),font='Geologica,"Noto Sans",system-ui,sans-serif',pad=.09*k,room=W-2*pad,least=.09*k,most=Math.min(.24*k,H-2*pad);
 const fits=size=>(g.font=`700 ${size}px ${font}`,g.measureText(code).width<=room);
 let code=String(e.course),size=most;
 while(!fits(size)&&size>least)size*=.92;
 if(!fits(size)){code=code.replace(/^\D+(?=\d)/,'');size=most;while(!fits(size)&&size>least)size*=.92;}
 if(most<least||!fits(size)){
  if(slab.decal){slab.mesh.remove(slab.decal);slab.decal.geometry.dispose();slab.decal.material.map.dispose();slab.decal.material.normalMap.dispose();slab.decal.material.dispose();slab.decal=null;}
  return;
 }
 g.clearRect(0,0,W,H);g.fillStyle='#fff';g.textAlign='center';g.textBaseline='middle';
 g.fillText(code,W/2,H/2+size*.04);
 // Soften the letter edges into short walls, then turn their slope into normals (a recess: walls face into the cut).
 const img=g.getImageData(0,0,W,H),a=new Float32Array(W*H),tmp=new Float32Array(W*H);
 for(let i=0;i<W*H;i++)a[i]=img.data[i*4+3]/255;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){let s=0,c=0;for(let j=Math.max(0,x-WALL);j<=Math.min(W-1,x+WALL);j++){s+=a[y*W+j];c++;}tmp[y*W+x]=s/c;}
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){let s=0,c=0;for(let j=Math.max(0,y-WALL);j<=Math.min(H-1,y+WALL);j++){s+=tmp[j*W+x];c++;}a[y*W+x]=s/c;}
 const normals=new ImageData(W,H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,dx=(a[x<W-1?i+1:i]-a[x>0?i-1:i])/2,dy=(a[y<H-1?i+W:i]-a[y>0?i-W:i])/2;
  const nx=SLOPE*dx,ny=-SLOPE*dy,l=Math.hypot(nx,ny,1);
  normals.data[i*4]=(nx/l*.5+.5)*255;normals.data[i*4+1]=(ny/l*.5+.5)*255;normals.data[i*4+2]=(1/l*.5+.5)*255;normals.data[i*4+3]=255;
  // Deeper is darker: the floor sits in shadow, the walls stay closer to the surface colour.
  img.data[i*4]=img.data[i*4+1]=img.data[i*4+2]=255*(1-.62*a[i]);img.data[i*4+3]=Math.min(255,a[i]*400);
 }
 g.putImageData(img,0,0);bump.getContext('2d').putImageData(normals,0,0);
 if(slab.decal){slab.decal.material.map.needsUpdate=slab.decal.material.normalMap.needsUpdate=true;return;}
 const map=new CanvasTexture(mask),normalMap=new CanvasTexture(bump);
 map.anisotropy=normalMap.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 // The groove is the slab's own colour, shaded by depth, matte with no coat; nudged above the top face to stay clear of it.
 slab.decal=new Mesh(new PlaneGeometry(fw,fd),new MeshStandardMaterial({color:slab.base,map,normalMap,roughness:.55,metalness:0,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
 slab.decal.rotation.x=-Math.PI/2;slab.decal.position.y=slab.h+.002;slab.decal.receiveShadow=true;
 slab.mesh.add(slab.decal);
}

function retire(slab){
 if(hovered===slab)setHover(null);
 if(reduce.matches){dispose(slab);return;}
 dying.add(slab);
}
function dispose(slab){
 week.remove(slab.mesh);
 slab.mesh.material.dispose();
 for(const child of slab.mesh.children){child.geometry.dispose();child.material.map?.dispose();child.material.normalMap?.dispose();child.material.dispose();}
 dying.delete(slab);
}

function build(){
 const m=window.weekModel,model=m?.events?.length?m:{min:540,max:1260,events:SAMPLE};
 const reset=model.min!==hours.min||model.max!==hours.max;
 // Slab height says how often a course meets in the week: more meetings, taller slabs.
 const freq=new Map();
 for(const e of model.events)freq.set(e.course,(freq.get(e.course)||0)+1);
 if(reset){makeBoard(model);resize();}
 const seen=new Set();
 let order=0;
 for(const e of model.events){
  const n=e.sample?Math.ceil(e.ects/3):freq.get(e.course);
  const sig=[e.day,e.start,e.end,e.lane,e.lanes,n,e.color,e.conflict,e.review,e.sample,hours.min,hours.max].join('|');
  seen.add(e.id);
  const old=slabs.get(e.id);
  if(old?.sig===sig)continue;
  if(old)retire(old);
  const slab=makeSlab(e,order++,n);
  slab.sig=sig;
  slabs.set(e.id,slab);
 }
 for(const [id,slab] of slabs)if(!seen.has(id)){retire(slab);slabs.delete(id);}
 firstBuild=false;
 measure();
 wake();
}

function restyle(){
 pal=palette();
 light();
 danger.set(pal.danger);
 if(board){board.material.color.set(pal.board);board.material.roughness=pal.dark?.7:.5;board.material.clearcoat=pal.dark?.15:.5;edges.material.color.set(pal.edge);drawLabels();}
 for(const slab of slabs.values()){
  if(slab.e.sample)slab.mesh.material.color.set(pal.chrome);
  slab.flat=flatColor(slab.e);
  slab.edge?.material.color.set(slab.e.conflict?pal.danger:pal.warning);
 }
 wake();
}

// Damped spring step; returns true while still moving.
function spring(s,to,k,c,dt){
 const a=k*(to-s.x)-c*s.v;
 s.v+=a*dt;s.x+=s.v*dt;
 return Math.abs(to-s.x)>1e-4||Math.abs(s.v)>1e-4;
}

// Scroll distance at which the planner sheet docks under the header: the morph's end point.
function measure(){
 const bar=parseFloat(getComputedStyle(root).getPropertyValue('--bar'))||76;
 dock=Math.max(1,Math.min(planner.offsetTop-bar,root.scrollHeight-innerHeight));
}

function resize(){
 const w=stage.clientWidth,h=stage.clientHeight;
 if(!w||!h)return;
 renderer.setSize(w,h,false);
 camera.aspect=w/h;
 // Desktop parks the week right of the headline; when the copy spans the hero, the week fills the space above it.
 const stacked=copy.offsetWidth>w*.6,heroH=hero.offsetHeight;
 const top=parseFloat(getComputedStyle(root).getPropertyValue('--bar'))||76;
 // The free box: above the copy when it spans the hero, otherwise right of the headline's longest line.
 const ink=Math.max(...[...copy.querySelectorAll('.line>span')].map(s=>s.offsetWidth)),left=stacked?0:copy.offsetLeft+ink+24;
 const bottom=stacked?Math.max(top+120,copy.offsetTop-16):heroH*.86,right=stacked?w:w-24;
 const cx=(left+right)/2/w,cy=(top+bottom)/2/h,boxW=(right-left)/w*(stacked?.74:.9),boxH=(bottom-top)/h;
 const radius=Math.hypot(size.w,size.d)/2*FIT,tan=Math.tan(camera.fov*Math.PI/360);
 view={w,h,stacked,dist:Math.max(radius/(tan*boxH),radius/(tan*camera.aspect*boxW)),ox:-(cx-.5)*w,oy:-(cy-.5)*h};
 measure();
 wake();
}

function progress(){
 return Math.min(1,Math.max(0,scrollY/dock));
}

// Where the planner draws its week, in viewport pixels; null when the planner is not a grid (phones).
function gridRect(){
 if(!grid.matches)return null;
 if(!calendarWrap.hidden){
  const cols=calendarWrap.querySelectorAll('.day-column');
  if(cols.length<5)return null;
  const a=cols[0].getBoundingClientRect(),b=cols[4].getBoundingClientRect();
  return a.height?{l:a.left,r:b.right,t:a.top,b:a.bottom,el:calendarWrap}:null;
 }
 if(!emptyState.hidden){const r=emptyState.getBoundingClientRect();return r.height?{l:r.left+24,r:r.right-24,t:r.top+24,b:r.bottom-24,el:emptyState}:null;}
 return null;
}

// Group scale and offset that put the board's day grid exactly on R for a straight-down camera.
function landing(R){
 const hh=view.dist*Math.tan(camera.fov*Math.PI/360),hw=hh*view.w/view.h;
 const wx=px=>(px/view.w*2-1)*hw,wz=py=>(py/view.h*2-1)*hh;
 const gx0=colX(0),gx1=colX(4)+colW(4),gz0=timeZ(hours.min),gz1=timeZ(hours.max);
 const sx=(wx(R.r)-wx(R.l))/(gx1-gx0),sz=(wz(R.b)-wz(R.t))/(gz1-gz0);
 return{sx,sz,tx:wx(R.l)-gx0*sx,tz:wz(R.t)-gz0*sz};
}

function setStage(opacity){
 const q=Math.round(opacity*100)/100;
 if(q!==stageOp){stageOp=q;stage.style.opacity=q>=1?'':String(q);}
}
// The planner's own week takes over in two steps: its grid chrome (day heads, hour axis, lines) as the board
// dissolves, its blocks only once the slabs sit exactly on them. The empty state has a single fade.
function clearTarget(){
 if(!targetEl)return;
 targetEl.style.removeProperty('--chrome');targetEl.style.removeProperty('--blocks');targetEl.style.opacity='';
 targetEl=null;targetKey='';
}
function setTarget(el,chrome,blocks){
 if(targetEl!==el)clearTarget();
 if(!el)return;
 targetEl=el;
 const c=Math.round(chrome*100)/100,b=Math.round(blocks*100)/100,next=c+'|'+b;
 if(next===targetKey)return;
 targetKey=next;
 if(el===calendarWrap){el.style.setProperty('--chrome',String(c));el.style.setProperty('--blocks',String(b));}
 else el.style.opacity=b>=1?'':String(b);
}
// The canvas is cut away over the sheet's toolbar and stats band (and the rail), so the board slides under the
// planner's chrome instead of across it; on phones the cut runs to the bottom, so the sheet covers the board.
function clipStage(R){
 const top=Math.round(planner.getBoundingClientRect().top),W=view.w,H=view.h;
 let holes='';
 if(top<H){
  const bottom=R?Math.max(top,Math.round(R.el.getBoundingClientRect().top)):H;
  holes+=` M0 ${top}H${W}V${bottom}H0Z`;
  if(R&&!drawer.matches){const s=sidebar.getBoundingClientRect();if(s.width&&s.bottom>bottom)holes+=` M${Math.round(s.left)} ${bottom}H${Math.round(s.right)}V${Math.round(s.bottom)}H${Math.round(s.left)}Z`;}
 }
 const next=holes?`path(evenodd,"M0 0H${W}V${H}H0Z${holes}")`:'';
 if(next!==clip){clip=next;stage.style.clipPath=next;}
}

function setHover(slab){
 if(hovered===slab)return;
 hovered=slab;
 tip.classList.toggle('on',!!slab);
 if(!slab)return;
 const name=document.createElement('b'),when=document.createElement('span');
 name.textContent=slab.e.name;
 when.textContent=`${DAYS[slab.e.day]} ${hhmm(slab.e.start)}-${hhmm(slab.e.end)}`;
 tip.replaceChildren(name,when);
}

// What lies under a viewport point: a real course slab, the board (or a sample slab), or nothing.
function cast(x,y){
 const rect=canvas.getBoundingClientRect();
 ndc.set((x-rect.left)/rect.width*2-1,-((y-rect.top)/rect.height)*2+1);
 ray.setFromCamera(ndc,camera);
 const hit=ray.intersectObjects([board,...[...slabs.values()].filter(s=>s.mesh.visible).map(s=>s.mesh)].filter(Boolean),false)[0];
 const slab=hit?.object.userData.slab;
 return{slab:slab&&!slab.e.sample?slab:null,board:!!hit};
}
const pick=(x,y)=>cast(x,y).slab;

function step(now){
 const dt=Math.min(.05,(now-(last||now))/1000);
 last=now;
 const t=now/1000,still=reduce.matches,p=still?0:progress();
 const R=still?null:gridRect();
 // e: how far the board has travelled onto the planner (complete a little before the sheet docks).
 const e=R?smooth((p-.04)/.84):0,tilt=R?0:smooth(p),calm=1-e;
 let moving=false;
 if(!still){
  moving=spring(springs.intro,1,26,9,dt)|moving;
  const follow=pointer.inside&&!orbit.drag;
  moving=spring(springs.cx,follow?pointer.x:0,38,9,dt)|moving;
  moving=spring(springs.cy,follow?pointer.y:0,38,9,dt)|moving;
  const a=orbit.aim;
  const held=orbit.drag&&p<=FREE;
  if(held){
   // Held: the board follows the hand on a stiff spring, so it has weight (a little lag, a little overshoot).
   moving=spring(orbit.yaw,a.yaw,170,19,dt)|spring(orbit.pitch,a.pitch,170,19,dt)|moving;
  }else if(p>FREE||orbit.home){
   // Home the shortest way round.
   orbit.yaw.x=Math.atan2(Math.sin(orbit.yaw.x),Math.cos(orbit.yaw.x));
   const going=spring(orbit.yaw,0,60,15,dt)|spring(orbit.pitch,0,60,15,dt)|spring(orbit.zoom,1,60,15,dt);
   a.yaw=orbit.yaw.x;a.pitch=orbit.pitch.x;a.zoom=orbit.zoom.x;
   if(!going)orbit.home=false;
   moving=going|moving;
  }else{
   // Thrown: it keeps the hand's speed and slows with drag plus a constant grip, so it comes to a firm stop
   // instead of creeping; pitch past its limits springs back like rubber.
   const drag=Math.exp(-dt*3.2),grip=2.6*dt,lim=clampPitch(orbit.pitch.x);
   const slow=v=>(v*=drag,Math.abs(v)<=grip?0:v-Math.sign(v)*grip);
   orbit.yaw.x+=orbit.yaw.v*dt;orbit.yaw.v=slow(orbit.yaw.v);
   if(lim!==orbit.pitch.x)orbit.pitch.v+=(-160*(orbit.pitch.x-lim)-18*orbit.pitch.v)*dt;else orbit.pitch.v=slow(orbit.pitch.v);
   orbit.pitch.x+=orbit.pitch.v*dt;
   a.yaw=orbit.yaw.x;a.pitch=orbit.pitch.x;
   moving=(Math.abs(orbit.yaw.v)+Math.abs(orbit.pitch.v)+Math.abs(orbit.pitch.x-lim)>1e-3)|moving;
   moving=spring(orbit.zoom,a.zoom,120,18,dt)|moving;
  }
  moving=spring(feel.lift,held&&orbit.drag.moved&&!reduce.matches?.24:0,held?95:150,held?15:13,dt)|moving;
  moving=spring(feel.bank,Math.max(-.16,Math.min(.16,-orbit.yaw.v*.05)),110,13,dt)|moving;
  moving=spring(feel.nod,Math.max(-.12,Math.min(.12,orbit.pitch.v*.05)),110,13,dt)|moving;
 }
 const intro=springs.intro.x;
 let px=0,py=(1-intro)*-2.6+(still?0:Math.sin(t*.8)*.05)*calm,pz=0,sx=1,sy=1,sz=1;
 if(R&&e>0){const L=landing(R);px=lerp(0,L.tx,e);py=lerp(py,0,e);pz=lerp(0,L.tz,e);sx=lerp(1,L.sx,e);sz=lerp(1,L.sz,e);sy=lerp(1,.03,e);}
 week.position.set(px,py+feel.lift.x*calm,pz);
 week.scale.set(sx,sy,sz);
 week.rotation.set(((1-intro)*.4+feel.nod.x)*calm,(still?0:Math.sin(t*.21)*.035)*calm,feel.bank.x*calm);
 if(pointer.dirty){
  pointer.dirty=false;
  const under=pointer.inside&&pointer.type!=='touch'&&!orbit.drag&&p<.3&&e<.02?cast(pointer.cx,pointer.cy):{slab:null,board:false};
  setHover(under.slab);
  hero.style.cursor=orbit.drag?.moved&&p<=FREE?'grabbing':under.slab?'pointer':under.board&&p<=FREE?'grab':'';
  if(hovered)tip.style.transform=`translate(${pointer.cx+16}px,${pointer.cy+16}px)`;
 }
 // Words on the board (day labels, hours, the slabs' printed text) leave together, before the planner's own arrive.
 const words=1-smooth((e-.35)/.3);
 for(const slab of slabs.values()){
  if(now<slab.start)continue;
  slab.mesh.visible=true;
  if(slab.decal)slab.decal.material.opacity=words;
  if(!still){
   const fall={x:slab.y,v:slab.v},lift={x:slab.lift,v:slab.lv};
   moving=spring(fall,0,150,14,dt)|moving;
   moving=spring(lift,hovered===slab?.32:0,220,20,dt)|moving;
   slab.y=fall.x;slab.v=fall.v;slab.lift=lift.x;slab.lv=lift.v;
  }
  slab.mesh.position.y=slab.y+slab.lift;
  if(!still){
   // Jelly: each slab leans against the spin on its base (taller ones sway more) and squashes as the board lands.
   const m=slab.mesh.position,r=Math.hypot(m.x,m.z)||1,give=slab.h*1.6;
   const lean=Math.max(-.2,Math.min(.2,orbit.yaw.v*.035*give*r/4));
   moving=spring(slab.rx,lean*m.z/r+orbit.pitch.v*.03*give,170,14,dt)|spring(slab.rz,-lean*m.x/r,170,14,dt)|moving;
   slab.mesh.rotation.set(slab.rx.x*calm,0,slab.rz.x*calm);
   slab.mesh.scale.y=1+Math.max(-.14,Math.min(.14,feel.lift.v*.1*give))*calm;
  }
  tint(slab,still?0:smooth((e-.3)/.6),still?.25:.22+.18*Math.sin(t*3.4));
 }
 for(const slab of dying){
  slab.s=Math.max(0,slab.s-dt*4.5);
  slab.mesh.scale.set(1,Math.max(.001,slab.s),1);
  if(slab.decal)slab.decal.material.opacity=Math.min(slab.decal.material.opacity,slab.s);
  if(slab.s<=0)dispose(slab);
  moving=true;
 }
 // The board, its edges, labels and floor shadow dissolve as the slabs settle into blocks.
 const dissolve=1-smooth((e-.55)/.4);
 // The board's labels and lines hand over to the planner's own day heads, hour axis and lines (see setTarget).
 // Strictly in sequence, so two hour axes never show at once: the 3D labels are gone by e .65, and the planner's
 // own chrome only arrives from e .82, when the slabs are within a few pixels of landing.
 const chrome=smooth((e-.82)/.15);
 if(board){board.material.opacity=edges.material.opacity=dissolve;labels.material.opacity=words;}
 floor.material.opacity=pal.shadow*calm;
 // Camera: the hero's three-quarter orbit, straight down once landed (phones keep the gentle tilt).
 // The elevation never reaches straight down or the board's own plane, whatever the springs overshoot.
 const az0=-.58+(springs.cx.x*.2+orbit.yaw.x)*calm,el0=Math.min(Math.PI/2-.04,Math.max(.06,.56+(orbit.pitch.x-springs.cy.x*.08)*calm));
 const az=R?lerp(az0,0,e):az0+.58*tilt,el=R?lerp(el0,Math.PI/2-.0015,e):el0+.76*tilt,r=view.dist*(1+.06*tilt)*lerp(orbit.zoom.x,1,e);
 camera.setViewOffset(view.w,view.h,view.ox*calm,view.oy*calm,view.w,view.h);
 camera.updateProjectionMatrix();
 camera.position.set(r*Math.cos(el)*Math.sin(az),r*Math.sin(el),r*Math.cos(el)*Math.cos(az));
 camera.lookAt(0,0,0);
 // Pan clear of the headline (pixels: right on wide screens, up on phones); fades out as the board lands.
 const need=e<.99?clearance():0;
 if(still)springs.push.x=need;else moving=spring(springs.push,need,220,30,dt)|moving;
 if(springs.push.x>.5){
  const s=springs.push.x*calm;
  camera.setViewOffset(view.w,view.h,view.ox*calm-(view.stacked?0:s),view.oy*calm+(view.stacked?s:0),view.w,view.h);
  camera.updateProjectionMatrix();
 }
 // Hand-over: the real blocks fade in over the last tenth of the scroll while the canvas fades out.
 const land=R?smooth((p-.9)/.1):0;
 setTarget(R?.el||null,chrome,land);
 setStage(1-land);
 if(!still)clipStage(R);
 return moving;
}

// Frame-time governor: drop resolution, then shadows, if the scene cannot hold ~50 fps.
let samples=[];
function govern(ms){
 if(!samples||ms>100)return;
 samples.push(ms);
 if(samples.length<120)return;
 const median=samples.slice(30).sort((a,b)=>a-b)[45];
 samples=null;
 if(median>20&&pixelRatio>1){pixelRatio=1;renderer.setPixelRatio(1);resize();}
 if(median>28){renderer.shadowMap.enabled=false;key.castShadow=false;scene.traverse(o=>{if(o.material)o.material.needsUpdate=true;});}
}

function loop(now){
 raf=0;
 const still=reduce.matches,was=last,isDocked=!still&&live&&(progress()>=1||document.body.classList.contains('rail-open'));
 if(isDocked!==docked){docked=isDocked;stage.classList.toggle('docked',docked);}
 // Docked under the planner: hand the week back to the page and skip the GPU until scrolled up again.
 if(docked){clearTarget();last=now;raf=requestAnimationFrame(loop);return;}
 step(now);
 renderer.render(scene,camera);
 if(!live){live=true;stage.classList.add('live');}
 if(was)govern(now-was);
 if(!still)raf=requestAnimationFrame(loop);
}
function wake(){
 if(!raf)raf=requestAnimationFrame(loop);
}
function stillMode(){
 // Reduced motion: no scroll choreography, the stage scrolls away with the hero as a still picture.
 stage.classList.toggle('still',reduce.matches);
 if(reduce.matches){clip='';stage.style.clipPath='';}
 if(reduce.matches){springs.intro.x=1;for(const slab of slabs.values()){slab.y=slab.lift=0;slab.start=0;}for(const slab of [...dying])dispose(slab);clearTarget();setStage(1);docked=false;stage.classList.remove('docked');}
 wake();
}

hero.addEventListener('pointerdown',event=>{
 down={x:event.clientX,y:event.clientY};
 if(event.button!==0||event.target.closest('a,button')||!live||progress()>FREE||!cast(event.clientX,event.clientY).board)return;
 orbit.drag={id:event.pointerId,x:event.clientX,y:event.clientY,lx:event.clientX,ly:event.clientY,moved:false,touch:event.pointerType==='touch',pitch:orbit.pitch.x};
 // Catch: the aim starts where the board is, so a spinning board is caught and stopped by the hand's spring.
 orbit.home=false;orbit.aim.yaw=orbit.yaw.x;orbit.aim.pitch=orbit.pitch.x;
 // Mouse and pen: no text selection while orbiting. Touch keeps native vertical scrolling (touch-action: pan-y).
 if(!orbit.drag.touch)event.preventDefault();
});
hero.addEventListener('pointermove',event=>{
 const rect=hero.getBoundingClientRect(),d=orbit.drag;
 pointer={x:(event.clientX-rect.left)/rect.width*2-1,y:(event.clientY-rect.top)/rect.height*2-1,cx:event.clientX,cy:event.clientY,inside:true,dirty:true,type:event.pointerType};
 if(d&&event.pointerId===d.id){
  if(!d.moved&&Math.hypot(event.clientX-d.x,event.clientY-d.y)>5){d.moved=true;hero.setPointerCapture?.(event.pointerId);setHover(null);}
  if(d.moved){
   // Grab the object: it turns with the pointer. Touch spins only (vertical swipes stay page scrolling).
   d.pitch+=d.touch?0:(event.clientY-d.ly)*.006;
   orbit.aim.yaw-=(event.clientX-d.lx)*.0085;
   orbit.aim.pitch=rubber(d.pitch);
   if(reduce.matches){orbit.yaw.x=orbit.aim.yaw;orbit.pitch.x=clampPitch(orbit.aim.pitch);}
  }
  d.lx=event.clientX;d.ly=event.clientY;
 }
 wake();
},{passive:true});
function endDrag(event){
 const d=orbit.drag;
 if(!d||event.pointerId!==d.id)return;
 orbit.drag=null;
 // The throw is whatever speed the hand's spring had, softly limited so a harder push still goes further but a
 // heavy board never whips round; pitch stays within the hand's rubber stretch. A hand that stopped throws nothing.
 const cap=(v,m)=>reduce.matches?0:m*Math.tanh(v/m);
 orbit.yaw.v=cap(orbit.yaw.v,12);orbit.pitch.v=cap(orbit.pitch.v,2.8);
 if(d.moved){suppressClick=true;setTimeout(()=>suppressClick=false);}
 pointer.dirty=true;
 wake();
}
hero.addEventListener('pointerup',endDrag);
hero.addEventListener('pointercancel',endDrag);
hero.addEventListener('dblclick',event=>{
 if(event.target.closest('a,button')||progress()>FREE||!cast(event.clientX,event.clientY).board)return;
 orbit.home=true;
 if(reduce.matches){orbit.yaw.x=orbit.pitch.x=0;orbit.zoom.x=orbit.aim.zoom=1;orbit.home=false;}
 wake();
});
// Trackpad pinch arrives as Ctrl+wheel (Lenis leaves it alone); plain wheel always scrolls the page.
hero.addEventListener('wheel',event=>{
 if(!event.ctrlKey||progress()>FREE||!cast(event.clientX,event.clientY).board)return;
 event.preventDefault();
 orbit.aim.zoom=Math.min(ZOOM[1],Math.max(ZOOM[0],orbit.aim.zoom*Math.exp(event.deltaY*.01)));orbit.home=false;
 if(reduce.matches)orbit.zoom.x=orbit.aim.zoom;
 wake();
},{passive:false});
hero.addEventListener('pointerleave',()=>{pointer={...pointer,inside:false,dirty:true};wake();});
hero.addEventListener('click',event=>{
 // A press that travelled (an orbit, or a swipe while the board is morphing) is not a click on a course.
 if(suppressClick||event.target.closest('a,button')||progress()>=.3||down&&Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)return;
 const slab=pick(event.clientX,event.clientY);
 if(slab&&typeof window.openDetail==='function')window.openDetail(slab.e.course);
});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();stage.classList.remove('live');clearTarget();cancelAnimationFrame(raf);raf=-1;});
document.addEventListener('weekmodel',()=>requestAnimationFrame(build));
new MutationObserver(restyle).observe(root,{attributes:true,attributeFilter:['data-theme']});
new ResizeObserver(resize).observe(stage);
reduce.addEventListener('change',stillMode);
document.fonts.ready.then(()=>{if(labels)drawLabels();for(const slab of slabs.values())decal(slab);resize();});
light();
stillMode();
build();
resize();
