# 기상청 API 호출 관리 (통합 문서)

작성일: 2026-11-09 · 개정: 2026-11-13
대상: `features/worksite-weather`, `features/dashboard`, `features/accounts`, 관리자 API

기상청 API(공공데이터포털 · API 허브)의 일일 호출 한도 초과를 막고 사용량을 파악하기 위한 호출 집계(1단계), 07~17시 KST 매시 자동 사전 수집(2단계), 그리고 대시보드가 저장된 최신 값만 표시하고 사용자가 원할 때만 수동 갱신하는 저장분 전용 표시·수동 갱신(3단계)의 설계·구현 계획·구현 결과를 하나로 모은 문서이다.

| 단계 | 내용 | 현재 상태 (2026-11-13 기준) |
|---|---|---|
| 1단계 | 호출 집계 (`kma_api_usage`) · 관리자 현황 창 | 코드 구현 완료 · 운영 DB 적용 완료 |
| 2단계 | 07~17시 KST 매시 자동 수집 (`kma_forecast_cache` · 크론) | 코드 구현 완료 · 운영 설정(vault · `pg_net`) 미완 |
| 3단계 | 저장분 우선 표시 · `[현재 데이터로 갱신]` 버튼 | 코드 구현 완료 (2026-11-13), 마이그레이션 적용·화면 확인 대기 |

---

## 직접 하실 일

2026-11-13 운영 DB 읽기 전용 조회에서 **자동 수집이 한 번도 돌지 않았다**는 사실을 확인하였다. `kma_forecast_cache`의 215행(격자 19개)이 전부 `source = user`이고 `prefetch`는 0행이며, `vault`에 `kma_prefetch_token` · `kma_prefetch_url`이 없고 `net._http_response`가 비어 있다. 크론(`kma-prefetch`)은 3일간 498번 실행됐으나 토큰·주소가 없어 실제 HTTP 요청을 보내지 않고 조용히 반환하였다.

사용자가 직접 수행할 운영 작업 순서는 다음과 같다.

1. **1·2단계 마이그레이션 적용 확인:** `supabase/migrations/20261116000100_kma_api_usage.sql`, `supabase/migrations/20261116000200_kma_forecast_cache.sql`, `supabase/migrations/20261116000300_kma_prefetch_cron.sql`이 운영 DB에 적용됐는지 확인하고 미적용 항목이 있으면 적용한다(2026-11-13 조회 기준 테이블과 크론은 존재한다).
2. **토큰 · URL 비밀 등록 및 재배포:** 임의의 긴 토큰을 생성해 Cloudflare Secret `KMA_PREFETCH_TOKEN`(`npx wrangler secret put KMA_PREFETCH_TOKEN`)과 Supabase Vault `kma_prefetch_token`에 같은 값으로 저장한다. 호출 경로(`/api/internal/kma-prefetch`의 전체 배포 URL)를 Supabase Vault `kma_prefetch_url`에 저장한 뒤 재배포한다.
3. **Supabase 확장 활성화:** Supabase 대시보드에서 `pg_cron` · `pg_net` 확장을 활성화한다.
4. **크론 재적용 확인:** 2단계 크론 마이그레이션 `20261116000300_kma_prefetch_cron.sql` 적용 상태를 확인한다(vault 값이 준비된 뒤 `kma-prefetch` 크론이 `net.http_post`를 호출한다).
5. **3단계 마이그레이션 적용:** `supabase/migrations/20261118000000_kma_manual_source.sql`을 Supabase SQL Editor에서 적용해 `kma_forecast_cache` · `kma_api_usage`의 `source` CHECK 제약에 `'manual'`을 추가한다(적용 전에는 수동 갱신 예보가 `user` 출처로 폴백 저장되고 호출 집계의 `manual` 기록만 반영되지 않는다).
6. **확인 SQL 및 화면 점검:** 07시(KST) 이후 아래 읽기 전용 SQL과 관리자 화면으로 자동 수집 동작을 확인한다.
   - `SELECT source, count(*), max(fetched_at) FROM public.kma_forecast_cache GROUP BY source;` (`prefetch` 행 생성 확인)
   - `SELECT kind, count(*), max(fetched_at) FROM public.kma_forecast_cache GROUP BY kind;`
   - `net._http_response`에 상태 코드 `200` 응답이 쌓이는지 확인한다.
   - 계정설정 > "기상청 호출" 창에서 `사전수집` 열이 증가하는지 확인한다.
   - 로그인 후 대시보드에서 각 국소의 수집 시각 표시, `[현재 데이터로 갱신]` 버튼 동작, 5분 이내 재호출 시 건너뜀 안내를 확인한다.

---

## 1. 배경과 요청

- **최초 요청 (2026-11-09):** 기상청 API 일일 한도(공공데이터포털 개발계정 보통 10,000건/일, API 허브는 키별 승인량)를 넘기지 않아야 한다. 향후 여러 사용자가 동시에 접속해도 호출이 사용자 수에 비례해 늘지 않도록 해야 하며, 기상청은 "내 키의 사용량"을 돌려주는 API가 없어 오늘 몇 건 호출했는지 알 수 없다. 사용자가 선택한 방향은 ① 실제 호출 횟수 집계와 ② 1시간 간격 사전 수집 후 DB 저장 · 조회(스케줄러는 Supabase `pg_cron` + `pg_net`)이다.
- **추가 요청 (2026-11-13):** 2단계의 "기준시각이 정확히 같을 때만 저장분을 쓰고 없으면 사용자 조회 시점에 실시간으로 받아 채운다"는 규칙은 대시보드를 열 때마다 기상청을 부를 수 있다. 이에 따라 ① 서버가 매시간 자동으로 받아 저장하고, ② 화면은 저장된 값을 기상정보로 보여 주며(열 때마다 부르지 않음), ③ `[현재 데이터로 갱신]` 버튼을 눌렀을 때만 기상청에서 지금 값을 받아 보여 주고 저장하도록 동작을 변경한다.

---

## 2. 확인한 사실

### 2.1 코드 구조에서 확인한 사실

- 기상청으로 나가는 외부 요청은 `src/features/worksite-weather/lib/kma-client.ts`의 **`fetchJson`**(단기예보 · 초단기실황 · 초단기예보 · 포털 특보)과 **`fetchAlertsFromHub`**(API 허브 특보 텍스트) 두 곳뿐이다.
- 기존 캐시는 isolate 메모리(`memoryCache`)뿐이어서 사용자 · isolate가 늘면 캐시가 따로 생겨 호출이 사용자 수에 비례해 증가할 수 있었다.
- 단기예보는 `totalCount`가 넘치면 최대 3페이지까지 받으므로 한 번의 화면 조회가 기상청 호출 4~6건이 된다.
- 서버 DB 접근은 `getSupabaseAdminClient()`(서비스 키, RLS 우회), 관리자 API 인증은 `authenticateAdminRequest`(`/api/admin/audit/route.ts` 선례), 관리자 읽기 RLS는 `public.is_app_admin()`을 사용한다.
- 관리자 화면 선례는 계정설정 패널에서 여는 `AccountAuditDialog`이며, 테이블이 없으면 `available: false`로 응답해 앱 동작을 막지 않는다.
- 마커 좌표는 `public.markers.lat / lng`(double precision)이다.

### 2.2 운영 DB 읽기 전용 조회 결과 (2026-11-13)

| 확인 항목 | 조회 결과 |
|---|---|
| `kma_forecast_cache` | 215행, 격자 19개, 전부 `source = user` (`prefetch` 0행) |
| `kma_api_usage` 최근 3일 | `user`만 기록(11-11 324건, 11-12 194건, 11-13 149건), 사전수집 0건 |
| 크론 `kma-prefetch` | 등록됨, 3일간 498회 실행(상태 성공) |
| `net._http_response` | 비어 있음 (수집 호출이 한 번도 나가지 않음) |
| vault `kma_prefetch_token` · `kma_prefetch_url` | 없음 |
| 마커 수 / 대략 격자 수 | 1,071개 / 약 135개 |

크론은 돌지만 vault에 토큰 · 주소가 없어 `run_kma_prefetch_slice()`가 아무것도 부르지 않고 종료한다. 현재 화면의 값은 사용자가 열 때마다 받아 채운 결과이다.

---

## 3. 최종 동작 (목표 상태)

