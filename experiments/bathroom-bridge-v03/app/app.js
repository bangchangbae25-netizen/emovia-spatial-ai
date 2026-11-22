/* EMOVIA bathroom research UI. Manual observation only; no R01/R02, image generation, or official approvals. */
(function(){
  'use strict';
  const G=window.EMOVIABathGuard;if(!G){document.body.textContent='검증기 guard.js를 찾을 수 없습니다.';return;}
  const el=id=>document.getElementById(id);
  const can=el('planCanvas'),ctx=can.getContext('2d'),CW=can.width,CH=can.height;
  const originalHash='d7ba11207566c3cf04536179d083ac1dde90ca0bb5070603576f1ddb3dc65d0e';
  const referencePath='source/apartment_plan_1000026121.jpg';
  const samples={
    left:{source_id:'REFERENCE_1000026121_USER_ARCHIVE',source_sha256:originalHash,room_instance_id:'R1000026121_BATH_LEFT',evidence:'OBSERVED_RASTER_CANDIDATE',polygon:[[79,378],[197,378],[197,573],[79,573]],door:[197,527],basin:[111,470],toilet:[133,529],drain:null,note:'2026-11-19 수동추적 후보. 도면은 LH 66D와 다른 아파트입니다. 실제 치수·설비 모델은 미확정.'},
    right:{source_id:'REFERENCE_1000026121_USER_ARCHIVE',source_sha256:originalHash,room_instance_id:'R1000026121_BATH_RIGHT',evidence:'OBSERVED_RASTER_CANDIDATE',polygon:[[917,15],[1045,15],[1045,174],[1045,238],[892,238],[892,177],[917,177]],door:[1045,200],basin:[946,141],toilet:[943,209],drain:null,note:'꺾인 7꼭짓점 후보. 문·고정설비 위치는 픽셀 관찰 후보이며 시공 좌표가 아닙니다.'},
    lh:{source_id:'LH_GWANGJU_SEONUN_3_66D',source_sha256:null,room_instance_id:'BATHROOM_01',evidence:'SOURCE_METADATA_ONLY',polygon:[],door:null,basin:null,toilet:null,drain:null,note:'공식 자료에서는 욕실1 면적 3.34㎡만 확인했습니다. 최종 교정도면과 원본 이미지 픽셀이 없어 구조 생성 차단.'},
    user:{source_id:'USER_UPLOADED_DRAWING_UNVERIFIED',source_sha256:null,room_instance_id:'USER_BATHROOM_UNVERIFIED',evidence:'USER_DRAWN_UNVERIFIED',polygon:[],door:null,basin:null,toilet:null,drain:null,note:'사용자가 직접 그린 픽셀 경계입니다. 사람 승인이나 자동 도면인식 결과가 아닙니다.'}
  };
  const styles={
    MODERN:{label:'모던',desc:'밝은 뉴트럴 타일·그레이 플로어',floor:'#bcc0bb',wall:'#e0e1dd',line:'#697871',sky:'#f4f6f3',accent:'#3e6855',wall_finish:'LIGHT_NEUTRAL_TILE',floor_finish:'GREY_TILE',lighting_tone:'NEUTRAL',mirror_finish:'SIMPLE',accent_color:'MOSS'},
    NATURAL:{label:'내추럴',desc:'웜 베이지·샌드톤',floor:'#c6af96',wall:'#e4d4bb',line:'#9b8063',sky:'#faf6ee',accent:'#8b7051',wall_finish:'BEIGE_TILE',floor_finish:'SAND_TILE',lighting_tone:'WARM_NEUTRAL',mirror_finish:'SOFT_EDGE',accent_color:'STONE'},
    CLASSIC:{label:'클래식',desc:'아이보리·스톤·브론즈 포인트',floor:'#b8b4ad',wall:'#efe4d0',line:'#897f70',sky:'#f8f5ef',accent:'#a48b63',wall_finish:'IVORY_TILE',floor_finish:'GREY_STONE_TILE',lighting_tone:'SOFT_NEUTRAL',mirror_finish:'FRAMED',accent_color:'BRONZE'}
  };
  let active='left',state=null,base=null,locked=false,fp='',tool='none',selectedVertex=null,view='room',image=null,sourceObjectURL=null,photoObjectURL=null,photoAdded=false,sourceReady=false,history=[],log=[];
  const audLabels={walls:'벽·공간 경계',openings:'문·창·개구부',fixtures:'양변기·세면기',camera:'시점·투시 관계',scope:'비변경 영역'};
  let lastAudit=null,lastGuard=null,selStyle='MODERN';
  const clone=G.deepCopy;
  function addLog(s){log.push({at:new Date().toISOString(),event:s});if(log.length>80)log.shift();el('activitySummary').textContent='마지막 동작: '+s}
  function choose(key){
    active=key;const ref=samples[key];state={source_id:ref.source_id,source_sha256:ref.source_sha256,room_instance_id:ref.room_instance_id,coordinate_system:'IMAGE_PX',evidence:ref.evidence,revision:0,geometry:{image_size_px:key==='lh'?[1280,1096]:key==='user'?[1280,1096]:[1280,1096],polygon:clone(ref.polygon),door:ref.door&&ref.door.slice(),basin:ref.basin&&ref.basin.slice(),toilet:ref.toilet&&ref.toilet.slice(),drain:ref.drain,camera:null,dimensions_mm:null}};
    base=null;locked=false;fp='';tool='none';selectedVertex=null;history=[];image=null;sourceReady=false;lastAudit=null;lastGuard=null;view='room';
    if(sourceObjectURL){URL.revokeObjectURL(sourceObjectURL);sourceObjectURL=null}
    el('sampleSelect').value=key;
    if(key==='left'||key==='right')loadImage(window.__EMOVIA_INLINE_SOURCE__||referencePath,'REFERENCE');
    el('sourceDetail').textContent=ref.note;el('trustMessage').textContent=key==='lh'?'LH 66D는 공식 면적 자료만 확인했습니다. 다른 아파트 픽셀로 보완하지 않습니다.':key==='user'?'업로드 파일은 이 브라우저 안에서만 처리합니다. 도면 구조는 직접 확인해야 합니다.':'참조자료의 픽셀 구조를 연구용으로만 사용합니다. 실제 안목치수나 승인 Lock으로 승격하지 않습니다.';
    addLog('도면 선택: '+key);refresh();
  }
  function loadImage(url,origin){
    const img=new Image();
    img.onload=()=>{
      if(origin==='REFERENCE'&&(img.naturalWidth!==1280||img.naturalHeight!==1096)){el('sourceDetail').textContent='원본 이미지 해상도 불일치. 구조 후보를 적용하지 않습니다.';image=null;sourceReady=false;refresh();return}
      if(origin==='USER'){
        state.geometry.image_size_px=[img.naturalWidth,img.naturalHeight];state.evidence='USER_DRAWN_UNVERIFIED';state.source_sha256=null;
      }
      image=img;sourceReady=true;refresh();
    };
    img.onerror=()=>{if(origin==='REFERENCE')el('sourceDetail').textContent+=' 원본 이미지가 폴더에 없으면 업로드해서 다시 확인하십시오.';image=null;sourceReady=false;refresh()};
    img.src=url;
  }
  function pushHistory(){history.push(clone(state));if(history.length>30)history.shift()}
  function updated(action){state.revision++;if(state.evidence!=='SOURCE_METADATA_ONLY')state.evidence='USER_DRAWN_UNVERIFIED';lastAudit=null;addLog(action);refresh()}
  function viewRect(){
    const size=state.geometry.image_size_px;
    if(view==='all'||state.geometry.polygon.length<3)return {x:0,y:0,w:size[0],h:size[1]};
    const poly=state.geometry.polygon,xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]);
    const minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);
    const pad=Math.max(45,Math.max(maxx-minx,maxy-miny)*.38);
    let w=Math.min(size[0],Math.max(130,maxx-minx+pad*2)),h=Math.min(size[1],Math.max(130,maxy-miny+pad*2));
    const asp=CW/CH;if(w/h>asp)h=Math.min(size[1],w/asp);else w=Math.min(size[0],h*asp);
    return{x:Math.min(Math.max(0,(minx+maxx-w)/2),Math.max(0,size[0]-w)),y:Math.min(Math.max(0,(miny+maxy-h)/2),Math.max(0,size[1]-h)),w,h};
  }
  function transform(){const v=viewRect(),scale=Math.min(CW/v.w,CH/v.h),ox=(CW-v.w*scale)/2,oy=(CH-v.h*scale)/2;
    return {v,scale,ox,oy,toCanvas:p=>[ox+(p[0]-v.x)*scale,oy+(p[1]-v.y)*scale],toWorld:p=>[Math.max(0,Math.min(state.geometry.image_size_px[0],Math.round(v.x+(p[0]-ox)/scale))),Math.max(0,Math.min(state.geometry.image_size_px[1],Math.round(v.y+(p[1]-oy)/scale)))]};
  }
  function draw(){
    const tr=transform();ctx.clearRect(0,0,CW,CH);ctx.fillStyle='#f1f3ef';ctx.fillRect(0,0,CW,CH);
    if(image){const v=tr.v;try{ctx.drawImage(image,v.x,v.y,v.w,v.h,tr.ox,tr.oy,v.w*tr.scale,v.h*tr.scale)}catch(e){ctx.fillStyle='#637666';ctx.font='15px Arial';ctx.fillText('원본 이미지 표시 불가',20,28)}}
    else {ctx.strokeStyle='#e2e6df';ctx.lineWidth=1;for(let x=0;x<CW;x+=36){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,CH);ctx.stroke()}for(let y=0;y<CH;y+=36){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(CW,y);ctx.stroke()}}
    const poly=state.geometry.polygon;
    if(poly.length){const pts=poly.map(tr.toCanvas);ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));if(poly.length>2)ctx.closePath();ctx.fillStyle='#317a5544';ctx.fill();ctx.lineWidth=4;ctx.strokeStyle=locked?'#b15e4f':'#2e835d';ctx.setLineDash([10,5]);ctx.stroke();ctx.setLineDash([]);
      pts.forEach((p,i)=>{ctx.beginPath();ctx.arc(p[0],p[1],i===selectedVertex?10:6,0,2*Math.PI);ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=2.5;ctx.strokeStyle='#2e835d';ctx.stroke()});
    }
    for(const [key,label,col] of [['door','문','#b37b34'],['basin','세면기','#346a8d'],['toilet','양변기','#6b6594'],['drain','배수구','#8c7960']]){
      const p=state.geometry[key];if(p===null)continue;const [x,y]=tr.toCanvas(p);ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#fff';ctx.stroke();ctx.font='bold 16px Arial';ctx.fillStyle=col;ctx.fillText(label,x+13,y-10)
    }
    if(!image&&active==='lh'){ctx.fillStyle='#536a58';ctx.textAlign='center';ctx.font='bold 21px Arial';ctx.fillText('LH 66D · 구조 좌표 없음',CW/2,CH/2-5);ctx.font='16px Arial';ctx.fillText('3.34㎡ 면적만 확인 · 동일 공간 이미지 생성 차단',CW/2,CH/2+33);ctx.textAlign='left'}
    if(!image&&active==='user'){ctx.fillStyle='#536a58';ctx.textAlign='center';ctx.font='bold 19px Arial';ctx.fillText('도면 이미지를 업로드해주세요',CW/2,CH/2);ctx.textAlign='left'}
  }
  function packet(styleId){const s=styles[styleId],overlay={style_id:styleId,wall_finish:s.wall_finish,floor_finish:s.floor_finish,lighting_tone:s.lighting_tone,mirror_finish:s.mirror_finish,accent_color:s.accent_color};return {schema:G.SCHEMA,baseline:locked?clone(base):clone(state),current:clone(state),overlay,authority:{master_approval:'PENDING',receiver_ack:'NOT_RECEIVED',current_official:'NOT_VERIFIED'}}}
  function gate(){if(active==='lh')return {status:'BLOCK',code:'LH66D_PIXEL_GEOMETRY_MISSING',customer_release:false};if(active==='user'&&!sourceReady)return {status:'BLOCK',code:'USER_SOURCE_NOT_UPLOADED',customer_release:false};const result=G.inspectPacket(packet(selStyle));if(active!=='user'&&!sourceReady)return {status:'BLOCK',code:'REFERENCE_IMAGE_NOT_LOADED',customer_release:false};return result}
  function renderStyles(){
    const target=el('styleGrid');target.textContent='';for(const [id,style] of Object.entries(styles)){
      const card=document.createElement('button');card.type='button';card.className='style-card'+(selStyle===id?' selected':'');card.dataset.style=id;card.setAttribute('aria-pressed',selStyle===id?'true':'false');
      const title=document.createElement('div');title.className='style-title';title.textContent=style.label;const meta=document.createElement('span');meta.className='style-tag';meta.textContent='동일 구조';title.append(meta);card.append(title);
      card.insertAdjacentHTML('beforeend',svgDiagram(state.geometry.polygon,style));const d=document.createElement('p');d.textContent=style.desc+' · 비실측 2.5D';card.append(d);card.addEventListener('click',()=>{selStyle=id;lastGuard=gate();addLog('디자인 후보 선택: '+id);refresh()});target.append(card)
    }
  }
  function svgDiagram(poly,s){
    if(poly.length<3)return '<svg viewBox="0 0 360 220"><rect width="360" height="220" rx="8" fill="'+s.sky+'"/><text x="180" y="106" font-size="13" text-anchor="middle" fill="'+s.line+'">공간 좌표 없음</text><text x="180" y="126" font-size="11" text-anchor="middle" fill="'+s.line+'">진단 생성 보류</text></svg>';
    const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]),minx=Math.min(...xs),miny=Math.min(...ys),maxx=Math.max(...xs),maxy=Math.max(...ys),dx=Math.max(1,maxx-minx),dy=Math.max(1,maxy-miny);
    const t=p=>[180+((p[0]-minx)/dx-(p[1]-miny)/dy)*90,110+((p[0]-minx)/dx+(p[1]-miny)/dy)*42];
    const pts=poly.map(t),str=pts.map(p=>p.map(n=>n.toFixed(1)).join(',')).join(' ');
    let walls='';for(let i=0;i<pts.length;i++){
      const j=(i+1)%pts.length,a=pts[i],b=pts[j];const sourceA=poly[i],sourceB=poly[j];
      if(Math.abs(sourceA[0]-minx)+Math.abs(sourceB[0]-minx)<dx*.18||Math.abs(sourceA[1]-miny)+Math.abs(sourceB[1]-miny)<dy*.18){
        walls+='<polygon points="'+a[0].toFixed(1)+','+a[1].toFixed(1)+' '+b[0].toFixed(1)+','+b[1].toFixed(1)+' '+b[0].toFixed(1)+','+(b[1]-55).toFixed(1)+' '+a[0].toFixed(1)+','+(a[1]-55).toFixed(1)+'" fill="'+s.wall+'" fill-opacity=".88" stroke="'+s.line+'" stroke-width="1.3"/>';
      }
    }
    return '<svg viewBox="0 0 360 220" role="img" aria-label="비실측 픽셀 폴리곤 2.5D"><rect width="360" height="220" rx="8" fill="'+s.sky+'"/><ellipse cx="180" cy="162" rx="105" ry="24" fill="#313a34" opacity=".07"/><polygon points="'+str+'" fill="'+s.floor+'" stroke="'+s.line+'" stroke-width="2"/>'+walls+'<polygon points="'+str+'" fill="none" stroke="'+s.line+'" stroke-width="2"/><text x="180" y="202" text-anchor="middle" fill="'+s.line+'" font-size="11">PIXEL STRUCTURE · DIAGNOSTIC ONLY</text></svg>';
  }
  function refresh(){
    draw();renderStyles();const g=gate();lastGuard=g;
    el('roomId').textContent=state.room_instance_id;el('vertexCount').textContent=state.geometry.polygon.length+'개';el('fixtureCount').textContent=['door','basin','toilet','drain'].filter(k=>state.geometry[k]).length+'/4 후보';el('coordinateEvidence').textContent=state.evidence.replaceAll('_',' ');
    el('sourceStatus').textContent=active==='lh'?'LH 면적만 확인':active==='user'?'사용자 업로드':'원본 이미지 '+(sourceReady?'확인':'대기');el('geometryStatus').textContent=state.geometry.polygon.length>=3?'PIXEL 후보':'좌표 없음';
    el('gateStatus').textContent=g.status;el('gateStatus').className=g.status==='BLOCK'?'danger':'warning';el('candidateGate').textContent=g.status;el('candidateGate').className='p-pill '+(g.status==='BLOCK'?'block':'');
    el('candidateTitle').textContent=locked?(g.code==='CORE_STATE_MUTATED'?'구조 잠금 후보 · 변경 감지':'구조 후보 · 연구용 지문 생성'):'구조 후보 · 미잠금';
    el('fingerprint').textContent=locked?fp||'지문 생성 중':'공식 Lock ID·Hash 없음';
    el('units').textContent=active==='lh'?'SOURCE METADATA':'IMAGE_PX';el('canvasOverlayLabel').textContent=active==='lh'?'LH66D · 원본 Geometry 부재':(locked?'연구용 후보 지문 있음 · 공식 승인 아님':'원본 도면 · 픽셀 후보 · 비실측');
    el('zoomRoom').classList.toggle('selected',view==='room');el('zoomAll').classList.toggle('selected',view==='all');
    document.querySelectorAll('.tool').forEach(b=>{b.classList.toggle('active',b.dataset.tool===tool);b.setAttribute('aria-pressed',b.dataset.tool===tool?'true':'false')});
    if(state.geometry.polygon.length<3)el('candidateTitle').textContent='구조 경계 불완전 · 생성 차단';
  }
  async function fingerprint(s){
    const text=G.stable(s);if(window.crypto&&window.crypto.subtle){try{const arr=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return 'RESEARCH_SHA256 '+Array.from(new Uint8Array(arr)).map(b=>b.toString(16).padStart(2,'0')).join('')}catch(e){}}
    let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return 'RESEARCH_FNV32 '+(h>>>0).toString(16).padStart(8,'0');
  }
  function resultDisplay(code,status){const txt=(status==='BLOCK'?'차단':status==='HOLD'?'보류':status)+' · '+code+'\n원본 구조 및 승인 근거가 부족하므로 고객용 실사 생성 불가';el('guardResult').textContent=txt;el('guardResult').className='result '+(status==='BLOCK'?'fail':'warn')}
  function exportJSON(){
    const data={schema:G.SCHEMA,created_at:new Date().toISOString(),project:'1.주거공간 PROJECT',channel:'CH_EMOVIA_BATHROOM_SPECIALIST_V1',intended_use:'RESEARCH_REVIEW_ONLY',source_ref:state.source_id,raster_sha256:state.source_sha256,room_instance_id:state.room_instance_id,spatial_state:state,core_plan_state: null,official_geometry_lock:null,research_snapshot:locked?{snapshot:base,fingerprint:fp}:null,design_overlays:Object.entries(styles).map(([id,s])=>packet(id).overlay),selected_style:selStyle,gate:gate(),image_validation:lastAudit||{status:'REVIEW',code:'IMAGE_AUDIT_NOT_SUPPLIED'},actual_r01_r02_engine:'NOT_CONNECTED',customer_release:'BLOCKED',unknown:['AS_BUILT_DIMENSIONS','CAMERA_CALIBRATION','MASTER_APPROVAL','R01_R02_ACK','WATERPROOFING_AND_DRAIN_DETAIL'],events:log};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='EMOVIA_BATH_STRUCTURE_CANDIDATE_'+active+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);addLog('검증 상태 JSON 저장')
  }
  function auditControls(){const grid=el('auditGrid');for(const [k,v] of Object.entries(audLabels)){
    const wrap=document.createElement('label');wrap.className='auditfield';wrap.textContent=v;const sel=document.createElement('select');sel.dataset.audit=k;for(const [label,value] of [['확인 불가','UNKNOWN'],['일치 (수동)','PASS'],['검토 필요','REVIEW'],['불일치','FAIL']]){const o=document.createElement('option');o.textContent=label;o.value=value;sel.append(o)}wrap.append(sel);grid.append(wrap)
  }}
  el('sampleSelect').addEventListener('change',e=>choose(e.target.value));
  el('zoomRoom').addEventListener('click',()=>{view='room';refresh()});el('zoomAll').addEventListener('click',()=>{view='all';refresh()});
  document.querySelectorAll('.tool').forEach(b=>b.addEventListener('click',()=>{tool=b.dataset.tool;selectedVertex=null;refresh()}));
  can.addEventListener('click',e=>{
    if(tool==='none')return;const b=can.getBoundingClientRect(),p=transform().toWorld([(e.clientX-b.left)*CW/b.width,(e.clientY-b.top)*CH/b.height]);
    if(tool==='move'){
      if(selectedVertex===null){const t=transform();let best=Infinity,idx=null;state.geometry.polygon.forEach((q,i)=>{const c=t.toCanvas(q),dx=c[0]-(e.clientX-b.left)*CW/b.width,dy=c[1]-(e.clientY-b.top)*CH/b.height,dist=Math.hypot(dx,dy);if(dist<best){best=dist;idx=i}});if(best<24){selectedVertex=idx;el('guardResult').textContent='선택한 꼭짓점 '+(idx+1)+'을 이동할 위치를 클릭하십시오.';draw()}else el('guardResult').textContent='꼭짓점 가까이에서 먼저 선택해 주십시오.';return}
      pushHistory();state.geometry.polygon[selectedVertex]=p;selectedVertex=null;updated('꼭짓점 이동');return;
    }
    pushHistory();if(tool==='add'){if(state.geometry.polygon.length>=32){history.pop();el('guardResult').textContent='최대 32개 꼭짓점까지 지원합니다.';return}state.geometry.polygon.push(p)}else if(['door','basin','toilet','drain'].includes(tool)){state.geometry[tool]=p}else {history.pop();return}
    updated('도면 '+tool+' 위치 '+p.join(','));
  });
  el('redraw').addEventListener('click',()=>{pushHistory();state.geometry.polygon=[];tool='add';updated('경계 재작성 시작')});
  el('undo').addEventListener('click',()=>{if(history.length){state=history.pop();selectedVertex=null;addLog('마지막 도면 변경 취소');refresh()}});
  el('reset').addEventListener('click',()=>choose(active));
  el('planUpload').addEventListener('change',e=>{
    const f=e.target.files&&e.target.files[0];if(!f)return;
    if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>25*1024*1024){el('guardResult').textContent='PNG·JPG·WebP 25MB 이하 파일만 지원합니다.';return}
    choose('user');sourceObjectURL=URL.createObjectURL(f);loadImage(sourceObjectURL,'USER');state.source_id='USER_UPLOAD_'+f.name.replace(/[^a-zA-Z0-9_.-]/g,'_');state.room_instance_id='USER_BATHROOM_UNVERIFIED';el('sourceDetail').textContent='사용자 업로드 '+f.name+' · 원본 사진/도면 자동 분석 아님 · 직접 경계 지정 필요';tool='add';el('sampleSelect').value='user';addLog('사용자 도면 업로드');e.target.value='';refresh();
  });
  el('capture').addEventListener('click',async()=>{
    const g=gate();if(g.status==='BLOCK'){resultDisplay(g.code,g.status);return}
    base=clone(state);locked=true;fp='계산 중...';refresh();const digest=await fingerprint(base);if(locked&&G.stable(base)===G.stable(state)){fp=digest;addLog('구조 후보 연구 지문 생성');refresh();resultDisplay(g.code,g.status)}
  });
  el('unlock').addEventListener('click',()=>{locked=false;base=null;fp='';addLog('연구용 후보 잠금 해제 · 공식 상태 영향 없음');refresh()});
  el('check').addEventListener('click',()=>{const g=gate();const s=Object.keys(styles).map(id=>G.inspectPacket(packet(id)));const preserved=s.every(x=>x.status===g.status&&x.code===g.code);resultDisplay(g.code+' / 스타일3종 동일구조 '+(preserved?'확인':'불일치'),g.status);addLog('연결 계약 검사 '+g.status)});
  el('renderUpload').addEventListener('change',e=>{
    const f=e.target.files&&e.target.files[0];if(!f)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>25*1024*1024){el('auditResult').textContent='이미지 파일 유형/용량을 확인하십시오.';return}
    if(photoObjectURL)URL.revokeObjectURL(photoObjectURL);photoObjectURL=URL.createObjectURL(f);const img=document.createElement('img');img.src=photoObjectURL;img.alt='외부 생성 결과, 아직 검증되지 않은 욕실 이미지';const parent=el('photoPreview');parent.replaceChildren(img);photoAdded=true;lastAudit=null;addLog('외부 생성 이미지 수동 QA 등록');e.target.value='';
  });
  el('audit').addEventListener('click',()=>{
    if(!photoAdded){el('auditResult').textContent='이미지 없음 · 사후 구조 검증 진행 불가';return}
    const checks={};for(const s of document.querySelectorAll('[data-audit]'))checks[s.dataset.audit]=s.value;
    lastAudit=G.auditImage(checks);const prefix=lastAudit.status==='FAIL'?'FAIL · 구조 불일치 보고':'REVIEW · 독립 검증 미실행';
    el('auditResult').textContent=prefix+'\n'+lastAudit.code+'\n고객 제공 차단';el('auditResult').className='result '+(lastAudit.status==='FAIL'?'fail':'warn');addLog('이미지 수동 QA '+lastAudit.status);
  });
  el('download').addEventListener('click',exportJSON);
  auditControls();choose('left');
  // exposed read-only diagnostics for offline automated UI checks
  window.EMOVIA_UI_DEBUG={getStatus:()=>({active,gate:gate(),room:state.room_instance_id,polygon:clone(state.geometry.polygon),fingerprint:fp,locked,sourceReady,selectedStyle:selStyle})};
})();