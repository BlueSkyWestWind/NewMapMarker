# 코드리뷰 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2026-11-08 전체 코드리뷰에서 확인된 데이터 유실·무단 변경·저장 재시도 문제를 위험도 순서대로 막는다.

**Architecture:** 각 문제를 부수효과 없는 순수 함수(또는 주입 가능한 의존성을 받는 함수)로 떼어 단위 테스트로 고정하고, 훅·라우트는 그 함수를 부르기만 하게 한다. DB 변경은 `supabase/migrations/*.sql`로 만들어 두고 적용은 사용자가 한다.

**Tech Stack:** Next.js(App Router, TS) · React · zustand · @tanstack/react-query · Supabase(RLS, PostgREST) · vitest · Cloudflare Workers(OpenNext).

**Spec:** 별도 설계서 없음. 근거는 (1) 2026-11-08 코드리뷰 결과(이 세션의 `/code-review high src`)와 (2) 사용자가 승인한 수정 순서(1단계 데이터 보호 → 2단계 저장 안정성 → 3단계 서버 방어 → 4단계 정리). 관련 기존 문서: `docs/Ver_3.0/Ver_3.0_계획.md`.

## Global Constraints

- 패키지 매니저는 **npm**. 검증은 `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npx vitest run`.
- 테스트 파일은 **`.ts`만** 쓴다(`vitest.config.ts` include가 `.ts`뿐 — `.tsx` 테스트는 조용히 실행되지 않는다).
- **Supabase는 로컬 실행 금지.** 테이블·정책 변경은 `supabase/migrations/*.sql`로 만들고 사용자가 적용한다. 적용 안내를 `supabase/migrations/README.md` 표에 한 줄 추가한다.
- dev 서버가 떠 있으면 `next build` 금지(임시 distDir로만). 홈 First Load JS **295 kB 이하** 유지.
- 소스 파일은 CRLF. 편집 후 한글이 깨지지 않았는지 확인한다.
- 미사용 import·변수는 ESLint 오류. 주석은 한국어로 "왜"를 적는다.
- 새 화면·shadcn 컴포넌트 추가 없음. 필요하면 설치 명령만 알려 준다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- **복원 도중 실패**: 삭제는 끝났는데 insert가 중간에 실패해도 사전 백업 파일은 이미 내려받아 있어야 한다(Task 1).
- **사전 백업이 실패하면 복원은 시작하지 않는다**: 파일 다운로드를 못 했는데 DB를 지우면 안 된다(Task 1).
- **일반 사용자의 정상 작업이 막히지 않는다**: 마커 등록·수정·위치등록 저장이 RLS 변경 뒤에도 동작해야 한다(Task 2).
- **같은 대기 마커를 두 번 저장**: 첫 시도가 일부만 들어간 뒤 재시도해도 중복 키 오류 없이 끝나야 한다(Task 3).
- **허용 도메인이 다른 곳으로 리다이렉트**: 타일 프록시가 그 응답을 가져오면 안 된다(Task 5).

---

## 선행 결정 (실행 전 사용자 확인 필요)

**D1 — Task 2의 범위.** 마커 삭제는 일반 로그인 사용자도 쓰는 기능이다(`use-marker-edit-form.ts`의 단건 삭제, `erp-review-save.ts`의 정보·공정 행 교체 삭제). `DELETE`를 관리자 전용으로 막으면 이 작업들이 일반 계정에서 실패한다.
- **안 A (권장 기본값)**: 사용자 중 마커를 등록·수정하는 사람이 모두 관리자(`app_admins`)다 → `DELETE`를 관리자 전용으로 제한하고 Task 2를 그대로 실행.
- **안 B**: 일반 사용자도 삭제해야 한다 → Task 2 건너뜀. 대신 Task 1(사전 백업)로 위험을 줄이고 이 문서의 후속 과제로 "삭제를 RPC로 옮기기"를 남긴다.

D1이 정해지기 전에는 Task 2만 보류하고 나머지는 독립적으로 진행할 수 있다.

