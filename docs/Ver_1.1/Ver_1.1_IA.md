# Ver_1.1 정보구조 (Information Architecture)

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 문서 버전: **Ver_1.1**
- 작성일: 2026-07-26
- 이전 버전: [Ver_1.0 IA](../Ver_1.0/Ver_1.0_IA.md)
- 관련 문서: [PLAN](./Ver_1.1_PLAN.md) · [PRD](./Ver_1.1_PRD.md) · [USECASE](./Ver_1.1_USECASE.md) · [DESIGN](./Ver_1.1_DESIGN.md)

---

## 1. 사이트맵

```
/                          지도 워크스페이스 (단일 페이지)
│
├── 사이드바
│   ├── 헤더 (로고 · 건수 요약 · 로그인 · 접기)
│   ├── 모드 탭  [장비] [축전지] [위치] [날씨]        ← 날씨 신규
│   ├── 주소/좌표 통합 변환기 링크 → /gpsmap
│   └── 아코디언
│       ├── 주소로 위치 찍기            (위치)
│       ├── 엑셀로 위치 찍기            (위치)
│       ├── 위치 등록 및 관리           (장비·인증)
│       ├── 엑셀로 위치 찍기(축전지)    (축전지·인증)
│       ├── 국소 작업 안전 날씨          ← 신규 (장비·축전지·날씨)
│       ├── 연도·사업·색상·태그 표시     (위치 외)
│       ├── 장소 검색                   (위치 외)
│       └── 위치 찾기 / 임시 위치
│
├── 지도 (카카오맵)
│   ├── 마커 · 클러스터 · 정보창 오버레이
│   ├── 정보창 날씨 카드                 ← 신규 (날씨 모드)
│   └── 플로팅 컨트롤 · 영역 캡처 패널
│
├── 모달
│   ├── 상세 · 편집 · 로드뷰 · 인증
│   ├── 위성/레이더 지도                 ← 신규
│   └── 실시간 태풍 정보                 ← 신규
│
└── /gpsmap                주소/좌표 통합 변환기 (변화 없음)
```

## 2. 라우트 맵

| 경로 | 유형 | 렌더 | Ver_1.1 |
| --- | --- | --- | --- |
| `/` | 페이지 | Static → CSR | 홈 First Load **289 kB** |
| `/gpsmap` | 페이지 | Static → CSR | 351 kB |
| `/api/kakao-static-map` | 라우트 | Dynamic | — |
| `/api/map-tile-proxy` | 라우트 | Dynamic | — |
| `/api/roadview-dates` | 라우트 | Dynamic | — |
| **`/api/worksite-weather`** | 라우트 | Dynamic | **신규** |

## 3. 전역 레이아웃 계층

Ver_1.0과 동일. `providers.tsx`(QueryClient·Theme·Auth) → `map-marker-page` → 사이드바 + 지도.

## 4. 화면 구조 — 날씨 패널

```
┌──────────────────────────────────────────┐
│ [위성/레이더 지도]  [실시간 태풍 정보]      │  ← 항상
├──────────────────────────────────────────┤
│ 🔖 오늘의 작업 국소 (N건)      [전체 삭제] │  ← 저장분 있고 검색 중 아닐 때
├──────────────────────────────────────────┤
│ 🔍 국소명 또는 주소 검색 (쉼표,로 다중)    │
├──────────────────────────────────────────┤
│ 💾 오늘의 작업 국소로 저장 (N건)           │  ← 검색 결과 있을 때
├──────────────────────────────────────────┤
│ 검색 3 / 12건 (2개 키워드)  [이전] [다음]  │  ← 목록 2건 이상
├──────────────────────────────────────────┤
│ 1. 조례국소            국소명            │
│    전남 순천시 조례동 123-4        [✕]   │  ← 저장 목록일 때만 ✕
├──────────────────────────────────────────┤
│ 조례국소 · 전남 순천시 … · 옥상·철탑 [초기화]│
├──────────────────────────────────────────┤
│ 🌀 태풍주의보 발효   [태풍 지도/통보문]    │  ← typhoon !== null
├──────────────────────────────────────────┤
│      🔴 위험      권장 07:00~11:00        │
│      발효 특보: 폭염경보(오늘 11시)        │
├──────────────────────────────────────────┤
│ 시각 기온/체감 습도 바람 강수 판정          │  ← 11행 · nowrap · 6열
├──────────────────────────────────────────┤
│ 🔴 폭염  최고 36.1℃ (15:00)               │
│ ⛔ 강풍 / ⛔ 강수 / ⚪ 한파                │
├──────────────────────────────────────────┤
│ ⚠️ 결측 경고 (있을 때)                     │
│ [TBM 자료로 저장]                          │
│ ⚠️ 실측 대체 불가 고지                     │
└──────────────────────────────────────────┘
```

