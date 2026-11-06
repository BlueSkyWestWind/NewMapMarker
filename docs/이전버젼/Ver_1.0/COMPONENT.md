# 컴포넌트 문서 (Component)

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 문서 버전: **Ver_1.0**
- 최종 갱신: 2026-07-25
- 관련 문서: [IA](./Ver_1.0_IA.md) · [DESIGN](./Ver_1.0_DESIGN.md) · [STATE](./STATE.md) · [ARCHITECTURE](./ARCHITECTURE.md)

> 이 문서는 **컴포넌트의 책임과 경계**를 다룬다. 시각 사양(색·간격·타이포)은 DESIGN, 화면 배치는 IA를 참조한다.

---

## 1. 컴포넌트 트리

```
app/layout.tsx
└─ PublicEnvScript
   └─ KakaoSdkScript
      └─ Providers  (QueryClient · Auth · Theme · Toaster)
         │
         ├─ app/page.tsx  MapMarkerPage
         │  ├─ MapSidebar                      (w-340px)
         │  │  ├─ SidebarHeader
         │  │  │  ├─ AuthHeader
         │  │  │  ├─ MarkerCountSummary
         │  │  │  └─ SidebarCollapseButton
         │  │  ├─ ModeTabs                     [장비][축전지][위치*]
         │  │  ├─ GpsmapLinkBanner             (로그인 시)
         │  │  ├─ LocationModeBanner           (위치 모드)
         │  │  └─ Accordion (type=multiple)
         │  │     ├─ LocationAddressSection    위치 · 로그인
         │  │     ├─ LocationExcelSection      위치 · 로그인
         │  │     ├─ MarkersListPanel          전 모드 (기본 펼침)
         │  │     ├─ FilterPanel               장비/축전지
         │  │     ├─ PlaceSearchSection        전 모드
         │  │     ├─ EquipmentInfoSection      장비 · 로그인
         │  │     ├─ EquipmentExcelSection     장비 · 로그인
         │  │     ├─ BatteryExcelSection       축전지 · 로그인
         │  │     └─ BackupRestoreSection      장비/축전지 · 로그인
         │  │
         │  ├─ KakaoMapCanvas
         │  │  ├─ MarkerLayer                  SVG 마커 · 대표핀
         │  │  ├─ ClusterLayer                 파이 | 도넛
         │  │  ├─ OverlayLayer                 정보창 · 필지 경계
         │  │  ├─ MapRegionSelectOverlay       + MapRegionBoundsGuide
         │  │  ├─ MapFloatingControls          우측 세로 스택 10종
         │  │  └─ CapturePanel                 (조건부)
         │  │
         │  └─ 모달 레이어
         │     ├─ MarkerDetailModal   ⚡dynamic
         │     ├─ MarkerEditModal     ⚡dynamic
         │     ├─ RoadviewModal
         │     └─ AuthModal
         │
         └─ app/gpsmap/page.tsx  GpsmapPage    (로그인 전용)
            ├─ GpsmapInputPane                 단건(DMS) | 일괄
            ├─ VworldMapPane
            └─ RoadviewPane
```

⚡ = `next/dynamic` 지연 로드 (홈 First Load 482 kB 유지)

## 2. 디렉터리 배치 규칙

| 위치 | 담는 것 | 예 |
| --- | --- | --- |
| `components/ui/` | shadcn/ui 원시 컴포넌트 18종. **도메인 지식 없음** | `button` `dialog` `accordion` `toast` `file-upload` |
| `components/` | 앱 전역 인프라 | `public-env-script` `kakao-sdk-script` |
| `features/map-marker/components/map/` | 지도 캔버스·레이어·컨트롤 | `kakao-map-canvas` `map-floating-controls` |
| `features/map-marker/components/sidebar/` | 사이드바 섹션 | `filter-panel` `markers-list-panel` |
| `features/map-marker/components/modals/` | 모달 4종 | `marker-detail-modal` |
| `features/gpsmap/components/` | GPSMAP 전용 | `vworld-map-pane` `roadview-pane` |

