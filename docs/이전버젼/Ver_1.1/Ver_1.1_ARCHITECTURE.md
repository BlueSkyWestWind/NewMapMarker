# Ver_1.1 아키텍처 문서 (Architecture)

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 문서 버전: **Ver_1.1**
- 최종 갱신: 2026-07-26
- 관련 문서: [IA](./Ver_1.1_IA.md) · [API](./Ver_1.1_API.md) · [DATABASE](./Ver_1.1_DATABASE.md) · [STATE](./Ver_1.1_STATE.md)

---

## 1. 시스템 개요

```
┌─ 브라우저 ─────────────────────────────────────────────┐
│  Next.js 15 App Router (CSR 중심)                      │
│  ├─ Zustand (UI 상태, 일부 persist)                     │
│  ├─ TanStack Query (서버 상태)                          │
│  ├─ Kakao Maps SDK  ─────────────→ 카카오 (직접)        │
│  └─ Supabase JS (anon + RLS)  ───→ Supabase (직접)      │
└───────────┬────────────────────────────────────────────┘
            │ 자기 서버 프록시 (origin 가드)
┌───────────▼────────────────────────────────────────────┐
│  Cloudflare Workers (OpenNext)                         │
│  ├─ /api/kakao-static-map   → dapi.kakao.com           │
│  ├─ /api/map-tile-proxy     → 카카오 타일               │
│  ├─ /api/roadview-dates     → rv.map.kakao.com         │
│  └─ /api/worksite-weather   → apihub.kma.go.kr  ← 신규 │
└────────────────────────────────────────────────────────┘
```

**Ver_1.1의 구조적 변화는 하나다**: 서버가 처음으로 **도메인 연산**을 수행한다.
기존 3개 라우트는 순수 프록시(요청 전달 + 응답 반환)였지만, `/api/worksite-weather`는
외부 4개 소스를 병합하고 안전 판정까지 계산해 돌려준다.

## 2. 아키텍처 결정 기록 (ADR)

| ID | 결정 | 대안 | 근거 |
| --- | --- | --- | --- |
| ADR-11 | 기상 판정을 **서버**에서 수행 | 클라이언트 계산 | 인증키 보호 + 외부 4건 병렬 호출을 한 번의 왕복으로 |
| ADR-12 | 국소 검색·지오코딩은 **클라이언트** | 서버 `q` 파라미터 | 마커가 이미 스토어에 있고, 지오코딩은 브라우저 SDK 전용 |
| ADR-13 | 격자 좌표를 **저장하지 않음** | DB 컬럼 | 변환이 수 µs. 저장하면 좌표 수정 시 stale 경로만 생김 |
| ADR-14 | 판정 임계값을 **단일 상수 파일**로 | 각 판정 함수에 상수 | 한파 하위기준이 향후 확정됨. 한 곳만 고치면 되게 |
| ADR-15 | 결측 시 **추정값 생성 금지** | 보간·기본값 | 안전 판정에서 조용히 틀리는 것이 최악 |
| ADR-16 | 특보 반영 강도를 **종류별 분리** | 일괄 경보=중지 | 여름철 폭염경보 상시 발효로 전 국소 ⛔가 됨 |
| ADR-17 | 무거운 라이브러리 **지연 로딩** | 정적 import | xlsx+html2canvas가 홈 번들 210 kB 차지 |
| ADR-18 | 마커 조회 **페이지네이션** | `select('*')` | PostgREST 행 상한 초과 시 오류 없이 잘림 |

## 3. 레이어 구조

```
components/   화면. 상태 소유·표시. 도메인 계산 금지
    ↓
hooks/        React 상태·부수효과. Query/Zustand 연결
    ↓
lib/          순수 함수·DOM 빌더·외부 호출. React 비의존
    ↓
constants/    임계값·매핑 테이블
types/        타입·표기 상수 (단일 소스)
```

**규칙: `lib/`는 `hooks/`를 import하지 않는다.**

> Ver_1.1 검수에서 `map-marker/lib/overlay-content.ts` → `worksite-weather/hooks/use-worksite-weather.ts`
> 역방향 의존이 발견됐다. 요청 함수를 `lib/worksite-weather-api.ts`로 옮겨 해소했다.
> 이 이동은 부수적으로 **지도 오버레이와 사이드바가 같은 캐시를 공유**하게 만들었다.

