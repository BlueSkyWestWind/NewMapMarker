# 시설일정 구현 계획 (Ver 3.0)

> **실행하는 에이전트에게:** 필수 스킬은 `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`다. 단계는 체크박스(`- [ ]`)로 추적한다.

**목표:** 사이드바에 `일정관리 → 시설일정`을 만들고, 사용자 엑셀 `일정표_New`와 같은 모양의 일정표를 관리자가 수정·추가·이동하며 엑셀로 내려받고 가져올 수 있게 한다. 일반 사용자는 읽기만 한다.

**구조:** 일정표의 한 칸 쌍(국소·작업 / 모국·장비·메모)을 `schedule_cells` 한 행으로 저장하고, 열 설정은 `schedule_columns`에 둔다. 날짜 계산·칸 배치·이동 판정·엑셀 변환은 React 없는 순수 함수(`.ts`)로 만들어 테스트하고, 화면은 그 함수를 호출만 한다. 일정표는 사이드바 패널이 아니라 넓은 창에서 주 단위로 연다(표 가로 스크롤 금지 규칙).

**기술 스택:** Next.js(App Router, TS) · React · Tailwind · shadcn `Dialog` · `@tanstack/react-query` · zustand(셸) · Supabase(RLS + RPC) · `xlsx`(기존, 시트·행·배경색 읽기) · `exceljs` 4.4.0(신규, 서식 있는 쓰기와 글자색 읽기, 필요할 때만 동적 로딩, 설치 전 사용자 승인) · vitest.

**설계서:** `docs/Ver_3.0/Ver_3.0_계획.md` 13장. 이 문서는 13장을 구현하는 방법만 적는다. 설계가 바뀌면 13장을 먼저 고친다.

## 전역 제약

- 패키지 매니저 npm. 새 패키지는 `exceljs@4.4.0` 하나만 추가한다(Task 0, **설치 전에 사용자 승인**을 받는다). 달력·드래그 라이브러리는 쓰지 않는다(HTML5 드래그). `exceljs`는 `await import("exceljs")`로만 불러오고 정적 import를 두지 않는다.
- 컴포넌트는 `"use client"`. 무거운 화면은 `dynamic()`으로 분리하고 **홈 First Load JS 295 kB 이하**를 유지한다.
- **`.tsx` 테스트는 실행되지 않는다**(`vitest.config.ts`가 `.ts`만 포함). 테스트할 로직은 모두 `.ts`로 뺀다.
- ESLint는 미사용 import·변수를 오류로 잡는다. `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test`가 모두 통과해야 한다.
- 폭 상수는 `src/features/shell/constants.ts`에만 둔다. 컴포넌트에 숫자를 적지 않는다.
- 표 셀은 줄바꿈 금지, 가로 스크롤 금지, 세로 스크롤 허용(`table-no-wrap.mdc`). 긴 글은 말줄임 + `title` 툴팁.
- **Supabase는 로컬 실행 금지.** 마이그레이션 SQL 파일만 만들고 적용은 사용자가 한다. 적용 전에도 앱이 죽지 않아야 한다(안내 문구).
- **팀장 등 직원 실명은 저장소(마이그레이션·테스트·문서)에 쓰지 않는다.** 테스트 데이터는 `팀장A` 같은 가짜 값을 쓴다.
- **개발 서버(`npm run dev`)가 떠 있으면 `next build`를 실행하지 않는다**(`.next`가 덮어써져 화면이 깨진다).
- 한글 파일은 UTF-8로 쓰고 생성 후 깨졌는지 확인한다.
- 커밋은 사용자가 요청할 때만 한다. 이 계획에는 커밋 단계가 없다. 작업 브랜치는 새 `feat/ver-3.0-facility-schedule`을 제안한다(현재 브랜치는 그룹관리). 시작 전에 사용자에게 확인한다.
- 화면 문구(확정): 메뉴 `일정관리`, 하위 `시설일정`, 칸 입력 라벨 `국소·작업` / `모국·장비·메모`.

## 리뷰 포인트 (설계서가 암시하지만 정상 입력에서 놓치기 쉬운 것)

