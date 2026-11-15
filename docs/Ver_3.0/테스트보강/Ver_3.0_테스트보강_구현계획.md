# 테스트 보강 구현계획

> **실행 방식:** 구현(코드 작성)은 agy가 하고, Claude가 diff를 검토해 틀린 곳을 고친다. 단계는 체크박스(`- [ ]`)로 추적한다. **설계 §6의 확인(seam 범위·진행 범위)이 끝난 뒤에 시작한다.**

**Goal:** 테스트가 없는 순수 로직 6개 모듈에 특성화 테스트를 더해, 위험이 큰 규칙(주소 판별, 위치등록 분류 등)의 회귀를 잠근다.

**Architecture:** 모듈마다 함수 하나씩 슬라이스로 진행한다(테스트 하나 → 통과 → 변이 확인 → 다음). 소스는 바꾸지 않고 `.test.ts`만 추가한다.

**Tech Stack:** TypeScript · Vitest(node 환경, `.test.ts`만 실행). 의존성 추가 없음.

**Spec:** [Ver_3.0_테스트보강_설계.md](Ver_3.0_테스트보강_설계.md)

## Global Constraints

- **커밋하지 않는다.** 사용자가 "커밋"을 요청할 때만 커밋한다.
- **문서(`docs/`, `AGENTS.md`, `README.md`)는 수정하지 않는다.**
- **소스(`src/**/*.ts`의 테스트가 아닌 파일)는 한 줄도 바꾸지 않는다.** 단, 변이 확인용 임시 수정은 허용하고 **반드시 원복**한다(`git diff`로 원복을 증명).
- 테스트는 `.test.ts`로만 쓴다(`vitest.config.ts`는 `.ts`만 실행). jsdom·Testing Library·새 의존성을 추가하지 않는다.
- **기대값은 코드가 돌려준 값을 베끼지 않는다.** 설계 §2.2·§3.1의 독립 출처(코드 주석의 사례, 타입, 명세)에서 정한다. 출처를 각 테스트의 주석 한 줄로 적는다.
- 비공개 함수를 직접 부르거나 내부 협력자를 모킹하지 않는다. 외부 경계(`fetch`, 시간)만 가짜로 바꾼다.
- 테스트가 기존 동작의 결함을 드러내면 **고치지 않는다.** `it.todo("…")`로 남기거나 보고에만 적는다(고정하지 않는다).
- **모든 명령은 포그라운드로 실행하고 출력이 화면에 보이게 한다. 백그라운드 작업(background task, `&`, `Start-Process`)으로 돌려 두고 기다리지 않는다.**
- **검증 명령**: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`.
- 기존 줄바꿈(CRLF/LF)을 같은 폴더 테스트 파일에 맞춘다. BOM 없는 UTF-8.

## Review Focus

1. 각 테스트의 기대값이 독립 출처에서 나왔는지(주석으로 적힌 출처와 실제가 맞는지) — 동어반복이 아닌지.
2. 변이 확인 보고: 모듈마다 "어떤 줄을 어떻게 틀리게 했고 어떤 테스트가 빨개졌는지", 그리고 원복 뒤 `git diff -- src`가 테스트 파일 외에는 비어 있는지.
3. 소스 파일이 바뀌지 않았는지(`git diff --stat`에 `*.test.ts`만 나와야 한다).

---

### Task 1: `geocode.ts` — `classifyKoreanAddress`, `splitAddressFields`, `buildGeocodeCandidates`

**Files:**
- Create: `src/features/map-marker/lib/geocode.test.ts`

**Interfaces:** (소스 그대로)
```ts
classifyKoreanAddress(address: string): "road" | "jibun";
splitAddressFields(input: { roadAddress?: string; jibunAddress?: string; address?: string }): { roadAddress: string; jibunAddress: string };
buildGeocodeCandidates(address: string): string[];
```

**Steps:** (슬라이스마다 통과 확인과 변이 확인을 한다)
- [ ] `classifyKoreanAddress`, 슬라이스 1: `"서울특별시 강남구 테헤란로 152"` → `"road"`(출처: 소스 주석 "예: 테헤란로 152"). 실행 → 통과. 변이: 도로명 판별 정규식의 `(로|길)`을 `(로)`로만 바꿔 `…길 12` 케이스가 빨개지도록 다음 슬라이스에서 확인.
- [ ] 슬라이스 2: `"전남 광양시 명산리 114-4"` → `"jibun"`, `"광영동 산 30-1"` → `"jibun"`, `"○○동 123번지"` → `"jibun"`(출처: 주석 "지번: 동/리/가 + 번지 숫자, 산 30-1, …번지"). 변이: `/번지/` 검사 줄을 임시로 지우면 번지 케이스가 빨개지는지.
- [ ] 슬라이스 3: `"서울 중구 을지로 2가"`(번호 뒤 `가`)는 `"jibun"`, `"종로 12길 5"`처럼 `길 숫자`는 `"road"`, 빈 문자열·공백만 → `"jibun"`(출처: 주석 "번호 뒤에 가/동/리 등이 붙으면 지번", "애매하면 지번"). 변이: 정규식의 `(?![가-힣\d])` 제거 → `을지로 2가`가 빨개지는지.
- [ ] `splitAddressFields`, 슬라이스 4: 둘 다 비고 `address`가 도로명이면 `roadAddress`에, 지번이면 `jibunAddress`에 들어간다. 이미 `roadAddress`가 있으면 `address`가 있어도 그대로 두고(`jibunAddress`는 빈 문자열), 앞뒤 공백은 제거된다(출처: 함수 머리 주석 "비어 있고 address만 있을 때"). 변이: `if (!roadAddress && !jibunAddress && address)`의 조건을 `||`로 바꿔 빨개지는지.
- [ ] `buildGeocodeCandidates`, 슬라이스 5: 빈·공백 입력은 `[]`. `"광영동 30-1"`은 원본, 산 토글본 `"광영동 산 30-1"` 순서로 포함. `"광영동 산 30-1"`은 원본과 `"광영동 30-1"`. `"광양시 명산리 114-4번지"`는 원본, `"번지"`를 지운 형태, 각각의 산 토글본이 중복 없이 우선순위 순서(출처: 함수 머리 주석 "원본 → 번지 접미사 제거 → 산/일반 지번 토글" 및 `toggleSanNotation` 주석의 예). 변이: `base.replace(/번지/g, " ")`를 제거해 번지 케이스가 빨개지는지.
- [ ] 실행: `npx vitest run src/features/map-marker/lib/geocode.test.ts` → 모두 통과, `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

