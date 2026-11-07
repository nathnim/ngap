"use strict";
/* app.js – giao diện mô phỏng dự báo ngập (bản đồ, điều khiển, biểu đồ, xuất CSV)
   Phụ thuộc: Leaflet, core.js */
/* ============ Danh mục ============ */
const LOCS=[
  {n:"Hà Nội – Hoàn Kiếm, Hai Bà Trưng",c:[21.0200,105.8520]},
  {n:"Hà Nội – Đống Đa",c:[21.0130,105.8270]},
  {n:"Hà Nội – Cầu Giấy",c:[21.0310,105.7960]},
  {n:"TP.HCM – Quận 1",c:[10.7760,106.7010]},
  {n:"TP.HCM – Bình Thạnh",c:[10.8040,106.7110]},
  {n:"Đà Nẵng – Hải Châu",c:[16.0600,108.2160]},
  {n:"Cần Thơ – Ninh Kiều",c:[10.0340,105.7840]}
];
const PRESETS=[
  {n:"Mưa thường xuyên 50 mm/1 h",P:50,D:1,shape:"peak",rise:0},
  {n:"Mưa lớn 100 mm/2 h",P:100,D:2,shape:"peak",rise:0},
  {n:"Mưa cực đoan 200 mm/3 h",P:200,D:3,shape:"peak",rise:0},
  {n:"Mưa kéo dài 300 mm/12 h",P:300,D:12,shape:"uni",rise:0},
  {n:"Mưa lớn + nước sông dâng 0,8 m",P:100,D:2,shape:"peak",rise:0.8}
];
const $=id=>document.getElementById(id);
const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fmt=(x,d=0)=>x.toLocaleString("vi-VN",{minimumFractionDigits:d,maximumFractionDigits:d});


/* ============ Cầu nối giao diện ↔ lõi tính toán (core.js) ============ */
const bboxFor=(c,km)=>FloodCore.bboxFor(c,km);
function makeHyeto(){ return FloodCore.makeHyeto({P:+$("P").value,D:+$("D").value,tail:+$("tail").value,shape:$("shape").value}); }
function intensityAt(t){ return FloodCore.intensityAt(hyeto,t); }
function step(dt){ FloodCore.step(G,sim,hyeto,{drain:+$("drain").value,infil:+$("infil").value,rise:+$("rise").value},dt); }
function stats(){ return FloodCore.stats(G); }

/* ============ Bản đồ ============ */
const map=L.map("map",{zoomControl:true,preferCanvas:true}).setView(LOCS[0].c,15);
const BASES={ // Nền bản đồ miễn phí, không cần API key: [url, ghi nguồn, mức zoom gốc tối đa]
  light:["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",'Tiles © <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>',16],
  dark:["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",'Tiles © <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>',16],
  osm:["https://tile.openstreetmap.org/{z}/{x}/{y}.png",'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',19],
  hot:["https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",'© OpenStreetMap, HOT',19],
  topo:["https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",'© OpenStreetMap, SRTM | © <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a>',17],
  sat:["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",'Ảnh vệ tinh © <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>',19]
};
let baseLayer=null;
function setBase(k){ if(!BASES[k]) k="light"; if(baseLayer) map.removeLayer(baseLayer);
  baseLayer=L.tileLayer(BASES[k][0],{maxZoom:19,maxNativeZoom:BASES[k][2],attribution:BASES[k][1]+' · DEM Copernicus/Open-Meteo'}).addTo(map); }
setBase("light");
const roadRenderer=L.canvas({padding:0.3});
let bboxRect=null, floodOverlay=null, roadLayer=L.layerGroup().addTo(map), probeMarker=null;

/* ============ Trạng thái ============ */
let G=null;            // lưới mô hình
let hyeto=null;        // cường độ mưa theo phút (mm/h)
let sim=null;          // trạng thái chạy
let center=LOCS[0].c.slice();

