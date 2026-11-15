# 대형 파일 분할 (설계)

작성일 2026-11-14 · 대상: `use-excel-upload-actions.tsx`, `marker-detail-modal.tsx`, `kakao-map-canvas.tsx` (선택: `schedule-cell-dialog.tsx`) · 구현계획: [Ver_3.0_대형파일분할_구현계획.md](Ver_3.0_대형파일분할_구현계획.md) · 구현: [Ver_3.0_대형파일분할_구현.md](Ver_3.0_대형파일분할_구현.md)

## 1. 배경과 결정 사항

`src/` 내 상위 대형 파일 4개가 각각 1,000줄을 넘어 변경 영향 파악이 어렵고, `vitest.config.ts:11`이 `src/**/*.{test,spec}.ts`만 포함해 `.tsx` 컴포넌트·훅 단위 테스트가 0건이다. 이 문서는 동작 변경 없이 책임을 분리하고 순수 로직을 `.ts` 모듈로 추출해 테스트 가능하게 만드는 분할 설계를 정의한다.

**사용자가 정한 것**

| # | 결정 | 날짜 |
|---|---|---|
| 1 | 분할 우선순위는 위험이 낮은 순서(`use-excel-upload-actions` → `marker-detail-modal` → `kakao-map-canvas`)로 진행하며, `schedule-cell-dialog`는 선택 대상으로 둔다 | 2026-11-14 |
| 2 | 동작 변경·UI 개선 덧붙이기 금지(순수 리팩터). 원본 동작이 사양이다 | 2026-11-14 |

**설계에서 정한 것(사용자 확인 대상은 §6)**

| # | 결정 |
|---|---|
| 3 | `.tsx` 테스트 환경(jsdom) 추가 대신 **로직을 순수 `.ts` 모듈로 추출**해 기존 `node` 환경 Vitest(`.test.ts`)로 검증하는 방안을 우선 추천한다(§3.1 비교) |
| 4 | 분할 전 현재 코드에서 순수 로직을 호출하는 **특성화 테스트(characterization test)**를 먼저 작성해 **PASS**를 확인한 뒤, 모듈을 분리하고 import만 바꿔 다시 **PASS**를 확인한다(미export 지역 함수는 먼저 export하거나 동등 순수 함수를 추출한 뒤 이동) |
| 5 | `kakao-map-canvas.tsx`의 남은 로직은 `window.kakao.maps` SDK 객체 수명주기 바인딩이라 자동 단위 테스트가 불가하므로 수동 화면 검증 체크리스트로 대체한다 |
| 6 | 홈 `dynamic()` 지연 로드 경계(`map-marker-page.tsx:19-51`)와 홈 First Load JS **295 kB 이하** 기준선을 유지한다 |

## 2. 확인한 사실

| 파일 | 줄 수 | 포함된 책임 (파일:줄 근거) |
|---|---:|---|
| `src/features/map-marker/hooks/use-excel-upload-actions.tsx` | 1,249 | 훅 파일 내 JSX(`buildUploadResultDescription`, 76-99줄), `assertErpDateColumns`(61-71줄, 미export 지역 함수), 장비/위치/축전지 업로드(`uploadEquipmentExcel` 144줄, `uploadLocationExcel` 236줄, `uploadBatteryExcel` 345줄), ERP 스테이징·검토(430-867줄), 대기 마커 저장(909-1249줄). 외부 5개 import 모두 확장자 생략 |
| `src/features/map-marker/components/modals/marker-detail-modal.tsx` | 1,556 | 그룹 분리/병합/역할 변경(168-445줄), GPSMAP/건축물대장 조회(573-613줄, `GpsInfoRow` 76-95줄), 표 TSV 복사 및 드래그 셀 선택(`handleCopyTable` 632줄, `handleCopySelected` 682-712줄 — 미export 클로저), 동별 그룹 정렬·렌더(786-1556줄) |
| `src/features/map-marker/components/map/kakao-map-canvas.tsx` | 1,622 | 영역 캡처 가이드·타일 제외(152-294줄), SDK 초기화 및 지도 이벤트(295-531줄), 마커/클러스터/드래그/오버레이 배치(532-1167줄), 경로탐색 폴리라인·픽업 마커(1206-1375줄), CCTV 마커 풀(1376-1506줄), JSX(1507-1622줄). 순수 계산(`screenRectToMapBounds`, `arrangeOverlayPanels`, `applyClusterPieStyles`, `markerPassesFilters`, `fitMapToMarkers`)은 이미 별도 `.ts`에 존재 |
| (선택) `src/features/schedule/components/schedule-cell-dialog.tsx` | 1,018 | 초기 초안·동반자 변환(`initialDrafts` 101줄, `initialCompanions` 120줄 — 미export), `CellForm` 상태·저장(`handleSave` 313-611줄), 폼 JSX(612-1018줄) |

## 3. 설계

### 3.1 테스트 전략 비교

| 기준 | 안 A: 로직을 순수 `.ts`로 추출 (추천) | 안 B: Vitest에 `jsdom` + `@testing-library/react` 추가 |
|---|---|---|
| 설정·의존성 | `vitest.config.ts` 변경 없음, 새 패키지 추가 없음 | `jsdom`, `@testing-library/react` 등 devDependency 추가 필요 |
| 테스트 속도·안정성 | node 환경에서 ms 단위로 실행, 카카오 SDK 모킹 부담 적음 | 브라우저 전역(`kakao.maps`, `ResizeObserver`) 모킹 비용 큼 |
| 한계 | `kakao-map-canvas`의 SDK `useEffect` 바인딩은 자동 검증 불가(수동 확인) | 컴포넌트 렌더까지 단위 테스트 가능 |

