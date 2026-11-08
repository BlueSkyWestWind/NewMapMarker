# MapMarker Pro (geographic_tech)

통신 장비·축전지 **국소를 지도에 관리하고, 당일 작업 안전 날씨를 판정**하는 웹 앱입니다.
`001.MapMarker`(바닐라 JS)를 Next.js 15 + TypeScript 구조로 재구성했습니다.

- 현재 릴리스: **Ver_3.0** (2026-11-07) — 장비 시설 상태 판정·필터·표시색, 위치등록 신규 건 확인 후 건별 저장, 위치 메뉴 국소 목록(관리자 목록 보호·다중 색상 핀) 및 대시보드 임시 마커 이동, 드릴다운 사이드바(레일·트리)·모바일 하단 메뉴·시트 재설계, 그룹관리(관리자 전용 국소 자료 수정), **시설일정**(주간·월간 일정표 관리와 엑셀 배포)
- 버전 표기: `Ver_X.Y`는 사용자 대상 제품 릴리스이며, `package.json`의 `0.1.0`은 npm/배포 패키지 식별자다. 제품 릴리스 변경만으로 npm 버전을 자동 변경하지 않는다.
- 문서: [`docs/Ver_3.0/`](./docs/Ver_3.0/Ver_3.0_계획.md)([`장비상태`](./docs/Ver_3.0/Ver_3.0_장비상태_구현.md) · [`위치등록 신규확인`](./docs/Ver_3.0/Ver_3.0_위치등록_신규확인_구현.md) · [`사이드바`](./docs/Ver_3.0/Ver_3.0_사이드바_구현.md) · [`위치목록`](./docs/Ver_3.0/Ver_3.0_위치목록_구현.md) · [`그룹관리`](./docs/Ver_3.0/Ver_3.0_그룹관리_구현.md) · [`시설일정`](./docs/Ver_3.0/Ver_3.0_시설일정_구현.md)) ·
  [`docs/이전버젼/`](./docs/이전버젼/)([`Ver_2.3`](./docs/이전버젼/Ver_2.3/Ver_2.3_implementation_plan.md) · [`Ver_2.2`](./docs/이전버젼/Ver_2.2/Ver_2.2_implementation_plan.md) · [`Ver_2.1`](./docs/이전버젼/Ver_2.1/Ver_2.1_implementation_plan.md) · [`Ver_2.0`](./docs/이전버젼/Ver_2.0/Ver_2.0_README.md) · [`Ver_1.1`](./docs/이전버젼/Ver_1.1/Ver_1.1_README.md))

## 구조

