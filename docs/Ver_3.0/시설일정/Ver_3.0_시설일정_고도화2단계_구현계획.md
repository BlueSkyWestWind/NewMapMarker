# 시설일정 고도화 2단계 구현계획 (S1~S4)

> **실행 방식:** 구현(코드 작성)은 agy가 하고, Claude가 diff를 검토해 틀린 곳을 고친다. 조각(S1→S2→S3→S4)마다 agy 지시서 하나로 진행하고, 조각이 끝날 때마다 Claude가 검증한다. 설계: [Ver_3.0_시설일정_고도화2단계_설계.md](Ver_3.0_시설일정_고도화2단계_설계.md) · 구현: [Ver_3.0_시설일정_고도화2단계_구현.md](Ver_3.0_시설일정_고도화2단계_구현.md)(구현 뒤 작성). S5(일일일정 Tab 입력)는 설계 §3.5와 이 문서의 "S5" 절에 있다(2026-11-16 추가). S6(기간 묶음, DB 필요)은 별도 설계·계획을 쓴다.

**Goal:** 미배정 재입력·주간 복제·검색 좁히기·완료 표시의 반복을 줄이고, 모두 저장 실패 시 입력이 남고 되돌릴 수 있게 한다.

**Architecture:** 판단은 순수 모듈(`lib/*.ts`)과 테스트, 저장은 1B의 `useScheduleWrite().write`와 `applyOpsToGroups`를 재사용한다. 화면(`.tsx`)은 얇게 연결한다. **새 DB 함수·마이그레이션은 없다.**

**Tech Stack:** Next.js 15 · React 19 · TypeScript · TanStack Query · Supabase(RPC, RLS) · Vitest. 의존성 추가 없음.

## Global Constraints