**추천안**: 안 A. 비즈니스 로직·상태 변환·포맷팅을 `.ts` 순수 함수로 빼내 `.test.ts`로 고정하고, `.tsx`는 얇은 React 바인딩만 남긴다.

### 3.2 파일별 분할 계획 및 예상 규모

#### (1) `use-excel-upload-actions.tsx` (1,249줄 → 4개 파일, 각 ~40-350줄)
- `src/features/map-marker/components/sidebar/upload-result-toast.tsx` (~40줄): `buildUploadResultDescription` JSX 분리.
- `src/features/map-marker/lib/excel-upload-runners.ts` (~350줄): `assertErpDateColumns` 및 장비/위치/축전지 엑셀 파싱·지오코딩·결과 집계 순수 함수.
- `src/features/map-marker/lib/erp-staging-actions.ts` (~300줄): 스테이징 확정/보류/제외/배치 순수 DB·상태 처리.
- `src/features/map-marker/hooks/use-excel-upload-actions.ts` (~250줄): React Query invalidation·Toast·Store 연결만 남긴 순수 `.ts` 훅(확장자 생략 import라 기존 5개 호출부 경로 변경 불필요).

#### (2) `marker-detail-modal.tsx` (1,556줄 → 6개 파일, 각 ~80-550줄)
- `src/features/map-marker/lib/table-tsv.ts` (~60줄): `buildTableTsv`, `buildSelectionTsv` 순수 TSV 직렬화 함수.
- `src/features/map-marker/hooks/use-table-cell-selection.ts` (~120줄): 표 드래그 선택(`handleMouseDown/Over/Up`)과 클립보드 복사.
- `src/features/map-marker/hooks/use-marker-gps-info.ts` (~80줄): `runSingleLookup` 호출 및 `gpsLoading`/`gpsResult` 상태.
- `src/features/map-marker/components/modals/marker-detail-group-actions.ts` (~220줄): 그룹 분리/병합/역할 변경 비동기 헬퍼.
- `src/features/map-marker/components/modals/marker-detail-gps-card.tsx` (~130줄): `GpsInfoRow` 및 GPSMAP/건축물대장 카드 UI.
- `src/features/map-marker/components/modals/marker-detail-modal.tsx` (~550줄): 모달 셸과 장비/축전지 상세 표 조립.

#### (3) `kakao-map-canvas.tsx` (1,622줄 → 5개 파일, 각 ~140-600줄)
- `src/features/map-marker/hooks/use-kakao-route-layer.ts` (~180줄): 경로탐색 폴리라인·픽업 마커·경로 배지 풀 동기화.
- `src/features/map-marker/hooks/use-kakao-cctv-layer.ts` (~140줄): CCTV 마커 풀 및 클릭 선택 동기화.
- `src/features/map-marker/hooks/use-kakao-capture-guide.ts` (~160줄): 영역 캡처 가이드 상태·타일 제외 토글.
- `src/features/map-marker/hooks/use-kakao-overlay-arrange.ts` (~180줄): `arrangeSelectedOverlays` 및 fallback 타이머 seam.
- `src/features/map-marker/components/map/kakao-map-canvas.tsx` (~600줄): SDK 초기화, 마커/클러스터러 수명주기, 하위 레이어 훅 결합, JSX 렌더.

**카카오맵 SDK 테스트 seam**: 순수 계산(`.ts`)은 이미 분리되어 있고, 위 4개 훅은 모두 `window.kakao.maps` 객체 수명주기(`setMap`, 이벤트 리스너)에 직접 결합돼 있어 **자동 단위 검증 수단이 없다**. 분할 후 화면 수동 체크리스트(구현계획 Task 3)로 검증한다.

#### (4) 선택: `schedule-cell-dialog.tsx` (1,018줄 → 3개 파일)
- `src/features/schedule/lib/cell-dialog-helpers.ts` (~120줄): `initialDrafts`, `initialCompanions`, `nextTextColor`, `describeDate` 순수 함수.
- `src/features/schedule/hooks/use-schedule-cell-form.ts` (~320줄): `CellForm` 상태 및 `handleSave` 저장 로직.
- `src/features/schedule/components/schedule-cell-dialog.tsx` (~450줄): 다이얼로그 및 폼 UI.

## 4. 범위 밖

- 기능 추가, UI/스타일 수정, `useMapMarkerStore` 구조 개편([Ver_3.0_의존방향정리_설계.md](../의존방향정리/Ver_3.0_의존방향정리_설계.md)에서 다룸).
- `vitest.config.ts` 전역 변경(안 A 채택 시 불필요).

## 5. 위험과 검증

- **특성화 테스트 기준선**: 분할 전 코드에서 기존/추출 대상 순수 함수가 **PASS**하는 것을 먼저 확인한 뒤 파일 분할을 진행한다.
- **`dynamic()` 번들 경계 회귀 위험**: `marker-detail-modal.tsx`는 `map-marker-page.tsx:26`에서 `dynamic()` 로드된다. 분할 후에도 홈 엔트리에서 직접 import하지 않도록 주의하고 `next build`로 First Load JS(295 kB 이하)를 확인한다.

## 6. 사용자 확인 필요 항목

1. 테스트 전략: **안 A(로직 `.ts` 추출 + 기존 node Vitest 유지)** vs **안 B(`jsdom` + Testing Library 도입)** 선택.
2. 선택 대상인 `schedule-cell-dialog.tsx`(1,018줄)를 이번 분할 범위에 포함할지 여부.
