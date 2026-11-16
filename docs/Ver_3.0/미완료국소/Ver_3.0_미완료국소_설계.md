# 미완료 국소 탭 · 미배정 국소 제외 (설계)

작성일 2026-11-16 · 대상: `일정관리`(`src/features/schedule/`, 셸 메뉴 `src/features/shell/`) · 구현계획: [Ver_3.0_미완료국소_구현계획.md](Ver_3.0_미완료국소_구현계획.md) · 구현: [Ver_3.0_미완료국소_구현.md](Ver_3.0_미완료국소_구현.md)(구현 뒤 작성) · 관련: [시설일정 고도화 설계](../시설일정/Ver_3.0_시설일정_고도화_설계.md) · [2단계 구현](../시설일정/Ver_3.0_시설일정_고도화2단계_구현.md)

## 1. 배경과 결정 사항

사용자(화면 피드백, 2026-11-16): ① 미배정 국소 목록에 **사업이 취소됐거나 시설이 필요 없는 국소**가 섞여 있어 정리가 필요하다. ② 시설일정에서 **미완료로 체크한 국소를 볼 수 있는 탭**이 있었으면 한다.

### 1.1 사용자가 정한 것

| # | 결정 | 출처 |
|---|---|---|
| 1 | 취소·불필요 국소는 **제외 목록을 DB에 저장**해 모든 관리자에게 공유하고 복원할 수 있게 한다(A안). 이 브라우저에만 숨기는 방식(B안)은 쓰지 않는다 | 사용자 답변 |
| 2 | **미시설과 일부완료는 각각 다른 탭**으로 보여 준다 | 사용자 답변(Q4 수정) |
| 3 | 나머지 7개 제안(아래 1.2)은 수정 요청이 없어 **추천대로** 진행한다 | 사용자 답변("수정 없음") |

### 1.2 설계에서 정한 것 (확인 질문 Q1~Q8의 추천안)

| # | 결정 |
|---|---|
| 4 | **제외 기준**은 국소명을 `normalize`(공백 제거·소문자, `features/worksite-weather/lib/site-search`)한 값이다. 미배정 목록이 일정 글과 대조하는 규칙(`nameKeys`: 국소명·최종국소명·별칭)과 같은 정규화를 써서 어긋나지 않게 한다. 마커 id와 원래 이름은 참고용으로 남긴다 |
| 5 | **제외 사유**: `사업 취소`·`시설 불필요`·`기타` 중 하나 + 메모(선택, 100자). `기타`는 메모가 필수 |
| 6 | **제외·복원은 관리자만**, 제외 목록 조회는 로그인한 모두. 복원하면 다시 미배정 목록에 나타난다. 일정 칸 자체를 취소하는 기능은 범위 밖 |
| 7 | **제외는 하나의 개념**이다. 미배정 창에서 제외하든 미완료 탭에서 제외하든 같은 제외 목록에 들어가며, 제외한 국소는 **미배정 목록과 미완료 탭 두 곳에서 모두** 사라진다 |
| 8 | 미완료 탭은 **`미시설`·`일부완료` 두 개의 일정관리 탭**이고, 같은 화면 컴포넌트를 상태(`undone`/`partial`)만 바꿔 쓴다. 기본은 **"아직 다시 안 잡은 것"**(다시 잡을 날짜가 없는 건)만 최근 날짜순으로 보이고, "다시 잡은 것 포함" 체크로 전체를 본다. 팀·기간 필터, 최대 500건 |
| 9 | 미완료 줄의 동작: **[일정표에서 보기]**(그 날짜로 이동·칸 강조), **[다시 잡기]**(기존 `ScheduleResultDialog`를 그 칸으로 열어 날짜를 정하면 기존 규칙대로 복사), **[제외]**(제외 목록에 추가) |
| 10 | **SQL 적용 전**: 미배정 목록은 지금과 똑같이 동작하고 [제외]는 안내만 보인다. 미완료 탭은 DB 변경이 없어 바로 쓸 수 있다(탭의 [제외]만 안내) |
| 11 | **보완(2026-11-16, 사용자 지적)**: 마커(또는 장비 기록)에 **시설일이 입력된 국소는 시설 완료로 본다.** 시행 결과가 `일부완료`·`미시설`로 남아 있어도 미시설·일부완료 탭의 기본 보기에서 뺀다(`시설 완료된 것 포함`으로 볼 수 있다). 용어 정의는 저장소 루트 `GLOSSARY.md` |