```
src/
  app/                         # Next.js App Router (layout · page · providers · globals.css)
    api/
      kakao-route/             # 카카오 모빌리티 길찾기 프록시 (서버 토큰 검증)
      kakao-static-map/        # 카카오 REST 정적맵 프록시 (영역 캡처용, REST 키 필요)
      map-tile-proxy/          # 지도 타일 프록시 (호스트 allowlist 기반 SSRF 방지)
      roadview-dates/          # 로드뷰 촬영일자 조회 프록시
      worksite-weather/        # 국소 작업 안전 날씨 판정 (기상청 API 허브)
      its-key/                 # ITS 인증키를 브라우저에 런타임 전달 (CCTV는 브라우저 직접 호출)
    gpsmap/                    # 주소/좌표 통합 변환기 (독립 라우트, 로직은 features/gpsmap/lib 공유)
  components/
    ui/                        # shadcn/ui (Radix) — Calendly 유래 토큰으로 라이트/다크 렌더
    public-env-script.tsx      # 런타임 공개 env 를 브라우저에 주입
  hooks/ lib/ types/           # use-toast · use-has-mounted · use-is-mobile · utils · public-env · supabase/client · kakao-maps.d.ts
  features/shell/              # 드릴다운 레일(56px)·트리(256px)·모바일 하단 시트 + 상단 검색 + 패널 스위치 (27파일)
    constants.ts                # 레일/트리/패널 폭 단일 소스 (CSS 변수·모달 좌측 오프셋 계산)
    types/nav.ts                # NavKey 9종(대시보드·지도·마커관리·일정관리·그룹관리·CCTV·바코드/QR·백업/복원·설정)
    lib/ store/ hooks/          # nav-model · sheet-snap · use-shell-store · use-shell-nav · use-map-left-offset
    components/                 # app-shell · nav-rail · nav-tree · work-panel · panel-body · mobile-shell · top-search-bar · panels/
  features/dashboard/          # 당일 국소 작업 가능 여부 요약 + 엑셀/주소 임시 마커 작업 등록 (4파일)
    hooks/use-worksite-board.ts # 저장 국소 동시 4건 날씨 조회, 행 단위 실패 격리
    components/                 # worksite-board · worksite-row · dashboard-panel(빈 상태·임시 위치 등록 포함)
  features/map-marker/         # 지도·마커 도메인 (94파일)
    api.ts                     # Supabase 조회 (fetchAllRows 페이지네이션 + 올해 장비 시설 상태 계산)
    constants/ providers/ store/ hooks/
    lib/                       # marker-svg · cluster-pie · marker-filters · facility-status
                               # geocode · address-group · address-compare · erp-classify · erp-review(-save)
                               # overlay-content · overlay-drag · location-marker · select-active-markers
                               # fetch-full-backup-tables · map-viewport-capture · map-capture-stitch/
                               # excel/data-manager/ (엑셀 파싱·내보내기·백업/복원)
    components/                # map/ · sidebar/ · modals/
  features/site-lists/         # 위치 메뉴 국소 목록 — 목적별 목록·소속 관리 및 관리자 목록 보호 (Ver_3.0 신설, 8파일)
  features/group-admin/        # 그룹관리 — 관리자 전용 번지 묶음 국소 자료 수정(표 편집·일괄 수정·합치기·분리, 30파일)
  features/schedule/           # 일정관리 > 시설일정 — 주간·월간 일정표, 관리자 편집, 엑셀 내보내기·가져오기 (Ver_3.0 신설, 36파일)
    lib/                       # week · cell-grid · group-edit · companions · station-search · schedule-excel
                               # weekly-layout · month-layout · read-schedule · write-workbook(exceljs) · table-missing
    hooks/ components/         # use-schedule-range · schedule-view(화면) · 주간 표 · 월간 달력 · 칸·머리글·날짜 메모·내보내기·가져오기 창
    day-api · lib/day-*        # 일자별 상세(24열 작업 상세 표)·누적 — day-stations · day-reference · day-rows · day-copy · day-archive · write-day-workbook
                               # use-day-sheet · use-option-lists · use-archive · schedule-day-view · 상세 창 · 목록 관리 · schedule-archive-view
  features/worksite-weather/   # 작업 안전 날씨 도메인 (30파일)
    constants/                 # thresholds(판정 임계값) · kma-regions(특보 관서)
    types/weather.ts           # 판정 등급·표기 상수 단일 소스
    lib/                       # grid · kma-base-time · parse-amount · apparent-temp · wind
                               # verdict(판정 엔진) · merge-sources · parse-wrn-text
                               # site-search · worksite-weather-api · kma-client(서버 전용)
                               # export-tbm
    hooks/ components/         # 타임라인 표 · 위험 요약 · 태풍/위성 모달 (대시보드가 조립)
  features/route/              # 다중 경유지 최적 경로(TSP) 산출 및 카카오 길찾기 연동 (20파일)
  features/gpsmap/             # 주소·좌표 변환 (VWorld · Leaflet, 14파일)
  features/cctv/               # 도로 CCTV 조회 — ITS를 브라우저에서 직접 호출 (13파일)
  features/barcode/            # 사진 바코드 인식 · QR 생성 · 엑셀 후보 검색 (15파일)
docs/                          # Ver_3.0(현재 계획·구현 문서) · 이전버젼/(Ver_1.0 ~ Ver_2.3 문서 세트)
supabase/migrations/           # DB 마이그레이션 17개 + README(적용 순서·RLS 정책)
e2e/                           # Playwright 스모크 테스트
```

## 주요 기능

