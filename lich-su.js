"use strict";
/* lich-su.js – chế độ Lịch sử ngập. Phụ thuộc: app.js, data-lich-su.js */
/* ============ Trạng thái lịch sử ============ */
const HIST={city:"HN",sel:"ALL",layer:L.layerGroup(),riskLayer:L.layerGroup(),snap:{},markers:{}};
window.HIST_ON=false;
const CITYVIEW={HN:{c:[21.015,105.815],z:12},HCM:{c:[10.80,106.70],z:12}};

function dVal(d){ if(d==null||typeof d==="string") return null; return Array.isArray(d)?d[1]:d; }
function dTxt(d){ if(d==null) return "không rõ"; if(typeof d==="string") return d==="M"?"do mưa":"do triều"; return Array.isArray(d)?`${d[0]}–${d[1]} cm`:`${d} cm`; }
function dColor(d){ const v=dVal(d); if(v==null) return css("--muted"); const c=clsOf(v/100); return css(c<0?"--d1":CLASSES[c].c); }
function evOf(city,risk){ return HE.filter(e=>e.city===city&&!!e.risk===!!risk).sort((a,b)=>a.date.localeCompare(b.date)); }
function ptPos(id){ const s=HIST.snap[id]; return s?[s.lat,s.lon]:[HP[id][4],HP[id][5]]; }
function vnDate(d){ const [y,m,dd]=d.split("-"); return `${+dd}/${+m}/${y}`; }

/* ============ Chuyển chế độ ============ */
function setMode(hist){
  window.HIST_ON=hist; document.body.classList.toggle("hist",hist);
  $("tabFc").setAttribute("aria-selected",String(!hist)); $("tabHist").setAttribute("aria-selected",String(hist));
  $("fcPanel").hidden=hist; $("histPanel").hidden=!hist;
  $("readout").hidden=hist; document.querySelector(".layers #view").hidden=hist;
  const fcLayers=[floodOverlay,roadLayer,bboxRect,probeMarker].filter(Boolean);
  if(hist){ fcLayers.forEach(l=>map.hasLayer(l)&&map.removeLayer(l)); map.addLayer(HIST.layer); if($("hRisk").checked) map.addLayer(HIST.riskLayer);
    stopRun(); renderHist(true); }
  else{ map.removeLayer(HIST.layer); map.removeLayer(HIST.riskLayer);
    fcLayers.forEach(l=>{ if(l===roadLayer&&!$("roadsOn").checked) return; map.addLayer(l); });
    if(G) map.fitBounds([[G.b.south,G.b.west],[G.b.north,G.b.east]]); drawLegend(); }
}
$("tabFc").onclick=()=>setMode(false);
$("tabHist").onclick=()=>setMode(true);
document.querySelectorAll("#hCity .chip").forEach(b=>b.onclick=()=>{
  HIST.city=b.dataset.c; HIST.sel="ALL";
  document.querySelectorAll("#hCity .chip").forEach(c=>c.setAttribute("aria-pressed",String(c===b)));
  renderHist(true);
});
$("hRisk").onchange=()=>{ if($("hRisk").checked) map.addLayer(HIST.riskLayer); else map.removeLayer(HIST.riskLayer); renderHist(false); };

