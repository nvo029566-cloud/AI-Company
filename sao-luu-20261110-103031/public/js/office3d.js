// Văn phòng 3D (isometric, vẽ bằng canvas). Phần nhân vật 3D dùng lại từ extension "Văn phòng AI";
// phần bố cục 12 phòng, huy hiệu, camera và nhấp chuột được viết riêng cho Công ty AI.
// Dữ liệu vào từ trạng thái của máy chủ; tệp này không tự quyết định ai đang làm gì.

/* ---------- màu ---------- */
function hex2rgb(h){h=h.replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]}
function rgb2hex(r,g,b){const c=v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0');return '#'+c(r)+c(g)+c(b)}
function shade(h,f){const [r,g,b]=hex2rgb(h);return rgb2hex(r*f,g*f,b*f)}
function mix(a,b,t){const A=hex2rgb(a),B=hex2rgb(b);return rgb2hex(A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t,A[2]+(B[2]-A[2])*t)}
function rgba(h,a){const [r,g,b]=hex2rgb(h);return 'rgba('+r+','+g+','+b+','+a+')'}
function seeded(seed){let a=(seed>>>0)||1;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const HAIR=['#2b1d16','#6b3f23','#c79a4b','#1f2a44','#8a2f2f','#151515'];
const SKIN=['#f0c9a4','#d9a67c','#b57b57','#f5d6bb'];
const PANTS=['#2b3945','#3b3f4a','#5a6270','#7a6a58','#2f3d4d'];
const STYLES=['short','short','short','long','long','bun'];

export const RD = 6;
const TW = 64, TH = 32, WH = 56;
const FONT = '"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif';
// Mỗi phòng: [x, hàng, rộng]. Phòng Nghiên cứu (10 người) và phòng CEO rộng gấp đôi.
export const LAYOUT = {
  '01': [1, 0, 7], '02': [11, 0, 7], '03': [21, 0, 7],
  '04': [1, 1, 17], '05': [21, 1, 7],
  '06': [1, 2, 7], '07': [11, 2, 7], '08': [21, 2, 7],
  '09': [1, 3, 7], '10': [11, 3, 7], '11': [21, 3, 7],
  '12': [1, 4, 7], CEO: [11, 4, 17]
};
export const GW = 29, GD = 39;
const SHIRTS = ['#f4f6f7', '#2b3945', '#4a6fa5', '#7a9a78', '#b5524a', '#cfc7b8', '#33495a', '#6b5b95', '#c9a24a'];

// Vị trí bàn theo số người. Phần tử thứ ba = chỗ của trưởng phòng.
export function deskSpots(n, w) {
  if (w >= 17) {                                   // phòng rộng: hai dãy bàn
    const per = Math.ceil(n / 2), out = [];
    for (let i = 0; i < n; i++) {
      const row = i < per ? 0 : 1, k = row ? i - per : i, cnt = row ? n - per : per;
      out.push([w / 2 - (cnt - 1) * 1.65 + k * 3.3, row ? 4.1 : 1.8, i === Math.floor(per / 2)]);
    }
    return out;
  }
  const S = {
    1: [[3.5, 1.9, 1]],
    2: [[1.9, 1.8, 1], [5.1, 1.8]],
    3: [[3.5, 1.8, 1], [1.9, 3.7], [5.1, 3.7]],
    4: [[3.5, 1.8, 1], [1.3, 3.3], [5.7, 3.3], [3.5, 4.8]],
    5: [[3.5, 1.4, 1], [1.3, 3.0], [5.7, 3.0], [1.3, 4.8], [5.7, 4.8]]
  };
  return S[n] || S[5].slice(0, n);
}

export function createOffice3D(cv, opts) {
  const ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const iso = (x, y, z) => [(x - y) * TW / 2, (x + y) * TH / 2 - (z || 0)];
  let rnd = Math.random;
const pick=a=>a[Math.floor(rnd()*a.length)];
function mk(x,y,o){return Object.assign({x:x,y:y,z:0,t:rnd()*10,path:[],walking:false,sitting:false,jump:0,bubble:null,hair:pick(HAIR),skin:pick(SKIN),color:'#888',holding:false,onArrive:null,ang:Math.PI/2,pants:pick(PANTS),shoe:pick(['#1e252b','#33261f','#e9edef']),style:pick(STYLES),glasses:rnd()<0.28,ox:0},o||{})}

  /* ---------- hình khối cơ bản (lấy từ extension) ---------- */
function poly(p,fill,stroke,lw){
  ctx.beginPath(); p.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1])); ctx.closePath();
  if(fill){ctx.fillStyle=fill;ctx.fill()}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw||1;ctx.stroke()}
}
function floor(x,y,w,d,fill,stroke){poly([iso(x,y),iso(x+w,y),iso(x+w,y+d),iso(x,y+d)],fill,stroke)}
function box(x,y,w,d,h,z0,top,left,right){
  const z1=z0+h;
  poly([iso(x,y+d,z0),iso(x+w,y+d,z0),iso(x+w,y+d,z1),iso(x,y+d,z1)],left);
  poly([iso(x+w,y,z0),iso(x+w,y+d,z0),iso(x+w,y+d,z1),iso(x+w,y,z1)],right);
  poly([iso(x,y,z1),iso(x+w,y,z1),iso(x+w,y+d,z1),iso(x,y+d,z1)],top);
}
function bx(x,y,w,d,h,z0,c){box(x,y,w,d,h,z0,c,shade(c,.86),shade(c,.72))}
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function circ(x,y,r,f){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=f;ctx.fill()}

  let now = 0, ready = false;
  const ROOMS = [], agents = [], particles = [];
  const view = { s: 1, dpr: 1, w: 800, h: 500, oy: 0 };
  const cam = { z: 1, x: 0, y: 0, tz: 1, tx: 0, ty: 0, room: null };

  /* ---------- nhân vật 3D (lấy từ extension) ---------- */
