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

## 코드 작업 방식 (오케스트레이션 기본 적용)

- **코드 변경이 필요한 요청은 트리거 문구 없이도 기본적으로 `orchestration` 스킬을 거친다.**
  클로드가 확인(요구사항 파악·명세서 작성) → **Orca CLI**로 안티그래비티(`--agent antigravity`)에
  코딩 요청(사용자에게 안 묻고) → 안티그래비티가 작성+자체검토 → 클로드가 최종 확인, 순서로 진행한다.
- 핸드오프는 반드시 Orca의 `orchestration` 명령(`run-create`/`task-create`/`worker-start`/
  `check --wait`)을 거친다. `antigravity-ide` CLI를 직접 shell-out 하지 않는다 — Orca 밖에서
  별도 창이 뜨고 대시보드에 안 잡힌다.
  **`--agent gemini`를 쓰지 않는다** — 이름이 비슷하지만 구글 Gemini CLI라는 별개 도구다.
  `--agent antigravity`는 Antigravity IDE에 이미 로그인된 계정을 자동으로 재사용하므로
  별도 로그인 절차가 필요 없다.
- 오타·설정값 하나 고치는 것 같은 사소한 수정도 예외 없이 이 흐름을 탄다.
- 스킬 상세: `.claude/skills/orchestration/SKILL.md`(마스터 `000.Agents` 저장소의
  `.agents/skills/orchestration/`가 원본, 이 폴더 것은 junction).
- 이 절차 안에서도 `AGENTS.md` §0.2 예외 표(데이터 규칙·파괴적 작업·문서 버전·대외 산출물)와
  §7 가드레일은 그대로 적용 — 해당하면 스킬보다 우선해 사용자에게 확인한다.

## 스택 규칙

`.ruler/`에서 승계했다(2026-08-01 ruler 제거). 일반론은 버리고 이 프로젝트 고유 규칙만 남겼다.

- 컴포넌트는 `"use client"`. `page.tsx`의 `params`는 **Promise**로 받는다.
- 라이브러리: `ts-pattern`(분기) · `@tanstack/react-query`(서버 상태) · `zustand`(전역 상태) ·
  `date-fns` · `es-toolkit` · `zod` · `react-hook-form` · `lucide-react` · `shadcn/ui` · `tailwindcss`.
- 디렉터리: `src/features/{feature}/{components,hooks,lib,constants,types}` · `src/components/ui`(shadcn) ·
  `src/lib` · `src/hooks`.
  features: `map-marker`(지도/마커) · `worksite-weather`(작업 안전 날씨) · `dashboard`(당일 국소 요약) ·
  `gpsmap`(주소/좌표 변환기) · `cctv`(도로 CCTV) · `shell`(레이아웃/네비).
- **shadcn 컴포넌트 추가는 설치 명령만 알려 준다.** 실행은 사용자가 한다 — `npx shadcn@latest add <name>`.
- **Supabase는 로컬 실행 금지.** 테이블 변경은 `supabase/migrations/*.sql`로 만들어 두면 사용자가 적용한다.
- 패키지 매니저는 **npm**.
- 생성 후 UTF-8 기준으로 한글이 깨졌는지 확인한다.

## 코드베이스 메모 (반복된 실수)

- 검증: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`(vitest) · `npx next build`.
  홈 First Load JS **295 kB 이하 유지**가 기준선.
- 개발 서버: `npm run dev`(Turbopack) · E2E: `npm run test:e2e`(Playwright, dev 서버 재사용) ·
  배포 상세는 `README.md`(`## Cloudflare Workers 배포`) 참고.
  이전 백그라운드 dev 서버가 3000을 물고 있으면 새로 띄운 서버가 조용히 3001로 넘어간다 —
  dev 로그의 "using available port"를 확인하고 접속한다.