- **호출 집계:** 기상청으로 실제 나간 외부 요청을 KST 정시(`hour_kst`), 제공자(`provider`), 오퍼레이션(`operation`), 출처(`user` / `prefetch` / `manual`)별로 `kma_api_usage`에 세고, 관리자 화면("기상청 호출" 다이얼로그)에서 오늘 시간대별 · 최근 7일 합계와 한도 대비 사용률을 확인한다.
- **자동 수집:** Supabase `pg_cron` + `pg_net`이 KST 07~17시 매시 0~28분 사이 2분 간격으로 `POST /api/internal/kma-prefetch`를 호출해 등록 마커의 고유 격자 예보(`vilage`, `ncst`, `ufcst`)를 최대 8개 격자씩 나눠 받아 `kma_forecast_cache`에 저장한다. 07~17시 밖에는 수집하지 않는다.
- **저장분 우선 표시 (열 때 기상청 호출 없음):** `GET /api/worksite-weather`는 기상청 예보를 부르지 않고 `kma_forecast_cache`에서 격자별 최신 저장분(`base_date` · `base_time` 내림차순 1행)만 읽는다. 기준시각이 지금 계산한 시각과 달라도 저장분을 사용하며, 저장분이 없으면 자동으로 부르지 않고 "저장된 자료 없음"과 갱신 버튼 안내를 표시한다.
- **수동 갱신:** 대시보드의 `[현재 데이터로 갱신]` 버튼은 로그인한 모든 사용자가 누를 수 있다. 클라이언트가 격자 중복 제거 후 요청당 최대 5개 격자씩 나눠 `POST /api/worksite-weather/refresh`로 보내고, 서버는 같은 격자의 최신 저장분이 5분 안에 있으면 건너뛰며(`recent`), 오래됐거나 없으면 지금 기준시각 3종을 실시간(`source: "manual"`, `fresh: true`)으로 받아 화면에 보여 주고 `source = manual`로 저장한다.
- **특보 실시간 유지:** 기상특보(`wrn_now_data` / `getWthrWrnList`)는 안전 판정에 쓰이고 전국 단건 텍스트라 호출량이 작으므로 기존 실시간 조회(isolate 캐시 10분)를 유지한다. 수동 갱신 버튼 실행 시 특보 캐시도 새로 받는다(`fresh: true`).

---

## 4. 결정 사항 표

| 날짜 | 항목 | 결정 내용 |
|---|---|---|
| 2026-11-09 | 집계 범위 | 사용자별 추적은 하지 않고 격자 · 종류 · 출처(`user`/`prefetch`)까지만 센다 |
| 2026-11-09 | 일일 한도 기준 | 상수 `KMA_DAILY_LIMIT = 10000`을 기본값으로 두고 DB · UI 편집 기능은 두지 않는다 |
| 2026-11-09 | 자동 수집 방식 | Supabase `pg_cron` + `pg_net`으로 2분마다 최대 8개 격자 멱등 조각 수집 |
| 2026-11-09 | 특보 사전 수집 | 비목표로 제외하고 기존 실시간 + isolate 캐시를 유지한다 |
| 2026-11-13 | 1. 자동 수집 시간대 | **KST 07~17시 매시 유지** (24시간 시 약 8,600건/일=86%, 07~17시는 약 3,300건/일=33%). 밖의 시간에는 마지막 저장분과 "17:00 기준"을 표시한다 |
| 2026-11-13 | 2. 화면 읽기 규칙 | **격자별 최신 저장분만** 읽는다. 기준시각이 현재 계산과 달라도 쓰며, 저장분 미존재 격자는 자동 호출하지 않고 "저장된 자료 없음"을 안내한다 |
| 2026-11-13 | 3. 수동 갱신 범위·제한 | 로그인한 모든 사용자가 대시보드 전체 작업 국소 갱신 가능. 서버가 **같은 격자 5분 제한** 적용, 요청당 최대 5개 격자씩 클라이언트가 분할 전송한다 |
| 2026-11-13 | 4. 특보 갱신 | 특보는 실시간 유지하며, 수동 갱신 버튼 실행 시 특보 캐시도 새로 받는다 |
| 2026-11-13 | 5. 계획서 · 정정 | 구현은 `Ver_3.0_기상청호출관리_3단계_구현계획.md`로 진행하고, 1단계 계획서의 Task 2.4는 정정한다 |

---

## 5. 설계 상세

### 5.1 1단계: 호출 집계

#### 데이터 — `kma_api_usage`

마이그레이션: `supabase/migrations/20261116000100_kma_api_usage.sql`

| 컬럼 | 타입 · 설명 |
|---|---|
| `hour_kst` | `timestamptz`, KST 정시로 내린 시각 |
| `provider` | `text`, `apihub` / `datago` |
| `operation` | `text`, `getVilageFcst` · `getUltraSrtNcst` · `getUltraSrtFcst` · `getWthrWrnList` · `wrn_now_data` |
| `source` | `text`, `user` / `prefetch` (3단계 마이그레이션으로 `manual` 추가) |
| `calls` | 정수, 호출 수 |
| `errors` | 정수, 그중 실패 수 |
| `last_error` | 마지막 오류 코드(키가 섞이지 않게 코드만 저장, 문장 아님) |

- 기본키: `(hour_kst, provider, operation, source)`.
- 증가는 DB 함수 `public.record_kma_call(p_hour, p_provider, p_operation, p_source, p_error)`가 `INSERT … ON CONFLICT DO UPDATE SET calls = calls + 1, errors = errors + …`로 수행해 동시 요청에도 값이 틀어지지 않는다.
- 함수 실행 권한: 서비스 키에서만 부른다(`REVOKE ALL … FROM public, anon, authenticated`).
- RLS: `admin_audit_log`와 동일하게 SELECT만 관리자(`is_app_admin()`)에게 열고 쓰기 정책은 두지 않는다.
- 보존: 90일 지난 행은 정리 대상으로 관리한다(1단계에서는 정리 SQL 주석, 2단계 이후 정리 가능).

#### 기록 지점 — `worksite-weather/lib/kma-usage.ts`

- `recordKmaCall({ provider, operation, source, error? })`: 현재 시각의 KST 정시를 구해 `record_kma_call` RPC를 부른다.
- **실패해도 날씨 응답을 막지 않는다:** `try/catch`로 삼키고 `console.warn`만 남긴다. 테이블 · 함수가 없을 때도 동일하다(마이그레이션 적용 전에도 앱 정상 동작).
- **비동기 발사:** 기다리지 않는다. Cloudflare Workers에서는 `getCloudflareContext().ctx.waitUntil()`(`keep-alive.ts`로 분리), 그 외 로컬 Node에서는 `await` 없이 발사만 한다.
- `fetchJson`과 `fetchAlertsFromHub`에서 요청이 끝난 **직후 호출당 정확히 1회**(`finally`) 부른다. 캐시 적중 반환 경로에서는 부르지 않는다. 실패한 호출은 기상청이 오류 응답도 1건으로 세므로 `error`에 코드만 채워 집계한다.
- `source`는 호출부가 지정한다(기본 `user`, 사전 수집 `prefetch`, 3단계 수동 갱신 `manual`).

#### 관리자 API — `GET /api/admin/kma-usage`

- `authenticateAdminRequest`로 관리자만 허용한다(`force-dynamic`).
- 응답: 오늘 시간대별 24칸(`user` / `prefetch` 구분, 3단계에서 `manual` 추가), 최근 7일 일별 합계, `dailyLimit`, `available`.
- 테이블이 없으면 `available: false`를 반환한다.
- 일 경계는 KST 0시이며, 일별 합계 · 시간대별 슬롯 가공은 서버 순수 함수(`kma-usage-stats.ts`)로 분리해 단위 테스트한다.

#### 화면 — `KmaUsageDialog`

- 위치: 계정설정 패널(`accounts-panel.tsx`) 관리자 도구 옆 "기상청 호출" 버튼 → 다이얼로그(`AccountAuditDialog`와 같은 구성).
- 내용: 오늘 합계 · 한도(`KMA_DAILY_LIMIT = 10000`, `KMA_WARN_RATIO = 0.8`) · 사용률 막대(80% 이상 "한도 임박", 100% 이상 "한도 초과" 경고 배지), 오늘 시간대별 표, 최근 7일 표.
- 표 규칙: 셀 줄바꿈 금지, 가로 스크롤 금지(다이얼로그 폭을 키움), 세로 스크롤 허용(`table-no-wrap.mdc`).
- 하단 안내: 서버가 센 값이며 같은 키를 다른 곳에서 쓰면 실제와 다를 수 있음을 적는다.
- 홈 First Load JS 번들 유지를 위해 `dynamic()`으로 지연 로딩한다.

#### 오류 처리

| 상황 | 동작 |
|---|---|
| 테이블 · 함수 미적용 | 기록은 조용히 건너뜀, 관리자 화면은 "마이그레이션 적용 필요" 표시 |
| RPC 실패 | 날씨 응답에 영향 없음, 서버 로그만 기록 |
| 서비스 키 미설정 | 위와 동일 |

---

### 5.2 2단계: 자동 수집 (07~17시 KST)

#### 원칙

- **수집 시각:** KST 07시~17시 매시(하루 11회). 그 밖의 시간에는 수집하지 않는다.
- **읽기 규칙 (3단계에서 대체됨):** 원래 2단계에서는 "저장분은 기준시각이 정확히 같을 때만 쓰고 없으면 실시간 폴백·채우기"로 설계·구현됐으나(1단계 계획서 Task 2.4 정정 포함), 2026-11-13 결정에 따라 §5.3(설계 §9.4)의 "격자별 최신 저장분만 읽기, 열 때 실시간 호출 안 함" 규칙으로 대체된다.
- **특보 제외:** 특보(`wrn_now_data` / `getWthrWrnList`)는 사전 수집하지 않고 기존 실시간 + isolate 캐시를 유지한다.

#### 대상 격자

- `public.markers`의 `lat / lng`(null 제외)를 1,000행씩 나눠 읽은 뒤(PostgREST 기본 1,000행 제한) `toGrid`로 변환하고 `isGridInKorea`인 것만 `(nx, ny)`로 중복 제거 · 정렬한다.

#### 저장 — `kma_forecast_cache`

