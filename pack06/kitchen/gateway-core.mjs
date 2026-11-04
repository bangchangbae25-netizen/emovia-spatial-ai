// Pack 06 FINAL V4 candidate. This is a fail-closed research gateway, not a deployed service.
import { createHash } from "node:crypto";

export const PACK06_SCHEMA = "EMOVIA_PACK06_V4_KITCHEN_REGISTRY_CANDIDATE_V1";
export const KITCHEN_ROLE = "KITCHEN_SPECIALIST";
export const CHANNEL_ID = "CH_EMOVIA_RESIDENTIAL_KITCHEN_V2";
export const PROJECT_ID = "EMOVIA_RESIDENTIAL_SPACE";
export const REQUIRED_AREAS = [
  "project_registry", "channel_registry", "role_registry", "binding_profile",
  "binding_table", "source_registry", "data_center_index", "version_registry",
  "delta_log", "checkpoint", "application_trace", "failure_index",
  "lineage_index", "source_gap", "archive_index"
];

const serial = value => Array.isArray(value)
  ? "[" + value.map(serial).join(",") + "]"
  : value && typeof value === "object"
    ? "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + serial(value[key])).join(",") + "}"
    : JSON.stringify(value);

export function geometrySignature(scene) {
  const geometry = {
    plan_state_version: scene?.plan_state_version,
    decision_lock_version: scene?.decision_lock_version,
    product_source_version: scene?.product_source_version,
    scene_graph: scene?.scene_graph
  };
  return createHash("sha256").update(serial(geometry)).digest("hex");
}

export function validateRegistry(registry) {
  const issues = [];
  if (!registry || typeof registry !== "object") return ["REGISTRY_MISSING"];
  if (registry.schema_id !== PACK06_SCHEMA) issues.push("SCHEMA_MISMATCH");
  for (const name of REQUIRED_AREAS) if (!(name in registry)) issues.push("AREA_MISSING:" + name);
  if (registry.control?.current_official === true) issues.push("UNAUTHORIZED_CURRENT_OFFICIAL");
  if (registry.control?.final_95 !== "PENDING") issues.push("UNAUTHORIZED_FINAL_95");
  if (registry.control?.common_memory_approved || registry.control?.capability_approved) issues.push("AUTO_APPROVAL_FORBIDDEN");
  if (!registry.project_registry?.some(p => p.project_id === PROJECT_ID)) issues.push("PROJECT_MISSING");
  if (!registry.channel_registry?.some(c =>
    c.channel_id === CHANNEL_ID && c.project_id === PROJECT_ID && c.role === KITCHEN_ROLE)) issues.push("CHANNEL_OR_ROLE_MISSING");
  const ids = (registry.source_registry || []).map(s => s.source_id);
  if (new Set(ids).size !== ids.length) issues.push("DUPLICATE_SOURCE_ID");
  const profile = (registry.binding_profile || []).find(p => p.channel_id === CHANNEL_ID);
  if (!profile) issues.push("BINDING_PROFILE_MISSING");
  for (const id of profile?.required_source_ids || []) {
    if (!ids.includes(id)) issues.push("REQUIRED_SOURCE_MISSING:" + id);
    if (!(registry.binding_table || []).some(b => b.channel_id === CHANNEL_ID && b.source_id === id && b.required))
      issues.push("REQUIRED_BINDING_MISSING:" + id);
  }
  const key = s => s.source_id;
  for (const s of registry.source_registry || []) {
    if (!s.owner_project && s.source_id !== "PACK06_FINAL_V4") issues.push("OWNER_PROJECT_MISSING:" + key(s));
    if (!s.version) issues.push("VERSION_MISSING:" + key(s));
    if (s.application_state === "APPLIED" && !registry.application_trace?.some(t => t.applied_source_ids?.includes(s.source_id)))
      issues.push("APPLIED_WITHOUT_TRACE:" + key(s));
  }
  return issues;
}

export function findRequiredSources(registry) {
  const profile = registry?.binding_profile?.find(p => p.channel_id === CHANNEL_ID);
  if (!profile) return { errors: ["ROLE_BINDING_MISSING"], required: [] };
  return {
    errors: [],
    required: profile.required_source_ids.map(id =>
      registry.source_registry.find(s => s.source_id === id)).filter(Boolean)
  };
}

function sourceLocationOK(source) {
  const loc = source?.data_center_location;
  // A public fixture or a folder-name marker is not a readable source location.
  return !!(loc && typeof loc === "object" && (
    (loc.type === "LIBRARY_FILE_REFERENCE" && typeof loc.library_file_id === "string" && loc.library_file_id.length > 12) ||
    (loc.type === "PROJECT_FILE_REFERENCE" && typeof loc.file_id === "string" && loc.file_id.length > 12) ||
    (loc.type === "PRIVATE_SOURCE_ALIAS" && typeof loc.alias === "string" && loc.alias.length > 2)
  ));
}

