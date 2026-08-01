# Walkthrough

## [2026-08-01] UI 셸 개편 + 대시보드 신설 (Ver 2.0)

### 개요 및 목적

화면의 최상위 전환 축을 **모드(데이터 도메인)** 에서 **메뉴(기능 영역)** 로 옮기고, 그 위에
**대시보드**("오늘 이 국소에서 작업해도 되는가")를 기본 진입 화면으로 신설했다.
계획서 `docs/Ver_2.0/Ver_2.0_implementation_plan.md` 2~6단계를 한 번에 구현했다.

### 변경된 내용

**신설 — `features/shell/`**

| 파일 | 역할 |
| --- | --- |
| `constants.ts` | `NAV_RAIL_WIDTH_PX=200` · `WORK_PANEL_WIDTH_PX=340` · `LEFT_OFFSET_PX=540`. 폭의 **단일 소스** |
| `types/nav.ts` | `NavKey` 7종 + 라벨·아이콘·`auth`·`enabled` 메타, 접근 판정 |
| `components/app-shell.tsx` | 4영역 레이아웃. 폭 상수를 CSS 변수(`--rail-w`·`--panel-w`)로 흘려보낸다 |
| `components/nav-rail.tsx` | 메뉴 7개 + 계정 영역. 비로그인 시 `auth` 항목 **필터링**, 폴백 포함 |
| `components/work-panel.tsx` | `activeNav`별 패널 스위치(`ts-pattern` + `exhaustive`) |
| `components/top-search-bar.tsx` | 전역 검색 + `Ctrl+K` |
| `components/coming-soon.tsx` | 그룹관리 안내 |
| `components/panels/*` | 지도·마커관리·백업/복원·설정 패널 |

**신설 — `features/dashboard/`**

`use-worksite-board.ts`(동시 4 제한·행 단위 실패 격리·언마운트 취소) ·
`worksite-board.tsx` · `worksite-row.tsx` · `dashboard-panel.tsx`(빈 상태 포함).
기상 조회는 기존 10분 모듈 캐시를 그대로 타서 지도 오버레이와 값이 갈리지 않는다.

**변경**

- `map-marker-page.tsx` — `MapSidebar` → `AppShell`. `useActiveMarkers`는 여전히 **여기서만** 호출
- `sidebar/map-sidebar.tsx` **삭제**(350줄). 내부 섹션은 패널이 직접 렌더
- `mode-tabs.tsx` — 4탭 → 세그먼트(지도 3종 / 마커관리 2종). `날씨&CCTV` 탭 소멸
- `use-map-marker-store.ts` — `activeNav`·`lastDomainMode`·`setActiveNav` 추가(persist).
  **메뉴 이동은 필터를 보존하고 세그먼트 전환만 초기화한다**(§3.9)
- `select-active-markers.ts` — 날씨 분기를 "전부 감춤" → **저장 국소의 장비 마커만**(§3.4)
- `use-place-search.ts` **신설** — 사이드바 장소 검색과 전역 검색바가 같은 구현을 쓴다
- `gps-converter-panel.tsx` **신설** — 단건/일괄/엑셀. `gpsmap/lib/`를 그대로 써 `/gpsmap`과 로직 한 벌
- `backup-restore-section.tsx` — 위치 이동 + 삭제 버튼에 건수 문구("축전지 N건이 모두 지워집니다")
- `cctv-video-modal.tsx` — `SIDEBAR_WIDTH_PX=340` 제거 → 셸 상수 참조
- `map-region-capture-panel-view.tsx` — 오프셋은 **건드리지 않고**(지도 컨테이너 기준) 폭만 CSS 변수로

### 번들에서 겪은 것

변환기를 정적 import 했더니 홈 First Load JS가 **295 → 449 kB**로 뛰었다.
VWorld 지오코딩·엑셀 모듈이 홈 번들에 합류한 탓이다.
`dynamic()`으로 바꿔 **281 kB**가 됐다 — 개편 전보다 14 kB 작다.
대시보드도 같은 이유로 지연 로드한다.

### 검증 결과

| 항목 | 결과 |
| --- | --- |
| `tsc --noEmit` | 0 |
| `eslint . --max-warnings=0` | 0 |
| `vitest` | **269건 / 19파일 통과** (264 → +5, 날씨 분기 테스트 교체·추가) |
| `next build` | 성공 |
| 홈 First Load JS | **281 kB** (기준 295 kB 대비 감소) |
| `/gpsmap` | 348 kB (라우트 유지) |
| 폭 상수 | `grep -rn "340" src` → `shell/constants.ts` 정의부와 주석만 |

### 미검증 — 남은 것

| 항목 | 상태 |
| --- | --- |
| **브라우저 실물 확인** | 빌드·타입·테스트까지만. 화면 렌더링·클릭 동선은 미확인 |
| 1280/1024/768px 실측 | 반응형 규칙은 넣었으나 실제 폭에서 확인하지 않음 |
| §3.6 UI 공유 범위 | `/gpsmap` 페이지는 **손대지 않았다**. 공유한 것은 `gpsmap/lib/` 로직이고 UI 셸은 별개다(340px와 전체화면의 요구가 달라서). 계획서 문구는 "같은 컴포넌트 공유"였으므로 이 부분은 축소 구현이다 |
| 설정 메뉴 | 플로팅 컨트롤과 **병존**시켰다. 줌·내 위치·영역 캡처는 지도를 보며 눌러야 해서 옮기지 않았다 |

---

## [2026-07-26] CR-004 · 기상청 API 허브 실연동 및 실응답 대응

### 개요 및 목적
API 허브 인증키로 **실호출에 성공**했다. 문서 스펙만 보고 짠 부분이 실응답과 달라 3건을 고쳤고, 특보 반영 로직의 오경보 위험 1건을 함께 잡았다.

### 실응답에서 드러난 차이 (문서 ≠ 실제)

| # | 문서 기준 구현 | 실응답 | 조치 |
| --- | --- | --- | --- |
| 1 | 특보를 `WthrWrnInfoService` JSON으로 조회 | 허브는 이 경로를 **"허용되지 않은 API"로 거부**. `typ01/url/wrn_now_data.php` 텍스트만 제공 | 허브 전용 텍스트 파서 신설 |
| 2 | UTF-8 응답 가정 | **`Content-Type: text/plain;charset=EUC-KR`** — `response.text()`로 읽으면 한글이 전부 깨져 지역 매칭이 실패 | `arrayBuffer()` + `TextDecoder("euc-kr")` |
| 3 | WRN/LVL/CMD가 코드값(`W`/`1`/`1`) | **한글 문자열** (`폭염`/`경보`·`중대경보`·`주의`/`발표`·`변경`). 컬럼도 `ED_TM` 포함 10개, 헤더는 하이픈 패딩 | 코드 매핑 폐기, 실형식 기준 재작성 |

> 기상청 DB 스키마 문서(WRN2_MET_DATA)의 코드표와 실제 `wrn_now_data.php` 응답은 서로 다르다. **실응답을 기준으로 삼는다.**

### 안전 로직 수정 — 폭염경보 오경보

특보를 종류 구분 없이 `경보 → 중지`로 처리하고 있었다. 조회 시점에 **전남 전역에 폭염경보가 깔려 있어 모든 국소가 ⛔ 작업중지로 표시**되는 상태였다. 그런 화면은 아무도 신뢰하지 않는다.

`alertVerdict(type, level)`을 도입해 CR-004 §2 기준대로 갈랐다.

| 특보 | 반영 | 근거 |
| --- | --- | --- |
| 호우·강풍·대설·태풍·한파 | **stop** | §2.2~2.5 — 특보 자체가 작업 중지 사유 |
| 폭염 | 경보/중대경보 **danger**, 주의보 **warning** | §2.1 — 중지 판단은 체감온도가 주도 |
| 열대야 | **caution** | 야간 현상이라 주간 작업 판정에 직접 적용 곤란 |
| 건조·황사·풍랑 | 등급 미상승 | 작업 위험과 직결되지 않음 |

### 그 외 수정
- **URL 조립 버그**: `typ01` 경로를 `baseUrl`(`/api/typ02/openApi`)에 이어 붙여 존재하지 않는 경로를 호출하고 있었다. `legacyRoot`를 분리.
- 403(활용신청 필요)을 401(키 오류)로 뭉뚱그려 잘못 안내하던 메시지를 분리.
- Workers 런타임(`workerd`)에서 `TextDecoder("euc-kr")` 지원을 **실제로 확인**하고 적용 (Cloudflare 문서에는 명시 없음).

### 검증 결과 — 실호출 성공

`tsc` 0 · `eslint` 0 · `vitest` **185 passed** (신규 23) · `next build` 성공.

순천 조례(34.9506, 127.4872 / 격자 70,70 / 고소작업) 실조회:

```
종합판정: danger | 발표 2026-07-26T05:00:00+09:00
발효특보: 순천시 폭염경보, 순천시 열대야주의보
태풍: null (미발효 → DOM 미노출)
슬롯: 11 | 결측: 0 | 파싱 경고: 없음

07시 26/28.7 90% 북서1.7  safe     14시 33/33.5 60% 서3.0  warning
09시 29/31.1 80% 북서2.2  caution  15시 33/33.5 60% 서2.6  warning
11시 32/33.3 70% 서북서2.2 warning  17시 33/33.9 65% 서2.4  warning
```

