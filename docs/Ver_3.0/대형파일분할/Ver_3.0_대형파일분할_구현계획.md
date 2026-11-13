# 대형 파일 분할 구현계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `use-excel-upload-actions.tsx`(1,249줄), `marker-detail-modal.tsx`(1,556줄), `kakao-map-canvas.tsx`(1,622줄)의 책임을 순수 `.ts` 로직과 얇은 React 훅/컴포넌트로 분할하고, 특성화 테스트(`.test.ts`)와 수동 화면 체크리스트로 회귀를 방지한다.

**Architecture:** 위험이 낮은 순서(`use-excel-upload-actions` → `marker-detail-modal` → `kakao-map-canvas`)로 한 파일씩 분할한다. 특성화 테스트는 **분할 전 코드에서 먼저 PASS**를 확인한 뒤 모듈을 이동하고 import만 바꿔 다시 PASS를 확인한다.

**Tech Stack:** Next.js 15 · React 19 · TypeScript (`strict`) · TanStack Query · Zustand · Vitest. 의존성 추가 없음.

**Spec:** [Ver_3.0_대형파일분할_설계.md](Ver_3.0_대형파일분할_설계.md)

## Global Constraints

- **커밋하지 않는다.** 사용자가 "커밋"을 말할 때만 커밋한다.
- **기존 화면을 옮길 때는 원본이 사양이다.** 기능 개선이나 UI 변경을 덧붙이지 않는다.
- `vitest.config.ts`의 `include: ["src/**/*.{test,spec}.ts"]` 규칙을 유지한다(테스트는 `.test.ts`로 작성).
- `MarkerDetailModal` 등 `map-marker-page.tsx:19-51`의 `dynamic()` 경계와 홈 First Load JS **295 kB 이하** 기준선을 유지한다.
- **검증 명령**: 매 Task마다 `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`. 빌드는 `npx next build`(dev 서버 실행 중이면 `next.config.ts`에 임시 `distDir` 사용 후 원복).
- 파일 인코딩 UTF-8, 기존 줄바꿈(CRLF/LF) 유지, 한글 깨짐 확인.

## Review Focus

1. `use-excel-upload-actions` 분할 시 실패 주소 토스트(`buildUploadResultDescription`)의 JSX 렌더와 10건 초과 생략 표시(`…외 N종`)가 그대로 유지되는지 (Task 1, Step 4·6 확인).
2. `marker-detail-modal`의 표 셀 드래그 선택 및 TSV 복사 포맷(탭/개행 구분, 미선택 칸 빈 문자열)이 변경되지 않는지 (Task 2, Step 1·4 확인).
3. `kakao-map-canvas`에서 `useEffect` 의존성 배열과 클린업(`setMap(null)`, 타이머 해제)이 훅 분리 후 누락되지 않고 지도 동작이 동일한지 (Task 3, Step 3·4 수동 확인).
4. `use-excel-upload-actions.tsx` → `.ts` 확장자 변경 시 기존 5개 import(확장자 생략)가 깨지지 않는지 (Task 1, Step 6 `tsc --noEmit` 확인).

---

### Task 1: `use-excel-upload-actions.tsx` 분할 및 특성화 테스트

**Files:**
- Create: `src/features/map-marker/components/sidebar/upload-result-toast.tsx`
- Create: `src/features/map-marker/lib/excel-upload-runners.ts`
- Create: `src/features/map-marker/lib/excel-upload-runners.test.ts`
- Create: `src/features/map-marker/lib/erp-staging-actions.ts`
- Rename/Modify: `src/features/map-marker/hooks/use-excel-upload-actions.tsx` → `src/features/map-marker/hooks/use-excel-upload-actions.ts` (기존 5개 호출부는 확장자를 생략해 import하므로 경로 수정 불필요)