1. **칸을 자기 자리에 놓기 / 찬 칸에 놓기:** 같은 자리면 아무 일도 없고, 찬 칸이면 맞바꾼다. → Task 3 `planDrop` 테스트.
2. **월·연 경계와 일요일 주:** 일요일은 직전 월요일 주에 속한다. 12/31→1/1 경계를 넘는 주가 7일로 나온다. → Task 2 테스트.
3. **엑셀 날짜 표기 차이:** `6/29/26`, `2026-11-09`, 엑셀 일련번호, `끝`·빈 값. → Task 4 `parseSheetDate` 테스트.
4. **내보내고 다시 가져오면 같은 일정:** 칸 위치·글·팀 머리글이 보존된다. → Task 4 왕복 테스트.
5. **쓰레기 값과 구조 밖 값:** `` ` `` 같은 기호만 있는 칸, 팀 열보다 오른쪽의 값은 일정으로 넣지 않고 `ignoredCount`로 센다. 헤더가 없는 파일은 오류 안내. → Task 4 테스트.
6. **비관리자 쓰기 차단:** 화면에서 숨길 뿐 아니라 DB 정책이 막아야 한다. → Task 1 적용 후 SQL 확인(사용자 실행), Task 6에서 `canEdit` 분기.
7. **주마다 정확히 한 쪽:** 맞춤 인쇄는 수동 쪽 나눔을 무시하므로 확대율을 고정한다. 확대율이 용지·행 수에 맞게 계산되고(A3 70행 42%, A4 70행 29%), 쪽 나눔이 주 수만큼 들어간다. → Task 4A, 7A 테스트.
8. **칸 색 읽기:** 5색 외 색은 무시하고, 블록 10행 중 일부만 다른 색(원본 52건)이면 첫 행 기준으로 읽는다. → Task 4 테스트.
9. **날짜 메모 여러 개·없음:** 한 날짜에 이름이 여러 개면 중복을 빼고 `, `로 합치고, 없으면 메모 없음. → Task 4 테스트.
10. **글자색 정리:** 파랑 계열 세 가지(`0070C0`·`00B0F0`·테마 파랑)는 `0070C0` 하나로 합치고, 빨강 `FF0000`만 따로 두며, 기본 검정·글자색 없음·그 밖의 색은 글자색 없음으로 읽는다. → Task 4 `normalizeTextColor` 테스트, Task 5 읽기 테스트.
11. **월 달력 경계:** 월요일 시작 격자에 이전·다음 달 날짜가 섞인다. 달에 따라 4~6주(2027-02는 4주, 2026-11은 6주)이고, 달 밖 날짜의 일정도 그 날짜 칸에 보인다. → Task 2·4B 테스트.
12. **월간 배포 한 쪽 맞춤:** 줄 수가 많은 주가 있어도 한 달이 한 쪽에 들어가도록 확대율을 계산한다. → Task 4B `computeMonthScale` 테스트.

## 파일 구조

| 파일 | 역할 |
|---|---|
| `supabase/migrations/20261108000000_facility_schedule.sql` (신규) | 테이블 4개(열·칸·날짜 메모·칸 색), 정책, `move_schedule_cell`·`replace_schedule_cells` 함수 |
| `src/features/schedule/types.ts` (신규) | 도메인 타입 |
| `src/features/schedule/lib/week.ts` (신규) | ISO 날짜 문자열 기반 주·요일 계산 |
| `src/features/schedule/lib/cell-grid.ts` (신규) | 칸 인덱스, 보이는 행 수, 빈 행 찾기, 놓기 판정 |
| `src/features/schedule/lib/schedule-excel.ts` (신규) | 엑셀 행 배열 ↔ 일정 변환(파싱·생성·가져오기 계획), 순수 함수 |
| `src/features/schedule/lib/table-missing.ts` (신규) | 마이그레이션 전 오류 판별 |
| `src/features/schedule/lib/read-schedule.ts` (신규) | 엑셀 읽기: `xlsx`로 시트·행·배경색, `exceljs`로 글자색 |
| `src/features/schedule/lib/weekly-layout.ts` (신규) | 주간 배포 계산: 주별 날짜 블록 구성, 용지별 확대율(순수) |
| `src/features/schedule/lib/month-layout.ts` (신규) | 월 달력 계산: 날짜 칸 구성, 줄 수·행 높이 추정, 용지별 확대율(순수) |
| `src/features/schedule/lib/write-workbook.ts` (신규) | `exceljs`로 주간 배포용·월간 배포용·일정표_New 형식 파일 쓰기 |
| `src/features/schedule/api.ts` (신규) | Supabase 호출 |
| `src/features/schedule/hooks/use-schedule-range.ts` (신규) | 기간 조회(react-query). 주간·월간이 같은 훅을 쓴다 |
| `src/features/schedule/components/*.tsx` (신규) | 패널, 일정표 창, 주간 표, 월간 달력, 범례, 칸 창, 날짜 메모 창, 머리글 창, 내보내기 창, 가져오기 창 |
| `src/features/shell/types/nav.ts` 외 셸 파일 | 메뉴·하위 메뉴 연결(Task 8) |
| `AGENTS.md` | features 목록에 `schedule` 추가(Task 9) |

**실행 순서:** 0 → 1 → 2 → 3 → 4 → 4A → 4B → 5 → **7A** → 6 → 7 → 8 → 9. Task 7은 Task 7A의 파일 쓰기 함수를 쓰므로 7A가 먼저다(문서에서는 7 뒤에 있다). Task 0에서 사용자에게 `exceljs@4.4.0` 설치 승인과 작업 브랜치(`feat/ver-3.0-facility-schedule`)를 확인한다. 승인되지 않으면 글자색 읽기·쓰기와 모든 내보내기(Task 4B·7A, Task 7의 내보내기)는 보류하고 나머지를 진행한다.

---

### Task 0: 사전 확인과 `exceljs` 설치

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces: `import("exceljs")`가 가능한 상태(4.4.0). 이후 Task 4B·5·7A가 쓴다.

- [ ] **Step 1: 사용자에게 두 가지를 확인한다.** (a) `exceljs@4.4.0` 설치 승인(**승인됨, 2026-11-07**; 브랜치 확인은 아직 남음): node_modules 약 22 MB, 내려받기·가져오기 때만 `await import("exceljs")`로 불러와 홈 번들 영향이 없다. 승인되지 않으면 글자색 읽기·쓰기와 모든 내보내기(Task 4B·7A·7의 내보내기)를 보류하고 나머지를 진행한다. (b) 작업 브랜치 `feat/ver-3.0-facility-schedule`.
- [ ] **Step 2: 승인 후 설치한다.** Run: `npm install exceljs@4.4.0 --save-exact` → `package.json`의 `dependencies`에 `"exceljs": "4.4.0"`(버전 앞 `^` 없음).
- [ ] **Step 3: 검증.** Run: `node -e "const E=require('exceljs');const w=new E.Workbook();w.addWorksheet('t');console.log(typeof w.xlsx.writeBuffer)"` → `function`. Run: `npx tsc --noEmit` → 오류 없음.

---

### Task 1: DB 마이그레이션

**Files:**
- Create: `supabase/migrations/20261108000000_facility_schedule.sql`

**Interfaces:**
- Consumes: `public.is_app_admin()` (`20261107000000_site_lists.sql`, 이미 적용됨), `auth.uid()`.
- Produces: 테이블 `schedule_columns(id uuid pk, sort_order int, team_label text, leader_label text)`, `schedule_cells(id uuid pk, work_date date, column_id uuid → schedule_columns, row_no int, main_text text, sub_text text, text_color text null, created_by, updated_by, created_at, updated_at)`, `schedule_days(work_date date pk, note text, updated_by, updated_at)`, `schedule_marks(work_date date, column_id uuid → schedule_columns, color text, pk(work_date, column_id))`. RPC `move_schedule_cell(p_cell_id uuid, p_work_date date, p_column_id uuid, p_row_no int) returns void`(`p_row_no`가 null이면 빈 행 중 가장 작은 번호), RPC `replace_schedule_cells(p_from date, p_to date, p_cells jsonb, p_days jsonb, p_marks jsonb) returns int`(범위의 칸·날짜 메모·칸 색을 지우고 다시 넣는다, 한 트랜잭션, 삽입한 칸 수 반환). 모두 `SECURITY INVOKER`.

- [ ] **Step 1: 테이블과 제약을 쓴다**
  - `schedule_columns`: `sort_order int NOT NULL UNIQUE`, `team_label text NOT NULL CHECK (length(btrim(team_label)) > 0)`, `leader_label text NOT NULL DEFAULT ''`. 팀 라벨 10개를 이 순서로 넣는다: `1팀, 2팀, 3팀, 4팀, 5팀, 7팀, 6팀, 시험팀, 실사&재하도급, 비고`(`ON CONFLICT (sort_order) DO NOTHING`로 재실행 안전). 팀장은 비워 둔다.
  - `schedule_cells`: `row_no int NOT NULL CHECK (row_no BETWEEN 0 AND 29)`, `main_text`·`sub_text`는 `text NOT NULL DEFAULT '' CHECK (length(...) <= 500)`, `CHECK (length(main_text) + length(sub_text) > 0)`, `text_color text NULL CHECK (text_color IN ('0070C0','FF0000'))`, `column_id`는 `ON DELETE CASCADE`. 위치 고유 키는 **이름을 붙인 지연 가능 제약**이어야 한다: `CONSTRAINT schedule_cells_position_key UNIQUE (work_date, column_id, row_no) DEFERRABLE INITIALLY IMMEDIATE`(맞바꾸기에 필요).
  - `created_by`·`updated_by uuid DEFAULT auth.uid()`, `updated_at`을 갱신하는 트리거(기존 `touch_site_list_updated_at` 방식으로 함수 새로 정의, `SET search_path = ''`).
  - `schedule_days`: `note text NOT NULL CHECK (length(btrim(note)) > 0 AND length(note) <= 100)`. 메모가 없는 날은 행이 없다. `updated_at` 트리거를 같은 함수로 건다.
  - `schedule_marks`: `color text NOT NULL CHECK (color IN ('D9F2D0','F2CFEE','4E95D9','FF5050','D1D1D1'))`, `column_id`는 `ON DELETE CASCADE`, 기본 키 `(work_date, column_id)`.
- [ ] **Step 2: RLS를 쓴다.** 네 테이블 모두 RLS 활성(`schedule_days`·`schedule_marks`도 같은 정책: 조회 전체, `INSERT/UPDATE/DELETE`는 관리자만). `SELECT`는 `authenticated` 전체(`USING (true)`). `INSERT/UPDATE/DELETE`는 `authenticated`이면서 `(SELECT public.is_app_admin())`일 때만(`USING`·`WITH CHECK` 모두). `schedule_columns`에는 `INSERT/DELETE` 정책을 두지 않는다(이름 수정만 허용).
- [ ] **Step 3: 함수를 쓴다.** 둘 다 `LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''`, `REVOKE ALL ... FROM PUBLIC, anon`, `GRANT EXECUTE ... TO authenticated`.
  - `move_schedule_cell`: `SET CONSTRAINTS public.schedule_cells_position_key DEFERRED`; 대상 칸 조회(없으면 예외 `cell not found`); `p_row_no`가 null이면 `0..29` 중 대상 날짜·열에서 비어 있는 가장 작은 번호(없으면 예외 `column is full`); 도착 자리에 다른 칸이 있으면 그 칸을 이동 칸의 원래 자리로 보낸다(맞바꾸기); 이동 칸을 도착 자리로 옮긴다. 자기 자리면 아무 것도 하지 않는다.
  - `replace_schedule_cells`: `p_from > p_to`면 예외. 범위의 기존 칸·날짜 메모·칸 색을 삭제한 뒤 `jsonb_to_recordset`로 삽입한다(칸 `{work_date, column_id, row_no, main_text, sub_text, text_color}`, 메모 `{work_date, note}`, 색 `{work_date, column_id, color}`). 배열이 비어 있어도 삭제는 수행한다. 삽입한 칸 수를 반환.
- [ ] **Step 4: 마지막에 `NOTIFY pgrst, 'reload schema';`와 적용 후 확인용 주석 SQL을 둔다.** 주석에 (a) 관리자 계정으로 삽입 성공, (b) 일반 계정으로 삽입 실패(`new row violates row-level security policy`), (c) 일반 계정으로 조회 성공 확인 쿼리를 적는다. 파일 머리 주석에 "적용: SQL Editor에 붙여넣고 Run, 다시 실행해도 안전, 적용 순서는 `20261107000000_site_lists.sql` 이후"를 적는다. 모든 DDL은 `IF NOT EXISTS`·`DROP POLICY IF EXISTS`·`CREATE OR REPLACE`로 재실행 안전하게 쓴다.
- [ ] **Step 5: 검증.** 파일을 다시 읽어 위 제약이 전부 있는지, 직원 실명이 없는지 확인한다. 적용은 사용자가 한다(Task 9에서 요청).

---

### Task 2: 타입과 주·날짜 계산

**Files:**
- Create: `src/features/schedule/types.ts`, `src/features/schedule/lib/week.ts`
- Test: `src/features/schedule/lib/week.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export interface ScheduleColumn { id: string; sortOrder: number; teamLabel: string; leaderLabel: string }
  export interface ScheduleCell { id: string; workDate: string; columnId: string; rowNo: number; mainText: string; subText: string; textColor: TextColor | null }
  export interface CellPosition { workDate: string; columnId: string; rowNo: number }
  export interface ScheduleTextInput { mainText: string; subText: string; textColor: TextColor | null }
  export const MARK_COLORS = ["D9F2D0", "F2CFEE", "4E95D9", "FF5050", "D1D1D1"] as const; // 6자리 대문자 RGB, '#' 없음
  export type MarkColor = (typeof MARK_COLORS)[number];
  export function isMarkColor(value: unknown): value is MarkColor
  export interface ScheduleDayNote { workDate: string; note: string }
  export interface ScheduleMark { workDate: string; columnId: string; color: MarkColor }
  export const TEXT_COLORS = ["0070C0", "FF0000"] as const;   // 글자색: 파랑(축전지수거) / 빨강
  export type TextColor = (typeof TEXT_COLORS)[number];
  export function isTextColor(value: unknown): value is TextColor
  export function markLabel(color: MarkColor): string        // D9F2D0 "중장비", F2CFEE "승주", 4E95D9 "K대응", FF5050 "빨강 칸", D1D1D1 "회색 칸"
  export function textColorLabel(color: TextColor): string   // 0070C0 "축전지수거", FF0000 "빨강 글자"
  export const TEXT_COLOR_DISPLAY: Record<TextColor, string> // 화면용 밝은 색: 0070C0 → "#38A1F5", FF0000 → "#FF6B6B" (엑셀 파일에는 원래 색을 쓴다)
  ```
  `workDate`는 항상 `yyyy-mm-dd` 문자열이다. `Date`를 상태나 DB 경계에 넘기지 않는다(시간대 오류 방지).
- Produces (`week.ts`, 모두 UTC 기준 계산):
  ```ts
  export function isValidIso(iso: string): boolean
  export function addDays(iso: string, days: number): string
  export function weekStartOf(iso: string): string        // 월요일
  export function weekDatesOf(startIso: string): string[] // 7개
  export function weekdayLabel(iso: string): string       // "월"~"일"
  export function todayIso(now?: Date): string            // 로컬 달력 날짜
  export function weekStartsOf(fromIso: string, weeks: number): string[] // 그 날짜가 속한 주부터 weeks개 주의 월요일
  export function monthOf(iso: string): string                    // "2026-11-09" → "2026-11"
  export function addMonths(month: string, delta: number): string // "2026-12" + 1 → "2027-01"
  export function monthGridDates(month: string): string[]         // 월요일 시작, 그 달을 덮는 주들의 날짜(28~42개, 7의 배수)
  ```

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 값은 이렇다: `weekStartOf("2026-11-09") === "2026-11-09"`(월요일), `weekStartOf("2026-11-15") === "2026-11-09"`(일요일은 직전 월요일 주), `weekStartOf("2027-01-01") === "2026-12-28"`, `weekDatesOf("2026-12-28")`이 `["2026-12-28", ..., "2027-01-03"]` 7개, `addDays("2026-02-28", 1) === "2026-03-01"`, `addDays("2026-03-01", -1) === "2026-02-28"`, `weekdayLabel("2026-11-09") === "월"`, `weekdayLabel("2026-11-15") === "일"`, `isValidIso("2026-02-30") === false`, `isValidIso("2026-11-9") === false`, `todayIso(new Date(2026, 10, 9, 23, 30)) === "2026-11-09"`(로컬 자정 직전), `weekStartsOf("2026-11-11", 2)`가 `["2026-11-09", "2026-11-16"]`, `weekStartsOf("2026-12-30", 2)`가 `["2026-12-28", "2027-01-04"]`, `isMarkColor("D9F2D0") === true`, `isMarkColor("d9f2d0")`·`isMarkColor("FFFFFF")`·`isMarkColor(null)` → false, `monthOf("2026-11-09") === "2026-11"`, `addMonths("2026-12", 1) === "2027-01"`, `addMonths("2026-01", -1) === "2025-12"`, `monthGridDates("2026-11")`는 `2026-10-26`부터 `2026-12-06`까지 42개(11/1이 일요일이라 6주), `monthGridDates("2027-02")`는 `2027-02-01`(월)부터 `2027-02-28`까지 28개, `isTextColor("0070C0") === true`, `isTextColor("00B0F0")`·`isTextColor(null)` → false, `markLabel("D9F2D0") === "중장비"`, `markLabel("F2CFEE") === "승주"`, `markLabel("4E95D9") === "K대응"`, `markLabel("FF5050") === "빨강 칸"`, `textColorLabel("0070C0") === "축전지수거"`, `textColorLabel("FF0000") === "빨강 글자"`(테스트는 `types.test.ts`가 아니라 `week.test.ts`에 같이 둔다).
- [ ] **Step 2: 실패 확인.** Run: `npx vitest run src/features/schedule/lib/week.test.ts` → FAIL(모듈 없음).
- [ ] **Step 3: `types.ts`와 `week.ts`를 구현한다.** `Date.UTC`로 만들고 `getUTCDay`로 요일을 구한다. `isValidIso`는 정규식 + 왕복(파싱 후 다시 문자열로) 비교로 존재하지 않는 날짜를 거른다.
- [ ] **Step 4: 통과 확인.** 같은 명령 → PASS.

---

### Task 3: 칸 배치와 놓기 판정

**Files:**
- Create: `src/features/schedule/lib/cell-grid.ts`
- Test: `src/features/schedule/lib/cell-grid.test.ts`

**Interfaces:**
- Consumes: `ScheduleCell`, `CellPosition` (Task 2).
- Produces:
  ```ts
  export const MIN_VISIBLE_ROWS = 10; // 엑셀 일정표의 날짜 블록(10행)과 같다
  export const MAX_ROWS = 30; // DB의 row_no 0..29와 같다
  export function positionKey(position: CellPosition): string  // `${workDate}|${columnId}|${rowNo}`
  export function indexCells(cells: ScheduleCell[]): Map<string, ScheduleCell>
  export function visibleRowCount(cells: ScheduleCell[], workDate: string): number
  export function firstFreeRow(cells: ScheduleCell[], workDate: string, columnId: string): number | null
  export type DropPlan = { kind: "none" } | { kind: "move" } | { kind: "swap"; with: ScheduleCell }
  export function planDrop(cells: ScheduleCell[], dragged: ScheduleCell, target: CellPosition): DropPlan
  ```
  `visibleRowCount` = 해당 날짜 칸의 최대 `rowNo + 2`와 `MIN_VISIBLE_ROWS` 중 큰 값, `MAX_ROWS` 이하(칸이 없으면 10. 마지막 행(10번째)까지 쓰면 새 칸을 넣을 빈 행 하나를 더 보여 11).

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `visibleRowCount(빈 배열, d) === 4`, 최대 행 번호 2 → 4, 최대 5 → 7, 최대 29 → 30. `firstFreeRow`: 0·1행이 차 있으면 2, 0·2행만 차 있으면 1, 30행이 전부 차 있으면 `null`, 다른 날짜·열의 칸은 무시. `planDrop`: 같은 자리 → `{kind:"none"}`, 빈 칸 → `{kind:"move"}`, 다른 칸이 있는 자리 → `{kind:"swap", with: 그 칸}`, 다른 날짜·열로 옮겨도 같은 규칙.
- [ ] **Step 2: 실패 확인.** Run: `npx vitest run src/features/schedule/lib/cell-grid.test.ts` → FAIL.
- [ ] **Step 3: 구현한다.** 위 시그니처 그대로. `planDrop`은 `indexCells`로 도착 자리를 찾는다.
- [ ] **Step 4: 통과 확인.** 같은 명령 → PASS.

---

### Task 4: 엑셀 변환(순수 함수)

**Files:**
- Create: `src/features/schedule/lib/schedule-excel.ts`
- Test: `src/features/schedule/lib/schedule-excel.test.ts`

**Interfaces:**
- Consumes: `ScheduleColumn`, `ScheduleCell`, `ScheduleDayNote`, `ScheduleMark`, `MarkColor`, `MARK_COLORS`, `isMarkColor`, `TextColor`, `isTextColor`, `markLabel` (Task 2), `MAX_ROWS` (Task 3).
- Produces:
  ```ts
  export const EXPORT_MIN_ROWS = 10;
  export interface ParsedColumn { index: number; teamLabel: string; leaderLabel: string }
  export interface ParsedCell { workDate: string; columnIndex: number; rowNo: number; mainText: string; subText: string; textColor: TextColor | null }
  export interface ParsedDayNote { workDate: string; note: string }
  export interface ParsedMark { workDate: string; columnIndex: number; color: MarkColor }
  export interface ParsedSchedule { columns: ParsedColumn[]; cells: ParsedCell[]; dayNotes: ParsedDayNote[]; marks: ParsedMark[]; dayCount: number; firstDate: string | null; lastDate: string | null; ignoredCount: number }
  export function parseSheetDate(value: unknown): string | null
  export function toExcelSerial(iso: string): number
  /**
   * fillAt: 해당 셀의 배경색(6자리 대문자 RGB). 없으면 null.
   * textColorAt: 해당 셀의 글자색 원본 키(6자리 대문자 RGB 또는 `THEME<번호>`). 없으면 null.
   * 색을 못 읽는 호출부는 생략한다. 행·열 인덱스는 0부터.
   */
  export interface ParseOptions { fillAt?: (rowIndex: number, colIndex: number) => string | null; textColorAt?: (rowIndex: number, colIndex: number) => string | null }
  export function normalizeTextColor(raw: string | null): TextColor | null
  export function parseScheduleRows(rows: unknown[][], options?: ParseOptions): ParsedSchedule | null   // 헤더(A열 "날짜")가 없으면 null
  export interface ExportFill { rowIndex: number; colIndex: number; color: MarkColor }
  export interface ExportFont { rowIndex: number; colIndex: number; color: TextColor }
  export function buildExportRows(input: { dates: string[]; columns: ScheduleColumn[]; cells: ScheduleCell[]; dayNotes: ScheduleDayNote[]; marks: ScheduleMark[] }): { rows: (string | number)[][]; dateRowIndexes: number[]; fills: ExportFill[]; fonts: ExportFont[] }
  export function matchColumns(parsed: ParsedColumn[], existing: ScheduleColumn[]): (string | null)[]
  export interface ImportInsert { workDate: string; columnId: string; rowNo: number; mainText: string; subText: string; textColor: TextColor | null }
  export interface ImportPlan { deleteFrom: string; deleteTo: string; inserts: ImportInsert[]; days: ScheduleDayNote[]; marks: ScheduleMark[]; columnUpdates: { id: string; leaderLabel: string }[]; skippedCount: number }
  export function planImport(parsed: ParsedSchedule, existing: ScheduleColumn[], fromDate: string): ImportPlan | null
  ```
- 파일 구조 규칙(스펙 13장, 실제 파일 확인): 헤더 행은 A열이 `날짜`인 행. 헤더 바로 위 행이 팀 라벨 행. 팀 열 쌍은 C열(인덱스 2)부터 `2+2k`·`3+2k`. 열 라벨은 `위 행 값 || 헤더 행 값`, 팀장은 `위 행 값이 있을 때만 헤더 행 값`(원본의 `시험팀`·`실사&재하도급`·`비고`는 위 행이 비고 헤더 행에 이름이 있다). 헤더 오른쪽 끝(헤더 행에서 마지막 비어 있지 않은 열)까지만 쌍으로 본다.
- 블록 규칙: A열이 날짜로 읽히는 행은 그 날짜의 칸 행이다. 같은 날짜 안에서 나타난 순서가 `rowNo`(0부터). A열이 날짜가 아닌 행(`끝`·빈 값)은 건너뛴다. 한 쌍의 두 칸이 모두 비면 일정이 아니다. 앞뒤 공백을 자르고, 기호만 있는 값(`/^[`'\s]+$/`)은 비어 있는 것으로 센다 — 이런 칸이 있으면 `ignoredCount`에 더한다. B열은 요일(`…요일`로 끝나는 값)과 **날짜 메모**로 나뉜다: 블록의 어느 행이든 요일이 아닌 비어 있지 않은 B값은 그 날짜의 날짜 메모 후보이고, 한 날짜에 여럿이면 중복을 뺀 뒤 `, `로 합친다(100자를 넘으면 100자까지). 헤더 쌍 범위 밖의 비어 있지 않은 값은 `ignoredCount`에 더한다.
- 칸 색 규칙: 날짜 블록 **첫 행**의 팀 앞 칸(`2+2k`) 배경색을 `options.fillAt`으로 읽어 `isMarkColor`이면 그 날짜×팀의 색이다(5색 외는 무시, 블록 일부 행만 다른 색이어도 첫 행 기준). `fillAt`이 없으면 색은 읽지 않는다.
- 글자색 규칙: 칸이 있는 각 행에서 팀 앞 칸(`2+2k`)의 글자색(앞 칸이 비어 있으면 뒤 칸 `3+2k`)을 `options.textColorAt`으로 읽어 `normalizeTextColor`로 정리해 `ParsedCell.textColor`에 담는다. `normalizeTextColor`: `0070C0`·`00B0F0`·`THEME4`(테마 파랑) → `0070C0`, `FF0000` → `FF0000`, 그 밖(검정 `000000`·`THEME1`·`null` 등)은 `null`. `textColorAt`이 없으면 모든 `textColor`는 `null`.
- 내보내기 규칙: 1~4행 = 범례(A열만: `중장비`·`승주`·`축전지수거`·`K대응`; `중장비`·`승주`·`K대응`은 각각 `D9F2D0`·`F2CFEE`·`4E95D9` 칸 색, `축전지수거`는 `0070C0` 글자색), 5행 = 팀 라벨 행(`팀장`이 있는 열만 팀 라벨, 없으면 빈 칸), 6행 = 헤더 행(A=`날짜`, B=`요일`, 팀장이 있으면 팀장, 없으면 팀 라벨; 쌍의 둘째 칸은 빈 칸). 이후 날짜 블록: 블록 행 수 = `max(EXPORT_MIN_ROWS, 그 날짜 최대 rowNo + 1)`. A열은 모든 행에 `toExcelSerial(날짜)`(숫자), B열은 첫 행에 `"월"`~`"일"`에 `요일`을 붙인 `월요일`, 날짜 메모가 있으면 **4번째 행**(블록 인덱스 3, 원본과 같다) B열에 메모. `dateRowIndexes`는 A열 서식을 줄 행 번호(0부터)들이다. `fills`는 색이 지정된 날짜×팀의 두 칸(`2+2k`, `3+2k`) × 그 날짜 블록의 모든 행이다. 팀의 열 순서(`k`)는 `columns`를 `sortOrder`로 정렬한 순서다. `fonts`는 `textColor`가 있는 칸의 행에서 두 칸(`2+2k`, `3+2k`)씩과 범례의 `축전지수거` 셀이다. `fills`에는 범례의 칸 색 3개(`colIndex 0`, 행 0·1·3)도 들어 있다.
- `matchColumns`: 파싱된 열의 `teamLabel`이 기존 열의 `teamLabel`과 같으면 그 열 id(공백 제거 비교), 없으면 같은 인덱스(`parsed.index`번째 정렬 순서)의 기존 열 id, 그것도 없으면 `null`.
- `planImport`: `fromDate` 이전 날짜의 칸·날짜 메모·색은 제외. 삭제 범위는 `[max(fromDate, firstDate), lastDate]`. `rowNo >= MAX_ROWS`이거나 열이 `null`인 칸(색 포함)은 `skippedCount`로 센다. `columnUpdates`는 파싱된 팀장이 비어 있지 않고 기존 값과 다른 열만. `days`·`marks`는 파싱 결과를 날짜 범위로 거르고 `marks`의 열은 `matchColumns`로 열 id로 바꾼 것이다. 범위에 칸·날짜 메모·색이 하나도 없으면 `null`. `inserts`는 칸의 `textColor`를 그대로 담는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 값은 이렇다.
  - `parseSheetDate`: `"6/29/26" → "2026-06-29"`, `"11/9/2026" → "2026-11-09"`, `"2026-11-09" → "2026-11-09"`, 엑셀 일련번호 `46335`(= 2026-11-09) → `"2026-11-09"`, `"끝"`·`""`·`undefined`·`"13/40/26"` → `null`. (일련번호 값은 `toExcelSerial("2026-11-09")`로 구해 쓴다.)
  - `toExcelSerial("1900-03-01") === 61`, `toExcelSerial("2026-11-09")`는 `toExcelSerial("2026-11-08") + 1`.
  - `parseScheduleRows`: 팀이 둘인 작은 배열로 검사한다 — 팀 라벨 행 `["", "", "1팀", "", "", ""]`, 헤더 행 `["날짜", "", "팀장A", "", "시험팀", ""]`, 데이터 `["6/29/26", "월요일", "국소1", "모국1", "시험건", ""]`, `["6/29/26", "", "국소2", "", "", ""]`, `["6/29/26", "", "`", "", "", ""]`, `["6/30/26", "화요일", "", "", "", ""]`, `["끝", "끝"]`. 기대: 열 2개(`1팀`/`팀장A`, `시험팀`/``), 칸 3개(`6/29` 행 0에 `국소1·모국1`과 `시험건`, 행 1에 `국소2`), `dayCount === 2`(6/30은 칸이 없어도 날짜로 센다), `firstDate "2026-06-29"`, `lastDate "2026-06-30"`, `ignoredCount === 1`(기호 칸). 헤더가 없는 배열 → `null`. 같은 날짜가 떨어져서 두 번 나와도 `rowNo`가 이어서 증가하고 덮어쓰지 않는다.
  - **날짜 메모:** 블록 4번째 행 B열이 `"담당A"`면 그 날짜의 메모가 `"담당A"`; 같은 날짜 두 행에 `"담당A"`·`"담당B"`·`"담당A"`가 있으면 `"담당A, 담당B"`; 요일(`"월요일"`)은 메모가 아님; 메모가 없는 날짜는 `dayNotes`에 없음; 101자 값은 100자로 잘림.
  - **칸 색:** `fillAt`이 블록 첫 행·팀 앞 칸에서 `"D9F2D0"`를 주면 그 날짜×열의 색이 `D9F2D0`, `"FFFFFF"`·`null`이면 없음, 첫 행은 색 없음이고 둘째 행만 색이 있어도 없음, `fillAt`을 안 주면 `marks`가 빈 배열.
  - **글자색:** `normalizeTextColor`: `"0070C0"`·`"00B0F0"`·`"THEME4"` → `"0070C0"`, `"FF0000"` → `"FF0000"`, `"000000"`·`"THEME1"`·`null`·`"123456"` → `null`. `textColorAt`이 칸 행의 팀 앞 칸에서 `"00B0F0"`를 주면 그 칸의 `textColor === "0070C0"`, 앞 칸이 비어 있고 뒤 칸이 `"FF0000"`이면 `"FF0000"`, `textColorAt`을 안 주면 모든 칸이 `null`.
  - `buildExportRows`: 팀 둘, 칸 하나인 날짜 하나 → 행 수 = 6(범례 4 + 팀 라벨 + 헤더) + 10, 첫 데이터 행 A열이 숫자(일련번호), B열이 `월요일`, 날짜 메모가 있으면 4번째 행 B열에 메모, 그 밖의 행 B열은 빈 칸, 마지막 행(10번째)도 A열에 날짜. 최대 rowNo 11인 날짜는 12행. 색이 하나(2번째 열, 그 날짜)면 그 블록에 대한 `fills`가 10행 × 열 인덱스 4·5 = 20개이고 모두 같은 색이다(범례의 칸 색 3개는 따로 `colIndex === 0`, `rowIndex` 0·1·3에 있다). 글자색이 있는 칸 하나면 `fonts`에 그 행의 앞·뒤 칸 2개와 범례 `축전지수거` 1개가 있다.
  - **왕복:** `buildExportRows` 결과를 `parseScheduleRows`에 넣으면 같은 날짜·열 라벨·팀장·`rowNo`·글·날짜 메모가 나온다(팀장이 있는 열과 없는 열 모두). 색은 `fills`를 `fillAt`으로 바꿔 넘기면 같은 날짜×열 색이 나오고, 글자색은 `fonts`를 `textColorAt`으로 바꿔 넘기면 같은 항목의 `textColor`가 나온다.
  - `matchColumns`: 라벨 일치 우선, 라벨이 다르면 인덱스 대체, 기존 열보다 많으면 `null`.
  - `planImport`: `fromDate`가 `firstDate`와 같을 때 전부 삽입, 중간 날짜일 때 그 이전 칸·메모·색 제외와 `deleteFrom === fromDate`, 열 `null`·`rowNo 30`은 `skippedCount`, 팀장 변경 없는 열은 `columnUpdates`에 없음, `days`·`marks`가 열 id로 바뀌어 담김, 칸·메모·색이 모두 없으면 `null`(메모만 있어도 `null`이 아니다).