| 컬럼 | 설명 |
|---|---|
| `nx`, `ny` | 기상청 격자 좌표 |
| `kind` | `vilage`(단기예보) / `ncst`(초단기실황) / `ufcst`(초단기예보) |
| `base_date`, `base_time` | 기준일(`YYYYMMDD`) · 기준시각(`HHmm`) |
| `payload` | `jsonb`, 기상청 `items` 배열 그대로 |
| `fetched_at`, `source` | 받은 시각, `prefetch` / `user` (3단계에서 `manual` 추가) |

- 기본키: `(nx, ny, kind, base_date, base_time)`. RLS를 켜고 정책을 두지 않는다(서비스 키 전용).
- 정리: 이틀 지난 행은 매일 18시 KST(UTC 09:00)에 `kma-prefetch-cleanup` 크론이 삭제한다.
- 빈 응답(`[]`)은 저장하지 않는다.

#### 실행 — 2분 간격 작은 조각

- Cloudflare Workers 무료 요청당 외부 요청 수 제한(50건)을 고려해 **한 번 불릴 때 최대 8개 격자**(`GRIDS_PER_SLICE = 8`, 최악 외부 요청 24 + DB 조회·저장 약 5건)만 받는다.
- `pg_cron`이 KST 07~17시 각 시의 0~28분 사이 2분마다 조각을 호출한다(`0-28/2 22-23,0-8 * * *`, 07시=전날 UTC 22시).
- 조각 동작: 현재 시각 기준시각 3종 계산 → 이미 저장된 `(격자, kind)` 조회 → 빠진 것이 있는 격자 최대 8개 선택(조각 시각 `분 ÷ 2`로 시작 위치를 회전시켜 실패 격자가 다른 격자를 굶기지 않게 함) → 받아 저장. 모두 있으면 아무것도 하지 않는다(멱등).
- 단기예보는 하루 대부분 05시 발표분 기준시각이 같아 이미 저장돼 있으면 다시 받지 않는다. 매시 실제 호출은 격자당 초단기실황 1 + 초단기예보 1이다.
- 한도(`22`) · 인증(`401` · `403`, 본문 `30~32` 포함) 오류를 만나면 조각을 즉시 중단한다. 그 밖의 오류는 해당 격자만 건너뛰고 다음 조각에서 다시 시도한다. 저장 목록 조회 실패 시 전부 다시 받지 않도록 조각을 중단한다.
- 수집 호출은 `source = prefetch`로 1단계 집계에 기록된다.

#### 호출 경로와 보안

- `POST /api/internal/kma-prefetch`: 헤더 `x-kma-prefetch-token`을 환경 변수 `KMA_PREFETCH_TOKEN`과 **상수 시간 비교**한다. 불일치 · 미설정이면 `401` 반환(`guardProxyRequest` 미사용).
- KST 07~17시 밖이면 `{ status: "skipped", reason: "outside-window" }`로 즉시 반환한다.
- 토큰과 호출 주소는 Supabase `vault`(`kma_prefetch_token`, `kma_prefetch_url`)에만 둔다. SQL 함수 `public.run_kma_prefetch_slice()`(`SECURITY DEFINER`, `SET search_path = ''`)가 vault에서 읽어 `net.http_post`로 호출하며, `anon` / `authenticated` 실행 권한을 회수한다. 코드 · 마이그레이션에 실제 비밀값이나 URL을 쓰지 않는다.

#### 운영 순서 (요약)

상세 순서는 상단 `## 직접 하실 일`을 따른다(`20261116000200_kma_forecast_cache.sql` 적용 → `KMA_PREFETCH_TOKEN` · vault `kma_prefetch_token` · `kma_prefetch_url` 등록 및 재배포 → `pg_cron` · `pg_net` 활성화 → `20261116000300_kma_prefetch_cron.sql` 적용 → 07시 이후 확인).

---

### 5.3 3단계: 저장분 표시 · 수동 갱신

#### 읽기 규칙 (2단계 §5.6 및 1단계 계획 Task 2.4 대체)

- `GET /api/worksite-weather`는 기상청 **예보를 부르지 않는다.** `kma_forecast_cache`에서 `(nx, ny, kind)`마다 `base_date` · `base_time` 내림차순 1행을 읽는다(`readLatestForecast`).
- 응답에 `dataInfo`를 싣는다: 종류별 기준시각(`bases`), 가장 최근 수집 시각(`collectedAt`), 출처(`collectedBy`: `auto` · `manual` · `screen`), 저장분이 없는 종류(`missing`).
- 단기예보(`vilage`) 저장분이 없으면 `overall: "unknown"`, `timeline: []`, `recommendedWindows: []`와 함께 안내 경고 문구로 HTTP `200`을 돌려준다(`502` 아님). 오늘 슬롯이 비면 기존 결측 경고가 표시된다.
- 저장분의 기준시각을 그대로 사용한다(`issuedAt`, 관측 시각 `observationTime`). 현재 시각 기준시각으로 덮어쓰지 않는다.
- 브라우저 · 모듈 캐시: 서버 응답은 `Cache-Control: private, no-store`로 내리고, 클라이언트 10분 모듈 캐시는 수동 갱신 때 비운다.

#### 수동 갱신

- `POST /api/worksite-weather/refresh` `{ sites: [{ lat, lng, region? }] }`(1~5개). `guardProxyRequest`로 로그인 · 출처 · 속도 제한을 검증한다.
- 격자 중복 제거 → 각 격자의 최신 저장분이 **5분 안**(`MANUAL_REFRESH_MIN_INTERVAL_MS = 300_000`)이면 건너뜀(`status: "recent"`) → 아니면 지금 기준시각 3종을 `{ source: "manual", fresh: true }`로 받아(isolate 캐시 건너뜀) `source = manual`로 upsert한다. 빈 응답(`[]`)은 저장하지 않는다.
- 특보도 첫 사이트 지역으로 `fetchWeatherAlerts(..., { source: "manual", fresh: true })`를 1회 새로 받는다(실패 시 `alertsRefreshed: false`).
- 저장이 실패해도(마이그레이션 미적용 등) 받은 값은 화면에 반영할 수 있도록 `saved: false`로 알린다.
- DB: `kma_forecast_cache`와 `kma_api_usage`의 `source` CHECK 제약에 `'manual'`을 더하는 마이그레이션 `supabase/migrations/20261118000000_kma_manual_source.sql`을 추가한다(사용자가 적용).
- 한도 영향: 격자당 최악 약 5건. 5분 제한으로 한 격자는 5분에 한 번만 나가므로 사용자 수와 무관하다.

#### 화면

- 대시보드 위쪽 버튼 **`현재 데이터로 갱신`**(`RefreshCw` 아이콘): 진행 중 `갱신 중 3/12`, 완료 후 한 줄 안내 `12곳 갱신, 3곳은 5분 안에 갱신돼 건너뜀`(`failed` · `unsaved` 포함 시 함께 표시).
- 각 국소(및 지도 말풍선 `overlay-content.ts` 한 줄): `기준 17:00 · 수집 17:04 자동`(출처는 `자동` · `수동` · `화면 조회`). 실황 기준이 현재보다 3시간 이상 오래되면 `N시간 전 자료` 경고색 표시. 저장분이 없으면 "저장된 자료 없음 — 위의 [현재 데이터로 갱신]을 눌러 주세요".
- 관리자 "기상청 호출" 창(`KmaUsageDialog`): `수동` 열 추가, KST 07:30 이후(17시 이전) 오늘 `사전수집`이 0건이면 "오늘 자동 수집이 한 번도 돌지 않았습니다. 토큰·주소(vault)와 `pg_net` 설정을 확인하세요(설계 §5.7)." 경고 표시.

#### 비목표 (3단계)

- 24시간 자동 수집, 특보의 사전 수집 · DB 저장, 사용자별 갱신 이력, 갱신 버튼의 관리자 전용 권한 구분.

#### 위험 (3단계)

- **자동 수집 미동작 상태(§2.2):** 설정 완료 전에는 저장분이 수동 갱신 결과뿐이라 오래된 값을 볼 수 있다. 관리자 창 경고와 확인 SQL로 알린다.
- **야간/이른 아침 시간대:** 17시 이후~07시 전에는 실황이 수 시간 전 값이며 "N시간 전 자료" 표시로 알린다.
- **동시 수동 갱신 경쟁:** 여러 사용자가 동시에 눌러도 저장분 시각 기준으로 5분에 한 번만 나간다. 동시 도착한 두 요청이 같은 격자를 처리하는 짧은 경쟁은 허용한다(동일 키 upsert이므로 결과 동일).
- **마이그레이션 적용 전:** `manual` 저장만 CHECK 위반으로 실패하고 화면 표시 자체는 동작한다.

---

## 6. 구현 계획

### 6.1 1단계: 호출 집계 (구현 완료)

