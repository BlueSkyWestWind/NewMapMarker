# MapMarker Pro (geographic_tech)

통신 장비·축전지 **국소를 지도에 관리하고, 당일 작업 안전 날씨를 판정**하는 웹 앱입니다.
`001.MapMarker`(바닐라 JS)를 Next.js 15 + TypeScript 구조로 재구성했습니다.

- 현재 릴리스: **Ver_2.1** (2026-08-02) — 디자인 토큰 재매핑 + 라이트/다크 테마 전환
- 문서: [`docs/Ver_2.1/`](./docs/Ver_2.1/Ver_2.1_implementation_plan.md) ·
  [`docs/Ver_2.0/`](./docs/Ver_2.0/Ver_2.0_README.md)(UI 셸 개편·대시보드) ·
  [이전 버전](./docs/Ver_1.1/)

## 구조

```
src/
  app/                         # Next.js App Router (layout · page · providers · globals.css)
    api/
      kakao-static-map/        # 카카오 REST 정적맵 프록시 (영역 캡처용, REST 키 필요)
      map-tile-proxy/          # 지도 타일 프록시 (호스트 allowlist 기반 SSRF 방지)
      roadview-dates/          # 로드뷰 촬영일자 조회 프록시
      worksite-weather/        # 국소 작업 안전 날씨 판정 (기상청 API 허브)
      its-key/                 # ITS 인증키를 브라우저에 런타임 전달 (CCTV는 브라우저 직접 호출)
    gpsmap/                    # 주소/좌표 통합 변환기 (독립 라우트, 로직은 features/gpsmap/lib 공유)
  components/
    ui/                        # shadcn/ui (Radix) — Calendly 유래 토큰으로 라이트/다크 렌더
    public-env-script.tsx      # 런타임 공개 env 를 브라우저에 주입
    kakao-sdk-script.tsx       # 카카오 지도 SDK 로더
  hooks/ lib/ types/           # use-toast · use-has-mounted · utils · public-env · supabase/client · kakao-maps.d.ts
  features/shell/              # 좌측 메뉴 레일 + 상단 검색 + 패널 스위치 (Ver_2.0 신설, 14파일)
    constants.ts                # 레일/패널 폭 단일 소스 (CSS 변수로 흘림)
    types/nav.ts                # NavKey 7종(대시보드·지도·마커관리·그룹관리·CCTV·백업/복원·설정)
    components/                 # app-shell · nav-rail · top-search-bar · panels/(지도·마커·백업·설정)
  features/dashboard/          # 당일 국소 작업 가능 여부 요약 (Ver_2.0 신설, 4파일)
    hooks/use-worksite-board.ts # 저장 국소 동시 4건 날씨 조회, 행 단위 실패 격리
    components/                 # worksite-board · worksite-row · dashboard-panel(빈 상태 포함)
  features/map-marker/         # 지도·마커 도메인 (73파일)
    api.ts                     # Supabase 조회 (fetchAllRows 페이지네이션)
    constants/ providers/ store/ hooks/
    lib/                       # marker-svg · cluster-pie · marker-filters · geocode · address-group
                               # overlay-content · overlay-drag · location-marker(-groups)
                               # map-viewport-capture · map-capture-stitch/
                               # excel/data-manager/ (엑셀 파싱·내보내기·백업/복원)
    components/                # map/ · sidebar/ · modals/
  features/worksite-weather/   # 작업 안전 날씨 도메인 (32파일)
    constants/                 # thresholds(판정 임계값) · kma-regions(특보 관서)
    types/weather.ts           # 판정 등급·표기 상수 단일 소스
    lib/                       # grid · kma-base-time · parse-amount · apparent-temp · wind
                               # verdict(판정 엔진) · merge-sources · parse-wrn-text
                               # site-search · worksite-weather-api · kma-client(서버 전용)
                               # export-tbm
    hooks/ components/         # 패널 · 타임라인 표 · 위험 요약 · 태풍/위성 모달
  features/gpsmap/             # 주소·좌표 변환 (VWorld · Leaflet, 14파일)
  features/cctv/               # 도로 CCTV 조회 — ITS를 브라우저에서 직접 호출 (13파일)
docs/                          # Ver_1.0 ~ Ver_2.1 문서 세트 · 검수 보고서 · project_review.md
supabase/migrations/           # DB 마이그레이션 7개
e2e/                           # Playwright 스모크 테스트
```

