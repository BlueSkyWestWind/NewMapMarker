# 작업 명세서 — 대시보드 국소 선택 시 지도 마커 정보창 자동 표시

## 배경

대시보드(`DashboardPanel`)는 목록에서 아무것도 클릭하지 않아도 첫 번째 국소(`rows[0]`)를
"현재 선택"으로 화면에 보여준다(`selectedRow` 파생값, `WorksiteBoard`의 `selectedSiteId`로
하이라이트도 됨). 하지만 지도 위 마커 정보창(말풍선, `kakao-map-canvas.tsx`가
`useMapMarkerStore.selectedMarkerId`를 보고 렌더링)은 사용자가 목록 행을 실제로
클릭해 `handleSelect`를 거쳐야만 뜬다. 그 결과 대시보드에는 이미 선택된 것처럼 보이는데
지도 위 정보창은 클릭 전까지 뜨지 않는다. 사용자는 클릭 없이도 정보창이 떠 있길 원한다.

## 요구사항

`src/features/dashboard/components/dashboard-panel.tsx`를 수정한다.

- `selectedRow`(43~44번째 줄 근처, `rows.find(...) ?? rows[0] ?? null`로 파생된 값)가
  바뀔 때마다 `setSelectedMarkerId(selectedRow.site.id)`를 자동 호출하는 `useEffect`를 추가한다.
  `selectedRow`가 `null`이면 아무것도 하지 않는다(기존 `selectedMarkerId`를 지우지 않는다 —
  다른 화면에서 쓰던 값을 대시보드가 함부로 초기화하지 않기 위함).
- 의존성 배열은 `[selectedRow?.site.id, setSelectedMarkerId]`로 한다(객체 참조가 아니라
  id 문자열로 비교해 불필요한 재실행을 막는다).
- `handleSelect`(47~51번째 줄 근처, 사용자가 행을 직접 클릭할 때 호출)는 그대로 둔다 —
  이미 `setSelectedMarkerId`를 호출하고 있어 새 `useEffect`와 충돌하지 않는다(같은 값을
  다시 세팅할 뿐이라 안전).
- `useEffect`를 `import`에 추가해야 한다(`react`에서 가져온다).

## 제약

- 이 저장소의 `AGENTS.md`/`.agents/AGENTS.md` 규칙을 따를 것 (§0.3 최소 변경).
- **중요 — 이 컴포넌트 상단 주석에 적힌 과거 버그와 혼동하지 말 것**: "Ver 1.1에서
  `useEffect`로 선택을 덮어써 사용자가 고른 국소가 되돌아가던 문제"는 로컬 상태
  `selectedId` **자체**를 effect가 재계산해서 사용자가 고른 값을 지우던 문제였다.
  이번에 추가하는 `useEffect`는 `selectedId`를 전혀 건드리지 않는다 — 이미 올바르게
  파생된 `selectedRow`의 id를 외부 스토어(`useMapMarkerStore.selectedMarkerId`)에
  한 방향으로 반영만 한다. `selectedId`나 `selectedRow`의 파생 로직(43~44번째 줄)은
  수정하지 않는다.

## 참고할 기존 코드/패턴

- `selectedRow` 파생: `dashboard-panel.tsx` 43~44번째 줄 근처.
- `handleSelect`(참고용, 수정 안 함): 같은 파일 47~51번째 줄 근처.
- `setSelectedMarkerId`는 이미 이 컴포넌트에서 `useMapMarkerStore`로부터 구독 중이다
  (31번째 줄 근처 `const setSelectedMarkerId = useMapMarkerStore((state) => state.setSelectedMarkerId);`).
- 지도 쪽에서 `selectedMarkerId`를 소비하는 곳(수정 대상 아님, 참고만):
  `src/features/map-marker/components/map/kakao-map-canvas.tsx` 633~843번째 줄 근처
  ("선택 상태에 맞춰 정보창(CustomOverlay)을 동기화한다").

## 하지 말 것

- `kakao-map-canvas.tsx`(지도 쪽 정보창 렌더링 로직)는 건드리지 않는다.
- `selectedId`(로컬 상태) 자체의 파생·초기화 로직은 건드리지 않는다.
- `WorksiteBoard`/`WorksiteRow` 등 다른 컴포넌트는 건드리지 않는다.
- 축전지 국소(지도에 마커 자체가 없는 경우)에 대한 별도 예외 처리를 추가하지 않는다 —
  기존 `handleSelect`도 이 경우를 별도 처리하지 않고 그냥 `setSelectedMarkerId`를 호출한다
  (지도 쪽에서 해당 id의 마커를 못 찾으면 자연히 아무 정보창도 안 뜬다). 새 `useEffect`도
  같은 방식으로 두면 된다.

## 완료 기준

- [ ] 대시보드 진입 시(또는 저장된 국소가 로드된 직후) 목록 행을 클릭하지 않아도
      첫 번째 국소의 지도 마커 정보창이 떠 있다.
- [ ] 목록에서 다른 행을 클릭하면 여전히 그 국소로 정보창이 바뀐다(기존 동작 유지).
- [ ] 프로젝트 표준 검증 통과: `npx tsc --noEmit`, `npx eslint . --max-warnings=0`.