---

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `src/features/map-marker/lib/safe-restore.ts` | 파괴적 작업 전에 백업을 먼저 실행하고 실패하면 중단 | 신규 (Task 1) |
| `src/features/map-marker/lib/full-backup-file.ts` | 현재 DB를 백업 엑셀로 내려받는 공용 함수 | 신규 (Task 1) |
| `src/features/map-marker/hooks/use-data-backup-actions.ts` | 복원 앞에 사전 백업 연결, 내보내기는 공용 함수 사용 | 수정 (Task 1) |
| `supabase/migrations/20261113000000_restrict_marker_delete_to_admin.sql` | 장비 5개 테이블 `DELETE`를 관리자 전용으로 | 신규 (Task 2) |
| `src/features/map-marker/lib/save-pending.ts` | 대기 마커 일괄 저장(청크·멱등) | 신규 (Task 3) |
| `src/features/map-marker/lib/chunk.ts` | `chunkArray` 공용화 | 신규 (Task 3) |
| `src/features/map-marker/hooks/use-excel-upload-actions.tsx` | 일괄 등록이 `save-pending`을 부름 | 수정 (Task 3) |
| `src/app/api/admin/users/route.ts` · `src/features/accounts/api.ts` | 207 대신 경고를 담은 정상 응답, 클라이언트가 경고 표시 | 수정 (Task 4) |
| `src/lib/api/tile-fetch.ts` | 허용 호스트 검사 + 리다이렉트 수동 추적 | 신규 (Task 5) |
| `src/app/api/map-tile-proxy/route.ts` | `tile-fetch` 사용 | 수정 (Task 5) |
| `src/lib/api/proxy-guard.ts` | `x-forwarded-host` 신뢰 제거 | 수정 (Task 6) |
| `src/features/site-lists/api.ts` · `hooks/use-site-lists.ts` · `shell/components/app-shell.tsx` | 이벤트 배지가 개수만 조회 | 수정 (Task 7) |

---

### Task 1: 복원 전 사전 백업 (1단계, 최우선)

**Files:**
- Create: `src/features/map-marker/lib/safe-restore.ts`
- Create: `src/features/map-marker/lib/full-backup-file.ts`
- Modify: `src/features/map-marker/hooks/use-data-backup-actions.ts` (`exportFullExcel`, `importFullExcel`)
- Test: `src/features/map-marker/lib/safe-restore.test.ts`

**Interfaces:**
- Produces: `runWithSafetyBackup(backup: () => Promise<void>, destructive: () => Promise<void>): Promise<void>` — `backup`이 던지면 `destructive`를 호출하지 않고 `SafetyBackupError`를 던진다. `class SafetyBackupError extends Error { cause: unknown }`.
- Produces: `downloadFullBackupFile(supabase: SupabaseBrowserClient, baseName: string): Promise<{ rowCount: number }>` — `fetchFullBackupTables` → `MapMarkerExcelManager.exportFullBackupToExcel`(사이트 목록 포함, 마이그레이션 전이면 목록 없이)로 `buildDatedBackupFilename(baseName)` 파일을 내려받는다. 기존 `exportFullExcel`의 본문을 옮긴 것이다.
- Consumes: `fetchFullBackupTables`, `buildDatedBackupFilename`, `isSiteListsTableMissing`, `siteListApi.fetchSiteListBackup` (기존).

- [ ] **Step 1: Write the failing test** — `safe-restore.test.ts`
  - `"백업이 끝난 뒤에 파괴 작업을 실행한다"`: 호출 순서를 기록하는 두 스텁으로 `["backup", "destructive"]`를 기대한다.
  - `"백업이 실패하면 파괴 작업을 호출하지 않고 SafetyBackupError를 던진다"`: `backup`이 `new Error("disk")`를 던지면 `await expect(...).rejects.toBeInstanceOf(SafetyBackupError)`, `destructive` 호출 0회.
  - `"파괴 작업의 오류는 그대로 전달한다"`: `destructive`가 던진 오류가 `SafetyBackupError`가 아닌 원래 오류로 reject.
