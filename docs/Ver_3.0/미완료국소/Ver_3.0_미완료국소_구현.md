# 미완료 국소 탭 · 미배정 국소 제외 (구현)

구현일 2026-11-16 · 설계: [Ver_3.0_미완료국소_설계.md](Ver_3.0_미완료국소_설계.md) · 계획: [Ver_3.0_미완료국소_구현계획.md](Ver_3.0_미완료국소_구현계획.md) · 관련: [시설일정 2단계 구현](../시설일정/Ver_3.0_시설일정_고도화2단계_구현.md)

1부(**미배정 국소 제외 목록**, DB 테이블 1개)와 2부(**미시설·일부완료 탭**, DB 변경 없음)를 구현했다. 구현은 agy가 하고 Claude가 diff를 검토했다.

## 직접 하실 일

관리자 계정으로 확인한다.

1. **SQL 적용(먼저)**: Supabase 대시보드 → SQL Editor에서 `supabase/migrations/20261122000000_schedule_excluded_stations.sql` 전체를 실행한다. 다시 실행해도 안전하다. 적용 전에는 미배정 목록이 지금처럼 보이고 [제외]를 누르면 "DB에 제외 테이블이 없습니다" 안내만 뜬다. 미시설·일부완료 탭은 SQL과 무관하게 바로 쓸 수 있다(탭의 [제외]만 SQL이 필요하다).
2. **적용 후 확인**: 같은 파일 맨 아래 주석(`-- DO $$ … END $$;`)의 `--`를 지워 SQL Editor에서 실행한다(가짜 값 `__확인용국소__`만 쓰고 끝에서 지운다). `schedule_excluded_stations verification passed` 알림이 나오면 성공이고, `ASSERT`/제약 오류가 나면 항목((a)~(c))을 알려 주세요.
3. **미배정 국소 정리**
   - `미배정 국소` 창에서 국소를 체크하면 **[제외 (N)]** 버튼이 보이는지. 누르면 사유(사업 취소 / 시설 불필요 / 기타)와 메모를 받고, 확정하면 목록에서 사라지는지. `기타`를 고르고 메모를 비우면 막히는지.
   - 창 위쪽 **`제외한 국소 (N)`** 을 누르면 제외한 국소(국소명·사유·메모·제외한 날짜)가 보이고 **[복원]** 하면 미배정 목록에 다시 나타나는지.
   - 일반(비관리자) 계정으로 열었을 때 [제외]·[복원]이 보이지 않는지.
4. **미시설 · 일부완료 탭** (`일정관리` 상단 탭이 `시설일정 | 일일일정 | 메일양식 | 미시설 | 일부완료`로 늘었는지, 사이드바·모바일 메뉴 하위 항목도 같은지)
   - **미시설** 탭에 시행 결과를 `미시설`로 기록한 칸이, **일부완료** 탭에 `일부완료`로 기록한 칸이 따로 보이는지(날짜 · 팀 · 국소 · 사유 · 다시 잡은 날짜). 같은 날짜는 팀 순서대로 묶여 행 번호 순인지.
   - 기본은 **다시 잡지 않은 것만** 보이고(머리에 `표시 · 미조치 · 조회` 건수), `다시 잡은 것 포함`을 켜면 다시 잡은 건도 나오는지. 팀 칩·기간 필터가 동작하는지, 끝 날짜를 시작보다 앞으로 하면 안내가 나오는지.
   - **[일정표에서 보기]**: 눌러서 `시설일정` 탭으로 넘어가 그 날짜의 주로 이동하고 그 칸이 약 3초 강조되는지.
   - **[다시 잡기]**(관리자): 시행 결과 창이 그 칸으로 열리고, 다시 잡을 날짜를 넣어 저장하면 그 날짜에 국소가 추가되고 목록(기본 보기)에서 사라지는지.
   - **[제외]**(관리자): 제외하면 목록에서 사라지고 `미배정 국소 > 제외한 국소`에도 올라오는지.
