# Ver 2.3 구조 정비 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ver 2.2 이후 점검(3차)에서 확인한 취약점·죽은 코드·느슨한 타입·문서 드리프트를 정리해, **기능 변경 없이** 더 작고 안전하며 검증 가능한 코드베이스(Ver 2.3)로 만든다.

**Architecture:** 위험이 낮은 것부터 한 겹씩 벗긴다 — ① 삭제(죽은 코드·미사용 의존성·취약 버전) → ② 안전망(엑셀 데이터 매니저 특성화 테스트) → ③ 엄격 타입 전환(영역별로 0건을 만든 뒤 전역 적용) → ④ 순수 로직 분리 → ⑤ 설정·문서 정리. 각 단계는 동작을 바꾸지 않으며, 단계마다 기준선 검증을 통과해야 다음으로 간다.

**Tech Stack:** Next.js 15.5 · React 19 · TypeScript · Vitest(`.ts`만 실행) · ESLint 9 · Supabase · Cloudflare(OpenNext) · npm.

**Spec:** `docs/Ver_2.0/project_review.md` 의 **[2026-10-21] 3차 구조 점검** (항목 H3-1 · M3-1~3 · L3-1~2 · 3.1 삭제 · 3.2 합칠 것).

## Global Constraints

- **기능·화면 동작을 바꾸지 않는다.** 모든 변경은 삭제·이동·타입 수정이다. 타입 오류를 `?? ''`·`!`·`as` 로 덮어 런타임 의미를 바꾸지 않는다(필요하면 해당 지점에 테스트를 먼저 둔다).
- 패키지 매니저 **npm**. 의존성은 **제거와 패치 상향만** 한다. 새 의존성 추가 금지(jsdom·testing-library 포함). major 상향 금지(`tailwindcss 4`, `eslint-config-next` 다운그레이드 제안 제외). `npm audit fix --force` 금지.
- **Supabase 로컬 실행 금지.** SQL 변경이 필요하면 `supabase/migrations/*.sql`만 만든다(이 계획은 SQL을 만들지 않는다).
- shadcn 컴포넌트 추가는 설치 명령만 안내하고 실행하지 않는다(`npx shadcn@latest add <name>`).
- `.tsx` 테스트는 vitest가 실행하지 않는다(`vitest.config.ts` include가 `.ts`뿐) → **테스트는 `.ts` 파일로만 쓴다.**
- 기준선(2026-10-21): `npm test` **354건 / 31파일** · `npx tsc --noEmit` 0 · `npx eslint . --max-warnings=0` 0 · 홈 First Load JS **294 kB**(상한 **295 kB**) · `/gpsmap` **363 kB**(증가 금지).
- 매 태스크 끝 검증: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`. 번들·라우트에 영향이 있는 태스크는 `npx next build` 추가.
- 로그인 벽(Ver 2.2)을 약화시키지 않는다: 보호 라우트 6개의 `await guardProxyRequest(request)`, `AuthGate`, `ITS_API_KEY` 서버 전용 읽기를 유지한다.
- 생성·수정한 한글 파일은 UTF-8 기준으로 깨지지 않았는지 확인한다. **커밋·푸시는 사용자가 요청할 때만** 한다(각 태스크의 마지막 단계는 변경 범위 확인까지).

## Review Focus

1. **죽은 코드 판정 오탐**: 미참조 스캔은 문자열 기반이라 `dynamic(() => import(...))`·배럴 import를 놓칠 수 있다. 삭제 뒤 `tsc`와 `next build`가 통과하고 라우트 목록이 같아야 한다 → Task 2가 소유(삭제 심볼 grep 0건 + 빌드 출력 비교).
2. **엑셀 가져오기의 빈 칸·형식 변형**: 빈 셀은 `undefined`가 아니라 기존과 같은 값, 좌표 문자열의 공백·전각, BOM이 붙은 CSV, 한글 헤더 변형 → Task 4가 소유(특성화 테스트).
3. **엄격 타입 수정이 런타임 의미를 바꾸는 경우**: `x ?? ''`, `x!`, 기본값 추가가 "없음"과 "빈 문자열"의 구분을 지운다 → Task 5·6이 소유(Task 4 테스트가 계속 통과해야 함, 수정은 타입 가드·명시적 타입으로).
4. **의존성 제거 뒤 배포 빌드**: 개발 서버·`next build`는 통과해도 OpenNext/Cloudflare 번들에서 실패할 수 있다 → Task 3이 소유(`npm ls` 무결성 + `next build`, 배포 환경 확인은 사용자 단계로 명시).
5. **로그인 벽 회귀**: 삭제·타입 전환 중 `AuthGate`·보호 라우트가 풀리지 않아야 한다 → Task 11이 소유(비로그인 401 프로브 + 홈 HTML에 카카오 SDK 없음).

## File Structure

| 파일 | 변화 |
| --- | --- |
| `src/features/worksite-weather/components/worksite-weather-panel.tsx` | 삭제 (미참조 534줄) |
| `src/components/ui/{accordion,avatar,badge,card,checkbox,file-upload,form,separator,sheet}.tsx` | 삭제 (미참조) |
| `src/lib/supabase/client.ts` | `createSupabaseBrowserClient`(@deprecated) 삭제 |
| `public/easynext.png` | 삭제 |
| `package.json` · `package-lock.json` | 미사용 의존성 제거, `next` 패치 상향 |
| `src/features/map-marker/lib/excel/data-manager/data-manager.test.ts` | 신규 — `parseExcelOrCSV` 등 특성화 테스트 |
| `src/features/map-marker/lib/excel/data-manager/*.ts` · 지도 영역 7파일 | 엄격 타입 수정(동작 불변) |
| `tsconfig.json` · `tsconfig.strict.json` · `package.json`(스크립트) | 엄격 설정을 하나로 통합 |
| `eslint.config.mjs` | `no-unused-vars` 전역 활성 |
| `src/features/map-marker/lib/marker-detail-rows.ts` · `excel-upload-helpers.ts` | 신규 — 컴포넌트/훅에서 분리한 순수 함수 |
| `next.config.ts` · `.env.example`(신규) · `.gitignore` | 설정 정리 |
| `README.md` · `AGENTS.md` · `docs/**` | 문서 정리 |

---

### Task 1: 기준선 기록과 미커밋 파일 정리

**Files:**
- Modify: `docs/Ver_2.3/Ver_2.3_implementation_plan.md`(하단 "실행 기록" 표)
- 확인: `supabase/migrations/20261021000000_fix_erp_schema_lint_warnings.sql`, `supabase/migrations/README.md`, `docs/Ver_2.0/project_review.md`, `docs/Ver_2.3/`

**Interfaces:**
- Produces: 이 문서 하단의 **실행 기록 표**(기준선 수치). 이후 태스크는 "기준선 대비"로 판정한다.

- [ ] **Step 1: 기준선 실측** — Run: `npm test` · `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npx next build` · `npm audit --json` · Expected: 354/31 통과, 오류 0, 홈 294 kB·`/gpsmap` 363 kB, audit 31건(critical 2). 값을 실행 기록 표 "기준선" 열에 적는다.
- [ ] **Step 2: 미커밋 항목 확인** — Run: `git status --short` · Expected: 위 Files 항목만 나온다. 다른 변경이 있으면 이 계획의 범위가 아니므로 건드리지 않고 사용자에게 알린다.
- [ ] **Step 3: 사용자에게 커밋 여부 확인** — `20261021000000_fix_erp_schema_lint_warnings.sql`은 이미 DB에 적용된 SQL이라 저장소에 남겨야 한다. 계획 실행 전에 이 파일들을 먼저 커밋할지 묻는다(커밋은 사용자 승인 후).

---

### Task 2: 죽은 코드 삭제

**Files:**
- Delete: `src/features/worksite-weather/components/worksite-weather-panel.tsx`
- Delete: `src/components/ui/accordion.tsx` `avatar.tsx` `badge.tsx` `card.tsx` `checkbox.tsx` `file-upload.tsx` `form.tsx` `separator.tsx` `sheet.tsx`
- Delete: `public/easynext.png`
- Modify: `src/lib/supabase/client.ts` (`createSupabaseBrowserClient` 제거)
- Modify: `AGENTS.md` (위성/레이더 버튼 하드코딩 메모)

**Interfaces:**
- Produces: 미참조 스캔 스크립트의 **출력이 빈 목록**인 상태(스캐너: 아래 Step 1).

- [ ] **Step 1: 스캔 스크립트 준비(저장소 밖)** — 스크래치 디렉터리에 `orphans.mjs`를 둔다: `src/**/*.ts(x)`(테스트·`.d.ts` 제외) 각각에 대해 다른 파일이 `'@/…경로'` 또는 `from './파일명'`으로 import하는지 검사해 미참조 파일을 출력. `page|layout|route|providers` 파일과 디렉터리 import로 쓰는 `index.ts` 배럴은 제외.
- [ ] **Step 2: 삭제 전 고정** — Run: `node orphans.mjs` · Expected: 위 Files 중 소스 10개(날씨 패널 1 + UI 9) + 배럴 2개(`data-manager/index.ts`, `map-capture-stitch/index.ts`는 디렉터리 import라 오탐으로 제외). 배럴 외 항목이 더 나오면 각각 `Grep`으로 동적 import 여부를 확인하고 이 태스크에서 다루지 않는다.
- [ ] **Step 3: 삭제** — 위 Files 삭제, `client.ts`에서 `@deprecated createSupabaseBrowserClient`와 그 주석 제거.
- [ ] **Step 4: 연쇄 고아 확인** — Run: `node orphans.mjs` 를 **빈 목록이 될 때까지** 반복(삭제된 파일만 쓰던 하위 컴포넌트가 새로 고아가 될 수 있다. 예: 날씨 패널 전용 보조 컴포넌트). 새 고아가 나오면 `Grep`으로 확인 후 같이 삭제하고 아래 Step 6의 목록에 적는다.
- [ ] **Step 5: 심볼 잔여 확인** — Run: `Grep "WorksiteWeatherPanel|createSupabaseBrowserClient|easynext" src README.md docs` (이전 점검 문서 `docs/Ver_2.0/project_review.md`·이 계획 제외) · Expected: 0건.
- [ ] **Step 6: `AGENTS.md` 갱신** — "위성/레이더·태풍정보 버튼은 `dashboard-panel.tsx`·`worksite-weather-panel.tsx`에 …" 항목을 "`dashboard-panel.tsx` 한 곳에만 있다"로 고친다. "shadcn UI는 `accordion` 등 …" 같은 언급이 있으면 현황에 맞춘다.
- [ ] **Step 7: 검증** — Run: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test && npx next build` · Expected: 오류 0, 354건 통과, 라우트 목록이 기준선과 동일, 홈 ≤ 294 kB, `/gpsmap` ≤ 363 kB.