/* ============ Vẽ ============ */
function recurrence(city){
  const m=new Map();
  for(const e of evOf(city,false)) for(const [id,d] of e.pts){
    const o=m.get(id)||{id,ev:[],dmax:null};
    o.ev.push(e); const v=dVal(d); if(v!=null&&(o.dmax==null||v>o.dmax)) o.dmax=v;
    m.set(id,o);
  }
  return m;
}
function renderHist(fit){
  if(!HIST.refs) buildRefs();
  const city=HIST.city, evs=evOf(city,false), rec=recurrence(city), nEv=evs.length;
  // chips
  const box=$("hEvents"); box.innerHTML="";
  const mk=(id,label,y)=>{ const b=document.createElement("button"); b.className="chip"; b.type="button";
    b.innerHTML=label+(y?`<span class="y">${y}</span>`:""); b.setAttribute("aria-pressed",String(HIST.sel===id));
    b.onclick=()=>{HIST.sel=id;renderHist(true);}; box.appendChild(b); };
  mk("ALL","Tất cả các trận · tần suất");
  evs.forEach(e=>mk(e.id,vnDate(e.date),""));
  $("hCount").textContent=`${nEv} trận`;
  // layer
  HIST.layer.clearLayers(); HIST.markers={};
  const bounds=[];
  if(HIST.sel==="ALL"){
    [...rec.values()].sort((a,b)=>a.ev.length-b.ev.length).forEach(o=>{
      const p=ptPos(o.id), n=o.ev.length, snapped=!!HIST.snap[o.id];
      const col=o.dmax!=null?dColor(o.dmax):css("--panel");
      const m=L.circleMarker(p,{radius:4+n*2.6,color:css("--ink"),weight:snapped?1:1.5,dashArray:snapped?null:"3 3",fillColor:col,fillOpacity:0.8});
      m.bindPopup(popupHTML(o.id,null,rec)); m.addTo(HIST.layer); HIST.markers[o.id]=m; bounds.push(p);
    });
  }else{
    const e=HE.find(x=>x.id===HIST.sel);
    e.pts.forEach(([id,d])=>{ const p=ptPos(id), snapped=!!HIST.snap[id], v=dVal(d);
      const m=L.circleMarker(p,{radius:v!=null?6+Math.min(10,v/10):7,color:css("--ink"),weight:snapped?1:1.5,dashArray:snapped?null:"3 3",
        fillColor:v!=null?dColor(d):css("--panel"),fillOpacity:v!=null?0.85:0.9});
      m.bindPopup(popupHTML(id,e,rec)); m.addTo(HIST.layer); HIST.markers[id]=m; bounds.push(p); });
  }
  // danh mục nguy cơ
  HIST.riskLayer.clearLayers();
  evOf(city,true).forEach(e=>e.pts.forEach(([id,lvl])=>{
    const p=ptPos(id);
    L.marker(p,{icon:L.divIcon({className:"",html:`<div style="width:14px;height:14px;transform:rotate(45deg);border:2px solid ${css("--warn")};background:${css("--panel")};opacity:.9"></div>`,iconSize:[14,14],iconAnchor:[7,7]})})
      .bindPopup(`<b class="t">${HP[id][1]}</b><br>${e.title}<br>${typeof lvl==="string"?(lvl==="M"?"Ngập do mưa":"Ngập do triều"):`Dự kiến ngập khi mưa ${lvl===50?"50–70":"trên 70"} mm/h`}<br>Đã ghi nhận ngập ${rec.get(id)?.ev.length||0} trận`)
      .addTo(HIST.riskLayer);
    if($("hRisk").checked) bounds.push(p);
  }));
  if(fit&&bounds.length){
    // bỏ điểm quá xa (Vũng Tàu) khi khung nhìn chính
    const core=bounds.filter(p=>Math.hypot(p[0]-CITYVIEW[city].c[0],p[1]-CITYVIEW[city].c[1])<0.35);
    map.fitBounds(L.latLngBounds(core.length?core:bounds),{padding:[30,30],maxZoom:15});
  }
  renderCard(rec); renderPtList(rec); drawHistChart(); drawLegend();
}
function popupHTML(id,e,rec){
  const o=rec.get(id), s=HIST.snap[id];
  let h=`<b class="t">${HP[id][1]}</b><br>`;
  if(e){ const d=e.pts.find(p=>p[0]===id)[1]; h+=`${e.title}<br>Độ sâu ghi nhận: <b>${dTxt(d)}</b>${dVal(d)==null&&e.depthNote?` (cả trận: ${e.depthNote[0]??"đến"}${e.depthNote[0]?"–":" "}${e.depthNote[1]} cm)`:""}<br>`; }
  if(o) h+=`Ngập ${o.ev.length}/${evOf(HIST.city,false).length} trận: ${o.ev.map(x=>x.date.slice(0,4)).join(", ")}<br>`;
  h+=`<span style="color:var(--muted)">Vị trí: ${s?s.how:"gần đúng, chưa khớp OSM"}</span><br>`;
  h+=`<a href="#" data-sim="${id}">Mô phỏng dự báo tại đây →</a>`;
  return h;
}
map.on("popupopen",ev=>{ const a=ev.popup.getElement().querySelector("[data-sim]"); if(!a) return;
  a.onclick=x=>{ x.preventDefault(); const p=ptPos(a.dataset.sim); center=p; map.closePopup(); setMode(false); map.setView(p,15); drawBBox(); build(); }; });

