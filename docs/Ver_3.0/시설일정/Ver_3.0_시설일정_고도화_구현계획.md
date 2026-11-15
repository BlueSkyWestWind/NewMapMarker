# 시설일정 고도화 구현계획 (1단계: 안전망)

> **실행 방식:** 구현(코드 작성)은 agy가 하고, Claude가 diff를 검토해 틀린 곳을 고친다. 단계는 체크박스(`- [ ]`)로 추적한다. **설계 문서 [Ver_3.0_시설일정_고도화_설계.md](Ver_3.0_시설일정_고도화_설계.md)를 사용자가 승인한 뒤에 시작한다.** 이 계획은 설계의 **1A(화면 쪽, DB 변경 없음)** 와 **1B(저장 쪽, DB 함수 추가)** 만 다룬다. 2·3단계는 각각 별도 설계·계획을 쓴다.

**Goal:** 시설일정에서 입력이 사라지거나 실수를 되돌릴 수 없는 불안을 없애고(저장 실패 시 입력 보존, 되돌리기, 확인), 새로고침·화면 이동 때 보던 위치를 잃지 않게 하며, 검색 결과의 위치를 바로 보이게 한다.

**Architecture:** 1A는 순수 모듈 2개(`view-state`, 강조 상태)와 화면 연결만 바꾼다. 1B는 DB 함수 `apply_schedule_groups`와 순수 모듈 3개(`group-state`, `undo-stack`, 오류 변환)로 저장을 "그룹 단위 최종 상태 교체"로 바꾼다. 기존 판단 함수(`planGroupOps` 등)는 그대로 둔다.

**Tech Stack:** Next.js 15 · React 19 · TypeScript · TanStack Query · Supabase(RPC, RLS) · Vitest. 의존성 추가 없음.

**Spec:** [Ver_3.0_시설일정_고도화_설계.md](Ver_3.0_시설일정_고도화_설계.md)

## Global Constraints

