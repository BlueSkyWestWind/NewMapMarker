# 정확성 보강 (구현)

구현일 2026-11-15 · 설계: [Ver_3.0_정확성보강_설계.md](Ver_3.0_정확성보강_설계.md) · 계획: [Ver_3.0_정확성보강_구현계획.md](Ver_3.0_정확성보강_구현계획.md)

오래된 비동기 응답이 최신 상태를 덮는 두 곳, UTC 기준 날짜 11곳, `kakao-static-map` 입력 검증, `survey_settings` 트리거 함수의 `search_path`를 고쳤다. **키 폴백(`NEXT_PUBLIC_KAKAO_REST_API_KEY`) 제거는 하지 않았다**(아래). 구현은 agy가 하고 Claude가 diff를 검토했으며, 검토에서 agy 변경이 만든 결함 1건을 고쳤다.

## 직접 하실 일

1. **새 마이그레이션 SQL을 적용한다.** Supabase 대시보드 → SQL Editor에서 `supabase/migrations/20261120000000_survey_settings_search_path.sql`의 한 줄을 실행한다: `ALTER FUNCTION public.touch_survey_settings_updated_at() SET search_path = '';` (현장실사서 설정을 저장하면 `updated_at`이 계속 갱신되는지 한 번 확인하면 충분하다.)
2. **화면 확인**
   - 마커 상세 창에서 목록의 국소를 빠르게 연달아 눌러 본다. GPS 정보(좌표·건축물대장)와 연관 상세 장비 표가 **지금 보는 국소의 것**으로만 나오고 섞이지 않는지.
   - 조회가 끝나기 전에 상세 창을 닫았다가 다른 마커(축전지 마커 포함)를 열어 "상세 정보를 로드하는 중…"이 남지 않는지.
   - 한국 시간 오전 9시 전에(또는 PC 시간을 바꿔) 일정 선택기를 열었을 때 오늘 날짜의 달로 열리는지. 엑셀 백업 내보내기 파일 이름의 날짜가 오늘인지.
3. **환경 변수 확인(폴백 제거 여부 판단).** `.env`·Cloudflare 변수에 `NEXT_PUBLIC_KAKAO_REST_API_KEY`를 설정해 두었는지 알려 달라. 없으면 `kakao-static-map`의 폴백(`route.ts` 56~57줄)을 지우는 것이 안전하다. 설정돼 있으면 `KAKAO_REST_API_KEY`로 옮긴 뒤에 지운다. 비밀값이라 Claude가 `.env`를 열지 않았다.
4. 이상이 없으면 "커밋"이라고 말씀해 주세요.

## 한 일

| 설계 | 내용 |
|---|---|
| 결정 3 | `src/lib/latest-request.ts`(`createLatestRequest`)를 만들고 테스트 4개로 고정했다. `use-marker-gps-info.ts`(캐시에 없을 때만 티켓 발급, 마커·모달이 바뀌거나 언마운트되면 무효화)와 `marker-detail-modal.tsx`의 `fetchDetail`(응답 뒤 상태 갱신을 티켓으로 가드, effect cleanup에서 무효화, 의존성 배열 불변)에 적용했다 |
| 결정 4 | `src/lib/local-date.ts`(`localDateIso`, 로컬 달력 기준)를 만들었다. `schedule/lib/week.ts`의 `todayIso`는 이를 부르는 한 줄로 바꿨고(export 이름 유지), UTC 날짜 11곳을 교체했다. 교체 뒤 `toISOString().slice/split` 날짜 패턴이 테스트 외 코드에 0건이다 |
| 결정 5(축소) | `kakao-static-map/params.ts`의 `parseStaticMapParams`로 `level`·`width`·`height`를 검증한다(숫자가 아니면 기본값 3·600·400, 크기 상한·짝수 규칙은 그대로). `route.ts`는 이를 쓴다. **키 폴백 제거는 보류** |
| 결정 6 | `supabase/migrations/20261120000000_survey_settings_search_path.sql` 새 파일(기존 파일은 수정 안 함) |
| 결정 7 | README 구조 트리에 `features/site-survey/` 추가, 마이그레이션 개수 문구(12 → 13)와 `supabase/migrations/README.md` 표·실행 순서에 새 파일 추가 |

## 검토에서 고친 것

- **모달 조회가 무효화되면 로딩 표시가 남을 수 있었다.** agy가 `fetchDetail`의 `finally`에서 `setIsLoading(false)`를 티켓이 유효할 때만 부르게 했다. 조회 중 모달을 닫으면(또는 마커가 바뀌어 effect가 조기 반환 분기 — `mode !== 'equipment'` 등 — 로 빠지면) 이전 조회가 무효화돼 로딩을 끄는 쪽이 사라지고, 조기 반환 분기는 로딩을 되돌리지 않아 `isLoading`이 `true`로 남는다. 그 상태로 축전지 마커를 열면 표가 "상세 정보를 로드하는 중…"에 멈춘다. 조기 반환 분기에서 `setIsLoading(false)`를 부르게 고쳤다. GPS 훅은 `resetKey` effect가 같은 시점에 상태를 비우므로 해당 없음.
- 이 경로는 훅·컴포넌트 렌더 테스트가 없어 자동으로 지킬 수 없다(위 화면 확인 2번째 항목).

## 결정 보류

- **`NEXT_PUBLIC_KAKAO_REST_API_KEY` 폴백 제거**: 사용자 환경에서 그 변수를 쓰는지 모르므로 하지 않았다. 지우려면 위 "직접 하실 일" 3번의 확인이 먼저다.

## 검증

| 명령 | 결과 |
|---|---|
| `npx tsc --noEmit` | 오류 0건 |
| `npx eslint . --max-warnings=0` | 오류 0건 |
| `npm test` | 157개 파일 통과, 1개 스킵 / 1,812개 통과, 3개 스킵 |

- 새 테스트 3개 파일(`latest-request` 4개, `local-date` 2개, `kakao-static-map/params` 6개)은 모듈이 없을 때 실패하는 것을 먼저 확인한 뒤 구현했다.
- **변이 확인**: Claude가 `localDateIso`를 `toISOString().slice(0, 10)`으로 임시로 바꾸자 테스트가 `expected '2026-11-14' to be '2026-11-15'`로 실패했고, 원복 뒤 통과했다. 테스트 파일이 `process.env.TZ = "Asia/Seoul"`을 고정하므로 PC 시간대와 무관하다.

## 한계

- 취소 가드는 두 곳에만 적용했다. 다른 비동기 조회에도 같은 경쟁이 있을 수 있다(점검 대상으로 남음).
- 훅·모달의 연결(티켓 발급·무효화 위치)은 자동 테스트가 없다. 규칙(`latest-request`)만 테스트로 지킨다.
- `kakao-static-map` 라우트는 여전히 라우트 단위 테스트가 없다(`params.ts`만 테스트).
- 새 마이그레이션은 적용 전이다. 적용하지 않아도 앱 동작에는 영향이 없다(일관성 정리).
