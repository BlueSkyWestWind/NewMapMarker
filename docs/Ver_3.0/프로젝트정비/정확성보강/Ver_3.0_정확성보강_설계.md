# 정확성 보강 (설계)

작성일 2026-11-15 · 대상: 비동기 조회의 오래된 응답, UTC 기준 날짜 생성, `kakao-static-map` 입력 검증, `survey_settings` 트리거 함수, README 구조 트리 · 구현계획: [Ver_3.0_정확성보강_구현계획.md](Ver_3.0_정확성보강_구현계획.md) · 구현: [Ver_3.0_정확성보강_구현.md](Ver_3.0_정확성보강_구현.md)

## 1. 배경과 결정 사항

2026-11-15 사후 점검(agy 전체 점검을 Claude가 코드로 검증)에서 **이번 정비 전부터 있던** 작은 결함들이 나왔다. 하나씩은 영향이 작지만 모두 수정이 작고 서로 독립적이라 한 묶음으로 설계한다. 회귀 수정은 [회귀수정](../회귀수정/Ver_3.0_회귀수정_설계.md)이 따로 다룬다.

**사용자가 정한 것**

| # | 결정 | 날짜 |
|---|---|---|
| 1 | 구현은 agy가 하고 Claude가 diff를 검토·수정한다 | 2026-11-14 |
| 2 | 동작 변경은 결함 수정에 필요한 범위로 한정한다(원본이 사양) | 2026-11-14 |

**설계에서 정한 것(사용자 확인 대상은 §6)**

| # | 결정 |
|---|---|
| 3 | 오래된 응답은 호출마다 `cancelled` 플래그를 따로 두지 않고, **"가장 최근 요청만 반영한다"는 규칙을 순수 모듈 `lib/latest-request.ts` 하나로** 만든다. 두 훅이 같은 모듈을 쓰고, 모듈을 테스트한다 |
| 4 | UTC 날짜 11곳은 `src/lib/local-date.ts`의 `localDateIso(now = new Date())` 하나로 바꾼다. 기존 `schedule/lib/week.ts`의 `todayIso`와 같은 규칙(브라우저 로컬 달력)을 쓴다 |
| 5 | `kakao-static-map`은 `level`·`width`·`height`를 숫자 검사 후 기본값으로 대체하고, `NEXT_PUBLIC_KAKAO_REST_API_KEY` 폴백을 지운다 |
| 6 | `survey_settings` 트리거 함수의 `search_path`는 **새 마이그레이션**으로 바꾼다(이미 적용된 파일은 고치지 않는다). 적용은 사용자가 한다 |
| 7 | README 구조 트리에 `features/site-survey/`를 추가한다(문서 작업, Claude) |

## 2. 확인한 사실

### 2.1 오래된 응답이 최신 상태를 덮는 두 곳 (모두 원본부터 있던 결함)

| 대상 | 현재 동작 | 문제 |
|---|---|---|
| `map-marker/hooks/use-marker-gps-info.ts`의 `loadGpsInfo` | `await runSingleLookup(...)` 뒤 `setGpsInfo(info)` 등 상태를 바로 갱신한다. 마커·모달이 바뀌면 `resetKey` effect가 상태를 비우지만 진행 중이던 요청은 취소하지 않는다 | 이전 마커의 느린 응답이 나중에 도착하면 지금 보는 마커의 좌표·건축물대장 칸에 잘못된 값이 뜬다 |
| `map-marker/components/modals/marker-detail-modal.tsx`의 `fetchDetail`(effect 안, 176~243줄 부근) | `information` 테이블을 최대 2번 `await`한 뒤 `setDetailedInfo`·`setIsLoading(false)` | 마커를 빠르게 바꾸면 이전 마커의 응답이 최신 표를 덮을 수 있다. effect cleanup이 없다 |

- GPS 조회는 같은 좌표를 `gpsCacheRef`로 캐시해, 캐시에 있으면 즉시 반환하므로 문제는 캐시에 없는 좌표를 느리게 조회할 때만 나타난다.
- 사용자는 빠르게 다른 국소를 누를 수 있어(목록 선택) 실제로 일어날 수 있다. 심각도는 "잘못된 정보를 잠깐 보여 줌"이라 중간으로 본다.

### 2.2 UTC 기준 날짜 (11곳)

`new Date().toISOString().split("T")[0]`(또는 `.slice(0, 10)`)은 UTC 날짜다. 한국(KST, UTC+9)에서는 **00:00~08:59에 전날 날짜**가 나온다.