- [ ] **Step 2: Run** `npx vitest run src/features/map-marker/lib/safe-restore.test.ts` → FAIL(모듈 없음).
- [ ] **Step 3: Implement** `safe-restore.ts`의 위 두 심볼. `backup` 호출을 try/catch로 감싸 `cause`에 담는다.
- [ ] **Step 4: Run** 같은 명령 → PASS.
- [ ] **Step 5: Extract** `exportFullExcel` 본문을 `downloadFullBackupFile`로 옮기고, `exportFullExcel`은 `downloadFullBackupFile(supabase, 'mapmarker_backup')`를 부르고 토스트만 남긴다. 동작 변화 없음을 `npx tsc --noEmit`으로 확인.
- [ ] **Step 6: Wire** `importFullExcel`에서 사용자 확인 직후, `markers`를 지우기 **전에** `runWithSafetyBackup(() => downloadFullBackupFile(supabase, '복원전_mapmarker_backup').then(() => undefined), async () => { …기존 삭제·insert 블록… })`로 감싼다. `SafetyBackupError`는 `"복원 전 백업 파일을 만들지 못해 복원을 중단했습니다. 데이터는 바뀌지 않았습니다."` 토스트로 알린다. 확인 창 문구에 "복원 전 현재 데이터를 파일로 먼저 내려받습니다."를 한 줄 추가한다.
- [ ] **Step 7: Verify** `npx tsc --noEmit && npx eslint src/features/map-marker --max-warnings=0 && npx vitest run` → 모두 통과. 수동: dev 서버에서 작은 백업으로 복원 → 먼저 `…_복원전_mapmarker_backup.xlsx`가 내려받아지고 이어서 복원되는지 확인.
- [ ] **Step 8: Commit** `fix(backup): 복원 전에 현재 데이터를 파일로 먼저 내려받고 실패하면 중단한다`

---

### Task 2: 장비 테이블 삭제 권한을 관리자로 제한 (D1이 안 A일 때만)

**Files:**
- Create: `supabase/migrations/20261113000000_restrict_marker_delete_to_admin.sql`
- Modify: `supabase/migrations/README.md` (적용 표에 한 줄)
- Modify: `src/features/map-marker/lib/erp-review-save.ts:24` (일반 사용자 경로에서 `DELETE`에 의존하지 않게 — 아래 Step 3)
- Modify: `src/features/map-marker/hooks/use-marker-edit-form.ts` (삭제 버튼을 관리자에게만 활성화)

**Interfaces:**
- Consumes: `public.is_app_admin()` — `20261107000000_site_lists.sql`에 정의된 기존 함수(시그니처는 그 파일에서 확인해 그대로 쓴다).
- Produces: 대상 테이블 `markers, information, erp_details, battery_markers, battery_specs`에 정책 `{table}_select_auth`·`{table}_insert_auth`·`{table}_update_auth`(authenticated 전체 허용)와 `{table}_delete_admin`(`USING (public.is_app_admin())`). 기존 `{table}_modify_auth`(`FOR ALL`)는 삭제.

- [ ] **Step 1: Write migration** — 테이블마다 `DROP POLICY IF EXISTS {t}_modify_auth`, 위 4개 정책 생성, 끝에 `NOTIFY pgrst, 'reload schema';`. 파일 주석에 적용 전 확인 쿼리와 되돌리는 SQL(`*_modify_auth` 재생성)을 적는다.
- [ ] **Step 2: Add verification block** (파일 하단 주석): 일반 계정 JWT로 `DELETE /rest/v1/markers?id=eq.x` → 0행 또는 403, 관리자 JWT → 성공.
- [ ] **Step 3: Remove DELETE dependence for non-admins** — `erp-review-save.ts`는 `information`/`erp_details`를 지우고 다시 넣는다. 일반 사용자 저장이 막히지 않도록 `delete().in(...)` + `insert` 를 `upsert`(`onConflict: 'marker_id'` 대신 기존 유니크 키 확인 후 사용)로 바꿀 수 있는지 먼저 스키마를 확인한다. 불가능하면 이 경로는 관리자 전용임을 UI에 표시하고 Task를 여기서 멈춰 사용자에게 알린다.
- [ ] **Step 4: Gate UI** — `useIsAdmin()`을 `use-marker-edit-form.ts`에 연결해 비관리자는 삭제 버튼을 비활성화(툴팁 "관리자만 삭제할 수 있습니다").
- [ ] **Step 5: Verify** — `npx tsc --noEmit && npx vitest run`. 마이그레이션은 **사용자가 적용**한 뒤, 일반 계정으로 등록·수정, 관리자 계정으로 삭제를 각각 확인한다.
- [ ] **Step 6: Commit** `fix(db): 장비 관련 테이블의 삭제를 관리자 전용으로 제한한다`

