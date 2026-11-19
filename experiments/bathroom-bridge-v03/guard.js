/* EMOVIA bathroom research bridge v0.3. No official approvals or image-model integration. */

(function(root){ 'use strict';

const SCHEMA="EMOVIA_BATH_BRIDGE_RESEARCH_V0_3";

const OVERLAY_FIELDS=["style_id","wall_finish","floor_finish","lighting_tone","mirror_finish","accent_color"];

const FORBIDDEN="(?:매립\\s*형|니치|벽체\\s*(?:철거|신설|이동|변경|증설)|새\\s*벽|샤워\\s*(?:부스|파티션|구획)\\s*(?:추가|신설)?|변기\\s*(?:이동|이설)|세면\\s*(?:대|기)\\s*(?:이동|이설)|recessed[_ -]?niche|new[_ -]?wall|move[_ -]?(?:toilet|basin)|added[_ -]?shower|shower[_ -]?booth)";

function deepCopy(x){return JSON.parse(JSON.stringify(x))}

function stable(x){
 if(x===null||typeof x!=="object")return JSON.stringify(x);
 if(Array.isArray(x))return "["+x.map(stable).join(",")+"]";
 return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+stable(x[k])).join(",")+"}";
}

function polygonQuality(pts,wh){
 if(!Array.isArray(pts)||pts.length<3||pts.length>32)return "POLYGON_MISSING_OR_TOO_MANY";
 if(!Array.isArray(wh)||wh.length!==2||wh.some(x=>!Number.isFinite(x)||x<=0))return "INVALID_IMAGE_DIMENSIONS";
 const seen=new Set(), n=pts.length;
 for(const p of pts){
   if(!Array.isArray(p)||p.length!==2||p.some(x=>!Number.isFinite(x)))return "NON_NUMERIC_VERTEX";
   if(p[0]<0||p[1]<0||p[0]>wh[0]||p[1]>wh[1])return "VERTEX_OUTSIDE_IMAGE";
   const key=p.join(",");
   if(seen.has(key))return "DUPLICATE_VERTEX";
   seen.add(key);
 }
 let twice=0;
 for(let i=0;i<n;i++){const q=pts[(i+1)%n],p=pts[i];twice+=p[0]*q[1]-q[0]*p[1]}
 if(Math.abs(twice)<8)return "DEGENERATE_POLYGON";
 function cross(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])}
 function overlap(a,b,c,d){
  const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);
  return ab1*ab2<0&&cd1*cd2<0;
 }
 for(let i=0;i<n;i++){
  for(let j=i+2;j<n;j++){
    if(i===0&&j===n-1)continue;
    if(overlap(pts[i],pts[(i+1)%n],pts[j],pts[(j+1)%n]))return "SELF_INTERSECTING_POLYGON";
  }
 }
 return null;
}

function inspectPacket(pkt){
 const err=(code)=>({status:"BLOCK",code,customer_release:false,source_scope:"RESEARCH_ONLY"});
 if(!pkt||typeof pkt!=="object"||Array.isArray(pkt)||pkt.schema!==SCHEMA)return err("INVALID_PACKET_SCHEMA");
 if(!pkt.baseline||!pkt.current||!pkt.overlay||!pkt.authority||
   typeof pkt.baseline!=="object"||typeof pkt.current!=="object"||
   Array.isArray(pkt.overlay)||typeof pkt.overlay!=="object")return err("MALFORMED_INPUT");
 if(stable(pkt.baseline)!==stable(pkt.current))return err("CORE_STATE_MUTATED");
 const b=pkt.baseline;
 if(!b.source_id||!b.room_instance_id||!b.geometry||
   b.coordinate_system!=="IMAGE_PX"||b.evidence!=="OBSERVED_RASTER_CANDIDATE"&&b.evidence!=="USER_DRAWN_UNVERIFIED")return err("SOURCE_OR_EVIDENCE_INVALID");
 const geomErr=polygonQuality(b.geometry.polygon,b.geometry.image_size_px);
 if(geomErr)return err(geomErr);
 const keys=Object.keys(pkt.overlay);
 if(keys.some(k=>!OVERLAY_FIELDS.includes(k)))return err("UNAUTHORIZED_OVERLAY_FIELD");
 const rx=new RegExp(FORBIDDEN,"i");
 for(const [k,v] of Object.entries(pkt.overlay)){
   if(typeof v!=="string"||v.length>75)return err("INVALID_OVERLAY_VALUE");
   if(rx.test(v))return err("STRUCTURAL_COMMAND_IN_OVERLAY");
 }
 if(pkt.authority.master_approval==="APPROVED"||pkt.authority.receiver_ack==="SIGNED_VERIFIED"||pkt.authority.current_official==="APPROVED")return err("UNVERIFIED_APPROVAL_CLAIM_IN_BROWSER");
 if(pkt.authority.master_approval!=="PENDING"||pkt.authority.receiver_ack!=="NOT_RECEIVED"||pkt.authority.current_official!=="NOT_VERIFIED")return err("INVALID_AUTHORITY_STATE");
 return {status:"HOLD",code:"OFFICIAL_LOCK_R01_R02_ACK_AND_CAMERA_MISSING",customer_release:false,source_scope:"RESEARCH_ONLY"};
}

function auditImage(checks){
 const types=["walls","openings","fixtures","camera","scope"];
 if(!checks||typeof checks!=="object"||Array.isArray(checks))return{status:"REVIEW",code:"IMAGE_AUDIT_NOT_SUPPLIED",customer_release:false};
 const vals=types.map(k=>checks[k]);
 if(vals.some(v=>v==="FAIL"))return{status:"FAIL",code:"STRUCTURE_MISMATCH_REPORTED",customer_release:false};
 if(vals.some(v=>!["PASS","REVIEW","UNKNOWN","FAIL"].includes(v)))return{status:"REVIEW",code:"IMAGE_AUDIT_INCOMPLETE",customer_release:false};
 return{status:"REVIEW",code:vals.every(v=>v==="PASS")?"INDEPENDENT_METRIC_QA_REQUIRED":"IMAGE_AUDIT_INCOMPLETE",customer_release:false};
}

const api={SCHEMA,OVERLAY_FIELDS,deepCopy,stable,polygonQuality,inspectPacket,auditImage};

if(typeof module!=='undefined'&&module.exports)module.exports=api;

root.EMOVIABathGuard=api;

})(typeof globalThis!=='undefined'?globalThis:this);