| 파일 | 건수 | 용도 | 영향 |
|---|---:|---|---|
| `components/ui/multi-date-picker.tsx:51` | 1 | 선택값이 없을 때 달력이 열리는 기준일(`anchor`) | KST 오전 9시 전에 달력이 어제 달로 열릴 수 있다(월초에는 달이 틀림) |
| `map-marker/api.ts:206,241,251` | 3 | DB에 `created_at`이 없을 때의 대체값 | 거의 쓰이지 않음 |
| `map-marker/lib/excel/data-manager/export.ts:118,159,212` | 3 | 백업·내보내기 파일 이름의 날짜 | 오전 9시 전에 받은 파일 이름이 전날 날짜 |
| `map-marker/lib/excel/data-manager/parse.ts:129,450` | 2 | 엑셀로 올린 마커의 `createdAt` 기본값 | 오전 9시 전에 올리면 전날 날짜 |
| `map-marker/lib/excel-upload-helpers.ts:117,147` | 2 | 대기 마커 `createdAt` | 위와 같음 |

- 모두 **브라우저에서 실행되는 코드**다(서버 라우트 아님). 브라우저의 `new Date()`는 사용자의 로컬 시간대이므로, 로컬 달력 기준 날짜를 만들면 KST 사용자에게 맞는다.
- 이미 같은 규칙의 함수가 있다: `schedule/lib/week.ts`의 `todayIso(now)`(로컬 `getFullYear/getMonth/getDate`). 주석에 "UTC가 아니라 로컬 값을 쓴다"고 이유까지 적혀 있다. 다만 일정 전용 파일 안에 있어 다른 피처가 쓰기 어렵다.

### 2.3 `kakao-static-map`

- `level`·`width`·`height`는 `Number(params.get(...))`로 바꾼 뒤 유한수 검사가 없다. 숫자가 아니면 `toEvenSize`가 `NaN`을 돌려주고 요청 URL에 `NaNxNaN`이 들어가 카카오에서 오류가 난다. 인증은 이미 거치므로(`guardProxyRequest`) 위험은 작고 오류 응답이 불친절한 정도다.
- 키 폴백이 `KAKAO_REST_API_KEY || NEXT_PUBLIC_KAKAO_REST_API_KEY`다(56~57줄). `kakao-route`는 서버 전용 키만 쓴다. `NEXT_PUBLIC_*`는 번들에 박혀 브라우저에 노출되므로 REST 키를 그 이름으로 두면 유출된다. 폴백이 있으면 그렇게 설정해도 동작해서 실수를 부추긴다. 이 프로젝트에서 그 변수가 실제로 설정돼 있는지는 `.env`를 읽지 않아 확인하지 못했다(§4).
- 이 라우트에는 테스트 파일이 없다.

### 2.4 마이그레이션·문서

- `supabase/migrations/20261117000200_survey_settings.sql:14`의 트리거 함수는 `SET search_path = public`인데 다른 마이그레이션은 `''`(빈 값)이다. 함수 본문은 `NEW.updated_at = now()`뿐이고 `SECURITY DEFINER`가 아니라 위험은 작다. 일관성을 위한 정리다.
- `README.md` 구조 트리(`features/…` 목록)에 `site-survey`가 없다(바코드 줄 다음).

## 3. 설계

### 3.1 `lib/latest-request.ts` — "마지막 요청만" 규칙 (결정 3)

```ts
// src/lib/latest-request.ts
export interface RequestTicket { isCurrent(): boolean }
export interface LatestRequest {
  begin(): RequestTicket;   // 새 요청을 시작한다. 이전에 받은 모든 티켓은 즉시 오래된 것이 된다
  invalidate(): void;       // 진행 중인 요청을 모두 오래된 것으로 만든다(마커 전환·언마운트 때)
}
export function createLatestRequest(): LatestRequest;
```

- 훅에서는 `useRef(createLatestRequest())`로 하나를 들고, 요청 직전 `const ticket = latest.current.begin()`, `await` 뒤 `if (!ticket.isCurrent()) return`로 상태 갱신을 건너뛴다. effect cleanup(`return () => latest.current.invalidate()`)에서 무효화한다.
- 순수 모듈이라 vitest(node)로 테스트한다: `begin` 두 번 → 첫 티켓은 `isCurrent() === false`, 둘째는 `true`; `invalidate` 뒤에는 모두 `false`.
- 훅 자체(React)는 테스트하지 못한다. 그래서 **경쟁 규칙을 훅이 아니라 이 모듈에 두는 것**이 설계의 핵심이다(훅은 모듈을 부르기만 한다).

### 3.2 `lib/local-date.ts` (결정 4)

```ts
// src/lib/local-date.ts
export function localDateIso(now: Date = new Date()): string; // "YYYY-MM-DD", 로컬 달력 기준
```

