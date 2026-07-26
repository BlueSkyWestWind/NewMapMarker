# 아키텍처 문서 (Architecture)

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 문서 버전: **Ver_1.0**
- 최종 갱신: 2026-07-25
- 관련 문서: [PLAN](./Ver_1.0_PLAN.md) · [PRD](./Ver_1.0_PRD.md) · [IA](./Ver_1.0_IA.md) · [DATABASE](./DATABASE.md) · [COMPONENT](./COMPONENT.md) · [STATE](./STATE.md) · [BUSINESS_RULE](./BUSINESS_RULE.md) · [API](./API.md)

> 이 문서는 **"왜 이 구조인가"**를 다룬다. 화면 배치는 IA, 코드 규칙은 CODING_GUIDE를 참조한다.

---

## 1. 시스템 개요

MapMarker Pro는 **단일 Next.js 애플리케이션**이 프론트엔드와 얇은 서버 프록시를 함께 담당하는 구조다.
별도의 백엔드 서버는 없으며, 데이터 저장·인증은 Supabase(BaaS)에 위임한다.

```
┌──────────────────────────────────────────────────────────────────────┐
│  브라우저 (Chromium 데스크톱)                                          │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Next.js 15 App Router (Client Components 중심)                 │  │
│  │   UI 상태: Zustand   │  서버 상태: TanStack Query               │  │
│  │   지도: Kakao Maps JS SDK (services, clusterer)                 │  │
│  └───────┬───────────────────────┬──────────────────┬─────────────┘  │
└──────────┼───────────────────────┼──────────────────┼────────────────┘
           │ ① 직접 호출            │ ② 서버 프록시 경유  │ ③ 직접 호출
           ▼                       ▼                  ▼
   ┌───────────────┐    ┌────────────────────┐   ┌──────────────┐
   │ Kakao Maps    │    │ Next Route Handler │   │  Supabase    │
   │ JS SDK / 타일 │    │ (Cloudflare Worker)│   │  PG + Auth   │
   └───────────────┘    └─────────┬──────────┘   └──────────────┘
                                  │ 서버 전용 키·allowlist
                                  ▼
                     ┌───────────────────────────┐
                     │ Kakao REST(정적맵/로드뷰)  │
                     │ 지도 타일 호스트           │
                     └───────────────────────────┘
```

| 경로 | 대상 | 이유 |
| --- | --- | --- |
| ① 직접 | 지도 SDK 렌더·지오코딩·클러스터 | SDK가 브라우저 전용이며 JS 키는 도메인 제한으로 보호됨 |
| ② 프록시 | 정적맵 · 타일 · 로드뷰 촬영일자 | **REST 키 은닉** + CORS 회피 + SSRF 차단(NFR-01~03) |
| ③ 직접 | 마커·정보·ERP·축전지 CRUD, 인증 | anon 키 + **RLS**로 권한을 DB에서 강제 |

## 2. 아키텍처 결정 기록 (ADR)

| ID | 결정 | 대안 | 채택 이유 | 트레이드오프 |
| --- | --- | --- | --- | --- |
| AD-01 | Next.js 15 App Router + TypeScript | 기존 바닐라 JS 유지 | 모듈 경계·타입 안전성 확보(PLAN §1) | 번들 크기 증가(홈 482 kB) |
| AD-02 | Supabase 직접 호출(BaaS) | 자체 API 서버 | 운영 인력 없이 인증·RLS·PG 확보 | 복잡 트랜잭션은 RPC 없이는 불가 → RK4 |
| AD-03 | 외부 지도 리소스는 **서버 프록시 단일 경로** | 클라이언트 직접 호출 | REST 키 노출·SSRF 차단 | 프록시 장애 시 캡처 불가 → 타일 폴백으로 완화 |
| AD-04 | Cloudflare Workers + OpenNext | Vercel / 사내 Node 서버 | 사내 배포 리드타임 단축, Git 연동 | Node 런타임 제약(`nodejs_compat` 필요) |
| AD-05 | 상태 이원화 — Zustand(UI) / TanStack Query(서버) | 단일 전역 스토어 | 캐시·무효화 책임을 Query에 위임 | 두 체계 경계 규칙 필요 → [STATE](./STATE.md) §2 |
| AD-06 | 그룹 구조를 **유효 키 파생**으로 계산 | `parent_marker_id` 만 신뢰 | 엑셀 재업로드·복원에도 구조 유지(FR-23) | 판정 로직이 앱에 존재 → DB 단독 정합성 보장 불가 |
| AD-07 | ERP 79열을 `raw` jsonb로 **원본 보존** | 매핑 컬럼만 저장 | 원본 포맷 변동 시 재파싱 가능(RK5) | 저장 용량 증가 |
| AD-08 | 무거운 모달은 `next/dynamic` 지연 로드 | 정적 import | 홈 First Load 억제(NFR-07/08) | 최초 모달 오픈 시 로드 지연 |
| AD-09 | 데스크톱 전용, 사이드바 340px 고정 | 반응형 | 정보 밀도 우선, 표 줄바꿈 금지 규칙 유지 | 모바일 미지원(PRD §9) |