- **커밋하지 않는다(agy).** 사용자가 "커밋"을 요청할 때만 한다.
- **문서(`docs/`, `AGENTS.md`, `README.md`, `supabase/migrations/README.md`)는 수정하지 않는다.** SQL 마이그레이션 파일 1개는 만든다(Task B1).
- **Supabase를 로컬에서 실행하지 않는다.** SQL은 파일만 만들고 사용자가 적용한다. 적용 전에도 앱이 죽지 않아야 한다(설계 §3.3 대체 경로).
- **동작 보존**: 엑셀 내보내기·가져오기·인쇄 코드(`write-workbook.ts`, `schedule-excel.ts`, `export-*`)와 `schedule_cells` 데이터 형태는 바꾸지 않는다. 기존 테스트가 그대로 통과해야 한다.
- **`.tsx` 테스트는 실행되지 않는다**(`vitest.config.ts`는 `.ts`만). 테스트할 로직은 모두 `.ts` 순수 모듈로 뺀다. 훅·컴포넌트 렌더 테스트를 추가하지 않는다.
- 표 셀은 줄바꿈 금지, 가로 스크롤 금지(`table-no-wrap`). 폭 상수는 `shell/constants.ts`에만 둔다. 팀장 등 실명을 저장소에 쓰지 않는다(테스트는 `팀장A` 같은 가짜 값).
- **모든 명령은 포그라운드로 실행하고 출력이 화면에 보이게 한다. 백그라운드 작업(background task, `&`, `Start-Process`)으로 돌려 두고 기다리지 않는다.**
- **TDD**: 순수 모듈은 테스트를 먼저 쓰고 실패(모듈 없음)를 확인한 뒤 구현한다. 기대값은 코드가 돌려준 값을 베끼지 않고 설계·타입·손계산에서 정한다(동어반복 금지).
- **검증 명령**: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`.
- 기존 줄바꿈(CRLF/LF)을 파일마다 유지하고, 새 파일은 같은 폴더 파일과 맞춘다. BOM 없는 UTF-8.
- 홈 First Load JS 282~283 kB를 늘리지 않는다(시설일정은 `dynamic()` 패널). 빌드는 Claude가 임시 distDir로 확인한다.

## Review Focus

1. 저장소(`localStorage`/`sessionStorage`)가 막혀 있어도 화면이 정상인지, 저장된 값이 깨져 있어도 기본값으로 돌아오는지 (Task A1 테스트).
2. 새 로직이 **기존 저장 결과와 같은 최종 상태**를 만드는지 — 동등성 시험이 충분한 입력(이동·입회·함께 등록·작업일자)을 덮는지 (Task B2 테스트).
3. 저장 실패 때 창이 실제로 열린 채 입력이 보존되는지, 성공 때만 닫히는지 (Task B5 diff).
4. 되돌리기가 다른 사람이 바꾼 일정을 덮어쓰지 않는지(`base_ids` 검사 경로) (Task B1 SQL, B3·B4).
5. 마이그레이션 전(RPC 없음)에도 기존 방식으로 저장되어 앱이 죽지 않는지 (Task B4).

---

# 1A. 화면 쪽 안전망 (DB 변경 없음)

### Task A1: 보기 상태 유지

**Files:**
- Create: `src/features/schedule/lib/view-state.ts`, `src/features/schedule/lib/view-state.test.ts`
- Modify: `src/features/schedule/components/schedule-view.tsx`(72~101줄의 상태 초기화·저장)

**Interfaces:**
```ts
export interface StoredViewState {
  facilityView: "week" | "month";
  dailyView: "day" | "archive";
  weekCount: number;      // 1~4
  monthCount: number;     // 1~3
  visibleOptionalColumnIds: string[];
}
export interface StoredDateState { selectedDate: string; weekStart: string; month: string }
export interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void }
export const VIEW_STATE_KEY = "schedule-view-v1";
export const DATE_STATE_KEY = "schedule-date-v1";
export function loadViewState(store: KeyValueStore | null, validColumnIds: ReadonlySet<string>): StoredViewState;
export function saveViewState(store: KeyValueStore | null, state: StoredViewState): void;
export function loadDateState(store: KeyValueStore | null, todayIso: string): StoredDateState | null; // 오늘이 아닌 날 저장분은 null
export function saveDateState(store: KeyValueStore | null, state: StoredDateState, todayIso: string): void;
export const DEFAULT_VIEW_STATE: StoredViewState;
```

**Steps:**
- [ ] 테스트를 먼저 쓴다(`view-state.test.ts`, 가짜 `KeyValueStore`): ① 저장 후 불러오면 같은 값. ② 저장소가 `null`이거나 `getItem`/`setItem`이 예외를 던져도 예외 없이 기본값을 돌려주고 저장은 조용히 무시한다. ③ 깨진 JSON → 기본값. ④ 범위 밖 값(`weekCount: 9`, `facilityView: "x"`)은 해당 키만 기본값으로 고친다. ⑤ `visibleOptionalColumnIds`는 `validColumnIds`에 있는 것만 남긴다. ⑥ `loadDateState`는 `savedOn`이 `todayIso`와 다르면 `null`. 실행 → 모듈 없음으로 FAIL.
- [ ] `view-state.ts`를 구현한다(예외는 모두 삼킨다). 실행 → PASS.
- [ ] `schedule-view.tsx`: 첫 렌더 초기값을 `loadViewState(window.localStorage 또는 null, 열 id 집합)`·`loadDateState(window.sessionStorage 또는 null, todayIso())`로 바꾸고, 값이 바뀔 때 `saveViewState`·`saveDateState`를 부른다. 열 목록은 데이터가 들어온 뒤에야 알 수 있으므로, 선택 열 복원은 열 데이터가 처음 도착했을 때 한 번 적용한다(기존 기본값 로직과 충돌하지 않게 읽고 맞춘다). `ScheduleView`는 `dynamic()` 패널이므로 `window` 접근은 클라이언트에서만 일어나는지 확인한다(서버 렌더 오류가 없어야 한다).
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

### Task A2: 검색 결과 위치 강조

**Files:**
- Modify: `schedule-search.tsx`, `schedule-view.tsx`(`jumpToDate`·`highlightCellId` 상태), `schedule-grid.tsx`, `schedule-month-grid.tsx`(칸 요소 `data-cell-id`와 강조 스타일)
- Create: `src/features/schedule/lib/highlight.ts`, `highlight.test.ts` (선택 — 아래 순수 부분이 있을 때만)

**Steps:**
- [ ] 검색 결과 항목(`ScheduleCell`)을 누르면 `onPick(cell)`이 날짜 이동과 함께 `cell.id`를 알리게 한다(기존 `onPick(workDate)` 시그니처가 쓰이는 곳을 읽고 호환되게 바꾼다).
- [ ] `ScheduleView`에 `highlightCellId: string | null` 상태를 두고, 설정한 뒤 약 3초 뒤 `null`로 되돌린다(타이머는 언마운트·재설정 때 정리). 주간 표·월 달력이 `data-cell-id={cell.id}`를 달고, 강조 중이면 눈에 띄는 링 스타일을 준다(기존 색 체계를 따르고 그라디언트·글로·`transition-all`을 쓰지 않는다: `style-guard` 테스트가 막는다). 이동한 뒤 그 요소를 `scrollIntoView({ block: "center", inline: "nearest" })`로 보이게 한다(요소가 아직 렌더되지 않았으면 한 프레임 뒤 다시 시도).
- [ ] 월 달력에서도 같은 칸 강조가 동작해야 한다. 이동하려는 날짜가 현재 보기 범위 밖이면 기존 `jumpToDate`가 범위를 옮긴다.
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건(스타일 가드 포함).

### Task A3: 확인창과 알림

**Files:**
- Create: `src/features/schedule/lib/delete-confirm.ts`, `delete-confirm.test.ts`
- Modify: `schedule-cell-dialog.tsx`(저장 직전 확인), `schedule-view.tsx`(드래그 결과 토스트)

**Interfaces:**
```ts
// 저장으로 지워질 칸 수를 세어 확인이 필요한지 정한다.
export function deleteConfirmMessage(input: { deleteCount: number; isClearAll: boolean }): string | null;
// 2건 이상 삭제이거나 전체 삭제면 "N건을 삭제합니다. 계속할까요?", 그렇지 않으면 null
```

**Steps:**
- [ ] 테스트를 먼저 쓴다: `{ deleteCount: 0, isClearAll: false }` → `null`, `{ deleteCount: 1, isClearAll: false }` → `null`, `{ deleteCount: 2, … }` → `"2건을 삭제합니다. 계속할까요?"`, `{ deleteCount: 1, isClearAll: true }` → 전체 삭제 문구(전체 삭제는 1건이어도 묻는다). FAIL 확인 → 구현 → PASS.
- [ ] `schedule-cell-dialog.tsx`: 저장에서 `groupPlan.ops`·`companionPlan.ops`의 `delete` 개수를 세어 `deleteConfirmMessage`가 문구를 돌려주면 `window.confirm`을 띄우고, 취소하면 저장하지 않는다(창은 그대로 둔다). 기존 "이동·작업일자" 등 다른 검사 순서는 바꾸지 않는다.
- [ ] `schedule-view.tsx`의 드래그 처리(`planDrop` 결과를 보는 곳, 197~279줄 부근): 맞바꿈이 일어난 경우 `toast`로 "A와 B의 자리를 맞바꿨습니다"(칸 글은 말줄임), 팀 묶음 이동이면 "N건을 옮겼습니다"를 보여 준다. 기존 토스트가 있으면 중복되지 않게 읽고 맞춘다.
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

### Task A4: 1A 검증과 화면 확인 정리 (Claude)

- [ ] agy diff를 전부 읽고, 저장소 오류 처리·타이머 정리·`scrollIntoView`·토스트 중복·줄바꿈 변경·불필요한 파일 수정을 확인해 고친다.
- [ ] `tsc`·`eslint`·`npm test`를 직접 돌리고 임시 distDir 빌드로 홈 번들을 비교한다.
- [ ] 구현 문서에 1A 결과와 "직접 하실 일"(보던 주·열 설정이 새로고침 뒤 유지되는지, 다른 메뉴에 갔다 와서 같은 주가 열리는지, 다음 날(또는 PC 날짜를 바꿔)에는 오늘로 열리는지, 검색 결과 클릭 시 칸이 강조되는지, 전체 삭제·2건 삭제 확인창)을 적는다.

---

# 1B. 저장 쪽 안전망 (DB 함수 추가)

### Task B1: DB 함수 `apply_schedule_groups`

**Files:**
- Create: `supabase/migrations/20261121000000_schedule_apply_groups.sql`

**Steps:**
- [ ] `supabase/migrations/03_facility_schedule.sql`의 `replace_schedule_cells`(277줄 부근)·`move_schedule_cell`·RLS 정책·`schedule_cells`·`schedule_marks` 정의를 읽고 컬럼 이름·제약을 정확히 확인한다(특히 `companion_target`, `result_status`, `result_reason`, `rescheduled_to`, 고유 제약 `schedule_cells_position_key`).
- [ ] 설계 §3.3의 입력·동작을 SQL로 쓴다: `LANGUAGE plpgsql`, `SECURITY INVOKER`, `SET search_path = ''`, 함수 앞부분에서 `SET CONSTRAINTS public.schedule_cells_position_key DEFERRED`. 그룹마다 ① 실제 칸 id 집합과 `base_ids`가 다르면 `RAISE EXCEPTION 'stale_group' USING ERRCODE = 'P0001'` ② 최종 목록에 없는 기존 칸 삭제 ③ `id`가 있는 칸은 갱신(국소·모국·장비·글자색·대상 표시·행 번호; 시행 결과는 건드리지 않음) ④ `id`가 없는 칸은 삽입(이때만 시행 결과 필드 포함) ⑤ 같은 그룹의 최종 `row_no`가 겹치면 예외(`duplicate_row`). `p_marks`는 `schedule_marks`를 갱신(`color`가 null이면 삭제). 반환은 `jsonb`(`{ "created": [{ "group_index": n, "cell_index": n, "id": "uuid" }] }`).
- [ ] 끝에 `REVOKE ALL … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated; NOTIFY pgrst, 'reload schema';`. 머리 주석(목적, 입력 모양, 적용 방법, 되돌리는 방법 `DROP FUNCTION public.apply_schedule_groups(jsonb, jsonb);`)과, 아래 **적용 후 확인 절차**를 SQL 주석으로 넣는다(사용자가 SQL Editor에서 실행, **2099-01-01 같은 먼 미래 날짜**만 사용하고 끝에 정리): (a) 한 그룹에 칸 2개 만들기 → 개수 확인 (b) 같은 그룹을 칸 1개로 교체 → 1개 확인 (c) 잘못된 `base_ids`로 호출 → `stale_group`으로 실패하고 데이터가 그대로인지 (d) 두 칸의 `row_no`를 맞바꾸는 교체가 성공하는지 (e) 정리 삭제. 비관리자 확인은 앱에서 일반 계정으로 저장해 실패하는지 본다.
- [ ] Supabase를 실행하지 않는다. 파일이 UTF-8(BOM 없음)이고 이름 순서가 `20261120000000_…`보다 뒤인지 확인한다.

### Task B2: `group-state.ts` — 최종 상태 계산과 동등성 시험

**Files:**
- Create: `src/features/schedule/lib/group-state.ts`, `group-state.test.ts`

**Interfaces:**
```ts
export interface GroupKey { workDate: string; columnId: string }
export interface GroupCell {
  id: string | null; rowNo: number; mainText: string; subText: string;
  textColor: TextColor | null; companionTarget?: boolean;
  result?: CellResult | null; // 되돌리기로 복원할 때만 쓴다
}
export interface GroupState extends GroupKey { baseIds: string[]; cells: GroupCell[] }
export type WriteOp =
  | { op: "create"; position: CellPosition; text: ScheduleTextInput }
  | { op: "update"; id: string; text: ScheduleTextInput }
  | { op: "delete"; id: string };