---

### Task 3: 대기 마커 일괄 등록을 청크·멱등으로 (2단계)

**Files:**
- Create: `src/features/map-marker/lib/chunk.ts`, `src/features/map-marker/lib/save-pending.ts`
- Modify: `src/features/map-marker/hooks/use-data-backup-actions.ts` (로컬 `chunkArray` → `chunk.ts` import)
- Modify: `src/features/map-marker/hooks/use-excel-upload-actions.tsx` (≈850~950행의 장비·축전지 `insert` 두 블록)
- Test: `src/features/map-marker/lib/chunk.test.ts`, `src/features/map-marker/lib/save-pending.test.ts`

**Interfaces:**
- Produces: `chunkArray<T>(rows: T[], size: number): T[][]`.
- Produces: `savePendingEquipment(supabase: SupabaseBrowserClient, input: { markers: Record<string, unknown>[]; info: Record<string, unknown>[] }, chunkSize?: number): Promise<void>` — `markers`는 `upsert(chunk, { onConflict: "id" })`, `info`는 `upsert(chunk)`(기존 코드와 동일).
- Produces: `savePendingBattery(supabase, input: { markers: Record<string, unknown>[]; specs: (Record<string, unknown> & { marker_id: string })[] }, chunkSize?: number): Promise<void>` — `markers`는 `upsert(..., { onConflict: "id" })`; `specs`는 먼저 해당 `marker_id`들에 대해 `delete().in("marker_id", ids)`를 청크로 실행한 뒤 `insert`(재시도 때 규격이 두 배가 되지 않게). 기본 `chunkSize`는 200.

- [ ] **Step 1: Write failing tests**
  - `chunk.test.ts`: `chunkArray([1,2,3,4,5], 2)` → `[[1,2],[3,4],[5]]`; 빈 배열 → `[]`.
  - `save-pending.test.ts`(기록하는 가짜 supabase): 장비 `markers` 450건 → `markers` 테이블에 `upsert`가 200·200·50 세 번, 모두 `{ onConflict: "id" }`; 같은 입력을 두 번 호출해도 예외 없음(가짜가 중복을 오류로 만들지 않고 호출 기록만 확인). 축전지 `specs`는 `battery_specs`에 `delete` → `insert` 순서이고, 두 번 호출하면 `delete`가 두 번.
- [ ] **Step 2: Run** `npx vitest run src/features/map-marker/lib/chunk.test.ts src/features/map-marker/lib/save-pending.test.ts` → FAIL.
- [ ] **Step 3: Implement** 위 시그니처. 실패 시 `throw error`(Supabase 오류 객체 그대로).
- [ ] **Step 4: Run** 위 명령 → PASS.
- [ ] **Step 5: Wire** 훅의 두 블록은 행을 만드는 부분만 남기고 저장은 `savePendingEquipment`/`savePendingBattery`로 교체. 저장 성공 뒤에만 `clearPendingMarkers`(현재 동작 유지).
- [ ] **Step 6: Verify** `npx tsc --noEmit && npx eslint src/features/map-marker --max-warnings=0 && npx vitest run`.
- [ ] **Step 7: Commit** `fix(upload): 대기 마커 일괄 등록을 청크·재시도 안전하게 저장한다`

---

### Task 4: 계정 생성의 관리자 권한 부여 실패를 화면에 알린다 (2단계)

**Files:**
- Modify: `src/app/api/admin/users/route.ts:~120` (207 응답)
- Modify: `src/features/accounts/api.ts` (`createAdminUser`)
- Modify: `createAdminUser`를 호출하는 곳 — `grep -rn "createAdminUser" src`로 찾은 훅/다이얼로그
- Test: `src/features/accounts/lib/account-helpers.test.ts`에 `parseCreateResponse` 테스트 추가

