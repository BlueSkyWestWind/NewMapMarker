# pitfalls

실제로 버그를 만들었거나, 지금도 깨져 있는 것들.

## 1. 스토어에 쓰는 훅은 한 번만 — `useActiveMarkers` vs `useMarkerList`

- `useActiveMarkers` — 목록 + **필터 옵션 동기화(부수효과)** + 건수.
  `useEffect` 2개가 인스턴스별 `useRef`(`previousModeRef`·`prevFilterOptionsRef`)를 근거로
  `setFilters`에 쓴다. 두 곳 이상에서 부르면 서로의 필터를 번갈아 덮어쓴다.
  **`components/map-marker-page.tsx` 단독 호출.** 셸·지도에는 props로 내린다.
- `useMarkerList` (`hooks/use-marker-list.ts`) — 목록 파생만. 스토어에 쓰지 않는다.
  목록만 필요한 곳(`marker-detail-modal`, `use-marker-edit-form`)은 이걸 쓴다.
  `useActiveMarkers`도 내부에서 이걸 쓰므로 계산은 한 벌(`selectActiveMarkers`).

2026-08-01 정리 완료(구조 점검 H-3). 이전에는 두 모달이 `useActiveMarkers`를 직접 불러
인스턴스 3개가 동시 동작했다. **새 호출을 추가할 때 어느 쪽이 필요한지 먼저 판단할 것.**

## 2. zustand `persist` 값은 하이드레이션을 깬다

`mode`·`activeNav`·`mapSegment`·`lastDomainMode`가 persist 대상.
persist는 클라이언트 첫 렌더 **전에** localStorage 값을 복원하는데 서버는 기본값으로 HTML을 만든다.

규칙: 마운트 전후 판정은 `map-marker-page.tsx` **한 곳**에서만 하고(`useHasMounted` +
`STORE_DEFAULT_MODE`/`STORE_DEFAULT_NAV`/`STORE_DEFAULT_SEGMENT`), 안전값을 props로 내린다.
`AppShell`·`NavRail`·`WorkPanel`은 스토어를 직접 읽지 않는다.

## 3. shadcn 버튼 변형이 밝게 렌더된다

다크 테마를 CSS 변수가 아니라 `slate-*` 클래스로 입혔다. `outline`/`secondary`/`ghost`는
`bg-background`/`accent`를 참조해 **흰 배경**으로 뜬다.
→ `variant`만 믿지 말고 `bg-slate-900/60 text-slate-200 hover:bg-slate-800`을 함께 적는다.

## 4. `vitest.config.ts`의 include가 `.ts`뿐

`.tsx` 테스트는 **조용히 실행되지 않는다**. 현재 `.tsx` 테스트 파일은 0개라 손실은 없다.

## 5. 절대배치 요소의 기준을 혼동하지 말 것

- 지도 컨테이너(`kakao-map-canvas.tsx`의 `relative`) 안에서 `absolute`로 뜨는 것(영역 캡처 패널)은
  **이미 지도 기준**이다. 좌측 셸 폭을 더하면 지도 안쪽으로 밀린다.
- 뷰포트 고정(`fixed`) 요소(CCTV 영상 모달)만 `LEFT_OFFSET_PX`를 더한다.

## 6. VWorld는 서버 프록시를 거부한다

Cloudflare 등 해외 egress를 502/520으로 막는다 → 브라우저에서 JSONP/직접 호출.
CORS 미지원이라 script 주입만 가능. 키는 `NEXT_PUBLIC_`이고 도메인 제한으로 보호한다.

## 7. `setMode`는 필터를 지운다

모드가 바뀌면 `filters`·선택 마커·`cctvMarkers`를 비운다. 이건 **세그먼트를 직접 눌렀을 때의 규칙**이다.
메뉴 이동은 `setActiveNav`를 쓴다 — `mode`만 바꾸고 초기화는 건너뛴다.
