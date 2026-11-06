# Ver_2.0 컴포넌트 문서 (Components)

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 문서 버전: **Ver_2.0**
- 작성일: 2026-08-01
- 이전 버전: [Ver_1.1 COMPONENT](../Ver_1.1/Ver_1.1_COMPONENT.md)
- 관련 문서: [계획서](./Ver_2.0_implementation_plan.md) · [IA](./Ver_2.0_IA.md) · [DESIGN](./Ver_2.0_DESIGN.md)

> 구현 착수 전 설계 문서다. §3~5의 컴포넌트는 아직 없다.
> **§7의 불일치 목록을 착수 전에 먼저 읽는다.**

---

## 1. 컴포넌트 트리 (To-Be)

```
app/page.tsx
└── MapMarkerPage
    └── AppShell                              ← 신규
        ├── NavRail                           ← 신규
        │   ├── 브랜드 + 건수 요약
        │   ├── 메뉴 7종 (비로그인 시 필터링)
        │   └── AuthHeader                    ← 사이드바 헤더에서 이동
        │
        ├── TopSearchBar                      ← 신규 (Ctrl+K)
        │
        ├── WorkPanel                         ← 신규 · activeNav로 분기
        │   ├── dashboard → DashboardPanel    ← 신규
        │   │                ├── WorksiteBoard         ← 신규
        │   │                │   └── WorksiteRow × N   ← 신규
        │   │                └── (선택 국소 상세)
        │   │                    ├── TyphoonBanner
        │   │                    ├── HazardSummaryList
        │   │                    └── WeatherTimelineTable
        │   │
        │   ├── map       → ModeTabs(3종) + FilterPanel + PlaceSearchSection
        │   │                + MarkersListPanel(위치 찾기)
        │   │                + [위치] GpsConverter                ← 분리 신규
        │   │
        │   ├── markers   → ModeTabs(2종) + EquipmentExcelSection
        │   │                + EquipmentInfoSection / BatteryExcelSection
        │   │                + FilterPanel + MarkersListPanel
        │   │
        │   ├── groups    → ComingSoon                            ← 신규
        │   ├── cctv      → CctvPanel
        │   ├── backup    → BackupRestoreSection (그대로 이동)
        │   └── settings  → 표시 설정 (MapFloatingControls 일부)
        │
        └── MapStage
            ├── KakaoMapCanvas
            ├── MapFloatingControls
            └── MapRegionCapturePanel / BoundsGuide / SelectOverlay

    └── Modals (body 포털 — AppShell 밖에 유지)
        ├── MarkerDetailModal / MarkerEditModal / RoadviewModal / AuthModal
        ├── CctvVideoModal
        └── WeatherSatelliteModal / TyphoonModal
```

**모달은 `AppShell` 안에 넣지 않는다.** 현재도 `MapMarkerPage`가 직접 소유하고 있으며,
패널·아코디언이 접혀 언마운트돼도 지도 마커에서 열 수 있어야 한다.

## 2. 디렉터리 배치 규칙 (Ver_1.1 승계)

```
features/{feature}/
├── components/    화면. 상태 소유·표시
├── hooks/         React 상태·부수효과
├── lib/           순수 함수·DOM 빌더·외부 호출 (React 비의존)
├── constants/     임계값·매핑
└── types/         타입 + 표기 상수 (단일 소스)
```

`components/`는 `lib/`를 쓰고, `lib/`는 `components/`·`hooks/`를 **쓰지 않는다**.

신규 feature 2개: `features/shell/` · `features/dashboard/`.

## 3. 셸 신규 컴포넌트 명세

### 3.1 `AppShell`

| 항목 | 내용 |
| --- | --- |
| 위치 | `features/shell/components/app-shell.tsx` |
| 역할 | 4영역 레이아웃 조립. 폭 상수 주입 |
| props | `useActiveMarkers()` 결과 일체 (아래 경고 참조) |
| 스토어 | `activeNav` · `isSidebarOpen` |

