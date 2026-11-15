# 대형 파일 분할 2차 구현계획

> **실행 방식:** 구현(코드 작성)은 agy가 하고, Claude가 diff를 검토해 틀린 곳을 고친다. 단계는 체크박스(`- [ ]`)로 추적한다.

**Goal:** `kakao-map-canvas`의 캡처 가이드 상태를 훅으로, `marker-detail-modal`의 번지 배치 구역을 컴포넌트와 순수 함수로, `schedule-cell-dialog`의 순수 헬퍼를 `lib`로 옮긴다.

**Architecture:** 한 대상씩 순서대로(A → B → C) 옮기고, 매 Task가 끝날 때마다 타입·린트·테스트를 통과시킨다. 순수 로직은 `.ts`로 빼서 `.test.ts`로 지키고, 훅·컴포넌트는 동작을 그대로 옮긴다.

**Tech Stack:** Next.js 15 · React 19 · TypeScript (`strict`) · Zustand · Vitest. 의존성 추가 없음.

**Spec:** [Ver_3.0_대형파일분할2차_설계.md](Ver_3.0_대형파일분할2차_설계.md)

## Global Constraints

- **커밋하지 않는다.** 사용자가 "커밋"을 요청할 때만 커밋한다.
- **문서(`docs/`, `AGENTS.md`, `README.md`)는 수정하지 않는다.** 코드와 테스트만 바꾼다.
- **동작 변경 없음.** 기존 화면의 원본이 사양이다. 개선을 덧붙이지 않는다.
- `vitest.config.ts`의 `include`는 `.ts`뿐이므로 테스트는 `.test.ts`로 쓴다. jsdom·Testing Library를 추가하지 않는다.
- 훅이 돌려주는 함수는 다른 `useEffect`의 의존성이 될 수 있으므로 `useCallback`으로 안정화한다.
- **검증 명령**: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`.
- 기존 줄바꿈(CRLF/LF)을 파일마다 유지한다. 새 파일은 같은 폴더 파일의 줄바꿈을 따른다. 한글이 깨지지 않았는지 확인한다.
- `kakao-map-canvas.tsx`의 effect 순서를 바꾸지 않는다(지도 초기화 effect가 먼저 실행돼야 한다).

## Review Focus

1. `resetCapture()`가 기존 세 곳(`onStartRegionCapture`·`onClose`·`onReselectRegion`)의 초기화 항목을 모두 포함하는지 (Task 1, Step 1 대조).
2. 타일 수가 바뀔 때 제외 선택을 비우는 규칙이 기존과 같은지 (Task 1, Step 2 테스트).
3. 모달의 동 그룹·분리 라벨 집계가 기존 결과와 같은지 (Task 2, Step 2 테스트의 특성화 입력).
4. 훅 반환 함수가 렌더마다 새로 만들어져 effect를 다시 돌리지 않는지 (Task 1·2, Step 4 diff 검토).

---

### Task 1: 캡처 가이드 훅 `use-kakao-capture-guide.ts`

**Files:**
- Create: `src/features/map-marker/hooks/use-kakao-capture-guide.ts`
- Create: `src/features/map-marker/lib/capture-guide-state.ts`, `src/features/map-marker/lib/capture-guide-state.test.ts`
- Modify: `src/features/map-marker/components/map/kakao-map-canvas.tsx` (상태·핸들러 정의부와 JSX의 `onStartRegionCapture`·`onClose`·`onReselectRegion`)

**Interfaces:**
```ts
// lib/capture-guide-state.ts
export function nextExcludedTiles(prevTileCount: number, nextTileCount: number, excluded: Set<number>): Set<number>;
// 격자 구성이 바뀌어 타일 수가 달라지면 빈 Set, 같으면 excluded 그대로