**Interfaces:**
```ts
// src/features/map-marker/components/sidebar/upload-result-toast.tsx
export function buildUploadResultDescription(summary: string, failedAddresses: string[]): ReactNode;

// src/features/map-marker/lib/excel-upload-runners.ts
export async function assertErpDateColumns(rows: ErpParsedRow[]): Promise<void>;

// src/features/map-marker/hooks/use-excel-upload-actions.ts (기존 반환 시그니처 유지)
export type StagedConfirmResult =
  | { status: "saved" | "skipped" }
  | { status: "mismatch"; lat: number; lng: number; actualAddress: string | null };
export function useExcelUploadActions(): { /* 기존 반환 객체와 동일 */ };
```

**Steps:**
- [ ] **분할 전 특성화 테스트**: `assertErpDateColumns`(61줄)가 현재 미export 지역 함수이므로, `src/features/map-marker/lib/erp-classify.ts:287`의 `findMissingErpDateColumns`를 직접 호출하는 특성화 테스트를 `excel-upload-runners.test.ts`에 작성한다.
  - 단언 1: `installDate`·`openDate` 열이 모두 있는 행 전달 시 `findMissingErpDateColumns(rows)` → `[]`.
  - 단언 2: 두 열이 모두 없는 행 전달 시 `findMissingErpDateColumns(rows)` → `["시설일", "개통일"]`.
- [ ] `npx vitest run src/features/map-marker/lib/excel-upload-runners.test.ts` → **PASS** 확인(분할 전 동작 고정).
- [ ] `upload-result-toast.tsx`로 `buildUploadResultDescription`(76-99줄)을 분리한다.
- [ ] `excel-upload-runners.ts`(내부에 `assertErpDateColumns` 이동·export)와 `erp-staging-actions.ts`로 순수 비동기 로직을 추출하고, 훅 본체를 `use-excel-upload-actions.ts`로 정리한다.
- [ ] `excel-upload-runners.test.ts`에 `assertErpDateColumns` 단언(`expect(assertErpDateColumns([rowWithoutDates])).rejects.toThrow("새 양식의 시설일·개통일 열을 찾지 못해 중단했습니다")`)을 추가하고 `npx vitest run src/features/map-marker/lib/excel-upload-runners.test.ts` → **PASS** 확인.
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 전체 PASS 확인.

---

### Task 2: `marker-detail-modal.tsx` 분할 및 특성화 테스트

**Files:**
- Create: `src/features/map-marker/lib/table-tsv.ts`
- Create: `src/features/map-marker/lib/table-tsv.test.ts`
- Create: `src/features/map-marker/hooks/use-table-cell-selection.ts`
- Create: `src/features/map-marker/hooks/use-marker-gps-info.ts`
- Create: `src/features/map-marker/components/modals/marker-detail-group-actions.ts`
- Create: `src/features/map-marker/components/modals/marker-detail-gps-card.tsx`
- Modify: `src/features/map-marker/components/modals/marker-detail-modal.tsx:1-1556`

**Interfaces:**
```ts
// src/features/map-marker/lib/table-tsv.ts
export function buildSelectionTsv(
  selectedCells: Set<string>,
  getCellValue: (r: number, c: number) => string,
): string;
export function buildTableTsv(headers: string[], rowsData: string[][]): string;
```

**Steps:**
- [ ] **특성화 준비 및 테스트 작성**: `handleCopySelected`(682-712줄)는 현재 `marker-detail-modal.tsx` 내부 미export 클로저이므로, 먼저 동일 포맷을 구현한 `table-tsv.ts`를 추출하기 전/직후에 `table-tsv.test.ts`를 작성한다.
  - 단언 1: `selectedCells = new Set(["0,0", "1,1"])`, `getCellValue = (r, c) => \`R\${r}C\${c}\`` → `"R0C0\t\n\tR1C1"`.
  - 단언 2: `selectedCells = new Set()` → `""`.
  - 단언 3: `buildTableTsv(["구분", "국소명"], [["단독", "A"]])` → `"구분\t국소명\n단독\tA"`.
