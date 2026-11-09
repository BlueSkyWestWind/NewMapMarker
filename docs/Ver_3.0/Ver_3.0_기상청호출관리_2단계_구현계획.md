# 기상청 사전 수집(2단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KST 07~17시에 서버가 등록 마커 격자의 예보를 미리 받아 DB에 저장하고, 날씨 화면은 기준시각이 같은 저장분을 우선 읽어 기상청 호출을 줄인다.

**Architecture:** `pg_cron`이 07~17시 각 시의 0~28분 사이 2분마다 `pg_net`으로 `POST /api/internal/kma-prefetch`를 부른다. 한 번 불릴 때 빠진 `(격자, kind)`가 있는 격자 최대 8개만 받아 `kma_forecast_cache`에 저장하는 멱등 조각이다. `/api/worksite-weather`는 현재 기준시각과 정확히 같은 저장분을 한 번의 조회로 읽고, 없는 것만 실시간 호출한 뒤 DB에 채운다.

**Tech Stack:** Next.js(App Router) · TypeScript · Supabase(서비스 키, pg_cron, pg_net, vault) · vitest

**Spec:** `docs/Ver_3.0/Ver_3.0_기상청호출관리_설계.md` §5 (1단계 구현 `Ver_3.0_기상청호출관리_구현계획.md`는 완료 상태. `recordKmaCall`·`KmaCallOptions.source`·`KmaError.code`를 그대로 쓴다)

## Global Constraints

- 패키지 매니저 npm. Supabase는 **로컬 실행 금지** — 마이그레이션은 파일만 만들고 적용·확장 활성화·vault 등록은 사용자가 한다.
- 수집 시각 **KST 07시~17시**(07·08·…·17). 크론은 UTC라 `0-28/2 22-23,0-8 * * *`. 정리는 매일 18시 KST = UTC 09:00 (`0 9 * * *`).
- 조각당 격자 **최대 8개**(`GRIDS_PER_SLICE = 8`). Workers 외부 요청 제한(무료 50건)을 넘지 않는다.
- 저장분은 **기준시각이 정확히 같을 때만** 쓴다. 빈 응답(`[]`)은 저장하지 않는다.
- 특보는 이번 범위가 아니다(지금처럼 실시간 + isolate 캐시).
- 토큰·URL 값은 코드·마이그레이션·문서에 쓰지 않는다. 환경 이름은 `KMA_PREFETCH_TOKEN`, vault 이름은 `kma_prefetch_token`·`kma_prefetch_url`.
- 마이그레이션이 없거나 DB가 실패해도 `/api/worksite-weather`는 지금과 똑같이 실시간으로 동작한다.
- vitest include는 `.ts`뿐 → 테스트는 `.test.ts`. `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test` · `npx next build`(dev 서버가 떠 있으면 임시 distDir, 끝나면 `next.config.ts`·`tsconfig.json` 원복).
- 홈 First Load JS는 이미 **297 kB**(기준 295 초과, 1단계 전부터). 이번 변경으로 **늘리지 않는다**.
- **커밋은 사용자가 지시할 때만 한다.** 신규 마이그레이션은 신규 파일 상태로 둔다. 생성 후 한글 깨짐을 확인한다.

## Review Focus

- 저장분이 **다른 기준시각**이면 쓰지 않고 실시간으로 받는다(화면의 "관측 시각"이 어긋나면 안 된다) → Task 3 테스트.
- 한도 초과(`22`)·인증 오류에서 조각이 **즉시 멈추고** 다음 격자를 더 부르지 않는다 → Task 4 테스트.
- 저장 조회가 실패했을 때 "아무것도 없다"로 오해해 **전부 다시 받지 않는다**(조각 중단) → Task 4 테스트.
- 토큰 미설정·빈 토큰·길이가 다른 토큰이 **모두 거부**된다 → Task 2 테스트.
- 07~17시 밖·경계(06:59, 17:59, 18:00 KST)가 올바르게 판정된다 → Task 2 테스트.
- 좌표가 null·NaN·국외인 마커가 격자 목록을 깨뜨리지 않는다 → Task 2 테스트.

---

### Task 1: 마이그레이션 2개

**Files:**
- Create: `supabase/migrations/20261116000200_kma_forecast_cache.sql`
- Create: `supabase/migrations/20261116000300_kma_prefetch_cron.sql`
- Modify: `README.md` (마이그레이션 표 두 줄 추가, 개수 문구 `30개` → `32개`. README는 이미 미커밋 변경이 있으니 그 부분만 고친다)

