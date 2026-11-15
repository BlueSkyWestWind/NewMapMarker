# 대형 파일 분할 2차 (설계)

작성일 2026-11-15 · 대상: `kakao-map-canvas.tsx`(캡처 가이드), `marker-detail-modal.tsx`(번지 배치 구역), `schedule-cell-dialog.tsx` · 구현계획: [Ver_3.0_대형파일분할2차_구현계획.md](Ver_3.0_대형파일분할2차_구현계획.md) · 구현: [Ver_3.0_대형파일분할2차_구현.md](Ver_3.0_대형파일분할2차_구현.md) · 1차: [Ver_3.0_대형파일분할_구현.md](../대형파일분할/Ver_3.0_대형파일분할_구현.md)

## 1. 배경과 결정 사항

1차 분할(2026-11-14)에서 순수 로직과 독립된 동작만 뺐고, 얽힘이 큰 부분은 남겼다. 남은 파일 크기는 `kakao-map-canvas` 1,417줄, `marker-detail-modal` 1,013줄, `use-excel-upload-actions` 1,048줄, `schedule-cell-dialog` 1,018줄이다. 이 문서는 남은 것 중 **얻는 것이 위험보다 큰 것**을 고르고, 나머지는 보류 이유를 적는다.

**사용자가 정한 것**

| # | 결정 | 날짜 |
|---|---|---|
| 1 | 동작 변경 없는 순수 리팩터. 기존 화면의 원본이 사양이다 | 2026-11-14 |
| 2 | 구현은 agy가 하고 Claude가 diff를 검토·수정한다 | 2026-11-14 |

**설계에서 정한 것(사용자 확인 대상은 §6)**

| # | 결정 |
|---|---|
| 3 | 이번 범위: 캡처 가이드 훅(A), 상세 모달의 번지 배치 구역(B), 일정 셀 대화상자의 순수 헬퍼(C). 정보창 자동 배치(D)와 업로드 훅 분할(E)은 보류한다 |
| 4 | 로직은 순수 `.ts`로 빼서 `.test.ts`로 지키고, `.tsx` 테스트 환경(jsdom)은 도입하지 않는다(1차와 같은 방침) |
| 5 | 캡처 UI를 훅으로 분리하는 일과 `dynamic()`으로 지연 로드하는 일은 한 묶음으로 설계한다(홈 번들 [홈번들점검](../홈번들점검/Ver_3.0_홈번들점검_설계.md)의 후보 L2와 겹친다) |

## 2. 확인한 사실

### 2.1 남은 큰 파일과 얽힘

| 대상 | 줄 수 | 남은 책임 | 얽힘 |
|---|---:|---|---|
| `kakao-map-canvas.tsx` | 1,417 | 지도 초기화·마커/클러스터·정보창 동기화·정보창 자동 배치·캡처 가이드·검색 필지·로드뷰·맞춤 요청 | 정보창 ref 4개(`overlaysRef`, `overlayOffsetsRef`, `manualOverlayIdsRef`, `overlayScalesRef`)와 `overlayLayoutVersion` 상태를 동기화 effect(803~975줄 부근)와 배치 함수(`arrangeSelectedOverlays`, 1062줄 부근)가 함께 쓴다 |
| `marker-detail-modal.tsx` | 1,013 | 기본·위치 정보 표시, 번지 배치 구역(JSX 약 300줄), 상세 표 | 번지 배치 구역이 `useMarkerGroupActions`의 상태·동작과 `dongGroups`·`separationLabelCounts` 계산을 쓴다 |
| `use-excel-upload-actions.ts` | 1,048 | 업로드 3종과 위치등록 확인 흐름(prepare·confirm·refresh·addons·defer·cancel·exclude·place) | `statusText`·`isUploading` 상태를 두 흐름이 공유한다 |
| `schedule-cell-dialog.tsx` | 1,018 | 헬퍼 4개(`columnLabel`·`nextTextColor`·`initialDrafts`·`initialCompanions`, 89~136줄), `CellForm`(168줄~, 상태·국소 검색·저장·폼 JSX) | `CellForm`이 약 850줄로 상태 18개를 가진다 |

### 2.2 1차에서 보류한 이유 중 바뀐 것

1차 구현 문서는 "상세 모달의 번지 배치 구역은 상태·핸들러 20여 개를 props로 넘겨야 해 비용이 크다"고 했다. 다시 보니 핸들러와 진행 상태는 이미 `useMarkerGroupActions`의 반환 객체 하나에 있다. 그 객체를 prop 하나(`actions`)로 넘기면 나머지는 데이터 몇 개뿐이라 **보류 사유가 약해졌다**(B로 올린다).

### 2.3 캡처 가이드의 중복

`kakao-map-canvas.tsx`는 캡처 상태를 비우는 블록(`setIsCapturePanelOpen(false)`, `setCaptureBounds(null)`, `setExcludedTiles(new Set())`, `prevTileCountRef.current = 0`, `setCaptureGuide({...})`)을 JSX 안 세 곳(`onStartRegionCapture`, `onClose`, `onReselectRegion`)에 그대로 적고 있다. 훅으로 빼면 `resetCapture()` 하나로 줄어든다.