- [ ] **Step 2: 실패 확인.** Run: `npx vitest run src/features/schedule/lib/schedule-excel.test.ts` → FAIL.
- [ ] **Step 3: 구현한다.** 위 시그니처와 규칙 그대로. `parseSheetDate`는 숫자일 때 일련번호(범위 `20000..80000`만 인정)를 UTC 계산으로 날짜로 바꾸고, 문자열일 때 정규식 두 가지(`m/d/yy(yy)`, `yyyy-mm-dd`)를 쓰며, 두 자리 연도는 2000+. 결과는 `isValidIso`로 한 번 더 확인한다.
- [ ] **Step 4: 통과 확인.** 같은 명령 → PASS.

---

### Task 4A: 주간 배포 계산(순수 함수)

**Files:**
- Create: `src/features/schedule/lib/weekly-layout.ts`
- Test: `src/features/schedule/lib/weekly-layout.test.ts`

**Interfaces:**
- Consumes: `ScheduleCell`, `ScheduleDayNote` (Task 2), `weekDatesOf`·`weekdayLabel` (Task 2), `EXPORT_MIN_ROWS` (Task 4).
- Produces:
  ```ts
  export type PaperSize = "A3" | "A4";
  export const PAPER_PT = { A3: { width: 1190.55, height: 841.89 }, A4: { width: 841.89, height: 595.28 } } as const; // 가로 방향 용지 크기(pt)
  export const WEEKLY_ROW_HEIGHT_PT = 21.95;      // 원본 일정표_New의 행 높이
  export const WEEKLY_HEADER_HEIGHT_PT = 34;      // 팀 이름 + 팀장 두 줄
  export const WEEKLY_MARGIN_PT = 28.8;           // 0.4인치
  export const WEEKLY_DATE_COL_PX = 142;          // 원본 열 너비(날짜)
  export const WEEKLY_WEEKDAY_COL_PX = 76;        // 원본 열 너비(요일·날짜 메모)
  export const WEEKLY_MAIN_COL_PX = 205;          // 팀 앞 칸(국소·작업)
  export const WEEKLY_SUB_COL_PX = 125;           // 팀 뒤 칸(모국·장비·메모)
  export interface WeeklyDay { workDate: string; weekday: string; note: string; rowCount: number } // weekday: "월요일"
  export interface WeeklyWeek { start: string; days: WeeklyDay[] }  // days는 월~일 7개
  export function weeklyDayRowCount(cells: ScheduleCell[], workDate: string): number // max(EXPORT_MIN_ROWS, 그 날짜 최대 rowNo + 1)
  export function buildWeeklyWeeks(input: { weekStarts: string[]; cells: ScheduleCell[]; dayNotes: ScheduleDayNote[] }): WeeklyWeek[]
  export function computeWeeklyScale(input: { paper: PaperSize; columnCount: number; weekRowCounts: number[] }): number // 정수 %, 10~100
  ```