/* ===== Nhân vật 3D: bộ xương khớp nối, chiếu isometric ===== */
const KM=34, CH=1.15;
const DIM={hipW:.10*CH,shW:.205*CH,thigh:.45*CH,shin:.45*CH,torso:.52*CH,neck:.09*CH,headR:.118*CH,upA:.30*CH,foreA:.27*CH,ank:.07,footL:.2*CH};
const VIEW=[0.5,0.5,0.72];
const overlay=[];
function P3(p){return iso(p[0],p[1],p[2]*KM)}
function A3(a,b){return [a[0]+b[0],a[1]+b[1],a[2]+b[2]]}
function seg(f,ang,L){const s=Math.sin(ang)*L;return [f[0]*s,f[1]*s,-Math.cos(ang)*L]}
function dep(p){return p[0]+p[1]+0.55*p[2]}
function pal(c){return {d:shade(c,.68),m:c,l:shade(c,1.2)}}
function look(a){
  if(!a._L)a._L={shirt:pal(a.color),pants:pal(a.pants),skin:pal(a.skin),shoe:pal(a.shoe),hair:a.hair,hairD:shade(a.hair,.7)};
  return a._L;
}
function cap(p,q,w,col){
  const a=P3(p),b=P3(q),ww=w*KM;
  ctx.lineCap='round';
  ctx.strokeStyle=col.d;ctx.lineWidth=ww+1.6;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
  ctx.strokeStyle=col.m;ctx.lineWidth=ww;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
  ctx.strokeStyle=col.l;ctx.lineWidth=Math.max(1,ww*.3);ctx.beginPath();ctx.moveTo(a[0]-ww*.18,a[1]-ww*.18);ctx.lineTo(b[0]-ww*.18,b[1]-ww*.18);ctx.stroke();
}
function humanPose(a,r){
  const t=a.t,work=!!a.work;
  let mode,lean=0.05,spread=0.05;
  const th=[0,0],kn=[0,0],sh=[0,0],el=[0,0];
  if(a.walking){
    mode='walk';lean=0.1;spread=0.03;
    for(let i=0;i<2;i++){const p=t*8.5*(a.speed?Math.min(2,a.speed/2.7):1)+i*Math.PI;th[i]=0.42*Math.sin(p);kn[i]=0.1+0.75*Math.max(0,Math.cos(p));sh[i]=-0.4*Math.sin(p);el[i]=0.3}
  }else if(a.sitting){
    mode='sit';lean=0.08;spread=0;
    for(let i=0;i<2;i++){th[i]=Math.PI/2;kn[i]=Math.PI/2;sh[i]=0.55;el[i]=work?1.15+0.16*Math.sin(t*17+i*1.9):1.1+0.03*Math.sin(t*1.5+i)}
  }else if(a.jump>0){
    mode='cheer';lean=-0.04;spread=0.3;
    for(let i=0;i<2;i++){th[i]=0.12*(i?1:-1);kn[i]=0.25+0.2*Math.abs(Math.sin(t*9));sh[i]=2.5+0.35*Math.sin(t*11+i*2);el[i]=0.2+0.2*Math.sin(t*11+i)}
  }else{
    mode='stand';spread=0.07;
    th[0]=0.03;th[1]=-0.03;kn[0]=0.05;kn[1]=0.1;
    for(let i=0;i<2;i++){sh[i]=0.08+0.03*Math.sin(t*2+i);el[i]=0.2}
  }
  if(a.holding&&mode!=='sit'){sh[0]=0.8;el[0]=1.05}
  return {mode:mode,lean:lean,spread:spread,th:th,kn:kn,sh:sh,el:el,work:work};
}
function drawHead(a,L,Hc,f,s){
  const rm=DIM.headR,r=rm*KM,h=P3(Hc),hx=h[0],hy=h[1];
  const facing=f[0]*VIEW[0]+f[1]*VIEW[1];
  const style=a.style;
  const Hh=[Hc[0]-f[0]*rm*0.28,Hc[1]-f[1]*rm*0.28,Hc[2]+rm*0.22];
  const hh=P3(Hh);
  const hairFirst=dep(Hh)<dep(Hc);
  const hairBack=()=>{
    ctx.fillStyle=L.hair;
    if(style==='long'){
      const e=P3([Hc[0]-f[0]*rm*0.85,Hc[1]-f[1]*rm*0.85,Hc[2]-rm*2.0]);
      ctx.lineCap='round';ctx.strokeStyle=L.hair;ctx.lineWidth=r*1.6;
      ctx.beginPath();ctx.moveTo(hh[0],hh[1]);ctx.lineTo(e[0],e[1]);ctx.stroke();
    }
    ctx.fillStyle=L.hair;ctx.beginPath();ctx.arc(hh[0],hh[1],r*1.08,0,Math.PI*2);ctx.fill();
    if(style==='bun'){const b=P3([Hc[0]-f[0]*rm*0.6,Hc[1]-f[1]*rm*0.6,Hc[2]+rm*1.0]);circ(b[0],b[1],r*0.42,L.hair)}
  };
  if(hairFirst)hairBack();
  const g=ctx.createRadialGradient(hx-r*.35,hy-r*.4,r*.1,hx,hy,r*1.05);
  g.addColorStop(0,L.skin.l);g.addColorStop(1,L.skin.d);
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(hx,hy,r,0,Math.PI*2);ctx.fill();
  if(facing>0.05){
    const eyes=[];
    [-1,1].forEach(sd=>{
      const E=[Hc[0]+f[0]*rm*0.82+s[0]*sd*rm*0.36,Hc[1]+f[1]*rm*0.82+s[1]*sd*rm*0.36,Hc[2]+rm*0.08];
      const n=[E[0]-Hc[0],E[1]-Hc[1],E[2]-Hc[2]],nl=Math.hypot(n[0],n[1],n[2]);
      if((n[0]*VIEW[0]+n[1]*VIEW[1]+n[2]*VIEW[2])/nl>0.08){
        const e=P3(E);eyes.push(e);
        circ(e[0],e[1],Math.max(1,r*0.11),'#1b2a31');
        ctx.strokeStyle=L.hairD;ctx.lineWidth=Math.max(.8,r*0.07);ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(e[0]-r*.17,e[1]-r*.2);ctx.lineTo(e[0]+r*.17,e[1]-r*.24);ctx.stroke();
      }
    });
    const nose=P3([Hc[0]+f[0]*rm*1.0,Hc[1]+f[1]*rm*1.0,Hc[2]-rm*0.12]);
    circ(nose[0],nose[1],Math.max(.8,r*0.09),'rgba(120,70,55,.35)');
    const M=P3([Hc[0]+f[0]*rm*0.86,Hc[1]+f[1]*rm*0.86,Hc[2]-rm*0.44]);
    ctx.strokeStyle='#9c4f45';ctx.lineWidth=Math.max(.8,r*0.08);
    ctx.beginPath();ctx.moveTo(M[0]-r*.2,M[1]-r*.02);ctx.quadraticCurveTo(M[0],M[1]+r*.16,M[0]+r*.2,M[1]-r*.02);ctx.stroke();
    if(a.glasses&&eyes.length===2){
      ctx.strokeStyle='#26323b';ctx.lineWidth=Math.max(.8,r*0.07);
      eyes.forEach(e=>{ctx.beginPath();ctx.arc(e[0],e[1],r*0.27,0,Math.PI*2);ctx.stroke()});
      ctx.beginPath();ctx.moveTo(eyes[0][0]+r*.27,eyes[0][1]);ctx.lineTo(eyes[1][0]-r*.27,eyes[1][1]);ctx.stroke();
    }
  }
  if(!hairFirst)hairBack();
  if(facing>0.05&&style!=='bald'){
    ctx.fillStyle=L.hair;ctx.beginPath();ctx.arc(hx,hy,r*1.04,Math.PI*1.08,Math.PI*1.92);ctx.closePath();ctx.fill();
  }
  return [hx,hy,r];
}
function drawHuman(a,r,layer){
  const D=DIM,L=look(a),pose=humanPose(a,r);
  let ang=a.ang;if(pose.mode==='sit')ang=Math.PI/2;
  const f=[Math.cos(ang),Math.sin(ang)],s=[-f[1],f[0]];
  const px=a.x+(a.ox||0),py=a.y,zoff=(a.z||0)/KM;
  const legz=i=>-Math.cos(pose.th[i])*D.thigh-Math.cos(pose.th[i]-pose.kn[i])*D.shin;
  let zp=pose.mode==='sit'?0.6:D.ank-Math.min(legz(0),legz(1));
  zp+=zoff;
  const pel=[px,py,zp],side=[-1,1];
  const hip=side.map(sd=>[px+s[0]*sd*D.hipW,py+s[1]*sd*D.hipW,zp]);
  const knee=hip.map((h,i)=>A3(h,seg(f,pose.th[i],D.thigh)));
  const ank=knee.map((k,i)=>A3(k,seg(f,pose.th[i]-pose.kn[i],D.shin)));
  const toe=ank.map(p=>[p[0]+f[0]*D.footL,p[1]+f[1]*D.footL,p[2]-0.035]);
  const heel=ank.map(p=>[p[0]-f[0]*0.05,p[1]-f[1]*0.05,p[2]-0.03]);
  const ls=Math.sin(pose.lean)*D.torso,lc=Math.cos(pose.lean)*D.torso;
  const Sc=[px+f[0]*ls,py+f[1]*ls,zp+lc];
  const sho=side.map(sd=>[Sc[0]+s[0]*sd*D.shW,Sc[1]+s[1]*sd*D.shW,Sc[2]-0.02]);
  const elb=sho.map((p,i)=>{const q=A3(p,seg(f,pose.sh[i],D.upA)),o=pose.spread*side[i]*D.upA;return [q[0]+s[0]*o,q[1]+s[1]*o,q[2]]});
  const hand=elb.map((p,i)=>{const q=A3(p,seg(f,pose.sh[i]+pose.el[i],D.foreA)),o=pose.spread*side[i]*D.foreA*0.8;return [q[0]+s[0]*o,q[1]+s[1]*o,q[2]]});
  const Hc=[Sc[0]+f[0]*0.03,Sc[1]+f[1]*0.03,Sc[2]+D.neck+D.headR*0.95];

  if(layer!=='upper'&&pose.mode!=='sit'){
    const g=iso(px,py,0);
    ctx.fillStyle='rgba(20,35,45,'+(0.17*Math.max(0.3,1-(a.z||0)/20))+')';
    ctx.beginPath();ctx.ellipse(g[0],g[1]+1,11,5,0,0,Math.PI*2);ctx.fill();
  }
  const parts=[],push=(p,fn)=>parts.push({d:dep(p),fn:fn});
  if(layer!=='upper'){
    for(let i=0;i<2;i++){
      push(knee[i],()=>cap(hip[i],knee[i],0.15*CH,L.pants));
      push(ank[i],()=>cap(knee[i],ank[i],0.115*CH,L.pants));
      push(toe[i],()=>cap(heel[i],toe[i],0.095*CH,L.shoe));
    }
    push(pel,()=>cap(hip[0],hip[1],0.17*CH,L.pants));
    push(Sc,()=>{
      const pts=[sho[0],sho[1],hip[1],hip[0]].map(P3),w=0.17*CH*KM;
      ctx.lineJoin='round';
      ctx.beginPath();pts.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.closePath();
      ctx.strokeStyle=L.shirt.d;ctx.lineWidth=w+1.6;ctx.stroke();
      ctx.strokeStyle=L.shirt.m;ctx.lineWidth=w;ctx.stroke();ctx.fillStyle=L.shirt.m;ctx.fill();
      if(f[0]*VIEW[0]+f[1]*VIEW[1]>0.05){
        const c0=P3([Sc[0]+f[0]*0.09,Sc[1]+f[1]*0.09,Sc[2]-0.03]);
        if(a.lead){
          const c1=P3([pel[0]+f[0]*0.1+f[0]*ls*0.4,pel[1]+f[1]*0.1+f[1]*ls*0.4,pel[2]+0.2]);
          ctx.strokeStyle='#26333b';ctx.lineWidth=2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(c0[0],c0[1]);ctx.lineTo(c1[0],c1[1]);ctx.stroke();
        }else{
          const c1=P3([Sc[0]+f[0]*0.09,Sc[1]+f[1]*0.09,Sc[2]-0.12]);
          ctx.strokeStyle=L.shirt.d;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(c0[0]-3,c0[1]-1);ctx.lineTo(c1[0],c1[1]);ctx.lineTo(c0[0]+3,c0[1]-1);ctx.stroke();
        }
      }
    });
    parts.push({d:dep(Hc)-0.25,fn:()=>cap([Sc[0],Sc[1],Sc[2]-0.02],[Hc[0],Hc[1],Hc[2]-D.headR*0.6],0.07*CH,L.skin)});
    let hp=null;
    push(Hc,()=>{hp=drawHead(a,L,Hc,f,s)});
    parts.push({d:1e9,fn:()=>{
      const hh=P3(Hc);
      if(a.bubble&&a.bubble.until>now)overlay.push({kind:'bubble',text:a.bubble.text,x:hh[0],y:hh[1]-D.headR*KM-2});
      if(pose.work&&a.sitting)overlay.push({kind:'dots',x:hh[0],y:hh[1]-D.headR*KM-2});
      if(a.name&&cam.z>1.5&&a.room&&cam.room===a.room){const ff=iso(px,py,0);overlay.push({kind:'name',text:a.name,x:ff[0],y:ff[1]+(pose.mode==='sit'?24:14)})}
    }});
  }
  if(layer!=='lower'){
    for(let i=0;i<2;i++){
      push(elb[i],()=>cap(sho[i],elb[i],0.105*CH,L.shirt));
      push(hand[i],()=>{cap(elb[i],hand[i],0.085*CH,L.skin);const h=P3(hand[i]);circ(h[0],h[1],0.052*CH*KM,L.skin.m)});
    }
    if(a.holding)parts.push({d:dep(hand[0])+0.1,fn:()=>{
      const h=P3(hand[0]);
      ctx.fillStyle='#fff';ctx.strokeStyle='#8fa2ad';ctx.lineWidth=1;rr(h[0]-5,h[1]-10,11,14,1.5);ctx.fill();ctx.stroke();
      ctx.fillStyle='#8fa2ad';ctx.fillRect(h[0]-3,h[1]-7,7,1);ctx.fillRect(h[0]-3,h[1]-4,7,1);
    }});
  }
  parts.sort((x,y)=>x.d-y.d);
  parts.forEach(p=>p.fn());
}
function drawChair(x,y){
  const g=iso(x,y,0);
  ctx.fillStyle='rgba(20,35,45,.16)';ctx.beginPath();ctx.ellipse(g[0],g[1]+1,17,7,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#2e3a42';ctx.lineWidth=2.2;ctx.lineCap='round';
  [[0.28,0],[-0.28,0],[0,0.28],[0,-0.28]].forEach(d=>{const a=iso(x,y,3),b=iso(x+d[0],y+d[1],1.2);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke()});
  bx(x-0.04,y-0.04,0.08,0.08,10,3,'#2e3a42');
  box(x-0.27,y-0.36,0.54,0.08,17,15.5,'#46606c','#3a505b','#2e434c');
  box(x-0.27,y-0.27,0.54,0.54,3.2,12.3,'#587887','#46606c','#3a505b');
}
  // Chữ và biểu tượng giao diện: giữ kích thước dễ đọc trên màn hình dù cảnh đang thu nhỏ hay phóng to.
  function ui(x, y, fn) {
    const u = Math.min(1.3, 0.92 * Math.pow(cam.z, 0.3)), k = u / (view.s * cam.z);
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k); fn(); ctx.restore();
  }

  /* ---------- bàn làm việc ---------- */