- 11슬롯 **결측 0**, 체감온도·풍향 변환·경과(past) 처리 정상
- 특보 지역 매칭 정상 — 같은 전남이라도 **순천시 것만** 잡고 장성군·광양시는 제외
- 폭염경보가 `danger`로 반영되어 ⛔ 오경보 없음

> 검증 중 Git Bash `curl --data-urlencode`가 한글 파라미터를 망가뜨려 특보 0건으로 보인 구간이 있었다. **테스트 하네스 문제였고 앱 결함이 아니다.** 퍼센트 인코딩을 직접 넣어 재현·확인했다.

### 4개 소스 전량 연동 확인 (활용신청 완료 후)

초단기실황·초단기예보까지 승인되어 **문서 §4.2의 병합 우선순위가 실제로 동작**하는 것을 확인했다.
API 허브는 `VilageFcstInfoService`를 묶음이 아니라 **오퍼레이션 단위로 활용신청**받는다(단기예보조회와 별개로 초단기 2건을 각각 신청해야 함).

```
출처 분포: past 7 · ncst 1 · ultra 3   (11슬롯, 결측 0)

시각   단기예보만            4개 소스 병합           변화
14시   33/33.5 서2.5 warning  33.5/35  남서4.3 danger  ← 실황(ncst) 보정
15시   33/33.5 서2.6 warning  35/35.9  남서4.0 danger  ← 초단기예보 보정
16시   33/33.5 서2.3 warning  34/34.9  남서3.0 warning
```

실황이 단기예보보다 체감온도가 **1.5~2.4℃ 높게** 나와 14·15시 판정이 `warning → danger`로 올라갔다.
소스 보정이 실제 판정을 바꾸는 것을 확인했다 — 병합 로직이 형식적으로만 도는 게 아니다.

### 미완료

| 항목 | 상태 |
| --- | --- |
| **DB 마이그레이션 적용** | `20260727000000_add_worksite_weather_columns.sql` 미실행 |
| 태풍 상세(진로·중심기압) | 태풍특보 기반 배너만. 태풍정보 API 미연동 |
| "지도에서 보기" 버튼 | 미구현 |
| 브라우저 UI 실물 확인 | 라우트 응답까지만 검증. 사이드바 패널 렌더링은 미확인 |

---

## [2026-07-26] CR-004 · 국소 작업 안전 날씨 조회 구현

### 개요 및 목적
CR-004 계획대로 축전지 모드에 **당일 07~17시 시간대별 작업 안전 날씨 판정**을 붙였다. 국소명·주소로 조회하면 기온·체감온도·습도·바람·강수를 11슬롯으로 보여주고 4종 위험(폭염·강풍·강수·한파)을 판정한다.

### 변경된 내용

**신규 feature — `src/features/worksite-weather/`**
- `constants/thresholds.ts` — 판정 임계값 전량(31/33/35/38℃, 10m/s, 1mm, 1cm) 단일 소스. 한파 하위기준 확정 시 이 파일만 교체.
- `constants/kma-regions.ts` — 주소 시·도 접두어 → 특보 관서 stnId 매핑(전남 156). CR-004대로 DB 컬럼 대신 코드 상수.
- `types/weather.ts` — `Verdict`(safe~stop + **unknown**), `SlotSource`, 응답 계약.
- `lib/grid.ts` — Lambert 격자 변환 + 국내 범위 검사. **저장하지 않고 온디맨드 계산**.
- `lib/kma-base-time.ts` — KST 보정 일원화. `getVilageBaseForToday()`(05→02→전일23), 초단기 실황/예보 기준시각.
- `lib/parse-amount.ts` — PCP/SNO 문자열 → `{ max, label }`. 판정은 상한, 표시는 원문.
- `lib/apparent-temp.ts` · `lib/wind.ts` — 기상청 체감온도·16방위 변환.
- `lib/verdict.ts` — 4종 판정 + 종합 판정 + 권장 시간대(**배열**) + 위험 요약.
- `lib/merge-sources.ts` — 단기예보 골격에 초단기예보·실황을 **항목별 오버레이**. 배열 1회 순회.
- `lib/kma-client.ts` — 서버 전용. **두 포털 동시 지원**(공공데이터포털 `serviceKey` / 기상청 API 허브 `authKey`), isolate 메모리 캐시, `resultCode`·오류봉투 검증, 타임아웃 8초, 페이지네이션. Encoding 키를 넣어도 자동 디코드.
- `lib/site-search.ts` — 로드된 `battery_markers`에서 이름·별칭·주소 부분일치 검색.
- `lib/export-tbm.ts` — TBM 배포용 xlsx(기존 `xlsx` 의존 재사용).
- `hooks/use-worksite-weather.ts` · `components/` 4종(패널·타임라인 표·위험 요약·태풍 배너).

**라우트** — `src/app/api/worksite-weather/route.ts`. `guardProxyRequest` 적용, 좌표만 받는 순수 프록시(Supabase 접근 없음), 외부 호출 4건 `Promise.all` 병렬.

**기존 파일 변경**
- `map-sidebar.tsx` — 축전지 모드에 "국소 작업 안전 날씨" 아코디언 추가.
- `types/marker.ts`·`api.ts` — `BatteryMarker`에 `siteAlias`·`workType`. **마이그레이션 미적용 DB에서도 깨지지 않게** optional로 읽는다.
- `full-backup.ts` — `battery_markers` 백업 열에 두 컬럼 추가(왕복 유실 방지).
- `supabase/migrations/20260727000000_add_worksite_weather_columns.sql` — 신규(재실행 안전).

### 검증 결과

- `tsc --noEmit` ✅ 0 · `eslint .` ✅ 0 · `vitest run` ✅ **162 passed** (기존 39 → 신규 123)
- `next build` ✅ — `/api/worksite-weather`가 동적 라우트로 등록됨. 홈 First Load 482 kB → **487 kB**(+5 kB).
- **라우트 실행 검증** (`next start` + curl):

  | 요청 | 응답 |
  | --- | --- |
  | 파라미터 없음 | 400 `lat, lng 파라미터가 필요합니다.` |
  | `lat`만 지정 | 400 동일 |
  | `lat=abc` | 400 `올바른 숫자가 아닙니다.` |
  | 도쿄 좌표 | 400 `격자 범위를 벗어난 좌표` |
  | 외부 origin | **403** `허용되지 않은 요청 출처입니다.` |
  | 정상 좌표(키 미설정) | 502 서비스키 안내 |

- **발견·수정한 버그**: `Number(null)`·`Number("")`이 `0`이라 `lat`/`lng` 미지정 요청이 좌표 (0,0)으로 통과해 격자 검사까지 흘러갔다. 원시 문자열 존재 여부를 먼저 보도록 수정.
- 격자 변환은 앞선 작업에서 순천·광주·목포·여수·서울 5개 지점 실검증 완료.

### 미완료 — 별도 조치 필요

| 항목 | 상태 |
| --- | --- |
| **DB 마이그레이션 적용** | SQL 파일만 작성. Supabase SQL Editor에서 **직접 실행 필요** |
| **기상청 인증키** | 미발급. `KMA_API_HUB_KEY`(허브) 또는 `KMA_SERVICE_KEY`(포털) 중 하나 필요. 설정 전까지 502 + 안내 문구 |
| **기상청 실응답 검증** | 키가 없어 단 한 번도 실호출하지 못했다. 파싱은 문서 스펙 기반 |
| **태풍 상세(진로·중심기압)** | 태풍**특보** 기반 배너만 구현. 태풍정보 API 활용신청 후 `TyphoonInfo.detail` 채우면 확장됨 |
| **"지도에서 보기" 버튼** | 미구현. 스토어의 마커 선택이 상세 모달을 여는 동작이라 지도 이동 시맨틱을 확인하지 못했다 |

---

## [2026-07-26] CR-004 · 국소 작업 안전 날씨 계획서 정합화 (문서만, 구현 미착수)

### 개요 및 목적
외부 작성 계획서 `MapMarkerPro_국소작업안전날씨_구현계획서_v4.md`(v4.0)를 실제 저장소 구성과 대조해 **v4.1 정합본**으로 재작성. 코드 변경은 없다. 원본은 Downloads에 보존.

### 변경된 내용

