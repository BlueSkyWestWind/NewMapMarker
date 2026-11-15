# 테스트 보강 (구현)

구현일 2026-11-15 · 설계: [Ver_3.0_테스트보강_설계.md](Ver_3.0_테스트보강_설계.md) · 계획: [Ver_3.0_테스트보강_구현계획.md](Ver_3.0_테스트보강_구현계획.md)

테스트가 없던 순수 로직 6개 모듈에 특성화 테스트를 더했다. 소스는 한 줄도 바꾸지 않았다. 구현은 agy가 하고 Claude가 diff를 검토했으며, 검토에서 agy의 변이 확인이 놓친 약한 테스트를 하나 보강했다.

## 직접 하실 일

없다. 테스트 파일만 추가됐고 화면에 영향이 없다. 아래 "발견한 것"의 한 가지(`plan.ts`의 0 크기 입력)는 결정이 필요하면 알려 달라.

## 한 일

| 모듈 | 테스트 파일 | 개수 | 다룬 것 |
|---|---|---:|---|
| `map-marker/lib/geocode.ts` | `geocode.test.ts` | 8 | `classifyKoreanAddress`(도로명·지번·번지·번호 뒤 가·빈 입력), `splitAddressFields`, `buildGeocodeCandidates`(번지 제거·산 토글·중복 제거 순서) |
| `map-marker/lib/erp-staging.ts` | `erp-staging.test.ts` | 6 | `stageErpRows`: 신규 → `reviewRows`(+좌표), 기존 → `existingRows`(+`preview`), 코드·주소 없음 → `skippedRows`, `previous` 위치 유지, 지오코딩 대상 없을 때 호출 안 함, 실패 주소 정리 |
| `cctv/lib/its-client.ts` | `its-client.test.ts` | 4 | `normalizeCctvRow`(정상 행, 좌표 없음 → `null`), `hasRoadSectionField`, `collectFieldNames` |
| `gpsmap/lib/batch-lookup.ts` | `batch-lookup.test.ts` | 3 | `parseBatchInputs`(줄 분리, 공백·빈 줄, `\r\n`) |
| `map-marker/lib/map-capture-stitch/plan.ts` | `plan.test.ts` | 4 + todo 1 | `buildCaptureGridPlan`(작은 영역, 가로로 긴 영역, 결정성), `scaleCaptureGridPlan` |
| `route/lib/kakao-route-client.ts` | `kakao-route-client.test.ts` | 4 | `planRoute`(`fetch`만 가짜) |

## 방법과 확인

- **TDD**: 모듈마다 함수 하나씩 슬라이스로, 기대값은 코드가 돌려준 값이 아니라 소스 주석의 사례·타입·손계산에서 정하고 각 테스트에 출처를 적었다.
- **변이 확인**: agy가 모듈마다 소스의 판정 한 군데를 틀리게 바꿔 테스트가 빨개지는지 보고 원복했다. 원복은 `git diff`로 증명됐고, Claude가 작업 전후 `git status`를 대조해 추적 소스 파일이 바뀌지 않았음을 확인했다.
- **`erp-staging`은 한 번 멈췄다가 다시 했다.** 처음에 agy는 "지오코딩을 주입할 seam이 없다"며 중단했다. Claude가 `geocodeAddressQueue`는 카카오 SDK를 감싼 외부 경계라고 판단해 그 모듈 하나만 `vi.mock`하는 방식을 허용했고(같은 프로젝트의 순수 모듈은 진짜를 씀), 재지시해서 완료했다.

## 검토에서 보강한 것

- **agy의 변이 확인이 놓친 약한 테스트.** Claude가 `classifyKoreanAddress`의 `번지` 규칙(`if (/번지/.test(a)) return "jibun"`)을 직접 지워 보니 테스트 7개가 모두 통과했다. 테스트 입력 `…두암동 123번지`가 그 규칙 없이도 지번으로 나왔기 때문이다(agy의 변이는 정규식 다른 부분이었다). 이 규칙이 결과를 바꾸는 입력을 찾아(`광주 북구 중앙로 12 번지` — `번지` 앞에 공백이 있으면 도로명 정규식이 먼저 맞아 `road`가 된다) 테스트를 추가했다. 규칙을 지우면 이 테스트가 빨개지는 것을 다시 확인하고 원복했다.
- 두 번째 독립 변이(`batch-lookup`의 `.filter(Boolean)` 제거)도 해당 테스트 2개가 빨개지는 것을 확인했다.

## 발견한 것

- **`plan.ts`의 0 크기 입력**: `buildCaptureGridPlan`에 `viewportSize.width === 0`을 주면 `effectiveLngSpan = lngSpan * (1 / 0) = Infinity`가 된다. 의도된 동작인지 명세가 없어 `it.todo`로 남겼고 고정하지 않았다. 실제 화면에서 뷰포트 폭이 0일 수 있는지(창이 숨겨진 상태 등)에 달려 있어 별도 점검 대상이다.
- `classifyKoreanAddress`의 `번지` 규칙은 공백이 낀 `…12 번지` 같은 입력에만 필요한 규칙이다(위 보강). 규칙을 정리할 때 이 테스트가 보호한다.

## 검증

| 명령 | 결과 |
|---|---|
| `npx tsc --noEmit` | 오류 0건 |
| `npx eslint . --max-warnings=0` | 오류 0건 |
| `npm test` | 163개 파일 통과, 1개 스킵 / 1,841개 통과, 3개 스킵, 1개 todo (이 작업 전 154개 파일·1,797개) |
| 임시 distDir 빌드 | 성공. 홈 283 kB, `/gpsmap` 207 kB (테스트는 번들에 영향이 없다) |

## 한계

- DOM·SDK·DB에 묶인 모듈(`overlay-content`·`overlay-drag`·`cluster-pie`·`vworld-gpsmap`·`parcel-boundary`·`decode-image`·`capture`·`export-excel`)과 훅·컴포넌트는 여전히 테스트가 없다.
- 특성화 테스트는 **지금 동작**을 고정한다. 기대값의 일부는 코드 주석과 손계산에서 정했지만, 주소 규칙이 실제 현장 주소에 맞는지는 별도로 검증하지 않았다.
- `its-client`의 `fetchCctvByRoadType`, `batch-lookup`의 `runBatchLookup`, `geocode`의 SDK 함수 등 외부 호출 함수는 테스트하지 않았다.