/* ============ Giao diện nhập ============ */
LOCS.forEach((l,i)=>{const o=document.createElement("option");o.value=i;o.textContent=l.n;$("loc").appendChild(o);});
PRESETS.forEach((p,i)=>{const b=document.createElement("button");b.className="chip";b.type="button";b.textContent=p.n;b.dataset.i=i;
  b.setAttribute("aria-pressed",i===1?"true":"false");
  b.onclick=()=>{ $("P").value=p.P;$("D").value=p.D;$("shape").value=p.shape;$("rise").value=p.rise;
    document.querySelectorAll("#presets .chip").forEach(c=>c.setAttribute("aria-pressed",c===b?"true":"false"));
    rainChanged(); };
  $("presets").appendChild(b);});
$("loc").onchange=()=>{center=LOCS[+$("loc").value].c.slice();map.setView(center,15);drawBBox();};
$("size").oninput=()=>{$("sizeV").textContent=fmt(+$("size").value,1)+" km";drawBBox();};
$("useView").onclick=()=>{const c=map.getCenter();center=[c.lat,c.lng];drawBBox();};
$("build").onclick=()=>build();
["P","D","tail","shape"].forEach(id=>$(id).addEventListener("change",()=>{
  document.querySelectorAll("#presets .chip").forEach(c=>c.setAttribute("aria-pressed","false"));rainChanged();}));
$("rise").addEventListener("change",()=>{});
$("run").onclick=()=>toggleRun();
$("reset").onclick=()=>{resetSim();render(true);};
$("view").onchange=()=>{renderOverlay();drawLegend();};
$("base").onchange=()=>setBase($("base").value);
$("roadsOn").onchange=()=>{ if($("roadsOn").checked) map.addLayer(roadLayer); else map.removeLayer(roadLayer); };
$("csvRoads").onclick=exportRoads; $("csvTs").onclick=exportTs;

function drawBBox(){
  const b=bboxFor(center,+$("size").value);
  if(bboxRect) map.removeLayer(bboxRect);
  bboxRect=L.rectangle([[b.south,b.west],[b.north,b.east]],{color:css("--accent"),weight:2,dashArray:"6 5",fill:false,interactive:false}).addTo(map);
}

/* ============ Tiến trình ============ */
function stepState(s,st){const li=document.querySelector(`#steps li[data-s="${s}"]`);li.className=st||"";}
function busy(msg){ $("busy").hidden=!msg; if(msg) $("busyMsg").textContent=msg; }

/* ============ Tải dữ liệu ============ */
async function fetchJSON(url,opt,timeout=60000){
  const ac=new AbortController(); const t=setTimeout(()=>ac.abort(),timeout);
  try{ const r=await fetch(url,{...opt,signal:ac.signal}); if(!r.ok) throw new Error("HTTP "+r.status); return await r.json(); }
  finally{ clearTimeout(t); }
}
async function fetchOSM(b){
  const bb=`${b.south},${b.west},${b.north},${b.east}`;
  const hw=Object.keys(ROADW).join("|");
  const q=`[out:json][timeout:90];(
    way["building"](${bb});
    way["highway"~"^(${hw})$"](${bb});
    way["waterway"~"^(river|canal|stream|drain|ditch)$"](${bb});
    way["natural"="water"](${bb}); relation["natural"="water"](${bb});
    way["landuse"~"^(reservoir|basin)$"](${bb});
    way["leisure"~"^(park|garden|pitch)$"](${bb});
    way["landuse"~"^(grass|forest|meadow|recreation_ground|cemetery|farmland|orchard)$"](${bb});
    way["natural"~"^(wood|scrub|grassland|wetland)$"](${bb});
  );out geom;`;
  const eps=["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter","https://overpass.private.coffee/api/interpreter"];
  let err;
  for(const ep of eps){
    try{ return await fetchJSON(ep,{method:"POST",body:"data="+encodeURIComponent(q),headers:{"Content-Type":"application/x-www-form-urlencoded"}},120000); }
    catch(e){err=e;}
  }
  throw err;
}
async function fetchDEM(lats,lons,onProg){
  const out=new Array(lats.length); const batches=[];
  for(let i=0;i<lats.length;i+=100) batches.push(i);
  let done=0;
  async function one(i){
    const la=lats.slice(i,i+100).map(v=>v.toFixed(5)).join(","), lo=lons.slice(i,i+100).map(v=>v.toFixed(5)).join(",");
    let j;
    for(let a=0;a<3;a++){ try{ j=await fetchJSON(`https://api.open-meteo.com/v1/elevation?latitude=${la}&longitude=${lo}`,{},30000); break; }
      catch(e){ if(a===2) throw e; await new Promise(r=>setTimeout(r,800*(a+1))); } }
    j.elevation.forEach((v,k)=>out[i+k]=v);
    onProg(++done,batches.length);
  }
  const queue=batches.slice(); const workers=[];
  for(let w=0;w<3;w++) workers.push((async()=>{while(queue.length){await one(queue.shift());}})());
  await Promise.all(workers);
  return out;
}

