import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PACK06_SCHEMA, validateRegistry, findRequiredSources, replayKitchenCases,
  generationGate, outputApprovalGate, runKitchenReplay, geometrySignature
} from "./gateway-core.mjs";

const registry = JSON.parse(readFileSync(new URL("./registry.json", import.meta.url), "utf8"));
const copy = x => JSON.parse(JSON.stringify(x));
const mkRun = (id, run, modules, extra = {}) => ({
  id, run_mm:run, modules_mm:modules, fridge_in_run:false, sum_nominal_width_mm:modules.reduce((a,b)=>a+b,0),
  spare_mm_before_panels:run-modules.reduce((a,b)=>a+b,0),
  result:run>=modules.reduce((a,b)=>a+b,0)?"HOLD_PANEL_GAPS_APPLIANCE_AND_MEP":"REJECT_NOMINAL_WIDTH",...extra
});
const xy=(a,b)=>Object.fromEntries(["x","y","z"].flatMap((k,i)=>[[k+"0",a[i]],[k+"1",b[i]]]));
const mkXYZ=(name,A,B,collision)=>({
  case:name,drawer_xyz_mm:xy(...A),reserved_xyz_mm:xy(...B),
  expected_overlap:collision,calculated_overlap:collision
});
const A=xy([0,0,0],[600,550,180]);
const box=(start,end)=>[start,end];
const generic = [
  mkRun("M1",3000,[900,600,500]),
  mkRun("M2",1500,[900,600,500]),
  mkRun("M3",1800,[900,600,500]),
  mkRun("M4",3200,[900,600,500]),
  mkRun("M5",2700,[900,600,500]),
  mkRun("M6",1900,[900,600,500]),
  {id:"M7",shape:"L",arm_1_mm:2700,arm_2_mm:2600,corner_overlap_mm:600,effective_two_arm_run_mm:4700,
   assumed_modules_total_mm:4200,unverified_peninsula_add:false,result:"HOLD_L_CORNER_ACCESS_AND_ACTUAL_SURVEY"},
  {id:"M8",shape:"L",arm_1_mm:2500,arm_2_mm:2500,corner_overlap_mm:600,effective_two_arm_run_mm:4400,
   assumed_modules_total_mm:4300,unverified_peninsula_add:false,result:"HOLD_L_CORNER_ACCESS_AND_ACTUAL_SURVEY"},
  {id:"M9",shape:"L",arm_1_mm:2500,arm_2_mm:2200,corner_overlap_mm:600,effective_two_arm_run_mm:4100,
   assumed_modules_total_mm:4300,unverified_peninsula_add:false,result:"REJECT_THEORETICAL_WIDTH"},
  {id:"M10",shape:"L",arm_1_mm:2500,arm_2_mm:2200,corner_overlap_mm:600,effective_two_arm_run_mm:4100,
   assumed_modules_total_mm:3000,unverified_peninsula_add:true,result:"REJECT_UNAPPROVED_PENINSULA_ADDITION"}
];
const reserved=box([50,80,30],[550,480,220]);
const xyz=[
 mkXYZ("X1",box([0,0,40],[600,550,180]),reserved,true),
 mkXYZ("X2",box([500,100,150],[600,500,250]),reserved,true),
 mkXYZ("X3",box([0,0,40],[45,550,180]),reserved,false),
 mkXYZ("X4",box([0,0,250],[600,550,350]),reserved,false),
 mkXYZ("X5",box([50,80,30],[550,480,220]),reserved,true),
 mkXYZ("X6",box([550,480,220],[600,550,240]),reserved,false)
];
const fridge=(id,product,niche,result)=>({
  test_id:id,product_actual_outer_whd_mm:product,hypothetical_niche_inner_whd_mm:niche,result
});
const fridges=[
 fridge("F01",[836,1862,788],[800,2000,900],"FAIL_OUTER_W"),
 fridge("F02",[836,1862,788],[900,1800,900],"FAIL_OUTER_H"),
 fridge("F03",[836,1862,788],[900,2000,700],"FAIL_OUTER_D_IF_FLUSH_REQUIRED"),
 fridge("F04",[836,1862,788],[900,2000,900],"HOLD_DOOR_VENT_SERVICE"),
 fridge("F05",[693,1797,649],[850,2000,800],"HOLD_DOOR_VENT_SERVICE"),
 fridge("F06",[693,1797,649],[650,2000,900],"FAIL_OUTER_W"),
 fridge("F07",[693,1797,649],[800,2000,800],"HOLD_DOOR_VENT_SERVICE"),
 fridge("F08",[693,1797,649],[800,2000,800],"HOLD_DOOR_VENT_SERVICE"),
 fridge("F09",[836,1862,788],[820,2000,800],"FAIL_OUTER_W"),
 fridge("F10",[836,1862,788],[900,2000,900],"HOLD_DOOR_VENT_SERVICE")
];
const syntheticSources = {
 KITCHEN_B50:{batch_id:"B50",generic_module_arithmetic_cases:generic,illustrative_xyz_collision_cases:xyz},
 KITCHEN_B58:{batch_id:"B58",tests:fridges}
};
function storeFactory({badReadback=false,failOnWrite=false}={}){
 const traces=[],deltas=[],cp=new Map();
 return {
   traces,deltas,
   async readCheckpoint(id){const v=cp.get(id)||registry.checkpoint;return badReadback&&cp.has(id)?{...v,validation_state:"TAMPERED"}:copy(v);},
   async appendTrace(v){traces.push(copy(v));},
   async appendDelta(v){deltas.push(copy(v));},
   async writeCheckpoint(id,v){if(failOnWrite)throw Error("STORE_UNAVAILABLE");cp.set(id,copy(v));}
 };
}
function readerFactory({missing=null,poison=false,readLog=[]}={}){
 return {async load({source_id,location,expected_version}){
  readLog.push({source_id,alias:location?.alias,expected_version});
  if(source_id===missing)return null;
  const content = source_id==="KITCHEN_B50"||source_id==="KITCHEN_B58"
    ? poison&&source_id==="KITCHEN_B58"?{batch_id:"BAD"}:copy(syntheticSources[source_id])
    : {source_id,source_status:"SOURCE_METADATA_SIMULATED"};
  return {source_id,version:expected_version,verified_source:true,content};
 }};
}
const params=(other={})=>({registry,sourceReader:readerFactory(),store:storeFactory(),runId:"SYNTH_TEST_1",now:"2026-11-04",...other});

