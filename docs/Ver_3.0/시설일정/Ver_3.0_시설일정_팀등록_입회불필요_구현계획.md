# 시설일정 팀 동시 등록·입회신호수 불필요 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 칸 편집 창을 넓히고, 국소별 "입회·신호수 불필요" 표시를 저장해 일일일정에 반영하며, 같은 날짜의 여러 팀에 국소를 한 번에 등록하게 한다.

**Architecture:** 판단 로직은 순수 함수(`day-stations`, `group-edit`, 새 `cross-team`)에 두고 단위 테스트로 고정한다. 저장 필드는 `schedule_cells.no_companion` 한 컬럼이며, 컬럼이 없는 DB에서도 앱이 동작하도록 조회에 폴백을 둔다. 화면은 계산 결과를 부르기만 한다.

**Tech Stack:** Next.js(App Router, TS) · React · Supabase · vitest.

**Spec:** `docs/Ver_3.0/시설일정/Ver_3.0_시설일정_팀등록_입회불필요_설계.md`

## Global Constraints

- 패키지 매니저 npm. 검증: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npx vitest run`.
- 테스트는 `.ts`만(`.tsx` 테스트는 실행되지 않는다).
- Supabase는 로컬 실행 금지. 마이그레이션은 `supabase/migrations/*.sql`로 만들고 사용자가 적용한다. README 마이그레이션 표에 한 줄 추가.
- 폭 상수는 `src/features/shell/constants.ts` 단일 소스. 컴포넌트에 숫자를 적지 않는다.
- 표 셀 줄바꿈 금지·가로 스크롤 금지(세로 스크롤은 허용).
- 소스는 CRLF, 주석은 한국어로 "왜"를 적는다. 미사용 import는 ESLint 오류.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- 비목표: 이름 붙인 그룹, 여러 날짜 동시 등록, 엑셀 가져오기·내보내기에 불필요 표시 싣기, 월간 일정표의 입회·신호수 행 변경.

## Review Focus

- **마이그레이션 전 DB**: `no_companion` 컬럼이 없어도 일정표 조회·저장이 깨지지 않아야 한다(Task 2).
- **같은 국소를 두 팀이 맡고 한 팀만 불필요**: 불필요가 아닌 팀의 입회자·신호수는 남아야 한다(Task 3).
- **함께 등록할 팀의 같은 날짜에 이미 같은 국소**: 중복으로 만들지 않고 건너뛴 팀으로 알려야 한다(Task 5).
- **함께 등록 중 한 팀만 행 부족**: 나머지 팀은 저장되고 그 팀만 건너뛰어야 한다(Task 5).
- **입회·신호수 칸의 `noCompanion`**: 국소 칸이 아니면 무시한다(Task 3·4).

---

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `src/features/shell/constants.ts` | 칸 편집 창 폭 상수 | 수정 (Task 1) |
| `src/features/schedule/components/schedule-cell-dialog.tsx` | 창 크기, 국소별 체크박스, 함께 등록할 팀 UI, 저장 연결 | 수정 (Task 1·4·5) |
| `supabase/migrations/20261114000000_schedule_cells_no_companion.sql` | `no_companion` 컬럼 | 신규 (Task 2) |
| `src/features/schedule/types.ts` | `ScheduleCell.noCompanion`, `ScheduleTextInput.noCompanion` | 수정 (Task 2) |
| `src/features/schedule/lib/table-missing.ts` | 컬럼 없음 오류 판별 | 수정 (Task 2) |
| `src/features/schedule/api.ts` | 조회·생성·수정의 변환과 폴백 | 수정 (Task 2) |
| `src/features/schedule/lib/day-stations.ts` | 불필요 국소의 입회·신호수 제외 | 수정 (Task 3) |
| `src/features/schedule/lib/group-edit.ts` | 초안·연산에 `noCompanion` 반영 | 수정 (Task 4) |
| `src/features/schedule/lib/cross-team.ts` | 여러 팀 동시 등록 계획 | 신규 (Task 5) |

---

### Task 1: 칸 편집 창 확대

**Files:**
- Modify: `src/features/shell/constants.ts`
- Modify: `src/features/schedule/components/schedule-cell-dialog.tsx:387` (`DialogContent`)

**Interfaces:**
- Produces: `export const SCHEDULE_CELL_DIALOG_MAX_WIDTH_PX = 1024;`

- [ ] **Step 1:** `constants.ts`에 위 상수와 한 줄 주석("일정 수정 창. 국소 목록·입회신호수·함께 등록할 팀을 한 화면에 보이려고 넓힌다")을 추가한다.
- [ ] **Step 2:** `DialogContent`의 `className="flex max-h-[92vh] max-w-2xl …"`를 `className="flex max-h-[94vh] w-[96vw] flex-col gap-3 overflow-y-auto p-5"` + `style={{ maxWidth: SCHEDULE_CELL_DIALOG_MAX_WIDTH_PX }}`로 바꾼다(`group-bulk-dialog.tsx`와 같은 방식, `max-w-2xl` 제거).
- [ ] **Step 3: Verify** `npx tsc --noEmit && npx eslint src/features --max-warnings=0` → 오류 없음. 이 Task는 스타일 값뿐이라 단위 테스트가 없다(`.tsx` 테스트는 실행되지 않는다). 수동: dev 서버에서 일정 수정 창이 넓어졌고 모바일 폭에서 가로 스크롤이 생기지 않는지 확인.
- [ ] **Step 4: Commit** `fix(schedule): 일정 수정 창을 넓힌다`

---

### Task 2: `no_companion` 컬럼과 읽기·쓰기

**Files:**
- Create: `supabase/migrations/20261114000000_schedule_cells_no_companion.sql`
- Modify: `README.md` (마이그레이션 표 한 줄)
- Modify: `src/features/schedule/types.ts`, `src/features/schedule/lib/table-missing.ts`, `src/features/schedule/api.ts`
- Test: `src/features/schedule/api.test.ts`, `src/features/schedule/lib/table-missing.test.ts`(없으면 신규)

**Interfaces:**
- Produces: `ScheduleCell.noCompanion?: boolean`, `ScheduleTextInput.noCompanion?: boolean`.
- Produces: `isNoCompanionColumnMissing(error: unknown): boolean` — `isResultColumnMissing`과 같은 형태로 `no_companion` 컬럼 없음(`42703`, `PGRST204`, 메시지에 `no_companion`)을 판별.
- Produces(`api.ts`): `fetchScheduleCells`는 `no_companion`을 읽고, 컬럼이 없으면 그 열 없이 다시 읽는다(기존 `isResultColumnMissing` 폴백과 연결). `createScheduleCell`/`updateScheduleCellText`는 `text.noCompanion`이 있을 때만 `no_companion`을 보낸다(없으면 키를 보내지 않아 컬럼이 없는 DB에서도 저장된다).

- [ ] **Step 1: Write failing tests**
  - `table-missing.test.ts`: `isNoCompanionColumnMissing({ code: "42703", message: 'column "no_companion" does not exist' })` → true; `{ code: "PGRST204", message: "Could not find the 'no_companion' column" }` → true; 다른 컬럼 오류 → false.
  - `api.test.ts`: 가짜 supabase로 조회 결과 `no_companion: true`인 행이 `noCompanion: true`로, 값이 없으면 `false`로 변환된다 / 첫 요청이 `no_companion` 컬럼 오류면 두 번째 요청이 그 열 없이 나가고 `noCompanion`은 false / `createScheduleCell`이 `noCompanion` 없는 입력으로는 `no_companion` 키를 보내지 않고, `true`면 `no_companion: true`를 보낸다.
- [ ] **Step 2: Run** `npx vitest run src/features/schedule/api.test.ts src/features/schedule/lib/table-missing.test.ts` → FAIL.
- [ ] **Step 3: Implement** 위 인터페이스. `CELL_COLUMNS` 상수 뒤에 `COMPANION_COLUMNS = "no_companion"`을 두고 조회는 `result` 열과 함께 요청해 보고, 오류가 두 컬럼 중 어느 쪽이든 폴백이 되도록 단계적으로 시도한다(결과 열 없음 → 불필요 열 없음 순). `toCell`은 `noCompanion: row.no_companion === true`.
- [ ] **Step 4: Write migration** `ALTER TABLE public.schedule_cells ADD COLUMN IF NOT EXISTS no_companion boolean NOT NULL DEFAULT false;` + `COMMENT ON COLUMN` + `NOTIFY pgrst, 'reload schema';`. 파일 머리말에 적용 방법(SQL Editor에서 Run, 재실행 안전)·되돌리기(`DROP COLUMN`)를 적는다. README 표에 한 줄.
- [ ] **Step 5: Run** `npx vitest run && npx tsc --noEmit && npx eslint src --max-warnings=0` → 통과.
- [ ] **Step 6: Commit** `feat(schedule): 칸에 입회·신호수 불필요 표시를 저장할 컬럼을 추가한다`

---

### Task 3: 일일일정에서 불필요 국소의 입회·신호수 제외

**Files:**
- Modify: `src/features/schedule/lib/day-stations.ts`
- Test: `src/features/schedule/lib/day-stations.test.ts`

**Interfaces:**
- Consumes: `ScheduleCell.noCompanion?: boolean` (Task 2).
- Produces: `buildDayStations` 시그니처는 그대로. 내부에서 열별 `noCompanion`을 `StationDraft.noCompanionByColumn: Map<number, boolean>`로 모으고, 입회·신호수를 모을 때 해당 열이 `true`이면 건너뛴다. 팀장은 항상 모은다.

- [ ] **Step 1: Write failing tests** (기존 테스트의 셀 만드는 헬퍼를 재사용)
  - `"불필요로 표시한 국소는 입회자·신호수가 비고 팀장은 남는다"`: 한 팀 열에 국소 칸(`noCompanion: true`)과 같은 팀의 `입회 : 홍길동`·`신호수 : 김철수` 칸 → 해당 `DayStation`의 `witnesses`·`signalers`가 `[]`, `leaders`는 팀장 이름.
  - `"같은 국소를 두 팀이 맡고 한 팀만 불필요면 다른 팀의 이름은 남는다"`.
  - `"표시가 없으면 기존 결과와 같다"`: `noCompanion` 없는 입력 → 이전 테스트의 기대값 그대로.
  - `"입회·신호수 칸에 noCompanion이 있어도 국소 칸이 아니면 무시한다"`.
- [ ] **Step 2: Run** `npx vitest run src/features/schedule/lib/day-stations.test.ts` → FAIL.
- [ ] **Step 3: Implement** `dayCells` 훑기에서 열 번호별 `cell.noCompanion === true`를 기록(같은 열에 같은 국소 칸이 여럿이면 하나라도 false면 false가 아니라 **모두 true일 때만 true**로 본다 — 한 칸이라도 필요한 일정이면 그 팀의 입회·신호수는 필요하다). 입회·신호수 수집 루프에서 `noCompanionByColumn.get(columnIndex)`가 true면 건너뛴다.
- [ ] **Step 4: Run** 같은 명령 → PASS. `npx vitest run` 전체도 통과 확인.
- [ ] **Step 5: Commit** `feat(schedule): 일일일정에서 입회·신호수 불필요 국소의 이름을 비운다`

---

### Task 4: 칸 편집 창의 국소별 불필요 표시

**Files:**
- Modify: `src/features/schedule/lib/group-edit.ts`, `src/features/schedule/components/schedule-cell-dialog.tsx`
- Test: `src/features/schedule/lib/group-edit.test.ts`

**Interfaces:**
- Consumes: `ScheduleTextInput.noCompanion?: boolean` (Task 2).
- Produces: `EntryDraft.noCompanion: boolean`. `draftsFromCells`가 `cell.noCompanion === true`로 채운다. `planGroupOps`의 `trimmed(draft)`가 `{ ..., noCompanion: draft.noCompanion }`을 만든다. `update`는 `noCompanion`이 현재 칸과 다를 때도 나온다. `create`는 값을 싣는다.

- [ ] **Step 1: Write failing tests**
  - `"noCompanion만 바뀐 기존 칸은 update로 나온다"`, `"새 칸 생성에 noCompanion이 실린다"`, `"바뀌지 않았으면 연산이 없다"`, `"draftsFromCells가 noCompanion을 채운다"`. 기존 테스트의 `EntryDraft` 리터럴에는 `noCompanion: false`를 더한다.
- [ ] **Step 2: Run** `npx vitest run src/features/schedule/lib/group-edit.test.ts` → FAIL.
- [ ] **Step 3: Implement** 위 인터페이스(`EntryDraft` 타입, `draftsFromCells`, `planGroupOps`의 비교·`trimmed`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Wire UI** 국소 행마다 체크박스 `입회·신호수 불필요`(라벨 줄바꿈 금지)를 `canEdit`일 때만 보인다. 새 항목을 만드는 `addDraft`와 행 초안 생성부에 `noCompanion: false`를 채운다. 저장은 기존 `planGroupOps` → `updateScheduleCellText`/`createScheduleCell` 경로를 그대로 쓴다(Task 2가 `noCompanion`을 보낸다).
- [ ] **Step 6: Verify** `npx vitest run && npx tsc --noEmit && npx eslint src --max-warnings=0` → 통과. 수동(마이그레이션 적용 뒤): 체크하고 저장 → 새로고침 후에도 유지, 일일일정에서 그 국소의 입회자·신호수가 비는지 확인.
- [ ] **Step 7: Commit** `feat(schedule): 칸 편집 창에서 국소별 입회·신호수 불필요를 표시한다`

---

### Task 5: 같은 날짜의 여러 팀에 동시 등록

**Files:**
- Create: `src/features/schedule/lib/cross-team.ts`
- Modify: `src/features/schedule/components/schedule-cell-dialog.tsx`
- Test: `src/features/schedule/lib/cross-team.test.ts`

**Interfaces:**
- Consumes: `EntryDraft`(Task 4), `firstFreeRow`·`indexCells`·`positionKey`(`lib/cell-grid`), `isCompanionCell`(`lib/companions`).
- Produces:
  ```ts
  export interface CrossTeamPlan {
    /** 팀(열)별로 만들 칸 */
    creates: { columnId: string; position: CellPosition; text: ScheduleTextInput }[];
    /** 건너뛴 팀과 이유 */
    skipped: { columnId: string; reason: "full" | "duplicate"; mainText: string }[];
  }
  export function planCrossTeamCreate(input: {
    cells: ScheduleCell[];
    workDate: string;
    targetColumnIds: string[];
    entries: { mainText: string; subText: string; textColor: TextColor | null; noCompanion: boolean }[];
  }): CrossTeamPlan;
  ```
  규칙: 팀마다 입회·신호수 칸을 뺀 일정 목록의 마지막 행 아래 빈 행(없으면 위로 돌아감, `firstFreeRow`)에 `entries` 순서대로 배정한다. 같은 팀·날짜에 같은 `mainText`(공백 제거 비교)가 이미 있으면 그 항목은 `duplicate`로 건너뛴다. 행이 모자라면 남은 항목을 `full`로 건너뛴다(앞 항목은 배정). `mainText`가 빈 항목은 무시한다.

- [ ] **Step 1: Write failing tests** `cross-team.test.ts`
  - `"두 팀 모두 빈 행에 순서대로 배정한다"`(연산 수·행 번호·`noCompanion` 복사).
  - `"한 팀의 행이 가득 차면 그 팀만 full로 건너뛰고 다른 팀은 배정한다"`.
  - `"같은 국소가 이미 있는 팀은 duplicate로 건너뛴다"`.
  - `"대상 팀이 없으면 연산이 없다"`, `"빈 mainText 항목은 무시한다"`.
- [ ] **Step 2: Run** `npx vitest run src/features/schedule/lib/cross-team.test.ts` → FAIL(모듈 없음).
- [ ] **Step 3: Implement** `planCrossTeamCreate`. 행 수 상한은 `cell-grid`의 기존 상수(`MAX_ROWS`)를 쓴다.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Wire UI** "국소 검색해서 추가" 아래에 `함께 등록할 팀` 체크 목록(같은 날짜의 다른 팀 열, 비고 열 제외, 원래 팀 제외)을 `canEdit`일 때만 보인다. 상태 `crossTeamIds: string[]`. `handleSave`에서 기존 계획·저장이 끝난 뒤, 이번에 **새로 추가한 항목**(`draft.id === null`)을 `entries`로 `planCrossTeamCreate`를 호출하고 `createScheduleCell`로 저장한다. 건너뛴 팀이 있으면 저장 후 토스트 설명에 `팀 이름: 이유`를 나열한다(예: `6팀: 행이 가득 참`). 일부 실패는 기존 `catch` 경로(화면 새로고침·오류 토스트)를 그대로 쓴다.
- [ ] **Step 6: Verify** `npx vitest run && npx tsc --noEmit && npx eslint src --max-warnings=0` → 통과. 수동: 두 팀을 체크해 국소 2개를 추가 저장 → 두 팀의 같은 날짜에 기록되고 불필요 표시가 복사되는지, 한 팀을 가득 채운 뒤 시도하면 그 팀만 건너뛴다는 안내가 뜨는지 확인.
- [ ] **Step 7: Commit** `feat(schedule): 같은 날짜의 여러 팀에 국소를 한 번에 등록한다`

---

## Self-Review

- **스펙 커버리지**: 4.4 창 크기(Task 1), 4.1 데이터·폴백(Task 2), 4.2 일일일정(Task 3), 4.3 표시 UI(Task 4)와 팀 동시 등록(Task 5), 5장 경계 조건은 Task 3·5 테스트에 있다.
- **타입 일관성**: `noCompanion?: boolean`은 Task 2에서 정의하고 3·4·5가 쓴다. `EntryDraft.noCompanion: boolean`(필수)은 Task 4에서 정의하고 5의 `entries`가 같은 이름을 쓴다.
- **미해결 가정**: 월간 일정표의 `입회 : 이름` 행은 그대로 둔다(스펙 8장 "확인 필요").
