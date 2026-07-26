# Ver_1.1 컴포넌트 문서 (Components)

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 문서 버전: **Ver_1.1**
- 최종 갱신: 2026-07-26
- 관련 문서: [IA](./Ver_1.1_IA.md) · [DESIGN](./Ver_1.1_DESIGN.md) · [STATE](./Ver_1.1_STATE.md)

---

## 1. 컴포넌트 트리

```
app/page.tsx
└── MapMarkerPage
    ├── MapSidebar
    │   ├── AuthHeader
    │   ├── ModeTabs                       [장비][축전지][위치][날씨]  ← 4탭
    │   └── Accordion
    │       ├── LocationAddressSection      (위치)
    │       ├── LocationExcelSection        (위치)
    │       ├── EquipmentExcelSection / EquipmentInfoSection (장비·인증)
    │       ├── BatteryExcelSection         (축전지·인증)
    │       ├── WorksiteWeatherPanel        ← 신규 (위치 외 전 모드)
    │       ├── FilterPanel                 (위치 외)
    │       ├── PlaceSearchSection          (위치 외)
    │       └── MarkersListPanel
    │   └── BackupRestoreSection            (footer·인증)
    │
    ├── KakaoMapCanvas
    │   ├── MapFloatingControls
    │   ├── MapRegionCapturePanel / BoundsGuide / SelectOverlay
    │   └── (DOM) createOverlayContent → 날씨 카드 ← 신규
    │
    └── Modals
        ├── MarkerDetailModal / MarkerEditModal / RoadviewModal / AuthModal
        ├── WeatherSatelliteModal            ← 신규
        └── TyphoonModal                     ← 신규
```

## 2. 디렉터리 배치 규칙

```
features/{feature}/
├── components/    화면. 상태 소유·표시
├── hooks/         React 상태·부수효과
├── lib/           순수 함수·DOM 빌더·외부 호출 (React 비의존)
├── constants/     임계값·매핑
└── types/         타입 + 표기 상수 (단일 소스)
```

`components/`는 `lib/`를 쓰고, `lib/`는 `components/`·`hooks/`를 **쓰지 않는다**.

## 3. Ver_1.1 신규 컴포넌트 명세

### 3.1 `WorksiteWeatherPanel` (559줄)

| 항목 | 내용 |
| --- | --- |
| 위치 | `features/worksite-weather/components/worksite-weather-panel.tsx` |
| 렌더 조건 | `mode !== 'location'` |
| 소유 상태 | `query` · `selectedId` · `geocodeSite` · `isGeocoding` · `searchError` · 모달 2개 |
| 파생 | `candidates` · `searchResults` · `activeList` · `site` · `selectedIndex` |
| 스토어 | `mode` · `savedWeatherSites` · `setWeatherSearchMarkerIds` + 저장 액션 3종 |
| 쿼리 | `useMapMarkersQuery` (캐시 재사용) · `useWorksiteWeather` |

**책임**
1. 모드별 국소 후보 구성 (장비 / 축전지 / 날씨=통합)
2. 다중 키워드 검색 · 지오코딩 폴백
3. 선택 국소 파생 및 지도 이동
4. 판정 결과 표시 · TBM 저장 · 모달 소유

> ⚠️ **분할 대상**. 검색·저장목록·결과표시가 한 파일에 있다. Ver_1.2 과제(W1).

### 3.2 `WeatherTimelineTable` (98줄)

| 항목 | 내용 |
| --- | --- |
| props | `slots: WeatherSlot[]` |
| 구조 | 6열 · 11행 · `table-fixed` · 전 셀 `whitespace-nowrap` |
| 규칙 | 가로 스크롤 금지. 경과 슬롯 `text-slate-600` |
| 표기 | `VERDICT_ICON` · `VERDICT_LABEL` · `SLOT_SOURCE_LABEL` 참조 |

상태를 갖지 않는 순수 표시 컴포넌트.

### 3.3 `HazardSummaryList` (48줄)

| 항목 | 내용 |
| --- | --- |
| props | `summary: HazardSummary` |
| 구조 | 폭염·강풍·강수·한파 **고정 순서** 4항목 |
| 규칙 | 해당 없으면 `⚪ 해당 없음`. 항목을 숨기지 않는다 |

### 3.4 `TyphoonBanner` (62줄)

| 항목 | 내용 |
| --- | --- |
| props | `typhoon: TyphoonInfo \| null` · `onOpenDetail: () => void` |
| 규칙 | `typhoon === null`이면 **`return null`** (DOM 미생성) |

> **모달을 소유하지 않는다.** 자체 `isOpen`을 갖고 있던 초기 구현에서
> 패널의 태풍 모달과 **이중 마운트**되어 동시에 열릴 수 있었다.

