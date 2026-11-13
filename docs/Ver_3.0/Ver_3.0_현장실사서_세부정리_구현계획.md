# 현장실사서 → 세부 시트 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현장실사서 엑셀 여러 개를 올리면 세부 시트와 같은 열 구성의 결과 엑셀을 만들고, 변환 규칙은 관리자가 환경설정 창에서 바꾼다.

**Architecture:** 파일 읽기(`parse-survey`)와 값 만들기(`build-rows`)를 분리해, 설정을 바꾸면 이미 올린 파일을 다시 읽지 않고 즉시 다시 계산한다. 모든 규칙은 순수 함수 + 설정 객체(기본값은 코드, 관리자가 바꾼 부분만 Supabase 1행)로 둔다. 화면은 `dynamic()`으로 지연 로딩한다.

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript(strict) · `xlsx` · `zod`(^3) · `@tanstack/react-query` · Supabase · vitest · Tailwind/shadcn(기존 컴포넌트만).

**Spec:** `docs/Ver_3.0/Ver_3.0_현장실사서_세부정리_설계.md` (이하 "설계 §N")

> **메뉴 위치 (사용자 확정 2026-11-11):** 사이드바에서 **일정관리 아래에 `공정관리`**, 그 하위에 **`현장실사서`**. 일정관리와 같은 방식(하위 메뉴 + 메인 영역 직접 그리기)이라 지도 세그먼트·마커 스토어는 건드리지 않는다(Task 11).

> **개정 2026-11-13 (검토 반영, 설계 §1·§4 참고):** ① 인빌딩 기본 규칙에서 철탑 규격·공중선 형상 `1`을 뺀다 ② 방식 옵션 `useMokukOnly` 추가, `ignoreUpperForModes` 제거 ③ Site명은 기본 꺼짐(`mixed`)과 규칙 확정 ④ `knownModes`(알려진 방식 목록)와 경고 ⑤ `NW구조혁신`→`NW슬림화` 기본 치환 ⑥ 사용자가 직접 바꾼 칸 유지(`effectiveEnabled`) ⑦ 첫 저장 `42501`→`denied` ⑧ 읽을 때 색인만 보관·4개씩 병렬(`readSurveyFiles`).
>
> **2차로 미룬 것:** 설정 가져오기·내보내기, 읽는 위치(`sources`) 편집, `세부_27년` 전용 처리.

## Global Constraints

- 메뉴: 사이드바 `일정관리` 바로 아래 `공정관리`(NavKey `process`), 그 하위 `현장실사서`(하위 화면 `survey`). 비로그인에는 보이지 않는다.
- 읽기·변환은 **브라우저에서만** 한다. 실사서 파일과 결과는 서버로 보내지 않는다. DB에는 환경설정 **1행만** 저장한다.
- **엑셀(`.xlsx`)만** 읽는다. 이름이 `~$`로 시작하는 파일과 `.xlsx`가 아닌 파일(PDF 등)은 건너뛰고 개수를 알린다.
- 이름 다듬기: 앞의 `(공동)`·`(도서)` 태그를 모두 지우고, `-##_`·`_`·`.55.`(`#`은 숫자 한 자리) 중 먼저 나오는 곳 앞까지만 남긴다.
- SCAN 국사 단어: `집중국`, `통합국`, `중심국`, `전송실`. SCAN이 아니면 집중국에 `비SCAN`(이 표기 그대로).
- 모국(&기지국): 상위국명이 있으면 그 값, 없으면 모국명. **방식 옵션 `useMokukOnly`(기본 `인빌딩`)가 켜져 있으면 상위국명을 무시**한다. 통합국↔중심국 이름 차이는 경고하지 않는다.
- 결과 엑셀: 시트 `세부_입력값`(세부 시트와 같은 열 순서 A~CB 80열·같은 머리글), 경고가 있으면 시트 `경고`, 파일 이름 `세부_입력값_YYYYMMDD.xlsx`.
- 공중선 형상은 숫자만(`1S`→`1`). 사업 차수는 `5차`→`26-05`. 주소는 `{구주소} {번지}번지`(번지가 이미 `번지`로 끝나면 다시 붙이지 않는다).
- 환경설정 저장: 테이블 `public.survey_settings`(항상 `id = 'default'` 1행), 파일 `supabase/migrations/20261117000200_survey_settings.sql`. **Supabase는 로컬에서 실행하지 않는다.** 사용자가 SQL Editor에서 적용한다. 수정은 관리자만(DB 정책 `public.is_app_admin()` + 화면 `useIsAdmin()`), 읽기는 로그인한 모든 사용자.
- 프로젝트 규칙: 패키지 매니저 npm · strict TS(`strictNullChecks`·`noImplicitAny`) · ESLint가 미사용 import·변수를 오류로 잡는다(`npx eslint . --max-warnings=0`) · **vitest는 `.ts`만 실행한다(`.tsx` 테스트는 조용히 안 돈다)** → 로직은 `.ts`로 빼서 테스트한다 · 주석은 한국어 · 소스 파일은 **CRLF·UTF-8**(새 파일도 CRLF로 저장하고 한글이 깨지지 않았는지 확인) · shadcn 컴포넌트는 새로 쓰지 않는다(탭·체크박스는 기본 요소, 기존 `Dialog`·`Button`·`Input`만) · 표는 셀 줄바꿈 금지·가로 스크롤 금지(세로만).
- **홈 번들 First Load JS는 늘리지 않는다**(이미 기준 295 kB를 넘은 297~298 kB). 화면과 `xlsx`는 `dynamic()`/동적 import로만 가져온다.
- **커밋하지 않는다.** 이 프로젝트는 사용자가 "커밋"이라고 할 때만 커밋한다. 각 Task 끝의 "Commit" 자리에는 `git status`로 변경 파일만 확인한다.
- 구현이 끝나면 `docs/Ver_3.0/Ver_3.0_현장실사서_세부정리_구현.md`(구현 문서)를 쓰고 설계 문서 §8.2를 채운다.

## Review Focus

설계가 말하지 않지만 실제 사용에서 걸릴 입력이다. 각 줄의 테스트는 해당 Task에 들어 있다.

1. **값 `0`을 빈 값으로 취급하지 않는다**: 비인빌딩 실사서의 철탑 규격 `0`은 `0`으로 남는다(인빌딩만 `1`로 대체). → Task 6
2. **같은 라벨이 여러 섹션에 있다**(`기타1`은 일반현황·치국현황·…에 모두 있다): 섹션이 섞이면 틀린 값이 들어간다. → Task 4
3. **올린 파일이 전부 `~$`·PDF이거나 0개**: 오류 없이 "건너뜀 N개"만 알리고 내려받기는 비활성. → Task 4, Task 9
4. **같은 통합시설코드의 파일이 두 개**: 경고하되 결과에는 둘 다 넣는다. → Task 6
5. **저장된 설정이 깨졌거나 알 수 없는 키·미래 버전**: 기본 설정으로 동작하고 경고한다(화면이 죽지 않는다). → Task 5, Task 8

---

## 파일 구조

신규 기능 폴더 `src/features/site-survey/` (설계 §4.9). 테스트는 각 파일 옆 `*.test.ts`.

| 파일 | 책임 | Task |
|---|---|---|
| `types.ts` | 공용 타입(§Interfaces 참고) | 1 |
| `constants/detail-columns.ts` | 세부 시트 A~CB 80열과 머리글 | 1 |
| `constants/survey-fields.ts` | 칸 규칙표(`FIELD_RULES`) | 1 |
| `constants/default-settings.ts` | 환경설정 기본값 `DEFAULT_SETTINGS` | 1 |
| `lib/station-rules.ts` | 이름 다듬기·SCAN 판별·모국/집중국 | 2 |
| `lib/transforms.ts` | 사업 차수·주소·지역·`S` 지우기·Site명·치환표·이어 붙이기 | 3 |
| `lib/parse-survey.ts` | xlsx → `SurveyDoc`, 파일 걸러내기 | 4 |
| `lib/notes.ts` | `문제점 세부내역` 조각 모으기 | 4 |
| `lib/test-support/make-survey-workbook.ts` | 테스트용 합성 실사서(테스트에서만 import) | 4 |
| `lib/settings-schema.ts` | zod 스키마·합치기·차이 뽑기·검증 | 5 |
| `lib/build-rows.ts` | `SurveyDoc` + 설정 → `BuiltRow` | 6 |
| `lib/build-rows.golden.test.ts` | 정답 행 대조(환경변수 있을 때만) | 6 |
| `lib/export-workbook.ts` | 결과 엑셀 만들기·내려받기 | 7 |
| `supabase/migrations/20261117000200_survey_settings.sql` | 설정 테이블·RLS | 8 |
| `api.ts` | 설정 읽기·쓰기 | 8 |
| `hooks/use-survey-settings.ts` | 설정 조회·저장 훅 | 8 |
| `hooks/use-survey-files.ts` | 파일 읽기 상태 훅 | 9 |
| `components/site-survey-main.tsx` | 메인 화면(파일·결과 표·내려받기) | 9 |
| `lib/settings-draft.ts` | 설정 창의 편집 도우미(순수) | 10 |
| `components/survey-settings-dialog.tsx` | 환경설정 창 | 10 |
| 수정: `shell/types/nav.ts`, `shell/types/segment.ts`, `shell/lib/nav-model.ts`, `shell/components/nav-tree.tsx`, `shell/components/panel-body.tsx`, `shell/components/app-shell.tsx`, `map-marker/store/use-map-marker-store.ts` + 테스트 2개 | 메뉴 연결(공정관리 > 현장실사서) | 11 |

