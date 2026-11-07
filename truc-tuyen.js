"use strict";
/* truc-tuyen.js – radar mưa, tìm kiếm, lộ trình tránh ngập, báo ngập. Phụ thuộc: lich-su.js */
/* =====================================================================
   TÍNH NĂNG THAM KHẢO NƯỚC LÊN: radar mưa, vùng từng ngập, tìm kiếm,
   lộ trình tránh ngập, báo điểm ngập
   ===================================================================== */
const unacc=s=>s.normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase();
const mDist=(a,b)=>{ const ky=110540,kx=111320*Math.cos(a[0]*Math.PI/180); return Math.hypot((a[0]-b[0])*ky,(a[1]-b[1])*kx); };
function segDist(p,a,b){ const ky=110540,kx=111320*Math.cos(p[0]*Math.PI/180);
  const ax=(a[1]-p[1])*kx, ay=(a[0]-p[0])*ky, bx=(b[1]-p[1])*kx, by=(b[0]-p[0])*ky, dx=bx-ax, dy=by-ay, L2=dx*dx+dy*dy;
  let t=L2?-(ax*dx+ay*dy)/L2:0; t=Math.max(0,Math.min(1,t)); return Math.hypot(ax+dx*t,ay+dy*t); }
function lineDist(p,line){ let d=1e9; for(let i=0;i<line.length-1;i++){ const v=segDist(p,line[i],line[i+1]); if(v<d)d=v; } return d; }
const hhmmOf=t=>{ const d=new Date(t); return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); };

/* ---------------- 1. Radar mưa (RainViewer, 2 giờ qua) ---------------- */
const RADAR={layer:null,frames:[],host:"",i:0,timer:null};
async function radarStart(){
  try{
    const j=await fetchJSON("https://api.rainviewer.com/public/weather-maps.json",{},20000);
    RADAR.host=j.host; RADAR.frames=(j.radar&&j.radar.past)||[];
    if(!RADAR.frames.length) throw new Error("no frames");
    RADAR.i=RADAR.frames.length-1; radarShow(); $("radarCtl").hidden=false;
  }catch(e){ $("radarOn").checked=false; $("radarCtl").hidden=false; $("radarTime").textContent="radar không tải được"; console.warn(e); }
}
function radarShow(){
  const f=RADAR.frames[RADAR.i], url=`${RADAR.host}${f.path}/256/{z}/{x}/{y}/2/1_0.png`;
  if(!RADAR.layer) RADAR.layer=L.tileLayer(url,{opacity:0.65,maxNativeZoom:7,maxZoom:19,zIndex:450,attribution:'Radar © <a href="https://www.rainviewer.com" target="_blank" rel="noopener">RainViewer</a>'}).addTo(map);
  else RADAR.layer.setUrl(url);
  $("radarTime").textContent=hhmmOf(f.time*1000)+(RADAR.i===RADAR.frames.length-1?" (mới nhất)":"");
}
function radarStop(){ clearInterval(RADAR.timer); RADAR.timer=null; $("radarPlay").textContent="▶"; if(RADAR.layer){ map.removeLayer(RADAR.layer); RADAR.layer=null; } $("radarCtl").hidden=true; }
$("radarOn").onchange=()=>{ if($("radarOn").checked) radarStart(); else radarStop(); };
$("radarPlay").onclick=()=>{
  if(RADAR.timer){ clearInterval(RADAR.timer); RADAR.timer=null; $("radarPlay").textContent="▶"; return; }
  if(!RADAR.frames.length) return;
  $("radarPlay").textContent="❚❚";
  RADAR.timer=setInterval(()=>{ RADAR.i=(RADAR.i+1)%RADAR.frames.length; radarShow(); },800);
};