5. **시설 완료 판정(보완)**: `일부완료`·`미시설` 탭에서 **마커에 시설일이 입력된 국소**(예: `북구본촌코오롱103·104동화지-GIRO…`)가 기본 보기에서 빠지고, 머리에 `시설 완료 N건 숨김`이 보이는지. `시설 완료된 것 포함`을 켜면 다시 나타나고 `후속 일정` 열에 녹색 `시설일 MM-DD`가 보이는지. `표시`와 `미조치` 건수가 서로 맞는지(숨긴 건은 둘 다에서 빠진다).
6. 이상이 없으면 "커밋"이라고 말씀해 주세요.

## 한 일

| 조각 | 내용 |
|---|---|
| E1 SQL | `20261122000000_schedule_excluded_stations.sql`: 테이블 `schedule_excluded_stations`(`station_key` UNIQUE·`label`·`marker_id`·`reason`(`canceled`/`unneeded`/`other`)·`note`(100자, 기타는 필수)·`created_by`·`created_at`). RLS: 조회는 로그인 전체, 추가·삭제는 `is_app_admin()`만, UPDATE 정책 없음. 적용 후 확인 스크립트((a) 추가 (b) 같은 키 재추가가 `ON CONFLICT DO NOTHING`으로 1건 유지 (c) 기타+빈 메모 제약 오류 (d) 정리) |
| E2 `lib/excluded-stations.ts` | `exclusionKey`(= 미배정 대조와 같은 `normalize`)·`validateExclusion`·`buildExclusionRows`(키 중복 제거)·`excludedKeySet`·`isExcludedText`·사유 라벨. `findUnscheduledStations`는 새 인자 `excludedKeys`로 마커의 **국소명·최종국소명·별칭** 키 중 하나라도 제외 키면 뺀다(생략하면 이전과 같다) |
| E3 API·훅 | `fetchExcludedStations`·`addExcludedStations`(`upsert … ignoreDuplicates`, INSERT 정책만으로 동작)·`restoreExcludedStation`(0건이면 오류). `useExcludedStations`(테이블 없음은 오류가 아니라 `isTableMissing`). `useUnscheduledStations`가 제외 키를 넘겨 목록에서 뺀다. 제외 목록을 못 읽어도 미배정 목록은 평소처럼 보인다 |
| E4 화면 | `schedule-exclude-dialog.tsx`(사유 3택·메모·대상 이름 최대 5개). 미배정 창에 [제외 (N)]·`제외한 국소 (N)` 전환·[복원] 버튼(관리자) |
| T1 셸 | `ScheduleSegment`에 `undone`(미시설)·`partial`(일부완료) 추가, `isMapSegment`·`SEGMENT_META`·메뉴 목록·설명·`ScheduleSectionSwitch` 반영, `app-shell`이 두 키에서 `ScheduleIncompleteView`(지연 로드)를 그린다 |
| T2 조회 | `lib/incomplete-list.ts`(`isRescheduled`·`selectIncomplete`·`incompleteCounts`), `api.ts` `fetchIncompleteCells`(상태·기간·팀 필터, 501건 요청해 500건 초과면 `truncated`), `useIncompleteCells` |
| T3 점프 | `store/use-schedule-jump-store.ts`(`request`·`consume`, persist 안 함), `ScheduleView`가 `facility`일 때 대상을 한 번 소비해 날짜 이동과 3초 강조(1A 로직 재사용) |
| T4 화면 | `schedule-incomplete-view.tsx`: 머리(탭 전환·건수·새로고침), 필터(`다시 잡은 것 포함`·팀 칩·기간), 표(줄바꿈 없음), 줄 동작 [일정표에서 보기]·[다시 잡기]·[제외] |

## 보완: 시설 완료 판정 (2026-11-16, 사용자 지적)

**지적**: `일부완료` 탭의 8줄(11/10, `북구본촌코오롱103·104동화지-GIRO…`)이 이후에는 완료로 되어 있다. 이 국소는 시설이 완료된 것으로 봐야 한다.