**Interfaces:**
- Produces: 서버 — `app_admins` insert 실패 시에도 `{ user: AdminUser(성공 응답과 같은 모양, isAdmin: false), warning: string }`을 **HTTP 200**으로 반환(상태 207 폐기).
- Produces: `createAdminUser(token, input): Promise<{ user: AdminUser; warning?: string }>`.
- Produces(`account-helpers.ts`): `parseCreateResponse(body: { user: AdminUser; warning?: string }): { user: AdminUser; warning?: string }` — 순수 함수, `warning`이 빈 문자열이면 제거.

- [ ] **Step 1: Write failing test** — `parseCreateResponse({ user, warning: "x" })`는 `warning: "x"` 유지, `warning: ""`은 `warning` 키 없음.
- [ ] **Step 2: Run** `npx vitest run src/features/accounts` → FAIL.
- [ ] **Step 3: Implement** `parseCreateResponse`, 서버 응답 모양 통일(`id/email/createdAt/lastSignInAt/isAdmin`), `createAdminUser` 반환 변경.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Wire** 호출부에서 `warning`이 있으면 `variant: "destructive"` 토스트로 표시하고, 목록에는 `user`를 추가(이미 일반 계정으로 표시).
- [ ] **Step 6: Verify** `npx tsc --noEmit && npx vitest run`.
- [ ] **Step 7: Commit** `fix(accounts): 관리자 권한 부여 실패를 숨기지 않고 경고로 알린다`

---

### Task 5: 지도 타일 프록시의 리다이렉트 SSRF 차단 (3단계)

**Files:**
- Create: `src/lib/api/tile-fetch.ts`
- Modify: `src/app/api/map-tile-proxy/route.ts` (`isAllowedTileHost` 이동, `fetch` 교체)
- Test: `src/lib/api/tile-fetch.test.ts`

**Interfaces:**
- Produces: `isAllowedTileHost(hostname: string): boolean` — 현재 `route.ts`의 함수를 그대로 옮긴다.
- Produces: `fetchAllowedTile(url: URL, fetchImpl?: typeof fetch, maxHops?: number): Promise<Response>` — `redirect: "manual"`로 요청하고 3xx면 `Location`을 절대 URL로 풀어 `isAllowedTileHost`를 다시 검사한 뒤 따라간다. 허용되지 않는 호스트나 `maxHops`(기본 3) 초과면 `TileFetchError`를 던진다.

- [ ] **Step 1: Write failing tests**(주입한 가짜 `fetchImpl` 사용)
  - 허용 호스트 → 허용 호스트 리다이렉트는 따라가서 최종 응답 반환.
  - `https://a.kakao.com/x` → `Location: http://169.254.169.254/` 는 `TileFetchError`, 두 번째 호출 없음.
  - 리다이렉트가 4번 이어지면 `TileFetchError`.
  - 리다이렉트 없는 200은 그대로 반환.
- [ ] **Step 2: Run** `npx vitest run src/lib/api/tile-fetch.test.ts` → FAIL.
- [ ] **Step 3: Implement** 위 시그니처. 요청 헤더(`User-Agent`, `Referer`)와 `AbortSignal.timeout(12000)`은 기존 값 유지.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Wire** 라우트에서 `fetchAllowedTile` 사용, `TileFetchError`는 403으로 응답.
- [ ] **Step 6: Verify** `npx tsc --noEmit && npx vitest run`. 수동: dev 서버에서 지도 캡처(타일 프록시 사용 기능)가 여전히 타일을 가져오는지 확인.
- [ ] **Step 7: Commit** `fix(api): 타일 프록시가 허용되지 않은 호스트로의 리다이렉트를 따라가지 않게 한다`

---

### Task 6: 동일 출처 검사에서 `x-forwarded-host` 신뢰 제거 (3단계)

**Files:**
- Modify: `src/lib/api/proxy-guard.ts:~46-59` (`isSameOriginRequest`)
- Test: `src/lib/api/proxy-guard.test.ts`