/* ---------------- 2. Báo điểm ngập (lưu trong trình duyệt) ---------------- */
const REP={list:[],layer:L.layerGroup()};
const REPLV=[[10,"Dưới 15 cm"],[22,"15–30 cm"],[40,"30–50 cm"],[60,"Trên 50 cm"]];
try{ REP.list=JSON.parse(localStorage.getItem("floodReportsV1")||"[]"); }catch(e){ REP.list=[]; }
function repSave(){ try{ localStorage.setItem("floodReportsV1",JSON.stringify(REP.list)); }catch(e){} }
function cityOfLL(la,lo){ let best=null,bd=1e9; for(const c in CITYVIEW){ const d=Math.hypot(la-CITYVIEW[c].c[0],lo-CITYVIEW[c].c[1]); if(d<bd){bd=d;best=c;} } return bd<0.8?best:null; }
function syncReportsIntoHistory(){
  for(let i=HE.length-1;i>=0;i--) if(HE[i].mine) HE.splice(i,1);
  Object.keys(HP).filter(k=>k.startsWith("r_")).forEach(k=>delete HP[k]);
  const groups=new Map();
  for(const r of REP.list){
    const city=cityOfLL(r.lat,r.lon); if(!city) continue;
    const id="r_"+r.id; HP[id]=[city,r.name||("Báo ngập "+hhmmOf(r.t)),"","",r.lat,r.lon]; HIST.snap[id]={lat:r.lat,lon:r.lon,how:"vị trí bạn chọn khi báo"};
    const date=new Date(r.t), key=city+date.toISOString().slice(0,10);
    const ds=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    if(!groups.has(key)) groups.set(key,{id:"R"+city+ds,mine:true,city,date:ds,title:"Báo cáo của tôi "+vnDate(ds),cause:"Báo cáo hiện trường",rain:"—",total:null,note:"Báo cáo nhập trực tiếp trên bản đồ, lưu trong trình duyệt này.",src:[["Báo cáo của tôi","#"]],pts:[]});
    groups.get(key).pts.push([id,r.d]);
  }
  groups.forEach(g=>HE.push(g));
}
function renderReports(){
  REP.layer.clearLayers();
  const now=Date.now();
  REP.list.forEach(r=>{
    const active=r.st==="ngap"&&now-r.t<12*3600e3, col=dColor(r.d);
    const html=active?`<div class="live"><i class="r" style="background:${col}"></i><i style="background:${col};border:2px solid ${css("--ink")}"></i></div>`
                     :`<div class="live"><i style="background:${css("--panel")};border:2px dashed ${css("--muted")}"></i></div>`;
    L.marker([r.lat,r.lon],{icon:L.divIcon({className:"",html,iconSize:[16,16],iconAnchor:[8,8]}),zIndexOffset:500})
      .bindPopup(`<b class="t">${r.name||"Điểm báo ngập"}</b><br>${REPLV.find(x=>x[0]===r.d)?.[1]||dTxt(r.d)} · ${active?"<b>đang ngập</b>":(r.st==="rut"?"đã rút":"báo cũ")}<br>
        <span style="color:var(--muted)">Báo lúc ${hhmmOf(r.t)} ${new Date(r.t).toLocaleDateString("vi-VN")}${r.note?" · "+r.note.replace(/</g,"&lt;"):""}</span><br>
        <div class="btns" style="margin-top:6px">${r.st==="ngap"?`<button data-rep="rut" data-id="${r.id}">Đã rút</button>`:`<button data-rep="ngap" data-id="${r.id}">Vẫn ngập</button>`}<button data-rep="del" data-id="${r.id}">Xóa</button></div>`)
      .addTo(REP.layer);
  });
  const act=REP.list.filter(r=>r.st==="ngap"&&now-r.t<12*3600e3).length;
  $("repN").textContent=REP.list.length?`${act} đang ngập · ${REP.list.length} báo cáo`:"";
  const ul=$("repList"); ul.innerHTML="";
  if(!REP.list.length){ ul.innerHTML=`<li class="empty" style="cursor:default">Chưa có báo cáo.</li>`; return; }
  REP.list.slice().sort((a,b)=>b.t-a.t).slice(0,8).forEach(r=>{ const li=document.createElement("li"); li.className="h";
    li.innerHTML=`<span class="nm"></span><span class="dp">${hhmmOf(r.t)}</span><span class="pill" style="background:${r.st==="ngap"?dColor(r.d):"var(--muted)"};${dVal(r.d)<15&&r.st==="ngap"?"color:#0b2a3a":""}">${r.st==="ngap"?(REPLV.find(x=>x[0]===r.d)?.[1]||""):"Đã rút"}</span>`;
    li.querySelector(".nm").textContent=r.name||`${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}`;
    li.onclick=()=>map.setView([r.lat,r.lon],17); ul.appendChild(li); });
}
function openReportForm(ll){
  const tmpId="f"+Date.now();
  L.popup({minWidth:230}).setLatLng(ll).setContent(`<div class="repform" id="${tmpId}"><b class="t">Báo ngập tại đây</b>
    <input type="text" id="${tmpId}n" placeholder="Tên đường hoặc mô tả (tùy chọn)">
    <div class="chips">${REPLV.map((x,i)=>`<button type="button" class="chip" data-lv="${x[0]}" aria-pressed="${i===1}">${x[1]}</button>`).join("")}</div>
    <input type="text" id="${tmpId}g" placeholder="Ghi chú (tùy chọn)">
    <button type="button" class="primary" data-save="1">Lưu báo cáo</button></div>`).openOn(map);
  setTimeout(()=>{ const box=document.getElementById(tmpId); if(!box) return;
    box.querySelectorAll("[data-lv]").forEach(b=>b.onclick=()=>box.querySelectorAll("[data-lv]").forEach(c=>c.setAttribute("aria-pressed",String(c===b))));
    box.querySelector("[data-save]").onclick=()=>{
      const lv=+box.querySelector('[data-lv][aria-pressed="true"]').dataset.lv;
      REP.list.push({id:Date.now().toString(36),lat:+ll.lat.toFixed(6),lon:+ll.lng.toFixed(6),t:Date.now(),d:lv,st:"ngap",
        name:document.getElementById(tmpId+"n").value.trim(),note:document.getElementById(tmpId+"g").value.trim()});
      repSave(); map.closePopup(); renderHist(false);
    }; },0);
}
map.on("popupopen",ev=>{ ev.popup.getElement().querySelectorAll("[data-rep]").forEach(b=>b.onclick=()=>{
  const r=REP.list.find(x=>x.id===b.dataset.id); if(!r) return;
  if(b.dataset.rep==="del") REP.list=REP.list.filter(x=>x!==r); else { r.st=b.dataset.rep; if(r.st==="ngap") r.t=Date.now(); }
  repSave(); map.closePopup(); renderHist(false); }); });