| Task | 파일 | Interfaces · 주요 내용 | 검증 기준 |
|---|---|---|---|
| Task 1.1 DB 마이그레이션 | `supabase/migrations/20261116000100_kma_api_usage.sql` | `kma_api_usage` 테이블(PK `hour_kst, provider, operation, source`), `public.record_kma_call(p_hour, p_provider, p_operation, p_source, p_error)`, `REVOKE ALL FROM public, anon, authenticated`, SELECT RLS `is_app_admin()` | SQL 문법 · 권한 · RLS 확인(로컬 실행 금지) |
| Task 1.2 순수 통계 유틸 | `worksite-weather/lib/kma-usage-stats.ts`, `.test.ts` (계획서 명칭 `kma-usage-utils.ts`에서 구현 시 분리) | `kstHourStartIso`, `kstDateKey`, `buildTodayHours`(24칸), `buildDailyTotals`(최근 7일), `usageRatio`, `isOverWarn`, `buildUsageReport` | UTC/KST 정시 내림, 24칸 빈 슬롯 채움, 7일 합산 vitest |
| Task 1.3 호출 기록 레이어 | `worksite-weather/lib/kma-usage.ts`, `keep-alive.ts` | `recordKmaCall({ provider, operation, source, error? })`, Workers `ctx.waitUntil` / Node 비동기 발사, 오류 삼키고 `console.warn` | 실패 · 미적용 시 예외 미전파 vitest |
| Task 1.4 클라이언트 연동 | `worksite-weather/lib/kma-client.ts`, `.test.ts` | `fetchJson` · `fetchAlertsFromHub` `finally`에서 호출당 정확히 1회 집계(캐시 적중 제외), `{ source?: "user" \| "prefetch" }`, 실패 시 코드만 기록 | 캐시 히트 0회 · 실패 시 `errors` 증가 확인 |
| Task 1.5 관리자 API | `src/app/api/admin/kma-usage/route.ts` | `GET`, `authenticateAdminRequest`, 오늘 00:00(KST)~ 및 최근 7일 조회, 미적용 시 `available: false`, `KMA_DAILY_LIMIT = 10000` | 관리자 인증 · `available: false` 폴백 확인 |
| Task 1.6 관리자 UI | `constants/kma-usage.ts`, `components/kma-usage-dialog.tsx`, `accounts-panel.tsx` | `KMA_DAILY_LIMIT = 10000`, `KMA_WARN_RATIO = 0.8`, 사용률 바(80%/100% 배지), 시간대별 · 7일 표(`whitespace-nowrap`), `dynamic()` 지연 로딩 | 표 줄바꿈/가로스크롤 없음 · 번들 증가 없음 |
| Task 1.7 1단계 검증 | 전체 | `npm test`, `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npx next build` | 전 항목 통과, 홈 First Load JS 기준 유지 |

### 6.2 2단계: 07~17시 사전 수집 (코드 구현 완료)

| Task | 파일 | Interfaces · 주요 내용 | 검증 기준 |
|---|---|---|---|
| Task 1 마이그레이션 2개 | `20261116000200_kma_forecast_cache.sql`, `20261116000300_kma_prefetch_cron.sql`, `README.md` | `public.kma_forecast_cache(nx, ny, kind, base_date, base_time, payload, fetched_at, source)`, `public.run_kma_prefetch_slice()`(`SECURITY DEFINER`, `search_path = ''`, vault 2종 읽기, `net.http_post` `timeout_milliseconds := 25000`), 크론 `kma-prefetch`(`0-28/2 22-23,0-8 * * *`) · `kma-prefetch-cleanup`(`0 9 * * *`, `2 days`) | `search_path` 고정 · 권한 회수 · 정책 없음 · vault 사용 · 멱등성 |
| Task 2 순수 계획 로직 | `constants/kma-prefetch.ts`, `lib/kma-prefetch-plan.ts`, `.test.ts` | `PREFETCH_FIRST_HOUR = 7`, `PREFETCH_LAST_HOUR = 17`, `GRIDS_PER_SLICE = 8`, `ForecastKind`, `GridKey`, `StoredKey`, `CurrentBases`, `currentBases(now)`, `isPrefetchWindow(now)`, `uniqueGrids(points)`, `pickGridsToFetch(grids, stored, limit)`, `isPrefetchTokenValid(provided, expected)` | 06:59/07:00/17:59/18:00 경계, null/NaN/국외 좌표 제외, 정렬, XOR 상수 시간 토큰 비교 |
| Task 3 저장소·읽기 연결 | `lib/kma-forecast-store.ts`, `.test.ts`, `lib/kma-forecast-source.ts`, `.test.ts` | `ForecastRow`, `readStoredForecast`, `listStoredKeys`(1000행 페이징, 오류 throw), `saveForecast`(`upsert onConflict`), `saveForecastInBackground`, `loadForecastItems` *(3단계에서 `readLatestForecast` · `loadStoredForecast`로 대체)* | 한 번의 조회, DB 오류 시 `{}`/throw 구분, 빈 배열 미저장, `loadForecastItems` 폴백 |
| Task 4 수집 조각·내부 라우트 | `lib/kma-prefetch.ts`, `.test.ts`, `app/api/internal/kma-prefetch/route.ts` | `SliceDeps`, `SliceResult`, `runPrefetchSlice(deps, now)`, `defaultSliceDeps()`, `POST /api/internal/kma-prefetch`(`x-kma-prefetch-token` 검증, 미설정·불일치 401) | 창 밖 `skipped`, 전부 존재 시 호출 0, 20개→8개+`remaining: 12`, `22`/`401`/`403` 즉시 중단, `listStoredKeys` 오류 시 `aborted/store-error` |
| Task 5 라우트 연결·오류 코드 | `lib/kma-client.ts`, `.test.ts`, `app/api/worksite-weather/route.ts` | `extractItems` `KmaError.code` 매핑(`30/31/32`·`401`→`"401"`, 허브 `403`→`"403"`, 그 외 `resultCode` 예 `"22"`), `route.ts`에서 `loadForecastItems` 연결 *(3단계에서 교체)* | 본문 `"22"`·`"30"`·허브 `403` 코드 매핑 테스트, 전체 vitest · tsc · eslint 통과 |
| Task 6 빌드·문서·운영 안내 | `docs/Ver_3.0/Ver_3.0_기상청호출관리_설계.md`, `README.md` | 임시 `distDir` 빌드 검증, 한글 깨짐(U+FFFD) 검사, `README.md` 환경 변수 표 `KMA_PREFETCH_TOKEN` 추가, 운영 5단계 안내 | 홈 First Load JS 297 kB 이하, `/api/internal/kma-prefetch` 라우트 존재, 한글 깨짐 없음 |

---

### 6.3 3단계: 저장분 표시·수동 갱신 (구현 완료)

#### 파일 구조

| 파일 | 책임 | Task |
|---|---|---|
| `supabase/migrations/20261118000000_kma_manual_source.sql` | 두 테이블의 `source`에 `manual` 허용 | 1 |
| `worksite-weather/types/weather.ts` | `WeatherDataInfo`, 응답 `dataInfo` | 2 |
| `worksite-weather/lib/kma-data-info.ts` | 순수: 출처 매핑·`dataInfo` 만들기·최근 수집 판정 | 2 |
| `worksite-weather/lib/kma-forecast-store.ts` | `readLatestForecast`, `ForecastRow.source`에 `manual` | 3 |
| `worksite-weather/lib/kma-client.ts`, `kma-usage.ts` | `{ fresh }` 옵션, `UsageSource`에 `manual` | 3 |
| `worksite-weather/lib/kma-forecast-source.ts` | `loadStoredForecast`(실시간 호출 제거) | 4 |
| `app/api/worksite-weather/route.ts` | 저장분만 읽고 `dataInfo`를 싣는다 | 4 |
| `worksite-weather/lib/kma-forecast-refresh.ts`, `app/api/worksite-weather/refresh/route.ts` | 수동 갱신 | 5 |
| `worksite-weather/lib/worksite-weather-api.ts`, `dashboard/hooks/use-worksite-board.ts`, `worksite-weather/lib/data-info-label.ts`, `dashboard/components/{dashboard-panel,worksite-row}.tsx` | 갱신 버튼·시각 표시 | 6 |
| `worksite-weather/lib/kma-usage-stats.ts`, `accounts/components/kma-usage-dialog.tsx` | `수동` 열, 자동 수집 미동작 경고 | 7 |

#### 공유 Interfaces (여러 Task가 공유하는 이름)

```ts
// types/weather.ts
export type DataSource = "auto" | "manual" | "screen"; // DB: prefetch / manual / user
export interface WeatherDataInfo {
  bases: Record<"vilage" | "ncst" | "ufcst", string | null>; // 기준시각 ISO(KST), 저장분이 없으면 null
  collectedAt: string | null; // 가장 최근 저장 시각 ISO
  collectedBy: DataSource | null; // 가장 최근 저장분의 출처
  missing: ("vilage" | "ncst" | "ufcst")[]; // 저장분이 없는 종류
}
// WorksiteWeatherResponse.dataInfo: WeatherDataInfo  (필수)

// lib/kma-forecast-store.ts
export interface StoredForecast {
  kind: ForecastKind; items: KmaItem[]; base: KmaBase; fetchedAt: string; source: "user" | "prefetch" | "manual";
}
export function readLatestForecast(grid: GridKey): Promise<Partial<Record<ForecastKind, StoredForecast>>>; // 실패 시 {}

// lib/kma-data-info.ts
export function toDataSource(dbSource: StoredForecast["source"]): DataSource;
export function buildDataInfo(stored: Partial<Record<ForecastKind, StoredForecast>>): WeatherDataInfo;
export function isRecentlyCollected(stored: Partial<Record<ForecastKind, StoredForecast>>, now: Date, minIntervalMs: number): boolean;

// lib/kma-forecast-refresh.ts
export const MANUAL_REFRESH_MIN_INTERVAL_MS = 300_000;
export const MAX_GRIDS_PER_REFRESH_REQUEST = 5;
export type RefreshOutcome = { nx: number; ny: number; status: "refreshed" | "recent" | "failed"; saved: boolean; error?: string };
export function refreshGrids(grids: GridKey[], now: Date, deps?: RefreshDeps): Promise<RefreshOutcome[]>;
```