## Interfaces (여러 Task가 공유하는 이름 — 한 곳에서 정의하고 그대로 쓴다)

`types.ts`에서 정의한다(Task 1).

```ts
export type Direction = "below" | "right";
export interface SourceRef { section: number; label: string; direction: Direction; nth?: number }
export type FieldId =
  | "year" | "project" | "facilityCode"                                   // 식별 칸(항상 포함)
  | "facilityName" | "planName" | "method" | "round" | "workType" | "subType"
  | "bigCategory" | "midCategory" | "equipFinal" | "equipPlan" | "realty"
  | "equipPlace" | "towerType" | "towerSpec" | "address" | "aiManager"    // 확실(16)
  | "antennaShape" | "sharer" | "region" | "regionDetail" | "mokuk" | "scanStation"                // 규칙 변환(6)
  | "siteName"                                                              // 수기 메모 섞임(Site명, 기본 꺼짐)
  | "notes";                                                              // 수기 메모 섞임(문제점 세부내역, 기본 꺼짐)
export type FieldGroup = "identity" | "sure" | "convert" | "mixed";
export type TransformId = "copy" | "round" | "address" | "antenna" | "region" | "regionDetail" | "mokuk" | "scan" | "siteName" | "notes";
export interface Alias { from: string; to: string }
export interface RegionRule { prefix: string; region: string }
export type ModeRule = { field: FieldId; kind: "fixed"; value: string } | { field: FieldId; kind: "source"; source: SourceRef };
export interface ModeRuleSet { mode: string; useMokukOnly: boolean; rules: ModeRule[] }   // useMokukOnly: 모국(&기지국)에서 상위국명을 무시
export interface FieldSetting { enabled: boolean; aliases: Alias[]; sources: Record<string, SourceRef> }
export interface StationSettings { stripTags: string[]; cutTokens: string[]; scanWords: string[]; nonScanLabel: string }
export interface NotesSettings { includeEtc: boolean; includeAccess: boolean; includeBuilding: boolean; separator: string }
export interface SurveySettings {
  version: 1;
  fields: Record<FieldId, FieldSetting>;
  modeRules: ModeRuleSet[];
  knownModes: string[];                 // 알려진 방식 목록(밖의 값은 경고)
  station: StationSettings;
  notes: NotesSettings;
  address: { appendBeonji: boolean; regionMap: RegionRule[] };
  antenna: { stripS: boolean };
}
export type SurveySettingsOverrides = DeepPartial<SurveySettings>;        // 기본값과 다른 부분만
export interface FieldRule {
  id: FieldId; column: number; group: FieldGroup; defaultEnabled: boolean;
  transform: TransformId; sources: Record<string, SourceRef>;
}
export interface NoteItem { section: number; label: string; value: string }
export interface SurveyIds { year: string; project: string; facilityCode: string }
export interface SurveyDoc {
  readonly fileName: string;
  get(source: SourceRef): string;       // 라벨이 없거나 값이 비면 ""
  has(source: SourceRef): boolean;      // 라벨을 찾았는가(값이 비어도 true)
  notes(): NoteItem[];                  // 본문의 `기타N`(문서 순서)
  ids(): SurveyIds;
}
export interface RowWarning { fileName: string; field: string; message: string }
export interface FieldResult { id: FieldId; column: number; raw: string; value: string; applied: "" | "mode-rule" | "alias" }
export interface BuiltRow { fileName: string; cells: Record<number, string>; fields: FieldResult[]; warnings: RowWarning[] }
```

`DeepPartial<T>`는 `types.ts`에 함께 둔다(재귀 `Partial`, 배열은 통째로 교체).

---

### Task 1: 타입·세부 열·칸 규칙·기본 설정 (데이터)

**Files:**
- Create: `src/features/site-survey/types.ts`, `constants/detail-columns.ts`, `constants/survey-fields.ts`, `constants/default-settings.ts`
- Test: `constants/detail-columns.test.ts`, `constants/survey-fields.test.ts`

**Interfaces:**
- Produces: 위 Interfaces 전체 타입, `DETAIL_COLUMNS: readonly { index: number; letter: string; header: string }[]`, `columnLetter(index: number): string`, `FIELD_RULES: readonly FieldRule[]`, `FIELD_BY_ID: Record<FieldId, FieldRule>`, `DEFAULT_SETTINGS: SurveySettings`.

- [ ] **Step 1: 실패하는 테스트 작성** — `detail-columns.test.ts`
  - `DETAIL_COLUMNS.length === 80`, 인덱스는 0부터 연속.
  - `columnLetter`: `0→"A"`, `25→"Z"`, `26→"AA"`, `51→"AZ"`, `79→"CB"`.
  - 머리글: `[0]="연도"`, `[7]="국소명-최종"`, `[24]="모국 (&기지국)"`, `[25]="집중국"`, `[50]="문제점 세부내역 및 대책방안"`, `[72]="Site명"`, `[75]="AI담당"`, `[79]="사전설계 완료일"`.
  `survey-fields.test.ts`
  - `FIELD_RULES`의 `id`는 모두 다르고 27개이며, `DETAIL_COLUMNS[rule.column].header`가 아래 표와 같다.
  - 그룹 개수: `identity` 3, `sure` 16, `convert` 6, `mixed` 2(`notes`·`siteName`). `notes`·`siteName`만 `defaultEnabled === false`.
  - `FIELD_BY_ID.mokuk.sources`에 `mokukName`(`4/모국명/below`)과 `upperName`(`4/(LTE)전송로 상위국명/below`)이 있다.
  - `DEFAULT_SETTINGS`: `knownModes`가 `["광중계기","광분산","기지국","터널","인빌딩"]`, `modeRules`가 인빌딩 1개 항목(`useMokukOnly === true`, 규칙 2개: 철탑 형태 고정값, 장비위치 원본 변경), `fields.midCategory.aliases`에 `NW구조혁신`→`NW슬림화`, 철탑 규격·공중선 형상에는 방식별 규칙이 없다.

| id | 열 | 머리글 | sources (섹션/라벨/방향) |
|---|---|---|---|
| year / project / facilityCode | A / B / C | 연도 / 프로젝트 / 통합시설코드 | `main`: 1/사업년도/below · 1/프로젝트 코드/right · 1/통합시설코드/right |
| facilityName, planName, method | H, I, J | 국소명-최종, 국소명-계획, 방식 | 1/확정국소명/below · 1/계획단계국소명/below · 1/방식/below |
| round | K | 사업 차수 | `round`: 1/사업차수/below, `year`: 1/사업년도/below |
| workType, subType | M, N | 사업 유형, 세부사업 유형 | 1/세부공사유형/below · 1/세부사업구분/below |
| bigCategory, midCategory | O, P | 사업구분 대분류·중분류 | 1/투자목적 대분류/right · 1/투자목적 중분류/right |
| equipFinal, equipPlan | S, U | 장비최종, 장비계획 | 1/장비Type(변경)/below · 1/장비Type(계획)/below |
| realty, equipPlace | AZ, BB | 부동산 형태, 장비위치 | 3/장소구분/below · 3/시설장소/below |
| towerType, towerSpec | BF, BG | 철탑 형태, 철탑 규격 | 5/철탑형태/below · 5/철탑높이/below |
| address | BI | 주소(전체) | `oldAddress`: 2/구주소/below, `lot`: 2/구 세부주소 (번지)/below |
| aiManager | BX | AI담당 | 1/승인담당자/below |
| antennaShape | BH | 공중선 형상 | 5/공중선방식/below |
| sharer | BD | 공용화 주관사 | 2/공용화주관사/below |
| region, regionDetail | F, G | 지역 구분, 지역 세부 | `oldAddress`: 2/구주소/below |
| mokuk, scanStation | Y, Z | 모국 (&기지국), 집중국 | mokuk: `mokukName`+`upperName` / scanStation: `mokukName` |
| siteName | BU | Site명 | `facilityName`: 1/확정국소명/below (그룹 `mixed`, 기본 꺼짐) |
| notes | AY | 문제점 세부내역 및 대책방안 | (없음, `lib/notes.ts`가 모은다) |

