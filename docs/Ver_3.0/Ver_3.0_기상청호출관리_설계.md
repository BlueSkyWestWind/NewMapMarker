# 기상청 API 호출 관리 — 호출 집계(1단계) · 1시간 사전 수집(2단계) (설계)

작성일 2026-11-09 · 대상: `features/worksite-weather`(기상청 호출), 계정설정의 관리자 화면

## 1. 배경 (사용자 요청, 2026-11-09)

- 기상청 API 일일 한도(공공데이터포털 개발계정 보통 10,000건/일, API 허브는 키별 승인량)를 넘기지 않아야 한다. 앞으로 여러 사용자가 접속한다.
- 오늘 몇 건 호출했는지 알 수 없다. 기상청은 "내 키의 사용량"을 돌려주는 API가 없다.
- 사용자 선택: ① 호출 횟수를 집계한다. ② 1시간 간격으로 날씨 자료를 미리 받아 DB에 저장하고, 화면은 저장된 값을 읽는다. 스케줄러는 Supabase `pg_cron` + `pg_net`.

## 2. 현재 구조 (코드에서 확인한 사실)

- 기상청으로 나가는 요청은 `kma-client.ts`의 **`fetchJson`**(단기예보·초단기실황·초단기예보·포털 특보)과 **`fetchAlertsFromHub`**(API 허브 특보 텍스트) 두 곳뿐이다.
- 캐시는 isolate 메모리(`memoryCache`)뿐이다. 사용자·isolate가 늘면 캐시가 따로 생겨 호출이 사용자 수에 비례해 늘 수 있다.
- 단기예보는 `totalCount`가 넘치면 최대 3페이지까지 받는다. 한 번의 화면 조회가 기상청 호출 4~6건이 된다.
- 서버에서 DB를 쓰는 길: `getSupabaseAdminClient()`(서비스 키, RLS 우회). 관리자 API 인증: `authenticateAdminRequest`(`/api/admin/audit/route.ts` 참고). 관리자 읽기 RLS: `public.is_app_admin()`.
- 관리자 화면 선례: 계정설정 패널에서 여는 `AccountAuditDialog`. 테이블이 없으면 `available: false`로 응답해 앱은 그대로 동작한다.
- 마커 좌표: `public.markers.lat / lng`(double precision).

## 3. 목표와 비목표

**목표**
- 기상청으로 **실제 나간** 호출을 시간대별로 세어 DB에 저장하고, 관리자 화면에서 오늘·최근 7일 사용량과 한도 대비 사용률을 본다.
- (2단계) 서버가 1시간마다 등록 마커의 기상청 격자 예보를 미리 받아 DB에 저장하고, `/api/worksite-weather`는 DB 우선·없으면 실시간 호출로 읽는다.

**비목표**
- 사용자별 호출 추적(누가 불렀는지). 격자·종류·출처(사용자/사전수집)까지만 센다.
- 기상청 쪽 실제 잔여량 조회(API 없음). 우리 서버가 센 값이다. 다른 곳에서 같은 키를 쓰면 실제 사용량과 다를 수 있음을 화면에 적는다.
- 한도 값을 DB·화면에서 편집하는 기능. 상수로 둔다.

## 4. 1단계: 호출 집계

### 4.1 데이터 — `kma_api_usage`

마이그레이션 `supabase/migrations/20261116000100_kma_api_usage.sql` (적용은 사용자가 한다. 파일명 날짜는 기존 마이그레이션보다 뒤로 맞춘다).

| 컬럼 | 설명 |
|---|---|
| `hour_kst` | timestamptz, KST 정시로 내린 시각 |
| `provider` | `apihub` / `datago` |
| `operation` | `getVilageFcst` · `getUltraSrtNcst` · `getUltraSrtFcst` · `getWthrWrnList` · `wrn_now_data` |
| `source` | `user` / `prefetch` |
| `calls` | 정수, 호출 수 |
| `errors` | 정수, 그중 실패 수 |
| `last_error` | 마지막 오류 코드(문장 아님, 키가 섞이지 않게 코드만) |

- 기본키 `(hour_kst, provider, operation, source)`.
- 증가는 DB 함수 `public.record_kma_call(p_hour, p_provider, p_operation, p_source, p_error)`가 `INSERT … ON CONFLICT DO UPDATE SET calls = calls + 1, errors = errors + …`로 한다. 동시 요청에도 값이 틀어지지 않는다.
- 함수는 서비스 키에서만 부른다(`REVOKE ALL … FROM public, anon, authenticated`).
- RLS는 `admin_audit_log`와 같다. SELECT만 관리자(`is_app_admin()`)에게 열고 쓰기 정책은 없다.
- 보존: 90일 지난 행은 정리 함수로 지운다(2단계 크론과 함께 호출하거나, 1단계에서는 SQL을 주석으로 남긴다).

