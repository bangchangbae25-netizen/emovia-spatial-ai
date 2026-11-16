/**
 * EMOVIA platform flow, reference-only candidate.
 * SOURCE: 01–08 channel research, Common Source Pack 06 FINAL V4 (REVIEW_REQUIRED).
 * No payments, authentication, real CASE, processing, production result or AI execution.
 * Static simulation is never evidence that a capability is deployed.
 */
export const CONTROL = Object.freeze({
  project: "11.플랫폼 프로젝트",
  channel: "CH_EMOVIA_DOMAIN_FLOW_INTEGRATION_V1",
  master: "CH_EMOVIA_PLATFORM_CUSTOMER_FLOW_MASTER_V1",
  structure_signature: "6.5.30.7.210",
  common_source: "EMOVIA_PROJECT_SOURCE_SHARED_REGISTRY_DATA_CENTER_GATEWAY_FINAL_V4",
  common_source_status: "REVIEW_REQUIRED",
  catalog_version: "1.0",
  adapter_version: "1.1-REVIEW_CANDIDATE",
  production_approved: false,
  current_official_promoted: false,
  final_95: "PENDING",
  capabilities: "UNVERIFIED",
  mode: "DESIGN_SIMULATION"
});

export const OWNERS = Object.freeze({
  "01":"NAVIGATION", "02":"TAXONOMY", "03":"CUSTOMER_FLOW",
  "04":"INPUT_COMPONENTS", "05":"ACCOUNT_CASE_PAYMENT",
  "06":"RESULT_REVISION_HISTORY", "07":"PIPELINE",
  "08":"DOMAIN_INTEGRATION"
});
export const DOMAIN_IDS = Object.freeze([
  "DOM_RESIDENTIAL", "DOM_SIGN", "DOM_PRODUCT_MATERIAL",
  "DOM_SMALL_ARCH", "DOM_COMMERCIAL", "DOM_FNB", "DOM_FRANCHISE"
]);
export const COMPONENT_NAMES = Object.freeze([
  "TEXT_INPUT","OPTION_CHIP","OPTION_CARD","IMAGE_CARD","PHOTO_UPLOAD",
  "PLAN_UPLOAD","FILE_UPLOAD","LOGO_UPLOAD","PRODUCT_SELECT",
  "MATERIAL_SELECT","COLOR_SELECT","STYLE_SELECT","BRAND_SELECT",
  "YES_NO","MULTI_SELECT","POSITION_SELECT","DRAG_DROP",
  "INPUT_REVIEW","AI_CONFIRMATION"
]);
export const COMPONENTS = Object.freeze(COMPONENT_NAMES.map((name,i)=>Object.freeze({
  id:"CMP_"+String(i+1).padStart(3,"0"),name,implementation:"DESIGN_REFERENCE"
})));
const c = (...nums) => nums.map(n => "CMP_"+String(n).padStart(3,"0"));
export const SERVICES = Object.freeze([
  ["SVC_001","주거 공간 디자인 제안","DOM_RESIDENTIAL","SPACE",c(1,3,5,18),[{key:"space_type",label:"주거 공간",options:["거실","침실","전체 주거","기타"]}]],
  ["SVC_002","주방 배치·디자인 제안","DOM_RESIDENTIAL","KITCHEN",c(1,3,5,6,10,18,19),[{key:"kitchen_type",label:"주방 형태",options:["일자형","ㄱ자형","ㄷ자형","아일랜드","모름"]}]],
  ["SVC_003","욕실 디자인·구성 제안","DOM_RESIDENTIAL","BATHROOM",c(1,3,5,10,18,19),[{key:"bathroom_scope",label:"변경 범위",options:["욕실 전체","타일·마감","샤워·욕조","욕실 제품"]}]],
  ["SVC_004","현관·수납 구성 제안","DOM_RESIDENTIAL","STORAGE",c(1,3,5,10,18),[{key:"storage_scope",label:"대상",options:["현관","신발장","붙박이장","수납장"]}]],
  ["SVC_005","간판 디자인 제안","DOM_SIGN","SIGN",c(1,5,8,16,18),[{key:"sign_text",label:"간판 표기 문구",type:"text"}]],
  ["SVC_006","제품·소재 적용 미리보기","DOM_PRODUCT_MATERIAL","PRODUCT",c(1,5,9,10,11,18),[{key:"product_reference",label:"제품명 또는 확인 가능한 제품 ID",type:"text"}]],
  ["SVC_007","소규모 건물 리모델링 제안","DOM_SMALL_ARCH","BUILDING",c(1,5,6,7,18),[{key:"remodel_scope",label:"요청 대상",options:["외관","내부","개구부","기타"]}]],
  ["SVC_008","상업 공간 디자인 제안","DOM_COMMERCIAL","COMMERCIAL",c(1,3,5,12,18),[{key:"industry",label:"업종",type:"text"}]],
  ["SVC_009","F&B 매장 콘셉트 제안","DOM_FNB","FNB",c(1,3,5,15,18),[{key:"fnb_type",label:"매장 종류",options:["카페","음식점","베이커리","기타"]}]],
  ["SVC_010","프랜차이즈 공간 적용 제안","DOM_FRANCHISE","FRANCHISE",c(1,5,7,13,18),[{key:"brand_reference",label:"브랜드 기준 자료",type:"text"}]],
  ["SVC_011","브랜드 브로셔 제작",null,"BROCHURE",c(1,7,8,18),[{key:"brand_name",label:"브랜드명",type:"text"}]]
].map(([id,name,domain_id,target_kind,component_ids,fields])=>Object.freeze({
  id,name,domain_id,target_kind,component_ids,fields,
  service_status:"CANDIDATE",
  visibility_status:"HIDDEN",
  capability_status:"UNVERIFIED",
  production_approved:false,
  input_status:"DESIGN_CANDIDATE",
  result_status:"UNVERIFIED",
  payment_policy_status:"POLICY_PENDING"
})));
export const ENTRY_MODES = Object.freeze([
  "SPACE","PURPOSE","SPACE_PURPOSE","ALL_SERVICES","DIRECT_SERVICE"
]);
export const FLOW_STAGES = Object.freeze([
  ["FL_00","Service Eligibility"],["FL_01","Flow Initialization"],
  ["FL_02","Minimum Input"],["FL_03","AI Read / Normalize"],
  ["FL_04","Option Selection"],["FL_05","Information Gap Check"],
  ["FL_06","Additional Input"],["FL_07","Customer Review"],
  ["FL_08","CASE Create Gate"],["FL_09","CASE / Pipeline Handoff"],
  ["FL_10","Result Entry"]
]);
export const CONTRACT_BRIDGES = Object.freeze([
  ["02.ServiceMatchingResult.selected_service_id","02.ServiceSelectionContext.service_id","CUSTOMER_SELECTION_ONLY"],
  ["02.ServiceDiscoveryQuery.entry_mode=SPACE_PURPOSE","08.DomainIntegrationContext.entry_mode","KEEP_SPACE_AND_PURPOSE; MASTER_APPROVAL_NEEDED"],
  ["02.ServiceSelectionContext.case_id","05.CaseCreationRequest.case_ref","NO_ALIAS_BEFORE_05_CASE_CREATION"],
  ["02/03 contract versions","08.DomainServiceFlowProfile.contract_version","VERSION_COMPATIBILITY_NEEDS_APPROVAL"],
  ["04.InputFieldContract.input_revision","07.PipelineInputSnapshot.input_revision","IMMUTABLE_SNAPSHOT_ONLY"],
  ["07.PipelineResultHandoff.result_ref","06.ResultRecord.result_ref","RESULT_READY_NOT_RELEASED"],
  ["05.ConsentRecord.portfolio","06.ResultRecord.release_status","INDEPENDENT_PERMISSION"],
  ["06.RevisionRequest.base_version_ref","07.PipelineExecutionRequest.base_result_version_ref","VERSION_PRESERVATION"]
]);
export const ACTIVATION_GATES = Object.freeze([
  "SOURCE_VERSION_AUTHORIZED","SERVICE_VISIBLE_AND_ELIGIBLE","DOMAIN_OWNER_ASSIGNED",
  "ADAPTER_CONTRACT_COMPATIBLE","INPUT_ASSET_PERMISSION","FIELD_AND_DOMAIN_VALIDATION",
  "INPUT_SNAPSHOT_IMMUTABLE","SERVER_CASE_ACCESS","CONSENT_VALID",
  "PAYMENT_POLICY_CONFIRMED","CAPABILITY_PROVEN","RESULT_VERSION_RELEASE_VALID",
  "MASTER_APPROVAL_AND_FINAL_95"
]);
export const FAULT_ROUTES = Object.freeze([
  ["DOMAIN_OWNER_MISSING","08","BLOCK"],
  ["FLOW_ADAPTER_MISSING","08","BLOCK"],
  ["INPUT_PROFILE_MISSING","08","BLOCK"],
  ["FIELD_CONTRACT_MISMATCH","04","REVALIDATE_CONTRACT"],
  ["DOMAIN_VALIDATION_FAILED","08","REQUIRE_CORRECTION"],
  ["SERVICE_SCOPE_CONFLICT","02","CUSTOMER_SELECT"],
  ["MULTI_DOMAIN_CONFLICT","08","RESOLVE_PRIMARY_OWNER"],
  ["CAPABILITY_UNAVAILABLE","07","BLOCK_PROCESSING"],
  ["RESULT_SCHEMA_MISMATCH","06","QUARANTINE_RESULT"],
  ["REVISION_UNSUPPORTED","06","PRESERVE_PREVIOUS"],
  ["ASSET_ACCESS_DENIED","05","DENY_ACCESS"],
  ["SERVICE_POLICY_PENDING","05","BLOCK_SUBMISSION"],
  ["CONTRACT_VERSION_MISMATCH","MASTER","BLOCK_UNAPPROVED_MAPPING"],
  ["CROSS_DOMAIN_REUSE_DENIED","05","REQUEST_NEW_PERMISSION"],
  ["PIPELINE_HANDOFF_FAILED","07","RETRY_IDEMPOTENTLY"],
  ["CASE_REQUEST_DUPLICATED","05","RETURN_SAME_CASE_REF"],
  ["PAYMENT_STATUS_UNKNOWN","05","RECONCILE_PROVIDER_NOT_RECHARGE"],
  ["INPUT_SNAPSHOT_STALE","07","REVALIDATE_SNAPSHOT"],
  ["CONSENT_REVOKED","05","DENY_FURTHER_PROCESSING"],
  ["RESULT_RELEASE_NOT_AUTHORIZED","06","KEEP_RESULT_HIDDEN"]
].map(([code,owner,action])=>Object.freeze({code,owner,action,source_status:"DESIGN_REVIEW"})));
export const RESEARCH_SCENARIOS = Object.freeze([
  "주거 공간 전체 디자인","주방 배치 변경","주방 도면에 창·발코니 문 누락",
  "욕실 디자인 신청","욕실 특정 제품 적용","현관 수납 구성",
  "텍스트 간판","간판 설치 사진과 로고","간판 설치 위치 수정",
  "브랜드 제품 적용 이미지","제품 ID 비활성","소건축 사진만 제공",
  "CAD Capability 미검증","상업·F&B 동시 매칭","카페 디자인과 운영 콘셉트 차이",
  "브랜드 매뉴얼 적용","브랜드 자료 사용 권한 미확인","상업+간판 복합 요청",
  "사진 여러 서비스 재사용","여러 Domain 한 CASE 처리","복합 요청 별도 서비스 필요",
  "비회원 고객 신청","결제 정책 미결정","Domain 검증 전 CASE 신청",
  "미검증 Capability 고객 공개","엔진 성공·결과 Schema 불일치",
  "수정 기능 미지원","재생성 실패 기존 결과 보존",
  "Catalog·Adapter 버전 충돌","신규 Domain 확장",
  "고객 처리 동의 변경","동일 서비스 다른 진입 경로",
  "브로셔 담당 Owner 미확정","현장 확인 필요 조건 AI 추론만 있음",
  "고객 결과 공개와 포트폴리오 공개 분리"
].map((title,i)=>Object.freeze({id:"SCN_"+String(i+1).padStart(2,"0"),title,status:"DESIGN_REVIEW_ONLY"})));