### 3.1 feature 경계

| feature | 파일 | 줄 | 외부 의존 |
| --- | --- | --- | --- |
| `map-marker` | 69 | 17,588 | Kakao SDK · Supabase · VWorld |
| `worksite-weather` | 32 | 5,308 | 기상청 API 허브 (서버 경유) |
| `gpsmap` | 9 | 2,019 | VWorld · Leaflet |

`worksite-weather`는 `map-marker`의 **타입·스토어·지오코딩만** 참조한다(단방향).
반대로 `map-marker/lib/overlay-content.ts`가 `worksite-weather/lib`·`types`를 참조하는 지점이 하나 있다 — 지도 정보창 날씨 카드.

## 4. 런타임 · 배포 토폴로지

| 항목 | 값 |
| --- | --- |
| 런타임 | Cloudflare Workers (OpenNext) |
| 호환 플래그 | `nodejs_compat`, `global_fetch_strictly_public` |
| 도메인 | `newmarker.celyoon.workers.dev` |
| 시간대 | **UTC** — KST 보정 필수 |
| 인코딩 | `TextDecoder("euc-kr")` 지원 확인됨 (workerd 실검증) |

### 4.1 캐시 제약

> ⚠️ **`*.workers.dev`에서는 Cloudflare Cache API가 동작하지 않는다.**
> `caches.default`, `fetch(..., { cf: { cacheTtl } })` 모두 무효.
> `open-next.config.ts`가 기본값이라 incremental cache도 구성되어 있지 않다.

| 단계 | 방식 | 상태 |
| --- | --- | --- |
| 1 | isolate 메모리 캐시 (`Map` + TTL) | ✅ 적용 |
| 1 | 응답 `Cache-Control` | ✅ 적용 |
| 2 | 커스텀 도메인 연결 → Cache API | ⏳ 미적용 |

## 5. 부트스트랩 시퀀스

Ver_1.0과 동일. 추가로 날씨 패널은 `useMapMarkersQuery`의 캐시를 재사용하므로 **추가 조회를 만들지 않는다**.

## 6. 주요 데이터 흐름

### 6.1 기상 판정 (신규)

```
[Client] 국소 검색(스토어) → 좌표 확정
   │  GET /api/worksite-weather?lat&lng&workType&region
   ▼
[Worker] guardProxyRequest → toGrid → 캐시 조회
   │
   ├─ Promise.all ─┬─ getVilageFcst   (07~17시 골격, 페이지네이션)
   │               ├─ getUltraSrtNcst (현재 보정)      .catch → []
   │               ├─ getUltraSrtFcst (+6h 보정)       .catch → []
   │               └─ wrn_now_data    (특보, EUC-KR)   .catch → parsed:false
   │
   ├─ buildTimeline  항목별 오버레이 (전체 교체 아님)
   ├─ evaluateSlot × 11
   ├─ alertsVerdict  특보 종류별 강도
   └─ 응답 (11슬롯 + 종합 + 권장 시간대 + 위험 요약 + 경고)
```

**부분 실패 허용**: 초단기·특보가 실패해도 단기예보만으로 응답한다.
단, 특보 실패는 `warnings`에 명시해 "특보 없음"으로 오인되지 않게 한다.

### 6.2 마커 전량 조회 (변경)

```
fetchAllRows(fetchPage)
   ├─ count:'exact' + range(from, from+999)
   ├─ 받은 개수만큼 커서 이동  ← 서버 상한이 더 작아도 안전
   ├─ rows.length >= count 이면 종료
   └─ MAX_FETCH_PAGES=50 가드
```

정렬에 **유일 키(`id`) tiebreaker**를 붙인다. `created_at`만으로는 동일 시각 행의 순서가
요청마다 달라져 페이지 경계에서 누락·중복이 난다.

## 7. 보안 아키텍처