## 2. 확인한 사실

| 사실 | 근거 |
|---|---|
| 미배정 국소는 **마커에서 계산하는 값**이다(시설일이 없고 오늘 이후 일정에 없는 대표·단독 마커, 업체 `남양`만). 취소·불필요를 저장하는 곳이 없다 | `lib/unscheduled-stations.ts` `findUnscheduledStations`, `hooks/use-unscheduled-stations.ts` |
| 일정 글과의 대조는 **정규화한 일정 글 전체 = 마커의 국소명·최종국소명·별칭 키** 일치다 | 같은 파일 `nameKeys`, `scheduled` 집합 |
| 시행 결과는 `schedule_cells`의 `result_status`(`done`/`partial`/`undone`)·`result_reason`·`rescheduled_to`에 이미 있다. **DB 변경 없이** 조회할 수 있다 | `20261109000000_schedule_result.sql` 원본(03 파일), `types.ts` `CellResult` |
| "다시 잡기"는 시행 결과 창이 `copyCellToDate`(같은 팀 첫 빈 행에 복사)와 `updateScheduleCellResult`를 순서대로 부른다. 이미 그 날짜로 복사한 칸은 다시 복사하지 않는다 | `components/schedule-result-dialog.tsx` `handleSave` |
| 일정관리 탭은 `ScheduleSegment = "facility" \| "daily" \| "mail"`이고 셸 스토어는 persist하지 않는다. `isMapSegment`가 세그먼트 키를 하나씩 나열해 지도 세그먼트를 가려내므로 새 키를 **반드시 함께 추가**해야 한다 | `shell/types/segment.ts`, `shell/lib/nav-model.ts`, `shell/store/use-shell-store.ts` |
| 날짜 이동·칸 강조는 `ScheduleView` 안의 상태(`jumpToDate`, `highlightCellId`)다. 다른 일정 탭에서 이 화면으로 넘어와 강조하려면 **전달 수단이 필요하다** | `components/schedule-view.tsx`(1A) |

## 3. 설계

### 3.1 DB: `schedule_excluded_stations`

```
id          uuid PK default gen_random_uuid()
station_key text NOT NULL UNIQUE            -- normalize(국소명), 1~200자
label       text NOT NULL                   -- 제외할 때의 국소명(표시용), 1~200자
marker_id   text NULL                       -- 참고용(미배정 창에서 제외했을 때만)
reason      text NOT NULL CHECK (reason IN ('canceled','unneeded','other'))
note        text NOT NULL DEFAULT ''        -- 100자 이하, reason='other'이면 비어 있으면 안 됨
created_by  uuid DEFAULT auth.uid()
created_at  timestamptz NOT NULL DEFAULT now()
```
- RLS: 조회는 `authenticated`, 추가·삭제는 `is_app_admin()`만(기존 일정 테이블과 같은 모델). UPDATE 정책은 없다(복원 = 삭제). 같은 키를 두 번 넣어도 오류가 나지 않게 클라이언트는 `upsert(…, { onConflict: "station_key", ignoreDuplicates: true })`(INSERT 정책만 필요)를 쓴다.
- 마이그레이션 `supabase/migrations/20261122000000_schedule_excluded_stations.sql`. 적용 후 확인 절차와 되돌리는 방법(`DROP TABLE`)을 SQL 주석에 적는다. 사용자가 SQL Editor에서 적용한다.

### 3.2 순수 모듈