### 4.2 기록 지점 — `worksite-weather/lib/kma-usage.ts`

- `recordKmaCall({ provider, operation, source, error? })`: 현재 시각의 KST 정시를 구해 `record_kma_call` RPC를 부른다.
- **실패해도 날씨 응답을 막지 않는다.** try/catch로 삼키고 `console.warn`만 남긴다. 테이블·함수가 없을 때도 같다(마이그레이션 적용 전에도 앱은 정상 동작).
- 기다리지 않는다. Cloudflare Workers에서는 `getCloudflareContext().ctx.waitUntil()`, 그 외(로컬 Node)에서는 반환 Promise를 버린다. `waitUntil`을 못 얻으면 `await` 없이 발사만 한다.
- `fetchJson`과 `fetchAlertsFromHub`에서 요청이 끝난 **직후 호출당 정확히 1회**(`finally`) 부른다. 캐시가 맞아 반환하는 경로에서는 부르지 않는다. 실패한 호출은 `error`에 코드만 채워 센다. 기상청이 오류 응답도 한 건으로 세기 때문이다.
- `source`는 호출부가 정한다. 기본 `user`, 2단계 사전 수집은 `prefetch`. `fetchJson`의 시그니처가 바뀌므로 `kma-client.ts`의 공개 함수에 선택 인자 `{ source }`를 더한다(기본값 `user`라 기존 호출부는 그대로).
- 순수 로직(KST 정시 계산, `operation` 식별)은 따로 빼서 vitest로 검증한다.

### 4.3 관리자 읽기 — `GET /api/admin/kma-usage`

- `authenticateAdminRequest`로 관리자만 허용. `force-dynamic`.
- 응답: 오늘 시간대별 24칸(`user`/`prefetch` 구분), 최근 7일 일별 합계, `dailyLimit`, `available`.
- 테이블이 없으면 `available: false`.
- 일 경계는 KST 0시. 서버에서 `hour_kst` 범위로 읽고 일별 합계는 서버에서 계산한다(순수 함수로 분리해 테스트).

### 4.4 화면 — `KmaUsageDialog`

- 위치: 계정설정 패널(`accounts-panel.tsx`)의 관리자 도구 옆에 "기상청 호출 현황" 버튼 → 다이얼로그. `AccountAuditDialog`와 같은 구성.
- 내용: 오늘 합계·한도·사용률 막대, 80% 이상이면 경고 배지, 오늘 시간대별 표, 최근 7일 표.
- 한도 상수는 `worksite-weather/constants/`에 `KMA_DAILY_LIMIT = 10000`으로 둔다. 실제 승인량은 사용자가 포털에서 확인해 알려 주면 바꾼다.
- 표 규칙: 셀 줄바꿈 금지, 가로 스크롤 금지(폭을 키운다), 세로 스크롤 허용(`table-no-wrap.mdc`).
- 화면 하단에 "서버가 센 값이며 같은 키를 다른 곳에서 쓰면 실제와 다를 수 있다"를 적는다.
- 홈 First Load JS 295 kB 기준선: 다이얼로그는 `dynamic()`으로 불러 홈 번들에 넣지 않는다.

### 4.5 오류 처리

| 상황 | 동작 |
|---|---|
| 테이블·함수 미적용 | 기록은 조용히 건너뜀, 관리자 화면은 "마이그레이션 적용 필요" 표시 |
| RPC 실패 | 날씨 응답에 영향 없음, 서버 로그만 |
| 서비스 키 미설정 | 위와 같음 |

## 5. 2단계: 07~17시 사전 수집 (확정, 2026-11-09)

### 5.1 원칙

- **수집 시각**: KST 07시~17시, 매시(하루 11회). 그 밖의 시간에는 수집하지 않는다.
- **저장된 값은 기준시각이 정확히 같을 때만 쓴다.** 화면이 실시간으로 계산하는 기준시각(`getVilageBaseForToday`·`getUltraNcstBase`·`getUltraFcstBase`)과 저장된 행의 `(base_date, base_time)`이 같아야 한다. 다르면 실시간 호출로 받고 그 값을 DB에도 채운다(write-through). 그래서 관측 시각 표시·판정 코드는 바뀌지 않는다.
- **특보(`wrn_now_data`/`getWthrWrnList`)는 이번에 사전 수집하지 않는다.** 허브는 전국 텍스트 한 건이라 호출량이 작고 지역 매칭이 응답 뒤에 일어난다. 기존 isolate 캐시 그대로 둔다(비목표).

### 5.2 대상 격자

- `public.markers`의 `lat/lng`(null 제외)를 `toGrid`로 변환하고 `isGridInKorea`인 것만 `(nx, ny)`로 중복 제거해 정렬한다. 표시되는 값이 5km 격자 단위이므로 같은 격자의 마커는 한 번만 받는다.
- 마커는 1000행씩 나눠 읽는다(PostgREST 기본 1000행 제한).

