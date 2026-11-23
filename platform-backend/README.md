# EMOVIA CH07 Pipeline Contract MVP — DESIGN_SIMULATION ONLY

This directory is an isolated research implementation derived from the existing EMOVIA CH07 unified design (21 sections, 11 service candidates, 30 pipeline scenarios). It is **not** the EMOVIA production platform, AI engine, payment processor, or a public service.

## Scope

- Python standard library + SQLite; binds to `127.0.0.1` only.
- All 11 services are represented in a **candidate** catalog. Only `SVC_003` supports mock workflow. `SVC_011` is blocked because its Domain owner is unresolved.
- Simulates CASE creation, consent/access/payment-policy flags, immutable input snapshot, deduplicated Job creation, ordered event processing, simulated result version history, and revision failure protection.
- Every result is an internal mock text fixture, never a generated image. Customer result listing is always empty; release endpoint always rejects.
- No real uploaded assets: only `DEMO_ASSET_*` placeholders are accepted.
- No real AI/provider/queue/worker/payment/consent proof, geometric verification, product accuracy, security audit, production readiness, or +95 validation.

## Run locally

Requires Python 3.10+.

```bash
cd platform-backend
python3 -m unittest -v test_mvp
export EMOVIA_DEMO_KEY="use-a-unique-long-local-only-key-at-least-32-chars"
python3 mvp.py
```

Health: `GET http://127.0.0.1:8765/v1/health`

Demo case creation requires `X-Emovia-Demo-Key`, a request with `mode: "DESIGN_SIMULATION"`, verified-looking mock flags, and `SVC_003`. Returned case token is only a local prototype credential. Subsequent case access requires `Authorization: Bearer <case_token>`. Never expose the demo key, use real customer data, bind a public interface, or deploy this as a live service.

## Supported local endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/health` | Explicit simulation status |
| GET | `/v1/services` | Unverified service candidates |
| POST | `/v1/cases` | Mock CASE creation |
| GET | `/v1/cases/{case_ref}` | Mock CASE lookup |
| POST | `/v1/cases/{case_ref}/snapshots` | Immutable mock input |
| POST | `/v1/executions` | Idempotent mock Job |
| GET | `/v1/jobs/{job_ref}` | Mock Job status |
| POST | `/v1/internal/jobs/{job_ref}/events` | Ordered mock Job transitions |
| GET | `/v1/internal/cases/{case_ref}/results` | Internal hidden mock versions |
| GET | `/v1/cases/{case_ref}/results` | Always empty: no release |
| POST | `/v1/internal/cases/{case_ref}/revoke-consent` | Block new processing |
| POST | `/v1/results/{result_ref}/release` | Always blocked |

## Contract limitations and known work

- **CH05 owns** real CASE, access, payment, consent, and entitlement decisions; this MVP accepts mock flags, not verifiable approvals.
- **CH07 owns** Pipeline execution, snapshot, events, retries and handoff; this MVP has no queue, worker, provider or transactional outbox.
- **CH06 owns** Result Version, Revision, and customer Release; this MVP does not implement a real CH06 adapter.
- **CH08 owns** domain-specific validation and profiles; this MVP only has a bounded bathroom mock.
- The current demo event endpoint uses a local admin key; production would need independently authenticated/signed provider events, an inbox/outbox, monotonic CAS and audit.
- The prototype is **not production-secure**: no user accounts, persistent authorization policy, real asset scanning, encryption-at-rest policy, observability, backup/restore, quotas, billing or incident response.
- Existing source documents marked `REVIEW_REQUIRED` or `FINAL CANDIDATE` have not been automatically promoted to `CURRENT_OFFICIAL`.
- Main homepage and existing playground files are unchanged.

## Verification

27 automated local Python tests were executed and passed on 2026-11-20 (contract rules, HTTP flow, consent, access, deduplication, immutability, event order, simulated regeneration, concurrent CASE creation, restart). This is **local contract simulation only** and is not real integration or security certification.

**Master status:** PENDING_REVIEW. **Production:** NOT_READY. **+95:** PENDING.