`main`이 하나뿐인 칸은 `sources: { main: … }`. `transform`: 확실 칸은 `copy`(`round`→`round`, `address`→`address`), `antennaShape`→`antenna`, `sharer`→`copy`, `region`→`region`, `regionDetail`→`regionDetail`, `mokuk`→`mokuk`, `scanStation`→`scan`, `siteName`→`siteName`(그룹 `mixed`, 기본 꺼짐), `notes`→`notes`.

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/features/site-survey/constants` → 모듈 없음으로 FAIL.
- [ ] **Step 3: 구현** — `types.ts`(위 Interfaces 그대로), `detail-columns.ts`(아래 80개 머리글을 순서대로 `DETAIL_COLUMNS`로 만들고 `columnLetter`는 Excel 열 이름 규칙), `survey-fields.ts`(위 표), `default-settings.ts`:
  - `fields`: 27개 모두 `enabled = FIELD_BY_ID[id].defaultEnabled`(식별 칸은 `true`), `aliases`는 `sharer: [{from:"LGT",to:"LGU+"}]`, `method: [{from:"인빌딩",to:"광분산"}]`, `midCategory: [{from:"NW구조혁신",to:"NW슬림화"}]`, 나머지 `[]`, `sources: {}`.
  - `modeRules`: `[{ mode: "인빌딩", useMokukOnly: true, rules: [{field:"towerType",kind:"fixed",value:"인빌딩"}, {field:"equipPlace",kind:"source",source:{section:2,label:"장비설치 층",direction:"below"}}] }]`. 철탑 규격·공중선 형상 `1`은 넣지 않는다(근거 47%·53%).
  - `knownModes`: `["광중계기","광분산","기지국","터널","인빌딩"]`.
  - `station`: `stripTags ["(공동)","(도서)"]`, `cutTokens ["-##_","_",".55."]`, `scanWords ["집중국","통합국","중심국","전송실"]`, `nonScanLabel "비SCAN"`.
  - `notes`: `{includeEtc:true, includeAccess:true, includeBuilding:true, separator:"/"}`. `address`: `appendBeonji true`, `regionMap`: `전남광주통합특별시`·`광주`·`전남`→`전남`, `전북`→`전북`, `제주`·`제주시`·`서귀포시`→`제주`. `antenna: {stripS:true}`. `version: 1`.

  세부 시트 머리글 80개(0부터): 연도, 프로젝트, 통합시설코드, 관리항목, 협력사, 지역 구분, 지역 세부, 국소명-최종, 국소명-계획, 방식, 사업 차수, 사업 구분, 사업 유형, 세부사업 유형, 사업구분 대분류, 사업구분 중분류, 부대증설유형, 장비최종 대분류, 장비최종, 장비계획 대분류, 장비계획, 시트 발행, SID 발행, 긴급대응, 모국 (&기지국), 집중국, 인허가 대상, 인허가증 발행, 회선 업체명, 회선구성 방법, 청약 요청번호, 회선 청약일, 전송로 ENG승인, 회선개통 (날짜만), 전기 업체, 전기 개통, 전주건식 필요여부, 전주건식 완료일, 공중선 공사, 장비 공사, 시험 완료, ACTA 시험조정일, ERP 활용구분, ACTA 구축완료일, 선로 계획, 전기 계획, H/W 계획, 시험 계획, 문제점1, 문제점2, 문제점 세부내역 및 대책방안, 부동산 형태, 건물유형, 장비위치, 공용화 단독/공용, 공용화 주관사, 참여사 3사,SKT,KT LGU+,단독, 철탑 형태, 철탑 규격, 공중선 형상, 주소(전체), 출입방법, 대상여부(대상,불필요), 수령일, 특이사항 (현장특이사항 및 불필요사유), 공가 신청, 공가 승인, 착공계제출 (BP->한전), 준공계제출 (BP->한전), 해지공가 요청, 해지공가 승인, 특이사항, Site명, HW팀, 시험팀, AI담당, 릴리즈구분, 불완전 치국대상, 사전설계 대상여부, 사전설계 완료일.
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS. `npx tsc --noEmit` 오류 없음.
- [ ] **Step 5: Commit 자리** — `git status`로 위 파일만 변경됐는지 확인(커밋하지 않는다).

---

### Task 2: 모국·집중국 규칙

**Files:** Create `lib/station-rules.ts` · Test `lib/station-rules.test.ts`

**Interfaces:**
- Consumes: `StationSettings` (Task 1).
- Produces: `cleanStationName(raw: string, station: StationSettings): string`, `isScanStation(cleaned: string, station: StationSettings): boolean`, `deriveStations(input: { mokukName: string; upperName: string; useMokukOnly: boolean }, station: StationSettings): { mokuk: string; concentrator: string }`.

- [ ] **Step 1: 실패하는 테스트 작성** (`DEFAULT_SETTINGS.station` 사용)
  - `cleanStationName` 표: `"(공동)S여수봉산중심국_돌산L-DUF5-AC.55.LTE.DU20(내"`→`"S여수봉산중심국"`, `"S광주쌍암통합국-01_A-CDUH20(A12).55.5G.CDU20(내)(N"`→`"S광주쌍암통합국"`, `"S여수봉산중심국_1-DU30-1.55.LTE W.DU30(내)-WL"`→`"S여수봉산중심국"`, `"(도서)남면우학W.55.WCDMA.E3R-NODEB(외)"`→`"남면우학W"`, `"(공동)(도서)비금도L"`→`"비금도L"`, `"S제주전송실"`→`"S제주전송실"`, `""`→`""`, `"  S광주통합국 "`→`"S광주통합국"`(공백 정리).
  - `-##_`는 숫자 두 자리만 맞는다: `"S가나통합국-1_A"`는 `-1_`이 아니라 `_`에서 잘려 `"S가나통합국-1"`.
  - `isScanStation`: `S목포옥암통합국`·`S광주쌍촌중심국`·`S제주전송실`·`광양집중국` true, `남면우학W`·`돌산L` false.
  - `deriveStations` 표(모두 `DEFAULT_SETTINGS.station`):

    | mokukName | upperName | useMokukOnly | 결과 `{mokuk, concentrator}` |
    |---|---|---|---|
    | `S광주쌍암통합국-01_A-CDUH20…` | `""` | `false` | `S광주쌍암통합국` / `S광주쌍암통합국` |
    | `(공동)S광주쌍암중심국-26_DU30-2(E5).55.LTE W.DU30(` | 같은 값 | `false` | `S광주쌍암중심국` / `S광주쌍암중심국` |
    | `(도서)남면우학W.55.WCDMA.E3R-NODEB(외)` | `""` | `false` | `남면우학W` / `비SCAN` |
    | `S목포옥암통합국-16_B-CDUH10.55.5G.CDU10(내)` | `S목포옥암중심국_남악신도시L-DUF30-C1.55.LTE.DU20(` | `true` | `S목포옥암통합국` / `S목포옥암통합국` |
    | 위와 같음 | 위와 같음 | `false` | `S목포옥암중심국` / `S목포옥암통합국` |
    | `(공동)S여수봉산중심국_돌산L-DUF5-AC.55.LTE.DU20(내` | 같은 값 | `false` | `S여수봉산중심국` / `S여수봉산중심국` |
  - 설정이 바뀌면 결과가 바뀐다: `scanWords`에서 `중심국`을 빼면 `S광주쌍암중심국`의 집중국은 `비SCAN`. `nonScanLabel`을 바꾸면 그 값이 나온다. `useMokukOnly`를 `false`로 하면 인빌딩 입력도 상위국명을 쓴다.
  - 통합국↔중심국 이름이 다른 입력(4행)에서 **경고 정보가 없다**(반환값은 위 두 필드뿐).
- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/features/site-survey/lib/station-rules.test.ts` → FAIL(모듈 없음).
- [ ] **Step 3: 구현** — `cutTokens`의 `#`를 `\d`로, 나머지는 이스케이프해서 정규식 목록으로 만들고 **문자열에서 가장 앞에 나오는 일치 위치**에서 자른다(`stripTags`는 앞에서 반복 제거). `deriveStations`: `mokuk = useMokukOnly ? cleaned(mokukName) : (cleaned(upperName) || cleaned(mokukName))`, `concentrator = isScan(cleaned(mokukName)) ? cleaned(mokukName) : nonScanLabel`.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS.
- [ ] **Step 5: Commit 자리** — `git status` 확인.

---

### Task 3: 값 변환 함수

**Files:** Create `lib/transforms.ts` · Test `lib/transforms.test.ts`