| 계층 | 조치 |
| --- | --- |
| 라우트 | 전 `/api/*`에 `guardProxyRequest` (origin + IP 레이트리밋) |
| 인증키 | `KMA_API_HUB_KEY` 서버 전용. `NEXT_PUBLIC_` 금지, `wrangler.jsonc` `vars` 금지 |
| 오류 노출 | 기상청 원문 메시지를 그대로 반환하지 않음 (키 유출 방지) |
| DB | RLS — anon SELECT, authenticated 조작 |
| XSS | 오버레이 `innerHTML` 삽입 전 `escapeHtml` |
| 모듈 경계 | `kma-client.ts`에 `import "server-only"` |

## 8. 성능 전략

| 항목 | Ver_1.0 | Ver_1.1 |
| --- | --- | --- |
| 홈 First Load JS | 482 kB | **289 kB** |
| xlsx (SheetJS) | 홈 번들 포함 | **지연 로딩** |
| html2canvas | 홈 번들 포함 | **지연 로딩** |
| 기상 조회 중복 | — | TTL 10분 + in-flight 병합 |
| 마커 조회 | `select('*')` 단발 | 페이지네이션 |

### 8.1 지연 로딩 경계

| 모듈 | 트리거 |
| --- | --- |
| `xlsx` | 엑셀 업로드·백업·TBM 저장 실행 시 |
| `html2canvas` | 지도 캡처 실행 시 |
| `jszip` | 영역 캡처 zip 생성 시 |
| `leaflet` | `/gpsmap` 진입 시 |
| `data-manager` | 엑셀 작업 시 |

> `full-backup.ts`는 xlsx를 정적으로 끌어온다. 상수·타입만 필요한 훅을 위해
> **`full-backup-schema.ts`** (xlsx 무의존)를 분리했다.

## 9. 장애·폴백 설계

| 장애 | 동작 |
| --- | --- |
| 초단기 API 실패 | 단기예보만으로 타임라인 구성 (배지 없음) |
| 특보 조회 실패 | `alerts: []` + `parsed: false` → 화면 경고 |
| 특보 형식 불일치 | 값 생성 금지, `parsed: false` |
| 일부 슬롯 결측 | `verdict: 'unknown'` + 결측 건수 경고 |
| 인증키 미설정 | 502 + 설정 안내 |
| 활용신청 누락 | 502 + **401과 구분된** 안내 |
| 지역 미상 | 전국 특보를 적용하지 않고 경고 |
| 마이그레이션 미적용 | 신규 컬럼 optional 읽기 → 조회 무중단 |
| xlsx 청크 로드 실패 | 토스트 안내 |

## 10. 알려진 아키텍처 부채

| ID | 항목 | 영향 |
| --- | --- | --- |
| G1 | `marker-detail-modal.tsx` 2,016줄 | 최대 파일. Ver_1.0부터 미해소 |
| G2 | 유효 그룹 키 규칙 2중 구현 | [CR-002](../Ver_1.0/CR-002.md) |
| G6 | 그룹 조작 트랜잭션 부재 | [CR-003](../Ver_1.0/CR-003.md) |
| W1 | `worksite-weather-panel.tsx` 559줄 | 검색·저장목록·모달·결과가 한 파일 |
| W2 | Cache API 무효 (workers.dev) | 커스텀 도메인 필요 |
| W3 | `savedWeatherSites` 원본 미동기화 | 삭제된 마커가 목록에 잔존 |
| W4 | 외부 iframe 2종 실렌더 미검증 | windy.com 서드파티 의존 |

## 11. 확장 지점

| 확장 | 방법 |
| --- | --- |
| 새 기상 소스 | `kma-client.ts`에 fetch 함수 추가 → `merge-sources`에 오버레이 |
| 새 위험 항목 | `thresholds.ts`에 임계값 → `verdict.ts`에 판정 함수 → `HazardKind` 추가 |
| 다른 포털 | `PROVIDERS`에 `baseUrl`·`authParam` 추가 (공공데이터포털 이미 지원) |
| 태풍 상세 | `TyphoonInfo.detail`을 채우는 fetch 추가. UI는 이미 대응 |
| 새 지도 모드 | `MapMode` 유니온 확장 → `.exhaustive()` 지점 2곳 처리 필수 |
