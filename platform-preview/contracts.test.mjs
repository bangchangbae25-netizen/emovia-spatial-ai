import test from "node:test";
import assert from "node:assert/strict";
import {
  DATABASE_CANDIDATES,API_CANDIDATES,ACTIVATION_STATUS,
  REQUIRED_SOURCE_TRACE,masterReturnCandidate
} from "./contracts.mjs";

test("18 proposed tables preserve original channel owner",()=>{
  assert.equal(DATABASE_CANDIDATES.length,18);
  assert.equal(new Set(DATABASE_CANDIDATES.map(x=>x.name)).size,18);
  assert.equal(DATABASE_CANDIDATES.find(x=>x.name==="case_record").owner,"05");
  assert.equal(DATABASE_CANDIDATES.find(x=>x.name==="result_record").owner,"06");
  assert.equal(DATABASE_CANDIDATES.find(x=>x.name==="pipeline_job").owner,"07");
  assert.equal(DATABASE_CANDIDATES.find(x=>x.name==="source_registry_link").owner,"SOURCE_CONTROL");
  assert.ok(DATABASE_CANDIDATES.every(x=>x.implementation==="PROPOSED_ONLY"));
});
test("15 REST design interfaces are neither implemented nor public access APIs",()=>{
  assert.equal(API_CANDIDATES.length,15);
  assert.equal(new Set(API_CANDIDATES.map(x=>x.method+" "+x.path)).size,15);
  assert.ok(API_CANDIDATES.every(x=>!x.implemented&&x.server_authorization_required));
});
test("CASE and payment requests carry safety requirements",()=>{
  const create=API_CANDIDATES.find(x=>x.path==="/v1/cases");
  const callback=API_CANDIDATES.find(x=>x.path==="/v1/payments/provider-callback");
  assert.equal(create.owner,"05");
  assert.ok(create.requirements.includes("idempotency_key"));
  assert.ok(callback.requirements.includes("verified_provider_signature"));
  assert.ok(callback.requirements.includes("no_duplicate_charge"));
});
test("pipeline input and result publication require independent gates",()=>{
  const job=API_CANDIDATES.find(x=>x.path==="/v1/pipeline/jobs");
  const result=API_CANDIDATES.find(x=>x.path==="/v1/results/{result_ref}/release");
  assert.equal(job.owner,"07");
  assert.ok(job.requirements.includes("snapshot_ref"));
  assert.equal(result.owner,"06");
  assert.ok(result.requirements.includes("validated_result"));
});
test("source Registry not officially promoted",()=>{
  assert.equal(REQUIRED_SOURCE_TRACE.length,2);
  assert.equal(REQUIRED_SOURCE_TRACE[0].source_status,"REVIEW_REQUIRED");
  assert.ok(REQUIRED_SOURCE_TRACE.every(x=>!x.official_promotion));
});
test("Master handoff is review-only, not a deployed result",()=>{
  const m=masterReturnCandidate();
  assert.equal(m.channel_id,"CH_EMOVIA_DOMAIN_FLOW_INTEGRATION_V1");
  assert.equal(m.next_recommended_channel,null);
  assert.equal(m.master_integration_status,"PENDING_REVIEW");
  assert.equal(m.contracts.implemented_database_table_count,0);
  assert.equal(m.contracts.real_server_endpoint_count,0);
  assert.equal(m.production_approved,false);
  assert.equal(m.final_95,"PENDING");
});
test("brochure owner and capability implementation remain unresolved",()=>{
  assert.deepEqual(ACTIVATION_STATUS.unresolved_owner_ids,["SVC_011"]);
  assert.equal(ACTIVATION_STATUS.domain_owner_count,7);
  assert.equal(ACTIVATION_STATUS.case_storage,"NOT_IMPLEMENTED");
  assert.equal(ACTIVATION_STATUS.image_generation,"NOT_CONNECTED");
});
