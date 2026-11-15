# 번들 · 죽은 코드 · 문서 정리 구현계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `xlsx`·`Leaflet` 정적 import를 동적 로드로 전환하고, 조건부 선로딩·미사용 파일 삭제·중복 유틸 통합·문서(`AGENTS.md`, `supabase/migrations/README.md`) 동기화를 수행한다.

**Architecture:** 변경 전 `next build` 기준선을 측정한 뒤, 동적 import 전환 → 미사용/중복 정리 → 문서 동기화 → 변경 후 `next build` 실측 순으로 진행한다. `export-tbm.ts`는 보존 규칙에 따라 건드리지 않는다.

**Tech Stack:** Next.js 15 · TypeScript · Vitest · `xlsx` · `leaflet`. 의존성 추가 없음.

**Spec:** [Ver_3.0_번들문서정리_설계.md](Ver_3.0_번들문서정리_설계.md) · **구현:** [Ver_3.0_번들문서정리_구현.md](Ver_3.0_번들문서정리_구현.md)

## Global Constraints

- **커밋하지 않는다.** 사용자가 "커밋"을 말할 때만 커밋한다.
- `worksite-weather/lib/export-tbm.ts`는 수정·삭제하지 않는다.
- `docs/이전버젼/`은 건드리지 않는다.
- **임시 `distDir` 빌드 규칙**: dev 서버가 실행 중일 때 `npx next build`를 직접 돌리면 `.next`가 덮어쓰여 dev 서버가 깨진다. `next.config.ts`에 임시 `distDir: ".next-measure"`를 지정해 빌드·측정한 뒤 즉시 `next.config.ts`를 원복(`git diff next.config.ts` 빈 출력)하고 임시 폴더를 삭제한다.
- 홈 First Load JS **295 kB 이하** 유지.
- **검증 명령**: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`.
- 파일 인코딩 UTF-8, 기존 줄바꿈(CRLF/LF) 유지, 한글 깨짐 확인.

## Review Focus

1. `read-schedule.ts` 동적 전환 시 `encodeA1Cell`이 26열 이후(`AA1` 등)를 포함해 기존 `read-schedule.test.ts`의 `buildFillAt` 및 `parseWorkbookBuffer`를 그대로 통과시키는지 (Task 2, Step 3·6 확인).
2. `gpsmap-page.tsx`의 `VworldMapPane` `dynamic()` 전환 후 `paneRef` (`useRef<VworldMapHandle>`) 전달이 타입·런타임 오류 없이 동작하는지 (Task 2, Step 4·6 확인).
3. `next.config.ts` 임시 `distDir` 설정이 측정 후 완전히 원복되었는지 (Task 1, Step 3 및 Task 4, Step 3 확인).
4. `supabase/migrations/README.md` 실행 순서가 실제 `supabase/migrations/*.sql` 파일 목록과 100% 일치하는지 (Task 4, Step 1 확인).

---

### 번들 크기 실측 기록표 (구현 문서 작성 시 복사)

| 경로 | 변경 전 First Load JS | 변경 후 First Load JS | 증감 |
|---|---|---|---|
| `/` | 299 kB | 300 kB | +1 kB |
| `/gpsmap` | 207 kB | 207 kB | 0 kB |

---

### Task 1: 변경 전 번들 기준선 실측

**Steps:**
- [ ] Global Constraints의 임시 `distDir` 빌드 규칙에 따라 `npx next build`를 실행한다.
- [ ] 출력된 `/` 및 `/gpsmap`의 `First Load JS` 수치를 위 실측 기록표의 "변경 전" 열에 기입한다.
- [ ] `next.config.ts` 원복(`git diff next.config.ts` 빈 출력 확인) 및 `.next-measure` 삭제.

---

### Task 2: `xlsx` · `VworldMapPane` 동적 import 전환 및 조건부 선로딩

**Files:**
- Create: `src/features/barcode/lib/lookup-excel.test.ts`
- Modify: `src/features/barcode/lib/lookup-excel.ts:1-12`
- Modify: `src/features/schedule/lib/read-schedule.ts:1-28,50-87`
- Modify: `src/features/gpsmap/components/gpsmap-page.tsx:11-14`
- Modify: `src/features/shell/components/app-shell.tsx:122-134`

**Interfaces:**
```ts
// src/features/barcode/lib/lookup-excel.ts (기존 시그니처 유지)
export async function parseLookupExcel(file: File): Promise<LookupRow[]>;
// src/features/schedule/lib/read-schedule.ts (기존 시그니처 유지)
export function buildFillAt(sheet: XLSXType.WorkSheet): ColorAt;
export async function parseWorkbookBuffer(data: ArrayBuffer | Uint8Array): Promise<ReadScheduleResult>;
```

**Steps:**
- [ ] `src/features/barcode/lib/lookup-excel.test.ts`에 `parseLookupExcel` 테스트를 작성한다(빈 시트 `File` 전달 시 `"빈 엑셀 파일입니다."` 예외 단언, 헤더+1행 데이터 전달 시 `[{ text: "bc-01 항목a", cells: { 바코드: "BC-01", 품명: "항목A" } }]` 반환 단언).
- [ ] `npx vitest run src/features/barcode/lib/lookup-excel.test.ts src/features/schedule/lib/read-schedule.test.ts` 실행 → **PASS** 확인(변경 전 동작 고정).
- [ ] `lookup-excel.ts:1`과 `read-schedule.ts:1`의 정적 `xlsx` import를 `import type` + 함수 내부 `const XLSX = await import("xlsx")`로 전환한다(`buildFillAt`은 순수 `encodeA1Cell(r, c)` 헬퍼로 교체해 시그니처 유지).
- [ ] `gpsmap-page.tsx:11-14`의 `VworldMapPane`을 `dynamic(..., { ssr: false })`로 전환한다.
- [ ] `app-shell.tsx:122-134` 선로딩 `useEffect`에 `authed` 및 `isAdmin` 조건을 적용한다(`if (!hasMounted || !authed) return;`, `if (isAdmin) void import(".../group-panel");`).
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 전체 PASS 확인.

---

### Task 3: 미사용 파일 삭제 및 중복 유틸 통합

**Files:**
- Delete (사용자 승인 후): `src/features/schedule/lib/day-table-widths.ts`, `src/features/shell/components/coming-soon.tsx`
- Modify: `src/lib/api/verify-auth-token.ts:13,38-40` ↔ `src/features/accounts/server/admin-auth.ts:11-17,84`
- Modify: `src/features/gpsmap/lib/coords.ts`, `src/features/gpsmap/lib/coords.test.ts`
- Modify: `src/features/gpsmap/components/vworld-pane-overlay.tsx:29-30`, `src/features/gpsmap/components/gpsmap-page.tsx:47-50`

**Interfaces:**
```ts
// src/lib/api/verify-auth-token.ts
export function extractBearerToken(req: Request): string | null;

// src/features/gpsmap/lib/coords.ts
export function leafletZoomFromKakaoLevel(level: number): number;
export function kakaoLevelFromLeafletZoom(zoom: number): number;
```

**Steps:**
- [ ] `src/features/gpsmap/lib/coords.test.ts`에 `leafletZoomFromKakaoLevel(3) === 17`, `leafletZoomFromKakaoLevel(0) === 17`, `kakaoLevelFromLeafletZoom(17) === 3` 단언 테스트를 추가한다.
- [ ] `npx vitest run src/features/gpsmap/lib/coords.test.ts` → **FAIL** 확인.
- [ ] `coords.ts`에 두 함수를 구현해 테스트 **PASS** 확인 후, `vworld-pane-overlay.tsx`와 `gpsmap-page.tsx`의 중복 함수를 제거하고 import로 교체한다.
- [ ] `verify-auth-token.ts`에서 `extractBearerToken(req: Request)`를 export하고 `admin-auth.ts`에서 이를 import하도록 통합한다(`admin-auth.test.ts` 및 `verify-auth-token.test.ts` 통과 확인).
- [ ] `day-table-widths.ts`, `coming-soon.tsx` 참조 0건을 재확인한 뒤 삭제한다(`export-tbm.ts`는 유지).
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 전체 PASS 확인.

> **체크포인트**: 사용자가 요청할 때만 커밋한다.

---

### Task 4: 문서 동기화 및 변경 후 번들 실측

**Files:**
- Modify (사용자 확인 후): `AGENTS.md` (`features:` 목록에 `accounts`, `barcode`, `route`, `site-survey` 추가)
- Modify: `supabase/migrations/README.md:11-20` (`20261117000000_marker_address.sql`, `20261117000100_split_jibun_from_road_address.sql`, `20261117000200_survey_settings.sql`, `20261119000000_login_history.sql` 추가)

**Steps:**
- [ ] `supabase/migrations/` 실제 파일 12개와 `supabase/migrations/README.md:11-20`을 대조해 누락 4건을 순서대로 추가한다.
- [ ] 사용자 승인 하에 `AGENTS.md`의 `features:` 목록을 갱신한다.
- [ ] Global Constraints의 임시 `distDir` 빌드 규칙에 따라 `npx next build`를 실행해 `/`·`/gpsmap` First Load JS를 실측 기록표 "변경 후" 열에 기입하고, 홈 **295 kB 이하** 및 `next.config.ts` 원복을 확인한다.
- [ ] `git status`로 변경 상태를 확인한다.