**Interfaces:**
- Consumes: `Alias`, `RegionRule`.
- Produces: `formatRound(round: string, year: string): string`, `formatAddress(oldAddress: string, lot: string, appendBeonji: boolean): string`, `stripTrailingS(raw: string, enabled: boolean): string`, `regionOf(address: string, map: RegionRule[]): string`, `regionDetailOf(address: string): string`, `siteNameOf(facilityName: string): string`, `joinParts(parts: string[], separator: string): string`, `applyAliases(value: string, aliases: Alias[]): string`.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `formatRound("5차","2026")="26-05"`, `("12차","2026")="26-12"`, `("","2026")=""`, `("미확정","2026")="미확정"`.
  - `formatAddress("전남광주통합특별시 무안군 일로읍 오룡리","437번지",true)="전남광주통합특별시 무안군 일로읍 오룡리 437번지"`, `("광주 서구 화정동","23-27번지",true)="광주 서구 화정동 23-27번지"`, `("전남 광양시 금호동","631",true)="전남 광양시 금호동 631번지"`, `("…","198-1번지",true)`에 `번지번지`가 **없다**, `lot=""`이면 구주소만, `appendBeonji=false`이면 `…327-6` 그대로.
  - `stripTrailingS("1S",true)="1"`, `("3S",true)="3"`, `("1S",false)="1S"`, `("OMNI",true)="OMNI"`, `("S",true)="S"`, `("",true)=""`.
  - `regionOf`(기본 `regionMap`): `전남광주통합특별시 광산구 …`→`전남`, `광주 여수시 …`→`전남`, `전남 …`→`전남`, `전북 군산시`→`전북`, `전북특별자치도 군산시`→`전북`, `제주시 …`→`제주`, `서귀포시 …`→`제주`, `서울 …`→`""`.
  - `regionDetailOf("전남광주통합특별시 광산구 수완동")="광산구"`, 한 단어면 `""`.
  - `siteNameOf`: `수완포레외부_1-AAU`·`수완포레외부-RRU(F1)`·`수완포레외부_2-AAU`→`수완포레외부`, `아트박스여수점_1-AAUVL`·`아트박스여수점_DBRRU2(120)`·`아트박스여수점_RRU(F1)`·`아트박스여수점_RRU2(B7_30)`→`아트박스여수점`, 꼬리가 없는 `여수남면WMC`→`여수남면WMC`.
    - 접두 태그: `(공동)백운산한재-RRU(F1)`→`백운산한재`, `(단독)북구신용동도서관-RRU(F1)`→`북구신용동도서관`, `(도서)(공동)비금도L-RRU(F1)`→`비금도L`.
    - 인빌딩·기타 꼬리: `X_1-AAUY`→`X`, `X_1-AAU_이`→`X`, `X-LORA`→`X`, `X-GIRS(인S-공K1)_L1P2`→`X`, `X-GIRO2(인-공K3)_L1P2`→`X`, `X-PRU(인-공K3)_L1P4`→`X`.
    - **동·층은 지우지 않는다**: `조촌아너스빌108동B3-GIRO(인-공K3)_L1P2`→`조촌아너스빌108동B3`, `웅천부영1차3동옥상-RRU(F1)`→`웅천부영1차3동옥상`(사용자가 손본다, 설계 §4.3).
  - `joinParts(["a","","b"],"/")="a/b"`, 전부 비면 `""`.
  - `applyAliases("LGT",[{from:"LGT",to:"LGU+"}])="LGU+"`, `(" LGT ")`도 `"LGU+"`, 일치 없으면 그대로, 같은 `from`이 둘이면 **먼저 나온 것**.
- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/features/site-survey/lib/transforms.test.ts` FAIL.
- [ ] **Step 3: 구현** — 각 함수는 위 시그니처 그대로. `stripTrailingS`는 `^(\d+)S$`만 대상. `regionOf`는 `prefix`로 **시작하는** 첫 규칙. `siteNameOf`는 ① 앞의 `(공동)`·`(도서)`·`(단독)` 태그를 모두 지우고 ② `_`/`-` 뒤에 `(숫자-)?` + 장비 토큰(`AAU*`·`RRU*`·`DBRRU*`·`GIR*`·`PRU*`·`LORA`·`DU*`)이 오는 꼬리와 그 뒤를 지운다(끝의 `_이` 포함) ③ 동·층 표기는 건드리지 않는다. 정확한 패턴은 위 입력 전체로 확정한다.
- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: Commit 자리** — `git status` 확인.

---

### Task 4: 실사서 읽기

**Files:** Create `lib/parse-survey.ts`, `lib/notes.ts`, `lib/test-support/make-survey-workbook.ts` · Test `lib/parse-survey.test.ts`, `lib/notes.test.ts`

**Interfaces:**
- Consumes: `SourceRef`, `SurveyDoc`, `NoteItem`, `NotesSettings`.
- Produces: `class SurveyFormatError extends Error`, `parseSurveyWorkbook(workbook: XLSX.WorkBook, fileName: string): SurveyDoc`, `readSurveyFile(file: File): Promise<SurveyDoc>`, `readSurveyFiles(files: File[], concurrency?: number): Promise<{ docs: SurveyDoc[]; errors: { name: string; message: string }[] }>`(기본 4개씩 병렬, 결과는 입력 순서), `filterSurveyFiles(files: File[]): { accepted: File[]; skipped: { name: string; reason: "temp" | "not-xlsx" }[] }`, `collectNoteParts(doc: SurveyDoc, notes: NotesSettings): string[]`, 테스트 지원 `makeSurveyWorkbook(spec: { cells: Record<string, string>; merges?: string[] }): XLSX.WorkBook`(`cells`는 `"A5": "1. 일반현황"`처럼 A1 주소→값).

- [ ] **Step 1: 실패하는 테스트 작성** (합성 워크북, 라벨 좌표는 실제 양식과 같게: 섹션 제목은 A열, `프로젝트 코드` 라벨 `S6`이 `S6:Y6` 병합 → 값은 `Z6`)
  - `get below`: `A8="방식"`, `A9="광중계기"` → `get({section:1,label:"방식",direction:"below"})="광중계기"`.
  - `get right`: 라벨 `S6`(병합 `S6:Y6`), 값 `Z6="E.C26A.55.0412"` → 병합 끝 다음의 첫 값. 값 칸이 비면 `""`이고 `has`는 `true`.
  - **섹션 구분(Review Focus 2)**: `기타1`이 섹션 1에 `"일반 메모"`, 섹션 2에 `"치국 메모"`로 있으면 `get({section:2,label:"기타1",direction:"right"})="치국 메모"`. `nth`로 같은 섹션의 두 번째 라벨을 고른다.
  - 라벨이 없으면 `has=false`, `get=""`.
  - `notes()`: `기타1`·`기타2`를 문서 순서로 모으고, `기타(OM)`은 제외, 오른쪽 칸이 다른 `기타N` 라벨이면 값 없음으로 건너뛰며, `현장조사 사진` 머리글 줄 **아래**의 `기타1`~`기타3`(사진 이름표)은 제외한다.
  - `ids()`가 `{year:"2026", project:"E.C26A.55.0412", facilityCode:"2026Y9628"}`.
  - `parseSurveyWorkbook`: `현 장 조 사 서`(공백 제거 후 `현장조사서`)나 `1. 일반현황`이 없으면 `SurveyFormatError`.
  - `readSurveyFile`: 합성 워크북을 `XLSX.write(…, {type:"array", bookType:"xlsx"})`로 만들어 `new File([bytes], "x.xlsx")`를 읽으면 `get`이 동작한다(`file.arrayBuffer()` 사용, `FileReader` 쓰지 않음).
  - `readSurveyFiles`: 동시에 읽는 파일이 4개를 넘지 않고(가짜 `readSurveyFile`의 진행 중 개수로 확인), 결과 `docs`는 입력 순서이며, 양식이 아닌 파일 하나는 `errors`에만 들어가고 나머지는 계속 읽는다.
  - **파일 걸러내기(Review Focus 3)**: `"~$a.xlsx"`→`temp`, `"a.pdf"`→`not-xlsx`, `"B.XLSX"`→accepted(대소문자 무시), 전부 건너뛰면 `accepted`가 `[]`이다.
  - `collectNoteParts`(가짜 `SurveyDoc`): 기본 설정에서 순서가 `일반 기타1 → 상세출입방법 → 건물구분 → 치국 기타1 → …`(섹션 오름차순, 치국현황에서는 `상세출입방법`·`건물구분`이 그 섹션의 기타 앞), `includeEtc=false`면 기타N이 빠지고, `includeAccess=false`면 상세출입방법이 빠지며, 값이 비면 조각을 만들지 않는다.
- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/features/site-survey/lib/parse-survey.test.ts src/features/site-survey/lib/notes.test.ts` FAIL.
- [ ] **Step 3: 구현** — 시그니처는 위 그대로. 알고리즘(설계 §4.7): ① 섹션 경계는 A열의 `^\d\.\s` 줄, **본문 끝**은 `현장조사 사진`(공백 제거) 줄. ② 라벨은 섹션 안에서 글자가 정확히 같은 칸(공백·줄바꿈 정리). ③ `below`는 라벨 바로 아래 줄 같은 열, `right`는 라벨 병합 끝 다음 열부터 같은 줄의 첫 값. ④ `xlsx`는 `readSurveyFile` 안에서 `await import("xlsx")`. ⑤ 읽은 뒤에는 섹션·라벨→값 색인만 `SurveyDoc`에 남기고 파싱된 워크북 참조는 버린다(메모리). `readSurveyFiles`는 작업 4개짜리 풀로 돌린다. `상세출입방법`·`건물구분`은 `collectNoteParts`가 `{section:2, direction:"right"}`로 `doc.get`한다.
- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: Commit 자리** — `git status` 확인.

