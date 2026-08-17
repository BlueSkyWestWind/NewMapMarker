# 작업 명세서 — 대시보드 "지도로 이동" 버튼이 위치 메뉴로 이동하게 수정

## 배경

대시보드(`대시보드` 탭)에 저장된 작업 국소가 없을 때 나오는 빈 상태 안내에
"지도로 이동" 버튼이 있다. 현재는 지도 탭으로만 이동하고, 지도 탭 안의 세그먼트(장비/축전지/위치/변환기)는
마지막으로 보던 것(`lastDomainMode`, 기본값 "장비")으로 열린다. 사용자가 원하는 건
이 버튼을 누르면 지도 탭의 **위치** 메뉴(세그먼트)로 바로 이동하는 것이다.

## 요구사항

`src/features/dashboard/components/dashboard-panel.tsx`의 "지도로 이동" 버튼(현재 108번째 줄 근처,
`onClick={() => setActiveNav("map")}`)을 수정한다.

- 버튼 클릭 시 `setActiveNav("map")` 호출에 더해 `useMapMarkerStore`의 `setMapSegment("location")`도
  호출해서, 지도 탭으로 이동한 뒤 위치 세그먼트가 선택된 상태로 열리게 한다.
- 호출 순서: `setActiveNav("map")`을 먼저 호출하고, 그다음 `setMapSegment("location")`을 호출한다.
  (`setActiveNav`가 `mapSegment`를 `lastDomainMode` 기준으로 다시 계산해서 덮어쓰기 때문에,
  `setMapSegment`를 나중에 호출해야 최종적으로 "위치"가 유지된다.)
- `useMapMarkerStore`에서 이미 구독 중인 `setActiveNav`(파일 상단, 30번째 줄 근처)처럼
  `setMapSegment` 셀렉터도 추가로 구독해서 쓴다.

## 제약

- 이 저장소의 `AGENTS.md`/`.agents/AGENTS.md` 규칙을 따를 것 (§0.3 최소 변경 — 이 버튼과
  관련 없는 코드는 건드리지 않는다).
- `MapSegment`("location") 타입은 `src/features/shell/types/segment.ts`에 이미 정의되어 있다.
  새 타입/상수를 추가하지 않는다.

## 참고할 기존 코드/패턴

- `useMapMarkerStore.setMapSegment`: `src/features/map-marker/store/use-map-marker-store.ts` 182번째 줄 근처.
- `useMapMarkerStore.setActiveNav`: 같은 파일 207번째 줄 근처 — `nav === "map"`일 때
  `mapSegment`를 `state.mapSegment === "converter"`가 아니면 `segmentOfMode(nextMode)`로
  재계산하는 로직이 있다. 이 로직 자체는 수정하지 않는다 — 버튼 쪽에서 이동 후 세그먼트를
  한 번 더 지정하는 방식으로 해결한다.
- 다른 화면에서 세그먼트를 지정해 지도로 이동하는 유사 패턴이 있는지 참고해도 되지만
  (`grep -rn "setMapSegment" src`), 없으면 위 방식으로 새로 작성한다.

## 하지 말 것

- 대시보드의 다른 버튼(위성/레이더, 태풍 정보 등)이나 `rows.length > 0`일 때의 레이아웃은 건드리지 않는다.
- `setActiveNav`/`setMapSegment`의 스토어 로직(`use-map-marker-store.ts`)은 수정하지 않는다.
- 새로운 컴포넌트·훅·상수 파일을 만들지 않는다. `dashboard-panel.tsx` 한 곳만 수정한다.

## 완료 기준

- [ ] 대시보드에서 저장된 작업 국소가 없는 상태로 "지도로 이동" 버튼을 누르면 지도 탭이
      "위치" 세그먼트로 열린다(장비/축전지/변환기가 아니라 위치).
- [ ] 프로젝트 표준 검증 통과: `npx tsc --noEmit`, `npx eslint . --max-warnings=0`.