## 주요 기능

| 기능 | 상태 |
|------|------|
| **좌측 메뉴 셸**(대시보드·지도·마커관리·CCTV·백업/복원·설정) + 전역 검색(`Ctrl+K`) | ✅ |
| **대시보드** — 오늘의 작업 국소 저장 목록의 실시간 작업 가능 여부 요약 | ✅ |
| **라이트/다크 테마 전환**(설정 메뉴, 기본은 다크) | ✅ |
| 지도 세그먼트(장비/축전지/위치) · 마커관리 세그먼트(장비/축전지) 전환 | ✅ |
| Supabase 마커·정보·축전지 로드 (전량 페이지네이션) | ✅ |
| 연도·사업·색상·태그·용량 필터 | ✅ |
| 지도 마커 렌더·클러스터(파이/도넛) | ✅ |
| 장소 검색·주소 지오코딩 | ✅ |
| 로그인/로그아웃 | ✅ |
| 엑셀 업로드(장비·축전지·ERP·추가항목) | ✅ |
| 데이터 백업/복원(엑셀) | ✅ |
| 마커 CRUD 모달(편집·삭제·시설팀 지정) | ✅ |
| 로드뷰 모달(촬영일자 조회) | ✅ |
| 영역 선택 → 격자 캡처/스티칭(PNG) | ✅ |
| 정적맵·타일 프록시(SSRF 방지) | ✅ |
| 동일 번지 대표/SUB/단독 그룹핑 | ✅ |
| 동/구역 실제 그룹 분리·원복(대표 직접 선택) | ✅ |
| **국소 작업 안전 날씨 판정 (07~17시)** | ✅ |
| **TBM 안전 자료 엑셀 저장** | ✅ |
| **도로 CCTV 조회·영상 재생**(ITS, 브라우저 직접 호출) | ✅ |
| **주소/좌표 통합 변환기**(단건·일괄·엑셀, GPS 메뉴) | ✅ |

### UI 셸 + 대시보드 + 라이트/다크 테마 (Ver_2.0~2.1 신규)

화면의 최상위 전환 축을 **모드(데이터 도메인)** 에서 **메뉴(기능 영역)** 로 옮기고,
**대시보드**("오늘 이 국소에서 작업해도 되는가")를 기본 진입 화면으로 뒀다.

- **좌측 메뉴 레일 7종** — 대시보드 · 지도 · 마커관리 · 그룹관리(준비 중) · CCTV · 데이터백업/복원 · 설정.
  비로그인 시 인증 필요 항목은 숨김(비활성이 아니라 목록에서 제외)
- **대시보드** — 저장해 둔 오늘의 작업 국소를 동시 4건까지 조회해 시간대별 작업 가능 여부를 요약.
  개별 조회 실패는 해당 행만 격리되고 나머지 행은 정상 표시
- **전역 검색**(`Ctrl+K`) — 사이드바 장소 검색과 동일한 구현을 공유
- **라이트/다크 테마 전환** — 설정 메뉴에서 토글. 기본값은 다크. shadcn 원시 컴포넌트(`Button`·
  `Input`·`Card`·`Dialog`·`Badge` 등)와 커스텀 컴포넌트 전반이 Calendly에서 채택한 반경·섀도
  구조 위에 기존 인디고 브랜드 색으로 재매핑된 라이트 팔레트로 렌더된다. 카카오맵 오버레이
  말풍선(위성 이미지 위에 얹히는 요소)만 항상 다크로 고정
- 폭 상수(`--rail-w`·`--panel-w`)는 `features/shell/constants.ts` 단일 소스에서 CSS 변수로 흘러
  반응형 미디어 쿼리에 쓰인다

### 국소 작업 안전 날씨 (Ver_1.1 신규)

국소명·주소로 검색하면 **당일 07~17시를 1시간 간격 11슬롯**으로 보여주고,
시간대별 작업 가능 여부를 판정합니다.