test("registry all 15 required areas, binding and no auto approval",()=>{
 assert.equal(PACK06_SCHEMA, registry.schema_id);
 assert.deepEqual(validateRegistry(registry),[]);
 assert.equal(findRequiredSources(registry).required.length,5);
 assert.equal(registry.control.current_official,false);
 assert.equal(registry.control.final_95,"PENDING");
});
test("registry missing source blocks",()=>{
 const r=copy(registry);r.source_registry=r.source_registry.filter(x=>x.source_id!=="KITCHEN_B50");
 assert(validateRegistry(r).some(x=>x.startsWith("REQUIRED_SOURCE_MISSING")));
});
test("registry missing binding blocks",()=>{
 const r=copy(registry);r.binding_table=r.binding_table.filter(x=>x.source_id!=="KITCHEN_B50");
 assert(validateRegistry(r).some(x=>x.startsWith("REQUIRED_BINDING_MISSING")));
});
test("no fake official approval",()=>{
 const r=copy(registry);r.control.current_official=true;
 assert(validateRegistry(r).includes("UNAUTHORIZED_CURRENT_OFFICIAL"));
});
test("prevent falsely claiming applied source without trace",()=>{
 const r=copy(registry);r.source_registry.find(x=>x.source_id==="KITCHEN_B82_DELTA").application_state="APPLIED";
 assert(validateRegistry(r).includes("APPLIED_WITHOUT_TRACE:KITCHEN_B82_DELTA"));
});
test("historical-style synthetic 26-case fixture passes mathematical replay",()=>{
 const r=replayKitchenCases(syntheticSources.KITCHEN_B50,syntheticSources.KITCHEN_B58);
 assert.equal(r.tests,26);assert.equal(r.failed,0);assert.equal(r.site_approval,false);
});
test("mutating one real dimension is detected",()=>{
 const b=copy(syntheticSources.KITCHEN_B58);b.tests[0].product_actual_outer_whd_mm[0]=700;
 assert.equal(replayKitchenCases(syntheticSources.KITCHEN_B50,b).failed,1);
});
test("mutating one overlap label is detected",()=>{
 const b=copy(syntheticSources.KITCHEN_B50);b.illustrative_xyz_collision_cases[0].expected_overlap=false;
 assert.equal(replayKitchenCases(b,syntheticSources.KITCHEN_B58).failed,1);
});
test("unknown provider fails closed",async()=>{
 const r=await runKitchenReplay({registry,runId:"NO_PROVIDER",now:"2026-11-04"});
 assert.equal(r.status,"HOLD");assert(r.errors.includes("PROVIDER_OR_STORE_NOT_CONNECTED"));
});
test("authenticated-alias compatible fake provider and checkpoint readback",async()=>{
 const store=storeFactory(),readLog=[];
 const r=await runKitchenReplay(params({sourceReader:readerFactory({readLog}),store}));
 assert.equal(r.status,"PARTIAL_PASS");
 assert.equal(r.tests.tests,26);assert.equal(r.tests.failed,0);
 assert.equal(r.checkpoint_verified,true);
 assert.equal(r.applied_source_ids.length,2);assert.equal(r.source_count,5);
 assert.equal(store.traces.length,1);assert.equal(store.deltas.length,1);
 assert.equal(readLog.length,5);
 assert.equal(r.tests.site_approval,false);
});
test("failed checkpoint readback is not confirmed",async()=>{
 const r=await runKitchenReplay(params({store:storeFactory({badReadback:true})}));
 assert.equal(r.status,"CHECKPOINT_ERROR");assert.equal(r.checkpoint_verified,false);
});
test("failed store write is not confirmed",async()=>{
 const r=await runKitchenReplay(params({store:storeFactory({failOnWrite:true})}));
 assert.equal(r.status,"CHECKPOINT_ERROR");assert.equal(r.checkpoint_verified,false);
});
test("unreadable source returns source gap",async()=>{
 const r=await runKitchenReplay(params({sourceReader:readerFactory({missing:"KITCHEN_B58"})}));
 assert.equal(r.status,"SOURCE_GAP");
});
test("source version mismatch blocks before replay",async()=>{
 const store=storeFactory();
 const sourceReader={async load({source_id,expected_version}){
  const content=syntheticSources[source_id]||{source_id};
  return {source_id,version:"WRONG_VERSION",verified_source:true,content};
 }};
 const r=await runKitchenReplay(params({store,sourceReader}));
 assert.equal(r.status,"HOLD");
 assert(r.errors.some(x=>x.startsWith("SOURCE_VERSION_OR_PROVENANCE_NOT_VERIFIED")));
 assert.equal(store.traces.length,0);
});
test("source without verified provenance blocks before replay",async()=>{
 const store=storeFactory();
 const sourceReader={async load({source_id,expected_version}){
  return {source_id,version:expected_version,verified_source:false,content:syntheticSources[source_id]||{source_id}};
 }};
 const r=await runKitchenReplay(params({store,sourceReader}));
 assert.equal(r.status,"HOLD");assert.equal(store.traces.length,0);
});
test("source batch mutation blocks trace writes",async()=>{
 const store=storeFactory();
 const r=await runKitchenReplay(params({store,sourceReader:readerFactory({poison:true})}));
 assert.equal(r.status,"FAIL");assert.equal(store.traces.length,0);
});
test("unknown or incomplete source alias blocks before read",async()=>{
 const r=copy(registry);r.source_registry.find(x=>x.source_id==="KITCHEN_B58").data_center_location=null;
 const a=await runKitchenReplay(params({registry:r}));
 assert(["REGISTRY_INITIALIZATION_ERROR","DATA_CENTER_LOCATION_ERROR"].includes(a.status));
});
test("scene geometry signature changes when dimension changes",()=>{
 const base={plan_state_version:"1",decision_lock_version:"1",product_source_version:"1",scene_graph:{fridge:{w:836,d:788,h:1862}}};
 const revised=copy(base);revised.scene_graph.fridge.d=600;
 assert.notEqual(geometrySignature(base),geometrySignature(revised));
});
test("generation gate always blocks until real provider and independent approval",()=>{
 const result=generationGate({registry,scene:null,validatorReport:{},generatorConnected:false});
 assert.equal(result.allow,false);
 assert(result.reasons.includes("GENERATOR_NOT_CONNECTED"));
 assert(result.reasons.includes("PACK06_NOT_CURRENT_OFFICIAL"));
});
test("output gate never promotes synthetic success",()=>{
 const a=outputApprovalGate({generationReport:{allow:false},imageAValidation:{status:"PASS"},imageBValidation:{status:"PASS"}});
 assert.equal(a.approved,false);
});
