# Walkthrough

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
