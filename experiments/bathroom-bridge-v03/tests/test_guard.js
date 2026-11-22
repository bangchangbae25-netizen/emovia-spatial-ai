'use strict';
const assert=require('node:assert/strict');
const guard=require('../app/guard.js');
const copy=guard.deepCopy;
const refLeft={source_id:'REFERENCE_1000026121_USER_ARCHIVE',source_sha256:'d7ba11207566c3cf04536179d083ac1dde90ca0bb5070603576f1ddb3dc65d0e',room_instance_id:'R1000026121_BATH_LEFT',coordinate_system:'IMAGE_PX',evidence:'OBSERVED_RASTER_CANDIDATE',revision:0,geometry:{image_size_px:[1280,1096],polygon:[[79,378],[197,378],[197,573],[79,573]],door:[197,527],basin:[111,470],toilet:[133,529],drain:null,camera:null,dimensions_mm:null}};
const refRight=copy(refLeft);refRight.room_instance_id='R1000026121_BATH_RIGHT';refRight.geometry.polygon=[[917,15],[1045,15],[1045,174],[1045,238],[892,238],[892,177],[917,177]];refRight.geometry.door=[1045,200];refRight.geometry.basin=[946,141];refRight.geometry.toilet=[943,209];
const style=(id='MODERN')=>({style_id:id,wall_finish:'LIGHT_NEUTRAL_TILE',floor_finish:'GREY_TILE',lighting_tone:'NEUTRAL',mirror_finish:'SIMPLE',accent_color:'STONE'});
const pkt=(s=refLeft)=>({schema:guard.SCHEMA,baseline:copy(s),current:copy(s),overlay:style(),authority:{master_approval:'PENDING',receiver_ack:'NOT_RECEIVED',current_official:'NOT_VERIFIED'}});
const t=[];
function run(name,p,expect){let res;try{res=guard.inspectPacket(p)}catch(e){res={status:'ERROR',code:String(e)}}const pass=res.status===expect;t.push({name,expect,got:res.status,code:res.code,pass});assert.equal(res.status,expect,`${name} ${res.code}`);assert.equal(res.customer_release,false,`${name} customer_release`)}
run('base-left',pkt(),'HOLD');run('base-right',pkt(refRight),'HOLD');
for(const v of ['MODERN','NATURAL','CLASSIC']){const p=pkt();p.overlay.style_id=v;run('style-'+v,p,'HOLD')}
for(const [name,op] of [
['polygon_shift',p=>p.current.geometry.polygon[0][0]++],
['door_shift',p=>p.current.geometry.door[0]++],
['basin_shift',p=>p.current.geometry.basin[0]++],
['toilet_shift',p=>p.current.geometry.toilet[1]++],
['drain_add',p=>p.current.geometry.drain=[130,530]],
['camera_fabricate',p=>p.current.geometry.camera=[1,2,3]],
['mm_fabricate',p=>p.current.geometry.dimensions_mm=[1000,2000]],
['other_room',p=>p.current.room_instance_id='R1000026121_BATH_RIGHT'],
['LH66D_injection',p=>p.current.source_id='LH_GWANGJU_SEONUN_3_66D'],
['sha_mutated',p=>p.current.source_sha256='fake'],
['evidence_upgrade',p=>p.current.evidence='MEASURED'],
['coord_upgrade',p=>p.current.coordinate_system='MM'],
['new_field',p=>p.current.geometry.new_wall=[1,2,3]],
['revision',p=>p.current.revision=1],
['niche_overlay',p=>p.overlay.wall_finish='매립형 니치 설치'],
['booth_overlay',p=>p.overlay.mirror_finish='샤워부스 추가'],
['move_overlay',p=>p.overlay.accent_color='move_toilet'],
['newwall_overlay',p=>p.overlay.new_wall=true],
['unknown_style',p=>p.overlay.style_id='LUXURY_CUSTOM'],
['fake_approval',p=>p.authority.master_approval='APPROVED'],
['fake_ack',p=>p.authority.receiver_ack='SIGNED_VERIFIED'],
['fake_current',p=>p.authority.current_official='APPROVED'],
['fake_camera_both',p=>{p.current.geometry.camera=[0,0,1];p.baseline.geometry.camera=[0,0,1]}],
['fake_dimension_both',p=>{p.current.geometry.dimensions_mm=[1200,2200];p.baseline.geometry.dimensions_mm=[1200,2200]}],
['add_both_source_field',p=>{p.current.extra='hack';p.baseline.extra='hack'}],
['add_both_wall_field',p=>{p.current.geometry.new_wall=true;p.baseline.geometry.new_wall=true}],
['bad_overlay_type',p=>p.overlay.wall_finish={name:'test'}],
['bad_overlay_long',p=>p.overlay.wall_finish='x'.repeat(80)],
['missing_poly',p=>{p.baseline.geometry.polygon=[];p.current.geometry.polygon=[]}],
['self_intersect',p=>{p.baseline.geometry.polygon=[[79,378],[197,573],[79,573],[197,378]];p.current.geometry.polygon=copy(p.baseline.geometry.polygon)}],
['out_of_bounds',p=>{p.baseline.geometry.polygon[0]=[-2,378];p.current.geometry.polygon[0]=[-2,378]}],
['duplicate_vertex',p=>{p.baseline.geometry.polygon[2]=[79,378];p.current.geometry.polygon[2]=[79,378]}],
['invalid_marker',p=>{p.baseline.geometry.door=[3000,3000];p.current.geometry.door=[3000,3000]}],
['invalid_img_size',p=>{p.baseline.geometry.image_size_px=[0,1096];p.current.geometry.image_size_px=[0,1096]}],
['candidate_missing_evidence',p=>{p.baseline.evidence='SOURCE_METADATA_ONLY';p.current.evidence='SOURCE_METADATA_ONLY'}],
['authority_extra',p=>p.authority.signed_by='fake'],
['malformed_schema',p=>p.schema='BAD'],
['null_overlay',p=>p.overlay=null],
['polygon_too_many',p=>{const pts=Array.from({length:33},(_,i)=>[100+i,100+i*i%500]);p.baseline.geometry.polygon=pts;p.current.geometry.polygon=copy(pts)}]
]){const p=pkt();op(p);run(name,p,'BLOCK')}
run('undefined',undefined,'BLOCK');run('array',[],'BLOCK');run('number',2,'BLOCK');
const qaCases=[
 ['empty',null,'REVIEW'],['allpass',{walls:'PASS',openings:'PASS',fixtures:'PASS',camera:'PASS',scope:'PASS'},'REVIEW'],['unknown',{walls:'UNKNOWN',openings:'PASS',fixtures:'PASS',camera:'PASS',scope:'PASS'},'REVIEW'],['wallfail',{walls:'FAIL',openings:'PASS',fixtures:'PASS',camera:'PASS',scope:'PASS'},'FAIL'],['fixturefail',{walls:'PASS',openings:'PASS',fixtures:'FAIL',camera:'PASS',scope:'PASS'},'FAIL'],['missingkey',{walls:'PASS'},'REVIEW']
];
for(const [name,c,expected]of qaCases){const r=guard.auditImage(c);assert.equal(r.status,expected);assert.equal(r.customer_release,false);t.push({name:'qa_'+name,expect:expected,got:r.status,code:r.code,pass:true})}
assert.equal(guard.polygonQuality(refRight.geometry.polygon,[1280,1096]),null);
const sum={total:t.length,matched:t.filter(x=>x.pass).length,byStatus:Object.fromEntries(['BLOCK','HOLD','FAIL','REVIEW'].map(k=>[k,t.filter(x=>x.got===k).length])),category:'INDDEPENDENT_JS_RESEARCH_UNIT_TEST',source:'reference-only nonmetric, NOT actual R01/R02',official_lock:'NOT_ISSUED',image_generation:'NOT_PERFORMED',tests:t};
require('node:fs').writeFileSync(require('node:path').join(__dirname,'test_results.json'),JSON.stringify(sum,null,2));
console.log(JSON.stringify({total:sum.total,matched:sum.matched,byStatus:sum.byStatus,qa:'NO_CUSTOMER_RELEASE'},null,2));