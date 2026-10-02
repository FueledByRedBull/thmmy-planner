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
 PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Quaternion, Raycaster, SRGBColorSpace, Scene,
 ShadowMaterial, Shape, Vector2, Vector3, WebGLRenderer
} from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

const canvas=document.getElementById('week3d'),stage=canvas.parentElement,hero=document.querySelector('.hero'),tip=document.getElementById('heroTip');
const planner=document.getElementById('planner'),calendarWrap=document.getElementById('calendarWrap'),emptyState=document.getElementById('emptyState');
// A 1px marker just above the docking point (placed by measure): it comes into view the moment the page scrolls back up
// off the docked planner, which wakes the sleeping week without a scroll listener.
const dockMark=Object.assign(document.createElement('div'),{className:'dock-mark'});
document.body.append(dockMark);
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
// Production setting: reading shader logs forces every compile to finish synchronously on the main thread.
renderer.debug.checkShaderErrors=false;
renderer.toneMapping=NeutralToneMapping;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=PCFSoftShadowMap;
let pixelRatio=Math.min(devicePixelRatio,coarse.matches?1.5:1.75);
renderer.setPixelRatio(pixelRatio);

const scene=new Scene(),camera=new PerspectiveCamera(24,1,.5,200),week=new Group();
// The studio reflection is baked once at startup (see start below); the generator and room are freed after.
function environment(){
 const pmrem=new PMREMGenerator(renderer),room=new RoomEnvironment();
 scene.environment=pmrem.fromScene(room,.04).texture;
 room.dispose();pmrem.dispose();
}
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
// Tiles off the board (flung by a hard spin, or thrown to the sky on the way back up from the planner) live in `air`.
// "Spinning the board" really swings the camera round a still board, so `air` turns with the camera's azimuth: a free
// tile then moves, and rests, in the viewer's frame, over a studio floor that stays still while the board spins.
const air=new Group();
scene.add(key,key.target,rim,fill,floor,week,air);

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
 const texture=release(new CanvasTexture(canvas2d));
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
 const slab={e,mesh,w,d,h,edge,decal:null,rx:{x:0,v:0},rz:{x:0,v:0},sq:{x:0,v:0},home:mesh.position.clone(),air:null,base:mesh.material.color.clone(),flat:flatColor(e),y:still?0:2.4+order*.05,v:0,lift:0,lv:0,s:1,start:performance.now()+(still?0:(firstBuild?520:0)+Math.min(order,16)*DEAL)};
 mesh.position.y=slab.y;mesh.visible=still;mesh.userData.slab=slab;
 week.add(mesh);
 decal(slab);
 return slab;
}