$("repCsv").onclick=()=>{ if(!REP.list.length) return;
  const rows=[["thanh_pho","ngay","ten_diem","vi_do","kinh_do","do_sau_cm","ghi_chu"]];
  REP.list.forEach(r=>{ const d=new Date(r.t); rows.push([cityOfLL(r.lat,r.lon)||"",`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`,
    `"${(r.name||"").replace(/"/g,'""')}"`,r.lat,r.lon,r.d,`"${((r.st==="rut"?"đã rút; ":"")+(r.note||"")).replace(/"/g,'""')}"`]); });
  download("bao_cao_ngap.csv",rows.map(r=>r.join(",")).join("\n")); };

/* ---------------- 3. Vùng từng ngập (lớp xanh mờ) ---------------- */
map.createPane("halo").style.zIndex=390;
const haloRenderer=L.canvas({pane:"halo"});
const HALO=L.layerGroup();
function drawHalos(){
  HALO.clearLayers(); if(!$("hHalo").checked) return;
  const rec=recurrence(HIST.city), col=css("--d2");
  rec.forEach(o=>{ const p=ptPos(o.id), n=o.ev.length;
    [1,0.6].forEach((k,i)=>L.circle(p,{radius:(120+50*n)*k,stroke:false,fillColor:col,fillOpacity:i?0.12:0.08,interactive:false,renderer:haloRenderer}).addTo(HALO)); });
}
$("hHalo").onchange=()=>renderHist(false);