- 확대율 규칙: 표 내용 폭(pt) = `(DATE + WEEKDAY + columnCount × (MAIN + SUB)) × 0.75`. 쪽 높이에 들어가야 하는 내용 높이(pt) = `WEEKLY_HEADER_HEIGHT_PT + (한 주의 행 수 합 중 최대) × WEEKLY_ROW_HEIGHT_PT`. 용지(가로) A3 = 1190.55 × 841.89pt, A4 = 841.89 × 595.28pt에서 양쪽 `WEEKLY_MARGIN_PT`씩 뺀 인쇄 가능 영역에 맞춘다. 확대율 = `floor(100 × min(폭 비, 높이 비))`를 10~100으로 자른다. 맞춤 인쇄(Fit to)는 쓰지 않는다 — Excel이 맞춤 인쇄일 때 수동 쪽 나눔을 무시하기 때문이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 값은 이렇다.
  - `weeklyDayRowCount`: 칸 없음 → 10, 최대 rowNo 3 → 10, 최대 rowNo 11 → 12, 다른 날짜의 칸은 무시.
  - `buildWeeklyWeeks({ weekStarts: ["2026-11-09"], cells: [], dayNotes: [{ workDate: "2026-11-10", note: "메모A" }] })`: 주 1개, `days`가 `2026-11-09 ~ 2026-11-15` 7개, 첫 날 `weekday === "월요일"`·마지막 `"일요일"`, `2026-11-10`의 `note === "메모A"`, 나머지 `note === ""`, 모든 `rowCount === 10`. 칸의 최대 rowNo가 11인 날은 `rowCount === 12`. 주가 둘이면 순서를 지킨다.
  - `computeWeeklyScale`(열 10개 기준): `A3, [70] → 42`, `A4, [70] → 29`(폭이 제한), `A3, [120] → 29`(높이가 제한), `A4, [160] → 15`, `A3, [70, 140]`는 가장 큰 주 140행 기준이라 `[140]`과 같다, 행 수가 아주 커도(`[5000]`) 최소 10.
- [ ] **Step 2: 실패 확인.** Run: `npx vitest run src/features/schedule/lib/weekly-layout.test.ts` → FAIL.
- [ ] **Step 3: 구현한다.** 위 시그니처와 규칙 그대로. 노트는 `dayNotes`를 날짜→메모 맵으로 만들어 찾는다.
- [ ] **Step 4: 통과 확인.** 같은 명령 → PASS.

---

### Task 4B: 월 달력 계산(순수 함수)

**Files:**
- Create: `src/features/schedule/lib/month-layout.ts`
- Test: `src/features/schedule/lib/month-layout.test.ts`

**Interfaces:**
- Consumes: `ScheduleColumn`, `ScheduleCell`, `ScheduleDayNote`, `ScheduleMark`, `MarkColor`, `TextColor`, `monthGridDates`, `monthOf` (Task 2), `PaperSize`, `PAPER_PT`, `WEEKLY_MARGIN_PT` (Task 4A).
- Produces:
  ```ts
  export const MONTH_DAY_COL_PX = 190;
  export const MONTH_TITLE_HEIGHT_PT = 30;
  export const MONTH_HEADER_HEIGHT_PT = 20;
  export const MONTH_LINE_HEIGHT_PT = 12;
  export const MONTH_MIN_WEEK_HEIGHT_PT = 60;
  export const MONTH_CHARS_PER_LINE = 24;
  export const MONTH_VISIBLE_LINES = 6;            // 앱 달력 칸에 보이는 팀 줄 수
  export interface MonthEntry { mainText: string; subText: string; textColor: TextColor | null }
  export interface MonthTeam { columnId: string; label: string; markColor: MarkColor | null; entries: MonthEntry[] }
  export interface MonthDay { workDate: string; inMonth: boolean; note: string; teams: MonthTeam[] }
  export interface MonthModel { month: string; title: string; weeks: MonthDay[][] }  // title: "2026년 11월", weeks는 4~6개, 각 7일(월~일)
  export function buildMonthModel(input: { month: string; columns: ScheduleColumn[]; cells: ScheduleCell[]; dayNotes: ScheduleDayNote[]; marks: ScheduleMark[] }): MonthModel
  export function monthEntryText(entry: MonthEntry): string      // 모국 있으면 `국소 (모국)`, 국소 없으면 모국만
  export function monthTeamLineText(team: MonthTeam): string     // `팀 · 항목1, 항목2`
  export function estimateLines(text: string): number            // max(1, ceil(글자 수 / MONTH_CHARS_PER_LINE))
  export function monthWeekHeightPt(week: MonthDay[]): number
  export function computeMonthScale(input: { paper: PaperSize; weekHeightsPt: number[] }): number // 정수 %, 10~100
  ```
- 규칙: 팀 줄은 `columns`를 `sortOrder`로 정렬한 순서이고, **그 날짜에 칸(항목)이 있는 팀만** 만든다(칸 색만 있고 항목이 없는 팀은 줄이 없다). 항목은 `rowNo` 순이다. 팀 줄의 이름은 `teamLabel`(팀장은 쓰지 않는다). `markColor`는 그 날짜×열의 색. 이전·다음 달 날짜도 일정이 있으면 팀 줄을 채우고 `inMonth: false`로 표시한다. `monthWeekHeightPt(week)` = `max(MONTH_MIN_WEEK_HEIGHT_PT, (1 + 가장 바쁜 날의 줄 수) × MONTH_LINE_HEIGHT_PT + 6)`이고, 날의 줄 수는 팀 줄 각각의 `estimateLines(monthTeamLineText(team))` 합이다(첫 `1`은 날짜 줄). `computeMonthScale`: 내용 폭 = `7 × MONTH_DAY_COL_PX × 0.75`pt, 내용 높이 = `MONTH_TITLE_HEIGHT_PT + MONTH_HEADER_HEIGHT_PT + weekHeightsPt의 합`, 용지 크기 `PAPER_PT[paper]`에서 양쪽 `WEEKLY_MARGIN_PT`씩 뺀 영역에 맞춰 `floor(100 × min(폭 비, 높이 비))`를 10~100으로 자른다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 값은 이렇다.
  - `buildMonthModel`(`month: "2026-11"`, 열 `1팀`·`2팀`, 칸: 2026-11-09 1팀 행 0 `{국소1, 모국1, 글자색 0070C0}`·행 1 `{국소2}`, 2팀 행 0 `{국소3}`, 2026-10-27 1팀 행 0 `{국소4}`, 색: 2026-11-09 1팀 `D9F2D0`·2026-11-10 2팀 `4E95D9`(칸 없음), 날짜 메모: 2026-11-09 `메모A`): `title === "2026년 11월"`, `weeks.length === 6`, `weeks[0][0].workDate === "2026-10-26"`이고 `inMonth === false`, `weeks[0][6].workDate === "2026-11-01"`이고 `inMonth === true`, `2026-11-09` 날짜: `note === "메모A"`, `teams`가 2개(1팀, 2팀 순), 1팀 `markColor === "D9F2D0"`·`entries`가 `국소1`, `국소2` 순이고 첫 항목 `textColor === "0070C0"`, 2팀 `markColor === null`; `2026-10-27`은 `inMonth === false`이지만 `teams[0].entries[0].mainText === "국소4"`; `2026-11-10`은 `teams`가 비어 있다(색만 있는 팀은 줄 없음); `2027-02`는 `weeks.length === 4`.
  - `monthEntryText`: `{국소1, 모국1}` → `"국소1 (모국1)"`, `{국소2, ""}` → `"국소2"`, `{"", 스카이}` → `"스카이"`. `monthTeamLineText`: 위 1팀 → `"1팀 · 국소1 (모국1), 국소2"`.
  - `estimateLines`: `""` → 1, 24자 → 1, 25자 → 2, 49자 → 3.
  - `monthWeekHeightPt`: 일정 없는 주 → 60, 하루에 짧은 팀 줄 2개 → 60(= `max(60, (1+2)×12+6 = 42)`), 하루에 짧은 팀 줄 8개 → 114.
  - `computeMonthScale`: `A3`, 6주 × 60pt → 100, `A4`, 6주 × 60pt → 78(폭이 제한), `A4`, 6주 × 300pt → 29(높이가 제한), `A3`, 6주 × 300pt → 42, 아주 큰 높이 → 최소 10.
- [ ] **Step 2: 실패 확인.** Run: `npx vitest run src/features/schedule/lib/month-layout.test.ts` → FAIL.
- [ ] **Step 3: 구현한다.** 위 시그니처와 규칙 그대로. 날짜 목록은 `monthGridDates(month)`를 7개씩 끊어 주로 만든다. 날짜별 칸·색·메모는 맵으로 한 번 만들어 찾는다.
- [ ] **Step 4: 통과 확인.** 같은 명령 → PASS.

---

### Task 5: 파일 읽기, API, 조회 훅

**Files:**
- Create: `src/features/schedule/lib/table-missing.ts`, `src/features/schedule/lib/read-schedule.ts`, `src/features/schedule/api.ts`, `src/features/schedule/hooks/use-schedule-range.ts`
- Test: `src/features/schedule/lib/table-missing.test.ts`, `src/features/schedule/lib/read-schedule.test.ts`