### 3.5 `TyphoonModal` (453줄) / `WeatherSatelliteModal` (371줄)

| 항목 | 내용 |
| --- | --- |
| props | `isOpen` · `onClose` (+ TyphoonModal은 `typhoon`) |
| 내용 | 외부 사이트 iframe (weather.go.kr / windy.com) + 새로고침 키 |
| 소유 | **패널이 인스턴스를 하나씩만** 가진다 |

> ⚠️ 외부 임베드 실렌더 미검증 (Ver_1.2 확인 과제).

### 3.6 지도 정보창 날씨 카드 (컴포넌트 아님)

| 항목 | 내용 |
| --- | --- |
| 위치 | `map-marker/lib/overlay-content.ts` |
| 형태 | **React 아님** — 순수 DOM 빌더 |
| 조건 | `mode === 'weather'` |
| 흐름 | 로딩 카드 삽입 → `fetchWorksiteWeather()` → `renderWeatherBoxContent()` |

**규칙**
- `weatherCard.isConnected`로 **마운트 여부 확인 후** 갱신 (닫힌 오버레이 갱신 방지)
- `innerHTML` 삽입 전 `escapeHtml`
- 표기 상수는 `types/weather.ts`에서 import (재정의 금지)
- 요청은 `lib/worksite-weather-api`의 **공유 캐시** 경유

### 3.7 `ModeTabs` (변경)

4번째 탭 `날씨`(`CloudSun`, sky) 추가. 위치 탭은 비로그인 시 잠김 — 날씨 탭은 잠기지 않는다.

## 4. 컴포넌트 작성 규칙

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

## 5. 컴포넌트 ↔ 요구사항 추적

| 컴포넌트 | FR | UC |
| --- | --- | --- |
| `WorksiteWeatherPanel` | FR-W01~05, FR-S01~06, FR-O01 | UC-W01~04, W06 |
| `WeatherTimelineTable` | FR-K01·04·05·07 | UC-W05 |
| `HazardSummaryList` | FR-J01~05 | UC-W05 |
| `TyphoonBanner` | FR-A07 | UC-W08 |
| `TyphoonModal` | FR-O03 | UC-W08 |
| `WeatherSatelliteModal` | FR-O03 | UC-W09 |
| 오버레이 날씨 카드 | FR-W05 | UC-W07 |
| `ModeTabs` | FR-W01 | — |

## 6. 라이브러리 모듈 (컴포넌트가 의존하는 순수 계층)

### 6.1 `worksite-weather/lib/`

| 모듈 | 줄 | 테스트 | 비고 |
| --- | --- | --- | --- |
| `verdict.ts` | 346 | 41 | 판정 엔진 |
| `merge-sources.ts` | 255 | 12 | 소스 병합 |
| `site-search.ts` | 280 | 21 | 국소 검색 |
| `parse-wrn-text.ts` | 192 | 24 | 특보 텍스트(EUC-KR) |
| `kma-base-time.ts` | 107 | 13 | KST 기준시각 |
| `worksite-weather-api.ts` | 101 | 8 | 클라이언트 요청·캐시 |
| `parse-amount.ts` | 74 | 13 | PCP/SNO 문자열 |
| `apparent-temp.ts` | 60 | 12 | 체감온도 |
| `grid.ts` | 55 | 8 | 격자 변환 |
| `wind.ts` | 33 | 11 | 16방위 |
| `export-tbm.ts` | 96 | — | TBM 엑셀 (xlsx 지연) |
| `kma-client.ts` | 487 | — | **서버 전용** |

### 6.2 `map-marker/lib/` 변경

| 모듈 | 변경 |
| --- | --- |
| `overlay-content.ts` | 날씨 카드 추가. 표기 상수 단일 소스 참조 |
| `map-viewport-capture.ts` | html2canvas 지연 로딩 |
| `excel/data-manager/full-backup-schema.ts` | **신규** — xlsx 무의존 상수·타입 |
| `excel/data-manager/full-backup.ts` | schema 재export, 신규 컬럼 |
| `fetch-all-rows.test.ts` | **신규** — 페이지네이션 테스트 9건 |

## 7. 대형 파일 현황

| 파일 | 줄 | 상태 |
| --- | --- | --- |
| `marker-detail-modal.tsx` | 2,016 | 🔴 Ver_1.0부터 미해소 |
| `use-excel-upload-actions.tsx` | 1,516 | 🟠 |
| `kakao-map-canvas.tsx` | 1,013 | 🟠 |
| `full-backup.ts` | 836 | 🟡 |
| `overlay-content.ts` | 739 | 🟡 Ver_1.1에서 증가 |
| `worksite-weather-panel.tsx` | 559 | 🟡 Ver_1.1 신규 |