- **커밋하지 않는다(agy).** 사용자가 "커밋"을 요청할 때만 한다.
- **문서(`docs/`, `AGENTS.md`, `README.md`, `supabase/migrations/README.md`)는 수정하지 않는다.** DB 마이그레이션 파일도 만들지 않는다. Supabase를 실행하지 않는다.
- **동작 보존**: 엑셀 내보내기·가져오기·인쇄(`write-workbook.ts`, `schedule-excel.ts`, `export-*`), 1B 파일(`group-state.ts`, `use-schedule-write.ts`, `undo-stack.ts`, `apply-error.ts`, SQL)의 **기존 동작**은 바꾸지 않는다. Task S4-B에서 `undo-stack.ts`·`use-schedule-write.ts`를 넓히는 것만 허용하고, 기존 테스트가 그대로 통과해야 한다.
- **`.tsx` 테스트는 실행되지 않는다**(`vitest.config.ts`는 `.ts`만). 테스트할 로직은 모두 `.ts` 순수 모듈로 뺀다. 훅·컴포넌트 렌더 테스트를 추가하지 않는다.
- 표 셀 줄바꿈 금지, 가로 스크롤 금지. 폭 상수는 `shell/constants.ts`에만. 실명 금지(`팀장A` 등 가짜 값). 그라디언트·글로·그림 이모지·`transition-all`·대문자+넓은 자간 금지(`style-guard`). 기능 기호 `✓ ✕ ★`는 허용.
- **모든 명령은 포그라운드로 실행하고 출력이 화면에 보이게 한다. 백그라운드 작업(background task, `&`, `Start-Process`)으로 돌려 두고 기다리지 않는다.**
- **TDD**: 순수 모듈은 테스트를 먼저 쓰고 실패를 확인한 뒤 구현한다. 기대값은 코드가 돌려준 값을 베끼지 않고 설계·손계산에서 정한다(동어반복 금지).
- 검증 명령: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`.
- 기존 줄바꿈(CRLF/LF)을 파일마다 유지하고 새 파일은 같은 폴더 파일과 맞춘다. 수정한 `.tsx`는 `git diff --stat`로 전체 줄이 바뀌지 않았는지 확인한다. BOM 없는 UTF-8.
- 홈 First Load JS 283 kB를 늘리지 않는다(시설일정은 `dynamic()` 패널, 새 창은 필요할 때 지연 로드 가능). 빌드는 Claude가 임시 distDir로 확인한다.

## Review Focus

1. 복제·이어 배정이 **행 수 한도(`MAX_ROWS` 30)** 와 이미 있는 칸을 지키는지, 저장 결과가 미리보기와 같은지 (S1-A·S2-A 테스트와 `applyOpsToGroups` 대조).
2. 복제가 **시행 결과·칸 색을 복사하지 않는지** (S2-A).
3. 실패 때 입력·선택이 보존되고 성공 때만 정리되는지 (S1-B·S2-B diff).
4. 검색 `or()` 필터의 **특수문자 이스케이프**와 기존 `main_text` 검색 동작 보존 (S3-A).
5. ✓ 버튼이 **드래그·칸 편집 창 열기와 충돌하지 않는지**, 결과 되돌리기가 이전 값을 정확히 복원하는지 (S4-A·S4-B).

---

# S1. 미배정 배정 개선

### Task S1-A: `lib/unscheduled-assign.ts`

**Files:** Create `src/features/schedule/lib/unscheduled-assign.ts`, `unscheduled-assign.test.ts`

**Interface:**
```ts
export interface AssignStation { id: string; label: string }
export interface AssignInput {
  stations: AssignStation[];                 // 사용자가 고른 국소, 화면의 이름 순서 그대로
  startDate: string;                         // yyyy-mm-dd
  perDay: number | null;                     // null이면 startDate 하루에 전부
  includeOffDays: boolean;                   // true: 주말·공휴일도 포함
  memo: string;                              // 모든 줄의 subText (공백 정리 후)
  usedRowsByDate: Record<string, number[]>;  // 그 팀의 날짜별 사용 중인 행 번호
  maxRows: number;                           // MAX_ROWS
  maxDays: number;                           // 31
}
export interface AssignDay { date: string; creates: { rowNo: number; mainText: string; subText: string }[] }
export interface AssignPlan { days: AssignDay[]; skipped: { label: string; reason: "full" | "range" }[] }
export function planUnscheduledAssign(input: AssignInput): AssignPlan;
```
**규칙:** `perDay`가 null이면 `startDate` 한 날짜에 `nextFreeRows`(기존 `unscheduled-stations.ts`)로 가능한 만큼, 못 넣은 건은 `skipped: "full"`. `perDay`가 있으면 날짜를 `startDate`부터 하루씩 진행하되 `includeOffDays`가 false이면 토요일·일요일·`holidayName(date) !== null`인 날을 건너뛴다(`startDate`가 쉬는 날이면 첫 근무일부터). 한 날짜에 `min(perDay, 남은 빈 행)`건을 순서대로 넣고 다음 날짜로 이어 간다. 하루에 넣을 수 있는 빈 행이 0이면 그 날짜는 건너뛴다. 진행한 날짜(건너뛴 휴일 제외)가 `maxDays`를 넘으면 남은 국소는 `skipped: "range"`. `subText`는 `memo.replace(/\s+/g, " ").trim()`.

**Steps:**
- [ ] 테스트를 먼저 쓴다(FAIL 확인): ① `perDay` null, 빈 행 충분 → 한 날짜에 순서대로 ② 행이 3개만 비어 5건 → 3건 + `skipped` 2건 `full` ③ `perDay=2`, 5건, 평일 시작 → 3일(2,2,1) ④ 금요일 시작 `perDay=2` → 금·월·… (주말 건너뜀) ⑤ 월요일이 공휴일(`HOLIDAYS`에 있는 날짜를 골라 사용)이면 건너뜀 ⑥ `includeOffDays` true면 주말 포함 ⑦ 어떤 날짜의 빈 행이 0이면 그 날짜 건너뜀 ⑧ `maxDays`를 작게(예: 2) 주고 5건 `perDay=2` → 4건 + `skipped` 1건 `range` ⑨ 메모 공백·줄바꿈 정리 ⑩ 빈 `stations`는 빈 계획. 기대값은 달력에서 손계산한다.
- [ ] 구현 → PASS. `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`.

### Task S1-B: 미배정 창 연결

**Files:** Modify `src/features/schedule/components/schedule-unscheduled-dialog.tsx`

**Steps:**
- [ ] 창에 `모국·장비·메모` 입력(`Input`), `하루 최대 N건`(숫자, 비우면 전부), `주말·공휴일도 포함` 체크, 한 줄 미리보기(`날짜 건수` 나열 + 넣지 못함 건수)를 추가한다. 레이아웃은 기존 도구 줄에 이어 붙이되 줄바꿈 금지·폭 상수 규칙을 지킨다.
- [ ] `handleAdd`를 교체한다: 저장 시점에 대상 날짜 범위(시작일~시작일+`maxDays` 일)를 `fetchScheduleCells`로 한 번 읽어 팀(`effectiveColumnId`)의 날짜별 사용 행을 만들고 `planUnscheduledAssign` 결과를 `applyOpsToGroups({ cells, ops: creates → { op: "create", position, text }, arrange: false })`로 최종 그룹을 만든 뒤 `before = snapshotGroups(cells, 키들)`와 함께 `useScheduleWrite().write("미배정 배정", before, after, [], [])`로 저장한다. **`arrange`는 false**(기존 행 번호를 그대로 쓴다).
- [ ] 결과 처리: `"ok"` → 선택(`picked`)을 비우고 `onAdded()`, 요약 토스트(건수·넣지 못함 사유)에 [되돌리기]는 `write`가 단다. `"stale"`/`"failed"` → 선택·입력을 **그대로 두고** 창 안에 오류 문구. `"legacy"` → 기존 칸 단위 저장 코드를 함수로 분리해 실행(`TODO(삭제): apply_schedule_groups 적용 확인 후 제거` 주석, 메모·이어 배정 없이 이전 동작).
- [ ] `isAdding` 상태·중복 클릭 방지(`addingRef`)는 유지한다. `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`.

---

# S2. 일정 복제

### Task S2-A: `lib/copy-plan.ts`

**Files:** Create `src/features/schedule/lib/copy-plan.ts`, `copy-plan.test.ts`

**Interface:**
```ts
export type CopyMode = "skip" | "append";
export interface CopyPair { from: string; to: string }
export interface CopyInput {
  pairs: CopyPair[];                          // 날짜 복제: 원본 하나 × 대상 여러 개 / 주 복제: 7일 × N주
  columnIds: string[];                        // 복제할 팀(비고 열은 호출부가 제외)
  mode: CopyMode;
  cells: ScheduleCell[];                      // from과 to 날짜의 칸 전부
  maxRows: number;
}
export interface CopyPlan {
  creates: { position: CellPosition; text: ScheduleTextInput }[];
  summary: { to: string; copied: number; skippedTeams: number; skippedFull: number }[];
}
export function planCopy(input: CopyInput): CopyPlan;
```
**규칙:** 각 `(from→to, columnId)`에서 원본 칸을 행 순서로 읽는다. 원본이 없으면 아무것도 하지 않는다. 대상 그룹이 비어 있지 않을 때 `mode:"skip"`이면 그 팀 전체를 건너뛰고(`skippedTeams`+1), `"append"`면 대상의 빈 행(`nextFreeRows`)에 **원본 순서대로** 이어 붙인다. `skip`이면 원본 `rowNo`를 그대로 쓴다. 빈 행이 모자라면 들어가는 만큼만 넣고 나머지는 `skippedFull`로 센다. 복제 내용은 `mainText`·`subText`·`textColor`·`companionTarget`이며 **시행 결과는 복제하지 않는다**(결과는 `creates`에 필드 자체가 없다). `pairs`의 `to`가 중복이면 한 번만 처리하고, 같은 `to`가 다른 `from`에서도 오면 첫 쌍만 쓴다(주 복제에서 겹침 방지).

**Steps:**
- [ ] 테스트를 먼저 쓴다(FAIL 확인): ① 날짜 복제(원본 3건→대상 2일, 팀 1개) 행 번호 유지 ② 팀 필터(체크 안 한 팀은 복제 안 함) ③ `skip`: 대상 팀에 이미 칸이 있으면 그 팀 건너뜀 + `skippedTeams` ④ `append`: 대상에 2건 있으면 원본이 그 뒤 행으로 ⑤ 빈 행 부족 → `skippedFull` ⑥ **시행 결과가 있는 원본을 복제해도 결과가 없다**(`creates`에 결과 필드 없음을 단언) ⑦ 주 복제(7쌍)에서 일부 날짜만 일정이 있는 경우 ⑧ 중복 `to` 처리 ⑨ `companionTarget` 보존 ⑩ 빈 원본은 `summary`에 `copied: 0`.
- [ ] 구현 → PASS.
- [ ] **동등성**: `applyOpsToGroups`(1B)에 `creates`를 넣은 최종 상태가 `planCopy` 의도(행 번호·글)와 같은지 FakeStore 없이 단순 대조 1개(시나리오 ③ 또는 ④)를 `copy-plan.test.ts`에 둔다.
- [ ] `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`.

### Task S2-B: 복제 창

**Files:** Create `src/features/schedule/components/schedule-copy-dialog.tsx`; Modify `schedule-view.tsx`(도구 줄 [복제] 버튼, 창 연결)

**Steps:**
- [ ] 창: 원본 선택(`날짜 하나` | `주 전체`), 대상(날짜 하나: `DatePicker` 여러 개 추가 + `+1일`·`+7일` 단축, 최대 31일 / 주 전체: `다음 N주`(1~8)), 팀 체크(원본 날짜의 팀 중, 비고 열 제외, 기본 전체), 대상에 이미 있을 때 `건너뛰기`/`뒤에 이어 붙이기`, 미리보기(`summary` 나열), [복제] 버튼. 표 셀 줄바꿈 금지. 관리자(`isAdmin`)에게만 버튼을 보인다. `DatePicker`는 `@/components/ui/date-picker`를 쓴다(브라우저 기본 date 입력 금지).
- [ ] 저장: 원본·대상 날짜 범위의 칸을 `fetchScheduleCells`로 읽어 `planCopy` → `applyOpsToGroups({ arrange: false })` → `write("복제", before, after, [], [])`. 결과 처리는 S1-B와 같다(`stale`/`failed`면 창 유지, `legacy`면 안내만 하고 복제하지 않는다: "DB 함수 적용 후 사용할 수 있습니다" — 복제는 칸 단위 대체 경로를 만들지 않는다).
- [ ] 성공 시 `onSaved`(일정표 다시 읽기)와 토스트(`N건을 복제했습니다`)를 쓰고 창을 닫는다. 지연 로드(`dynamic`) 여부는 번들 크기를 보고 정하되, 홈 283 kB를 늘리지 않는다.
- [ ] `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`.

---

# S3. 검색 필터

### Task S3-A: API 옵션과 이스케이프

**Files:** Modify `src/features/schedule/api.ts`(+`api.test.ts`), Create `src/features/schedule/lib/search-filter.ts`, `search-filter.test.ts`

**Interface:**
```ts
export interface SearchOptions { columnIds?: string[]; from?: string | null; to?: string | null; includeSub?: boolean }
// lib/search-filter.ts
export function escapeOrValue(text: string): string;            // PostgREST or() 필터 안에서 안전한 ilike 값
export function buildSearchOrFilter(pattern: string): string;   // `main_text.ilike."…",sub_text.ilike."…"` 형태
export function isTruncated(count: number, limit: number): boolean; // count > limit
```
**Steps:**
- [ ] `api.ts`의 `likePattern`을 먼저 읽고, `searchScheduleCells(supabase, query, options?)`를 확장한다: `options` 없음 = **지금과 같은 동작과 같은 쿼리**. `columnIds`는 `.in("column_id", …)`, `from`/`to`는 `.gte/.lte("work_date", …)`, `includeSub`이면 `.or(buildSearchOrFilter(pattern))`. 상한은 `SEARCH_RESULT_LIMIT + 1`건을 요청해 `{ cells, truncated }`를 돌려준다(반환 형태가 바뀌므로 호출부 `schedule-search.tsx`를 함께 맞춘다 — 이것만 S3-B에서 한다. S3-A에서는 새 함수 `searchScheduleCellsFiltered`를 추가하고 기존 함수는 그대로 둔다).
- [ ] 테스트 먼저: 이스케이프(`"`, `\`, `,`, `(`, `)`, `%`, `_`, 공백이 든 입력), `isTruncated` 경계(200→false, 201→true), `api.test.ts`의 기존 검색 호출 형태가 그대로인지. 쿼리 빌더 호출 순서를 단언하는 기존 모킹 방식을 따른다.
- [ ] 구현 → PASS. `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`.