/* ============ Xây dựng mô hình ============ */
async function build(){
  stopRun();
  $("build").disabled=true;$("run").disabled=true;$("reset").disabled=true;
  ["osm","dem","ras","ok"].forEach(s=>stepState(s,""));
  const km=+$("size").value, dx=+$("cell").value, b=bboxFor(center,km);
  const W=Math.round(km*1000/dx), H=W;
  drawBBox(); map.fitBounds([[b.south,b.west],[b.north,b.east]],{padding:[20,20]});
  let osm=null, dem=null, demOK=true, osmOK=true;

  stepState("osm","run"); busy("Đang tải dữ liệu OpenStreetMap…");
  try{ osm=await fetchOSM(b); stepState("osm","done"); }
  catch(e){ osmOK=false; stepState("osm","fail"); console.warn(e); }

  stepState("dem","run");
  const cw=Math.ceil(W/2)+1, ch=Math.ceil(H/2)+1, lats=[], lons=[];
  for(let r=0;r<ch;r++) for(let c=0;c<cw;c++){ lats.push(b.north-(b.north-b.south)*r/(ch-1)); lons.push(b.west+(b.east-b.west)*c/(cw-1)); }
  try{ dem=await fetchDEM(lats,lons,(d,n)=>busy(`Đang tải cao độ… ${d}/${n} gói`)); stepState("dem","done"); }
  catch(e){ demOK=false; stepState("dem","fail"); console.warn(e); }

  stepState("ras","run"); busy("Đang lưới hóa…");
  await new Promise(r=>setTimeout(r,20));
  G=FloodCore.makeGrid(b,W,H,dx,osm,dem,cw,ch,{smooth:+$("smooth").value,baseImp:+$("baseImp").value,kerb:+$("kerb").value});
  G.src={dem:demOK,osm:osmOK};
  stepState("ras","done"); stepState("ok","done");
  $("srcBadge").innerHTML = (demOK&&osmOK)? '<span class="badge real">dữ liệu thật</span>'
    : `<span class="badge syn">${!demOK?"DEM giả định":""}${!demOK&&!osmOK?" · ":""}${!osmOK?"không có OSM":""}</span>`;
  $("dtInfo").textContent=`${W}×${H} ô · Δx ${dx} m · Δt ${G.dt} s`;
  buildRoadLayer();
  busy(null);
  $("build").disabled=false;$("run").disabled=false;$("reset").disabled=false;
  rainChanged();
}

/* ============ Biểu đồ mưa ============ */
function rainChanged(){ hyeto=makeHyeto(); if(G){ resetSim(); render(true);} else drawMain(); }