- **신규 `docs/Ver_1.0/CR-004.md`** — CR-001~003 형식 준용. 불일치 13건을 §0 표에 원인·조치·근거 파일과 함께 정리하고, 본문 각 절을 그에 맞게 수정.
  - **C1~C4 구조**: D1 → Supabase, `locations`(부재) → `battery_markers`, 국소 검색·지오코딩을 서버 → **클라이언트 이관**. `/api/worksite-weather`는 좌표만 받는 순수 프록시가 되어 서버 경로에서 Supabase 접근이 사라짐.
  - **C7 로직 버그**: `getVilageBase()`(최신 발표시각) → `getVilageBaseForToday()`(05 → 02 → 전일 23). 원본은 14시 조회 시 07~13시 슬롯이 전량 결측됐고, 같은 문서 §4.4 본문과도 모순이었다.
  - **C8 판정 방향 오류**: `parseAmount`의 "미만 → 절반" 환산이 위험 과소평가 방향 → `{ max, label }`로 **판정은 상한 / 표시는 원문** 분리. `"30.0~50.0mm"` 상한 누락도 함께 수정.
  - **C5 캐시**: `caches.default`·`fetch(cf:{cacheTtl})`가 `*.workers.dev`에서 무효 → isolate 메모리 캐시 + `Cache-Control` 1단계, 커스텀 도메인 2단계로 재설계. `open-next.config.ts` 기본값이라 ISR도 영속되지 않음을 명시.
  - **C6 스키마 축소**: 원본 4컬럼 → `site_alias`·`work_type` 2컬럼. `grid_nx/ny`는 온디맨드 계산, `warn_stn_id`는 코드 상수.
  - **C9~C13 규약**: 전 예제 TS 전환, `guardProxyRequest` 필수 명시, `src/features/worksite-weather/` 배치 확정, 표 6열 조정(줄바꿈·가로스크롤 금지).
  - **원본 누락 2건 추가**: 컬럼 추가 시 `headers.ts`·`full-backup.ts` 동시 갱신(백업 왕복 유실 방지), `vitest.config.ts` include가 `.ts`뿐이라 `.tsx` 테스트 미실행.
  - 부록 C에 **삭제한 원본 항목과 사유**를 남겨 착오 복원을 방지.
- **`docs/implementation_plan.md`** — Phase A 섹션 누적(사용자 요청 원문·파악 결과·설계·완료 기준·미결 3건).
- **`docs/Ver_1.0/CHANGELOG.md`** — Ver_1.1 후보 표에 CR-004 행 추가.

### 검증 결과

- **격자 변환식 실행 검증** ✅ — 순천(70,70)·광주(58,74)·목포(50,67)·여수(73,66)·서울시청(60,127) 전부 CR-004 §9 표 및 기상청 공표값과 일치.
- 체감온도(Stull 습구온도 + 기상청 2020 개정식)·풍향 16방위 변환은 검토상 정합.
- 코드 변경 없음 → tsc/eslint/vitest 해당 없음.
- **미검증**: 기상특보 `getWthrWrnList` 응답 스키마. 특보구역코드를 입력으로 받지 않고 본문이 자유 서술 텍스트라 시·군·구 문자열 매칭이 필요하다. 원본 §9 표가 이를 입력 파라미터처럼 읽히게 써놨던 부분이라 **참조용으로 격하하고 리스크 항목에 등재**. 실제 스키마는 키 발급 후 확인 필요.
- **착수 전 사용자 결정 대기**: Cloudflare 요금제(CPU 한도·Cache API 가용), 커스텀 도메인 연결 여부.

### 발견된 기존 결함 (본 작업 범위 밖, 미수정)

`ARCHITECTURE.md`·`BUSINESS_RULE.md`·`CHANGELOG.md`·`DATABASE.md`·`CR-002.md`의 CR 링크 7곳이 `./CHANGE_REQUEST/CR-00x.md`를 가리키지만 실제 파일은 `docs/Ver_1.0/CR-00x.md`에 있어 **전부 깨진 링크**다. 별도 승인 후 일괄 수정 대상.

---

## [2026-07-23] 위치탭 — 주소 다중 입력 마커 표시

### 개요 및 목적
위치 모드에서 여러 주소를 붙여 넣으면 각 주소를 지오코딩해 임시 마커로 표시. DB 저장 없이 브라우저 메모리(`pendingLocationMarkers`)만 사용.

### 변경된 내용
- 신규 `components/sidebar/location-address-section.tsx`: Textarea 다중 주소 입력 → 파싱(줄당 1주소, `이름[Tab]주소` 지원, 빈줄·중복 제거) → `geocodeAddressQueue` → `createLocationMarker` → `addPendingMarkers("location")`. 진행률·결과 토스트(성공/중복/실패+실패주소), 성공 시 실패 주소만 입력창에 남김.
- `components/sidebar/map-sidebar.tsx`: 위치 모드에 "주소로 위치 찍기" 아코디언 추가(기본 펼침).
- `components/map/kakao-map-canvas.tsx`: 위치 마커 개수 증가 시 그 마커들로 `fitMapToMarkers`(주소·엑셀 추가 결과가 바로 보이게). 모드 벗어나면 카운트 리셋.

### 검증 결과
- `tsc --noEmit` ✅ · `eslint .` ✅ · `vitest run` 39 passed ✅
- 지오코딩은 브라우저 Kakao SDK 사용 → 실제 표시는 앱에서 확인 필요(로직은 기존 엑셀 업로드 흐름과 동일).

---

## [2026-07-23] 그룹 경계 방어 하드닝 (G6·G7)

### 개요 및 목적
4차 검수(PROJECT_ANALYSIS)에서 발견한 분리/합치기의 실질 리스크 2건을 저비용으로 방어.

### 변경된 내용
- **G7**(`marker-detail-modal.tsx` `relatedEquipmentMarkers`): 최종 집합에 **유효 키 필터** 추가 — 선택 마커와 `getMarkerEffectiveKey`가 일치하는 멤버만 남겨, 부모체인으로 끌려온 경계 넘는 dangling `parent_marker_id`를 제외. 상세·분리·합치기가 그룹 경계를 넘지 않음(빈 키 마커는 기존 동작 보존).
- **G6**(`separateLabelGroup`): **남은 번지 그룹 재승격을 분리보다 먼저** 실행 → 뒤 단계 실패 시에도 dangling parent가 남지 않음(최악은 잔여 중복 대표, 재정렬로 자가치유). 성공 경로 결과는 동일.

### 검증 결과
- `tsc --noEmit` ✅ · `eslint`(모달) ✅ · `vitest run` 39 passed ✅

---

## [2026-07-23] 분리 시 대표 직접 선택 UI

### 개요 및 목적
분리할 때 대표를 "최초 등록" 자동 지정하던 것을, **사용자가 대표 국소를 직접 고르는 2단계 UI**로 변경.

### 변경된 내용
- `assignGroupMembers(members, groupKey, preferredRepId?)`: 지정 대표 우선 → 기존 대표 → 최초 등록 순.
- `separateLabelGroup(label, repId?)`: 대표 id를 받아 분리, 토스트에 대표 국소명 표기.
- 상세 모달 분리 UI: 라벨별 행에서
  - 국소 1개면 `분리` 즉시 실행(대표 선택 불필요),
  - 2개 이상이면 `분리 (대표 선택)` → 국소 목록 펼쳐 `대표로 분리` 선택 시 그 국소를 대표로 분리.
- `pickingSplitLabel` 상태로 대표 선택 목록 토글, 마커 전환 시 초기화.

### 검증 결과
- `tsc --noEmit` ✅ · `eslint marker-detail-modal.tsx` ✅

---

## [2026-07-23] 동/구역 실제 그룹 분리 — group_key 도입(번지 하위 분리·원복)

### 개요 및 목적
같은 번지에 여러 구역(아파트 동, 공장 구역, 지하 등)의 장비가 있을 때, 그 구역만 **실제 독립 그룹(대표+SUB)** 으로 분리하고 원래 번지 그룹에서 빼내는 기능. 기존 "동 개별 표시"(`detached_visible`, 핀만 노출)는 그대로 두고, 진짜 그룹을 만드는 별도 "분리" 동작을 추가했다. 대표가 분리로 빠지면 남은 국소 중 하나를 새 대표로 승격하고, "번지로 합치기"로 원복한다.

### 변경된 내용
- **DB**: `markers.group_key text NULL` 추가(`20260723000000_add_group_key.sql`). 유효 그룹 키 = `group_key`(있으면) ↔ 번지 주소 키. 백업 컬럼(`full-backup.ts`)에 `group_key` 추가 → 백업/복원 왕복 보존.
- **그룹 로직**(`address-group.ts`): `getEffectiveGroupKey`·`buildSplitGroupKey` 추가. `assignMarkerParentsByLotAddress`·`applyMarkerRolesFromStoredGroupRole` 재그룹을 유효 키 기준으로 변경(엑셀 재업로드에도 분리 상태 유지).
- **조회**(`api.ts`, `types/marker.ts`): `group_key`→`groupKey` 매핑.
- **상세 모달**(`marker-detail-modal.tsx`):
  - 라벨 파서를 범용화(`parseSeparationLabel`): `NNN동`·`지하`/`B1`·그 외 `기타`.
  - `getAddressGroupMates` 등 그룹 판정을 유효 키 기준으로 → 분리 그룹은 상세·구분 변경이 그 그룹 안에서만 동작.
  - `assignGroupMembers`(대표+SUB 일괄 지정)·`separateLabelGroup`(분리)·`mergeSplitGroupToLot`(원복) 추가.
  - "동일 번지 국소 개별 배치" 패널에 라벨별 **분리** 버튼, 분리 그룹엔 **번지로 합치기** 버튼(단독 분리·SUB 뷰 포함).