| 기능 | 상태 |
|------|------|
| **드릴다운 사이드바**(56px 레일 · 256px 트리 · 하위 메뉴 드릴다운) + **모바일 하단 메뉴·3단계 시트** + 전역 검색(`Ctrl+K`) | ✅ |
| **대시보드** — 오늘의 작업 국소 실시간 작업 가능 여부 요약 + 엑셀/주소 임시 마커 작업 등록 + 최적 경로(길찾기) | ✅ |
| **장비 시설 상태 판정·표시색·상태 필터** — 올해 장비 기준 `미시설`·`시설`·`개통완료`·`올해 대상 없음` 자동 판정 | ✅ |
| **위치 메뉴 국소 목록** — 목적별 목록(색상 15종) 생성·검색·복수 등록, 다중 목록 분할 핀 표시, 관리자 목록 보호 | ✅ |
| **위치등록 업로드(신규 확인 후 건별 저장)** — 공정 시트(`.xlsb`) 신규·좌표누락 건 위치·주소 대조 후 건별 저장 및 임시 저장 | ✅ |
| **시설일정** — 주간·월간 일정표(날짜별 10행 블록 × 팀 열), 관리자 편집·끌어서 이동, 팀·날짜 단위 국소 목록 편집(국소 검색 추가·입회/신호수), 칸 색·글자색·날짜 메모, 엑셀 주간/월간 배포·가져오기 | ✅ (DB 마이그레이션 적용 필요) |
| **시설일정 일자별 상세·누적** — 날짜별 24열 작업 상세 표(공정관리 DB 자동 채움, 작업 상세 창·일괄 적용·이전 입력 불러오기, 드롭다운 목록 관리), 표 복사·엑셀 내려받기, 누적 저장·검색·삭제 | ✅ (DB 마이그레이션 적용 필요) |
| **그룹관리** — 관리자 전용 번지 묶음 국소 자료 수정(표 편집·일괄 수정·합치기·분리·삭제·위치 수정) | ✅ |
| **라이트/다크 테마 전환**(설정 메뉴, 기본은 다크) | ✅ |
| 지도 하위 메뉴(장비/축전지/위치/위치·좌표) · 마커관리 하위 메뉴(장비/축전지) 전환 | ✅ |
| Supabase 마커·정보·축전지·국소목록 로드 (전량 페이지네이션) | ✅ |
| 연도(기본 올해+미지정, 그룹 연도 합산)·상태·사업·색상(15종)·태그·용량 필터 | ✅ |
| 지도 마커 렌더·클러스터(파이/도넛) | ✅ |
| 장소 검색·주소 지오코딩 | ✅ |
| 앱 전체 로그인 벽 · 서버 API Bearer 토큰 검증 | ✅ |
| 엑셀 업로드(장비·축전지·공정관리 일정관리 시트) | ✅ |
| 데이터 백업/복원(엑셀, 국소 목록·소속 시트 포함) | ✅ |
| 마커 CRUD 모달(편집·삭제·시설팀 지정·소속 목록 표시) | ✅ |
| 로드뷰 모달(촬영일자 조회) | ✅ |
| 영역 선택 → 격자 캡처/스티칭(PNG) | ✅ |
| 정적맵·타일 프록시(SSRF 방지) | ✅ |
| 동일 번지 대표/SUB/단독 그룹핑 · 동/구역 실제 그룹 분리·원복(대표 직접 선택) | ✅ |
| **국소 작업 안전 날씨 판정 (07~17시)** · **TBM 안전 자료 엑셀 저장** | ✅ |
| **도로 CCTV 조회·영상 재생**(ITS, 브라우저 직접 호출) | ✅ |
| **주소/좌표 통합 변환기**(단건·일괄·엑셀, GPS 메뉴) | ✅ |
| **바코드 사진 인식·QR 코드 생성·엑셀 후보 검색** | ✅ |

### Ver 3.0 주요 개편

- **장비 시설 상태 판정·필터·표시색** ([`Ver_3.0_장비상태_구현.md`](./docs/Ver_3.0/Ver_3.0_장비상태_구현.md))
  - 올해 사업 장비(`facility_year`)를 기준으로 국소별 대표 상태를 자동 판정합니다(대표 마커는 자기 장비 + 숨은 SUB의 올해 장비를 합산).
  - `미시설`(시설일 없음 → 에메랄드 `#10b981`) · `시설`(미개통 장비 존재 → 회색 `#64748b`) · `개통완료`(전량 시설·개통 완료 → 흰색 `#ffffff`) · `올해 대상 없음`(기존 저장 색상)으로 표시합니다.
  - 상태 필터 기본값은 `미시설`·`시설`이며, 연도 필터 기본값은 `올해 + 미지정`(그룹 내 장비 연도 합산 판정)입니다. 마커 및 목록 색상 선택지를 15종으로 확대했습니다.
- **위치 메뉴 국소 목록 & 대시보드 임시 마커 이동** ([`Ver_3.0_위치목록_구현.md`](./docs/Ver_3.0/Ver_3.0_위치목록_구현.md))
  - `지도 → 위치` 메뉴에서 목적별 국소 목록(`철거대상`, `고속도로` 등)을 만들고 색상을 지정해 기존 장비 국소를 검색·복수 선택으로 등록합니다.
  - 여러 목록을 동시에 선택할 수 있으며, 복수 목록에 속한 국소는 핀을 세로로 분할 채색(최대 3색 + `+N` 표기)하여 표시합니다.
  - 관리자가 만든 목록(`is_admin_list`)은 DB RLS 정책(`app_admins`)으로 일반 사용자의 수정·삭제를 차단합니다. 전체 백업/복원 엑셀에 `국소목록`·`국소목록소속` 시트가 포함됩니다.
  - 기존의 `엑셀로 위치 찍기`·`주소로 위치 찍기`(임시 마커)는 **대시보드** 작업 국소 등록 화면으로 이동했으며, 작업 국소 제거 시 연결된 임시 마커도 함께 정리됩니다.