---

### Task 3: 미사용 의존성 제거와 보안 패치

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `AGENTS.md` ("스택 규칙"의 라이브러리 나열)

**Interfaces:**
- Consumes: Task 2 완료(`form.tsx`·`accordion`·`avatar`·`checkbox`·`separator` 삭제로 `react-hook-form`·`@radix-ui/react-{accordion,avatar,checkbox,separator}`가 고아가 됨).

- [ ] **Step 1: 사용처 0건 재확인** — Run: `Grep "from ['\"]<패키지>" src` 를 아래 12개 각각에 대해 실행 · Expected: 모두 0건 — `axios` `@hookform/resolvers` `react-hook-form` `date-fns` `es-toolkit` `framer-motion` `react-use` `server-only` `@radix-ui/react-accordion` `@radix-ui/react-avatar` `@radix-ui/react-checkbox` `@radix-ui/react-separator`. 1건이라도 있으면 그 패키지는 제거하지 않고 실행 기록에 적는다. **`esbuild`는 제거 대상이 아니다**(wrangler/OpenNext 도구 체인과 얽혀 있음).
- [ ] **Step 2: 제거** — Run: `npm uninstall <위 12개 중 Step 1을 통과한 것>` · Expected: 종료 코드 0.
- [ ] **Step 3: `next` 패치 상향** — Run: `npm view next@15 version` 으로 15.5.x 최신 확인 후 `npm install next@<그 버전>`. `eslint-config-next`는 `next`와 같은 버전으로 맞춘다(`npm install -D eslint-config-next@<같은 버전>`). major(16 이상)로는 올리지 않는다.
- [ ] **Step 4: 비강제 취약점 정리** — Run: `npm audit fix` (**`--force` 금지**) 후 `npm audit` · Expected: critical 0. 남은 항목(tailwindcss 4 major 등)은 실행 기록에 "의도적으로 보류"로 적는다.
- [ ] **Step 5: 무결성** — Run: `npm ls --all 2>&1 | Select-String "ERR|invalid|missing"` (bash: `npm ls --all 2>&1 | grep -iE "ERR|invalid|missing"`) · Expected: 출력 없음.
- [ ] **Step 6: `AGENTS.md` 스택 규칙 갱신** — "라이브러리:" 나열에서 제거한 것을 빼고, "필요해질 때 추가"로 한 줄 덧붙인다(이 파일은 마스터 junction이 아니라 프로젝트 파일이다).
- [ ] **Step 7: 검증** — Run: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test && npx next build` · Expected: 오류 0, 354건 통과, 홈 ≤ 294 kB, `/gpsmap` ≤ 363 kB.
- [ ] **Step 8: 사용자 안내(코드 아님)** — "Cloudflare 배포 빌드(`npm run preview` 또는 푸시 후 자동 배포)에서 번들 오류가 없는지 확인해 주세요. Windows에서는 `opennextjs-cloudflare build`가 환경 문제로 실패할 수 있어 이 계획에서는 실행하지 않습니다."

---

### Task 4: 엑셀 데이터 매니저 특성화 테스트 (엄격 타입 전환 전 안전망)

**Files:**
- Create: `src/features/map-marker/lib/excel/data-manager/data-manager.test.ts`

**Interfaces:**
- Consumes: `MapMarkerExcelManager`(`./index`, `Record<string, any>` 믹스인 객체)의 메서드 `parseExcelOrCSV(file: File)` · `parseInfoExcel(file: File)`. 외부 사용 메서드 전체: `parseExcelOrCSV` `parseInfoExcel` `upsertInformationToSupabase` `exportFullBackupToExcel` `parseFullBackupExcel`.
- Produces: Task 5·6이 "동작 불변"을 판정하는 테스트 묶음.

> 이 테스트는 **현재 동작을 고정**한다(옳고 그름을 판정하지 않는다). 기대값은 현재 코드를 읽고, 입력을 넣어 실제 출력을 확인한 값을 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성** — Node 전역 `File`로 CSV를 만들어 `parseExcelOrCSV`에 넣는다. 테스트 이름과 단언:
  - `"한글 헤더 CSV를 장비 행으로 파싱한다"` — 헤더(`parse.ts`가 인식하는 이름)·좌표·주소 1행 → 반환 배열 길이 1, `name`·`lat`·`lng` 값.
  - `"BOM이 붙은 CSV도 같은 결과"` — 같은 CSV 앞에 `﻿`를 붙여 위 결과와 `toEqual`.
  - `"빈 셀은 기존과 같은 값으로 남는다"` — 메모 칸이 빈 행의 해당 필드 값(현재 구현이 돌려주는 값, `undefined`/`''` 중 실제 값)을 단언.
  - `"좌표 문자열의 앞뒤 공백을 허용한다"` — `" 37.5 "`, `" 127.0 "` → 숫자 변환 결과 단언.
  - `"헤더만 있고 데이터가 없으면 빈 배열"`.
  - `"parseInfoExcel: 정보 시트 1행을 파싱한다"` — `info-records.ts`/`headers.ts`가 인식하는 헤더로 CSV 작성, 반환 구조 단언.
  - 전체 백업 왕복: `buildFullBackupSheetRows` → `parseFullBackupSheetRows` 왕복 후 행 수·핵심 필드가 같다(`full-backup.ts`의 순수 함수 사용, 파일 I/O 없음).
- [ ] **Step 2: 실행해 현재 동작과 일치하는지 확인** — Run: `npx vitest run src/features/map-marker/lib/excel/data-manager/data-manager.test.ts` · Expected: **PASS**(특성화 테스트는 이미 있는 동작을 고정하므로 처음부터 통과해야 한다). FAIL이면 코드가 아니라 **기대값**을 실제 출력에 맞춰 고친다.
- [ ] **Step 3: 변이 확인** — `parse.ts`의 한 줄(예: 좌표 `Number()` 변환)을 잠깐 바꿔 테스트가 FAIL로 바뀌는지 확인하고 원복한다 · Expected: 해당 테스트가 FAIL → 원복 후 PASS. (테스트가 실제로 동작을 지키는지 증명)
- [ ] **Step 4: 검증** — Run: `npm test` · Expected: 기존 354 + 신규 건수 모두 통과.

---

### Task 5: 엄격 타입 — data-manager 밖 영역 (41건)

**Files (오류 건수):**
- Modify: `src/features/map-marker/components/map/kakao-map-canvas.tsx` (13), `map-region-bounds-guide.tsx` (8), `map-region-capture-panel.tsx` (3), `map-floating-controls.tsx` (1), `kakao-map-helpers.ts` (1)
- Modify: `src/features/map-marker/lib/map-capture-stitch/bounds.ts` (6), `plan.ts` (3), `src/features/map-marker/lib/overlay-drag.ts` (1)
- Modify: `src/features/map-marker/components/modals/roadview-modal.tsx` (1)
- Modify: `src/features/worksite-weather/lib/verdict.ts` (3), `merge-sources.ts` (1)
- Modify: `tsconfig.strict.json` (`include` 확장)

**Interfaces:**
- Consumes: Task 4의 테스트 묶음(변경 없이 통과 유지).
- Produces: 위 파일들이 `strictNullChecks`+`noImplicitAny`에서 0건. `tsconfig.strict.json`이 이 파일들을 포함.

- [ ] **Step 1: 측정 도구 준비** — 프로젝트 루트에 임시 `tsconfig.tmp-strict.json`(`extends ./tsconfig.json`, `strictNullChecks:true`, `noImplicitAny:true`, `incremental:false`, `include: ["next-env.d.ts","src/**/*.ts","src/**/*.tsx"]`)을 만든다. **작업이 끝나면 반드시 삭제**한다.
- [ ] **Step 2: 기준 확인** — Run: `npx tsc -p tsconfig.tmp-strict.json --noEmit 2>&1 | grep -c "error TS"` · Expected: **157**(이 중 이 태스크 대상 41, Task 6 대상 116).
- [ ] **Step 3: 파일별 수정** — 오류가 적은 파일부터. 원칙: (a) 매개변수에 명시적 타입, (b) `undefined` 가능 값은 **기존 분기 구조를 유지한 채** 가드(`if (!x) return` 등 이미 있던 의도)로 좁힌다, (c) `window.kakao` 등 SDK 타입은 `src/types/kakao-maps.d.ts`에 선언을 보강한다, (d) `any` 새로 쓰지 않는다. 런타임에서 "없음"과 "빈 값"을 구분하던 곳은 기본값을 추가하지 않는다.
- [ ] **Step 4: 영역 단위 확인** — 파일 하나를 끝낼 때마다 Run: `npx tsc -p tsconfig.tmp-strict.json --noEmit 2>&1 | grep "<파일 경로>"` · Expected: 출력 없음.
- [ ] **Step 5: 영역 완료** — Run: `npx tsc -p tsconfig.tmp-strict.json --noEmit 2>&1 | grep -c "error TS"` · Expected: **116**(Task 6 대상만 남음).
- [ ] **Step 6: `tsconfig.strict.json`에 반영** — `include`에 위 파일들(또는 영역 glob)을 추가하고 `npm run typecheck:strict` · Expected: 오류 0.
- [ ] **Step 7: 임시 파일 삭제와 검증** — `tsconfig.tmp-strict.json` 삭제 후 `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test && npx next build` · Expected: 오류 0, 전체 통과, 홈 ≤ 294 kB.

---

### Task 6: 엄격 타입 — data-manager (116건)

**Files (오류 건수):**
- Modify: `src/features/map-marker/lib/excel/data-manager/parse.ts` (61), `export.ts` (22), `info-records.ts` (17), `headers.ts` (9), `date-utils.ts` (4), `shared.ts` (3), `index.ts`
- Modify: `tsconfig.strict.json`

**Interfaces:**
- Consumes: Task 4 테스트(전 구간 통과 유지), Task 5의 임시 tsconfig 절차.
- Produces: `MapMarkerExcelManager`의 **외부 사용 메서드 5개**(`parseExcelOrCSV` `parseInfoExcel` `upsertInformationToSupabase` `exportFullBackupToExcel` `parseFullBackupExcel`)는 이름·인자·반환 형태 불변. 호출부(`use-data-backup-actions.ts`, `use-excel-upload-actions.tsx`)는 수정하지 않는다.

- [ ] **Step 1: 임시 tsconfig 재생성** — Task 5 Step 1과 동일. Run 후 Expected: **116**.
- [ ] **Step 2: 파일 내부 타입 정의** — 각 파일 상단에 해당 파일이 다루는 행 타입을 선언한다(예: `type SheetRow = Record<string, unknown>`). 엑셀에서 읽은 값은 `unknown`으로 받고, **값을 쓰기 전에** 문자열/숫자 판별 헬퍼(`asString(value: unknown): string`, `asNumber(value: unknown): number | null`)를 `shared.ts`에 한 번만 만들어 재사용한다. 헬퍼의 반환은 **기존 코드가 돌려주던 값과 동일**해야 한다(Task 4의 "빈 셀" 테스트가 그 증거).
- [ ] **Step 3: `this` 믹스인 유지** — `Record<string, any> & ThisType<any>` 구조 자체는 이번에 바꾸지 않는다(범위 밖). 메서드 **내부**의 매개변수·지역 변수 타입만 채운다.
- [ ] **Step 4: 파일별 0건** — 큰 파일부터가 아니라 `date-utils.ts`(4) → `shared.ts`(3) → `headers.ts`(9) → `info-records.ts`(17) → `export.ts`(22) → `parse.ts`(61) 순. 각 파일 후 Run: `npx vitest run src/features/map-marker/lib/excel` · Expected: PASS(Task 4 포함). tsc에서 해당 파일 오류 0.
- [ ] **Step 5: 영역 완료** — Run: `npx tsc -p tsconfig.tmp-strict.json --noEmit 2>&1 | grep -c "error TS"` · Expected: **0**.
- [ ] **Step 6: `tsconfig.strict.json`에 반영** — `src/features/map-marker/lib/excel/**` 추가, `npm run typecheck:strict` · Expected: 0.
- [ ] **Step 7: 임시 파일 삭제와 검증** — `tsconfig.tmp-strict.json` 삭제, `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test && npx next build` · Expected: 오류 0, 전체 통과, 번들 기준선 이하.

---

### Task 7: 엄격 설정 전역 적용과 미사용 코드 규칙 활성화

**Files:**
- Modify: `tsconfig.json` (`strictNullChecks`·`noImplicitAny`)
- Delete: `tsconfig.strict.json`
- Modify: `package.json` (`typecheck:strict` 스크립트 제거)
- Modify: `eslint.config.mjs`
- Modify: 미사용 변수가 나오는 파일 19곳(73건)

**Interfaces:**
- Consumes: Task 5·6 완료(엄격 설정에서 오류 0).

- [ ] **Step 1: 전역 전환** — `tsconfig.json`에서 `"strictNullChecks": false`, `"noImplicitAny": false` 두 줄을 삭제(`strict: true`가 이미 있어 기본 true가 된다). Run: `npx tsc --noEmit` · Expected: **오류 0**. 오류가 나오면 Task 5·6이 놓친 파일이므로 그 파일을 같은 원칙으로 고친다.
- [ ] **Step 2: 부분 설정 폐지** — `tsconfig.strict.json` 삭제, `package.json`의 `"typecheck:strict"` 삭제, `README.md`·`AGENTS.md`에서 이 스크립트 언급 제거. `Grep "typecheck:strict|tsconfig.strict" .` (`node_modules`·`docs/Ver_2.0/project_review.md`·이 계획 제외) · Expected: 0건.
- [ ] **Step 3: 미사용 변수 규칙** — `eslint.config.mjs`의 `'@typescript-eslint/no-unused-vars': 'off'`를 `['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]`로 바꾸고 `kakao-route` 전용 오버라이드(같은 규칙을 `'error'`로 재선언)는 중복이므로 제거한다. Run: `npx eslint . --max-warnings=0` · Expected: **73건 / 19파일** 보고.
- [ ] **Step 4: 73건 정리** — 미사용 import·변수·매개변수를 삭제한다. 매개변수는 위치 때문에 남겨야 하면 `_` 접두사. **삭제로 부작용(호출 자체가 필요한 줄)이 사라지지 않는지** 줄마다 확인한다. Run: `npx eslint . --max-warnings=0` · Expected: 0.
- [ ] **Step 5: `AGENTS.md` 메모 갱신** — "ESLint가 미사용 import·변수를 잡지 않는다" 항목을 "이제 잡는다(Ver 2.3~)"로 바꾼다.
- [ ] **Step 6: 검증** — Run: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test && npx next build` · Expected: 오류 0, 전체 통과, 홈 ≤ 294 kB.

---

### Task 8: 컴포넌트·훅 안의 순수 함수를 lib로 분리

**Files:**
- Create: `src/features/map-marker/lib/marker-detail-rows.ts`, `src/features/map-marker/lib/marker-detail-rows.test.ts`
- Create: `src/features/map-marker/lib/excel-upload-helpers.ts`, `src/features/map-marker/lib/excel-upload-helpers.test.ts`
- Modify: `src/features/map-marker/components/modals/marker-detail-modal.tsx` (43–304줄 구간의 순수 함수 제거 후 import)
- Modify: `src/features/map-marker/hooks/use-excel-upload-actions.tsx` (32–227줄 구간 제거 후 import)

**Interfaces:**
- Produces (`marker-detail-rows.ts`, **이름·시그니처 그대로 이동**하고 `export`만 붙인다): `InfoRow`(interface) · `BASEMENT_LABEL` · `ETC_DONG_LABEL` · `dbErrorMessage(err: unknown, fallback: string): string` · `parseSeparationLabel(name: string | undefined | null): string | null` · `dongSortKey(label: string): number` · `getMarkerDongLabel(marker: EquipmentMarker): string` · `getMarkerEffectiveKey(marker: EquipmentMarker): string` · `pickDongMapRepresentative` · `storedGroupRoleOf(marker: EquipmentMarker): GroupRole` · `getAddressGroupMates` · `pickNextAddressRepresentative` · `toInfoRowFromEquipment(marker: EquipmentMarker): InfoRow` · `markerDisplayNames(marker: EquipmentMarker): Set<string>` · `resolveGroupRole(marker: EquipmentMarker, row?: InfoRow): string` · `takeInfoRowForMarker` · `buildEquipmentDetailRows`. (`GpsInfoRow`과 `DETAIL_TABLE_*` 상수는 JSX/스타일이라 모달에 남긴다.)
- Produces (`excel-upload-helpers.ts`, 같은 방식): `ParsedExcelRow` · `resetFileInput` · `formatFailedAddresses` · `FAILED_ADDRESS_DISPLAY_LIMIT` · `buildUploadResultDescription` · `resolveStoredMarkerColor` · `isValidCoordinate` · `hasStoredCoordinates` · `toEquipmentMarker` · `stagedMarkerRowToPending` · `buildErpSummary` · `parseErpSheet`.

- [ ] **Step 1: 실패하는 테스트 작성(분리 전)** — 새 모듈에서 import하는 형태로 특성화 테스트를 쓴다(모듈이 아직 없어 FAIL). 기대값은 **이동 전 원본 함수를 읽고 계산한 값**:
  - `marker-detail-rows.test.ts`: `"parseSeparationLabel: 분리 라벨이 없으면 null"` · `"dongSortKey: 지하(BASEMENT_LABEL)는 일반 동보다 앞, 기타(ETC_DONG_LABEL)는 뒤"`(상수 값으로 비교) · `"getMarkerDongLabel: 동 정보가 없으면 ETC_DONG_LABEL"` · `"dbErrorMessage: Error 객체는 message, 그 외는 fallback"`.
  - `excel-upload-helpers.test.ts`: `"isValidCoordinate: NaN·±Infinity는 false"` · `"hasStoredCoordinates: 문자열 좌표 '0'과 빈 값 구분"`(현재 동작 그대로) · `"formatFailedAddresses: FAILED_ADDRESS_DISPLAY_LIMIT 초과분은 '외 N건'으로 줄인다"`(실제 문구는 원본 확인) · `"resolveStoredMarkerColor: undefined면 기본 색"`.
- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/features/map-marker/lib/marker-detail-rows.test.ts src/features/map-marker/lib/excel-upload-helpers.test.ts` · Expected: FAIL(모듈 없음).
- [ ] **Step 3: 이동** — 위 함수들을 **본문 수정 없이** 새 파일로 옮기고 원본 파일은 `import { … } from '@/features/map-marker/lib/…'`로 바꾼다. 원본이 쓰던 import(타입·유틸)는 새 파일로 따라간다.
- [ ] **Step 4: 통과 확인** — Run: 같은 vitest 명령 · Expected: PASS.
- [ ] **Step 5: 줄 수 확인** — Run: `wc -l src/features/map-marker/components/modals/marker-detail-modal.tsx src/features/map-marker/hooks/use-excel-upload-actions.tsx` · Expected: 각각 약 260줄·195줄 감소(2,017→약 1,760 / 1,539→약 1,340).
- [ ] **Step 6: 검증** — Run: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test && npx next build` · Expected: 오류 0, 전체 통과, 홈 ≤ 294 kB.
- [ ] **범위 밖 기록** — `MarkerDetailModal`(약 1,700줄)·`useExcelUploadActions`(약 1,300줄)·`KakaoMapCanvas`(약 1,200줄) **본체 분할은 이번 범위가 아니다.** `.tsx` 테스트가 불가능한 상태에서 본체를 쪼개면 회귀를 못 잡는다. 별도 스펙(브레인스토밍)으로 다룬다고 실행 기록에 적는다.

---

### Task 9: 설정·템플릿 잔재 정리

**Files:**
- Modify: `next.config.ts` (`images.remotePatterns`)
- Create: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 없음.

- [ ] **Step 1: `next/image` 사용 실태** — Run: `Grep "next/image|<Image" src` · `barcode-lightbox.tsx`·`barcode-result-card.tsx`의 `src`가 외부 URL인지(`blob:`/`data:`/내부 경로인지) 확인. **외부 호스트 URL이면 이 단계를 중단**하고 필요한 호스트만 `remotePatterns`에 남기는 쪽으로 바꾼다. `blob:`/`data:`면 Step 2로.
- [ ] **Step 2: `remotePatterns` 제거** — `images: { remotePatterns: [{ hostname: '**' }] }` 블록을 제거한다. `blob:`/`data:` URL은 `next/image` 최적화 대상이 아니므로 `unoptimized`가 이미 있거나 필요하면 해당 `<Image>`에 `unoptimized`를 둔다(동작 불변).
- [ ] **Step 3: `.env.example` 작성** — 값 없이 **변수 이름과 설명만** 둔다: `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` `NEXT_PUBLIC_SUPABASE_URL` `NEXT_PUBLIC_SUPABASE_ANON_KEY` `KAKAO_REST_API_KEY` `NEXT_PUBLIC_SITE_URL` `PROXY_ALLOWED_ORIGINS` `VWORLD_API_KEY` `VWORLD_DOMAIN` `NEXT_PUBLIC_VWORLD_API_KEY` `KMA_API_HUB_KEY` `ITS_API_KEY`(`NEXT_PUBLIC_` 접두사 금지 주석). 현재 `.env.local`의 안내 주석을 참고하되 **실제 값은 한 글자도 복사하지 않는다.**
- [ ] **Step 4: `.gitignore`** — `.env*` 규칙 아래에 `!.env.example` 예외를 추가한다. Run: `git check-ignore -v .env.example .env.local` · Expected: `.env.example`은 무시되지 않고 `.env.local`은 무시됨.
- [ ] **Step 5: 검증** — Run: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test && npx next build` · Expected: 오류 0. 바코드 화면의 이미지 표시는 로그인 후 수동 확인 대상(사용자 단계)으로 기록.

---

### Task 10: 문서 정리와 버전 표기

**Files:**
- Move: `docs/Ver_2.2_implementation_plan.md` → `docs/Ver_2.2/Ver_2.2_implementation_plan.md`
- Move: `docs/PROJECT_ANALYSIS_2026-07-18.md`, `docs/walkthrough.md` → `docs/archive/`
- Modify: `README.md` (현재 릴리스·문서 링크·구조), 이동한 파일을 가리키는 모든 링크
- Modify: `AGENTS.md` (코드베이스 메모 현황)

**Interfaces:**
- Consumes: Task 2·3·7에서 바뀐 사실(삭제된 컴포넌트, 제거한 라이브러리, strict 통합, ESLint 규칙).

- [ ] **Step 1: 이동 전 링크 조사** — Run: `Grep "Ver_2.2_implementation_plan|PROJECT_ANALYSIS_2026-07-18|walkthrough.md" . --glob '!node_modules' --glob '!docs/Ver_2.0/project_review.md'` · 결과의 모든 경로를 메모한다.
- [ ] **Step 2: 이동** — `git mv`로 위 3개를 옮긴다(`docs/archive/`는 새로 만든다). `docs/VWORLD_CLOUDFLARE_SETUP.md`·`docs/orchestration/`는 운영 문서라 그대로 둔다.
- [ ] **Step 3: 링크 수정** — Step 1에서 찾은 모든 참조를 새 경로로 고친다. Run: Step 1의 Grep 재실행 · Expected: 옛 경로 참조 0건.
- [ ] **Step 4: `README.md`** — "현재 릴리스"를 `Ver_2.3` + 날짜로, 문서 링크에 `docs/Ver_2.3/`·`docs/Ver_2.2/` 추가, 구조 트리에서 삭제된 파일 제거, "버전 표기" 문단(npm `0.1.0`과 제품 릴리스는 별개)은 유지. 환경변수 표에 "`.env.example` 참고" 한 줄.
- [ ] **Step 5: `AGENTS.md` 메모 점검** — Task 2·3·7에서 고친 항목 외에 "코드베이스 메모" 중 현황과 어긋난 것이 없는지 줄마다 확인한다(예: `tsconfig` 설명, 검증 명령 목록에서 `typecheck:strict`).
- [ ] **Step 6: 인코딩 확인** — Run: `Grep "�" README.md AGENTS.md docs/Ver_2.3 docs/Ver_2.2` · Expected: 0건(한글 깨짐 없음).

---

### Task 11: 최종 검증과 점검 이력 해소 기록

**Files:**
- Modify: `docs/Ver_2.0/project_review.md` (3차 점검 항목 아래에 「해소: 2026-MM-DD 조치」 덧붙임)
- Modify: `docs/Ver_2.3/Ver_2.3_implementation_plan.md` (실행 기록 표 완성)

- [ ] **Step 1: 전체 검증** — Run: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test` · `npx next build` · `npm audit` · Expected: 오류 0 · 테스트 기준선(354) + 신규 · 홈 ≤ 295 kB(목표 ≤ 294 kB) · `/gpsmap` ≤ 363 kB · audit critical 0.
- [ ] **Step 2: 로그인 벽 프로브** — dev 서버를 **빈 포트**(예: `npm run dev -- -p 3011`)로 띄워 `/api/its-key`·`/api/roadview-dates`·`/api/worksite-weather`를 토큰 없이 호출 · Expected: 모두 **401**. 홈 HTML에 `dapi.kakao.com` 없음, 로딩 문구 있음. 확인 후 서버 종료(기존에 떠 있던 3000 포트 프로세스는 건드리지 않는다).
- [ ] **Step 3: 엄격 설정 잔여 확인** — Run: `Grep ": any\b|as any\b" src --glob '!**/*.test.ts'` · 개수를 실행 기록에 적는다(기준선 19). 줄이는 것이 목표지만 **이번 계획의 합격 조건은 아니다**.
- [ ] **Step 4: 해소 기록** — `project_review.md`의 H3-1·M3-1(1단계)·M3-2·L3-1·L3-2·3.1 항목에 「해소: 날짜 조치」를 덧붙이고, **미해소**(M3-1 본체 분할, M3-3 `.tsx`·shell·dashboard·barcode 테스트 공백, E2E 브라우저 설치)는 그대로 남긴다.
- [ ] **Step 5: 실행 기록 표 완성** — 아래 표의 "결과" 열을 채운다.
- [ ] **Step 6: 사용자 안내** — 배포 전 확인 사항(Cloudflare 빌드 통과, 로그인 후 지도·CCTV·바코드 화면 수동 확인, `npx playwright install chromium` 후 `npm run test:e2e`)을 최종 보고에 적는다.