export function snapshotGroups(cells: ScheduleCell[], keys: GroupKey[]): GroupState[];
export function applyOpsToGroups(input: {
  cells: ScheduleCell[];              // 현재 칸(관련 날짜 전부)
  ops: WriteOp[];                     // 판단 함수가 낸 ops(그룹 편집·입회·함께 등록·작업일자)
  moveTo?: { workDate: string; columnId: string; ids: string[] }; // 날짜·팀 이동: ids의 칸을 도착 그룹의 빈 행에 차례로
  arrange: boolean;                   // 마지막에 planCompanionArrangement로 행 정리
}): GroupState[];                     // 영향받은 그룹의 최종 상태
export function countDeletes(before: GroupState[], after: GroupState[]): number;
```

**Steps:**
- [ ] 먼저 `schedule-cell-dialog.tsx`의 저장 실행 부분(`setIsSaving(true)` 이후, 410~508줄 부근)과 `lib/*`의 계획 함수(`group-edit.ts`, `companions.ts`, `cross-team.ts`, `period.ts`, `companion-arrange.ts`)를 읽고, **기존 실행이 만드는 최종 상태**를 글로 정리한다(보고서에 요약). 이동은 "도착 팀의 가장 작은 빈 행", 행 정리는 `planCompanionArrangement` 단계(`toRow`) 순서.
- [ ] 테스트를 먼저 쓴다. **동등성 시험**: 테스트 안에 **메모리 안 가짜 실행기**(`FakeStore`)를 만든다 — `create`는 위치에 칸 추가(위치 충돌이면 오류), `update`, `delete`, `moveToFirstEmptyRow`(기존 `move_schedule_cell`의 `rowNo: null` 의미)를 구현한다. 입력 시나리오마다 (A) 기존 방식 그대로(칸 단위로 가짜 실행기에 적용 + 행 정리 이동) 한 결과와 (B) `applyOpsToGroups`의 최종 상태를 비교해 **같은 칸 목록(행 번호·글·글자색·대상 표시)** 인지 단언한다. 시나리오(각각 별도 `it`): ① 새 국소 추가 ② 국소 수정·삭제(중간 행 삭제 → 빈 행 닫힘) ③ 입회·신호수 추가(대상 국소 → 입회 → 신호수 순 정리) ④ 날짜·팀 이동(여러 칸이 도착 팀의 빈 행에 차례로) ⑤ 함께 등록할 팀(`planCrossTeamCreate`) ⑥ 작업일자 여러 날(`planWorkDatesCreate`) ⑦ 행이 가득 찬 그룹은 계획 함수가 오류를 내므로 이 모듈까지 오지 않음(범위 밖, 주석). 기대값은 가짜 실행기의 결과(기존 규칙의 독립 구현)이므로 동어반복이 아니다.
- [ ] `snapshotGroups`·`countDeletes` 테스트: 스냅샷이 결과 필드와 `baseIds`를 담는지, 삭제 수가 `before`에 있고 `after`에 없는 id 수와 같은지.
- [ ] 구현한다. 모든 테스트 PASS. 동등성이 안 맞는 시나리오가 있으면 **고치지 말고** 어떤 규칙이 다른지 보고한다(기존 코드를 바꾸지 않는다).
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

### Task B3: `undo-stack.ts`와 오류 변환

**Files:**
- Create: `src/features/schedule/lib/undo-stack.ts`, `undo-stack.test.ts`, `src/features/schedule/lib/apply-error.ts`, `apply-error.test.ts`

**Interfaces:**
```ts
export interface UndoEntry { label: string; before: GroupState[]; marksBefore: MarkChange[]; after: GroupState[] }
export interface UndoStack { push(e: UndoEntry): void; pop(): UndoEntry | undefined; clear(): void; readonly size: number }
export function createUndoStack(limit?: number /* 기본 20 */): UndoStack;
export type ApplyFailure = "stale" | "missing-function" | "other";
export function classifyApplyError(error: unknown): { kind: ApplyFailure; message: string };
```

**Steps:**
- [ ] 테스트를 먼저 쓴다: 스택 — `push` 후 `pop`은 최근 것부터(LIFO), 한도(20) 초과 시 가장 오래된 것이 밀려난다, 빈 스택 `pop`은 `undefined`, `clear`. 오류 — 메시지에 `stale_group`이 들어간 오류 → `"stale"`, PostgREST 함수 없음(`code: "PGRST202"` 또는 `"42883"`, 또는 메시지에 `Could not find the function`) → `"missing-function"`, 그 밖 → `"other"`(원문 메시지 보존). FAIL 확인 → 구현 → PASS.
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

### Task B4: `applyScheduleGroups`와 `use-schedule-write` 훅

**Files:**
- Modify: `src/features/schedule/api.ts`(`applyScheduleGroups` 추가)
- Create: `src/features/schedule/hooks/use-schedule-write.ts`

**Interfaces:**
```ts
// api.ts
export async function applyScheduleGroups(
  supabase: SupabaseBrowserClient,
  groups: GroupState[],
  marks: MarkChange[],
): Promise<void>; // RPC apply_schedule_groups, 오류는 그대로 던진다(분류는 classifyApplyError)

