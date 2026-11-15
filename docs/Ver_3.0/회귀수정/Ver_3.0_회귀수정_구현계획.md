# 업로드 훅 분할 회귀 수정 구현계획

> **실행 방식:** 구현(코드 작성)은 agy가 하고, Claude가 diff를 검토해 틀린 곳을 고친다. 단계는 체크박스(`- [ ]`)로 추적한다. 설계 §6의 선택이 정해진 뒤 Task 2를 한다. Task 1은 이미 끝났다.

**Goal:** 업로드 훅 분할 회귀의 수정을 커밋·푸시하고, `date-utils`를 `this`에 의존하지 않게 해 같은 실수가 구조적으로 나지 않게 한다.

**Architecture:** 날짜 함수 두 개를 독립 함수로 꺼내고, 매니저 객체는 그 함수를 펼쳐 담는다. 기존 호출은 모두 그대로 동작한다. 훅은 필요한 함수만 직접 import한다.

**Tech Stack:** TypeScript · Vitest. 의존성 추가 없음.

**Spec:** [Ver_3.0_회귀수정_설계.md](Ver_3.0_회귀수정_설계.md)

## Global Constraints

- **커밋하지 않는다(agy).** Task 1의 커밋·푸시는 사용자가 지시할 때 별도로 한다.
- **문서(`docs/`, `AGENTS.md`, `README.md`, `.serena/`)는 수정하지 않는다.**
- **동작 변경 없음.** `formatDateToYmd`·`isValidDateRange`의 본문은 `this.`를 지우는 것 외에 한 글자도 바꾸지 않는다.
- **모든 명령은 포그라운드로 실행하고 출력이 화면에 보이게 한다. 백그라운드 작업(background task, `&`, `Start-Process`)으로 돌려 두고 기다리지 않는다.**
- **검증 명령**: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`.
- 기존 줄바꿈(CRLF/LF)을 파일마다 유지한다. BOM 없는 UTF-8.

## Review Focus

1. `date-utils.ts`에서 `this.`가 한 곳도 남지 않았는지 (Task 2, Step 4의 `grep`).
2. 매니저 객체(`index.ts`의 펼침)에 `isValidDateRange`·`formatDateToYmd`가 그대로 들어 있어 `headers`·`info-records`·`parse`의 `this.formatDateToYmd` 호출이 동작하는지 (기존 `data-manager.test.ts` 통과).
3. 훅에 감싸는 임시 코드가 남지 않았고, 매니저 동적 import가 `formatDateToYmd`만 쓰는 곳에서 제거됐는지 (Task 2, Step 6 diff).

---

### Task 1: 현재 수정 커밋·푸시 (사용자 지시 시, 이미 구현됨)

**상태:** `use-excel-upload-actions.ts`(감싼 `formatDate`), `excel-upload-runners.test.ts`(테스트 2개), `arch-guard.test.ts`(정규식 확장), 문서·`pitfalls.md`가 미커밋이다.

**Steps:**
- [x] 호출 두 곳을 감싼 함수로 고치고 회귀 테스트 2개를 더했다.
- [ ] 사용자가 "커밋"이라고 하면 문서 커밋과 코드 커밋(또는 하나)으로 나눠 만들고 푸시한다. 메시지는 파일(`git commit -F`)로 넘기고 BOM이 없는지 확인한다.
- [ ] 커밋 전에 사용자가 엑셀 업로드 화면(시설코드·시설일·개통일이 있는 장비 저장)을 확인한다.

---

### Task 2: `date-utils`를 `this` 비의존으로 (설계 §6 항목 1에서 하기로 한 경우)

**Files:**
- Modify: `src/features/map-marker/lib/excel/data-manager/date-utils.ts`
- Modify: `src/features/map-marker/lib/excel/data-manager/data-manager.test.ts` (테스트 추가)
- Modify: `src/features/map-marker/hooks/use-excel-upload-actions.ts` (`submitPendingMarkers`, `submitSinglePendingMarker`)

**Interfaces:**
```ts
// date-utils.ts
export function isValidDateRange(y: string | number, m: string | number, d: string | number): boolean;
export function formatDateToYmd(value: string | number | Date | null | undefined): string;
export const dateUtilMethods: Record<string, any> & ThisType<any>; // 기존 export 유지. 값은 { isValidDateRange, formatDateToYmd }
```

**Steps:**
- [ ] 실패하는 테스트를 먼저 쓴다 `data-manager.test.ts`의 `formatDateToYmd` 묶음에: `import { formatDateToYmd } from "./date-utils"`로 가져온 함수를 **떼어 부른다**: `formatDateToYmd("20260101")` → `"2026-01-01"`, `formatDateToYmd(new Date(2026, 0, 1))` → `"2026-01-01"`, `formatDateToYmd("2026-02-30")`(없는 날짜) → 기존 메서드 호출과 같은 결과(기존 테스트의 기대값을 읽어 같은 값을 쓴다). 또 `const { formatDateToYmd: f } = MapMarkerExcelManager; f("20260101")`이 오류 없이 `"2026-01-01"`을 돌려주는지. 실행: `npx vitest run src/features/map-marker/lib/excel/data-manager/data-manager.test.ts` → 모듈이 `formatDateToYmd`를 export하지 않아 FAIL.
- [ ] `date-utils.ts`에서 두 메서드를 독립 `export function`으로 바꾸고 본문의 `this.isValidDateRange`·`this.formatDateToYmd`를 지운다(9곳). `dateUtilMethods`는 `{ isValidDateRange, formatDateToYmd }`로 유지한다.
- [ ] 실행: 위 테스트 → PASS(새 테스트와 기존 메서드 호출 테스트 모두).
- [ ] 확인: `grep -n "this\." src/features/map-marker/lib/excel/data-manager/date-utils.ts`가 0건이다. 나머지 파일(`export`·`headers`·`info-records`·`parse`)은 수정하지 않는다.
- [ ] 훅의 두 저장 함수에서 `MapMarkerExcelManager` 동적 import 중 이 날짜 변환에만 쓰이는 것을 확인한다(다른 곳에서 쓰이면 남긴다). 그 경우 `formatDateToYmd`를 `@/features/map-marker/lib/excel/data-manager/date-utils`에서 정적 import하고 임시 `formatDate` 래퍼와 주석을 지운다.
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건. `excel-upload-runners.test.ts`의 "그대로 넘기면 오류가 난다" 테스트는 이제 그 전제가 사라지므로 **기대를 바꾼다**: 떼어 넘겨도 `2026-01-01`로 변환된다(테스트 이름도 맞춘다).

---

### Task 3: 검증과 기록 (Claude)

**Steps:**
- [ ] agy diff를 읽고 `date-utils.ts`의 본문이 `this.` 삭제 외에 같은지(`git diff`로 글자 단위 확인), 매니저 객체가 같은 키를 가지는지 확인한다.
- [ ] `grep -rnE "MapMarkerExcelManager\.[a-zA-Z]+" src`에서 `(`로 이어지지 않는 참조가 0건인지 확인한다.
- [ ] 구현 문서에 진단 기록(재현 루프·가설·원인·테스트 위치 발견)과 결과를 적고, Serena `pitfalls`의 해당 항목을 "날짜 함수는 독립 함수가 됐다"로 갱신한다. 매니저의 나머지 `this` 의존은 한계에 남긴다.
