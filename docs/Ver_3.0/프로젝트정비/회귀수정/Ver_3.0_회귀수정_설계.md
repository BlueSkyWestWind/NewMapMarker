# 업로드 훅 분할 회귀 수정 (설계)

작성일 2026-11-15 · 대상: `use-excel-upload-actions.ts`의 `formatDateToYmd` 호출, `lib/excel/data-manager/date-utils.ts` · 구현계획: [Ver_3.0_회귀수정_구현계획.md](Ver_3.0_회귀수정_구현계획.md) · 구현: [Ver_3.0_회귀수정_구현.md](Ver_3.0_회귀수정_구현.md) · 발견 경위: [대형파일분할 구현 문서](../대형파일분할/Ver_3.0_대형파일분할_구현.md) "사후 점검에서 찾은 회귀"

## 1. 배경과 결정 사항

2026-11-15 사후 점검(mattpocock code-review, Spec 축)에서 업로드 훅 분할(2026-11-14, 커밋 `971366b`)이 만든 회귀를 찾았다. 수정은 이미 작업 폴더에 있다(미커밋). 이 문서는 **원인을 진단 순서대로 기록하고, 같은 종류의 실수가 다시 나지 않게 하는 구조 개선**을 정한다.

**사용자가 정한 것**

| # | 결정 | 날짜 |
|---|---|---|
| 1 | 구현은 agy가 하고 Claude가 diff를 검토·수정한다 | 2026-11-14 |
| 2 | 회귀 수정(감싸서 호출)은 이미 반영했다. 커밋·푸시는 사용자가 지시할 때 한다 | 2026-11-15 |

**설계에서 정한 것(사용자 확인 대상은 §6)**

| # | 결정 |
|---|---|
| 3 | 재발 방지로 `date-utils.ts`의 두 함수(`isValidDateRange`, `formatDateToYmd`)를 `this`에 의존하지 않는 독립 함수로 만든다. `MapMarkerExcelManager`는 그 함수들을 그대로 펼쳐 담아 기존 호출(`MapMarkerExcelManager.formatDateToYmd(x)`)이 계속 동작하게 한다 |
| 4 | 업로드 훅의 저장 함수는 매니저 전체를 동적 import하는 대신 `formatDateToYmd`만 `import`한다(필요한 것만 쓴다). 감싸는 임시 코드와 주석은 지운다 |
| 5 | 매니저의 나머지 `this` 의존(`export`·`headers`·`info-records`·`parse`)은 이번에 건드리지 않는다(§4) |

## 2. 확인한 사실 (진단 기록)

### 2.1 증상과 재현 루프 (진단 1·2단계)

- **증상**: 시설일·개통일 값이 있는 장비를 일괄 저장하거나 개별 저장하면 `TypeError`로 저장이 실패한다(시설코드가 있는 장비만 상세 정보 행을 만든다). 위치등록 [확인] 저장은 별도 경로(`saveReviewRow`)라 영향이 없다.
- **재현 루프**(빠르고 결정적, 한 명령): `npx vitest run src/features/map-marker/lib/excel-upload-runners.test.ts` — 테스트 `메서드를 그대로 넘기면 this가 없어 오류가 난다`가 실제 매니저의 `formatDateToYmd`를 떼어 호출해 오류가 나는 것을 고정한다. 수정 전에는 훅 호출부가 이 상태였다.
- 최소 재현: `toEquipmentDbInfo(marker, MapMarkerExcelManager.formatDateToYmd)`에서 `marker.installDate`가 비어 있지 않은 것 한 가지면 충분하다(빈 값은 첫 줄 `if (value === null || value === undefined) return ""`와 `str` 검사에서 `this`에 닿기 전에 반환된다).

### 2.2 가설과 결과 (진단 3·4단계)

| 순위 | 가설 | 예측 | 결과 |
|---|---|---|---|
| 1 | 메서드를 `this` 없이 넘겨서 `this.isValidDateRange`가 실패한다 | 감싸서 부르면 사라지고, 떼어 부르면 재현된다 | **맞음** — 두 호출 모두 테스트로 확인 |
| 2 | 변환 결과 형식이 달라 DB가 거부한다 | 감싸도 계속 실패한다 | 아님 — 감싸면 `2026-01-01`로 정상 변환 |
| 3 | 매니저를 동적 import한 시점이 늦어 비어 있다 | 호출 전에 `await`가 끝났다면 해당 없음 | 아님 — 두 함수 모두 `await import`가 먼저 끝난다 |

### 2.3 원인과 구조 문제 (진단 5단계: 올바른 테스트 위치)