### 5.3 저장 — `kma_forecast_cache`

| 컬럼 | 설명 |
|---|---|
| `nx`, `ny` | 기상청 격자 |
| `kind` | `vilage`(단기예보) / `ncst`(초단기실황) / `ufcst`(초단기예보) |
| `base_date`, `base_time` | 기준일(YYYYMMDD)·기준시각(HHmm) |
| `payload` | jsonb, 기상청 `items` 배열 그대로 |
| `fetched_at`, `source` | 받은 시각, `prefetch` / `user` |

- 기본키 `(nx, ny, kind, base_date, base_time)`. RLS는 켜고 정책을 두지 않는다(서비스 키만 읽고 쓴다. 브라우저에서는 어떤 행도 보이지 않는다).
- 이틀이 지난 행은 매일 18시(KST)에 크론이 지운다.
- 기준시각이 바뀌면 새 행이 생기므로 옛 행은 그대로 쌓인다. 읽기는 항상 정확한 기준시각으로 찾는다.

### 5.4 실행 — 2분 간격 작은 조각

- Workers는 요청 한 번에 외부 요청 수가 제한된다(무료 50건). 격자가 많아도 안전하도록 **한 번 불릴 때 최대 8개 격자**만 받는다(최악 24 + 조회·저장 약 5건).
- `pg_cron`이 07~17시(KST) 각 시의 **0~28분 사이 2분마다** 조각 실행을 부른다. UTC로는 `0-28/2 22-23,0-8 * * *`(07시=전날 UTC 22시). 한 조각이 끝나지 못해도 다음 조각이 이어 받는다.
- 조각이 하는 일: 현재 시각의 기준시각 3종을 계산 → 이미 저장된 `(격자, kind)`를 조회 → **빠진 것이 있는 격자 최대 8개**를 골라 받아 저장. 모두 있으면 아무것도 하지 않고 돌려보낸다(멱등). 그래서 한 시간에 2분 간격으로 여러 번 불려도 기상청 호출은 늘지 않는다.
- 단기예보는 하루 대부분 같은 기준시각(05시 발표분)이라 이미 있으면 다시 받지 않는다. 그래서 매시 실제 호출은 격자당 초단기실황 1 + 초단기예보 1이다.
- 한도·인증 오류(`22`·`401`·`403`)를 만나면 그 조각을 즉시 멈춘다(격자당 재시도로 한도를 더 태우지 않는다). 그 밖의 오류는 해당 격자만 건너뛰고 다음 조각에서 다시 시도한다.
- 수집 호출은 `source=prefetch`로 1단계 집계에 잡힌다.

### 5.5 호출 경로와 보안

- `POST /api/internal/kma-prefetch`. 헤더 `x-kma-prefetch-token`을 환경 값 `KMA_PREFETCH_TOKEN`과 **상수 시간 비교**한다. 불일치·미설정이면 401. 사용자 로그인·출처 검사(`guardProxyRequest`)는 서버끼리 호출이라 쓰지 않는다.
- 07~17시(KST) 밖이면 아무것도 하지 않고 `{ skipped: "outside-window" }`.
- 토큰과 호출 주소는 Supabase `vault`에만 둔다. 크론이 부르는 SQL 함수 `public.run_kma_prefetch_slice()`가 vault에서 읽어 `net.http_post`로 부른다. 코드·마이그레이션에는 값을 쓰지 않는다. 함수는 `anon`/`authenticated`에서 실행할 수 없다.

### 5.6 읽기 — `/api/worksite-weather`

- 격자와 현재 기준시각 3종으로 **한 번의 조회**로 저장분을 찾는다. 있는 것은 그대로 쓰고, 없는 것만 실시간으로 받는다. 받은 값은 응답을 막지 않고 DB에 채운다.
- 실시간 호출은 지금처럼 isolate 캐시를 거친다. 한 시각대에서 첫 사용자가 받으면 같은 격자의 다음 사용자는 DB에서 읽는다.
- 마이그레이션 미적용·DB 오류면 지금과 똑같이 실시간으로 동작한다(기록·저장은 조용히 건너뜀).

### 5.7 운영 순서(사용자 몫)

1. `20261116000200_kma_forecast_cache.sql` 적용.
2. Cloudflare에 Secret `KMA_PREFETCH_TOKEN` 등록(`npx wrangler secret put KMA_PREFETCH_TOKEN`), 같은 값을 Supabase vault에 `kma_prefetch_token`으로 저장, 호출 주소를 `kma_prefetch_url`로 저장.
3. Supabase 대시보드에서 `pg_cron`·`pg_net` 확장 활성화.
4. `20261116000300_kma_prefetch_cron.sql` 적용(크론 등록).
5. 07시 이후 관리자 화면 "기상청 호출"에서 `사전수집` 열이 오르는지 확인.