// hooks/use-schedule-write.ts
export function useScheduleWrite(): {
  write(label: string, before: GroupState[], after: GroupState[], marks: MarkChange[], marksBefore: MarkChange[]): Promise<"ok" | "stale" | "failed">;
  undo(): Promise<"ok" | "empty" | "stale" | "failed">;
  canUndo: boolean;
};
```

**Steps:**
- [ ] `applyScheduleGroups`: `p_groups`(스네이크 케이스 JSON: `work_date`, `column_id`, `base_ids`, `cells[{id,row_no,main_text,sub_text,text_color,companion_target,result_status,result_reason,rescheduled_to}]`)와 `p_marks`를 만들어 `supabase.rpc("apply_schedule_groups", …)`를 부른다. 변환은 순수 함수 `toRpcGroups(groups)`로 빼서 `api.test.ts`(또는 새 테스트)에 입력 → 기대 JSON을 단언한다.
- [ ] 훅: `write`는 성공하면 `before`/`after`/`marks`로 `UndoEntry`를 스택에 쌓고 일정 범위 쿼리를 다시 불러오며, 토스트에 [되돌리기] 버튼을 단다. 실패하면 `classifyApplyError` 결과를 돌려주고 스택에는 쌓지 않는다. `undo`는 스택에서 `pop`해 `after`를 `baseIds`로 삼아(방금 저장한 상태가 그대로인지 서버가 검사) `before`를 복원한다. `stale`이면 스택에 항목을 되돌려 놓지 않고 "다른 곳에서 일정이 바뀌어 되돌릴 수 없습니다"를 안내한다.
- [ ] **마이그레이션 전 대체 경로**: `missing-function`이면 훅이 한 번만 안내("DB 함수가 아직 적용되지 않아 이전 방식으로 저장합니다. 입력 보존·되돌리기는 적용 후에 동작합니다")를 띄우고, 호출한 쪽이 기존 칸 단위 실행으로 저장하도록 `"legacy"`를 돌려준다(`write`의 반환 유니온에 `"legacy"`를 더한다). 이 경로는 임시이며 `// TODO(삭제): apply_schedule_groups 적용 확인 후 제거` 주석을 단다.
- [ ] 키보드: `ScheduleView`가 `Ctrl+Z`(Mac은 `Cmd+Z`)를 듣다가, 포커스가 `input`·`textarea`·`select`·`[contenteditable]`이거나 대화상자가 열려 있으면 무시하고, 그 밖에는 `undo()`를 부른다.
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

