# Ver_1.1 변경 이력 (Changelog)

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 저장소: https://github.com/BlueSkyWestWind/NewMapMarker
- 형식: [Keep a Changelog](https://keepachangelog.com/) 준용 · 버전: [유의적 버전](https://semver.org/lang/ko/)

> 분류: `추가` `변경` `수정` `제거` `보안` `문서` `성능`

---

## [Unreleased]

### 예정 (Ver_1.2 후보)

| 우선순위 | 항목 | CR |
| --- | --- | --- |
| 1 | 커밋 전 `tsc --noEmit` 게이트 | — |
| 2 | 그룹 조작 Postgres RPC 원자화 (G6) | [CR-003](../Ver_1.0/CR-003.md) |
| 3 | 유효 그룹 키 규칙 단일화 (G2) | [CR-002](../Ver_1.0/CR-002.md) |
| 4 | `group_key` 미마이그레이션 안내 (G3) | [CR-001](../Ver_1.0/CR-001.md) |
| 5 | `marker-detail-modal.tsx`(2,016줄) 분할 (G1) | — |
| 6 | `worksite-weather-panel.tsx`(559줄) 분할 (W1) | — |
| 7 | 태풍정보 API 연동 (`TyphoonInfo.detail`) | — |
| 8 | 커스텀 도메인 연결 → Cache API 활성화 (W2) | — |
| 9 | `savedWeatherSites` 원본 마커 동기화 (W3) | — |
| 10 | 외부 iframe 2종 실렌더 검증 (W4) | — |
| 11 | 잔존 `any` 축소 (R3/R5) | — |

---

## [1.1.0] — 2026-07-26

**국소 작업 안전 날씨** — 기상청 API 연동으로 당일 07~17시 시간대별 작업 가능 여부를 판정한다.
Ver_1.0의 미해결 항목 **R1(홈 번들 회귀)** 도 함께 해소했다.

커밋: `46fb126` (71 files, +11,646 / -143)

### 추가

**기상 판정 (CR-004)**
- 4번째 지도 모드 `날씨`. 장비·축전지 모드에도 "국소 작업 안전 날씨" 패널 제공
- `GET /api/worksite-weather` — 좌표 기반 판정. origin 가드 적용
- 기상청 API 허브 4종 연동 — 단기예보·초단기실황·초단기예보·기상특보
- 07~17시 **11슬롯 타임라인**. 소스 우선순위(실황 > 초단기 > 단기 > 경과) 항목별 오버레이
- 4종 위험 판정(폭염·한파·강풍·강수) + 태풍 조건부. 고소 작업 가중
- 작업 권장 시간대 산출(배열 — 오전·오후 분리 가능)
- 국소 검색 — 이름·별칭·주소·최종국소명, 다중 키워드, 지오코딩 폴백
- "오늘의 작업 국소" 저장·순회 (localStorage 영속)
- 지도 정보창 날씨 카드
- TBM 자료 엑셀 저장
- 위성/레이더 지도·실시간 태풍 정보 모달

**데이터**
- `markers`·`battery_markers`에 `site_alias`·`work_type` 추가
  (마이그레이션 `20260727000000_add_worksite_weather_columns.sql`)
- 백업 엑셀 열 목록에 반영 — 왕복 무손실

**테스트**
- 단위 테스트 39건 → **221건** (신규 182건, 15파일)

### 성능

- **홈 First Load JS 482 → 289 kB (-40%)** — Ver_1.0 R1 회귀 해소
  - `xlsx`(SheetJS 1.26 MB) 정적 import 경로 3개를 지연 로딩으로 전환
  - `html2canvas`(~190 KB) 캡처 실행 시점 로딩으로 전환
  - `full-backup-schema.ts` 분리 — 상수·타입만 쓰는 훅이 SheetJS를 끌어오지 않게
- 기상 조회 TTL 10분 캐시 + in-flight 중복제거 (지도 오버레이와 사이드바 공유)
- 마커 조회 페이지네이션 (`fetchAllRows`) — PostgREST 행 상한 초과 시 조용히 잘리던 경로 차단

### 수정

**빌드 붕괴 (5차 검수)**
- 스토어에서 `placeSearch` 선언이 삭제되어 장소 검색 타입 계약이 무너진 것 복구
- `SiteMatch` import 누락, `WeatherVerdict` 존재하지 않는 타입 참조
- `PlaceSearchResult.title` → `label` 오기 (지도 이동 라벨 유실)

**판정 표기 불일치**
- 같은 등급이 지도와 사이드바에서 다른 이름으로 표시되던 문제
  (`caution` → "주의"/"관심", `warning` → "경고"/"주의", `stop` → "중지"/"작업중단")
- `types/weather.ts`를 단일 소스로 통일. `VERDICT_TONE` 신설

**안전 로직**
- 특보를 종류 구분 없이 "경보=중지"로 처리해 **여름철 전 국소가 ⛔로 표시**되던 문제
  → 종류별 반영 강도 분리 (폭염경보 = danger, 호우·강풍·대설·태풍·한파 = stop)
- 광역시 특보구역(`광주서부`)이 주소(`광주광역시 북구`)와 문자열이 겹치지 않아
  **발효 중인 폭염경보를 놓치던 문제** → 시·도 체계별 매칭 규칙 분리
- 지역 미상 시 전국 특보 372건이 적용돼 타 지역 호우주의보로 `stop`이 되던 문제
  → 매칭하지 않고 "확인 불가" 경고

**아키텍처**
- `lib → hooks` 역방향 의존 제거 (`worksite-weather-api.ts` 신설)
- 날씨 패널 선택 상태를 파생값으로 전환 — `useEffect` 3개가 서로 덮어써
  사용자가 고른 국소가 검색어 변경 시 첫 항목으로 되돌아가던 문제
- 태풍 모달 이중 마운트 제거
- 닫힌 오버레이에 `innerHTML` 기록 방지

**API 오류 처리**
- 401(인증키 오류)과 403(활용신청 누락)을 구분해 안내
- 평문 500 응답에서 `Unexpected token 'I'`가 노출되던 문제
- `Number(null) === 0`이라 파라미터 미지정이 좌표 (0,0)으로 통과하던 문제

### 문서

- [CR-004](../Ver_1.0/CR-004.md) — 계획서 프로젝트 정합화 (13건 불일치)
- [PROJECT_ANALYSIS](../PROJECT_ANALYSIS_2026-07-18.md) 5차·5차-B 검수
- 본 `docs/Ver_1.1/` 문서 세트 14종

### 알려진 제약

- **DB 마이그레이션 미적용** — Supabase SQL Editor에서 직접 실행 필요
- 태풍 진로·중심기압 상세 미구현 (태풍정보 API 미신청)
- 외부 iframe 2종 브라우저 실렌더 미검증
- `savedWeatherSites`가 원본 마커 삭제와 동기화되지 않음

---

## [1.0.0] — 2026-07-25

`001.MapMarker`(바닐라 JS 단일 페이지)를 **Next.js 15 + TypeScript + Supabase + Cloudflare Workers**
구조로 재구성한 첫 정식 릴리스. 상세는 [Ver_1.0 CHANGELOG](../Ver_1.0/CHANGELOG.md) 참조.

주요 지표 — 지도 모드 3종 · 서버 라우트 3종 · 단위 테스트 39건 · 홈 First Load 482 kB

---

## [0.6.0] ~ [0.1.0]

[Ver_1.0 CHANGELOG](../Ver_1.0/CHANGELOG.md) 참조.

---

## 기록 규칙

| 항목 | 규칙 |
| --- | --- |
| 순서 | 최신 버전을 위에 |
| 분류 | `추가`·`변경`·`수정`·`제거`·`보안`·`문서`·`성능` |
| 근거 | 수치는 실측값만. 추정은 "추정"으로 명시 |
| 제약 | 알려진 제약을 릴리스마다 명시 |
| 링크 | CR·검수 보고서를 상대 경로로 연결 |