> ⚠️ **`useActiveMarkers()`는 트리에서 딱 한 번만 호출한다.**
> 이 훅은 `useRef`로 이전 필터 옵션을 기억하며 `useEffect` 두 개가 `setFilters`를 호출한다.
> 여러 곳에서 부르면 서로 다른 ref를 들고 같은 스토어 필터를 번갈아 덮어써 필터가 튄다.
>
> **목록만 필요하면 `useMarkerList()`를 쓴다** — 파생 계산만 하고 스토어에 쓰지 않는다.
> `useActiveMarkers`도 내부에서 이걸 쓰므로 목록 계산은 한 벌뿐이다.
>
> | 훅 | 호출처 | 역할 |
> | --- | --- | --- |
> | `useActiveMarkers` | `map-marker-page.tsx` **단독** | 목록 + 필터 옵션 동기화(부수효과) + 건수 |
> | `useMarkerList` | 위 훅 · `marker-detail-modal` · `use-marker-edit-form` | 목록 파생만 |
>
> 2026-08-01 정리. 이전에는 두 모달이 `useActiveMarkers`를 직접 불러 인스턴스 3개가
> 동시에 `setFilters`에 썼다(구조 점검 H-3).

### 3.2 `NavRail`

| 항목 | 내용 |
| --- | --- |
| 위치 | `features/shell/components/nav-rail.tsx` |
| props | `equipmentCount` · `batteryCount` · `locationCount` · `isLoading` |
| 스토어 | `activeNav` · `setActiveNav` |
| 훅 | `useAuthSession()` · `useHasMounted()` |

**책임**

1. `NAV_ITEMS`(§3.6)에서 **비로그인 시 `auth: true` 항목을 필터링**해 렌더
2. 활성 메뉴 표시 · 전환
3. 준비 중 항목 `disabled` + 툴팁
4. 계정 영역(`AuthHeader`) 배치
5. 폴백 — 현재 `activeNav`가 접근 불가면 `dashboard`로 되돌림

> `useHasMounted()` 없이 인증 상태로 분기하면 SSR 결과와 어긋나 하이드레이션이 깨진다.
> 현재 `map-sidebar.tsx:73`이 같은 이유로 이 훅을 쓴다.

### 3.3 `WorkPanel`

| 항목 | 내용 |
| --- | --- |
| 위치 | `features/shell/components/work-panel.tsx` |
| props | `markers` · `filterOptions` · `filters` · 건수 일체 |
| 스토어 | `activeNav` · `mode` · `setMode` |
| 분기 | `ts-pattern`의 `match(activeNav).with(...).exhaustive()` |

`exhaustive()`를 쓰면 `NavKey`에 값을 추가할 때 컴파일이 막힌다 — 화면이 조용히 빈 채로
남는 것을 막는다. 현재 스토어·사이드바가 이미 `ts-pattern`을 쓰고 있다.

**무거운 패널은 `dynamic()`으로 분리한다.** 대시보드·백업/복원은 진입 전까지 필요 없다.
홈 First Load JS를 현재(295 kB) 이하로 유지하려면 신규 코드가 초기 번들에 다 실리면 안 된다.

### 3.4 `TopSearchBar`

| 항목 | 내용 |
| --- | --- |
| 위치 | `features/shell/components/top-search-bar.tsx` |
| 소유 상태 | `query` · `isOpen` · `highlightedIndex` |
| 재사용 | `place-search-section`의 검색·지오코딩 로직 |
| 스토어 | `setPlaceSearch` |
| 키보드 | `Ctrl+K` 포커스 · `Esc` 닫기 · `↑↓` 이동 · `Enter` 선택 |

> 키 리스너는 `window`에 붙이고 **언마운트 시 반드시 제거**한다.
> 입력 요소에 포커스가 있을 때 `Ctrl+K`가 아닌 단축키는 가로채지 않는다.

`place-search-section`의 로직을 **복사하지 않는다.** 공용 훅(`use-place-search`)으로 뽑아
기존 섹션과 검색바가 같은 구현을 쓰게 한다. 두 벌이 되면 검색 결과가 화면마다 달라진다.

### 3.5 `ComingSoon`

| 항목 | 내용 |
| --- | --- |
| 위치 | `features/shell/components/coming-soon.tsx` |
| props | `title: string` · `description?: string` |
| 규칙 | 상태 없음. 조작 요소·목업 데이터 없음 |

### 3.6 `features/shell/types/nav.ts` · `constants.ts`

```
NavKey  = 'dashboard' | 'map' | 'markers' | 'groups' | 'cctv' | 'backup' | 'settings'

NavItem { key: NavKey
          label: string      // IA §3.1 문자열 그대로
          icon: LucideIcon
          auth: boolean      // true면 비로그인 시 숨김
          enabled: boolean } // false면 준비 중

NAV_RAIL_WIDTH_PX   = 200
WORK_PANEL_WIDTH_PX = 340
LEFT_OFFSET_PX      = NAV_RAIL_WIDTH_PX + WORK_PANEL_WIDTH_PX   // 540
```

