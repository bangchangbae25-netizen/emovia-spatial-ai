"""EMOVIA CH07 research execution candidate V2 — local DESIGN_SIMULATION only.

This module is intentionally NOT a production API, AI engine, payment processor,
CH05 authorization provider, CH06 result publisher, or spatial validator.
No live services, real customer assets, provider credentials, or production release.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

MODE = "DESIGN_SIMULATION"
CONTRACT_VERSION = "2.0.0-CANDIDATE"
SERVICES = {
    "SVC_001": "DOM_RESIDENTIAL", "SVC_002": "DOM_RESIDENTIAL",
    "SVC_003": "DOM_RESIDENTIAL", "SVC_004": "DOM_RESIDENTIAL",
    "SVC_005": "DOM_SIGN", "SVC_006": "DOM_PRODUCT_MATERIAL",
    "SVC_007": "DOM_SMALL_ARCH", "SVC_008": "DOM_COMMERCIAL",
    "SVC_009": "DOM_FNB", "SVC_010": "DOM_FRANCHISE", "SVC_011": None,
}
# Source IDs are *research bindings*, not a claim that any is CURRENT_OFFICIAL.
SOURCE_BINDINGS = {
    "PACK01_REGISTRY_V2": "V2",
    "PACK02_SPATIAL_V1": "V1",
    "PACK03_RESEARCH_V1": "V1",
    "PACK04_PIPELINE_V1": "V1",
    "PACK05_JSON_V1": "V1",
    "PACK06_GATEWAY_V4": "FINAL_V4",
}
REQUIRED_SOURCES = {"PACK04_PIPELINE_V1", "PACK05_JSON_V1", "PACK06_GATEWAY_V4"}
PROVENANCE = {"USER_ENTERED", "USER_SELECTED", "USER_UPLOADED", "AI_OBSERVED", "AI_INFERRED"}
VERIFICATION = {"NOT_REQUIRED", "REQUIRED", "CONFIRMED", "REJECTED", "FIELD_VERIFY"}
TRANSITIONS = {
    "QUEUED": {"RUNNING", "CANCEL_REQUESTED", "FAILED"},
    "RUNNING": {"WAITING_DEPENDENCY", "VALIDATING", "CANCEL_REQUESTED", "FAILED"},
    "WAITING_DEPENDENCY": {"QUEUED", "RUNNING", "CANCEL_REQUESTED", "FAILED"},
    "VALIDATING": {"SUCCEEDED", "FAILED", "CANCEL_REQUESTED"},
    "CANCEL_REQUESTED": {"CANCELLED", "VALIDATING", "SUCCEEDED", "FAILED"},
    "SUCCEEDED": set(), "FAILED": set(), "CANCELLED": set(),
}
REQUEST_TYPES = {"INITIAL_GENERATION", "AUTHORIZED_REGENERATION"}
ENGINES = ("Recognition", "Analysis", "Decision", "Recommendation", "Generation", "Validation", "Learning")


def canonical(obj):
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def checksum(obj):
    return hashlib.sha256(canonical(obj).encode("utf-8")).hexdigest()


def newref(prefix):
    return prefix + "_" + secrets.token_hex(12)


def utcnow():
    return datetime.now(timezone.utc).isoformat()


class GateError(Exception):
    def __init__(self, code, http_status=409):
        self.code = code
        self.http_status = http_status
        super().__init__(code)


def require(ok, code, status=422):
    if not ok:
        raise GateError(code, status)


def valid_text(value, limit=160):
    return isinstance(value, str) and 1 <= len(value) <= limit


class ResearchStore:
    def __init__(self, db_path, demo_secret):
        require(valid_text(demo_secret, 4096) and len(demo_secret) >= 32,
                "DEMO_SECRET_REQUIRED", 500)
        self.db_path = str(db_path)
        self.demo_secret = demo_secret.encode("utf-8")
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS cases(
                    case_ref TEXT PRIMARY KEY, service_id TEXT NOT NULL, domain_id TEXT NOT NULL,
                    flow_session_ref TEXT NOT NULL, input_revision INTEGER NOT NULL,
                    consent_state TEXT NOT NULL, payment_state TEXT NOT NULL,
                    created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS case_keys(
                    flow_session_ref TEXT NOT NULL, idempotency_key TEXT NOT NULL,
                    request_hash TEXT NOT NULL, case_ref TEXT NOT NULL REFERENCES cases(case_ref),
                    PRIMARY KEY(flow_session_ref,idempotency_key));
                CREATE TABLE IF NOT EXISTS snapshots(
                    snapshot_ref TEXT PRIMARY KEY, case_ref TEXT NOT NULL REFERENCES cases(case_ref),
                    input_revision INTEGER NOT NULL, payload_json TEXT NOT NULL,
                    integrity_sha256 TEXT NOT NULL, created_at TEXT NOT NULL,
                    UNIQUE(case_ref,input_revision));
                CREATE TABLE IF NOT EXISTS source_traces(
                    trace_ref TEXT PRIMARY KEY, snapshot_ref TEXT NOT NULL REFERENCES snapshots(snapshot_ref),
                    source_id TEXT NOT NULL, source_version TEXT NOT NULL,
                    source_status TEXT NOT NULL, application_status TEXT NOT NULL,
                    applied_stage TEXT, created_at TEXT NOT NULL,
                    UNIQUE(snapshot_ref,source_id));
                CREATE TABLE IF NOT EXISTS checkpoints(
                    checkpoint_ref TEXT PRIMARY KEY, snapshot_ref TEXT NOT NULL UNIQUE REFERENCES snapshots(snapshot_ref),
                    channel_id TEXT NOT NULL, loaded_source_versions_json TEXT NOT NULL,
                    applied_source_versions_json TEXT NOT NULL, validation_state TEXT NOT NULL,
                    last_delta_id TEXT, next_action TEXT NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS jobs(
                    job_ref TEXT PRIMARY KEY, case_ref TEXT NOT NULL REFERENCES cases(case_ref),
                    snapshot_ref TEXT NOT NULL REFERENCES snapshots(snapshot_ref),
                    request_type TEXT NOT NULL, base_version_ref TEXT,
                    state TEXT NOT NULL, sequence_number INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS engine_traces(
                    job_ref TEXT NOT NULL REFERENCES jobs(job_ref), engine_name TEXT NOT NULL,
                    execution_status TEXT NOT NULL, capability_ref TEXT, artifact_ref TEXT,
                    PRIMARY KEY(job_ref,engine_name));
                CREATE TABLE IF NOT EXISTS failure_deltas(
                    delta_ref TEXT PRIMARY KEY, job_ref TEXT NOT NULL REFERENCES jobs(job_ref),
                    symptom_code TEXT NOT NULL, root_cause_status TEXT NOT NULL,
                    owner_channel TEXT NOT NULL, decision_status TEXT NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS job_keys(
                    case_ref TEXT NOT NULL REFERENCES cases(case_ref),
                    idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL,
                    job_ref TEXT NOT NULL REFERENCES jobs(job_ref),
                    PRIMARY KEY(case_ref,idempotency_key));
                CREATE TABLE IF NOT EXISTS job_events(
                    event_ref TEXT PRIMARY KEY, job_ref TEXT NOT NULL REFERENCES jobs(job_ref),
                    sequence_number INTEGER NOT NULL, state TEXT NOT NULL,
                    payload_hash TEXT NOT NULL, processing_status TEXT NOT NULL,
                    created_at TEXT NOT NULL, UNIQUE(job_ref,sequence_number));
                CREATE TABLE IF NOT EXISTS outbox(
                    outbox_ref TEXT PRIMARY KEY, topic TEXT NOT NULL, aggregate_ref TEXT NOT NULL,
                    payload_json TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
                    lease_token TEXT, lease_until REAL, created_at TEXT NOT NULL,
                    UNIQUE(topic,aggregate_ref));
                CREATE TABLE IF NOT EXISTS results(
                    result_ref TEXT PRIMARY KEY, case_ref TEXT NOT NULL UNIQUE REFERENCES cases(case_ref),
                    release_status TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS result_versions(
                    version_ref TEXT PRIMARY KEY, result_ref TEXT NOT NULL REFERENCES results(result_ref),
                    job_ref TEXT NOT NULL UNIQUE REFERENCES jobs(job_ref),
                    base_version_ref TEXT, candidate_json TEXT NOT NULL, candidate_hash TEXT NOT NULL,
                    validation_record_ref TEXT NOT NULL, release_status TEXT NOT NULL,
                    created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS handoffs(
                    handoff_ref TEXT PRIMARY KEY, version_ref TEXT NOT NULL UNIQUE REFERENCES result_versions(version_ref),
                    status TEXT NOT NULL, ack_ref TEXT, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS audit(
                    audit_ref TEXT PRIMARY KEY, aggregate_ref TEXT NOT NULL,
                    action TEXT NOT NULL, actor TEXT NOT NULL, record_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL);
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.db_path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA busy_timeout=10000")
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def token(self, case_ref):
        return hmac.new(self.demo_secret, ("research-case:" + case_ref).encode(), hashlib.sha256).hexdigest()

    def authorize(self, case_ref, authorization):
        require(valid_text(case_ref) and isinstance(authorization, str)
                and authorization.startswith("Bearer "), "CASE_ACCESS_DENIED", 401)
        require(hmac.compare_digest(authorization[7:], self.token(case_ref)),
                "CASE_ACCESS_DENIED", 403)
        self.get_case(case_ref)

    def _audit(self, db, aggregate_ref, action, actor, record):
        db.execute("INSERT INTO audit VALUES(?,?,?,?,?,?)",
                   (newref("AUDIT"), aggregate_ref, action, actor, checksum(record), utcnow()))

    def get_case(self, case_ref):
        with self.connect() as db:
            row = db.execute("SELECT * FROM cases WHERE case_ref=?", (case_ref,)).fetchone()
        require(row is not None, "CASE_NOT_FOUND", 404)
        return dict(row)

    def create_case(self, req):
        require(req.get("mode") == MODE, "PRODUCTION_DISABLED")
        sid = req.get("service_id")
        require(isinstance(sid, str) and sid in SERVICES, "SERVICE_UNKNOWN", 404)
        require(SERVICES[sid] is not None, "DOMAIN_OWNER_UNRESOLVED")
        require(sid == "SVC_003", "DEMO_PROFILE_UNAVAILABLE")
        require(req.get("input_validation_status") == "VALID", "INPUT_INVALID")
        require(req.get("review_confirmed") is True, "REVIEW_REQUIRED")
        require(req.get("access_verified") is True, "ACCESS_DENIED")
        require(req.get("consent_granted") is True, "CONSENT_REQUIRED")
        rev = req.get("submission_revision")
        require(type(rev) is int and rev > 0, "INPUT_REVISION_INVALID")
        session, key = req.get("flow_session_ref"), req.get("idempotency_key")
        require(valid_text(session) and valid_text(key), "REQUEST_ID_INVALID")
        payload_hash = checksum({k: v for k, v in req.items() if k != "idempotency_key"})
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute("SELECT * FROM case_keys WHERE flow_session_ref=? AND idempotency_key=?",
                                  (session, key)).fetchone()
            if existing:
                require(existing["request_hash"] == payload_hash, "IDEMPOTENCY_CONFLICT")
                ref, duplicate = existing["case_ref"], True
            else:
                ref, duplicate = newref("CASE"), False
                db.execute("INSERT INTO cases VALUES(?,?,?,?,?,?,?,?)",
                           (ref, sid, SERVICES[sid], session, rev, "MOCK_GRANTED", "POLICY_UNRESOLVED", utcnow()))
                db.execute("INSERT INTO case_keys VALUES(?,?,?,?)", (session, key, payload_hash, ref))
                self._audit(db, ref, "CASE_CREATED", "CH05_DEMO", {"service_id": sid, "revision": rev})
        return {"case_ref": ref, "case_token": self.token(ref), "duplicate": duplicate,
                "payment_state": "POLICY_UNRESOLVED", "mode": MODE, "production_ready": False}

    def freeze_snapshot(self, case_ref, req):
        case = self.get_case(case_ref)
        require(case["consent_state"] == "MOCK_GRANTED", "CONSENT_REVOKED")
        require(req.get("mode") == MODE, "PRODUCTION_DISABLED")
        rev = req.get("input_revision")
        require(type(rev) is int and rev == case["input_revision"], "INPUT_REVISION_CONFLICT")
        fields = req.get("fields")
        require(isinstance(fields, list) and 1 <= len(fields) <= 48, "FIELDS_INVALID")
        seen, goal = set(), None
        for f in fields:
            require(isinstance(f, dict) and valid_text(f.get("field_id")), "FIELD_INVALID")
            fid = f["field_id"]
            require(fid not in seen, "FIELD_DUPLICATE")
            seen.add(fid)
            require(f.get("source_type") in PROVENANCE and f.get("verification_status") in VERIFICATION,
                    "PROVENANCE_INVALID")
            if f["source_type"] in {"AI_INFERRED", "AI_OBSERVED"}:
                require(f["verification_status"] == "CONFIRMED", "UNVERIFIED_INFERENCE")
            require(f["verification_status"] not in {"REQUIRED", "REJECTED", "FIELD_VERIFY"},
                    "FIELD_VERIFY_REQUIRED")
            require(len(canonical(f)) <= 4096, "FIELD_PAYLOAD_TOO_LARGE")
            if f.get("geometry_critical") is True:
                # No real site/geometry verification provider exists in this mock.
                raise GateError("FIELD_VERIFY_REQUIRED")
            if fid == "bathroom.design_goal":
                goal = f.get("value")
        require(valid_text(goal, 2000) and len(goal) >= 4, "GOAL_REQUIRED")
        assets = req.get("asset_refs")
        require(isinstance(assets, list) and 1 <= len(assets) <= 8
                and all(valid_text(x, 100) and x.startswith("DEMO_ASSET_") for x in assets),
                "DEMO_ASSET_REQUIRED")
        require(req.get("locks", []) == [], "LOCK_VERIFICATION_UNAVAILABLE")
        source_refs = req.get("source_refs")
        require(isinstance(source_refs, list) and 3 <= len(source_refs) <= 6,
                "REQUIRED_SOURCE_NOT_CHECKED")
        src_map = {}
        for item in source_refs:
            require(isinstance(item, dict), "SOURCE_REF_INVALID")
            sid, ver = item.get("source_id"), item.get("version")
            require(isinstance(sid, str) and sid in SOURCE_BINDINGS
                    and SOURCE_BINDINGS[sid] == ver, "SOURCE_VERSION_MISMATCH")
            require(sid not in src_map, "SOURCE_DUPLICATE")
            src_map[sid] = ver
        require(REQUIRED_SOURCES.issubset(src_map), "REQUIRED_SOURCE_NOT_CHECKED")
        payload = {"input_revision": rev, "fields": fields, "asset_refs": assets,
                   "service_id": case["service_id"], "domain_id": case["domain_id"],
                   "service_catalog_version": "DEMO_CATALOG_1.0_CANDIDATE",
                   "input_schema_version": "DEMO_BATHROOM_INPUT_V1",
                   "source_flow_session_ref": case["flow_session_ref"],
                   "review_confirmation_ref": "DEMO_REVIEW_CONFIRMED",
                   "validation_summary_ref": "DEMO_INPUT_VALIDATED",
                   "locks": [], "source_refs": source_refs, "geometry_verified": False,
                   "capability_status": "UNVERIFIED", "source_applied": False}
        require(len(canonical(payload)) <= 65536, "SNAPSHOT_PAYLOAD_TOO_LARGE")
        h = checksum(payload)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute("SELECT * FROM snapshots WHERE case_ref=? AND input_revision=?",
                             (case_ref, rev)).fetchone()
            if old:
                require(old["integrity_sha256"] == h, "SNAPSHOT_IMMUTABLE")
                snap_ref, duplicate = old["snapshot_ref"], True
            else:
                snap_ref, duplicate = newref("SNAP"), False
                db.execute("INSERT INTO snapshots VALUES(?,?,?,?,?,?)",
                           (snap_ref, case_ref, rev, canonical(payload), h, utcnow()))
                for sid, ver in sorted(src_map.items()):
                    db.execute("INSERT INTO source_traces VALUES(?,?,?,?,?,?,?,?)",
                               (newref("TRACE"), snap_ref, sid, ver, "REVIEW_REQUIRED",
                                "REVIEWED_NOT_APPLIED", None, utcnow()))
                db.execute("INSERT INTO checkpoints VALUES(?,?,?,?,?,?,?,?,?)",
                           (newref("CHECKPOINT"), snap_ref, "CH_EMOVIA_PIPELINE_BINDING_ARCHITECTURE_V1",
                            canonical(src_map), canonical({}), "PENDING_REVIEW", None,
                            "MASTER_APPROVAL_AND_CAPABILITY_VERIFICATION", utcnow()))
                self._audit(db, case_ref, "SNAPSHOT_FROZEN", "CH07_DEMO", {"snapshot": snap_ref, "hash": h})
        return {"input_snapshot_ref": snap_ref, "snapshot_integrity_ref": h,
                "immutable": True, "duplicate": duplicate, "source_applied": False}

    def snapshot_traces(self, case_ref):
        with self.connect() as db:
            rows = db.execute("""SELECT t.source_id,t.source_version,t.source_status,
                t.application_status,t.applied_stage,s.snapshot_ref
                FROM source_traces t JOIN snapshots s ON s.snapshot_ref=t.snapshot_ref
                WHERE s.case_ref=? ORDER BY t.source_id""", (case_ref,)).fetchall()
        return [dict(row) for row in rows]

    def checkpoint(self, snapshot_ref):
        with self.connect() as db:
            row = db.execute("SELECT * FROM checkpoints WHERE snapshot_ref=?", (snapshot_ref,)).fetchone()
        require(row is not None, "CHECKPOINT_NOT_FOUND", 404)
        return dict(row)

    def _outbox(self, db, topic, aggregate_ref, payload):
        ref = newref("OUTBOX")
        db.execute("""INSERT INTO outbox(outbox_ref,topic,aggregate_ref,payload_json,status,created_at)
                   VALUES(?,?,?,?,'PENDING',?)""",
                   (ref, topic, aggregate_ref, canonical(payload), utcnow()))
        return ref

    def submit_job(self, req):
        require(req.get("mode") == MODE, "PRODUCTION_DISABLED")
        case_ref, snapshot_ref, key = req.get("case_ref"), req.get("input_snapshot_ref"), req.get("idempotency_key")
        require(valid_text(case_ref) and valid_text(snapshot_ref) and valid_text(key), "REQUEST_ID_INVALID")
        typ, base = req.get("request_type"), req.get("base_result_version_ref")
        require(typ in REQUEST_TYPES, "REQUEST_TYPE_INVALID")
        payload_hash = checksum({k: v for k, v in req.items() if k != "idempotency_key"})
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute("SELECT * FROM job_keys WHERE case_ref=? AND idempotency_key=?",
                             (case_ref, key)).fetchone()
            if old:
                require(old["request_hash"] == payload_hash, "IDEMPOTENCY_CONFLICT")
                ref, duplicate = old["job_ref"], True
            else:
                case = db.execute("SELECT * FROM cases WHERE case_ref=?", (case_ref,)).fetchone()
                snap = db.execute("SELECT * FROM snapshots WHERE snapshot_ref=?", (snapshot_ref,)).fetchone()
                require(case and snap and snap["case_ref"] == case_ref, "SNAPSHOT_CASE_MISMATCH")
                require(case["consent_state"] == "MOCK_GRANTED", "CONSENT_REVOKED")
                require(snap["input_revision"] == case["input_revision"], "INPUT_REVISION_CONFLICT")
                require(checksum(json.loads(snap["payload_json"])) == snap["integrity_sha256"],
                        "SNAPSHOT_TAMPERED")
                require(req.get("mock_ch05_entitlement_ref") == "DEMO_CH05_ENTITLEMENT",
                        "PAYMENT_POLICY_PENDING")
                require(req.get("mock_ch08_capability_ref") == "DEMO_SVC_003_CAPABILITY",
                        "CAPABILITY_UNAVAILABLE")
                require(req.get("result_schema") == "MOCK_BATHROOM_BRIEF", "RESULT_SCHEMA_UNVERIFIED")
                require(case["service_id"] == "SVC_003", "CAPABILITY_UNAVAILABLE")
                if typ == "AUTHORIZED_REGENERATION":
                    require(valid_text(base) and req.get("mock_ch06_revision_ref") == "DEMO_CH06_REVISION_APPROVED",
                            "REVISION_APPROVAL_REQUIRED")
                    require(db.execute("""SELECT 1 FROM result_versions v JOIN results r
                         ON r.result_ref=v.result_ref WHERE v.version_ref=? AND r.case_ref=?""",
                         (base, case_ref)).fetchone(), "BASE_VERSION_INVALID")
                else:
                    require(base is None, "BASE_VERSION_CONFLICT")
                ref, duplicate = newref("JOB"), False
                db.execute("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?)",
                           (ref, case_ref, snapshot_ref, typ, base, "QUEUED", 0, utcnow()))
                db.execute("INSERT INTO job_keys VALUES(?,?,?,?)", (case_ref, key, payload_hash, ref))
                for engine in ENGINES:
                    db.execute("INSERT INTO engine_traces VALUES(?,?,?,?,?)",
                               (ref, engine, "NOT_EXECUTED", None, None))
                self._outbox(db, "JOB_QUEUED", ref, {"job_ref": ref, "case_ref": case_ref,
                              "snapshot_ref": snapshot_ref, "mode": MODE})
                self._audit(db, ref, "JOB_CREATED", "CH07_DEMO", {"case_ref": case_ref, "snapshot_ref": snapshot_ref})
        return {"job_ref": ref, "job_status": self.get_job(ref)["state"], "duplicate": duplicate,
                "mode": MODE, "real_ai_called": False}

    def get_job(self, job_ref):
        with self.connect() as db:
            row = db.execute("SELECT * FROM jobs WHERE job_ref=?", (job_ref,)).fetchone()
        require(row is not None, "JOB_NOT_FOUND", 404)
        return dict(row)

    def engine_trace(self, job_ref):
        self.get_job(job_ref)
        with self.connect() as db:
            rows = db.execute("SELECT * FROM engine_traces WHERE job_ref=? ORDER BY rowid",
                              (job_ref,)).fetchall()
        return [dict(row) for row in rows]

    def failure_deltas(self, job_ref):
        self.get_job(job_ref)
        with self.connect() as db:
            rows = db.execute("SELECT * FROM failure_deltas WHERE job_ref=?",
                              (job_ref,)).fetchall()
        return [dict(row) for row in rows]

    def claim_outbox(self, lease_seconds=30, max_attempts=3):
        require(type(lease_seconds) is int and 1 <= lease_seconds <= 300, "LEASE_INVALID")
        require(type(max_attempts) is int and 1 <= max_attempts <= 10, "ATTEMPT_LIMIT_INVALID")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            now = time.time()
            db.execute("""UPDATE outbox SET status='DEADLETTER',lease_token=NULL,lease_until=NULL
                WHERE status='LEASED' AND lease_until<? AND attempts>=?""", (now, max_attempts))
            row = db.execute("""SELECT * FROM outbox
                WHERE status='PENDING' OR (status='LEASED' AND lease_until<? AND attempts<?)
                ORDER BY created_at,outbox_ref LIMIT 1""", (now, max_attempts)).fetchone()
            if row is None:
                return None
            token = secrets.token_hex(20)
            db.execute("""UPDATE outbox SET status='LEASED',attempts=attempts+1,
                       lease_token=?,lease_until=? WHERE outbox_ref=?""",
                       (token, now + lease_seconds, row["outbox_ref"]))
        return {"outbox_ref": row["outbox_ref"], "topic": row["topic"],
                "aggregate_ref": row["aggregate_ref"], "lease_token": token,
                "attempt": row["attempts"] + 1, "payload": json.loads(row["payload_json"]),
                "note": "LOCAL_OUTBOX_ONLY_NO_EXTERNAL_DISPATCH"}

    def ack_outbox(self, outbox_ref, lease_token):
        require(valid_text(outbox_ref) and valid_text(lease_token), "OUTBOX_ACK_INVALID")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM outbox WHERE outbox_ref=?", (outbox_ref,)).fetchone()
            require(row is not None, "OUTBOX_NOT_FOUND", 404)
            require(row["status"] == "LEASED" and row["lease_until"] > time.time()
                    and hmac.compare_digest(row["lease_token"] or "", lease_token),
                    "OUTBOX_LEASE_CONFLICT")
            db.execute("""UPDATE outbox SET status='ACKED',lease_token=NULL,lease_until=NULL
                          WHERE outbox_ref=?""", (outbox_ref,))
        return {"outbox_ref": outbox_ref, "status": "ACKED", "external_provider_called": False}

    def _apply_ordered(self, db, job, event_ref, seq, state, event_hash):
        require(state in TRANSITIONS.get(job["state"], set()), "INVALID_JOB_TRANSITION")
        existing = db.execute("SELECT * FROM job_events WHERE event_ref=?", (event_ref,)).fetchone()
        if existing:
            require(existing["payload_hash"] == event_hash, "EVENT_REF_CONFLICT")
            db.execute("UPDATE job_events SET processing_status='APPLIED' WHERE event_ref=?", (event_ref,))
        else:
            db.execute("INSERT INTO job_events VALUES(?,?,?,?,?,?,?)",
                       (event_ref, job["job_ref"], seq, state, event_hash, "APPLIED", utcnow()))
        db.execute("UPDATE jobs SET state=?,sequence_number=? WHERE job_ref=?",
                   (state, seq, job["job_ref"]))
        if state == "FAILED":
            delta_ref = newref("DELTA")
            db.execute("INSERT INTO failure_deltas VALUES(?,?,?,?,?,?,?)",
                       (delta_ref, job["job_ref"], "JOB_FAILED",
                        "UNVERIFIED", "CH07", "CANDIDATE", utcnow()))
            db.execute("""UPDATE checkpoints SET last_delta_id=?,
                validation_state='FAILURE_REVIEW_REQUIRED',
                next_action='HUMAN_REVIEW_OR_RECOVERY'
                WHERE snapshot_ref=?""", (delta_ref, job["snapshot_ref"]))
        return {**dict(job), "state": state, "sequence_number": seq}

    def apply_event(self, job_ref, req):
        ref, seq, state = req.get("event_ref"), req.get("sequence_number"), req.get("job_status")
        require(valid_text(ref) and type(seq) is int and seq > 0
                and isinstance(state, str) and state in TRANSITIONS, "EVENT_INVALID")
        event_hash = checksum({"job_ref": job_ref, "sequence_number": seq, "job_status": state})
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute("SELECT * FROM job_events WHERE event_ref=?", (ref,)).fetchone()
            if old:
                require(old["payload_hash"] == event_hash, "EVENT_REF_CONFLICT")
                return {"event_status": "DUPLICATE_IGNORED", "job_ref": job_ref}
            job = db.execute("SELECT * FROM jobs WHERE job_ref=?", (job_ref,)).fetchone()
            require(job is not None, "JOB_NOT_FOUND", 404)
            require(seq > job["sequence_number"], "STALE_EVENT")
            same_seq = db.execute("SELECT 1 FROM job_events WHERE job_ref=? AND sequence_number=?",
                                  (job_ref, seq)).fetchone()
            require(same_seq is None, "EVENT_SEQUENCE_CONFLICT")
            if seq > job["sequence_number"] + 1:
                db.execute("INSERT INTO job_events VALUES(?,?,?,?,?,?,?)",
                           (ref, job_ref, seq, state, event_hash, "PENDING_GAP", utcnow()))
                return {"event_status": "GAP_RECONCILE", "job_ref": job_ref,
                        "expected_sequence": job["sequence_number"] + 1}
            job = self._apply_ordered(db, job, ref, seq, state, event_hash)
            repaired = 0
            while True:
                pending = db.execute("""SELECT * FROM job_events WHERE job_ref=?
                     AND sequence_number=? AND processing_status='PENDING_GAP'""",
                     (job_ref, job["sequence_number"] + 1)).fetchone()
                if not pending:
                    break
                if pending["state"] not in TRANSITIONS.get(job["state"], set()):
                    db.execute("UPDATE job_events SET processing_status='REJECTED' WHERE event_ref=?",
                               (pending["event_ref"],))
                    break
                job = self._apply_ordered(db, job, pending["event_ref"],
                                          pending["sequence_number"], pending["state"], pending["payload_hash"])
                repaired += 1
            self._audit(db, job_ref, "JOB_EVENT_APPLIED", "CH07_DEMO",
                        {"sequence_number": job["sequence_number"], "state": job["state"]})
        return {"event_status": "APPLIED", "job_ref": job_ref,
                "job_status": job["state"], "sequence_number": job["sequence_number"],
                "reconciled_events": repaired, "result_release": "HIDDEN"}

    def record_candidate(self, job_ref, req):
        require(req.get("mode") == MODE, "PRODUCTION_DISABLED")
        require(req.get("validation_record_ref") == "SIMULATED_VALIDATION_PASS",
                "VALIDATION_NOT_PROVEN")
        candidate = req.get("candidate")
        require(isinstance(candidate, dict) and candidate.get("kind") == "MOCK_BATHROOM_BRIEF"
                and candidate.get("mock") is True and len(canonical(candidate)) <= 8192,
                "MOCK_RESULT_REQUIRED")
        h = checksum(candidate)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            job = db.execute("SELECT * FROM jobs WHERE job_ref=?", (job_ref,)).fetchone()
            require(job is not None, "JOB_NOT_FOUND", 404)
            require(job["state"] == "SUCCEEDED", "JOB_NOT_SUCCEEDED")
            old = db.execute("SELECT * FROM result_versions WHERE job_ref=?", (job_ref,)).fetchone()
            if old:
                require(old["candidate_hash"] == h, "CANDIDATE_IMMUTABLE")
                version_ref, duplicate = old["version_ref"], True
            else:
                result = db.execute("SELECT * FROM results WHERE case_ref=?", (job["case_ref"],)).fetchone()
                result_ref = result["result_ref"] if result else newref("RESULT")
                if not result:
                    db.execute("INSERT INTO results VALUES(?,?,?)", (result_ref, job["case_ref"], "HIDDEN"))
                version_ref, duplicate = newref("VERSION"), False
                db.execute("INSERT INTO result_versions VALUES(?,?,?,?,?,?,?,?,?)",
                           (version_ref, result_ref, job_ref, job["base_version_ref"],
                            canonical(candidate), h, "SIMULATED_VALIDATION_PASS", "HIDDEN", utcnow()))
                handoff_ref = newref("HANDOFF")
                db.execute("INSERT INTO handoffs VALUES(?,?,?,?,?)",
                           (handoff_ref, version_ref, "PENDING", None, utcnow()))
                self._outbox(db, "RESULT_HANDOFF", version_ref,
                             {"version_ref": version_ref, "handoff_ref": handoff_ref, "mode": MODE})
                self._audit(db, job_ref, "RESULT_CANDIDATE_RECORDED", "CH07_DEMO",
                            {"version_ref": version_ref, "validation": "SIMULATED_ONLY"})
            handoff = db.execute("SELECT * FROM handoffs WHERE version_ref=?", (version_ref,)).fetchone()
        return {"result_version_ref": version_ref, "handoff_ref": handoff["handoff_ref"],
                "handoff_status": handoff["status"], "release_status": "HIDDEN", "duplicate": duplicate}

    def ack_handoff(self, handoff_ref, req):
        require(req.get("mock_ch06_ack_ref") == "DEMO_CH06_ACK", "CH06_ACK_REQUIRED")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            handoff = db.execute("SELECT * FROM handoffs WHERE handoff_ref=?", (handoff_ref,)).fetchone()
            require(handoff is not None, "HANDOFF_NOT_FOUND", 404)
            if handoff["status"] == "ACKED":
                return {"handoff_ref": handoff_ref, "status": "ACKED", "duplicate": True,
                        "release_status": "HIDDEN"}
            outbox = db.execute("SELECT status FROM outbox WHERE topic='RESULT_HANDOFF' AND aggregate_ref=?",
                                (handoff["version_ref"],)).fetchone()
            require(outbox is not None and outbox["status"] == "ACKED",
                    "HANDOFF_OUTBOX_PENDING")
            db.execute("UPDATE handoffs SET status='ACKED',ack_ref=? WHERE handoff_ref=?",
                       ("DEMO_CH06_ACK", handoff_ref))
            self._audit(db, handoff_ref, "HANDOFF_ACKED", "CH06_DEMO", {"version_ref": handoff["version_ref"]})
        return {"handoff_ref": handoff_ref, "status": "ACKED", "duplicate": False,
                "release_status": "HIDDEN"}

    def internal_versions(self, case_ref):
        with self.connect() as db:
            rows = db.execute("""SELECT v.version_ref,v.job_ref,v.base_version_ref,
                v.candidate_json,v.release_status,h.status AS handoff_status
                FROM result_versions v JOIN results r ON r.result_ref=v.result_ref
                JOIN handoffs h ON h.version_ref=v.version_ref WHERE r.case_ref=?
                ORDER BY v.created_at,v.version_ref""", (case_ref,)).fetchall()
        return [{"version_ref": r["version_ref"], "job_ref": r["job_ref"],
                 "base_version_ref": r["base_version_ref"], "candidate": json.loads(r["candidate_json"]),
                 "release_status": r["release_status"], "handoff_status": r["handoff_status"]}
                for r in rows]

    def revoke_consent(self, case_ref):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            require(db.execute("UPDATE cases SET consent_state='REVOKED' WHERE case_ref=?",
                               (case_ref,)).rowcount, "CASE_NOT_FOUND", 404)
            self._audit(db, case_ref, "CONSENT_REVOKED", "CH05_DEMO", {"case_ref": case_ref})
        return {"case_ref": case_ref, "consent_state": "REVOKED", "new_processing": "BLOCKED"}

    def public_results(self, case_ref):
        self.get_case(case_ref)
        return []  # Always: this local research candidate has no release authority.

    def release(self, _result_ref):
        raise GateError("PRODUCTION_RELEASE_DISABLED")


class DemoHandler(BaseHTTPRequestHandler):
    server_version = "EMOVIA-Research-V2"
    sys_version = ""

    def log_message(self, fmt, *args):
        pass  # Do not log demo tokens, inputs, or query strings.

    def reply(self, status, payload):
        body = canonical(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        n = self.headers.get("Content-Length", "")
        require(n.isdigit() and 0 < int(n) <= 65536, "PAYLOAD_SIZE_INVALID", 413)
        try:
            obj = json.loads(self.rfile.read(int(n)).decode("utf-8"))
        except (UnicodeError, json.JSONDecodeError):
            raise GateError("INVALID_JSON", 400)
        require(isinstance(obj, dict), "JSON_OBJECT_REQUIRED", 400)
        return obj

    def admin(self):
        require(hmac.compare_digest(self.headers.get("X-Emovia-Demo-Key", "").encode(),
                                    self.server.store.demo_secret), "DEMO_ADMIN_DENIED", 401)

    def case_auth(self, case_ref):
        self.server.store.authorize(case_ref, self.headers.get("Authorization", ""))

    def route(self, method):
        u = urlsplit(self.path)
        require(not u.query, "QUERY_NOT_SUPPORTED", 400)
        parts = u.path.strip("/").split("/")
        s = self.server.store
        if method == "GET" and parts == ["v2", "health"]:
            return 200, {"status": "ok", "mode": MODE, "version": CONTRACT_VERSION,
                         "production_ready": False, "ai_connected": False,
                         "payment_connected": False, "release_enabled": False}
        if method == "GET" and parts == ["v2", "services"]:
            return 200, {"services": [{"service_id": sid, "domain_owner_id": dom,
                "capability_status": "UNVERIFIED", "production_approved": False}
                for sid, dom in SERVICES.items()]}
        if method == "POST" and parts == ["v2", "cases"]:
            self.admin()
            return 201, s.create_case(self.read_json())
        if method == "POST" and parts == ["v2", "executions"]:
            self.admin()
            p = self.read_json()
            self.case_auth(p.get("case_ref"))
            return 202, s.submit_job(p)
        if method == "GET" and len(parts) == 3 and parts[:2] == ["v2", "jobs"]:
            job = s.get_job(parts[2]); self.case_auth(job["case_ref"])
            return 200, {"job_ref": job["job_ref"], "job_status": job["state"],
                         "sequence_number": job["sequence_number"], "mode": MODE}
        if len(parts) >= 3 and parts[:2] == ["v2", "cases"]:
            case_ref = parts[2]
            if method == "GET" and len(parts) == 3:
                self.case_auth(case_ref)
                return 200, {"case": s.get_case(case_ref)}
            if len(parts) == 4 and parts[3] == "snapshots" and method == "POST":
                self.admin(); self.case_auth(case_ref)
                return 201, s.freeze_snapshot(case_ref, self.read_json())
            if len(parts) == 4 and parts[3] == "results" and method == "GET":
                self.case_auth(case_ref)
                return 200, {"results": s.public_results(case_ref)}
        if len(parts) >= 3 and parts[:2] == ["v2", "internal"]:
            self.admin()
            if len(parts) == 5 and parts[2] == "jobs" and parts[4] == "events" and method == "POST":
                return 200, s.apply_event(parts[3], self.read_json())
            if len(parts) == 5 and parts[2] == "jobs" and parts[4] == "candidate" and method == "POST":
                return 200, s.record_candidate(parts[3], self.read_json())
            if len(parts) == 5 and parts[2] == "jobs" and parts[4] == "engine-trace" and method == "GET":
                return 200, {"engines": s.engine_trace(parts[3]), "simulation_only": True}
            if len(parts) == 5 and parts[2] == "jobs" and parts[4] == "failure-deltas" and method == "GET":
                return 200, {"deltas": s.failure_deltas(parts[3]), "simulation_only": True}
            if len(parts) == 5 and parts[2] == "handoffs" and parts[4] == "ack" and method == "POST":
                return 200, s.ack_handoff(parts[3], self.read_json())
            if len(parts) == 5 and parts[2] == "cases" and parts[4] == "results" and method == "GET":
                return 200, {"versions": s.internal_versions(parts[3]), "simulation_only": True}
            if len(parts) == 5 and parts[2] == "cases" and parts[4] == "source-traces" and method == "GET":
                return 200, {"traces": s.snapshot_traces(parts[3]), "simulation_only": True}
            if len(parts) == 5 and parts[2] == "cases" and parts[4] == "revoke-consent" and method == "POST":
                return 200, s.revoke_consent(parts[3])
            if len(parts) == 4 and parts[2] == "outbox" and parts[3] == "claim" and method == "POST":
                return 200, {"item": s.claim_outbox()}
            if len(parts) == 5 and parts[2] == "outbox" and parts[4] == "ack" and method == "POST":
                p = self.read_json()
                return 200, s.ack_outbox(parts[3], p.get("lease_token"))
        if len(parts) == 4 and parts[:2] == ["v2", "results"] and parts[3] == "release" and method == "POST":
            self.admin()
            s.release(parts[2])
        raise GateError("ROUTE_NOT_FOUND", 404)

    def run(self, method):
        try:
            status, body = self.route(method)
            self.reply(status, body)
        except GateError as exc:
            self.reply(exc.http_status, {"error": {"code": exc.code}, "mode": MODE})
        except (sqlite3.Error, OSError, ValueError, TypeError):
            self.reply(500, {"error": {"code": "RESEARCH_RUNTIME_ERROR"}, "mode": MODE})

    def do_GET(self):
        self.run("GET")

    def do_POST(self):
        self.run("POST")


def start_server(db_path, demo_secret, host="127.0.0.1", port=0):
    require(host == "127.0.0.1", "LOCALHOST_ONLY", 500)
    server = ThreadingHTTPServer((host, port), DemoHandler)
    server.store = ResearchStore(db_path, demo_secret)
    return server


if __name__ == "__main__":
    secret = os.environ.get("EMOVIA_DEMO_KEY", "")
    if len(secret) < 32:
        raise SystemExit("Set a local EMOVIA_DEMO_KEY (32+ chars) first")
    db_path = os.environ.get("EMOVIA_RESEARCH_DB", str(Path(__file__).parent / "data" / "research_v2.sqlite"))
    port = int(os.environ.get("EMOVIA_RESEARCH_PORT", "8766"))
    server = start_server(db_path, secret, port=port)
    print("EMOVIA RESEARCH DESIGN_SIMULATION http://127.0.0.1:" + str(server.server_port), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()