**Interfaces:**
- Produces: 테이블 `public.kma_forecast_cache(nx int, ny int, kind text, base_date text, base_time text, payload jsonb, fetched_at timestamptz, source text, PK(nx, ny, kind, base_date, base_time))`; 함수 `public.run_kma_prefetch_slice() returns void`; 크론 작업 `kma-prefetch`, `kma-prefetch-cleanup`.

- [ ] **Step 1: 캐시 테이블 SQL** — 1단계 마이그레이션(`20261116000100_kma_api_usage.sql`) 머리말·멱등 스타일을 따른다. `kind` CHECK `('vilage','ncst','ufcst')`, `source` CHECK `('user','prefetch')`, `payload jsonb NOT NULL`, `fetched_at timestamptz NOT NULL DEFAULT now()`. 인덱스 `(fetched_at)`(정리용). RLS 활성화만 하고 **정책을 만들지 않는다**(서비스 키만 접근). 끝에 `NOTIFY pgrst, 'reload schema';`와 확인 쿼리 주석(`SELECT kind, count(*), max(fetched_at) FROM public.kma_forecast_cache GROUP BY kind;`).
- [ ] **Step 2: 크론 SQL** — 머리말에 **적용 전 해야 할 일**을 번호로 쓴다: 확장 `pg_cron`·`pg_net` 활성화(대시보드), vault 비밀 2개 등록 예시(`select vault.create_secret('<값>', 'kma_prefetch_token');` — 값 자리는 `<여기에 값>`으로 두고 실제 값을 쓰지 않는다), Cloudflare Secret `KMA_PREFETCH_TOKEN`에 같은 토큰. 본문: `public.run_kma_prefetch_slice()` — `SECURITY DEFINER`, `SET search_path = ''`, `vault.decrypted_secrets`에서 두 이름을 읽고 둘 중 하나라도 없으면 조용히 `RETURN`, `net.http_post(url := …, headers := jsonb_build_object('x-kma-prefetch-token', …, 'Content-Type','application/json'), body := '{}'::jsonb, timeout_milliseconds := 25000)`. `REVOKE ALL … FROM PUBLIC, anon, authenticated;`. 크론 등록은 멱등으로(`DO $$ … cron.unschedule … $$` 후 `cron.schedule`): `kma-prefetch` = `0-28/2 22-23,0-8 * * *`(주석에 "KST 07~17시"), `kma-prefetch-cleanup` = `0 9 * * *`로 `DELETE FROM public.kma_forecast_cache WHERE fetched_at < now() - interval '2 days'`.
- [ ] **Step 3: 대조** — `supabase:supabase-postgres-best-practices`·`supabase` 스킬의 체크리스트로 두 파일을 대조한다(search_path 고정, 권한 회수, 정책 없음의 의미, vault 사용, 멱등성). 실행하지 않는다. Expected: 위반 없음.
- [ ] **Step 4: README 표 갱신** — 두 줄과 개수 문구.
- [ ] **Step 5: 커밋(지시 시)** — `feat(weather): 사전 수집 캐시 테이블과 07~17시 크론 마이그레이션을 추가한다`

---

### Task 2: 순수 계획 로직 (`kma-prefetch-plan.ts`)

**Files:**
- Create: `src/features/worksite-weather/constants/kma-prefetch.ts` — `export const PREFETCH_FIRST_HOUR = 7; export const PREFETCH_LAST_HOUR = 17; export const GRIDS_PER_SLICE = 8;`
- Create: `src/features/worksite-weather/lib/kma-prefetch-plan.ts` (`server-only` 금지, 순수)
- Test: `src/features/worksite-weather/lib/kma-prefetch-plan.test.ts`

