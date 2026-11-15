# 홈 번들 점검 (구현)

구현일 2026-11-15 · 설계: [Ver_3.0_홈번들점검_설계.md](Ver_3.0_홈번들점검_설계.md) · 계획: [Ver_3.0_홈번들점검_구현계획.md](Ver_3.0_홈번들점검_구현계획.md)

홈(`/`) First Load JS를 모듈 단위로 측정하고, 영역 캡처 UI를 지연 로드해 **301 kB → 282 kB**로 줄였다. AGENTS.md의 기준(295 kB 이하)을 다시 충족한다. 측정은 agy가 하고 Claude가 수치를 검증했으며, 코드 변경은 agy가 하고 Claude가 diff를 검토했다.

## 직접 하실 일

1. **영역 캡처를 한 번 써 본다.** 캡처 시작 → 영역 드래그 → 캡처 가이드와 타일 → 타일 제외 → 닫기. 지연 로드로 바뀌었으므로 **처음 누를 때 UI가 늦게 뜨지 않는지** 본다(영역을 드래그하는 동안 미리 받아 두게 했다). 로컬 개발 서버(Turbopack)는 프로덕션과 청크 방식이 달라 체감이 다를 수 있다. 배포본에서 한 번 더 확인하면 가장 정확하다.
2. 이상이 없으면 "커밋"이라고 말씀해 주세요.
3. 결정이 필요한 것은 없다. 아래 "결정"의 두 항목을 추천안으로 정했으니, 다르게 하고 싶으면 알려 달라.

## 측정 결과 (소스맵 집계, 변경 전 301 kB)

홈 페이지 청크 11개의 gzip 합 294.6 kB(Claude 별도 측정 294.1 kB, +0.2%)를 소스맵으로 분해했다. 모듈별 gzip은 청크의 `gzip/raw` 비율을 모듈 raw 비율에 곱한 환산값이다(`source-map-explorer`가 Next 소스맵에서 오류가 나 직접 집계 스크립트를 썼다).

| 패키지 | gzip kB |
|---|---:|
| 프로젝트 소스 | 71.6 |
| `react-dom` | 54.2 |
| `@supabase/*` | 53.0 |
| `next` | 36.2 |
| 그 밖 | 30.9 |
| `@radix-ui/*` | 24.7 |
| `react` | 8.2 |
| `@tanstack/*` | 7.7 |
| `lucide-react` | 4.9 |
| `ts-pattern` · `zustand` | 3.2 |

- `@supabase/*` 53 kB 중 `auth-js` 23.6 kB와 `postgrest-js` 4.4 kB가 실제로 쓰인다. **`realtime-js` 8.6 + `phoenix` 7.0 + `storage-js` 6.0 + `functions-js` 0.8 = 약 22.4 kB는 쓰이지 않는데 묶여 있다.**
- 영역 캡처 관련 모듈 12개가 모두 홈 청크에 있었고 합 10.3 kB였다. 상위 프로젝트 소스는 `kakao-map-canvas` 5.2, `use-excel-upload-actions` 4.2, `overlay-content` 4.1 kB 순이다.

## 한 일

`kakao-map-canvas.tsx` 한 파일을 바꿨다.

- `MapRegionSelectOverlay`·`MapRegionBoundsGuide`·`MapRegionCapturePanel`을 정적 import 대신 `dynamic(..., { ssr: false })`로 불러온다. 렌더 조건·props·문구는 그대로다.
- 캔버스가 쓰는 `screenRectToMapBounds`를 barrel(`map-capture-stitch/index`) 대신 정의 파일(`map-capture-stitch/bounds`)에서 직접 import해서 다른 캡처 모듈이 홈 청크에 딸려 오지 않게 했다.
- 캡처 시작 버튼 핸들러에서 패널과 가이드 청크를 미리 받는다(`void import(...)`). 사용자가 영역을 드래그하는 동안 받아 두는 용도다.
- 캔버스 밖에서 이 컴포넌트나 캡처 라이브러리를 홈 경로에 정적으로 끌어오는 곳이 없음을 `grep`으로 확인했다(`use-kakao-capture-guide.ts`는 타입만, `capture.ts`는 `import()`만 쓴다).

## 결과

| 경로 | 변경 전 | 변경 후 |
|---|---:|---:|
| `/` First Load JS | 301 kB | **282 kB** (−19 kB) |
| `/` 페이지 자체 | 100 kB | 82.1 kB |
| `/gpsmap` | 207 kB | 207 kB |
| 홈 청크 gzip 합 | 294.6 kB | 276.5 kB |

절감이 측정으로 본 모듈 합(10.3 kB)보다 큰 것은, 캡처 모듈만 분리한 것이 아니라 그 모듈들만 쓰던 다른 코드(`map-viewport-capture` 안쪽의 이미지 합성·타일 계획 등)까지 함께 빠졌기 때문으로 보인다. 정확한 내역은 다시 분해하지 않았다.

## 결정 (Claude가 추천안으로 정함)

| # | 결정 | 이유 |
|---|---|---|
| 1 | 목표는 **295 kB로 되돌리기**로 하고 기준선을 바꾸지 않는다 | L2만으로 282 kB가 되어 기준 안에 13 kB 여유가 생겼다. 기준 변경이 필요 없다 |
| 2 | **L1(Supabase 미사용 모듈 제거)은 하지 않는다** | 22 kB를 줄일 수 있으나 `supabase-js` 내부 구조(realtime·storage 생성)에 기대는 방식(별칭 치환 또는 클라이언트 직접 조립)이라, 버전 업그레이드 때 깨질 위험이 있다. 기준을 충족한 지금은 이득이 위험보다 작다. 기준을 다시 넘게 되면 이 측정을 근거로 검토한다 |

## 계획과 다르게 한 것

| # | 계획 | 한 것 | 이유 |
|---|---|---|---|
| 1 | 캡처 UI 진입 컴포넌트 `map-region-capture-root.tsx`를 만들어 한 번에 받는다 | 만들지 않고 컴포넌트 3개를 각각 `dynamic()`으로 불러온다 | 각 UI가 서로 다른 시점(영역 선택 / 가이드 / 패널)에 필요해서 묶으면 처음에 불필요한 것까지 받는다. 코드도 더 단순하다 |
| 2 | 마우스를 올릴 때 미리 받기(선택) | 캡처 시작 핸들러에서 미리 받는다 | 시작 직후 사용자가 영역을 드래그하는 시간 동안 받을 수 있다 |

## 검증

| 명령 | 결과 |
|---|---|
| `npx tsc --noEmit` | 오류 0건 |
| `npx eslint . --max-warnings=0` | 오류 0건 |
| `npm test` | 154개 파일 통과, 1개 스킵 / 1,792개 통과, 3개 스킵 |
| `npx next build`(임시 distDir, 설정 원복 확인) | 성공. 홈 282 kB, `/gpsmap` 207 kB |

측정 빌드 뒤 `next.config.ts`·`tsconfig.json`·`next-env.d.ts`가 원복됐고 `git status`에 나타나지 않는다.

## 한계

- 지연 로드된 캡처 UI는 첫 사용 때 청크를 받는 시간이 필요하다. 자동 테스트로는 지킬 수 없다(위 화면 확인).
- 모듈별 gzip은 환산값이라 ±수 % 오차가 있다. 합계는 실제 gzip 합과 0.2% 안에서 맞았다.
- `use-excel-upload-actions`(4.2 kB)와 사이드바 엑셀 섹션들도 홈 청크에 정적으로 있다. 기준을 다시 넘으면 다음 후보다(이번에는 하지 않았다).
