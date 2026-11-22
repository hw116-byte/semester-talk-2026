// Bonding steps, 16 Nov 2026: the current 512 device (G-chip + R5 ribbon + SC512 probe + EBL512 enclosure V3), one step at a time.
// Same geometry and sources as scene.js (encl + current modes); this file only splits it into steps and animates them.
// Built in mm (x = board x, y = height, z = board y), group scaled to m.
import {THREE,mergeGeometries,M,SPH,CYL,BOX,mat4,inst,flexPlane,roundSlab,tex,DIE_W,DIE_H,DIE_T,WAFER_T,PADS_C,BALL_R,WIRE_R,DIES} from './scene.js';

const EX=100, EZ=80;
const sm=(a,b,t)=>{const x=Math.min(1,Math.max(0,(t-a)/(b-a)));return x*x*(3-2*x);};
const fadeMat=(m,o=1)=>{const c=m.clone();c.transparent=true;c.userData.o=o;return c;};

export async function buildSteps(){
 const G=await (await fetch('assets/geom.json')).json(), E=await (await fetch('assets/enclosure_v3.json')).json();
 const root=new THREE.Group(), gc=G.gchip, T=gc.thickness, DT=T+DIE_T, pb=G.probe_box, [WW,WL]=G.wafer, rb=G.ribbon_box;
 const PL=G.ribbon_padsL,PR=G.ribbon_padsR, lcu=(PL[0]+PL[2])/2,lcv=(PL[1]+PL[3])/2,rcu=(PR[0]+PR[2])/2,rcv=(PR[1]+PR[3])/2;
 const az=EZ+PADS_C[1], yr0=DT+.035, SPAN=rcu-lcu, pzc=az-(rcv-lcv);
 const yRoof=2.75-0.4, yP=yRoof-WAFER_T-.012, yR=yP-.035, xI=0.013, zE=v=>EZ-0.2-v;

 // ---- board + fingers (always there)
 const toE=([X,Y])=>[EX+X,EZ+(gc.die_center_y-Y)];
 {const s=new THREE.Shape(gc.outline.map(p=>{const [x,z]=toE(p);return new THREE.Vector2(x,z);}));const g=new THREE.ExtrudeGeometry(s,{depth:T,bevelEnabled:false});g.rotateX(Math.PI/2);g.translate(0,T,0);root.add(new THREE.Mesh(g,M.pcb));
  const [x0,x1,y0,y1]=gc.connector_band,[a,b]=toE([x0,y0]),[c,d]=toE([x1,y1]);const k=new THREE.Mesh(BOX,M.conn);k.scale.set(c-a,gc.connector_h,b-d);k.position.set((a+c)/2,-gc.connector_h/2,(b+d)/2);root.add(k);}
 const [ox,oz]=DIES[0];
 root.add(inst(BOX,M.finger,G.fingers.filter(([x])=>Math.abs(x-ox)<6).map(([x,z,w,h])=>mat4(EX+x-ox,T+.018,EZ+z-oz,w,.036,h))));
 // ---- die
 const die=new THREE.Mesh(new THREE.BoxGeometry(DIE_W,DIE_T,DIE_H),[M.side,M.side,new THREE.MeshStandardMaterial({map:tex('assets/die.jpg'),roughness:.4,metalness:.2,envMapIntensity:.4}),M.side,M.side,M.side]);
 die.position.set(EX,T+DIE_T/2,EZ); root.add(die);
 // ---- 176 wire bonds, sorted around the die so they appear in a sweep
 const W=G.wires.filter(([px])=>Math.abs(px-ox)<6).map(w=>[EX+w[0]-ox,EZ+w[1]-oz,EX+w[2]-ox,EZ+w[3]-oz]).sort((p,q)=>Math.atan2(p[1]-EZ,p[0]-EX)-Math.atan2(q[1]-EZ,q[0]-EX));
 const wg=[],wb=[],ws=[];
 for(const [px,pz,sx,sz] of W){const A=new THREE.Vector3(px,DT+.02,pz),En=new THREE.Vector3(sx,T+.042,sz),dv=new THREE.Vector3().subVectors(En,A);dv.y=0;const L=dv.length(),n=dv.clone().normalize();
  const P=[A,A.clone().add(n.clone().multiplyScalar(.02)).setY(DT+.12),A.clone().add(n.clone().multiplyScalar(L*.28)).setY(DT+.17),A.clone().add(n.clone().multiplyScalar(L*.7)).setY(T+.04+(DT+.12-T-.04)*.45),En];
  wg.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(P,false,'centripetal'),24,WIRE_R,5,false));wb.push(mat4(px,DT+.012,pz,.034,.014,.034));ws.push(mat4(sx,T+.04,sz,.035,.008,.018,Math.atan2(-n.z,n.x)));}
 const wires=new THREE.Mesh(mergeGeometries(wg),M.gold), wBalls=inst(SPH,M.gold,wb), wSt=inst(SPH,M.gold,ws); root.add(wires,wBalls,wSt);
 const perWire=wg[0].index.count;

 // ---- chip-end rivets (fixed): ball + standing tail, then the second ball
 const chipHoles=G.ribbon_holes.filter(([u])=>u<0).map(([u,v])=>[EX-(u-lcu),az-(v-lcv)]).sort((p,q)=>(p[0]+p[1])-(q[0]+q[1]));
 const cB1=inst(SPH,M.gold,chipHoles.map(([x,z])=>mat4(x,DT+.011,z,BALL_R,.013,BALL_R)));
 const cTl=inst(CYL,M.gold,chipHoles.map(([x,z])=>mat4(x,(DT+yr0)/2+.012,z,WIRE_R,yr0-DT,WIRE_R)));
 const cB2=inst(SPH,M.gold,chipHoles.map(([x,z])=>mat4(x,yr0+.012,z,BALL_R*.95,.015,BALL_R*.95)));
 root.add(cB1,cTl,cB2);

 // ---- probe group: pivot = probe pad-field centre; face up at rotation 0, face down at -pi. Wafer and probe-end rivets ride with it.
 const pg=new THREE.Group();
 {const m=flexPlane('assets/probe_tex.png',[pb[0],-pb[3],pb[2],-pb[1]],2,2);m.position.set(-PADS_C[0],0,-PADS_C[1]);pg.add(m);}
 const wafMat=fadeMat(M.wafer), wafer=new THREE.Mesh(BOX,wafMat);
 {const zr=zE(1.14)-pzc;            // wafer rear end at the holder channel end (enclosure y 1.14)
  wafer.scale.set(WW,WAFER_T,WL);wafer.position.set((pb[0]+pb[2])/2-PADS_C[0],-(.016+WAFER_T/2),zr+WL/2);pg.add(wafer);}
 const prHoles=G.ribbon_holes.filter(([u])=>u>=0).map(([u,v])=>[-(u-rcu),-(v-rcv)]).sort((p,q)=>(p[1]-p[0])-(q[1]-q[0]));
 const pB1=inst(SPH,M.gold,prHoles.map(([x,z])=>mat4(x,.011,z,BALL_R,.013,BALL_R)));
 const pTl=inst(CYL,M.gold,prHoles.map(([x,z])=>mat4(x,.029,z,WIRE_R,.036,WIRE_R)));
 const pB2=inst(SPH,M.gold,prHoles.map(([x,z])=>mat4(x,.047,z,BALL_R*.95,.015,BALL_R*.95)));
 pg.add(pB1,pTl,pB2); root.add(pg);

 // ---- ribbon: one mesh whose cross-section morphs from "as bonded" (flat, arched over the side wires, to the left)
 // to "after the flip" (loop in the gap left of the holder, back under the holder). Tangent angle interpolated along the length.
 function ribbonPath(b){return new THREE.CatmullRomCurve3([[2.4,yr0],[0,yr0],[-2.3,yr0],[-4.4,1.2],[-5.55-.25*b,1.5+.3*b],[-5.5-.2*b,1.95+.85*b],[-5.0,1.95+.6*b],[-4.75,yR+.01],[-4.0,yR],[xI,yR],[2.4,yR]].map(([x,y])=>new THREE.Vector3(x,y,0)),false,'centripetal');}
 function sampled(b){const c=ribbonPath(b),P=c.getSpacedPoints(6000),cum=[0];for(let i=1;i<P.length;i++)cum.push(cum[i-1]+P[i].distanceTo(P[i-1]));
  const near=(x,y)=>{let k=0,d=1e9;P.forEach((p,i)=>{const e=Math.hypot(p.x-x,p.y-y);if(e<d){d=e;k=i;}});return k;};return {P,cum,iB:near(0,yr0),iI:near(xI,yR)};}
 let lo=0,hi=3,S;for(let it=0;it<28;it++){const m=(lo+hi)/2;S=sampled(m);(S.cum[S.iI]-S.cum[S.iB]<SPAN)?lo=m:hi=m;}
 const at=t=>{const {P,cum}=S;t=Math.max(0,Math.min(cum[cum.length-1],t));let a=0,b=cum.length-1;while(b-a>1){const m=(a+b)>>1;cum[m]<=t?a=m:b=m;}const f=(t-cum[a])/((cum[b]-cum[a])||1);return [P[a].x+(P[b].x-P[a].x)*f,P[a].y+(P[b].y-P[a].y)*f];};
 const NU=700,NV=40, s0=rb[0]-lcu, ds=(rb[2]-rb[0])/NU, N=NU+1;
 // as-bonded arch: clears the side epoxy, the glob and the enclosure's left wall (top 1.6 above the board base)
 const B=[],Ec=[];
 for(let j=0;j<N;j++){const s=s0+j*ds;B.push([-s,yr0+(1.75-yr0)*(sm(2.0,3.7,s)-sm(6.9,11.0,s))]);Ec.push(at(S.cum[S.iB]+s));}
 const ang=P=>{const th=[];for(let j=0;j<N;j++){const a=P[Math.max(0,j-1)],b=P[Math.min(N-1,j+1)];let t=Math.atan2(b[1]-a[1],b[0]-a[0]);if(j){while(t-th[j-1]>Math.PI)t-=2*Math.PI;while(t-th[j-1]<-Math.PI)t+=2*Math.PI;}th.push(t);}return th;};
 const thB=ang(B),thE=ang(Ec), j0=Math.round(-s0/ds);
 const integ=(th,start)=>{const I=new Array(N);I[j0]=start.slice();for(let j=j0;j<N-1;j++){const t=(th[j]+th[j+1])/2;I[j+1]=[I[j][0]+ds*Math.cos(t),I[j][1]+ds*Math.sin(t)];}
  for(let j=j0;j>0;j--){const t=(th[j]+th[j-1])/2;I[j-1]=[I[j][0]-ds*Math.cos(t),I[j][1]-ds*Math.sin(t)];}return I;};
 const I0=integ(thB,B[j0]),I1=integ(thE,Ec[j0]), c0=B.map((p,j)=>[p[0]-I0[j][0],p[1]-I0[j][1]]), c1=Ec.map((p,j)=>[p[0]-I1[j][0],p[1]-I1[j][1]]);
 const rgeo=new THREE.PlaneGeometry(rb[2]-rb[0],rb[3]-rb[1],NU,NV);rgeo.rotateX(-Math.PI/2);rgeo.translate((rb[0]+rb[2])/2,0,-(rb[1]+rb[3])/2);
 const rp=rgeo.attributes.position, col=new Int32Array(rp.count);
 for(let i=0;i<rp.count;i++){col[i]=Math.round((rp.getX(i)-rb[0])/ds);rp.setZ(i,az-(-rp.getZ(i)-lcv));}
 const ribbon=new THREE.Mesh(rgeo,new THREE.MeshStandardMaterial({map:tex('assets/ribbon_tex.png'),alphaTest:.5,side:THREE.DoubleSide,roughness:.6,metalness:.1,envMapIntensity:.25}));
 ribbon.frustumCulled=false; root.add(ribbon);
 const jS=(SPAN-s0)/ds; let lastA=-1;
 function setFlip(a){
  if(a!==lastA){lastA=a;const th=thB.map((t,j)=>t+(thE[j]-t)*a),I=integ(th,[B[j0][0]+(Ec[j0][0]-B[j0][0])*a,B[j0][1]+(Ec[j0][1]-B[j0][1])*a]);
   const P=I.map((p,j)=>[p[0]+(1-a)*c0[j][0]+a*c1[j][0],p[1]+(1-a)*c0[j][1]+a*c1[j][1]]);
   for(let i=0;i<rp.count;i++){const p=P[col[i]];rp.setX(i,EX+p[0]);rp.setY(i,p[1]);}rp.needsUpdate=true;rgeo.computeVertexNormals();
   const k=Math.floor(jS),f=jS-k,px=P[k][0]+(P[k+1][0]-P[k][0])*f,py=P[k][1]+(P[k+1][1]-P[k][1])*f,t=th[k]+(th[k+1]-th[k])*f;
   pg.userData.pose=[EX+px-.035*Math.sin(t),py+.035*Math.cos(t),t-Math.PI];}
  const [x,y,r]=pg.userData.pose;pg.position.set(x,y,pzc);pg.rotation.z=r;
 }

 // ---- epoxy (G-chip photo): black glob over the die, clear epoxy over the side wires
 const epo=new THREE.Group(), ec=new THREE.Group(), eb=new THREE.Group(), eBlack=fadeMat(M.epoxyBlack,M.epoxyBlack.opacity), eClear=fadeMat(M.epoxyClear,M.epoxyClear.opacity);
 eb.add(roundSlab(EX-4.4,EZ-5.3,EX+4.6,EZ+3.6,T,DIE_T+.75,eBlack,1.2)); ec.add(roundSlab(EX-6.0,EZ-3.9,EX-4.3,EZ+3.7,T,DIE_T+.35,eClear,.5),roundSlab(EX+4.5,EZ-3.9,EX+6.05,EZ+3.7,T,DIE_T+.35,eClear,.5));
 epo.add(ec,eb); root.add(epo);

 // ---- enclosure base and insertion holder (EBL512 V3 STEP)
 const baseMat=fadeMat(M.encl), holdMat=fadeMat(M.holder,M.holder.opacity); let base,holder;
 for(const k of Object.keys(E)){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(E[k].p,3));g.setIndex(E[k].i);g.computeVertexNormals();g.rotateX(-Math.PI/2);
  const m=new THREE.Mesh(g,k==='body1'?holdMat:baseMat);m.position.set(EX,-0.4,EZ-0.2);if(k==='body1'){m.renderOrder=6;holder=m;}else base=m;root.add(m);}

 // ---- glue between the board edges and the side walls (the lab: glued only after all bonding). Where the glue goes is assumed.
 const glueMat=fadeMat(new THREE.MeshStandardMaterial({color:0xeee4c8,roughness:.3,metalness:0}),.9), glue=new THREE.Group();
 for(const sx of [-1,1]){const g=new THREE.Mesh(BOX,glueMat);g.scale.set(.22,T+.12,8.4);g.position.set(EX+sx*6.13,(T+.12)/2,EZ+(-4.4+4.0)/2);glue.add(g);} root.add(glue);
 // ---- tungsten wires: one per shank, about 25 um, in the 4 top grooves, then along each shank to the tip (the lab)
 const tipY=(EZ-0.2-pzc)-(pb[3]-PADS_C[1]), WR=.0125, yGw=3.323-0.4+WR+.003, ySh=yP+WR+.002, tMat=new THREE.MeshStandardMaterial({color:0x9aa0a6,roughness:.3,metalness:1});
 const tung=[-0.71,-0.21,0.29,0.79].map((gx,k)=>{const sx=xI+[-0.75,-0.25,0.25,0.75][k];
  const c=new THREE.CatmullRomCurve3([[gx,yGw,3.64],[gx,yGw,-5.2],[gx,yGw-.02,-5.75],[(gx+sx)/2,(yGw+ySh)/2,-6.9],[sx,ySh+.02,-8.0],[sx,ySh,-8.6],[sx,ySh,tipY]].map(([x,y,v])=>new THREE.Vector3(EX+x,y,zE(v))),false,'centripetal');
  const m=new THREE.Mesh(new THREE.TubeGeometry(c,240,WR,6,false),tMat);root.add(m);return m;});

 // ---- step state. reset() = before step 1; each run(e) moves its own parts from e=0 to e=1.
 const cnt=(im,e)=>{im.count=Math.round(im.instanceMatrix.count*e);im.visible=im.count>0;};
 const fade=(mat,e)=>{mat.opacity=mat.userData.o*e;mat.depthWrite=e>.99&&mat.userData.o>=1;};
 function reset(){die.visible=false;wires.geometry.setDrawRange(0,0);[wBalls,wSt,cB1,cTl,cB2,pB1,pTl,pB2].forEach(m=>cnt(m,0));
  pg.visible=false;wafer.visible=true;wafer.scale.y=WAFER_T;fade(wafMat,1);ribbon.visible=false;ribbon.position.y=0;setFlip(0);
  glue.visible=false;epo.visible=true;ec.visible=eb.visible=false;base.visible=holder.visible=false;tung.forEach(m=>{m.visible=false;});}
 // Order (the lab, 16 Nov): epoxy right after the wire bonds; board dry-fit into the enclosure before the ribbon and probe go on; glued only after all bonding.
 const run=[
  e=>{die.visible=true;die.position.y=T+DIE_T/2+4*(1-e);},
  e=>{const k=Math.round(e*W.length);wires.geometry.setDrawRange(0,k*perWire);wBalls.count=wSt.count=k;wBalls.visible=wSt.visible=k>0;},
  e=>{ec.visible=e>0;fade(eClear,e);},
  e=>{base.visible=true;fade(baseMat,Math.min(1,e*1.6));base.position.y=-0.4-5*(1-e);},
  e=>{pg.visible=true;pg.position.x-=10*(1-e);pg.position.y+=3*(1-e)*(1-e);},
  e=>{cnt(cB1,e);cnt(cTl,e);},
  e=>{cnt(pB1,e);cnt(pTl,e);},
  e=>{ribbon.visible=true;ribbon.position.y=2.5*(1-e);},
  e=>{cnt(cB2,e);},
  e=>{cnt(pB2,e);},
  e=>{glue.visible=e>0;fade(glueMat,e);glue.scale.y=Math.max(.01,e);},
  e=>{eb.visible=e>0;fade(eBlack,e);},
  e=>{setFlip(e);},
  e=>{holder.visible=true;fade(holdMat,Math.min(1,e*1.6));holder.position.y=-0.4+4*(1-e);},
  e=>{fade(wafMat,1-e);wafer.scale.y=WAFER_T*(1-.9*e);wafer.visible=e<1;},
  e=>{tung.forEach(m=>{m.visible=e>0;m.geometry.setDrawRange(0,Math.round(e*240)*36);});},
 ];
 root.scale.setScalar(.001);
 const pad=[EX,DT,az], probeNow=()=>[EX-SPAN,DT,pzc+3];
 return {root,reset,run,epo,P:{EX,EZ,T,DT,az,pzc,SPAN,yP,yR,yRoof,xI,tipY,zE,loopTop:1.95+.85*(lo+hi)/2},probeNow};
}
