# 시설일정 기간 등록·국소별 메모 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 칸 편집 창의 메모를 국소별 입력으로 바꿔 2배로 넓히고, 국소마다 종료일을 정해 기간 안의 날짜에 같은 팀(과 함께 등록할 팀)의 빈 행에 국소를 만들며, 일일일정 작업자 칸이 팀장 이름으로 채워지게 한다.

**Architecture:** 날짜 확장과 기간 계획은 순수 함수(`lib/period.ts`)로 만들어 단위 테스트로 고정하고, 칸 편집 창은 그 계획을 부르기만 한다. 종료일은 저장하지 않고 창의 상태(`draft.key → 종료일`)로만 둔다. DB 변경은 없다.

**Tech Stack:** Next.js(App Router, TS) · React · Supabase · vitest.

**Spec:** `docs/Ver_3.0/시설일정/Ver_3.0_시설일정_기간등록_국소별메모_설계.md`

## Global Constraints

- 패키지 매니저 npm. 검증: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npx vitest run`.
- 테스트는 `.ts`만(`.tsx` 테스트는 실행되지 않는다).
- 폭 상수는 `src/features/shell/constants.ts` 단일 소스. 컴포넌트에 숫자를 적지 않는다.
- 표 셀 줄바꿈 금지·가로 스크롤 금지(세로 스크롤은 허용). 소스는 CRLF, 주석은 한국어로 "왜"를 적는다.
- **커밋·푸시는 사용자가 지시할 때만 한다.** 이 계획의 "Commit" 단계는 쓰지 않는다. 구현이 끝나면 변경을 작업 트리에 둔 채 보고한다.
- 직원 실명(팀장 이름)은 코드·문서·테스트에 쓰지 않는다. 테스트는 `팀장A` 같은 자리표시 이름을 쓴다.
- 비목표: DB 변경, 작업금지 기간으로 날짜 거르기, 이미 만든 기간 일정의 일괄 수정, 기간 등록 칸의 시행 결과 복사.

## Review Focus

- **토·일·공휴일 제외와 포함**: 기본은 제외하고 토글하면 포함, 제외한 날짜는 알려야 한다(Task 2·3).
- **종료일 오류는 아무것도 저장하기 전에 막는다**: 종료일이 이르거나 31일을 넘으면 저장 도중이 아니라 시작 전에 안내한다(Task 4).
- **이미 있는 날은 건너뛴다**: 같은 항목을 다시 저장해도 중복이 생기지 않는다(Task 3).
- **기간 등록 중 날짜별 행 부족**: 그 날짜만 건너뛰고 나머지는 만든다(Task 3).
- **날짜·팀 옮기기와 기간 등록을 같이 쓰면 막는다**(Task 4).

---

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `src/features/shell/constants.ts` | 메모 칸 폭 상수, 창 최대 폭 | 수정 (Task 1) |
| `src/features/schedule/components/schedule-cell-dialog.tsx` | 국소별 메모, 종료일·토글 UI, 기간 저장 연결 | 수정 (Task 1·4) |
| `src/features/schedule/lib/period.ts` | 날짜 확장과 기간 등록 계획 | 신규 (Task 2·3) |
| `src/features/schedule/lib/period.test.ts` | 위 함수의 단위 테스트 | 신규 (Task 2·3) |

---

### Task 1: 국소별 메모 칸과 폭 2배

**Files:**
- Modify: `src/features/shell/constants.ts`
- Modify: `src/features/schedule/components/schedule-cell-dialog.tsx` (`mergedMemo` 상태, 줄 메모 입력, 공통 메모 `Textarea`)

**Interfaces:**
- Produces: `export const SCHEDULE_CELL_MEMO_WIDTH_PX = 352;` 그리고 `SCHEDULE_CELL_DIALOG_MAX_WIDTH_PX`를 `1200`으로 올린다.

- [ ] **Step 1:** `constants.ts`에 `SCHEDULE_CELL_MEMO_WIDTH_PX = 352`(주석: "국소별 메모 칸 폭. 기존 176px의 2배")를 추가하고 `SCHEDULE_CELL_DIALOG_MAX_WIDTH_PX`를 1200으로 바꾼다.
- [ ] **Step 2:** `schedule-cell-dialog.tsx`에서 `mergedMemo` 상태, `entries`의 병합 분기(`mergedMemo === null ? drafts : …`), 공통 메모 `Textarea`를 제거한다. `entries`는 `drafts`를 그대로 쓴다. 줄 메모 `Input`은 조건 없이 항상 보이고 `style={{ width: SCHEDULE_CELL_MEMO_WIDTH_PX }}`에 `shrink-0`을 쓴다(`w-40` 제거).
- [ ] **Step 3: Verify** `npx tsc --noEmit && npx eslint src --max-warnings=0 && npx vitest run` → 통과, 미사용 import(`Textarea` 등) 없음. 이 Task는 `.tsx`라 단위 테스트가 없다. 수동: 일정 수정 창에서 국소마다 메모 칸이 따로 보이고 폭이 이전의 2배이며 가로 스크롤이 생기지 않는지 확인한다.

---

### Task 2: `expandPeriodDates` — 날짜 확장

**Files:**
- Create: `src/features/schedule/lib/period.ts`
- Test: `src/features/schedule/lib/period.test.ts`

**Interfaces:**
- Consumes: `addDays(iso: string, days: number): string`, `isValidIso(iso: string): boolean`, `weekdayLabel(iso: string): string`(`lib/week.ts`, 일~토 한 글자 문자열), `holidayName(iso: string): string | null`(`lib/holidays.ts`).
- Produces:
  ```ts
  export const MAX_PERIOD_DAYS = 31;
  export type PeriodDates =
    | { dates: string[]; skipped: { date: string; reason: "weekend" | "holiday" }[] }
    | { error: "invalid" | "reversed" | "too-long" };
  export function expandPeriodDates(input: {
    startIso: string;
    endIso: string;
    includeOffDays: boolean;
  }): PeriodDates;
  ```
  규칙: 시작일 **다음 날부터** 종료일까지. 시작일과 종료일이 같으면 `dates: []`. 종료일이 시작일보다 이르면 `reversed`, 날짜 형식이 틀리면 `invalid`, 시작일로부터 종료일까지 `MAX_PERIOD_DAYS`(31)일을 넘으면 `too-long`. `includeOffDays`가 false이면 토·일(`weekdayLabel`이 `토`·`일`)과 공휴일을 `skipped`로 돌리고 `dates`에서 뺀다(토·일이 공휴일이면 `weekend`).

- [ ] **Step 1: Write the failing tests** (`period.test.ts`, `describe("expandPeriodDates")`). 2026-11-09(월)을 시작일로 쓰고 기대값은 달력 사실로 적는다.
  - `"평일만 있는 기간은 시작일 다음 날부터 종료일까지 모두 만든다"`: 시작 11-09, 종료 11-12 → `dates` `["2026-11-10","2026-11-11","2026-11-12"]`, `skipped` `[]`.
  - `"기본은 토·일을 제외하고 이유를 알려 준다"`: 시작 11-12(목), 종료 11-17(화) → `dates` `["2026-11-13","2026-11-16","2026-11-17"]`, `skipped` `[{date:"2026-11-14",reason:"weekend"},{date:"2026-11-15",reason:"weekend"}]`.
  - `"includeOffDays면 토·일도 만든다"`: 같은 입력에 true → 5일 모두 `dates`, `skipped` `[]`.
  - `"공휴일은 평일이어도 기본 제외한다"`: `HOLIDAYS`에 있는 평일(구현 시 `lib/holidays.ts`에서 실제 평일 공휴일 하나를 골라 그 날짜를 상수로 쓴다)을 가운데 둔 기간 → 그 날짜가 `skipped`에 `holiday`로 있고 `dates`에 없다.
  - `"시작일과 종료일이 같으면 추가 날짜가 없다"`, `"종료일이 이르면 reversed"`, `"형식이 틀리면 invalid"`, `"31일을 넘으면 too-long, 31일 정확히는 허용"`.
- [ ] **Step 2: Run** `npx vitest run src/features/schedule/lib/period.test.ts` → FAIL(모듈 없음).
- [ ] **Step 3: Implement** `expandPeriodDates`와 `MAX_PERIOD_DAYS`. 날짜는 `addDays`로 하루씩 늘려 만든다.
- [ ] **Step 4: Run** 같은 명령 → PASS.

---

### Task 3: `planPeriodCreate` — 기간 등록 계획

**Files:**
- Modify: `src/features/schedule/lib/period.ts`
- Test: `src/features/schedule/lib/period.test.ts`

**Interfaces:**
- Consumes: `expandPeriodDates`(Task 2), `planCrossTeamCreate`·`CrossTeamEntry`·`CrossTeamCompanion`·`CrossTeamPlan`(`lib/cross-team.ts`), `ScheduleCell`, `CellPosition`, `ScheduleTextInput`.
- Produces:
  ```ts
  export type PeriodEntry = CrossTeamEntry & { endIso: string | null };
  export interface PeriodPlan {
    /** 만들 칸. 날짜·팀(열)별 */
    creates: CrossTeamPlan["creates"];
    /** 건너뛴 항목(이미 있음·행 부족). 날짜를 함께 적는다 */
    skipped: { date: string; columnId: string; reason: "full" | "duplicate"; mainText: string }[];
    /** 주말·공휴일이라 제외한 날짜 */
    skippedDates: { date: string; reason: "weekend" | "holiday" }[];
    /** 칸을 만든 날짜(제외·전부 건너뜀 포함하지 않음이 아니라, 계획 대상이 된 날짜) */
    dates: string[];
  }
  export function planPeriodCreate(input: {
    cells: ScheduleCell[];
    startIso: string;
    targetColumnIds: string[];
    entries: PeriodEntry[];
    companions: CrossTeamCompanion[];
    includeOffDays: boolean;
  }): PeriodPlan | { error: "invalid" | "reversed" | "too-long" };
  ```
  규칙: `entries` 중 `endIso`가 있고 국소 글이 있는 것만 대상이다. 가장 늦은 `endIso`까지 `expandPeriodDates`로 날짜를 구하고, 날짜마다 그 날짜 이상으로 `endIso`가 이어지는 항목만 모아 `planCrossTeamCreate({ cells, workDate: date, targetColumnIds, entries, companions })`를 부른다. 한 날짜의 결과가 다음 날짜의 `cells`에 영향을 주지 않는다(날짜가 다르므로). `endIso`가 시작일보다 이르거나 형식이 틀린 항목이 있으면 해당 오류를 돌려준다.

- [ ] **Step 1: Write the failing tests** (`describe("planPeriodCreate")`; 칸 헬퍼는 `cross-team.test.ts`의 `cell`·`entry`와 같은 모양으로 이 파일 안에 둔다).
  - `"날짜마다 같은 팀의 첫 빈 행에 순서대로 만든다"`: 시작 11-09, 항목 하나(`endIso` 11-11, 평일) → `creates`가 11-10과 11-11 두 건, `position.rowNo`는 0.
  - `"이미 있는 날은 duplicate로 건너뛰고 다른 날은 만든다"`: 11-10에 같은 국소가 이미 있으면 `skipped`에 `{date:"2026-11-10",reason:"duplicate",…}`이고 11-11만 `creates`.
  - `"항목마다 종료일이 달라 일부 날짜에만 들어간다"`: 항목 A 종료 11-12, 항목 B 종료 11-10 → 11-10에는 A·B, 11-11·11-12에는 A만.
  - `"종료일이 없는 항목은 제외한다"`: `endIso: null`만 있으면 `creates`가 비고 `dates`도 비어 있다.
  - `"팀이 여러 개면 날짜마다 팀별로 만든다"`: 두 팀 × 이틀 = 4건.
  - `"입회·신호수는 날짜마다 복사한다"`: `companions`를 주면 각 날짜에 국소 칸 다음 행으로 `입회 : …` 칸이 만들어진다.
  - `"주말은 기본 제외하고 skippedDates에 알린다"` / `"includeOffDays면 주말도 만든다"` / `"종료일이 이르면 reversed 오류"`.
  - `"어떤 날짜의 팀 행이 가득 차면 그 날짜·팀만 full로 건너뛴다"`(`MAX_ROWS` 상수는 `lib/cell-grid`).
- [ ] **Step 2: Run** `npx vitest run src/features/schedule/lib/period.test.ts` → 새 테스트 FAIL(`planPeriodCreate` 없음).
- [ ] **Step 3: Implement** `planPeriodCreate`와 타입. `PeriodPlan.creates`의 각 `position.workDate`가 만들 날짜다.
- [ ] **Step 4: Run** 같은 명령 → PASS. `npx tsc --noEmit && npx eslint src --max-warnings=0` 통과.

---

### Task 4: 칸 편집 창의 종료일·토글 UI와 저장 연결

**Files:**
- Modify: `src/features/schedule/components/schedule-cell-dialog.tsx`

**Interfaces:**
- Consumes: `expandPeriodDates`, `planPeriodCreate`, `MAX_PERIOD_DAYS`(Task 2·3), `fetchScheduleCells`·`createScheduleCell`·`moveScheduleCell`(기존), `planCompanionArrangement`(기존), `addDays`(`lib/week.ts`), `DatePicker`(`@/components/ui/date-picker`, `mode="date"`).
- Produces: 창 상태 `endDates: Record<string, string>`(키는 `draft.key`, 값은 종료일 ISO, 비우면 키를 지운다)와 `includeOffDays: boolean`.

- [ ] **Step 1:** 상태 두 개를 추가한다. 국소 행 아래에 `종료일` 한 줄(`DatePicker`, `canEdit`일 때만, 라벨은 줄바꿈 금지)을 둔다. 국소 목록 아래 "함께 등록할 팀" 근처에 체크박스 `토·일·공휴일도 포함`(`includeOffDays`)을 둔다. 국소가 삭제(×)되면 그 키의 종료일도 지운다.
- [ ] **Step 2: 저장 전 검사** — `handleSave` 앞부분(어떤 저장도 하기 전)에서 종료일이 있는 국소마다 `expandPeriodDates({ startIso: position.workDate, endIso, includeOffDays })`로 오류를 확인해 `reversed`·`invalid`·`too-long`이면 `setNotice`로 안내하고 `return`한다. 날짜·팀 옮기기(`moving`)와 같이 쓰면 `"날짜나 팀을 바꾸는 저장에서는 기간 등록을 쓸 수 없습니다."`로 막는다. 기간 등록을 쓰는데 목록에 국소 글이 없는 항목이 있으면 막는다(함께 등록과 같은 규칙).
- [ ] **Step 3: 저장 연결** — 기존 저장·함께 등록·`moving`·표시 변경이 끝난 뒤, 종료일이 있는 국소가 있으면 가장 늦은 종료일까지의 칸을 `fetchScheduleCells(supabase, addDays(position.workDate, 1), maxEnd)`로 한 번 불러와 `planPeriodCreate`를 부른다(`targetColumnIds`는 원래 팀 + `crossTeamIds`, `companions`는 함께 등록과 같은 값). `creates`를 `createScheduleCell`로 순서대로 저장한다.
- [ ] **Step 4: 정리와 안내** — 기간 등록으로 대상 표시가 복사된 (날짜, 팀)은 기존 `planCompanionArrangement`를 같은 방식으로 적용한다(날짜마다 새로 불러온 칸 기준, 실패는 저장 실패와 구분해 안내). 저장 후 토스트에 `기간 등록: N일 · 칸 M개`와 제외한 주말·공휴일 날짜, 건너뛴 항목(`날짜 팀: 국소 (이미 있음/행이 가득 참)`, 길면 앞의 6건과 `외 N건`)을 적는다.
- [ ] **Step 5: Verify** `npx tsc --noEmit && npx eslint src --max-warnings=0 && npx vitest run` → 통과. 수동: (a) 국소 하나에 종료일을 이틀 뒤로 주고 저장 → 그 팀의 다음 이틀(평일)에 만들어지고 주말은 안내된다. (b) 같은 입력으로 다시 저장 → 모두 "이미 있음"으로 건너뛰고 중복이 없다. (c) 토글을 켜면 주말에도 만들어진다. (d) 종료일을 시작일보다 이르게 하면 아무것도 저장되지 않고 안내가 뜬다. (e) 함께 등록할 팀을 체크하면 그 팀들에도 같은 기간으로 만들어진다.

---

### Task 5: 일일일정 작업자(시설팀) 칸 — 팀장 이름 입력과 확인 (코드 변경 없음)

**Files:** 없음(데이터 입력과 확인만).

**Interfaces:** 기존 동작을 쓴다 — `buildDayStations`의 `leaders`와 `buildDayRows`의 `values.worker`(`detail?.worker ?? station.leaders.join(",")`).

- [ ] **Step 1: 코드가 이미 맞다는 근거 확인** `npx vitest run src/features/schedule/lib/day-rows.test.ts src/features/schedule/lib/day-stations.test.ts` → 통과. 두 팀에 있는 국소의 작업자가 두 팀장을 쉼표로 이은 값임을 검증하는 기존 테스트(`day-rows.test.ts`의 "순번·작업일·국소명·작업자…")가 있다.
- [ ] **Step 2: 사용자 입력(사용자가 직접)** 시설일정 화면에서 팀 머리글(1~7팀, 6팀 포함)을 눌러 "팀 머리글 수정"의 **팀장** 칸에 이름을 입력한다. 이름은 코드·문서·저장소에 적지 않는다. 엑셀 가져오기의 팀장 행으로 한꺼번에 넣어도 된다.
- [ ] **Step 3: 확인(읽기 전용 조회)** 입력 뒤 `select sort_order, team_label, leader_label from schedule_columns order by sort_order`로 팀장 칸이 채워졌는지 확인하고, 일일일정의 작업자 칸이 국소를 맡은 팀의 팀장을 쉼표로 잇는지(예: 두 팀이면 두 이름) 화면에서 확인한다.
- [ ] **Step 4:** 일일일정에서 작업자 칸을 직접 고쳐 저장한 국소는 이후 자동값 대신 저장한 값이 쓰인다는 점을 사용자에게 알린다(스펙 9장).

---

## Self-Review

- **스펙 커버리지**: 4.1 국소별 메모·폭(Task 1), 4.2·4.3 기간 등록과 순수 함수(Task 2·3·4), 5장 경계 조건(Task 2·3의 테스트와 Task 4의 사전 검사), 9장 작업자 칸(Task 5).
- **타입 일관성**: `PeriodEntry = CrossTeamEntry & { endIso }`는 Task 3에서 정의하고 Task 4가 만든다. `CrossTeamPlan["creates"]`는 기존 `cross-team.ts`의 타입이다.
- **가정**: 공휴일도 토·일처럼 기본 제외, 작업금지 기간은 거르지 않음, 입회·신호수도 날짜마다 복사(스펙 8장). 종료일 입력은 창 상태이고 저장되지 않는다.