- **위치등록 업로드: 신규 확인 후 건별 저장** ([`Ver_3.0_위치등록_신규확인_구현.md`](./docs/Ver_3.0/Ver_3.0_위치등록_신규확인_구현.md))
  - 공정관리 새 양식(`.xlsb`, `일정관리` 시트, `장비 공사` 시설일 · `시험 완료` 개통일 열)을 지원하며, 날짜 열이 없는 옛 양식은 저장 전에 차단합니다.
  - 통합시설코드 기준으로 신규·좌표누락 건을 분류해 사용자가 지도에서 위치를 확인하고 엑셀 주소와 도로명·지번 주소를 대조한 뒤 건별로 저장합니다. 미확인 건과 옮긴 좌표는 브라우저에 자동 임시 저장되어 다음 접속 시 이어서 진행할 수 있습니다.
  - 기존 등록 마커는 재업로드 시 좌표·메모·태그·색상·담당팀·주소를 유지하고 국소명과 공정 정보만 갱신합니다.
- **드릴다운 사이드바(레일·트리) & 모바일 하단 시트** ([`Ver_3.0_사이드바_구현.md`](./docs/Ver_3.0/Ver_3.0_사이드바_구현.md))
  - 데스크톱·태블릿(768px 이상): 56px 아이콘 레일 + 2단계 드릴다운 패널 구조와 256px 펼친 트리 모드를 전환할 수 있습니다.
  - 모바일(768px 미만): 지도를 가리지 않도록 하단 탭 메뉴(대시보드·지도·마커관리·CCTV·더보기)와 3단계 높이(낮음·절반·전체) 하단 시트로 동작합니다.
- **그룹관리** ([`Ver_3.0_그룹관리_구현.md`](./docs/Ver_3.0/Ver_3.0_그룹관리_구현.md))
  - 관리자(`app_admins`)에게만 보이는 메뉴입니다. 번지 묶음을 찾아 넓은 관리 창의 표에서 국소 정보·대표/SUB·위치를 고치고, 여러 건 일괄 수정·묶음 합치기·분리·삭제를 합니다.