function drawDesk(dk,r){
  const w=1.6,d=0.9,x=dk.cx-w/2,y=dk.cy-d/2,T=25;
  bx(x+0.06,y+0.06,0.07,d-0.12,T,0,'#6f5a3c');
  bx(x+w-0.13,y+0.06,0.07,d-0.12,T,0,'#6f5a3c');
  box(x,y,w,d,2.2,T,'#e6c58d','#cfab72','#bb9863');
  const on=!!dk.agent.work, top=T+2.2;
  bx(dk.cx-0.04,dk.cy+0.12,0.08,0.06,4,top,'#26333b');
  bx(dk.cx-0.36,dk.cy+0.14,0.72,0.05,15,top+3,'#32434e');
  const led=iso(dk.cx+0.28,dk.cy+0.2,top+16);
  circ(led[0],led[1],1.7,on?'#5cf2c4':'#7b8c95');
  if(on){const g=iso(dk.cx,dk.cy+0.18,top+10);circ(g[0],g[1],17,rgba(r.color,.16))}
  poly([iso(dk.cx-0.3,dk.cy-0.34,top+0.3),iso(dk.cx+0.2,dk.cy-0.34,top+0.3),iso(dk.cx+0.2,dk.cy-0.17,top+0.3),iso(dk.cx-0.3,dk.cy-0.17,top+0.3)],'#f3f6f7','#aebbc2',.6);
  poly([iso(dk.cx+0.3,dk.cy-0.3,top+0.3),iso(dk.cx+0.37,dk.cy-0.3,top+0.3),iso(dk.cx+0.37,dk.cy-0.2,top+0.3),iso(dk.cx+0.3,dk.cy-0.2,top+0.3)],'#dfe6e9','#aebbc2',.6);
  bx(dk.cx-0.62,dk.cy+0.05,0.1,0.1,4.5,top,'#f2f2f2');
}

  /* ---------- dựng văn phòng từ dữ liệu ---------- */
  function build() {
    ROOMS.length = 0; agents.length = 0; particles.length = 0;
    for (const d of opts.depts()) {
      const L = LAYOUT[d.code];
      if (L) ROOMS.push({ code: d.code, name: d.name, color: d.color, x: L[0], y: L[1] * 8, w: L[2], d: RD, desks: [], total: d.total, work: 0, progress: 0, queued: 0, flash: 0 });
    }
    ROOMS.push({ code: 'CEO', name: 'CEO (bạn)', color: '#6d5ef0', x: LAYOUT.CEO[0], y: LAYOUT.CEO[1] * 8, w: LAYOUT.CEO[2], d: RD, desks: [], total: 1, work: 0, progress: 0, queued: 0, flash: 0, ceo: true });
    const all = opts.agents();
    for (const r of ROOMS) {
      const list = r.ceo ? [{ id: -1, name: 'CEO (bạn)', isLead: true, ceo: true }] : all.filter(a => a.deptCode === r.code);
      const spots = deskSpots(list.length, r.w);
      const leadIdx = Math.max(0, spots.findIndex(s => s[2]));
      const lead = list.find(a => a.isLead) || list[0], rest = list.filter(a => a !== lead);
      spots.forEach((s, i) => {
        const ag = i === leadIdx ? lead : rest.shift();
        if (!ag) return;
        rnd = seeded((ag.id > 0 ? ag.id : 99) * 7919 + 13);          // ngoại hình cố định theo từng người
        const cx = r.x + s[0], cy = r.y + s[1];
        const a = mk(cx, cy - 0.75, {
          sitting: true, lead: !!s[2], room: r, home: { x: cx, y: cy - 0.75 }, deskD: cx + cy, name: ag.name, ref: ag, work: false,
          color: ag.ceo ? '#2b2f4a' : mix(pick(SHIRTS), r.color, 0.18), nextSay: 6 + Math.random() * 40
        });
        rnd = Math.random;
        agents.push(a); r.desks.push({ cx, cy, agent: a });
      });
    }
    sync();
  }

  // Đọc lại trạng thái hiện tại: ai đang làm, tiến độ và hàng chờ của từng phòng.
  function sync() {
    for (const d of opts.depts()) { const r = ROOMS.find(x => x.code === d.code); if (r) { r.work = d.working; r.total = d.total; } }
    const st = new Map(opts.agents().map(a => [a.id, a.status]));
    for (const a of agents) if (a.ref && a.ref.id > 0) { const s = st.get(a.ref.id) || 'idle'; a.work = s === 'working' || s === 'reviewing'; }
    for (const r of ROOMS) { r.progress = 0; r.queued = 0; }
    for (const run of (opts.sim()?.runs || [])) for (const it of run.items) {
      const r = ROOMS.find(x => x.code === it.dept); if (!r) continue;
      if (it.state === 'working') r.progress = Math.max(r.progress, it.progress); else if (it.state === 'queued') r.queued++;
    }
  }

  /* ---------- camera ---------- */
  function camTo(room) {
    if (!room) { cam.tz = 1; cam.tx = (GW - GD) * 16; cam.ty = (view.h / 2 - view.oy) / view.s; cam.room = null; }
    else {
      const c = iso(room.x + room.w / 2, room.y + room.d / 2, 12);
      cam.tx = c[0]; cam.ty = c[1]; cam.room = room;
      const rw = (room.w + room.d) * 32 + 90, rh = (room.w + room.d) * 16 + 150;
      cam.tz = Math.min(3.4, 0.9 * view.w / (rw * view.s), 0.9 * view.h / (rh * view.s));
    }
    opts.onZoom?.(room);
  }
  function resize() {
    const r = cv.parentElement.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (r.width < 2 || r.height < 2) return;          // chưa gắn vào trang hoặc đang ẩn
    cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr);
    view.dpr = dpr; view.w = r.width; view.h = r.height;
    const WW = (GW + GD) * 32 + 180, HH = (GW + GD) * 16 + 112;   // chừa lề cho huy hiệu ở hai góc
    view.s = Math.min(r.width / WW, r.height / HH);
    view.oy = (r.height - HH * view.s) / 2 + 70 * view.s;
    camTo(cam.room);
    if (!ready) { ready = true; cam.x = cam.tx; cam.y = cam.ty; cam.z = cam.tz; }   // lần đầu: đặt camera ngay, không trượt từ số 0
  }

  /* ---------- ánh sáng ngày / đêm ---------- */
  let lightMode = 'auto', lastNight = null;
  function lightLevel() {
    if (lightMode === 'day') return 0; if (lightMode === 'night') return 1;
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    if (h >= 19.5 || h < 5.5) return 1; if (h >= 17.5) return (h - 17.5) / 2; if (h < 7) return 1 - (h - 5.5) / 1.5; return 0;
  }
  function applyLight() {
    const L = lightLevel(), night = L > 0.5;
    if (night !== lastNight) { lastNight = night; cv.parentElement.classList.toggle('night', night); }
    if (L <= 0.01) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(22,34,84,' + (0.40 * L).toFixed(3) + ')'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';              // phòng đang có người làm sáng đèn
    ROOMS.forEach(r => { if (r.work > 0) floor(r.x, r.y, r.w, r.d, 'rgba(255,190,110,' + (0.16 * L).toFixed(3) + ')'); });
    ctx.restore();
  }

  /* ---------- các phần của cảnh ---------- */
  function drawBase() {
    box(0, 0, GW, GD, 10, -10, '#eef3f4', '#c3cfd5', '#aebbc2');
    floor(0, 0, GW, GD, '#e3eaed');
    for (let k = 0; k < 4; k++) floor(0, k * 8 + 6, GW, 2, '#d9e2e6');   // lối đi giữa các hàng phòng
    floor(8, 0, 3, GD, '#d9e2e6'); floor(18, 0, 3, GD, '#d9e2e6');       // lối đi giữa các cột
  }
  function drawRoomFloor(r) {
    floor(r.x, r.y, r.w, r.d, r.ceo ? '#dcd3ee' : '#e9dec3', r.ceo ? '#b9aedc' : '#cdbf9d');
    floor(r.x + 0.6, r.y + 0.9, r.w - 1.2, r.d - 1.5, mix(r.color, '#ffffff', r.ceo ? 0.78 : 0.62));
    floor(r.x + r.w / 2 - 0.7, r.y + r.d - 0.12, 1.4, 0.12, mix(r.color, '#ffffff', 0.2));
    if (r.flash > now) floor(r.x, r.y, r.w, r.d, rgba('#8b7dff', Math.min(0.32, (r.flash - now) * 0.18)));   // vừa nhận việc
  }
  // Tường chia từng đoạn ngắn để sắp thứ tự vẽ đúng ngay cả với phòng rộng.
  function wallItems(r, items) {
    const x0 = r.x, y0 = r.y, segs = Math.ceil(r.w / 3.5);
    items.push({ d: x0 + y0 + r.d / 2, f: () => box(x0 - 0.22, y0, 0.22, r.d, WH * 0.8, 0, '#f4f7f8', '#dfe7ea', '#cfd9de') });
    for (let i = 0; i < segs; i++) {
      const a = x0 + (r.w / segs) * i, b = x0 + (r.w / segs) * (i + 1), first = i === 0;
      items.push({ d: (a + b) / 2 + y0 + 0.3, f: () => box(first ? a - 0.22 : a, y0 - 0.22, (b - a) + (first ? 0.22 : 0), 0.22, WH, 0, '#f4f7f8', '#dfe7ea', '#cfd9de') });
    }
    const n = Math.floor((r.w - 0.5) / 2.1);
    for (let i = 0; i < n; i++) {
      const a = x0 + 0.5 + i * 2.1, b = a + 1.8;
      items.push({ d: (a + b) / 2 + y0 + 0.35, f: () => {
        poly([iso(a, y0, 16), iso(b, y0, 16), iso(b, y0, 46), iso(a, y0, 46)], '#1f2d36', '#3a4b55', 1);
        const w = r.work > 0;
        ctx.beginPath();
        for (let k = 0; k <= 12; k++) {
          const u = k / 12, xx = a + 0.1 + u * 1.6;
          const v = w ? 31 + Math.sin(u * 7 + now * 5 + i * 2) * 8 + Math.sin(u * 17 + now * 8) * 2.5 : 31 + Math.sin(u * 5 + i) * 2;
          const p = iso(xx, y0, v); k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
        }
        ctx.strokeStyle = w ? r.color : '#5d727d'; ctx.lineWidth = 1.6; ctx.stroke();
        if (w) { ctx.strokeStyle = rgba(r.color, 0.35); ctx.lineWidth = 1; ctx.beginPath(); for (let k = 0; k < 3; k++) { const p = iso(a + 0.15, y0, 21 + k * 6), q = iso(b - 0.15, y0, 21 + k * 6); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); } ctx.stroke(); }
      } });
    }
  }
  function drawPlant(x, y) {
    bx(x - 0.25, y - 0.25, 0.5, 0.5, 8, 0, '#b9c6cc');
    const p = iso(x, y, 8);
    circ(p[0] - 6, p[1] - 8, 7, '#2f8a5e'); circ(p[0] + 6, p[1] - 7, 7, '#287a53'); circ(p[0], p[1] - 16, 8.5, '#38a06e');
  }
  function drawBoardTable(r) {                 // bàn họp trong phòng CEO
    const x = r.x + 3.2, y = r.y + 3.3;
    bx(x, y, 4.6, 1.4, 3, 18, '#b99e72'); bx(x + 0.2, y + 0.2, 0.2, 0.2, 18, 0, '#6f5a3c'); bx(x + 4.2, y + 0.2, 0.2, 0.2, 18, 0, '#6f5a3c');
    bx(x + 0.2, y + 1.0, 0.2, 0.2, 18, 0, '#6f5a3c'); bx(x + 4.2, y + 1.0, 0.2, 0.2, 18, 0, '#6f5a3c');
  }
  const PLANTS = [];
  for (const y of [7, 15, 23, 31]) for (const x of [9.5, 19.5]) PLANTS.push([x, y]);

  /* ---------- lớp chữ phủ ---------- */
  function drawOverlay() {
    overlay.forEach(o => {
      if (o.kind === 'dots') ui(o.x, o.y, () => { for (let i = 0; i < 3; i++) { const ph = (Math.sin(now * 6 - i * 0.9) + 1) / 2; circ(-6 + i * 6, -8, 1.9, 'rgba(31,45,54,' + (0.25 + ph * 0.7) + ')'); } });
      else if (o.kind === 'name') ui(o.x, o.y, () => {
        ctx.font = '600 11px ' + FONT;
        const tw = ctx.measureText(o.text).width + 12;
        ctx.fillStyle = 'rgba(23,41,48,.78)'; rr(-tw / 2, 0, tw, 16, 8); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.text, 0, 8.5);
      });
      else ui(o.x, o.y, () => {
        ctx.font = '600 13px ' + FONT;
        const tw = ctx.measureText(o.text).width + 14;
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#9fb1ba'; ctx.lineWidth = 1;
        rr(-tw / 2, -26, tw, 20, 8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#1b2a31'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.text, 0, -16);
      });
    });
  }
  function drawBadge(r) {
    const p0 = iso(r.x + r.w / 2, r.y - 0.1, WH + 22);
    ui(p0[0], p0[1], () => {
      ctx.font = '700 14px ' + FONT;
      const nameW = ctx.measureText(r.name).width, h = 26;
      const w = Math.max(r.ceo ? 118 : 150, nameW + (r.ceo ? 52 : 112)), L = -w / 2;
      const hot = r.flash > now, on = r.work > 0;
      ctx.fillStyle = 'rgba(23,41,48,.93)'; rr(L, -h / 2, w, h, 13); ctx.fill();
      if (hot) { ctx.strokeStyle = rgba('#a99dff', Math.min(1, (r.flash - now) * 0.8)); ctx.lineWidth = 2.5; rr(L - 1, -h / 2 - 1, w + 2, h + 2, 14); ctx.stroke(); }
      circ(L + 14, 0, 5, hot ? '#a99dff' : (on ? '#35d0a0' : '#8aa0a8'));
      let tx = L + 26;
      if (!r.ceo) {
        ctx.fillStyle = r.color; rr(tx, -8, 24, 16, 5); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '700 11px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r.code, tx + 12, 1);
        tx += 30;
      }
      ctx.fillStyle = '#fff'; ctx.font = '700 14px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(r.name, tx, 1);
      if (!r.ceo) {
        ctx.font = '600 12px ' + FONT; ctx.textAlign = 'right';
        ctx.fillStyle = on ? '#7fe6c4' : '#8aa0a8';
        ctx.fillText((r.queued ? '+' + r.queued + '  ' : '') + r.work + '/' + r.total, w / 2 - 12, 1);
      }
      if (on) {
        const bw = w - 12, bxp = -bw / 2, byp = h / 2 + 4;
        ctx.fillStyle = 'rgba(23,41,48,.5)'; rr(bxp, byp, bw, 6, 3); ctx.fill();
        if (r.progress > 0.02) { ctx.fillStyle = r.color; rr(bxp, byp, Math.max(6, bw * r.progress), 6, 3); ctx.fill(); }
      }
    });
  }

  /* ---------- hiệu ứng ---------- */
  const say = (a, t, s) => { a.bubble = { text: t, until: now + (s || 1.6) }; };
  function confetti(r, n) {
    if (reduce) return;
    const c = iso(r.x + r.w / 2, r.y + 3, 30), cols = ['#ffd54a', '#ff6b6b', '#4cd3b5', '#6aa2ff', '#c98bff', '#ffffff'];
    for (let i = 0; i < (n || 70); i++) {
      const ang = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 190;
      particles.push({ x: c[0], y: c[1], vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 170, c: cols[Math.floor(Math.random() * cols.length)], life: 1.8 + Math.random() * 0.8, s: 3 + Math.random() * 3, rot: Math.random() * 6 });
    }
  }
  function handoff(ev) {
    const r = ROOMS.find(x => x.code === ev.to) || (ev.to === 'CEO' ? ROOMS.find(x => x.ceo) : null);
    if (!r) return;
    r.flash = now + 1.8;
    const who = r.desks[0]?.agent;
    if (who && !ev.delivered) say(who, '📥', 1.6);
    if (ev.delivered) { confetti(r, 90); if (who) say(who, '🎉', 2.4); }
  }

  /* ---------- mô phỏng chuyển động & vẽ ---------- */
  const EMOJI_IDLE = ['☕', '💭', '📱', '🙂'];
  function tick(dt) {
    now += dt;
    const kz = Math.min(1, dt * 5); cam.z += (cam.tz - cam.z) * kz; cam.x += (cam.tx - cam.x) * kz; cam.y += (cam.ty - cam.y) * kz;
    for (const a of agents) {
      a.t += dt;
      if (!a.work && now > a.nextSay) { a.nextSay = now + 18 + Math.random() * 40; if (Math.random() < 0.7) say(a, EMOJI_IDLE[Math.floor(Math.random() * EMOJI_IDLE.length)], 2); }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt; p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 8;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }
  function render() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const kk = view.dpr * view.s * cam.z;
    ctx.setTransform(kk, 0, 0, kk, view.dpr * view.w / 2 - cam.x * kk, view.dpr * view.h / 2 - cam.y * kk);
    drawBase();
    ROOMS.forEach(drawRoomFloor);
    overlay.length = 0;
    const items = [];
    ROOMS.forEach(r => {
      wallItems(r, items);
      r.desks.forEach(dk => items.push({ d: dk.cx + dk.cy, f: () => drawDesk(dk, r) }));
      if (r.ceo) items.push({ d: r.x + 3.2 + r.y + 3.3 + 2.3, f: () => drawBoardTable(r) });
    });
    agents.forEach(a => {
      const r = a.room;
      items.push({ d: a.x + a.y + 0.3, f: () => drawHuman(a, r, 'lower') });
      items.push({ d: a.deskD + 0.05, f: () => drawHuman(a, r, 'upper') });
      items.push({ d: a.home.x + a.home.y - 0.02, f: () => drawChair(a.home.x, a.home.y) });
    });
    PLANTS.forEach(p => items.push({ d: p[0] + p[1], f: () => drawPlant(p[0], p[1]) }));
    items.sort((a, b) => a.d - b.d);
    items.forEach(it => it.f());
    applyLight();
    drawOverlay();
    // Khi đã phóng to một phòng, huy hiệu các phòng khác mờ dần để khỏi che cảnh.
    ROOMS.forEach(r => {
      const fade = cam.room && r !== cam.room ? Math.max(0, 1 - (cam.z - 1) * 1.3) : 1;
      if (fade <= 0.02) return;
      ctx.save(); ctx.globalAlpha = fade; drawBadge(r); ctx.restore();
    });
    particles.forEach(p => { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, p.life); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66); ctx.restore(); });
  }
  let raf = 0, last = performance.now(), dead = false;
  function loop(t) {
    if (dead) return;
    tick(Math.min(0.1, (t - last) / 1000)); last = t;
    if (ready) render();
    raf = requestAnimationFrame(loop);
  }

  /* ---------- nhấp chuột ---------- */
  const screenOf = (wx, wy, wz) => { const p = iso(wx, wy, wz || 0); return [view.w / 2 + (p[0] - cam.x) * view.s * cam.z, view.h / 2 + (p[1] - cam.y) * view.s * cam.z]; };
  function agentAt(sx, sy) {
    if (!cam.room) return null;
    let best = null, bd = 1e9;
    for (const a of agents) {
      if (a.room !== cam.room) continue;
      const p = screenOf(a.x, a.y, 22), d = Math.hypot(sx - p[0], (sy - p[1]) * 0.85);
      if (d < bd) { bd = d; best = a; }
    }
    return bd < 32 * view.s * cam.z + 8 ? best : null;
  }
  function roomAt(sx, sy) {
    const wx = (sx - view.w / 2) / (view.s * cam.z) + cam.x, wy = (sy - view.h / 2) / (view.s * cam.z) + cam.y + 28;
    const a = wx / (TW / 2), c = wy / (TH / 2), gx = (a + c) / 2, gy = (c - a) / 2;
    return ROOMS.find(r => gx >= r.x - 0.3 && gx <= r.x + r.w + 0.3 && gy >= r.y - 0.3 && gy <= r.y + r.d + 0.3) || null;
  }
  const pos = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  const onClick = e => {
    const [sx, sy] = pos(e), a = agentAt(sx, sy);
    if (a) return opts.onPickAgent?.(a.ref);
    const hit = roomAt(sx, sy);
    if (hit && hit !== cam.room) camTo(hit); else camTo(null);
  };
  const onMove = e => {
    const [sx, sy] = pos(e);
    cv.style.cursor = agentAt(sx, sy) ? 'pointer' : (cam.room ? 'zoom-out' : (roomAt(sx, sy) ? 'zoom-in' : 'default'));
  };
  const onKey = e => { if (e.key === 'Escape' && cam.room) camTo(null); };
  cv.addEventListener('click', onClick); cv.addEventListener('pointermove', onMove);
  window.addEventListener('keydown', onKey);
  const ro = new ResizeObserver(resize); ro.observe(cv.parentElement);
  try { const m = localStorage.getItem('cty.light3d'); if (['auto', 'day', 'night'].includes(m)) lightMode = m; } catch { /* bỏ qua */ }

  build();
  resize();
  raf = requestAnimationFrame(loop);

  return {
    sync, handoff,
    zoom: code => camTo(code ? ROOMS.find(r => r.code === code) || null : null),
    zoomedCode: () => cam.room?.code || null,
    setLight(m) { lightMode = m; try { localStorage.setItem('cty.light3d', m); } catch { /* bỏ qua */ } },
    getLight: () => lightMode,
    rooms: () => ROOMS.map(r => ({ code: r.code, work: r.work, total: r.total })),
    destroy() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); cv.removeEventListener('click', onClick); cv.removeEventListener('pointermove', onMove); window.removeEventListener('keydown', onKey); }
  };
}