## 3. 레이어 구조

```
┌─────────────────────────────────────────────────────────┐
│ L5  화면 (app/)          라우트·레이아웃·Providers        │
├─────────────────────────────────────────────────────────┤
│ L4  기능 컴포넌트         features/*/components           │
│                          map · sidebar · modals          │
├─────────────────────────────────────────────────────────┤
│ L3  상태·훅              store/ (Zustand) · hooks/        │
│                          use-active-markers 등            │
├─────────────────────────────────────────────────────────┤
│ L2  도메인 로직           features/*/lib                  │
│                          address-group · marker-filters   │
│                          map-capture-stitch · excel/*     │
├─────────────────────────────────────────────────────────┤
│ L1  데이터 접근           features/map-marker/api.ts       │
│                          lib/supabase/client.ts           │
├─────────────────────────────────────────────────────────┤
│ L0  외부                  Supabase · Kakao · VWorld        │
└─────────────────────────────────────────────────────────┘
```

### 3.1 레이어 규칙

| 규칙 | 내용 |
| --- | --- |
| A1 | 의존 방향은 **위 → 아래** 단방향. L2가 L3(store)를 import하지 않는다 |
| A2 | **snake_case ↔ camelCase 변환은 L1(`api.ts`)에서만** 수행한다 (IA §12) |
| A3 | L2 도메인 로직은 **순수 함수**로 유지해 단위 테스트 가능하게 한다 |
| A4 | 컴포넌트(L4)는 Supabase 클라이언트를 직접 import하지 않고 훅을 경유한다 |
| A5 | 외부 SDK(`window.kakao`) 접근은 지도 컴포넌트와 `lib/map-*` 모듈로 한정한다 |

> ⚠️ 현행 예외: `modals/marker-detail-modal.tsx`가 L2 성격의 그룹 조작 로직을 내포한다(검수 G1). → [CR-002](./CHANGE_REQUEST/CR-002.md), [CR-003](./CHANGE_REQUEST/CR-003.md)

## 4. 런타임 · 배포 토폴로지

```
GitHub (BlueSkyWestWind/NewMapMarker)
   │  push
   ▼
Cloudflare Workers (Git 연동)
   │  Deploy command: npm run deploy
   │   = opennextjs-cloudflare build && opennextjs-cloudflare deploy
   │  Build command: (비움)
   ▼
Worker: newmarker
   ├─ compatibility flag : nodejs_compat
   ├─ Node               : 22 (.nvmrc 고정)
   ├─ WORKER_SELF_REFERENCE : newmarker
   └─ 환경변수(런타임 주입) → PublicEnvScript로 브라우저 전역 노출
```

| 항목 | 값 | 근거 |
| --- | --- | --- |
| Worker 이름 · service · `package.json` name | 모두 `newmarker`로 일치 | 불일치 시 self-reference 실패 |
| Build command | **비움** | OpenNext 어댑터가 빌드까지 수행 |
| 환경변수 주입 | 빌드 타임 인라인이 아닌 **런타임** | Workers에서 `process.env` 인라인이 동작하지 않음 |

### 4.1 환경변수