### Task S3-B: 검색 UI

**Files:** Modify `src/features/schedule/components/schedule-search.tsx`, `schedule-view.tsx`(필요 시)

**Steps:**
- [ ] 결과 목록 위에 필터 줄: 팀(다중 선택, 기본 전체), 기간(`DatePicker` 시작·끝, 비우면 전체), `메모 포함` 체크. 필터가 기본값이 아니면 필터 줄에 표시. `queryKey`에 옵션을 넣는다.
- [ ] `truncated`면 결과 아래에 "최근 200건만 표시합니다. 팀·기간으로 좁혀 보세요"를 보여 준다. 결과 칸 클릭(날짜 이동·강조, 1A)은 그대로. `메모 포함` 검색이 오류이면 기존 `main_text` 단독 검색으로 다시 시도한다.
- [ ] `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`.

---

# S4. 완료 빠른 등록

### Task S4-A: `lib/quick-result.ts`

**Files:** Create `src/features/schedule/lib/quick-result.ts`, `quick-result.test.ts`

**Interface:**
```ts
export type QuickToggle =
  | { kind: "set"; next: CellResult | null }   // 완료로 기록하거나(미기록→완료) 기록을 지움(완료→미기록)
  | { kind: "open-dialog" };                   // 일부완료·미시설이 이미 있으면 덮어쓰지 않고 결과 창을 연다
export function toggleDone(current: CellResult | null): QuickToggle;
export function completionSummary(cells: ScheduleCell[], date: string): { done: number; recorded: number; total: number };
```
**규칙:** `current`가 null → `{ kind: "set", next: { status: "done", reason: "", rescheduledTo: null } }`. `done` → `{ kind: "set", next: null }`. `partial`/`undone` → `{ kind: "open-dialog" }`. `completionSummary`: 그 날짜의 칸 중 입회·신호수 칸(`isCompanionCell`)과 글이 빈 칸을 제외한 `total`, 결과가 있는 `recorded`, 그중 `done`. (`CellResult` 필드 이름은 `types.ts`를 읽고 맞춘다.)