---

## 실행 기록 (2026-10-21 완료)

| 지표 | 기준선 | 결과 |
| --- | --- | --- |
| 비테스트 소스 파일 / 줄 수 | 201 / 33,501 | 193 / 32,557 |
| 테스트 건수 / 파일 | 354 / 31 | **410 / 34** (+56) |
| 홈 First Load JS | 294 kB (상한 295) | 294 kB |
| `/gpsmap` First Load JS | 363 kB | 363 kB |
| `npm audit` (critical / high / 전체) | 2 / 21 / 31 | **0 / 13 / 18** |
| 엄격 타입(strictNullChecks+noImplicitAny) 오류 | 157 (17파일) | **0** (`tsconfig.json`에 전역 적용) |
| `: any` 사용 | 19 | 19 (변화 없음 — 이번 합격 조건 아님) |
| 미사용 변수(ESLint 규칙) | 73 (19파일) | **0** (규칙 활성, 72건 정리) |
| 미참조 파일 | 10 (+오탐 배럴 2) | 0 (+배럴 2, `export-tbm.ts` 보류 1) |
| 미사용 의존성 | 7 (+연쇄 5) | 0 |
| 최대 파일 줄 수 | 2,017 | 1,799 (`marker-detail-modal.tsx`) |

## 판단 기록 (Rulings)