- **직접 원인**: `date-utils.ts`의 `formatDateToYmd`는 객체 리터럴의 메서드이고 내부에서 `this.isValidDateRange`·`this.formatDateToYmd`를 부른다(9곳). 업로드 훅을 분할하면서 원본의 `MapMarkerExcelManager.formatDateToYmd(x)`(메서드 호출)를 `toEquipmentDbInfo(marker, MapMarkerExcelManager.formatDateToYmd)`(함수 값 전달)로 바꿨다.
- **왜 컴파일·린트가 못 잡았나**: 매니저가 `Record<string, any>`이고 메서드 객체가 `ThisType<any>`다. 어떤 속성이든 `any` 함수로 보이므로 `this` 없이 넘겨도 타입 오류가 없다.
- **올바른 테스트 위치가 없다는 것이 발견이다**: 문제는 호출부(훅 안)에서 생겼는데, 훅은 `.tsx`/훅 렌더 테스트가 없어 그 위치에서 잠글 수 없다. 현재 테스트는 "떼어 부르면 오류가 난다"를 **문서화**할 뿐, 그 실수 자체를 막지 못한다. 구조상 막는 방법은 두 가지다: ① 함수를 떼어 불러도 동작하게 만든다(결정 3) ② 호출부에 의존하는 규칙을 가드 테스트로 막는다. ①이 더 단순하고 확실하다.
- **범위**: 매니저 호출은 비테스트 코드에서 9건이고, 떼어 쓰는 참조는 수정 뒤 0건이다. `this`를 쓰는 파일은 `date-utils`(9곳), `export`(6), `headers`(11), `info-records`(11), `parse`(7)다.

## 3. 설계

### 3.1 `date-utils.ts`를 독립 함수로 (결정 3)

```ts
// date-utils.ts
export function isValidDateRange(y: string | number, m: string | number, d: string | number): boolean;
export function formatDateToYmd(value: string | number | Date | null | undefined): string;
export const dateUtilMethods = { isValidDateRange, formatDateToYmd };
```

- 본문은 그대로 옮기되 `this.isValidDateRange(...)` → `isValidDateRange(...)`, `this.formatDateToYmd(...)` → `formatDateToYmd(...)`로 바꾼다(9곳).
- `dateUtilMethods`는 `index.ts`가 매니저에 펼치는 객체로 유지한다. 다른 파일(`headers`·`info-records` 등)이 `this.formatDateToYmd`를 매니저를 통해 부르는 경로가 그대로 동작해야 한다.
- 기존 테스트(`data-manager.test.ts`의 `formatDateToYmd`, 매니저 메서드 호출)는 그대로 통과해야 한다. 이것이 동작 보존의 증거다.

### 3.2 훅 정리 (결정 4)

- `use-excel-upload-actions.ts`의 `submitPendingMarkers`·`submitSinglePendingMarker`에서 `formatDateToYmd`만 필요하다. 매니저 동적 import 대신 `date-utils`에서 직접 import하고, 임시 `formatDate` 래퍼와 그 주석을 지운다.
- `toEquipmentDbInfo(marker, formatDate)`의 시그니처는 그대로 둔다(함수를 주입받는 구조, 테스트 용이).

## 4. 범위 밖

- 매니저의 나머지 `this` 의존(`export`·`headers`·`info-records`·`parse`, 총 35곳)과 `Record<string, any>` 타입을 구체 타입으로 바꾸는 일. 얻는 것이 크지만 변경 범위가 넓어 별도 작업(예: 매니저를 모듈 함수 모음으로 전환)으로 둔다.
- 다른 `.tsx`/훅 호출부의 같은 종류 실수 점검은 아래 §5의 `grep`으로 한 번 확인하는 데서 그친다.

## 5. 위험과 검증

- **동작 변경 위험**: `this`를 지우면서 오타가 나면 날짜 변환이 달라질 수 있다. 기존 `formatDateToYmd` 테스트(여러 입력 형식)가 잠근다. 변환 본문은 한 글자도 바꾸지 않고 `this.`만 지운다.
- **떼어 쓰는 호출 재점검**: 수정 뒤 `grep -rnE "MapMarkerExcelManager\.[a-zA-Z]+" src`에서 `(`로 이어지지 않는 참조가 0건인지 확인한다.
- **검증**: 새 테스트(떼어 불러도 변환됨) → 구현 → 기존 테스트 통과, `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test`.

## 6. 사용자 확인 필요 항목

1. 결정 3·4(재발 방지 구조 개선)를 이번에 할지, 현재의 감싸기 수정만 두고 끝낼지. 개선은 `date-utils.ts` 한 파일과 훅 두 함수만 바꾸는 작은 작업이라 추천한다.
2. 매니저 전체의 `this` 의존 제거(§4)를 후속 작업으로 설계할지.