**Steps:**
- [ ] 테스트 먼저(FAIL 확인): 세 상태 전이, 요약(입회·신호수 제외, 다른 날짜 제외, 결과 없는 칸은 `total`만), 빈 목록 `0/0/0`. 기대값은 손계산.
- [ ] 구현 → PASS. `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`.

### Task S4-B: ✓ 버튼, 결과 되돌리기, 현황 칩

**Files:** Modify `lib/undo-stack.ts`(+test), `hooks/use-schedule-write.ts`, `components/schedule-grid.tsx`, `components/schedule-view.tsx`

**Steps:**
- [ ] `UndoEntry`를 `{ kind?: "groups" } & 기존 필드 | { kind: "result"; label: string; cellId: string; before: CellResult | null; after: CellResult | null }` 합집합으로 넓힌다. **`kind`가 없는 기존 항목은 groups로 취급**해 기존 코드·테스트가 그대로 통과한다. `undo-stack.test.ts`에 `result` 항목의 push/pop 테스트를 더한다.
- [ ] 훅에 `writeResult(label, cellId, before, after)`를 추가한다: `updateScheduleCellResult(supabase, cellId, after)` → 성공하면 `result` 항목을 스택에 쌓고 일정 쿼리를 다시 불러오며 토스트 [되돌리기]를 단다. `undo()`는 `kind === "result"`이면 `updateScheduleCellResult(supabase, cellId, before)`로 복원한다(충돌 검사는 없다. 실패하면 항목을 스택에 되돌려 놓는다). 기존 groups 분기는 그대로.
- [ ] `schedule-grid.tsx`: 관리자이고 칸에 글이 있을 때, 칸에 마우스를 올리면(`group-hover` 또는 `hover:`) 칸 왼쪽에 작은 `✓` 버튼을 보인다(`type="button"`, `draggable={false}`, `onClick`에서 `stopPropagation`·`preventDefault`, `onDragStart` 막기). 이미 `done`이면 `✓`를 강조 색으로. 클릭 → `toggleDone` → `set`이면 `writeResult`, `open-dialog`이면 기존 칸 편집 창을 그 칸으로 연다(`onEditCell`). 입회·신호수 칸에는 버튼을 보이지 않는다. 칸 높이·줄바꿈 금지·그라디언트 금지 규칙을 지킨다. 월 달력(`schedule-month-grid.tsx`)에는 넣지 않는다.
- [ ] `schedule-view.tsx`: 헤더에 `오늘 완료 n/m` 칩(`completionSummary(cells, 오늘)`; `recorded`가 0이면 `기록 없음`). 화면에 오늘이 보이지 않아도 데이터가 있으면 표시한다.
- [ ] `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`. 기존 `undo-stack.test.ts`·`api.test.ts` 그대로 통과.

