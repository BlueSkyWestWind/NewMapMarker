# 테스트 보강 (설계)

작성일 2026-11-15 · 대상: 테스트가 없는 순수 로직 6개 모듈 · 구현계획: [Ver_3.0_테스트보강_구현계획.md](Ver_3.0_테스트보강_구현계획.md) · 구현: [Ver_3.0_테스트보강_구현.md](Ver_3.0_테스트보강_구현.md)

## 1. 배경과 결정 사항

사후 점검에서 agy가 "테스트 없는 핵심 `lib` 16개"를 보고했다. **그 목록은 부정확했다.** 파일 이름이 틀린 것이 있고(`schedule/lib/date-utils.ts`는 존재하지 않고, `map-marker/lib/bounds.ts`·`capture.ts`는 실제로 `map-capture-stitch/` 아래다), `data-manager`의 `parse`·`headers`·`date-utils`는 `MapMarkerExcelManager`를 통해 이미 `data-manager.test.ts`가 다룬다(20개 테스트). 그래서 Claude가 다시 계산했다: 옆에 `.test.ts`가 없는 40줄 이상 `lib` 파일은 27개이고, 그중 **브라우저·SDK·DB에 기대지 않는 순수 모듈**과 테스트가 실제로 참조하지 않는 것을 추렸다. 이 문서는 **어디에, 어떤 테스트를 쓰는지**를 정한다.

**사용자가 정한 것**

| # | 결정 | 날짜 |
|---|---|---|
| 1 | 구현은 agy가 하고 Claude가 diff를 검토·수정한다 | 2026-11-14 |
| 2 | `.tsx`·훅 렌더 테스트 환경(jsdom)은 도입하지 않는다. 테스트는 `.test.ts`로 순수 로직만 한다 | 2026-11-14 |

**설계에서 정한 것(사용자 확인 대상은 §6)**

| # | 결정 |
|---|---|
| 3 | 이번 범위는 **6개 모듈**(§3.1). DOM·SDK·DB에 묶인 모듈(`overlay-content`·`overlay-drag`·`cluster-pie`·`vworld-gpsmap`·`parcel-boundary`·`decode-image`·`capture`·`export-excel`)은 제외한다 |
| 4 | 테스트는 **특성화 테스트**다. 지금 동작을 고정하되, 기대값은 코드가 돌려준 값을 베끼지 않고 **코드의 주석·명세·실제 사례에서 독립적으로** 정한다(동어반복 방지) |
| 5 | 각 모듈은 **한 슬라이스씩**(테스트 하나 → 통과 확인 → 다음) 진행하고, 슬라이스마다 **변이 확인**(코드를 잠깐 틀리게 바꿔 테스트가 빨개지는지 보고 원복)을 한다 |
| 6 | 테스트 위치(seam)는 각 모듈의 **공개 함수**다. 비공개 함수(`toggleSanNotation` 등)는 공개 함수를 통해서만 확인한다 |

## 2. 확인한 사실

### 2.1 순수 모듈 후보 (테스트가 없는 것)

