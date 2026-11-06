# 작업 명세서 — 모바일(터치 기기)에서 핀치 줌(두 손가락 확대/축소) 복원

## 배경
`src/features/map-marker/components/map/kakao-map-canvas.tsx`의 지도 초기화 `useEffect`에서
데스크톱 마우스 휠 줌을 "한 번에 여러 레벨 건너뛰지 않고 1단계씩" 세밀하게 만들기 위해
`map.setZoomable(false)`로 카카오맵 기본 줌(휠 줌 + 터치 핀치줌 포함)을 통째로 꺼두고,
`wheel` 이벤트만 직접 구현한 커스텀 핸들러(`handleWheelZoom`)로 대체했다. 이 때문에
스마트폰/태블릿에서 두 손가락으로 지도를 확대·축소하는 핀치줌 자체가 동작하지 않는다.

사용자가 선택한 해결 방식: **터치 기기에서만 카카오맵 기본(네이티브) 줌을 다시 켠다.**
데스크톱 커스텀 휠 줌 로직은 그대로 둔다. (대안이었던 "휠 핸들러와 동일한 방식으로 터치
핀치를 직접 구현"은 채택하지 않음.) 마우스와 터치를 동시에 지원하는 하이브리드 기기(터치
지원 노트북 등)에서는 휠 줌이 다시 거칠게(한 번에 여러 레벨) 동작할 수 있는데, 이는 사용자가
이미 인지하고 승인한 트레이드오프이므로 별도 처리하지 않는다.

## 요구사항
- 파일: `src/features/map-marker/components/map/kakao-map-canvas.tsx`
- 지도 초기화 `useEffect` 안, `map.setZoomable(false)` 호출(약 247번째 줄) 위치를 다음과 같이
  바꾼다:
  - `window.matchMedia("(pointer: coarse)").matches` 로 터치 주 입력 기기인지 판별한다.
    (SSR/구형 브라우저 대비: `window.matchMedia`가 없으면 안전하게 `false`로 취급 —
    즉 기존 데스크톱 동작 유지.)
  - 터치 주 입력 기기면 `map.setZoomable(true)`를 호출해 카카오맵 네이티브 줌(휠+핀치)을
    그대로 사용한다.
  - 그 외(데스크톱/마우스)에는 기존대로 `map.setZoomable(false)`를 호출하고, 바로 아래 있는
    기존 `handleWheelZoom` 커스텀 휠 로직은 그대로 둔다(수정 없음).
- 이 판별 로직 외에 `handleWheelZoom`, 드래그·마커·오버레이 등 다른 동작은 건드리지 않는다.

## 제약
- 이 저장소의 `AGENTS.md`/`CLAUDE.md` 규칙을 따를 것.
- `"use client"` 컴포넌트이므로 `window` 접근은 기존 코드처럼 이펙트 내부(클라이언트 실행
  시점)에서만 한다 — 이미 그 위치가 이펙트 안이라 추가 가드는 필요 없다.

## 참고할 기존 코드/패턴
- `src/features/map-marker/components/map/kakao-map-canvas.tsx:230~276` — 지도 초기화 및
  `handleWheelZoom` 구현부.

## 하지 말 것
- 터치 이벤트(`touchstart`/`touchmove`/`touchend`) 커스텀 핸들러를 새로 만들지 않는다
  (대안으로 검토했으나 채택되지 않음).
- 데스크톱 휠 줌 동작(1단계씩 세밀 조절)을 변경하지 않는다.
- 관련 없는 다른 지도 옵션(드래그·클릭 등)을 건드리지 않는다.

## 완료 기준
- [ ] `window.matchMedia("(pointer: coarse)").matches`가 true인 환경에서 `map.setZoomable(true)`가
      호출된다.
- [ ] 그 외 환경에서는 기존과 동일하게 `map.setZoomable(false)`가 호출되고 커스텀 휠 줌이 그대로
      동작한다.
- [ ] 프로젝트 표준 검증(`npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test`) 통과.