- 지도(`kakao-map-canvas`)는 `parent_marker_id==null`만 렌더 → 분리 그룹의 새 대표 핀은 자동 노출(추가 작업 없음).

### 검증 결과
- `tsc --noEmit` ✅ · `eslint`(변경 5파일) ✅ · `vitest run` 39 passed ✅
- 동작(수동 확인 필요): 695-6번지에서 `103동 분리` → 103동이 번지에서 빠져 독립 대표+SUB, 지도에 별도 대표 핀. 대표가 빠지면 잔여 승격. `번지로 합치기`로 원복. 지하/기타도 각각 분리 가능.
- **주의**: `20260723000000_add_group_key.sql` 을 Supabase에 먼저 적용해야 함(미적용 시 컬럼 없음 오류).

---

## [2026-07-23] 연관 상세 범위 — 동 분리 여부에 따라 전체/해당 동 + 대표 단독 시 승격

### 개요 및 목적
동 미분리인데도 해당 동 장비만 보이던 문제 수정. **연관 상세는 동 필터 없이 동일 번지 전체**를 표시. 대표를 단독으로 빼면 남은 국소 중 새 대표(또는 단독) 지정.

### 변경된 내용
- 연관 상세 동 필터 **제거** — 항상 `(동일 번지 N건)`으로 103·105·107·110 등 전체 표시
- `relatedEquipmentMarkers`: 부모-자식 그룹 ∪ 같은 번지 메이트
- `changeMarkerGroupRole(단독)`: 대표 분리 시 잔여 국소 승격 유지

### 검증 결과
- `tsc --noEmit` ✅ · `eslint marker-detail-modal.tsx` ✅
- 기대: 미분리여도 연관 상세에 동일 번지 전체 국소가 보임.

## [2026-07-23] 연관 상세 구분 — 국소별 대표/단독/SUB 변경

### 개요 및 목적
동 분리 후 연관 상세 표에서 국소마다 **구분(대표/단독/SUB)** 을 바꿀 수 있는 선택 UI 추가.

### 변경된 내용
- `marker-detail-modal.tsx`
  - 구분 열 `<select>` (대표/단독/SUB), 로그인 시 변경
  - `changeMarkerGroupRole`: 동일 번지 메이트 기준으로 DB `group_role`·`parent_marker_id` 갱신
  - 표 구분은 DB 실제 역할 표시(동 표시용 role 덮어쓰기 제거)
  - 복사 시에도 현재 선택 구분 반영

### 검증 결과
- `tsc --noEmit` ✅ · `eslint marker-detail-modal.tsx` ✅

## [2026-07-23] 동 개별 표시 — 동당 대표 1핀만 (SUB 지도 숨김)

### 개요 및 목적
동 단위 개별 표시 시 국소마다 핀이 생기던 동작을, **동당 대표 1핀만** 지도에 두고 같은 동 SUB는 숨기도록 변경. 상세 표 구분도 동 내 1대표+SUB로 표시.

### 변경된 내용
- `marker-detail-modal.tsx`
  - `pickDongMapRepresentative` / `applyDongDisplayRoles`
  - `setGroupDetached`: 켤 때 대표만 `detached_visible=true`
  - `setMarkerDetached`: 켤 때 같은 동 형제 핀 끄고 선택 국소를 동 대표로
  - 상세 오픈 시 동당 표시 핀 2개 이상이면 1개로 자동 정리
  - UI: `동 개별 표시` / `동 대표로 표시` / 대표 뱃지, 안내 문구 수정

### 검증 결과
- `tsc --noEmit` ✅ · `eslint marker-detail-modal.tsx` ✅
- 기대: 103동 개별 표시 → 지도 핀 1개, 연관 상세 `(103동 4건)`에 대표 1 + SUB 3.

## [2026-07-22] 연관 상세 — 개별 표시 동(棟)만 필터

### 개요 및 목적
103동만 개별 표시한 뒤 해당 마커 상세를 열면, 연관 상세가 동일 번지 전체(16건)가 아니라 **103동 국소만** 나오게 수정.

### 변경된 내용
- `marker-detail-modal.tsx`
  - `detailDongLabel` / `detailEquipmentMarkers`: 현재 국소와 같은 동만 상세 표에 사용(동 없으면 동일 번지 전체).
  - 그룹 상세 빌더의 information 잔여 행 append 제거(다른 동 혼입 방지).
  - 제목: `(103동 N건)` 또는 `(동일 번지 N건)`.

### 검증 결과
- `tsc --noEmit` ✅ · `eslint marker-detail-modal.tsx` ✅
- 기대: 103동 개별 표시 마커 상세 → 제목 `(103동 N건)`, 표에는 103동 국소만.

## [2026-07-22] 연관 상세 장비 목록 — 동일 번지 그룹 전원 표시

### 개요 및 목적
동(棟) 그룹에는 SUB 4개가 보이는데 `연관 상세 장비 목록`은 1행만 나오던 버그 수정. 동일 번지 국소마다 상세 표에 1행씩 나오게 함.

### 변경된 내용
- `marker-detail-modal.tsx`
  - `relatedEquipmentMarkers`: SUB를 열어도 대표+형제 전체 포함.
  - `buildEquipmentDetailRows` / `takeInfoRowForMarker`: 그룹이면 국소 1건=1행(information은 marker_id·국소명 매칭, 없으면 마커 필드 합성). `facility_code`로 커버 판정하지 않음.
  - 단독(1국소)일 때만 information 다건을 그대로 표시.
  - fetch는 DB information만 적재하고, 행 조립은 위 빌더에 위임.

### 검증 결과
- `tsc --noEmit` ✅ · `eslint marker-detail-modal.tsx` ✅
- 기대 동작: 103동에 4개면 연관 상세에도 대표+해당 SUB(또는 매칭된 information)가 모두 행으로 표시.

## [2026-07-22] 동일 번지 국소 목록 — 동(棟)별 그룹화 + 동 단위 개별 표시

### 개요 및 목적
마커 상세 모달의 "동일 번지 국소 개별 배치" 섹션에서 국소별 `대표로`·`단독으로` 버튼을 없애고, 국소명에서 파싱한 동(棟) 기준으로 목록을 그룹핑. 각 동을 한 번에 지도에 개별 표시/숨김할 수 있는 일괄 토글을 추가(국소별 개별 토글은 유지).

### 변경된 내용
- `src/features/map-marker/components/modals/marker-detail-modal.tsx`
  - 헬퍼 추가: `parseDongLabel(name)` (`/(\d+)\s*동/` → `"103동"`, 없으면 `null` → `기타`), `dongSortKey`(동 번호 오름차순, 기타는 맨 뒤).
  - `dongGroups`: SUB 국소를 동별로 묶고 각 그룹의 `allDetached`(전원 표시 여부) 계산.
  - `setGroupDetached(dongLabel, ids, detached)`: `markers.detached_visible` 를 `.in('id', ids)` 로 일괄 update + 토스트. 진행 상태 `detachingGroup`.
  - JSX: SUB 목록을 동 헤더(동 라벨·건수·**[동 전체 개별 표시 / 동 전체 숨기기]**) + 국소 행(개별 토글만)으로 재구성.
  - 제거: `makeRepresentative`·`makeStandalone` 함수, `changingRepId` 상태, detached SUB 배너의 `단독으로` 버튼, 미사용 `setSelectedMarkerId`.
  - 유지: `모두 합치기`, 국소별 `지도에 개별 표시 / 표시 중·숨기기`, `개별 표시 해제`.

### 검증 결과
- `tsc --noEmit`: marker-detail-modal 관련 오류 없음.
- `eslint marker-detail-modal.tsx`: 통과(경고·오류 없음).
- 동작(코드 흐름): 동 헤더 토글 → 해당 동 전 국소 `detached_visible` 일괄 갱신 → invalidate 로 지도/목록 재조회. 전원 표시 중이면 '숨기기'로 뒤집힘.

## [2026-07-22] 구분 재정리 버튼 — 기존 1개짜리 지번 일괄 단독화

### 개요 및 목적
기존에 '대표'로 저장된 1개짜리 지번 마커들을 지금 바로 단독으로 바꾸기 위한 일괄 실행 버튼. (RLS상 DB 쓰기는 로그인 세션에서만 가능 → 앱 버튼으로 실행.)

### 변경된 내용
- `hooks/use-excel-upload-actions.tsx`: `regroupMarkerRoles` — 확인 후 `applyMarkerRolesFromStoredGroupRole`(저장 역할 존중, 1개 지번→단독) 실행 + invalidate + 결과 토스트.
- `components/sidebar/equipment-excel-section.tsx`: **[구분 재정리 (1개 지번 → 단독)]** 버튼 추가.

### 검증 결과
- `tsc --noEmit` 통과(exit 0), `eslint`(2파일) 통과.
- 실행: 장비 모드 사이드바 → [구분 재정리] 클릭(로그인 필요). 1개짜리 지번=단독, 여러 개=대표/SUB, 수동 단독 유지.

---

