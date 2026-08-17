# 작업 명세서 — 대시보드 "오늘의 작업 국소" 마커창 일괄 켜기/끄기 버튼

## 배경

대시보드의 "오늘의 작업 국소" 목록에서 국소 하나를 클릭하면 지도 위 그 마커의 정보창(말풍선)이
뜬다(기존 기능, `dashboard-panel.tsx`의 `handleSelect`/`selectedMarkerId` 자동표시 `useEffect`).
사용자는 목록에 있는 국소 전체의 마커창을 한 번에 켜고/끌 수 있는 버튼을 원한다.

지도 쪽 정보창 렌더링(`kakao-map-canvas.tsx`)은 이미 `useMapMarkerStore.selectedMarkerIds`
(복수 배열)를 구독해서, 배열에 담긴 id 수만큼 정보창을 동시에 띄우도록 되어 있다(수정 불필요,
그대로 활용).

## 요구사항

### 1. `src/features/dashboard/components/dashboard-panel.tsx`

- `useMapMarkerStore`에서 `selectedMarkerIds`, `setSelectedMarkerIds`, `clearSelectedMarkers`를
  추가로 구독한다(이미 구독 중인 `setSelectedMarkerId`는 그대로 둔다 — 행 클릭 단일 선택과
  자동표시 `useEffect`에 계속 쓰인다).
- `rows`로부터 `allSiteIds = rows.map((row) => row.site.id)`를 만든다.
- `isAllOverlaysOpen = allSiteIds.length > 0 && allSiteIds.every((id) => selectedMarkerIds.includes(id))`
  로 현재 전체가 켜져 있는지 판정한다.
- 토글 핸들러를 만든다:
  ```ts
  const handleToggleAllOverlays = () => {
    if (isAllOverlaysOpen) {
      clearSelectedMarkers();
    } else {
      setSelectedMarkerIds(allSiteIds);
    }
  };
  ```
- `rows.length > 0`일 때 렌더되는 `<WorksiteBoard ... />`(122~129번째 줄 근처)에
  `isAllOverlaysOpen={isAllOverlaysOpen}`와 `onToggleAllOverlays={handleToggleAllOverlays}`
  prop을 추가로 넘긴다.

### 2. `src/features/dashboard/components/worksite-board.tsx`

- `WorksiteBoardProps`에 `isAllOverlaysOpen: boolean`과 `onToggleAllOverlays: () => void`를
  추가한다.
- 헤더(28~42번째 줄 근처)의 기존 "전체 삭제" `Button` **왼쪽**에 새 토글 버튼을 추가한다.
  - `lucide-react`의 `Eye`(켜짐)/`EyeOff`(꺼짐) 아이콘을 상태에 따라 바꿔 쓴다.
  - 라벨: 꺼져 있으면 "마커창 전체 표시", 켜져 있으면 "마커창 전체 숨김".
  - `onClick={onToggleAllOverlays}`.
  - 스타일은 기존 "전체 삭제" 버튼(`variant="ghost" size="sm"` 계열)과 톤을 맞추되, 켜진 상태일
    때 시각적으로 활성 표시가 되게 한다(예: 켜지면 `text-sky-300`, 꺼지면 `text-slate-400`
    — 프로젝트의 `map-floating-controls.tsx`에 있는 `isMarkersVisible` 토글 버튼의 활성/비활성
    색 구분 패턴을 참고해도 된다).
  - `rows.length === 0`일 때는 애초에 `WorksiteBoard` 자체가 렌더되지 않으므로 버튼 노출 조건을
    따로 만들 필요는 없다.

## 제약

- 이 저장소의 `AGENTS.md`/`.agents/AGENTS.md` 규칙을 따를 것 (§0.3 최소 변경).
- **중요 — 작업 트리 초기화 금지**: 이 저장소의 두 파일(`dashboard-panel.tsx`,
  `worksite-timeline` 관련 파일 등)에는 이미 다른 승인된 변경이 커밋되지 않은 채 작업 트리에
  남아 있다. `git checkout`, `git reset`, `git stash` 등으로 작업 트리를 초기화하지 말고,
  기존 미커밋 변경은 그대로 둔 채 이 명세서에 적힌 변경만 추가한다.
- `kakao-map-canvas.tsx` 등 지도 쪽 정보창 렌더링 로직은 수정하지 않는다 — 이미
  `selectedMarkerIds` 배열 전체를 반영해 여러 정보창을 동시에 그리도록 되어 있다.

## 참고할 기존 코드/패턴

- `dashboard-panel.tsx`의 기존 `selectedRow`/자동표시 `useEffect`(참고용, 수정 안 함).
- `src/features/map-marker/components/map/map-floating-controls.tsx`의 `isMarkersVisible`/
  `toggleMarkersVisible` 토글 버튼 — 아이콘·색 전환 패턴 참고.
- `src/features/map-marker/store/use-map-marker-store.ts`의 `setSelectedMarkerIds`,
  `clearSelectedMarkers` (이미 존재하는 액션, 새로 만들 필요 없음).

## 하지 말 것

- 새 zustand 액션을 추가하지 않는다 — `setSelectedMarkerIds`/`clearSelectedMarkers`가 이미 있다.
- `WorksiteRow`, 개별 행 클릭 동작(`handleSelect`)은 건드리지 않는다.
- 축전지 국소(지도에 마커가 없는 국소)에 대한 별도 예외 처리를 추가하지 않는다 — 기존 단일
  선택과 마찬가지로, 지도 쪽에서 해당 id의 마커를 못 찾으면 자연히 정보창이 안 뜬다.

## 완료 기준

- [ ] 대시보드에 국소가 2개 이상 저장돼 있을 때, 새 버튼을 누르면 목록에 있는 모든 국소의
      지도 마커 정보창이 한 번에 뜬다.
- [ ] 다시 누르면 전부 닫힌다.
- [ ] 개별 행 클릭 선택은 기존처럼 그대로 동작한다.
- [ ] 프로젝트 표준 검증 통과: `npx tsc --noEmit`, `npx eslint . --max-warnings=0`.
