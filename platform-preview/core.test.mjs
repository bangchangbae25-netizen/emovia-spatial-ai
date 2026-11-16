import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTROL,OWNERS,DOMAIN_IDS,COMPONENTS,SERVICES,ENTRY_MODES,FLOW_STAGES,
  CONTRACT_BRIDGES,ACTIVATION_GATES,FAULT_ROUTES,RESEARCH_SCENARIOS,
  serviceById,resolveSelection,validateInput,initFlow,flowTransition,
  simulateSubmission,productionPreflight,pipelinePreflight,releasePreflight,
  revisionCandidate,approvalReadiness
} from "./core.mjs";

const req=(service_id="SVC_005",extra={})=>({
  service_id,entry_mode:"DIRECT_SERVICE",catalog_version:"1.0",
  selection_confirmed:true,...extra
});
const submission=(extra={})=>({
  ...req(),mode:"DESIGN_SIMULATION",input:{goal:"간판 로고 시안 검토 요청",sign_text:"이모비아"},
  review_confirmed:true,simulation_acknowledged:true,
  input_revision:2,submission_revision:2,idempotency_key:"REQ-001",...extra
});
const original={version:2,release_status:"RELEASED",result_ref:"EXAMPLE_RESULT"};

test("research identity and review-only source preserved",()=>{
  assert.equal(CONTROL.structure_signature,"6.5.30.7.210");
  assert.equal(CONTROL.common_source_status,"REVIEW_REQUIRED");
  assert.equal(CONTROL.production_approved,false);
  assert.equal(CONTROL.final_95,"PENDING");
  assert.equal(CONTROL.mode,"DESIGN_SIMULATION");
  assert.equal(Object.keys(OWNERS).length,8);
});
test("11 stable service ids; seven exact specialist domain ids; owner unresolved only for brochure",()=>{
  assert.deepEqual(SERVICES.map(s=>s.id),Array.from({length:11},(_,i)=>"SVC_"+String(i+1).padStart(3,"0")));
  assert.equal(DOMAIN_IDS.length,7);
  assert.equal(new Set(SERVICES.map(s=>s.domain_id).filter(Boolean)).size,7);
  assert.equal(serviceById("SVC_011").domain_id,null);
  assert.ok(SERVICES.every(s=>!s.production_approved&&s.visibility_status==="HIDDEN"));
});
test("19 stable components, 11 stage ids, 35 cases, 20 fault routes",()=>{
  assert.deepEqual(COMPONENTS.map(c=>c.id),Array.from({length:19},(_,i)=>"CMP_"+String(i+1).padStart(3,"0")));
  assert.deepEqual(FLOW_STAGES.map(([id])=>id),Array.from({length:11},(_,i)=>"FL_"+String(i).padStart(2,"0")));
  assert.equal(RESEARCH_SCENARIOS.length,35);
  assert.ok(RESEARCH_SCENARIOS.every(s=>s.status==="DESIGN_REVIEW_ONLY"));
  assert.equal(FAULT_ROUTES.length,20);
  assert.equal(new Set(FAULT_ROUTES.map(f=>f.code)).size,20);
});
test("component binding only references known components",()=>{
  const ids=new Set(COMPONENTS.map(c=>c.id));
  assert.ok(SERVICES.every(s=>s.component_ids.every(id=>ids.has(id))));
  assert.ok(SERVICES.every(s=>s.fields.length>0));
});
test("8 guarded contract bridges and 13 activation gates",()=>{
  assert.equal(CONTRACT_BRIDGES.length,8);
  assert.ok(CONTRACT_BRIDGES.every(x=>x.length===3&&x[2]));
  assert.equal(ACTIVATION_GATES.length,13);
  assert.equal(ACTIVATION_GATES.at(-1),"MASTER_APPROVAL_AND_FINAL_95");
});
test("service routing requires explicit customer selection",()=>{
  assert.equal(resolveSelection(req("SVC_003",{selection_confirmed:false})).code,"CUSTOMER_SELECTION_REQUIRED");
  assert.equal(resolveSelection(req("SVC_003")).service_id,"SVC_003");
});
test("entry modes preserved with exact composite scope",()=>{
  const q=req("SVC_006",{entry_mode:"SPACE_PURPOSE",space_id:"RESIDENTIAL_BATHROOM",purpose_id:"PREVIEW_PRODUCT"});
  const r=resolveSelection(q);
  assert.equal(r.ok,true);
  assert.equal(r.source_entry_mode,"SPACE_PURPOSE");
  assert.equal(r.selected_space_id,"RESIDENTIAL_BATHROOM");
  assert.equal(r.selected_purpose_id,"PREVIEW_PRODUCT");
  assert.equal(r.case_ref,null);
  assert.equal(r.case_created,false);
  assert.deepEqual(ENTRY_MODES,["SPACE","PURPOSE","SPACE_PURPOSE","ALL_SERVICES","DIRECT_SERVICE"]);
});
test("composite missing field rejected; invalid mode rejected",()=>{
  assert.equal(resolveSelection(req("SVC_006",{entry_mode:"SPACE_PURPOSE",purpose_id:"PREVIEW_PRODUCT"})).code,"SPACE_PURPOSE_INPUT_REQUIRED");
  assert.equal(resolveSelection(req("SVC_006",{entry_mode:"INVALID"})).code,"ENTRY_MODE_UNSUPPORTED");
});
test("unknown service, owner unresolved, conflicting ids rejected",()=>{
  assert.equal(resolveSelection(req("SVC_012")).code,"SERVICE_NOT_FOUND");
  assert.equal(resolveSelection(req("SVC_011")).code,"DOMAIN_OWNER_MISSING");
  assert.equal(resolveSelection(req("SVC_003",{selected_service_id:"SVC_005"})).code,"SERVICE_ID_CONFLICT");
});
test("catalog versions never silently coerced",()=>{
  assert.equal(resolveSelection(req("SVC_003",{catalog_version:"1.0.0"})).code,"CATALOG_VERSION_MISMATCH");
});
test("sign input is text-first and does not require site photographs",()=>{
  const r=validateInput("SVC_005",{goal:"간판 디자인을 검토하고 싶습니다.",sign_text:"가게 이름"});
  assert.equal(r.ok,true);
  assert.equal(r.dimension_state,"UNKNOWN");
  assert.equal(r.domain_validation,"NOT_PERFORMED");
});
test("missing sign text or vague goal rejected",()=>{
  assert.deepEqual(validateInput("SVC_005",{goal:"짧음",sign_text:""}).missing,["goal","sign_text"]);
});
test("kitchen selection requires exact option but never asserts geometry",()=>{
  const ok=validateInput("SVC_002",{goal:"현재 주방 동선을 바꾸고 싶습니다.",kitchen_type:"ㄱ자형"});
  assert.equal(ok.ok,true);
  assert.equal(ok.field_verify,true);
  assert.equal(ok.geometry_state,"UNKNOWN");
  assert.equal(validateInput("SVC_002",{goal:"현재 주방 동선을 바꾸고 싶습니다.",kitchen_type:"사각형"}).code,"FIELD_VALUE_INVALID");
});
test("flow starts at eligibility, transitions only through permitted stages",()=>{
  let state=initFlow(resolveSelection(req()));
  assert.equal(state.stage,"FL_00");
  for(const [event,guard,stage] of [
    ["ELIGIBILITY_SIMULATED",{},"FL_01"],["START",{},"FL_02"],
    ["INPUT_FORM_COMPLETE",{formComplete:true},"FL_03"],
    ["SKIP_AI_DEMO",{},"FL_05"],["NO_ADDITIONAL_FIELDS",{},"FL_07"],
    ["CUSTOMER_CONFIRMED",{reviewConfirmed:true},"FL_08"],
    ["PRE_CASE_SIMULATION",{simulationAcknowledged:true},"FL_09"]
  ]){state=flowTransition(state,event,guard);assert.equal(state.stage,stage);}
  assert.equal(state.analysis_status,"NOT_EXECUTED");
  assert.equal(state.case_ref,null);
  assert.equal(state.pipeline_executed,false);
  assert.equal(flowTransition(state,"RESULT_READY").code,"INVALID_FLOW_TRANSITION");
});
test("flow bypass and skipped gates rejected",()=>{
  const f=initFlow(resolveSelection(req()));
  assert.equal(flowTransition(f,"PRE_CASE_SIMULATION").code,"INVALID_FLOW_TRANSITION");
  const s=flowTransition(flowTransition(f,"ELIGIBILITY_SIMULATED"),"START");
  assert.equal(flowTransition(s,"INPUT_FORM_COMPLETE").code,"INPUT_REQUIRED");
  assert.equal(flowTransition(s,"INPUT_FORM_COMPLETE",{formComplete:true}).stage,"FL_03");
});
test("edit invalidates review and increments revision",()=>{
  const reviewed={...initFlow(resolveSelection(req())),stage:"FL_07",revision:3,review_confirmed:true};
  const next=flowTransition(reviewed,"EDIT_INPUT");
  assert.equal(next.stage,"FL_02");
  assert.equal(next.revision,4);
  assert.equal(next.review_confirmed,false);
});
test("pre-case simulation is not a real CASE nor an AI output",()=>{
  const s=simulateSubmission(submission());
  assert.equal(s.ok,true);
  assert.equal(s.case_created,false);
  assert.equal(s.real_case_ref,null);
  assert.equal(s.payment_processed,false);
  assert.equal(s.ai_executed,false);
  assert.equal(s.result_generated,false);
  assert.match(s.synthetic_ref,/^SIM_ONLY_/);
});
test("session-only idempotency returns same synthetic reference",()=>{
  const cache=new Map();
  const a=simulateSubmission(submission(),cache),b=simulateSubmission(submission(),cache);
  assert.equal(a.synthetic_ref,b.synthetic_ref);
  assert.equal(b.replayed,true);
});
test("simulation still requires review, explicit acknowledgement, coherent revision",()=>{
  assert.equal(simulateSubmission(submission({review_confirmed:false})).code,"REVIEW_REQUIRED");
  assert.equal(simulateSubmission(submission({simulation_acknowledged:false})).code,"SIMULATION_ACK_REQUIRED");
  assert.equal(simulateSubmission(submission({submission_revision:1})).code,"INPUT_SNAPSHOT_STALE");
  assert.equal(simulateSubmission(submission({mode:"PRODUCTION"})).code,"PRODUCTION_DISABLED");
});
test("production hard-stops on approval status and unresolved domain",()=>{
  assert.equal(productionPreflight({service_id:"SVC_003",source_approved:true,master_approved:true}).code,"REQUIRED_SOURCE_NOT_APPROVED");
  assert.equal(productionPreflight({service_id:"SVC_011"}).code,"DOMAIN_OWNER_MISSING");
});
test("fake CASE cannot open pipeline",()=>{
  assert.equal(pipelinePreflight({case_ref:"SIM_ONLY_001",server_authorized:true}).code,"REAL_CASE_REQUIRED");
  assert.equal(pipelinePreflight({case_ref:"REAL_CASE_01"}).code,"SERVER_AUTHORIZATION_REQUIRED");
});
test("pipeline validates stale snapshot, consent, payment, capability",()=>{
  const q={case_ref:"EXAMPLE_CASE",server_authorized:true,input_snapshot_revision:3,submission_revision:3,consent_valid:true,
    payment_required:true,payment_confirmed:true,capability_production_approved:true};
  assert.equal(pipelinePreflight({...q,input_snapshot_revision:2}).code,"INPUT_SNAPSHOT_STALE");
  assert.equal(pipelinePreflight({...q,consent_valid:false}).code,"CONSENT_REVOKED");
  assert.equal(pipelinePreflight({...q,payment_confirmed:false}).code,"PAYMENT_PENDING");
  assert.equal(pipelinePreflight({...q,capability_production_approved:false}).code,"CAPABILITY_UNAVAILABLE");
  assert.equal(pipelinePreflight(q).code,"REAL_SERVER_IMPLEMENTATION_NOT_VERIFIED");
});
test("result release cannot happen client-side",()=>{
  assert.equal(releasePreflight({}).code,"SERVER_AUTHORIZATION_REQUIRED");
  assert.equal(releasePreflight({server_authorized:true,release_status:"HIDDEN"}).code,"RESULT_NOT_RELEASED");
  assert.equal(releasePreflight({server_authorized:true,release_status:"RELEASED",result_validation_passed:true,entitlement_valid:true}).code,"REAL_SERVER_IMPLEMENTATION_NOT_VERIFIED");
});
test("failed generation preserves released version",()=>{
  const r=revisionCandidate(original,{supported:true,base_version:2,generation_success:false});
  assert.equal(r.code,"REGENERATION_FAILED");
  assert.equal(r.previous.release_status,"RELEASED");
  assert.equal(original.version,2);
});
test("successful candidate is hidden pending validation",()=>{
  const r=revisionCandidate(original,{supported:true,base_version:2,generation_success:true});
  assert.equal(r.candidate.release_status,"HIDDEN");
  assert.equal(r.candidate.source_version,2);
  assert.equal(r.candidate.validation_status,"PENDING");
  assert.equal(revisionCandidate(original,{supported:true,base_version:1,generation_success:true}).code,"BASE_VERSION_CONFLICT");
});
test("payment ambiguous is mapped to reconcile, no repeat charge",()=>{
  assert.equal(FAULT_ROUTES.find(x=>x.code==="PAYMENT_STATUS_UNKNOWN").action,"RECONCILE_PROVIDER_NOT_RECHARGE");
});
test("preflight never claims active services",()=>{
  const r=approvalReadiness();
  assert.equal(r.ready,false);
  assert.deepEqual(r.service_owners_unresolved,["SVC_011"]);
  assert.equal(r.capabilities_proven,0);
  assert.equal(r.final_95,"PENDING");
});