**Interfaces:**
- Consumes: Task 2~4의 타입·함수, `fetchAllRows`(`@/features/map-marker/api`), `SupabaseBrowserClient`(`@/lib/supabase/client`), `useAuthSession`, `useIsAdmin`.
- Produces:
  ```ts
  // table-missing.ts
  export function isScheduleTableMissing(error: unknown): boolean   // code "42P01" 또는 "PGRST205", 또는 메시지에 "schedule_" 포함 + "does not exist"/"Could not find"
  // read-schedule.ts (읽기만. 파일 쓰기는 Task 7A의 write-workbook.ts)
  export function buildFillAt(sheet: import("xlsx").WorkSheet): (rowIndex: number, colIndex: number) => string | null // 셀 배경색 6자리 대문자 RGB, 채움 없으면 null
  export function buildTextColorAt(workbook: import("exceljs").Workbook, sheetName: string): (rowIndex: number, colIndex: number) => string | null // 글자색 원본 키: 6자리 대문자 RGB 또는 THEME<번호>, 없으면 null
  export async function parseWorkbookBuffer(data: ArrayBuffer | Uint8Array): Promise<{ sheetName: string; parsed: ParsedSchedule } | { error: string }>
  export async function readScheduleWorkbook(file: File): Promise<{ sheetName: string; parsed: ParsedSchedule } | { error: string }>
  // api.ts
  export async function fetchScheduleColumns(supabase: SupabaseBrowserClient): Promise<ScheduleColumn[]>
  export async function fetchScheduleCells(supabase: SupabaseBrowserClient, fromIso: string, toIso: string): Promise<ScheduleCell[]>
  export async function fetchScheduleRange(supabase: SupabaseBrowserClient, fromIso: string, toIso: string): Promise<{ columns: ScheduleColumn[]; cells: ScheduleCell[]; dayNotes: ScheduleDayNote[]; marks: ScheduleMark[] }>
  export async function saveScheduleDayNote(supabase: SupabaseBrowserClient, workDate: string, note: string): Promise<void>   // 빈 글(공백만)이면 행 삭제
  export async function setScheduleMark(supabase: SupabaseBrowserClient, workDate: string, columnId: string, color: MarkColor | null): Promise<void> // null이면 삭제, 아니면 upsert
  export async function createScheduleCell(supabase: SupabaseBrowserClient, position: CellPosition, text: ScheduleTextInput): Promise<void>
  export async function updateScheduleCellText(supabase: SupabaseBrowserClient, id: string, text: ScheduleTextInput): Promise<void>
  export async function moveScheduleCell(supabase: SupabaseBrowserClient, id: string, target: { workDate: string; columnId: string; rowNo: number | null }): Promise<void>
  export async function deleteScheduleCell(supabase: SupabaseBrowserClient, id: string): Promise<void>
  export async function updateScheduleColumn(supabase: SupabaseBrowserClient, id: string, input: { teamLabel: string; leaderLabel: string }): Promise<void>
  export async function applyScheduleImport(supabase: SupabaseBrowserClient, plan: ImportPlan): Promise<number>
  // use-schedule-range.ts
  export const SCHEDULE_QUERY_KEY = ["facility-schedule"] as const;
  export function useScheduleRange(from: string, to: string, enabled = true): { columns: ScheduleColumn[]; cells: ScheduleCell[]; dayNotes: ScheduleDayNote[]; marks: ScheduleMark[]; isAdmin: boolean; isLoading: boolean; isTableMissing: boolean; error: unknown; refresh: () => Promise<void> }
  ```

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `isScheduleTableMissing({ code: "42P01" }) === true`, `{ code: "PGRST205" }` → true, `{ message: 'relation "public.schedule_cells" does not exist' }` → true, `{ code: "42501" }`(권한) → false, `null`·문자열 → false.
- [ ] **Step 2: 실패 확인.** Run: `npx vitest run src/features/schedule/lib/table-missing.test.ts` → FAIL.
- [ ] **Step 3: `table-missing.ts`를 구현한다.** 통과 확인: 같은 명령 → PASS.
- [ ] **Step 3B: `read-schedule.ts`의 테스트를 쓴다(`read-schedule.test.ts`).** `exceljs`(Task 0에서 설치)로 작은 통합 문서를 코드에서 만들어(셀 값, 한 셀의 배경색 `fill` `FFD9F2D0`, 다른 셀들의 글자색 `font.color` `FF0070C0`·`FF00B0F0`·`FFFF0000`·테마 파랑 `{ theme: 4 }`·검정 `FF000000`) `await parseWorkbookBuffer(await wb.xlsx.writeBuffer())`에 넣는다. 기대: 시트 이름이 `일정표_New`면 그 시트를 읽고, 숨김 시트(`Workbook.Sheets[i].Hidden = 1`)는 건너뛰며, `일정표_New`가 없으면 헤더(A열 `날짜`)가 있는 첫 보이는 시트를 읽는다; 헤더가 없으면 `{ error: "일정표 형식(A열 '날짜' 머리글)을 찾지 못했습니다." }`; 칸이 하나도 없으면(날짜 메모·색만 있어도 칸이 없으면) `{ error: "가져올 일정이 없습니다." }`; 배경색이 `D9F2D0`인 첫 행·팀 앞 칸이 `parsed.marks`에 `D9F2D0`로 나온다. 글자색이 `FF0070C0`·`FF00B0F0`·테마 파랑인 칸은 `textColor === "0070C0"`, `FFFF0000`은 `"FF0000"`, 검정이거나 글자색이 없는 칸은 `null`. `buildFillAt`: 채움이 없는 셀·셀이 없는 위치는 `null`, `rgb`가 `FFD9F2D0`(알파 포함 8자리)여도 `D9F2D0`. 이 테스트도 처음에는 실패해야 한다 — Run: `npx vitest run src/features/schedule/lib/read-schedule.test.ts` → FAIL.
- [ ] **Step 4: `api.ts`를 구현한다.** 행→도메인 변환은 `site-lists/api.ts` 방식(`String(row.x)`)을 따른다. `text_color`는 `isTextColor`이면 그 값, 아니면 `null`이고, 칸 저장(`createScheduleCell`·`updateScheduleCellText`)은 `text_color`도 함께 쓴다(`ScheduleTextInput.textColor`). 열은 `sort_order` 순 조회. 칸 조회는 `work_date`가 `[fromIso, toIso]`인 행을 `fetchAllRows`로 `work_date, column_id, row_no` 순 조회. `moveScheduleCell`은 `supabase.rpc("move_schedule_cell", { p_cell_id, p_work_date, p_column_id, p_row_no })`. `applyScheduleImport`는 `rpc("replace_schedule_cells", { p_from: plan.deleteFrom, p_to: plan.deleteTo, p_cells, p_days, p_marks })`(칸·날짜 메모·색을 snake_case JSON으로 변환)를 부르고 칸 삽입 건수를 반환한다. `columnUpdates`에는 `leaderLabel`만 있으므로 `update({ leader_label })`만 보낸다(팀 이름은 건드리지 않는다). 팀장 반영은 칸 교체와 별도 호출이라, 칸 교체가 실패해도 팀장 이름은 바뀔 수 있다 — 칸 교체를 먼저 하고 성공하면 팀장을 반영해 이 틈을 줄인다. 모든 오류는 `throw error`.
- [ ] **Step 5: `read-schedule.ts`를 구현한다.** `parseWorkbookBuffer`(비동기): `XLSX.read(data, { type: "array", cellStyles: true })`(SheetJS는 테마 색을 RGB로 풀어 준다); 시트 이름 `일정표_New`가 있으면 그 시트, 없으면 숨김이 아닌 시트를 차례로 `parseScheduleRows`해 처음으로 `null`이 아닌 것; 행 배열은 `sheet_to_json(ws, { header: 1, raw: false, defval: "" })`(날짜는 표시 문자열 `6/29/26`로 읽힌다), 배경색은 `buildFillAt(ws)`, 글자색은 `await import("exceljs")`로 같은 데이터를 `wb.xlsx.load`해 `buildTextColorAt(wb, sheetName)`으로 읽는다(SheetJS 무료판은 글자색을 못 읽는다). 둘을 `parseScheduleRows(rows, { fillAt, textColorAt })`에 넘긴다. `buildTextColorAt`은 셀의 `font.color`가 `argb`이면 끝 6자리 대문자, `theme`이면 `THEME<번호>`, 없으면 `null`을 돌려주고, 행·열 인덱스(0부터)에 1을 더해 exceljs(1부터)에 접근한다. 가져오기 창을 열기 전에는 `exceljs`를 불러오지 않는다. `buildFillAt`은 `ws[XLSX.utils.encode_cell({ r, c })]?.s?.fgColor?.rgb`의 끝 6자리를 대문자로 돌려주고 없으면 `null`. `readScheduleWorkbook(file)`은 `await parseWorkbookBuffer(await file.arrayBuffer())`다. 오류 문구는 Step 3B의 값 그대로.
- [ ] **Step 6: `use-schedule-range.ts`를 구현한다.** `useQuery` 하나로 `[...SCHEDULE_QUERY_KEY, userId, from, to]`에서 `fetchScheduleRange(supabase, from, to)` 결과(`columns`, `cells`, `dayNotes`, `marks`)를 받는다. `enabled`는 `enabled && supabase && userId`(호출부가 보이지 않는 보기의 조회를 끌 때 쓴다). `retry: false`. 주를 바꿔도 이전 데이터를 유지하도록 `placeholderData: keepPreviousData`. `isAdmin`은 `useIsAdmin()`.
- [ ] **Step 7: 검증.** Run: `npx tsc --noEmit` → 오류 없음, `npx eslint src/features/schedule --max-warnings=0` → 통과.

---

### Task 6: 일정표 창과 칸 편집

**Files:**
- Create: `src/features/schedule/components/schedule-dialog.tsx`, `schedule-grid.tsx`, `schedule-cell-dialog.tsx`, `schedule-column-dialog.tsx`, `schedule-day-dialog.tsx`, `schedule-month-grid.tsx`, `schedule-legend.tsx`
- Modify: `src/features/shell/constants.ts` (상수 추가)

**Interfaces:**
- Consumes: Task 2~5 전부. `Dialog`·`DialogContent`·`DialogTitle`·`DialogDescription`(`@/components/ui/dialog`), `Button`, `Input`, `useToast`(`@/hooks/use-toast`).
- Produces:
  ```ts
  // shell/constants.ts
  export const SCHEDULE_DIALOG_MAX_WIDTH_PX = 1680;
  export const SCHEDULE_DATE_COLUMN_WIDTH_PX = 96;
  // components
  export function ScheduleDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element
  export function ScheduleGrid(props: { weekDates: string[]; columns: ScheduleColumn[]; cells: ScheduleCell[]; dayNotes: ScheduleDayNote[]; marks: ScheduleMark[]; canEdit: boolean; onEditCell: (cell: ScheduleCell | null, position: CellPosition) => void; onDropCell: (dragged: ScheduleCell, target: CellPosition) => void; onEditColumn: (column: ScheduleColumn) => void; onEditDay: (workDate: string) => void }): JSX.Element
  export function ScheduleCellDialog(props: { state: { cell: ScheduleCell | null; position: CellPosition } | null; columns: ScheduleColumn[]; mark: MarkColor | null; canEdit: boolean; onClose: () => void; onSaved: () => void }): JSX.Element
  export function ScheduleDayDialog(props: { workDate: string | null; note: string; canEdit: boolean; onClose: () => void; onSaved: () => void }): JSX.Element
  export function ScheduleMonthGrid(props: { model: MonthModel; onPickDay: (workDate: string) => void }): JSX.Element
  export function ScheduleLegend(): JSX.Element   // 칸 색 3종(중장비·승주·K대응)과 글자색(축전지수거) 이름·견본. 이름 없는 색은 보이지 않는다
  export function ScheduleColumnDialog(props: { column: ScheduleColumn | null; onClose: () => void; onSaved: () => void }): JSX.Element
  ```