**원인(데이터로 확인)**: 시설일정에는 그 국소의 이후 기록이 없고, **마커의 시설일(`information.install_date`)이 `2026-10-31`로 입력**돼 있었다. 미시설·일부완료로 기록된 서로 다른 국소 13곳 중 시설일이 있는 곳은 이 2곳뿐이었다(스크린샷의 붉은 박스 8줄 = 2국소 × 4팀). 미완료 탭이 시행 결과(`result_status`)만 보고 목록을 만들어서 "시설 완료"의 기준이 없었다. 시설일이 결과 날짜(11/10)보다 **앞선** 10/31이라 "이후에 완료됨" 같은 날짜 비교 규칙으로는 이 사례를 잡지 못한다 — 그래서 날짜 선후는 비교하지 않는다.

**수정**: 용어를 저장소 루트 `GLOSSARY.md`에 정의했다(시설일·시설 완료·시행 결과·미시설·일부완료·미완료 국소·다시 잡음·미배정 국소·제외). 규칙은 설계 §3.5 — 마커 또는 장비 기록에 시설일이 하나라도 있으면 시설 완료이고, 칸 글을 마커의 국소명·최종국소명·별칭 키와 대조해(미배정 목록과 같은 규칙) 기본 보기에서 뺀다. `lib/unscheduled-stations.ts`의 `installedDateByName`, `lib/incomplete-list.ts`의 `installedDateOf`·`countInstalled`·`selectIncomplete`(`installedDates`·`includeInstalled`), 화면의 `시설 완료된 것 포함` 체크·`시설일 MM-DD` 표시·`시설 완료 N건 숨김`. 시행 결과 자체는 바꾸지 않는다(보기에서만 판정).

**검증**: 시험 10개(시설일이 결과 날짜보다 앞서도 빠지는 실제 사례 ⑦ 포함)를 먼저 쓰고 실패를 확인한 뒤 구현했다. 시설 완료 필터를 끄면 ⑥⑦⑧⑩이, 가장 늦은 시설일 선택을 틀리게 하면 ③이 실패하는 것을 확인하고 원복했다. **Claude가 고친 것**: 머리의 `미조치` 건수가 시설 완료·제외 건까지 세어 `표시`와 어긋났다(예: 표시 3건, 미조치 11건) → 기본 보기에서 보이는 건수(다시 안 잡았고 시설 완료·제외가 아닌 건)로 바꿨다. `tsc`·`eslint` 오류 0건, `npm test` 1,969개 통과, 홈 번들 284 kB 유지.

**한계**: ① 장비 기록이 여러 개인 마커에서 **한 기록에만 시설일이 있어도** 시설 완료로 본다(미배정 목록의 규칙과 같다). 여러 장비 중 일부만 시설한 국소를 `일부완료`로 남겨 두려면 규칙을 좁혀야 한다. ② 일정 칸 글이 마커 이름과 다르면(작업명이 덧붙은 경우) 판정되지 않는다.

## 검토에서 확인·보완한 것

