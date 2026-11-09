# Ver 3.0 기상청 API 호출 관리 구현

근거: `Ver_3.0_계획.md` 17장, `Ver_3.0_기상청호출관리_설계.md`, `Ver_3.0_기상청호출관리_구현계획.md`(1단계), `Ver_3.0_기상청호출관리_2단계_구현계획.md`.
상태: **1단계(호출 집계·관리자 화면)와 2단계(07~17시 사전 수집) 코드 구현 완료** (2026-11-09). 마이그레이션 적용과 크론 등록은 사용자 몫이다(§4).

---

## 1. 목적

기상청 API 일일 호출 한도를 넘기지 않도록 ① 실제 나간 호출을 시간대별로 세어 관리자가 보고, ② 07~17시에 서버가 예보를 미리 받아 저장해 사용자 수와 무관하게 호출이 늘지 않게 한다.

---

## 2. 1단계: 호출 집계

### 2.1 DB — `20261116000100_kma_api_usage.sql`
- 테이블 `kma_api_usage`: `hour_kst`(KST 정시) · `provider`(`apihub`/`datago`) · `operation` · `source`(`user`/`prefetch`) · `calls` · `errors` · `last_error`. 기본키 `(hour_kst, provider, operation, source)`. (`updated_at` 컬럼은 없다.)
- 함수 `public.record_kma_call(p_hour, p_provider, p_operation, p_source, p_error)` — `INSERT … ON CONFLICT DO UPDATE`로 호출당 +1. `SECURITY DEFINER`, `search_path` 고정, `anon`/`authenticated` 실행 권한 회수(서비스 키만).
- RLS: SELECT는 관리자(`is_app_admin()`)만. 쓰기 정책 없음.

### 2.2 코드 (`features/worksite-weather`)
| 파일 | 역할 |
|---|---|
| `constants/kma-usage.ts` | `KMA_DAILY_LIMIT = 10000`(가정값) · `KMA_WARN_RATIO = 0.8` |
| `lib/kma-usage-stats.ts` | 순수 함수: `kstHourStartIso` · `kstDateKey` · `buildTodayHours`(24칸) · `buildDailyTotals`(최근 7일) · `usageRatio` · `isOverWarn` · `buildUsageReport` |
| `lib/kma-usage.ts` | `recordKmaCall` — RPC를 쏘고 기다리지 않는다. 실패(미적용·키 없음·DB 장애)는 삼키고 로그만 남긴다. |
| `lib/keep-alive.ts` | Workers에서는 `ctx.waitUntil`, 그 밖에서는 아무 일도 하지 않음 |
| `lib/kma-client.ts` | `trackCall`이 **실제 요청 직후 호출당 정확히 1회** 집계. 캐시 적중은 세지 않음. `KmaError.code`(`401`·`403`·`timeout`·`22` 등 코드만)를 실패로 기록. 공개 함수에 `{ source }` 선택 인자(기본 `user`). |

### 2.3 관리자 화면
- `GET /api/admin/kma-usage`(`authenticateAdminRequest`): 오늘 시간대별 24칸, 최근 7일, 한도·사용률. 테이블이 없으면 `{ available: false }`.
- 계정설정의 "기상청 호출" 버튼 → `KmaUsageDialog`(`dynamic()` 지연 로딩). 오늘 합계·한도·사용률 막대(80% 이상 "한도 임박", 100% 이상 "한도 초과"), 시간대별 표, 최근 7일 표. 표는 줄바꿈 금지·가로 스크롤 없음.

---

## 3. 2단계: 07~17시 사전 수집

### 3.1 DB
- `20261116000200_kma_forecast_cache.sql` — `kma_forecast_cache(nx, ny, kind, base_date, base_time, payload jsonb, fetched_at, source)`. `kind`는 `vilage`/`ncst`/`ufcst`. RLS만 켜고 **정책 없음**(서비스 키 전용).
- `20261116000300_kma_prefetch_cron.sql` — vault에서 토큰·주소를 읽어 `net.http_post`로 수집 라우트를 부르는 `public.run_kma_prefetch_slice()`, 크론 `kma-prefetch`(`0-28/2 22-23,0-8 * * *` = KST 07~17시의 0~28분 2분마다), 정리 크론 `kma-prefetch-cleanup`(매일 18시 KST, 이틀 지난 행 삭제).