`LEFT_OFFSET_PX`를 파생 상수로 둔다. 소비처(`cctv-video-modal`, `map-region-capture-panel-view`)가
직접 더하면 한 곳이 빠졌을 때 드러나지 않는다.

## 4. 대시보드 신규 컴포넌트 명세

### 4.1 `useWorksiteBoard`

| 항목 | 내용 |
| --- | --- |
| 위치 | `features/dashboard/hooks/use-worksite-board.ts` |
| 입력 | `savedWeatherSites` (스토어) |
| 출력 | `rows: Array<{ site, status: 'idle'\|'loading'\|'ok'\|'error', data?, error? }>` · `retry(siteId)` |
| 호출 | `fetchWorksiteWeather(site)` — **기존 10분 캐시·중복제거를 그대로 탄다** |
| 동시성 | 상한 **4**. 나머지는 대기열 |
| 실패 | 행 단위로 격리. 한 건 실패가 전체를 막지 않는다 |

**새 캐시를 만들지 않는다.** 지도 오버레이(`overlay-content.ts`)가 같은 모듈 캐시를 쓰므로,
별도 캐시를 두면 같은 국소가 지도와 목록에서 다른 값으로 보인다.

> 언마운트 후 `setState` 방지를 위해 진행 중 요청에 취소 플래그를 둔다.
> 대시보드는 메뉴 전환으로 자주 언마운트된다.

### 4.2 `DashboardPanel`

| 항목 | 내용 |
| --- | --- |
| 위치 | `features/dashboard/components/dashboard-panel.tsx` |
| 역할 | 대시보드 진입점. 빈 상태 / 목록+상세 분기 |
| 소유 상태 | `selectedSiteId` |
| 파생 | `selectedSite = rows.find(...) ?? rows[0] ?? null` |
| 모달 | 태풍·위성 모달 인스턴스를 **여기서 하나씩만** 소유 |

### 4.3 `WorksiteBoard`

| 항목 | 내용 |
| --- | --- |
| 위치 | `features/dashboard/components/worksite-board.tsx` |
| props | `rows` · `selectedSiteId` · `onSelect` · `onRetry` |
| 구조 | 헤더(건수 + 전체 삭제) + 행 목록 |
| 규칙 | 상태 없음. 표시 전용 |

### 4.4 `WorksiteRow`

| 항목 | 내용 |
| --- | --- |
| 위치 | `features/dashboard/components/worksite-row.tsx` |
| props | `row` · `isSelected` · `onSelect` · `onRetry` |
| 표기 | `VERDICT_ICON` · `VERDICT_LABEL` · `VERDICT_TONE` **import만** — 재정의 금지 |
| 규칙 | 상태 없음. 클릭 시 상위로 콜백만 |

## 5. 기존 컴포넌트 변경

| 컴포넌트 | 변경 |
| --- | --- |
| `map-marker-page.tsx` | `MapSidebar` 제거 → `AppShell` 조립. `useActiveMarkers` 호출은 유지 |
| `sidebar/map-sidebar.tsx` (350줄) | **삭제**. 내부 섹션은 `WorkPanel`이 직접 렌더 |
| `sidebar/mode-tabs.tsx` (63줄) | 세그먼트 컨트롤로 축소. 4탭 → 3탭, `flex-[1.7]` 예외 제거 |
| `sidebar/auth-header.tsx` (56줄) | 위치만 이동 (레일 하단). 내부 변경 없음 |
| `sidebar/backup-restore-section.tsx` (85줄) | **위치만 이동.** 삭제 버튼 문구에 건수 추가 (§7.1) |
| `sidebar/filter-panel.tsx` (150줄) | 변경 없음. 지도·마커관리 양쪽에서 **같은 인스턴스 규칙**으로 사용 |
| `sidebar/place-search-section.tsx` (103줄) | 검색 로직을 공용 훅으로 추출 |
| `lib/select-active-markers.ts` (신규·완료) | 마커 선별 순수함수. 2026-08-01 훅에서 추출 + 테스트 10건. Ver 2.0에서 `weather` 분기만 바꾼다 |
| `hooks/use-active-markers.ts` | 위 함수 호출로 축소됨. 필터 부수효과는 그대로 |
| `cctv/components/cctv-video-modal.tsx` | `SIDEBAR_WIDTH_PX = 340`(18행) 제거 → `LEFT_OFFSET_PX` |
| `map/map-region-capture-panel-view.tsx` | `left-4` → 패널 오프셋 기준으로 조정 (95행) |
| `worksite-weather/worksite-weather-panel.tsx` (559줄) | 대시보드로 이동 + 검색/상세 분리 검토. `OVERALL_TONE` 승격 |
| `gpsmap/gpsmap-page.tsx` (745줄) | 변환기 본체를 분리해 패널·전체화면 양쪽에서 사용 |