- **제외 키 규칙**: `normalize`가 공백·하이픈을 지우고 소문자로 바꾸므로 `국소 A`와 `국소-a`가 같은 키다. `findUnscheduledStations`는 마커의 **모든 이름 키**로 대조한다(국소명·별칭·최종국소명 각각 시험). 대조를 끄면 제외 시험이, 키 중복 제거를 끄면 행 생성 시험이 실패하는 것을 확인했다. (처음 시도한 변이는 패턴이 맞지 않아 적용되지 않은 것을 알아채고 다시 확인했다.)
- **새 세그먼트 키가 지도로 새지 않음**: `isMapSegment`에서 `partial`을 빼면 셸 시험이 실패하는 것을 확인했다. 다시 잡은 건 제외 조건을 끄면 목록 시험이 실패하는 것도 확인했다.
- **Claude가 고친 것(정렬)**: agy의 `selectIncomplete`가 같은 날짜 안에서 팀을 무시하고 행 번호로만 섞었다(설계는 "같은 날짜는 팀별로 묶고 행 순"). **테스트를 먼저 추가해 실패를 확인한 뒤** `columnOrder`(열 id → 순서, 목록에 없는 팀은 뒤로)를 받도록 고쳤고 화면이 `sortOrder` 순서를 넘긴다.
- SQL을 `03_facility_schedule.sql`의 `is_app_admin` 정책 방식과 대조했다. `ON CONFLICT DO NOTHING`이 INSERT 정책만으로 동작하고 반환(`.select("id")`)에는 SELECT 정책이 쓰인다.
- 보고서 표기 오류 하나: agy 보고서가 탭 이름을 `일일메일`로 적었으나 실제 코드의 탭 이름은 기존 `메일양식` 그대로다.

## 검증

| 명령 | 결과 |
|---|---|
| `npx tsc --noEmit` | 오류 0건 |
| `npx eslint . --max-warnings=0` | 오류 0건 |
| `npm test` | 177개 파일 통과, 1개 스킵 / 1,969개 통과, 3개 스킵, 1개 todo (이전 1,934개, 시설 완료 판정 보완 포함) |
| 임시 distDir `next build` | 성공. 홈 First Load JS **284 kB**(이전 283 kB, 프로젝트 기준선 295 kB 이하). 새 화면은 `dynamic()` 지연 로드 |

- 소스 변경: 신규 `lib/excluded-stations.ts`·`incomplete-list.ts`(+테스트), `hooks/use-excluded-stations.ts`·`use-incomplete-cells.ts`, `store/use-schedule-jump-store.ts`(+테스트), `components/schedule-exclude-dialog.tsx`·`schedule-incomplete-view.tsx`, `supabase/migrations/20261122000000_schedule_excluded_stations.sql`. 수정 `unscheduled-stations.ts`·`use-unscheduled-stations.ts`·`schedule-unscheduled-dialog.tsx`·`api.ts`·`schedule-section-switch.tsx`·`schedule-view.tsx`·`shell/types/segment.ts`·`shell/lib/nav-model.ts`·`shell/components/app-shell.tsx`(+셸 테스트).

## 한계

- **UI 연결은 자동 테스트가 없다**(`.tsx` 테스트 미지원). 위 화면 확인에 의존한다. SQL 자체도 자동 테스트가 없어(로컬 Supabase 실행 금지) 적용 후 확인 스크립트로 대신한다.
- **미완료 탭의 [제외]는 칸 글 전체(`국소·작업` 글)를 정규화한 값을 키로 쓴다.** 일정 칸 글이 마커의 국소명·최종국소명·별칭과 다르면(작업명이 덧붙은 경우 등) 미배정 목록에서는 제외가 먹히지 않을 수 있다. 그런 국소는 미배정 창에서 마커 이름으로 제외하면 확실하다.
- 제외한 국소는 미완료 탭에서도 숨겨진다(설계 결정 7). 미완료 탭에서만 다시 보이게 하는 보기는 없다.
- [다시 잡기]는 기존 시행 결과 창을 그대로 쓰므로 되돌리기가 없다(기존 동작과 같다).
- 한 번에 500건까지만 조회한다(초과하면 안내). 탭 건수 배지는 없다.
- 제외 테이블이 없는 동안 [제외]는 안내만 한다. 적용 후에는 `schedule-exclude-dialog`의 안내 분기가 쓰이지 않는다.

## 다음

화면 확인 결과를 보고, 필요하면 ① 제외 해제를 미완료 탭에서도 할 수 있게 하는 것 ② 업체(`남양`) 외 국소 관리 ③ 미완료 건수 표시를 별도 설계로 다룬다. 시설일정 고도화의 남은 단계는 S6(기간 묶음 일괄 수정, DB 필요)과 3단계(큰 편집 창 재설계)이다.
