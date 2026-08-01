@.agents/AGENTS.md

## Project Context

- 목적: **카카오맵(Kakao Map)** 을 이용해 지도에 마커를 만들고 관리하는 웹페이지.
  출처: https://github.com/BlueSkyWestWind/NewMapMarker
- 스택: **Next.js**(App Router, TS) + **React** + Tailwind + shadcn/ui,
  백엔드/DB는 **Supabase**, 배포는 Cloudflare(OpenNext/Wrangler). 엑셀 입출력 유틸 포함.
  → 적용 규칙: `react-frontend` · `typescript-conventions` · `react-project-architecture` · `comment-conventions`.
- 카카오맵: SDK 키 등 시크릿은 `.env*`(커밋 금지). 지도/마커 로직은 `src/features/map-marker/`.
- 대상 데이터/파일: 작업 시 그때그때 지정. 추측하지 말고 확인할 것.
- 백업: 사용자가 직접 관리. 되돌리기 어려운 작업만 실행 **전에** 알린다.
- UI 표: 셀 **줄바꿈 금지**. 가로는 박스·모달 폭을 키우고 **가로 스크롤 금지**. 세로 스크롤은 허용.
  → 규칙: `.cursor/rules/table-no-wrap.mdc`

## 코드베이스 메모 (반복된 실수)

- 검증: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`(vitest) · `npx next build`.
  홈 First Load JS **295 kB 이하 유지**가 기준선.
- **shadcn `outline`·`secondary`·`ghost` 변형은 밝게 렌더된다** — 다크 테마를 CSS 변수가 아니라
  `slate-*` 클래스로 입혔다. 버튼에 `bg-slate-900/60 text-slate-200`을 함께 적는다.
- **zustand `persist` 값(`mode`·`activeNav`·`mapSegment`)은 하이드레이션을 깬다.**
  마운트 전후 판정은 `map-marker-page.tsx` 한 곳에서만 하고 안전값을 props로 내린다.
- **ESLint가 미사용 import·변수를 잡지 않는다.** 이동·삭제 리팩터 뒤에는 직접 확인.
- 무거운 모듈(gpsmap lib·대시보드·Leaflet)은 `dynamic()`. 정적 import 하면 홈 번들이 150 kB 는다.
- `useActiveMarkers`는 스토어에 쓴다 — 트리에서 **한 번만** 호출하고 props로 내린다.
- 폭 상수는 `features/shell/constants.ts` 단일 소스. CSS 변수(`--rail-w`·`--panel-w`)로 흘려
  미디어 쿼리를 얹는다. 컴포넌트에 숫자를 적지 않는다.
- `vitest.config.ts`의 include가 `.ts`뿐 — **`.tsx` 테스트는 조용히 실행되지 않는다.**
- 문서는 버전 폴더에 모은다(`docs/Ver_X.Y/`). 구조 점검은 `docs/Ver_2.0/project_review.md`에 누적.
- **기존 화면을 옮길 때는 원본이 사양이다.** "개선"을 얹지 않는다 —
  변환기 이식에서 덧붙인 토글·링크·자동 마커 등록이 전부 재작업이 됐다.

## Config 관리

- 이 폴더의 `.agents/`, `.cursor/rules`, `.agent/rules`, `.cursor|.agent|.claude/skills/*`는
  모두 마스터 `../000.Agents`를 가리키는 **junction**이다. 사본이 아니다.
- 본문 편집은 마스터의 `.agents/`에서만. 업데이트는 마스터에서 `git pull` 한 번이면
  이 프로젝트에 즉시 반영된다(재복사 불필요).
- junction이 **실제 폴더로 바뀌어 있으면** 싱글 소스가 깨진 것이다.
  `.agents/scripts/setup-junctions.ps1`을 다시 실행하면 경고와 함께 알려준다.
