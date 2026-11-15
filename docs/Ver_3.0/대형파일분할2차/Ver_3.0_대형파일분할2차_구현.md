# 대형 파일 분할 2차 (구현)

구현일 2026-11-15 · 설계: [Ver_3.0_대형파일분할2차_설계.md](Ver_3.0_대형파일분할2차_설계.md) · 계획: [Ver_3.0_대형파일분할2차_구현계획.md](Ver_3.0_대형파일분할2차_구현계획.md)

1차에서 남긴 세 곳을 분리했다: 지도 캔버스의 캡처 가이드 상태(A), 마커 상세 모달의 번지 배치 구역(B), 일정 셀 대화상자의 순수 헬퍼(C). 동작은 바꾸지 않았다. 설계 §6의 추천안(A·B·C 포함, 정보창 배치 훅·업로드 훅 분할은 보류)대로 진행했다. 구현은 agy가 하고 Claude가 diff를 검토했다.

## 직접 하실 일

개발 서버에서 아래를 눈으로 확인한다. 지도·모달 UI는 자동 테스트로 지키지 못한다.

1. **지도 영역 캡처(A).** 영역 캡처 시작 → 영역 드래그 선택 → 캡처 가이드와 타일이 뜬다 → 타일을 눌러 제외했다가 되돌린다 → [영역 다시 선택]이 이전 선택을 지우고 다시 선택 모드로 들어간다 → [닫기]가 가이드를 지운다 → 영역 선택 중 취소(Esc 또는 취소)가 선택 모드만 끈다. 캡처 패널의 [영역 수정]이 선택 모드로 돌아가는지도 본다.
2. **마커 상세의 번지 배치 구역(B).** 같은 번지에 SUB가 있는 장비 국소의 상세 창을 연다.
   - 대표 국소: [동일 번지 국소 개별 배치 (N)]를 펼쳤다 접는다 → 동 개별 표시/숨기기, 국소를 "동 대표로 표시" → [모두 합치기] → 구역이 둘 이상이면 [분리] / [분리 (대표 선택)] → 분리 그룹에서 [번지로 합치기].
   - SUB 국소를 직접 연 경우 "이 국소는 동의 대표로 개별 표시 중입니다" 안내와 [개별 표시 해제].
   - 분리된 단독 그룹이면 "번지로 합치기"만 보인다.
3. **일정 셀 대화상자(C).** 일정관리에서 셀을 열어 글자색 버튼을 누를 때마다 없음 → 파랑 → 빨강 → 없음으로 도는지, 빈 칸을 눌러 새 항목을 넣을 때 행 순서 위치에 들어가는지, 입회·신호수 값이 기존 값으로 채워지는지 확인한다.
4. 이상이 없으면 "커밋"이라고 말씀해 주세요.

## 한 일

| 대상 | 변경 전 | 변경 후 | 새 모듈 |
|---|---:|---:|---|
| `kakao-map-canvas.tsx` | 1,417줄 | 1,358줄 | `hooks/use-kakao-capture-guide.ts`, `lib/capture-guide-state.ts` |
| `marker-detail-modal.tsx` | 1,013줄 | 679줄 | `components/modals/marker-detail-sub-placement.tsx`, `lib/marker-group-view.ts` |
| `schedule-cell-dialog.tsx` | 1,018줄 | 975줄 | `lib/cell-dialog-helpers.ts` (`src/features/schedule/`) |

경로는 따로 적지 않으면 `src/features/map-marker/` 아래다.

- **캡처 가이드(A).** 상태 5개와 핸들러를 `useKakaoCaptureGuide`로 옮겼다. 캔버스 JSX에 같은 5줄 초기화 블록이 세 번 적혀 있던 것을 `resetCapture()`로 합쳤다(세 곳의 초기화 항목이 같음을 agy가 표로 대조했고 Claude가 diff로 다시 확인했다). 타일 수가 바뀌면 제외 선택을 비우는 규칙은 순수 함수 `nextExcludedTiles`로 빼서 테스트한다. 훅이 돌려주는 함수는 모두 `useCallback`이다.
- **번지 배치 구역(B).** JSX 약 300줄을 `MarkerDetailSubPlacement`로 옮기고(마크업·문구·클래스 그대로), 동 그룹 계산 3개를 `buildDongGroups`·`buildSeparationLabelCounts`·`canSplitGroup`으로 빼서 테스트한다. 핸들러와 진행 상태는 `useMarkerGroupActions`의 반환 객체를 `actions` prop 하나로 넘긴다. 1차에서 "props가 너무 많아 보류"했던 이유가 이 방식으로 해소됐다.
- **일정 셀 헬퍼(C).** `columnLabel`, `nextTextColor`, `initialDrafts`, `initialCompanions`와 이들이 쓰는 타입을 `cell-dialog-helpers.ts`로 옮겼다. `CellEditorState`는 기존 import가 깨지지 않게 `schedule-cell-dialog.tsx`에서 다시 내보낸다.

## 계획과 다르게 한 것

| # | 계획 | 한 것 | 이유 |
|---|---|---|---|
| 1 | 설계 §3.3의 `nextTextColor` 순환 `null → "blue" → "red" → null` | 코드의 실제 값 `null → "0070C0" → "FF0000" → null`로 테스트했다 | 설계 문서의 예시 값이 틀렸다. 구현이 코드를 읽고 맞췄고, 설계 문서도 고쳤다 |
| 2 | `dongGroups`·`relatedIsSplit` 등을 컴포넌트에서 계산하거나 prop으로 | `dongGroups`와 `subCount`는 모달에서 한 번 계산해 prop으로 넘기고, 나머지는 컴포넌트 안에서 순수 함수로 계산한다 | 모달 본문도 `dongGroups`(다중 개별 표시 정리 effect)와 `subCount`(표 제목)를 쓴다 |

## 검증

| 명령 | 결과 |
|---|---|
| `npx tsc --noEmit` | 오류 0건 |
| `npx eslint . --max-warnings=0` | 오류 0건 |
| `npm test` | 154개 파일 통과, 1개 스킵 / 1,792개 통과, 3개 스킵 (이전 151개 파일, 1,776개에서 파일 +3, 테스트 +16) |
| `npx next build`(임시 distDir, 설정 원복 확인) | 성공. 홈 301 kB, `/gpsmap` 207 kB (직전과 같음) |

- 새 테스트 3개 파일(`capture-guide-state` 4개, `marker-group-view` 5개, `cell-dialog-helpers` 7개)은 모두 모듈이 없을 때 실패하는 것을 먼저 확인한 뒤 구현했다.
- 검토에서 고친 것은 없다. 이동한 본문이 원본과 글자 단위로 같고, 줄바꿈은 파일마다 기존 형식(`kakao-map-canvas`는 CRLF, 모달·일정 대화상자는 LF)을 유지했다.

## 한계

- 홈 번들은 줄지 않았다. 이 작업은 구조 분리이고 번들은 [홈번들점검](../홈번들점검/Ver_3.0_홈번들점검_설계.md)에서 다룬다. 캡처 가이드 훅이 생겨 캡처 UI를 지연 로드할 경계는 더 분명해졌다.
- `.tsx`와 훅 렌더 테스트는 여전히 없다. 지킬 수 있는 것은 순수 함수뿐이다.
- 보류한 것: 정보창 자동 배치 훅(ref 4개와 동기화 effect가 얽힘), 업로드 훅 분할(상태 공유), `CellForm`(상태 18개)의 훅 분리.
