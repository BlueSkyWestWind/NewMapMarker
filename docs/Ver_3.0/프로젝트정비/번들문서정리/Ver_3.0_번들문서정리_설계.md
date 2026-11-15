# 번들 · 죽은 코드 · 문서 정리 (설계)

작성일 2026-11-14 · 대상: 동적 import 전환, 미사용 파일·중복 유틸 정리, `AGENTS.md`·`supabase/migrations/README.md` 동기화 · 구현계획: [Ver_3.0_번들문서정리_구현계획.md](Ver_3.0_번들문서정리_구현계획.md) · 구현: [Ver_3.0_번들문서정리_구현.md](Ver_3.0_번들문서정리_구현.md)

## 1. 배경과 결정 사항

구조 점검(2026-11-14)에서 `xlsx`·`Leaflet`의 정적 import 잔존, `app-shell.tsx`의 무조건 선로딩, 미사용 파일 2건, 소규모 중복 유틸 2건, 그리고 `AGENTS.md`·`supabase/migrations/README.md`와 실제 코드/파일 간 불일치가 확인되었다. 이 문서는 번들 경량화·코드 정리·문서 동기화의 범위와 기준을 정한다.

**사용자가 정한 것**

| # | 결정 | 날짜 |
|---|---|---|
| 1 | `worksite-weather/lib/export-tbm.ts`는 복원/삭제 결정 전까지 **건드리지 않고** 보존한다(`AGENTS.md` 규칙) | 2026-11-14 |
| 2 | `AGENTS.md` 변경은 사용자 규칙상 사전 확인 대상이므로 구현 전 사용자 확인 항목(§6)에 둔다 | 2026-11-14 |

**설계에서 정한 것(사용자 확인 대상은 §6)**

| # | 결정 |
|---|---|
| 3 | `xlsx` 정적 import 2곳(`lookup-excel.ts`, `read-schedule.ts`)을 호출 시점 `await import("xlsx")`로 전환한다(§3.1) |
| 4 | `/gpsmap` 페이지(`gpsmap-page.tsx`)의 `VworldMapPane` 정적 import를 `vworld-pane-overlay.tsx:13`과 동일하게 `dynamic(..., { ssr: false })`로 전환한다 |
| 5 | `app-shell.tsx:122-134` 선로딩은 `authed`·`isAdmin` 조건에 맞춰 분기한다(§6에서 두 안 비교 후 추천) |
| 6 | 참조 0건인 `day-table-widths.ts`, `coming-soon.tsx`는 삭제하고, Bearer 토큰 파싱(`verify-auth-token.ts`에 통합)·카카오-Leaflet 줌 환산식(`coords.ts`에 통합) 중복을 제거한다 |
| 7 | 번들 절감 수치는 추측하지 않고 구현 단계 전후 `npx next build` 실측으로 확인한다(**측정 필요**) |

## 2. 확인한 사실

### 2.1 번들·선로딩 현황

| 대상 | 파일:줄 | 현황 |
|---|---|---|
| `xlsx` 정적 import (바코드) | `src/features/barcode/lib/lookup-excel.ts:1` ← `barcode-lookup-panel.tsx:7` | `parseLookupExcel`(8줄)만 런타임 `XLSX` 사용(`async` 함수) |
| `xlsx` 정적 + `exceljs` 동적 혼용 (일정) | `src/features/schedule/lib/read-schedule.ts:1,20-28,56-87` ← `schedule-import-dialog.tsx:14` | `parseWorkbookBuffer`가 `XLSX.read`/`utils` 사용(`async` 함수). `buildFillAt`(20-28줄)은 `XLSX.utils.encode_cell`만 호출하며 `read-schedule.test.ts:98-114`가 `buildFillAt(ws)`와 `await parseWorkbookBuffer(...)`를 호출 |
| `VworldMapPane` 정적 import (`/gpsmap`) | `src/features/gpsmap/components/gpsmap-page.tsx:11-14` | 홈(`vworld-pane-overlay.tsx:13`)은 `dynamic(..., { ssr: false })`이나 `/gpsmap`는 Leaflet 포함 정적 import |
| 무조건 7개 청크 선로딩 | `src/features/shell/components/app-shell.tsx:115-134` | `authed`(115줄), `isAdmin`(116줄)이 이미 스코프에 선언되어 있으나 122-134줄 `useEffect`는 이를 확인하지 않고 `group-panel` 포함 7개 패널을 `void import(...)` |

### 2.2 죽은 코드 · 중복 유틸