| 구분 | 변수 | 노출 |
| --- | --- | --- |
| 필수 | `NEXT_PUBLIC_SUPABASE_URL` | 클라이언트 |
| 필수 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 클라이언트 |
| 필수 | `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` | 클라이언트(JS 키, 도메인 제한 필수) |
| 선택 | `KAKAO_REST_API_KEY` | **서버 전용** — `NEXT_PUBLIC_` 금지(NFR-02) |
| 선택 | `NEXT_PUBLIC_SITE_URL` | origin allowlist 구성 |
| 선택 | `PROXY_ALLOWED_ORIGINS` | 쉼표 구분 추가 origin |

## 5. 부트스트랩 시퀀스

```
1. app/layout.tsx 렌더
2. PublicEnvScript      → window에 공개 env 주입 (Workers 런타임 대응)
3. KakaoSdkScript       → SDK 로드 (libraries=services,clusterer)
4. Providers            → QueryClient · Auth · Theme · Toaster
5. page.tsx (MapMarkerPage)
   5-1. use-kakao-map-sdk    SDK ready 감시
   5-2. use-auth-session     Supabase 세션 조회·구독
   5-3. use-map-markers-query 마커/축전지 일괄 조회 → 캐시
   5-4. 지도 생성 (중심 35.159542, 126.8526012 / level 6)
   5-5. use-active-markers   모드+필터+대기마커 → 렌더 대상 산출
   5-6. 마커·클러스터 렌더
```

**순서 제약**: 4단계 이전에 SDK 전역이 준비되지 않으면 지도 생성이 실패한다. `use-kakao-map-sdk`의 ready 플래그를 게이트로 사용한다.

## 6. 주요 데이터 흐름

### 6.1 조회 (Read)

```
Supabase ──select──> api.ts (snake→camel)
   ──> useQuery(["map-marker","markers"])  MapMarkersPayload
   ──> use-active-markers
         ├ 모드 필터(장비/축전지/위치)
         ├ marker-filters 적용 (+제외 사유 집계)
         ├ 대기 마커 병합(pending*)
         └ 렌더 조건: parent_marker_id == null || detached_visible == true
   ──> 지도 마커 레이어 · 사이드바 마커 목록
```

### 6.2 엑셀 업로드 (Write)

```
파일 → excel/data-manager/parse | erp-parse
   → headers 매핑 검증 (누락 시 중단)
   → geocode.ts 배치 큐(캐시·실패 목록)
   → api.ts upsert(markers / information / erp_details)
   → address-group 재판정(유효 키 기준 → 분리 상태 유지)
   → queryClient.invalidateQueries(["map-marker","markers"])
   → 토스트: 성공/중복/실패 건수 + 실패 주소 목록
```

ERP(위치등록)만 **스테이징 단계**가 추가된다: 파싱·지오코딩 결과를 `stagedErpUpload`에 보관하고 [적용] 시에만 커밋한다(UC-15).

### 6.3 영역 캡처

```
영역 선택 오버레이 → map-capture-stitch/bounds  경계 산출
   → plan     격자 셀 분할 계획
   → capture  셀별 이미지 획득
        ├ 1순위: /api/kakao-static-map  (REST 키 → 없으면 JS 키 시도)
        └ 폴백 : /api/map-tile-proxy    (호스트 allowlist)
   → helpers  스티칭 → 단일 PNG → 다운로드
```

캡처 모드에서는 `capture-overlay-layout.ts`가 정보창을 마커에서 분리 배치해 라벨 가림을 방지한다.

## 7. 보안 아키텍처

| 계층 | 통제 | 구현 |
| --- | --- | --- |
| 키 관리 | REST 키는 서버 전용 | `NEXT_PUBLIC_` 접두사 미사용, `.env*` 커밋 금지 |
| Origin | 자기 도메인 + `NEXT_PUBLIC_SITE_URL` + `PROXY_ALLOWED_ORIGINS`만 허용 | 3개 Route Handler 공통 가드 |
| SSRF | 타일 프록시 대상 **호스트 allowlist** | `proxy-guard` (단위 테스트 보유) |
| 데이터 | Supabase **RLS** 정책 | `20260627000001_enable_rls_and_policies.sql` |
| 지도 SDK | JS 키 도메인 등록 | 배포 URL 사전 등록(RK2) |
| XSS | 사용자 입력의 DOM 직접 삽입 경로 없음 | 오버레이 HTML 생성 시 값 이스케이프, 패턴 그렙 검수 |