---

### Task 5: 설정 스키마·합치기·검증

**Files:** Create `lib/settings-schema.ts` · Test `lib/settings-schema.test.ts`

**Interfaces:**
- Consumes: `SurveySettings`, `SurveySettingsOverrides`, `DEFAULT_SETTINGS`.
- Produces: `parseOverrides(json: unknown): { ok: true; overrides: SurveySettingsOverrides } | { ok: false; errors: string[] }`, `mergeSettings(defaults: SurveySettings, overrides: SurveySettingsOverrides): SurveySettings`, `diffSettings(defaults: SurveySettings, effective: SurveySettings): SurveySettingsOverrides`, `validateSettings(settings: SurveySettings): string[]`(오류 메시지 목록, 비면 통과), `SUPPORTED_SETTINGS_VERSION = 1`.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `mergeSettings(DEFAULT_SETTINGS, {})`는 `DEFAULT_SETTINGS`와 깊은 동일.
  - `{fields:{midCategory:{aliases:[{from:"NW구조혁신",to:"NW슬림화"}]}}}`를 합치면 그 칸의 치환표만 바뀌고 다른 칸·다른 그룹은 기본값 그대로.
  - **배열은 합치지 않고 교체**: `{station:{scanWords:["통합국"]}}` → `scanWords`가 정확히 `["통합국"]`.
  - `diffSettings(DEFAULT_SETTINGS, DEFAULT_SETTINGS)`는 `{}`. `mergeSettings(D, diffSettings(D, X))`는 `X`와 같다(왕복).
  - **깨진 설정(Review Focus 5)**: `parseOverrides({version:1, 알수없는키:1, station:{scanWords:["a"]}})`는 알 수 없는 키를 무시하고 `ok:true`. `{station:{scanWords:"문자열"}}`는 `ok:false`이고 오류에 경로(`station.scanWords`)가 들어간다. `{version:2}`는 `ok:false`("지원하지 않는 설정 버전"). `null`·배열·숫자도 `ok:false`.
  - `validateSettings`: 같은 칸의 치환표에서 `from` 중복, `from`이 빈 문자열, `cutTokens`·`scanWords` 비어 있음, `separator` 빈 문자열(문제점 세부내역이 켜져 있을 때), `modeRules`의 같은 `mode` 중복, 같은 모드 안에서 같은 `field` 중복, `knownModes`의 같은 값 중복·빈 문자열 각각 오류. `validateSettings(DEFAULT_SETTINGS)`는 `[]`.
- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/features/site-survey/lib/settings-schema.test.ts` FAIL.
- [ ] **Step 3: 구현** — zod 스키마는 `.strip()`(알 수 없는 키 제거)이고 모든 항목 `optional`, `version`은 `z.literal(1).optional()`. 합치기는 객체는 재귀, 배열·원시값은 교체. `diffSettings`는 같은 값이면 생략하는 재귀.
- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: Commit 자리** — `git status` 확인.

---

### Task 6: 행 만들기

**Files:** Create `lib/build-rows.ts` · Test `lib/build-rows.test.ts`, `lib/build-rows.golden.test.ts`

**Interfaces:**
- Consumes: Task 1~5의 모든 함수·타입.
- Produces: `defaultEnabledFields(settings: SurveySettings): Set<FieldId>`, `effectiveEnabled(settings: SurveySettings, touched: ReadonlyMap<FieldId, boolean>): Set<FieldId>`(사용자가 직접 바꾼 칸은 그 값, 나머지는 설정 기본값), `buildRow(doc: SurveyDoc, settings: SurveySettings, enabled: ReadonlySet<FieldId>): BuiltRow`, `duplicateFacilityCodes(rows: BuiltRow[]): string[]`, `summarizeRow(row: BuiltRow): { filledCount: number; warningCount: number }`.

- [ ] **Step 1: 실패하는 테스트 작성** (`build-rows.test.ts`, 가짜 `SurveyDoc`: `get`이 `"섹션/라벨/방향"` 키의 맵을 읽고 `has`는 키 존재, `notes`는 주입)
  - 5G 옥상형: `cells[7]`(국소명-최종)에 값, 식별 칸 `cells[0..2]`는 항상 있다. 꺼진 칸은 `cells`에 키가 없다.
  - **인빌딩**(방식 원본 `인빌딩`): `cells[9]="광분산"`(치환표), `cells[57]="인빌딩"`, `cells[58]`·`cells[59]`는 원본값 그대로(실사서에 `"2"`·`"OMNI"`를 넣으면 그대로 나온다), `cells[53]`은 `장비설치 층`(`"1층 EPS_A 실"`), `cells[24]`·`cells[25]`는 모국명 기준 `S목포옥암통합국`. 각 `FieldResult.applied`는 방식 칸 `"alias"`, 철탑 형태·장비위치 `"mode-rule"`, 철탑 규격·공중선 형상 `""`.
  - **예외 조건은 치환 전 원본으로 판단**: 방식 칸이 `광분산`으로 치환돼도 위 예외가 적용된다(같은 문서에서 확인).
  - **값 `0`(Review Focus 1)**: 방식 `광중계기`, 철탑높이 `"0"` → `cells[58]="0"`. 같은 문서가 `인빌딩`이어도 `"0"` 그대로(고정값이 없다).
  - 공중선 형상: 방식 `광중계기`, 공중선방식 `1S` → `"1"`.
  - 공용화 주관사 `LGT` → `"LGU+"`. 사업 차수 `5차`+연도 `2026` → `"26-05"`.
  - **라벨을 못 찾음**: 철탑형태 라벨이 없으면 `cells[57]=""`이고 경고 `field:"철탑 형태"`, `message:"라벨을 찾지 못했습니다: 철탑형태"`. 라벨은 있고 값만 비면 경고가 없다.
  - 파일명 `E.C26A.55.0278_2026Y8374_…xlsx`의 코드와 셀 값이 다르면 경고, 셀 값을 쓴다.
  - 문제점 세부내역(`notes` 켜짐)이 `collectNoteParts`를 `notes.separator`로 이어 붙인다.
  - **중복 코드(Review Focus 4)**: 같은 통합시설코드 두 행 → `duplicateFacilityCodes`가 그 코드를 한 번 돌려주고, 두 `BuiltRow` 모두 유지된다.
  - `summarizeRow`: 값이 비어 있지 않은 칸 수(식별 칸 제외)와 경고 수.
  - **알 수 없는 방식(Q8)**: 방식 원본이 `knownModes`에 없으면(`인빌딩(광분산)`) 경고 `알 수 없는 방식 값: 인빌딩(광분산)`이고 값은 그대로 나간다. 원본이 빈 값이면 경고가 없다. 값을 치환표나 `knownModes`에 추가하면 경고가 사라진다.
  - **직접 바꾼 칸 유지(Q2)**: `effectiveEnabled`에서 `touched`에 있는 칸은 그 값, 없는 칸은 설정(`fields[id].enabled`)을 따른다. 설정의 `enabled`가 바뀌어도 `touched` 칸은 그대로이고, `touched`를 비우면 모두 설정을 따른다.
  - 설정을 바꾸면 같은 `doc`으로 다시 계산한 결과가 바뀐다(`NW구조혁신`→`NW슬림화` 치환표를 `midCategory`에 넣으면 `cells[15]`).
- [ ] **Step 2: 정답 대조 테스트 작성** — `build-rows.golden.test.ts`: `describe.skipIf(!process.env.SURVEY_GOLDEN_DIR || !process.env.SURVEY_GOLDEN_XLSB)`. `SURVEY_GOLDEN_DIR`(실사서 xlsx가 있는 폴더, 여러 개는 `;`로 구분)와 `SURVEY_GOLDEN_XLSB`(공정 파일 경로)를 읽어, 세부_26년에서 프로젝트+통합시설코드로 행을 찾고 **세부 시트에 값이 있는 칸만** 비교한다. 칸별 일치 수를 표로 출력하고 아래 기대치 미만이면 실패한다: 방식 10/10, 모국(&기지국) 11/11, 집중국 11/11, 철탑 형태 11/11, 철탑 규격 10/10, 장비위치 11/11, 공중선 형상 7/10(수완포레 3건이 `1S`·`3S`로 입력되어 있어 다른 것이 정상). 철탑 규격·공중선 형상은 인빌딩(무안오룡) 1건을 뺀 값이고, 무안오룡은 원본값과 세부 시트 값을 따로 출력만 한다. 확실 16칸은 수완포레·아트박스 9건에서 9/9.
- [ ] **Step 3: 실행해 실패 확인** — `npx vitest run src/features/site-survey/lib/build-rows.test.ts` FAIL.
- [ ] **Step 4: 구현** — 적용 순서는 설계 §4.8.2: ① 원본 읽기 ② 칸별 내장 변환(`transform` 이름으로 분기, 국사는 방식 원본과 같은 `mode`의 `useMokukOnly`를 찾아 `deriveStations`를 한 번만 호출) ③ 방식별 예외(`modeRules`에서 방식 **원본**과 같은 `mode`를 찾아 `fixed`/`source` 적용). 방식 원본이 비어 있지 않고 `settings.knownModes`에 없으면 방식 칸에 경고 `알 수 없는 방식 값: …` ④ 치환표 ⑤ 꺼진 칸 제외. `SourceRef`는 `settings.fields[id].sources[name] ?? rule.sources[name]`.
- [ ] **Step 5: 통과 확인** — `npx vitest run src/features/site-survey/lib/build-rows.test.ts` PASS. 정답 대조는 사용자 PC에서 `SURVEY_GOLDEN_DIR="C:\Users\celyo\Downloads\새 폴더;C:\Users\celyo\Downloads" SURVEY_GOLDEN_XLSB="C:\Users\celyo\Downloads\공정_일정관리 (1).xlsb"`를 설정하고 `npx vitest run src/features/site-survey/lib/build-rows.golden.test.ts`로 돌려 결과를 설계 §8.2에 기록한다.
- [ ] **Step 6: Commit 자리** — `git status` 확인.

---

### Task 7: 결과 엑셀

**Files:** Create `lib/export-workbook.ts` · Test `lib/export-workbook.test.ts`

**Interfaces:**
- Consumes: `BuiltRow`, `DETAIL_COLUMNS`.
- Produces: `outputFileName(date: Date): string`, `buildOutputRows(rows: BuiltRow[]): string[][]`(첫 줄 머리글 80개 + 파일당 1줄), `buildWarningRows(rows: BuiltRow[]): string[][]`(첫 줄 `["파일명","항목","내용"]`), `buildOutputWorkbook(rows: BuiltRow[]): Promise<XLSX.WorkBook>`, `downloadOutput(rows: BuiltRow[], date?: Date): Promise<void>`.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `outputFileName(new Date(2026, 10, 11))="세부_입력값_20261111.xlsx"`.
  - `buildOutputRows`: `[0]`이 `DETAIL_COLUMNS`의 머리글 80개와 같고, 데이터 줄 길이는 80, `cells`에 없는 열은 `""`, 업로드 순서를 유지한다.
  - `buildWarningRows`: 경고가 없으면 머리글만, 있으면 `[파일명, 항목, 내용]` 줄이 추가된다.
  - `buildOutputWorkbook`: 시트 이름이 `["세부_입력값"]`이고 경고가 있으면 `["세부_입력값","경고"]`.
- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/features/site-survey/lib/export-workbook.test.ts` FAIL.
- [ ] **Step 3: 구현** — `xlsx`는 함수 안에서 동적 import, `XLSX.utils.aoa_to_sheet`, 내려받기는 `XLSX.writeFile`(테스트하지 않는다, Task 11 수동 확인).
- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: Commit 자리** — `git status` 확인.