**규칙**: `components/ui/`는 절대 도메인 타입(`MapMarker` 등)을 import하지 않는다. 재사용 가능한 원시 계층으로 유지한다.

## 3. 핵심 컴포넌트 명세

### 3.1 `MapMarkerPage` (app/page.tsx)

| 항목 | 내용 |
| --- | --- |
| 책임 | 워크스페이스 조립. 사이드바·지도·모달 배치 |
| 상태 | 직접 보유하지 않음. 스토어/쿼리 훅 경유 |
| 주요 훅 | `use-kakao-map-sdk` · `use-map-markers-query` · `use-auth-session` · `use-active-markers` |
| 금지 | 도메인 계산 로직 직접 구현(→ `lib/`로 분리) |

### 3.2 `MapSidebar`

| 항목 | 내용 |
| --- | --- |
| 책임 | 모드·인증에 따른 섹션 노출 제어 |
| 폭 | `w-[340px] shrink-0` 고정 |
| 구조 | 헤더 고정 + 본문 `min-h-0 flex-1 overflow-y-auto` |
| 노출 규칙 | [IA §4.2 섹션 매트릭스](./Ver_1.0_IA.md)와 **1:1 일치** |
| 접힘 | 사이드바 제거 후 `left-3 top-3`에 `PanelLeftOpen` 버튼만 잔류 |

### 3.3 `ModeTabs`

| Prop/상태 | 값 |
| --- | --- |
| 모드 | `장비` \| `축전지` \| `위치` |
| 아이콘 | `Server` · `Battery` · `MapPin` |
| 잠김 조건 | 위치 모드 + 비로그인 → `disabled` + `Lock` + `title="로그인 후 이용할 수 있습니다"` |
| 부수효과 | 전환 시 `filters` · `selectedMarkerId` · `selectedMarkerIds` 초기화 |
| persist | 선택 모드는 `map-marker-ui`에 저장 |

### 3.4 `MarkersListPanel`

| 항목 | 내용 |
| --- | --- |
| 책임 | 렌더 대상 마커 목록 + 텍스트 검색 + 클릭 시 지도 이동 |
| 검색 대상 | 이름 · 주소 |
| 데이터 원천 | `use-active-markers` 결과(이미 필터 적용됨) |
| 빈 상태 | 안내 문구. 오류처럼 보이지 않게 처리 |
| 기본 개방 | 아코디언 기본 펼침 항목 |

### 3.5 `FilterPanel`

| 모드 | 필터 축 |
| --- | --- |
| 장비 | 연도 · 사업유형 · 색상 · 태그 |
| 축전지 | 용량 · 수량 · 국소명 (+공통 축) |

| 항목 | 내용 |
| --- | --- |
| 조작 | 다중 선택 + [전체 선택]/[전체 해제] |
| 표시 | **필터별 제외 건수** 집계 노출 |
| 계산 | `lib/marker-filters.ts`(순수 함수, 단위 테스트 보유) |
| 초기화 | 모드 전환 시 리셋 |

### 3.6 `KakaoMapCanvas`

| 항목 | 내용 |
| --- | --- |
| 책임 | 지도 인스턴스 생성·수명 관리, 레이어 마운트 |
| 전제 | SDK ready 이후에만 생성 |
| 초기값 | 중심 `35.159542, 126.8526012` · 레벨 6 · 줌 범위 0~14 |
| 렌더 대상 조건 | `parentMarkerId == null` **또는** `detachedVisible == true` |
| 정리 | 언마운트 시 마커·오버레이·이벤트 리스너 해제 |

### 3.7 `MapFloatingControls`

우측 세로 스택 10종. **모든 버튼에 `title` 필수**(DESIGN §8.6).

