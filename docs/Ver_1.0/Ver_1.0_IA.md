# Ver_1.0 정보구조 (Information Architecture)

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 문서 버전: **Ver_1.0**
- 작성일: 2026-07-25
- 관련 문서: [PLAN](./Ver_1.0_PLAN.md) · [PRD](./Ver_1.0_PRD.md) · [USECASE](./Ver_1.0_USECASE.md) · [DESIGN](./Ver_1.0_DESIGN.md)

---

## 1. 사이트맵

```
/  (지도 워크스페이스)
├── 사이드바 (340px 고정)
│   ├── 헤더 : 로고 · 건수 요약 · 인증 · 접기
│   ├── 모드 탭 : 장비 | 축전지 | 위치
│   ├── [로그인] → /gpsmap 링크
│   └── 아코디언 섹션 (모드별 구성)
├── 지도 캔버스 (나머지 전 영역)
│   ├── 플로팅 컨트롤 (우측)
│   └── 영역 선택 · 캡처 패널
└── 모달 레이어
    ├── 마커 상세
    ├── 마커 편집
    ├── 로드뷰
    └── 인증

/gpsmap  (주소/좌표 통합 변환기 · 로그인 전용)
├── 입력 패널 : 단건(DMS) | 일괄
├── VWorld 지도 패널
└── 로드뷰 패널

/api/*  (서버 전용 프록시 · UI 없음)
```

## 2. 라우트 맵

| 라우트 | 파일 | 유형 | 인증 | 설명 |
| --- | --- | --- | --- | --- |
| `/` | `src/app/page.tsx` | 페이지 | 불필요(열람) | 지도 워크스페이스 |
| `/gpsmap` | `src/app/gpsmap/page.tsx` | 페이지 | 필요 | 주소/좌표 변환기 |
| `/api/kakao-static-map` | `src/app/api/kakao-static-map/route.ts` | Route Handler | origin 검증 | 카카오 정적맵 프록시(영역 캡처) |
| `/api/map-tile-proxy` | `src/app/api/map-tile-proxy/route.ts` | Route Handler | origin 검증 | 지도 타일 프록시(호스트 allowlist) |
| `/api/roadview-dates` | `src/app/api/roadview-dates/route.ts` | Route Handler | origin 검증 | 로드뷰 촬영일자 조회 |

## 3. 전역 레이아웃 계층

```
app/layout.tsx
└── PublicEnvScript            공개 env 를 브라우저 전역에 주입 (Workers 런타임 변수 대응)
    └── KakaoSdkScript         카카오 지도 SDK 로더 (libraries: services, clusterer)
        └── Providers          QueryClientProvider · AuthProvider · ThemeProvider · Toaster
            └── page           MapMarkerPage | GpsmapPage
```

## 4. 화면 구조 — `/` 지도 워크스페이스

### 4.1 사이드바 트리

```
aside (w-340px)
├─ header
│  ├─ MapPin 아이콘 + "MapMarker Pro"
│  ├─ 건수 요약   예) "장비 1,204건 · 좌표 없음 3건"
│  ├─ AuthHeader  (로그인/로그아웃 · 계정)
│  ├─ 사이드바 접기 (PanelLeftClose)
│  ├─ ModeTabs    [장비] [축전지] [위치*]      * 비로그인 시 잠금
│  └─ /gpsmap 링크  "주소/좌표 통합 변환기"     (로그인 시에만)
│
└─ body (세로 스크롤)
   ├─ [위치 모드] 안내 배너 — "새로고침 시 사라짐"
   └─ Accordion (type=multiple)
      ├─ 주소로 위치 찍기        location-address-section     ← 위치 모드
      ├─ 엑셀로 위치 찍기        location-excel-section        ← 위치 모드
      ├─ 마커 목록               markers-list-panel            ← 전 모드 (기본 펼침)
      ├─ 필터                    filter-panel                  ← 장비/축전지
      ├─ 장소 검색               place-search-section          ← 전 모드
      ├─ 장비 정보               equipment-info-section        ← 장비 · 로그인
      ├─ 장비 엑셀               equipment-excel-section       ← 장비 · 로그인
      ├─ 축전지 엑셀             battery-excel-section         ← 축전지 · 로그인
      └─ 데이터 백업/복원        backup-restore-section        ← 장비/축전지 · 로그인
```