## [2026-07-22] 구분에 "단독" 추가 — 자동 판정 + 수동 지정

### 개요 및 목적
group_role(구분)에 **단독**을 추가. 단독 = 같은 지번에 마커가 1개뿐(그룹 없음). 자동으로 판정하고, 잘못 묶인 대표/SUB를 사용자가 수동으로 단독으로 바꿀 수 있게 함(그룹에서 빠져 개별 마커로 표시).

### 변경된 내용
- `lib/address-group.ts`
  - 상수 `GROUP_ROLE_STANDALONE='단독'` + `GroupRole` 타입 확장, `normalizeGroupRole`에 단독 인식(단독/STANDALONE/SOLO).
  - `assignMarkerParentsByLotAddress`: 지번 그룹이 1개면 **단독**, 2개↑면 대표+SUB. 주소 없는 행도 단독.
  - `applyMarkerRolesFromStoredGroupRole`: **저장된 '단독'은 그룹에서 제외해 유지**(재업로드 보존), 그룹에 1개만 남으면 단독. 저장 역할 없으면 기존 폴백.
- `components/modals/marker-detail-modal.tsx`
  - `makeStandalone(id)`: `parent_marker_id=null·group_role='단독'` update + invalidate.
  - SUB 목록 각 행에 **[단독으로]** 버튼(대표로/개별표시와 나란히), 개별표시된 SUB 자기 화면에도 [단독으로] 추가.
  - 단독은 parentMarkerId=null이라 지도 렌더 필터에서 SUB로 숨겨지지 않고 개별 표시됨. 연관 목록 "구분"에는 '단독' 표기.

### 검증 결과
- `tsc --noEmit` 통과(exit 0), `eslint`(2파일) 통과, IDE 진단 0건. 관련 테스트 의존성 없음.
- 수동 확인: 대표 상세의 SUB [단독으로] → 그룹에서 빠져 개별 마커로 표시·목록에서 사라짐 / 위치등록 재업로드 시 단독 유지 / 지번 1개짜리는 재그룹 후 자동 단독.

---

## [2026-07-22] 위치등록 재그룹 — 저장된 group_role 존중(수동 대표 유지)

### 개요 및 목적
위치등록(공정관리) 업로드 시 재그룹이 등록일 기준으로 대표를 다시 뽑아 **수동 대표 지정이 덮어써지던** 문제 해소. 저장된 group_role을 존중하도록 변경.

### 변경된 내용 (`hooks/use-excel-upload-actions.tsx`)
- `commitErpToDb`의 재그룹 호출을 `assignMarkerParentsByLotAddress`(등록일 기준) → **`applyMarkerRolesFromStoredGroupRole`**(저장된 대표/SUB 존중, 저장 역할이 전혀 없으면 등록일 기준으로 자동 폴백)로 교체. import도 함께 변경.
- ERP upsert는 markerRows에 group_role/parent_marker_id를 포함하지 않아 기존 마커의 역할이 보존됨 → 저장-역할 존중 재그룹과 정합.

### 검증 결과
- `tsc --noEmit` 통과(exit 0), `eslint` 통과, IDE 진단 0건.
- 효과: [대표로] 수동 지정 후 재업로드해도 대표 유지. (직전 walkthrough의 "주의" 한계 해소.)

---

## [2026-07-22] 동일 번지 국소 — 대표/SUB 수동 변경

### 개요 및 목적
같은 번지 그룹에서 어떤 국소가 대표인지 수동으로 바꾸는 기능. 지금까지 대표는 created_at(최초 등록) 기준 자동 지정뿐이었는데, 상세 모달에서 다른 SUB를 **[대표로]** 지정 가능.

### 변경된 내용 (`marker-detail-modal.tsx`)
- `makeRepresentative(newRepId)`: 새 대표 → `parent_marker_id=null·group_role='대표'`, 나머지 그룹 전원(기존 대표 포함) → `parent_marker_id=newRepId·group_role='SUB'` (`.in('id', subIds)`), invalidate 후 모달을 새 대표로 전환(`setSelectedMarkerId`).
- `changingRepId` 상태 + SUB 목록 각 행에 **[대표로]** 버튼(기존 개별표시 토글과 나란히).
- store 셀렉터 `setSelectedMarkerId` 추가.

### 검증 결과
- `tsc --noEmit` 통과(exit 0), `eslint` 통과, IDE 진단 0건.
- 수동 확인: 대표 상세 → SUB의 [대표로] 클릭 → 대표 전환(지도에 새 대표 표시, 기존 대표는 SUB로 숨김), 모달이 새 대표 기준으로 갱신.

### 주의(기존 동작 한계)
- 다음 위치등록(공정관리) 업로드 시 `assignMarkerParentsByLotAddress`(created_at 기준 자동 재그룹)가 실행되어 **수동 대표 지정이 덮어써질 수 있음**. 유지가 필요하면 업로드 재그룹을 저장된 group_role 존중 방식(`applyMarkerRolesFromStoredGroupRole`)으로 바꾸는 별도 작업 필요.

---

## [2026-07-22] 동일 번지 국소 — "모두 합치기"(개별 표시 일괄 복귀)

### 개요 및 목적
개별 표시(detach)로 지도에 흩뿌린 동일 번지 SUB들을, 대표 상세에서 **버튼 하나로 한 번에 다시 대표 1개로 합치는** 기능 추가. 개별 표시의 반대 동작.

### 변경된 내용 (`marker-detail-modal.tsx`)
- `mergeAllDetachedSubs`: 현재 `detachedVisible=true`인 대표의 SUB id를 모아 `markers.detached_visible=false` 일괄 update(`.in('id', ids)`) + `invalidateQueries`. 로그인 가드.
- `merging` 상태 + 대표 섹션 헤더에 **[모두 합치기 (N)]** 버튼(개별 표시된 SUB가 1개 이상일 때만 노출).
- `dbErrorMessage` 공용 헬퍼로 추출 — 개별 표시/합치기 공통 오류 문구(컬럼 미존재 시 마이그레이션 안내). 기존 `setMarkerDetached` catch도 이 헬퍼로 정리.
- `detachedSubCount` 파생값 추가.

### 검증 결과
- `tsc --noEmit` 통과(exit 0), `eslint` 통과, IDE 진단 0건.
- 선행 조건: `detached_visible` 컬럼(마이그레이션) 필요 — 없으면 안내 문구 노출.
- 수동 확인: SUB 여러 개 개별 표시 → 대표 상세에 [모두 합치기 (N)] → 클릭 시 전부 숨김 복귀(지도에서 사라지고 대표만 남음).

---

## [2026-07-22] 마커 상세 — 좌표·주소 변환 / 건축물대장 펼치기·숨기기(아코디언)

### 개요 및 목적
마커 상세에서 좌표·주소 변환과 건축물대장을 항상 함께 표시하던 것을, **각 섹션 헤더의 펼치기/숨기기 토글(아코디언)** 로 변경. 모달 열 때 자동 조회하지 않고, 펼칠 때 조회·표시. 두 섹션은 독립적으로 열고 접을 수 있다.

### 변경된 내용 (`marker-detail-modal.tsx`)
- 상태 `openCoord`/`openBuilding`(기본 false). (초기 버튼 방식 `activeGpsSection`에서 변경.)
- 자동 조회 `useEffect` 제거 → 마커/모달 변경 시 두 섹션 접고 상태 초기화하는 effect + **지연 조회 `loadGpsInfo`** + `toggleGpsSection`(펼칠 때 미조회면 조회, 좌표 캐시 유지).
- UI: 각 섹션 = 헤더(제목 + 우측 `펼치기`/`숨기기` + Chevron) 클릭 토글, 펼치면 아래 표 표시. 조회 중이면 헤더에 "조회 중…".

### 검증 결과
- `tsc --noEmit` 통과(exit 0), `eslint` 통과, IDE 진단 0건.
- 수동 확인: 장비 마커 상세 → 헤더 클릭 시 펼침/접힘, 첫 펼침에 조회(로딩 표시), 두 섹션 독립 토글, 같은 좌표 재조회 없음(캐시).

---

## [2026-07-22] 위치등록(공정관리) 업로드 — 즉시 저장 → 미리보기 후 적용

### 개요 및 목적
"위치등록 업로드"가 파일 선택 즉시 DB에 저장하던 것을, **지도에 임시 표시 → 위치 확인/드래그 조정 → [적용] 시 저장**하는 2단계 흐름으로 변경. 축전지/장비의 기존 pending 패턴과 동일한 UX.