| # | 컨트롤 | 상태 표현 |
| --- | --- | --- |
| 1 | 영역 격자 자동 캡처 | 활성 시 글로우 |
| 2 | 내 위치 | 권한 거부 시 토스트 |
| 3 | 지적편집도 | 토글 · persist |
| 4 | 클러스터 on/off | 토글 · persist |
| 5 | 클러스터 아이콘 스타일 | 파이 ↔ 도넛 · persist |
| 6 | 확대 (1단계) | — |
| 7 | 줌 슬라이더 | `aria-label="지도 확대 축소"` |
| 8 | 레벨 표시 | `현재 줌 레벨 N (작을수록 확대)` |
| 9 | 축소 (1단계) | — |
| 10 | 광주 시청 복귀 | — |

### 3.8 `MarkerDetailModal` ⚡

| 항목 | 내용 |
| --- | --- |
| 진입 | 마커 클릭 · 목록 클릭 |
| 구성 | 기본정보 · 연관 장비 표 · ERP 상세 · GPS 카드 · **그룹 조작** |
| 그룹 조작 | 구분 변경 · **분리** · **번지로 합치기** · 동 개별 표시 |
| 핵심 계산 | 유효 키 산출 → 부모 체인 수집 → **유효 키로 재필터**(NFR-12) |
| 표 제약 | 셀 줄바꿈 금지 · 가로 스크롤 금지 (NFR-20/21) |
| 로드 | `next/dynamic` |

> ⚠️ **현행 2,006줄** — 단일 최대 파일(검수 G1). 신규 로직은 이 파일에 추가하지 말고 훅으로 분리한다. 유효 키 함수 중복은 [CR-002](./CHANGE_REQUEST/CR-002.md)에서 해소.

### 3.9 `MarkerEditModal` ⚡

| 항목 | 내용 |
| --- | --- |
| 편집 필드 | 이름 · 메모 · 태그 · 색상 · 시설팀 · 주소 |
| 폼 | `react-hook-form` + `zod` + shadcn `form` |
| 부수효과 | 시설팀 지정 시 `color`를 팀 색으로 자동 반영(FR-28) |
| 하위 | `marker-edit-spec-lists` (스펙 목록) |
| 저장 후 | 쿼리 무효화 → 목록·지도 즉시 반영 |

### 3.10 `RoadviewModal` / `AuthModal`

| 컴포넌트 | 책임 | 예외 처리 |
| --- | --- | --- |
| `RoadviewModal` | 좌표 기준 로드뷰 + `/api/roadview-dates` 촬영일자 | 로드뷰 없음 → 안내 문구 / 일자 조회 실패 → 일자만 생략 |
| `AuthModal` | 이메일·비밀번호 로그인 | 자격 오류 → 모달 유지 + 인라인 메시지 |

### 3.11 엑셀 섹션 3종

| 컴포넌트 | 대상 | 커밋 시점 |
| --- | --- | --- |
| `EquipmentExcelSection` | 장비 엑셀 | **즉시** |
| `BatteryExcelSection` | 축전지 엑셀 | **즉시** |
| `LocationExcelSection` | 위치등록 ERP 79열 | **미리보기 후 [적용] 시** |

공통 규칙:
- 드롭존 + 선택 버튼 (`components/ui/file-upload`)
- 진행 중 **처리 건수/전체 건수** 표시 (불확정 스피너 단독 금지)
- 결과는 성공/중복/실패 **숫자**로 토스트, 실패 주소는 목록으로 병기

### 3.12 `BackupRestoreSection`

| 동작 | 표시 |
| --- | --- |
| 백업 | 5개 시트 엑셀 다운로드 |
| 복원 | ⚠️ 덮어쓰기 경고 → 확인 → 진행률 → 결과 건수 |

### 3.13 GPSMAP 컴포넌트

| 컴포넌트 | 책임 |
| --- | --- |
| `GpsmapPage` | 단건/일괄 모드 전환, 결과 표, 엑셀 내보내기 |
| `VworldMapPane` | VWorld 지도 표시 |
| `RoadviewPane` | 좌우 대조용 로드뷰. 접기 지원 |

입력: 도/분/초/1-100초 분리 필드(DMS) 또는 주소. 한국 영역 유효성 검증 후 표시.