// hooks/use-kakao-capture-guide.ts
export function useKakaoCaptureGuide(): {
  isRegionSelectMode: boolean; isCapturePanelOpen: boolean;
  captureBounds: MapBoundsLiteral | null; captureGuide: CaptureGuideState; excludedTiles: Set<number>;
  handleCaptureGuideChange: (guide: CaptureGuideState) => void;
  handleToggleExcludedTile: (index: number) => void;
  setCaptureBounds: (bounds: MapBoundsLiteral | null) => void;
  startRegionSelect: () => void; cancelRegionSelect: () => void;
  completeRegion: (bounds: MapBoundsLiteral) => void;
  resetCapture: () => void; reselectRegion: () => void; editRegion: () => void;
};
```
(타입 `MapBoundsLiteral`·`CaptureGuideState`는 현재 `kakao-map-canvas.tsx`가 쓰는 것을 그대로 쓴다. `startRegionSelect`가 JSX의 `onStartRegionCapture` 블록, `completeRegion`이 `MapRegionSelectOverlay.onComplete`의 성공 경로, `reselectRegion`이 `onReselectRegion`, `editRegion`이 `onEditRegion={() => setIsRegionSelectMode(true)}`에 대응한다. 정확한 이름·대응은 코드를 읽고 맞춘다.)

**Steps:**
- [ ] `kakao-map-canvas.tsx`의 캡처 관련 상태(`isRegionSelectMode`, `isCapturePanelOpen`, `captureBounds`, `captureGuide`, `excludedTiles`), `prevTileCountRef`, 핸들러 2개, JSX 세 곳의 초기화 블록을 읽고, 세 블록의 항목이 같은지 표로 대조한다. 다르면 다른 항목을 지시서 보고에 적고 기존 동작을 그대로 보존한다.
- [ ] 실패하는 테스트를 먼저 쓴다 `capture-guide-state.test.ts`: `nextExcludedTiles(4, 4, new Set([1,2]))`는 `{1,2}`를 돌려준다. `nextExcludedTiles(4, 6, new Set([1,2]))`는 빈 Set이다. 이전이 0이고 다음이 4처럼 개수가 달라지면 빈 Set이고, 0에서 0으로 같으면 받은 Set을 그대로 돌려준다(기존 `handleCaptureGuideChange`는 `count !== prevTileCountRef.current`일 때만 비운다). 실행: `npx vitest run src/features/map-marker/lib/capture-guide-state.test.ts` → 모듈 없음으로 FAIL.
- [ ] `capture-guide-state.ts`와 `use-kakao-capture-guide.ts`를 구현한다. 훅의 반환 함수는 `useCallback`으로 감싼다.
- [ ] `kakao-map-canvas.tsx`가 훅을 쓰도록 바꾸고, JSX 세 곳의 중복 초기화를 `startRegionSelect`·`resetCapture`·`reselectRegion` 호출로 바꾼다. 훅 호출 위치는 기존 상태 정의가 있던 자리다.
- [ ] 실행: `npx vitest run src/features/map-marker/lib/capture-guide-state.test.ts` → PASS, `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

---

### Task 2: 번지 배치 구역 컴포넌트와 집계 함수

**Files:**
- Create: `src/features/map-marker/lib/marker-group-view.ts`, `src/features/map-marker/lib/marker-group-view.test.ts`
- Create: `src/features/map-marker/components/modals/marker-detail-sub-placement.tsx`
- Modify: `src/features/map-marker/components/modals/marker-detail-modal.tsx`

**Interfaces:**
```ts
// lib/marker-group-view.ts
export interface DongGroup { label: string; subs: EquipmentMarker[]; isDongShown: boolean; mapRepId: string | null }
export function buildDongGroups(related: EquipmentMarker[]): DongGroup[];
export function buildSeparationLabelCounts(related: EquipmentMarker[]): Array<[string, number]>;
export function canSplitGroup(related: EquipmentMarker[]): boolean; // 분리 그룹이 아니고 라벨이 2종 이상

// components/modals/marker-detail-sub-placement.tsx
export function MarkerDetailSubPlacement(props: {
  actions: ReturnType<typeof useMarkerGroupActions>;
  equipmentMarker: EquipmentMarker;
  relatedEquipmentMarkers: EquipmentMarker[];
  openSubList: boolean; onToggleSubList: () => void;
}): JSX.Element | null;
```
(`dongGroups`·`separationLabelCounts`·`relatedIsSplit`·`canSplit`·`subCount`·`detachedSubCount`는 컴포넌트 안에서 위 함수로 계산하거나, 모달에서 계산해 prop으로 넘긴다. 모달에도 쓰이는 값은 모달에서 한 번만 계산한다. 구현이 코드를 읽고 한 가지로 정한다.)

