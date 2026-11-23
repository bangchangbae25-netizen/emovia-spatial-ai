# EMOVIA CH07 — 기존 연구 연계 백엔드 후보 V2

**상태:** `DESIGN_SIMULATION` / `REVIEW_REQUIRED` / `PRODUCTION_NOT_READY` / `+95 PENDING`  
**기준:** `EMOVIA_CH07_UNIFIED_DESIGN_V1.md`(21개 영역·Pipeline 설계 시나리오 30개), `EMOVIA_CH07_MASTER_RETURN_V1.json`  
**상위:** `CH_EMOVIA_PLATFORM_CUSTOMER_FLOW_MASTER_V1`; 전문채널 01~08 **유지**, 신규 채널 생성 없음  
**실행 규격:** `6.5.30.7.210`, 7 Core Engines의 이름·순서 유지

## 1. 기존 연구 대비 추가된 실행 후보

| 영역 | V2 추가 구현 | 실제 운영 검증 |
|---|---|---|
| 01~08 서비스 연결 | 11개 Service ID·7개 Domain 후보; `SVC_011` 차단 | 미검증 |
| CH05 CASE | 입력/동의/접근 확인을 가정한 **mock** CASE·HMAC 데모 토큰·멱등성 | 실제 CH05 연동 없음 |
| CH07 Snapshot | CASE 귀속·입력 Revision·Catalog/Schema Version·Provenance·hash·불변성 | 실제 공간·제품·자산 검증 없음 |
| Source | Pack 04/05/06 필수 확인, Version/Trace/Checkpoint 기록 | `REVIEWED_NOT_APPLIED`, 공식 활성화 없음 |
| Eligibility | CASE/동의·Snapshot 무결성·Mock entitlement·Mock capability·Result Schema 검사 | 실결제/실Capability 없음 |
| Job | 상태 전이·중복 요청 방지·동시성·Job/Event 이력 | 실제 AI Job 아님 |
| Outbox | Job 생성과 Outbox 원자 기록, Lease/Ack/Retry/Deadletter | 실제 큐·외부 Worker 연결 없음 |
| Event | Event Ref 멱등성, 순서·중복·역행 검증, Gap 보류/재조정 | Provider webhook 연결 없음 |
| 7 Core Engine Trace | 각 엔진을 `NOT_EXECUTED`로 명시 | 실행 사실 없음 |
| Failure / Delta | 실패 후보 Delta와 Checkpoint 연결, 자동 공식화 금지 | 실제 원인 분석 미실시 |
| CH06 Result | Job 성공과 Candidate/Validation/Handoff/Release 분리 | Mock 결과만, 공개 항상 금지 |
| Revision | 기존 후보 Version 보존, 신규 Mock 승인 필수 | 실제 CH06 승인 API 없음 |

**중요:** `SVC_003` 욕실은 로컬 Mock 경로만 실행합니다. `DEMO_*` 참조는 실제 권한, 결제, 검증, AI Capability의 증거가 아닙니다. `SUCCEEDED`는 *모의 Job 상태*이며 AI 결과 생성 성공이 아닙니다. 고객 결과는 항상 비공개입니다.

## 2. 실행 경로

```text
CH02 Service 후보 확인 (SVC_011 Owner 미정 -> 차단)
 -> CH03/04 Review·Input 상태를 Mock으로 전달
 -> CH05_DEMO CASE 생성 (결제정책은 POLICY_UNRESOLVED 유지)
 -> CH07 필수 Source Pack04/05/06 Version Check (REVIEWED_NOT_APPLIED)
 -> CH07 Immutable Snapshot + Source Trace + Checkpoint
 -> CH05_DEMO entitlement / CH08_DEMO capability / schema 검증
 -> CH07 Job + Transactional Outbox (같은 SQLite 트랜잭션)
 -> 로컬 Event 시뮬레이션 (중복·순서·Gap 조정)
 -> 명시적 Mock Validation -> Result Candidate -> Handoff Outbox
 -> CH06_DEMO Ack (Outbox Ack 선행) -> HIDDEN 유지
 -> 고객 공개/다운로드: 불가
```

## 3. 실행

Python 3.10 이상, 외부 패키지 필요 없음. **실제 고객정보·사진·도면·API Key·결제정보 입력 금지.**

```bash
cd platform-backend
python3 -m unittest -v test_research_v2
export EMOVIA_DEMO_KEY="replace-with-a-long-random-local-test-secret-at-least-32-chars"
python3 research_v2.py
```

서버는 `127.0.0.1:8766`에서만 실행되며, `GET /v2/health`에서 `production_ready:false`, `ai_connected:false`, `payment_connected:false`, `release_enabled:false`를 반환합니다. 본 로컬 서버는 인터넷 공개, 운영 배포, 고객용 서비스에 사용할 수 없습니다.

## 4. 주요 로컬 HTTP 경계