### 4.2 섹션 노출 매트릭스

| 섹션 | 장비 | 축전지 | 위치 | 로그인 필요 |
| --- | :---: | :---: | :---: | :---: |
| 마커 목록 | ● | ● | ● | – |
| 필터 | ● | ● | – | – |
| 장소 검색 | ● | ● | ● | – |
| 주소로 위치 찍기 | – | – | ● | ● |
| 엑셀로 위치 찍기 | – | – | ● | ● |
| 장비 정보 | ● | – | – | ● |
| 장비 엑셀 업로드 | ● | – | – | ● |
| 축전지 엑셀 업로드 | – | ● | – | ● |
| 백업/복원 | ● | ● | – | ● |
| GPSMAP 링크 | ● | ● | ● | ● |

> 위치 모드 자체가 로그인 전용이므로, 비로그인 상태에서 위치 모드였다면 **장비 모드로 강제 전환**된다.

### 4.3 지도 영역 구성

```
지도 캔버스 (kakao-map-canvas)
├─ 마커 레이어        SVG 마커 · 시설팀 색상 · 대표핀만 렌더
│                     (parent_marker_id == null  또는  detached_visible == true)
├─ 클러스터 레이어    파이 | 도넛 아이콘
├─ 오버레이 레이어    정보창(드래그 이동 가능) · 필지 경계 폴리곤
├─ 영역 선택 오버레이 map-region-select-overlay + map-region-bounds-guide
└─ 플로팅 컨트롤 (우측 세로 스택)
   ├─ 영역 격자 자동 캡처
   ├─ 내 위치
   ├─ 지적편집도
   ├─ 클러스터 on/off
   ├─ 클러스터 아이콘 스타일 (파이 ↔ 도넛)
   ├─ 확대 (1단계)
   ├─ 줌 슬라이더 (드래그, 현재 레벨 표시)
   ├─ 축소 (1단계)
   └─ 광주 시청 (기준점 복귀)
```

### 4.4 모달 계층

| 모달 | 파일 | 진입점 | 주요 내용 |
| --- | --- | --- | --- |
| 마커 상세 | `modals/marker-detail-modal.tsx` | 마커 클릭 · 목록 클릭 | 기본정보 · 연관 장비 표 · ERP 상세 · GPS 카드 · **그룹 조작**(구분 변경/분리/합치기/동 개별표시) |
| 마커 편집 | `modals/marker-edit-modal.tsx` | 상세 → 편집 | 이름·메모·태그·색상·시설팀·주소 · 스펙 목록(`marker-edit-spec-lists`) |
| 로드뷰 | `modals/roadview-modal.tsx` | 상세 → 로드뷰 · 지도 우클릭 | 로드뷰 뷰어 + 촬영일자 |
| 인증 | `modals/auth-modal.tsx` | 헤더 로그인 | 이메일/비밀번호 |

> 상세·편집 모달은 `next/dynamic` 지연 로드 대상이라 홈 번들에 포함되지 않는다.

## 5. 데이터 모델

### 5.1 ER 관계

```
markers ──1:N──> information        (marker_id, ON DELETE CASCADE)
markers ──1:N──> erp_details        (marker_id, ON DELETE CASCADE)
markers ──self──> markers           (parent_marker_id, ON DELETE SET NULL)

battery_markers ──1:N──> battery_specs   (marker_id, ON DELETE CASCADE)
```