### Task B5: 칸 편집 창과 드래그에 연결

**Files:**
- Modify: `schedule-cell-dialog.tsx`(저장 실행 부분 교체), `schedule-view.tsx`(드래그 이동 스냅샷·되돌리기 연결)

**Steps:**
- [ ] 칸 편집 창: 판단 부분(`groupPlan`, `companionPlan`, `crossPlan`, `periodPlan`, 이동 검사)은 **한 줄도 바꾸지 않는다.** 실행 부분(`setIsSaving(true)` 이후 `for … await` 전체와 이어지는 행 정리·재조회)을 `applyOpsToGroups` 호출 → `useScheduleWrite().write(...)`로 교체한다. `write`가 `"ok"`면 기존처럼 `onSaved()`·`onClose()`와 요약 토스트(건너뛴 국소·작업일자 요약 문구는 그대로 유지)를 보여 준다. `"stale"`·`"failed"`면 **`onClose()`를 부르지 않고** 오류를 보여 준 채 창을 연다(입력 보존). `"legacy"`면 기존 칸 단위 실행 코드를 그대로 실행한다(함수로 분리해 한 곳에 둔다, 삭제 주석 포함).
- [ ] 칸 색 표시(`setScheduleMark`)도 같은 `write`의 `marks`로 보낸다.
- [ ] 드래그 이동(`schedule-view.tsx`의 `planDrop` 처리): 이동 호출 **전**에 출발·도착 그룹을 `snapshotGroups`로 저장하고, 이동 호출(기존 `moveScheduleCell`/`planGroupDrop`) 뒤 같은 그룹을 다시 불러 `after`를 만들어 `UndoEntry`로 스택에 쌓는다(이동 자체는 기존 RPC 그대로). 토스트에 [되돌리기]를 단다.
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건. 기존 `api.test.ts`·`day-api.test.ts`·`schedule-excel.test.ts`가 그대로 통과해야 한다.