- **4종 위험 판정** — 폭염(체감 31/33/35/38℃) · 강풍(10m/s) · 강수(1mm/h) · 한파. 태풍은 발효 시에만 표시
- **법정 기준 반영** — 산업안전보건법(폭염) · 안전보건규칙 제383조(강풍·강수·적설)
- **소스 병합** — 단기예보 골격에 초단기실황(실황)·초단기예보(정밀)를 항목별 오버레이
- **고소 작업 가중** — `work_type = elevated`인 국소는 강풍 판정을 한 단계 강화
- **작업 권장 시간대** 산출 (오전·오후로 갈라질 수 있어 배열)
- **오늘의 작업 국소** 저장·순회, 다중 키워드 검색

> ⚠️ 예보 기반 체감온도는 **작업 계획용 참고값**입니다. 법령상 기준은 작업장소에서 실측한
> 체감온도이며 이를 대체하지 않습니다. 화면과 저장 자료 양쪽에 상시 고지됩니다.

판정 규칙 상세: [`Ver_1.1_BUSINESS_RULE.md`](./docs/Ver_1.1/Ver_1.1_BUSINESS_RULE.md)

### 동일 번지 그룹핑 · 동/구역 분리

같은 번지에 여러 장비가 있으면 하나를 **대표**, 나머지를 **SUB**로 묶고(1개면 **단독**),
지도에는 대표 1핀만 표시합니다. 아파트·공장처럼 한 번지에 여러 구역이 있으면
마커 상세 모달에서 **동/지하/기타 단위로 실제 분리**할 수 있습니다.

- **분리**: 구역을 번지 그룹에서 빼내 독립 대표+SUB 그룹으로 만듭니다. 분리 시 **대표 국소를 직접 선택**합니다.
- **대표 승격**: 분리로 원 번지 그룹의 대표가 빠지면 남은 국소 중 하나가 새 대표(1개면 단독)로 승격됩니다.
- **원복**: 분리 그룹에서 **번지로 합치기**로 되돌립니다.
- 분리 상태는 `markers.group_key`에 저장되어 엑셀 재업로드·백업/복원에도 유지됩니다.

## 실행

```bash
npm install
npm run dev          # 개발 서버 (Turbopack)
npm run lint         # eslint .
npm run test         # vitest 단위 테스트 (278건 / 20파일)
npm run test:e2e     # Playwright 스모크 (dev 서버 재사용)
npx tsc --noEmit     # 타입 검사 — 커밋 전 필수
```

> ⚠️ **`vitest`는 타입을 검사하지 않습니다.** 테스트가 전부 통과해도 빌드가 깨질 수 있습니다.
> 커밋·배포 전에 `tsc --noEmit`을 별도로 실행하세요.

## DB 마이그레이션

`supabase/migrations/` 파일을 **파일명 순서대로** Supabase SQL Editor에서 실행하세요.
전부 `IF NOT EXISTS` 기반이라 이미 적용된 것은 안전하게 건너뜁니다.

| 마이그레이션 | 내용 |
|------|------|
| `20260722000000_add_detached_visible.sql` | `markers.detached_visible` — 같은 번지 SUB를 지도에 개별 핀으로 표시 |
| `20260723000000_add_group_key.sql` | `markers.group_key` — 번지 하위 동/구역 실제 그룹 분리 키 |
| `20260727000000_add_worksite_weather_columns.sql` | `markers`·`battery_markers`에 `site_alias`(검색 별칭) · `work_type`(지상/고소) |

신규 DB는 먼저 `001.MapMarker/sql/` 스크립트를 순서대로 실행한 뒤 위 마이그레이션을 적용하세요.

> 마이그레이션 미적용 상태에서도 조회는 깨지지 않습니다(신규 컬럼을 optional로 읽음).
> 다만 **별칭 검색이 동작하지 않고 모든 국소가 지상 작업으로 판정**됩니다.

## Cloudflare Workers 배포

이 프로젝트는 **Next.js 15** 앱입니다. Cloudflare **Workers**(Git 연동)로 배포할 때는 OpenNext 어댑터가 필요합니다.
`npm run build`만으로 만들어지는 `.next` 폴더는 Workers에 바로 올릴 수 없습니다.

### 대시보드 설정 (Workers & Pages → newmarker → Settings → Builds)