- **시설일정** ([`Ver_3.0_시설일정_구현.md`](./docs/Ver_3.0/Ver_3.0_시설일정_구현.md)) — 아래 [시설일정](#시설일정-ver_30-신규) 참고

### 시설일정 (Ver_3.0 신규)

사이드바 `일정관리 → 시설일정`을 누르면 지도 대신 오른쪽 화면 전체에 시설팀 일정표가 열립니다.
사용 중인 엑셀 `일정표_New`와 같은 구조(날짜마다 10행 블록 × 팀 10열)를 앱에서 보고 관리합니다.

- **권한** — 조회·엑셀 내려받기는 로그인 사용자 모두, 수정·가져오기는 관리자(`app_admins`)만 할 수 있습니다.
  비관리자는 읽기 전용이며 DB RLS가 쓰기를 막습니다.
- **주간·월간 보기** — 주간은 편집 가능한 표(날짜 사이 구분선만 두고 날짜 안 행선은 없음, 오늘 블록 강조),
  월간은 월~일 7열 달력(조회 전용, 날짜를 누르면 그 주 보기로 이동)입니다.
- **칸 창** — 칸을 누르면 **그 팀·날짜의 모든 국소가 한 목록**으로 열립니다. 글·모국·장비·메모·글자색 수정, `×`로 빼기,
  등록된 장비 국소를 검색해 여러 개 추가하거나 직접 입력해 추가할 수 있고, 저장하면 아래 빈 행에 차례로 기록됩니다.
  `입회`·`신호수` 체크는 엑셀처럼 같은 팀 열의 별도 행(`입회 : 이름`)으로 기록됩니다.
  날짜×팀 칸 색(중장비·승주·K대응 등), 날짜 메모, 팀 머리글(팀장)도 고칠 수 있고, 표에서 칸을 끌어 옮기거나 찬 칸에 놓아 맞바꿉니다.
- **엑셀 내려받기** — `주간 배포용`(주마다 한 쪽, A3/A4 가로, 머리글 반복, 토·일 색), `월간 배포용`(월 달력 한 쪽),
  `일정표_New 형식`(범례·날짜 메모·색·글자색 포함, 다시 가져오기 가능).
- **엑셀 가져오기** — `일정표_New` 시트를 미리 본 뒤 시작일부터 날짜 범위를 한 번에 덮어씁니다(실패하면 기존 일정 유지).
  칸 색·글자색·날짜 메모도 읽습니다.
- `exceljs`(서식 있는 엑셀 쓰기·글자색 읽기)는 내려받기·가져오기 때만 불러와 홈 번들에 영향이 없습니다.
- **대시보드 마커창 펼침** — 대시보드를 열면 오늘의 작업 국소 전체의 마커창(날씨 카드)을 지도에 자동으로 펼치고 지도를 모두 보이게 맞춥니다. 직접 닫은 국소는 다시 펼치지 않습니다. 같은 자리에 핀이 몰려 있어도 마커창은 지도 양쪽 가장자리에 세로로 쌓여(많으면 카드를 조금 줄여서) 서로 겹치지 않고 연결선으로 핀과 이어집니다(직접 끌어 옮긴 창은 그대로, `마커창 전체 표시`를 다시 눌러도 같은 배치).
- **대시보드 연동** — 오늘 일정의 국소 중 등록된 장비 국소와 이름이 같은 것을 대시보드 `오늘의 작업 국소`(날씨 판정)에 자동으로 담고 `일정` 배지를 붙입니다. 직접 담은 국소는 건드리지 않고, 날짜가 바뀌면 지난 자동 등록분을 정리하며, 같은 날 직접 뺀 국소는 다시 넣지 않습니다.
- DB 마이그레이션(`20261108000000_facility_schedule.sql`)을 적용하기 전에는 일정표에 적용 안내만 표시됩니다.

#### 일자별 상세 · 누적

사이드바 `일정관리 → 일일일정`(시설일정 바로 아래)을 누르면 열리고, 상단 보기 전환(`일자별 | 누적`)으로 오갑니다. `시설일정`은 `주간 | 월간`만 보입니다. 구현 기록: [`Ver_3.0_시설일정_일자별_구현.md`](./docs/Ver_3.0/Ver_3.0_시설일정_일자별_구현.md).

- **일자별** — 날짜를 고르면(기본 내일) 그날 일정의 국소를 24열 작업 상세 표로 보여 줍니다. 같은 국소는 팀 열을 가로질러 한 행으로 합치고 팀장은 쉼표로 잇습니다.
  공정관리 값은 웹 DB(`erp_details`) → 이전 누적 → 지도 마커 순으로 채우며, 공정관리 DB 값이 아닌 행은 건수와 배경색으로 표시합니다.
- **작업 상세 창** — 행을 누르면 열립니다. 작업구분(기본 `HW`)·Level(`Level1`)·작업시간(주간/야간) 등 드롭다운 목록은 `목록 관리`에서 추가·삭제하고, `이전 입력 불러오기`·일괄 적용도 지원합니다. 수정은 관리자만 할 수 있습니다.
- **표 복사 / 엑셀 내려받기** — 표 복사는 머리글 없이 탭 구분으로 엑셀에 바로 붙여 넣습니다. 엑셀 내려받기는 원본(`시설일정_수정3`) 서식·열 너비·드롭다운(숨김 `목록` 시트)을 따릅니다.
- **누적** — 복사·내려받기 때 오늘 이후 날짜는 자동으로 누적에 저장되고 `누적 저장` 버튼으로 직접 저장할 수도 있습니다. **지난 날짜는 자동 저장하지 않으며**, 직접 저장 시 확인창이 뜹니다. 누적 보기에서 기간·검색으로 찾고 삭제·엑셀 내려받기를 할 수 있습니다.
- DB 마이그레이션(`20261111000000_schedule_day_details.sql`)을 적용하기 전에는 일자별·누적에 적용 안내만 표시됩니다.

### 바코드/QR 도구 (Ver_2.1 신규)

로그인 후 좌측 `바코드/QR` 메뉴에서 바코드 번호를 입력하거나 촬영 사진을 불러와 QR 코드를 생성합니다.

- 여러 바코드 번호를 줄 단위로 입력하고 QR 코드를 한 줄에 3개씩 생성
- 사진 선택 또는 드래그 앤 드롭으로 바코드를 인식하고 촬영 썸네일을 결과와 연결
- 결과 사진 확대 창에서 창 이동, 좌·우 90° 회전, 50~300% 확대·축소 및 사진 내부 드래그 지원
- 엑셀 파일에서 후보 값을 검색해 입력 목록에 추가
- `@undecaf/zbar-wasm`, `qrcode`, `xlsx` 의존 트리는 메뉴 진입 전까지 지연 로딩

### UI 셸 + 대시보드 + 라이트/다크 테마 (Ver_2.0~3.0)

화면의 최상위 전환 축을 **모드(데이터 도메인)** 에서 **메뉴(기능 영역)** 로 옮기고,
**대시보드**("오늘 이 국소에서 작업해도 되는가")를 기본 진입 화면으로 뒀다.

- **좌측 메뉴 9종** — 대시보드 · 지도 · 마커관리 · 일정관리 · 그룹관리(관리자 전용) · CCTV · 바코드/QR · 데이터백업/복원 · 설정.
  데스크톱은 56px 아이콘 레일(또는 256px 트리) + 드릴다운 패널, 모바일은 하단 메뉴 + 3단계 시트로 렌더
- **대시보드** — 저장해 둔 오늘의 작업 국소를 동시 4건까지 조회해 시간대별 작업 가능 여부를 요약하고,
  엑셀·주소로 임시 작업 위치를 바로 등록하거나 다중 경유지 최적 경로(길찾기)를 산출.
  개별 조회 실패는 해당 행만 격리되고 나머지 행은 정상 표시
- **전역 검색**(`Ctrl+K`) — 상단 검색바로 장소·마커 검색을 일원화
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

판정 규칙 상세: [`Ver_1.1_BUSINESS_RULE.md`](./docs/이전버젼/Ver_1.1/Ver_1.1_BUSINESS_RULE.md)

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
npm run test         # vitest 단위 테스트 (870건 / 70파일)
npm run test:e2e     # Playwright 스모크 (dev 서버 재사용)
npx tsc --noEmit     # 타입 검사 — 커밋 전 필수
```

> ⚠️ **`vitest`는 타입을 검사하지 않습니다.** 테스트가 전부 통과해도 빌드가 깨질 수 있습니다.
> 커밋·배포 전에 `tsc --noEmit`을 별도로 실행하세요.

## DB 마이그레이션

`supabase/migrations/` 파일을 **파일명 순서대로** Supabase SQL Editor에서 실행하세요.
전체 스키마 초기화 방법과 파일별 상세 설명은 [`supabase/migrations/README.md`](./supabase/migrations/README.md)를 참고하세요.

| 마이그레이션 | 내용 |
|------|------|
| `20260718120000_recreate_full_schema_with_erp.sql` | 전체 정식 스키마(`markers`·`information`·`erp_details`·`battery_markers`·`battery_specs`) 생성 |
| `20260722000000_add_detached_visible.sql` | `markers.detached_visible` — 같은 번지 SUB를 지도에 개별 핀으로 표시 |
| `20260723000000_add_group_key.sql` | `markers.group_key` — 번지 하위 동/구역 실제 그룹 분리 키 |
| `20260727000000_add_worksite_weather_columns.sql` | `markers`·`battery_markers`에 `site_alias`(검색 별칭) · `work_type`(지상/고소) |
| `20261017000000_require_login_for_marker_read.sql` | 비로그인(anon) 조회·쓰기 정책 제거 — 로그인 사용자만 마커 접근 |
| `20261107000000_site_lists.sql` | 위치 메뉴 국소 목록(`app_admins`·`site_lists`·`site_list_members`) 및 RLS 정책 |
| `20261108000000_facility_schedule.sql` | 시설일정(`schedule_columns`·`schedule_cells`·`schedule_days`·`schedule_marks`) 4개 테이블, 관리자만 쓰는 RLS, 칸 이동(맞바꾸기)·날짜 범위 교체 함수 |
| `20261111000000_schedule_day_details.sql` | 시설일정 일자별 상세(`schedule_day_details`·`schedule_option_lists`·`schedule_archive_rows`) 3개 테이블, 관리자만 쓰는 RLS, 누적 `saved_by`/`saved_at` 자동 기록 트리거 |
| `20261107000100_site_lists_invoker_functions.sql` ~ `000400` | 국소 목록 권한 함수 `SECURITY INVOKER` 전환 및 Advisor·미사용 인덱스/스키마 정리 |
| `20261113000000_restrict_marker_delete_to_admin.sql` | 장비·축전지 5개 테이블의 삭제(DELETE)를 관리자 전용으로 제한 — 등록·수정은 로그인 사용자 그대로. 적용하면 일반 계정은 삭제·위치등록 저장·기존 마커의 수정 저장·전체 복원이 막힌다(새 마커 등록은 가능) |

> 마이그레이션 미적용 상태에서도 기존 지도·마커 조회는 깨지지 않습니다(신규 컬럼을 optional로 읽고, 국소 목록 테이블이 없으면 위치 목록 패널에만, 시설일정 테이블이 없으면 일정표 화면에만 안내를 표시).

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
| **방법 B — 빌드·배포 분리** | Build command: `npx opennextjs-cloudflare build --dangerouslyUseUnsupportedNextVersion` · Deploy command: `npx opennextjs-cloudflare deploy` |
| Non-production deploy | `npm run upload` |
| Node version | **22** (`.nvmrc`, wrangler 4.x 필수) |

**하지 말 것:** Deploy command를 `npx wrangler deploy`로 두는 것 (`npm run build`만으로는 `.open-next/`가 생기지 않음)

`npm run deploy` = `opennextjs-cloudflare build --dangerouslyUseUnsupportedNextVersion` + `opennextjs-cloudflare deploy`
(Next 빌드 → `.open-next/worker.js` 생성 후 Workers에 배포)

`wrangler.jsonc`의 Worker 이름(`newmarker`)과 `WORKER_SELF_REFERENCE` service 이름이 **동일**해야 합니다.
`package.json`의 `name`도 `newmarker`로 맞춰 두었습니다.

**Settings → Compatibility flags** 에 `nodejs_compat` 추가.

### 환경 변수 (필수)

Cloudflare **Workers & Pages → newmarker → Settings → Variables and Secrets** 에 등록하세요.
(`.env.local`은 Git에 포함되지 않아 CI 빌드·배포 환경에는 자동으로 전달되지 않습니다.)
로컬 개발용 변수 목록(값 없음)은 [`.env.example`](./.env.example)을 복사해 `.env.local`로 쓰세요.

| 변수 | 설명 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable 키 |
| `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` | 카카오 JavaScript 키 |

**계정설정 메뉴**(사용자 목록·생성·삭제)는 서버 전용 키 `SUPABASE_SECRET_KEY`가 필요합니다.
`.env.local`에만 있으면 로컬에서만 동작하고 배포본은 "데이터베이스 연결 설정 필요"가 뜹니다.
**반드시 Secret 타입**으로 등록하고(위 `NEXT_PUBLIC_` 변수와 달리 `wrangler.jsonc`에 넣지 말 것) **재배포**하세요.

```bash
npx wrangler secret put SUPABASE_SECRET_KEY
```

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
**`NEXT_PUBLIC_` 접두사를 붙이지 마세요** — 빌드 때 번들에 박혀 비로그인 방문자에게도 노출됩니다.

> CCTV 조회는 **브라우저가 ITS를 직접 호출**합니다(서버 경유 불가, 상세는
> [`Ver_1.1_CCTV_PLAN.md`](./docs/이전버젼/Ver_1.1/Ver_1.1_CCTV_PLAN.md) 부록 E). `/api/its-key` 라우트가
> 이 키를 **로그인한 사용자에게만** 런타임에 전달합니다(Bearer 토큰 검증). 미설정 시 CCTV 조회가 인증키 오류로 실패합니다.

### 환경 변수 (선택)

영역 캡처의 **카카오 정적맵(Static Map)** 및 대시보드 **길찾기** 경로 등에서 사용합니다. 정적맵 키가 없으면 영역 캡처는 타일 프록시로 폴백합니다.

| 변수 | 설명 |
|------|------|
| `KAKAO_REST_API_KEY` | 카카오 **REST API 키**(서버 전용). 정적맵 캡처 품질 및 카카오 모빌리티 길찾기 API 호출용 |
| `NEXT_PUBLIC_SITE_URL` | 정적맵 요청 `KA` 헤더의 origin 폴백값. 프록시 라우트의 허용 origin 으로도 사용 |
| `PROXY_ALLOWED_ORIGINS` | 프록시 라우트에서 자기 도메인 외에 추가로 허용할 origin (쉼표 구분) |
| `NEXT_PUBLIC_VWORLD_API_KEY` | VWorld 인증키(GPSMAP·지적도). 도메인/Referer 제한으로 보호 |

설정 변경 후 **Retry deployment** 하세요.

## 문서

| 문서 | 내용 |
|------|------|
| [`docs/Ver_3.0/Ver_3.0_계획.md`](./docs/Ver_3.0/Ver_3.0_계획.md) | 현재 버전 — 장비 시설 상태 · 위치 메뉴 국소 목록 · 위치등록 신규 확인 · 사이드바/모바일 셸 · 그룹관리 · 시설일정 계획 |
| [`docs/Ver_3.0/Ver_3.0_장비상태_구현.md`](./docs/Ver_3.0/Ver_3.0_장비상태_구현.md) | 장비 시설 상태 판정·표시색·상태 필터·마커 색상 15종 구현 |
| [`docs/Ver_3.0/Ver_3.0_위치등록_신규확인_구현.md`](./docs/Ver_3.0/Ver_3.0_위치등록_신규확인_구현.md) | 공정관리 새 양식 및 신규·좌표누락 건 위치 확인 후 건별 저장 구현 |
| [`docs/Ver_3.0/Ver_3.0_사이드바_구현.md`](./docs/Ver_3.0/Ver_3.0_사이드바_구현.md) | 드릴다운 레일·펼친 트리 및 모바일 하단 메뉴·3단계 시트 구현 |
| [`docs/Ver_3.0/Ver_3.0_위치목록_구현.md`](./docs/Ver_3.0/Ver_3.0_위치목록_구현.md) | 위치 메뉴 국소 목록(`site_lists`)·관리자 목록 보호·대시보드 임시 마커 이동 구현 |
| [`docs/Ver_3.0/Ver_3.0_그룹관리_구현.md`](./docs/Ver_3.0/Ver_3.0_그룹관리_구현.md) | 그룹관리(관리자 전용 번지 묶음 국소 자료 수정) 구현 |
| [`docs/Ver_3.0/Ver_3.0_시설일정_구현.md`](./docs/Ver_3.0/Ver_3.0_시설일정_구현.md) | 시설일정(주간·월간 일정표, 팀·날짜 목록 편집, 엑셀 배포·가져오기, `exceljs`) 구현 계획과 변경 기록 |
| [`docs/Ver_3.0/Ver_3.0_시설일정_일자별_구현.md`](./docs/Ver_3.0/Ver_3.0_시설일정_일자별_구현.md) | 시설일정 일자별 상세·누적(24열 표, 상세 창, 목록 관리, 표 복사·엑셀, 누적 저장) 구현과 알려진 제한 |
| [`docs/이전버젼/Ver_2.3/`](./docs/이전버젼/Ver_2.3/Ver_2.3_implementation_plan.md) | 구조 정비(미사용 코드·의존성 제거, 엄격 타입 전환, 취약점 패치) |
| [`docs/이전버젼/Ver_2.2/`](./docs/이전버젼/Ver_2.2/Ver_2.2_implementation_plan.md) | 앱 전체 로그인 벽 + 서버 API 토큰 검증 + 길찾기 |
| [`docs/이전버젼/Ver_2.1/`](./docs/이전버젼/Ver_2.1/Ver_2.1_implementation_plan.md) | 디자인 토큰 재매핑 + 라이트/다크 테마 + 바코드/QR |
| [`docs/이전버젼/Ver_2.0/`](./docs/이전버젼/Ver_2.0/Ver_2.0_README.md) | UI 셸 개편 + 대시보드 신설 문서 세트 ([구조 점검 기록](./docs/이전버젼/Ver_2.0/project_review.md)) |
| [`docs/이전버젼/Ver_1.1/`](./docs/이전버젼/Ver_1.1/Ver_1.1_README.md) | 국소 작업 안전 날씨 + CCTV 문서 세트 |
| [`docs/이전버젼/Ver_1.0/`](./docs/이전버젼/Ver_1.0/) | 최초 버전 + 변경요청(CR-001~004) |
| [`docs/이전버젼/PROJECT_ANALYSIS_2026-07-18.md`](./docs/이전버젼/PROJECT_ANALYSIS_2026-07-18.md) | 검수 보고서 (1~5차) |
| [`docs/이전버젼/VWORLD_CLOUDFLARE_SETUP.md`](./docs/이전버젼/VWORLD_CLOUDFLARE_SETUP.md) | VWorld 배포 설정 가이드 |
| [`docs/이전버젼/walkthrough.md`](./docs/이전버젼/walkthrough.md) | 작업 결과 누적 |

시작점: [`Ver_3.0_계획`](./docs/Ver_3.0/Ver_3.0_계획.md) →
[`Ver_2.3_implementation_plan`](./docs/이전버젼/Ver_2.3/Ver_2.3_implementation_plan.md) →
[`Ver_2.0_PLAN`](./docs/이전버젼/Ver_2.0/Ver_2.0_implementation_plan.md) →
[`Ver_2.0_IA`](./docs/이전버젼/Ver_2.0/Ver_2.0_IA.md)