> 프록시는 **화이트리스트 방식**이다. 신규 타일 호스트가 필요하면 allowlist에 추가하고 `proxy-guard` 테스트를 함께 갱신한다.

## 8. 성능 전략

| 항목 | 전략 | 지표 |
| --- | --- | --- |
| 초기 번들 | 상세·편집 모달 `next/dynamic` 분리 | 홈 First Load **482 kB** (회귀 금지) |
| 마커 렌더 | 대표 1핀 원칙 + 클러스터러 | 수천 건에서 조작 지연 없음 |
| 서버 조회 | 단일 쿼리 키 캐시, 중복 요청 억제 | `["map-marker","markers"]` |
| 지오코딩 | 배치 큐 + 결과 캐시 | 동일 주소 재요청 방지 |
| 렌더 대상 산출 | `use-active-markers` 메모이제이션 | 필터 변경 시에만 재계산 |

## 9. 장애·폴백 설계

| 장애 | 감지 | 폴백 | 사용자 표시 |
| --- | --- | --- | --- |
| 카카오 SDK 로드 실패 | ready 플래그 미도달 | 없음 | 지도 영역 오류 안내(도메인 등록 확인) |
| 정적맵 실패 | 프록시 4xx/5xx | **타일 프록시** | 캡처는 계속 성공 |
| `KAKAO_REST_API_KEY` 부재 | 서버 env 없음 | JS 키 시도 → 타일 프록시 | 무중단 |
| 지오코딩 실패 | 응답 없음/불일치 | 좌표 없이 저장 | "좌표 없음 N건" + 실패 주소 목록 |
| 촬영일자 조회 실패 | 프록시 오류 | 로드뷰만 표시 | 일자 항목 생략 |
| 마이그레이션 미적용 | update 시 컬럼 오류 | 없음 | ⚠️ 현재 일반 DB 오류 → [CR-001](./CHANGE_REQUEST/CR-001.md)에서 개선 |
| 그룹 조작 부분 실패 | 다단계 update 중단 | 재승격 선행 순서로 dangling parent 방지 | 다음 재정렬에서 자가 치유 |

## 10. 알려진 아키텍처 부채

| ID | 부채 | 영향 | 해소 |
| --- | --- | --- | --- |
| G1 | `marker-detail-modal.tsx` 2,006줄 — 그룹 조작 로직 내포 | 리뷰·회귀 비용 | Ver_1.1 훅 분리 |
| G2 | 유효 키 규칙이 `address-group.ts`와 모달에 **2중 구현** | 드리프트 위험 | [CR-002](./CHANGE_REQUEST/CR-002.md) |
| G3 | 마이그레이션 미적용 안내 부재 | 운영 혼선 | [CR-001](./CHANGE_REQUEST/CR-001.md) |
| G6 | 그룹 조작 **트랜잭션 부재** | 부분 실패 시 그룹 훼손 | [CR-003](./CHANGE_REQUEST/CR-003.md) RPC 원자화 |
| R1 | 홈 First Load 482 kB | 저사양 초기 지연 | 번들 재프로파일 |
| R3/R5 | 잔존 `any` | 타입 안전성 | 점진 축소 |

## 11. 확장 지점

| 하고 싶은 일 | 손대야 할 곳 |
| --- | --- |
| 새 마커 모드 추가 | `store` mode 유니온 → 사이드바 섹션 매트릭스(IA §4.2) → `use-active-markers` |
| 새 필터 축 추가 | `marker-filters.ts` + 필터 패널 + 단위 테스트 |
| 새 외부 지도 소스 | 프록시 allowlist + `proxy-guard` 테스트 + 폴백 순서 |
| 새 엑셀 포맷 | `excel/data-manager/headers` 매핑 테이블만 수정(파서 재사용) |
| 브랜드 리스킨 | DESIGN §12의 3곳만 수정 |