- [ ] **Step 1: 상수를 추가한다.** `shell/constants.ts`에 위 두 상수를 주석과 함께 둔다(`GROUP_MANAGE_DIALOG_MAX_WIDTH_PX` 옆).
- [ ] **Step 2: `ScheduleGrid`를 만든다.** 표 구조는 `table-fixed w-full`: 첫 열 `SCHEDULE_DATE_COLUMN_WIDTH_PX`(인라인 `style`), 나머지는 열 개수로 균등 분할. 머리글은 `sticky top-0`이고 팀 라벨과 팀장(작은 글씨)을 두 줄로 쌓는다(머리글 한정, 칸은 아님). 관리자는 머리글을 눌러 `onEditColumn`. 날짜 블록은 `visibleRowCount`만큼 행을 그리고, 날짜 칸은 `rowSpan`으로 `yyyy-mm-dd`·`weekdayLabel`을 보여 준다(토·일은 연한 배경, 오늘은 인디고 테두리). 한 칸은 `<td>` 하나(쌍을 한 칸에 합쳐 보인다): `main`은 보통 글씨, `sub`는 `· ` 뒤에 흐린 글씨로 같은 줄에 `truncate whitespace-nowrap`, `title`에 전체. 칸 조회는 `indexCells`로 한다. 빈 칸·찬 칸 모두 클릭하면 `onEditCell`(비관리자는 찬 칸만 반응). 관리자의 찬 칸은 `draggable`, 모든 칸이 `onDragOver`(preventDefault)·`onDrop`을 받아 `dataTransfer`에 담은 칸 id로 `onDropCell`을 부른다. 행 수 계산은 `visibleRowCount`, 색상은 `slate`·`indigo` 토큰만 쓴다(라이트/다크 분기 직접 금지). 날짜 칸에는 요일 아래에 날짜 메모를 보이고, 관리자가 날짜 칸을 누르면 `onEditDay`. 날짜×팀 색(`marks`)은 데이터 값이라 토큰을 쓰지 않고, 그 날짜 블록의 해당 팀 쌍 모든 칸 배경을 `#RRGGBB` + 알파 `59`(약 35%)의 인라인 `style`로 칠한다(어두운 테마에서도 글자가 읽히게 투명도를 유지). 칸의 `textColor`가 있으면 그 칸의 글자색을 `TEXT_COLOR_DISPLAY[textColor]`(화면용 밝은 색)로 칠한다.
- [ ] **Step 3: `ScheduleCellDialog`를 만든다.** 입력: `국소·작업`(`maxLength 500`), `모국·장비·메모`, 날짜(`type="date"`), 열(`<select>`, 열 라벨로 `팀장 있으면 "1팀 · 팀장A"` 표기). `canEdit`이 false면 모든 입력을 `readOnly`/`disabled`로 하고 [닫기]만 둔다. 새 칸은 클릭한 위치가 기본값이고 삭제 버튼이 없다. 저장 규칙: 둘 다 비면 저장하지 않고 안내. 기존 칸이면 글이 바뀌었으면 `updateScheduleCellText`, 날짜·열이 바뀌었으면 `moveScheduleCell(..., rowNo: null)`(빈 행 자동). 새 칸이면 `createScheduleCell`. 새 칸·기존 칸 모두 대화창에 **글자색** 선택(`없음` + `TEXT_COLORS` 둘, 이름은 `textColorLabel`: `축전지수거`·`빨강 글자`)을 두고(글의 일부라 칸의 글과 함께 저장한다), 그 아래에 **칸 색** 선택(`MARK_COLORS` 5색 견본 + `없음`, 견본 옆 이름은 `markLabel`)을 두고, 라벨은 `이날(날짜) · 팀(열 이름) 칸 색`처럼 어느 날짜×팀의 색인지 밝힌다(대화창에서 날짜·열을 바꿔도 색은 클릭한 원래 날짜×팀 기준). 색이 바뀌었으면 저장 때 `setScheduleMark`. 저장 후 `onSaved()`. 삭제는 `group-admin/components/confirm-dialog.tsx`를 재사용해 확인받는다(그 파일의 props를 읽고 맞춘다). 오류는 `toast`로 `error.message`를 보여 준다. 키보드: `Enter`는 저장.
- [ ] **Step 4: `ScheduleColumnDialog`와 `ScheduleDayDialog`를 만든다.** 열 창: `팀 이름`, `팀장` 두 입력, `팀 이름`은 비면 저장 불가, 저장은 `updateScheduleColumn`. 날짜 창: `날짜 메모` 한 입력(`maxLength 100`), `canEdit`이 false면 읽기 전용, 저장은 `saveScheduleDayNote`(비우면 삭제), 제목에 날짜와 요일.
- [ ] **Step 4B: `ScheduleMonthGrid`와 `ScheduleLegend`를 만든다.** 월간 달력: `table-fixed w-full`, 머리글 `월`~`일`(토 `text-sky-400`, 일 `text-rose-400` 토큰). `model.weeks` 행마다 7칸. 한 칸은 위에 날짜 숫자(해당 월이 아니면 `m/d`, `inMonth === false`면 흐리게)와 날짜 메모(작은 글씨, 말줄임), 아래에 `MonthDay.teams`의 줄. 줄은 `whitespace-nowrap truncate`, 맨 앞에 칸 색 네모(`■`, 글자색 `#` + `markColor`, 색이 없으면 `slate` 토큰)와 `팀 · ` 뒤에 항목마다 `<span>`(글자색 `TEXT_COLOR_DISPLAY[textColor]`), `title`에 `monthTeamLineText`. 팀 줄은 `MONTH_VISIBLE_LINES`까지만 보이고 남으면 `외 N팀`. 칸을 누르면 `onPickDay(workDate)`. 일정이 없는 칸은 비워 둔다. 범례: `MARK_COLORS` 중 `markLabel`이 `칸`으로 끝나지 않는 색(이름이 있는 3개)과 `축전지수거` 글자색을 가로로 한 줄 보인다(색 견본 + 이름).
- [ ] **Step 5: `ScheduleDialog`를 만든다.** `DialogContent`의 `max-w`는 `SCHEDULE_DIALOG_MAX_WIDTH_PX`를 인라인 `style={{ maxWidth: ... }}`로 주고 `w-[96vw]`, 높이 `h-[90vh]`, 본문은 세로 스크롤만. 상태: `weekStart`(초기 `weekStartOf(todayIso())`), `cellEditor`, `columnEditor`, `dayEditor`, `view`(`"week" | "month"`, 기본 `"week"`), `month`(`"yyyy-mm"`, 초기 `monthOf(todayIso())`). `cellEditor`가 열릴 때 `mark`는 `marks`에서 그 날짜×열의 색을 찾아 넘긴다. 도구 줄: 보기 전환 `주간`·`월간`, `이전`·`다음`·`오늘` 버튼(주간은 한 주씩, 월간은 한 달씩 — `addMonths`), `type="date"` 이동 입력(선택하면 그 날짜의 주로), 기간 표시, 오른쪽의 `내보내기`·`가져오기` 버튼은 Task 7에서 추가하므로 이 단계에서는 만들지 않는다. 비관리자에게는 `읽기 전용` 배지를 보인다. `useScheduleRange`의 `isTableMissing`이면 "DB에 시설일정 테이블이 없습니다. 마이그레이션(20261108000000_facility_schedule.sql)을 Supabase에 적용해 주세요." 안내만 보인다. `onDropCell`: `planDrop`으로 판정해 `none`이면 무시, `move`·`swap`이면 `moveScheduleCell(supabase, dragged.id, target)` 후 `refresh()`, 실패하면 토스트. `useAuthSession().supabase`가 null이면 아무 것도 하지 않는다. 주간 데이터는 `useScheduleRange(weekStart, addDays(weekStart, 6))`, 월간 데이터는 `monthGridDates(month)`의 첫·마지막 날짜로 `useScheduleRange`를 불러(보이는 보기만 조회하도록 다른 쪽은 `enabled`를 끈다 — 훅에 `enabled` 인자를 둔다) `buildMonthModel`로 모델을 만든다. 월간 날짜를 누르면 `weekStart = weekStartOf(그 날짜)`로 바꾸고 `view`를 `"week"`로 돌린다(편집은 주간에서 한다). `ScheduleLegend`는 도구 줄 아래에 두 보기 모두 보인다.
- [ ] **Step 6: 검증.** Run: `npx tsc --noEmit`, `npx eslint src/features/schedule src/features/shell --max-warnings=0` → 오류 없음. (화면 확인은 Task 9.)

---

### Task 7: 내보내기·가져오기 창

**Files:**
- Create: `src/features/schedule/components/schedule-export-dialog.tsx`, `schedule-import-dialog.tsx`
- Modify: `src/features/schedule/components/schedule-dialog.tsx` (도구 줄에 두 버튼 연결)

**Interfaces:**
- Consumes: `downloadWeeklyWorkbook`·`downloadMonthlyWorkbook`·`downloadDataWorkbook`(Task 7A), `computeWeeklyScale`·`buildWeeklyWeeks`·`PaperSize`(Task 4A), `buildMonthModel`·`monthWeekHeightPt`·`computeMonthScale`(Task 4B), `monthGridDates`·`monthOf`·`addMonths`(Task 2), `readScheduleWorkbook`(Task 5), `planImport`·`matchColumns`(Task 4), `applyScheduleImport`·`fetchScheduleRange`(Task 5), `weekStartsOf`·`weekDatesOf`·`addDays`·`isValidIso`(Task 2).
- Produces:
  ```ts
  export function ScheduleExportDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; defaultFrom: string; defaultTo: string }): JSX.Element
  export function ScheduleImportDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; columns: ScheduleColumn[]; onImported: () => void }): JSX.Element
  ```

- [ ] **Step 1: `ScheduleExportDialog`.** 맨 위에 세 가지 방식 라디오: `주간 배포용`(기본), `월간 배포용`, `일정표_New 형식`. **주간 배포용**: `시작 날짜`(`type="date"`, 기본 현재 주; 고른 날짜가 속한 주의 월요일로 맞춘다), `주 수`(1~12, 기본 1), `용지`(A3 가로 기본 / A4 가로). 아래에 "N주 · 2026-11-09 ~ 2026-11-22 · 확대율 N%(글자가 작아질 수 있음)"을 `weekStartsOf`·`buildWeeklyWeeks`·`computeWeeklyScale`로 계산해 보인다. **월간 배포용**: `월`(`type="month"`, 기본 이번 달), `용지`(A3 가로 기본 / A4 가로). 아래에 "2026년 11월 · 6주 · 확대율 N%"를 `buildMonthModel`·`monthWeekHeightPt`·`computeMonthScale`로 계산해 보인다. **일정표_New 형식**: 시작일·종료일 `type="date"`(기본 현재 주), 종료일이 시작일보다 이르거나 기간이 366일을 넘으면 버튼을 막고 사유를 보인다. [내려받기]는 `fetchScheduleRange(supabase, from, to)`로 열·칸·날짜 메모·색을 받아 해당 방식의 `download*Workbook`을 부른다(주간 배포용은 `from = 첫 주 월요일`, `to = 마지막 주 일요일`, 월간 배포용은 `monthGridDates(month)`의 첫·마지막 날짜). 파일명은 주간 `시설일정_주간_<첫 월요일>_<N>주.xlsx`, 월간 `시설일정_월간_<yyyy-mm>.xlsx`, 데이터 `시설일정_<from>_<to>.xlsx`. 첫 사용 때 `exceljs`를 불러오는 동안 버튼에 `준비 중…`을 보인다. 실패는 토스트. `defaultFrom`은 현재 주 월요일, `defaultTo`는 일요일이다.
- [ ] **Step 2: `ScheduleImportDialog`(관리자 전용).** 파일 선택(`accept=".xlsx,.xlsm,.xlsb"`) → `readScheduleWorkbook` → 오류면 문구 표시. 성공하면 미리보기: 읽은 시트 이름, 기간(`firstDate ~ lastDate`), 날짜 수, 칸 수, 무시한 값 수(`ignoredCount`), 날짜 메모 수, 칸 색 수, 글자색이 있는 칸 수, 열 매칭 결과(`matchColumns`; 매칭 안 된 열이 있으면 "N개 열은 대응하는 팀 열이 없어 건너뜁니다"). `가져오기 시작일` 입력(기본 `firstDate`)을 바꿀 때마다 `planImport`로 다시 계산해 "덮어쓸 기간 A ~ B에 있는 기존 일정이 지워지고 N칸으로 바뀝니다"를 빨간 경고로 보인다. `planImport`가 `null`이면 "시작일 이후 가져올 일정이 없습니다" 안내와 버튼 비활성. [가져오기] 버튼 두 단계 확인(첫 클릭이 `정말 덮어쓰시겠습니까?`로 바뀌고 다시 클릭하면 실행). 실행은 `applyScheduleImport` → 성공 토스트(`N칸을 가져왔습니다`) → `onImported()`·닫기. 실패하면 오류 메시지를 그대로 보인다(칸 교체는 한 번에 처리되므로 실패하면 일정은 그대로다).
- [ ] **Step 3: 연결.** `ScheduleDialog` 도구 줄에 `내보내기`(항상)와 `가져오기`(`isAdmin`일 때만)를 추가해 두 창을 연다. `onImported`는 `refresh()`와 `weekStart`를 가져온 `firstDate`의 주로 옮기는 동작.
- [ ] **Step 4: 검증.** Run: `npx tsc --noEmit`, `npx eslint src/features/schedule --max-warnings=0` → 오류 없음.

---

### Task 7A: 엑셀 파일 쓰기(`exceljs`)

**Files:**
- Create: `src/features/schedule/lib/write-workbook.ts`
- Test: `src/features/schedule/lib/write-workbook.test.ts`

**Interfaces:**
- Consumes: `buildExportRows`·`EXPORT_MIN_ROWS`(Task 4), `buildWeeklyWeeks`·`computeWeeklyScale`·`PaperSize`·`WEEKLY_*`(Task 4A), `buildMonthModel`·`monthEntryText`·`monthTeamLineText`·`monthWeekHeightPt`·`computeMonthScale`·`MONTH_*`(Task 4B), `parseWorkbookBuffer`·`buildFillAt`(Task 5), `ScheduleColumn`·`ScheduleCell`·`ScheduleDayNote`·`ScheduleMark`(Task 2).
- Produces:
  ```ts
  export interface WorkbookInput { columns: ScheduleColumn[]; cells: ScheduleCell[]; dayNotes: ScheduleDayNote[]; marks: ScheduleMark[] }
  export async function buildWeeklyWorkbook(input: WorkbookInput & { weekStarts: string[]; paper: PaperSize }): Promise<import("exceljs").Workbook>
  export async function buildDataWorkbook(input: WorkbookInput & { dates: string[] }): Promise<import("exceljs").Workbook>
  export async function buildMonthlyWorkbook(input: WorkbookInput & { month: string; paper: PaperSize }): Promise<import("exceljs").Workbook>
  export async function downloadWeeklyWorkbook(input: WorkbookInput & { weekStarts: string[]; paper: PaperSize; fileName: string }): Promise<void>
  export async function downloadDataWorkbook(input: WorkbookInput & { dates: string[]; fileName: string }): Promise<void>
  export async function downloadMonthlyWorkbook(input: WorkbookInput & { month: string; paper: PaperSize; fileName: string }): Promise<void>
  ```
  `build*`는 DOM을 쓰지 않아 노드 테스트에서 호출한다. `download*`는 `build*` → `workbook.xlsx.writeBuffer()` → `Blob` → 임시 `<a download>` 클릭. `exceljs`는 두 `build*` 안에서만 `await import("exceljs")`로 불러온다.