/* ============ Mô phỏng ============ */
function resetSim(){
  stopRun();
  if(!G) return;
  G.h.fill(0); G.hmax.fill(0);
  const rise=+$("rise").value;
  for(let k=0;k<G.N;k++) if(G.water[k]) G.h[k]=rise;
  G.F=G.F||new Float32Array(G.N);
  sim={t:0,ts:[],acc:{rain:0,drain:0,inf:0,out:0,riv:0},probe:sim?.probe??-1,probeTs:[],nextMin:0,done:false};
  G.roads.forEach(r=>r.cls=-2);
  $("run").textContent="▶ Chạy";
  record();
}
function record(){
  const s=stats();
  sim.ts.push({t:sim.t,i:intensityAt(Math.max(0,sim.t-1)),area:s.area,max:s.max,vol:s.vol,rain:sim.acc.rain/Math.max(1,G.N-countWater())*1000});
  if(sim.probe>=0) sim.probeTs.push({t:sim.t,h:G.h[sim.probe]});
}
let _wc=null; function countWater(){ if(_wc===null||_wc.g!==G){ let n=0; for(let k=0;k<G.N;k++) n+=G.water[k]; _wc={g:G,n}; } return _wc.n; }

let raf=null,lastTs=0,lastRender=0;
function toggleRun(){
  if(!G) return;
  if(raf){ stopRun(); return; }
  if(sim.done) resetSim();
  $("run").textContent="❚❚ Tạm dừng"; lastTs=performance.now();
  raf=requestAnimationFrame(loop);
}
function stopRun(){ if(raf) cancelAnimationFrame(raf); raf=null; if(sim&&!sim.done) $("run").textContent="▶ Tiếp tục"; }
function loop(now){
  const real=Math.min(0.1,(now-lastTs)/1000); lastTs=now;
  const tEnd=hyeto.nT*60;
  let budget=real*+$("speed").value; const t0=performance.now();
  while(budget>0&&sim.t<tEnd&&performance.now()-t0<30){
    step(G.dt); budget-=G.dt;
    if(sim.t>=sim.nextMin*60+60){ sim.nextMin=Math.floor(sim.t/60); record(); }
  }
  if(sim.t>=tEnd){ sim.done=true; record(); raf=null; $("run").textContent="↻ Chạy lại"; render(true); return; }
  if(now-lastRender>250){ render(false); lastRender=now; }
  raf=requestAnimationFrame(loop);
}

/* ============ Hiển thị ============ */
function hexToRgb(h){ h=h.replace("#",""); if(h.length===3)h=h.split("").map(c=>c+c).join(""); const n=parseInt(h,16); return [n>>16&255,n>>8&255,n&255]; }
function depthStops(){ return [[0.02,css("--d1"),0.35],[0.15,css("--d2"),0.6],[0.30,css("--d3"),0.72],[0.50,css("--d4"),0.8],[1.0,css("--d5"),0.88]].map(s=>[s[0],hexToRgb(s[1]),s[2]]); }
function rampDepth(d,st){
  if(d<st[0][0]) return null;
  for(let i=0;i<st.length-1;i++){ const a=st[i],b=st[i+1]; if(d<=b[0]){ const t=(d-a[0])/(b[0]-a[0]);
    return [a[1][0]+(b[1][0]-a[1][0])*t,a[1][1]+(b[1][1]-a[1][1])*t,a[1][2]+(b[1][2]-a[1][2])*t,a[2]+(b[2]-a[2])*t]; } }
  const l=st[st.length-1]; return [...l[1],l[2]];
}
const DEMRAMP=[[0,[40,90,70]],[0.25,[120,160,90]],[0.5,[220,210,140]],[0.75,[200,140,80]],[1,[130,80,60]]];
function rampDem(t){ for(let i=0;i<DEMRAMP.length-1;i++){const a=DEMRAMP[i],b=DEMRAMP[i+1]; if(t<=b[0]){const u=(t-a[0])/(b[0]-a[0]); return a[1].map((v,j)=>v+(b[1][j]-v)*u);} } return DEMRAMP[4][1]; }