### 5.2 `markers` — 장비 국소

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | text PK | 마커 식별자 |
| `name` | text | 국소명 |
| `lat` / `lng` | double precision | 좌표 (null 허용 → "좌표 없음"으로 집계) |
| `memo` | text | 메모 |
| `tags` | jsonb | 태그 배열 (문자열/JSON/구분자 입력 모두 정규화) |
| `color` | text | 마커 색 (hex, 시설팀 색과 연동) |
| `facility_team` | text | 시설팀 ID |
| `facility_code` | text | 통합시설코드 |
| `road_address` / `jibun_address` | text | 도로명 / 지번 주소 |
| **`parent_marker_id`** | text FK→markers | null = 대표 국소, 값 = 해당 대표의 SUB |
| **`group_role`** | text | `대표` \| `SUB` — 백업 엑셀 `구분` 열과 동기화 |
| **`group_key`** | text | 번지 하위 분리 그룹 키. null = 번지 주소로 그룹 |
| **`detached_visible`** | boolean | 같은 번지 SUB를 지도에 개별 핀으로 표시 |
| `created_at` | timestamptz | 생성 시각 (대표 승격 순서 기준) |

### 5.3 `information` — 마커 부가 정보

`marker_id` · `place_name` · `facility_code` · `project_code` · `facility_year` · `business_type` ·
`final_station_name` · `eq_class` · `eq_type` · `install_date` · `open_date` · `created_at`

> 조회 시 `marker_id` 우선, 없으면 `place_name` 으로 인덱싱해 매칭한다(레거시 데이터 대응).
> 여러 행이면 **첫 행을 대표 정보**로 사용한다.

### 5.4 `erp_details` — ERP 79열

매핑 컬럼(29): `facility_code` `project` `mgmt_item` `partner` `region_do` `region_sigungu`
`station_final` `station_plan` `method` `biz_round` `biz_category` `biz_type` `equip_final_major`
`equip_final` `erp_usage` `acta_done_date` `realty_type` `building_type` `equip_location`
`sharing` `sharing_operator` `address_full` `access_method` `site_name` `hw_team` `test_team`
`ai_manager` `remarks`

원본 보존: **`raw` jsonb** — 79열 전체를 그대로 저장(포맷 변경 시 재파싱 가능).

### 5.5 축전지

| 테이블 | 컬럼 |
| --- | --- |
| `battery_markers` | `id` `name` `lat` `lng` `address` `memo` `tags` `color` `facility_team` `created_at` |
| `battery_specs` | `marker_id` `erp_name` `capacity` `quantity` `station_name` `created_at` |

기본값: `capacity=600`, `quantity=12` (엑셀 미입력·DB null 시 적용)

### 5.6 마이그레이션 순서

| 순서 | 파일 | 내용 |
| --- | --- | --- |
| 1 | `20260626000000_map_marker_schema_reference.sql` | 기준 스키마 |
| 2 | `20260627000000_disable_rls_battery_tables.sql` | 축전지 RLS 임시 해제 |
| 3 | `20260627000001_enable_rls_and_policies.sql` | RLS 및 정책 |
| 4 | `20260718120000_recreate_full_schema_with_erp.sql` | ERP 79열 포함 전체 재구성 |
| 5 | `20260722000000_add_detached_visible.sql` | `markers.detached_visible` |
| 6 | `20260723000000_add_group_key.sql` | `markers.group_key` |

## 6. 도메인 로직 — 그룹 판정

### 6.1 유효 키 (Effective Group Key)

```
effectiveKey(marker) = marker.group_key ?? lotAddressKey(marker.jibun_address)
```

- 두 마커는 **유효 키가 같을 때만** 같은 그룹이다.
- 같은 번지라도 `group_key`가 다르면 별도 그룹으로 분리된다.
- 구현 위치: `lib/address-group.ts::getEffectiveGroupKey` (snake_case row)
  / `modals/marker-detail-modal.tsx::getMarkerEffectiveKey` (camelCase marker)

> ⚠️ 동일 규칙이 **두 곳에 각각 구현**되어 있다(검수 항목 G2). 변경 시 반드시 양쪽을 함께 수정한다.

### 6.2 역할 판정