/* ---------------- 4. Pick trên bản đồ ---------------- */
let PICK=null;
function setPick(mode){
  PICK=PICK===mode?null:mode;
  document.querySelectorAll("[data-pick]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.pick===PICK)));
  $("repBtn").setAttribute("aria-pressed",String(PICK==="rep"));
  $("pickHint").hidden=!PICK;
  $("pickHint").textContent=PICK==="rep"?"Bấm vào vị trí đang ngập trên bản đồ":PICK==="a"?"Bấm để chọn điểm đi (A)":"Bấm để chọn điểm đến (B)";
  map.getContainer().style.cursor=PICK?"crosshair":"";
}
document.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>setPick(b.dataset.pick));
$("repBtn").onclick=()=>setPick("rep");
map.on("click",e=>{ if(!window.HIST_ON||!PICK) return;
  const m=PICK; setPick(m);
  if(m==="rep") openReportForm(e.latlng); else setEnd(m,[e.latlng.lat,e.latlng.lng],`${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`); });

/* ---------------- 5. Lộ trình tránh ngập (OSRM) ---------------- */
const ROUTE={a:null,b:null,layer:L.layerGroup(),endLayer:L.layerGroup(),routes:[]};
function setEnd(k,p,label){
  ROUTE[k]={p,label};
  const el=$(k==="a"?"rA":"rB"); el.textContent=label; el.classList.add("set");
  ROUTE.endLayer.clearLayers();
  ["a","b"].forEach(x=>{ if(!ROUTE[x]) return;
    L.marker(ROUTE[x].p,{icon:L.divIcon({className:"",html:`<span class="tag ${x}">${x.toUpperCase()}</span>`,iconSize:[22,22],iconAnchor:[11,11]}),zIndexOffset:800}).addTo(ROUTE.endLayer); });
  $("rGo").disabled=!(ROUTE.a&&ROUTE.b);
  if(!window.HIST_ON) setMode(true);
}
$("rClr").onclick=()=>{ ROUTE.a=ROUTE.b=null; ROUTE.routes=[]; ROUTE.layer.clearLayers(); ROUTE.endLayer.clearLayers();
  $("rA").textContent="Chưa chọn điểm đi"; $("rB").textContent="Chưa chọn điểm đến"; $("rA").classList.remove("set"); $("rB").classList.remove("set");
  $("rList").innerHTML=""; $("rGo").disabled=true; };