**Interfaces:** `isSameOriginRequest(request: NextRequest): boolean`(시그니처 유지). 허용 호스트는 `request.nextUrl.host`와 환경변수(`NEXT_PUBLIC_SITE_URL`, `PROXY_ALLOWED_ORIGINS`)만.

- [ ] **Step 1: Write failing test** — `Origin: https://evil.example` + `X-Forwarded-Host: evil.example`이면 `false`. 기존 테스트(같은 호스트 true, 다른 Origin false)는 그대로 통과해야 한다.
- [ ] **Step 2: Run** `npx vitest run src/lib/api/proxy-guard.test.ts` → 새 테스트 FAIL.
- [ ] **Step 3: Implement** `forwardedHost` 줄 제거.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Verify** 배포 환경에서 `request.nextUrl.host`가 실제 도메인인지 확인(`newmarker.celyoon.workers.dev`). 커스텀 도메인이 있다면 `PROXY_ALLOWED_ORIGINS`에 등록한다는 안내를 README 배포 절에 한 줄 추가.
- [ ] **Step 6: Commit** `fix(api): 클라이언트가 보낸 x-forwarded-host를 출처 검사에 쓰지 않는다`

---

### Task 7: 이벤트 배지를 개수 조회로 (4단계)

**Files:**
- Modify: `src/features/site-lists/api.ts` (추가), `src/features/site-lists/hooks/use-site-lists.ts` (추가), `src/features/shell/components/app-shell.tsx`
- Test: `src/features/site-lists/api.test.ts`(없으면 신규, `.ts`)

**Interfaces:**
- Produces: `fetchSiteListCount(supabase: SupabaseBrowserClient): Promise<number>` — `site_lists`에 `select("id", { count: "exact", head: true })`. 오류는 던진다.
- Produces: `useSiteListCount(): number` — `useQuery`(키 `[...SITE_LISTS_QUERY_KEY, "count", userId]`, `enabled: Boolean(supabase && userId)`, `staleTime: 5 * 60_000`, `retry: false`), 데이터 없으면 `0`.

- [ ] **Step 1: Write failing test** — 가짜 supabase가 `{ count: 2, error: null }`을 돌려주면 `fetchSiteListCount`는 `2`; `count: null`이면 `0`; `error`가 있으면 reject.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Wire** `app-shell.tsx`의 `useSiteLists()`를 `useSiteListCount()`로 바꾸고 `segmentCounts.location`에 연결.
- [ ] **Step 6: Verify** `npx tsc --noEmit && npx eslint src --max-warnings=0 && npx vitest run`. 목록 생성·삭제 뒤 배지가 갱신되는지 확인(`SITE_LISTS_QUERY_KEY` 접두 무효화에 걸리는지 확인).
- [ ] **Step 7: Commit** `perf(shell): 이벤트 배지를 목록 전체 대신 개수만 조회한다`

---

## 이 계획에서 제외한 것

- **위치 확인으로 넘긴 행의 메모·태그·색상·구분 보존(리뷰 지적 8)**: 대기 목록 자료구조를 넓히는 설계가 필요하다. 별도 설계(brainstorming → spec)로 다룬다.
- **복원 트랜잭션화**: Supabase 클라이언트만으로는 다중 테이블 트랜잭션이 불가능하다. RPC(Postgres 함수)로 옮기는 별도 과제이며, 당장은 Task 1의 사전 백업이 안전망이다.
- **`NEXT_PUBLIC_*` 빌드 시점 치환**: 현재 배포가 정상 동작해 보류. 문제가 보고되면 `getServerPublicEnv` 경로를 점검한다.

## Self-Review 결과

- 스펙 커버리지: 승인된 8개 항목 중 6개 Task + 선행 결정 1개 + 제외 3개로 모두 위치가 있다(항목 8은 "제외"에 명시).
- 타입 일관성: `chunkArray`는 Task 3에서만 정의하고 Task 1은 건드리지 않는다. `SupabaseBrowserClient`는 기존 `@/lib/supabase/client` 타입을 쓴다.
- Task 2는 D1에 의존하고, Step 3에서 일반 사용자 경로가 깨질 가능성을 스스로 점검하도록 했다.