#### Task 1: 마이그레이션 — `manual` 출처 허용

- **Files:** Create `supabase/migrations/20261118000000_kma_manual_source.sql` · Modify `supabase/migrations/README.md`(표 한 줄)
- **Step 1 (SQL 작성):** `kma_forecast_cache`와 `kma_api_usage`의 `source` CHECK(`'user','prefetch'`)를 `'user','prefetch','manual'`로 바꾼다. 제약 이름은 기본 이름(`kma_forecast_cache_source_check`, `kma_api_usage_source_check`)을 `DROP CONSTRAINT IF EXISTS` 뒤 `ADD CONSTRAINT`. 머리말에 "사용자가 SQL Editor에서 적용한다. 적용 전에는 수동 갱신의 저장만 실패한다"를 쓴다. 기존 행은 바뀌지 않는다.
- **Step 2 (README 표 갱신):** 한 줄과 개수 문구 갱신.
- **Step 3 (확인):** 파일이 UTF-8로 한글이 깨지지 않았는지 읽어 본다. `git status`로 신규 파일 상태 확인(커밋하지 않는다).

#### Task 2: 순수 로직과 타입 (`kma-data-info.ts`)

- **Files:** Create `worksite-weather/lib/kma-data-info.ts`, `kma-data-info.test.ts` · Modify `worksite-weather/types/weather.ts`
- **Interfaces:** Consumes `StoredForecast`(Task 3과 같은 정의를 `import type`) · Produces 위 Interfaces의 `toDataSource` · `buildDataInfo` · `isRecentlyCollected`, 타입 `DataSource` · `WeatherDataInfo`.
- **Step 1 (실패하는 테스트):**
  - `toDataSource`: `prefetch` → `auto`, `manual` → `manual`, `user` → `screen`.
  - `buildDataInfo`: 세 종류가 모두 있으면 `missing: []`이고 `bases`가 각 기준시각의 KST ISO(`baseToIsoKst`)이며 `collectedAt`이 세 `fetchedAt` 중 **가장 최근**, `collectedBy`가 그 행의 출처. 일부만 있으면 `missing`에 빠진 종류, `bases`는 `null`. 하나도 없으면 `collectedAt` · `collectedBy`가 `null`이고 `missing`이 세 종류.
  - `isRecentlyCollected`: 어느 종류든 `fetchedAt`이 `now - minIntervalMs` 이후면 `true`, 전부 오래됐거나 비었으면 `false`, 경계(정확히 5분 전)는 `false`.
- **Step 2 (실패 확인):** `npx vitest run src/features/worksite-weather/lib/kma-data-info.test.ts` → 모듈 없음.
- **Step 3 (구현):** 위 시그니처 그대로 구현한다. `types/weather.ts`에 `DataSource` · `WeatherDataInfo`를 더하고 `WorksiteWeatherResponse`에 `dataInfo: WeatherDataInfo`를 더한다(빌드 오류가 나는 곳은 Task 4에서 채우며, 임시로 `route.ts`에 빈 `dataInfo`를 넣지 않고 Task 4와 한 번에 처리한다).
- **Step 4 (통과 확인):** 같은 명령 PASS.
- **Step 5:** `git status` 확인.

#### Task 3: 저장소 최신 읽기와 `fresh` · `manual`

- **Files:** Modify `worksite-weather/lib/kma-forecast-store.ts` · `.test.ts`, `kma-client.ts` · `.test.ts`, `kma-usage.ts`
- **Step 1 (실패하는 테스트):**
  - `kma-forecast-store.test.ts`: 가짜 Supabase(기존 테스트 방식)로 `readLatestForecast({ nx, ny })`가 종류별로 **`base_date` · `base_time` 내림차순 1행**을 돌려주고(세 번의 병렬 조회), 한 종류가 비면 그 키만 없으며, DB 오류면 `{}`를 돌려주고 던지지 않는다.
  - `kma-client.test.ts`: `fetchUltraSrtNcst(..., { source: "manual", fresh: true })`가 같은 인자로 **두 번째 호출에서도 캐시를 건너뛰고 요청을 보낸다**(캐시 적중 시 요청 0건인 기존 동작은 `fresh` 없을 때 유지). `source: "manual"`이 집계(`recordKmaCall`)에 그대로 넘어간다.
- **Step 2 (실패 확인):** `npx vitest run src/features/worksite-weather/lib/kma-forecast-store.test.ts src/features/worksite-weather/lib/kma-client.test.ts` → 실패.
- **Step 3 (구현):** `readLatestForecast(grid: GridKey)`는 종류마다 `.from("kma_forecast_cache").select("kind, base_date, base_time, payload, fetched_at, source").eq("nx").eq("ny").eq("kind", kind).order("base_date", { ascending: false }).order("base_time", { ascending: false }).limit(1)`을 `Promise.all`로 호출한다(더 이상 쓰지 않는 `readStoredForecast`는 삭제한다). `ForecastRow.source`와 `UsageSource`에 `"manual"`을 더한다. `KmaCallOptions`에 `fresh?: boolean`을 더하고 `fetchVilageFcst` · `fetchUltraSrtNcst` · `fetchUltraSrtFcst` · `fetchWeatherAlerts`가 `fresh`면 `readCache`를 건너뛴다(결과 `writeCache`는 유지).
- **Step 4 (통과 확인):** 같은 명령 PASS.
- **Step 5:** `git status` 확인.

#### Task 4: 읽기 경로를 저장분 전용으로

- **Files:** Modify `worksite-weather/lib/kma-forecast-source.ts` · `.test.ts`, `src/app/api/worksite-weather/route.ts`, `worksite-weather/lib/kma-forecast-store.ts`(`saveForecastInBackground` 삭제)
- **Interfaces:** Consumes `readLatestForecast`, `buildDataInfo` · Produces `loadStoredForecast(grid: GridKey): Promise<{ items: ForecastItems; bases: Partial<Record<ForecastKind, KmaBase>>; info: WeatherDataInfo }>` — `loadForecastItems`를 **대체**한다(이름 변경에 따라 호출부 확인).
- **Step 1 (실패하는 테스트):** `kma-forecast-source.test.ts`(기존 케이스를 새 동작으로 교체): ① 세 종류가 저장돼 있으면 `items`에 담기고 `info.missing`이 `[]`이며 **기상청 함수(`fetchVilageFcst` 등)가 한 번도 불리지 않는다**. ② 저장분이 전혀 없으면 `items`가 세 배열 모두 `[]`이고 `info.missing`이 세 종류이며 기상청 호출 0건. ③ 기준시각이 지금 계산한 것과 달라도(어제 것) 쓴다. ④ DB 오류면 ②와 같다(던지지 않음).
- **Step 2 (실패 확인):** `npx vitest run src/features/worksite-weather/lib/kma-forecast-source.test.ts` → 실패.
- **Step 3 (구현):** `loadStoredForecast`는 `readLatestForecast` → `items`(종류별 배열, 없으면 `[]`), `bases`(저장분의 기준시각), `info`(`buildDataInfo`)를 반환한다. `route.ts`는 `loadForecastItems` 대신 `loadStoredForecast({ nx, ny })`를 부르고 ① `observationTime`을 `bases.ncst?.baseTime`으로(없으면 빈 문자열), ② `issuedAt`을 저장된 `vilage` 기준시각 ISO(`bases.vilage`)로(없으면 `""`), ③ 응답에 `dataInfo`를 싣고, ④ 저장분 `vilage`가 없으면 `overall: "unknown"`, `timeline: []`, `recommendedWindows: []`와 경고 `"저장된 예보가 없습니다. [현재 데이터로 갱신]을 눌러 주세요."`로 **200**을 돌려준다(502 아님). ⑤ 특보 처리 · 태풍 판정은 그대로 둔다. ⑥ `Cache-Control`을 `private, no-store`로 바꾼다.
- **Step 4 (통과 확인):** 같은 명령 PASS, `npx tsc --noEmit`(`dataInfo` 사용처 전체 점검).
- **Step 5:** `git status` 확인.

#### Task 5: 수동 갱신 (`refreshGrids` + `POST /api/worksite-weather/refresh`)