| 모듈 | 줄 | 공개 함수 | 순수성 | 위험 |
|---|---:|---|---|---|
| `map-marker/lib/geocode.ts` | 290 | `classifyKoreanAddress`, `splitAddressFields`, `buildGeocodeCandidates`(순수) / `geocodeAddress`·`reverseGeocode`·`geocodeAddressQueue`(카카오 SDK) | 앞의 세 개는 순수 | 높음 — 도로명/지번 판별이 위치등록 저장 주소에 직접 들어간다 |
| `cctv/lib/its-client.ts` | 257 | `collectFieldNames`, `hasRoadSectionField`, `normalizeCctvRow`(순수) / `fetchCctvByRoadType`(fetch) | 앞의 세 개는 순수 | 중간 — 외부 API 응답을 CCTV 항목으로 정규화 |
| `gpsmap/lib/batch-lookup.ts` | 75 | `parseBatchInputs`(순수) / `runBatchLookup`(조회 호출) | 순수 1개 | 중간 — 일괄 조회 입력 파싱 |
| `map-marker/lib/map-capture-stitch/plan.ts` | 356 | `buildCaptureGridPlan`, `refineCapturePlanDestinations`, `buildManualStitchPlan`, `scaleCaptureGridPlan` | 계산 중심(지도 객체 없이 좌표·크기 입력)으로 보임, 구현 때 확인 | 중간 — 캡처 격자 계산 |
| `map-marker/lib/erp-staging.ts` | 75 | `stageErpRows`(비동기, 의존 주입) | 순수 + 주입된 `onStatus` | 높음 — 위치등록 확인 목록을 만든다 |
| `route/lib/kakao-route-client.ts` | 41 | `planRoute`(fetch), `RouteApiError` | `fetch`를 가짜로 바꿔 테스트 | 낮음~중간 |

- 이미 테스트가 있는 인접 모듈: `address-compare.test.ts`·`address-group.test.ts`·`erp-classify.test.ts`·`erp-review*.test.ts`·`overlay-arrange.test.ts`·`map-viewport-capture.test.ts` 등.
- `geocode.ts`의 `splitAddressFields`는 다른 테스트가 간접적으로 부르지만(참조 1/6), `classifyKoreanAddress`·`buildGeocodeCandidates`는 직접 테스트가 없다.

### 2.2 기대값의 독립적 출처 (동어반복 방지)

`geocode.ts`의 주석이 이미 사례를 준다: 도로명 `테헤란로 152`, 지번 `명산리 114-4`, 지번 `산 30-1`, 지번(번호 뒤 가) `을지로 2가`, 산 토글 `광영동 산 30-1 ↔ 광영동 30-1`, `…번지`는 지번. 이 사례는 코드가 아니라 **명세(주석)와 실제 주소 형태**에서 나온 것이므로 기대값으로 쓸 수 있다. 다른 모듈도 같은 방식으로 코드 주석·타입(`CctvItem`)·필드 이름에서 기대값을 정한다.

## 3. 설계

### 3.1 모듈별 테스트 범위

| 모듈 | 테스트할 것 (public seam) | 기대값 출처 |
|---|---|---|
| `geocode.ts` | `classifyKoreanAddress`: 도로명(`테헤란로 152`), 지번(`명산리 114-4`, `산 30-1`, `…번지`), 번호 뒤 가·동(`을지로 2가`)은 지번, 빈 문자열·공백은 지번(주석: 애매하면 지번). `splitAddressFields`: 둘 다 비고 `address`만 있을 때 종류별 분배, 이미 값이 있으면 그대로 두고 `address`를 쓰지 않음, 앞뒤 공백 제거. `buildGeocodeCandidates`: 원본 → `번지` 제거 → 산 토글 순서·중복 제거, 빈 입력은 `[]` | `geocode.ts`의 주석 사례 |
| `its-client.ts` | `normalizeCctvRow`: 필수 필드가 없으면 `null`, 정상 행은 `CctvItem` 모양(`types/cctv.ts`의 필드), 좌표가 숫자가 아니면 거르는지; `collectFieldNames`·`hasRoadSectionField`: 행 집합에서 필드명 수집·판별 | `types/cctv.ts` 타입, 함수 머리 주석 |
| `batch-lookup.ts` | `parseBatchInputs`: 줄바꿈·공백·빈 줄 처리, 중복 처리 여부(코드가 정한 규칙을 읽어 그 규칙대로) | 함수 머리 주석 |
| `plan.ts` | `buildCaptureGridPlan`: 같은 입력에서 타일 수·겹침·범위가 결정적인지, 극단 입력(0 크기 영역, 큰 영역) 경계; `scaleCaptureGridPlan`: 비율 적용 | 함수 머리 주석과 `types.ts`의 필드 설명 |
| `erp-staging.ts` | `stageErpRows`: 신규/기존/건너뜀 분류가 `reviewRows`·`existingRows`·`skippedRows`로 나뉘는지(입력 행 몇 개로), `previous` 위치 유지, `onStatus` 호출 | 같은 폴더 `erp-classify.test.ts`·`erp-preview.test.ts`의 사례 |
| `kakao-route-client.ts` | `planRoute`: 성공 응답 전달, 오류 응답이 `RouteApiError`로 변환되는지(`fetch`를 가짜로) | 함수 머리 주석, `route.test.ts`의 오류 코드 |