const ovCanvas=document.createElement("canvas");
function renderOverlay(){
  if(!G) return;
  const {W,H,N,b}=G, mode=$("view").value;
  ovCanvas.width=W; ovCanvas.height=H;
  const c=ovCanvas.getContext("2d"), img=c.createImageData(W,H), D=img.data;
  if(mode==="cur"||mode==="max"){
    const arr=mode==="cur"?G.h:G.hmax, st=depthStops();
    for(let k=0;k<N;k++){ if(G.water[k]) continue; const col=rampDepth(arr[k],st); if(!col) continue;
      D[k*4]=col[0];D[k*4+1]=col[1];D[k*4+2]=col[2];D[k*4+3]=col[3]*255; }
  }else if(mode==="dem"){
    const lo=G.zMin, rg=Math.max(0.5,G.zMax-G.zMin);
    for(let r=0;r<H;r++) for(let x=0;x<W;x++){ const k=r*W+x;
      const zx=(G.z[r*W+Math.min(W-1,x+1)]-G.z[r*W+Math.max(0,x-1)])/(2*G.dx), zy=(G.z[Math.min(H-1,r+1)*W+x]-G.z[Math.max(0,r-1)*W+x])/(2*G.dx);
      const shade=Math.max(0.55,Math.min(1.15,1-6*(zx-zy)));
      const col=rampDem((G.z[k]-lo)/rg);
      D[k*4]=Math.min(255,col[0]*shade);D[k*4+1]=Math.min(255,col[1]*shade);D[k*4+2]=Math.min(255,col[2]*shade);D[k*4+3]=G.water[k]?60:175; }
  }else{
    for(let k=0;k<N;k++){ const v=G.imp[k]; D[k*4]=60+150*v;D[k*4+1]=110+40*(1-v);D[k*4+2]=90;D[k*4+3]=G.water[k]?0:150; }
  }
  c.putImageData(img,0,0);
  const url=ovCanvas.toDataURL();
  const bounds=[[b.south,b.west],[b.north,b.east]];
  if(!floodOverlay||floodOverlay._gb!==G){ if(floodOverlay) map.removeLayer(floodOverlay);
    floodOverlay=L.imageOverlay(url,bounds,{className:"flood-img",interactive:false}).addTo(map); floodOverlay._gb=G; }
  else floodOverlay.setUrl(url);
}

function buildRoadLayer(){
  roadLayer.clearLayers();
  for(const r of G.roads){
    r.pl=L.polyline(r.geom,{renderer:roadRenderer,weight:Math.max(3,(ROADW[r.type]||5)/3),opacity:0,interactive:false});
    roadLayer.addLayer(r.pl);
  }
}
function updateRoads(){
  const h=G.h; const named=new Map();
  for(const r of G.roads){
    let mx=0,wet=0; for(const k of r.cells){ const d=h[k]; if(d>mx)mx=d; if(d>=0.15)wet++; }
    r.cur=mx; r.wet=wet; r.mx=Math.max(r.mx||0,mx);
    const c=clsOf(mx);
    if(c!==r.cls){ r.cls=c; r.pl.setStyle(c<0?{opacity:0}:{color:css(CLASSES[c].c),opacity:0.95}); }
    if(r.name){ const o=named.get(r.name)||{name:r.name,type:r.type,cur:0,mx:0,wet:0,geom:[]};
      o.cur=Math.max(o.cur,mx); o.mx=Math.max(o.mx,r.mx); o.wet+=wet; o.geom.push(r.geom); named.set(r.name,o); }
  }
  G.named=[...named.values()];
  const top=G.named.filter(o=>o.cur>=0.05).sort((a,b)=>b.cur-a.cur).slice(0,10);
  const ul=$("roads");
  if(!top.length){ ul.innerHTML=`<li class="empty" style="cursor:default">${sim&&sim.t>0?"Chưa có tuyến nào ngập từ 5 cm.":"Chưa có tuyến ngập."}</li>`; return; }
  ul.innerHTML="";
  for(const o of top){ const c=CLASSES[clsOf(o.cur)], li=document.createElement("li");
    li.innerHTML=`<span class="nm"></span><span class="dp">${fmt(o.cur*100)} cm</span><span class="pill" style="background:var(${c.c});${c.c==="--d1"?"color:#0b2a3a":""}">${c.t}</span>`;
    li.querySelector(".nm").textContent=o.name; li.title=`${o.name} · lớn nhất ${fmt(o.mx*100)} cm · ~${fmt(o.wet*G.dx)} m ô ngập ≥15 cm`;
    li.onclick=()=>map.fitBounds(L.latLngBounds(o.geom.flat()),{maxZoom:18,padding:[30,30]});
    ul.appendChild(li); }
}

