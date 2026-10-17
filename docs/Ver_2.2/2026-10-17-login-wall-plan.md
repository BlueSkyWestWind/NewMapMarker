# 전체 로그인 벽 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비로그인 사용자에게는 로그인 카드만 보이고, 서버 API 6개는 Bearer 토큰 없이는 401을 돌려주며, ITS 키는 정적 번들에서 사라진다.

**Architecture:** 클라이언트 `AuthGate`가 앱을 감싸고(세션은 localStorage라 서버 미들웨어 불가), 서버 라우트는 `guardProxyRequest`(async)에서 `Authorization: Bearer`를 Supabase `auth.getUser(token)`로 검증한다. 카카오 SDK는 레이아웃 정적 삽입을 없애고 로그인 후 지도 마운트 시 동적 로드한다.

**Tech Stack:** Next.js 15 App Router, `@supabase/supabase-js`, vitest(`.ts`만 실행), Cloudflare(OpenNext).

**Spec:** `docs/Ver_2.2/2026-10-17-login-wall-design.md`

## Global Constraints

- 패키지 매니저 npm. 새 의존성 추가 금지(`jose` 등 불가).
- Supabase는 로컬 실행 금지. 이 계획은 SQL을 만들지 않는다(마커 RLS는 `18e7e8d`에서 완료).
- `.tsx` 테스트는 vitest가 실행하지 않는다 → 테스트는 `.ts` 파일로만 작성한다.
- 서버 검증 실패 응답: 로그인 없음/무효 → `401 {"error":"로그인이 필요합니다."}`, Supabase 서버 env 누락 → `500`(열리지 않음), `getUser` 네트워크/5xx 실패 → `503`.
- 라우트 보호 순서: 출처 검사 → 레이트리밋 → 토큰 검증.
- `useActiveMarkers`는 `map-marker-page`에서만 호출(변경 금지). 마운트 판정은 `useHasMounted`.
- 시크릿 파일(`.env.local`) 값은 건드리지 않는다. 환경변수 이름 변경은 사용자에게 안내만 한다.
- 커밋·푸시는 사용자가 요청할 때만 한다(각 태스크에 커밋 단계 없음).
- 검증 기준선: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test` · `npx next build`, 홈 First Load JS **295 kB 이하**(현재 291 kB).

## Review Focus

1. **`await` 누락**: `guardProxyRequest`가 Promise를 돌려주면 `if (blocked)`가 항상 참이라 모든 요청이 막힌다(tsc가 못 잡음) → Task 2에서 6개 라우트 모두 `await` 확인 + `its-key` 라우트 테스트로 "유효 토큰은 통과"를 고정.
2. **형식이 틀린 헤더**(`Basic x`, `Bearer ` 빈 토큰, 대소문자 `bearer`): 500이 아니라 401.
3. **Supabase 일시 장애**: 로그인 문제로 오인하지 않게 503.
4. **공유 캐시 누수**: `roadview-dates`가 `Cache-Control: public, s-maxage=86400`을 보낸다 → 로그인 응답이 엣지에 캐시돼 비로그인에게 나가지 않도록 `private`로 바꾼다(Task 2).
5. **하이드레이션**: `AuthGate` 서버 HTML과 클라이언트 첫 렌더가 같아야 한다(둘 다 로딩 표시).

## File Structure

| 파일 | 책임 |
|---|---|
| `src/lib/api/verify-auth-token.ts` (신규) | Bearer 헤더 파싱 + Supabase `getUser` 검증, 결과 타입 반환 |
| `src/lib/api/proxy-guard.ts` (수정) | 출처→레이트리밋→토큰 순으로 가드, async |
| `src/lib/api/authed-fetch.ts` (신규) | 클라이언트 `fetch` 래퍼, 세션 access token을 Bearer로 부착 |
| `src/features/map-marker/components/auth-gate.tsx` (신규) | 세션 복원 대기 / 로그인 카드 / children |
| `src/app/api/*/route.ts` 6개 (수정) | `await guardProxyRequest` |
| `src/features/cctv/lib/its-client.ts`, `src/app/api/its-key/route.ts` (수정) | ITS 키 번들 제거 |
| `src/app/layout.tsx`, `src/components/kakao-sdk-script.tsx` | SDK 정적 삽입 제거(파일 삭제) |

---

### Task 1: 토큰 검증 헬퍼

**Files:**
- Create: `src/lib/api/verify-auth-token.ts`
- Test: `src/lib/api/verify-auth-token.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type AuthCheck =
    | { ok: true; userId: string }
    | { ok: false; status: 401 | 500 | 503; error: string };
  export async function verifyAuthToken(request: Request): Promise<AuthCheck>;
  ```

- [ ] **Step 1: 실패하는 테스트 작성** — `@supabase/supabase-js`의 `createClient`를 `vi.mock`으로 대체해 `auth.getUser`를 제어한다. 요청은 `new Request("https://x.example/api/a", { headers })`. 케이스(이름 그대로):
  - `"Authorization 헤더가 없으면 401"` → `{ ok:false, status:401, error:"로그인이 필요합니다." }`, `getUser` 호출 0회
  - `"Bearer가 아닌 스킴(Basic)은 401"`, `"Bearer 뒤 토큰이 비면 401"`, `"소문자 bearer도 토큰으로 인정"`(`getUser`가 `"tok"`로 호출됨)
  - `"유효한 토큰이면 ok와 userId"` → `getUser` 가 `{ data:{ user:{ id:"u1" } }, error:null }` → `{ ok:true, userId:"u1" }`
  - `"getUser가 인증 오류(status 401)를 돌려주면 401"`
  - `"getUser가 AuthRetryableFetchError면 503"`, `"getUser가 status 500이면 503"`
  - `"서버 Supabase env가 없으면 500 (열리지 않음)"` → `NEXT_PUBLIC_SUPABASE_URL` 삭제 후 호출, `status:500`, `getUser` 호출 0회

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/lib/api/verify-auth-token.test.ts` · Expected: FAIL(모듈 없음).

- [ ] **Step 3: 구현** — `verifyAuthToken`. env는 호출 시점에 `process.env.NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`에서 읽는다. 클라이언트는 `createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })`를 호출마다 만든다(요청 간 상태 공유 금지). 헤더 파싱은 정규식 `^Bearer\s+(.+)$`(대소문자 무시), 토큰은 trim.

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/lib/api/verify-auth-token.test.ts` · Expected: PASS.

---

### Task 2: 가드 async화 + 6개 라우트 적용

**Files:**
- Modify: `src/lib/api/proxy-guard.ts` (`guardProxyRequest`)
- Modify: `src/app/api/{its-key,kakao-route,kakao-static-map,map-tile-proxy,roadview-dates,worksite-weather}/route.ts`
- Modify: `src/app/api/roadview-dates/route.ts` (`Cache-Control`)
- Modify: `src/app/api/kakao-route/route.test.ts` (토큰 모킹)
- Test: `src/lib/api/proxy-guard.test.ts` (확장), `src/app/api/its-key/route.test.ts` (신규)

**Interfaces:**
- Consumes: `verifyAuthToken(request: Request): Promise<AuthCheck>` (Task 1)
- Produces: `export async function guardProxyRequest(request: NextRequest): Promise<NextResponse | null>` — 시그니처가 `Promise`로 바뀐다. 통과 시 `null`.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `proxy-guard.test.ts`에 `describe("guardProxyRequest")` 추가, `./verify-auth-token`을 `vi.mock`: `"토큰 검증이 실패하면 그 status/error로 응답"`(401과 503 각각), `"검증 통과면 null"`, `"출처가 다르면 토큰 검증 전에 403"`(`verifyAuthToken` 호출 0회).
  - `its-key/route.test.ts`: `verifyAuthToken`을 모킹. `"토큰이 없으면 401이고 키를 내려주지 않는다"`(응답 본문에 키 문자열 없음), `"유효 토큰이면 200 {key}"`(`process.env.ITS_API_KEY="k"`). ← Review Focus 1 고정.
  - `kakao-route/route.test.ts`: 파일 상단에 `vi.mock("@/lib/api/verify-auth-token", () => ({ verifyAuthToken: async () => ({ ok: true, userId: "u" }) }))` 추가(기존 케이스는 토큰 없이 호출하므로 그대로 통과해야 한다).

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/lib/api src/app/api` · Expected: 새 케이스 FAIL.

- [ ] **Step 3: 구현**
  - `guardProxyRequest`를 `async`로: 기존 두 검사 뒤에 `const auth = await verifyAuthToken(request); if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });`.
  - 6개 라우트 모두 `const blocked = await guardProxyRequest(request);`로 교체(`await` 누락 금지 — `Grep "guardProxyRequest\(" src/app`로 6건 전부 확인).
  - `roadview-dates`의 성공 `Cache-Control`을 `private, max-age=3600`으로 변경(`s-maxage` 제거).

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run` · Expected: 전체 PASS(기존 333개 포함).

---

### Task 3: 클라이언트 `authedFetch`와 호출부 교체

**Files:**
- Create: `src/lib/api/authed-fetch.ts`
- Test: `src/lib/api/authed-fetch.test.ts`
- Modify: `src/features/map-marker/components/modals/roadview-modal.tsx:59`(로컬 `/api/roadview-dates` 호출만), `src/features/map-marker/lib/map-viewport-capture.ts:115-118`, `src/features/route/lib/kakao-route-client.ts:20`, `src/features/worksite-weather/lib/worksite-weather-api.ts:31`

**Interfaces:**
- Produces: `export async function authedFetch(input: string, init?: RequestInit): Promise<Response>` — 세션이 있으면 `Authorization: Bearer <access_token>`을 기존 헤더에 **병합**해 `fetch`, 없으면 헤더 없이 `fetch`.
- Consumes: `getSupabaseBrowserClient()`(`@/lib/supabase/client`)

- [ ] **Step 1: 실패하는 테스트 작성** — `getSupabaseBrowserClient`와 전역 `fetch`를 모킹.
  - `"세션이 있으면 Bearer 헤더를 붙인다"`(`fetch`가 `Authorization: "Bearer tok"`로 호출됨)
  - `"기존 헤더(Content-Type)를 보존한다"`
  - `"세션이 없으면 Authorization을 붙이지 않는다"`
  - `"supabase 클라이언트가 null이어도 fetch는 수행"`

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/lib/api/authed-fetch.test.ts` · Expected: FAIL.

- [ ] **Step 3: 구현** — `authedFetch`. 토큰은 매 호출 `supabase.auth.getSession()`에서 읽는다(만료 시 supabase-js가 갱신). 헤더 병합은 `new Headers(init?.headers)`.

- [ ] **Step 4: 호출부 교체** — 위 4개 파일의 `fetch(` → `authedFetch(`. `roadview-modal.tsx`의 `fetchDates`는 로컬 URL과 `https://rv.map.kakao.com/...` 폴백 둘 다에 쓰이므로, 외부 URL에는 토큰을 보내지 않도록 `url.startsWith("/api/")`일 때만 `authedFetch`, 아니면 `fetch`를 쓴다(카카오 서버로 사용자 토큰이 새면 안 된다). `map-viewport-capture.ts`는 `{ cache: "force-cache" }` 옵션을 그대로 유지.

- [ ] **Step 5: 통과 확인** — Run: `npx tsc --noEmit && npx vitest run` · Expected: 에러 없음, 전체 PASS.

---

### Task 4: ITS 키 번들 제거 (CCTV)

**Files:**
- Modify: `src/features/cctv/lib/its-client.ts` (`getApiKey`, `fetchApiKeyFromServer`)
- Modify: `src/app/api/its-key/route.ts` (env 읽기·문구)
- Modify: `src/features/shell/types/nav.ts` (CCTV 주석), `README.md`(ITS 섹션), `docs/Ver_2.2/2026-10-17-login-wall-design.md`는 변경 없음
- Test: `src/features/cctv/lib/cctv-api.test.ts` 또는 `its-client` 관련 기존 테스트가 `NEXT_PUBLIC_ITS_API_KEY`에 의존하는지 확인(없으면 신규 테스트 불필요)

**Interfaces:**
- Consumes: `authedFetch` (Task 3)

- [ ] **Step 1: 의존 확인** — Run: `Grep NEXT_PUBLIC_ITS_API_KEY src` · 테스트가 이 env를 쓰면 그 테스트를 `authedFetch` 모킹 방식으로 바꾼다.

- [ ] **Step 2: 구현**
  - `its-client.ts`: `getApiKey()`에서 `process.env.NEXT_PUBLIC_ITS_API_KEY` 인라인 분기를 삭제하고 항상 서버에서 받는다. `fetchApiKeyFromServer`는 `authedFetch("/api/its-key", { cache: "no-store" })`. 상단 ⚠️ 주석은 "로그인한 사용자에게만 키가 전달된다"로 갱신.
  - `its-key/route.ts`: `process.env.ITS_API_KEY`만 읽는다(`NEXT_PUBLIC_ITS_API_KEY` 폴백 삭제). 에러 문구의 `(또는 NEXT_PUBLIC_ITS_API_KEY)` 삭제. 라우트 상단 주석을 "로그인 사용자 한정"으로 갱신.
  - `nav.ts`: CCTV 위 주석("인증을 걸지 않는다")을 "앱 전체가 로그인 벽 안에 있다"로 교체.
  - `README.md` ITS 섹션: 변수명은 `ITS_API_KEY`만, 비로그인에게는 키가 전달되지 않음을 명시.

- [ ] **Step 3: 확인** — Run: `Grep NEXT_PUBLIC_ITS_API_KEY src docs/Ver_2.2 README.md` · Expected: `src`와 `README.md`에는 0건. Run: `npx tsc --noEmit && npx vitest run` · Expected: PASS.

- [ ] **Step 4: 사용자에게 안내(코드 아님)** — `.env.local`과 Cloudflare 변수에서 `NEXT_PUBLIC_ITS_API_KEY` → `ITS_API_KEY`로 이름 변경, 개발 서버 재시작.

---

### Task 5: `AuthGate`와 페이지 적용, 안내 컴포넌트 삭제

**Files:**
- Create: `src/features/map-marker/components/auth-gate.tsx`
- Modify: `src/app/page.tsx`, `src/app/gpsmap/page.tsx`
- Modify: `src/features/map-marker/components/map-marker-page.tsx` (`LoginRequiredNotice` import·사용 제거)
- Delete: `src/features/map-marker/components/map/login-required-notice.tsx`

**Interfaces:**
- Produces: `export function AuthGate({ children }: { children: ReactNode }): JSX.Element` (`"use client"`)
- Consumes: `useAuthSession()`(`isLoading`, `isAuthenticated`), `useHasMounted()`, `AuthModal({ open, onOpenChange })`

- [ ] **Step 1: 구현** — 동작 3분기:
  - `!hasMounted || isLoading` → 전체 화면 로딩(`h-[100dvh]`, 기존 gpsmap의 "불러오는 중..." 스타일 재사용). 서버·클라이언트 첫 렌더가 이 분기로 같다(Review Focus 5).
  - `!isAuthenticated` → 전체 화면 카드: 잠금 아이콘, 제목 "로그인이 필요합니다", 설명 한 줄, "로그인" 버튼(클릭 시 `AuthModal` 열림). 새 shadcn 컴포넌트 추가 금지.
  - 그 외 → `children`.
- [ ] **Step 2: 페이지 적용** — `app/page.tsx`는 `<AuthGate><MapMarkerPage /></AuthGate>`, `app/gpsmap/page.tsx`는 `<AuthGate><GpsMapPage /></AuthGate>`(gpsmap에 `"use client"`가 없으면 추가). `GpsMapPage` 내부의 기존 로그인 분기는 그대로 둔다(중복이지만 동작 변경 없음, YAGNI).
- [ ] **Step 3: 안내 컴포넌트 삭제** — `login-required-notice.tsx` 삭제, `map-marker-page.tsx`에서 import와 `<LoginRequiredNotice />` 제거.
- [ ] **Step 4: 확인** — Run: `npx tsc --noEmit && npx eslint . --max-warnings=0` · Expected: 에러/경고 0. ESLint는 미사용 import를 못 잡으므로 `Grep LoginRequiredNotice src` 로 0건 직접 확인.

---

### Task 6: 카카오 SDK 지연 로드

**Files:**
- Modify: `src/app/layout.tsx` (`KakaoSdkScript` import·사용 제거)
- Delete: `src/components/kakao-sdk-script.tsx`
- Modify(필요 시): `src/features/map-marker/hooks/use-kakao-map-sdk.ts` ("레이아웃에서 미리 넣은 script" 분기 주석)

- [ ] **Step 1: 사전 확인** — Run: `Grep KakaoSdkScript|kakao-map-sdk src` · `KAKAO_SDK_SCRIPT_ID`("kakao-map-sdk")를 쓰는 곳이 `use-kakao-map-sdk.ts`뿐인지, 지도 사용처(`kakao-map-canvas`, `gpsmap-page`)가 모두 `useKakaoMapSdk()` 경유인지 확인. 경유하지 않는 곳이 있으면 그 곳을 `useKakaoMapSdk()`로 맞춘다.
- [ ] **Step 2: 구현** — `layout.tsx`에서 `<KakaoSdkScript />`와 import 삭제, `kakao-sdk-script.tsx` 삭제. `use-kakao-map-sdk.ts`의 기존 script 분기는 동작을 바꾸지 않고 주석만 "정적 삽입 없음, 재시도 시 남은 script 처리용"으로 고친다.
- [ ] **Step 3: 확인** — Run: `npx tsc --noEmit && npx next build` · Expected: 성공, 홈 First Load JS ≤ 295 kB. 이어서 `npm run dev`로 비로그인 상태에서 홈 접속 시 로그인 카드가 보이고, 브라우저 네트워크에 `dapi.kakao.com` 요청이 없는지 확인(수동, 사용자 협조).

---

### Task 7: 최종 검증

- [ ] **Step 1:** Run: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test` · `npx next build` · Expected: 전부 통과, 홈 ≤ 295 kB.
- [ ] **Step 2:** Run: `Grep "guardProxyRequest\(" src/app` · Expected: 6건 모두 `await`가 앞에 있다.
- [ ] **Step 3:** dev 서버를 띄워 `curl -i http://localhost:3000/api/its-key` → `401`. (토큰 없는 호출. 로그인 후 동작은 사용자가 수동 확인: 지도·마커·CCTV·날씨·길찾기·로드뷰·지도 캡처.)
- [ ] **Step 4:** 사용자에게 배포 순서 전달: 코드 배포 + Cloudflare `ITS_API_KEY` 교체를 같은 시점에 → 이후 `20261017000000_require_login_for_marker_read.sql` 적용.