- `schedule/lib/week.ts`의 `todayIso`는 이 함수를 부르는 한 줄로 바꾼다(export 이름은 유지해 `dashboard` 등 기존 import를 건드리지 않는다).
- 11곳을 `localDateIso()`로 바꾼다. `export.ts`의 `this` 안 코드(`this._triggerDownloadBuffer`가 있는 메서드)는 `this`를 건드리지 않고 `dateStr` 줄만 바꾼다.
- 테스트는 시간대에 의존하지 않게 쓴다: 테스트 파일 맨 위에서 `process.env.TZ = "Asia/Seoul"`로 고정하고, `new Date(2026, 10, 15, 0, 30)`(로컬 00:30)이 `"2026-11-15"`가 됨(UTC 기준이면 전날)을 단언한다. 월초 경계(`2026-12-01 00:30` → `"2026-12-01"`)와 연말도 본다.

### 3.3 `kakao-static-map` (결정 5)

- 파라미터 읽기를 작은 순수 함수 `parseStaticMapParams(params): { lat, lng, level, width, height, mapType } | { error }`로 빼고 route는 그 결과를 쓴다. `level`은 숫자가 아니면 3, `width`·`height`는 숫자가 아니면 600·400, 범위 밖은 기존 `toEvenSize` 규칙으로 자른다. `lat`·`lng`가 숫자가 아니면 기존대로 400.
- `NEXT_PUBLIC_KAKAO_REST_API_KEY` 폴백을 지우고, 안내 문구(`.env에 KAKAO_REST_API_KEY를 설정하세요`)는 그대로 둔다.
- 순수 함수는 `lib`로 옮기거나 같은 폴더의 `params.ts`에 둔다. 테스트: 정상값, 비숫자(`"abc"`) → 기본값, 큰 값 → 상한, 홀수 → 짝수.

### 3.4 마이그레이션 (결정 6)

`supabase/migrations/20261120000000_survey_settings_search_path.sql`:
```sql
ALTER FUNCTION public.touch_survey_settings_updated_at() SET search_path = '';
```
본문이 `now()`(`pg_catalog`)뿐이라 빈 `search_path`에서도 동작한다. `supabase/migrations/README.md`(Claude)에 표 한 줄을 더한다. 사용자가 SQL Editor에서 적용한다(AGENTS.md: Supabase 로컬 실행 금지).

## 4. 범위 밖

- 취소 가드를 다른 비동기 조회에 일괄 적용하는 일(이번에는 두 곳만).
- 서버 쪽 날짜 처리 점검(이번 11곳은 모두 브라우저 코드다).
- `.env` 파일의 키 이름 점검(비밀값이라 열지 않는다). 사용자가 `NEXT_PUBLIC_KAKAO_REST_API_KEY`를 `.env`·Cloudflare 변수에 설정해 두었다면 폴백 제거 전에 `KAKAO_REST_API_KEY`로 옮겨야 한다(§6).

## 5. 위험과 검증

- **캐시된 GPS 조회 경로**: 캐시 적중은 `await` 없이 즉시 반환하므로 티켓 검사가 필요 없다. 훅이 캐시 경로까지 무효화하지 않게 한다.
- **`fetchDetail` effect 의존성**: 지금 effect의 의존성 배열(`isDetailOpen`, `selectedMarkerId`, `mode`, `marker`, `supabase`, `relatedEquipmentMarkers` 등)은 바꾸지 않는다. cleanup만 더한다.
- **날짜 대체값의 형식**: `localDateIso()`는 `YYYY-MM-DD`이고 기존과 같은 형식이다.
- **폴백 제거**: 서버에 `KAKAO_REST_API_KEY`가 없으면 기존 안내 오류(500)가 나는 경로는 그대로다.
- **검증**: 새 테스트가 먼저 실패하는 것을 확인하고 구현, `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test`.

## 6. 사용자 확인 필요 항목

1. **`NEXT_PUBLIC_KAKAO_REST_API_KEY`를 `.env`나 Cloudflare 변수에 설정해 두었는지.** 설정했다면 폴백 제거(결정 5의 일부)를 하기 전에 `KAKAO_REST_API_KEY`로 옮겨야 한다. 모르겠으면 폴백 제거만 빼고 진행한다.
2. **테스트 위치(seam) 확인**: 이 설계는 훅·라우트가 아니라 **순수 모듈 4개**(`latest-request`, `local-date`, `parseStaticMapParams`, `survey` 마이그레이션 제외)에서만 테스트한다. 훅과 라우트 연결은 화면 확인으로 본다. 이 경계(seam)로 괜찮은지 확인을 부탁한다.
3. 취소 가드를 두 곳(GPS 조회, 상세 조회)에만 적용하는 범위로 괜찮은지.