function renderCard(rec){
  const c=$("hCard");
  if(HIST.sel==="ALL"){
    const evs=evOf(HIST.city,false), n=rec.size, multi=[...rec.values()].filter(o=>o.ev.length>=3).length;
    c.innerHTML=`<div class="t">${HIST.city==="HN"?"Hà Nội":"TP.HCM"} · ${evs[0].date.slice(0,4)}–${evs[evs.length-1].date.slice(0,4)}</div>
      <div class="meta">${evs.length} trận · ${n} điểm ghi nhận · ${multi} điểm ngập từ 3 trận trở lên</div>
      <div>Kích thước vòng tròn là số trận điểm đó bị ngập; màu là độ sâu lớn nhất từng ghi nhận (nền trắng nếu chưa có số đo).</div>`;
    return;
  }
  const e=HE.find(x=>x.id===HIST.sel);
  c.innerHTML=`<div class="t">${e.title}</div>
    <div class="meta">${vnDate(e.date)}${e.end?" – "+vnDate(e.end):""} · ${e.cause}</div>
    <div><b>Mưa/triều:</b> ${e.rain}</div>
    <div><b>Quy mô:</b> ${e.total?e.total+" điểm được báo cáo; ":""}${e.pts.length} điểm có tên trên bản đồ. ${e.note}</div>
    <div class="meta">Nguồn: ${refNums(e).length?"":"dữ liệu bạn nhập"}${refNums(e).map(n=>`<a href="#ref-${n}" class="refn" data-ref="${n}">[${n}]</a>`).join(" ")}</div>`;
  c.querySelectorAll(".refn").forEach(a=>a.onclick=ev=>{ ev.preventDefault(); const t=$("ref-"+a.dataset.ref); if(t){ t.scrollIntoView({behavior:"smooth",block:"center"}); t.classList.add("hl"); setTimeout(()=>t.classList.remove("hl"),1600);} });
}
/* ============ Tài liệu tham khảo (đánh số chung, liệt kê ở cuối bảng) ============ */
function buildRefs(){
  const refs=[], key=new Map();
  ["HN","HCM"].forEach(city=>HE.filter(e=>e.city===city&&!e.mine).sort((a,b)=>a.date.localeCompare(b.date)).forEach(e=>e.src.forEach(([t,u])=>{
    if(u==="#") return;
    if(!key.has(u)){ key.set(u,refs.length+1); refs.push({n:refs.length+1,t,u,city,ev:[]}); }
    refs[key.get(u)-1].ev.push(e);
  })));
  HIST.refs=refs; HIST.refKey=key;
  const box=$("refList"); if(!box) return;
  box.innerHTML=["HN","HCM"].map(city=>`<h3>${city==="HN"?"Hà Nội":"TP.HCM"}</h3><ol>`+refs.filter(r=>r.city===city).map(r=>
    `<li id="ref-${r.n}" value="${r.n}"><a href="${r.u}" target="_blank" rel="noopener">${r.t}</a><br><span>${r.ev.map(e=>(e.risk?"Danh mục ":"Trận ")+vnDate(e.date)).join("; ")}</span></li>`).join("")+`</ol>`).join("");
}
function refNums(e){ return e.src.map(s=>HIST.refKey?.get(s[1])).filter(Boolean); }
function renderPtList(rec){
  const ul=$("hPts"); ul.innerHTML="";
  let rows;
  if(HIST.sel==="ALL") rows=[...rec.values()].sort((a,b)=>b.ev.length-a.ev.length||(b.dmax??-1)-(a.dmax??-1)).map(o=>({id:o.id,n:o.ev.length,d:o.dmax}));
  else{ const e=HE.find(x=>x.id===HIST.sel); rows=e.pts.map(([id,d])=>({id,n:rec.get(id)?.ev.length||0,d})).sort((a,b)=>(dVal(b.d)??-1)-(dVal(a.d)??-1)||b.n-a.n); }
  const nEv=evOf(HIST.city,false).length;
  $("hPtsN").textContent=`${rows.length} điểm`;
  rows.slice(0,40).forEach(r=>{ const li=document.createElement("li"); li.className="h";
    const dots=`<span class="dots" title="${r.n}/${nEv} trận">${Array.from({length:nEv},(_,i)=>`<i class="${i<r.n?"on":""}"></i>`).join("")}</span>`;
    li.innerHTML=`<span class="nm"></span>${dots}<span class="dp">${HIST.sel==="ALL"?(r.d!=null?"max "+r.d+" cm":"—"):dTxt(r.d)}</span>`;
    li.querySelector(".nm").textContent=HP[r.id][1];
    li.onclick=()=>{ map.setView(ptPos(r.id),16); HIST.markers[r.id]?.openPopup(); };
    ul.appendChild(li); });
  if(rows.length>40){ const li=document.createElement("li"); li.className="empty"; li.style.cursor="default"; li.textContent=`… và ${rows.length-40} điểm khác (xem trong CSV).`; ul.appendChild(li); }
}
function drawHistChart(){
  const cv=$("hChart"); if(cv.offsetParent===null) return; const [c,w,h]=prepCanvas(cv);
  const evs=evOf(HIST.city,false), Lm=26,R=6,T=8,B=30,pw=w-Lm-R,ph=h-T-B;
  const vals=evs.map(e=>e.total||e.pts.length), mx=niceMax(Math.max(...vals));
  c.font="10px "+css("--f-mono"); c.strokeStyle=css("--line"); c.fillStyle=css("--muted");
  for(let j=0;j<=2;j++){ const y=T+ph*j/2; c.beginPath(); c.moveTo(Lm,y); c.lineTo(Lm+pw,y); c.stroke(); c.textAlign="right"; c.fillText(fmt(mx*(1-j/2)),Lm-4,y+3); }
  const bw=pw/evs.length; HIST.bars=[];
  evs.forEach((e,i)=>{ const v=vals[i], bh=ph*v/mx, x=Lm+i*bw+bw*0.18, ww=bw*0.64;
    c.fillStyle=css(HIST.sel===e.id?"--accent":"--rain"); c.globalAlpha=HIST.sel===e.id||HIST.sel==="ALL"?0.9:0.45;
    c.fillRect(x,T+ph-bh,ww,bh);
    if(!e.total){ c.globalAlpha=1; c.strokeStyle=css("--muted"); c.setLineDash([2,2]); c.strokeRect(x,T+ph-bh,ww,bh); c.setLineDash([]); c.strokeStyle=css("--line"); }
    c.globalAlpha=1; c.fillStyle=css("--ink"); c.textAlign="center"; c.fillText(String(v),x+ww/2,T+ph-bh-3);
    c.fillStyle=css("--muted"); c.fillText(e.date.slice(0,4),x+ww/2,T+ph+12); c.fillText(e.date.slice(5).split("-").reverse().join("/"),x+ww/2,T+ph+24);
    HIST.bars.push([x,x+ww,e.id]); });
}
$("hChart").addEventListener("click",ev=>{ const r=$("hChart").getBoundingClientRect(), x=ev.clientX-r.left;
  const b=(HIST.bars||[]).find(b=>x>=b[0]-4&&x<=b[1]+4); if(b){ HIST.sel=HIST.sel===b[2]?"ALL":b[2]; renderHist(true);} });