---

### Task 2: `erp-staging.ts` — `stageErpRows`

**Files:**
- Create: `src/features/map-marker/lib/erp-staging.test.ts`

**Steps:**
- [ ] `stageErpRows`의 매개변수(`rows`, `existing`, `previous`, `needsRegroup`, `onStatus` 등)와 반환값(`StagedErpUpload`: `reviewRows`·`existingRows`·`addonRows`·`skippedRows`·`needsRegroup`·`geocodeFailedAddresses`)을 읽고, 같은 폴더의 `erp-classify.test.ts`·`erp-preview.test.ts`가 쓰는 행 픽스처 모양을 재사용한다. 함수가 지오코딩을 부르면(`geocodeAddressQueue` 등 SDK 경계) 그 경계를 어떻게 주입받는지 읽고, 주입이 불가능해 테스트할 seam이 없으면 **여기서 멈추고 보고한다**(소스를 바꾸지 않는다).
- [ ] 슬라이스 1: 기존 마커에 없는 새 코드 행 → `reviewRows`로. 슬라이스 2: 기존 마커와 같은 코드·연도 → `existingRows`로. 슬라이스 3: 코드가 없거나 주소가 없는 행 → `skippedRows`(`reason` 값은 타입의 리터럴 `"코드 없음" | "주소 없음" | "지난 사업연도"`). 슬라이스 4: `previous`에 위치가 있는 행은 그 위치를 유지. 슬라이스 5: `onStatus`가 호출된다(호출 횟수·문구는 고정하지 않고 호출 여부만).
- [ ] 각 슬라이스마다 변이 확인. 실행: 새 테스트 통과, `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

---

### Task 3: `its-client.ts` 순수 함수

**Files:**
- Create: `src/features/cctv/lib/its-client.test.ts`

**Steps:**
- [ ] `collectFieldNames`, `hasRoadSectionField`, `normalizeCctvRow(row, roadType)`의 입력 타입(`ItsRow`)과 반환 타입(`CctvItem`, `types/cctv.ts`)을 읽는다. 필드 이름 후보(예: 좌표·이름·영상 주소 필드가 여러 이름으로 올 수 있는지)와 `null`을 돌려주는 조건을 코드와 주석에서 읽는다.
- [ ] 슬라이스: ① 필수 필드가 모두 있는 행 → `CctvItem`(타입의 각 필드가 올바른 값으로 매핑됨, 출처: `CctvItem` 타입·필드 이름). ② 좌표가 없거나 숫자로 바꿀 수 없는 행 → `null`. ③ 도로 구간 필드가 있는 행 집합에서 `hasRoadSectionField`가 `true`, 없으면 `false`. ④ `collectFieldNames`가 여러 행의 필드 이름을 중복 없이 모은다.
- [ ] 각 슬라이스마다 변이 확인. 실행: 새 테스트 통과, `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건. 외부 API 호출(`fetchCctvByRoadType`)은 테스트하지 않는다.