---

# S5. 일일일정 Tab 입력 (설계 §3.5)

### Task S5-A: `lib/inline-nav.ts`, `lib/serial-queue.ts`

**Files:** Create `src/features/schedule/lib/inline-nav.ts`, `inline-nav.test.ts`, `serial-queue.ts`, `serial-queue.test.ts`

**Interface:**
```ts
export type InlineMoveKey = "Tab" | "Shift+Tab" | "Enter" | "Shift+Enter";
export interface InlineTarget { rowKey: string; columnKey: string }
export function nextInlineTarget(input: {
  rowKeys: readonly string[];      // 화면에 보이는 행 순서
  columnKeys: readonly string[];   // 편집할 수 있는 열의 화면 순서
  current: InlineTarget;
  key: InlineMoveKey;
}): InlineTarget | null;           // 이동할 곳이 없으면 null
export interface SerialQueue {
  add<T>(task: () => Promise<T>): Promise<T>;   // 넣은 순서대로 하나씩 실행, 앞 작업이 실패해도 다음 실행. 결과·오류는 그 작업의 Promise로
  readonly pending: number;                      // 대기 + 실행 중 개수
  subscribe(listener: () => void): () => void;   // pending이 바뀔 때 호출
}
export function createSerialQueue(): SerialQueue;
```
**규칙(inline-nav):** `Tab`: 같은 행에서 `columnKeys`의 다음 열, 행의 마지막 열이면 **다음 행의 첫 열**. `Shift+Tab`: 이전 열, 첫 열이면 **이전 행의 마지막 열**. `Enter`: 같은 열의 다음 행(마지막 행이면 `null`). `Shift+Enter`: 이전 행(첫 행이면 `null`). 맨 끝(`Tab`의 마지막 행 마지막 열)·맨 처음(`Shift+Tab`의 첫 행 첫 열)은 `null`. `current`의 행이나 열이 목록에 없으면 `null`. 행·열이 비어 있어도 `null`(예외를 던지지 않는다).
**규칙(serial-queue):** `add`가 돌려준 Promise는 그 작업의 결과로 풀리거나 그 작업의 오류로 거부된다. 앞 작업이 거부돼도 뒤 작업은 실행된다. 같은 시각에 두 작업이 실행되지 않는다. `pending`은 `add` 직후 +1, 작업이 끝난(성공·실패) 직후 −1이며 변할 때마다 구독자를 부른다. 구독 해제 함수가 동작한다.