## 5. 데이터 모델

### 5.1 기상 도메인 타입 (`worksite-weather/types/weather.ts`)

```
WorkType         = 'ground' | 'elevated'
Verdict          = 'safe' | 'caution' | 'warning' | 'danger' | 'stop' | 'unknown'
SlotSource       = 'past' | 'ncst' | 'ultra' | 'vilage' | 'missing'
SiteMatchKind    = 'name' | 'alias' | 'address' | 'geocode' | 'manual'
HazardKind       = 'heat' | 'cold' | 'wind' | 'rain'

WeatherSlot      { time, source, temp, apparent, humidity,
                   windSpeed, windDeg, windDir, windLabel,
                   pop, pty, pcp, pcpLabel, sno, snoLabel, sky,
                   verdict, reasons[] }

WorksiteWeatherResponse
                 { site, date, issuedAt, overall,
                   recommendedWindows[], timeline[11],
                   hazardSummary{heat,cold,wind,rain},
                   alerts[], typhoon|null, warnings[], disclaimer }

SiteMatch        { id, name, address, lat, lng, workType, matchedBy }
SiteCandidate    { id, name, address, stationName, lat, lng, siteAlias, workType }
```

**표기 단일 소스** — `VERDICT_RANK` · `VERDICT_ICON` · `VERDICT_LABEL` · `VERDICT_TONE` · `SLOT_SOURCE_LABEL`.
지도 오버레이와 사이드바가 **반드시 같은 상수**를 참조한다.

### 5.2 마커 타입 확장

```
BaseMarker        (변화 없음)
EquipmentMarker   + siteAlias?: string | null
                  + workType?:  string | null
BatteryMarker     + siteAlias?: string | null
                  + workType?:  string | null
LocationMarker    (변화 없음)
MapMode           'equipment' | 'battery' | 'location' | 'weather'   ← weather 추가
```

## 6. 도메인 로직 — 기상 판정

```
좌표(lat,lng)
   │
   ├─ toGrid()                      Lambert → 격자(nx,ny)   [저장 안 함]
   │
   ├─ getVilageBaseForToday()       05 → 02 → 전일23  (07시 이전 발표 고정)
   ├─ getUltraNcstBase()            정시 + 40분
   ├─ getUltraFcstBase()            30분 발표 + 15분
   │
   ├─ 기상청 4종 병렬 호출 ─────────────────┐
   │                                        │
   ├─ collectForecastSlots()   단기·초단기 → 07~17시 슬롯맵 (배열 1회 순회)
   ├─ collectObservation()     실황 → 카테고리맵
   │
   ├─ buildTimeline()          항목별 오버레이 (전체 교체 아님)
   │     우선순위: 실황 > 초단기예보 > 단기예보 > 경과
   │     TMP↔T1H, PCP↔RN1 코드 차이 흡수
   │
   ├─ apparentTemp()           25℃↑ 열지수 / 10℃↓ 풍냉 / 그 사이 기온 그대로
   ├─ parseAmount()            "1.0~29.9mm" → { max: 29.9, label }  ← 상한 채택
   │
   ├─ evaluateSlot()           heat·cold·wind·rain → worstVerdict
   ├─ overallVerdict()         전 슬롯 최댓값
   ├─ alertsVerdict()          특보 종류별 강도 (폭염경보 = danger, 호우 = stop)
   ├─ findRecommendedWindows() 미경과 + caution 이하 연속 구간 (배열)
   └─ buildHazardSummary()     4종 위험별 피크·시각·문구
```

### 6.1 특보 지역 매칭 규칙

| 시·도 종류 | REG_KO 예 | 매칭 방식 |
| --- | --- | --- |
| 도(道) | `순천시`, `장성군` | REG_KO가 주소에 있어야 함 |
| 광역시·특별시 | `광주서부`, `광주동부` | 시·도 일치만으로 해당 (권역명은 주소에 없음) |
| 시·도 불일치 | — | 즉시 제외 (경기도 광주시 ↔ 광주광역시 혼동 방지) |
| 주소 미상 | — | **매칭하지 않고** "확인 불가" 경고 |

## 7. 상태 구조

### 7.1 Zustand 신규 필드

| 필드 | 타입 | persist | 용도 |
| --- | --- | --- | --- |
| `weatherSearchMarkerIds` | `string[] \| null` | ✗ | 날씨 모드 지도 마커 필터 |
| `savedWeatherSites` | `SiteMatch[]` | **✓** | 오늘의 작업 국소 |

기존 `placeSearch`는 날씨 패널의 지오코딩 결과 지도 이동에도 재사용된다.

### 7.2 날씨 패널 로컬 상태 (파생 우선)