- 미사용 파일: `src/features/schedule/lib/day-table-widths.ts:1-9`, `src/features/shell/components/coming-soon.tsx:1-24` (각 참조 0건), `src/features/worksite-weather/lib/export-tbm.ts:1-105` (보존 대상).
- 중복 로직:
  - Bearer 토큰 추출: `src/lib/api/verify-auth-token.ts:27,38-40`과 `src/features/accounts/server/admin-auth.ts:11-17,83-84` 모두 인자로 `Request`를 받는다.
  - 줌 레벨 환산: `src/features/gpsmap/components/vworld-pane-overlay.tsx:29-30` vs `src/features/gpsmap/components/gpsmap-page.tsx:47-50`.

### 2.3 문서 불일치

- `AGENTS.md` `features:` 목록: 실제 `src/features/` 13개 중 `accounts`, `barcode`, `route`, `site-survey` 4개 누락.
- `supabase/migrations/README.md:11-20` 상단 실행 순서 목록: 실제 `supabase/migrations/`에 존재하는 `20261117000000_marker_address.sql`, `20261117000100_split_jibun_from_road_address.sql`, `20261117000200_survey_settings.sql`, `20261119000000_login_history.sql` 4건 누락.

## 3. 설계

### 3.1 번들 동적 전환 (기존 시그니처 유지)

- **`src/features/barcode/lib/lookup-excel.ts`**: 상단 정적 import를 제거하고 `parseLookupExcel(file: File): Promise<LookupRow[]>` 내부에서 `const XLSX = await import("xlsx");`를 호출한다.
- **`src/features/schedule/lib/read-schedule.ts`**:
  - 상단은 `import type * as XLSXType from "xlsx";`만 남긴다.
  - `buildFillAt(sheet: XLSXType.WorkSheet): ColorAt`는 `XLSX.utils.encode_cell` 대신 순수 A1 주소 변환 헬퍼(`encodeA1Cell(r, c)`)를 사용해 런타임 `XLSX` 의존을 제거한다. 따라서 `buildFillAt(ws)` 시그니처가 그대로 유지되며 `read-schedule.test.ts:98-114` 수정이 필요 없다.
  - `parseWorkbookBuffer` (`async`) 내부 첫 줄에서 `const XLSX = await import("xlsx");`를 호출하고 `orderedSheetNames(workbook, XLSX)` 또는 인라인 로직으로 처리한다.
- **`src/features/gpsmap/components/gpsmap-page.tsx`**: `VworldMapPane`을 `dynamic(() => import("@/features/gpsmap/components/vworld-map-pane").then((m) => m.VworldMapPane), { ssr: false })`로 전환하고 `VworldMapHandle`만 `import type`으로 남긴다.

### 3.2 중복 유틸 통합 인터페이스

```ts
// src/lib/api/verify-auth-token.ts (단일 위치로 확정, admin-auth.ts가 이를 import)
export function extractBearerToken(req: Request): string | null;

// src/features/gpsmap/lib/coords.ts (기존 파일에 추가)
export function leafletZoomFromKakaoLevel(level: number): number;
export function kakaoLevelFromLeafletZoom(zoom: number): number;
```

## 4. 범위 밖

- `worksite-weather/lib/export-tbm.ts` 삭제 또는 UI 복원.
- `xlsx`와 `exceljs`의 전면 단일 라이브러리 통합.
- `docs/이전버젼/` 수정.

## 5. 위험과 검증

- **`read-schedule.ts` A1 인코딩 정확성**: `encodeA1Cell(r, c)`는 `c >= 26` (`AA1` 등)도 지원해야 하므로 `read-schedule.test.ts`로 `buildFillAt` 및 `parseWorkbookBuffer` 통과를 검증한다.
- **검증**: `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test`, 그리고 `npx next build`로 변경 전후 `/`·`/gpsmap` First Load JS(**홈 295 kB 이하**)를 실측 비교한다(**측정 필요**).

## 6. 사용자 확인 필요 항목

1. `AGENTS.md`의 `features:` 목록에 `accounts`, `barcode`, `route`, `site-survey` 4개 피처를 추가하는 문서 수정 승인 여부.
2. 미사용 파일 `day-table-widths.ts`, `coming-soon.tsx` 삭제 승인 여부(`export-tbm.ts`는 보존).
3. `app-shell.tsx` 선로딩 정책 선택(`authed`와 `isAdmin` 변수는 이미 `app-shell.tsx:115-116`에 선언되어 있음):
   - **안 A (`authed` + `isAdmin` 조건부 선로딩, 추천)**: 비로그인 시 선로딩 0건, 로그인 후 기본 6개 선로딩, `group-panel`은 `isAdmin`일 때만 선로딩 → 비로그인/일반 사용자 불필요 청크 다운로드 방지.
   - **안 B (`isAdmin`만 분기)**: 비로그인에서도 로그인 후 6개 패널을 미리 받아 로그인 직후 전환 속도 우선.
