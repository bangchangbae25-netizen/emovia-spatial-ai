/* EMOVIA Bathroom Raster Intake v0.4 / independent research. Never auto-promotes Geometry to official. */

(function(root){'use strict';

function roiRect(roi,w,h){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<24||h<24)throw Error("INVALID_IMAGE_SIZE");
 if(!roi||typeof roi!=="object")throw Error("ROI_REQUIRED");
 const x=Math.max(0,Math.floor(Number(roi.x))),y=Math.max(0,Math.floor(Number(roi.y)));
 const right=Math.min(w,Math.ceil(Number(roi.x)+Number(roi.w))),bottom=Math.min(h,Math.ceil(Number(roi.y)+Number(roi.h)));
 if(![x,y,right,bottom].every(Number.isFinite)||right-x<24||bottom-y<24)throw Error("ROI_TOO_SMALL");
 return {x,y,w:right-x,h:bottom-y};
}

function grayscaleAt(p,index){
 const a=p[index+3]/255;
 const r=a*p[index]+(1-a)*255,g=a*p[index+1]+(1-a)*255,b=a*p[index+2]+(1-a)*255;
 return Math.max(0,Math.min(255,Math.round(0.299*r+0.587*g+0.114*b)));
}

function otsuThreshold(hist,total){
 if(!Number.isInteger(total)||total<=0)throw Error("NO_PIXELS");
 let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];
 let wB=0,sB=0,best=-1,threshold=120;
 for(let t=0;t<256;t++){
  wB+=hist[t];if(!wB)continue;
  const wF=total-wB;if(!wF)break;
  sB+=t*hist[t];
  const mb=sB/wB,mf=(sum-sB)/wF,score=wB*wF*(mb-mf)*(mb-mf);
  if(score>best){best=score;threshold=t;}
 }
 return Math.max(55,Math.min(200,threshold));
}

function lineCandidates(img,roi,opts){
 if(!img||!img.data||!Number.isInteger(img.width)||!Number.isInteger(img.height)||img.data.length<img.width*img.height*4)throw Error("INVALID_RGBA_IMAGE");
 const rect=roiRect(roi,img.width,img.height);
 if(rect.w*rect.h>4200000)throw Error("ROI_EXCEEDS_PIXELS_LIMIT");
 const minLength=Math.max(12,Math.round(Number(opts&&opts.minLineLength)||Math.min(rect.w,rect.h)*.34));
 const histogram=new Uint32Array(256),grey=new Uint8Array(rect.w*rect.h);
 let q=0;
 for(let y=0;y<rect.h;y++)for(let x=0;x<rect.w;x++){
  const idx=((rect.y+y)*img.width+rect.x+x)*4;
  const v=grayscaleAt(img.data,idx);grey[q++]=v;histogram[v]++;
 }
 const threshold=opts&&Number.isFinite(opts.threshold)?Math.max(0,Math.min(255,Math.round(opts.threshold))):otsuThreshold(histogram,grey.length);
 const mask=new Uint8Array(grey.length);
 let dark=0;for(let i=0;i<grey.length;i++){mask[i]=(grey[i]<=threshold)?1:0;dark+=mask[i];}
 const raw=[];
 for(let y=0;y<rect.h;y++){
  let start=-1;
  for(let x=0;x<=rect.w;x++){
   const on=x<rect.w&&mask[y*rect.w+x];
   if(on&&start<0)start=x;
   if(!on&&start>=0){const end=x-1;if(end-start+1>=minLength)raw.push({axis:"H",position:rect.y+y,start:rect.x+start,end:rect.x+end,length:end-start+1});start=-1;}
  }
 }
 for(let x=0;x<rect.w;x++){
  let start=-1;
  for(let y=0;y<=rect.h;y++){
   const on=y<rect.h&&mask[y*rect.w+x];
   if(on&&start<0)start=y;
   if(!on&&start>=0){const end=y-1;if(end-start+1>=minLength)raw.push({axis:"V",position:rect.x+x,start:rect.y+start,end:rect.y+end,length:end-start+1});start=-1;}
  }
 }
 raw.sort((a,b)=>a.axis.localeCompare(b.axis)||a.position-b.position||b.length-a.length);
 const clusters=[];
 for(const s of raw){
  let c=null;
  for(let i=clusters.length-1;i>=0;i--){
   const z=clusters[i];if(z.axis!==s.axis)continue;
   if(Math.abs(z.position-s.position)>4)continue;
   const common=Math.max(0,Math.min(s.end,z.end)-Math.max(s.start,z.start)+1);
   if(common<Math.min(s.length,z.length)*.4)continue;
   c=z;break;
  }
  if(c){c.position=Math.round((c.position*c.support+s.position)/(c.support+1));c.start=Math.min(c.start,s.start);c.end=Math.max(c.end,s.end);c.support++;}
  else clusters.push({...s,support:1});
 }
 const segments=clusters.sort((a,b)=>b.end-b.start-(a.end-a.start)).slice(0,Math.max(1,Math.min(120,opts&&opts.maxCandidates||80))).map((v,i)=>({
  id:"LINE_"+String(i+1).padStart(3,"0"),orientation:v.axis,from:v.axis==="H"?[v.start,v.position]:[v.position,v.start],to:v.axis==="H"?[v.end,v.position]:[v.position,v.end],
  length_px:v.end-v.start+1,support_rows_or_cols:v.support,evidence:"OBSERVED_PIXEL_DARK_RUN",classification:"UNVERIFIED_WALL_CANDIDATE"
 }));
 return{schema:"EMOVIA_RASTER_INTAKE_V0_4",source_method:"RGBA_ORIGINAL_PIXEL_ROI",roi:rect,threshold,ink_ratio:Number((dark/grey.length).toFixed(4)),min_line_length_px:minLength,candidates:segments,diagnostics:{raw_runs:raw.length,clusters:clusters.length,axis_aligned_only:true,wall_semantics_verified:false,metric_geometry_available:false}};
}