### 변경된 내용
- `types/marker.ts`: `StagedErpUpload` 타입(markerRows·infoRows·erpRows·meta) 추가.
- `store/use-map-marker-store.ts`: `stagedErpUpload` 상태 + `setStagedErpUpload`(persist 제외 — pending과 동일하게 새로고침 시 소멸).
- `hooks/use-excel-upload-actions.tsx`:
  - `uploadErpExcel`을 **`buildErpPayload`(파싱·지오코딩·행 생성, DB 미저장)** 와 **`commitErpToDb`(자식행 삭제→markers upsert→info/erp insert→번지 재그룹→invalidate)** 로 분리.
  - `prepareErpUpload`: build → 스테이징 저장 + 지도에 임시(노란) 마커 표시(좌표 있는 행만). 직전 미리보기는 대체.
  - `applyStagedErp`: 지도에서 드래그로 조정된 pending 좌표를 `commitErpToDb`에 override로 넘겨 저장 → pending·스테이징 정리 + 필터 초기화.
  - `cancelStagedErp` / `excludeStagedMarker`(개별 제외 시 지도+스테이징 동시 제거로 정합성 유지).
  - 기존 `uploadErpExcel`(즉시 저장)은 장비/위치 업로드의 ERP 자동 라우팅 폴백용으로 유지(회귀 방지).
  - 모듈 헬퍼 `stagedMarkerRowToPending`, `buildErpSummary`(즉시/적용 요약 공용).
- `components/sidebar/equipment-excel-section.tsx`: 버튼 → `prepareErpUpload`. 미리보기 패널(건수, **[적용(DB 저장)]**/[취소], 항목별 위치확인·수정·제외) 추가 — `battery-excel-section` 미러링.

### 검증 결과
- `npx tsc --noEmit` 통과(exit 0), 변경 4파일 `eslint` 통과, IDE 진단 0건.
- 드래그 저장 경로 재사용: pending 마커 dragend → `updatePendingMarker`(`kakao-map-canvas.tsx`)로 좌표 갱신 → 적용 시 override 반영.
- 수동 확인 필요: 위치등록 업로드 → 지도에 노란 마커 표시(저장 안 됨) → 드래그로 위치 조정 → [적용] 저장·필터 초기화로 마커 노출 / [취소] 폐기 / 항목 [제외] 후 적용 시 해당 건 미저장 / 좌표 없는 행은 지도 미표시·적용 시 좌표 없이 저장.

### 남은 항목 (다음 증분 후보)
- 여러 파일 연속 업로드 시 미리보기 병합(현재는 대체) · 장비/위치 자동 라우팅도 미리보기로 통일 · 미리보기 상태에서 새로고침 경고

---

## [2026-07-22] 같은 지번 다중 시설 — 드래그 개별 배치 + 선택적 SUB 해제

### 개요 및 목적
광양제철소처럼 넓은 지번에 여러 시설이 흩어져 있어도 "같은 번지 → 마커 1개"로 합쳐지던 문제 해소. SUB는 기본 숨김을 유지하되, 사용자가 상세 모달에서 시설별로 "지도에 개별 표시"를 켜면 개별 마커로 노출되고, 기존 드래그 이동(이미 lat/lng DB 저장)으로 실제 위치에 배치.

### 핵심 발견 (구현 단순화)
- 지도 마커는 이미 전부 `draggable`이며, 드래그(dragend) 시 `markers.lat/lng`를 DB update + 쿼리 무효화까지 완비(`kakao-map-canvas.tsx:408·422·477`). → 좌표 배치는 신규 개발 불필요, **숨김 해제 스위치만** 추가하면 됨.
- `MarkerClusterer`가 이미 붙어 있어, 해제된 다수 마커의 밀집은 자동으로 클러스터 처리.

### 변경된 내용
- **DB(마이그레이션 파일만 작성, 적용은 사용자)**: `supabase/migrations/20260722000000_add_detached_visible.sql` — `markers.detached_visible boolean not null default false` + 인덱스 + `NOTIFY pgrst`.
- `types/marker.ts`: `EquipmentMarker.detachedVisible?: boolean` 추가.
- `api.ts`: 매핑에 `detachedVisible: row.detached_visible ?? false`(컬럼 없으면 false로 안전).
- `kakao-map-canvas.tsx`: 렌더 필터를 `isEquipmentSubMarker && !detachedVisible`일 때만 숨김 → 해제된 SUB만 표시.
- `marker-detail-modal.tsx`:
  - `setMarkerDetached(id, detached)` — `markers.detached_visible` update + `invalidateQueries`, 로그인 가드, 켜면 모달 닫아 바로 드래그 유도.
  - UI: **대표** 상세엔 "동일 번지 국소 개별 배치" 목록(시설별 [지도에 개별 표시]/[표시 중·숨기기]), **개별 표시된 SUB** 상세엔 [개별 표시 해제] 버튼.

### 검증 결과
- `npx tsc --noEmit` 통과(exit 0), 변경 4파일 `eslint` 통과, IDE 진단 0건.
- **선행 조건**: 마이그레이션 적용 전에는 컬럼이 없어 기능이 무동작(조회는 `?? false`로 안전, [개별 표시] 클릭 시 update 실패). 적용 후 정상 동작.
- 수동 확인 필요: (마이그레이션 적용 후) 대표 상세 → 시설 [지도에 개별 표시] → 지도에 마커 노출 → 드래그로 실위치 이동·저장·새로고침 유지 / 미해제 SUB는 계속 숨김 / 개별 마커 상세에서 [해제] 시 숨김 복귀.

### 남은 항목 (다음 증분 후보)
- 엑셀 시설별 좌표가 있으면 업로드 시 자동 개별 배치 · 개별 표시 일괄 On/Off · 백업 엑셀에 detached_visible 왕복

---

## [2026-07-22] 마커 상세 모달 — GPSMAP 좌표·주소 변환 + 건축물대장 연동

### 개요 및 목적
장비(equipment) 마커 상세 모달에, GPSMAP 변환기와 동일한 좌표·주소 변환 정보와 건축물대장을 마커 좌표로 자동 조회해 표시. 마커만 클릭해도 지번/도로명/도분초/구글좌표/PNU·건물 정보를 한눈에 확인.

### 변경된 내용
- `marker-detail-modal.tsx`
  - GPSMAP 로직 재사용: `runSingleLookup(\`${lat}, ${lng}\`)`(features/gpsmap) 호출로 `GpsLookupResult` 획득
  - 상태 `gpsInfo`/`gpsLoading`/`gpsError` + 좌표별 캐시 `gpsCacheRef`(같은 좌표 재열람 시 재호출 생략)
  - `useEffect`(deps: isDetailOpen·mode·좌표): 모달 열림 + 장비 모드 + 유효 좌표일 때 자동 조회, 좌표 없으면 안내, 실패 시 사용자 친화 문구(원 에러 미노출), 언마운트/좌표변경 시 `cancelled` 가드
  - UI 카드 2개(장비 모드 한정): **좌표·주소 변환**(구/신주소·우편번호·좌표·위도/경도(도분초)·구글좌표·PNU), **건축물대장**(9항목). 라벨-값 행 컴포넌트 `GpsInfoRow`(조회 중 `…`, 없으면 `-`)
- 축전지/location 모달·기존 표(연관 장비 목록)는 변경 없음

### 검증 결과
- `npx tsc --noEmit` 통과(exit 0), `eslint` 해당 파일 통과, IDE 진단 0건
- 데이터 출처: VWorld JSONP(브라우저), 키 `NEXT_PUBLIC_VWORLD_API_KEY`(기설정) — 별도 백엔드 불필요
- 수동 확인 필요: 장비 마커 열람 시 두 카드 자동 채워짐 / 토지(건물 없음) 마커는 신주소 "도로명주소 없음 (토지)"·건축물대장 "결과 없음" / 좌표 없는 마커 안내 문구

### 남은 항목 (다음 증분 후보)
- 축전지 모달 확장 · 조회 결과를 마커 필드로 저장(영구 캐시) · 상세 모달 → GPSMAP 페이지 딥링크

---

## [2026-07-19] GPSMAP — 로드뷰를 인라인 패널로(모달/새창 제거)

### 개요 및 목적
로드뷰 도로 클릭 시 새창/모달로 뜨던 것을, 카카오맵 페인 안에서 인라인으로 표시하도록 변경(참조 스크린샷과 동일). 우상단 「로드뷰 닫기」로 지도 복귀.

### 변경된 내용
- `kakao-maps.d.ts`: `Roadview`/`RoadviewClient` 생성자·인터페이스 추가
- `roadview-pane.tsx` 신규: 카카오 페인 위 `absolute inset-0` 인라인 로드뷰. `RoadviewClient.getNearestPanoId(100m)` → `Roadview.setPanoId` + `relayout`, 로딩/에러 오버레이, 우상단 「로드뷰 닫기」
- `gpsmap-page.tsx`
  - 기존 `RoadviewModal`(모달)·스토어 `openRoadview` 제거
  - `roadviewSpot` 상태로 인라인 패널 렌더, 도로 클릭 시 `setRoadviewSpot`
  - 로드뷰 표시 중에는 상단 캡션·「로드뷰」 토글·「조회 중」 숨김

### 검증 결과
- `tsc`/`eslint`/`next build` 통과(`/gpsmap` 13.7 kB)
- 수동 확인 필요: 「로드뷰」 → 파란 도로 클릭 시 페인 내 인라인 로드뷰 표시, 「로드뷰 닫기」로 지도 복귀

---

## [2026-07-19] GPSMAP — 로드뷰를 카카오맵 방식(도로 선택)으로 변경

