import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
// Realistic view, 16 Nov 2026. Frame: x = board x, y = height, z = board y; built in mm, groups scaled to m.
// Sources: die photo (Chip_FPGA Interface.pptx, 8.1 x 7.0 mm, edge pads detected); V8 bond fingers (KiCad);
// probe = SC512_device.oas layers 2/6/8/18 + outline; ribbon = R5 litho1 (layer 12 + outline); hole centres from the layouts;
// joint = EFO report Fig. 1 (ball, tail through the flex hole, ball); G-chip outline, die position and ribbon->probe offset
// (+14.29, -2.00 mm) from fixture V10 parameters (ribbon GDS); probe wafer piece 3.8 x 15.5 measured by the lab.
// Enclosure: EBL512 Center_Opening_Threads_V3 STEP (base + insertion holder). Board fit derived from the photo widths; probe on its wafer in the underside channel, ribbon under the holder (the lab, 16 Nov); ribbon leaves to the left (the lab confirmed).
// Assumed: die 0.35 mm, wafer 0.5 mm, flex 20 um, loop 170 um, ball 66 um, epoxy shape, ribbon arch, ribbon route past the chip and the flip.
const DIES=[[130.125,80.465],[140.515,80.465]], DIE_W=8.1, DIE_H=7.0, DIE_T=0.35, WAFER_T=0.5;
const PADS_C=[0,(-2.607+3.083)/2], BALL_R=0.033, WIRE_R=0.0127;
const GX=60, GZ=80;                                   // where the current G-chip assembly is built (its die centre)
const tl=new THREE.TextureLoader();
function tex(url){const t=tl.load(url);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;}
const M={
 side:new THREE.MeshStandardMaterial({color:0x2c3138,roughness:.4,metalness:.3}),
 gold:new THREE.MeshStandardMaterial({color:0xf0c75a,roughness:.25,metalness:1}),
 finger:new THREE.MeshStandardMaterial({color:0xe8c46a,roughness:.3,metalness:.9}),
 wafer:new THREE.MeshStandardMaterial({color:0x5d6670,roughness:.25,metalness:.6,envMapIntensity:.6}),
 pcb:new THREE.MeshStandardMaterial({color:0x1f7a45,roughness:.5,metalness:.05}),
 conn:new THREE.MeshStandardMaterial({color:0x222428,roughness:.6}),
 epoxyClear:new THREE.MeshPhysicalMaterial({color:0xc98a2b,roughness:.15,transmission:.0,transparent:true,opacity:.55,depthWrite:false,envMapIntensity:.6}),
 epoxyBlack:new THREE.MeshStandardMaterial({color:0x0c0c0d,roughness:.25,metalness:.1,transparent:true,opacity:.93}),
 encl:new THREE.MeshStandardMaterial({color:0x8d8a83,roughness:.6,metalness:.1,side:THREE.DoubleSide}),
 holder:new THREE.MeshStandardMaterial({color:0xa7a39b,roughness:.6,metalness:.1,side:THREE.DoubleSide,transparent:true,opacity:.55,depthWrite:false}),
};
const SPH=new THREE.SphereGeometry(1,14,10), CYL=new THREE.CylinderGeometry(1,1,1,8), BOX=new THREE.BoxGeometry(1,1,1);
const mat4=(x,y,z,sx=1,sy=1,sz=1,ry=0)=>new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),ry),new THREE.Vector3(sx,sy,sz));
function inst(geo,mat,mats){const im=new THREE.InstancedMesh(geo,mat,mats.length);mats.forEach((m,i)=>im.setMatrixAt(i,m));return im;}
function flexPlane(url,box,segU,segV,profile){
 const W=box[2]-box[0], H=box[3]-box[1];
 const g=new THREE.PlaneGeometry(W,H,segU,segV); g.rotateX(-Math.PI/2); g.translate((box[0]+box[2])/2,0,-(box[1]+box[3])/2);
 if(profile){const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,profile(p.getX(i)));g.computeVertexNormals();}
 return new THREE.Mesh(g,new THREE.MeshStandardMaterial({map:tex(url),alphaTest:.5,side:THREE.DoubleSide,roughness:.6,metalness:.1,envMapIntensity:.25}));
}
function rivets(group,pts,base,film){
 const b1=[],tail=[],b2=[];
 for(const [x,z] of pts){ b1.push(mat4(x,base+.011,z,BALL_R,.013,BALL_R)); tail.push(mat4(x,(base+film)/2+.012,z,WIRE_R,film-base,WIRE_R)); b2.push(mat4(x,film+.012,z,BALL_R*.95,.015,BALL_R*.95)); }
 group.add(inst(SPH,M.gold,b1),inst(CYL,M.gold,tail),inst(SPH,M.gold,b2));
}
function roundSlab(x0,z0,x1,z1,y0,h,mat,r=.5){ // rounded epoxy slab between (x0,z0)-(x1,z1), from y0 up h, bevelled top edge
 const s=new THREE.Shape(); const w=x1-x0,d=z1-z0; r=Math.min(r,w/2-.01,d/2-.01);
 s.moveTo(x0+r,z0);s.lineTo(x1-r,z0);s.quadraticCurveTo(x1,z0,x1,z0+r);s.lineTo(x1,z1-r);s.quadraticCurveTo(x1,z1,x1-r,z1);s.lineTo(x0+r,z1);s.quadraticCurveTo(x0,z1,x0,z1-r);s.lineTo(x0,z0+r);s.quadraticCurveTo(x0,z0,x0+r,z0);
 const bv=Math.min(h*.6,.35), g=new THREE.ExtrudeGeometry(s,{depth:h-bv,bevelEnabled:true,bevelThickness:bv,bevelSize:-.01,bevelOffset:0,bevelSegments:6,curveSegments:10});
 g.rotateX(Math.PI/2); g.translate(0,y0+h-bv,0); const m=new THREE.Mesh(g,mat); m.renderOrder=5; return m;
}
// one chip: die (photo), fingers, 176 wires; rel = fingers/wires relative to the die centre (from V8 die 1)
function chip(group,G,cx,cz,top,dieTex){
 const DT=top+DIE_T;
 const d=new THREE.Mesh(new THREE.BoxGeometry(DIE_W,DIE_T,DIE_H),[M.side,M.side,new THREE.MeshStandardMaterial({map:dieTex,roughness:.4,metalness:.2,envMapIntensity:.4}),M.side,M.side,M.side]);
 d.position.set(cx,top+DIE_T/2,cz); group.add(d);
 const [ox,oz]=DIES[0];
 const F=G.fingers.filter(([x])=>Math.abs(x-ox)<6).map(([x,z,w,h])=>mat4(cx+x-ox,top+.018,cz+z-oz,w,.036,h));
 group.add(inst(BOX,M.finger,F));
 const geos=[],balls=[],stitches=[];
 for(const w of G.wires.filter(([px])=>Math.abs(px-ox)<6)){
  const px=cx+w[0]-ox,pz=cz+w[1]-oz,sx=cx+w[2]-ox,sz=cz+w[3]-oz;
  const A=new THREE.Vector3(px,DT+.02,pz),E=new THREE.Vector3(sx,top+.042,sz),dv=new THREE.Vector3().subVectors(E,A);dv.y=0;const L=dv.length(),n=dv.clone().normalize();
  const P=[A,A.clone().add(n.clone().multiplyScalar(.02)).setY(DT+.12),A.clone().add(n.clone().multiplyScalar(L*.28)).setY(DT+.17),A.clone().add(n.clone().multiplyScalar(L*.7)).setY(top+.04+(DT+.12-top-.04)*.45),E];
  geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(P,false,'centripetal'),24,WIRE_R,5,false));
  balls.push(mat4(px,DT+.012,pz,.034,.014,.034)); stitches.push(mat4(sx,top+.04,sz,.035,.008,.018,Math.atan2(-n.z,n.x)));
 }
 group.add(new THREE.Mesh(mergeGeometries(geos),M.gold),inst(SPH,M.gold,balls),inst(SPH,M.gold,stitches));
 return DT;
}
export async function build(){
 const G=await (await fetch('assets/geom.json')).json();
 const dieTex=tex('assets/die.jpg');
 const v8=new THREE.Group(), direct=new THREE.Group(), today=new THREE.Group(), current=new THREE.Group();
 const epo={direct:new THREE.Group(),today:new THREE.Group(),current:new THREE.Group()};
 const labels={direct:[],today:[],current:[],encl:[]};
 const pb=G.probe_box, [WW,WL]=G.wafer;
 const probeHolesAt=(tx,tz)=>G.probe_holes.map(([x,z])=>[tx+x-PADS_C[0],tz+z-PADS_C[1]]);
 function probe(group,tx,tz,y,wafer){ // probe face up, pad-field centre at (tx,tz), film at y; optional wafer piece below
  const m=flexPlane('assets/probe_tex.png',[pb[0],-pb[3],pb[2],-pb[1]],2,2); m.position.set(tx-PADS_C[0],y,tz-PADS_C[1]); group.add(m);
  if(wafer){const cxp=tx-PADS_C[0]+(pb[0]+pb[2])/2, czp=tz-PADS_C[1]+(pb[1]+pb[3])/2; const w=new THREE.Mesh(BOX,M.wafer); w.scale.set(WW,WAFER_T,WL); w.position.set(cxp,y-.02-WAFER_T/2,czp); group.add(w);}
 }
 // ---------- V8 board (proposal)
 const TOP=0.8; let DT;
 for(const [cx,cz] of DIES) DT=chip(v8,G,cx,cz,TOP,dieTex);
 const A=DIES.map(([cx,cz])=>[cx+PADS_C[0],cz+PADS_C[1]]);
 for(const [ax,az] of A){ probe(direct,ax,az,DT+.035,false); rivets(direct,probeHolesAt(ax,az),DT,DT+.035); }
 for(const [cx,cz] of DIES){ for(const k of ['direct','today']){ epo[k].add(roundSlab(cx-5.7,cz-5.25,cx+5.25,cz+3.45,TOP,DIE_T+.5,M.epoxyClear,.8)); } }
 labels.direct.push(['Probe riveted onto the chip: 512 × (ball, tail through the probe hole, ball). Released from its wafer first.',[A[0][0],DT+.05,A[0][1]-2.2]]);
 labels.direct.push(['176 wire bonds per chip: ball on the chip pad, stitch on the board finger',[DIES[1][0]+4.6,DT,DIES[1][1]-2.5]]);
 labels.direct.push(['Shanks leave the board edge',[A[1][0],DT,84.47+7]]);
 const PL=G.ribbon_padsL,PR=G.ribbon_padsR,rb=G.ribbon_box, lcu=(PL[0]+PL[2])/2,lcv=(PL[1]+PL[3])/2,rcu=(PR[0]+PR[2])/2,rcv=(PR[1]+PR[3])/2;
 const sm=(a,b,t)=>{const x=Math.min(1,Math.max(0,(t-a)/(b-a)));return x*x*(3-2*x);};
 function ribbonAssembly(group,ax,az,DTc,rot,arch=true,mir=false){ // ribbon riveted on the chip at (ax,az), leaves sideways; probe on its wafer under the far end
  const y0=DTc+.035, y1=DTc+.75, prof=u=>{const t=u-lcu;return arch?(y1-y0)*(sm(2.0,3.7,t)-sm(6.3,10.8,t)):0;};
  const m=flexPlane('assets/ribbon_tex.png',rb,420,60,prof); const g=new THREE.Group(); g.add(m); g.position.set(ax,y0,az); if(rot) g.rotation.y=Math.PI; if(mir) g.scale.x=-1; m.position.set(-lcu,0,lcv); group.add(g);
  const map=([u,v])=>mir?[ax-(u-lcu),az-(v-lcv)]:rot?[ax-(u-lcu),az+(v-lcv)]:[ax+(u-lcu),az-(v-lcv)];
  rivets(group,G.ribbon_holes.filter(([u])=>u<0).map(map),DTc,y0);
  const [px,pz]=map([rcu,rcv]); probe(group,px,pz,DTc,true); rivets(group,G.ribbon_holes.filter(([u])=>u>=0).map(map),DTc-.035,y0);
  return [px,pz,y0];
 }
 A.forEach(([ax,az],i)=>ribbonAssembly(today,ax,az,DT,i===0));
 labels.today.push(['Ribbon riveted onto the chip: ball, tail through the ribbon hole, ball',[A[0][0],DT+.04,A[0][1]-2.3]]);
 labels.today.push(['Ribbon arches over the side wire bonds and their epoxy',[A[1][0]+5,DT+.8,A[1][1]+1.5]]);
 labels.today.push(['Probe on its wafer, riveted under the ribbon\'s far end (before the flip)',[A[0][0]-(rcu-lcu),DT,A[0][1]+(rcv-lcv)-2]]);
 // ---------- current 512 device: G-chip T board, one chip, ribbon to the right, probe on its wafer (+14.29, -2.00 mm)
 const gc=G.gchip, T=gc.thickness, toW=([X,Y])=>[GX+X,GZ+(gc.die_center_y-Y)];
 const s=new THREE.Shape(gc.outline.map(p=>{const [x,z]=toW(p);return new THREE.Vector2(x,z);}));
 const bg=new THREE.ExtrudeGeometry(s,{depth:T,bevelEnabled:false}); bg.rotateX(Math.PI/2); bg.translate(0,T,0); current.add(new THREE.Mesh(bg,M.pcb));
 {const [x0,x1,y0,y1]=gc.connector_band,[a,b]=toW([x0,y0]),[c,d]=toW([x1,y1]); const k=new THREE.Mesh(BOX,M.conn); k.scale.set(c-a,gc.connector_h,b-d); k.position.set((a+c)/2,-gc.connector_h/2,(b+d)/2); current.add(k);}
 const DTg=chip(current,G,GX,GZ,T,dieTex);
 const [gpx,gpz]=ribbonAssembly(current,GX+PADS_C[0],GZ+PADS_C[1],DTg,false,true,true);   // to the left: the side the enclosure holder leaves open
 epo.current.add(roundSlab(GX-4.4,GZ-5.3,GX+4.6,GZ+3.6,T,DIE_T+.9,M.epoxyBlack,1.2));                 // black glob over the die (photo)
 epo.current.add(roundSlab(GX-6.0,GZ-3.9,GX-4.3,GZ+3.7,T,DIE_T+.35,M.epoxyClear,.5));                 // clear epoxy over the side wires (photo)
 epo.current.add(roundSlab(GX+4.5,GZ-3.9,GX+6.05,GZ+3.7,T,DIE_T+.35,M.epoxyClear,.5));
 labels.current.push(['G-chip (current 512 board): one ASIC, 176 wire bonds',[GX-3,DTg,GZ-4.2]]);
 labels.current.push(['Ribbon to the probe: 14.29 mm along, 2.00 mm across, from the ribbon layout; leaves to the left (confirmed), the side the enclosure leaves open',[GX-9,DTg+.8,GZ-1]]);
 labels.current.push(['Probe on its wafer piece (3.8 × 15.5 mm, measured)',[gpx,DTg,gpz+5]]);
 // ---------- current 512 device IN the EBL512 enclosure V3 (fit from the G-chip photos + enclosure STEP)
 // Board narrow body between the side walls (cavity x +-6.25), front edge on the front stops (y_enc -4.20); board on the floor (z_enc 0.40).
 // Then the back connector starts at y_enc -4.20 + 12.42 = 8.22, just past the floor end (8.20); the shoulder starts at 5.05, past the walls' end (4.60).
 const encl=new THREE.Group(); const EX=GX+40, EZ=GZ;
 const toE=([X,Y])=>[EX+X,EZ+(gc.die_center_y-Y)];
 {const s2=new THREE.Shape(gc.outline.map(p=>{const [x,z]=toE(p);return new THREE.Vector2(x,z);})); const g2=new THREE.ExtrudeGeometry(s2,{depth:T,bevelEnabled:false}); g2.rotateX(Math.PI/2); g2.translate(0,T,0); encl.add(new THREE.Mesh(g2,M.pcb));
  const [x0,x1,y0,y1]=gc.connector_band,[a2,b2]=toE([x0,y0]),[c2,d2]=toE([x1,y1]); const k=new THREE.Mesh(BOX,M.conn); k.scale.set(c2-a2,gc.connector_h,b2-d2); k.position.set((a2+c2)/2,-gc.connector_h/2,(b2+d2)/2); encl.add(k);}
 const DTe=chip(encl,G,EX,EZ,T,dieTex);

 // ---- after the flip, UNDER the holder (the lab, 16 Nov: "the probe and ribbon should both be under the enclosure").
 // Holder V3 underside (STEP): z 2.20, with a channel x -1.89..1.92 up to z 2.75 running from the front edge (y -5.57) to y 1.14.
 // The channel is 3.8 mm wide, the same as the probe's wafer piece, and 0.55 mm high. So the probe goes in it on its wafer:
 // wafer up against the channel roof, probe face down under it, ribbon end and rivets under the probe.
 // Ribbon: leaves the chip to the left (the lab confirmed), loops in the open gap beside the holder, comes back under the holder.
 // It is drawn turned face down (mirrored), which keeps the probe's y where a fold leaves it (pad centre y -2.33);
 // the wafer then ends at y 1.14, the channel end.
 const yRoof=2.75-0.4, WT=WAFER_T, yW=yRoof-WT/2, yP=yRoof-WT-.012, yR=yP-.035, xI=0.013;   // world heights
 const az=EZ+PADS_C[1], yr0=DTe+.035, SPAN=rcu-lcu, pzc=az-(rcv-lcv);
 function ribbonPath(b){return new THREE.CatmullRomCurve3([[2.4,yr0],[0,yr0],[-2.3,yr0],[-4.4,1.2],[-5.55-.25*b,1.5+.3*b],[-5.5-.2*b,1.95+.85*b],[-5.0,1.95+.6*b],[-4.75,yR+.01],[-4.0,yR],[xI,yR],[2.4,yR]].map(([x,y])=>new THREE.Vector3(x,y,0)),false,'centripetal');}
 function sampled(b){const c=ribbonPath(b),P=c.getSpacedPoints(6000),cum=[0];for(let i=1;i<P.length;i++)cum.push(cum[i-1]+P[i].distanceTo(P[i-1]));
  const near=(x,y)=>{let k=0,d=1e9;P.forEach((p,i)=>{const e=Math.hypot(p.x-x,p.y-y);if(e<d){d=e;k=i;}});return k;};return {P,cum,iB:near(0,yr0),iI:near(xI,yR)};}
 let lo=0,hi=3,S; for(let it=0;it<28;it++){const m=(lo+hi)/2;S=sampled(m);(S.cum[S.iI]-S.cum[S.iB]<SPAN)?lo=m:hi=m;} const BULGE=(lo+hi)/2;
 const loopTop=Math.max(...S.P.map(p=>p.y))+0.4;   // enclosure z of the loop top
 const at=t=>{const {P,cum}=S;t=Math.max(0,Math.min(cum[cum.length-1],t));let a=0,b=cum.length-1;while(b-a>1){const m=(a+b)>>1;cum[m]<=t?a=m:b=m;}const f=(t-cum[a])/((cum[b]-cum[a])||1);return [P[a].x+(P[b].x-P[a].x)*f,P[a].y+(P[b].y-P[a].y)*f];};
 {const W=rb[2]-rb[0],H=rb[3]-rb[1],g=new THREE.PlaneGeometry(W,H,700,40);g.rotateX(-Math.PI/2);g.translate((rb[0]+rb[2])/2,0,-(rb[1]+rb[3])/2);
  const p=g.attributes.position;for(let i=0;i<p.count;i++){const u=p.getX(i),v=-p.getZ(i),[x,y]=at(S.cum[S.iB]+u-lcu);p.setXYZ(i,EX+x,y,az-(v-lcv));}g.computeVertexNormals();
  encl.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial({map:tex('assets/ribbon_tex.png'),alphaTest:.5,side:THREE.DoubleSide,roughness:.6,metalness:.1,envMapIntensity:.25})));}
 rivets(encl,G.ribbon_holes.filter(([u])=>u<0).map(([u,v])=>[EX-(u-lcu),az-(v-lcv)]),DTe,yr0);
 {const b1=[],tl2=[],b2=[];for(const [u,v] of G.ribbon_holes.filter(([u])=>u>=0)){const x=EX+xI+(u-rcu),z=az-(v-lcv);
   b1.push(mat4(x,yP-.011,z,BALL_R,.013,BALL_R));tl2.push(mat4(x,(yP+yR)/2-.012,z,WIRE_R,yP-yR,WIRE_R));b2.push(mat4(x,yR-.012,z,BALL_R*.95,.015,BALL_R*.95));}
  encl.add(inst(SPH,M.gold,b1),inst(CYL,M.gold,tl2),inst(SPH,M.gold,b2));}
 {const m=flexPlane('assets/probe_tex.png',[pb[0],-pb[3],pb[2],-pb[1]],2,2);m.position.set(-PADS_C[0],0,-PADS_C[1]);const pg=new THREE.Group();pg.add(m);pg.rotation.z=Math.PI;pg.position.set(EX+xI,yP,pzc);encl.add(pg);}
 const tipY=(EZ-0.2-pzc)-(pb[3]-PADS_C[1]);   // enclosure y of the shank tips
 // Tungsten wires (the lab, 16 Nov): one per shank, about 25 um, laid in the holder's 4 top grooves. Groove bottoms z 3.32, centres x -0.71/-0.21/0.29/0.79.
 // Past the holder front each wire bends down and runs along its shank to the tip (the lab confirmed); the bend shape is drawn.
 {const WR=.0125, yGw=3.323-0.4+WR+.003, ySh=yP+WR+.002, zw=v=>EZ-0.2-v, geos=[];
  [-0.71,-0.21,0.29,0.79].forEach((gx,k)=>{const sx=xI+[-0.75,-0.25,0.25,0.75][k];
   const c=new THREE.CatmullRomCurve3([[gx,yGw,3.64],[gx,yGw,-5.2],[gx,yGw-.02,-5.75],[(gx+sx)/2,(yGw+ySh)/2,-6.9],[sx,ySh+.02,-8.0],[sx,ySh,-8.6],[sx,ySh,tipY]].map(([x,y,v])=>new THREE.Vector3(EX+x,y,zw(v))),false,'centripetal');
   geos.push(new THREE.TubeGeometry(c,240,WR,6,false));});
  encl.add(new THREE.Mesh(mergeGeometries(geos),new THREE.MeshStandardMaterial({color:0x9aa0a6,roughness:.3,metalness:1})));}
 const yWrear=1.14, zWrear=EZ-0.2-yWrear;   // wafer rear end on the channel end
 // wafer removed: the lab, 16 Nov - a nickel etch releases the probe so the shanks stick out (the wafer stays in the as-bonded mode).
 const wafFront=1.14-WL;
 epo.encl=new THREE.Group();
 epo.encl.add(roundSlab(EX-4.4,EZ-5.3,EX+4.6,EZ+3.6,T,DIE_T+.75,M.epoxyBlack,1.2));
 epo.encl.add(roundSlab(EX-6.0,EZ-3.9,EX-4.3,EZ+3.7,T,DIE_T+.35,M.epoxyClear,.5));
 epo.encl.add(roundSlab(EX+4.5,EZ-3.9,EX+6.05,EZ+3.7,T,DIE_T+.35,M.epoxyClear,.5));
 const E=await (await fetch('assets/enclosure_v3.json')).json(), meshes=[];
 for(const k of Object.keys(E)){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(E[k].p,3));g.setIndex(E[k].i);g.computeVertexNormals();g.rotateX(-Math.PI/2);
  const m=new THREE.Mesh(g,k==='body1'?M.holder:M.encl); m.position.set(EX,-0.4,EZ-0.2); if(k==='body1'){m.renderOrder=6;} encl.add(m); meshes.push(m);}
 const yE=v=>v-0.4, zE=v=>EZ-0.2-v;       // enclosure (y,z) -> world
 labels.encl=[
  ['G-chip body between the side walls: 12.50 mm cavity, board 12.10–12.21 mm measured (0.15–0.20 mm per side)',[EX-6.3,yE(2.0),zE(0)]],
  ['Front edge on the front stops (y −4.20)',[EX+5.4,yE(2.0),zE(-4.3)]],
  ['Back connector starts at 8.22, just past the floor end (8.20)',[EX,yE(-0.6),zE(8.4)]],
  ['Insertion holder over the die: underside 1.30 mm above the board (1.85 under the centre channel)',[EX+3,yE(3.7),zE(-1)]],
  [`Probe face down in the 3.8 mm underside channel; wafer gone after the nickel etch, so the 4 shanks stick out ${(-5.57-tipY).toFixed(1)} mm past the holder front`,[EX+xI,yRoof+.3,zE(-7.5)]],
 ['Tungsten wire, about 25 µm, one per shank, in the 4 top grooves; past the front each runs along its shank to the tip',[EX+0.03,3.301+.25,zE(-2.5)]],
 ['Ribbon end and its 512 rivets under the probe, below the holder',[EX+xI+2.6,yR,pzc]],
 [`Ribbon leaves the chip to the left, loops in the open gap beside the holder (${(2*BULGE).toFixed(1)} mm spare) and comes back under it`,[EX-5.6,loopTop-0.4,az-1]],
 ];
 encl.add(epo.encl);
 for(const g of [v8,direct,today,current,encl,...Object.values(epo)]) g.scale.setScalar(.001);
 epo.encl.scale.setScalar(1); // already inside encl
 return {v8,direct,today,current,encl,epo,labels};
}
export async function loadBoard(){ const g=await new GLTFLoader().loadAsync('assets/asic-top-v7.glb'); return g.scene; }
export {THREE,OrbitControls,mergeGeometries,M,SPH,CYL,BOX,mat4,inst,flexPlane,roundSlab,tex,DIE_W,DIE_H,DIE_T,WAFER_T,PADS_C,BALL_R,WIRE_R,DIES};
