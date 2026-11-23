"""Executable regression tests for local EMOVIA CH07 research V2.

All test data is synthetic. Passing does not mean AI/CH05/CH06/CH08 production readiness.
"""
import http.client
import json
import sqlite3
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from research_v2 import (
    CONTRACT_VERSION, MODE, REQUIRED_SOURCES, SERVICES, SOURCE_BINDINGS,
    GateError, ResearchStore, checksum, start_server,
)

KEY = "local-demo-key-for-contract-tests-not-production-0123456789"


def case_req(**overrides):
    data = dict(mode=MODE, service_id="SVC_003", flow_session_ref="FLOW_01",
                submission_revision=4, input_validation_status="VALID",
                review_confirmed=True, access_verified=True, consent_granted=True,
                idempotency_key="CASE_KEY_01")
    data.update(overrides)
    return data


def source_refs():
    return [{"source_id": sid, "version": SOURCE_BINDINGS[sid]}
            for sid in sorted(REQUIRED_SOURCES)]


def snap_req(**overrides):
    data = dict(mode=MODE, input_revision=4, asset_refs=["DEMO_ASSET_001"],
                fields=[{"field_id": "bathroom.design_goal", "value": "Warm modern bathroom",
                         "source_type": "USER_ENTERED", "verification_status": "NOT_REQUIRED"}],
                locks=[], source_refs=source_refs())
    data.update(overrides)
    return data


def job_req(case_ref, snapshot_ref, **overrides):
    data = dict(mode=MODE, case_ref=case_ref, input_snapshot_ref=snapshot_ref,
                idempotency_key="JOB_KEY_01", request_type="INITIAL_GENERATION",
                base_result_version_ref=None,
                mock_ch05_entitlement_ref="DEMO_CH05_ENTITLEMENT",
                mock_ch08_capability_ref="DEMO_SVC_003_CAPABILITY",
                result_schema="MOCK_BATHROOM_BRIEF")
    data.update(overrides)
    return data


def event_req(seq, state, ref=None):
    return {"event_ref": ref or "EVENT_" + str(seq),
            "sequence_number": seq, "job_status": state}