**Interfaces:**
- Consumes: `toGrid`·`isGridInKorea` (`lib/grid.ts`), `getVilageBaseForToday`·`getUltraNcstBase`·`getUltraFcstBase`·`toKstParts`·`KmaBase` (`lib/kma-base-time.ts`)
- Produces:
  - `type ForecastKind = "vilage" | "ncst" | "ufcst"`
  - `interface GridKey { nx: number; ny: number }`
  - `interface StoredKey extends GridKey { kind: ForecastKind }`
  - `interface CurrentBases { vilage: KmaBase; ncst: KmaBase; ufcst: KmaBase }`
  - `currentBases(now: Date): CurrentBases`
  - `isPrefetchWindow(now: Date): boolean` — KST 시각이 7 이상 17 이하(시 단위, 17:59도 true, 18:00 false, 06:59 false)
  - `uniqueGrids(points: { lat: number | null; lng: number | null }[]): GridKey[]` — null·비유한수·국외 제외, 중복 제거, `nx` 오름차순 후 `ny` 오름차순
  - `pickGridsToFetch(grids: GridKey[], stored: StoredKey[], limit: number): { nx: number; ny: number; kinds: ForecastKind[] }[]` — 세 kind 중 하나라도 빠진 격자만, 입력 순서 유지, 최대 `limit`개, `kinds`는 빠진 것만
  - `isPrefetchTokenValid(provided: string | null, expected: string | undefined): boolean` — 상수 시간 비교, `expected`가 비었거나 없으면 항상 false

- [ ] **Step 1: 실패하는 테스트** — 
  - `isPrefetchWindow`: `2026-11-09T21:59:59Z`(KST 06:59:59) false; `…T22:00:00Z`(07:00) true; `2026-11-09T08:59:59Z`(17:59:59) true; `…T09:00:00Z`(18:00) false.
  - `uniqueGrids`: 같은 격자로 떨어지는 두 점은 1개; `{lat:null,lng:127}`·`{lat:NaN,lng:127}`·국외 좌표(예 도쿄 35.68,139.69)는 제외; 결과가 정렬되어 있음.
  - `pickGridsToFetch`: 저장분이 전혀 없으면 모든 kind가 `kinds`에 들어 있다; 한 격자가 세 kind를 다 가지고 있으면 빠진다; 단기예보만 있는 격자는 `kinds`가 `["ncst","ufcst"]`; `limit=2`면 2개만.
  - `isPrefetchTokenValid("abc","abc")` true; `("abd","abc")` false; `("abc",undefined)`·`("abc","")`·`(null,"abc")`·`("abcd","abc")` 모두 false.
  - `currentBases(new Date("2026-11-09T01:20:00Z"))`(KST 10:20): `vilage.baseTime "0500"`, `ncst.baseTime "0900"`, `ufcst.baseTime "0930"`.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/features/worksite-weather/lib/kma-prefetch-plan.test.ts` → FAIL(모듈 없음).
- [ ] **Step 3: 구현** — 위 시그니처대로. 토큰 비교는 길이가 달라도 한 번에 끝까지 비교하는 XOR 누적 방식(길이 차이를 결과에 반영). `isPrefetchWindow`는 `toKstParts(now).hour`.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npx tsc --noEmit`.
- [ ] **Step 5: 커밋(지시 시)** — `feat(weather): 사전 수집 대상 격자와 수집 시간 판정을 추가한다`

---

### Task 3: 저장소와 DB 우선 읽기 (`kma-forecast-store.ts`, `kma-forecast-source.ts`)

**Files:**
- Create: `src/features/worksite-weather/lib/kma-forecast-store.ts` (`import "server-only"`)
- Create: `src/features/worksite-weather/lib/kma-forecast-source.ts` (`import "server-only"`)
- Test: `src/features/worksite-weather/lib/kma-forecast-store.test.ts`, `src/features/worksite-weather/lib/kma-forecast-source.test.ts`

**Interfaces:**
- Consumes: Task 2의 타입·`currentBases`; `getSupabaseAdminClient`; `kma-client`의 `fetchVilageFcst`·`fetchUltraSrtNcst`·`fetchUltraSrtFcst`; `KmaItem`; `getCloudflareContext`(1단계 `keepAlive`와 같은 방식)
- Produces (`kma-forecast-store.ts`):
  - `interface ForecastRow { nx: number; ny: number; kind: ForecastKind; baseDate: string; baseTime: string; items: KmaItem[]; source: "user" | "prefetch" }`
  - `readStoredForecast(grid: GridKey, bases: CurrentBases): Promise<Partial<Record<ForecastKind, KmaItem[]>>>` — **한 번의 조회**로 세 kind를 찾는다(`kind`+`base_date`+`base_time`이 모두 일치하는 행만). 오류·미적용이면 `{}`를 돌려주고 던지지 않는다.
  - `listStoredKeys(bases: CurrentBases): Promise<StoredKey[]>` — 현재 기준시각 3종의 모든 격자 행(1000행씩 나눠 읽음). **오류면 던진다**(호출부가 중단해야 한다).
  - `saveForecast(rows: ForecastRow[]): Promise<void>` — `upsert(onConflict: "nx,ny,kind,base_date,base_time")`. **오류면 던진다.** 빈 배열 payload 행은 호출 전에 걸러지므로 여기서는 다루지 않는다.
  - `saveForecastInBackground(rows: ForecastRow[]): void` — `saveForecast`를 부르되 던지지 않고(로그만) `waitUntil`에 맡긴다.
