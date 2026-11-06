# 전체 로그인 벽 설계 (지도·CCTV 포함)

작성일: 2026-10-17 · 상태: 사용자 검토 대기

## 1. 목적과 성공 기준

**목적**: 보안 강화. 로그인하지 않은 사람에게는 지도·CCTV·마커 등 앱의 어떤 데이터와 기능도 보이거나 호출되지 않게 한다.

**사용자가 확정한 것**
- 비로그인 사용자는 로그인 화면만 본다(앱 전체 잠금, "전체 로그인 벽").
- 서버 API 보호는 방식 1: 클라이언트가 `Authorization: Bearer <access_token>`을 보내고 서버가 `supabase.auth.getUser(token)`으로 검증한다.

**성공 기준**
1. 비로그인 상태에서 `/`·`/gpsmap` 모두 로그인 카드만 렌더된다. 카카오 SDK·마커 조회·ITS 호출이 일어나지 않는다.
2. 토큰 없이(또는 잘못된 토큰으로) 보호 대상 API 라우트 6개를 호출하면 401이 돌아온다.
3. ITS 키가 정적 번들에 포함되지 않는다. 로그인 후 `/api/its-key`로만 받는다.
4. 로그인 사용자의 기존 기능(지도·마커·CCTV·날씨·길찾기·로드뷰·캡처)은 그대로 동작한다.
5. `tsc`·`eslint`·`npm test`·`next build` 통과, 홈 First Load JS 295 kB 이하.

**범위 밖**: 계정별/팀별 열람 권한 분리, 쿠키 기반 세션(SSR 인증)으로의 전환, JWKS 로컬 검증.

## 2. 제약 (확인된 사실)

- 세션은 쿠키가 아니라 localStorage에 저장된다(`src/lib/supabase/client.ts`, `persistSession: true`). → Next 미들웨어는 로그인 여부를 알 수 없다. **페이지 잠금은 클라이언트, API 잠금은 Bearer 토큰.**
- 카카오 JavaScript 키는 브라우저 공개 키이며 도메인 제한이 보호 수단이다. 키를 숨기는 것이 아니라 SDK를 로그인 후에만 불러온다.
- ITS(9443)는 서버 경유가 막혀 브라우저가 직접 호출한다. 키가 브라우저로 가는 것은 기존 트레이드오프이며 이번에도 유지한다(로그인 사용자 한정).
- 이전 작업(`18e7e8d`)에서 마커 4개 테이블은 이미 RLS로 authenticated 전용이 됐다(SQL 적용은 사용자 몫).

## 3. 설계

### 3.1 페이지 잠금 — `AuthGate`
- 신규 `src/features/map-marker/components/auth-gate.tsx` (`"use client"`).
- `useAuthSession()`의 `isLoading`·`isAuthenticated`를 본다.
  - 마운트 전 / 세션 복원 중: 로딩 표시(하이드레이션 어긋남 방지를 위해 `useHasMounted` 사용 — 프로젝트 규칙: 마운트 판정 경계 준수).
  - 비로그인: 전체 화면 로그인 카드. 기존 `AuthModal`을 재사용한다.
  - 로그인: `children` 렌더.
- 적용 위치: `src/app/page.tsx`(`MapMarkerPage`)와 `src/app/gpsmap/page.tsx`(`GpsMapPage`)를 각각 감싼다. 두 페이지 모두 `"use client"` 경계 안에서 처리한다.
- `map-marker-page.tsx`의 `useActiveMarkers()`는 스토어 쓰기 부수효과가 있어 "한 곳에서만 호출" 규칙이 있다. 게이트가 그 컴포넌트를 **감싸는 바깥**에 있으므로 호출 위치는 바뀌지 않는다.
- 삭제: `login-required-notice.tsx`와 `map-marker-page.tsx`의 사용부(게이트가 대체).
- 정리: `nav.ts`의 CCTV `auth: false` 주석("인증을 걸지 않는다")을 새 정책에 맞게 고친다. 앱 전체가 잠기므로 `auth` 플래그는 그대로 두어도 동작은 같다.

### 3.2 카카오 SDK 지연 로드
- `src/app/layout.tsx`에서 `<KakaoSdkScript />` 제거, `src/components/kakao-sdk-script.tsx` 삭제.
- `use-kakao-map-sdk.ts`의 `loadKakaoSdk`가 이미 동적 삽입 경로를 갖고 있어 유일한 로더가 된다. 레이아웃이 미리 넣은 script를 기다리는 분기(주석 "레이아웃에서 미리 넣은 script가 있으면…")는 더 이상 만날 일이 없으므로 구현 시 해당 분기를 점검한다.
- `gpsmap` 쪽이 `window.kakao`를 레이아웃 script에 의존하는지 구현 단계에서 확인한다(`use-kakao-map-sdk` 경유가 아니면 같은 로더로 맞춘다).

### 3.3 서버 API 토큰 검증
- `src/lib/api/proxy-guard.ts`의 `guardProxyRequest`를 **async**로 바꾸고 토큰 검증을 추가한다. 순서: 출처 검사 → 레이트리밋 → 토큰 검증.
- 신규 `src/lib/api/verify-auth-token.ts`:
  - `Authorization: Bearer …`에서 토큰 추출 → `createClient(url, anonKey)`로 만든 서버용 클라이언트의 `auth.getUser(token)` 호출 → 사용자 반환 또는 `null`.
  - Supabase URL·anon 키는 서버 env(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)에서 읽는다. 둘 중 하나라도 없으면 **fail closed**(401이 아니라 500 + 설정 오류 메시지)로 처리해 "검증이 꺼진 채 열림"을 막는다.