- `lib/excluded-stations.ts`: `EXCLUSION_REASONS`(키·라벨), `exclusionKey(name)`(= `normalize`), `validateExclusion({ reason, note })`(기타는 메모 필수·100자), `buildExclusionRows(items, reason, note)`(`station_key` 중복 제거), `excludedKeySet(rows)`, `isExcludedText(text, set)`.
- `lib/unscheduled-stations.ts`: `findUnscheduledStations(markers, scheduledNames, excludedKeys?)` — 마커의 `nameKeys` 중 하나라도 제외 키 집합에 있으면 목록에서 뺀다. 생략하면 지금과 같다(기존 테스트 그대로 통과).
- `lib/incomplete-list.ts`: `isRescheduled(cell)`, `selectIncomplete(cells, { includeRescheduled, excludedKeys })`(제외 키와 정규화한 칸 글이 같으면 뺌, 최근 날짜순·같은 날짜는 팀·행 순), `summarizeIncomplete(cells)`(건수).

### 3.3 미배정 창 (`schedule-unscheduled-dialog.tsx`)

- 체크한 국소가 있으면 **[제외 (N)]** 버튼(관리자만)이 보이고, 누르면 작은 창(`schedule-exclude-dialog.tsx`)에서 사유(3택)·메모를 받아 저장한다. 성공하면 선택을 비우고 목록을 다시 계산한다.
- 창 위쪽에 **`제외한 국소 (N)`** 전환이 있다. 켜면 목록 대신 제외 목록(국소명·사유·메모·제외한 날짜)이 보이고 줄마다 **[복원]**(관리자)이 있다. 복원은 확인 없이 바로 하되 토스트로 알린다.
- 제외 목록을 읽지 못하거나(테이블 없음) 저장이 막히면: 미배정 목록은 평소처럼 보이고, [제외]를 누르면 "DB에 제외 테이블이 없습니다. 마이그레이션을 적용해 주세요"를 보인다.
- 제외한 국소는 `useUnscheduledStations`가 `findUnscheduledStations`에 제외 키를 넘겨 목록에서 뺀다. 건수 문구에 제외된 건수를 따로 쓰지는 않는다(전환 버튼의 N이 그 숫자).

### 3.4 미완료 탭 (미시설 · 일부완료)

- `ScheduleSegment`에 `undone`(라벨 `미시설`)·`partial`(라벨 `일부완료`)을 더한다. 일정관리 상단 탭(`ScheduleSectionSwitch`)은 `시설일정 | 일일일정 | 메일양식 | 미시설 | 일부완료`, 사이드바·모바일 메뉴 하위 항목도 같은 순서다. `isMapSegment`에 새 키를 반영한다.
- `ScheduleMain`(`app-shell.tsx`의 `section`)이 새 키에서 **`ScheduleIncompleteView`**(`status` = `undone`/`partial`)를 그린다.
- 조회: `api.ts` `fetchIncompleteCells(supabase, { status, from, to, columnIds })` — `schedule_cells`에서 `result_status = status`, 기간·팀 필터, `work_date` 내림차순·`row_no`, **501건 요청해 500건 초과면 `truncated`**. 시행 결과 컬럼이 없는 DB(마이그레이션 전)면 "시행 결과 기능을 쓰려면 마이그레이션이 필요합니다" 안내를 보이고 빈 목록. 열(팀) 이름은 `useScheduleRange`가 쓰는 열 조회를 재사용한다.
- 화면: 머리에 제목(`미시설 국소`/`일부완료 국소`)·건수·필터(팀 칩, 기간 `DatePicker` 두 개, `다시 잡은 것 포함` 체크)·새로고침. 표(줄바꿈 금지·말줄임, 가로 스크롤 없음): `날짜(요일) | 팀 | 국소 | 사유 | 다시 잡은 날짜 | 동작`. `다시 잡은 날짜`는 없으면 `-`(강조색), 있으면 `MM-DD`.
- 동작(관리자): **[일정표에서 보기]**는 모두에게 보인다.
  - **[일정표에서 보기]**: 새 작은 스토어 `store/use-schedule-jump-store.ts`(`target: { date, cellId } | null`)에 대상을 넣고 일정관리 세그먼트를 `facility`로 바꾼다. `ScheduleView`가 마운트·대상 변경 때 대상을 읽어 해당 날짜로 이동하고 칸을 강조한 뒤 대상을 비운다(1A의 `jumpToDate`·`highlightCellId`를 그대로 쓴다).
  - **[다시 잡기]**: 기존 `ScheduleResultDialog`를 그 칸으로 연다. 저장하면 목록을 다시 읽는다(다시 잡힌 건은 기본 보기에서 사라진다).
  - **[제외]**: 3.3의 `schedule-exclude-dialog`를 재사용한다(국소명 = 칸의 `mainText`, 기준 키 = `normalize(mainText)`). 제외하면 목록에서 사라진다.