### 개요 및 목적
"현재 위치 즉시 열기"였던 로드뷰를 카카오맵 네이티브 방식으로 변경. 버튼을 켜면 지도에 로드뷰 제공 도로(파란 선)가 표시되고, 원하는 도로를 클릭하면 그 지점 로드뷰가 열린다.

### 변경된 내용
- `kakao-maps.d.ts`: `RoadviewOverlay` 생성자·`KakaoRoadviewOverlay` 인터페이스 추가
- `gpsmap-page.tsx`
  - `roadviewMode` 상태 + `roadviewOverlayRef`/`roadviewModeRef`/`openRoadviewSelectRef`
  - 버튼 = 선택 모드 토글: ON이면 `kakao.maps.RoadviewOverlay`를 지도에 표시(파란 도로), 버튼 활성(로드뷰 선택 중)·안내 배너 전환
  - 지도 클릭 리스너 분기: 선택 모드면 클릭 지점 `openRoadview()` 후 모드 종료, 아니면 기존 좌표 조회
  - 표시는 기존 `RoadviewModal` 재사용

### 검증 결과
- `tsc`/`eslint`/`next build` 통과(`/gpsmap` 10.9 kB)
- 수동 확인 필요: 「로드뷰」 클릭 → 파란 도로 표시 → 도로 클릭 시 로드뷰 모달, 도로 아닌 곳/데이터 없으면 안내

---

## [2026-07-19] GPSMAP — 카카오맵 로드뷰 버튼 추가 (구: 현재위치 즉시 열기)

### 개요 및 목적
주소/좌표 통합 변환기의 카카오맵 우측 상단에 「로드뷰」 버튼을 추가했다. (이후 카카오 도로 선택 방식으로 대체됨)

### 변경된 내용
- `gpsmap-page.tsx`: `RoadviewModal` 지연 로드 재사용, 스토어 `openRoadview` 사용, 우상단 버튼 추가

### 검증 결과
- `tsc`/`eslint`/`next build` 통과

---

## [2026-07-19] 위치탭도 로그인 사용자만 접근 허용

### 개요 및 목적
공개로 열려 있던 위치탭(엑셀 위치찍기·임시 마커)을 로그인 상태에서만 사용하도록 제한했다. 사이드바 탭과 지도(mode 기반 렌더)를 함께 차단.

### 변경된 내용
- `mode-tabs.tsx`: `lockedModes` prop 추가 — 잠긴 탭은 자물쇠 아이콘·비활성(`disabled`)·클릭 무시, `title` 안내
- `map-sidebar.tsx`
  - `locationLocked = hasMounted && !isAuthenticated`
  - 로그아웃 상태에서 `mode==='location'`이면 `setMode('equipment')`로 강제 전환(지도까지 일관 차단)
  - `ModeTabs`에 `lockedModes={locationLocked ? ['location'] : []}` 전달

### 검증 결과
- `tsc`/`eslint`/`next build` 통과
- 수동 확인 필요: 로그아웃 시 위치탭 잠금(자물쇠)·선택 불가, 위치모드였다면 장비모드로 전환, 로그인 후 정상 사용

---

## [2026-07-19] GPSMAP — 로그인 사용자만 접근 허용

### 개요 및 목적
주소/좌표 통합 변환기를 로그인 상태에서만 사용하도록 제한했다. 위치탭 등 사이드바 진입 링크와 `/gpsmap` 페이지 자체(URL 직접 접근 포함)를 모두 가드했다.

### 변경된 내용
- `map-sidebar.tsx`: 「주소/좌표 통합 변환기」 링크를 `hasMounted && isAuthenticated`일 때만 렌더
- `gpsmap-page.tsx`: `useAuthSession`+`useHasMounted`로 가드 — 로딩 중「불러오는 중...」, 미로그인 시 「로그인이 필요합니다」 안내(+지도로 돌아가기 링크), 로그인 시에만 도구 렌더

### 검증 결과
- `tsc`/`eslint`/`next build` 통과(`/gpsmap` 12.6 kB)
- 수동 확인 필요: 로그아웃 시 사이드바 링크 미표시·`/gpsmap` 직접 접근 시 로그인 안내, 로그인 후 정상 진입

---

## [2026-07-19] GPSMAP — 건축물대장 조회 수정(LT_C_BLDGINFO 기본화)

### 개요 및 목적
"건축물대장 조회 결과가 없습니다"가 항상 뜨던 문제 수정. 웹 포트가 `getBuildingUse`(국가중점 API 권한 필요)를 먼저 시도해 실패했고, 폴백 LT_C_BLDGINFO 요청도 `attribute` 누락·POINT 한정·필드명 불일치로 비었다.

### 원인 (원본 GPSMAP_V3.1 대비)
- 원본의 신뢰 소스는 **LT_C_BLDGINFO를 req/data로 클릭 좌표 직접 조회**(권한 불필요)인데 포트는 이를 폴백으로만 사용
- 폴백 요청에 `attribute=true` 없음 → 속성 미반환 / `POINT`만 조회 → 지오코딩 점이 건물 밖이면 0건 / 필드명을 `bdNm·grndFlrCnt`로 읽음(실제는 `bld_nm·grnd_flr·totalarea·platarea·archarea·usability`)

### 변경된 내용
- `vworld-gpsmap.ts` `fetchBuilding` 재작성
  - **LT_C_BLDGINFO 우선**: `version=2.0·attribute=true·geometry=true`, `POINT → BOX(약 5·13·28·50m)` 순차 확장 후 클릭 좌표 최근접 건물 선택
  - `mapLtcBuilding`: 원본 LT_C_BLDGINFO 실제 필드명으로 매핑
  - `getBuildingUse`(PNU 19자리)는 LT_C_BLDGINFO 실패 시 폴백으로 강등
  - `firstGeometryPoint`·`approxDistanceMeters` 헬퍼 추가

### 검증 결과
- `tsc`/`eslint`/`next build` 통과(`/gpsmap` 11.7 kB)
- VWorld 키가 도메인/Referer에 묶여 서버 curl은 `INCORRECT_KEY` → 브라우저에서만 검증 가능. **수동 확인 필요**: 실제 주소/클릭 조회 시 건물명·층수·면적·용도 표시

---

## [2026-07-19] GPSMAP — 듀얼 브이월드 지적도(하단 페인·양방향 동기화)

### 개요 및 목적
`/gpsmap` 지도 영역을 상단 카카오 위성 / 하단 브이월드 지적도 2단으로 나눠, PPTX 핵심인 "교차 검증"을 구현했다. 두 지도는 함께 이동한다.

### 변경된 내용
- 의존성: `leaflet` + `@types/leaflet` 추가
- `vworld-map-pane.tsx` 신규(Leaflet, 클라이언트 전용 dynamic import)
  - VWorld XDWorld 2D 베이스 타일 + VWorld WMS 지적도(`lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun`) 오버레이
  - `VworldMapHandle`(`setView`/`setParcels`) 명령형 핸들, `onUserMove` 콜백, `지적도 끄기/켜기` 토글
  - flex 레이아웃 대응 `invalidateSize`
- `gpsmap-page.tsx`
  - `<main>`을 상·하 2단 flex로 분할, 하단에 `<VworldMapPane>`
  - 카카오 레벨↔Leaflet 줌 매핑(`20 - 값`) + `kakaoSyncLockRef`로 양방향 동기화(카카오 dragend/zoom_changed ↔ Leaflet moveend)
  - 조회 결과 시 하단 지도도 동일 위치·필지(빨간 경계)로 동기화

### 검증 결과
- `tsc`/`eslint`/`next build` 통과, `/gpsmap` 정적 산출(11.3 kB) — Leaflet dynamic import로 프리렌더 안전
- `next start` 스모크: `/gpsmap` HTTP 200, 「브이월드 지적도」 등 마크업 렌더 확인
- 수동 확인 필요(브라우저): 상·하 지도 동시 이동/줌, 지적도 표출·토글, 조회 시 두 지도 동시 이동
- 주의: VWorld WMS는 `domain`(현재 `window.location.origin`)을 콘솔 등록 도메인과 일치시켜야 타일 로드됨. 로컬은 localhost 등록 필요

---

## [2026-07-19] GPSMAP — 지도 클릭 탐색 + GPS 도분초 강제이동

### 개요 및 목적
`/gpsmap` 지도를 인터랙티브하게 만들어, 지도 클릭만으로 해당 지점을 조회하고 GPS 도분초로 직접 이동할 수 있게 했다. (PPTX 핵심기능 ① 클릭 탐색·GPS 검색)

### 변경된 내용
- `gpsmap-page.tsx`
  - 단건 조회 로직을 `lookupInput(text)`로 공용화(검색창·지도클릭·도분초 이동 공용)
  - 지도 `click` 리스너 1회 등록 + `lookupInputRef`로 최신 조회 함수 참조 → 클릭 지점 좌표 즉시 조회
  - GPS 도분초 입력 8칸(위도·경도 각 도/분/초/1/100초) + `이동` 버튼(`dmsToDecimal`·`validateKoreaCoordPair` 검증)
  - 조회 결과 시 `splitDmsParts`로 도분초 박스 자동 채움
  - 지도 좌상단 클릭 안내·우상단 「조회 중」 오버레이