/* chú giải */
const _legend=drawLegend;
drawLegend=function(){
  if(!window.HIST_ON) return _legend();
  const el=$("legend");
  el.innerHTML=`<h3>${HIST.sel==="ALL"?"Tần suất ngập · độ sâu lớn nhất":"Độ sâu ghi nhận"}</h3>`+
    CLASSES.map(k=>`<div class="lr"><span class="sw" style="background:var(${k.c})"></span><span class="cm">${fmt(k.lo*100)}${k.hi<9?"–"+fmt(k.hi*100):"+"} cm</span><span>${k.t}</span></div>`).join("")+
    `<div class="lr"><span class="sw" style="border:1.5px solid var(--ink);background:var(--panel)"></span><span class="cm">—</span><span>Có ngập, không rõ độ sâu</span></div>`+
    (HIST.sel==="ALL"?`<div class="lr"><span class="sw" style="border-radius:50%;width:14px;height:14px;border:1px solid var(--ink)"></span><span class="cm">○ ◯</span><span>Ngập nhiều trận hơn</span></div>`:"")+
    `<div class="lr"><span class="sw" style="border:1.5px dashed var(--ink)"></span><span class="cm">- - -</span><span>Vị trí gần đúng</span></div>`+
    ($("hRisk").checked?`<div class="lr"><span class="sw" style="transform:rotate(45deg);width:10px;height:10px;border:2px solid var(--warn)"></span><span class="cm">◇</span><span>Điểm có nguy cơ (danh mục)</span></div>`:"");
};