- [ ] **Step 0: 전제 확인.** `exceljs`는 Task 0에서 설치되어 있어야 한다. Run: `npm ls exceljs` → `exceljs@4.4.0`.
- [ ] **Step 1: 실패하는 테스트를 쓴다.** 공통 입력은 열 2개(`1팀`/`팀장A`, `시험팀`/``), 칸 몇 개, 날짜 메모 1개, 칸 색 1개. 기대:
  - **주간 배포용**(`weekStarts: ["2026-11-09"]`, `paper: "A3"`): 시트 이름 `주간일정`; 머리글 행의 `C1` 값이 `"1팀\n팀장A"`, 시험팀 쌍의 머리글은 `"시험팀"`; `pageSetup.orientation === "landscape"`, `pageSetup.paperSize === 8`(A3, A4면 9), `pageSetup.scale === computeWeeklyScale({ paper: "A3", columnCount: 2, weekRowCounts: [70] })`, `pageSetup.fitToPage`는 falsy, 인쇄 제목 행이 `1:1`; 쪽 나눔 개수가 주 수(1)와 같고 주 2개면 2; 첫 날(월요일) 블록 3번째 행에 `2026-11-09`(A열)와 `월요일`(B열), 4번째 행 B열에 그 날짜 메모(메모가 있는 날), 일요일 블록의 날짜 글자색이 `FFFF0000`, 토요일은 `FF0070C0`; 색이 지정된 날짜×팀의 두 칸(앞·뒤) **모든 행**의 채움색이 `FF` + 색 값; 칸 값이 지정한 행·열에 들어 있다(`main`은 팀의 앞 칸, `sub`는 뒤 칸); 칸 셀의 `alignment.shrinkToFit === true`, `wrapText`는 falsy. `textColor`가 있는 칸의 앞·뒤 칸 글자색이 `FF` + 그 색(`FF0070C0`/`FFFF0000`), 없는 칸은 기본 글자색.
  - **일정표_New 형식**(`dates` 7일): `buildDataWorkbook` 결과를 `writeBuffer()`로 쓴 뒤 `await parseWorkbookBuffer`(Task 5, 비동기)로 다시 읽으면 같은 칸(날짜·열·행·글), 팀 머리글(라벨·팀장), 날짜 메모, 칸 색이 나온다(**왕복**). 날짜 메모와 색이 없는 입력도 왕복한다. A열 날짜 셀의 표시 형식이 `m/d/yy`. 범례(1~4행)가 있고(A1 `중장비`+채움 `FFD9F2D0`, A2 `승주`+`FFF2CFEE`, A3 `축전지수거`+글자 `FF0070C0`, A4 `K대응`+`FF4E95D9`), 글자색이 있는 칸은 왕복 후에도 `textColor`가 같다.
  - **월간 배포용**(`month: "2026-11"`, `paper: "A3"`): 시트 이름 `월간일정`; 1행에 `2026년 11월`(7열 병합); 2행 머리글 `월`~`일`; 날짜 행이 6주(11월은 6주)이고 각 칸의 첫 줄에 날짜 숫자(달 밖 날짜는 `10/26`처럼 `월/일`)가 들어가며 날짜 메모가 있으면 그 뒤에 붙는다; 일정이 있는 날의 칸에 팀 줄(`1팀 · 국소1 (모국1), 국소2`)이 들어가고 `alignment.wrapText === true`; 팀 줄 앞 `■`가 `richText` run이고 글자색이 `FF` + 칸 색(색이 없으면 `FF808080`), 글자색이 있는 항목의 run 글자색이 `FF0070C0` 등; 달 밖 날짜 칸의 채움이 `FFF2F2F2`; `pageSetup.scale === computeMonthScale({ paper: "A3", weekHeightsPt })`, 쪽 나눔 없음(한 달 한 쪽), 가로, `paperSize === 8`.