// Once a texture is on the GPU its canvas is dead weight: free it (a redraw hands the texture a fresh canvas).
function release(texture){
 texture.onUpdate=()=>{texture.image.width=texture.image.height=0;texture.onUpdate=null;};
 return texture;
}
// The course code engraved into the slab top: a darker, matte groove cut through the clearcoat, whose walls are a
// normal map built from the lettering, so they catch the scene's light and shift as the board turns.
// Narrow tops shrink the code (dropping the ECE prefix last); a top too small for it stays plain.
// Identical tops (a course meeting twice at the same size) share one pair of textures.
const DECAL=300,WALL=2,SLOPE=9,engravings=new Map();
function engrave(e,W,H,k){
 const mask=document.createElement('canvas'),bump=document.createElement('canvas');
 mask.width=bump.width=W;mask.height=bump.height=H;
 const g=mask.getContext('2d',{willReadFrequently:true}),font='Geologica,"Noto Sans",system-ui,sans-serif',pad=.09*k,room=W-2*pad,least=.09*k,most=Math.min(.24*k,H-2*pad);
 const fits=size=>(g.font=`700 ${size}px ${font}`,g.measureText(code).width<=room);
 let code=String(e.course),size=most;
 while(!fits(size)&&size>least)size*=.92;
 if(!fits(size)){code=code.replace(/^\D+(?=\d)/,'');size=most;while(!fits(size)&&size>least)size*=.92;}
 if(most<least||!fits(size))return null;
 g.fillStyle='#fff';g.textAlign='center';g.textBaseline='middle';
 g.fillText(code,W/2,H/2+size*.04);
 // Soften the letter edges into short walls: a box blur by running sums (rows, then columns), constant work per pixel.
 const img=g.getImageData(0,0,W,H),id=img.data,n=W*H,a=new Float32Array(n),tmp=new Float32Array(n),span=2*WALL+1;
 for(let i=0;i<n;i++)a[i]=id[i*4+3]/255;
 for(let y=0;y<H;y++){const o=y*W;let s=0;for(let x=-WALL;x<=WALL;x++)s+=a[o+Math.min(W-1,Math.max(0,x))];for(let x=0;x<W;x++){tmp[o+x]=s/span;s+=a[o+Math.min(W-1,x+WALL+1)]-a[o+Math.max(0,x-WALL)];}}
 for(let x=0;x<W;x++){let s=0;for(let y=-WALL;y<=WALL;y++)s+=tmp[Math.min(H-1,Math.max(0,y))*W+x];for(let y=0;y<H;y++){a[y*W+x]=s/span;s+=tmp[Math.min(H-1,y+WALL+1)*W+x]-tmp[Math.max(0,y-WALL)*W+x];}}
 // Wall slopes become normals (a recess: walls face into the cut); deeper is darker, so the floor sits in shadow.
 const normals=new ImageData(W,H),nd=normals.data;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,j=i*4,dx=(a[x<W-1?i+1:i]-a[x>0?i-1:i])/2,dy=(a[y<H-1?i+W:i]-a[y>0?i-W:i])/2;
  if(dx===0&&dy===0){nd[j]=nd[j+1]=128;nd[j+2]=255;}
  else{const nx=SLOPE*dx,ny=-SLOPE*dy,l=1/Math.sqrt(nx*nx+ny*ny+1);nd[j]=(nx*l*.5+.5)*255;nd[j+1]=(ny*l*.5+.5)*255;nd[j+2]=(l*.5+.5)*255;}
  nd[j+3]=255;
  id[j]=id[j+1]=id[j+2]=255*(1-.62*a[i]);id[j+3]=Math.min(255,a[i]*400);
 }
 g.putImageData(img,0,0);bump.getContext('2d').putImageData(normals,0,0);
 return {mask,bump};
}
function decal(slab){
 const e=slab.e;
 if(e.sample||slab.decal)return;
 const b=slab.mesh.geometry.userData.bevel,fw=slab.w-2*b,fd=slab.d-2*b,k=Math.min(DECAL,1024/Math.max(fw,fd)),W=Math.round(fw*k),H=Math.round(fd*k),key=`${e.course}|${W}|${H}`;
 let entry=engravings.get(key);
 if(!entry){
  const art=engrave(e,W,H,k);
  if(!art)return;
  const map=release(new CanvasTexture(art.mask)),normalMap=release(new CanvasTexture(art.bump));
  map.anisotropy=normalMap.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  entry={map,normalMap,users:0,e,W,H,k};
  engravings.set(key,entry);
 }
 entry.users++;slab.engraving=key;
 // The groove is the slab's own colour, shaded by depth, matte with no coat; nudged above the top face to stay clear of it.
 slab.decal=new Mesh(new PlaneGeometry(fw,fd),new MeshStandardMaterial({color:slab.base,map:entry.map,normalMap:entry.normalMap,roughness:.55,metalness:0,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
 slab.decal.rotation.x=-Math.PI/2;slab.decal.position.y=slab.h+.002;slab.decal.receiveShadow=true;
 slab.mesh.add(slab.decal);
}

function retire(slab){
 if(hovered===slab)setHover(null);
 if(reduce.matches){dispose(slab);return;}
 dying.add(slab);
}
function dispose(slab){
 slab.mesh.removeFromParent();
 slab.mesh.material.dispose();
 for(const child of slab.mesh.children){child.geometry.dispose();child.material.dispose();}
 // Engravings are shared: their textures go with the last slab using them.
 const entry=engravings.get(slab.engraving);
 if(entry&&!--entry.users){entry.map.dispose();entry.normalMap.dispose();engravings.delete(slab.engraving);}
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

// ---- Tiles in the air -------------------------------------------------------------------------------------------
// Flung: spinning too fast, a tile loses its grip (the rim and the tall ones first), leaves along the spin, tumbles,
// lands on the studio floor just past the board's edge, slides and settles flat; once the spin calms, the tiles hop
// back to their slots one by one, Monday to Friday. Thrown: scrolling up off the docked planner throws every tile off
// the top of the screen; they drop back one by one as soon as the scroll rests, the board nears the hero, or the page
// heads back down, so any stopping point ends with a full board.
// Dealt: scrolling down from the top lifts the tiles off the board; they hover over it while it travels and, once it
// lies exactly on the planner, are dealt in one by one, Monday to Friday, each handing over to its own planner block
// as it lands. If the scroll rests, turns back or returns to the top first, they are dealt onto the board wherever it is.
// Grip: a tile lets go after spending SLIP seconds with ω²·(r+1.5)·(1+.8h) above GRIP while the board is held and spun,
// so only a sustained hard spin by hand clears it; a flick or a released throw does not.
const G=22,DEAL=40,GRIP=600,SLIP=.25,SKY_G=10,HOVER=.55,UP=new Vector3(0,1,0),v1=new Vector3(),v2=new Vector3(),v3=new Vector3(),q1=new Quaternion();
const sweep=(a,b)=>a.e.day-b.e.day||a.e.start-b.e.start||a.e.lane-b.e.lane;
let sky=null,deal=null,armed=false,topArmed=false,anyDealt=false,prevP=-1,pMoved=0,heading=0;
const airborne=()=>[...slabs.values()].filter(s=>s.air);
// Half the tile's vertical extent at orientation q (scale s), for resting its lowest point on the floor.
function halfY(slab,q,s){
 const ext=[slab.w/2*s.x,slab.h/2*s.y,slab.d/2*s.z];
 return [[1,0,0],[0,1,0],[0,0,1]].reduce((sum,a,i)=>sum+Math.abs(v1.set(...a).applyQuaternion(q).y)*ext[i],0);
}
// The tile's slot centre and orientation on the board, in air coordinates (the board may be mid-morph).
function slot(slab,out){
 week.localToWorld(out.copy(slab.home).setY(slab.h/2));
 return air.worldToLocal(out);
}
const slotQ=out=>out.copy(air.quaternion).invert().multiply(week.quaternion);
// Lift a tile off the board into the air, keeping exactly where and how it is.
function takeOff(slab,kind){
 if(hovered===slab)setHover(null);
 air.attach(slab.mesh);
 const m=slab.mesh,s=m.scale.clone();
 slab.air={kind,mode:'',t0:0,c:m.position.clone().add(v1.set(0,slab.h/2*s.y,0).applyQuaternion(m.quaternion)),q:m.quaternion.clone(),s,v:new Vector3(),w:new Vector3(),rest:0};
 return slab.air;
}
function place(slab){
 const a=slab.air,m=slab.mesh;
 m.quaternion.copy(a.q);m.scale.copy(a.s);
 m.position.copy(a.c).sub(v1.set(0,slab.h/2*a.s.y,0).applyQuaternion(a.q));
}
// Back on the board: its slot, upright, with a landing squash.
function seat(slab,squash=.22){
 week.add(slab.mesh);
 slab.mesh.position.copy(slab.home);slab.mesh.quaternion.identity();slab.mesh.scale.set(1,1,1);slab.mesh.visible=true;
 slab.air=null;slab.y=slab.v=slab.lift=slab.lv=0;slab.rx.x=slab.rx.v=slab.rz.x=slab.rz.v=0;slab.sq.x=squash;slab.sq.v=0;
}
function settleAll(){for(const slab of airborne())seat(slab,0);sky=deal=null;}
// A tile dealt onto the landed planner hands over to its own block: the tile hides, the block appears with a press.
function stamp(slab){
 const el=calendarWrap.querySelector(`.meeting[data-event="${CSS.escape(slab.e.id)}"]`);
 if(!el)return;
 slab.dealt=anyDealt=true;slab.mesh.visible=false;
 el.style.setProperty('--dealt','1');
 // From the block's centre, where the tile landed (blocks keep their origin at the top for the hover lift).
 el.animate([{transform:'scale(1.06)',transformOrigin:'center',boxShadow:'var(--shadow-md)'},{transform:'none',transformOrigin:'center'}],{duration:180,easing:'cubic-bezier(.16,1,.3,1)'});
}
// Back to the 3D tiles (the board left the planner, or the tiles are about to be thrown).
function undeal(){
 anyDealt=false;
 for(const slab of slabs.values())if(slab.dealt){slab.dealt=false;slab.mesh.visible=true;}
 for(const el of calendarWrap.querySelectorAll('.meeting'))el.style.removeProperty('--dealt');
}
// Where a hovering tile floats: over its slot on the board's surface, `height` above it, upright with the board.
function hoverAt(slab,height,out){
 week.localToWorld(out.copy(slab.home).setY(0));
 out.y+=height+slab.h/2*slab.air.s.y;
 return air.worldToLocal(out);
}
function lift(now){
 // Tiles still on their way in from the intro come along: ones falling are taken where they are, ones not yet shown
 // keep their moment and then arrive from above straight into the hover (see the hover step), so none skips a landing.
 const list=[...slabs.values()].filter(s=>!s.air&&!s.dealt).sort(sweep);
 if(!list.length)return;
 list.forEach((slab,i)=>{const a=takeOff(slab,'deal');a.mode='hover';a.up=now+i*12;});
 deal={phase:'hover'};
}
// Distance from c along dir (air coordinates) to the board's edge, measured in the board's own frame.
function edgeDistance(c,dir){
 const p=air.localToWorld(v2.copy(c)),d=v3.copy(dir).applyQuaternion(air.quaternion);
 const hx=size.w/2*week.scale.x,hz=size.d/2*week.scale.z,ox=week.position.x,oz=week.position.z;
 const t=(pos,dv,o,h)=>dv>1e-6?(o+h-pos)/dv:dv<-1e-6?(o-h-pos)/dv:Infinity;
 return Math.max(0,Math.min(t(p.x,d.x,ox,hx),t(p.z,d.z,oz,hz)));
}
function fling(slab,omega){
 const a=takeOff(slab,'fling'),c=a.c;
 // Along the spin (as the turning board would throw it) with a little outward slide; just fast enough to clear the
 // board's edge and land in a ring in view, rather than sailing off into the studio.
 const dir=v1.set(-omega*c.z,0,omega*c.x).normalize().addScaledVector(v2.set(c.x,0,c.z).normalize(),.35).setY(0).normalize().clone();
 const vy=2.6+Math.random()*1.2,T=(vy+Math.sqrt(vy*vy+2*G*Math.max(.1,c.y-floor.position.y)))/G;
 a.v.copy(dir).multiplyScalar((edgeDistance(c,dir)+.3+Math.random()*.8)/T).setY(vy);
 a.w.copy(v2.crossVectors(UP,dir).normalize()).multiplyScalar(6+Math.random()*4);
 a.mode='fly';
}
// Screen-up in air coordinates (into out), and how far along it point c must travel to leave the top of the view.
const sw1=new Vector3(),sw2=new Vector3(),swq=new Quaternion();
function skyward(c,out){
 out.setFromMatrixColumn(camera.matrixWorld,1).applyQuaternion(swq.copy(air.quaternion).invert());
 const w=air.localToWorld(sw1.copy(c)),ndc=sw2.copy(w).project(camera),dist=camera.position.distanceTo(w);
 return Math.max(.5,(1.3-ndc.y)*dist*Math.tan(camera.fov*Math.PI/360));
}
function throwUp(now){
 undeal();
 const list=[...slabs.values()].filter(s=>!s.air&&s.mesh.visible&&now>=s.start).sort(sweep);
 if(!list.length)return;
 list.forEach((slab,i)=>{
  const a=takeOff(slab,'sky'),reach=skyward(a.c,v1);
  a.mode='up';a.t0=now+i*12;a.v.copy(v1).multiplyScalar(reach/.3+SKY_G*.15);
  a.v.addScaledVector(v2.setFromMatrixColumn(camera.matrixWorld,0).applyQuaternion(q1.copy(air.quaternion).invert()),(Math.random()-.5)*1.4);
  a.w.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize().multiplyScalar(3+Math.random()*2);
  // A tile thrown off the flattened planner pops back into a full slab on the way up, never bigger than its block.
  const u=Math.min(a.s.x,a.s.z);a.pop=new Vector3(u,u,u);
 });
 sky={phase:'up',t:now};
}
function stepAir(now,dt,p,R,e){
 if(reduce.matches)return false;
 let moving=false;
 if(p!==prevP){heading=Math.sign(p-prevP);prevP=p;pMoved=now;}
 // Flung: only at the top of the page, while the board is the user's to spin, and only after a sustained hard spin.
 const omega=orbit.yaw.v;
 if(p<=FREE&&!orbit.home&&!sky)for(const slab of slabs.values()){
  if(slab.air||now<slab.start||Math.abs(slab.y)>.02){slab.slip=0;continue;}
  // Only while the hand is spinning it: a released board slows too fast to shake anything off.
  const over=!!orbit.drag?.moved&&Math.abs(omega)>3&&omega*omega*(Math.hypot(slab.home.x,slab.home.z)+1.5)*(1+.8*slab.h)>GRIP;
  slab.slip=over?(slab.slip||0)+dt:0;
  if(slab.slip>SLIP){slab.slip=0;fling(slab,omega);}
 }
 // Dealt: the first committed scroll down from the top (past 5%, about 40px) lifts the tiles; a jiggle at the top does
 // not. Not while a spin's tiles are still off the board.
 if(p<=FREE&&!sky&&!deal)topArmed=true;
 if(topArmed&&heading>0&&p>.05&&R){topArmed=false;if(!airborne().length)lift(now);}
 // The tiles are only handed over to the planner's blocks while the board lies exactly on them.
 if(anyDealt&&(e<.995||R?.el!==calendarWrap))undeal();
 // Thrown: leaving the docked planner upward, once per visit to the planner, and only once the scroll is well into the
 // hero (below 90%), so overshooting the planner's top on the way back to it never throws the week.
 if(armed&&R&&heading<0&&p<.9){armed=false;throwUp(now);}
 const list=airborne();
 if(!list.length){sky=deal=null;return false;}
 // Hovering tiles are dealt once the board has landed, or onto the board wherever it is if the scroll rests or turns back.
 if(deal?.phase==='hover'&&(e>=.995||now-pMoved>200&&p>FREE||heading<0||p<=FREE)){
  // Held to about half a second whatever the week holds: the gap shrinks for big weeks.
  const dealing=list.filter(s=>s.air.kind==='deal').sort(sweep),gap=Math.min(DEAL,360/dealing.length);
  dealing.forEach((slab,i)=>{const a=slab.air;a.mode='deal';a.t0=now+i*gap;a.from=null;});
  deal.phase='deal';
 }
 // Flung tiles hop home once everything has landed and the spin has calmed; at once if the page scrolls.
 const flung=list.filter(s=>s.air.kind==='fling'),urgent=p>FREE;
 if(flung.length&&(urgent||Math.abs(omega)<1.2&&flung.every(s=>s.air.mode==='floor'&&now-s.air.rest>350)))
  flung.filter(s=>s.air.mode!=='hop').sort(sweep).forEach((slab,i)=>{const a=slab.air;a.mode='hop';a.t0=now+i*(urgent?18:DEAL);a.from=null;});
 // Thrown tiles come back down once they are all off screen and the scroll rests, nears the hero, or heads back down.
 if(sky?.phase==='up'&&(list.every(s=>s.air.kind!=='sky'||s.air.mode==='wait')||now-sky.t>700))sky.phase='wait';
 if(sky?.phase==='wait'&&(now-pMoved>160||p<.25||heading>0&&p>.95)){
  const fast=heading>0&&p>.95;
  list.filter(s=>s.air.kind==='sky').sort(sweep).forEach((slab,i)=>{const a=slab.air;a.mode='drop';a.t0=now+i*(fast?10:DEAL);a.reach=undefined;});
  sky.phase='drop';
 }
 for(const slab of list){
  const a=slab.air,c=a.c,m=slab.mesh;
  moving=true;
  if(a.mode==='hover'||a.mode==='deal'&&now<a.t0){
   // A tile lifted before its intro moment waits, unseen, at its start height above the board.
   if(now<slab.start){m.visible=false;place(slab);continue;}
   m.visible=true;
   // Picked up (each a moment after the last) and carried over its slot on a soft spring while the board travels.
   const to=hoverAt(slab,now>=a.up?HOVER:0,v2);
   a.v.addScaledVector(v3.subVectors(to,c),240*dt).multiplyScalar(Math.exp(-28*dt));c.addScaledVector(a.v,dt);
   a.q.slerp(slotQ(q1),1-Math.exp(-dt*14));
   const u=Math.min(week.scale.x,week.scale.z);a.s.lerp(v3.set(u,u,u),1-Math.exp(-dt*14));
   place(slab);continue;
  }
  if(a.mode==='deal'){
   // Dealt onto its slot: it leaves the hover already moving and accelerates into the landing (no hang at the top); on
   // the landed planner it then becomes its block.
   const to=slot(slab,v2);
   if(!a.from){a.from=c.clone();a.fq=a.q.clone();a.fs=a.s.clone();m.visible=true;}
   const u=Math.min(1,(now-a.t0)/200);
   c.lerpVectors(a.from,to,u*(.35+.65*u));
   a.q.slerpQuaternions(a.fq,slotQ(q1),smooth(u));a.s.lerpVectors(a.fs,week.scale,u);
   if(u>=1){const onPlanner=e>=.995&&R?.el===calendarWrap&&!slab.e.sample;seat(slab,onPlanner?0:.22);if(onPlanner)stamp(slab);continue;}
   place(slab);continue;
  }
  if(now<a.t0&&a.mode!=='floor'&&a.mode!=='hop')continue;
  if(a.mode==='fly'){
   a.v.y-=G*dt;c.addScaledVector(a.v,dt);
   const turn=a.w.length();if(turn>1e-4)a.q.premultiply(q1.setFromAxisAngle(v1.copy(a.w).divideScalar(turn),turn*dt));
   const half=halfY(slab,a.q,a.s);
   if(c.y-half<=floor.position.y&&a.v.y<0){
    c.y=floor.position.y+half;
    if(a.v.y<-3){a.v.y*=-.22;a.w.multiplyScalar(.45);a.v.x*=.6;a.v.z*=.6;}
    else{a.v.y=0;a.mode='floor';a.rest=now;}
   }
  }else if(a.mode==='floor'||a.mode==='hop'&&now<a.t0){
   // Slide to a stop and roll onto its base, top up, keeping the heading it landed with.
   const k=Math.exp(-dt*7);a.v.x*=k;a.v.z*=k;c.x+=a.v.x*dt;c.z+=a.v.z*dt;
   const f=v1.set(1,0,0).applyQuaternion(a.q);
   a.q.slerp(q1.setFromAxisAngle(UP,Math.atan2(-f.z,f.x)),1-Math.exp(-dt*12));
   c.y=floor.position.y+halfY(slab,a.q,a.s);
  }else if(a.mode==='hop'){
   // One arc to its slot (which moves with the board): straight across, up and down like a jump.
   if(!a.from){a.from=c.clone();a.fq=a.q.clone();a.fs=a.s.clone();a.dur=420+Math.min(140,a.from.distanceTo(slot(slab,v2))*30);}
   const u=Math.min(1,(now-a.t0)/a.dur),to=slot(slab,v2);
   c.lerpVectors(a.from,to,u).addScaledVector(UP,(1.2+a.from.distanceTo(to)*.12)*4*u*(1-u));
   a.q.slerpQuaternions(a.fq,slotQ(q1),smooth(u));a.s.lerpVectors(a.fs,week.scale,u);
   if(u>=1){seat(slab);continue;}
  }else if(a.mode==='up'){
   a.v.addScaledVector(v1.copy(a.v).normalize(),-SKY_G*dt);c.addScaledVector(a.v,dt);
   const turn=a.w.length();if(turn>1e-4)a.q.premultiply(q1.setFromAxisAngle(v1.copy(a.w).divideScalar(turn),turn*dt));
   a.s.lerp(a.pop,1-Math.exp(-dt*14));
   if(air.localToWorld(v2.copy(c)).project(camera).y>1.25){a.mode='wait';m.visible=false;}
  }else if(a.mode==='drop'){
   // Falls in from just above the top edge, accelerating like a dropped tile, onto a slot that moves with the scroll.
   const to=slot(slab,v2),reach=skyward(to,v3);
   if(a.reach===undefined){a.reach=reach;a.fq=a.q.clone();a.fs=a.s.clone();m.visible=true;}
   const u=Math.min(1,(now-a.t0)/300);
   c.copy(to).addScaledVector(v3,a.reach*(1-u*u));
   a.q.slerpQuaternions(a.fq,slotQ(q1),smooth(u));a.s.lerpVectors(a.fs,week.scale,u);
   if(u>=1){seat(slab);continue;}
  }
  if(a.mode!=='wait')place(slab);
 }
 // Tiles resting on the floor nudge apart rather than overlap.
 const ground=list.filter(s=>s.air&&s.air.mode==='floor');
 for(let i=0;i<ground.length;i++)for(let j=i+1;j<ground.length;j++){
  const a=ground[i].air.c,b=ground[j].air.c,min=.45*(Math.min(ground[i].w,ground[i].d)+Math.min(ground[j].w,ground[j].d));
  const dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz);
  if(dist>1e-4&&dist<min){const push=(min-dist)/2/dist;a.x-=dx*push;a.z-=dz*push;b.x+=dx*push;b.z+=dz*push;place(ground[i]);place(ground[j]);}
 }
 if(sky&&!airborne().some(s=>s.air.kind==='sky'))sky=null;
 if(deal&&!airborne().some(s=>s.air.kind==='deal'))deal=null;
 return moving;
}

// Scroll distance at which the planner sheet docks under the header: the morph's end point.
function measure(){
 const bar=parseFloat(getComputedStyle(root).getPropertyValue('--bar'))||76;
 dock=Math.max(1,Math.min(planner.offsetTop-bar,root.scrollHeight-innerHeight));
 dockMark.style.top=dock-1+'px';
}

let sized='';
function resize(){
 const w=stage.clientWidth,h=stage.clientHeight;
 if(!w||!h)return;
 // Setting the canvas size reallocates the drawing buffer even when nothing changed: only on a real change.
 const key=`${w}x${h}@${pixelRatio}`;
 if(key!==sized){sized=key;renderer.setSize(w,h,false);}
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
 const words=1-smooth((e-.35)/.3),flatten=still?0:smooth((e-.3)/.6),pulse=still?.25:.22+.18*Math.sin(t*3.4);
 for(const slab of slabs.values()){
  if(now<slab.start)continue;
  if(slab.decal)slab.decal.material.opacity=words;
  tint(slab,flatten,pulse);
  // Tiles in the air are moved by stepAir below.
  if(slab.air)continue;
  slab.mesh.visible=!slab.dealt;
  if(!still){
   // One landing everywhere: a tile above the board falls, accelerating, and squashes as it lands (no overshoot into it).
   if(slab.y>0||slab.v){slab.v-=G*dt;slab.y+=slab.v*dt;if(slab.y<=0){slab.y=slab.v=0;slab.sq.x=.22;}moving=true;}
   const lift={x:slab.lift,v:slab.lv};
   moving=spring(lift,hovered===slab?.32:0,220,20,dt)|moving;
   slab.lift=lift.x;slab.lv=lift.v;
  }
  slab.mesh.position.y=slab.y+slab.lift;
  if(!still){
   // Jelly: each slab leans against the spin on its base (taller ones sway more) and squashes as the board lands.
   const m=slab.mesh.position,r=Math.hypot(m.x,m.z)||1,give=slab.h*1.6;
   const lean=Math.max(-.2,Math.min(.2,orbit.yaw.v*.035*give*r/4));
   moving=spring(slab.rx,lean*m.z/r+orbit.pitch.v*.03*give,170,14,dt)|spring(slab.rz,-lean*m.x/r,170,14,dt)|moving;
   slab.mesh.rotation.set(slab.rx.x*calm,0,slab.rz.x*calm);
   // A tile landing back on the board (from a hop or a drop) squashes and springs back.
   moving=spring(slab.sq,0,260,16,dt)|moving;
   const sq=Math.max(-.2,Math.min(.3,slab.sq.x));
   slab.mesh.scale.set(1+sq*.35,(1+Math.max(-.14,Math.min(.14,feel.lift.v*.1*give))*calm)*(1-sq),1+sq*.35);
  }
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
 // The pan follows the drifting outline every frame; only a real pan (resize, zoom: fast) counts as movement, so the
 // idle frame rate can still apply while it tracks the slow drift.
 if(still)springs.push.x=need;else{spring(springs.push,need,220,30,dt);moving=moving||Math.abs(springs.push.v)>24;}
 if(springs.push.x>.5){
  const s=springs.push.x*calm;
  camera.setViewOffset(view.w,view.h,view.ox*calm-(view.stacked?0:s),view.oy*calm+(view.stacked?s:0),view.w,view.h);
  camera.updateProjectionMatrix();
 }
 // Free tiles move in the viewer's frame: the air layer turns with the camera (see `air`).
 air.rotation.y=az;air.updateMatrixWorld();week.updateMatrixWorld();camera.updateMatrixWorld();
 if(!R&&sky)settleAll();
 moving=stepAir(now,dt,p,R,e)|moving;
 // Hand-over: the real blocks fade in over the last tenth of the scroll while the canvas fades out. While tiles are
 // thrown to the sky or being dealt, the canvas stays fully on and the planner's own blocks stay hidden (a dealt tile's
 // block shows on its own, see stamp), so nothing shows twice.
 const land=R&&!sky&&!deal?smooth((p-.9)/.1):0;
 setTarget(R?.el||null,chrome,land);
 setStage(1-land);
 // Thrown tiles fly up over the sheet's toolbar and stats, so the canvas is not cut away while they leave.
 if(!still){if(sky?.phase==='up'){if(clip){clip='';stage.style.clipPath='';}}else clipStage(R);}
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

// Idle: when nothing moves but the slow drift and conflict pulse (no spring, scroll, pointer or drag), 30 fps looks
// identical to the display rate at a fraction of the GPU. Any of those wakes full rate on the very next frame.
const IDLE=1000/30;
let compiled=false,busy=true,lastP=-1;
function loop(now){
 raf=0;
 if(!compiled)return;
 const still=reduce.matches,was=last,p=progress(),isDocked=!still&&live&&(p>=1&&!deal||document.body.classList.contains('rail-open'));
 if(isDocked!==docked){docked=isDocked;stage.classList.toggle('docked',docked);}
 // Docked under the planner (once a deal in progress has finished): hand the week back to the page and sleep (no frames
 // at all) until a scroll, a resize or the course drawer closing wakes it.
 // Docked also re-arms the throw to the sky for the next way back up, and seats any tile still in the air.
 if(docked){clearTarget();last=now;if(p>=1){armed=true;prevP=p;}if(airborne().length)settleAll();return;}
 if(p!==lastP){lastP=p;busy=true;}
 if(!busy&&!still&&now-was<IDLE){raf=requestAnimationFrame(loop);return;}
 const full=busy;
 busy=!!step(now);
 renderer.render(scene,camera);
 if(!live){live=true;stage.classList.add('live');}
 // Only frames drawn at full rate measure the GPU; idle frames are slow on purpose.
 if(was&&full)govern(now-was);
 if(!still)raf=requestAnimationFrame(loop);
}
function wake(){
 busy=true;
 if(!raf)raf=requestAnimationFrame(loop);
}
function stillMode(){
 // Reduced motion: no scroll choreography, the stage scrolls away with the hero as a still picture.
 stage.classList.toggle('still',reduce.matches);
 if(reduce.matches){clip='';stage.style.clipPath='';}
 if(reduce.matches){settleAll();springs.intro.x=1;for(const slab of slabs.values()){slab.y=slab.lift=0;slab.start=0;}for(const slab of [...dying])dispose(slab);clearTarget();setStage(1);docked=false;stage.classList.remove('docked');}
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
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();stage.classList.remove('live');root.classList.remove('has-3d');clearTarget();cancelAnimationFrame(raf);raf=-1;});
document.addEventListener('weekmodel',()=>requestAnimationFrame(build));
new MutationObserver(restyle).observe(root,{attributes:true,attributeFilter:['data-theme']});
new ResizeObserver(resize).observe(stage);
// Wakers for the docked sleep: scrolling back up (the dock marker, see dockMark), and the drawer that hides the stage
// closing.
new IntersectionObserver(entries=>{if(docked&&entries.some(e=>e.isIntersecting))wake();}).observe(dockMark);
new MutationObserver(()=>{if(docked)wake();}).observe(document.body,{attributes:true,attributeFilter:['class']});
reduce.addEventListener('change',stillMode);
// Canvas text drawn before the web font arrived is redrawn once it has; normally the font is already there.
if(document.fonts.status!=='loaded')document.fonts.ready.then(()=>{
 if(labels)drawLabels();
 for(const entry of engravings.values()){
  const art=engrave(entry.e,entry.W,entry.H,entry.k);
  if(!art)continue;
  entry.map.image=art.mask;entry.normalMap.image=art.bump;
  release(entry.map);release(entry.normalMap);
  entry.map.needsUpdate=entry.normalMap.needsUpdate=true;
 }
 for(const slab of slabs.values())decal(slab);
 resize();
});
light();
stillMode();
// Startup in short tasks (studio light, week, shaders) so the page stays responsive while the board gets ready.
// Shaders compile in parallel where the browser can, and the first frame waits for them instead of stalling.
const task=()=>new Promise(r=>setTimeout(r));
(async()=>{
 await task();environment();
 await task();build();resize();
 await task();
 try{await renderer.compileAsync(scene,camera);}catch{}
 compiled=true;wake();
})();