---

### Task 8: 설정 저장소 (DB·API·훅)

**Files:**
- Create: `supabase/migrations/20261117000200_survey_settings.sql`, `src/features/site-survey/api.ts`, `hooks/use-survey-settings.ts`
- Test: `src/features/site-survey/api.test.ts`

**Interfaces:**
- Consumes: `parseOverrides`, `mergeSettings`, `DEFAULT_SETTINGS`, `SupabaseBrowserClient`(`@/lib/supabase/client`), `useAuthSession`·`useIsAdmin`(`@/features/map-marker/hooks/…`).
- Produces:
  - `type LoadResult = { status: "ok"; overrides: SurveySettingsOverrides; updatedAt: string | null } | { status: "missing-table" } | { status: "invalid"; errors: string[] }`
  - `loadSurveySettings(supabase: SupabaseBrowserClient): Promise<LoadResult>`
  - `type SaveResult = { status: "saved"; updatedAt: string } | { status: "conflict" } | { status: "denied" } | { status: "missing-table" }`
  - `saveSurveySettings(supabase: SupabaseBrowserClient, overrides: SurveySettingsOverrides, expectedUpdatedAt: string | null, userId: string): Promise<SaveResult>`
  - `useSurveySettings(): { settings: SurveySettings; overrides: SurveySettingsOverrides; updatedAt: string | null; status: "loading" | "ok" | "missing-table" | "invalid"; errors: string[]; isAdmin: boolean; isSaving: boolean; save(overrides: SurveySettingsOverrides): Promise<SaveResult> }` — `status`가 `ok`가 아니면 `settings`는 `DEFAULT_SETTINGS`.

- [ ] **Step 1: 마이그레이션 파일 작성** (사용자가 SQL Editor에서 적용, 아래를 그대로)

```sql
-- 현장실사서 정리 환경설정: 항상 1행. 수정은 관리자만, 읽기는 로그인한 모든 사용자.
CREATE TABLE IF NOT EXISTS public.survey_settings (
  id         text PRIMARY KEY CHECK (id = 'default'),
  settings   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION public.touch_survey_settings_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS survey_settings_touch ON public.survey_settings;
CREATE TRIGGER survey_settings_touch BEFORE UPDATE ON public.survey_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_survey_settings_updated_at();

ALTER TABLE public.survey_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS survey_settings_select ON public.survey_settings;
CREATE POLICY survey_settings_select ON public.survey_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS survey_settings_insert ON public.survey_settings;
CREATE POLICY survey_settings_insert ON public.survey_settings
  FOR INSERT TO authenticated WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS survey_settings_update ON public.survey_settings;
CREATE POLICY survey_settings_update ON public.survey_settings
  FOR UPDATE TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
-- DELETE 정책은 두지 않는다(삭제 불가). 기본값으로 되돌리기는 settings를 '{}'로 저장한다.
```

- [ ] **Step 2: 실패하는 테스트 작성** — `api.test.ts`. 가짜 Supabase(기존 `erp-review-save.test.ts`의 가짜 클라이언트 방식)는 아래 호출 모양을 흉내 낸다: 읽기 `from("survey_settings").select("settings, updated_at").eq("id","default").maybeSingle()`, 처음 저장 `from(…).insert({id:"default",settings,updated_by}).select("updated_at").single()`, 갱신 `from(…).update({settings,updated_by}).eq("id","default").eq("updated_at",expected).select("updated_at")`.
  - `load`: 행 없음 → `{status:"ok", overrides:{}, updatedAt:null}`. 행 있음 → `overrides`와 `updatedAt`. 오류 코드 `42P01` 또는 `PGRST205` → `missing-table`. `settings`가 스키마에 안 맞으면(`{station:{scanWords:"x"}}`) → `invalid`와 오류 목록(Review Focus 5). 다른 오류는 던진다.
  - `save`: `expectedUpdatedAt=null`이면 insert하고 `saved`+새 `updatedAt`, insert가 중복(`23505`)이면 `conflict`, insert가 RLS 거부(`42501`)면 `denied`(일반 계정). update가 `42501`로 던져도 `denied`. `expected`가 있으면 update, 한 행이 돌아오면 `saved`. **0행이면 현재 `updated_at`을 다시 읽어** 다르면 `conflict`, 같으면(권한 거부) `denied`. 테이블 없음 → `missing-table`.
- [ ] **Step 3: 실행해 실패 확인** — `npx vitest run src/features/site-survey/api.test.ts` FAIL.
- [ ] **Step 4: 구현** — `api.ts`는 위 호출 모양 그대로. `use-survey-settings.ts`: react-query(`["survey-settings"]`), `useAuthSession()`의 `supabase`, `useIsAdmin().isAdmin`, `settings = status==="ok" ? mergeSettings(DEFAULT_SETTINGS, overrides) : DEFAULT_SETTINGS`, 저장 성공 시 쿼리 무효화. 테스트하지 않는다(`.tsx`가 아니라 `.ts`지만 React Query 의존이라 화면에서 확인).
- [ ] **Step 5: 통과 확인** — `npx vitest run src/features/site-survey/api.test.ts` PASS.
- [ ] **Step 6: 사용자 수동 확인(구현 후, 결과를 설계 §8.2에 기록)** — 마이그레이션 적용 뒤 ① 일반 계정으로 설정 저장이 **DB에서** 거부되는지, ② 관리자 계정으로 저장되는지, ③ 비로그인은 읽지 못하는지.
- [ ] **Step 7: Commit 자리** — `git status` 확인(마이그레이션 파일은 신규 파일로 둔다).

---

