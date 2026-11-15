# 번들 · 죽은 코드 · 문서 정리 (구현)

구현일 2026-11-14 · 설계: [Ver_3.0_번들문서정리_설계.md](Ver_3.0_번들문서정리_설계.md) · 계획: [Ver_3.0_번들문서정리_구현계획.md](Ver_3.0_번들문서정리_구현계획.md)

`xlsx`·`VworldMapPane` 동적 import 전환, `app-shell.tsx` 조건부 선로딩, 미사용 파일 2종 삭제, 중복 유틸 2종 통합, 그리고 `AGENTS.md`·`supabase/migrations/README.md` 동기화를 마쳤다. **커밋하지 않았다.**

## 직접 하실 일

1. `/gpsmap`에서 주소를 조회해 하단 지적도가 같은 위치로 이동하고 필지가 그려지는지 눈으로 확인해 주세요.
2. 일정 가져오기(엑셀)와 바코드 > 재고 엑셀 조회가 정상 동작하는지 확인해 주세요.
3. 변경 내용을 확인한 뒤 커밋을 요청해 주세요(커밋은 사용자가 말할 때만 진행).

## 한 일

| # | 항목 | 변경 |
|---|---|---|
| 1 | `xlsx` 동적 import | `src/features/barcode/lib/lookup-excel.ts`·`src/features/schedule/lib/read-schedule.ts`가 호출 시점 `await import("xlsx")`를 쓰도록 전환(`read-schedule.ts`는 `import type` + 순수 `encodeA1Cell(rowIndex, colIndex)` 추가, `buildFillAt` 시그니처 유지) |
| 2 | `VworldMapPane` 지연 로드 | `src/features/gpsmap/components/gpsmap-page.tsx`의 `VworldMapPane`을 `dynamic(..., { ssr: false })`로 전환 |
| 3 | 조건부 선로딩 | `src/features/shell/components/app-shell.tsx` 선로딩을 로그인(`authed`) 후에만 실행하고, `group-panel`은 `isAdmin`일 때만 선로딩 |
| 4 | 중복 유틸 통합 | `leafletZoomFromKakaoLevel`·`kakaoLevelFromLeafletZoom`을 `src/features/gpsmap/lib/coords.ts`로 통합(`vworld-pane-overlay.tsx`·`gpsmap-page.tsx` 중복 제거). `extractBearerToken(request: Request)`를 `src/lib/api/verify-auth-token.ts`에서 export하고 `src/features/accounts/server/admin-auth.ts`가 이를 사용(`admin-auth.test.ts` 해당 테스트는 `verify-auth-token.test.ts`로 이동) |
| 5 | 미사용 파일 정리 | 참조 0건 재확인 후 `src/features/schedule/lib/day-table-widths.ts`, `src/features/shell/components/coming-soon.tsx` 삭제. `src/features/worksite-weather/lib/export-tbm.ts`는 보존 |
| 6 | 문서 동기화 | `AGENTS.md` `features:` 목록에 `accounts`·`barcode`·`route`·`site-survey` 추가, `supabase/migrations/README.md` 실행 순서·하단 표를 12개 파일 기준으로 동기화 |

## 번들 실측 (임시 `distDir` 빌드, 설정 원복 확인)

| 경로 | 변경 전 First Load JS | 변경 후 First Load JS | 증감 |
|---|---|---|---|
| `/` | 299 kB | 300 kB | +1 kB |
| `/gpsmap` | 207 kB | 207 kB | 0 kB |

- First Load JS 수치는 개선되지 않았다(홈 +1 kB는 청크 분할 오차 범위로 추정, 원인 미확인).
- 홈(`/`)은 변경 전부터 `AGENTS.md` 기준선(295 kB 이하)을 이미 넘어 있었다(299 kB, 이번 작업과 무관하며 작업 폴더에 커밋되지 않은 다른 변경이 섞여 있을 수 있음).

## 검증 (2026-11-14)

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | 오류 0건 |
| `npx eslint . --max-warnings=0` | 오류 0건 |
| `npm test` | 148 파일 통과(1 스킵), 1745 테스트 통과(3 스킵) |
| 신규·추가 테스트 | `barcode/lib/lookup-excel.test.ts`(3, 변경 전 통과 특성화), `coords.test.ts`(+6), `verify-auth-token.test.ts`(+2), `read-schedule.test.ts`(+3 `encodeA1Cell`) — `lookup-excel` 제외 구현 전 RED 확인 |

## 한계와 남은 위험

- `/gpsmap`에서 `VworldMapPane` 동적 청크가 로드되기 전에 주소 조회 결과가 도착하면 `vworldRef`가 `null`이라 지적도 이동이 한 번 건너뛰어질 수 있다(패널이 항상 마운트돼 있어 실제 발생 확률은 낮으며, 위 `직접 하실 일` 1번에서 브라우저 수동 확인 필요).
- `xlsx`와 `exceljs`의 단일 라이브러리 통합은 범위 밖으로 남겼다.
- `src/features/worksite-weather/lib/export-tbm.ts`는 복원/삭제 결정 대기 상태로 유지했다.
