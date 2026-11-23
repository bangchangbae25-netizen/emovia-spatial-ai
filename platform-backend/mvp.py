"""EMOVIA 07 pipeline contract prototype. DESIGN_SIMULATION only; NEVER production.

Pure Python stdlib + SQLite. Localhost-only. No external AI, payments, uploads,
public release, or autonomous Core Engine implementation.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

MODE = 'DESIGN_SIMULATION'
SERVICE_DOMAINS = {
    'SVC_001': 'DOM_RESIDENTIAL', 'SVC_002': 'DOM_RESIDENTIAL',
    'SVC_003': 'DOM_RESIDENTIAL', 'SVC_004': 'DOM_RESIDENTIAL',
    'SVC_005': 'DOM_SIGN', 'SVC_006': 'DOM_PRODUCT_MATERIAL',
    'SVC_007': 'DOM_SMALL_ARCH', 'SVC_008': 'DOM_COMMERCIAL',
    'SVC_009': 'DOM_FNB', 'SVC_010': 'DOM_FRANCHISE', 'SVC_011': None,
}
TRANSITIONS = {
    'QUEUED': {'RUNNING', 'CANCEL_REQUESTED', 'FAILED'},
    'RUNNING': {'WAITING_DEPENDENCY', 'VALIDATING', 'CANCEL_REQUESTED', 'FAILED'},
    'WAITING_DEPENDENCY': {'QUEUED', 'RUNNING', 'CANCEL_REQUESTED', 'FAILED'},
    'VALIDATING': {'SUCCEEDED', 'FAILED', 'CANCEL_REQUESTED'},
    'CANCEL_REQUESTED': {'CANCELLED', 'VALIDATING', 'SUCCEEDED', 'FAILED'},
    'SUCCEEDED': set(), 'FAILED': set(), 'CANCELLED': set(),
}
PROVENANCE = {'USER_ENTERED', 'USER_SELECTED', 'USER_UPLOADED', 'AI_OBSERVED', 'AI_INFERRED'}
VERIFICATION = {'NOT_REQUIRED', 'REQUIRED', 'CONFIRMED', 'REJECTED'}


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'))


def fingerprint(value):
    return hashlib.sha256(canonical(value).encode('utf-8')).hexdigest()


def newref(prefix):
    return prefix + '_' + secrets.token_hex(12)


def timestamp():
    return datetime.now(timezone.utc).isoformat()


class ContractError(Exception):
    def __init__(self, code, status=409):
        super().__init__(code)
        self.code, self.status = code, status


def require(truth, code, status=422):
    if not truth:
        raise ContractError(code, status)


def text(value, maxlen=160):
    return isinstance(value, str) and 1 <= len(value) <= maxlen


class ContractStore:
    def __init__(self, path, demo_secret):
        require(text(demo_secret, 1024) and len(demo_secret) >= 32, 'DEMO_SECRET_TOO_SHORT', 500)
        self.path, self.secret = str(path), demo_secret.encode()
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.db() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS cases(
                    id TEXT PRIMARY KEY, service TEXT NOT NULL, domain TEXT NOT NULL,
                    session TEXT NOT NULL, revision INTEGER NOT NULL,
                    consent INTEGER NOT NULL DEFAULT 1, created TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS case_keys(
                    key TEXT PRIMARY KEY, request_hash TEXT NOT NULL, case_id TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS snapshots(
                    id TEXT PRIMARY KEY, case_id TEXT NOT NULL, revision INTEGER NOT NULL,
                    payload TEXT NOT NULL, checksum TEXT NOT NULL, created TEXT NOT NULL,
                    UNIQUE(case_id, revision));
                CREATE TABLE IF NOT EXISTS execution_keys(
                    key TEXT PRIMARY KEY, request_hash TEXT NOT NULL, job_id TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS jobs(
                    id TEXT PRIMARY KEY, case_id TEXT NOT NULL, snapshot_id TEXT NOT NULL,
                    state TEXT NOT NULL, sequence INTEGER NOT NULL, request_type TEXT NOT NULL,
                    base_version TEXT, created TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS events(
                    id TEXT PRIMARY KEY, job_id TEXT NOT NULL, sequence INTEGER NOT NULL,
                    payload_hash TEXT NOT NULL, state TEXT NOT NULL,
                    UNIQUE(job_id,sequence));
                CREATE TABLE IF NOT EXISTS versions(
                    id TEXT PRIMARY KEY, case_id TEXT NOT NULL, job_id TEXT NOT NULL UNIQUE,
                    base_version TEXT, data TEXT NOT NULL, released INTEGER NOT NULL DEFAULT 0,
                    created TEXT NOT NULL);
            ''')

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA busy_timeout=10000')
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def token(self, case_id):
        return hmac.new(self.secret, ('demo-case:' + case_id).encode(), hashlib.sha256).hexdigest()

    def authorize(self, case_id, bearer):
        require(text(case_id) and isinstance(bearer, str) and bearer.startswith('Bearer '),
                'ACCESS_DENIED', 401)
        require(hmac.compare_digest(bearer[7:], self.token(case_id)), 'ACCESS_DENIED', 403)
        with self.db() as db:
            require(db.execute('SELECT 1 FROM cases WHERE id=?', (case_id,)).fetchone(),
                    'CASE_NOT_FOUND', 404)

    def create_case(self, req):
        require(req.get('mode') == MODE, 'PRODUCTION_DISABLED')
        service = req.get('service_id')
        require(service in SERVICE_DOMAINS, 'INVALID_SERVICE', 404)
        require(SERVICE_DOMAINS[service] is not None, 'DOMAIN_OWNER_UNRESOLVED')
        require(service == 'SVC_003', 'DEMO_SERVICE_NOT_IMPLEMENTED')
        require(req.get('input_validation_status') == 'VALID', 'INPUT_INVALID')
        require(req.get('review_confirmed') is True, 'REVIEW_REQUIRED')
        require(req.get('access_verified') is True, 'ACCESS_DENIED')
        require(req.get('consent_granted') is True, 'CONSENT_REQUIRED')
        require(req.get('payment_policy_resolved') is True, 'PAYMENT_POLICY_PENDING')
        revision = req.get('submission_revision')
        require(type(revision) is int and revision > 0, 'INPUT_REVISION_INVALID')
        session, key = req.get('flow_session_ref'), req.get('idempotency_key')
        require(text(session) and text(key), 'REQUEST_ID_INVALID')
        payload_hash = fingerprint({k: v for k, v in req.items() if k != 'idempotency_key'})
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT * FROM case_keys WHERE key=?', (key,)).fetchone()
            if old:
                require(old['request_hash'] == payload_hash, 'IDEMPOTENCY_CONFLICT')
                case_id, duplicate = old['case_id'], True
            else:
                case_id, duplicate = newref('CASE'), False
                db.execute('INSERT INTO cases VALUES(?,?,?,?,?,?,?)',
                           (case_id, service, SERVICE_DOMAINS[service], session, revision, 1, timestamp()))
                db.execute('INSERT INTO case_keys VALUES(?,?,?)', (key, payload_hash, case_id))
        return {'case_ref': case_id, 'case_token': self.token(case_id), 'duplicate': duplicate,
                'mode': MODE, 'production_ready': False}

    def get_case(self, case_id):
        with self.db() as db:
            row = db.execute('SELECT * FROM cases WHERE id=?', (case_id,)).fetchone()
        require(row, 'CASE_NOT_FOUND', 404)
        return dict(row)

    def revoke_consent(self, case_id):
        with self.db() as db:
            require(db.execute('UPDATE cases SET consent=0 WHERE id=?', (case_id,)).rowcount,
                    'CASE_NOT_FOUND', 404)
        return {'case_ref': case_id, 'consent': 'REVOKED', 'new_processing': 'BLOCKED'}

    def freeze_snapshot(self, case_id, req):
        case = self.get_case(case_id)
        require(req.get('mode') == MODE, 'PRODUCTION_DISABLED')
        revision = req.get('input_revision')
        require(type(revision) is int and revision == case['revision'], 'INPUT_REVISION_CONFLICT')
        fields, assets = req.get('fields'), req.get('asset_refs')
        require(isinstance(fields, list) and 1 <= len(fields) <= 48, 'FIELDS_INVALID')
        seen, goal = set(), None
        for f in fields:
            require(isinstance(f, dict) and text(f.get('field_id')), 'FIELD_INVALID')
            require(f['field_id'] not in seen, 'FIELD_DUPLICATE')
            seen.add(f['field_id'])
            require(f.get('source_type') in PROVENANCE and f.get('verification_status') in VERIFICATION,
                    'PROVENANCE_INVALID')
            if f['source_type'] == 'AI_INFERRED':
                require(f['verification_status'] == 'CONFIRMED', 'UNVERIFIED_INFERENCE')
            if f['field_id'] == 'bathroom.design_goal':
                goal = f.get('value')
        require(text(goal, 2000) and len(goal) >= 4, 'GOAL_REQUIRED')
        require(isinstance(assets, list) and 1 <= len(assets) <= 8 and
                all(text(x) and x.startswith('DEMO_ASSET_') for x in assets), 'DEMO_ASSET_REQUIRED')
        # Never claim actual geometry/product/structural locks from a mock reference.
        require(req.get('locks', []) == [], 'LOCK_VERIFICATION_UNAVAILABLE')
        payload = {'fields': fields, 'asset_refs': assets, 'input_revision': revision,
                   'geometry_verified': False, 'capability_status': 'UNVERIFIED', 'locks': []}
        h = fingerprint(payload)
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT * FROM snapshots WHERE case_id=? AND revision=?',
                             (case_id, revision)).fetchone()
            if old:
                require(old['checksum'] == h, 'SNAPSHOT_IMMUTABLE')
                snap_id, duplicate = old['id'], True
            else:
                snap_id, duplicate = newref('SNAP'), False
                db.execute('INSERT INTO snapshots VALUES(?,?,?,?,?,?)',
                           (snap_id, case_id, revision, canonical(payload), h, timestamp()))
        return {'input_snapshot_ref': snap_id, 'snapshot_integrity_ref': h,
                'immutable': True, 'duplicate': duplicate}

    def submit_job(self, req):
        require(req.get('mode') == MODE, 'PRODUCTION_DISABLED')
        case_id, snap_id, key = req.get('case_ref'), req.get('input_snapshot_ref'), req.get('idempotency_key')
        require(text(case_id) and text(snap_id) and text(key), 'REQUEST_ID_INVALID')
        typ, base = req.get('request_type'), req.get('base_result_version_ref')
        require(typ in {'INITIAL_GENERATION', 'AUTHORIZED_REGENERATION'}, 'REQUEST_TYPE_INVALID')
        h = fingerprint({k: v for k, v in req.items() if k != 'idempotency_key'})
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT * FROM execution_keys WHERE key=?', (key,)).fetchone()
            if old:
                require(old['request_hash'] == h, 'IDEMPOTENCY_CONFLICT')
                job_id, duplicate = old['job_id'], True
            else:
                case = db.execute('SELECT * FROM cases WHERE id=?', (case_id,)).fetchone()
                snap = db.execute('SELECT * FROM snapshots WHERE id=?', (snap_id,)).fetchone()
                require(case and snap and snap['case_id'] == case_id, 'SNAPSHOT_CASE_MISMATCH')
                require(snap['revision'] == case['revision'], 'INPUT_REVISION_CONFLICT')
                require(fingerprint(json.loads(snap['payload'])) == snap['checksum'], 'SNAPSHOT_TAMPERED')
                require(case['consent'] == 1, 'CONSENT_REVOKED')
                require(case['service'] == 'SVC_003', 'CAPABILITY_UNAVAILABLE')
                if typ == 'AUTHORIZED_REGENERATION':
                    require(text(base) and req.get('approval_ref') == 'DEMO_REVISION_APPROVED',
                            'REVISION_APPROVAL_REQUIRED')
                    require(db.execute('SELECT 1 FROM versions WHERE id=? AND case_id=?',
                                       (base, case_id)).fetchone(), 'BASE_VERSION_INVALID')
                else:
                    require(base is None, 'BASE_VERSION_CONFLICT')
                job_id, duplicate = newref('JOB'), False
                db.execute('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?)',
                           (job_id, case_id, snap_id, 'QUEUED', 0, typ, base, timestamp()))
                db.execute('INSERT INTO execution_keys VALUES(?,?,?)', (key, h, job_id))
        return {'job_ref': job_id, 'job_status': self.get_job(job_id)['state'],
                'duplicate': duplicate, 'mode': MODE, 'ai_called': False}

    def get_job(self, job_id):
        with self.db() as db:
            row = db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
        require(row, 'JOB_NOT_FOUND', 404)
        return dict(row)

    def apply_event(self, job_id, req):
        ref, sequence, state = req.get('event_ref'), req.get('sequence_number'), req.get('job_status')
        require(text(ref) and type(sequence) is int and sequence > 0 and text(state), 'EVENT_INVALID')
        h = fingerprint({'job_ref': job_id, 'sequence_number': sequence, 'job_status': state})
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT * FROM events WHERE id=?', (ref,)).fetchone()
            if old:
                require(old['payload_hash'] == h, 'EVENT_REF_CONFLICT')
                return {'event_status': 'DUPLICATE_IGNORED', 'job_ref': job_id}
            job = db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
            require(job, 'JOB_NOT_FOUND', 404)
            require(sequence > job['sequence'], 'STALE_EVENT')
            require(sequence == job['sequence'] + 1, 'EVENT_SEQUENCE_GAP')
            require(state in TRANSITIONS.get(job['state'], set()), 'INVALID_JOB_TRANSITION')
            version_id = None
            if state == 'SUCCEEDED':
                snap = db.execute('SELECT * FROM snapshots WHERE id=?', (job['snapshot_id'],)).fetchone()
                data = json.loads(snap['payload'])
                goal = next(f['value'] for f in data['fields'] if f['field_id'] == 'bathroom.design_goal')
                version_id = newref('VERSION')
                # A text-only fixture, not an image, design rendering, or validated spatial design.
                candidate = {'kind': 'MOCK_BATHROOM_BRIEF', 'design_goal': goal,
                             'real_ai_execution': False, 'spatial_validation': 'NOT_EXECUTED',
                             'result_validation': 'NOT_EXECUTED', 'customer_release': 'HIDDEN'}
                db.execute('INSERT INTO versions VALUES(?,?,?,?,?,?,?)',
                           (version_id, job['case_id'], job_id, job['base_version'],
                            canonical(candidate), 0, timestamp()))
            db.execute('INSERT INTO events VALUES(?,?,?,?,?)', (ref, job_id, sequence, h, state))
            db.execute('UPDATE jobs SET state=?, sequence=? WHERE id=?', (state, sequence, job_id))
        return {'event_status': 'APPLIED', 'job_status': state,
                'result_version_ref': version_id, 'customer_release': 'HIDDEN'}

    def internal_versions(self, case_id):
        with self.db() as db:
            rows = db.execute('SELECT * FROM versions WHERE case_id=? ORDER BY created,id',
                              (case_id,)).fetchall()
        return [{'version_ref': r['id'], 'source_job_ref': r['job_id'],
                 'base_version_ref': r['base_version'], 'release_status': 'HIDDEN',
                 'content': json.loads(r['data'])} for r in rows]


class Handler(BaseHTTPRequestHandler):
    server_version = 'EMOVIA-Contract-Simulation'
    sys_version = ''

    def log_message(self, fmt, *args):
        pass  # Never log tokens or contents in this local demonstration.

    def answer(self, status, value):
        body = canonical(value).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def payload(self):
        length = self.headers.get('Content-Length', '')
        require(length.isdigit() and 0 < int(length) <= 65536, 'PAYLOAD_SIZE_INVALID', 413)
        try:
            value = json.loads(self.rfile.read(int(length)).decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ContractError('JSON_INVALID', 400)
        require(isinstance(value, dict), 'JSON_OBJECT_REQUIRED', 400)
        return value

    def admin(self):
        value = self.headers.get('X-Emovia-Demo-Key', '').encode()
        require(hmac.compare_digest(value, self.server.store.secret), 'DEMO_ADMIN_DENIED', 401)

    def case_auth(self, case_id):
        self.server.store.authorize(case_id, self.headers.get('Authorization', ''))

    def route(self, method):
        parsed = urlsplit(self.path)
        require(not parsed.query, 'QUERY_NOT_SUPPORTED', 400)
        parts = parsed.path.strip('/').split('/')
        store = self.server.store
        if method == 'GET' and parts == ['v1', 'health']:
            return 200, {'status': 'ok', 'mode': MODE, 'production_ready': False,
                         'ai_connected': False, 'payment_connected': False}
        if method == 'GET' and parts == ['v1', 'services']:
            return 200, {'services': [{'service_id': s, 'domain_owner_id': d,
                         'capability': 'UNVERIFIED', 'production_approved': False}
                        for s, d in SERVICE_DOMAINS.items()]}
        if method == 'POST' and parts == ['v1', 'cases']:
            self.admin()
            return 201, store.create_case(self.payload())
        if method == 'POST' and parts == ['v1', 'executions']:
            self.admin()
            p = self.payload()
            store.authorize(p.get('case_ref'), self.headers.get('Authorization', ''))
            return 202, store.submit_job(p)
        if len(parts) == 3 and parts[:2] == ['v1', 'jobs'] and method == 'GET':
            job = store.get_job(parts[2]); self.case_auth(job['case_id'])
            return 200, {'job_ref': job['id'], 'job_status': job['state'],
                         'sequence_number': job['sequence'], 'mode': MODE}
        if len(parts) >= 3 and parts[:2] == ['v1', 'cases']:
            case_id = parts[2]
            if method == 'GET' and len(parts) == 3:
                self.case_auth(case_id)
                return 200, {'case': store.get_case(case_id)}
            if method == 'POST' and len(parts) == 4 and parts[3] == 'snapshots':
                self.admin(); self.case_auth(case_id)
                return 201, store.freeze_snapshot(case_id, self.payload())
            if method == 'GET' and len(parts) == 4 and parts[3] == 'results':
                self.case_auth(case_id)
                return 200, {'results': [], 'note': 'Demo candidates are never released'}
        if len(parts) == 5 and parts[:3] == ['v1', 'internal', 'jobs'] and parts[4] == 'events' and method == 'POST':
            self.admin()
            return 200, store.apply_event(parts[3], self.payload())
        if len(parts) == 5 and parts[:3] == ['v1', 'internal', 'cases']:
            self.admin()
            if method == 'GET' and parts[4] == 'results':
                return 200, {'simulation_only': True, 'versions': store.internal_versions(parts[3])}
            if method == 'POST' and parts[4] == 'revoke-consent':
                return 200, store.revoke_consent(parts[3])
        if len(parts) == 4 and parts[:2] == ['v1', 'results'] and parts[3] == 'release' and method == 'POST':
            self.admin()
            raise ContractError('PRODUCTION_RELEASE_DISABLED')
        raise ContractError('ROUTE_NOT_FOUND', 404)

    def run(self, method):
        try:
            code, data = self.route(method)
            self.answer(code, data)
        except ContractError as e:
            self.answer(e.status, {'error': {'code': e.code}, 'mode': MODE})
        except (OSError, sqlite3.Error):
            self.answer(500, {'error': {'code': 'STORAGE_ERROR'}, 'mode': MODE})

    def do_GET(self):
        self.run('GET')

    def do_POST(self):
        self.run('POST')


def start_server(path, key, host='127.0.0.1', port=0):
    require(host == '127.0.0.1', 'LOCALHOST_ONLY', 500)
    store = ContractStore(path, key)
    server = ThreadingHTTPServer((host, port), Handler)
    server.store = store
    return server


if __name__ == '__main__':
    key = os.getenv('EMOVIA_DEMO_KEY', '')
    if len(key) < 32:
        raise SystemExit('Set a 32+ character EMOVIA_DEMO_KEY first')
    path = os.getenv('EMOVIA_DEMO_DB', str(Path(__file__).parent / 'data' / 'demo.sqlite'))
    port = int(os.getenv('EMOVIA_DEMO_PORT', '8765'))
    httpd = start_server(path, key, port=port)
    print('EMOVIA DESIGN_SIMULATION at http://127.0.0.1:' + str(port), flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()