### Task 9: 메인 화면 (파일 올리기·결과 표·내려받기)

**Files:** Create `hooks/use-survey-files.ts`, `components/site-survey-main.tsx` (테스트 없음: `.tsx`는 vitest가 실행하지 않는다 — 로직은 Task 4·6·7에서 이미 테스트됨)

**Interfaces:**
- Consumes: `filterSurveyFiles`, `readSurveyFile`, `buildRow`, `defaultEnabledFields`, `duplicateFacilityCodes`, `summarizeRow`, `downloadOutput`, `useSurveySettings`, `FIELD_RULES`.
- Produces: `useSurveyFiles(): { docs: SurveyDoc[]; errors: { name: string; message: string }[]; skipped: { name: string; reason: "temp" | "not-xlsx" }[]; addFiles(files: File[]): Promise<void>; clear(): void }`, `export function SiteSurveyMain()`.

- [ ] **Step 1: 훅 구현** — `addFiles`는 `filterSurveyFiles` → 통과한 파일을 `readSurveyFiles`(4개씩 병렬, 실패한 파일은 그 파일만 `errors`에 `SurveyFormatError.message`)로 읽어 `docs`에 이어 붙인다. 같은 파일 이름을 다시 올리면 바꿔 넣는다.
- [ ] **Step 2: 화면 구현** (설계 §4.1) — 동작 목록:
  - 파일 끌어다 놓기·선택(여러 개, `accept=".xlsx"`). 건너뛴 개수와 오류를 눈에 띄게 알린다("건너뜀 2개: ~$…, PDF"). 한 번에 올린 파일이 50개를 넘으면 "파일이 많아 읽는 데 시간이 걸릴 수 있습니다" 안내만 보인다(상한은 두지 않는다).
  - 결과 표(셀 줄바꿈 금지, 가로 스크롤 없음): 파일마다 한 줄 — 프로젝트코드, 통합시설코드, 국소명(`facilityName`), 방식, 채워진 칸 수, 경고 수. 줄을 펼치면 칸별 `원본 → 변환 결과`와 적용 표시(`인빌딩 규칙`·`치환`)와 경고.
  - 내려받을 칸 체크리스트: `FIELD_RULES`를 그룹(확실·규칙 변환·수기 메모와 섞이는 칸)으로 묶고 `defaultEnabledFields` 기준으로 켠다. 체크를 바꾸면 `buildRow`로 즉시 다시 계산한다(파일을 다시 읽지 않는다). 사용자가 직접 바꾼 칸은 `touched: Map<FieldId, boolean>`으로 기억해 설정이 바뀌어도 유지하고, 나머지는 `effectiveEnabled(settings, touched)`로 설정을 따른다. **기본값으로** 버튼이 `touched`를 비운다.
  - **엑셀 내려받기** 버튼: 파일이 0개면 비활성(Review Focus 3).
  - 중복 통합시설코드는 표 위에 경고(Review Focus 4). 안내 문구(설계 §4.1 7번)를 항상 보인다.
  - 설정 상태 배너: `missing-table`("마이그레이션이 필요합니다")·`invalid`(경고 + 기본 설정으로 동작).
  - 오른쪽 위 **환경설정** 버튼은 Task 10에서 연결한다(이 Task에서는 자리만).
- [ ] **Step 3: 확인** — `npx tsc --noEmit`과 `npx eslint src/features/site-survey --max-warnings=0` 통과.
- [ ] **Step 4: Commit 자리** — `git status` 확인.

---

### Task 10: 환경설정 창

**Files:** Create `lib/settings-draft.ts`, `components/survey-settings-dialog.tsx` · Test `lib/settings-draft.test.ts`

**Interfaces:**
- Consumes: `SurveySettings`, `validateSettings`, `diffSettings`, `parseOverrides`, `mergeSettings`, `useSurveySettings`.
- Produces(`settings-draft.ts`, 모두 새 객체를 돌려주는 순수 함수): `setFieldEnabled(s, id: FieldId, enabled: boolean)`, `addAlias(s, id: FieldId, alias: Alias)`, `updateAlias(s, id: FieldId, index: number, alias: Alias)`, `removeAlias(s, id: FieldId, index: number)`, `upsertModeRule(s, mode: string, rule: ModeRule)`, `removeModeRule(s, mode: string, field: FieldId)`, `setStationList(s, key: "stripTags" | "cutTokens" | "scanWords", list: string[])`, `setModeUseMokukOnly(s, mode: string, value: boolean)`, `setKnownModes(s, list: string[])`, `countChanges(base: SurveySettings, draft: SurveySettings): number`(바뀐 항목 수, 배열은 한 항목), `export type AliasShortcut = { fieldId: FieldId; from: string }`.

- [ ] **Step 1: 실패하는 테스트 작성** — `settings-draft.test.ts`
  - 각 함수가 입력을 바꾸지 않고(`Object.freeze`된 입력으로 호출) 새 객체를 돌려준다.
  - `addAlias(D,"midCategory",{from:"NW구조혁신",to:"NW슬림화"})` 뒤 `countChanges(D, 결과)=1`, 같은 `from`을 한 번 더 넣으면 `validateSettings`가 중복 오류를 낸다.
  - `setFieldEnabled(D,"notes",true)` → `countChanges=1`. 같은 값으로 되돌리면 `0`.
  - `upsertModeRule(D,"터널",{field:"towerType",kind:"fixed",value:"터널"})`는 새 모드를 만들고, 같은 모드·같은 `field`를 다시 넣으면 교체된다. `removeModeRule`로 마지막 규칙을 지워도 `useMokukOnly`가 켜져 있으면 그 모드 항목은 남고, 꺼져 있으면 사라진다. `setModeUseMokukOnly(D,"터널",true)`는 터널 항목(규칙 0개)을 만들고 `false`로 되돌리면 사라진다. `setKnownModes`는 `countChanges`가 1이다.
  - `setStationList(D,"scanWords",[…])` → `countChanges=1`.
  - 변경이 없는 초안의 `countChanges`는 `0`.
- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/features/site-survey/lib/settings-draft.test.ts` FAIL.
- [ ] **Step 3: 도우미 구현** — 위 시그니처 그대로.
- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: 창 구현** (설계 §4.8.5, 기존 `Dialog`·`Button`·`Input`, 탭은 버튼 줄, 가로 스크롤 없음·세로만):
  - 탭 5개: **칸·치환표 / 방식별 예외(방식마다 `useMokukOnly` 스위치와 규칙, 알려진 방식 목록) / 국사(모국·집중국) / 문제점 세부내역 / 주소·지역**. 가져오기·내보내기 탭과 읽는 위치(`sources`) 편집은 2차다.
  - 초안(`useState<SurveySettings>`)을 `settings-draft` 함수로만 바꾼다. 하단: **변경 N건**(`countChanges(저장된 설정, 초안)`), **저장**(`validateSettings` 오류가 있으면 비활성 + 오류 표시, 저장은 `diffSettings(DEFAULT_SETTINGS, 초안)`을 `save`), **변경 취소**, **기본값으로 되돌리기**(확인 창 후 `{}` 저장).
  - 저장 결과별 문구: `conflict` → "다른 관리자가 먼저 저장했습니다. 다시 불러오세요", `denied` → "관리자만 저장할 수 있습니다", `missing-table` → "마이그레이션이 필요합니다".
  - **관리자가 아니면 읽기 전용**(모든 입력 비활성, "관리자만 수정할 수 있습니다").
  - 치환표는 행 추가·삭제, 원본·넣을 값 두 칸, 중복 원본 줄 표시. 시안: 메인 화면의 줄 펼침에서 관리자에게 **[치환 추가]**(`AliasShortcut`)를 주면 창이 그 칸·원본 값을 채운 채 열린다 — `SiteSurveyMain`에 `openSettings(shortcut?: AliasShortcut)`를 연결한다.
  - (2차) 설정 내보내기·가져오기는 만들지 않는다. `parseOverrides`는 DB에서 읽은 값의 검증에만 쓴다.
- [ ] **Step 6: 확인** — `npx tsc --noEmit`, `npx eslint src/features/site-survey --max-warnings=0` 통과.
- [ ] **Step 7: Commit 자리** — `git status` 확인.

---

### Task 11: 메뉴(공정관리 > 현장실사서) 연결·최종 검증

일정관리가 쓰는 방식을 따른다: 상위 메뉴에 하위 메뉴가 있고, 패널 없이 메인 영역을 직접 그린다.

**Files:**
- Modify: `src/features/shell/types/nav.ts`, `src/features/shell/types/segment.ts`, `src/features/shell/lib/nav-model.ts`, `src/features/shell/components/nav-tree.tsx`, `src/features/shell/components/panel-body.tsx`, `src/features/shell/components/app-shell.tsx`, `src/features/map-marker/store/use-map-marker-store.ts`
- Test (수정): `src/features/shell/types/nav.test.ts`, `src/features/shell/lib/nav-model.test.ts`

**Interfaces:**
- Consumes: `SiteSurveyMain`(Task 9).
- Produces:
  - `NavKey`에 `"process"`, `NAV_ITEMS`에 `{ key: "process", label: "공정관리", icon: Workflow, auth: true, enabled: true }` — **`schedule` 바로 다음**.
  - `segment.ts`: `export type ProcessSegment = "survey"`, `NavSubKey = MapSegment | ScheduleSegment | ProcessSegment`, `isMapSegment("survey") === false`.
  - `nav-model.ts`: `SEGMENT_META.survey = { label: "현장실사서", icon: FileSpreadsheet }`, `NAV_SEGMENTS.process = ["survey"]`, `NAV_DESCRIPTIONS.process`.
  - 선택 상태(`processSegment`)는 **만들지 않는다**. 하위 화면이 하나뿐이다(YAGNI). 공정관리 아래에 화면이 늘면 `use-shell-store.ts`에 일정관리처럼 추가한다.

- [ ] **Step 1: 테스트 수정(먼저 실패시킨다)**
  - `nav.test.ts`: `visibleNavItems(true,false)`에 `process`가 있고(일반 로그인), `isNavAccessible("process", false, false)=false`, `("process", true, false)=true`. `NAV_ITEMS`에서 `process`의 위치는 `schedule` 바로 다음이다.
  - `nav-model.test.ts`:
    - `segmentsOfNav("process")`는 `["survey"]`.
    - `initialPanelStep("process")`는 `"detail"`.
    - `isPanelVisible({ ...base, activeNav: "process" })`가 `false`(`panelStep: "detail"`, `isTreeOpen: true`도 `false`).
    - `isSubActive("process", "survey", "equipment")`가 `true`. `subLabelOf("process", "equipment")`가 `"현장실사서"`. `showsMarkerSummary("process", "equipment")`가 `false`.
    - `isMapSegment("survey")`가 `false`.
    - `mobileMoreItems` 기대값(47행 근처)을 `["process","barcode","backup","settings","accounts"]`로 고친다(`process`는 모바일 탭이 아니라 더보기에 들어간다).
    - `filterNavTree`: 검색어 `"실사서"`는 `process` 노드를 `segments: ["survey"]`로, 검색어 `"공정"`은 `process`를 하위 메뉴 전부와 함께 돌려준다.
- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/features/shell` FAIL.
- [ ] **Step 3: 구현** (파일별 정확한 변경)
  - `segment.ts`: 위 Produces. `isMapSegment`의 제외 목록에 `"survey"` 추가.
  - `nav.ts`: 위 Produces(`Workflow`는 `lucide-react`에서 import).
  - `nav-model.ts`: ① `SEGMENT_META`·`NAV_SEGMENTS`·`NAV_DESCRIPTIONS.process = "현장실사서 엑셀에서 세부 시트에 옮겨 적을 값을 만듭니다"`. ② `initialPanelStep`: `hasNavSegments(nav) && nav !== "schedule" && nav !== "process" ? "root" : "detail"`. ③ `isPanelVisible`: `schedule || accounts`에 `process`를 더한다. ④ `isSubActive`: `nav === "process"`이면 `key === "survey"`. ⑤ `subLabelOf`: `nav === "process"`이면 `SEGMENT_META.survey.label`. ⑥ `showsMarkerSummary`: `nav !== "process"` 조건 추가.
  - `nav-tree.tsx`(112행 근처): `isChildActive`의 `(item.key === "schedule" || panelStep === "detail")`를 `(item.key === "schedule" || item.key === "process" || panelStep === "detail")`로.
  - `panel-body.tsx`: `.with("process", () => null)`(`match(...).exhaustive()`를 만족시킨다).
  - `app-shell.tsx`: `SurveyMain`을 `dynamic(() => import("@/features/site-survey/components/site-survey-main").then((m) => m.SiteSurveyMain), { ssr: false })`로 선언(계정설정과 같은 방식). `isMapHidden`에 `process`를 더하고, `showMobileSheet`의 `(activeNav !== "schedule" && activeNav !== "accounts")`에 `&& activeNav !== "process"`를 더한다. 렌더에 `{activeNav === "process" ? <SurveyMain /> : null}`.
  - `use-map-marker-store.ts`: `NAVS_WITHOUT_MARKERS`에 `"process"` 추가.
  - `use-shell-nav.ts`는 **고치지 않는다**: `pickSegment("process", "survey")`는 `isMapSegment`가 `false`라 일정관리가 아닌 분기를 건너뛰고 `setPanelStep("detail")`만 실행한다. 이 동작을 Step 6에서 눈으로 확인한다.
- [ ] **Step 4: 통과 확인** — `npx vitest run src/features/shell` PASS, `npx tsc --noEmit` 오류 없음(`.exhaustive()` 누락이 컴파일 오류로 드러나는지 확인).
- [ ] **Step 5: 전체 검증** — `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test` 모두 통과. 임시 distDir로 `next build`(설정 변경 후 원복, 개발 서버가 떠 있으면 `.next`를 덮지 않는다)해 **홈 First Load JS가 297~298 kB에서 늘지 않았는지** 확인하고, 홈 번들에 `site-survey`가 들어가지 않았는지(`grep`) 확인한다.
- [ ] **Step 6: 메뉴 수동 확인(dev 서버, 사용자와 함께)** — ① 사이드바(트리)에서 **일정관리 바로 아래에 `공정관리`**가 있고, 펼치면 `현장실사서`가 있다 ② 아이콘 레일 상태에서 `공정관리`를 누르면 화면이 열린다 ③ 모바일 더보기에서 열린다 ④ 비로그인에는 보이지 않는다 ⑤ 메뉴 검색에 `실사서`를 치면 `공정관리 > 현장실사서`만 남는다 ⑥ `현장실사서`를 누르면 왼쪽 패널 없이 메인 영역에 화면이 나온다.
- [ ] **Step 7: 화면 수동 확인(dev 서버, 사용자와 함께)** — 실제 파일로: ① 실사서 13건을 올리면 한 줄씩 나온다 ② 무안오룡 줄을 펼치면 방식 `광분산`·철탑 형태 `인빌딩`·철탑 규격과 공중선 형상은 실사서 원본값 그대로·장비위치 `1층 EPS_A 실`·모국/집중국 `S목포옥암통합국` ③ 돌산무슬목 2건에서 모국/집중국 `S여수봉산중심국` ④ `~$`·PDF가 섞이면 "건너뜀"으로 알린다 ⑤ 내려받은 엑셀의 열 위치가 세부 시트와 같다 ⑥ 관리자로 치환을 추가하면 이미 올린 파일의 결과가 즉시 바뀐다.
- [ ] **Step 8: 문서 마무리** — `Ver_3.0_현장실사서_세부정리_구현.md`(구현 문서) 작성, 설계 §8.2에 정답 대조·권한 확인 결과 기록.
- [ ] **Step 9: Commit 자리** — `git status`로 변경 파일 목록만 확인하고 사용자에게 알린다.

---

## Self-Review

- **설계 커버리지**: §1 결정 1~12 → Task 1(기본값)·2(국사)·3(변환)·4(xlsx만·`~$`)·5·8(설정·관리자)·6(인빌딩·방식별)·7(결과 엑셀)·11(메뉴). §4.3 칸 규칙 → Task 1·3·6. §4.4 방식별 예외 → Task 6·10. §4.5 → Task 2. §4.6 → Task 4(`collectNoteParts`)·6. §4.7 → Task 4. §4.8 → Task 5·8·10. §4.10 오류 → Task 4·6·8·9. §4.11 테스트 → 각 Task + 정답 대조(Task 6) + 권한 수동(Task 8). §5 완료 기준 → Task 6(2·3·4), 7(5), 11(6), 8·11(7~9), 정답 `0198` 엑셀은 사용자가 보내면 같은 정답 대조로 확인(설계 §5의 10).
- **메뉴**: 설계 결정 12(공정관리 > 현장실사서)를 그대로 구현한다(Task 11). 설계 §6의 열린 질문 중 읽기 전용 노출·상세출입방법 포함은 설계의 기본값을 그대로 구현하고, `NW구조혁신`은 기본 치환에 넣는다(2026-11-13 확정).
- **타입 일치**: `SurveyDoc.get/has/notes/ids`, `BuiltRow.cells: Record<number,string>`, `deriveStations → {mokuk, concentrator}`, `loadSurveySettings`/`saveSurveySettings` 결과 타입이 Task 간에 같은 이름이다.
- **비율**: 설계 416줄에 계획 약 490줄. 늘어난 부분은 표(칸 규칙·테스트 입력값)와 세부 시트 머리글 80개, 마이그레이션 SQL처럼 구현자가 혼자 정할 수 없는 값이다. 함수 본문은 쓰지 않고 시그니처·테스트 값·알고리즘 요점만 두었다.
