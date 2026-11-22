/* EMOVIA bathroom geometry research gate 0.3.1
 * This library never issues an official Geometry Lock or image PASS.
 * Source: 2026-11-19 research raster, schema is NOT an existing R01/R02 engine contract.
 */
(function(root){
  'use strict';
  const SCHEMA='EMOVIA_BATH_BRIDGE_RESEARCH_V0_3';
  const OVERLAY_FIELDS=['style_id','wall_finish','floor_finish','lighting_tone','mirror_finish','accent_color'];
  const STYLE_IDS=['MODERN','NATURAL','CLASSIC'];
  const FORBIDDEN=/(?:매립\s*형|니치|벽체\s*(?:철거|신설|이동|변경|증설)|새\s*벽|샤워\s*(?:부스|파티션|구획)\s*(?:추가|신설)?|변기\s*(?:이동|이설)|세면\s*(?:대|기)\s*(?:이동|이설)|recessed[_ -]?niche|new[_ -]?wall|move[_ -]?(?:toilet|basin)|added[_ -]?shower|shower[_ -]?booth)/i;
  const deepCopy=x=>JSON.parse(JSON.stringify(x));
  function stable(x){
    if(x===null||typeof x!=='object')return JSON.stringify(x);
    if(Array.isArray(x))return '['+x.map(stable).join(',')+']';
    return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';
  }
  function polygonQuality(points,size){
    if(!Array.isArray(size)||size.length!==2||size.some(x=>!Number.isSafeInteger(x)||x<=0||x>20000))return 'INVALID_IMAGE_DIMENSIONS';
    if(!Array.isArray(points)||points.length<3||points.length>32)return 'POLYGON_MISSING_OR_TOO_MANY';
    const seen=new Set();
    for(const p of points){
      if(!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)))return 'NON_NUMERIC_VERTEX';
      if(p[0]<0||p[1]<0||p[0]>size[0]||p[1]>size[1])return 'VERTEX_OUTSIDE_IMAGE';
      const key=p[0]+','+p[1];if(seen.has(key))return 'DUPLICATE_VERTEX';seen.add(key);
    }
    const n=points.length;let twice=0;
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    for(let i=0;i<n;i++){const p=points[i],q=points[(i+1)%n];twice+=p[0]*q[1]-q[0]*p[1]}
    if(Math.abs(twice)<8)return 'DEGENERATE_POLYGON';
    const onSeg=(a,b,c)=>Math.min(a[0],b[0])<=c[0]&&c[0]<=Math.max(a[0],b[0])&&Math.min(a[1],b[1])<=c[1]&&c[1]<=Math.max(a[1],b[1]);
    function intersects(a,b,c,d){
      const s1=Math.sign(cross(a,b,c)),s2=Math.sign(cross(a,b,d)),s3=Math.sign(cross(c,d,a)),s4=Math.sign(cross(c,d,b));
      if(s1!==s2&&s3!==s4)return true;
      if(s1===0&&onSeg(a,b,c))return true;
      if(s2===0&&onSeg(a,b,d))return true;
      if(s3===0&&onSeg(c,d,a))return true;
      if(s4===0&&onSeg(c,d,b))return true;
      return false;
    }
    for(let i=0;i<n;i++)for(let j=i+2;j<n;j++){
      if(i===0&&j===n-1)continue;
      if(intersects(points[i],points[(i+1)%n],points[j],points[(j+1)%n]))return 'SELF_INTERSECTING_POLYGON';
    }
    return null;
  }
  function inspectPacket(pkt){
    const fail=(status,code)=>({status,code,customer_release:false,source_scope:'RESEARCH_ONLY'});
    if(!pkt||typeof pkt!=='object'||Array.isArray(pkt)||pkt.schema!==SCHEMA)return fail('BLOCK','INVALID_PACKET_SCHEMA');
    if(!pkt.baseline||!pkt.current||!pkt.overlay||!pkt.authority||Array.isArray(pkt.overlay)||typeof pkt.overlay!=='object')return fail('BLOCK','MALFORMED_INPUT');
    const state=pkt.baseline;
    if(stable(state)!==stable(pkt.current))return fail('BLOCK','CORE_STATE_MUTATED');
    const allowedTop=['source_id','source_sha256','room_instance_id','coordinate_system','evidence','revision','geometry'];
    if(Object.keys(state).some(k=>!allowedTop.includes(k)))return fail('BLOCK','UNRECOGNIZED_CORE_STATE_FIELD');
    if(!state.source_id||!state.room_instance_id||typeof state.source_id!=='string'||typeof state.room_instance_id!=='string'||!state.geometry)return fail('BLOCK','INVALID_ID_OR_GEOMETRY');
    if(state.coordinate_system!=='IMAGE_PX'||!['OBSERVED_RASTER_CANDIDATE','USER_DRAWN_UNVERIFIED'].includes(state.evidence))return fail('BLOCK','SOURCE_OR_EVIDENCE_INVALID');
    const g=state.geometry;
    const allowedGeo=['image_size_px','polygon','door','basin','toilet','drain','camera','dimensions_mm'];
    if(Object.keys(g).some(k=>!allowedGeo.includes(k)))return fail('BLOCK','UNRECOGNIZED_GEOMETRY_FIELD');
    const pError=polygonQuality(g.polygon,g.image_size_px);if(pError)return fail('BLOCK',pError);
    if(g.camera!==null||g.dimensions_mm!==null)return fail('BLOCK','UNVERIFIED_METRIC_OR_CAMERA_PROMOTION');
    for(const name of ['door','basin','toilet','drain']){
      const p=g[name];if(p===null)continue;
      if(!Array.isArray(p)||p.length!==2||p.some(x=>!Number.isFinite(x))||p[0]<0||p[1]<0||p[0]>g.image_size_px[0]||p[1]>g.image_size_px[1])return fail('BLOCK','INVALID_MARKER_'+name.toUpperCase());
    }
    if(Object.keys(pkt.overlay).some(k=>!OVERLAY_FIELDS.includes(k)))return fail('BLOCK','UNAUTHORIZED_OVERLAY_FIELD');
    for(const [k,v] of Object.entries(pkt.overlay)){
      if(typeof v!=='string'||v.length>75)return fail('BLOCK','INVALID_OVERLAY_VALUE');
      if(FORBIDDEN.test(v))return fail('BLOCK','STRUCTURAL_COMMAND_IN_OVERLAY');
    }
    if(!STYLE_IDS.includes(pkt.overlay.style_id))return fail('BLOCK','UNSUPPORTED_STYLE');
    const a=pkt.authority;
    if(!a||typeof a!=='object'||Array.isArray(a))return fail('BLOCK','MALFORMED_AUTHORITY');
    if(Object.keys(a).some(k=>!['master_approval','receiver_ack','current_official'].includes(k)))return fail('BLOCK','UNRECOGNIZED_AUTHORITY_FIELD');
    if(a.master_approval==='APPROVED'||a.receiver_ack==='SIGNED_VERIFIED'||a.current_official==='APPROVED')return fail('BLOCK','UNVERIFIED_APPROVAL_CLAIM_IN_BROWSER');
    if(a.master_approval!=='PENDING'||a.receiver_ack!=='NOT_RECEIVED'||a.current_official!=='NOT_VERIFIED')return fail('BLOCK','INVALID_AUTHORITY_STATE');
    return fail('HOLD','OFFICIAL_LOCK_R01_R02_ACK_AND_CAMERA_MISSING');
  }
  function auditImage(checks){
    const keys=['walls','openings','fixtures','camera','scope'];
    if(!checks||typeof checks!=='object'||Array.isArray(checks))return {status:'REVIEW',code:'IMAGE_AUDIT_NOT_SUPPLIED',customer_release:false};
    const vals=keys.map(k=>checks[k]);
    if(vals.some(v=>v==='FAIL'))return {status:'FAIL',code:'STRUCTURE_MISMATCH_REPORTED',customer_release:false};
    if(vals.some(v=>!['PASS','REVIEW','UNKNOWN','FAIL'].includes(v)))return {status:'REVIEW',code:'IMAGE_AUDIT_INCOMPLETE',customer_release:false};
    return {status:'REVIEW',code:vals.every(v=>v==='PASS')?'INDEPENDENT_METRIC_QA_REQUIRED':'IMAGE_AUDIT_INCOMPLETE',customer_release:false};
  }
  const api={SCHEMA,STYLE_IDS,OVERLAY_FIELDS,deepCopy,stable,polygonQuality,inspectPacket,auditImage};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.EMOVIABathGuard=api;
})(typeof globalThis!=='undefined'?globalThis:this);