```
상태:  query · selectedId · geocodeSite · isGeocoding · searchError
파생:  isSearchActive = Boolean(query.trim())
       activeList     = isSearchActive ? searchResults : savedWeatherSites
       site           = geocodeSite ?? activeList[selectedId] ?? activeList[0] ?? null
       selectedIndex  = activeList에서 site의 위치
```

> **선택 국소를 state로 두지 않는다.** Ver_1.1 초기 구현에서 `useEffect` 3개가 각자 `setSite`를 호출해
> 사용자가 고른 국소가 검색어 변경 시 첫 항목으로 되돌아가는 문제가 있었다. 파생값으로 전환해 해소.

### 7.3 기상 응답 캐시 (2단)

| 계층 | 위치 | TTL |
| --- | --- | --- |
| 클라이언트 모듈 캐시 + 중복제거 | `lib/worksite-weather-api.ts` | 10분 |
| TanStack Query | `use-worksite-weather` | staleTime 10분 |
| 서버 isolate 메모리 캐시 | `lib/kma-client.ts` | 소스별 10분~3시간 |

지도 오버레이(DOM 빌더)와 사이드바 패널이 **같은 모듈 캐시**를 공유한다.

## 8. 라이브러리 모듈 맵 (`features/worksite-weather/lib/`)

| 모듈 | 책임 | 테스트 |
| --- | --- | --- |
| `grid.ts` | Lambert 격자 변환, 국내 범위 검사 | 8 |
| `kma-base-time.ts` | KST 보정, 소스별 기준시각 | 13 |
| `parse-amount.ts` | PCP/SNO 문자열 → 상한값, 코드→텍스트 | 13 |
| `apparent-temp.ts` | 체감온도(여름·겨울) | 12 |
| `wind.ts` | 16방위, 풍속 등급 | 11 |
| `verdict.ts` | 4종 판정·종합·권장 시간대·위험 요약·특보 강도 | 41 |
| `merge-sources.ts` | 소스 병합, 슬롯 생성 | 12 |
| `parse-wrn-text.ts` | 특보 텍스트 파싱, 지역 매칭 | 24 |
| `site-search.ts` | 국소 검색, 마커 어댑터 | 21 |
| `worksite-weather-api.ts` | 클라이언트 요청·캐시·중복제거 | 8 |
| `kma-client.ts` | **서버 전용** 기상청 호출 (`server-only`) | — |
| `export-tbm.ts` | TBM 엑셀 (xlsx 지연 로딩) | — |

## 9. API 계약

### `GET /api/worksite-weather`

| 파라미터 | 필수 | 설명 |
| --- | --- | --- |
| `lat`, `lng` | ✓ | 국소 좌표 |
| `workType` | | `elevated`면 강풍 판정 강화 (기본 `ground`) |
| `region` | | 특보 지역 매칭용 주소 앞 20자 |

| 상태 | 조건 |
| --- | --- |
| 200 | 정상 |
| 400 | 파라미터 누락 / 숫자 아님 / 격자 범위 밖 |
| 403 | origin 불허 |
| 502 | 기상청 오류 (인증키·활용신청·타임아웃) |

**국소명(`q`) 파라미터는 없다.** 좌표 해석은 클라이언트 책임 — 마커가 이미 스토어에 있고 지오코딩도 브라우저 SDK 전용이다.

## 10. 권한 매트릭스

| 기능 | 비로그인 | 로그인 |
| --- | --- | --- |
| 날씨 모드 진입·조회 | ✅ | ✅ |
| 국소 검색·저장 | ✅ | ✅ |
| TBM 저장 | ✅ | ✅ |
| 위치 모드 | ✗ | ✅ |

> 날씨 조회는 읽기 전용이고 마커 데이터는 anon SELECT가 이미 허용되어 있어 인증을 요구하지 않는다.

## 11. 파일 구조 요약

```
src/
├── app/
│   ├── page.tsx  layout.tsx  providers.tsx  globals.css
│   ├── gpsmap/page.tsx
│   └── api/{kakao-static-map,map-tile-proxy,roadview-dates,worksite-weather}/route.ts
├── components/ui/            shadcn (20파일)
├── features/
│   ├── map-marker/           69파일 17,588줄
│   ├── worksite-weather/     32파일  5,308줄   ← 신규
│   │   ├── components/  6
│   │   ├── constants/   2
│   │   ├── hooks/       1
│   │   ├── lib/        12 (+10 테스트)
│   │   └── types/       1
│   └── gpsmap/                9파일  2,019줄
├── lib/  hooks/  types/
└── supabase/migrations/      7개
```

## 12. 명명 규칙

Ver_1.0과 동일. 파일 kebab-case, 타입 PascalCase, 함수 camelCase, 상수 UPPER_SNAKE.
테스트는 **`.test.ts`만** — `vitest.config.ts`의 include가 `.ts`뿐이라 `.tsx` 테스트는 실행되지 않는다.