- 실패 응답: `401 { error: "로그인이 필요합니다." }`.
- 적용 라우트 6개(모두 `guardProxyRequest`를 이미 호출): `its-key`, `kakao-route`, `kakao-static-map`, `map-tile-proxy`, `roadview-dates`, `worksite-weather`. 각 라우트에서 `guardProxyRequest(request)` → `await guardProxyRequest(request)`로만 바꾸면 된다.
- 클라이언트: 신규 `src/lib/api/authed-fetch.ts`의 `authedFetch(input, init)`이 `getSupabaseBrowserClient().auth.getSession()`의 access token을 `Authorization` 헤더에 실어 `fetch`한다. 세션이 없으면 토큰 없이 보내 서버가 401로 응답한다. 교체 대상 호출 지점:
  - `roadview-modal.tsx`(`/api/roadview-dates`)
  - `map-viewport-capture.ts`(`/api/map-tile-proxy`)
  - `kakao-route-client.ts`(`/api/kakao-route`)
  - `worksite-weather-api.ts`(`/api/worksite-weather`)
  - `its-client.ts`(`/api/its-key`)
  - `kakao-static-map`은 `src/` 내 호출처가 검색되지 않았다. 구현 시 호출처를 다시 확인하고, 없으면 라우트만 보호한다.
- 401 처리: 토큰 만료 등으로 401을 받으면 각 호출부의 기존 오류 경로(토스트·재시도 UI)를 그대로 쓴다. 별도 자동 갱신 로직은 만들지 않는다(`autoRefreshToken: true`가 이미 있다).

### 3.4 CCTV·ITS 키
- `its-client.ts`의 `getApiKey()`에서 `process.env.NEXT_PUBLIC_ITS_API_KEY` 인라인 경로를 제거한다. 키는 로그인 후 `authedFetch("/api/its-key")`로만 받는다.
- `src/app/api/its-key/route.ts`는 이미 `NEXT_PUBLIC_ITS_API_KEY ?? ITS_API_KEY`를 모두 읽는다. 환경변수는 서버 전용 `ITS_API_KEY`로 통일하고, 라우트의 폴백 읽기·에러 문구도 `ITS_API_KEY` 기준으로 정리한다.
- **사용자 작업**: `.env.local`과 Cloudflare 변수에서 `NEXT_PUBLIC_ITS_API_KEY`를 `ITS_API_KEY`로 바꾼다. 바꾸지 않으면 CCTV가 키 오류를 낸다.
- `.env.local`의 안내 주석(ITS 항목)도 같은 내용으로 고치도록 안내한다(시크릿 파일이라 값은 건드리지 않는다).

### 3.5 데이터 흐름

```
방문 → AuthGate(세션 복원) ─ 비로그인 → 로그인 카드 (SDK·API 호출 없음)
                          └ 로그인   → 앱 마운트
                                       ├ useMapMarkersQuery → Supabase (RLS authenticated)
                                       ├ use-kakao-map-sdk  → 카카오 SDK 동적 로드
                                       └ authedFetch(Bearer) → /api/* → getUser(token) → 처리/401
```

## 4. 에러 처리

| 상황 | 동작 |
|---|---|
| 세션 만료 중 API 호출 | 서버 401 → 호출부 기존 오류 UI. `onAuthStateChange`가 세션을 지우면 게이트가 로그인 카드로 전환 |
| Supabase 환경변수 누락(서버) | 보호 라우트가 500으로 닫힌다(열리지 않음) |
| `getUser` 네트워크 실패 | 401이 아니라 503으로 구분해 응답(일시 오류를 로그인 문제로 오인하지 않게) |
| `ITS_API_KEY` 미설정 | 기존대로 500 + 설정 안내 문구 |

## 5. 테스트

단위(vitest, `.ts`만 실행됨 — `.tsx` 테스트 금지):
- `verify-auth-token.test.ts`: 헤더 없음/형식 오류/유효 토큰/무효 토큰/환경변수 누락/네트워크 실패.
- `proxy-guard.test.ts`(기존 파일 확장): 토큰 없을 때 401, 출처·레이트리밋 우선순위 유지.
- `authed-fetch.test.ts`: 세션이 있으면 Bearer 헤더 부착, 없으면 미부착.
- 라우트 테스트 1개(예: `its-key`): 토큰 없으면 401, 유효하면 키 반환(모킹).

수동(dev 서버, 로그인 계정 필요 — 사용자 확인):
- 비로그인: 로그인 카드만 보이고 네트워크 탭에 `dapi.kakao.com`·Supabase REST·`openapi.its.go.kr` 요청이 없다.
- 로그인: 지도·마커·CCTV·날씨·길찾기·로드뷰·지도 캡처 정상.
- 토큰 없이 `curl /api/its-key` → 401.

빌드: `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test`, `npx next build`(홈 295 kB 이하).

## 6. 배포 순서와 위험

1. 코드 배포와 **같은 시점에** Cloudflare 변수 `NEXT_PUBLIC_ITS_API_KEY` → `ITS_API_KEY` 교체(교체 전에는 CCTV 오류).
2. (이전 작업) `20261017000000_require_login_for_marker_read.sql` 적용.
3. 되돌리기 어려운 점: 앱 전체가 잠기므로, 공유 링크로 비로그인 열람 중인 곳이 있다면 모두 막힌다.
4. 보안 한계(명시): 로그인한 사용자에게는 ITS 키와 카카오 키가 여전히 브라우저로 전달된다. 이번 변경은 "비로그인 차단"이며 "로그인 사용자의 키 접근 차단"이 아니다.
