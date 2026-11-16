/**
 * Non-operational data/API interface catalog sourced from EMOVIA 01–08 research.
 * Design proposal only: no database migrations, HTTP handlers, login, PG or worker.
 */
import {CONTROL,ACTIVATION_GATES,CONTRACT_BRIDGES,FAULT_ROUTES,RESEARCH_SCENARIOS,SERVICES} from "./core.mjs";

const table=(name,owner,key)=>Object.freeze({name,owner,primary_key:key,implementation:"PROPOSED_ONLY"});
export const DATABASE_CANDIDATES=Object.freeze([
  table("service_catalog","02","service_id"),
  table("service_domain_binding","08","service_id"),
  table("domain_adapter","08","adapter_id"),
  table("field_registry","04","field_id"),
  table("input_asset","04","asset_ref"),
  table("input_snapshot","07","snapshot_ref"),
  table("case_record","05","case_ref"),
  table("case_access_grant","05","access_ref"),
  table("consent_record","05","consent_ref"),
  table("order_record","05","order_ref"),
  table("payment_transaction","05","payment_ref"),
  table("pipeline_job","07","job_ref"),
  table("result_record","06","result_ref"),
  table("result_version","06","version_ref"),
  table("revision_request","06","revision_ref"),
  table("execution_trace","07","run_id"),
  table("source_registry_link","SOURCE_CONTROL","source_id"),
  table("source_checkpoint","SOURCE_CONTROL","checkpoint_ref")
]);
const api=(method,path,owner,requirements=[])=>Object.freeze({
  method,path,owner,requirements,implemented:false,server_authorization_required:true
});
export const API_CANDIDATES=Object.freeze([
  api("GET","/v1/services","02",["catalog_version","service_visibility"]),
  api("POST","/v1/router/match","02",["catalog_version","explicit_customer_selection"]),
  api("GET","/v1/services/{id}/input-profile","08",["domain_owner","input_profile_version"]),
  api("POST","/v1/input/validate","04",["field_contract_version","asset_permission"]),
  api("POST","/v1/cases","05",["idempotency_key","review_revision","access","consent","payment_policy"]),
  api("GET","/v1/cases/{case_ref}","05",["server_case_authorization"]),
  api("POST","/v1/orders","05",["case_or_order_policy","idempotency_key"]),
  api("POST","/v1/payments/provider-callback","05",["verified_provider_signature","reconciliation","no_duplicate_charge"]),
  api("POST","/v1/pipeline/jobs","07",["case_access","snapshot_ref","capability_proven","idempotency_key"]),
  api("GET","/v1/jobs/{job_ref}","07",["case_owner","job_access"]),
  api("GET","/v1/results/{result_ref}","06",["result_version_access","entitlement"]),
  api("POST","/v1/results/{result_ref}/release","06",["validated_result","server_release_authority"]),
  api("POST","/v1/revisions","06",["base_result_version","revision_entitlement","idempotency_key"]),
  api("POST","/v1/consent/revoke","05",["authorization","downstream_invalidation"]),
  api("GET","/v1/audit/{run_id}","07",["admin_only","trace_access"])
]);
export const ACTIVATION_STATUS=Object.freeze({
  service_count:SERVICES.length,
  unresolved_owner_ids:SERVICES.filter(s=>!s.domain_id).map(s=>s.id),
  domain_owner_count:new Set(SERVICES.map(s=>s.domain_id).filter(Boolean)).size,
  case_storage:"NOT_IMPLEMENTED",
  payment_provider:"NOT_CONNECTED",
  authentication:"NOT_IMPLEMENTED",
  image_generation:"NOT_CONNECTED",
  result_publication:"NOT_IMPLEMENTED",
  rights_audit:"PENDING",
  production_approved:false,
  master_integration_status:"PENDING_REVIEW",
  final_95:"PENDING"
});
export const REQUIRED_SOURCE_TRACE=Object.freeze([
  {source_id:"EMOVIA_PROJECT_SOURCE_SHARED_REGISTRY_DATA_CENTER_GATEWAY_FINAL_V4",
   owner:"COMMON_SOURCE_OWNER",version:"V4",source_status:"REVIEW_REQUIRED",
   used_fields:["mandatory_startup_gate","binding","application_trace","delta","checkpoint"],
   applied_scope:"DESIGN_REFERENCE_ONLY",official_promotion:false},
  {source_id:"CH_EMOVIA_DOMAIN_FLOW_INTEGRATION_V1",
   owner:"08",version:"V1",source_status:"DESIGN_SOURCE",
   used_fields:["service_domain_matrix","adapter","35_scenarios","error_recovery"],
   applied_scope:"DESIGN_REFERENCE_ONLY",official_promotion:false}
]);
export function masterReturnCandidate(){
  return {
    channel_id:"CH_EMOVIA_DOMAIN_FLOW_INTEGRATION_V1",
    channel_type:"UNIFIED_SPECIALIST_CHANNEL",
    completion_status:"READY_FOR_MASTER_REVIEW",
    version:"1.1-CANDIDATE",
    output_id:"PLATFORM_PREVIEW_REFERENCE_IMPLEMENTATION",
    implementation_scope:"STATIC_RESEARCH_SIMULATION_ONLY",
    work_completed:["ROUTING_REVIEW","INPUT_FORM_SIMULATION","FLOW_STATE_GUARDS","PRECASE_SIMULATION",
      "CONTRACT_BRIDGE_DESIGN","SOURCE_AUTHORITY_GUARD","RESULT_RELEASE_GUARD","REFERENCE_TESTS"],
    architecture:{
      service_domain_matrix:SERVICES.map(s=>({service_id:s.id,domain_owner_id:s.domain_id,production_approved:false})),
      database_candidates:DATABASE_CANDIDATES.length,
      api_candidates:API_CANDIDATES.length,
      activation_gate_count:ACTIVATION_GATES.length
    },
    contracts:{
      bridge_count:CONTRACT_BRIDGES.length,
      adapter_status:"REVIEW_REQUIRED",
      real_server_endpoint_count:0,
      implemented_database_table_count:0
    },
    validation_results:[],
    known_failures:FAULT_ROUTES.map(x=>({code:x.code,status:"DESIGN_POLICY_ONLY"})),
    unresolved:[
      "SVC_011_DOMAIN_OWNER",
      "PACK_06_FINAL_V4_APPROVAL",
      "CONTRACT_VERSION_ADAPTER_APPROVAL",
      "PAYMENT_POLICY_AND_PG_PROVIDER",
      "SERVER_AUTH_AND_CASE_ACCESS",
      "CAPABILITY_PRODUCTION_BENCHMARK",
      "REAL_SPATIAL_DOMAIN_VALIDATION",
      "API_DB_AND_REAL_CUSTOMER_E2E_TEST",
      "REGISTRY_WRITE_READBACK_CHECKPOINT",
      "FINAL_95_VALIDATION"
    ],
    dependencies:["CH_EMOVIA_PLATFORM_CUSTOMER_FLOW_MASTER_V1","EXISTING_01_TO_07_OWNERS"],
    master_approval_required:["SOURCE_VERSION","DOMAIN_OWNER_SVC_011","ACCESS_PAYMENT_POLICY","PRODUCTION_CAPABILITY"],
    master_integration_status:"PENDING_REVIEW",
    next_recommended_channel:null,
    scenario_design_count:RESEARCH_SCENARIOS.length,
    final_95:CONTROL.final_95,
    production_approved:false
  };
}