### 3.2 코드
| 파일 | 역할 |
|---|---|
| `constants/kma-prefetch.ts` | `PREFETCH_FIRST_HOUR=7` · `PREFETCH_LAST_HOUR=17` · `GRIDS_PER_SLICE=8` |
| `lib/kma-prefetch-plan.ts` | 순수 함수: `currentBases` · `isPrefetchWindow` · `uniqueGrids` · `pickGridsToFetch` · `isPrefetchTokenValid`(상수 시간 비교) |
| `lib/kma-forecast-store.ts` | `readStoredForecast`(한 번의 조회, 실패 시 빈 결과) · `listStoredKeys`(실패 시 던짐) · `saveForecast` · `saveForecastInBackground` |
| `lib/kma-forecast-source.ts` | `loadForecastItems` — 저장분 우선, 빠진 것만 실시간 + 채우기. `/api/worksite-weather`가 사용 |
| `lib/kma-prefetch.ts` | `runPrefetchSlice`(멱등 조각) · `defaultSliceDeps` |
| `app/api/internal/kma-prefetch/route.ts` | `POST`. `x-kma-prefetch-token` 검사, 맞지 않거나 `KMA_PREFETCH_TOKEN` 미설정이면 401 |

### 3.3 동작 규칙
- 저장분은 **기준시각이 지금 계산한 것과 정확히 같을 때만** 쓴다(관측 시각 표시가 어긋나지 않음). 다르면 실시간으로 받고 DB에 채운다.
- 한 조각은 빠진 격자 최대 8개만 받는다. 이미 저장된 것은 받지 않는다(멱등). 단기예보는 하루 대부분 같은 기준시각이라 매시 실제 호출은 격자당 2건(초단기실황·초단기예보).
- 한도(`22`)·인증(`401`·`403`) 오류에서는 조각을 즉시 멈춘다. 저장 목록을 읽지 못하면 전부 다시 받지 않고 중단한다.
- 조각 시각(분÷2)으로 시작 위치를 돌려 계속 실패하는 격자가 다른 격자를 굶기지 않게 한다.
- 빈 응답은 저장하지 않는다. 특보는 사전 수집하지 않고 지금처럼 실시간이다.
- `KmaError.code`가 본문 오류(한도 22, 인증 30~32, 허브 401·403)에도 채워진다.

---

## 4. 사용자에게 남은 일

1. `20261116000100_kma_api_usage.sql`, `20261116000200_kma_forecast_cache.sql` 적용(1단계는 적용 완료).
2. 임의의 긴 토큰을 만들어 Cloudflare Secret `KMA_PREFETCH_TOKEN`과 Supabase vault `kma_prefetch_token`에 같은 값으로 저장, vault `kma_prefetch_url`에 `https://배포주소/api/internal/kma-prefetch` 저장, 재배포.
3. Supabase에서 `pg_cron`·`pg_net` 확장 활성화.
4. `20261116000300_kma_prefetch_cron.sql` 적용.
5. 07시 이후 "기상청 호출" 창에서 `사전수집` 열이 오르는지, `net._http_response`에 200이 쌓이는지 확인.

---

## 5. 검증 결과 (2026-11-09)

- `npx tsc --noEmit` · `npx eslint . --max-warnings=0` 통과.
- `npm test`: 123개 파일, 1,364개 테스트 통과.
- `npx next build` 성공. 홈 First Load JS **297 kB** — 1단계 이전 코드로 빌드해도 같은 값이라 이번 변경이 늘린 것이 아니다(295 kB 기준선은 이미 넘어 있었음).
- 코드로 확인하지 못한 것: 실제 크론 동작, Workers 외부 요청 제한(무료 50건)에 대한 조각 크기의 여유, SQL 실행(Supabase는 로컬 실행 금지).