export function deny(code,details={}) {
  return {ok:false,code,simulation:true,...details};
}
export function serviceById(id) { return SERVICES.find(s=>s.id===id)||null; }
export function resolveSelection(request) {
  if (!request || !ENTRY_MODES.includes(request.entry_mode)) return deny("ENTRY_MODE_UNSUPPORTED");
  if (request.catalog_version !== CONTROL.catalog_version) return deny("CATALOG_VERSION_MISMATCH");
  if (request.selected_service_id && request.service_id && request.selected_service_id!==request.service_id) return deny("SERVICE_ID_CONFLICT");
  // 02 matching is not equivalent to the customer's explicit selection.
  if (request.selection_confirmed !== true) return deny("CUSTOMER_SELECTION_REQUIRED");
  const s=serviceById(request.service_id||request.selected_service_id);
  if (!s) return deny("SERVICE_NOT_FOUND");
  if (!s.domain_id) return deny("DOMAIN_OWNER_MISSING");
  if (request.entry_mode==="SPACE_PURPOSE" && (!request.space_id||!request.purpose_id)) return deny("SPACE_PURPOSE_INPUT_REQUIRED");
  return {ok:true,simulation:true,service_id:s.id,domain_id:s.domain_id,
    entry_mode:request.entry_mode,source_entry_mode:request.entry_mode,
    selected_space_id:request.space_id||null,selected_purpose_id:request.purpose_id||null,
    service_catalog_version:CONTROL.catalog_version,
    routing_status:"RESOLVED_FOR_SIMULATION",service_access_status:"SIMULATION_ONLY",
    case_id:null,case_ref:null,case_created:false,
    production_approved:false};
}
export function validateInput(serviceId,input) {
  const s=serviceById(serviceId);
  if (!s) return deny("SERVICE_NOT_FOUND");
  if (!s.domain_id) return deny("DOMAIN_OWNER_MISSING");
  const missing=[];
  if (!input || typeof input.goal!=="string" || input.goal.trim().length<10) missing.push("goal");
  for (const f of s.fields) {
    if (!input || typeof input[f.key]!=="string" || !input[f.key].trim()) missing.push(f.key);
    if (f.options && input && input[f.key] && !f.options.includes(input[f.key])) return deny("FIELD_VALUE_INVALID",{field:f.key});
  }
  return {ok:missing.length===0,code:missing.length?"INPUT_REQUIRED":"INPUT_FORM_COMPLETE",
    missing,domain_validation:"NOT_PERFORMED",asset_verification:"NOT_PERFORMED",
    geometry_state:"UNKNOWN",dimension_state:"UNKNOWN",field_verify:s.id==="SVC_007"||s.id==="SVC_002",
    input_revision:"LOCAL_DRAFT_ONLY",case_created:false};
}
const TRANSITIONS = Object.freeze({
  FL_00:{ELIGIBILITY_SIMULATED:"FL_01"},
  FL_01:{START:"FL_02"},
  FL_02:{INPUT_FORM_COMPLETE:"FL_03"},
  FL_03:{SKIP_AI_DEMO:"FL_05",OPTION_REVIEW:"FL_04"},
  FL_04:{OPTION_RECORDED:"FL_05"},
  FL_05:{NO_ADDITIONAL_FIELDS:"FL_07",GAP_FOUND:"FL_06"},
  FL_06:{ADDITIONAL_INPUT:"FL_07"},
  FL_07:{CUSTOMER_CONFIRMED:"FL_08",EDIT_INPUT:"FL_02"},
  FL_08:{PRE_CASE_SIMULATION:"FL_09"},
  FL_09:{},
  FL_10:{}
});
export function initFlow(route) {
  if (!route?.ok) return deny("ROUTE_UNRESOLVED");
  return {ok:true,stage:"FL_00",service_id:route.service_id,
    revision:0,review_confirmed:false,analysis_status:"NOT_EXECUTED",
    case_ref:null,case_created:false,pipeline_executed:false,result_ref:null};
}
export function flowTransition(flow,event,guard={}) {
  if (!flow?.ok) return deny("FLOW_UNAVAILABLE");
  const next=TRANSITIONS[flow.stage]?.[event];
  if (!next) return deny("INVALID_FLOW_TRANSITION",{stage:flow.stage,event});
  if (event==="INPUT_FORM_COMPLETE" && !guard.formComplete) return deny("INPUT_REQUIRED");
  if (event==="CUSTOMER_CONFIRMED" && !guard.reviewConfirmed) return deny("REVIEW_REQUIRED");
  if (event==="PRE_CASE_SIMULATION" && !guard.simulationAcknowledged) return deny("SIMULATION_ACK_REQUIRED");
  return {...flow,stage:next,
    revision:flow.revision+(event==="EDIT_INPUT"?1:0),
    review_confirmed:event==="EDIT_INPUT"?false:event==="CUSTOMER_CONFIRMED"?true:flow.review_confirmed,
    analysis_status:event==="SKIP_AI_DEMO"?"NOT_EXECUTED":flow.analysis_status};
}
export function simulateSubmission(request,sessionCache=new Map()) {
  if (!request || request.mode!=="DESIGN_SIMULATION") return deny("PRODUCTION_DISABLED");
  const route=resolveSelection(request);
  if (!route.ok) return route;
  const input=validateInput(route.service_id,request.input);
  if (!input.ok) return input;
  if (!request.review_confirmed) return deny("REVIEW_REQUIRED");
  if (request.simulation_acknowledged!==true) return deny("SIMULATION_ACK_REQUIRED");
  if (!Number.isInteger(request.input_revision) || request.input_revision!==request.submission_revision) return deny("INPUT_SNAPSHOT_STALE");
  if (!request.idempotency_key) return deny("IDEMPOTENCY_KEY_REQUIRED");
  // Cache is memory-only; this is not a real CASE idempotency guarantee.
  if (sessionCache.has(request.idempotency_key)) return {...sessionCache.get(request.idempotency_key),replayed:true};
  const result={ok:true,code:"SIMULATION_ACCEPTED",synthetic_ref:"SIM_ONLY_"+String(sessionCache.size+1).padStart(3,"0"),
    recorded_service_id:route.service_id,input_revision:request.input_revision,
    case_created:false,real_case_ref:null,payment_processed:false,
    ai_executed:false,result_generated:false,replayed:false,mode:"DESIGN_SIMULATION"};
  sessionCache.set(request.idempotency_key,result);
  return result;
}
export function productionPreflight({service_id,source_approved=false,master_approved=false}={}) {
  const s=serviceById(service_id);
  if (!s) return deny("SERVICE_NOT_FOUND");
  if (!s.domain_id) return deny("DOMAIN_OWNER_MISSING");
  if (!source_approved || CONTROL.common_source_status==="REVIEW_REQUIRED") return deny("REQUIRED_SOURCE_NOT_APPROVED");
  if (!master_approved || !CONTROL.production_approved) return deny("MASTER_APPROVAL_REQUIRED");
  return deny("REAL_SERVER_IMPLEMENTATION_NOT_VERIFIED");
}
export function pipelinePreflight(request={}) {
  if (!request.case_ref || request.case_ref.startsWith("SIM_")) return deny("REAL_CASE_REQUIRED");
  if (!request.server_authorized) return deny("SERVER_AUTHORIZATION_REQUIRED");
  if (request.input_snapshot_revision!==request.submission_revision) return deny("INPUT_SNAPSHOT_STALE");
  if (!request.consent_valid) return deny("CONSENT_REVOKED");
  if (request.payment_required&&!request.payment_confirmed) return deny("PAYMENT_PENDING");
  if (!request.capability_production_approved) return deny("CAPABILITY_UNAVAILABLE");
  return deny("REAL_SERVER_IMPLEMENTATION_NOT_VERIFIED");
}
export function releasePreflight(request={}) {
  if (!request.server_authorized) return deny("SERVER_AUTHORIZATION_REQUIRED");
  if (request.release_status!=="RELEASED" || !request.result_validation_passed) return deny("RESULT_NOT_RELEASED");
  if (!request.entitlement_valid) return deny("ENTITLEMENT_DENIED");
  return deny("REAL_SERVER_IMPLEMENTATION_NOT_VERIFIED");
}
export function revisionCandidate(previous,request={}) {
  if (!previous || request.supported!==true) return deny("REVISION_UNSUPPORTED",{previous});
  if (previous.version!==request.base_version) return deny("BASE_VERSION_CONFLICT",{previous});
  if (!request.generation_success) return deny("REGENERATION_FAILED",{previous});
  return {ok:true,previous,candidate:{version:previous.version+1,
    release_status:"HIDDEN",source_version:previous.version,validation_status:"PENDING"}};
}
export function approvalReadiness() {
  return {ready:false,status:"PENDING_MASTER_REVIEW",source:"REVIEW_REQUIRED",
    service_owners_unresolved:SERVICES.filter(s=>!s.domain_id).map(s=>s.id),
    capabilities_proven:0,real_case_system:false,payment_integration:false,
    actual_AI_implementation:false,production_approved:false,final_95:CONTROL.final_95};
}