### 검증 결과
- `tsc --noEmit`·`eslint src/features/gpsmap`·`next build` 모두 통과, `/gpsmap` 라우트 정상 산출(10.3 kB)
- 수동 확인 필요: 지도 클릭 시 필지 강조·건축물대장 표시, 도분초 입력 후 이동

---

## [2026-07-19] GPSMAP 통합 이어하기 — 라우트·일괄·엑셀

### 개요 및 목적
중단된 GPSMAP(주소·좌표·필지·건축물대장) 기능을 `/gpsmap`으로 연결하고 일괄 조회·엑셀을 추가했다.

### 변경된 내용
- 라우트 `src/app/gpsmap/page.tsx`
- 사이드바 「주소/좌표 통합 변환기」 링크
- 단건/일괄 탭, `batch-lookup`·`export-excel`
- VWorld 주소 정규화(전남광주통합특별시 → 광주광역시)

### 검증 결과
- 로컬에서 `/gpsmap` 진입 후 단건·일괄·엑셀 확인

---

## [2026-07-19] 프로젝트 코드로 사업연도 추출

### 개요 및 목적
프로젝트 코드 두 번째 구간의 YY를 사업연도(시설연도)로 쓴다.

### 변경된 내용
- `extractYearFromProjectCode`: `E.M267…` → `2026` 등
- 업로드·백업 `시설연도`에 반영

### 검증 결과
- 샘플 코드 4건 → 모두 `2026`

---

## [2026-07-19] 백업 엑셀에 색상 열 추가

### 개요 및 목적
전체 백업·복원 엑셀에서 마커 색상을 보고 수정할 수 있게 했다.

### 변경된 내용
- 선두 열: `…시설연도, 색상` (`#rrggbb`)
- 복원 시 `색상`/`마커색상` 열 → `markers.color`

### 검증 결과
- 전체 백업 후 색상 열 확인 → 값 수정 후 전체 복원

---

## [2026-07-19] 상세 표 줄바꿈 금지 + 규칙 추가

### 개요 및 목적
연관 상세 장비 목록에서 국소명 등이 줄바꿈되던 문제를 막고, 표 줄바꿈 금지 규칙을 추가했다.

### 변경된 내용
- `marker-detail-modal.tsx`: `th`/`td`에 `whitespace-nowrap`
- `.cursor/rules/table-no-wrap.mdc` 추가, `AGENTS.md`에 안내

### 검증 결과
- 상세 모달 표에서 긴 국소명이 한 줄로 표시되는지 확인

---

## [2026-07-19] 스키마 마이그레이션 SQL 통합

### 개요 및 목적
`recreate` + `parent_marker_id` + `group_role` 마이그레이션 3개를 하나의 SQL로 통합했다.

### 변경된 내용
- `20260718120000_recreate_full_schema_with_erp.sql`에 컬럼·인덱스·COMMENT·ALTER 포함
- `20260719010000_*`, `20260719020000_*` 삭제
- `migrations/README.md` 갱신

### 검증 결과
- Supabase SQL Editor에서 통합 파일 1회 실행하면 됨

---

## [2026-07-19] 토스트 UI를 앱 다크 스타일에 맞춤

### 개요 및 목적
우측 하단 알림이 흰색 기본 스타일이라 지도·사이드바 UI와 맞지 않아 slate 다크 토스트로 통일했다.

### 변경된 내용
- `toast.tsx`: `bg-slate-900` / `border-slate-700` / `text-slate-100` 계열
- 백업 완료 메시지: `tables.*.length` 오용으로 나오던 `undefined` 수정

### 검증 결과
- 전체 백업 후 우측 하단 토스트 스타일·건수 문구 확인

---

## [2026-07-19] 백업 선두 6열 고정

### 개요 및 목적
백업 다운로드 시 `위도, 경도, 마커아이디, 등록일, 구분, 시설연도`를 항상 맨 앞에 둔다.

### 변경된 내용
- `BACKUP_LEADING_HEADERS`로 선두 6열 고정 후 공정 79열 배치
- `시설연도`는 `information.facility_year` 우선

### 검증 결과
- 전체 백업 재다운로드로 선두 열 확인

---

## [2026-07-19] 백업 엑셀 열을 공정 업로드 79열과 일치

### 개요 및 목적
전체 백업 파일 열이 공정관리 업로드와 달라, `통합 문서1.xlsx`의 79열 순서·이름으로 맞췄다.

### 변경된 내용
- `full-backup.ts`: `PROCESS_ERP_HEADERS` 79열 고정
- 복원용 `위도/경도/마커아이디/등록일/구분`은 79열 뒤에 배치
- `시설연도` 강제 선두 열 제거

### 검증 결과
- 샘플 공정 시트 헤더와 `PROCESS_ERP_HEADERS` 79열 일치 확인

---

## [2026-07-19] markers.group_role(대표/SUB) 저장

### 개요 및 목적
동일 번지 대표·SUB를 DB `group_role`에 저장하고, 백업 엑셀 `구분` 열로 수정·복원할 수 있게 했다.

### 변경된 내용
- 마이그레이션 `20260719020000_add_group_role.sql`
- 취합 시 `parent_marker_id` + `group_role` 동시 갱신
- 백업 `구분` 열, 복원 시 구분열 우선 적용
- 상세 목록에 `구분` 열 표시

### 검증 결과
- SQL 실행 후 위치등록 재업로드 또는 전체 복원으로 `group_role` 확인 필요

---

## [2026-07-19] 장비 업로드 메뉴 정리·추가항목 업데이트

### 개요 및 목적
장비 사이드바에서 일반 Excel/CSV 위치 업로드를 제거하고, 상세장비 업로드를 공정관리 추가항목 업데이트로 변경했다.

### 변경된 내용
- `EquipmentExcelSection`: ERP 업로드만 유지
- `EquipmentInfoSection` / 사이드바 제목: 공정관리 추가항목 업데이트
- `uploadInfoExcel`: ERP·information 양식 모두 지원, 기존 통합시설코드만 갱신

### 검증 결과
- UI 라벨·버튼 확인 완료

---

## [2026-07-19] 주소 동일 시 대표·서브 국소 취합

### 개요 및 목적
공정관리 업로드 시 번지까지 같은 주소를 대표·서브로 묶고, 지도에는 대표 핀만 표시한다.

### 변경된 내용
- 마이그레이션 `parent_marker_id`
- `lib/address-group.ts` 번지 키·재취합
- ERP 업로드·전체 복원 후 재취합
- 지도 서브 핀 숨김, 상세 모달 서브 목록, 오버레이 `(+N)`

### 검증 결과
- Supabase에서 `20260719010000_add_parent_marker_id.sql` 실행 후 ERP 재업로드로 취합 확인 필요

---

## [2026-07-19] 백업을 공정관리(한글 열) 형식으로 수정

### 개요 및 목적
업로드한 `통합 문서1.xlsx`의 79열 정보가 백업에서 안 보이던 문제를 수정했다. 실제 데이터는 `erp_details.raw`에 있었으나 DB 컬럼/JSON으로만 나가 확인이 어려웠다.

### 변경된 내용
- 백업 export: `raw`를 한글 열로 펼친 1국소=1행 형식 (+ 위도/경도/마커아이디)
- 복원: 공정관리 형식·레거시 `테이블` 형식 모두 지원

### 검증 결과
- 원인 확인: 백업에 629건 erp가 있었으나 raw가 단일 JSON 셀이라 원본과 다르게 보임
- 수정 후 전체 백업 재다운로드로 한글 열 확인 필요

---

## [2026-07-19] 전체 백업을 엑셀 1시트로 변경

### 개요 및 목적
전체 백업·복원을 JSON에서 엑셀 1시트로 바꾸고, 파일명을 `yyyymmdd_mapmarker_backup.xlsx` 형식으로 맞췄다.

### 변경된 내용
- `full-backup.ts` 추가: 단일 시트 export/parse, `테이블` 구분 열
- `use-data-backup-actions.ts`: `exportFullExcel` / `importFullExcel`
- UI accept를 `.xlsx,.xls`로 변경

### 검증 결과
- 코드 연결 완료
- 수동: 전체 백업 다운로드 파일명·시트 확인 → 전체 복원 → 화면 데이터 일치

---

## [2026-07-19] 전체 데이터 1파일 백업·복원

### 개요 및 목적
테이블별 Excel 백업·복원을 제거하고, 전체 DB를 JSON 1파일로 백업·복원(전면 교체)하도록 변경했다.

### 변경된 내용
- `backup-restore-section.tsx`: 전체 백업/전체 복원 버튼만 노출 (JSON)
- `use-data-backup-actions.ts`: `exportFullJson` / `importFullJson`만 유지, 복원 시 markers·battery_markers 삭제 후 재삽입(전면 교체)
- 축전지 모드의 일괄 삭제 버튼은 유지

### 검증 결과
- 코드 연결·타입 정리 완료
- 수동 확인: 로그인 → 데이터 백업 및 복원 → 전체 백업 → 전체 복원 → 장비/축전지 화면 데이터 일치

---
