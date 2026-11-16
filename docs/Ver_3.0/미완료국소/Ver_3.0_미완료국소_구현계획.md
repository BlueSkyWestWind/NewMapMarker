# 미완료 국소 탭 · 미배정 국소 제외 구현계획

> **실행 방식:** 구현(코드 작성)은 agy가 하고, Claude가 diff를 검토해 틀린 곳을 고친다. 1부(제외, E1~E4)와 2부(탭, T1~T4)를 agy 지시서 두 개로 나눠 진행하고, 부마다 Claude가 검증한다. 설계: [Ver_3.0_미완료국소_설계.md](Ver_3.0_미완료국소_설계.md) · 구현: [Ver_3.0_미완료국소_구현.md](Ver_3.0_미완료국소_구현.md)(구현 뒤 작성).

**Goal:** 취소·불필요 국소를 제외 목록(DB)으로 정리하고, 미시설·일부완료 국소를 각각의 탭에서 보며 바로 다시 잡거나 일정표로 이동하거나 제외한다.

**Architecture:** 판단은 순수 모듈(`lib/*.ts`)과 테스트, DB는 새 테이블 1개(`schedule_excluded_stations`, 사용자가 SQL 적용), 화면(`.tsx`)은 얇게 연결한다. 미완료 조회는 기존 `schedule_cells` 시행 결과 컬럼을 쓴다.

**Tech Stack:** Next.js 15 · React 19 · TypeScript · TanStack Query · Supabase(RLS) · zustand(점프 스토어) · Vitest. 의존성 추가 없음.

## Global Constraints

