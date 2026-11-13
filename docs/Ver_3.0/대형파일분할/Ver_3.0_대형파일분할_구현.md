# 대형 파일 분할 (구현)

구현일 2026-11-14 · 설계: [Ver_3.0_대형파일분할_설계.md](Ver_3.0_대형파일분할_설계.md) · 계획: [Ver_3.0_대형파일분할_구현계획.md](Ver_3.0_대형파일분할_구현계획.md)

`use-excel-upload-actions`, `marker-detail-modal`, `kakao-map-canvas`에서 순수 로직과 독립된 동작을 새 모듈로 빼냈다. 동작은 바꾸지 않았다(원본이 사양). 설계가 정한 범위 중 일부는 하지 않았고, 이유는 아래 "계획과 다르게 한 것"에 적었다.

## 직접 하실 일

1. **화면 확인(필수).** 개발 서버(`npm run dev`)에서 홈(`/`)을 열어 확인한다. 지도 SDK에 묶인 코드라 자동 검증 수단이 없다.
   - 경로탐색에서 출발지·방문지를 지도에서 고르는 모드를 켰을 때 픽업 마커가 뜨고, 고르면 번호 배지와 경로 결과의 선이 그려지며, 초기화하거나 메뉴를 나가면 모두 지워지는지.
   - CCTV 패널에서 지도에 CCTV 마커가 뜨고, 눌렀을 때 영상 창이 열리는지.
   - 위치 모드에서 마커 상세 창을 열어 ① 표를 드래그해 셀을 고르고 [선택 셀 복사]·[표 전체 복사]가 되는지 ② 장비 국소에서 [좌표·주소 변환 · 건축물대장]을 펼치면 조회되는지 ③ 같은 번지 국소의 구분(대표·단독·SUB) 변경과 동 개별 표시가 되는지.
   - 사이드바에서 장비·축전지·위치 엑셀 업로드와 위치등록 업로드 후 [확인] 저장이 되는지. 주소 찾기에 실패한 건이 있으면 토스트에 실패 주소가 목록으로 뜨는지.
2. 화면 확인 뒤 `커밋`이라고 말씀해 주시면 커밋한다.
3. 아래 "남은 것"의 작업(캡처 가이드·정보창 배치 훅 분리, 상세 모달의 번지 배치 구역 분리, `schedule-cell-dialog` 분할)을 이어서 할지 정해 주신다.

## 한 일

| 대상 | 변경 전 | 변경 후 | 뺀 모듈 |
|---|---:|---:|---|
| `hooks/use-excel-upload-actions` (`.tsx` → `.ts`) | 1,249줄 | 1,048줄 | `lib/excel-upload-runners.ts`, `components/sidebar/upload-result-toast.tsx` |
| `components/modals/marker-detail-modal.tsx` | 1,556줄 | 1,013줄 | `lib/table-tsv.ts`, `hooks/use-table-cell-selection.ts`, `hooks/use-marker-gps-info.ts`, `hooks/use-marker-group-actions.ts`, `components/modals/marker-detail-gps-card.tsx` |
| `components/map/kakao-map-canvas.tsx` | 1,622줄 | 1,417줄 | `hooks/use-kakao-cctv-layer.ts`, `hooks/use-kakao-route-layer.ts` |

경로는 모두 `src/features/map-marker/` 아래다.

### 업로드 훅

- 순수 변환·판정을 `excel-upload-runners.ts`로 옮겼다: `assertErpDateColumns`, `partitionByCoords`(좌표가 있는 행/지오코딩 필요 행), `appendFailCount`, `emptyFilterSelection`, `toEquipmentDbMarker`·`toEquipmentDbInfo`·`toBatteryDbMarker`·`toBatterySpecRows`, `summarizeStagedUpload`, `collectReviewTargets`.
- 일괄 저장과 개별 저장이 각각 따로 쓰던 같은 변환(장비·축전지 DB 행)을 한 곳으로 합쳤다. 필터를 비우는 8줄짜리 코드(두 곳)도 `emptyFilterSelection()`으로 합쳤다.
- 훅에서 JSX(`buildUploadResultDescription`)를 `upload-result-toast.tsx`로 빼서 파일을 `.ts`로 바꿨다. 호출부 5곳은 확장자 없이 import해서 고칠 곳이 없었다.

### 마커 상세 모달