- 일정 편집(`facility` 탭) 쪽에서 결과를 `완료`로 바꾸면 이 탭에서 사라진다(조회가 `result_status` 기준이라서). 이 탭에서 결과를 직접 `완료`로 바꾸는 기능은 넣지 않는다(결과 창에서 한다).

### 3.5 보완: 시설 완료 판정 (결정 11)

**발견**: 구현 뒤 사용자가 `일부완료` 탭의 8줄(2026-11-10, `북구본촌코오롱103·104동화지-GIRO…`)이 이후에는 **완료로 되어 있다**고 알려 왔다. 데이터를 직접 조회해 확인했다.
- 시설일정(`schedule_cells`)에는 그 국소의 이후 기록이 **없다**(11/10 일부완료뿐). 즉 "완료"는 일정표가 아니라 **마커 데이터**에 있다.
- 두 국소의 마커(`information.install_date`)에 시설일이 `2026-10-31`로 입력돼 있다.
- 미시설·일부완료로 기록된 서로 다른 국소 13곳 중 **시설일이 있는 곳은 이 2곳뿐**이고 나머지 11곳은 비어 있다(스크린샷의 나머지 3줄과 미시설 탭 8곳).
- 원인: 미완료 탭은 `result_status`만 보고 목록을 만들었다. "시설 완료"의 기준이 정의돼 있지 않았다. 미배정 목록은 이미 "시설일 없음"(`hasNoInstallDate`)으로 판단하고 있었다.

**규칙**
- **시설 완료** = 마커의 `installDate` 또는 장비 기록(`facilityRecords[].installDate`) 중 하나라도 비어 있지 않음(= `hasNoInstallDate`의 반대). **시설일이 일정 결과 날짜보다 앞이어도(이번 건은 10-31 < 11-10) 시설 완료다** — 날짜 선후는 비교하지 않는다.
- 칸 글(`mainText`)을 `normalize`한 값이 마커의 **국소명·최종국소명·별칭 키**(`nameKeys`) 중 하나와 같으면 그 마커의 시설일을 그 칸에 적용한다(미배정 목록이 일정 글을 마커와 대조하는 규칙과 같다). 같은 키에 여러 마커가 걸리면 시설일이 가장 늦은 값을 쓴다.
- 미시설·일부완료 두 탭 모두 같은 규칙. 기본 보기는 시설 완료 국소를 **뺀다**. `시설 완료된 것 포함`을 켜면 보이고, `후속 일정` 열에 `시설일 MM-DD`(녹색)를 보인다. 머리 건수에 `시설 완료 N건 숨김`을 보인다.
- 마커 데이터를 아직 읽는 중이면 목록을 내보내지 않고 로딩으로 둔다(시설 완료 건이 잠깐 보이지 않게). 마커를 읽지 못하면 판정 없이 모두 보이되 "마커 데이터를 읽지 못해 시설 완료 판정을 하지 못했습니다" 안내를 보인다.
- 시행 결과 자체(`schedule_cells`)는 바꾸지 않는다. 판정은 보기에서만 한다.

**순수 모듈**: `lib/unscheduled-stations.ts`에 `installedDateByName(markers)`(이름 키 → 가장 늦은 시설일) 추가, `lib/incomplete-list.ts`의 `selectIncomplete`에 `installedDates`·`includeInstalled` 인자 추가, `installedDateOf(cell, map)`·`countInstalled(cells, map)` 추가.