| 그룹 멤버 수 | 역할 |
| --- | --- |
| 1 | **단독** (parent = null) |
| 2 이상 | **대표** 1 (parent = null) + **SUB** N (parent = 대표 id) |

지도 렌더 조건: `parent_marker_id == null` **또는** `detached_visible == true`

### 6.3 분리 / 원복 흐름

```
[분리]  separateLabelGroup(라벨)
  ① 남은 번지 그룹 재승격          ← 먼저 실행 (dangling parent 방지)
  ② 분리 대상에 새 group_key + 사용자가 선택한 대표 지정
  ③ 이동 멤버의 detached_visible = false 리셋

[원복]  mergeSplitGroupToLot()
  ① 분리 그룹의 group_key 제거
  ② assignGroupMembers 로 재판정 — created_at 최초의 대표-역할이 대표

[재업로드/복원]
  assignMarkerParentsByLotAddress / applyMarkerRolesFromStoredGroupRole
  → 모두 유효 키 기준이라 분리 상태가 유지됨
```

## 7. 상태 구조

### 7.1 클라이언트 UI 상태 — Zustand `use-map-marker-store`

| 그룹 | 키 | persist |
| --- | --- | :---: |
| 모드 | `mode` | ● |
| 레이아웃 | `isSidebarOpen` | – |
| 지도 옵션 | `isClusteringEnabled` `clusterIconStyle` `isCadastralMode` | ● |
| 필터 | `filters`(7종 Set) `markerListFilter` | – |
| 대기 마커 | `pendingEquipmentMarkers` `pendingBatteryMarkers` `pendingLocationMarkers` | – |
| 스테이징 | `stagedErpUpload` | – |
| 선택 | `selectedMarkerId` `selectedMarkerIds` | – |
| 모달 | `isDetailOpen` `isEditOpen` `isRoadviewOpen` `roadviewPosition` | – |
| 캡처 | `isInfoWindowCaptureMode` | – |
| 검색 | `placeSearch`(필지 경계) | – |

persist 키: `map-marker-ui` — **`mode` · 클러스터링 · 클러스터 스타일 · 지적편집도**만 저장한다.
`pendingLocationMarkers`와 `stagedErpUpload`는 의도적으로 저장하지 않아 새로고침 시 소멸한다.

모드 전환 시 `filters` · `selectedMarkerId` · `selectedMarkerIds`가 초기화된다.

### 7.2 서버 상태 — TanStack Query

| 쿼리 키 | 훅 | 데이터 |
| --- | --- | --- |
| `["map-marker","markers"]` | `use-map-markers-query` | `MapMarkersPayload` (장비 + 축전지) |
| `["map-marker","auth-session"]` | `use-auth-session` | Supabase 세션 |

### 7.3 훅 목록

| 훅 | 책임 |
| --- | --- |
| `use-kakao-map-sdk` | SDK 로드 상태 |
| `use-map-markers-query` | 마커 조회·캐시 |
| `use-auth-session` | 세션 조회·구독 |
| `use-active-markers` | 모드 + 필터 + 대기 마커를 합친 최종 렌더 대상 산출 |
| `use-marker-edit-form` | 편집 폼(react-hook-form + zod) |
| `use-excel-upload-actions` | 장비·축전지·ERP·위치 업로드 파이프라인 |
| `use-data-backup-actions` | 백업 생성·복원 |

## 8. 라이브러리 모듈 맵 (`features/map-marker/lib/`)