- [ ] `npx vitest run src/features/map-marker/lib/table-tsv.test.ts` → **PASS** 확인.
- [ ] `use-table-cell-selection.ts`, `use-marker-gps-info.ts`, `marker-detail-group-actions.ts`, `marker-detail-gps-card.tsx`를 생성하고 `marker-detail-modal.tsx`에서 호출하도록 교체한다.
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 전체 PASS 확인.

> **체크포인트**: 사용자가 요청할 때만 커밋한다.

---

### Task 3: `kakao-map-canvas.tsx` 레이어 훅 분리

**Files:**
- Create: `src/features/map-marker/hooks/use-kakao-route-layer.ts`
- Create: `src/features/map-marker/hooks/use-kakao-cctv-layer.ts`
- Create: `src/features/map-marker/hooks/use-kakao-capture-guide.ts`
- Create: `src/features/map-marker/hooks/use-kakao-overlay-arrange.ts`
- Modify: `src/features/map-marker/components/map/kakao-map-canvas.tsx:1-1622`

**Interfaces:**
```ts
export function useKakaoRouteLayer(params: { map: kakao.maps.Map | null; isSdkReady: boolean }): void;
export function useKakaoCctvLayer(params: { map: kakao.maps.Map | null; isSdkReady: boolean }): void;
```

**Steps:**
- [ ] 기존 순수 계산 테스트(`npx vitest run src/features/map-marker/lib/overlay-arrange.test.ts src/features/map-marker/lib/map-viewport-capture.test.ts`)가 **PASS**하는지 기준선을 확인한다.
- [ ] 경로탐색 레이어(1206-1375줄), CCTV 레이어(1376-1506줄), 캡처 가이드(152-294줄), 오버레이 배치(1103-1167줄)를 각각 독립 훅으로 추출한다(이 4개 훅은 `window.kakao.maps` SDK에 직접 결합돼 자동 단위 검증 수단이 없다).
- [ ] `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 전체 PASS 확인.
- [ ] **사용자 화면 수동 확인(필수)**: 개발 서버(`npm run dev`)에서 홈(`/`)을 열어 아래 4가지를 눈으로 확인한다:
  1. 대시보드/경로탐색에서 지도 클릭 픽업 마커·경로 폴리라인·순번 배지가 표시되고 메뉴 이탈 시 지워지는지.
  2. CCTV 패널에서 CCTV 마커가 지도에 표시되고 클릭 시 영상 모달이 열리는지.
  3. 지도 영역 캡처 패널에서 타일 클릭 제외 토글과 영역 재지정 시 초기화가 동작하는지.
  4. 다중 마커 선택 후 정보창 자동 배치(`arrangeSelectedOverlays`)가 겹치지 않고 정렬되는지.

---

### Task 4: (선택) `schedule-cell-dialog.tsx` 분할

**Files (선택 범위 포함 시):**
- Create: `src/features/schedule/lib/cell-dialog-helpers.ts`
- Create: `src/features/schedule/lib/cell-dialog-helpers.test.ts`
- Create: `src/features/schedule/hooks/use-schedule-cell-form.ts`
- Modify: `src/features/schedule/components/schedule-cell-dialog.tsx:89-611`

**Steps:**
- [ ] `cell-dialog-helpers.ts`로 `initialDrafts`(101줄), `initialCompanions`(120줄), `nextTextColor`(94줄)를 분리하고, `cell-dialog-helpers.test.ts`에 `nextTextColor(null) === "blue"` → `"red"` → `null` 순환 단언을 작성해 **PASS** 확인.
- [ ] `use-schedule-cell-form.ts`를 분리하고 `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 전체 PASS 확인.

---

### Task 5: 최종 빌드 및 번들 기준선 확인

**Steps:**
- [ ] `npx next build`(dev 서버 실행 중이면 `next.config.ts`에 임시 `distDir` 사용 후 원복)로 홈 First Load JS **295 kB 이하** 유지 여부를 확인한다.
- [ ] `git status`로 변경 파일 목록을 확인한다.