**알려진 한계(사용자 확인 대상)**: ① 장비 기록이 여러 개인 마커에서 **한 기록에만 시설일이 있어도** 시설 완료로 본다(미배정 목록과 같은 규칙). 여러 장비 중 일부만 시설한 국소를 `일부완료`로 남겨 두려면 이 규칙을 좁혀야 한다. ② 일정 칸 글이 마커 이름과 다르면(작업명이 덧붙은 경우) 판정되지 않는다.

## 4. 목표·비목표

**목표**: 취소·불필요 국소를 한 번 정리하면 모두에게 반영되고 복원할 수 있다. 미시설·일부완료 국소를 한곳에서 보고 바로 다시 잡거나 일정표로 이동하거나 제외할 수 있다.

**비목표**: 일정 칸 취소·삭제 기능, 미완료 건수 배지, 엑셀 내보내기, 탭에서의 완료 일괄 처리, 제외 사유별 통계, 업체(`남양`) 외 국소 관리, 마커 데이터에 취소 상태 컬럼 추가.

## 5. 위험과 대응

| 위험 | 대응 |
|---|---|
| 제외 키가 미배정 목록의 이름과 달라 제외가 안 먹힌다(미완료 탭의 `mainText`는 `국소·작업` 글일 수 있음) | 미배정 목록과 같은 `normalize`·`nameKeys`로 대조하고, `findUnscheduledStations`에 제외 키를 넘겨 **마커의 모든 이름 키**로 걸러낸다. 미완료 탭 [제외]는 칸 글 전체의 `normalize`를 키로 쓰므로 일정 글과 마커 이름이 같은 경우에 먹힌다(다르면 미배정 창에서 제외). 한계로 구현 문서에 적는다 |
| 제외를 잘못 눌러 필요한 국소가 사라진다 | 복원 목록(`제외한 국소`)이 있고 사유·날짜가 남는다. 제외 전에 건수를 확인창에 보인다 |
| 새 세그먼트 키가 `isMapSegment`에서 빠져 지도 화면으로 분기한다 | `shell` 순수 모듈(`segment.ts`·`nav-model.ts`)을 함께 고치고 `nav-model.test.ts`·`segment` 테스트에 새 키를 추가한다 |
| 미완료 탭의 `다시 잡기` 후 목록이 갱신되지 않는다 | 결과 창 `onSaved`에서 목록 쿼리를 무효화한다. 쿼리 키는 `SCHEDULE_QUERY_KEY`로 시작하게 해 일정 갱신 때 함께 다시 읽는다 |
| 점프 대상이 다른 주·달이라 칸이 아직 없다 | 1A의 강조는 칸이 나타나는 시점에 다시 시도하고 3초 안에 안 나타나면 생략한다(그대로 재사용) |

## 6. 사용자 확인 대상 (Claude 제안)

1. 탭 이름은 `미시설`·`일부완료`로 한다(요청의 "각각 다른 탭"). 한 탭 안에 소탭으로 두기를 원하면 알려 주세요.
2. 제외된 국소는 미완료 탭에서도 사라진다(결정 7). 미완료 탭에서만은 계속 보고 싶으면 알려 주세요.
3. 탭에서 [다시 잡기]는 기존 결과 창을 그대로 연다(되돌리기는 없다, 기존 동작과 같음).

## 7. 검증 방법

- 순수 모듈(`excluded-stations`·`unscheduled-stations` 제외 키·`incomplete-list`·셸 `segment`/`nav-model`)은 `.test.ts`(TDD, 손계산 기대값, 변이 확인).
- API(`fetchIncompleteCells`, 제외 목록 조회·추가·복원)는 `api.test.ts`/새 테스트에서 쿼리 빌더 모킹으로.
- 화면(`.tsx`)은 테스트가 실행되지 않으므로 구현 문서의 "직접 하실 일" 체크리스트. SQL은 적용 후 확인 스크립트.
- 매 조각마다 `npx tsc --noEmit`·`npx eslint . --max-warnings=0`·`npm test`, 마지막에 임시 distDir 빌드(홈 First Load JS 283 kB 유지).