/* ============ Bắt vị trí vào OSM ============ */
const norm=s=>s.toLowerCase().normalize("NFC").replace(/^(phố|đường|ngõ)\s+/,"").trim();
async function snapCity(city){
  const ids=Object.keys(HP).filter(id=>HP[id][0]===city&&HP[id][2]);
  const cc=CITYVIEW[city].c, near=ids.filter(id=>Math.hypot(HP[id][4]-cc[0],HP[id][5]-cc[1])<0.35);
  const names=[...new Set(near.flatMap(id=>[HP[id][2],HP[id][3]]).filter(Boolean))];
  const lat=near.map(id=>HP[id][4]), lon=near.map(id=>HP[id][5]);
  const bb=`${Math.min(...lat)-0.02},${Math.min(...lon)-0.02},${Math.max(...lat)+0.02},${Math.max(...lon)+0.02}`;
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const q=`[out:json][timeout:90];way["highway"]["name"~"^((Phố|Đường) )?(${names.map(esc).join("|")})$",i](${bb});out geom;`;
  const eps=["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter","https://overpass.private.coffee/api/interpreter"];
  let j=null;
  for(const ep of eps){ try{ j=await fetchJSON(ep,{method:"POST",body:"data="+encodeURIComponent(q),headers:{"Content-Type":"application/x-www-form-urlencoded"}},120000); break; }catch(e){ console.warn(e); } }
  if(!j) return 0;
  const byName=new Map();
  for(const w of j.elements){ if(!w.geometry) continue; const k=norm(w.tags.name); if(!byName.has(k)) byName.set(k,[]); byName.get(k).push(w.geometry); }
  const mPerDeg=(la)=>[110540,111320*Math.cos(la*Math.PI/180)];
  const dist=(a,b)=>{ const [ky,kx]=mPerDeg(a[0]); return Math.hypot((a[0]-b[0])*ky,(a[1]-b[1])*kx); };
  const project=(p,a,b)=>{ const [ky,kx]=mPerDeg(p[0]); const ax=(a[1]-p[1])*kx, ay=(a[0]-p[0])*ky, bx=(b[1]-p[1])*kx, by=(b[0]-p[0])*ky;
    const dx=bx-ax, dy=by-ay, L2=dx*dx+dy*dy; let t=L2?-(ax*dx+ay*dy)/L2:0; t=Math.max(0,Math.min(1,t));
    return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]; };
  let n=0;
  for(const id of near){
    const [, , st, xs, la, lo]=HP[id], P=[la,lo];
    const A=byName.get(norm(st)); if(!A) continue;
    if(xs){ const B=byName.get(norm(xs));
      if(B){ let best=null,bd=1e9;
        for(const ga of A) for(const pa of ga){ const qa=[pa.lat,pa.lon]; if(dist(qa,P)>1500) continue;
          for(const gb of B) for(const pb of gb){ const d=dist(qa,[pb.lat,pb.lon]); if(d<bd){bd=d;best=[(pa.lat+pb.lat)/2,(pa.lon+pb.lon)/2];} } }
        if(best&&bd<60){ HIST.snap[id]={lat:best[0],lon:best[1],how:"giao lộ trên OSM"}; n++; continue; } } }
    let best=null,bd=1e9;
    for(const g of A) for(let i=0;i<g.length-1;i++){ const q=project(P,[g[i].lat,g[i].lon],[g[i+1].lat,g[i+1].lon]), d=dist(q,P); if(d<bd){bd=d;best=q;} }
    if(best&&bd<1200){ HIST.snap[id]={lat:best[0],lon:best[1],how:`trên tuyến ${st} (OSM)`}; n++; }
  }
  return n;
}
async function snapAll(){
  try{ const c=JSON.parse(localStorage.getItem("floodSnapV1")||"null"); if(c){ HIST.snap=c; } }catch(e){}
  const total=Object.keys(HP).length;
  if(Object.keys(HIST.snap).length){ $("hGeo").textContent=`Vị trí: ${Object.keys(HIST.snap).length}/${total} điểm đã khớp với tuyến phố, giao lộ OSM (lưu trong trình duyệt).`; return; }
  let n=0; for(const c of ["HN","HCM"]){ $("hGeo").textContent=`Vị trí: đang đối chiếu với OpenStreetMap (${c==="HN"?"Hà Nội":"TP.HCM"})…`; n+=await snapCity(c); }
  try{ localStorage.setItem("floodSnapV1",JSON.stringify(HIST.snap)); }catch(e){}
  $("hGeo").textContent= n? `Vị trí: ${n}/${total} điểm đã khớp với tuyến phố, giao lộ OSM; còn lại là vị trí gần đúng (viền đứt).`
                          : "Vị trí: chưa kết nối được OpenStreetMap, đang dùng vị trí gần đúng (viền đứt).";
  if(window.HIST_ON) renderHist(false);
}