- **커밋하지 않는다(agy).** 사용자가 "커밋"을 요청할 때만 한다.
- **문서(`docs/`, `AGENTS.md`, `README.md`, `supabase/migrations/README.md`)는 수정하지 않는다.** SQL 마이그레이션 파일 1개(Task E1)는 만든다. **Supabase를 로컬에서 실행하지 않는다**(파일만 만들고 사용자가 적용). SQL 적용 전에도 앱이 죽지 않아야 한다.
- **동작 보존**: 기존 일정 저장·1B·S1~S5·엑셀·인쇄 코드는 바꾸지 않는다. `findUnscheduledStations`는 새 인자를 **생략하면 지금과 똑같이** 동작해야 하고 기존 테스트가 수정 없이 통과해야 한다.
- **`.tsx` 테스트는 실행되지 않는다**(`vitest.config.ts`는 `.ts`만). 테스트할 로직은 모두 `.ts` 순수 모듈로 뺀다. 훅·컴포넌트 렌더 테스트를 추가하지 않는다.
- 표 셀 줄바꿈 금지·가로 스크롤 금지(세로 스크롤은 허용). 폭 상수는 `shell/constants.ts`에만. 실명 금지(`팀장A`·`국소A` 같은 가짜 값). 그라디언트·글로·그림 이모지·`transition-all`·대문자+넓은 자간 금지(`style-guard`). 날짜 입력은 `@/components/ui/date-picker`의 `DatePicker`(브라우저 기본 date 입력 금지). shadcn 컴포넌트를 새로 설치하지 않는다(필요하면 보고서에 적는다).
- **모든 명령은 포그라운드로 실행하고 출력이 화면에 보이게 한다. 백그라운드 작업(background task, `&`, `Start-Process`)으로 돌려 두고 기다리지 않는다.**
- **TDD**: 순수 모듈은 테스트를 먼저 쓰고 실패(모듈 없음)를 확인한 뒤 구현한다. 기대값은 코드가 돌려준 값을 베끼지 않고 설계·손계산에서 정한다.
- 검증 명령: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`. 기존 줄바꿈(CRLF/LF)을 파일마다 유지(`git diff --stat`으로 전체 줄이 바뀌지 않았는지 확인), BOM 없는 UTF-8.
- 홈 First Load JS 283 kB를 늘리지 않는다(시설일정은 `dynamic()` 패널). 빌드는 Claude가 임시 distDir로 확인한다.
- 의존 방향: `src/lib/arch-guard.test.ts`가 피처 간 import를 막는다. 새 import가 걸리면 `ALLOW`를 늘리지 말고 보고서에 적는다(`schedule`이 `shell` 스토어를 쓰는 것은 기존 `ScheduleSectionSwitch`가 이미 한다).

## Review Focus

1. 제외 키가 **미배정 목록의 이름 규칙(`normalize`·`nameKeys`)과 같은지**, 제외 후 목록에서 실제로 빠지는지, 복원 후 돌아오는지 (E2 테스트).
2. SQL의 RLS(조회 로그인 전체·추가/삭제 관리자만), 제약(`reason`, `other`이면 메모 필수), `ON CONFLICT DO NOTHING` 경로가 INSERT 정책만으로 동작하는지 (E1).
3. 새 세그먼트 키가 `isMapSegment`·`nav-model`·메뉴 목록·모바일에서 **지도 화면으로 새지 않는지** (T1 테스트).
4. 미완료 조회가 `result_status`로 정확히 걸리고, 다시 잡은 건·제외 건이 기본 보기에서 빠지며 500건 초과를 알리는지 (T2).
5. [일정표에서 보기] 점프가 대상을 한 번만 소비하고 `ScheduleView`의 기존 보기 상태 복원(1A)을 깨지 않는지 (T3).

---

# 1부. 제외 목록 (E1~E4)

### Task E1: DB 테이블 `schedule_excluded_stations`

**Files:** Create `supabase/migrations/20261122000000_schedule_excluded_stations.sql`

**Steps:**
- [ ] `supabase/migrations/20261121000000_schedule_apply_groups.sql`과 `03_facility_schedule.sql`의 RLS 정책(`is_app_admin`)·머리 주석 형식을 읽고 같은 방식으로 쓴다. 설계 §3.1의 컬럼·제약 그대로: `id uuid PK default gen_random_uuid()`, `station_key text NOT NULL UNIQUE`(1~200자, `btrim` 비어 있지 않음), `label text NOT NULL`(1~200자), `marker_id text NULL`, `reason text NOT NULL CHECK (reason IN ('canceled','unneeded','other'))`, `note text NOT NULL DEFAULT ''`(100자 이하, `reason <> 'other' OR length(btrim(note)) > 0`), `created_by uuid DEFAULT auth.uid()`, `created_at timestamptz NOT NULL DEFAULT now()`.
- [ ] `ALTER TABLE … ENABLE ROW LEVEL SECURITY`; 정책: SELECT → `authenticated` `USING (true)`, INSERT → `authenticated` `WITH CHECK ((SELECT public.is_app_admin()))`, DELETE → `authenticated` `USING ((SELECT public.is_app_admin()))`. UPDATE 정책은 만들지 않는다. `GRANT`는 기존 일정 테이블 migration이 하는 방식을 따른다(필요 없으면 하지 않는다). `NOTIFY pgrst, 'reload schema';`. 다시 실행해도 안전(`IF NOT EXISTS`, `DROP POLICY IF EXISTS`).
- [ ] 머리 주석(목적, 컬럼 설명, 적용 방법, 되돌리는 방법 `DROP TABLE public.schedule_excluded_stations;`)과 **적용 후 확인 절차**를 SQL 주석으로 넣는다(SQL Editor에서 실행, 가짜 값 `__확인용국소__`만 쓰고 끝에 지움): (a) 한 건 추가 → 조회 1건 (b) 같은 `station_key`를 `ON CONFLICT (station_key) DO NOTHING`으로 다시 추가 → 여전히 1건 (c) `reason='other'`이고 `note=''` → 제약 오류 (d) 정리 삭제. 비관리자 확인은 앱에서 일반 계정으로 [제외]가 막히는지 본다.
- [ ] 파일이 UTF-8(BOM 없음)이고 이름 순서가 `20261121000000_…`보다 뒤인지 확인한다. Supabase를 실행하지 않는다.

### Task E2: `lib/excluded-stations.ts`와 `findUnscheduledStations` 제외 키

**Files:** Create `src/features/schedule/lib/excluded-stations.ts`, `excluded-stations.test.ts`; Modify `src/features/schedule/lib/unscheduled-stations.ts`, `unscheduled-stations.test.ts`

**Interface:**
```ts
export type ExclusionReason = "canceled" | "unneeded" | "other";
export const EXCLUSION_REASONS: readonly { key: ExclusionReason; label: string }[]; // 사업 취소 · 시설 불필요 · 기타
export const EXCLUSION_NOTE_MAX = 100;
export interface ExcludedStation { id: string; stationKey: string; label: string; markerId: string | null; reason: ExclusionReason; note: string; createdAt: string }
export interface ExclusionRow { station_key: string; label: string; marker_id: string | null; reason: ExclusionReason; note: string }
export function exclusionKey(name: string): string;                       // features/worksite-weather/lib/site-search 의 normalize 와 같은 규칙
export function validateExclusion(input: { reason: ExclusionReason; note: string }): { ok: true; note: string } | { ok: false; error: "note-required" | "note-too-long" };
export function buildExclusionRows(items: { label: string; markerId?: string | null }[], reason: ExclusionReason, note: string): ExclusionRow[]; // station_key 중복 제거(앞의 것 유지), 빈 이름 제외, note는 trim
export function excludedKeySet(rows: readonly { stationKey: string }[]): Set<string>;
export function isExcludedText(text: string, keys: ReadonlySet<string>): boolean;      // exclusionKey(text) 가 집합에 있는가
// unscheduled-stations.ts
export function findUnscheduledStations(markers, scheduledNames, excludedKeys?: ReadonlySet<string>): UnscheduledStation[]; // nameKeys 중 하나라도 excludedKeys 에 있으면 뺀다. 생략하면 지금과 같다
```
**Steps(TDD):**
- [ ] 테스트 먼저(FAIL 확인): `exclusionKey`(공백·대소문자), `validateExclusion`(사업 취소+빈 메모 OK, 기타+빈 메모/공백 메모 → `note-required`, 101자 → `note-too-long`, 메모는 trim해 돌려줌), `buildExclusionRows`(중복 키 하나만, 빈 이름 제외, marker_id 없으면 null, 라벨은 원문 trim), `excludedKeySet`, `isExcludedText`. `unscheduled-stations.test.ts`: 제외 키가 **국소명**으로 걸릴 때 / **별칭**(`siteAlias`)으로 걸릴 때 / **최종국소명**으로 걸릴 때 빠지고, `excludedKeys` 생략·빈 집합이면 결과가 같다. 기존 테스트는 수정 없이 통과.
- [ ] 구현 → PASS. `normalize`는 `@/features/worksite-weather/lib/site-search`에서 가져온다(`unscheduled-stations.ts`가 이미 그렇다). `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`.

### Task E3: API와 훅

**Files:** Modify `src/features/schedule/api.ts`(+`api.test.ts`), `hooks/use-unscheduled-stations.ts`; Create `src/features/schedule/hooks/use-excluded-stations.ts`

**Interface:**
```ts
// api.ts
export async function fetchExcludedStations(supabase): Promise<ExcludedStation[]>;            // 최근 제외 순, 테이블이 없으면 오류를 그대로 던진다(훅이 isScheduleTableMissing으로 판별)
export async function addExcludedStations(supabase, rows: ExclusionRow[]): Promise<number>;   // upsert(rows, { onConflict: "station_key", ignoreDuplicates: true }).select("id") → 새로 들어간 행 수
export async function restoreExcludedStation(supabase, id: string): Promise<void>;            // delete().eq("id").select("id"), 0건이면 Error("복원되지 않았습니다. 이미 지워졌거나 권한이 없습니다.")
// hooks/use-excluded-stations.ts
export function useExcludedStations(enabled = true): { rows: ExcludedStation[]; keys: Set<string>; isTableMissing: boolean; isLoading: boolean; error: unknown; refresh: () => Promise<void> };
```
**Steps(TDD):**
- [ ] `api.test.ts`에 테스트 먼저(기존 쿼리 빌더 모킹 방식): 조회 컬럼 매핑(snake→camel), 추가가 `upsert` 옵션(`onConflict: "station_key"`, `ignoreDuplicates: true`)으로 불리고 반환 건수가 `data.length`인지, 복원 0건 오류·오류 전달.
- [ ] 훅: `useQuery`(키 `[...SCHEDULE_QUERY_KEY, "excluded", userId]`, `staleTime` 60초, `isScheduleTableMissing(error)`이면 오류로 만들지 않고 빈 목록 + `isTableMissing: true`, 테이블 없음 결과는 캐시하지 않는 `staleTime` 처리는 `use-schedule-freezes.ts`를 따라 한다). `refresh`는 그 키를 무효화한다. `keys`는 `excludedKeySet(rows)`를 `useMemo`로.
- [ ] `use-unscheduled-stations.ts`: `useExcludedStations(enabled)`의 `keys`를 `findUnscheduledStations`에 넘긴다(`useMemo` 의존성에 추가). 제외 목록 조회가 실패(`error`)해도 미배정 목록은 평소처럼 보인다(빈 집합). 반환에 `excluded`(rows)·`isExclusionTableMissing`·`refreshExcluded`를 더한다.
- [ ] `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`.

### Task E4: 제외 창과 미배정 창 연결

**Files:** Create `src/features/schedule/components/schedule-exclude-dialog.tsx`; Modify `schedule-unscheduled-dialog.tsx`

**Steps:**
- [ ] `ScheduleExcludeDialog`(`open`, `onOpenChange`, `items: { label: string; markerId?: string | null }[]`, `onDone: () => void`, `title`): 대상 국소 이름 목록(최대 5개 + `외 N건`, 줄바꿈 없이 말줄임), 사유 라디오 3개(`EXCLUSION_REASONS`), 메모 입력(`maxLength=100`, 기타 선택 시 필수 표시), [취소]·[제외]. 확인 문구 `N건을 제외합니다. 제외한 국소는 미배정 목록과 미완료 탭에서 사라집니다.`를 창 안에 보인다. 저장: `validateExclusion` → `buildExclusionRows` → `addExcludedStations`. 성공하면 토스트 `N건을 제외했습니다`, `onDone()`, 닫기. 실패하면 창을 열어 둔 채 오류 문구(입력 유지). 테이블이 없으면(`isScheduleTableMissing`) "DB에 제외 테이블이 없습니다. 마이그레이션(20261122000000_schedule_excluded_stations.sql)을 적용해 주세요".
- [ ] 미배정 창: 체크한 국소가 있고 관리자(`useAuthSession`의 관리자 여부 — `schedule-view.tsx`가 `isAdmin`을 얻는 방식을 따라 읽는다)이면 도구 줄에 **[제외 (N)]** 버튼, 누르면 `ScheduleExcludeDialog`(items = 체크한 국소의 `label`·`id`). 성공 시 선택을 비우고 `refreshExcluded()`.
- [ ] 창 위쪽에 `제외한 국소 (N)` 전환 버튼(N = 제외 건수, 0이면 비활성). 켜면 국소 목록 대신 제외 목록 표(국소명 · 사유 · 메모 · 제외한 날짜(`createdAt` 앞 10자))를 보이고 줄마다 **[복원]**(관리자만). 복원은 `restoreExcludedStation` 후 `refreshExcluded()`와 토스트(`복원했습니다`), 실패 토스트. 이 보기에서는 `일정에 추가` 도구 줄을 숨긴다. 표는 줄바꿈 금지·말줄임·가로 스크롤 금지, 기존 목록 표의 클래스와 같게.
- [ ] 제외 테이블이 없으면(`isExclusionTableMissing`) 전환 버튼 대신 아무 것도 보이지 않고, [제외]는 위 안내를 보인다(미배정 목록은 그대로).
- [ ] `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`.

---

# 2부. 미완료 탭 (T1~T4)

### Task T1: 셸 세그먼트와 탭 메뉴

**Files:** Modify `src/features/shell/types/segment.ts`, `shell/lib/nav-model.ts`(+테스트), `src/features/schedule/components/schedule-section-switch.tsx`, `src/features/shell/components/app-shell.tsx`(`ScheduleMain`의 `section` 처리), 필요하면 `mobile-shell.tsx`·`nav-tree.tsx`·`use-shell-nav.ts`(타입에 맞춰서만)

**Steps:**
- [ ] 먼저 `segment.ts`·`nav-model.ts`·`nav-model.test.ts`(있으면)·`use-shell-nav.ts`·`schedule-section-switch.tsx`와 `app-shell.tsx`의 `ScheduleMain` 동적 import 대상 컴포넌트를 읽는다.
- [ ] `ScheduleSegment`를 `"facility" | "daily" | "mail" | "undone" | "partial"`로. `SEGMENT_META`에 `undone: { label: "미시설", icon }`, `partial: { label: "일부완료", icon }`(lucide 아이콘, 기존 import 방식; 후보 `CircleSlash`·`CircleDashed`, 없으면 다른 것). `isMapSegment`에 `undone`·`partial`을 **반드시** 제외 조건으로 추가한다(키 나열 방식). 일정관리 하위 목록 `schedule: ["facility","daily","mail","undone","partial"]`, 설명 문구에 "미시설·일부완료 국소를 모아 봅니다"를 덧붙인다(기존 문구는 유지하고 이어 붙임).
- [ ] `ScheduleSectionSwitch`의 `SECTIONS`와 `section` prop 타입에 새 두 키를 더한다. 사이드바·모바일 메뉴는 `nav-model`의 목록·`SEGMENT_META`를 쓰므로 자동 반영되는지 확인하고, 하드코딩된 `facility|daily|mail` 분기가 있으면 새 키를 더한다.
- [ ] `ScheduleMain`(일정관리 본문 래퍼)이 `section`이 `undone`/`partial`이면 `ScheduleIncompleteView`(T4, 지연 로드 `dynamic`)를 그리고 아니면 기존 그대로. 타입이 안 맞는 곳(`ScheduleView`의 `section` prop 등)은 기존 세 키로 좁혀서 넘긴다.
- [ ] **테스트 먼저**: `isMapSegment("undone") === false`·`isMapSegment("partial") === false`, `nav-model`의 일정관리 하위 목록 순서(`["facility","daily","mail","undone","partial"]`)와 라벨(`미시설`·`일부완료`), `subLabelOf("schedule", …, "undone")`가 `미시설`인지. 기존 테스트는 수정 없이 통과.
- [ ] `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`. (T4 전에는 `ScheduleIncompleteView`가 없으므로 이 단계에서는 임시 자리표시 컴포넌트를 만들지 말고, T1과 T4를 같은 지시서에서 이어서 한다.)

### Task T2: 조회 로직

**Files:** Create `src/features/schedule/lib/incomplete-list.ts`, `incomplete-list.test.ts`, `src/features/schedule/hooks/use-incomplete-cells.ts`; Modify `api.ts`(+`api.test.ts`)

**Interface:**
```ts
// lib/incomplete-list.ts
export const INCOMPLETE_LIMIT = 500;
export function isRescheduled(cell: ScheduleCell): boolean;   // cell.result?.rescheduledTo 가 비어 있지 않음
export function selectIncomplete(cells: readonly ScheduleCell[], opts: { includeRescheduled: boolean; excludedKeys: ReadonlySet<string> }): ScheduleCell[];
//   includeRescheduled=false 이면 다시 잡은 건 제외, 칸 글(mainText)의 exclusionKey 가 excludedKeys 에 있으면 제외. 정렬: workDate 내림차순 → 같은 날짜는 columnId 안정 순(입력 순서 유지) → rowNo 오름차순
export function incompleteCounts(cells: readonly ScheduleCell[]): { total: number; open: number };  // total=전체, open=다시 안 잡은 건
// api.ts
export interface IncompleteQuery { status: "undone" | "partial"; from?: string | null; to?: string | null; columnIds?: string[] }
export async function fetchIncompleteCells(supabase, q: IncompleteQuery): Promise<{ cells: ScheduleCell[]; truncated: boolean }>;
//   schedule_cells 에서 result_status = q.status, 기간(.gte/.lte, isValidIso 일 때만)·팀(.in) 필터, work_date 내림차순·row_no 오름차순, INCOMPLETE_LIMIT+1 건을 요청해 초과면 truncated, 앞의 INCOMPLETE_LIMIT 건만. 시행 결과 컬럼이 없으면(기존 isResultColumnMissing) 오류를 그대로 던진다
```
**Steps(TDD):**
- [ ] 테스트 먼저: `isRescheduled`(null·빈 문자열·날짜), `selectIncomplete`(다시 잡은 건 기본 제외/포함 시 보임, 제외 키 칸 글 정규화로 빠짐 — `국소 A`와 `국소a`가 같은 키, 정렬 손계산: 날짜 `11-10` 팀B 행0 / `11-12` 팀A 행1 / `11-12` 팀A 행0 → `11-12`행0, `11-12`행1, `11-10`), `incompleteCounts`. `api.test.ts`: 상태·기간·팀 필터 호출 형태, 501건 반환 → `truncated: true`+500건, 결과 컬럼 없음 오류 전달.
- [ ] 훅 `useIncompleteCells(query, enabled)`: `useQuery`(키 `[...SCHEDULE_QUERY_KEY, "incomplete", userId, status, from, to, 팀 id 정렬]`, `staleTime` 30초, `refetchOnWindowFocus: false`, `retry: false`), `data`·`isLoading`·`error`·`isResultColumnMissing` 여부를 돌려준다.
- [ ] `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`.

### Task T3: 점프 스토어와 `ScheduleView` 연결

**Files:** Create `src/features/schedule/store/use-schedule-jump-store.ts`, `use-schedule-jump-store.test.ts`; Modify `components/schedule-view.tsx`

**Interface:**
```ts
export interface JumpTarget { date: string; cellId: string | null }
export interface ScheduleJumpState { target: JumpTarget | null; request: (target: JumpTarget) => void; consume: () => JumpTarget | null }  // consume: 대상을 돌려주고 비운다. 없으면 null
export const useScheduleJumpStore: UseBoundStore<…>;  // zustand, persist 하지 않는다
```
**Steps(TDD):**
- [ ] 스토어 테스트 먼저: `request` 후 `consume`이 대상을 돌려주고 두 번째 `consume`은 `null`, `request`를 두 번 하면 마지막 것만, 초기 `null`.
- [ ] `ScheduleView`: 마운트 때와 `target`이 바뀔 때 `consume()`로 대상을 읽어 있으면 1A의 날짜 이동(`jumpToDate`)과 `highlightCellId` 설정을 **그대로** 호출한다(`cellId`가 `null`이면 날짜 이동만). 1A의 보기 상태 복원(`loadDateState` 등)이 먼저 적용된 뒤 점프가 덮어쓰도록 순서를 확인한다. `section`이 `facility`일 때만 소비한다. 기존 동작(검색 결과 클릭 점프)은 바꾸지 않는다.
- [ ] `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`.

### Task T4: `ScheduleIncompleteView`

**Files:** Create `src/features/schedule/components/schedule-incomplete-view.tsx`

**Steps:**
- [ ] props: `status: "undone" | "partial"`. 머리: 제목(`미시설 국소` / `일부완료 국소`), 건수(`incompleteCounts` → `아직 다시 안 잡은 N건 · 전체 M건`), `다시 잡은 것 포함` 체크, 팀 칩(비고 열 제외, 기본 전체), 기간 `DatePicker` 두 개(끝이 시작보다 빠르면 조회하지 않고 안내), 새로고침 버튼. 필터 상태는 컴포넌트 안(`useState`)에 둔다(`status`가 바뀌면 그대로 유지해도 되지만 `key`로 분리해 초기화해도 된다).
- [ ] 데이터: `useIncompleteCells`, 열 정보는 `useScheduleRange`가 쓰는 열 조회/`fetchScheduleColumns`를 읽고 같은 훅을 재사용(없으면 `api.ts`의 열 조회 함수로 `useQuery`), 제외 키는 `useExcludedStations().keys`. `selectIncomplete`로 걸러 표시. 500건 초과면 "최근 500건만 표시합니다. 팀·기간으로 좁혀 보세요". 시행 결과 컬럼이 없으면 "시행 결과 기능을 쓰려면 마이그레이션(20261109000000_schedule_result.sql)이 필요합니다". 비어 있으면 `${status 라벨} 국소가 없습니다`(필터가 있으면 "조건에 맞는 국소가 없습니다").
- [ ] 표(줄바꿈 금지·말줄임, 가로 스크롤 금지, 세로 스크롤 허용, 헤더 고정은 선택): `날짜(요일)` · `팀` · `국소`(`mainText`, `subText`는 흐리게 덧붙임, 전체는 `title`) · `사유`(`result.reason`) · `다시 잡은 날짜`(없으면 `-`를 `text-amber-300`, 있으면 `MM-DD`) · `동작`. 동작 버튼은 작은 버튼 3개: **[일정표에서 보기]**(모두), **[다시 잡기]**·**[제외]**(관리자만). 폭은 `shell/constants.ts`에 숫자를 적지 말고 열 비율(`w-…` 클래스)로.
- [ ] [일정표에서 보기]: `useScheduleJumpStore.getState().request({ date: cell.workDate, cellId: cell.id })` 후 `useShellStore.getState().setScheduleSegment("facility")`. [다시 잡기]: 기존 `ScheduleResultDialog`(`schedule-result-dialog.tsx`)를 그 칸으로 연다(`cell`·`canEdit`·`onClose`·`onSaved` 인자는 파일을 읽고 맞춘다). `onSaved`에서 `useIncompleteCells`를 다시 읽는다(쿼리 무효화). [제외]: `ScheduleExcludeDialog`(items = `[{ label: cell.mainText }]`, `title`은 `미완료 국소 제외`), 성공 시 제외 목록·미배정 쿼리 무효화(`useExcludedStations().refresh`).
- [ ] 관리자가 아니면 [다시 잡기]·[제외]를 숨기고 조회만 한다. 로딩·오류 상태 문구를 기존 화면(`schedule-view`)의 톤으로.
- [ ] `ScheduleMain`(T1)과 연결하고, 일정관리 머리글(`ScheduleSectionSwitch`)이 이 화면에서도 보이는지 `ScheduleMain`/기존 `ScheduleView`의 머리글 구성을 읽고 같은 방식으로 둔다(탭 사이를 오갈 수 있어야 한다).
- [ ] `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`.

---

# 보완. 시설 완료 판정 (X1, 설계 §3.5)

**Files:** Modify `src/features/schedule/lib/unscheduled-stations.ts`(+`unscheduled-stations.test.ts`), `lib/incomplete-list.ts`(+`incomplete-list.test.ts`), `components/schedule-incomplete-view.tsx`

**Interface:**
```ts
// unscheduled-stations.ts (nameKeys 는 export 한다)
export function installedDateByName(markers: readonly UnscheduledSource[]): Map<string, string>;
//   hasNoInstallDate(marker) 가 false 인 마커마다, 마커와 장비 기록의 비어 있지 않은 installDate 중 가장 늦은 값(문자열 비교, trim)을 nameKeys(marker) 각 키에 넣는다. 같은 키가 여러 마커에 걸리면 더 늦은 날짜를 남긴다. 시설일이 없는 마커는 넣지 않는다.
// incomplete-list.ts
export function installedDateOf(cell: ScheduleCell, installed: ReadonlyMap<string, string>): string | null; // exclusionKey(cell.mainText) 로 조회
export function countInstalled(cells: readonly ScheduleCell[], installed: ReadonlyMap<string, string>): number;
export function selectIncomplete(cells, opts: { includeRescheduled; excludedKeys; columnOrder?; installedDates?: ReadonlyMap<string, string>; includeInstalled?: boolean }): ScheduleCell[]; // includeInstalled 가 true 가 아니고 installedDates 에 칸의 키가 있으면 뺀다. 두 인자를 생략하면 지금과 같다
```
**Steps(TDD):**
- [ ] 테스트 먼저(FAIL 확인): `installedDateByName` — ① 시설일이 있는 마커가 국소명·최종국소명·별칭 키로 모두 조회됨 ② 마커 `installDate`가 비고 장비 기록 하나에만 시설일이 있어도 포함(= 시설 완료) ③ 마커 날짜와 기록 날짜가 다르면 가장 늦은 값 ④ 시설일이 전부 비면 맵에 없음 ⑤ 같은 키가 두 마커에 걸리면 늦은 날짜. `selectIncomplete`/`installedDateOf`/`countInstalled` — ⑥ 시설 완료 칸은 기본으로 빠지고 `includeInstalled: true`면 보인다 ⑦ **시설일(10-31)이 칸 날짜(11-10)보다 앞이어도 빠진다**(실제 사례) ⑧ 칸 글 정규화(`국소 A` vs `국소-a`)로 걸린다 ⑨ `installedDates` 생략 시 기존 시험이 그대로 통과 ⑩ `countInstalled`가 숨겨지는 건수와 같다. 기대값은 손계산.
- [ ] 구현 → PASS. 기존 테스트는 수정 없이 통과.
- [ ] 화면: `useMapMarkersQuery().data?.equipmentMarkers`(use-unscheduled-stations.ts 방식)로 `installedDateByName`을 `useMemo`로 만들고 `selectIncomplete`에 넘긴다. `시설 완료된 것 포함` 체크(기본 꺼짐)를 `다시 잡은 것 포함` 옆에 둔다. 머리 건수 줄에 `시설 완료 N건 숨김`(체크를 켜면 `시설 완료 N건 포함`). `후속 일정` 열: 다시 잡았으면 기존 표시, 아니고 시설 완료 날짜가 있으면 `시설일 MM-DD`(`text-emerald-300`), 둘 다 아니면 `-`. 마커를 읽는 중이면 목록 대신 로딩, 읽지 못하면 판정 없이 모두 보이고 위 안내를 보인다.
- [ ] `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`.

---

# 최종: 검증과 문서 (Claude)

- [ ] agy diff를 전부 읽는다. Review Focus 5항목을 직접 확인한다(특히 SQL의 RLS·제약, 제외 키 규칙, `isMapSegment`, 점프 소비, 500건 초과).
- [ ] `tsc`·`eslint`·`npm test`와 임시 distDir 빌드(홈 번들 비교)를 직접 돌린다. 변이 확인(예: 제외 키 비교를 끄면 미배정 제외 시험이, `isMapSegment`에서 새 키를 빼면 셸 시험이, 다시 잡은 건 제외 조건을 끄면 목록 시험이 빨개지는지).
- [ ] 문서(Claude): 구현 문서(`Ver_3.0_미완료국소_구현.md`)에 결과와 **"직접 하실 일"**(① SQL Editor에서 마이그레이션 실행 → 적용 후 확인 스크립트 ② 미배정 창 [제외]·`제외한 국소`·[복원] ③ 미시설·일부완료 탭 목록·필터·[일정표에서 보기]·[다시 잡기]·[제외]), `supabase/migrations/README.md`에 새 마이그레이션 추가, `docs/README.md` 목차 갱신.