- 표 복사 로직을 `table-tsv.ts`로 옮기며 중복을 없앴다. 표 전체 복사와 선택 셀 복사가 장비·축전지 열 순서를 각자 적고 있었는데, `equipmentCopyCells`·`batteryCopyCells` 하나로 합쳤다.
- 드래그 선택 상태는 `useTableCellSelection`, 좌표 조회·캐시·펼침은 `useMarkerGpsInfo`, 개별 표시·구분 변경·번지 분리·합치기 여섯 동작과 진행 상태는 `useMarkerGroupActions`로 옮겼다.
- GPS 카드의 화면 부분은 `MarkerDetailGpsCard`로 옮겼다(조회는 훅이 하고 카드는 그리기만 한다).

### 지도 캔버스

- 경로탐색 레이어(경로선·픽업 마커·번호 배지 effect 3개와 ref 3개)와 CCTV 마커 레이어를 effect 본문 그대로 훅 두 개로 옮겼다. 둘 다 지도 인스턴스 ref만 받아 쓰고, 나머지 코드와 공유하는 ref가 없었다.
- 훅 호출은 지도를 만드는 effect 뒤, 원래 effect가 있던 자리에 두었다. effect 실행 순서가 바뀌면 지도가 아직 없을 때 그려서다.

## 계획과 다르게 한 것

| # | 계획 | 한 것 | 이유 |
|---|---|---|---|
| 1 | `erp-staging-actions.ts`로 ERP 스테이징 DB 처리 분리 | 만들지 않았다. 순수 부분(`summarizeStagedUpload`, `collectReviewTargets`)만 `excel-upload-runners.ts`에 넣었다 | 남은 부분은 Supabase 조회와 스토어 호출 뭉치라 단위 테스트로 지킬 수 없고, 분리해도 이득이 적다 |
| 2 | 그룹 편집 헬퍼를 `components/modals/marker-detail-group-actions.ts`에 | `hooks/use-marker-group-actions.ts`로 만들었다 | 상태 6개와 toast·쿼리 갱신을 함께 쓰는 훅이라 hooks에 두는 것이 이 폴더의 관례다 |
| 3 | 캡처 가이드 훅, 정보창 배치 훅 | 하지 않았다 | 정보창 ref·타이머·버전 상태가 지도 초기화·마커 동기화 effect와 얽혀 있어 effect 순서가 조금만 어긋나도 지도가 깨진다. 화면 확인 없이 옮기기에는 위험이 크다고 봤다 |
| 4 | 상세 모달을 약 550줄로 | 1,013줄에서 멈췄다 | 같은 번지 개별 배치 구역(JSX 약 300줄)은 상태·핸들러 20여 개를 props로 넘겨야 해 비용이 이득보다 크다 |
| 5 | 4번 선택 작업 `schedule-cell-dialog` | 하지 않았다 | 설계 §6에서 포함 여부를 사용자가 정하게 해 두었다 |

## 검증

| 명령 | 결과 |
|---|---|
| `npx tsc --noEmit` | 오류 0건 |
| `npx eslint . --max-warnings=0` | 오류 0건 |
| `npm test` | 150개 파일 통과, 1개 스킵 / 1,774개 통과, 3개 스킵 |
| `npx next build`(임시 distDir, 설정 원복 확인) | 성공. 홈 301 kB, `/gpsmap` 207 kB |

- 새 테스트: `excel-upload-runners.test.ts`, `table-tsv.test.ts`. 모두 새 모듈이 없을 때 실패하는 것을 먼저 확인한 뒤 구현했다.
- 홈 First Load JS는 번들문서정리 작업 직후 300 kB였고, 이번 작업 뒤 301 kB다(+1 kB, 새 훅 모듈로 추정하나 확인하지 않았다). **AGENTS.md의 기준선 295 kB는 이 작업 전부터 넘어 있었다**(299 kB). 별도로 줄이는 작업이 필요하다.
- 분할 도중 잡은 문제: `useTableCellSelection`의 `clearSelection`을 처음에 렌더마다 새로 만들어서, 상세 조회 effect의 의존성이 되어 렌더 때마다 다시 조회했을 것이다. `useCallback`으로 고쳤다. 이 동작은 자동 테스트로 지킬 수 없으므로 위 화면 확인에 상세 창을 열어 두는 항목을 넣었다.

## 한계

- `.tsx`와 훅 렌더 테스트는 여전히 없다(`vitest.config.ts`는 `.ts`만 실행). 이번에 뺀 것 중 테스트로 지키는 것은 순수 함수뿐이고, 훅 3개와 지도 레이어 2개는 화면 확인에 의존한다.
- 업로드 훅 본체는 1,048줄로 여전히 크다. 상태·토스트·스토어 연결과 각 업로드 흐름이 한 훅에 남아 있다.