function hazardPoints(){
  // điểm từng ngập (mọi trận, cả hai thành phố) + báo cáo đang ngập
  const out=[];
  ["HN","HCM"].forEach(c=>recurrence(c).forEach(o=>{ if(o.id.startsWith("r_")) return; out.push({id:o.id,p:ptPos(o.id),w:o.ev.length,name:HP[o.id][1],live:false}); }));
  const now=Date.now();
  REP.list.filter(r=>r.st==="ngap"&&now-r.t<12*3600e3).forEach(r=>out.push({id:"r_"+r.id,p:[r.lat,r.lon],w:5,name:(r.name||"Điểm báo ngập")+" (đang ngập)",live:true}));
  return out;
}
$("rGo").onclick=async()=>{
  const a=ROUTE.a.p,b=ROUTE.b.p;
  $("rGo").disabled=true; $("rList").innerHTML=`<li class="empty" style="cursor:default">Đang tìm lộ trình…</li>`;
  let j=null;
  const urls=[`https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?alternatives=3&overview=full&geometries=geojson`,
              `https://routing.openstreetmap.de/routed-car/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?alternatives=3&overview=full&geometries=geojson`];
  for(const u of urls){ try{ j=await fetchJSON(u,{},20000); if(j.code==="Ok") break; }catch(e){ console.warn(e); } }
  $("rGo").disabled=false;
  if(!j||j.code!=="Ok"){ $("rList").innerHTML=`<li class="empty" style="cursor:default">Không kết nối được máy chủ chỉ đường OSRM. Thử lại sau ít phút.</li>`; return; }
  const H=hazardPoints();
  ROUTE.routes=j.routes.map((r,i)=>{ const line=r.geometry.coordinates.map(c=>[c[1],c[0]]);
    const hits=H.filter(h=>lineDist(h.p,line)<=150).sort((x,y)=>y.w-x.w);
    return {i,line,km:r.distance/1000,min:r.duration/60,hits,score:hits.reduce((s,h)=>s+h.w,0)}; });
  ROUTE.routes.sort((x,y)=>x.score-y.score||x.min-y.min);
  drawRoutes(0);
};
function drawRoutes(sel){
  ROUTE.layer.clearLayers();
  ROUTE.routes.forEach((r,k)=>{ if(k===sel) return; L.polyline(r.line,{color:css("--muted"),weight:5,opacity:0.55}).on("click",()=>drawRoutes(k)).addTo(ROUTE.layer); });
  const s=ROUTE.routes[sel];
  L.polyline(s.line,{color:css("--ink"),weight:9,opacity:0.25}).addTo(ROUTE.layer);
  L.polyline(s.line,{color:sel===0?css("--ok"):css("--accent"),weight:5,opacity:0.95}).addTo(ROUTE.layer);
  s.hits.forEach(h=>L.circleMarker(h.p,{radius:13,color:css("--bad"),weight:3,fill:false}).bindTooltip(`${h.name}${h.live?"":` · ngập ${h.w} trận`}`).addTo(ROUTE.layer));
  map.fitBounds(L.latLngBounds(s.line),{padding:[40,40]});
  const ul=$("rList"); ul.innerHTML="";
  ROUTE.routes.forEach((r,k)=>{ const li=document.createElement("li"); li.className="rr"+(k===0?" best":"");
    li.innerHTML=`<span class="rsw" style="background:${k===sel?(k===0?"var(--ok)":"var(--accent)"):"var(--muted)"}"></span>
      <span class="nm">${k===0?"Ít rủi ro ngập nhất · ":""}${fmt(r.km,1)} km · ${fmt(r.min)} phút</span>
      <span class="dp">${r.hits.length?r.hits.length+" điểm ngập":"không qua điểm ngập"}</span>`;
    li.title=r.hits.map(h=>h.name+(h.live?"":` (${h.w} trận)`)).join("\n")||"Không có điểm từng ngập trong 150 m";
    li.onclick=()=>drawRoutes(k); ul.appendChild(li); });
  if(s.hits.length){ const li=document.createElement("li"); li.className="empty"; li.style.cursor="default";
    li.textContent="Tuyến đang chọn đi qua: "+s.hits.slice(0,6).map(h=>h.name.split(" (")[0]+(h.live?" (đang ngập)":` (${h.w} trận)`)).join("; ")+(s.hits.length>6?"…":""); ul.appendChild(li); }
}