**오류 `Could not find compiled Open Next config, did you run the build command?`**
→ Deploy command가 `npx wrangler deploy`만 실행되면 OpenNext 빌드(`.open-next/`)가 생성되지 않아 실패합니다.
`wrangler deploy`는 내부에서 `opennextjs-cloudflare deploy`만 호출하며, **빌드는 자동으로 하지 않습니다.**

| 항목 | 권장 값 (택 1) |
|------|----------------|
| **방법 A — 한 줄 배포 (권장)** | Build command: *(비워 두기)* · **Deploy command: `npm run deploy`** |
| **방법 B — 빌드·배포 분리** | Build command: `npx opennextjs-cloudflare build` · Deploy command: `npx opennextjs-cloudflare deploy` |
| Non-production deploy | `npm run upload` |
| Node version | **22** (`.nvmrc`, wrangler 4.x 필수) |

**하지 말 것:** Deploy command를 `npx wrangler deploy`로 두는 것 (`npm run build`만으로는 `.open-next/`가 생기지 않음)

`npm run deploy` = `opennextjs-cloudflare build` + `opennextjs-cloudflare deploy`
(Next 빌드 → `.open-next/worker.js` 생성 후 Workers에 배포)

`wrangler.jsonc`의 Worker 이름(`newmarker`)과 `WORKER_SELF_REFERENCE` service 이름이 **동일**해야 합니다.
`package.json`의 `name`도 `newmarker`로 맞춰 두었습니다.

**Settings → Compatibility flags** 에 `nodejs_compat` 추가.

### 환경 변수 (필수)

Cloudflare **Workers & Pages → newmarker → Settings → Variables and Secrets** 에 등록하세요.
(`.env.local`은 Git에 포함되지 않아 CI 빌드·배포 환경에는 자동으로 전달되지 않습니다.)

| 변수 | 설명 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable 키 |
| `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` | 카카오 JavaScript 키 |

등록 후 **재배포**하세요. 앱은 서버에서 Worker 변수를 읽어 브라우저에 주입합니다.
카카오 JavaScript 키에 **Workers 배포 URL** 도메인도 등록하세요.

### 기상 API 키 (날씨 기능 사용 시 필수)

#### ⚠️ 반드시 **Secret** 타입으로 등록하세요 — Plaintext는 배포 때 지워집니다

| 등록 방식 | 재배포 후 |
|---|---|
| 대시보드 **Plaintext 변수** | ❌ **삭제됨** — 배포 시 `wrangler.jsonc`의 `vars` 블록이 대시보드 변수를 대체 |
| 대시보드 **Secret** | ✅ 유지 |
| `wrangler secret put` | ✅ 유지 |

> Cloudflare 문서: *"Wrangler will not delete your secrets unless you run `wrangler secret delete`"*
> Secret은 배포와 무관하게 보존되지만, **Plaintext 변수는 설정 파일이 이깁니다.**
>
> 추가 안전장치로 `wrangler.jsonc`에 **`"keep_vars": true`** 를 넣어 두었습니다.
> 이제 대시보드에 Plaintext로 넣은 변수도 배포 때 지워지지 않습니다.
> 그래도 **서버 키는 Secret으로** 등록하세요 — Plaintext는 대시보드·로그에 값이 그대로 보입니다.

**CLI (권장)**

```bash
npx wrangler secret put KMA_API_HUB_KEY
```

**대시보드**
Workers & Pages → newmarker → Settings → Variables and Secrets → Add →
Type을 **Secret** 선택 → 이름 `KMA_API_HUB_KEY` → 저장 → **재배포**

**로컬**은 `.env.local`에 한 줄 추가 (Git에 올라가지 않으므로 배포에는 전달되지 않음):

```
KMA_API_HUB_KEY=발급받은_인증키
```