### Task B6: 1B 검증과 문서 (Claude)

- [ ] agy diff를 전부 읽는다. 특히 SQL(권한·`SECURITY INVOKER`·`base_ids` 검사·지연 제약), 동등성 시험의 시나리오 충분성, 창이 실패 때 닫히지 않는지, `legacy` 경로, `Ctrl+Z` 가드, 판단 함수가 바뀌지 않았는지.
- [ ] SQL을 Claude가 직접 읽어 검토하고 문제를 고친다. 사용자가 적용·확인할 절차(SQL 주석)가 실행 가능한지 확인한다.
- [ ] `tsc`·`eslint`·`npm test`와 임시 distDir 빌드(홈 번들 비교)를 직접 돌린다. 마이그레이션 적용 전 동작(대체 경로)을 코드로 확인한다.
- [ ] 문서(Claude): 구현 문서에 결과, **"직접 하실 일"**(① SQL Editor에서 마이그레이션 실행 ② 적용 후 확인 절차(2099 날짜) 실행 ③ 화면 확인: 여러 날짜·팀에 한 번에 저장, 저장을 일부러 실패시켜(네트워크 끊기) 창이 유지되는지, 삭제·이동 뒤 Ctrl+Z, 다른 탭에서 같은 칸을 바꾼 뒤 되돌리기가 거부되는지), `supabase/migrations/README.md`에 새 마이그레이션 추가, `docs/README.md` 목차 갱신.