- [ ] **Step 2: 실패 확인.** Run: `npx vitest run src/features/schedule/lib/write-workbook.test.ts` → FAIL.
- [ ] **Step 3: `buildDataWorkbook`을 구현한다.** `buildExportRows`의 `rows`를 시트에 쓰고(헤더 행 굵게), `dateRowIndexes`의 A열 셀에 숫자 날짜 + `numFmt = "m/d/yy"`, `fills`의 셀에 `fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + color } }`, 열 너비는 `WEEKLY_*_COL_PX / 7`(문자 수 단위). 맨 위에 범례 4행을 쓰고(`buildExportRows`의 행), `fonts`의 셀에 `font: { color: { argb: "FF" + color } }`(범례의 `축전지수거` 포함)를 적용한다. 시트 이름 `일정표_New`. 인쇄 설정은 두지 않는다.
- [ ] **Step 4: `buildWeeklyWorkbook`을 구현한다.** 시트 `주간일정`. 열: A=날짜, B=요일·메모, 이후 팀마다 `[앞 칸, 뒤 칸]`(너비는 `WEEKLY_*_COL_PX / 7`). 1행은 머리글(높이 `WEEKLY_HEADER_HEIGHT_PT`, 굵게, 가운데, 연한 회색 채움, 얇은 테두리, 팀 쌍은 두 칸 병합, A1:B1 병합 `날짜`; 팀장이 있으면 `"팀\n팀장"` 줄바꿈 허용은 머리글만). 이후 `buildWeeklyWeeks` 결과대로 주마다 7개 날짜 블록을 이어 쓴다: 블록 행 수 `rowCount`, 모든 행 높이 `WEEKLY_ROW_HEIGHT_PT`, 날짜·요일은 블록 3번째 행(A: `yyyy-mm-dd`, B: `월요일`), 메모는 4번째 행 B열. 토요일 글자색 `FF0070C0`, 일요일 글자색 `FFFF0000`이며 일요일 블록 윗줄은 빨간 얇은 선, 날짜 블록 아랫줄은 진한 남색 중간 선(`FF1F3864`). 칸 글꼴 `맑은 고딕` 10pt(칸의 `textColor`가 있으면 앞·뒤 칸 글자색 `FF` + 색), 가운데 아닌 왼쪽 정렬, `shrinkToFit: true`·줄바꿈 없음. 날짜×팀 색이 있으면 그 날의 해당 팀 쌍 모든 행을 채운다. 주의 마지막 행에 `addPageBreak()`. 시트 `pageSetup`: 가로, `paperSize`(A3 8, A4 9), `scale = computeWeeklyScale({ paper, columnCount, weekRowCounts })`(주별 행 수 합 배열), 여백 0.4인치, `printTitlesRow: "1:1"`, `horizontalCentered: true`, `fitToPage`는 설정하지 않는다.
- [ ] **Step 4B: `buildMonthlyWorkbook`을 구현한다.** 시트 `월간일정`. 열 7개(월~일, 너비 `MONTH_DAY_COL_PX / 7`). 1행: 7열 병합 제목 `buildMonthModel(...).title`(굵게 14pt, 가운데, 높이 `MONTH_TITLE_HEIGHT_PT`). 2행: 머리글 `월`~`일`(토 글자 `FF0070C0`, 일 `FFFF0000`, 높이 `MONTH_HEADER_HEIGHT_PT`). 이후 `model.weeks`의 주마다 한 행(높이 `monthWeekHeightPt(week)`). 날짜 칸 값은 `richText`: 첫 줄은 날짜(`inMonth`이면 일 숫자, 아니면 `m/d`)와 날짜 메모가 있으면 두 칸 띄우고 메모(작은 회색 글씨), 이어서 팀마다 한 줄(`\n`으로 구분): 맨 앞 `■` run(글자색 `FF` + 칸 색, 색이 없으면 `FF808080`), `팀 · ` run, 항목마다 `monthEntryText` run(항목 `textColor`가 있으면 글자색 `FF` + 색, 항목 사이는 `, `). `inMonth === false`인 날짜 칸은 `FFF2F2F2`로 채운다. `alignment`는 위쪽·왼쪽 정렬, `wrapText: true`. 얇은 회색 테두리. 쪽 나눔 없음. `pageSetup`: 가로, `paperSize`(A3 8, A4 9), `scale = computeMonthScale({ paper, weekHeightsPt })`, 여백 0.4인치, `horizontalCentered: true`, `fitToPage`는 설정하지 않는다.
- [ ] **Step 5: `download*`를 구현한다.** `buildX` → `writeBuffer` → `Blob`(`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) → `URL.createObjectURL` → 임시 링크 클릭 → `URL.revokeObjectURL`.
- [ ] **Step 6: 통과 확인.** Run: `npx vitest run src/features/schedule/lib/write-workbook.test.ts` → PASS, `npx tsc --noEmit`, `npx eslint src/features/schedule --max-warnings=0` → 오류 없음.

---

### Task 8: 사이드바 연결(패널·메뉴·하위 메뉴)

**Files:**
- Create: `src/features/schedule/components/schedule-panel.tsx`
- Modify: `src/features/shell/types/nav.ts`, `src/features/shell/types/segment.ts`, `src/features/shell/lib/nav-model.ts`, `src/features/shell/hooks/use-shell-nav.ts`, `src/features/shell/components/panel-body.tsx`, `nav-tree.tsx`, `work-panel.tsx`, `mobile-shell.tsx`, `app-shell.tsx`
- Test: `src/features/shell/lib/nav-model.test.ts`, `src/features/shell/types/nav.test.ts` (수정)

**Interfaces:**
- Consumes: `ScheduleDialog` (Task 6).
- Produces:
  ```ts
  // segment.ts
  export type ScheduleSegment = "facility";
  export type NavSubKey = MapSegment | ScheduleSegment;
  // nav-model.ts
  export const SEGMENT_META: Record<NavSubKey, { label: string; icon: LucideIcon }>   // facility: 시설일정
  export function segmentsOfNav(nav: NavKey): NavSubKey[]
  export function isSubActive(nav: NavKey, key: NavSubKey, segment: MapSegment): boolean
  export function subLabelOf(nav: NavKey, segment: MapSegment): string
  export function showsMarkerSummary(nav: NavKey, segment: MapSegment): boolean
  export interface NavTreeNode { item: NavItem; segments: NavSubKey[] }
  // use-shell-nav.ts
  pickSegment(nav: NavKey, segment: NavSubKey): void
  isSegmentLocked(segment: NavSubKey): boolean
  // schedule-panel.tsx
  export function SchedulePanel(): JSX.Element
  ```

- [ ] **Step 1: 실패하는 테스트로 고친다.** `nav.test.ts`: 로그인(비관리자 포함) 사용자에게 `schedule`이 보이고, 비로그인에게는 안 보인다; `visibleNavItems(true, true)` 키 순서에서 `schedule`이 `markers` 바로 다음, `groups` 바로 앞. `nav-model.test.ts`: `segmentsOfNav("schedule")`는 `["facility"]`, `hasNavSegments("schedule") === true`, 모바일 탭은 그대로 `["dashboard","map","markers","cctv"]`, 더보기(관리자)는 `["schedule","groups","barcode","backup","settings"]`, 더보기(비관리자)는 `["schedule","barcode","backup","settings"]`, 전체 키 정렬 비교 테스트는 `schedule`을 포함, `filterNavTree`에서 `"시설"` 검색 시 `[["schedule", ["facility"]]]`만 남고, `"일정"` 검색 시 `schedule` 노드의 `segments`가 `["facility"]`, `isSubActive("schedule","facility","equipment") === true`, `isSubActive("map","battery","battery") === true`, `isSubActive("map","battery","equipment") === false`, `subLabelOf("schedule","equipment") === "시설일정"`, `subLabelOf("map","battery") === "축전지"`, `showsMarkerSummary("schedule","equipment") === false`, `showsMarkerSummary("map","equipment") === true`, `showsMarkerSummary("map","converter") === false`, `showsMarkerSummary("cctv","equipment") === false`. 필터 테스트의 `items` 목록에 `schedule`을 추가하지 않는다(기존 기대값 유지).
- [ ] **Step 2: 실패 확인.** Run: `npx vitest run src/features/shell` → FAIL.
- [ ] **Step 3: 타입과 모델을 고친다.** `nav.ts`: `NavKey`에 `"schedule"`, `NAV_ITEMS`의 `markers` 다음에 `{ key: "schedule", label: "일정관리", icon: CalendarDays, auth: true, enabled: true }`. `segment.ts`: 위 두 타입 추가(`modeOfSegment`·`segmentOfMode`는 `MapSegment` 그대로 둔다 — 일정관리는 지도 모드와 무관). `nav-model.ts`: `SEGMENT_META`를 `NavSubKey` 기준으로 넓히고 `facility: { label: "시설일정", icon: CalendarRange }`, `NAV_SEGMENTS`에 `schedule: ["facility"]`, `NAV_DESCRIPTIONS.schedule = "시설팀 일정표를 보고 관리합니다"`, `AUTH_ONLY_SEGMENTS`의 타입을 `NavSubKey[]`로, 위 세 함수 추가.
- [ ] **Step 4: 호출부를 맞춘다.** `use-shell-nav.ts`의 `pickSegment`는 `nav === "schedule"`이면 `setActiveNav(nav)`·`setPanelStep("detail")`·`openPanel()`만 하고 끝낸다(지도 세그먼트·모드는 건드리지 않는다). 그 외 분기는 기존 그대로이며 `segment`가 `MapSegment`임을 좁혀 쓴다(`as MapSegment`는 쓰지 말고 `nav === "schedule"` 분기 뒤에서 타입이 자연히 좁혀지게 `NavSubKey`를 받는 함수 시그니처를 둔다 — 안 되면 최소한의 타입 가드 함수 `isMapSegment(key: NavSubKey): key is MapSegment`를 `segment.ts`에 둔다). `nav-tree.tsx`·`work-panel.tsx`·`mobile-shell.tsx`: `SEGMENT_META[segment].label` 자리는 `subLabelOf(activeNav, segment)`, 하위 항목 활성 판정은 `isSubActive`, 설명의 `segment !== "converter"` 조건은 `showsMarkerSummary`, `segmentCounts` 타입은 `Partial<Record<NavSubKey, number>>`(건수 없는 `facility`는 `undefined`라 배지가 안 나온다). `app-shell.tsx`의 `segmentCounts` 타입도 같이 맞춘다.
- [ ] **Step 5: 패널을 만든다.** `schedule-panel.tsx`: `PanelSection`(기존 `shell/components/panels/panel-section.tsx`, props를 읽고 맞춘다) 안에 한 줄 안내, [일정표 열기] 버튼(누르면 `ScheduleDialog`를 `dynamic()`으로 연다), 관리자가 아니면 "수정은 관리자만 할 수 있습니다"를 보인다. `ScheduleDialog`는 `dynamic(() => import(...), { ssr: false })`로 받는다. `panel-body.tsx`: `SchedulePanel`을 같은 방식으로 `dynamic()` 임포트하고 `match`에 `.with("schedule", () => <SchedulePanel />)`를 추가한다(`exhaustive()`가 누락을 컴파일 오류로 알려 준다).
- [ ] **Step 6: 통과 확인.** Run: `npx vitest run src/features/shell` → PASS, `npx tsc --noEmit` → 오류 없음, `npx eslint . --max-warnings=0` → 통과.

---

### Task 9: 문서, 전체 검증, 화면 확인

**Files:**
- Modify: `AGENTS.md` (features 목록), `docs/Ver_3.0/Ver_3.0_계획.md` (13장 끝에 구현 상태 한 줄)

- [ ] **Step 1: 문서.** `AGENTS.md`의 features 나열에 `schedule`(시설일정: 일정표 조회·편집·엑셀)을 추가한다. 계획서 13장에 "구현 완료(날짜). 마이그레이션 적용 전" 한 줄을 넣는다. 이전 버전 폴더는 수정하지 않는다.
- [ ] **Step 2: 전체 검증.** 개발 서버가 떠 있으면 먼저 종료한다. Run: `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test`, `npx next build`. 기대: 모두 통과, 빌드 출력의 홈 First Load JS가 **295 kB 이하**. 넘으면 `schedule` 쪽 정적 import(특히 `xlsx`·`exceljs`)가 홈 번들에 들어갔는지 확인하고 `dynamic()`·`await import()`로 분리한다. `exceljs`가 정적으로 import된 곳이 없는지 `grep -rn "from \"exceljs\"\|from 'exceljs'" src`로 확인한다(결과가 없어야 한다).
- [ ] **Step 3: 마이그레이션 적용을 사용자에게 요청한다.** Supabase SQL Editor에서 `20261108000000_facility_schedule.sql`을 실행해 달라고 안내하고, 파일 끝 확인 쿼리(관리자 삽입 성공, 일반 계정 삽입 거부, 일반 계정 조회 성공)를 함께 알린다. 적용 전에는 아래 화면 확인 중 DB가 필요한 항목을 하지 않는다.
- [ ] **Step 4: 화면 확인(개발 서버, 적용 후).** 확인 항목: ① 사이드바 순서가 `마커관리 → 일정관리 → 그룹관리`이고 트리에서 `일정관리 → 시설일정`이 보인다(레일/트리/모바일 더보기 모두). ② 일정표 창이 가로 스크롤 없이 열리고 주 이동·오늘·날짜 이동이 된다. ③ 관리자: 빈 칸 클릭 추가, 칸 수정, 끌어서 이동, 찬 칸에 놓아 맞바꿈, 다른 날짜로 이동(대화창), 삭제, 머리글 수정. ④ 일반 계정: 칸이 읽기 전용이고 끌기·가져오기 버튼이 없으며 DB 쓰기가 거부된다. ⑤ 내보내기 → 엑셀에서 열어 `일정표_New`와 같은 모양인지, 다시 가져오면 같은 일정인지. ⑥ 사용자 파일(`261109_시설일정_수정2.xlsx`)을 가져오기 미리보기로 읽어 기간 `2026-06-29 ~ 2027-01-03`, 날짜 189일이 나오는지(실제 덮어쓰기는 사용자 백업 확인 후). ⑦ 라이트/다크 모두 읽을 수 있는지. ⑧ **주간 배포 파일:** 2026-11-09 주를 `주간 배포용`(A3)으로 내려받아 Excel에서 연다. 확인: 인쇄 미리보기에서 한 주가 한 쪽이고 쪽마다 팀·팀장 머리글이 반복되는지, 토요일 파란색·일요일 빨간색과 빨간 윗줄, 날짜 메모(요일 아래 이름), 날짜×팀 색이 사용자가 보낸 배포 이미지와 같은 모양인지, 긴 국소명이 칸 안에서 줄어들어 보이는지, 글자 크기가 읽을 만한지(A3 약 42%). 사용자 이미지와 다르면 차이를 목록으로 받아 고친다. ⑨ **왕복:** `일정표_New 형식`으로 내려받은 파일을 다시 가져오기 미리보기에 넣어 같은 건수·기간·날짜 메모·색·글자색이 나오는지. ⑩ **월간·색 지정:** 일정표에서 `월간`으로 바꿔 월 달력이 나오고 날짜를 누르면 그 주 `주간` 보기로 가는지, `월간 배포용`(A3) 파일이 한 달 한 쪽 달력으로 나오고 칸 색·글자색·날짜 메모가 보이는지, 칸 창에서 글자색(축전지수거·빨강)과 칸 색(중장비·승주·K대응 등)을 고르면 일정표와 내려받은 파일에 반영되는지, 일정표 위 범례의 이름과 색이 맞는지.
- [ ] **Step 5: 결과 보고.** 통과한 명령과 번들 수치, 확인하지 못한 항목(DB 적용 후에만 가능한 것)을 사실대로 적어 사용자에게 알린다.

---

## 변경 기록

- **화면 구조 변경(2026-11-07, 사용자 요청):** 일정표를 패널의 [일정표 열기] 창(`ScheduleDialog`, `SchedulePanel`)이 아니라 **사이드바 오른쪽 전체**에 직접 그린다. `schedule-dialog.tsx`·`schedule-panel.tsx`를 `schedule-view.tsx`(`ScheduleView`)로 바꾸고, `AppShell`이 `activeNav === "schedule"`일 때 지도를 숨기고(`hidden`, 언마운트 없음) 상단 검색바와 작업 패널을 없앤 뒤 `ScheduleView`를 `dynamic()`으로 그린다. 순수 로직 `initialPanelStep`(일정관리는 바로 상세 단계)과 `isPanelVisible`(일정관리는 패널 없음, 셸과 지도 오프셋이 같은 판정을 쓴다)을 `nav-model.ts`에 두고 테스트했다. 모바일은 일정관리에서 시트 없이 화면 전체를 쓰고 더보기를 열 때만 시트가 뜬다. 칸·열·날짜 메모·내보내기·가져오기 창은 그대로 창이다. `SCHEDULE_DIALOG_MAX_WIDTH_PX`는 삭제했다.

- **칸 창 보강(2026-11-07, 사용자 요청):** (1) `국소·작업`에 국소 검색 입력(`station-input.tsx`, 순수 함수 `lib/station-search.ts`: 국소명 시작 일치 → 포함 → 주소·별칭 일치 순, 공백·대소문자 무시, 같은 국소명 중복 제거, 원본은 `useMapMarkersQuery`의 장비 마커). (2) 입회·신호수 체크(`lib/companions.ts`): 사용자가 **별도 행으로 저장(엑셀과 동일)** 을 골랐다. `입회 : 이름` 형식, 이름 없으면 `입회`만, 새 칸은 기준 행 아래의 빈 행부터(없으면 위로 돌아감, `firstFreeRow`에 `fromRow` 추가), 이미 있으면 수정·삭제, 행이 가득 차면 저장 전에 안내. 칸 창은 `cells` prop을 받는다. (3) 주간 보기 최소 행 `MIN_VISIBLE_ROWS`를 4에서 10으로(엑셀 날짜 블록과 같다).

- **국소 여러 개 선택(2026-11-07, 사용자 요청):** `station-input.tsx`가 다중 선택(칩, 목록 유지, 키보드)으로 바뀌고, 순수 함수 `lib/station-rows.ts`(`toggleStation`, `addCustomStation`, `planExtraStationRows`, 최대 20개)가 선택 목록과 아래 행 계산을 맡는다. 칸 창 저장은 첫 국소를 이 칸에, 나머지를 아래 빈 행에 `createScheduleCell`로 차례로 만들고, 입회·신호수 칸의 행은 그 뒤에 비는 행으로 잡는다(`reservedRows`로 충돌 방지). 여러 개를 고를 때 날짜·팀 변경은 막는다.

- **팀·날짜 목록 편집(2026-11-07, 사용자 요청 — 여러 국소를 등록한 뒤 한 국소만 보여 고치기 어려움):** 직전의 `station-rows.ts`(칩 다중 선택)와 `station-input.tsx`를 없애고, 순수 함수 `lib/group-edit.ts`(`draftsFromCells`, `planGroupOps`: 지움 → 고침 → 추가 순서, 공백 차이는 변경 아님, 새 항목은 클릭한 행 또는 마지막 항목 아래 빈 행, 같은 저장에서 지운 행 재사용, 글을 모두 지운 기존 항목은 `blank` 오류, 행 부족은 `full` 오류)와 `station-search-add.tsx`(검색해서 목록에 추가)로 바꿨다. 칸 창(`schedule-cell-dialog.tsx`)은 그 팀·날짜의 목록을 한 번에 고친다. 입회·신호수 칸은 목록에 넣지 않고 체크 영역에서 따로 다루며(`planCompanionOps`에 `reservedRows`로 새 항목 행을 넘겨 충돌을 막는다), 칸 창의 `삭제` 버튼은 없애고 행의 ×로 대신한다. 날짜·팀 옮기기는 처음 클릭한 일정 하나에만 적용한다.

## 자체 검토 기록

- **설계서 대응:** 메뉴 위치·권한(Task 8), 데이터 모델·RLS·원자적 이동·덮어쓰기(Task 1), 주 단위 화면·말줄임·드래그·대화창 이동(Task 3, 6), 내보내기·가져오기·시작일·미리보기·덮어쓰기 경고(Task 4, 7), 마이그레이션 전 안내(Task 5, 6), 모바일 더보기(Task 8). 설계서의 "다음 단계"(2026-11-09 상세 시트)는 범위 밖이라 작업이 없다.
- **추가 요청 반영 2(2026-11-07):** 범례 이름(중장비·승주·K대응·축전지수거)과 글자색 지정(Task 1, 2, 4, 5, 6), 월 달력 보기와 월간 배포(Task 4B, 6, 7, 7A), `exceljs` 설치를 Task 0으로 앞당김(글자색 읽기·쓰기 테스트가 필요해서).
- **추가 요청 반영(2026-11-07):** 날짜 메모·날짜×팀 색(Task 1, 2, 4, 6), 주간 배포 계산(Task 4A), `exceljs` 쓰기와 주간 배포 파일(Task 7A), 내보내기 창의 두 방식(Task 7). 읽기는 기존 `xlsx`를 유지해 새 의존성을 쓰기에만 한정했다.
- **타입 일관성:** `NavSubKey`·`ScheduleColumn`·`ScheduleCell`·`CellPosition`·`ImportPlan`의 이름과 필드를 각 Task의 Interfaces와 맞췄다. `moveScheduleCell`의 `rowNo: number | null`은 RPC의 `p_row_no` null 규칙과 같다.
- **열린 위험:** `ConfirmDialog`와 `PanelSection`의 실제 props는 구현 때 파일을 읽고 맞춘다(Task 6·8에 명시). 일련번호 변환의 1900년 윤년 버그 구간은 `toExcelSerial("1900-03-01") === 61` 테스트로 고정한다.