const goodInt = n => Number.isInteger(n) && n >= 0;
const overlapXYZ = (a, b) => ["x", "y", "z"].every(k =>
  Number(a?.[k + "0"]) < Number(b?.[k + "1"]) &&
  Number(b?.[k + "0"]) < Number(a?.[k + "1"]));

export function replayKitchenCases(B50, B58) {
  const checks = [];
  const add = (id, pass, expected, actual) => checks.push({ id, pass: !!pass, expected, actual });
  if (B50?.batch_id !== "B50" || B58?.batch_id !== "B58") return {
    tests: 0, passed: 0, failed: 1, failures: [{ id: "SOURCE_BATCH_ID", pass: false }],
    status: "FAIL", site_approval: false
  };
  for (const c of B50.generic_module_arithmetic_cases || []) {
    const extra = c.fridge_in_run && c.fridge_sku === "RF85DB91F1AP" ? 912 : 0;
    let expected, pass;
    if (Array.isArray(c.modules_mm)) {
      const sum = c.modules_mm.reduce((a, b) => a + b, 0) + extra;
      expected = c.run_mm - sum < 0 ? "REJECT" : "HOLD";
      pass = c.sum_nominal_width_mm === sum &&
        c.spare_mm_before_panels === c.run_mm - sum && String(c.result).startsWith(expected);
    } else if (c.shape === "L") {
      const effective = c.arm_1_mm + c.arm_2_mm - c.corner_overlap_mm;
      expected = c.unverified_peninsula_add || c.assumed_modules_total_mm > effective ? "REJECT" : "HOLD";
      pass = c.effective_two_arm_run_mm === effective && String(c.result).startsWith(expected);
    } else { expected = "KNOWN_LAYOUT"; pass = false; }
    add("B50:" + c.id, pass, expected, c.result);
  }
  for (const c of B50.illustrative_xyz_collision_cases || []) {
    const actual = overlapXYZ(c.drawer_xyz_mm, c.reserved_xyz_mm);
    add("B50:XYZ:" + c.case, actual === c.expected_overlap && actual === c.calculated_overlap, c.expected_overlap, actual);
  }
  for (const c of B58.tests || []) {
    const [w, h, d] = c.product_actual_outer_whd_mm || [];
    const [W, H, D] = c.hypothetical_niche_inner_whd_mm || [];
    const expected = ![w, h, d, W, H, D].every(goodInt) ? "INVALID_DIMENSIONS"
      : W < w ? "FAIL_OUTER_W" : H < h ? "FAIL_OUTER_H"
      : D < d ? "FAIL_OUTER_D_IF_FLUSH_REQUIRED" : "HOLD_DOOR_VENT_SERVICE";
    add("B58:" + c.test_id, c.result === expected, expected, c.result);
  }
  const failed = checks.filter(c => !c.pass);
  return { tests: checks.length, passed: checks.length - failed.length, failed: failed.length,
    failures: failed, status: failed.length ? "FAIL" : "MATCHED_HISTORICAL_RESEARCH",
    site_approval: false, rendered_image: false };
}

export function generationGate({ registry, scene, validatorReport, generatorConnected = false }) {
  const missing = [];
  if (!registry || validateRegistry(registry).length) missing.push("REGISTRY_INVALID");
  if (registry?.control?.pack06_status !== "CURRENT_OFFICIAL") missing.push("PACK06_NOT_CURRENT_OFFICIAL");
  if (!generatorConnected) missing.push("GENERATOR_NOT_CONNECTED");
  for (const key of ["plan_state_version", "decision_lock_version", "product_source_version", "scene_graph"]) {
    if (!scene?.[key]) missing.push("SCENE_MISSING:" + key);
  }
  if (scene && scene.scene_graph_hash !== geometrySignature(scene)) missing.push("SCENE_HASH_INVALID");
  for (const k of ["geometry_verified", "product_spec_verified", "installation_verified", "operation_verified", "same_space_preflight_pass"]) {
    if (validatorReport?.[k] !== true) missing.push("EVIDENCE_MISSING:" + k);
  }
  return { allow: false, status: "BLOCKED", reasons: missing.length ? missing : ["GENERATOR_GATEWAY_NOT_WIRED"],
    note: "This candidate has no production generator adapter. Never authorize from JSON alone." };
}

export function outputApprovalGate({ generationReport, imageAValidation, imageBValidation }) {
  const reasons = [];
  if (generationReport?.allow !== true) reasons.push("GENERATION_NOT_AUTHORIZED");
  if (imageAValidation?.status !== "PASS") reasons.push("IMAGE_A_NOT_VERIFIED");
  if (imageBValidation?.status !== "PASS") reasons.push("IMAGE_B_NOT_VERIFIED");
  return { approved: false, status: "HOLD", reasons: reasons.length ? reasons : ["OUTPUT_GATE_NOT_WIRED"] };
}