- **Files:** Create `worksite-weather/lib/kma-forecast-refresh.ts`, `kma-forecast-refresh.test.ts`, `src/app/api/worksite-weather/refresh/route.ts`
- **Interfaces:** Consumes `readLatestForecast`, `isRecentlyCollected`, `currentBases`, `fetchVilageFcst` · `fetchUltraSrtNcst` · `fetchUltraSrtFcst` · `fetchWeatherAlerts`, `saveForecast` · Produces `refreshGrids`, 라우트 요청 `{ sites: { lat: number; lng: number; region?: string }[] }` → 응답 `{ results: RefreshOutcome[]; alertsRefreshed: boolean }`.
- **Step 1 (실패하는 테스트):** `refreshGrids`(가짜 `deps`: `readLatest` · `fetchKinds` · `save`): ① 저장분이 5분 안이면 `status: "recent"`, 기상청 호출 0건. ② 오래됐거나 없으면 세 종류를 받아 `source: "manual"`로 `save`하고 `refreshed`, `saved: true`. ③ 응답이 `[]`인 종류는 저장하지 않는다. ④ 단기예보(`vilage`)가 실패하면 그 격자는 `failed`(초단기 둘의 실패는 해당 종류만 건너뜀). ⑤ `manual` 출처 저장이 거부되면(마이그레이션 적용 전) `user` 출처로 한 번 더 저장을 시도하고, 둘 다 실패하면 `refreshed`, `saved: false`를 돌려준다. ⑥ 같은 격자가 두 번 들어오면 한 번만 처리. ⑦ 6개 이상 격자를 넘기면 던진다(`MAX_GRIDS_PER_REFRESH_REQUEST`). 라우트는 순수하지 않아 테스트하지 않는다.
- **Step 2 (실패 확인):** `npx vitest run src/features/worksite-weather/lib/kma-forecast-refresh.test.ts` → 모듈 없음.
- **Step 3 (구현):** `refreshGrids`: 격자 중복 제거 → 각 격자에서 `readLatest` → `isRecentlyCollected`면 건너뜀 → 아니면 `currentBases(now)`의 세 기준시각으로 `{ source: "manual", fresh: true }` 호출(초단기 둘은 `.catch(() => [])`, 단기예보는 던지면 `failed`) → 비지 않은 것만 `manual` 출처로 `save`(거부 시 `user` 출처로 한 번 더 `save` 시도, 둘 다 실패하면 `saved: false`). 격자는 순서대로 처리한다(동시 호출 없음). `POST` 라우트: `guardProxyRequest`(로그인 · 출처 · 속도 제한) → 본문 검증(`sites` 1~5개, 숫자, `toGrid` · `isGridInKorea`) → `refreshGrids` → **특보도 새로**(`fetchWeatherAlerts(..., { source: "manual", fresh: true })`를 첫 사이트 지역으로 한 번, 실패하면 `alertsRefreshed: false`) → `Cache-Control: no-store`. 오류는 기존 라우트 형식(`{ error }`, 502).
- **Step 4 (통과 확인):** 같은 명령 PASS, `npx tsc --noEmit`.
- **Step 5:** `git status` 확인.

#### Task 6: 화면 — 갱신 버튼과 수집 시각 표시

- **Files:** Create `worksite-weather/lib/data-info-label.ts`, `data-info-label.test.ts` · Modify `worksite-weather/lib/worksite-weather-api.ts` · `.test.ts`, `dashboard/hooks/use-worksite-board.ts`, `dashboard/components/dashboard-panel.tsx`, `dashboard/components/worksite-row.tsx`, `map-marker/lib/overlay-content.ts`(말풍선에 한 줄)
- **Interfaces:** Consumes `WeatherDataInfo`, `refreshWorksiteWeather` · Produces `formatDataInfoLabel(info: WeatherDataInfo, now: Date): { text: string; isStale: boolean; isMissing: boolean }`, `refreshWorksiteWeather(sites: SiteMatch[], onProgress?: (done: number, total: number) => void): Promise<RefreshSummary>` with `RefreshSummary = { refreshed: number; recent: number; failed: number; unsaved: number; alertsRefreshed: boolean }`, 훅이 돌려주는 `refreshAll(): Promise<RefreshSummary | null>`와 `isRefreshing` · `progress`.
- **Step 1 (실패하는 테스트):** `data-info-label.test.ts`: 세 종류가 있으면 `"기준 17:00 · 수집 17:04 자동"`(기준은 **실황** 기준시각의 HH:mm, 수집은 `collectedAt`의 HH:mm, 출처는 `auto`→`자동` · `manual`→`수동` · `screen`→`화면 조회`). 예보(`vilage`)만 없으면 `isMissing: true`와 `"저장된 자료 없음"`. 실황 기준이 `now`보다 3시간 이상 오래되면 `isStale: true`이고 문구에 `"3시간 전 자료"`가 붙는다(정수 시간). `worksite-weather-api.test.ts`: `refreshWorksiteWeather`가 사이트를 **격자 기준으로 중복 없이 5개씩** 나눠 순서대로 `POST`하고 `onProgress`를 부르며, 끝나면 모듈 캐시를 비워 다음 `fetchWorksiteWeather`가 서버를 다시 부른다.
- **Step 2 (실패 확인):** `npx vitest run src/features/worksite-weather/lib/data-info-label.test.ts src/features/worksite-weather/lib/worksite-weather-api.test.ts` → 실패.
- **Step 3 (구현):** `refreshWorksiteWeather`는 `authedFetch`로 `POST /api/worksite-weather/refresh`(5개씩, 순서대로)하고 `clearWorksiteWeatherCache()`를 부른다. `useWorksiteBoard.refreshAll`은 갱신 뒤 `resultById`를 비우고 전체를 다시 `load`한다. 대시보드 패널 위쪽에 버튼 **`현재 데이터로 갱신`**(`RefreshCw` 아이콘, 진행 중 `갱신 중 3/12`, 비활성). 끝나면 한 줄 안내: `12곳 갱신, 3곳은 5분 안에 갱신돼 건너뜀`(`failed` · `unsaved`가 있으면 그 개수와 함께 표시). `worksite-row.tsx`는 `formatDataInfoLabel` 결과를 작은 글씨로 보여 주고 `isMissing`이면 "저장된 자료 없음 — 위의 [현재 데이터로 갱신]을 눌러 주세요", `isStale`이면 경고색을 쓴다. 말풍선(`overlay-content.ts`)은 같은 문구 한 줄만 더한다.
- **Step 4 (통과 확인):** 같은 명령 PASS, `npx tsc --noEmit`, `npx eslint src --max-warnings=0`.
- **Step 5 (사용자 확인, 구현 뒤):** 대시보드에서 ① 수집 시각이 보이는지 ② 버튼을 누르면 값과 시각이 바뀌는지 ③ 바로 다시 누르면 "5분 안에 갱신돼 건너뜀"인지 확인한다.
- **Step 6:** `git status` 확인.

#### Task 7: 관리자 화면 — `수동` 열과 자동 수집 미동작 경고

- **Files:** Modify `worksite-weather/lib/kma-usage-stats.ts` · `.test.ts`, `src/app/api/admin/kma-usage/route.ts`(필요 시), `accounts/components/kma-usage-dialog.tsx`
- **Step 1 (실패하는 테스트):** `kma-usage-stats.test.ts`: 시간대별 · 일별 집계가 `manual` 출처를 `user` · `prefetch`와 **따로** 센다. 새 순수 함수 `isPrefetchStalled(todayHours: ReturnType<typeof buildTodayHours>, now: Date): boolean`: KST 07:30 이후이고 오늘 `prefetch` 호출 합이 0이면 `true`, 07:30 전이거나 17시 이후는 `false`(수집 시간대를 벗어나면 의미가 없으므로), 합이 1 이상이면 `false`.
- **Step 2 (실패 확인):** `npx vitest run src/features/worksite-weather/lib/kma-usage-stats.test.ts` → 실패.
- **Step 3 (구현):** 집계 형식에 `manual` 열을 더하고 `KmaUsageDialog` 표에 `수동` 열(폭을 키워 줄바꿈 금지)을 더한다. `isPrefetchStalled`가 `true`이면 창 위에 경고 한 줄을 띄운다: `"오늘 자동 수집이 한 번도 돌지 않았습니다. 토큰·주소(vault)와 pg_net 설정을 확인하세요(설계 §5.7)."`
- **Step 4 (통과 확인):** 같은 명령 PASS, `tsc` · `eslint`.
- **Step 5:** `git status` 확인.

#### Task 8: 자동 수집 실제 동작 확인(사용자 몫)과 문서

- **Files:** Modify `docs/Ver_3.0/Ver_3.0_기상청호출관리_구현.md` (또는 통합 문서), `Ver_3.0_계획.md`(17장 끝에 3단계 상태)
- **Step 1 (전체 검증):** `npx tsc --noEmit`, `npx eslint src --max-warnings=0`, `npm test`, 임시 `distDir` `next build`(홈 **298 kB 이하**).
- **Step 2 (사용자에게 안내):** 운영 DB 조회로 2026-11-13 기준 자동 수집이 한 번도 안 된 것을 확인하였다(`kma_forecast_cache` 전부 `source = user`, vault에 `kma_prefetch_token` · `kma_prefetch_url` 없음, `net._http_response` 비어 있음). 운영 설정 완료 후 `SELECT source, count(*), max(fetched_at) FROM public.kma_forecast_cache GROUP BY source;`에 `prefetch` 행이 07시 이후 생기는지, 관리자 "기상청 호출" 창 `사전수집` 열이 오르는지 확인한다.
- **Step 3 (문서):** 구현 문서에 3단계(읽기 경로 변경, 갱신 버튼, 한도 규칙, 사용자 확인 결과)를 적고 설계 §9의 "구현 상태"를 채운다.
- **Step 4:** `git status`로 변경 파일 목록만 확인하고 사용자에게 알린다(커밋하지 않는다).

---

## 7. 구현 결과

### 7.1 만든 파일 목록 (1·2단계)

