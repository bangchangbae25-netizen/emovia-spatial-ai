# Pack 06 FINAL V4 — 주방 Source Registry / Gateway 후보

**상태: REVIEW_REQUIRED / 개발 브랜치 전용. 운영 Gateway 아님.**

이 디렉터리는 기존 EMOVIA 주방 Source를 새로 복사하지 않고, Project Registry와 역할별 바인딩, 버전·Delta·Checkpoint·Trace를 구조화하는 **실행 후보**입니다. 기존 홈페이지 `index.html`, `app.js`는 변경하지 않습니다.

## 파일
- `registry.json` — 공개 가능한 메타데이터와 *사설 Source Alias*만 기록한 후보 Registry. 실제 Library `file_id`나 `libfile_id`, 원본 자료·권한 정보는 포함하지 않습니다.
- `gateway-core.mjs` — Registry·Role 검증, 실제 Source Reader 인터페이스, 후보 분석 재실행, Trace/Delta/Checkpoint readback, 생성·공개 HOLD.
- `gateway-core.test.mjs` — 임의로 구성한 **합성** B50/B58 형태 데이터로 정상·오류 주입 검증.
- `.github/workflows/pack06-kitchen-gateway.yml` — Node 내장 테스트를 실행하는 개발 브랜치/PR CI.

## 실제 Library 연동에 필요한 별도 구현
`sourceReader.load({ source_id, location, expected_version })`는 **인증된 백엔드**에서만 구현해야 합니다. 개인 ChatGPT Library는 정적 GitHub 페이지의 코드나 GitHub Actions에서 직접 조회할 수 없습니다. `PRIVATE_SOURCE_ALIAS`는 조회를 위한 *연결 요청 키*이지, 실제 접근권한 또는 확정된 Source 위치가 아닙니다.

`store.readCheckpoint`, `store.writeCheckpoint`, `store.appendTrace`, `store.appendDelta`는 트랜잭션·동시성·접근통제가 가능한 저장소로 구현해야 합니다. 현재 테스트의 Memory Store는 프로덕션 저장소가 아닙니다.

## 실행
Node.js 22 이상에서:
```sh
node --test pack06/kitchen/gateway-core.test.mjs
```

**테스트 통과는 생성 승인 또는 실제 현장 적합성을 뜻하지 않습니다.** Registry의 `pack06_status`는 `REVIEW_REQUIRED`이고, Generator Gateway·Output Approval Gate는 구현 단계에서 무조건 HOLD/차단하도록 되어 있습니다. 외부 Source Owner, `CURRENT_OFFICIAL`, `COMMON_MEMORY`, `CAPABILITY`, `FINAL +95`는 자동 승격하지 않습니다.

## 기존 Library 데이터와 관계
과거 후보 기록: `CP_KITCHEN_20261103_02` / `TR_KITCHEN_20261103_02`. 이 레코드를 **GitHub에서 실재하는 운영 DB 체크포인트로 승격하지 않습니다.** 실제 Library 재조회는 ChatGPT 연결 도구에서 별도 검증해야 합니다.

다음 구현 순서: 인증된 Server-side Source Reader → Owner/버전/Delta/Freshness 검증 → 트랜잭션 Checkpoint DB → 실제 Geometry/이미지 Validator → 생성 도구 Adapter + Output Approval Gate 연결 → 운영 통합 E2E 검증.
