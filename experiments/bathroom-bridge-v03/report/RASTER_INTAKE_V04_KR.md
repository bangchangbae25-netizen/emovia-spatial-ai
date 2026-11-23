# EMOVIA 욕실 R01 앞단 래스터 후보 추출 V0.4 — 연구 연결 기록

- 대상: `experiments/bathroom-bridge-v03/app/raster-intake-v04.js`
- 원본 CAD-Like: `EMOVIA_CADLIKE_RESIDENTIAL_REUSE_V1_20261123.zip` (원 소유 채널, 변경 금지)
- 역할: **인식 엔진을 대체하지 않는** 축정렬 검은 선분 후보 추출, 증거 기반 픽셀/mm 변환 사전검증
- 위치: 기존 연구 브랜치에 독립 파일 추가. 기존 `app.js`, `guard.js`, CAD-Like 원본 수정 없음.

## 현재 구현
1. 이미지 RGBA + 관심 영역(ROI) 입력을 받음. Otsu 명도 임계값을 산출해 검은 픽셀의 수평·수직 연속 선분 후보를 수집하고 근접 선분을 합침.
2. 반환 객체는 `UNVERIFIED_WALL_CANDIDATE`. 글자·가구·도어선도 검출될 수 있으므로 **벽으로 확정하지 않음**. 곡선·대각선·폐곡선·방 연결·설비 인식은 지원하지 않음.
3. 실제 측정/문헌 출처가 있는 X축 2개, Y축 2개 이상 독립 치수 앵커를 요구. 불일치/비등방성 발견 시 HOLD. 일치하더라도 `REVIEW`.
4. 원본 SHA, 욕실 ID, 작업자 검토, 닫힌 경계, 치수 근거, 문 Host, 벽 높이/두께 등이 부족하면 CAD-Like 입력 준비를 HOLD.
5. 모두 들어와도 **CAN_BUILD_CADLIKE_DRAFT_ONLY**. 실제 CAD-Like canonical wall topology 구성·validate(), Master Lock 및 이미지 생성은 별도 단계.

## 시험 범위
- 120x100 **합성 흑백 도면**의 4개 선분 후보 인식, 백지 무검출, 출처·치수 누락 차단 등 JavaScript 연구 단위시험 **18/18**.
- Node 재실행용 `tests/test_raster_intake_v04.js` 추가.
- **실제 아파트 도면의 자동 인식 성능 검증은 아직 수행하지 않음.** 실제 R01/R02 서버 실행, 실제 CAD-Like로의 mm 변환, 이미지 생성·QA도 수행하지 않음.

## 다음 연결 필요
- 원본 이미지 해시와 작업 ROI를 기존 편집기에서 확보 → `lineCandidates(imageData,roi,opts)` → 내부 전문가가 벽/문/설비를 별도 확인 → 출처가 있는 실측/문헌 치수로 `verifiedScale()` → `candidateHandoff()` → CAD-Like canonical JSON 별도 작성·validate → 공식 Lock 요청.
- 우선 실제 도면 1개에서 ROI·선분 추출 정확도를 작업자 확인으로 검증. 잘못 검출한 문·문자·타일선은 오탐으로 기록.

**결론:** PIXEL_CANDIDATE_IMPLEMENTED / REAL_PLAN_QA_NOT_TESTED / CADLIKE_MM_HOLD / OFFICIAL_LOCK_PENDING / +95 PENDING.