| 구분 | 파일 | 주요 역할 |
|---|---|---|
| DB 마이그레이션 | `supabase/migrations/20261116000100_kma_api_usage.sql` | `kma_api_usage` 테이블, `record_kma_call` RPC, 관리자 SELECT RLS |
| DB 마이그레이션 | `supabase/migrations/20261116000200_kma_forecast_cache.sql` | `kma_forecast_cache` 테이블, `(fetched_at)` 인덱스, 정책 없는 RLS |
| DB 마이그레이션 | `supabase/migrations/20261116000300_kma_prefetch_cron.sql` | `run_kma_prefetch_slice()`, `kma-prefetch` · `kma-prefetch-cleanup` 크론 |
| 상수 | `src/features/worksite-weather/constants/kma-usage.ts` | `KMA_DAILY_LIMIT = 10000`, `KMA_WARN_RATIO = 0.8` |
| 상수 | `src/features/worksite-weather/constants/kma-prefetch.ts` | `PREFETCH_FIRST_HOUR = 7`, `PREFETCH_LAST_HOUR = 17`, `GRIDS_PER_SLICE = 8` |
| 집계 · 유지 | `src/features/worksite-weather/lib/kma-usage-stats.ts` | KST 정시 · 일 키, 24칸 시간대 · 7일 합산, 사용률 · 경고 판정 순수 함수 |
| 집계 · 유지 | `src/features/worksite-weather/lib/kma-usage.ts` | `recordKmaCall` (비동기 발사, 오류 삼킴) |
| 집계 · 유지 | `src/features/worksite-weather/lib/keep-alive.ts` | Workers `ctx.waitUntil` 래퍼 |
| 집계 · 유지 | `src/features/worksite-weather/lib/kma-client.ts` | `trackCall` 연동, `KmaError.code` 본문 코드 채움, `{ source }` 선택 인자 |
| 계획 · 저장 · 읽기 | `src/features/worksite-weather/lib/kma-prefetch-plan.ts` | `currentBases`, `isPrefetchWindow`, `uniqueGrids`, `pickGridsToFetch`, `isPrefetchTokenValid` |
| 계획 · 저장 · 읽기 | `src/features/worksite-weather/lib/kma-forecast-store.ts` | `readStoredForecast`, `listStoredKeys`, `saveForecast`, `saveForecastInBackground` |
| 계획 · 저장 · 읽기 | `src/features/worksite-weather/lib/kma-forecast-source.ts` | `loadForecastItems` (2단계용, 3단계에서 `loadStoredForecast`로 대체 예정) |
| 수집 · 라우트 | `src/features/worksite-weather/lib/kma-prefetch.ts` | `runPrefetchSlice`, `defaultSliceDeps` |
| 수집 · 라우트 | `src/app/api/internal/kma-prefetch/route.ts` | `POST` 내부 크론 엔드포인트 (`x-kma-prefetch-token` 검사) |
| 관리자 API · UI | `src/app/api/admin/kma-usage/route.ts` | `GET` 관리자용 사용량 조회 API |
| 관리자 API · UI | `src/features/worksite-weather/components/kma-usage-dialog.tsx` | "기상청 호출" 다이얼로그(`dynamic()` 지연 로딩) |

### 7.2 1·2단계 구현 중 정한 것

- 조각 시각(`분 ÷ 2`)으로 시작 위치를 회전시켜 계속 실패하는 격자가 앞 8칸을 차지해 다른 격자를 굶기지 않게 하였다.
- 빈 응답(`[]`)은 저장하지 않아 한 시간 내내 "자료 없음"이 진실로 굳어지지 않게 하였다.
- `waitUntil` 처리를 `keep-alive.ts`로 분리해 집계 기록기와 저장소가 함께 사용한다.
- `KmaError.code`를 본문 오류(한도 `22`, 인증 `30~32`, 허브 `401` · `403`)에도 채워 수집 조각이 한도 · 인증 오류에서 즉시 멈추도록 하였다.

### 7.3 검증 결과 (2026-11-09, 1·2단계)

- `npx tsc --noEmit` · `npx eslint . --max-warnings=0` 통과.
- `npm test` (vitest): 123개 파일, 1,364개 테스트 통과.
- `npx next build`: 성공, 홈 First Load JS **297 kB**(1단계 이전 코드와 동일, 이번 변경으로 늘지 않음).

### 7.4 3단계 구현 결과 (2026-11-13)

#### 만든 파일 · 수정한 파일

| 구분 | 파일 | 주요 역할 |
|---|---|---|
| 신규 · DB 마이그레이션 | `supabase/migrations/20261118000000_kma_manual_source.sql` | 두 테이블 `source` CHECK에 `manual` 허용(사용자 적용 대기) |
| 신규 · 상수 | `src/features/worksite-weather/constants/kma-refresh.ts` | `MANUAL_REFRESH_MIN_INTERVAL_MS = 300000`, `MAX_GRIDS_PER_REFRESH_REQUEST = 5` |
| 신규 · 순수 유틸 | `src/features/worksite-weather/lib/kma-data-info.ts` | `toDataSource`, `buildDataInfo`, `isRecentlyCollected` |
| 신규 · 갱신 로직 | `src/features/worksite-weather/lib/kma-forecast-refresh.ts` | `refreshGrids`, `RefreshOutcome`, `RefreshDeps`, `defaultRefreshDeps` |
| 신규 · 표시 유틸 | `src/features/worksite-weather/lib/data-info-label.ts` | `formatDataInfoLabel` |
| 신규 · 문구 유틸 | `src/features/worksite-weather/lib/refresh-message.ts` | `formatRefreshSummary` |
| 신규 · API 라우트 | `src/app/api/worksite-weather/refresh/route.ts` | `POST` 수동 갱신 엔드포인트 |
| 수정 · 저장소 | `src/features/worksite-weather/lib/kma-forecast-store.ts` | `StoredForecast`, `readLatestForecast` 추가 및 `readStoredForecast`, `saveForecastInBackground` 삭제 |
| 수정 · 읽기 소스 | `src/features/worksite-weather/lib/kma-forecast-source.ts` | `loadForecastItems`를 `loadStoredForecast`로 대체(반환 `{ items, bases, info }`) |
| 수정 · 클라이언트 | `src/features/worksite-weather/lib/kma-client.ts` | `KmaCallOptions.fresh` 추가 |
| 수정 · 집계 | `src/features/worksite-weather/lib/kma-usage.ts` | `UsageSource`에 `manual` 추가 |
| 수정 · 통계 | `src/features/worksite-weather/lib/kma-usage-stats.ts` | `manual` 열, `isPrefetchStalled` 추가 |
| 수정 · API 클라이언트 | `src/features/worksite-weather/lib/worksite-weather-api.ts` | `refreshWorksiteWeather`, `RefreshSummary` 추가 |
| 수정 · 타입 | `src/features/worksite-weather/types/weather.ts` | `DataSource`, `WeatherDataInfo`, 응답 `dataInfo` 추가 |
| 수정 · API 라우트 | `src/app/api/worksite-weather/route.ts` | 저장분 전용 읽기, `dataInfo`, `Cache-Control: private, no-store` |
| 수정 · 훅 | `src/features/dashboard/hooks/use-worksite-board.ts` | `refreshAll`, `isRefreshing`, `progress`, `refreshError` 추가 |
| 수정 · 대시보드 | `src/features/dashboard/components/dashboard-panel.tsx` | `[현재 데이터로 갱신]` 버튼 추가 |
| 수정 · 행 표시 | `src/features/dashboard/components/worksite-row.tsx` | 수집 정보 줄 추가 |
| 수정 · 지도 말풍선 | `src/features/map-marker/lib/overlay-content.ts` | 말풍선 수집 정보 한 줄 추가 |
| 수정 · 관리자 창 | `src/features/accounts/components/kma-usage-dialog.tsx` | `수동` 열, 자동 수집 미동작 경고 추가 |

#### 3단계 구현 중 정한 것 (계획과 달라진 점)

1. `data-info-label.ts`는 지도 말풍선(`overlay-content.ts`)도 사용하므로 `dashboard/lib`이 아니라 `worksite-weather/lib`에 두었다.
2. `loadStoredForecast`가 `bases`(저장분의 기준시각)도 함께 돌려주도록 하였다(라우트가 관측 시각 계산에 사용).
3. 수동 갱신에서 `manual` 저장이 거부되면(마이그레이션 적용 전) `user` 출처로 한 번 더 저장한다. 이에 따라 마이그레이션 적용 전에도 갱신 버튼이 동작하고 집계의 `manual` 기록만 마이그레이션 적용 뒤에 된다. 둘 다 실패하면 응답 `saved: false`이고 화면은 이전 저장분을 보여 준다(계획의 "받은 값을 그대로 보여 준다"는 읽기 경로가 저장소뿐이라 성립하지 않아 변경).
4. 특보 새로 받기는 첫 사이트의 지역 기준으로 한 번만 수행한다.
5. 읽기 경로가 더 이상 쓰지 않는 `readStoredForecast`와 `saveForecastInBackground`를 삭제하였다.

#### 검증 결과 (2026-11-13, 3단계)

- `npx tsc --noEmit` · `npx eslint` 오류 없음.
- `vitest`: 1,723개 통과.
- `next build`: 성공. 홈 First Load JS **299 kB**(298 kB에서 1 kB 증가: 대시보드가 홈이라 갱신 코드가 들어감). `/api/worksite-weather/refresh` 라우트가 목록에 있다.
- 미완료(사용자 몫): 3단계 마이그레이션(`20261118000000_kma_manual_source.sql`) 적용, 자동 수집 설정(vault 토큰·주소, `pg_net` 활성화, 재배포 — 2026-11-13 조회 기준 자동 수집 미동작), 로그인 후 대시보드에서 `[현재 데이터로 갱신]` 버튼과 수집 시각 표시 확인.

