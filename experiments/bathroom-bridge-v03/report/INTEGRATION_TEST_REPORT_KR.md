# EMOVIA 욕실 통합연결 연구 내부 검증 보고 v0.3.1

- **실행일:** 2026-11-21
- **채널:** CH_EMOVIA_BATHROOM_SPECIALIST_V1 / 1.주거공간 PROJECT
- **Goal:** 기존 공간인식 후보를 보존하고, 사용자 도면 → 욕실별 픽셀 구조 → 구조 Lock 후보 → 스타일 3종 → 외부 이미지 수동 QA로 통합한다.
- **결론:** 연구 시제품 작동 / 기초 브라우저 기능 시험 PASS / 공식 R01→R02 엔진 미연결 / Same Bathroom 실사 생성 BLOCK.

## 근거 상태

| 근거 | Owner/Version | 실제 적용 | 상태 |
| --- | --- | --- | --- |
| 기존 한국 아파트 원본 참조 이미지 1280×1096 | 역사적 사용자 참조 아카이브, 2026-11-19 검증 후보 | 왼쪽/오른쪽 픽셀 도형과 설비 앵커 표시, 구조 연구용 | APPLIED RESEARCH ONLY |
| `EMOVIA_BATH_INTERNAL_20261119_SOURCE_GATED.zip` / `geometry_candidate_reference.json` | 욕실 전문채널, 2026-11-19 | 픽셀 범위/후보 설비 읽어오기, 타 도면과 분리 | APPLIED RESEARCH ONLY |
| LH 광주선운 3블록 66D 공식 자료 | LH / 2015-05 팸플릿 | 욕실1 3.34㎡, 욕실2 3.26㎡ 메타데이터, 구조 좌표 생성 차단 | PARTIAL_METADATA_ONLY |
| 66D 과거 사람 지적 | 욕실 전문채널 2026-10-16~17 | 니치 생성 금지, 구조 파괴 금지 | APPLIED GUARD |
| Pack 02/04/05/06 | 프로젝트 공통, REVIEW_REQUIRED | Spatial State/JSON/Trace/Binding 연구 규칙 참조 | RULE_REFERENCE_NOT_OFFICIAL |

## 구성

`index.html` → `app/app.js` → `app/guard.js` + `source/apartment_plan_1000026121.jpg`.

이 프로토타입은 데이터 경로 및 UI를 테스트하는 별도 연구 Worker입니다. 공통 Master의 원본 State나 다른 공간 전문 채널의 파일을 수정하지 않았습니다.

## 보존 검증

- **왼쪽 후보:** [[79,378],[197,378],[197,573],[79,573]] 픽셀, 문 [197,527], 세면기 [111,470], 양변기 [133,529]. 편차 후보 ±5px.
- **오른쪽 후보:** [[917,15],[1045,15],[1045,174],[1045,238],[892,238],[892,177],[917,177]] 픽셀, 문 [1045,200], 세면기 [946,141], 양변기 [943,209]. 편차 후보 ±5px.
- **실제 치수:** 없음. `IMAGE_PX`를 `MM`로 승격하지 않음.
- **LH 66D:** 위 후보의 어느 좌표도 전달하지 않음. 공식 Geometry 미획득 때문에 차단.

## 테스트 (실제 실행)

- Node 게이트 단위시험 **53/53** (BLOCK 42, HOLD 5, REVIEW 4, FAIL 2).
- Chromium 브라우저 UI 시험 **16/16**. 좌우 욕실 분리, 스타일 좌표 동일, 연구용 잠금, 변경 후 BLOCK, Undo 후 HOLD, LH66D BLOCK, 사용자 업로드, 수동 경계 4점, JSON 다운로드, 이미지 수동 FAIL/REVIEW, 모바일 폭 390px 가로 넘침 0.
- 독립 단일 HTML 시동 시험: 원본 이미지 로딩, LH66D 차단, JavaScript 오류 없음.
- **미시험:** 실제 OCR/딥러닝 도면인식, 기존 R01·R02 서버 실행, 완성된 구조 Lock 승인, 실사 이미지 생성, 이미지 자동 기하 대조, 3D/안목치수 정확성.

## 안전 게이트 / 이전 실패 회피

1. `CORE_PLAN_STATE` 공식 승인·R02 ACK가 없으면 모든 연구 후보는 HOLD, 잘못된 입력은 BLOCK.
2. Lock 후보 후 원본 도형·설비·Source ID·근거가 바뀌면 즉시 BLOCK. 해제와 새 스냅샷은 별도 Human Correction 후보로 다룸.
3. 거짓 승인, 니치·조적벽 변경·미확인 샤워부스 추가, 좌우 욕실 혼합 및 픽셀/밀리미터 혼동을 차단.
4. 외부 이미지 수동 QA에서 FAIL 불일치가 발견되면 FAIL. 전항목 수동 PASS라도 자동 독립검증 부재로 REVIEW 및 고객 제공 차단.
5. 고객 제공 버튼은 항상 비활성화. 2.5D는 비실측 진단 모델로 명시.

## 잔여 의존성 / 우선순위

| P | 차단 원인 | 필요한 소스/행동 |
| --- | --- | --- |
| P0 | 공식 Geometry Lock 부재 | Master 승인 Plan State ID, Version, Hash, 사람 승인 이력 |
| P0 | LH 66D 승인 교정도면 없음 | 사람 수정 후 Ground Truth, 원본 욕실 1 래스터/실측 |
| P0 | 원래 R01/R02 엔진 코드 및 signed ACK 없음 | 실행기 소유 채널의 실제 Adapter, 입출력·버전·송수신 로그 |
| P1 | 카메라/마스크/깊이 제어 미연결 | 기존 Image JSON 및 이미지 생성 Tool Adapter |
| P1 | 생성 후 자동 Same Bathroom QA 미구현 | 도면-이미지 정합, 오류 검출 및 독립 검증 |

**승계 상태**: `RESEARCH_UPDATE / REVIEW_REQUIRED`, `MASTER_PENDING`, `OFFICIAL_GEOMETRY_PENDING`, `SAME_BATHROOM_GENERATION_BLOCK`, `+95_PENDING`.