**Steps(TDD, 테스트 먼저 → FAIL 확인 → 구현 → PASS):**
- [ ] inline-nav 테스트: ① Tab 같은 행 다음 열 ② Tab 행 끝 → 다음 행 첫 열 ③ Tab 마지막 행 마지막 열 → null ④ Shift+Tab 이전 열 ⑤ Shift+Tab 첫 열 → 이전 행 마지막 열 ⑥ Shift+Tab 첫 행 첫 열 → null ⑦ Enter 아래 행 같은 열 ⑧ Enter 마지막 행 → null ⑨ Shift+Enter 위 행 ⑩ Shift+Enter 첫 행 → null ⑪ 열 하나뿐일 때 Tab이 다음 행으로 ⑫ 없는 행·열·빈 목록 → null. 기대값은 손으로 쓴 키 문자열.
- [ ] serial-queue 테스트: ① 순서 ② 앞 실패 뒤 계속(앞 Promise는 거부, 뒤는 성공) ③ 동시 실행 없음(실행 중 표시 변수로 확인) ④ `pending` 증감과 구독 호출 횟수 ⑤ 구독 해제 ⑥ 작업이 동기 예외를 던져도(async 함수 안) 큐가 막히지 않음. 가짜 타이머 없이 수동 해제용 Promise(deferred)를 쓴다.
- [ ] `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`.

### Task S5-B: 인라인 칸과 일일일정 표 연결

**Files:** Modify `src/features/schedule/components/schedule-day-inline-cell.tsx`, `schedule-day-view.tsx`