---

## 8. 전역 제약과 리뷰 포인트

### 8.1 전역 제약

- **패키지·DB 실행 원칙:** 패키지 매니저는 `npm`, Supabase는 **로컬 실행 금지**(마이그레이션 SQL 파일만 작성하고 적용 · 확장 활성화 · vault 등록은 사용자가 수행). 신규 마이그레이션은 신규 파일 상태로 두고 **커밋은 사용자 지시 시에만** 한다.
- **날씨 응답 무결성:** 호출 기록 · DB 저장 실패가 날씨 조회 응답을 지연시키거나 에러를 내지 않는다. 테이블 미적용 시에도 앱은 정상 동작한다(`available: false` 폴백, 3단계 저장 실패 시 `saved: false`).
- **수집 시간대·조각 크기:** 자동 수집은 **KST 07~17시**(UTC 크론 `0-28/2 22-23,0-8 * * *`), 정리는 매일 KST 18시(UTC `0 9 * * *`). 조각당 격자 최대 8개(`GRIDS_PER_SLICE = 8`), 빈 응답(`[]`)은 저장하지 않는다. 특보는 실시간 + isolate 캐시 10분을 유지한다.
- **3단계 읽기·수동 갱신 제약:** `GET /api/worksite-weather`는 기상청 예보를 부르지 않고 격자별 최신 저장분만 읽는다(기준시각이 달라도 사용, 미존재 시 자동 호출 금지). 수동 갱신은 로그인 사용자 누구나 가능하되 **같은 격자 5분 제한**(`300_000ms`), 요청당 **최대 5개 격자**(`MAX_GRIDS_PER_REFRESH_REQUEST = 5`, Workers 외부 요청 50건 제한 내), `source: "manual"`, `{ fresh: true }`로 호출한다.
- **비밀 보호:** 토큰 · URL 값은 코드 · 마이그레이션 · 문서 어디에도 쓰지 않고 환경 이름(`KMA_PREFETCH_TOKEN`, `kma_prefetch_token`, `kma_prefetch_url`)만 쓴다.
- **UI·스타일·번들 규칙:** 표는 셀 줄바꿈 금지(`whitespace-nowrap`), 가로 스크롤 금지, 세로 스크롤 허용(`table-no-wrap.mdc`). 새 UI에 그림 이모지 · `font-bold` · `text-[10px]`를 쓰지 않는다(스타일 가드). 홈 First Load JS는 1단계 기준선 295 kB, 2단계 297 kB, 3단계 기준 **298 kB 이하**(늘리지 않음).
- **테스트 규칙:** `vitest.config.ts` include가 `.ts`뿐이므로 테스트는 `.test.ts`로 작성한다. 생성 후 UTF-8 한글 깨짐(U+FFFD) 여부를 확인한다.

### 8.2 리뷰 포인트 (1~3단계 통합)

1. **집계 및 한도·인증 중단 (1·2단계):** 실제 외부 요청 직후에만 정확히 1회 집계되고 캐시 히트는 세지 않는가. 한도 초과(`22`) · 인증 오류(`401` · `403`, 본문 `30~32`)에서 조각이 즉시 멈추고 다음 격자를 부르지 않는가. `listStoredKeys` 실패 시 전부 다시 받지 않고 중단하는가.
2. **토큰·시간 창·좌표 방어 (2단계):** 미설정 · 빈 토큰 · 길이 다른 토큰이 상수 시간 비교로 모두 거부되는가. KST 06:59 / 07:00 / 17:59 / 18:00 경계와 `null` · `NaN` · 국외 좌표 마커가 안전하게 처리되는가.
3. **오래된 저장분·다중 기준시각 (3단계):** 07시 전이나 새 마커에서 저장분이 하루 전 것일 때 오늘 슬롯이 비면 결측 경고가 나오고 `overall: "unknown"`으로 판정되는가. 실황과 예보의 기준시각이 서로 다를 때 `dataInfo.bases`로 각각 분리 전달하는가. *(2단계의 "기준시각 불일치 시 실시간 폴백" 규칙은 3단계에서 이 규칙으로 대체됨.)*
4. **동시 수동 갱신·미적용 DB·캐시 무효화 (3단계):** 여러 사용자가 동시에 갱신을 눌러도 5분 제한과 격자 중복 제거로 5분에 한 번만 나가는가. 마이그레이션 미적용 상태에서 CHECK 위반이 나도 받은 값을 화면에 보여 주고 `saved: false`를 알리는가. 갱신 직후 `Cache-Control: private, no-store`와 클라이언트 캐시 삭제로 옛 값이 반환되지 않는가.

---

## 9. 검증 방법

- **단위 테스트 (vitest):** `npm test` (또는 `npx vitest run <대상.test.ts>`). KST 정시 · 일별/시간대별 집계(`manual` 분리 및 `isPrefetchStalled` 포함), `isPrefetchWindow` · `uniqueGrids` · `pickGridsToFetch` · `isPrefetchTokenValid`, `readStoredForecast` · `listStoredKeys` · `readLatestForecast`, `runPrefetchSlice`, `loadStoredForecast`, `refreshGrids`, `data-info-label`, `worksite-weather-api`, `kma-client` 오류 코드 · `fresh` 옵션을 검증한다.
- **정적 검사:** `npx tsc --noEmit`, `npx eslint . --max-warnings=0` (또는 작업 범위 `npx eslint src --max-warnings=0`).
- **빌드 및 번들 크기:** `npx next build`. dev 서버(3000)가 실행 중이면 `next.config.ts`에 `distDir: '.next-verify'`를 임시로 넣어 빌드한 뒤 `next.config.ts` · `tsconfig.json`을 원복하고 `.next-verify`를 삭제한다. 홈 First Load JS가 기존 기준(297~298 kB 이하)에서 늘지 않았는지, `/api/internal/kma-prefetch` · `/api/worksite-weather/refresh` 라우트가 포함됐는지 확인한다.
- **파일 검증:** 새로 작성 · 수정한 `.ts` · `.sql` · `.md` 파일에 UTF-8 한글 깨짐(U+FFFD)이 없는지 확인한다.
- **운영 검증 (사용자 수행):** `## 직접 하실 일`의 SQL과 대시보드 · 관리자 창 UI 동작을 직접 확인한다.

---

## 10. 위험과 열린 점

- **자동 수집 미동작 (최우선 운영 과제):** 2026-11-13 기준 `vault` · `pg_net` 미설정으로 자동 수집이 돌지 않아 저장분이 사용자 수동/과거 조회 결과뿐이다. 설정 완료 전까지 화면에 오래된 값이 보일 수 있다.
- **집계 위치 한계:** 세는 위치는 우리 서버뿐이므로 같은 키를 다른 곳에서 쓰면 실제 기상청 사용량과 차이가 난다.
- **일일 한도 상수 미확정:** `KMA_DAILY_LIMIT = 10000`은 개발계정 기준 가정값이다. 사용자가 포털에서 실제 승인량을 확인해 알려 주면 상수를 조정한다.
- **공개 내부 경로 보안:** `/api/internal/kma-prefetch`가 공개 URL이므로 `KMA_PREFETCH_TOKEN` 상수 시간 비교가 유일한 방어선이다. 유출 시 즉시 교체한다.
- **규모 · 저장 용량:** 격자가 1,000개를 넘거나 마커가 크게 늘면 0~28분 내 2분 간격 조각(8격자/회) 수가 부족할 수 있다(상수 조정 필요). 단기예보 행은 격자당 수십~백 KB이므로 이틀 보관 제한과 대시보드 용량 확인이 필요하다.
- **야간 실황 시차:** 17시 이후~07시 전에는 자동 수집이 쉬므로 실황이 몇 시간 전 값이며 "N시간 전 자료"로 표시한다.
- **3단계 마이그레이션 전 동작:** `20261118000000_kma_manual_source.sql` 적용 전에는 수동 갱신의 `manual` DB 저장만 실패한다.

---

## 11. 알려진 한계 / 코드로 확인하지 못한 것

- **실제 Supabase `pg_cron` · `pg_net` 실행 결과:** Supabase 로컬 실행 금지 정책으로 마이그레이션 SQL 실행, 확장 동작, `net.http_post` 실제 왕복은 코드/테스트 환경에서 확인하지 못하였다(2026-11-13 읽기 전용 DB 조회에서 `net._http_response`가 비어 있음만 확인).
- **Cloudflare Workers 실제 외부 요청 한도 여유:** 무료 플랜 요청당 외부 요청 50건 제한에 대해 2단계 조각 크기(8격자) · 3단계 수동 갱신 크기(5격자)가 실운영에서 충분한지는 배포 환경 실측이 필요하다.
- **수동 갱신 저장 실패 시 화면 미변경:** 읽기 경로는 저장소뿐이라 수동 갱신에서 저장(`manual` · `user`)이 둘 다 실패하면 갱신해도 화면 값이 바뀌지 않고 이전 저장분을 보여 준다.
- **3단계 빌드 · 운영 화면:** 3단계 코드 구현과 단위 테스트(vitest 1,723개)는 완료됐으나, 빌드(홈 번들)는 확인 중이며 3단계 마이그레이션 적용과 로그인 후 대시보드 화면 동작 확인은 아직 수행되지 않았다.
