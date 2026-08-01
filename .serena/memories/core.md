# core

카카오맵 기반 마커 관리 웹앱 (Next.js App Router). 단일 라우트 워크스페이스 + `/gpsmap`.

## 권위 있는 문서 (읽기 우선순위)

- `AGENTS.md` (루트, git 추적) — Claude/Cursor가 자동 로드. `@.agents/AGENTS.md` junction 참조 +
  Project Context + 「스택 규칙」 + 「코드베이스 메모(반복된 실수)」.
- `docs/Ver_2.0/` — 현행 설계. `Ver_2.0_implementation_plan.md`가 요구·결정의 단일 소스,
  `Ver_2.0_IA.md`(구조·상태·권한), `Ver_2.0_COMPONENT.md`, `Ver_2.0_DESIGN.md`.
- `docs/Ver_2.0/project_review.md` — 구조 점검 이력. 새 점검은 이 파일 상단에 누적.
- `docs/walkthrough.md` — 완료 작업 기록. 첫 `---` 위에 새 섹션 삽입.

## 소스 맵

```
src/app/            page.tsx · gpsmap/page.tsx · api/{its-key,kakao-static-map,map-tile-proxy,roadview-dates,worksite-weather}
src/features/
  shell/            AppShell·NavRail·WorkPanel·TopSearchBar + 메뉴별 panels/ + constants.ts + types/{nav,segment}
  map-marker/       지도·마커 본체. store/use-map-marker-store.ts(Zustand+persist)가 UI 상태 단일 소스
  dashboard/        작업대상 목록 + 국소별 기상 판정
  worksite-weather/ 기상 판정 도메인. lib/ 12모듈 전부 순수함수(테스트 밀집), types/weather.ts가 표기 상수 단일 소스
  cctv/  gpsmap/
src/lib/api/proxy-guard.ts   프록시 라우트 공통 가드(origin 허용목록 + IP 레이트리밋)
```

## 프로젝트 전역 불변식

- 화면 전환 축은 **메뉴**(`activeNav`, 7종) → 패널 안 **세그먼트**(`mapSegment`, 4종) 순.
  `MapMode`는 데이터 도메인이며 제거하지 않는다(스토어·필터·오버레이·백업이 전부 묶여 있음).
- 대시보드는 `mode: 'weather'`를 쓴다. 지도에는 **작업등록한 장비 국소만** 표시(축전지 국소 제외).
- 판정 표기(`VERDICT_*`·`OVERALL_TONE`)는 `worksite-weather/types/weather.ts`에서만 정의. 재정의 금지.
- 폭 상수는 `features/shell/constants.ts` 단일 소스 → CSS 변수(`--rail-w`·`--panel-w`)로 전파.

## 하위 메모리

- 함정과 실제로 깨져 있는 불변식(훅 다중 호출·하이드레이션·다크 테마 버튼): `mem:pitfalls`
- 스택·버전·라이브러리 선택: `mem:tech_stack`
- 실행할 명령(Windows 셸 차이 포함): `mem:suggested_commands`
- 코드 스타일·명명·디렉터리 규칙: `mem:conventions`
- 작업 완료 시 반드시 돌릴 검증: `mem:task_completion`