- Produces (`kma-forecast-source.ts`):
  - `loadForecastItems(args: { nx: number; ny: number; now: Date }): Promise<{ vilage: KmaItem[]; ncst: KmaItem[]; ufcst: KmaItem[] }>` — 저장분 우선, 빠진 kind만 실시간(`source: "user"`). 단기예보 실시간이 실패하면 **던진다**(지금 동작 유지). 초단기 둘은 실패하면 `[]`(지금 동작 유지). 실시간으로 받은 **비어 있지 않은** 결과만 `saveForecastInBackground`로 채운다.

- [ ] **Step 1: 실패하는 테스트 (store)** — `server-only`·`@/lib/supabase/admin`·`@opennextjs/cloudflare`를 1단계 `kma-usage.test.ts`처럼 목킹. 
  - `readStoredForecast`: 세 kind 행이 있으면 `{ vilage, ncst, ufcst }`를 돌려준다; 조회가 `error`를 돌려주면 `{}`; `getSupabaseAdminClient`가 던져도 `{}`.
  - `saveForecast`: `upsert`가 `onConflict: "nx,ny,kind,base_date,base_time"`와 snake_case 행으로 호출된다; `error` 응답이면 던진다.
  - `saveForecastInBackground`: 던지지 않는다(저장 실패해도).
  - `listStoredKeys`: 1000행이 가득 차면 다음 페이지를 읽는다(`range(0,999)` 다음 `range(1000,1999)`); 오류면 던진다.
- [ ] **Step 2: 실패하는 테스트 (source)** — `./kma-forecast-store`와 `./kma-client`를 목킹. 
  - 저장분 세 kind가 모두 있으면 `fetch*`가 **한 번도 불리지 않는다**.
  - 저장분에 `ncst`가 없으면 `fetchUltraSrtNcst`만 불리고(`source: "user"`), 결과가 비어 있지 않으면 `saveForecastInBackground`가 그 행만 받는다.
  - 실시간 결과가 `[]`면 저장하지 않는다.
  - `fetchVilageFcst`가 던지면 `loadForecastItems`가 던진다; `fetchUltraSrtFcst`가 던지면 `ufcst: []`로 돌려준다.
  - 읽기 호출이 받은 기준시각은 `currentBases(now)`와 같다(다른 기준시각의 저장분을 끌어오지 않음).
- [ ] **Step 3: 실패 확인** — `npx vitest run src/features/worksite-weather/lib/kma-forecast-store.test.ts src/features/worksite-weather/lib/kma-forecast-source.test.ts` → FAIL.
- [ ] **Step 4: 구현** — 위 시그니처대로. 조회는 `.eq("nx",…).eq("ny",…).or(<kind별 and 조건 3개>)` 한 번. 읽은 행의 `payload`가 배열이 아니면 그 kind는 없는 것으로 본다. `saveForecastInBackground`는 1단계 `keepAlive`와 같은 방식(`getCloudflareContext().ctx.waitUntil`, 실패는 무시).
- [ ] **Step 5: 통과 확인** — 같은 명령 PASS, `npx tsc --noEmit`, `npx eslint src/features/worksite-weather --max-warnings=0`.
- [ ] **Step 6: 커밋(지시 시)** — `feat(weather): 기준시각이 같은 저장분을 우선 읽고 없으면 실시간으로 받아 채운다`

---

### Task 4: 수집 조각과 내부 라우트

**Files:**
- Create: `src/features/worksite-weather/lib/kma-prefetch.ts` (`import "server-only"`)
- Test: `src/features/worksite-weather/lib/kma-prefetch.test.ts`
- Create: `src/app/api/internal/kma-prefetch/route.ts`

