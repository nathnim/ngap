"use strict";
/* =====================================================================
   core.js – LÕI TÍNH TOÁN bản sao số ngập đô thị
   Không phụ thuộc giao diện (không đọc DOM). Mọi thông số truyền qua tham số.
   - bboxFor      : khung vùng nghiên cứu từ tâm và cạnh (km)
   - rasterize    : lưới hóa hình học OSM thành tỷ lệ phủ trên ô
   - makeGrid     : dựng lưới mô hình (cao độ, tỷ lệ không thấm, độ nhám, ô nước, tuyến đường)
   - makeHyeto    : biểu đồ mưa thiết kế theo phút (mm/h)
   - step         : một bước thời gian của mô hình dòng chảy mặt 2D
   - stats        : diện tích ngập, độ sâu lớn nhất, thể tích đọng
   - CLASSES, clsOf : ngưỡng độ sâu theo tác động giao thông
   ===================================================================== */
const FloodCore=(()=>{

  /* Ngưỡng độ sâu (m) theo tác động giao thông – mang tính tham khảo */
  const CLASSES=[
    {lo:0.05,hi:0.15,c:"--d1",t:"Ngập nhẹ",d:"Phương tiện vẫn đi được"},
    {lo:0.15,hi:0.30,c:"--d2",t:"Xe máy khó đi",d:"Nguy cơ chết máy"},
    {lo:0.30,hi:0.50,c:"--d3",t:"Hạn chế ô tô con",d:"Xe máy không qua được"},
    {lo:0.50,hi:9e9,c:"--d5",t:"Nguy hiểm",d:"Nên cấm lưu thông"}
  ];
  const clsOf=d=>{ for(let i=CLASSES.length-1;i>=0;i--) if(d>=CLASSES[i].lo) return i; return -1; };

  /* Bề rộng quy đổi (m) theo cấp đường và loại sông, kênh trong OSM */
  const ROADW={motorway:24,trunk:20,primary:16,secondary:12,tertiary:10,unclassified:7,residential:6,living_street:5,service:4,pedestrian:5,motorway_link:8,trunk_link:8,primary_link:8,secondary_link:7,tertiary_link:6};
  const WATERW={river:40,canal:15,stream:6,drain:3,ditch:2};

  function bboxFor(c,km){
    const half=km*1000/2, dLat=half/110540, dLon=half/(111320*Math.cos(c[0]*Math.PI/180));
    return {south:c[0]-dLat,north:c[0]+dLat,west:c[1]-dLon,east:c[1]+dLon};
  }

  /* Vẽ hình học lên canvas độ phân giải S×, đọc kênh alpha → tỷ lệ phủ 0–1 mỗi ô */
  function rasterize(W,H,S,b,fn){
    const cv=(typeof OffscreenCanvas!=="undefined")?new OffscreenCanvas(W*S,H*S):Object.assign(document.createElement("canvas"),{width:W*S,height:H*S});
    const c=cv.getContext("2d"); c.fillStyle="#000"; c.strokeStyle="#000"; c.lineCap="round"; c.lineJoin="round";
    const P=(lat,lon)=>[(lon-b.west)/(b.east-b.west)*W*S,(b.north-lat)/(b.north-b.south)*H*S];
    fn(c,P);
    const d=c.getImageData(0,0,W*S,H*S).data, out=new Float32Array(W*H), WS=W*S;
    for(let y=0;y<H*S;y++){ const row=(y/S|0)*W; for(let x=0;x<WS;x++) out[row+(x/S|0)]+=d[(y*WS+x)*4+3]; }
    const k=1/(255*S*S); for(let i=0;i<out.length;i++) out[i]*=k;
    return out;
  }

  /* opt: {smooth: số lượt làm trơn DEM, baseImp: tỷ lệ không thấm nền, kerb: hạ mặt đường (m)} */
  function makeGrid(b,W,H,dx,osm,dem,cw,ch,opt){
    const {smooth=2,baseImp=0.6,kerb=0.15}=opt||{};
    const N=W*H, S=4, pxPerM=S/dx;
    const g={b,W,H,dx,N,dt:Math.max(1,Math.min(5,Math.round(dx/5))),
      z:new Float32Array(N),h:new Float32Array(N),hmax:new Float32Array(N),imp:new Float32Array(N),
      nM:new Float32Array(N),water:new Uint8Array(N),road:null,bld:null,roads:[]};
    // --- phân loại OSM
    const bld=[],hwy=[],wl=[],wp=[],grn=[];
    if(osm) for(const e of osm.elements){
      const t=e.tags||{};
      if(e.type==="way"&&e.geometry){
        if(t.building) bld.push(e.geometry);
        else if(t.highway) hwy.push(e);
        else if(t.waterway) wl.push({geom:e.geometry,w:WATERW[t.waterway]||3});
        else if(t.natural==="water"||t.landuse==="reservoir"||t.landuse==="basin") wp.push(e.geometry);
        else grn.push(e.geometry);
      }else if(e.type==="relation"&&e.members){
        for(const m of e.members) if(m.type==="way"&&m.geometry&&m.role!=="inner") wp.push(m.geometry);
      }
    }
    const poly=(c,P,geom)=>{c.beginPath();geom.forEach((p,i)=>{const[x,y]=P(p.lat,p.lon);i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.fill();};
    const line=(c,P,geom,w)=>{c.lineWidth=Math.max(1,w*pxPerM);c.beginPath();geom.forEach((p,i)=>{const[x,y]=P(p.lat,p.lon);i?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();};
    const fB=rasterize(W,H,S,b,(c,P)=>bld.forEach(gm=>poly(c,P,gm)));
    const fR=rasterize(W,H,S,b,(c,P)=>hwy.forEach(e=>line(c,P,e.geometry,ROADW[e.tags.highway]||5)));
    const fW=rasterize(W,H,S,b,(c,P)=>{wp.forEach(gm=>poly(c,P,gm));wl.forEach(o=>line(c,P,o.geom,o.w));});
    const fG=rasterize(W,H,S,b,(c,P)=>grn.forEach(gm=>poly(c,P,gm)));
    g.bld=fB; g.road=fR;
    // --- cao độ: nội suy song tuyến từ lưới DEM thô (cw×ch) về tâm ô
    if(dem){
      for(let r=0;r<H;r++) for(let c=0;c<W;c++){
        const fx=(c+0.5)/W*(cw-1), fy=(r+0.5)/H*(ch-1), x0=Math.floor(fx), y0=Math.floor(fy), x1=Math.min(cw-1,x0+1), y1=Math.min(ch-1,y0+1), tx=fx-x0, ty=fy-y0;
        const v=(i,j)=>dem[j*cw+i]??0;
        g.z[r*W+c]=(v(x0,y0)*(1-tx)+v(x1,y0)*tx)*(1-ty)+(v(x0,y1)*(1-tx)+v(x1,y1)*tx)*ty;
      }
    }else{ // địa hình giả định khi không tải được DEM: dốc nhẹ + gợn + vài vùng trũng
      let seed=7; const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
      const pits=[...Array(6)].map(()=>[rnd()*W,rnd()*H,4+rnd()*8,0.6+rnd()*1.2]);
      for(let r=0;r<H;r++) for(let c=0;c<W;c++){
        let z=8+0.004*dx*(c+r*0.6)+0.3*Math.sin(c/7)+0.25*Math.cos(r/9);
        for(const[px,py,rad,dp] of pits){const d2=((c-px)**2+(r-py)**2)/(rad*rad); z-=dp*Math.exp(-d2);}
        g.z[r*W+c]=z;
      }
    }
    const tmp=new Float32Array(N);
    for(let s=0;s<smooth;s++){
      for(let r=0;r<H;r++) for(let c=0;c<W;c++){ let a=0,n=0;
        for(let dy=-1;dy<=1;dy++) for(let dxx=-1;dxx<=1;dxx++){const rr=r+dy,cc=c+dxx; if(rr>=0&&rr<H&&cc>=0&&cc<W){a+=g.z[rr*W+cc];n++;}}
        tmp[r*W+c]=a/n; }
      g.z.set(tmp);
    }
    g.zOrig=g.z.slice();
    // --- mặt phủ: tỷ lệ không thấm, độ nhám Manning, ô nước, hạ mặt đường
    for(let k=0;k<N;k++){
      const bb=Math.min(1,fB[k]), rr=Math.min(1,fR[k]), gg=Math.min(1,fG[k]);
      const rest=Math.max(0,1-bb-rr);
      g.imp[k]=Math.min(1,bb+rr+rest*(gg*0.1+(1-gg)*baseImp));
      g.nM[k]=0.016*g.imp[k]+0.045*(1-g.imp[k]);
      g.water[k]=fW[k]>0.4?1:0;
      g.z[k]-=kerb*Math.min(1,rr*1.5);
    }
    g.zMin=Infinity;g.zMax=-Infinity;
    for(let k=0;k<N;k++){ if(g.z[k]<g.zMin)g.zMin=g.z[k]; if(g.z[k]>g.zMax)g.zMax=g.z[k]; }
    // --- tuyến đường → danh sách ô đi qua
    const toCell=(lat,lon)=>{const c=Math.floor((lon-b.west)/(b.east-b.west)*W), r=Math.floor((b.north-lat)/(b.north-b.south)*H);
      return (c<0||c>=W||r<0||r>=H)?-1:r*W+c;};
    for(const e of hwy){
      const set=new Set(), gm=e.geometry;
      for(let i=0;i<gm.length;i++){
        const a=gm[i], bq=gm[i+1]||a;
        const dm=Math.hypot((bq.lat-a.lat)*110540,(bq.lon-a.lon)*111320*Math.cos(a.lat*Math.PI/180));
        const n=Math.max(1,Math.ceil(dm/(dx/3)));
        for(let s=0;s<=n;s++){const k=toCell(a.lat+(bq.lat-a.lat)*s/n,a.lon+(bq.lon-a.lon)*s/n); if(k>=0&&!g.water[k]) set.add(k);}
      }
      if(set.size) g.roads.push({id:e.id,name:e.tags.name||"",type:e.tags.highway,geom:gm.map(p=>[p.lat,p.lon]),cells:Int32Array.from(set),cls:-2});
    }
    return g;
  }

  /* Biểu đồ mưa: {P mm, D giờ, tail giờ sau mưa, shape: "peak" | "tri" | "uni"} → cường độ mm/h theo phút */
  function makeHyeto({P,D,tail,shape}){
    const nR=Math.max(1,Math.round(D*60)), nT=nR+Math.round(tail*60), w=new Float64Array(nR);
    for(let m=0;m<nR;m++){
      const t=(m+0.5)/nR;
      if(shape==="uni") w[m]=1;
      else if(shape==="tri") w[m]= t<1/3 ? t/(1/3) : (1-t)/(2/3);
      else { const a=2.4, bb=a*(1-0.35)/0.35; w[m]=Math.pow(t,a)*Math.pow(1-t,bb); }  // đỉnh ở 35% thời gian
    }
    const s=w.reduce((a,v)=>a+v,0), arr=new Float64Array(nT);
    for(let m=0;m<nR;m++) arr[m]=P*w[m]/s*60; // mm trong phút → mm/h
    return {arr,nR,nT,P};
  }
  const intensityAt=(hy,t)=>{ const m=Math.floor(t/60); return m<hy.arr.length?hy.arr[m]:0; };

  /* Một bước Δt (s). p: {drain mm/h, infil mm/h, rise m}. Cập nhật g.h, g.hmax, sim.t, sim.acc */
  function step(g,sim,hy,p,dt){
    const {W,H,N,z,h,nM,water,imp,dx}=g, F=g.F||(g.F=new Float32Array(N)), A=sim.acc;
    const r=intensityAt(hy,sim.t)/3.6e6*dt;
    const drain=p.drain/3.6e6*dt, inf=p.infil/3.6e6*dt;
    // ① mưa rơi  ② thoát qua cống và thấm
    for(let k=0;k<N;k++){
      if(water[k]) continue;
      h[k]+=r; A.rain+=r;
      const qd=Math.min(h[k],drain); h[k]-=qd; A.drain+=qd;
      const qi=Math.min(h[k],inf*(1-imp[k])); h[k]-=qi; A.inf+=qi;
    }
    // ③ dòng chảy mặt giữa hai ô kề nhau (Manning, giới hạn ổn định)
    F.fill(0);
    const face=(a,b)=>{
      const za=z[a],zb=z[b],sa=za+h[a],sb=zb+h[b],d=sa-sb;
      if(d>-1e-6&&d<1e-6) return;
      const hf=(sa>sb?sa:sb)-(za>zb?za:zb);
      if(hf<=1e-4) return;
      const ad=d<0?-d:d;
      let v=Math.pow(hf,0.6667)*Math.sqrt(ad/dx)/((nM[a]+nM[b])*0.5);
      const vc=Math.sqrt(9.81*hf); if(v>vc) v=vc;
      const don=d>0?a:b, rec=d>0?b:a;
      let q=v*hf*dt/dx; const lim=Math.min(ad*0.25,h[don]*0.25); if(q>lim) q=lim;
      F[don]-=q; F[rec]+=q;
    };
    for(let y=0;y<H;y++){ const row=y*W;
      for(let x=0;x<W;x++){ const k=row+x; if(x<W-1) face(k,k+1); if(y<H-1) face(k,k+W); } }
    for(let k=0;k<N;k++){ const v=h[k]+F[k]; h[k]=v>0?v:0; }
    // biên hở: chảy ra ngoài theo dốc nền
    const edge=(k,kin)=>{ if(water[k]||h[k]<=1e-4) return; const s=z[kin]-z[k]; if(s<=0) return;
      let v=Math.pow(h[k],0.6667)*Math.sqrt(s/dx)/nM[k]; const vc=Math.sqrt(9.81*h[k]); if(v>vc)v=vc;
      const q=Math.min(v*h[k]*dt/dx,h[k]*0.25); h[k]-=q; A.out+=q; };
    for(let x=0;x<W;x++){ edge(x,x+W); edge((H-1)*W+x,(H-2)*W+x); }
    for(let y=1;y<H-1;y++){ edge(y*W,y*W+1); edge(y*W+W-1,y*W+W-2); }
    // ④ sông, hồ giữ mực nước = nền + nước dâng
    for(let k=0;k<N;k++){ if(!water[k]) continue; A.riv+=h[k]-p.rise; h[k]=p.rise; }
    for(let k=0;k<N;k++) if(h[k]>g.hmax[k]) g.hmax[k]=h[k];
    sim.t+=dt;
  }

  /* Thống kê: diện tích ngập ≥ 15 cm (ha), độ sâu lớn nhất (m), thể tích đọng (m³) – không tính ô sông, hồ */
  function stats(g){
    let a=0,mx=0,v=0;
    for(let k=0;k<g.N;k++){ if(g.water[k]) continue; const d=g.h[k]; v+=d; if(d>=0.15)a++; if(d>mx)mx=d; }
    const cell=g.dx*g.dx; return {area:a*cell/1e4,max:mx,vol:v*cell};
  }

  return {CLASSES,clsOf,ROADW,WATERW,bboxFor,rasterize,makeGrid,makeHyeto,intensityAt,step,stats};
})();

/* Bí danh dùng chung cho các tệp giao diện */
const {CLASSES,clsOf,ROADW,WATERW}=FloodCore;
if(typeof module!=="undefined") module.exports=FloodCore;