/* ============ Nhập / xuất ============ */
function parseCSV(t){ const rows=[]; let r=[],f="",q=false;
  for(let i=0;i<t.length;i++){ const ch=t[i];
    if(q){ if(ch==='"'){ if(t[i+1]==='"'){f+='"';i++;} else q=false; } else f+=ch; }
    else if(ch==='"') q=true; else if(ch===","||ch===";"){ r.push(f); f=""; } else if(ch==="\n"){ r.push(f); rows.push(r); r=[]; f=""; } else if(ch!=="\r") f+=ch; }
  if(f||r.length){ r.push(f); rows.push(r); } return rows.filter(x=>x.some(v=>v.trim())); }
$("hImport").onchange=async ev=>{
  const file=ev.target.files[0]; if(!file) return;
  const rows=parseCSV((await file.text()).replace(/^﻿/,"")), head=rows.shift().map(h=>h.trim().toLowerCase());
  const ix=k=>head.indexOf(k), need=["thanh_pho","ngay","ten_diem","vi_do","kinh_do"];
  if(need.some(k=>ix(k)<0)){ $("hGeo").textContent="Không nhập được: thiếu cột "+need.filter(k=>ix(k)<0).join(", ")+"."; return; }
  const groups=new Map(); let n=0;
  rows.forEach((r,i)=>{ const city=r[ix("thanh_pho")].trim().toUpperCase().replace("TPHCM","HCM").replace("HN","HN");
    const la=parseFloat(r[ix("vi_do")]), lo=parseFloat(r[ix("kinh_do")]); if(!(city==="HN"||city==="HCM")||isNaN(la)||isNaN(lo)) return;
    const id="u"+Date.now().toString(36)+i; HP[id]=[city,r[ix("ten_diem")].trim()||"Điểm "+(i+1),"","",la,lo]; HIST.snap[id]={lat:la,lon:lo,how:"tọa độ từ CSV của bạn"};
    const dc=ix("do_sau_cm")>=0?parseFloat(r[ix("do_sau_cm")]):NaN, date=r[ix("ngay")].trim(), key=city+date;
    if(!groups.has(key)) groups.set(key,{id:"U"+key,city,date,title:"Dữ liệu nhập "+vnDate(date),cause:"Dữ liệu người dùng",rain:"—",total:null,note:ix("ghi_chu")>=0?r[ix("ghi_chu")]:"",src:[["Tệp "+file.name,"#"]],pts:[]});
    groups.get(key).pts.push([id,isNaN(dc)?null:dc]); n++; });
  groups.forEach(g=>{ const old=HE.findIndex(e=>e.id===g.id); if(old>=0) HE[old].pts.push(...g.pts); else HE.push(g); });
  $("hGeo").textContent=`Đã nhập ${n} điểm, ${groups.size} trận từ ${file.name}.`;
  ev.target.value=""; HIST.refs=null; renderHist(true);
};
function histRows(){
  const rows=[];
  HE.forEach(e=>e.pts.forEach(([id,d])=>{ const p=ptPos(id); rows.push({thanh_pho:e.city,loai:e.risk?"danh_muc_nguy_co":"tran_ngap",ngay:e.date,tran:e.title,ten_diem:HP[id][1],vi_do:p[0].toFixed(6),kinh_do:p[1].toFixed(6),
    do_sau_cm:typeof d==="string"?d:(Array.isArray(d)?d.join("-"):(d??"")),vi_tri:HIST.snap[id]?.how||"gan dung",nguon:e.src[0][1]}); }));
  return rows;
}
$("hCsv").onclick=()=>{ const r=histRows(), k=Object.keys(r[0]);
  download("lich_su_ngap_HN_HCM.csv",[k.join(",")].concat(r.map(o=>k.map(x=>`"${String(o[x]).replace(/"/g,'""')}"`).join(","))).join("\n")); };
$("hGeoJSON").onclick=()=>{ const fc={type:"FeatureCollection",features:histRows().map(o=>({type:"Feature",geometry:{type:"Point",coordinates:[+o.kinh_do,+o.vi_do]},properties:o}))};
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([JSON.stringify(fc)],{type:"application/geo+json"})); a.download="lich_su_ngap_HN_HCM.geojson"; a.click(); };

window.addEventListener("resize",()=>{ if(window.HIST_ON) drawHistChart(); });
snapAll();