## 6. 검증

- vitest(`.ts`만 실행됨): KST 정시 계산, 일별·시간대별 집계, 사용률 계산, (2단계) DB 우선·폴백 선택.
- `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test` · `npx next build`(홈 First Load JS 295 kB 이하). dev 서버가 떠 있으면 임시 distDir로 빌드한다(메모리 `build-with-temp-distdir`).
- Supabase는 로컬 실행 금지. 마이그레이션 SQL만 만들고 적용·`pg_cron`/`pg_net` 활성화는 사용자가 한다.
- 한글이 UTF-8로 깨지지 않았는지 확인한다.

## 7. 위험과 열린 점

- 세는 위치는 우리 서버뿐이다. 같은 키를 다른 곳에서도 쓰면 합계가 실제보다 작다.
- 호출마다 DB 쓰기가 한 번 더 생긴다. `waitUntil`로 응답을 늦추지 않는다. 2단계로 호출 자체가 줄면 부담도 준다.
- 실제 일일 한도 값을 아직 모른다(상수 10,000은 가정). 사용자가 포털에서 확인해 알려 주면 반영한다.
- 크론 호출 경로가 공개 URL이므로 토큰 검증(상수 시간 비교)이 유일한 방어선이다. 토큰이 유출되면 즉시 교체한다.
- 격자가 1000개를 넘거나 마커가 매우 많아지면 조각 수가 부족할 수 있다. 조각당 격자 수·간격은 상수로 두고 1단계 집계를 보며 조정한다.
- 저장 용량: 단기예보 행이 격자당 수십~백 KB다. 이틀 보관으로 제한하고 용량은 Supabase 대시보드에서 확인한다.

## 8. 구현 상태 (2026-11-09)

**1단계(호출 집계)와 2단계(사전 수집) 코드 구현 완료.** 검증: `tsc`·`eslint --max-warnings=0`·`vitest`(1364개)·`next build` 통과, 홈 First Load JS 297 kB(1단계 이전과 동일, 늘지 않음).

| 구분 | 파일 |
|---|---|
| 마이그레이션 | `20261116000100_kma_api_usage.sql`(집계) · `20261116000200_kma_forecast_cache.sql`(저장소) · `20261116000300_kma_prefetch_cron.sql`(크론) |
| 계획·집계 | `worksite-weather/lib/kma-prefetch-plan.ts` · `kma-usage-stats.ts` · `kma-usage.ts` · `keep-alive.ts` |
| 저장·읽기 | `lib/kma-forecast-store.ts` · `kma-forecast-source.ts`(`loadForecastItems`, `/api/worksite-weather`가 사용) |
| 수집 | `lib/kma-prefetch.ts`(`runPrefetchSlice`) · `app/api/internal/kma-prefetch/route.ts` |
| 관리자 화면 | `accounts/components/kma-usage-dialog.tsx` · `app/api/admin/kma-usage/route.ts` |

**구현 중 정한 것**
- 조각 시각(분/2)으로 시작 위치를 돌린다. 계속 실패하는 격자가 앞 8칸을 차지해 다른 격자를 굶기지 않게 하려는 것이다.
- 빈 응답(`[]`)은 저장하지 않는다. 한 시간 내내 "자료 없음"을 진실로 두지 않기 위해서다.
- `waitUntil` 처리를 `keep-alive.ts`로 빼 집계 기록기와 저장소가 함께 쓴다.
- `KmaError.code`를 본문 오류(한도 22, 인증 30~32, 허브 401·403)에도 채워 수집 조각이 한도·인증 오류에서 멈춘다.

**사용자에게 남은 일(운영 순서)**
1. `20261116000200_kma_forecast_cache.sql` 적용.
2. 임의의 긴 토큰을 만들어 Cloudflare Secret `KMA_PREFETCH_TOKEN`(`npx wrangler secret put KMA_PREFETCH_TOKEN`)과 Supabase vault `kma_prefetch_token`에 같은 값으로 저장. 호출 주소(`https://배포주소/api/internal/kma-prefetch`)를 vault `kma_prefetch_url`에 저장. 재배포.
3. Supabase 대시보드에서 `pg_cron`·`pg_net` 확장 활성화.
4. `20261116000300_kma_prefetch_cron.sql` 적용.
5. 07시 이후 계정설정 > "기상청 호출" 창에서 `사전수집` 열이 오르는지, `net._http_response`에 200이 쌓이는지 확인.

**코드로 확인하지 못한 것**: 실제 크론 동작, Workers 외부 요청 제한(무료 50건)에 대한 조각 크기의 여유, Supabase SQL(마이그레이션은 실행하지 않음).