function verifiedScale(anchors){
 const fail=(code)=>({status:"HOLD",code,scale_mm_per_px:null});
 if(!Array.isArray(anchors))return fail("NO_ANCHORS");
 const v={X:[],Y:[]};
 for(const a of anchors){
  if(!a||!["X","Y"].includes(a.axis)||!["MEASURED","DOCUMENTED_REFERENCE"].includes(a.evidence)||typeof a.source_ref!=="string"||!a.source_ref.trim()
    ||!Number.isFinite(a.pixels)||!Number.isFinite(a.millimeters)||a.pixels<=0||a.millimeters<=0)return fail("INVALID_OR_UNVERIFIED_ANCHOR");
  v[a.axis].push(a.millimeters/a.pixels);
 }
 if(v.X.length<2||v.Y.length<2)return fail("INSUFFICIENT_INDEPENDENT_ANCHORS");
 const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
 const sx=mean(v.X),sy=mean(v.Y);
 const maxErr=Math.max(...v.X.map(x=>Math.abs(x-sx)/sx),...v.Y.map(x=>Math.abs(x-sy)/sy));
 if(maxErr>.015)return fail("ANCHOR_SCALE_CONFLICT");
 if(Math.abs(sx-sy)/((sx+sy)/2)>.025)return fail("PIXEL_SCALE_ANISOTROPY");
 return{status:"REVIEW",code:"METRIC_SCALE_CANDIDATE_NEEDS_HUMAN_VERIFY",scale_mm_per_px:{x:sx,y:sy},maximum_relative_anchor_disagreement:maxErr,official_geometry_lock:false};
}

function candidateHandoff(input){
 const stop=(code)=>({status:"HOLD",code,cadlike_validate_ready:false,official_lock:false});
 if(!input||typeof input!=="object"||typeof input.source_id!=="string"||!input.source_id||typeof input.room_id!=="string"||!input.room_id)return stop("IDENTITY_MISSING");
 if(!input.image_sha256||!/^[a-f0-9]{64}$/i.test(input.image_sha256))return stop("SOURCE_SHA256_REQUIRED");
 if(!input.operator_review||input.operator_review!=="REVIEWED")return stop("OPERATOR_REVIEW_REQUIRED");
 if(!input.polygon_px||!Array.isArray(input.polygon_px)||input.polygon_px.length<3)return stop("CLOSED_BOUNDARY_NOT_CONFIRMED");
 const scale=verifiedScale(input.anchors||[]);
 if(scale.status!=="REVIEW")return stop(scale.code);
 const converted=input.polygon_px.map(pt=>{
  if(!Array.isArray(pt)||pt.length!==2||pt.some(x=>!Number.isFinite(x)))return null;
  return[Number((pt[0]*scale.scale_mm_per_px.x).toFixed(2)),Number((pt[1]*scale.scale_mm_per_px.y).toFixed(2))];
 });
 if(converted.some(x=>x===null))return stop("INVALID_BOUNDARY_COORDINATES");
 if(!input.wall_height_mm||!input.wall_thickness_mm||!input.door_host_id||!input.door_width_mm||!input.door_height_mm)return {status:"HOLD",code:"WALL_OPENING_FIELD_EVIDENCE_MISSING",cadlike_validate_ready:false,official_lock:false,derived_polygon_mm_candidate:converted,units:"MM_DERIVED_CANDIDATE_NOT_MEASURED"};
 const evidence=input.dimension_evidence||{};
 for(const k of ["wall_height_mm","wall_thickness_mm","door_width_mm","door_height_mm"]){
  if(!["MEASURED","DOCUMENTED_REFERENCE"].includes(evidence[k]))return stop("DIMENSION_EVIDENCE_MISSING_"+k);
  if(input[k]<=0||!Number.isFinite(input[k]))return stop("INVALID_DIMENSION_"+k);
 }
 return{status:"REVIEW",code:"CAN_BUILD_CADLIKE_DRAFT_ONLY",cadlike_validate_ready:true,official_lock:false,derived_polygon_mm_candidate:converted,units:"MM_DERIVED_CANDIDATE_NOT_MEASURED",requires:["CANONICAL_WALL_TOPOLOGY","INDEPENDENT_SITE_APPROVAL","CADLIKE_ENGINE_VALIDATE","MASTER_PLAN_STATE_APPROVAL"]};
}

const api={roiRect,grayscaleAt,otsuThreshold,lineCandidates,verifiedScale,candidateHandoff};

if(typeof module!=='undefined'&&module.exports)module.exports=api;

root.EMOVIARasterIntakeV04=api;

})(typeof globalThis!=='undefined'?globalThis:this);