| 메서드 | 경로 | 목적 |
|---|---|---|
| GET | `/v2/health` | 로컬 시험 상태 |
| GET | `/v2/services` | 11개 후보·Capability 미검증 |
| POST | `/v2/cases` | CH05_DEMO CASE (admin) |
| GET | `/v2/cases/{case_ref}` | 데모 CASE 조회 (bearer) |
| POST | `/v2/cases/{case_ref}/snapshots` | 불변 Snapshot (admin + bearer) |
| POST | `/v2/executions` | Mock Job (admin + bearer) |
| GET | `/v2/jobs/{job_ref}` | Mock Job 상태 (bearer) |
| POST | `/v2/internal/jobs/{job_ref}/events` | Mock Event (admin) |
| GET | `/v2/internal/jobs/{job_ref}/engine-trace` | 7 Engine 미실행 증거 (admin) |
| GET | `/v2/internal/jobs/{job_ref}/failure-deltas` | Candidate Delta (admin) |
| POST | `/v2/internal/jobs/{job_ref}/candidate` | Mock Result Candidate (admin) |
| POST | `/v2/internal/outbox/claim` | 로컬 Outbox Lease (admin) |
| POST | `/v2/internal/outbox/{outbox_ref}/ack` | 로컬 Outbox Ack (admin) |
| POST | `/v2/internal/handoffs/{handoff_ref}/ack` | CH06_DEMO Ack (admin) |
| GET | `/v2/internal/cases/{case_ref}/source-traces` | Source 적용 여부 (admin) |
| GET | `/v2/internal/cases/{case_ref}/results` | 내부 후보 버전 (admin) |
| GET | `/v2/cases/{case_ref}/results` | 고객 결과, 항상 빈 목록 (bearer) |
| POST | `/v2/internal/cases/{case_ref}/revoke-consent` | 신규 처리 차단 (admin) |
| POST | `/v2/results/{result_ref}/release` | **항상 409 차단** |

## 5. 기존 연구 Source 사용·승인 구분

| SOURCE_ID | Version | 실제 사용 범위 | 운영 상태 |
|---|---|---|---|
| `EMOVIA_CH07_UNIFIED_DESIGN_V1` | `1.0.0` | 21개 영역·Job/Outbox/Handoff 설계 기준 | 디자인 Baseline |
| `PACK01_REGISTRY_V2` | V2 | Source Index/Owner·Version 추적 기준 | 디자인 참조만 |
| `PACK02_SPATIAL_V1` | V1 | Geometry/Field Verify/Lock 차단 기준 | 디자인 참조만 |
| `PACK03_RESEARCH_V1` | V1 | Failure Candidate/Delta 기준 | 디자인 참조만 |
| `PACK04_PIPELINE_V1` | V1 | Run Trace·Handoff·Owner 경계 기준 | 디자인 참조만 |
| `PACK05_JSON_V1` | V1 | Production Instruction·Engine 사용 여부 분리 | 디자인 참조만 |
| `PACK06_GATEWAY_V4` | FINAL_V4 | Registry/Checkpoint/Delta 및 `FOUND != APPLIED` 기준 | 공식 승인 확인 전 `REVIEW_REQUIRED` |

**SOURCE FOUND ≠ APPLIED.** 이 V2의 SQLite `source_traces`는 실제 운영 Source를 자동 활성화하지 않습니다. 모든 행은 `REVIEWED_NOT_APPLIED`이고, `checkpoints.applied_source_versions_json`은 `{}`입니다. Source Owner/Version은 변경하지 않았습니다.

## 6. 검증

- 로컬 Python `unittest` **90건 실행·90건 통과** (CASE, Snapshot, Source Trace, 7 Engine Trace, Outbox, Event Gap, Result Handoff, Revision, 동시성, 서버 재시작, HTTP 경로).
- 이 검사는 **기능적 로컬 모의 검증**이며, 30개 원본 Pipeline 시나리오 전체를 실제 서비스에서 실행한 시험이 아닙니다.
- 이전 V1 테스트 27건은 별도 파일에 유지하며, 이번 V2 검증 숫자에 중복 합산하지 않습니다.
- Security/Load/Privacy/Provider/Payment/AI/Domain E2E 실증은 **미실시**. Master 승인과 +95는 **PENDING**.

## 7. 잔여 의존성과 복구·승격 금지

- `CH05`: 실제 고객 인증, CASE 소유권, 결제/동의/환불/Entitlement API와 정책.
- `CH06`: 실제 Result Registry, Version/Revision Approval, Release/Download Gate, handoff ack.
- `CH08`: 욕실 Geometry/Product/Facility 검증 및 Capability/Output Profile 실증. 나머지 서비스 확장 전 Domain별 테스트 필요.
- `CH02`: `SVC_011` 브로셔 Domain Owner 결정. `SPACE_PURPOSE` 등 Entry Alias 계약 승인.
- `MASTER`: Source Pack06 FINAL V4의 공식 채택 상태, 2단계 Eligibility, 서비스별 Capability 활성화, 운영 비용·제한·감사·보안 승인.
- `BACKEND`: Queue/Worker/Provider idempotency, 외부 webhook 서명, asset storage/AV scan, encryption/retention, tenant authorization, monitoring, disaster recovery, CI, real E2E.

`CURRENT_OFFICIAL`, `PRODUCTION_READY`, `FINAL +95`는 이 브랜치의 코드/테스트 통과로 자동 변경하지 않습니다. 기존 메인 홈페이지와 Playground는 수정하지 않습니다.

## 8. Return Delta / Checkpoint

- `OUTPUT_ID`: `EMOVIA_CH07_RESEARCH_BACKEND_V2_CANDIDATE`
- `BASELINE`: `EMOVIA_CH07_UNIFIED_DESIGN_V1` + 기존 `platform-backend/mvp.py`
- `DELTA`: `research_v2.py`, `test_research_v2.py`, `RESEARCH_V2.md`, `master_return_v2.json`
- `VALIDATION`: `LOCAL_TEST_PASS_90`, `REAL_INTEGRATION_NOT_TESTED`
- `NEXT_ACTION`: Master/Owner 계약 검토 → 실제 CH05/06/08 Adapter 준비 → 대표 욕실 서비스 실연동 → Domain 확장