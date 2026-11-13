# 시설일정 일자별 상세 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시설일정에 `일자별`(그날 24열 작업 상세표)과 `누적`(만든 상세를 쌓아 두고 참조) 보기를 더하고, 표 복사와 서식을 재현한 엑셀 내려받기를 만든다.

**Architecture:** 행 만들기·값 변환·참조 병합·복사 글·엑셀 쓰기는 순수 함수(`src/features/schedule/lib/day-*.ts`)로 두고 vitest로 고정한다. DB는 새 테이블 3개(상세 입력, 목록, 누적)이고 일정 테이블은 건드리지 않는다. 화면은 `schedule-view.tsx`가 보기 전환만 맡고 일자별·누적은 자기 데이터를 스스로 불러오는 별도 컴포넌트다.

**Tech Stack:** Next.js 15, React 19, TypeScript(엄격), @tanstack/react-query, Supabase JS, Tailwind 3, `exceljs`(내려받을 때만 동적 로드), vitest(`.ts`만 실행).

**Spec:** `docs/Ver_3.0/Ver_3.0_계획.md` §14 (14.1~14.12)

## Global Constraints

- 검증 명령: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test` · `npx next build`. 홈 First Load JS **295 kB 이하**. `exceljs`는 첫 로딩 묶음에 넣지 않는다(내려받기 함수 안에서 `await import("exceljs")`).
- **`next build`는 개발 서버(포트 3000)가 떠 있을 때 실행하지 않는다**(`.next`를 덮어써 화면이 깨진다). 임시 `distDir`로 빌드하고 설정을 원복한다.
- `vitest.config.ts`는 `.ts` 테스트만 실행한다. **`.tsx` 테스트는 실행되지 않으므로** 로직은 `.ts`로 분리하고 컴포넌트는 `tsc`·`eslint`와 화면 확인으로 검증한다.
- Supabase는 로컬에서 실행하지 않는다. 마이그레이션 SQL 파일만 만들고 **적용은 사용자가 한다.** 적용 확인은 읽기 전용 조회로만 한다.
- 표: 셀 줄바꿈 금지, 가로 스크롤 금지(폭이 모자라면 열 폭을 줄이고 말줄임 + 툴팁), 세로 스크롤만 허용. 날짜 선택은 공통 `DatePicker`, 시각·목록은 브라우저 기본 입력이 아닌 공통 컴포넌트.
- 날짜는 항상 `yyyy-mm-dd` 문자열이다(`Date`를 DB 경계에 넘기지 않는다). 한글은 UTF-8, 작성 후 깨짐을 확인한다. 셸 here-doc에 백슬래시가 든 글을 넣지 않는다(파일 도구를 쓴다).
- 읽기는 로그인 사용자, 쓰기는 관리자(`public.is_app_admin()`)만. 관리자가 아니면 화면은 읽기 전용이다.
- **규칙 값(스펙 그대로):** 기본 날짜 = **내일**(`오늘 + 1일`). 기본값 작업구분(G) `HW`, 작업구분(S) `Level1`, 작업시간 `주간`. 팀 대표 열에서 `비고`만 제외한다(시험팀·실사&재하도급은 포함). 같은 국소 비교는 공백 제거 + 소문자. 찾는 순서 공정관리(`erp_details`) → 누적 → 마커·정보 → 빈칸(추측하지 않는다). 누적이 참조에 주는 열은 통합시설코드·사업분류·사업유형·공사유형·지역·장비타입·주소·모국·부동산형태·장비위치(**프로젝트 제외**). 엑셀 파일명 `yymmdd_시설일정_상세.xlsx`(고른 날짜), 시트 이름 `yyyy-mm-dd`, 누적 내려받기 시트 이름 `List`, 목록용 숨김 시트 이름 `목록`.
- 커밋은 **사용자가 요청한 경우에만** 한다. 각 태스크의 Commit 단계는 그때 수행한다.

## Review Focus

테스트가 따로 짚지 않으면 사용자가 겪을 가능성이 큰 순서. 각 줄의 테스트는 해당 태스크에 넣었다.

1. **그날 일정에 국소가 없거나**(비고 열·입회·신호수 칸만 있음) 일정표를 아직 올리지 않은 날: 빈 표와 안내가 나오고, 표 복사·내려받기·누적 저장은 막힌다. (Task 2, 8)
2. **공정관리 값이 목록에 없거나 비어 있음**(`-`, `이동전화공통`, 새 `방식` 값): `-`·`이동전화공통`은 빈칸, 그 밖의 모르는 값은 **원래 글 그대로** 보인다(지우지 않는다). (Task 3)
3. **`erp_details`에 같은 국소명이 여러 행:** id가 가장 큰(최근 등록) 행을 쓴다. 일정의 국소명이 `erp_details.station_final`과 **글자까지 같아야** 찾는다(공백·대소문자만 다른 이름은 DB 조회에서 못 찾는 알려진 제한 — 구현 문서에 적는다). (Task 7, 11)
4. **누적을 같은 날짜로 다시 저장할 때 일정에서 빠진 국소:** 누적에서도 그 행이 사라진다(예전 행이 남지 않는다). (Task 7)
5. **중장비투입 값에 쉼표가 있음**(`이동식크레인,굴착기`): 엑셀 드롭다운이 값을 쪼개지 않고, 복사 글의 탭·줄바꿈 구분을 깨지 않는다. (Task 5, 6)

---

## 파일 구조

| 파일 | 역할 |
| --- | --- |
| `supabase/migrations/20261111000000_schedule_day_details.sql` | 테이블 3개(상세 입력·목록·누적)와 RLS, 목록 처음 값 |
| `src/features/schedule/lib/day-types.ts` | 일자별 공용 타입·상수(열 키, 목록 키, 기본값) |
| `src/features/schedule/lib/option-lists.ts` | 목록 처음 값(`OPTION_LIST_SEEDS`)과 이름 |
| `src/features/schedule/lib/day-stations.ts` | 일정 → 국소 모으기·합치기(작업자·입회·신호수) |
| `src/features/schedule/lib/day-reference.ts` | 공정관리/누적/마커 → 참조 값, 값 변환, 병합 |
| `src/features/schedule/lib/day-columns.ts` | 24열 정의(머리글·열 문자·폭·출처) |
| `src/features/schedule/lib/day-rows.ts` | 행 모델 만들기, 기본 날짜 |
| `src/features/schedule/lib/day-copy.ts` | 표 복사 글 |
| `src/features/schedule/lib/day-archive.ts` | 누적 행 만들기·검색 글·최근 행·이전 입력 |
| `src/features/schedule/lib/write-day-workbook.ts` | 엑셀 쓰기(서식 재현·숨김 목록 시트·드롭다운) |
| `src/features/schedule/day-api.ts` | 새 테이블·`erp_details` 조회·저장 |
| `src/features/schedule/hooks/use-option-lists.ts` · `use-day-sheet.ts` · `use-archive.ts` | 조회·저장 훅 |
| `src/features/schedule/components/schedule-view-toggle.tsx` | `주간 | 월간 | 일자별 | 누적` |
| `.../schedule-day-view.tsx` · `schedule-day-detail-dialog.tsx` · `option-field.tsx` · `schedule-option-lists-dialog.tsx` · `schedule-archive-view.tsx` | 화면 |
| `src/features/schedule/components/schedule-view.tsx`(수정) | 보기 전환 연결 |

모든 `lib/day-*.ts`는 같은 이름의 `.test.ts`를 둔다.

---

### Task 1: 마이그레이션과 공용 타입·목록 처음 값

**Files:**
- Create: `supabase/migrations/20261111000000_schedule_day_details.sql`, `src/features/schedule/lib/day-types.ts`, `src/features/schedule/lib/option-lists.ts`
- Test: `src/features/schedule/lib/option-lists.test.ts`
- Modify: `supabase/migrations/README.md`(파일 목록에 한 줄)

**Interfaces:**
- Produces (`day-types.ts`):
  - `OPTION_LIST_KEYS = ["bizClass","bizKind","constructionType","workCategory","workTime","workType","equipment","workContent"] as const`, `type OptionListKey`, `type OptionLists = Record<OptionListKey, string[]>`
  - `REF_KEYS = ["project","facilityCode","bizClass","bizKind","constructionType","region","equipType","address","motherStation","realtyType","equipLocation"] as const`, `type RefKey`, `type RefValues = Partial<Record<RefKey, string>>`, `type RefSource = "erp" | "archive" | "marker"`
  - `DAY_COLUMN_KEYS`(24개, 엑셀 A~X 순서): `seq, project, facilityCode, bizClass, bizKind, constructionType, workCategory, region, site, equipType, workDate, address, motherStation, worker, witness, signaler, realtyType, equipLocation, levelLabel, workTime, workType, equipment, workContent, workDetail`, `type DayColumnKey`, `type DayValues = Record<DayColumnKey, string>`
  - `interface DayDetail { workDate: string; stationKey: string; site: string; workCategory: string | null; levelLabel: string | null; workTime: string | null; workType: string | null; equipment: string | null; workContent: string | null; workDetail: string | null; worker: string | null; witness: string | null; signaler: string | null; overrides: RefValues }` (`null` = 지정 안 함 → 기본값/자동값)
  - `type DayDetailPatch = Partial<Omit<DayDetail, "workDate" | "stationKey" | "site">>`
  - `const DAY_DEFAULTS = { workCategory: "HW", levelLabel: "Level1", workTime: "주간" } as const`
  - `interface ArchiveRow { workDate: string; stationKey: string; site: string; values: DayValues; savedAt: string }`
- Produces (`option-lists.ts`): `OPTION_LIST_SEEDS: OptionLists`, `OPTION_LIST_LABELS: Record<OptionListKey, string>`

- [ ] **Step 1: Write the failing test** `option-lists.test.ts`: `OPTION_LIST_SEEDS`의 길이가 bizClass 13 · bizKind 6 · constructionType 5 · workCategory 12 · workTime 2 · workType 9 · equipment 17 · workContent 7이다. `workCategory[0]`은 `"HW"`, `workTime`은 `["주간","야간"]`, `equipment`에 `"이동식크레인,굴착기"`가 **한 항목으로** 들어 있고, 모든 목록에 중복이 없다. 값은 스펙 14.5와 `C:/Users/celyo/OneDrive/Desktop/통합 문서1.xlsx`의 `List` 시트(사업분류 D · 사업유형 E · 공사유형 F · 작업구분 G · 작업유형 U · 중장비투입 V · 작업내용 W 열 3~19행)에서 그대로 옮긴다.
- [ ] **Step 2: Run** `npx vitest run src/features/schedule/lib/option-lists` — Expected: FAIL(모듈 없음).
- [ ] **Step 3: Implement** `day-types.ts`, `option-lists.ts`(위 인터페이스 그대로, `OPTION_LIST_LABELS`는 `사업분류`·`사업유형`·`공사유형`·`작업구분`·`작업시간`·`작업유형`·`중장비투입`·`작업내용`).
- [ ] **Step 4: Run** 같은 명령 — Expected: PASS.
- [ ] **Step 5: Write the migration** (재실행 안전, `20261108000000_facility_schedule.sql`의 정책 패턴과 `touch_schedule_updated_at()` 재사용). 조회 `authenticated` 전체, 쓰기 `(SELECT public.is_app_admin())`.
  - `schedule_day_details(work_date date, station_key text, site text, work_category/level_label/work_time/work_type/equipment/work_content/worker/witness/signaler text(각 ≤ 200), work_detail text(≤ 500), overrides jsonb NOT NULL DEFAULT '{}', updated_by uuid DEFAULT auth.uid(), updated_at timestamptz DEFAULT now(), PRIMARY KEY (work_date, station_key))` + `touch` 트리거. 쓰기: insert·update·delete.
  - `schedule_option_lists(list_key text CHECK (list_key IN (OPTION_LIST_KEYS 8개)), value text CHECK (length(btrim(value)) BETWEEN 1 AND 100), sort_order int NOT NULL DEFAULT 0, PRIMARY KEY (list_key, value))` + `OPTION_LIST_SEEDS` 값을 `INSERT … ON CONFLICT DO NOTHING`(sort_order는 목록 안 순서). 쓰기: insert·delete.
  - `schedule_archive_rows(work_date date, station_key text, site text, row_values jsonb NOT NULL, search_text text NOT NULL DEFAULT '', saved_by uuid DEFAULT auth.uid(), saved_at timestamptz DEFAULT now(), PRIMARY KEY (work_date, station_key))` + 인덱스 `(station_key, work_date DESC)`, `(work_date DESC)`. 쓰기: insert·update·delete.
  - 끝에 `NOTIFY pgrst, 'reload schema';`와 적용 후 확인 쿼리 주석.
- [ ] **Step 6: Verify** `npx tsc --noEmit` 통과. README 파일 목록에 `20261111000000_schedule_day_details.sql`(일자별 상세·목록·누적, `20261108000000_facility_schedule.sql` **다음에** 실행) 한 줄. **사용자에게 SQL 적용을 요청한다**(적용 전까지 Task 7의 화면 확인은 할 수 없다).
- [ ] **Step 7: Commit** (요청 시) — `feat: 일자별 상세·목록·누적 테이블과 공용 타입을 더한다`

---

### Task 2: 국소 모으기·합치기

**Files:** Create `src/features/schedule/lib/day-stations.ts` · Test `day-stations.test.ts`

**Interfaces:**
- Consumes: `ScheduleColumn`, `ScheduleCell`(`@/features/schedule/types`), `isCompanionCell`·`parseCompanionText`·`findCompanions`(`lib/companions.ts`)
- Produces: `NOTE_COLUMN_LABEL = "비고"`, `stationKey(name: string): string`(공백 제거 + 소문자), `interface DayStation { key: string; site: string; leaders: string[]; witnesses: string[]; signalers: string[] }`, `buildDayStations(input: { workDate: string; columns: ScheduleColumn[]; cells: ScheduleCell[] }): DayStation[]`

- [ ] **Step 1: Write the failing tests** (`cell(date, columnId, rowNo, main, sub)`·`column(id, sortOrder, team, leader)` 도우미를 파일 안에 둔다):
  - 같은 국소(`(공동)강광고속장암-RRU(F2)`)가 1팀(박경훈)·4팀(이동화)에 있으면 **한 행**이고 `leaders`는 `["박경훈","이동화"]`.
  - 공백·대소문자만 다른 같은 이름은 합치고 `site`는 **처음 나온 표기**.
  - 순서: 행 순서대로 훑어 처음 나온 위치를 기록한 뒤 **열 순서 → 행 순서**로 정렬한다(3팀 0행·1팀 4행에 모두 있는 국소는 3팀 위치로 센다).
  - `비고` 열의 국소는 제외하고 `시험팀`·`실사&재하도급` 열은 포함한다.
  - 국소 칸이 비고 뒤 칸만 있는 칸(`스카이`, `입회 : 박민수`)은 행이 되지 않지만, `입회 : 박민수`·`신호수 : 구삼남,구제신`은 **그 국소를 맡은 팀들의** `witnesses`·`signalers`(이름을 쉼표로 쪼개 중복 제거)로 모인다.
  - 다른 날짜의 칸은 무시하고, 팀장 이름이 빈 열은 `leaders`에 넣지 않는다.
  - **(Review Focus 1)** 국소가 하나도 없는 날(비고 열·입회 칸만 있음 / 칸 없음)은 `[]`.
- [ ] **Step 2: Run** `npx vitest run src/features/schedule/lib/day-stations` — Expected: FAIL.
- [ ] **Step 3: Implement** 위 시그니처. 참조 도구 `schedule-grid.ts`의 `readScheduleBlock`과 같은 규칙(스펙 14.3)이며, 입회·신호수는 `findCompanions`로 팀별로 읽는다.
- [ ] **Step 4: Run** 같은 명령 — Expected: PASS.
- [ ] **Step 5: Commit** (요청 시) — `feat: 일정에서 그날의 국소를 모아 합친다`

---

### Task 3: 값 변환과 참조 병합

**Files:** Create `src/features/schedule/lib/day-reference.ts` · Test `day-reference.test.ts`

**Interfaces:**
- Consumes: `RefKey`·`RefValues`·`RefSource`·`DayValues`(`day-types.ts`)
- Produces:
  - `toBizClass(method: string): string` · `toBizKind(detailType: string): string` · `toConstructionType(category: string): string`
  - `interface ErpRefRow { station_final: string | null; facility_code: string | null; project: string | null; method: string | null; biz_category: string | null; region_sigungu: string | null; equip_final: string | null; realty_type: string | null; equip_location: string | null; address_full: string | null; raw: Record<string, unknown> | null }`
  - `erpRowToRef(row: ErpRefRow): RefValues`
  - `archiveValuesToRef(values: DayValues): RefValues`(프로젝트 제외)
  - `interface MarkerRefSource { name: string; finalStationName?: string | null; projectCode?: string | null; facilityCode?: string | null; businessType?: string | null; eqType?: string | null; roadAddress?: string | null; jibunAddress?: string | null }` · `markerToRef(marker: MarkerRefSource): RefValues`
  - `mergeRefTiers(tiers: { erp?: RefValues; archive?: RefValues; marker?: RefValues }): { values: RefValues; source: RefSource | null }`

- [ ] **Step 1: Write the failing tests:**
  - `toBizClass`: `광중계기`→`중계기`, `기지국`→`기지국`, `광분산`→`인빌딩`, `인빌딩`→`인빌딩`. `toBizKind`: `5G`·`LTE`·`WCDMA` 그대로, `Legacy`→`WCDMA`, `-`→`""`, `이동전화공통`→`""`. `toConstructionType`: `부대장비증설`→`증설`, `대개체`·`신설`·`이설`·`철거` 그대로. **(Review Focus 2)** 모르는 값(`새방식`)은 **원래 글 그대로**, 앞뒤 공백은 지운다.
  - `erpRowToRef`: `facility_code`→`facilityCode`, `project`→`project`, `method`→`bizClass`(변환), `raw["세부사업 유형"]`→`bizKind`(변환), `biz_category`→`constructionType`(변환), `region_sigungu`→`region`, `equip_final`→`equipType`, `raw["모국 (&기지국)"]`→`motherStation`, `realty_type`→`realtyType`, `equip_location`→`equipLocation`, `address_full`→`address`(**치환 없이 원본 그대로**). `null`·빈 글은 키를 만들지 않는다.
  - `archiveValuesToRef`는 통합시설코드·사업분류·사업유형·공사유형·지역·장비타입·주소·모국·부동산형태·장비위치만 담고 **`project`는 없다**, 빈 값은 키를 만들지 않는다.
  - `markerToRef`: `projectCode`→`project`, `facilityCode`→`facilityCode`, `businessType`→`constructionType`(변환), `eqType`→`equipType`, 주소는 `roadAddress` 없으면 `jibunAddress`.
  - `mergeRefTiers`: 값이 하나라도 있는 첫 층(erp → archive → marker)을 **통째로** 쓰고 `source`를 돌려준다(층 사이에 열을 섞지 않는다). 모두 비면 `{ values: {}, source: null }`.
- [ ] **Step 2: Run** `npx vitest run src/features/schedule/lib/day-reference` — Expected: FAIL.
- [ ] **Step 3: Implement** 위 시그니처. 변환은 정확히 일치하는 값만 바꾸는 표(`Record<string,string>`)로 두고, 변환 대상이 아니면 `trim()`한 원문을 돌려준다.
- [ ] **Step 4: Run** 같은 명령 — Expected: PASS.
- [ ] **Step 5: Commit** (요청 시) — `feat: 공정관리 값 변환과 참조 병합을 더한다`

---

### Task 4: 24열 정의와 행 모델

**Files:** Create `src/features/schedule/lib/day-columns.ts`, `src/features/schedule/lib/day-rows.ts` · Test `day-columns.test.ts`, `day-rows.test.ts`

**Interfaces:**
- Consumes: Task 1~3의 타입·`buildDayStations`·`mergeRefTiers`, `addDays`·`todayIso`(`lib/week.ts`)
- Produces:
  - `interface DayColumn { key: DayColumnKey; header: string; letter: string; widthChars: number; kind: "auto" | "ref" | "input"; list?: OptionListKey }`, `DAY_COLUMNS: readonly DayColumn[]`
  - `interface DayRow { stationKey: string; site: string; values: DayValues; refSource: RefSource | null }`
  - `interface BuildDayRowsInput { workDate: string; columns: ScheduleColumn[]; cells: ScheduleCell[]; details: ReadonlyMap<string, DayDetail>; refs: { erp: ReadonlyMap<string, RefValues>; archive: ReadonlyMap<string, RefValues>; marker: ReadonlyMap<string, RefValues> } }`(맵의 키는 `stationKey`)
  - `buildDayRows(input: BuildDayRowsInput): DayRow[]` · `defaultDayDate(now?: Date): string`(내일)

- [ ] **Step 1: Write the failing tests:**
  - `day-columns.test.ts`: 24개, 머리글이 `순번,프로젝트,통합시설코드,사업분류,사업유형,공사유형,작업구분,지역,국소명,장비타입,작업일,주소,모국,작업자,입회자,신호수,부동산형태,장비위치,작업구분,작업시간,작업유형,중장비투입,작업내용,작업내용 상세`(작업구분이 G·S 두 번) 순서이고 열 문자가 `A`~`X`, 폭이 B 17 · I 45.875 · J 33.875 · L 45.625 · X 25.125, 목록 열이 D(bizClass)·E(bizKind)·F(constructionType)·G(workCategory)·T(workTime)·U·V·W이다.
  - `day-rows.test.ts`: (a) 값 채우기 — 순번 1부터, `workDate`·`site`, `worker`는 `leaders.join(",")`, 입회·신호수도 같다. (b) 기본값 — 상세가 없으면 `workCategory "HW"`·`levelLabel "Level1"`·`workTime "주간"`, 나머지 입력 열은 `""`. (c) 상세의 값이 기본값·자동값을 이긴다(`worker`·`witness`·`signaler` 직접 수정 포함). (d) `overrides`의 비어 있지 않은 값이 참조 값을 이긴다. (e) 참조는 erp → archive → marker 순이고 `refSource`가 그 층(없으면 `null`), 아무 층에도 없으면 참조 열이 `""`. (f) 상세·목록에 없는 값도 그대로 보인다(값을 지우지 않는다). (g) `defaultDayDate(new Date("2026-11-07T12:00:00+09:00"))`는 `"2026-11-08"`.
- [ ] **Step 2: Run** `npx vitest run src/features/schedule/lib/day-columns src/features/schedule/lib/day-rows` — Expected: FAIL.
- [ ] **Step 3: Implement** `DAY_COLUMNS`(스펙 14.4 표 순서·`kind`: seq·workDate·site·worker·witness·signaler는 auto, 참조 11열은 ref, 나머지는 input)와 `buildDayRows`(`buildDayStations` → 행마다 `mergeRefTiers` → 덮어쓰기 → 상세·기본값).
- [ ] **Step 4: Run** 같은 명령 — Expected: PASS.
- [ ] **Step 5: Commit** (요청 시) — `feat: 일자별 24열 정의와 행 모델을 더한다`

---

### Task 5: 표 복사 글과 누적 도우미

**Files:** Create `src/features/schedule/lib/day-copy.ts`, `src/features/schedule/lib/day-archive.ts` · Test `day-copy.test.ts`, `day-archive.test.ts`

**Interfaces:**
- Consumes: `DAY_COLUMNS`(Task 4), `DayValues`·`DayRow`·`ArchiveRow`·`DayDetailPatch`, `stationKey`, `likePattern`(`lib/search-cells.ts`)
- Produces:
  - `buildCopyText(rows: readonly DayValues[]): string` — 제목 줄 없음, 열은 탭, 행은 LF로 이음
  - `archiveSearchText(values: DayValues): string` — 국소명·프로젝트·통합시설코드를 공백으로 이은 소문자
  - `rowsToArchive(workDate: string, rows: readonly DayRow[], savedAt: string): ArchiveRow[]`
  - `latestPerStation(rows: readonly ArchiveRow[]): Map<string, ArchiveRow>` — `stationKey`별로 `workDate`가 가장 큰 행
  - `pickPreviousInput(row: ArchiveRow | undefined): DayDetailPatch` — 작업시간·작업유형·중장비투입·작업내용·작업내용 상세 중 **비어 있지 않은 것만**

- [ ] **Step 1: Write the failing tests:** `buildCopyText` — 24칸을 `DAY_COLUMNS` 순서로 탭 구분, **제목 줄 없음**, 작업일은 `yyyy-mm-dd`, 빈 값은 빈칸, 값 안의 탭·줄바꿈은 공백으로 바꾼다. **(Review Focus 5)** `이동식크레인,굴착기`는 쉼표가 그대로이고 열이 늘지 않는다(한 줄의 탭 개수가 23). `rowsToArchive`는 행마다 `values`를 복사하고 `workDate`·`savedAt`을 채운다. `latestPerStation`은 같은 국소의 여러 날 중 가장 최근 날짜를 고른다. `pickPreviousInput`은 빈 값을 건너뛰고 `undefined`면 `{}`다. `archiveSearchText`는 소문자·공백 구분.
- [ ] **Step 2: Run** `npx vitest run src/features/schedule/lib/day-copy src/features/schedule/lib/day-archive` — Expected: FAIL.
- [ ] **Step 3: Implement** 위 시그니처.
- [ ] **Step 4: Run** 같은 명령 — Expected: PASS.
- [ ] **Step 5: Commit** (요청 시) — `feat: 표 복사 글과 누적 도우미를 더한다`

---

### Task 6: 엑셀 쓰기(서식 재현)

**Files:** Create `src/features/schedule/lib/write-day-workbook.ts` · Test `write-day-workbook.test.ts`

**Interfaces:**
- Consumes: `DAY_COLUMNS`, `DayValues`, `OptionLists`, `toExcelSerial`(`lib/schedule-excel.ts`), 다운로드 방식은 `lib/write-workbook.ts`의 기존 `download*`와 같다
- Produces:
  - `interface SheetInput { sheetName: string; rows: readonly DayValues[]; lists: OptionLists }`
  - `buildSheetWorkbook(input: SheetInput): Promise<import("exceljs").Workbook>`
  - `dayFileName(workDate: string): string` · `archiveFileName(today: string): string`
  - `downloadDayWorkbook(workDate: string, rows: readonly DayValues[], lists: OptionLists): Promise<void>` · `downloadArchiveWorkbook(rows: readonly DayValues[], lists: OptionLists, today: string): Promise<void>`

- [ ] **Step 1: Write the failing tests** (`buildSheetWorkbook`를 `xlsx.writeBuffer()` → `exceljs`로 다시 읽어 확인, `write-workbook.test.ts`의 방식을 따른다):
  - 시트가 `sheetName` 하나 + 숨김(`state: "hidden"`) 시트 `목록`.
  - 1행은 비고(높이 26.25), 2행이 24열 머리글(높이 42, 굵게, 가운데, 뫼비우스 Regular 11), 데이터는 3행부터(높이 24.95).
  - 머리글 바탕: A~W `ECEEF0`, X(작업내용 상세) `E2EFDA`. 틀 고정 `xSplit 9`·`ySplit 2`, 보기 배율 80, 열 폭이 `DAY_COLUMNS.widthChars`.
  - 작업일은 **숫자(일련번호 `toExcelSerial`)** 이고 `numFmt`가 `mm/dd`. 순번 열은 1부터 다시 매긴다(누적 내려받기에서도).
  - 테두리: 머리글 좌우·위 thin·아래 hair, 데이터 좌우 thin·위아래 hair. 국소명(I)·주소(L)는 왼쪽 정렬, 나머지는 가운데.
  - **(Review Focus 5)** 숨김 시트 `목록`에 `이동식크레인,굴착기`가 **한 칸의 값**으로 들어 있고, D·E·F·G·T·U·V·W 데이터 행(3행~max(24, 마지막 행))에 `type: "list"` 유효성이 `'목록'!$<열>$1:$<열>$<n>` 범위를 가리키며 쉼표로 이은 글 목록이 아니다.
  - `dayFileName("2026-11-09")`는 `261109_시설일정_상세.xlsx`, `archiveFileName("2026-11-07")`는 `시설일정_누적_261107.xlsx`.
- [ ] **Step 2: Run** `npx vitest run src/features/schedule/lib/write-day-workbook` — Expected: FAIL.
- [ ] **Step 3: Implement** 위 시그니처. `exceljs`는 `await import("exceljs")`로 함수 안에서만 불러온다(`write-workbook.ts`와 같다). 색은 테마 색이 아니라 RGB 값을 쓴다.
- [ ] **Step 4: Run** 같은 명령 — Expected: PASS.
- [ ] **Step 5: Commit** (요청 시) — `feat: 일자별 상세 엑셀 쓰기를 더한다`

---

### Task 7: API와 조회 훅

**Files:** Create `src/features/schedule/day-api.ts`, `src/features/schedule/hooks/use-option-lists.ts`, `use-day-sheet.ts`, `use-archive.ts` · Test `src/features/schedule/day-api.test.ts`

**Interfaces:**
- Consumes: `SupabaseBrowserClient`, `ErpRefRow`·`erpRowToRef`·`markerToRef`·`archiveValuesToRef`·`latestPerStation`, `buildDayRows`, `OPTION_LIST_SEEDS`, `isScheduleTableMissing`, `useScheduleRange`·`useMapMarkersQuery`·`useIsAdmin`
- Produces (`day-api.ts`):
  - `fetchErpRefs(supabase, sites: string[]): Promise<Map<string, RefValues>>` — 키는 `stationKey(station_final)`, 같은 국소가 여러 행이면 id가 가장 큰 행
  - `fetchDayDetails(supabase, workDate: string): Promise<DayDetail[]>` · `upsertDayDetails(supabase, details: DayDetail[]): Promise<void>`
  - `fetchOptionLists(supabase): Promise<OptionLists>`(표가 비면 `OPTION_LIST_SEEDS`) · `addOption(supabase, key: OptionListKey, value: string): Promise<void>` · `deleteOption(supabase, key: OptionListKey, value: string): Promise<void>`
  - `saveArchiveRows(supabase, workDate: string, rows: ArchiveRow[]): Promise<void>` — upsert 후 **그날짜의 그 밖 행을 삭제**
  - `fetchArchive(supabase, filter: { from?: string; to?: string; text?: string }, limit?: number): Promise<ArchiveRow[]>` — 작업일 내림차순, `text`는 `search_text`에 `likePattern`
  - `fetchLatestArchive(supabase, stationKeys: string[]): Promise<Map<string, ArchiveRow>>` · `deleteArchiveRows(supabase, rows: { workDate: string; stationKey: string }[]): Promise<void>`
- Produces (훅): `useOptionLists(): { lists: OptionLists; isTableMissing: boolean; add; remove }` · `useDaySheet(workDate: string): { rows: DayRow[]; details: Map<string, DayDetail>; isLoading: boolean; error: unknown; isTableMissing: boolean; saveDetails(patches: { station: DayRow; patch: DayDetailPatch }[]): Promise<void>; saveArchive(): Promise<void>; latestArchive: Map<string, ArchiveRow> }` · `useArchive(filter): { rows: ArchiveRow[]; isLoading: boolean; error: unknown; remove(rows): Promise<void> }`

- [ ] **Step 1: Write the failing tests** (`api.test.ts`의 `stubClient` 방식으로 가짜 클라이언트): **(Review Focus 3)** `fetchErpRefs`는 같은 `station_final`이 두 행이면 id가 큰 행을 쓰고, `in("station_final", …)`에 넘긴 이름이 중복 제거되며 결과 맵의 키는 `stationKey(station_final)`이다. **(Review Focus 4)** `saveArchiveRows`는 upsert로 넘긴 키 목록을 `not in`으로 삭제 조건에 써서 그날의 예전 국소 행을 지운다(호출 순서: upsert → delete). `fetchOptionLists`는 표가 비면 처음 값을 돌려주고 `sort_order` 순으로 정렬한다.
- [ ] **Step 2: Run** `npx vitest run src/features/schedule/day-api` — Expected: FAIL.
- [ ] **Step 3: Implement** `day-api.ts`(테이블 컬럼 ↔ 타입 변환 함수 포함). 훅은 `useScheduleRange(workDate, workDate)`로 그날 일정을 받고, 국소 이름으로 `fetchErpRefs`·`fetchLatestArchive`를 부르고, `useMapMarkersQuery` 마커로 `markerToRef` 맵을 만들어 `buildDayRows`에 넘긴다. 쿼리 키는 `["facility-schedule-day", …]` 접두사, 테이블이 없으면(`isScheduleTableMissing`) 빈 값 + `isTableMissing`(일정표는 계속 열린다). `saveArchive`는 관리자가 아니면 아무것도 하지 않는다.
- [ ] **Step 4: Run** 같은 명령 — Expected: PASS. 이어서 `npx tsc --noEmit`.
- [ ] **Step 5: Commit** (요청 시) — `feat: 일자별 상세 API와 조회 훅을 더한다`

---

### Task 8: 보기 전환과 일자별 표 화면

**Files:** Create `components/schedule-view-toggle.tsx`, `components/schedule-day-view.tsx` · Modify `components/schedule-view.tsx`

**Interfaces:**
- Consumes: `useDaySheet`·`useOptionLists`(Task 7), `DAY_COLUMNS`·`defaultDayDate`·`buildCopyText`·`downloadDayWorkbook`, `DatePicker`
- Produces: `type ScheduleViewKind = "week" | "month" | "day" | "archive"` · `ScheduleViewToggle({ view, onChange })` · `ScheduleDayView({ canEdit })`

- [ ] **Step 1: Implement `ScheduleViewToggle`** — 기존 `주간 | 월간` 버튼 묶음을 4개(`주간`·`월간`·`일자별`·`누적`)로 옮긴다(스타일·`aria-pressed` 그대로). `schedule-view.tsx`의 `ScheduleView` 타입을 `ScheduleViewKind`로 바꾸고 `day`·`archive`일 때는 기존 이전/다음·개수·검색·작업금지·내보내기·가져오기 줄 대신 **제목 + 보기 전환 + 해당 화면**만 그린다(모든 훅은 early return 앞에서 호출한다).
- [ ] **Step 2: Implement `ScheduleDayView`** — 도구줄: 날짜 선택(공통 `DatePicker`, **기본 `defaultDayDate()`**), 이전 날·다음 날·`내일` 버튼, `표 복사`·`엑셀 내려받기`·`누적 저장`(관리자만)·`목록 관리`(관리자만). 본문: 24열 표(`table-layout: fixed`, 열 폭은 `widthChars` 비율, 셀 줄바꿈 금지·말줄임·툴팁, 머리글 고정, 세로 스크롤만), 맨 앞 체크 칸. 국소가 없으면 빈 표 대신 `이 날짜의 일정에 국소가 없습니다. 먼저 주간 보기에서 일정을 입력하거나 일정표를 가져오세요.`를 보이고 복사·내려받기·누적 저장을 비활성화한다(Review Focus 1). 참조가 없는 행(`refSource === null`)은 참조 열을 옅게 표시하고 표 위에 `공정관리 정보가 없는 국소 N건`을 알린다. `표 복사`·`엑셀 내려받기`는 먼저 `saveArchive()`를 부른다(관리자일 때만, 실패해도 복사·내려받기는 계속하고 안내만).
- [ ] **Step 3: Verify** `npx tsc --noEmit`, `npx eslint src/features/schedule --max-warnings=0` 통과. 화면 확인(개발 서버 3000, 마이그레이션 적용 후): 시설일정 → `일자별`을 열면 날짜가 내일, 일정이 있는 날을 고르면 국소 행이 나온다. `표 복사`를 누르고 엑셀에 붙여넣어 제목 줄 없이 24열이 맞는지 본다.
- [ ] **Step 4: Commit** (요청 시) — `feat: 시설일정 일자별 표 보기를 더한다`

---

### Task 9: 작업 상세 창·일괄 적용·목록 관리

**Files:** Create `components/schedule-day-detail-dialog.tsx`, `components/option-field.tsx`, `components/schedule-option-lists-dialog.tsx` · Modify `components/schedule-day-view.tsx`

**Interfaces:**
- Consumes: `useDaySheet`·`useOptionLists`, `pickPreviousInput`·`DayDetailPatch`, `DAY_DEFAULTS`
- Produces: `OptionField({ label, value, options, onChange, onAddOption, disabled })`(목록에서 고르고 `+ 새 값` 입력으로 `목록에 추가`) · `ScheduleDayDetailDialog({ rows, canEdit, onClose, onSave })`(`rows.length > 1`이면 일괄 모드) · `ScheduleOptionListsDialog({ open, onOpenChange, canEdit })`

- [ ] **Step 1: Implement** `OptionField` — 목록 값 선택(드롭다운), 입력 칸에 새 값을 쓰고 `목록에 추가`를 누르면 `onAddOption` 후 선택. 목록에 없는 현재 값도 선택칸에 그대로 보인다.
- [ ] **Step 2: Implement** `ScheduleDayDetailDialog` — 한 행: 작업구분(G)·작업시간·작업유형·중장비투입·작업내용(`OptionField`), 작업구분(S)·작업내용 상세·작업자·입회자·신호수(입력), 참조 11열 덮어쓰기(입력, 비우면 자동값으로 돌아간다), `이전 입력 불러오기`(`latestArchive`에서 `pickPreviousInput`으로 채우기, 누른 행만). 여러 행(체크한 행): 작업구분(G)·작업시간·작업유형·중장비투입·작업내용·작업내용 상세만 바꾸고 **채운 칸만** 적용한다. 저장은 `saveDetails`. 비관리자는 읽기 전용.
- [ ] **Step 3: Implement** `ScheduleOptionLists` 창 — 목록 8개를 탭/선택으로 고르고 값 추가·삭제(순서는 추가 순). 삭제해도 이미 쓰인 값은 상세에 남는다고 안내한다. `schedule-day-view`에 행 클릭 → 상세 창, 체크 N건 → `선택한 N건 일괄 적용` 버튼, `목록 관리` 연결.
- [ ] **Step 4: Verify** `npx tsc --noEmit`, `npx eslint src/features/schedule --max-warnings=0` 통과. 화면 확인: 행을 눌러 작업시간을 `야간`으로 바꾸고 저장하면 표에 반영되고 새로고침 후에도 남는다. 여러 행을 체크해 작업내용을 일괄 적용한다. 목록에 `새 항목`을 추가했다가 삭제해도 이미 고른 값은 표에 남는다.
- [ ] **Step 5: Commit** (요청 시) — `feat: 일자별 작업 상세 창과 목록 관리를 더한다`

---

### Task 10: 누적 보기

**Files:** Create `components/schedule-archive-view.tsx` · Modify `components/schedule-view.tsx`

**Interfaces:**
- Consumes: `useArchive`(Task 7), `DAY_COLUMNS`·`buildCopyText`·`downloadArchiveWorkbook`, `DatePicker`, `useOptionLists`
- Produces: `ScheduleArchiveView({ canEdit })`

- [ ] **Step 1: Implement** — 거르기(기간 시작·끝 `DatePicker`, 글 검색 = 국소명·프로젝트·통합시설코드, 300ms 뒤 조회, 최대 500건 안내), 24열 표(작업일 내림차순, 일자별 표와 같은 열 폭·말줄임·툴팁·세로 스크롤만), `표 복사`(제목 줄 없이)·`엑셀 내려받기`(시트 `List`, 제목 줄 포함), 관리자는 행 체크 후 `선택 삭제`. 결과가 없으면 `쌓인 상세가 없습니다. 일자별 보기에서 누적 저장을 누르거나 표를 복사하면 쌓입니다.`
- [ ] **Step 2: Verify** `npx tsc --noEmit`, `npx eslint src/features/schedule --max-warnings=0` 통과. 화면 확인: 일자별에서 `누적 저장` 후 `누적`에 그 날짜가 맨 위에 나오고, 국소명으로 거르고, 엑셀로 내려받아 시트 이름이 `List`인지 본다.
- [ ] **Step 3: Commit** (요청 시) — `feat: 시설일정 누적 보기를 더한다`

---

### Task 11: 문서와 전체 검증

**Files:** Create `docs/Ver_3.0/시설일정/Ver_3.0_시설일정_일자별_구현.md` · Modify `docs/Ver_3.0/Ver_3.0_계획.md`(§14 끝에 구현 완료 메모), `supabase/migrations/README.md`(Task 1에서 한 줄 추가했는지 확인)

- [ ] **Step 1: Write the implementation doc** — 파일 구조, 순수 함수 규칙(14.3~14.4 요약), 테이블 3개, 화면 흐름, 알려진 제한(`erp_details` 국소명이 정확히 일치해야 찾는다, 공정관리 데이터는 `위치등록`으로 올려야 채워진다, 누적은 관리자만 쌓는다), `일정표 가져오기는 상세·누적을 지우지 않는다`.
- [ ] **Step 2: Verify everything** — `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test` 모두 통과. `npx next build`(개발 서버를 멈추거나 임시 `distDir`로)에서 홈 First Load JS **295 kB 이하**이고 `exceljs`가 첫 묶음에 없는지 본다.
- [ ] **Step 3: 사용자와 함께 확인** — 마이그레이션 적용 후 `일정표_New`를 가져온 상태에서 11/09를 열어 국소 9건(또는 일정에 들어간 만큼)이 나오는지, 엑셀을 내려받아 `261109_시설일정_수정3.xlsx`의 `2026-11-09` 시트와 머리글·서식·드롭다운을 대조한다.
- [ ] **Step 4: Commit** (요청 시) — `docs: 시설일정 일자별 상세 구현 문서를 더한다`