**Interfaces:**
- Consumes: Task 2·3의 모든 것, `KmaError`(`.code`)
- Produces:
  - `interface SliceDeps { listMarkerPoints(): Promise<{ lat: number | null; lng: number | null }[]>; listStoredKeys(bases: CurrentBases): Promise<StoredKey[]>; fetchKind(kind: ForecastKind, grid: GridKey, bases: CurrentBases): Promise<KmaItem[]>; save(rows: ForecastRow[]): Promise<void>; }`
  - `interface SliceResult { status: "done" | "skipped" | "aborted"; reason?: "outside-window" | "quota" | "auth" | "store-error"; grids: number; fetched: number; failed: number; remaining: number }` (`grids` = 이번에 처리한 격자 수, `remaining` = 이번 조각 뒤에도 빠진 것이 있는 격자 수)
  - `runPrefetchSlice(deps: SliceDeps, now: Date): Promise<SliceResult>`
  - `defaultSliceDeps(): SliceDeps` — 실제 구현: `markers`에서 `lat,lng`(null 제외)를 1000행씩 읽고, `fetchKind`는 `source: "prefetch"`로 `kma-client` 호출, `save`는 `saveForecast`
  - 라우트 `POST /api/internal/kma-prefetch` → `SliceResult`(JSON). 헤더 `x-kma-prefetch-token`을 `isPrefetchTokenValid(…, process.env.KMA_PREFETCH_TOKEN)`로 검사해 거부하면 401 `{ error }`.