---

### Task 4: `batch-lookup.ts` — `parseBatchInputs`

**Files:**
- Create: `src/features/gpsmap/lib/batch-lookup.test.ts`

**Steps:**
- [ ] `parseBatchInputs(text)`의 머리 주석과 본문을 읽고 규칙(줄 구분, 공백·빈 줄 제거, 중복 처리, 최대 개수 제한 여부)을 확인한다.
- [ ] 슬라이스: ① 여러 줄 입력이 줄 단위 배열로. ② 앞뒤 공백·빈 줄 제거. ③ Windows 줄바꿈(`\r\n`)도 같은 결과. ④ 코드에 중복 제거나 상한이 있으면 그 규칙(주석의 설명대로). 각 슬라이스마다 변이 확인.
- [ ] 실행: 새 테스트 통과, `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

---

### Task 5: `plan.ts` — 캡처 격자 계산

**Files:**
- Create: `src/features/map-marker/lib/map-capture-stitch/plan.test.ts`

**Steps:**
- [ ] `buildCaptureGridPlan`·`scaleCaptureGridPlan`의 매개변수와 `types.ts`(`CaptureGridPlan` 등) 필드 설명을 읽는다. 지도 객체(`kakao.maps`)가 필요한 함수는 테스트하지 않는다. 입력이 좌표·크기 숫자뿐인 함수만 한다. seam이 없으면 보고하고 멈춘다.
- [ ] 슬라이스: ① 작은 영역(한 타일에 들어감) → 타일 1개. ② 가로로 긴 영역 → 타일 수와 순서가 타입 설명대로(출처: `types.ts` 필드 설명, 계산은 손으로 도출해 적는다). ③ 같은 입력을 두 번 → 같은 결과(결정성). ④ 0 크기·음수 크기 경계 입력의 현재 동작을 관찰해, 의도가 불분명하면 `it.todo`로 남긴다. ⑤ `scaleCaptureGridPlan`이 비율에 따라 타일 크기를 바꾼다.
- [ ] 각 슬라이스마다 변이 확인. 실행: 새 테스트 통과, 검증 명령 → 오류 0건.

---

### Task 6: `kakao-route-client.ts` — `planRoute`

**Files:**
- Create: `src/features/route/lib/kakao-route-client.test.ts`

**Steps:**
- [ ] `planRoute`가 어떤 URL로 어떤 본문을 `fetch`하는지, 응답을 어떻게 해석하는지, `RouteApiError`를 언제 던지는지 읽는다. `authed-fetch`(`src/lib/api/authed-fetch.ts`)를 거치는지 확인하고 그 경계를 가짜로 바꿀지 `fetch` 전역을 바꿀지 정한다(기존 `authed-fetch.test.ts`가 쓰는 방식을 따른다).
- [ ] 슬라이스: ① 성공 응답 → 해석된 결과 반환. ② 서버가 오류 코드를 주면 `RouteApiError`(코드·메시지 보존). ③ 네트워크 오류 → 코드가 정한 방식으로 처리. 각 슬라이스마다 변이 확인.
- [ ] 실행: 새 테스트 통과, 검증 명령 → 오류 0건.

---

### Task 7: 검증과 기록 (Claude)

**Steps:**
- [ ] agy diff를 전부 읽는다: `git diff --stat`에 `*.test.ts`만 있는지, 소스가 안 바뀌었는지, 모든 기대값의 출처를 주석과 대조해 동어반복이 없는지, 변이 확인 보고가 모듈마다 있고 원복이 증명됐는지.
- [ ] 테스트 몇 개를 골라 **내가 직접 변이**(소스 판정 한 줄 변경)해 빨개지는지 확인하고 원복한다.
- [ ] `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test`를 직접 돌리고 테스트 개수 변화를 적는다.
- [ ] 테스트가 드러낸 결함 목록(`it.todo`·보고)을 구현 문서 "한계"와 별도 작업 후보에 적는다. 구현 문서의 "직접 하실 일"은 없음(화면 영향 없음)으로 쓴다.