function hhmm(s){ const m=Math.floor(s/60); return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0"); }
function render(full){
  if(!G||!sim) return;
  renderOverlay(); updateRoads();
  const s=stats(), tEnd=hyeto.nT*60;
  $("clock").textContent=`t = ${hhmm(sim.t)} / ${hhmm(tEnd)}`;
  $("intens").textContent=`i = ${fmt(intensityAt(sim.t),1)} mm/h`;
  $("prog").style.width=(100*sim.t/tEnd)+"%";
  $("kA").innerHTML=`${fmt(s.area,2)} <small>ha</small>`;
  $("kD").innerHTML=`${fmt(s.max*100)} <small>cm</small>`;
  $("kV").innerHTML=`${fmt(s.vol)} <small>m³</small>`;
  const land=G.N-countWater(), cell=G.dx*G.dx, A=sim.acc, mm=v=>fmt(v/land*1000,1);
  $("kR").innerHTML=`${mm(A.rain)} <small>mm</small>`;
  $("balance").textContent=sim.t>0?`Cân bằng nước (mm quy đổi trên diện tích đất): mưa ${mm(A.rain)} = cống ${mm(A.drain)} + thấm ${mm(A.inf)} + chảy ra biên ${mm(A.out)} + vào sông/hồ ${mm(A.riv)} + đọng lại ${mm(s.vol/cell)}.`:"Cân bằng nước sẽ hiện khi chạy.";
  drawMain(); drawProbe();
}

/* ============ Biểu đồ ============ */
function prepCanvas(cv){ const r=cv.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
  cv.width=Math.max(1,r.width*dpr); cv.height=Math.max(1,r.height*dpr); const c=cv.getContext("2d"); c.setTransform(dpr,0,0,dpr,0,0); return [c,r.width,r.height]; }
function niceMax(v){ if(v<=0) return 1; const p=Math.pow(10,Math.floor(Math.log10(v))), f=v/p; return (f<=1?1:f<=2?2:f<=5?5:10)*p; }
function drawMain(){
  const cv=$("chartMain"); if(!hyeto) return; const [c,w,h]=prepCanvas(cv);
  const L=34,R=38,T=10,B=18, pw=w-L-R, ph=h-T-B, n=hyeto.nT;
  const iMax=niceMax(Math.max(...hyeto.arr)), ts=sim?sim.ts:[], aMax=niceMax(Math.max(0.01,...ts.map(p=>p.area), (G?G.N*G.dx*G.dx/1e4*0.05:1)));
  c.font="10px "+css("--f-mono"); c.fillStyle=css("--muted"); c.strokeStyle=css("--line"); c.lineWidth=1;
  for(let j=0;j<=2;j++){ const y=T+ph*j/2; c.beginPath(); c.moveTo(L,y); c.lineTo(L+pw,y); c.stroke();
    c.textAlign="right"; c.fillText(fmt(iMax*(1-j/2)),L-4,y+3); c.textAlign="left"; c.fillText(fmt(aMax*(1-j/2),aMax<1?2:1),L+pw+4,y+3); }
  // mưa: cột rủ từ trên xuống? -> cột thường
  c.fillStyle=css("--rain"); c.globalAlpha=0.45;
  const bw=pw/n; for(let m=0;m<n;m++){ const v=hyeto.arr[m]; if(!v) continue; const bh=ph*v/iMax; c.fillRect(L+m*bw,T+ph-bh,Math.max(0.6,bw),bh); }
  c.globalAlpha=1;
  // diện tích ngập
  if(ts.length>1){ c.strokeStyle=css("--d5"); c.lineWidth=2; c.beginPath();
    ts.forEach((p,i)=>{ const x=L+pw*p.t/(n*60), y=T+ph*(1-p.area/aMax); i?c.lineTo(x,y):c.moveTo(x,y); }); c.stroke(); }
  // con trỏ thời gian
  if(sim){ const x=L+pw*Math.min(1,sim.t/(n*60)); c.strokeStyle=css("--ink"); c.lineWidth=1; c.setLineDash([3,3]); c.beginPath(); c.moveTo(x,T); c.lineTo(x,T+ph); c.stroke(); c.setLineDash([]); }
  c.fillStyle=css("--muted"); c.textAlign="left"; c.fillText("mm/h",2,T+ph+14); c.textAlign="right"; c.fillText("ha ≥15 cm",w-2,T+ph+14);
  c.textAlign="center"; for(let hh=0;hh<=n/60;hh+=Math.max(1,Math.ceil(n/60/6))) c.fillText(hh+"h",L+pw*hh*60/n,T+ph+14);
}
function drawProbe(){
  const cv=$("chartProbe"); const [c,w,h]=prepCanvas(cv);
  const L=34,R=10,T=10,B=18,pw=w-L-R,ph=h-T-B;
  if(!sim||sim.probe<0||!hyeto){ c.fillStyle=css("--muted"); c.font="12px "+css("--f-body"); c.fillText("Chưa đặt điểm quan trắc.",L,T+ph/2); return; }
  const n=hyeto.nT*60, ts=sim.probeTs, mx=niceMax(Math.max(0.1,...ts.map(p=>p.h)));
  c.font="10px "+css("--f-mono"); c.strokeStyle=css("--line");
  // dải ngưỡng
  CLASSES.forEach(k=>{ if(k.lo>mx) return; const y1=T+ph*(1-Math.min(mx,k.hi)/mx), y0=T+ph*(1-k.lo/mx);
    c.fillStyle=css(k.c); c.globalAlpha=0.13; c.fillRect(L,y1,pw,y0-y1); });
  c.globalAlpha=1;
  for(let j=0;j<=2;j++){ const y=T+ph*j/2; c.beginPath(); c.moveTo(L,y); c.lineTo(L+pw,y); c.stroke();
    c.fillStyle=css("--muted"); c.textAlign="right"; c.fillText(fmt(mx*100*(1-j/2)),L-4,y+3); }
  if(ts.length>1){ c.strokeStyle=css("--d3"); c.lineWidth=2; c.beginPath();
    ts.forEach((p,i)=>{const x=L+pw*p.t/n, y=T+ph*(1-p.h/mx); i?c.lineTo(x,y):c.moveTo(x,y);}); c.stroke();
    const p=ts[ts.length-1]; c.fillStyle=css("--d3"); c.beginPath(); c.arc(L+pw*p.t/n,T+ph*(1-p.h/mx),3,0,7); c.fill(); }
  c.fillStyle=css("--muted"); c.textAlign="left"; c.fillText("cm",2,T+ph+14);
  c.textAlign="center"; for(let hh=0;hh<=n/3600;hh+=Math.max(1,Math.ceil(n/3600/6))) c.fillText(hh+"h",L+pw*hh*3600/n,T+ph+14);
}

function drawLegend(){
  const mode=$("view").value, el=$("legend");
  if(mode==="dem"&&G){ el.innerHTML=`<h3>Cao độ (m)</h3><div style="height:10px;border-radius:2px;background:linear-gradient(90deg,${DEMRAMP.map(s=>`rgb(${s[1]})`).join(",")})"></div>
    <div class="cm" style="display:flex;justify-content:space-between;margin-top:3px"><span>${fmt(G.zMin,1)}</span><span>${fmt(G.zMax,1)}</span></div>`; return; }
  if(mode==="imp"){ el.innerHTML=`<h3>Tỷ lệ không thấm</h3><div style="height:10px;border-radius:2px;background:linear-gradient(90deg,rgb(60,150,90),rgb(210,110,90))"></div><div class="cm" style="display:flex;justify-content:space-between;margin-top:3px"><span>0 (cỏ, đất)</span><span>1 (nhà, đường)</span></div>`; return; }
  el.innerHTML=`<h3>${mode==="max"?"Độ sâu lớn nhất":"Độ sâu ngập"} · tác động giao thông</h3>`+
    CLASSES.map(k=>`<div class="lr"><span class="sw" style="background:var(${k.c})"></span><span class="cm">${fmt(k.lo*100)}${k.hi<9?"–"+fmt(k.hi*100):"+"} cm</span><span>${k.t}<br><span style="color:var(--muted)">${k.d}</span></span></div>`).join("");
}

/* ============ Tương tác bản đồ ============ */
function cellAt(ll){ if(!G) return -1; const b=G.b;
  const c=Math.floor((ll.lng-b.west)/(b.east-b.west)*G.W), r=Math.floor((b.north-ll.lat)/(b.north-b.south)*G.H);
  return (c<0||c>=G.W||r<0||r>=G.H)?-1:r*G.W+c; }
map.on("mousemove",e=>{ if(window.HIST_ON) return; const k=cellAt(e.latlng); if(k<0){ $("readout").textContent="Di chuột trên vùng mô hình"; return; }
  $("readout").innerHTML=`Cao độ ${fmt(G.z[k],2)} m<br>${G.water[k]?"Sông/hồ":`Sâu ${fmt(G.h[k]*100,1)} cm · max ${fmt(G.hmax[k]*100,1)} cm`}<br>Không thấm ${fmt(G.imp[k],2)}`; });
map.on("click",e=>{ if(window.HIST_ON) return; const k=cellAt(e.latlng); if(k<0||!sim) return;
  sim.probe=k; sim.probeTs=[{t:sim.t,h:G.h[k]}];
  if(probeMarker) map.removeLayer(probeMarker);
  probeMarker=L.circleMarker(e.latlng,{radius:7,color:css("--ink"),weight:2,fillColor:css("--accent"),fillOpacity:1}).addTo(map);
  $("probeInfo").textContent=`Điểm ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)} · cao độ ${fmt(G.z[k],2)} m · ${G.water[k]?"thuộc sông/hồ":"không thấm "+fmt(G.imp[k],2)}. Chuỗi số liệu ghi từ thời điểm đặt.`;
  drawProbe(); });

/* ============ Xuất CSV ============ */
function download(name,text){ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["﻿"+text],{type:"text/csv"})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); }
function exportRoads(){ if(!G||!G.named) return;
  const rows=[["Ten duong","Cap duong","Sau hien tai (cm)","Sau lon nhat (cm)","Chieu dai o ngap >=15cm (m)"]];
  G.named.sort((a,b)=>b.mx-a.mx).forEach(o=>rows.push([`"${o.name.replace(/"/g,'""')}"`,o.type,(o.cur*100).toFixed(1),(o.mx*100).toFixed(1),Math.round(o.wet*G.dx)]));
  download("tuyen_duong_ngap.csv",rows.map(r=>r.join(",")).join("\n")); }
function exportTs(){ if(!sim) return;
  const rows=[["Thoi gian (phut)","Cuong do mua (mm/h)","Dien tich ngap >=15cm (ha)","Do sau lon nhat (cm)","The tich dong (m3)"]];
  sim.ts.forEach(p=>rows.push([(p.t/60).toFixed(0),p.i.toFixed(2),p.area.toFixed(3),(p.max*100).toFixed(1),p.vol.toFixed(0)]));
  download("chuoi_thoi_gian_ngap.csv",rows.map(r=>r.join(",")).join("\n")); }

/* ============ Khởi động ============ */
window.addEventListener("resize",()=>{drawMain();drawProbe();});
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change",()=>{drawLegend(); if(G) render(true); else drawMain();});
drawBBox(); drawLegend(); hyeto=makeHyeto(); drawMain(); drawProbe();
build();