- [ ] **Step 1: 실패하는 테스트** — 가짜 `SliceDeps`로: 
  - 창 밖 시각(KST 06:59) → `{ status: "skipped", reason: "outside-window" }`, `listMarkerPoints` 불리지 않음.
  - 저장분이 이미 전부 있으면 `status: "done"`, `fetched: 0`, `fetchKind` 불리지 않음.
  - 격자 20개가 모두 비어 있으면 8개만 처리하고 `remaining: 12`.
  - 단기예보가 이미 있는 격자는 `vilage`를 받지 않고 `ncst`·`ufcst`만 받는다.
  - `fetchKind`가 `KmaError("…","22")`를 던지면 `status: "aborted", reason: "quota"`, 그 뒤 격자는 부르지 않는다. 코드 `"401"`·`"403"`은 `reason: "auth"`.
  - 다른 오류(`"timeout"`)는 그 격자를 `failed`에 세고 다음 격자로 계속한다.
  - `listStoredKeys`가 던지면 `status: "aborted", reason: "store-error"`, `fetchKind` 불리지 않음(전부 다시 받지 않음).
  - 빈 결과(`[]`)는 `save`로 넘기지 않는다.
  - `save`에 넘긴 행의 `baseDate/baseTime`은 `currentBases(now)`의 해당 kind 값이다.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/features/worksite-weather/lib/kma-prefetch.test.ts` → FAIL.
- [ ] **Step 3: `runPrefetchSlice` 구현** — 순서: 창 확인 → 격자 목록(`uniqueGrids`) → `listStoredKeys` → `pickGridsToFetch(…, GRIDS_PER_SLICE)` → 격자 단위로 순차 처리(격자 안에서는 빠진 kind를 `Promise.allSettled`로 동시 호출) → 한도·인증 코드면 즉시 중단 → 받은 비어 있지 않은 결과를 모아 `save` 한 번(조각 끝). 한 조각 안에서 `save`가 던지면 `aborted/store-error`.
- [ ] **Step 4: 라우트 구현** — `export const dynamic = "force-dynamic"`. 토큰 검사 → `runPrefetchSlice(defaultSliceDeps(), new Date())` → JSON. 예외는 잡아 500 `{ error: "수집 중 오류" }`(원문 메시지·키 금지). 로그에 토큰을 남기지 않는다.
- [ ] **Step 5: 통과 확인** — 같은 명령 PASS, `npx tsc --noEmit`, `npx eslint . --max-warnings=0`.
- [ ] **Step 6: 커밋(지시 시)** — `feat(weather): 07~17시 사전 수집 조각과 내부 호출 라우트를 추가한다`

---

### Task 5: 날씨 라우트 연결과 오류 코드 보강

**Files:**
- Modify: `src/features/worksite-weather/lib/kma-client.ts` — `extractItems`의 오류 throw에 `KmaError(…, code)` 코드를 싣는다: 인증(`30/31/32`·허브 `401`)은 `"401"`, 미신청(허브 `403`)은 `"403"`, 그 밖의 `resultCode`는 그 코드 문자열(예 `"22"`), 허브의 그 밖의 status는 `String(status)`
- Modify: `src/features/worksite-weather/lib/kma-client.test.ts` — 위 코드 케이스 추가
- Modify: `src/app/api/worksite-weather/route.ts` — 단기예보·초단기실황·초단기예보 세 호출을 `loadForecastItems({ nx: grid.nx, ny: grid.ny, now })` 한 번으로 바꾼다. 특보 호출은 그대로. `issuedAt`·`observationTime` 계산은 현재 코드 그대로(저장분이 항상 같은 기준시각이므로 바뀌지 않는다).

**Interfaces:**
- Consumes: `loadForecastItems` (Task 3)
- Produces: `KmaError.code`가 본문 오류에서도 채워진다(Task 4의 한도·인증 중단 판정이 이 값을 쓴다).

- [ ] **Step 1: 실패하는 테스트** — `kma-client.test.ts`에 추가: 본문 `resultCode "22"`일 때 던져진 `KmaError`의 `code`가 `"22"`; 키 오류 `resultCode "30"`이면 `code`가 `"401"`; 허브 `result.status 403`이면 `"403"`. (기존 6개 케이스는 그대로 통과해야 한다.)
- [ ] **Step 2: 실패 확인** — `npx vitest run src/features/worksite-weather/lib/kma-client.test.ts` → 새 케이스 FAIL.
- [ ] **Step 3: `extractItems` 수정** — 위 코드 매핑. 메시지는 지금과 같다.
- [ ] **Step 4: 라우트 교체** — `Promise.all` 안의 세 `fetch*`를 `loadForecastItems`로. 기존에 `fetchUltraSrt*`가 `.catch(() => [])`였던 동작은 `loadForecastItems`가 보장한다. 사용하지 않게 된 import를 정리한다(린트가 잡는다).
- [ ] **Step 5: 통과 확인** — `npx vitest run`(전체), `npx tsc --noEmit`, `npx eslint . --max-warnings=0`. Expected: 전부 통과.
- [ ] **Step 6: 커밋(지시 시)** — `feat(weather): 날씨 조회가 저장된 예보를 우선 쓰도록 연결한다`

---

### Task 6: 빌드·문서·운영 안내

**Files:**
- Modify: `docs/Ver_3.0/Ver_3.0_기상청호출관리_설계.md` (§8 구현 상태 추가), `README.md` (환경 변수 표에 `KMA_PREFETCH_TOKEN` 한 줄 — 기존 `KMA_API_HUB_KEY` 항목 근처)

- [ ] **Step 1: 빌드** — dev 서버(3000) 여부를 확인하고 떠 있으면 `next.config.ts`에 `distDir: '.next-verify'`를 임시로 넣어 `npx next build`, 끝나면 `next.config.ts`·`tsconfig.json`을 `git checkout`/백업으로 원복하고 `.next-verify`를 지운다. Expected: 성공, 홈 First Load JS **297 kB 이하**(늘지 않음), `/api/internal/kma-prefetch` 라우트가 목록에 있음.
- [ ] **Step 2: 한글 깨짐 확인** — 새로 쓴 `.ts`/`.sql`/`.md`에서 `�`를 `Grep`한다. Expected: 없음.
- [ ] **Step 3: 문서** — 설계 문서에 구현 상태(만든 파일, 사용자에게 남은 운영 순서 5단계)를 적고 README 환경 변수를 추가한다.
- [ ] **Step 4: 사용자 확인 사항 정리** — 보고에 적는다: 토큰 생성·등록, vault 2개, 확장 활성화, 두 마이그레이션 적용 순서, 07시 이후 "기상청 호출" 창에서 `사전수집` 열 확인, 코드로 확인하지 못한 항목(실제 크론 동작·Workers 요청 제한).

## Self-Review 메모

- 스펙 §5.1 → Task 3(정확한 기준시각), §5.2 → Task 2·4, §5.3 → Task 1, §5.4 → Task 1(크론)·Task 4(조각), §5.5 → Task 1·2·4, §5.6 → Task 3·5, §5.7 → Task 6.
- 이름 일치: `ForecastKind`·`GridKey`·`StoredKey`·`CurrentBases`·`ForecastRow`·`SliceDeps`·`SliceResult`·`loadForecastItems`·`saveForecastInBackground`를 Task 2~5에서 같은 철자로 쓴다.
- 가정(확인 필요): 마커 수·격자 수는 1000 미만 규모이며, `listStoredKeys`는 한 시각 기준 행만 읽는다. 무료 Workers 제한을 가정해 조각 크기를 보수적으로 잡았다.
