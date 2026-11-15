# 업로드 훅 분할 회귀 수정 (구현)

구현일 2026-11-15 · 설계: [Ver_3.0_회귀수정_설계.md](Ver_3.0_회귀수정_설계.md) · 계획: [Ver_3.0_회귀수정_구현계획.md](Ver_3.0_회귀수정_구현계획.md)

업로드 훅 분할이 만든 `formatDateToYmd` 호출 회귀(시설일·개통일이 있는 장비 저장 시 `TypeError`)를 고치고, 같은 실수가 구조적으로 나지 않게 `date-utils.ts`의 두 함수를 `this`에 의존하지 않는 독립 함수로 바꿨다. 구현은 agy가 하고 Claude가 diff를 검토했다.

## 직접 하실 일

1. **엑셀 업로드 화면을 확인한다.** 시설코드와 시설일·개통일이 있는 장비를 올려 [전체 전송]과 개별 등록이 오류 없이 저장되고, 상세 창의 시설일·개통일이 `yyyy-mm-dd`로 보이는지 본다.
2. 이상이 없으면 "커밋"이라고 말씀해 주세요.

## 한 일

| 대상 | 내용 |
|---|---|
| `lib/excel/data-manager/date-utils.ts` | `isValidDateRange`, `formatDateToYmd`를 독립 `export function`으로 바꿨다. 본문은 `this.`를 지운 것 외에 같다. `dateUtilMethods`는 `{ isValidDateRange, formatDateToYmd }`로 유지해 `index.ts`의 매니저 펼침과 `headers`·`info-records`·`parse`의 `this.formatDateToYmd` 호출이 그대로 동작한다 |
| `hooks/use-excel-upload-actions.ts` | 두 저장 함수(`submitPendingMarkers`, `submitSinglePendingMarker`)의 매니저 동적 import를 없애고(이 날짜 변환에만 쓰였다) `formatDateToYmd`를 직접 import한다. 이전 수정의 임시 래퍼와 주석은 지웠다 |
| `data-manager.test.ts` | 독립 함수를 **떼어 불러도** 변환되는 테스트를 추가했다(`"20260101"`, `Date`, 없는 날짜, 매니저에서 구조 분해한 함수) |
| `excel-upload-runners.test.ts` | "메서드를 그대로 넘기면 오류가 난다"를 "떼어 넘겨도 날짜가 변환된다"로 바꿨다(전제가 사라졌다) |

## 확인한 것

- 새 테스트는 구현 전에 `TypeError: formatDateToYmd is not a function`으로 실패했고 구현 후 통과했다.
- Claude가 공백을 무시한 diff(`git diff -w`)로 `date-utils.ts`를 대조해, 바뀐 것은 `this.` 제거와 함수 선언 형태뿐임을 확인했다.
- `this.`는 `date-utils.ts`에 0건이고, `MapMarkerExcelManager`의 메서드를 호출하지 않고 떼어 쓰는 참조도 0건이다.

## 검증

| 명령 | 결과 |
|---|---|
| `npx tsc --noEmit` | 오류 0건 |
| `npx eslint . --max-warnings=0` | 오류 0건 |
| `npm test` | 154개 파일 통과, 1개 스킵 / 1,797개 통과, 3개 스킵 |

## 한계

- 매니저의 나머지 `this` 의존(`export`·`headers`·`info-records`·`parse`, 총 35곳)과 `Record<string, any>` 타입은 그대로다. 메서드를 떼어 쓰면 같은 종류의 오류가 날 수 있다. 매니저를 모듈 함수 모음으로 바꾸는 것은 별도 작업이다(설계 §4).
- 훅 안의 호출부는 여전히 훅 렌더 테스트가 없어 화면 확인에 의존한다.