계획과 달라지거나 계획이 정하지 않은 것을 실행 중에 정한 내용이다. 틀렸을 때의 비용을 함께 적는다.

1. **`export-tbm.ts`는 삭제하지 않고 남겼다.** (Task 2) 삭제한 날씨 패널에서만 호출되던 TBM 엑셀 내보내기라 지금은 화면에서 닿을 수 없다. 코드만 지우면 "기능 삭제"라는 결정을 대신 내리게 된다. 복원/삭제는 사용자 결정. *비용: 호출처 없는 약 100줄 잔류.*
2. **`use-worksite-weather.ts`는 삭제했다.** (Task 2) 같은 패널에서만 쓰였고 react-query 래퍼라 재작성 비용이 작다.
3. **전체 백업 왕복 테스트는 만들지 않았다.** (Task 4) `full-backup.ts`는 엄격 오류가 0건이라 이번 타입 작업 대상이 아니고, 입력 테이블 구조가 커서 효용 대비 비용이 크다. *비용: 해당 파일의 회귀 안전망 부재(이전과 동일).*
4. **헤더만 있는 파일은 "빈 배열"이 아니라 거부된다.** (Task 4) 현재 동작을 그대로 고정했다("엑셀 파일에 데이터가 없습니다"). 계획 문구와 달랐다.
5. **BOM 없는 UTF-8 한글 CSV는 헤더를 인식하지 못해 거부된다.** (Task 4) 기존 동작의 한계로 발견했고, **고치지 않고 테스트로만 고정**했다(범위 밖). 앱이 내보내는 파일은 BOM이 있어 정상이다. *비용: 다른 도구로 만든 BOM 없는 CSV 업로드가 실패한다 — 별도 개선 후보.*
6. **`window.kakao` 전역 선언을 필수로 바꿨다.** (Task 5) 35건을 한 줄로 해소하는 대신, 로드 여부를 직접 확인해야 하는 `use-kakao-map-sdk.ts`에만 `loadedKakao()` 헬퍼로 optional 읽기를 둔다. *비용: SDK 로드 전에 다른 곳에서 `window.kakao.maps`를 쓰면 타입이 못 막는다(지금은 `isReady` 이후에만 접근).*
7. **`kakao-map-canvas.tsx`의 `supabase` null 가드를 try 안에 추가했다.** (Task 5) 로그인 상태에서는 도달하지 않는 경로이고, 도달 시 기존 `TypeError` 대신 명확한 메시지가 같은 catch로 흐른다.
8. **`tsconfig.strict.json`에 중간 `include` 확장을 하지 않았다.** (Task 5·6) 같은 세션에서 전역 전환까지 끝내므로 임시 설정으로 측정만 하고 삭제했다.
9. **`buildUploadResultDescription`은 훅에 남겼다.** (Task 8) JSX를 반환해 `.ts` 모듈로 옮길 수 없다.
10. **`walkthrough.md`·`PROJECT_ANALYSIS_2026-07-18.md`는 이동하지 않았다.** (Task 10) `.serena/memories/core.md`와 Ver 1.x 가이드가 누적 문서로 가리킨다. `Ver_2.2_implementation_plan.md`만 이동했다.
11. **`npm audit`의 남은 high 13건은 보류했다.** (Task 3) `tailwindcss 4`(major)·OpenNext/Cloudflare 도구 체인 상향이 필요하다. 런타임이 아니라 개발·빌드 경로다.
12. **`main` 브랜치에서 직접 작업했다.** 이 프로젝트의 기존 작업 방식이며, 커밋·푸시는 사용자 요청 후에 한다.

## 남은 일 (이번 계획 범위 밖)

- `export-tbm.ts` 복원/삭제 결정
- `MarkerDetailModal`(약 1,500줄)·`useExcelUploadActions`(약 1,100줄)·`KakaoMapCanvas`(약 1,200줄) **본체 분할** — `.tsx` 테스트 불가 문제를 먼저 풀어야 한다(별도 스펙)
- `shell`·`dashboard`·`barcode` 테스트 공백, `: any` 19곳, `data-manager` 믹스인(`this`) 구조
- BOM 없는 UTF-8 CSV 지원
- 사용자 확인: Cloudflare 배포 빌드 통과, 로그인 후 지도·CCTV·바코드 화면, `npx playwright install chromium` 후 `npm run test:e2e`