export async function runKitchenReplay({ registry, sourceReader, store, runId, now }) {
  const result = { run_id: runId, channel_id: CHANNEL_ID, role: KITCHEN_ROLE,
    applied_source_ids: [], source_count: 0, status: "HOLD", errors: [], tests: null,
    checkpoint_before: null, checkpoint_after: null, checkpoint_verified: false };
  if (validateRegistry(registry).length) {
    result.errors = validateRegistry(registry); result.status = "REGISTRY_INITIALIZATION_ERROR"; return result;
  }
  const { required } = findRequiredSources(registry);
  if (required.length !== registry.binding_profile.find(b => b.channel_id === CHANNEL_ID).required_source_ids.length) {
    result.status = "SOURCE_GAP"; result.errors.push("REQUIRED_SOURCE_MISSING"); return result;
  }
  const missingLoc = required.filter(s => !sourceLocationOK(s)).map(s => s.source_id);
  if (missingLoc.length) {
    result.status = "DATA_CENTER_LOCATION_ERROR"; result.errors = missingLoc.map(x => "UNRESOLVED_LOCATION:" + x); return result;
  }
  if (!sourceReader || typeof sourceReader.load !== "function" || !store) {
    result.status = "HOLD"; result.errors.push("PROVIDER_OR_STORE_NOT_CONNECTED"); return result;
  }
  try {
    result.checkpoint_before = await store.readCheckpoint(CHANNEL_ID);
    const reads = {};
    for (const id of ["KITCHEN_B50", "KITCHEN_B58"]) {
      const src = required.find(s => s.source_id === id);
      if (!src) { result.status = "SOURCE_GAP"; result.errors.push("REPLAY_SOURCE_NOT_BOUND:" + id); return result; }
      const loaded = await sourceReader.load({ source_id: id, location: src.data_center_location, expected_version: src.version });
      if (!loaded || typeof loaded !== "object") { result.status = "SOURCE_GAP"; result.errors.push("SOURCE_NOT_READ:" + id); return result; }
      reads[id] = loaded;
      result.source_count++;
    }
    result.tests = replayKitchenCases(reads.KITCHEN_B50, reads.KITCHEN_B58);
    if (result.tests.failed || !result.tests.tests) { result.status = "FAIL"; result.errors.push("REPLAY_VALIDATION_FAIL"); return result; }
    result.applied_source_ids = ["KITCHEN_B50", "KITCHEN_B58"];
    const trace = { run_id: runId, channel_id: CHANNEL_ID, channel_role: KITCHEN_ROLE,
      applied_source_ids: result.applied_source_ids, source_versions: {
        KITCHEN_B50: required.find(s => s.source_id === "KITCHEN_B50").version,
        KITCHEN_B58: required.find(s => s.source_id === "KITCHEN_B58").version },
      applied_stage: ["ANALYSIS","VALIDATION"], applied_fields: ["NOMINAL_RUN","XYZ_OCCUPANCY","FRIDGE_WHD"],
      output_id: "REPLAY_" + runId, validation_result: "HISTORICAL_MATCH_NOT_SITE_APPROVAL",
      checkpoint_before: result.checkpoint_before?.checkpoint_id || null };
    const delta = { delta_id: "DELTA_" + runId, delta_type: "VALIDATION_CHANGE",
      source_payload_changed: false, source_delta: "NO_NEW_SOURCE_DELTA",
      validation_result: result.tests.status, promotion_allowed: false };
    await store.appendTrace(trace);
    await store.appendDelta(delta);
    const checkpoint = { checkpoint_id: "CP_" + runId, channel_id: CHANNEL_ID,
      source_ids: result.applied_source_ids, last_loaded_version: trace.source_versions,
      last_applied_version: "RESEARCH_REPLAY_ONLY", last_delta_id: delta.delta_id,
      validation_state: "REPLAY_PASS_SITE_AND_GENERATION_HOLD",
      next_required_version: "FRESHNESS_OWNER_AND_DELTA_RECHECK", last_verified: now };
    await store.writeCheckpoint(CHANNEL_ID, checkpoint);
    const reread = await store.readCheckpoint(CHANNEL_ID);
    if (serial(reread) !== serial(checkpoint)) {
      result.status = "CHECKPOINT_ERROR"; result.errors.push("CHECKPOINT_READBACK_MISMATCH"); return result;
    }
    result.checkpoint_after = checkpoint.checkpoint_id;
    result.checkpoint_verified = true;
    result.status = "PARTIAL_PASS";
    result.trace_id = trace.run_id;
    result.delta_id = delta.delta_id;
    return result;
  } catch (error) {
    result.status = "CHECKPOINT_ERROR";
    result.errors.push("STORE_OR_SOURCE_IO_FAILURE:" + String(error.message || error));
    return result;
  }
}