### 5.1 삭제되는 화면 요소

| 요소 | 사유 |
| --- | --- |
| `날씨&CCTV` 모드 탭 | 대시보드·CCTV 메뉴로 분리 |
| 사이드바 헤더 「주소/좌표 통합 변환기」 링크 | 위치 세그먼트에 통합 |
| footer 백업 아코디언 | 독립 메뉴로 승격 |
| 아코디언 「주소로 위치 찍기」·「엑셀로 위치 찍기」 | 통합 변환기에 흡수 |

## 6. 컴포넌트 작성 규칙

Ver_1.1의 C1~C9를 유지한다.

| # | 규칙 |
| --- | --- |
| C1 | 도메인 계산은 `lib/`에. 컴포넌트는 표시만 |
| C2 | 판정 아이콘·라벨·색을 컴포넌트에 재정의하지 않는다 |
| C3 | 파생 가능한 값을 `useState`로 두지 않는다 |
| C4 | 사용자 선택을 `useEffect`로 덮어쓰지 않는다 |
| C5 | 모달 인스턴스는 한 곳에서만 소유하고 하위는 콜백을 받는다 |
| C6 | 비동기 응답을 DOM에 쓸 때 마운트 여부를 확인한다 |
| C7 | 무거운 모듈(xlsx 등)은 이벤트 핸들러에서 `await import` |
| C8 | 비동기 핸들러는 `.catch()`로 사용자 피드백을 준다 |
| C9 | 표는 줄바꿈·가로 스크롤 금지 |

Ver_2.0 추가:

| # | 규칙 |
| --- | --- |
| C10 | **치수를 컴포넌트에 적지 않는다.** 폭은 `shell/constants.ts`에서 import |
| C11 | **스토어에 쓰는 훅은 트리에서 한 번만 호출한다** — 기존 위반 3곳, 늘리지 말 것 (§3.1) |
| C12 | 인증 분기는 `useHasMounted()` 이후에 한다 |
| C13 | `activeNav` 분기는 `ts-pattern` + `exhaustive()` |
| C14 | 파괴적 조작 버튼에는 **대상과 건수**를 문구로 적는다 |
| C15 | 로직을 두 화면에서 쓰면 복사하지 말고 훅·컴포넌트로 공유한다 |

## 7. 계획 대비 코드 불일치 (착수 전 결정 필요)

계획서가 「기존 기능 이관」으로 적었지만, 코드를 확인한 결과 **신규 구현**인 항목이 있다.

### 7.1 데이터백업/복원 — **해소됨 (이동만 하기로 확정)**

계획서 §3.8로 확정. 초안 §3.7이 요구하던 도메인 탭·장비 일괄 삭제는 **범위에서 빠졌다.**

**`backup-restore-section.tsx`(85줄)를 그대로 옮긴다**

| 기능 | 현재 | Ver_2.0 |
| --- | --- | --- |
| 전체 백업 (`exportFullExcel`) | 장비+축전지 **통합 파일 하나** | 동일 |
| 전체 복원 (`importFullExcel`) | 통합 파일 | 동일 |
| 등록 데이터 일괄 삭제 | **`mode === 'battery'`일 때만** (`deleteAllBatteryMarkers`) | 동일 + 건수 문구 |

**만들지 않는 것**: 도메인별 백업·복원 · 장비 일괄 삭제
(`use-data-backup-actions.ts`에 액션 자체가 없고, 되돌릴 수 없는 신규 파괴 기능이다.)

> **이동 시 유일한 판단 지점은 `mode` prop이다.** 이 컴포넌트는 `mode`로 삭제 버튼 노출을
> 결정하는데, 백업 메뉴에는 세그먼트가 없다. 직전 도메인 값을 그대로 넘긴다.
> `mode`가 `weather`(대시보드에서 넘어온 경우)면 삭제 버튼이 안 보이는데, 이는 현재
> 날씨 탭에서도 마찬가지라 동작이 달라지지 않는다.

### 7.2 `OVERALL_TONE` — **해소됨**