- **`slate`·상태색(`amber`·`sky`·`rose`·`emerald` 등) 100~950은 CSS 변수다(Ver 2.1)** —
  `tailwind.config.ts`가 `hsl(var(--slate-900) / <alpha-value>)`로 재정의하고 `globals.css`의
  `:root`/`.dark`가 라이트/다크 두 세트를 준다. 기존에 쓰던 `bg-slate-900`·`text-sky-200`이
  전부 자동으로 테마에 반응한다 — 컴포넌트에 라이트/다크 분기를 직접 넣지 않는다.
  예외: `.overlay-*`(카카오맵 말풍선, `globals.css`)는 위성 이미지 위에 얹혀 항상 다크 고정.
- **`ThemeProvider`(`src/app/providers.tsx`)는 `defaultTheme="dark"` 고정, `enableSystem` 없음.**
  라이트/다크 토글은 `설정` 메뉴(`settings-panel.tsx`)의 `useTheme()`.
- **`Input`/`Textarea`의 `text-slate-100` 하드코딩은 의도적이라 그대로 둔다** — 모든 호출부가
  배경을 `bg-slate-900` 등으로 하드코딩해서, `text-foreground`로 바꾸면 라이트 모드에서
  대비가 깨진다(직접 확인함).
- **zustand `persist` 값(`mode`·`activeNav`·`mapSegment`)은 하이드레이션을 깬다.**
  마운트 전후 판정은 `map-marker-page.tsx` 한 곳에서만 하고 안전값을 props로 내린다.
- **ESLint가 미사용 import·변수를 잡지 않는다.** 이동·삭제 리팩터 뒤에는 직접 확인.
- 무거운 모듈(gpsmap lib·대시보드·Leaflet)은 `dynamic()`. 정적 import 하면 홈 번들이 150 kB 는다.
- `useActiveMarkers`는 스토어에 쓴다(필터 동기화) — **`map-marker-page` 한 곳에서만** 호출한다.
  목록만 필요하면 부수효과 없는 **`useMarkerList`** 를 쓴다.
- 폭 상수는 `features/shell/constants.ts` 단일 소스. CSS 변수(`--rail-w`·`--panel-w`)로 흘려
  미디어 쿼리를 얹는다. 컴포넌트에 숫자를 적지 않는다.
- `vitest.config.ts`의 include가 `.ts`뿐 — **`.tsx` 테스트는 조용히 실행되지 않는다.**
- 문서는 버전 폴더에 모은다(`docs/Ver_X.Y/`). 구조 점검은 `docs/Ver_2.0/project_review.md`에 누적.
- **기존 화면을 옮길 때는 원본이 사양이다.** "개선"을 얹지 않는다 —
  변환기 이식에서 덧붙인 토글·링크·자동 마커 등록이 전부 재작업이 됐다.
- **"기능이 안 보인다"≠"없다".** `dashboard-panel.tsx`의 빈 상태(`rows.length === 0`)
  early return처럼, 조건부 분기가 기존 요소를 빠뜨렸을 수 있다. 새로 만들기 전에
  해당 컴포넌트의 모든 return 경로부터 확인한다.
- 위성/레이더·태풍정보 버튼은 `dashboard-panel.tsx`·`worksite-weather-panel.tsx`에
  공유 컴포넌트 없이 각각 하드코딩(라벨도 다름). 한쪽만 고치면 다른 쪽은 안 바뀐다.

## Config 관리

- 이 폴더의 `.agents/`, `.cursor/rules`, `.agent/rules`, `.cursor|.agent|.claude/skills/*`는
  모두 마스터 `../000.Agents`를 가리키는 **junction**이다. 사본이 아니다.
- 본문 편집은 마스터의 `.agents/`에서만. 업데이트는 마스터에서 `git pull` 한 번이면
  이 프로젝트에 즉시 반영된다(재복사 불필요).
- junction이 **실제 폴더로 바뀌어 있으면** 싱글 소스가 깨진 것이다.
  `.agents/scripts/setup-junctions.ps1`을 다시 실행하면 경고와 함께 알려준다.