def candidate_req(**overrides):
    d = {"mode": MODE, "validation_record_ref": "SIMULATED_VALIDATION_PASS",
         "candidate": {"kind": "MOCK_BATHROOM_BRIEF", "mock": True,
                       "note": "Text fixture, not AI image"}}
    d.update(overrides)
    return d


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "research.sqlite"
        self.store = ResearchStore(self.path, KEY)

    def tearDown(self):
        self.tmp.cleanup()

    def assertGate(self, code, fn, *args, **kwargs):
        with self.assertRaises(GateError) as ctx:
            fn(*args, **kwargs)
        self.assertEqual(ctx.exception.code, code)

    def new_case(self, **kwargs):
        return self.store.create_case(case_req(**kwargs))

    def new_snapshot(self, case_ref, **kwargs):
        return self.store.freeze_snapshot(case_ref, snap_req(**kwargs))

    def new_job(self, case_ref, snapshot_ref, **kwargs):
        return self.store.submit_job(job_req(case_ref, snapshot_ref, **kwargs))

    def ready(self):
        case = self.new_case()
        snap = self.new_snapshot(case["case_ref"])
        job = self.new_job(case["case_ref"], snap["input_snapshot_ref"])
        return case, snap, job

    def succeed(self, job_ref):
        for seq, state in [(1, "RUNNING"), (2, "VALIDATING"), (3, "SUCCEEDED")]:
            self.store.apply_event(job_ref, event_req(seq, state))

    def test_01_catalog_11(self):
        self.assertEqual(len(SERVICES), 11)

    def test_02_domains_7(self):
        self.assertEqual(len(set(x for x in SERVICES.values() if x)), 7)

    def test_03_brochure_blocked(self):
        self.assertGate("DOMAIN_OWNER_UNRESOLVED", self.new_case, service_id="SVC_011")

    def test_04_non_demo_service_blocked(self):
        self.assertGate("DEMO_PROFILE_UNAVAILABLE", self.new_case, service_id="SVC_001")

    def test_05_mode_required(self):
        self.assertGate("PRODUCTION_DISABLED", self.new_case, mode="PRODUCTION")

    def test_06_input_validation_gate(self):
        self.assertGate("INPUT_INVALID", self.new_case, input_validation_status="INVALID")

    def test_07_review_gate(self):
        self.assertGate("REVIEW_REQUIRED", self.new_case, review_confirmed=False)

    def test_08_access_gate(self):
        self.assertGate("ACCESS_DENIED", self.new_case, access_verified=False)

    def test_09_consent_gate(self):
        self.assertGate("CONSENT_REQUIRED", self.new_case, consent_granted=False)

    def test_10_case_idempotent(self):
        a, b = self.new_case(), self.new_case()
        self.assertEqual(a["case_ref"], b["case_ref"])
        self.assertTrue(b["duplicate"])

    def test_11_case_key_conflict(self):
        self.new_case()
        self.assertGate("IDEMPOTENCY_CONFLICT", self.new_case, submission_revision=5)

    def test_12_case_key_scoped_to_session(self):
        a, b = self.new_case(), self.new_case(flow_session_ref="FLOW_02")
        self.assertNotEqual(a["case_ref"], b["case_ref"])

    def test_13_payment_unresolved_does_not_erase_case(self):
        c = self.new_case()
        self.assertEqual(c["payment_state"], "POLICY_UNRESOLVED")
        self.assertEqual(self.store.get_case(c["case_ref"])["payment_state"], "POLICY_UNRESOLVED")

    def test_14_case_token_access(self):
        c = self.new_case()
        self.store.authorize(c["case_ref"], "Bearer " + c["case_token"])
        self.assertGate("CASE_ACCESS_DENIED", self.store.authorize, c["case_ref"], "Bearer BAD")

    def test_15_snapshot_requires_sources(self):
        c = self.new_case()
        self.assertGate("REQUIRED_SOURCE_NOT_CHECKED", self.new_snapshot, c["case_ref"], source_refs=[])

    def test_16_source_version_mismatch(self):
        c = self.new_case()
        refs = source_refs()
        refs[0]["version"] = "INVALID"
        self.assertGate("SOURCE_VERSION_MISMATCH", self.new_snapshot, c["case_ref"], source_refs=refs)

    def test_17_source_traces_are_not_applied(self):
        c = self.new_case()
        self.new_snapshot(c["case_ref"])
        traces = self.store.snapshot_traces(c["case_ref"])
        self.assertEqual({t["source_id"] for t in traces}, REQUIRED_SOURCES)
        self.assertTrue(all(t["application_status"] == "REVIEWED_NOT_APPLIED"
                            and t["applied_stage"] is None for t in traces))

    def test_18_checkpoint_no_official_promotion(self):
        c = self.new_case()
        s = self.new_snapshot(c["case_ref"])
        ck = self.store.checkpoint(s["input_snapshot_ref"])
        self.assertEqual(json.loads(ck["applied_source_versions_json"]), {})
        self.assertEqual(ck["validation_state"], "PENDING_REVIEW")

    def test_19_snapshot_is_immutable(self):
        c = self.new_case()
        a = self.new_snapshot(c["case_ref"])
        b = self.new_snapshot(c["case_ref"])
        self.assertEqual(a["input_snapshot_ref"], b["input_snapshot_ref"])
        self.assertTrue(b["duplicate"])
        self.assertGate("SNAPSHOT_IMMUTABLE", self.new_snapshot, c["case_ref"],
                        fields=[{"field_id": "bathroom.design_goal", "value": "Different style",
                                 "source_type": "USER_ENTERED", "verification_status": "NOT_REQUIRED"}])

    def test_20_snapshot_revision_mismatch(self):
        c = self.new_case()
        self.assertGate("INPUT_REVISION_CONFLICT", self.new_snapshot, c["case_ref"], input_revision=5)

    def test_21_duplicate_fields_blocked(self):
        c = self.new_case()
        f = snap_req()["fields"][0]
        self.assertGate("FIELD_DUPLICATE", self.new_snapshot, c["case_ref"], fields=[f, f])

    def test_22_unconfirmed_inference_blocked(self):
        c = self.new_case()
        f = {"field_id": "bathroom.design_goal", "value": "Warm modern bathroom",
             "source_type": "AI_INFERRED", "verification_status": "REQUIRED"}
        self.assertGate("UNVERIFIED_INFERENCE", self.new_snapshot, c["case_ref"], fields=[f])

    def test_23_geometry_field_verify(self):
        c = self.new_case()
        f = {"field_id": "bathroom.design_goal", "value": "Warm modern bathroom",
             "source_type": "USER_ENTERED", "verification_status": "CONFIRMED",
             "geometry_critical": True}
        self.assertGate("FIELD_VERIFY_REQUIRED", self.new_snapshot, c["case_ref"], fields=[f])

    def test_24_geometry_lock_unavailable(self):
        c = self.new_case()
        self.assertGate("LOCK_VERIFICATION_UNAVAILABLE", self.new_snapshot, c["case_ref"],
                        locks=[{"kind": "WALL", "verified": True}])

    def test_25_no_real_asset(self):
        c = self.new_case()
        self.assertGate("DEMO_ASSET_REQUIRED", self.new_snapshot, c["case_ref"],
                        asset_refs=["REAL_USER_PHOTO.jpg"])

    def test_26_job_requires_entitlement(self):
        c = self.new_case()
        s = self.new_snapshot(c["case_ref"])
        self.assertGate("PAYMENT_POLICY_PENDING", self.new_job, c["case_ref"],
                        s["input_snapshot_ref"], mock_ch05_entitlement_ref=None)

    def test_27_job_requires_capability(self):
        c = self.new_case()
        s = self.new_snapshot(c["case_ref"])
        self.assertGate("CAPABILITY_UNAVAILABLE", self.new_job, c["case_ref"],
                        s["input_snapshot_ref"], mock_ch08_capability_ref=None)

    def test_28_job_requires_result_schema(self):
        c = self.new_case()
        s = self.new_snapshot(c["case_ref"])
        self.assertGate("RESULT_SCHEMA_UNVERIFIED", self.new_job, c["case_ref"],
                        s["input_snapshot_ref"], result_schema="UNKNOWN")

    def test_29_job_idempotent(self):
        c, s, j = self.ready()
        again = self.new_job(c["case_ref"], s["input_snapshot_ref"])
        self.assertEqual(j["job_ref"], again["job_ref"])
        self.assertTrue(again["duplicate"])

    def test_30_job_key_conflict(self):
        c, s, j = self.ready()
        self.assertGate("IDEMPOTENCY_CONFLICT", self.new_job, c["case_ref"],
                        s["input_snapshot_ref"], result_schema="CHANGED")

    def test_31_job_cannot_use_other_case_snapshot(self):
        c, s, j = self.ready()
        c2 = self.new_case(flow_session_ref="FLOW_02")
        self.assertGate("SNAPSHOT_CASE_MISMATCH", self.new_job, c2["case_ref"],
                        s["input_snapshot_ref"], idempotency_key="OTHER_CASE_JOB")

    def test_32_job_atomic_outbox(self):
        c, s, j = self.ready()
        with self.store.connect() as db:
            count = db.execute("SELECT COUNT(*) FROM outbox WHERE topic='JOB_QUEUED' AND aggregate_ref=?",
                               (j["job_ref"],)).fetchone()[0]
        self.assertEqual(count, 1)

    def test_33_outbox_lease_and_ack(self):
        self.ready()
        o = self.store.claim_outbox()
        self.assertEqual(o["topic"], "JOB_QUEUED")
        self.assertEqual(self.store.ack_outbox(o["outbox_ref"], o["lease_token"])["status"], "ACKED")
        self.assertIsNone(self.store.claim_outbox())

    def test_34_outbox_wrong_lease_denied(self):
        self.ready()
        o = self.store.claim_outbox()
        self.assertGate("OUTBOX_LEASE_CONFLICT", self.store.ack_outbox, o["outbox_ref"], "BAD")

    def test_35_outbox_expired_lease_retries(self):
        self.ready()
        o = self.store.claim_outbox(lease_seconds=1)
        time.sleep(1.03)
        n = self.store.claim_outbox(lease_seconds=1)
        self.assertEqual(o["outbox_ref"], n["outbox_ref"])
        self.assertEqual(n["attempt"], 2)
        self.assertGate("OUTBOX_LEASE_CONFLICT", self.store.ack_outbox,
                        o["outbox_ref"], o["lease_token"])
        self.store.ack_outbox(n["outbox_ref"], n["lease_token"])

    def test_36_job_transition_order(self):
        c, s, j = self.ready()
        self.succeed(j["job_ref"])
        self.assertEqual(self.store.get_job(j["job_ref"])["state"], "SUCCEEDED")

    def test_37_invalid_job_transition(self):
        c, s, j = self.ready()
        self.assertGate("INVALID_JOB_TRANSITION", self.store.apply_event, j["job_ref"],
                        event_req(1, "SUCCEEDED"))

    def test_38_duplicate_event(self):
        c, s, j = self.ready()
        e = event_req(1, "RUNNING")
        self.store.apply_event(j["job_ref"], e)
        self.assertEqual(self.store.apply_event(j["job_ref"], e)["event_status"], "DUPLICATE_IGNORED")

    def test_39_event_ref_conflict(self):
        c, s, j = self.ready()
        self.store.apply_event(j["job_ref"], event_req(1, "RUNNING"))
        self.assertGate("EVENT_REF_CONFLICT", self.store.apply_event, j["job_ref"],
                        event_req(2, "VALIDATING", "EVENT_1"))

    def test_40_stale_event(self):
        c, s, j = self.ready()
        self.store.apply_event(j["job_ref"], event_req(1, "RUNNING"))
        self.assertGate("STALE_EVENT", self.store.apply_event, j["job_ref"],
                        event_req(1, "RUNNING", "NEW_EVENT_REF"))

    def test_41_gap_buffer_reconcile(self):
        c, s, j = self.ready()
        gap = self.store.apply_event(j["job_ref"], event_req(2, "VALIDATING"))
        self.assertEqual(gap["event_status"], "GAP_RECONCILE")
        self.assertEqual(self.store.get_job(j["job_ref"])["state"], "QUEUED")
        resolved = self.store.apply_event(j["job_ref"], event_req(1, "RUNNING"))
        self.assertEqual(resolved["reconciled_events"], 1)
        self.assertEqual(self.store.get_job(j["job_ref"])["state"], "VALIDATING")

    def test_42_conflicting_sequence_blocked(self):
        c, s, j = self.ready()
        self.store.apply_event(j["job_ref"], event_req(3, "SUCCEEDED"))
        self.assertGate("EVENT_SEQUENCE_CONFLICT", self.store.apply_event, j["job_ref"],
                        event_req(3, "FAILED", "EVENT_CONFLICT"))

    def test_43_failed_job_cannot_publish(self):
        c, s, j = self.ready()
        self.store.apply_event(j["job_ref"], event_req(1, "FAILED"))
        self.assertGate("JOB_NOT_SUCCEEDED", self.store.record_candidate, j["job_ref"], candidate_req())

    def test_44_success_not_auto_result(self):
        c, s, j = self.ready()
        self.succeed(j["job_ref"])
        self.assertEqual(self.store.internal_versions(c["case_ref"]), [])
        self.assertEqual(self.store.public_results(c["case_ref"]), [])

    def test_45_candidate_requires_mock_validation(self):
        c, s, j = self.ready()
        self.succeed(j["job_ref"])
        self.assertGate("VALIDATION_NOT_PROVEN", self.store.record_candidate, j["job_ref"],
                        candidate_req(validation_record_ref="REAL_PASS"))

    def test_46_candidate_and_handoff_hidden(self):
        c, s, j = self.ready()
        self.succeed(j["job_ref"])
        v = self.store.record_candidate(j["job_ref"], candidate_req())
        self.assertEqual(v["release_status"], "HIDDEN")
        self.assertEqual(len(self.store.internal_versions(c["case_ref"])), 1)
        self.assertEqual(self.store.public_results(c["case_ref"]), [])
        for _ in range(2):
            o = self.store.claim_outbox()
            self.store.ack_outbox(o["outbox_ref"], o["lease_token"])
        self.assertEqual(self.store.ack_handoff(v["handoff_ref"],
                         {"mock_ch06_ack_ref": "DEMO_CH06_ACK"})["release_status"], "HIDDEN")

    def test_47_candidate_idempotent(self):
        c, s, j = self.ready()
        self.succeed(j["job_ref"])
        a = self.store.record_candidate(j["job_ref"], candidate_req())
        b = self.store.record_candidate(j["job_ref"], candidate_req())
        self.assertEqual(a["result_version_ref"], b["result_version_ref"])
        self.assertTrue(b["duplicate"])

    def test_48_candidate_conflict(self):
        c, s, j = self.ready()
        self.succeed(j["job_ref"])
        self.store.record_candidate(j["job_ref"], candidate_req())
        self.assertGate("CANDIDATE_IMMUTABLE", self.store.record_candidate, j["job_ref"],
                        candidate_req(candidate={"kind": "MOCK_BATHROOM_BRIEF", "mock": True, "note": "DIFFERENT"}))

    def test_49_handoff_requires_owner_ack(self):
        c, s, j = self.ready()
        self.succeed(j["job_ref"])
        v = self.store.record_candidate(j["job_ref"], candidate_req())
        self.assertGate("CH06_ACK_REQUIRED", self.store.ack_handoff,
                        v["handoff_ref"], {"mock_ch06_ack_ref": "NO"})

    def test_50_release_always_disabled(self):
        self.assertGate("PRODUCTION_RELEASE_DISABLED", self.store.release, "RESULT_ANY")

    def test_51_regeneration_requires_approval(self):
        c, s, j = self.ready()
        self.succeed(j["job_ref"])
        v = self.store.record_candidate(j["job_ref"], candidate_req())
        self.assertGate("REVISION_APPROVAL_REQUIRED", self.new_job, c["case_ref"],
                        s["input_snapshot_ref"], idempotency_key="REGEN", request_type="AUTHORIZED_REGENERATION",
                        base_result_version_ref=v["result_version_ref"])

    def test_52_failed_regen_preserves_old_version(self):
        c, s, j = self.ready()
        self.succeed(j["job_ref"])
        v = self.store.record_candidate(j["job_ref"], candidate_req())
        regen = self.new_job(c["case_ref"], s["input_snapshot_ref"], idempotency_key="REGEN",
                             request_type="AUTHORIZED_REGENERATION",
                             base_result_version_ref=v["result_version_ref"],
                             mock_ch06_revision_ref="DEMO_CH06_REVISION_APPROVED")
        self.store.apply_event(regen["job_ref"], event_req(1, "FAILED", "REGEN_EVENT_1"))
        versions = self.store.internal_versions(c["case_ref"])
        self.assertEqual(len(versions), 1)
        self.assertEqual(versions[0]["version_ref"], v["result_version_ref"])

    def test_53_revoke_consent_blocks_new_job(self):
        c = self.new_case()
        s = self.new_snapshot(c["case_ref"])
        self.store.revoke_consent(c["case_ref"])
        self.assertGate("CONSENT_REVOKED", self.new_job, c["case_ref"], s["input_snapshot_ref"])

    def test_54_concurrent_case_create_one_record(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.new_case(), range(8)))
        self.assertEqual(len(set(x["case_ref"] for x in results)), 1)

    def test_55_concurrent_job_create_one_record(self):
        c = self.new_case()
        s = self.new_snapshot(c["case_ref"])
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.new_job(c["case_ref"], s["input_snapshot_ref"]), range(8)))
        self.assertEqual(len(set(x["job_ref"] for x in results)), 1)
        with self.store.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM outbox WHERE topic='JOB_QUEUED'").fetchone()[0], 1)

    def test_56_restart_persistence(self):
        c, s, j = self.ready()
        reopened = ResearchStore(self.path, KEY)
        self.assertEqual(reopened.get_case(c["case_ref"])["service_id"], "SVC_003")
        self.assertEqual(reopened.get_job(j["job_ref"])["state"], "QUEUED")
        self.assertEqual(reopened.checkpoint(s["input_snapshot_ref"])["validation_state"], "PENDING_REVIEW")

    def test_57_contract_version_candidate(self):
        self.assertTrue(CONTRACT_VERSION.endswith("CANDIDATE"))

    def test_58_no_source_applied_on_job(self):
        c, s, j = self.ready()
        self.assertTrue(all(x["application_status"] != "APPLIED"
                            for x in self.store.snapshot_traces(c["case_ref"])))

    def test_59_audit_avoids_raw_goal(self):
        c, s, j = self.ready()
        with self.store.connect() as db:
            records = db.execute("SELECT * FROM audit").fetchall()
        self.assertGreaterEqual(len(records), 3)
        self.assertFalse(any("Warm modern bathroom" in str(dict(r)) for r in records))

    def test_66_seven_core_engines_never_falsely_executed(self):
        c, s, j = self.ready()
        trace = self.store.engine_trace(j["job_ref"])
        self.assertEqual(len(trace), 7)
        self.assertTrue(all(t["execution_status"] == "NOT_EXECUTED" for t in trace))
        self.succeed(j["job_ref"])
        self.assertTrue(all(t["execution_status"] == "NOT_EXECUTED"
                            for t in self.store.engine_trace(j["job_ref"])))

    def test_67_failure_delta_is_candidate_only(self):
        c, s, j = self.ready()
        self.store.apply_event(j["job_ref"], event_req(1, "FAILED"))
        delta = self.store.failure_deltas(j["job_ref"])
        self.assertEqual(len(delta), 1)
        self.assertEqual(delta[0]["decision_status"], "CANDIDATE")
        self.assertEqual(delta[0]["root_cause_status"], "UNVERIFIED")
        checkpoint = self.store.checkpoint(s["input_snapshot_ref"])
        self.assertEqual(checkpoint["last_delta_id"], delta[0]["delta_ref"])
        self.assertEqual(checkpoint["validation_state"], "FAILURE_REVIEW_REQUIRED")

    def test_68_pending_field_verification_blocks(self):
        c = self.new_case()
        f = snap_req()["fields"][0].copy()
        f["verification_status"] = "FIELD_VERIFY"
        self.assertGate("FIELD_VERIFY_REQUIRED", self.new_snapshot, c["case_ref"], fields=[f])

    def test_69_rejected_field_blocks(self):
        c = self.new_case()
        f = snap_req()["fields"][0].copy()
        f["verification_status"] = "REJECTED"
        self.assertGate("FIELD_VERIFY_REQUIRED", self.new_snapshot, c["case_ref"], fields=[f])

    def test_70_observed_ai_unconfirmed_blocks(self):
        c = self.new_case()
        f = snap_req()["fields"][0].copy()
        f["source_type"] = "AI_OBSERVED"
        self.assertGate("UNVERIFIED_INFERENCE", self.new_snapshot, c["case_ref"], fields=[f])

    def test_71_large_field_rejected(self):
        c = self.new_case()
        f = snap_req()["fields"][0].copy()
        f["description"] = "x" * 5000
        self.assertGate("FIELD_PAYLOAD_TOO_LARGE", self.new_snapshot, c["case_ref"], fields=[f])

    def test_72_unhashable_source_ref_rejected(self):
        c = self.new_case()
        refs = source_refs()
        refs[0]["source_id"] = ["INVALID"]
        self.assertGate("SOURCE_VERSION_MISMATCH", self.new_snapshot, c["case_ref"], source_refs=refs)

    def test_73_snapshot_retains_catalog_and_schema_versions(self):
        c = self.new_case()
        s = self.new_snapshot(c["case_ref"])
        with self.store.connect() as db:
            row = db.execute("SELECT payload_json FROM snapshots WHERE snapshot_ref=?",
                             (s["input_snapshot_ref"],)).fetchone()
        payload = json.loads(row["payload_json"])
        self.assertEqual(payload["service_id"], "SVC_003")
        self.assertTrue(payload["service_catalog_version"].endswith("CANDIDATE"))
        self.assertTrue(payload["input_schema_version"].startswith("DEMO_"))

    def test_74_invalid_event_state_rejected_before_gap_buffer(self):
        c, s, j = self.ready()
        self.assertGate("EVENT_INVALID", self.store.apply_event, j["job_ref"],
                        event_req(3, "ARBITRARY_STATE"))

    def test_75_handoff_cannot_ack_before_outbox_delivery(self):
        c, s, j = self.ready()
        self.succeed(j["job_ref"])
        v = self.store.record_candidate(j["job_ref"], candidate_req())
        self.assertGate("HANDOFF_OUTBOX_PENDING", self.store.ack_handoff, v["handoff_ref"],
                        {"mock_ch06_ack_ref": "DEMO_CH06_ACK"})

    def test_76_duplicate_handoff_ack_idempotent(self):
        c, s, j = self.ready()
        self.succeed(j["job_ref"])
        v = self.store.record_candidate(j["job_ref"], candidate_req())
        for _ in range(2):
            o = self.store.claim_outbox()
            self.store.ack_outbox(o["outbox_ref"], o["lease_token"])
        a = self.store.ack_handoff(v["handoff_ref"], {"mock_ch06_ack_ref": "DEMO_CH06_ACK"})
        b = self.store.ack_handoff(v["handoff_ref"], {"mock_ch06_ack_ref": "DEMO_CH06_ACK"})
        self.assertFalse(a["duplicate"])
        self.assertTrue(b["duplicate"])
        self.assertEqual(self.store.public_results(c["case_ref"]), [])

    def test_77_concurrent_outbox_claim_is_exclusive(self):
        self.ready()
        with ThreadPoolExecutor(max_workers=8) as pool:
            items = list(pool.map(lambda _: self.store.claim_outbox(), range(8)))
        self.assertEqual(len([x for x in items if x is not None]), 1)

    def test_78_outbox_deadletter_after_retry_limit(self):
        self.ready()
        a = self.store.claim_outbox(lease_seconds=1, max_attempts=2)
        time.sleep(1.03)
        b = self.store.claim_outbox(lease_seconds=1, max_attempts=2)
        self.assertEqual(a["outbox_ref"], b["outbox_ref"])
        time.sleep(1.03)
        self.assertIsNone(self.store.claim_outbox(lease_seconds=1, max_attempts=2))
        with self.store.connect() as db:
            status = db.execute("SELECT status FROM outbox WHERE outbox_ref=?",
                                (a["outbox_ref"],)).fetchone()[0]
        self.assertEqual(status, "DEADLETTER")

    def test_79_invalid_buffered_transition_rejected(self):
        c, s, j = self.ready()
        self.store.apply_event(j["job_ref"], event_req(2, "SUCCEEDED"))
        result = self.store.apply_event(j["job_ref"], event_req(1, "RUNNING"))
        self.assertEqual(result["reconciled_events"], 0)
        self.assertEqual(self.store.get_job(j["job_ref"])["state"], "RUNNING")
        with self.store.connect() as db:
            state = db.execute("SELECT processing_status FROM job_events WHERE event_ref='EVENT_2'").fetchone()[0]
        self.assertEqual(state, "REJECTED")

    def test_80_cancel_request_is_not_cancellation(self):
        c, s, j = self.ready()
        self.store.apply_event(j["job_ref"], event_req(1, "CANCEL_REQUESTED"))
        self.assertEqual(self.store.get_job(j["job_ref"])["state"], "CANCEL_REQUESTED")
        self.store.apply_event(j["job_ref"], event_req(2, "SUCCEEDED"))
        self.assertEqual(self.store.public_results(c["case_ref"]), [])

    def test_81_snapshot_tamper_blocks_job(self):
        c = self.new_case()
        s = self.new_snapshot(c["case_ref"])
        with self.store.connect() as db:
            db.execute("UPDATE snapshots SET payload_json='{}' WHERE snapshot_ref=?",
                       (s["input_snapshot_ref"],))
        self.assertGate("SNAPSHOT_TAMPERED", self.new_job, c["case_ref"], s["input_snapshot_ref"])

    def test_82_failed_job_admission_has_no_outbox(self):
        c = self.new_case()
        s = self.new_snapshot(c["case_ref"])
        self.assertGate("PAYMENT_POLICY_PENDING", self.new_job, c["case_ref"],
                        s["input_snapshot_ref"], mock_ch05_entitlement_ref=None)
        with self.store.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0], 0)

    def test_83_duplicate_source_ref_blocked(self):
        c = self.new_case()
        refs = source_refs()
        refs[1] = refs[0]
        self.assertGate("SOURCE_DUPLICATE", self.new_snapshot, c["case_ref"], source_refs=refs)

    def test_84_snapshot_requires_simulation_mode(self):
        c = self.new_case()
        self.assertGate("PRODUCTION_DISABLED", self.new_snapshot, c["case_ref"], mode="PRODUCTION")

    def test_85_revoked_consent_blocks_snapshot(self):
        c = self.new_case()
        self.store.revoke_consent(c["case_ref"])
        self.assertGate("CONSENT_REVOKED", self.new_snapshot, c["case_ref"])

    def test_86_idempotent_candidate_has_one_handoff_outbox(self):
        c, s, j = self.ready()
        self.succeed(j["job_ref"])
        self.store.record_candidate(j["job_ref"], candidate_req())
        self.store.record_candidate(j["job_ref"], candidate_req())
        with self.store.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM outbox WHERE topic='RESULT_HANDOFF'").fetchone()[0], 1)


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.server = start_server(Path(cls.tmp.name) / "http.sqlite", KEY)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)
        cls.tmp.cleanup()

    def http(self, method, path, body=None, headers=None):
        con = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        h = headers or {}
        if body is not None:
            body = json.dumps(body).encode("utf-8")
            h = {**h, "Content-Type": "application/json"}
        con.request(method, path, body=body, headers=h)
        response = con.getresponse()
        data = json.loads(response.read().decode("utf-8"))
        status = response.status
        con.close()
        return status, data

    def test_60_health_not_production(self):
        status, data = self.http("GET", "/v2/health")
        self.assertEqual(status, 200)
        self.assertFalse(data["production_ready"])
        self.assertFalse(data["ai_connected"])

    def test_61_services_are_unverified(self):
        status, data = self.http("GET", "/v2/services")
        self.assertEqual(status, 200)
        self.assertEqual(len(data["services"]), 11)
        self.assertTrue(all(not s["production_approved"] for s in data["services"]))

    def test_62_admin_required(self):
        status, data = self.http("POST", "/v2/cases", case_req(flow_session_ref="HTTP_DENIED"))
        self.assertEqual(status, 401)

    def test_63_case_token_required(self):
        status, c = self.http("POST", "/v2/cases", case_req(flow_session_ref="HTTP_OK", idempotency_key="HTTP_CASE"),
                              {"X-Emovia-Demo-Key": KEY})
        self.assertEqual(status, 201)
        status, data = self.http("GET", "/v2/cases/" + c["case_ref"])
        self.assertEqual(status, 401)
        status, data = self.http("GET", "/v2/cases/" + c["case_ref"],
                                 headers={"Authorization": "Bearer " + c["case_token"]})
        self.assertEqual(status, 200)

    def test_64_release_blocked_http(self):
        status, data = self.http("POST", "/v2/results/ANY/release", {},
                                 {"X-Emovia-Demo-Key": KEY})
        self.assertEqual(status, 409)
        self.assertEqual(data["error"]["code"], "PRODUCTION_RELEASE_DISABLED")

    def test_65_query_strings_rejected(self):
        status, data = self.http("GET", "/v2/health?token=BAD")
        self.assertEqual(status, 400)

    def test_87_http_full_mock_handoff_and_no_release(self):
        admin = {"X-Emovia-Demo-Key": KEY}
        code, c = self.http("POST", "/v2/cases",
                            case_req(flow_session_ref="HTTP_E2E", idempotency_key="HTTP_E2E_CASE"), admin)
        self.assertEqual(code, 201)
        auth = {**admin, "Authorization": "Bearer " + c["case_token"]}
        code, snap = self.http("POST", "/v2/cases/" + c["case_ref"] + "/snapshots", snap_req(), auth)
        self.assertEqual(code, 201)
        code, job = self.http("POST", "/v2/executions",
                              job_req(c["case_ref"], snap["input_snapshot_ref"], idempotency_key="HTTP_E2E_JOB"), auth)
        self.assertEqual(code, 202)
        ref = job["job_ref"]
        code, trace = self.http("GET", "/v2/internal/jobs/" + ref + "/engine-trace", headers=admin)
        self.assertEqual(code, 200)
        self.assertTrue(all(x["execution_status"] == "NOT_EXECUTED" for x in trace["engines"]))
        for seq, state in [(1, "RUNNING"), (2, "VALIDATING"), (3, "SUCCEEDED")]:
            code, event = self.http("POST", "/v2/internal/jobs/" + ref + "/events",
                                    event_req(seq, state, "HTTP_E2E_" + str(seq)), admin)
            self.assertEqual(code, 200)
        code, v = self.http("POST", "/v2/internal/jobs/" + ref + "/candidate", candidate_req(), admin)
        self.assertEqual(code, 200)
        for _ in range(2):
            code, box = self.http("POST", "/v2/internal/outbox/claim", {}, admin)
            self.assertEqual(code, 200)
            item = box["item"]
            self.assertIsNotNone(item)
            code, ack = self.http("POST", "/v2/internal/outbox/" + item["outbox_ref"] + "/ack",
                                  {"lease_token": item["lease_token"]}, admin)
            self.assertEqual(code, 200)
        code, handoff = self.http("POST", "/v2/internal/handoffs/" + v["handoff_ref"] + "/ack",
                                  {"mock_ch06_ack_ref": "DEMO_CH06_ACK"}, admin)
        self.assertEqual(code, 200)
        self.assertEqual(handoff["release_status"], "HIDDEN")
        code, result = self.http("GET", "/v2/cases/" + c["case_ref"] + "/results",
                                 headers={"Authorization": "Bearer " + c["case_token"]})
        self.assertEqual(code, 200)
        self.assertEqual(result["results"], [])
        code, traces = self.http("GET", "/v2/internal/cases/" + c["case_ref"] + "/source-traces",
                                  headers=admin)
        self.assertEqual(code, 200)
        self.assertEqual(len(traces["traces"]), 3)

    def test_88_http_invalid_json(self):
        con = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        con.request("POST", "/v2/cases", body=b"{not-json",
                    headers={"X-Emovia-Demo-Key": KEY, "Content-Type": "application/json"})
        resp = con.getresponse()
        data = json.loads(resp.read())
        self.assertEqual(resp.status, 400)
        self.assertEqual(data["error"]["code"], "INVALID_JSON")
        con.close()

    def test_89_http_payload_limit(self):
        con = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        con.request("POST", "/v2/cases", body=b" " * 65537,
                    headers={"X-Emovia-Demo-Key": KEY})
        resp = con.getresponse()
        self.assertEqual(resp.status, 413)
        resp.read()
        con.close()

    def test_90_http_internal_requires_admin(self):
        code, data = self.http("POST", "/v2/internal/outbox/claim", {})
        self.assertEqual(code, 401)


if __name__ == "__main__":
    unittest.main(verbosity=2)