| 모듈 | 책임 |
| --- | --- |
| `marker-svg.ts` | 마커 SVG 생성(색상·라벨) |
| `cluster-pie.ts` | 파이/도넛 클러스터 아이콘 |
| `marker-filters.ts` | 필터 적용 및 제외 사유 집계 ✅ 테스트 |
| `address-group.ts` | 유효 키·대표/SUB 판정·재그룹 |
| `geocode.ts` | 주소→좌표(배치 큐, 캐시, 실패 목록) |
| `overlay-content.ts` / `overlay-drag.ts` | 정보창 HTML · 드래그 이동 |
| `location-marker.ts` / `location-marker-groups.ts` | 위치 모드 임시 마커 |
| `parcel-boundary.ts` | 장소 검색 결과 · 필지 경계 |
| `map-viewport-capture.ts` | 현재 뷰포트 캡처(html2canvas) |
| `capture-overlay-layout.ts` | 캡처용 정보창 배치 |
| `map-capture-stitch/` | `bounds` `plan` `capture` `helpers` — 격자 계획 → 캡처 → PNG 스티칭 |
| `excel/data-manager/` | `parse` `erp-parse` `headers` `export` `full-backup` `info-records` `date-utils` `shared` |

## 9. API 계약 (서버 라우트)

| 라우트 | 메서드 | 입력 | 출력 | 가드 |
| --- | --- | --- | --- | --- |
| `/api/kakao-static-map` | GET | 중심 좌표 · 레벨 · 크기 | 이미지 바이너리 | origin 검증 · `KAKAO_REST_API_KEY`(없으면 JS 키 시도 → 실패 시 타일 폴백) |
| `/api/map-tile-proxy` | GET | 타일 URL | 타일 이미지 | **호스트 allowlist**(SSRF 방지) · origin 검증 |
| `/api/roadview-dates` | GET | 좌표 | 촬영일자 JSON | origin 검증 |

허용 origin = 자기 도메인 + `NEXT_PUBLIC_SITE_URL` + `PROXY_ALLOWED_ORIGINS`(쉼표 구분)

## 10. 권한 매트릭스

| 기능 | 비로그인 | 로그인 |
| --- | :---: | :---: |
| 장비/축전지 마커 조회·필터 | ● | ● |
| 장소 검색 · 로드뷰 | ● | ● |
| 영역 캡처 | ● | ● |
| 위치 모드 | ✕ | ● |
| 마커 편집·삭제·시설팀 지정 | ✕ | ● |
| 그룹 분리/합치기/구분 변경 | ✕ | ● |
| 엑셀 업로드 | ✕ | ● |
| 백업/복원 | ✕ | ● |
| GPSMAP (`/gpsmap`) | ✕ | ● |

## 11. 파일 구조 요약

```
src/
├── app/
│   ├── layout.tsx · page.tsx · providers.tsx · globals.css
│   ├── gpsmap/page.tsx
│   └── api/{kakao-static-map, map-tile-proxy, roadview-dates}/route.ts
├── components/
│   ├── ui/                         shadcn/ui (Radix) 18종
│   ├── public-env-script.tsx       런타임 공개 env 주입
│   └── kakao-sdk-script.tsx        카카오 SDK 로더
├── features/
│   ├── map-marker/
│   │   ├── api.ts  types/  constants/  providers/  store/  hooks/  lib/
│   │   └── components/{map, sidebar, modals}
│   └── gpsmap/
│       ├── components/{gpsmap-page, vworld-map-pane, roadview-pane}
│       └── lib/{coords, lookup, batch-lookup, vworld-gpsmap, export-excel}
├── hooks/  lib/  types/
└── lib/supabase/client.ts

e2e/smoke.spec.ts
supabase/migrations/
docs/Ver_1.0/                       ← 본 문서 세트
```

## 12. 명명 규칙

| 대상 | 규칙 | 예 |
| --- | --- | --- |
| 파일 | kebab-case | `marker-detail-modal.tsx` |
| 컴포넌트 | PascalCase | `MapSidebar` |
| 훅 | `use-` 접두 | `use-active-markers.ts` |
| 상수 | UPPER_SNAKE | `DEFAULT_MAP_LEVEL` |
| DB 컬럼 | snake_case | `parent_marker_id` |
| TS 필드 | camelCase | `parentMarkerId` |
| 쿼리 키 | 배열 상수 | `["map-marker","markers"]` |

> DB(snake) ↔ 앱(camel) 변환은 `features/map-marker/api.ts` 경계에서만 수행한다.