**Steps:**
- [ ] 모달의 기존 계산(`dongGroups` useMemo, `separationLabelCounts` IIFE, `relatedIsSplit`, `canSplit`)을 읽고, 입력과 기대값을 모은 특성화 테스트를 `marker-group-view.test.ts`에 쓴다. 입력은 `parentMarkerId`·`groupKey`·`detachedVisible`·동 라벨(`getMarkerDongLabel`이 돌려주는 값)이 다른 마커 3~4개. 단언: 동별 묶음 수와 순서(`dongSortKey` 정렬), `isDongShown`(SUB 중 `detachedVisible`이 하나라도 있음), 라벨별 개수, 분리 그룹이면 `canSplitGroup`이 false. 실행 → 모듈 없음으로 FAIL.
- [ ] `marker-group-view.ts`를 구현하고(기존 계산 본문을 그대로 옮긴다) 테스트가 통과하는지 확인한다.
- [ ] `marker-detail-sub-placement.tsx`를 만들고 모달의 번지 배치 JSX를 옮긴다. 마크업·클래스명·문구를 바꾸지 않는다.
- [ ] 모달이 `<MarkerDetailSubPlacement ... />`를 쓰도록 바꾸고, 쓰지 않게 된 import·상태를 지운다.
- [ ] 실행: `npx vitest run src/features/map-marker/lib/marker-group-view.test.ts` → PASS, `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

---

### Task 3: 일정 셀 대화상자 순수 헬퍼 (설계 §6 항목 2에서 포함을 정한 경우만)

**Files:**
- Create: `src/features/schedule/lib/cell-dialog-helpers.ts`, `src/features/schedule/lib/cell-dialog-helpers.test.ts`
- Modify: `src/features/schedule/components/schedule-cell-dialog.tsx` (89~136줄 부근의 헬퍼 4개)

**Interfaces:** 기존 시그니처를 그대로 `export`한다: `columnLabel(column)`, `nextTextColor(color)`, `initialDrafts(cells, state)`, `initialCompanions(cells, position)`.

**Steps:**
- [ ] 분리 전 코드에서 `nextTextColor`가 돌려주는 순환 순서와 `columnLabel`의 규칙을 읽고, 그 값으로 테스트를 `cell-dialog-helpers.test.ts`에 쓴다(순환은 한 바퀴 돌아 처음으로 돌아오는지까지). 실행 → 모듈 없음으로 FAIL.
- [ ] 헬퍼 4개를 옮기고(본문 그대로) `schedule-cell-dialog.tsx`가 import하도록 바꾼다.
- [ ] 실행: 새 테스트 PASS, `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

---

### Task 4: 검증과 화면 확인 정리 (Claude가 한다)

**Steps:**
- [ ] agy diff를 전부 읽고 줄바꿈 변경·불필요한 파일 수정·effect 의존성·미사용 import를 확인해 고친다.
- [ ] `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test`를 직접 돌리고, 임시 `distDir` 빌드로 홈 First Load JS를 측정해 직전(301 kB) 대비 변화를 기록한다.
- [ ] 구현 문서의 "직접 하실 일"에 화면 확인 목록을 적는다: 지도 영역 캡처(영역 선택 → 가이드 → 타일 제외 → 닫기 → 다시 선택), 마커 상세의 번지 배치 구역(펼치기, 동 개별 표시, 분리, 합치기), (Task 3 포함 시) 일정 셀 대화상자 열기·저장.