| 변수 | 설명 |
|------|------|
| `KMA_API_HUB_KEY` | [기상청 API 허브](https://apihub.kma.go.kr) 인증키 **(권장)** |
| `KMA_SERVICE_KEY` | 공공데이터포털 인증키. **Decoding 키**를 사용 |

둘 다 설정되면 API 허브를 우선합니다. `NEXT_PUBLIC_` 접두어를 붙이면 안 됩니다(클라이언트 번들에 박힙니다).

**활용신청** — 기상청 API 허브는 **오퍼레이션 단위**로 신청합니다.
[동네예보 조회](https://apihub.kma.go.kr/apiList.do?seqApi=10&seqApiSub=286)에서 3건, 특보에서 1건:

| API | 용도 |
|------|------|
| 단기예보조회 `getVilageFcst` | 07~17시 골격 (필수) |
| 초단기실황조회 `getUltraSrtNcst` | 현재 시각 보정 |
| 초단기예보조회 `getUltraSrtFcst` | +6시간 정밀 보정 |
| 기상특보 `wrn_now_data` | 특보 발효 현황 |

> 단기예보만 승인돼도 판정은 동작합니다. 나머지는 정확도를 높입니다.

### ITS API 키 (도로 CCTV 조회 사용 시)

```bash
npx wrangler secret put ITS_API_KEY
```

| 변수 | 설명 |
| --- | --- |
| `ITS_API_KEY` | [ITS 국가교통정보센터 오픈데이터](https://www.its.go.kr/opendata/) 인증키 |

기상 API 키와 동일하게 **Secret 타입**으로 등록하세요. 로컬은 `.env.local`에 추가합니다.

> CCTV 조회는 **브라우저가 ITS를 직접 호출**합니다(서버 경유 불가, 상세는
> [`Ver_1.1_CCTV_PLAN.md`](./docs/Ver_1.1/Ver_1.1_CCTV_PLAN.md) 부록 E). `/api/its-key` 라우트가
> 이 키를 런타임에 브라우저로 전달합니다. 미설정 시 CCTV 조회가 인증키 오류로 실패합니다.

### 환경 변수 (선택)

영역 캡처의 **카카오 정적맵(Static Map)** 경로에서만 사용합니다. 없으면 타일 프록시로 폴백합니다.

| 변수 | 설명 |
|------|------|
| `KAKAO_REST_API_KEY` | 카카오 **REST API 키**(서버 전용). 정적맵 캡처 품질용 |
| `NEXT_PUBLIC_SITE_URL` | 정적맵 요청 `KA` 헤더의 origin 폴백값. 프록시 라우트의 허용 origin 으로도 사용 |
| `PROXY_ALLOWED_ORIGINS` | 프록시 라우트에서 자기 도메인 외에 추가로 허용할 origin (쉼표 구분) |
| `NEXT_PUBLIC_VWORLD_API_KEY` | VWorld 인증키(GPSMAP·지적도). 도메인/Referer 제한으로 보호 |

설정 변경 후 **Retry deployment** 하세요.

## 문서

| 문서 | 내용 |
|------|------|
| [`docs/Ver_2.1/`](./docs/Ver_2.1/Ver_2.1_implementation_plan.md) | 현재 버전 — 디자인 토큰 재매핑 + 라이트/다크 테마 |
| [`docs/Ver_2.0/`](./docs/Ver_2.0/Ver_2.0_README.md) | UI 셸 개편 + 대시보드 신설 문서 세트 |
| [`docs/Ver_1.1/`](./docs/Ver_1.1/Ver_1.1_README.md) | 국소 작업 안전 날씨 + CCTV 문서 세트 |
| [`docs/Ver_1.0/`](./docs/Ver_1.0/) | 최초 버전 + 변경요청(CR-001~004) |
| [`docs/PROJECT_ANALYSIS_2026-07-18.md`](./docs/PROJECT_ANALYSIS_2026-07-18.md) | 검수 보고서 (1~5차) |
| [`docs/Ver_2.0/project_review.md`](./docs/Ver_2.0/project_review.md) | 구조 점검 누적 기록 |
| [`docs/VWORLD_CLOUDFLARE_SETUP.md`](./docs/VWORLD_CLOUDFLARE_SETUP.md) | VWorld 배포 설정 가이드 |
| [`docs/walkthrough.md`](./docs/walkthrough.md) | 작업 결과 누적 |

시작점: [`Ver_2.1_implementation_plan`](./docs/Ver_2.1/Ver_2.1_implementation_plan.md) →
[`Ver_2.0_PLAN`](./docs/Ver_2.0/Ver_2.0_implementation_plan.md) →
[`Ver_2.0_IA`](./docs/Ver_2.0/Ver_2.0_IA.md)