### 3.2 방법

- **슬라이스**: 함수 하나의 테스트 하나를 쓰고 → 현재 코드에서 통과 확인 → 다음. 한꺼번에 몰아 쓰지 않는다(수평 슬라이스 금지).
- **변이 확인**: 통과한 테스트마다 대상 코드에서 판정 한 군데를 일부러 틀리게 바꿔(예: `classifyKoreanAddress`의 `번지` 검사를 지운다) 테스트가 **빨개지는지** 본 뒤 원복한다. 빨개지지 않으면 그 테스트는 아무것도 잠그지 못하는 것이라 고친다. 변이와 원복은 `git diff`로 대조해 원복을 증명한다.
- **금지**: 결과를 코드와 같은 식으로 계산하는 단언(`expect(f(x)).toBe(g(x))`), 비공개 함수 직접 호출, 내부 협력자 모킹. 외부 경계(`fetch`, 시간)만 가짜로 바꾼다.

### 3.3 코드 변경

- 원칙적으로 **테스트 파일만 추가**한다. 소스 변경은 없다.
- 예외: 테스트하려는 함수가 `export`되지 않아 seam이 없는 경우(예: `plan.ts` 안의 순수 계산)는 그 사실을 보고하고, 사용자가 허락한 경우에만 `export`를 더한다.

## 4. 범위 밖

- DOM·SDK·DB에 묶인 모듈의 테스트(`.tsx`·jsdom 필요).
- 버그 수정. 테스트가 기존 동작의 결함을 드러내면 **고치지 않고 보고**한다(별도 작업). 테스트는 지금 동작을 고정하되, 명백한 버그를 고정하지 않도록 기대값은 §2.2의 독립 출처로 정한다.
- 커버리지 수치 목표(숫자가 아니라 위험이 큰 규칙을 잠그는 것이 목적이다).

## 5. 위험과 검증

- **동어반복**: 기대값이 코드와 같은 식이면 항상 통과한다. 변이 확인이 이를 잡고, Claude가 모든 테스트의 기대값 출처를 검토한다.
- **취약한 테스트**: 구현 세부(내부 호출 순서·메시지 문구)에 묶으면 리팩터에서 깨진다. 공개 동작(반환값)만 본다.
- **발견된 결함**: 테스트 작성 중 의심스러운 동작을 만나면 그 케이스를 **`it.todo` 또는 보고서에만** 적고 고정하지 않는다.
- **검증**: `npx vitest run <새 테스트>`, `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test`.

## 6. 사용자 확인 필요 항목

1. **테스트 위치(seam) 확인**(TDD 규칙: 테스트는 합의된 seam에서만 쓴다): §3.1 표의 6개 모듈과 **공개 함수만** 테스트하는 범위로 괜찮은지. 각 seam이 잡는 것: 순수 규칙의 회귀. 못 잡는 것: SDK·DOM 연결, 화면 동작.
2. 우선순위: 위험이 큰 순서(`geocode` → `erp-staging` → `its-client` → `batch-lookup` → `plan` → `kakao-route-client`)로 진행하고, 앞의 둘만 하고 멈출 수도 있다. 전부 할지 정해 달라.
3. 테스트가 기존 결함을 드러냈을 때 **보고만 하고 고치지 않는** 방침으로 괜찮은지.