## 3. 설계

### 3.1 A. 캡처 가이드 훅 `use-kakao-capture-guide.ts`

- 상태 5개(`isRegionSelectMode`, `isCapturePanelOpen`, `captureBounds`, `captureGuide`, `excludedTiles`)와 `prevTileCountRef`, 핸들러 2개(`handleCaptureGuideChange`, `handleToggleExcludedTile`)를 훅으로 옮긴다.
- 반환: 위 상태 값, 두 핸들러, `startRegionSelect()`, `completeRegion(bounds)`, `resetCapture()`, `reselectRegion()`. JSX 세 곳의 중복 블록을 이 함수들로 바꾼다.
- 지도 인스턴스에 의존하지 않는 순수 상태 훅이다(`MapRegionSelectOverlay`가 지도 좌표 변환을 하고 결과 `bounds`만 훅에 넘긴다). 그래서 effect 순서 위험이 없다.
- "격자 구성이 바뀌어 타일 수가 달라지면 제외 선택을 초기화한다"(121~130줄 부근)는 규칙은 순수 함수 `nextExcludedTiles(prevCount, nextCount, excluded)`로 빼서 테스트한다.

### 3.2 B. 번지 배치 구역 `marker-detail-sub-placement.tsx`

- JSX를 별도 컴포넌트로 옮긴다. props: `actions`(= `useMarkerGroupActions`의 반환), `equipmentMarker`, `relatedEquipmentMarkers`, `dongGroups`, `separationLabelCounts`, `relatedIsSplit`, `canSplit`, `subCount`, `detachedSubCount`, `openSubList`, `onToggleSubList`.
- 계산 3개(`dongGroups`, `separationLabelCounts`, `relatedIsSplit`/`canSplit`)는 순수 함수로 `lib/marker-group-view.ts`에 옮겨 테스트한다: `buildDongGroups(related)`, `buildSeparationLabelCounts(related)`, `canSplitGroup(related)`.
- 모달 본문은 이 컴포넌트 한 줄과 상세 표로 줄어든다.

### 3.3 C. 일정 셀 대화상자 헬퍼 `lib/cell-dialog-helpers.ts`

- `columnLabel`, `nextTextColor`, `initialDrafts`, `initialCompanions`를 옮기고 단위 테스트를 단다(`nextTextColor`는 `null → "0070C0" → "FF0000" → null` 순환이다. 구현 때 코드로 확인해 설계의 처음 예시 값을 고쳤다).
- `CellForm`의 상태·저장 로직을 훅으로 빼는 일은 이번에 하지 않는다. 상태 18개와 저장 흐름이 폼 JSX와 한 덩어리라, 헬퍼만으로 약 50줄이 줄 뿐이다. 필요하면 3차로 미룬다.

### 3.4 보류

| 대상 | 보류 이유 |
|---|---|
| D. 정보창 자동 배치 훅 | ref 4개와 버전 상태를 동기화 effect와 공유한다. effect 순서가 어긋나면 지도에서 정보창이 흩어지고 자동 검증이 없다. A·B를 마치고 화면에서 문제가 없을 때 별도 작업으로 다시 판단한다 |
| E. 업로드 훅 분할 | 두 흐름이 `statusText`·`isUploading`을 공유한다. 나누려면 공용 상태 훅이 하나 더 필요해 파일 수만 늘 뿐 이해가 쉬워지지 않는다 |

## 4. 범위 밖

- 기능 추가·UI 변경.
- `use-map-marker-store.ts`(637줄)와 `full-backup.ts`(908줄) 분할.
- 지연 로드 적용 자체(홈번들점검에서 다룬다. 이 작업은 그것이 가능하도록 경계를 만든다).

## 5. 위험과 검증

- **상태 초기화 누락**: `resetCapture()`가 기존 세 곳의 초기화 항목을 하나도 빠뜨리면 캡처 가이드가 이전 영역을 기억한다. 세 곳의 항목이 같은지 구현 전에 대조한다.
- **`useEffect` 의존성**: 훅이 돌려주는 함수를 다른 effect의 의존성에 넣으면 렌더마다 재실행된다(1차에서 `clearSelection`으로 겪었다). 반환 함수는 `useCallback`으로 안정화한다.
- **자동 검증의 한계**: 지도·캡처 UI는 테스트로 지키지 못한다. 순수 함수(`nextExcludedTiles`, `buildDongGroups`, `buildSeparationLabelCounts`, `canSplitGroup`, 셀 대화상자 헬퍼)만 테스트로 지키고, 나머지는 구현 문서의 화면 확인 목록으로 확인한다.
- **검증 명령**: `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test`.

## 6. 사용자 확인 필요 항목

1. 범위: A·B·C만 하고 D·E는 보류하는 안(추천) 중 선택. D까지 넣으려면 화면 확인을 더 자주 해야 한다.
2. C(`schedule-cell-dialog` 헬퍼 분리)를 이번에 포함할지. 얻는 것이 약 50줄과 테스트 몇 개로 작다. 포함하지 않아도 A·B에는 영향이 없다.