## 4. 컴포넌트 작성 규칙

| ID | 규칙 |
| --- | --- |
| C-1 | **하나의 파일 = 하나의 책임.** 500줄을 넘으면 분할을 검토한다 |
| C-2 | 도메인 계산은 컴포넌트가 아니라 `lib/`의 순수 함수에 둔다 |
| C-3 | 서버 데이터는 훅으로만 접근한다. 컴포넌트가 Supabase 클라이언트를 직접 import하지 않는다 |
| C-4 | props에 `any`를 쓰지 않는다. 마커 타입은 `types/`의 정의를 재사용한다 |
| C-5 | 아이콘 전용 버튼에는 `title`, 슬라이더 등에는 `aria-label`을 반드시 단다 |
| C-6 | 표를 그리면 `whitespace-nowrap`을 적용하고, 폭이 모자라면 **컨테이너를 넓힌다** |
| C-7 | 무거운 컴포넌트는 `next/dynamic`으로 감싼다 |
| C-8 | 로딩 · 빈 결과 · 부분 실패 세 상태의 문구를 각각 정의한다 |
| C-9 | 잠금 상태에는 `disabled` + `Lock` + 사유 툴팁을 함께 제공한다 |
| C-10 | 지도 SDK 전역(`window.kakao`) 접근은 지도 컴포넌트/`lib/map-*`로 한정한다 |

## 5. 컴포넌트 ↔ 요구사항 추적

| 컴포넌트 | FR |
| --- | --- |
| `KakaoMapCanvas` | FR-01, FR-09, FR-11, FR-12 |
| `MapFloatingControls` | FR-02~FR-05, FR-10, FR-38 |
| `ModeTabs` | FR-06, FR-07 |
| `MapSidebar` | FR-08, FR-45 |
| `FilterPanel` | FR-14, FR-15 |
| `MarkersListPanel` | FR-16 |
| `PlaceSearchSection` | FR-17 |
| `MarkerDetailModal` | FR-18~FR-25, NFR-11~13 |
| `MarkerEditModal` | FR-26, FR-28 |
| `EquipmentExcelSection` | FR-29, FR-33 |
| `BatteryExcelSection` | FR-30 |
| `LocationExcelSection` | FR-31, FR-32 |
| `LocationAddressSection` | FR-34 |
| `BackupRestoreSection` | FR-35~FR-37 |
| `CapturePanel` | FR-39~FR-41 |
| `RoadviewModal` | FR-42, FR-43 |
| `AuthModal` | FR-44 |
| `GpsmapPage` | FR-46~FR-51 |

## 6. 라이브러리 모듈 (컴포넌트가 의존하는 순수 계층)

| 모듈 | 책임 | 테스트 |
| --- | --- | :---: |
| `marker-svg.ts` | 마커 SVG 생성(색상·라벨) | |
| `cluster-pie.ts` | 파이/도넛 클러스터 아이콘 | |
| `marker-filters.ts` | 필터 적용·제외 사유 집계 | ✅ |
| `address-group.ts` | 유효 키·대표/SUB 판정·재그룹 | |
| `geocode.ts` | 주소→좌표(배치 큐·캐시·실패 목록) | |
| `overlay-content.ts` / `overlay-drag.ts` | 정보창 HTML · 드래그 | |
| `location-marker*.ts` | 위치 모드 임시 마커 | |
| `parcel-boundary.ts` | 필지 경계 폴리곤 | |
| `map-viewport-capture.ts` | 뷰포트 캡처(html2canvas) | |
| `capture-overlay-layout.ts` | 캡처용 정보창 배치 | |
| `map-capture-stitch/` | bounds · plan · capture · helpers | ✅(helpers) |
| `excel/data-manager/` | parse · erp-parse · headers · export · full-backup · info-records · date-utils · shared | |
| `lib/proxy-guard` | origin/host allowlist 검증 | ✅ |
| `gpsmap/lib/coords` | DMS 변환·한국 영역 검증 | ✅ |