**Steps:**
- [ ] `ScheduleDayInlineCell`의 편집 상태를 **부모가 제어**한다: props `active: boolean`(지금 편집 중인 칸), `onActivate: () => void`(클릭), `pendingValue?: string`(저장 대기 중 표시값, 있으면 `italic text-slate-400`로 그것을 보여 줌), `onFinish: (next: string | null, move: InlineMoveKey | null) => void`. 내부 `editing` 상태는 `active`로 대체. 편집기(`Editor`)의 `onKeyDown`에서 `Tab`·`Shift+Tab`·`Enter`·`Shift+Enter`를 `preventDefault` 후 `finish(text, 키)`로 처리하고 `Escape`는 `finish(null, null)`, blur는 `finish(text, null)`. `doneRef`로 이중 완료 방지는 그대로. 목록(옵션) 항목 클릭은 `finish(option, null)`(이동 없음). 입력칸·목록의 기존 동작·스타일은 그대로.
- [ ] `ScheduleDayView`: `activeEdit: InlineTarget | null` 상태. 칸 `active`는 `activeEdit`와 `(row.stationKey, column.key)`가 같을 때. `onFinish(next, move)`: ① `activeEdit`를 먼저 `null`로 ② `next !== null && next.trim() !== 현재값`이면 `enqueueInlineSave(row, key, next.trim())` ③ `move`가 있으면 `nextInlineTarget({ rowKeys: rows.map(r => r.stationKey), columnKeys: 보이는 편집 열(orderedColumns 중 isInlineKey) 키들, current, key: move })`로 얻은 대상을 `setActiveEdit`. 이동 대상이 없으면 닫기만.
- [ ] `enqueueInlineSave`: `createSerialQueue()`(컴포넌트당 `useRef`로 한 개)에 넣는다. 넣는 즉시 `pendingValues` 상태(키 `${stationKey}|${columnKey}` → 값)에 낙관적 값을 기록하고, 작업이 끝나면(성공·실패 모두) 그 키를 지운다. 작업 본문은 기존 `sheet.saveDetails([{ station: row, patch: { [key]: next } }])`, 실패하면 기존 오류 토스트(`저장하지 못했습니다`). **`runExclusive`·`busyRef`·`busy`를 쓰지 않는다**(저장 중에도 편집 가능해야 한다). 같은 칸을 연달아 고치면 나중 값이 이기도록 `pendingValues`는 마지막 값을 가진다(앞 작업 완료가 뒤 값을 지우지 않게 값 비교 후 삭제).
- [ ] 큐 `pending`을 `useSyncExternalStore`(또는 구독 상태)로 읽어 `inlineSaving = pending > 0`. 복사·내려받기·누적 저장·상세 창 저장·행 삭제·행 추가 버튼은 `inlineSaving`이면 비활성(`disabled`)하고, `runExclusive`·`handleAddRow`도 `inlineSaving`이면 시작하지 않는다(안내 토스트 없이 무시). `editable`은 기존 `canWrite && canAct && !busy`를 유지한다(배타 동작 중에는 편집 불가).
- [ ] 날짜(`workDate`) 바꾸면 `activeEdit`를 닫는다. 행이 사라지면(`rows` 갱신으로 `activeEdit` 대상이 없어지면) `activeEdit`를 `null`로 정리한다. 언마운트 때 대기 중 저장은 그대로 끝나도록 둔다(취소하지 않는다).
- [ ] 표 스타일·열 폭·고정 열(`frozenStyle`)·상세 창 열기 동작·`stopPropagation`은 그대로. 대기 중 표시 외에 시각 변화 없음.
- [ ] `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`.

---

# S-final: 검증과 문서 (Claude)

- [ ] agy diff를 전부 읽는다. Review Focus 5항목을 직접 확인한다(특히 복제의 결과 비복사, 이어 배정의 날짜 계산, 이스케이프, ✓ 버튼 이벤트 충돌, 결과 되돌리기).
- [ ] `tsc`·`eslint`·`npm test`와 임시 distDir 빌드(홈 번들 비교)를 직접 돌린다. 변이 확인(예: 복제에서 결과 필드를 일부러 복사하게 바꿔 테스트가 빨개지는지, 휴일 건너뜀 조건을 지워 테스트가 빨개지는지).
- [ ] 문서(Claude): 구현 문서(`Ver_3.0_시설일정_고도화2단계_구현.md`)에 결과와 **"직접 하실 일"**(화면 확인: 미배정 이어 배정·메모, 복제 미리보기와 되돌리기, 검색 필터, ✓ 완료와 되돌리기·현황 칩), `docs/README.md` 시설일정 행에 2단계 링크를 추가한다.