- 해소: [2026-08-01] `worksite-weather/types/weather.ts`로 승격. 패널은 import만 한다.
  대시보드도 같은 상수를 쓴다.

### 7.3 메뉴 전환이 필터를 지운다 — **해소됨(설계 확정)**

`setMode`는 모드가 바뀌면 `filters` · `selectedMarkerId(s)` · `cctvMarkers` · `selectedCctv`를
초기화한다(`use-map-marker-store.ts:153`). 대시보드가 `mode: 'weather'`를 쓰므로 메뉴가
이 함수를 그대로 호출하면 지도 ↔ 대시보드 왕복만으로 필터가 두 번 날아간다.

- 해소: [2026-08-01] 계획서 §3.9로 확정 — **메뉴 전환은 보존, 세그먼트 전환은 초기화.**
  `setActiveNav`가 `mode`만 바꾸고, `setMode`의 현행 동작은 세그먼트용으로 유지한다.

### 7.4 `CctvPanel` 언마운트와 마커 — §7.3으로 함께 해소

CCTV 마커는 스토어(`cctvMarkers`)에 있고 영상 모달은 `MapMarkerPage`가 소유한다.
`setActiveNav`가 초기화를 건너뛰므로 CCTV 메뉴를 떠나도 조회 결과가 남는다.
단 세그먼트를 직접 바꾸면 여전히 비워진다 — 도메인이 달라지면 조회 대상도 달라지므로 의도된 동작이다.

### 7.5 지도 마커 수와 목록 건수는 같지 않다 (§3.4 확정)

대시보드 지도에는 **작업등록 국소 중 장비 마커만** 올린다. 축전지 국소는 목록에만 나온다.

- `WorksiteRow` 클릭 시 대응 마커가 없으면 **좌표로 이동만 하고 강조는 생략**한다.
  콜백이 조용히 아무것도 안 하면 고장으로 보인다.
- 검수 기준은 「건수 일치」가 아니라 **「지도 마커 ⊆ 목록」**이다.

## 8. 대형 파일 현황 (현재)

| 파일 | 줄 | 이번 버전에서 |
| --- | --- | --- |
| `marker-detail-modal.tsx` | 2,016 | 손대지 않음 (🔴 Ver_1.0부터 미해소) |
| `use-excel-upload-actions.tsx` | 1,516 | 손대지 않음 |
| `kakao-map-canvas.tsx` | 1,013 | 손대지 않음 |
| `full-backup.ts` | 836 | §7.1 결정에 따라 영향 가능 |
| `overlay-content.ts` | 739 | 손대지 않음 |
| `gpsmap-page.tsx` | **745** | **분리 대상** — 패널·전체화면 공유 |
| `worksite-weather-panel.tsx` | **559** | **분리 검토** — 대시보드 이관 |
| `map-sidebar.tsx` | 350 | **삭제** |

> 이번 버전은 셸 개편이라 대형 파일 해소가 목적이 아니다.
> **분리 대상 2건은 "두 곳에서 써야 해서" 나누는 것**이지 줄 수를 줄이려는 것이 아니다.

## 9. 컴포넌트 ↔ 완료 기준 추적

| 컴포넌트 | 계획서 §8 완료 기준 |
| --- | --- |
| `NavRail` | 라벨 7개 그대로 렌더 · 그룹관리 준비 중 · 비로그인 필터링 · 로그아웃 폴백 |
| `WorkPanel` | 세그먼트별 필터 구성(§3.7) · 기존 기능 전부 동작 |
| `TopSearchBar` | `Ctrl+K` 열림 · 결과가 지도에 반영 |
| `DashboardPanel` · `WorksiteBoard` · `WorksiteRow` | 기본 진입 화면 · 판정·위험요약·권장 시간대 · 빈 상태 · 부분 실패 |
| `use-worksite-board` | 부분 실패 격리 · 캐시 공유 |
| `select-active-markers` | 대시보드에 작업등록 **장비** 국소만 · 지도 마커 ⊆ 목록 |
| `shell/constants.ts` | 폭 상수 한 곳 (`grep -rn "340" src`로 잔재 없음) |
| `cctv-video-modal` · `map-region-capture-panel-view` | 새 레이아웃에서 지도 영역 기준 정렬 |
| `BackupRestoreSection` | 이동 전과 동일하게 동작 · 삭제 버튼에 건수 표시 |
| `GpsConverter` | 위치 세그먼트 동작 · `/gpsmap` 유지 · 같은 컴포넌트 공유 |