/* ---------------- 6. Tìm kiếm ---------------- */
let qTimer=null, qAbort=null;
$("q").addEventListener("input",()=>{ clearTimeout(qTimer); qTimer=setTimeout(doSearch,350); });
$("q").addEventListener("keydown",e=>{ if(e.key==="Escape"){ $("qres").hidden=true; } if(e.key==="Enter"){ const f=$("qres").querySelector("li[data-i]"); if(f) f.click(); } });
document.addEventListener("click",e=>{ if(!e.target.closest(".search")) $("qres").hidden=true; });
async function doSearch(){
  const q=$("q").value.trim(), ul=$("qres");
  if(q.length<2){ ul.hidden=true; return; }
  const k=unacc(q), items=[], RC={HN:recurrence("HN"),HCM:recurrence("HCM")};
  Object.keys(HP).forEach(id=>{ if(unacc(HP[id][1]).includes(k)){ const n=RC[HP[id][0]].get(id)?.ev.length||0;
    items.push({name:HP[id][1],sub:`Điểm ngập ${HP[id][0]==="HN"?"Hà Nội":"TP.HCM"}${n?` · ${n} trận`:" · danh mục nguy cơ"}`,p:ptPos(id),id}); } });
  const local=items.slice(0,5);
  const render=(extra)=>{ const all=local.concat(extra); ul.innerHTML="";
    if(!all.length){ ul.innerHTML=`<li><small>Không tìm thấy</small></li>`; ul.hidden=false; return; }
    all.forEach((it,i)=>{ const li=document.createElement("li"); li.dataset.i=i;
      li.innerHTML=`<span></span><small></small>`; li.firstChild.textContent=it.name; li.lastChild.textContent=it.sub;
      li.onclick=()=>pickResult(it); ul.appendChild(li); });
    ul.hidden=false; };
  render([]);
  try{ if(qAbort) qAbort.abort(); qAbort=new AbortController();
    const c=map.getCenter();
    const r=await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lat=${c.lat.toFixed(4)}&lon=${c.lng.toFixed(4)}&bbox=102,8,110,23.5`,{signal:qAbort.signal});
    const j=await r.json();
    render(j.features.map(f=>{ const pr=f.properties; const sub=[pr.street,pr.district,pr.city||pr.county,pr.state].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(", ");
      return {name:pr.name||pr.street||"Địa điểm",sub:sub||"OpenStreetMap",p:[f.geometry.coordinates[1],f.geometry.coordinates[0]]}; }));
  }catch(e){ if(e.name!=="AbortError") console.warn(e); }
}
let qMarker=null;
function pickResult(it){
  $("qres").hidden=true; $("q").value=it.name;
  map.setView(it.p,17);
  if(it.id&&window.HIST_ON&&HIST.markers[it.id]){ HIST.markers[it.id].openPopup(); return; }
  if(qMarker) map.removeLayer(qMarker);
  qMarker=L.marker(it.p).addTo(map).bindPopup(`<b class="t"></b><br><small></small><div class="btns" style="margin-top:6px"><button data-end="a">Đi từ đây (A)</button><button data-end="b">Đến đây (B)</button></div>`).openPopup();
  const el=qMarker.getPopup().getElement(); el.querySelector(".t").textContent=it.name; el.querySelector("small").textContent=it.sub;
  el.querySelectorAll("[data-end]").forEach(b=>b.onclick=()=>{ setEnd(b.dataset.end,it.p,it.name); map.closePopup(); });
}

/* ---------------- Gắn vào vòng vẽ lịch sử ---------------- */
const _renderHist=renderHist;
renderHist=function(fit){ syncReportsIntoHistory(); _renderHist(fit); drawHalos(); renderReports(); };
const _setMode=setMode;
setMode=function(hist){ _setMode(hist);
  [HALO,REP.layer,ROUTE.layer,ROUTE.endLayer].forEach(l=>{ if(hist) map.addLayer(l); else map.removeLayer(l); });
  if(!hist&&PICK) setPick(PICK); };
const _legend2=drawLegend;
drawLegend=function(){ _legend2(); if(!window.HIST_ON) return;
  const el=$("legend"), live=dColor(22);
  el.insertAdjacentHTML("beforeend",
    ($("hHalo").checked?`<div class="lr"><span class="sw" style="background:var(--d2);opacity:.35;border-radius:50%;width:14px;height:14px"></span><span class="cm">vùng mờ</span><span>Nơi từng ngập</span></div>`:"")+
    `<div class="lr"><span class="sw" style="border-radius:50%;width:12px;height:12px;background:${live};border:2px solid var(--ink)"></span><span class="cm">nhấp nháy</span><span>Báo đang ngập (12 giờ)</span></div>`+
    (ROUTE.routes.length?`<div class="lr"><span class="sw" style="height:4px;background:var(--ok)"></span><span class="cm">tuyến</span><span>Lộ trình ít điểm ngập nhất</span></div>`:""));
};
$("tabFc").onclick=()=>setMode(false);
$("tabHist").onclick=()=>setMode(true);
syncReportsIntoHistory();
