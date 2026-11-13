# 스타일 정리 (설계)

작성일 2026-11-13 · 대상: 앱 전체 화면의 공통 스타일(shadcn/Tailwind) · 구현계획: [Ver_3.0_스타일정리_구현계획.md](Ver_3.0_스타일정리_구현계획.md)

## 1. 배경과 결정 사항

현장실사서 화면을 Astryx로 만든 뒤, 사용자가 unslop 스킬로 **프로젝트 전체의 화면 스타일을 점검**하게 했다. 결과는 "가벼운 슬롭"이었다(중립 색 램프와 라이트/다크는 정돈되어 있고, 그라디언트·글로·이모지·글자 크기 혼용이 남아 있다). 이 문서는 그 신호를 어떻게 정리할지 정한다.

**사용자가 정한 것**

| # | 결정 | 날짜 |
|---|---|---|
| 1 | **점검에서 나온 슬롭만 정리한다.** Astryx로 앱 전체를 갈아타지 않는다. Astryx는 현장실사서에만 남는다 | 2026-11-13 |
| 2 | 계획의 8개 항목과 순서를 승인했다(버튼·글로 → 그라디언트 → 이모지 → 전환 → 자간 → 굵기 → 9·10px → 모서리) | 2026-11-13 |
| 3 | 9·10px 글자 상향은 표가 깨질 수 있어 **별도 단계로 두고 화면별로 사용자가 확인**한다 | 2026-11-13 |
| 4 | 범위 밖: 임의 px 값 455곳, 한글 서체 교체, 상태색, 모달의 `shadow-2xl` | 2026-11-13 |

**설계에서 정한 것(사용자 확인 대상은 §6)**

| # | 결정 |
|---|---|
| 5 | 기본 버튼은 `bg-primary text-primary-foreground hover:bg-primary/90`(브랜드 `--primary` 토큰). 그라디언트·글로를 쓰지 않는다 |
| 6 | 활성·선택 표시는 **헤어라인 테두리 + 표면 한 단계**로 한다. 글로(`shadow-glow`)는 걷어낸다 |
| 7 | 이모지는 **의미가 있으면 lucide 아이콘**, 장식이면 지운다 |
| 8 | 가드 테스트(`src/lib/style-guard.test.ts`) 하나로 모든 항목의 "정리 끝" 범위를 RED→GREEN으로 확인한다 |
| 9 | 가드는 `.ts`와 `.tsx`를 모두 읽는다(카카오 말풍선 HTML 문자열이 `overlay-content.ts`에 있다). 줄 앞이 `//`·`*`인 주석은 건너뛴다 |
| 10 | **날씨 판정 이모지(`VERDICT_ICON`)는 이번 정리에서 예외**다. 작업 가능 여부를 알리는 신호등이라 장식이 아니다. 작은 상태 점 컴포넌트로의 교체는 별도 작업으로 남긴다 |
| 11 | 이모지 규칙은 그림 이모지(`\u{1F300}-\u{1FAFF}`와 `⚠ ⛔ ⭐`)만 대상이다. 기능 기호 `✓ ✕ ★`와 판정 폴백 `⚪`은 규칙 밖이고, 지도 범례 색 사각형 `🟨 🟩`는 같은 색의 작은 점으로 바꾼다 |
| 12 | 가드 규칙 8개 중 `glow`·`gradient`·`emoji`·`transitionAll`·`tracking`은 **영구 규칙**이고, `bold`·`tinyText`·`radius`는 정리가 끝나면 `CLEAN_SCOPES`를 비워 둔다(코드는 남겨 필요하면 다시 켠다). 이 방침을 `AGENTS.md` 코드베이스 메모에 한 줄 적는다 |
| 13 | 커밋은 사용자가 말할 때만 하되, 체크포인트 3곳(구현계획 Task 2·7·10 뒤)에서 묻는다 |

## 2. 확인한 사실

### 2.1 점검 결과

로그인 없이 볼 수 있는 화면은 로그인 화면뿐이었다(`/`, `/gpsmap` 모두 로그인 게이트). 나머지는 코드와 스타일 집계로 점검했다.

| # | 신호 | 위치(개수) |
|---|---|---|
| 1 | 기본 버튼 그라디언트 + 인디고 글로 | `button.tsx:13`, `dialog.tsx:37`, `input.tsx:14`, `map-floating-controls.tsx`(4곳), `markers-list-panel.tsx:123`, `tailwind.config.ts:114-115` |
| 2 | 그라디언트 배너, 그라디언트 글자 | `dashboard-panel.tsx:98`, `roadview-modal.tsx:225` |
| 3 | 이모지 38곳(.tsx 19파일). 이 중 기능 기호 `✓ ✕ ★` 3곳과 판정 폴백 `⚪` 1곳은 정리 대상이 아니고(결정 10·11), `🟨 🟩` 3곳은 점으로 바꾼다. `.ts`의 `overlay-content.ts` 말풍선(`📍` 제목 등)도 포함한다. 가장 많은 곳은 `typhoon-modal.tsx` 14곳 | 계획서 Task 3·4 |
| 4 | `transition-all` 5곳 | `toast.tsx:28`, `account-table-row.tsx:106`, `map-region-capture-panel-view.tsx:263`, `marker-detail-modal.tsx:1378,1386` |
| 5 | 대문자+넓은 자간 라벨 9곳 | `marker-detail-modal.tsx`(6), `marker-edit-modal.tsx`(2), `dropdown-menu.tsx:177` |
| 6 | `font-bold`·`font-extrabold` 29줄(.tsx 20파일, 이 중 `schedule-legend.tsx` 1줄은 예외)과 `overlay-content.ts` 2줄 | 제목(`h1`·`h3`·`DialogTitle`)과 숫자 배지 위주 |
| 7 | 9px 10곳, 10px 128곳(35파일) | 가장 많은 곳은 `marker-detail-modal.tsx` 23곳. `.ts`의 `overlay-content.ts`에 10px 11곳이 따로 있다 |
| 8 | 둥근 모서리 혼용: 단독 `rounded` 약 70곳, `rounded-xl` 24곳 | 전체 |

**없는 것(좋은 점):** 보라 그라디언트, 블롭, `animate-pulse`·`animate-ping`, `hover:scale`, 이탈릭, 인사말 제목, 과장 문구. `animate-spin`은 로딩 표시라 정상이다.

### 2.2 코드에서 확인한 사실

- **글로는 의도된 결정이었다.** `tailwind.config.ts:111` 주석이 "섀도 대신 브랜드 글로우로 엘리베이션 표현(활성·선택·포커스·플로팅 UI, 다크 기본)"이다. Ver 2.1(Calendly 톤 재매핑)에서 정했다. 이번 정리는 **그 결정을 뒤집는다**(결정 6).
- **`indigo`는 100~300만 CSS 변수**(`globals.css:86-88`, `162-164`)이고 400 이상은 Tailwind 기본값이다. 그래서 현재 버튼 그라디언트의 `indigo-500`~`indigo-600`은 기본 팔레트 색이다.
- **브랜드 색은 `--primary`**다(`globals.css:15`, `117`). 글로의 `#3a4cd1`도 이 색이다.
- **둥근 모서리 값**: `rounded-sm` = `calc(var(--radius) - 4px)` = 8px, `rounded-md` = 10px, `rounded-lg` = `--radius` = 12px(`tailwind.config.ts:102-104`). 단독 `rounded`는 Tailwind 기본 4px이고, `rounded-xl`은 Tailwind 기본 12px이라 `rounded-lg`와 **값이 같다**.
- **서체**: `layout.tsx`가 Geist를 불러오지만 본문은 `globals.css:208`의 `ui-sans-serif, system-ui`다. Geist에는 한글이 없어 한글은 시스템 글꼴로 나온다.
- **프로젝트 규칙**: 표는 셀 줄바꿈 금지·가로 스크롤 금지(세로 스크롤만). `Input`·`Textarea`의 `text-slate-100` 하드코딩은 의도적이라 건드리지 않는다. 슬레이트·상태색은 CSS 변수라 컴포넌트에 라이트/다크 분기를 넣지 않는다.

### 2.3 버튼 색 대비 (흰 글자 기준, 계산값)

| 바탕 | 대비 | 4.5 이상 |
|---|---|---|
| 지금 그라디언트 시작 `indigo-500`(#6366f1) | 4.47 | **아니오** |
| 지금 그라디언트 끝 `indigo-600`(#4f46e5) | 6.29 | 예 |
| 라이트 `--primary`(#3b54ce) | 6.28 | 예 |
| 다크 `--primary`(#5168d6) | 4.88 | 예 |
| 다크 `--primary` hover(`/90` 근사, #4159d2) | 5.86 | 예 |

지금 버튼은 그라디언트 위쪽 절반이 기준 미만이다. `--primary`로 바꾸면 라이트·다크 모두 통과한다.

## 3. 목표와 비목표

**목표**
- 점검 신호 8개를 shadcn/Tailwind 안에서 정리한다.
- 항목마다 가드 테스트로 "다시 생기지 않음"을 코드로 지킨다.
- 눈으로만 아는 것(표 폭·모서리 어색함·대비)은 사용자가 확인하는 단계를 둔다.

**비목표**
- Astryx 전환, 새 디자인 시스템 도입, 새 의존성 추가.
- 임의 px 값(455곳) 일괄 교체. 대부분 폭 값이라 위험만 크다.
- 한글 서체 교체(새 폰트 의존성과 전체 글자 폭 변화가 따른다).
- 상태색(rose·amber 등) 정리. 상태 표시라 의미가 있다.
- 모달의 `shadow-2xl`. 떠 있는 창의 중립 그림자는 허용한다.
- 날씨 판정 이모지(`VERDICT_ICON`)의 교체. 대시보드·위험 요약·지도 말풍선이 함께 쓰는 신호라 별도 작업이다(결정 10).

## 4. 설계

### 4.1 방식

공통 컴포넌트부터 고치고 화면으로 퍼진다. 버튼 하나만 고쳐도 전체 화면이 바뀌기 때문이다. 항목마다 **가드 테스트의 정리 범위를 넓히면 RED**가 되어 고칠 곳이 정확히 나오고, 고치면 GREEN이 된다. 각 단계 끝에는 `tsc`·`eslint`·`npm test`를 돌리고 `git status`만 확인한다(커밋하지 않는다).

### 4.2 항목별 규칙

| # | 지금 | 바꿀 것 | 근거 |
|---|---|---|---|
| 1 | 기본 버튼 `bg-gradient-to-b from-indigo-500 to-indigo-600 text-white hover:from-indigo-500 hover:to-indigo-500 hover:shadow-glow` | `bg-primary text-primary-foreground hover:bg-primary/90` | §2.3 대비, 한 가지 단색 |
| 1 | `dialog.tsx`·`input.tsx`·`markers-list-panel.tsx`의 `shadow-glow` | 그 토큰만 지운다. 이미 있는 `border-indigo-500/…` 테두리가 활성 표시를 맡는다 | 결정 6 |
| 1 | `map-floating-controls.tsx` 활성 4곳의 `border-… bg-slate-900/90 … shadow-glow` | `shadow-glow`를 지우고 `bg-slate-800`으로 표면 한 단계를 더한다 | 꺼진 상태와 구분이 글 없이도 되어야 한다 |
| 1 | `tailwind.config.ts`의 `glow`·`glow-sm`, `globals.css:39` 주석 | 쓰는 곳이 없음을 확인한 뒤 지운다 | 죽은 토큰 |
| 2 | 대시보드 위성 버튼 `bg-gradient-to-r from-sky-600/20 to-indigo-600/20` | `bg-sky-600/15`(테두리 `border-sky-500/40` 유지) | 색상 간 그라디언트 금지 |
| 2 | 로드뷰 제목 `bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent` | `text-slate-100 font-semibold` | 그라디언트 글자 금지 |
| 4 | `transition-all` | 일반 요소 `transition-colors`, `toast.tsx` `transition-[transform,opacity]`, 토글 손잡이 `after:transition-transform`, 진행 막대(`map-region-capture-panel-view.tsx:263`)는 **전환 제거** | 너비·레이아웃을 애니메이션하지 않는다 |
| 5 | `uppercase tracking-wider` 라벨 | 둘 다 지우고 `font-medium` | 한글에는 대문자가 없고 넓은 자간만 남는다 |
| 5 | `dropdown-menu.tsx:177` `tracking-widest` | 자간만 지운다 | 단축키 표시 |
| 6 | `font-bold`·`font-extrabold` | `font-semibold`. 로그인 제목은 `font-semibold tracking-tight` | 굵기는 400~600, 위계는 크기와 색으로 |
| 6 | 예외 | `schedule-legend.tsx:28`은 굵은 파란 글자 **자체를 보여 주는 범례**라 가드의 `ALLOW`에 둔다 | 의미가 굵기에 있다 |
| 7 | `text-[9px]`·`text-[10px]` | `text-[11px]` | 11px 아래 글자는 읽기 어렵다 |
| 8 | 단독 `rounded`(4px) | `rounded-sm`(8px) | 컨트롤 모서리 단계 정리 |
| 8 | `rounded-xl`(12px) | `rounded-lg`(12px) | 값이 같아 모양은 그대로, 이름만 하나로 |

### 4.3 이모지 규칙 (항목 3)

의미가 있는 이모지는 lucide 아이콘으로 바꾸고, 장식이면 지운다. 아이콘은 `h-3.5 w-3.5 shrink-0`이고 **옆 글자의 색 클래스를 그대로 따른다**(`text-red-200` 줄의 아이콘은 `text-red-200`).

| 이모지 | 바꿀 것 |
|---|---|
| ⚠️ | `TriangleAlert` |
| ⛔ | `OctagonX` |
| 📋 | `ClipboardList` |
| 📅 | `CalendarDays` |
| 그 밖의 장식 | 지운다 |

**이모지로 세지만 정리 대상이 아닌 것**(코드로 확인): `✓`(체크 상태, `station-suggestion-list.tsx:74`), `✕`(닫기, `map-region-bounds-guide.tsx:430`), `★`(저장한 출발지, `route-origin-picker.tsx:121`)는 기능 기호라 지우면 기능이 깨진다. `⚪`은 판정 폴백이다. `🟨`·`🟩`(`gpsmap-page.tsx:626`, `map-pick-hint.tsx:21`, `vworld-map-pane.tsx:176`)는 지도 종류의 색 범례라 지우지 않고 같은 색의 작은 점(`<span aria-hidden className="inline-block h-2 w-2 rounded-sm bg-yellow-400" />`, 🟩는 `bg-green-500`)으로 바꾼다. `VERDICT_ICON`(`worksite-weather/types/weather.ts`)은 `ALLOW`로 둔다.

태풍 안전 수칙 세 줄(`typhoon-modal.tsx` 408~429행 근처)은 이모지가 위험 수준(금지·주의·절차)을 구분하고 있었다. 번호와 색이 이미 있지만, **아이콘으로도 구분되는지** 사용자가 확인한다(§6).

### 4.4 둥근 모서리의 남는 단계

정리 뒤 사용되는 단계는 `rounded-sm`(8px), `rounded-md`(10px), `rounded-lg`(12px), `rounded-2xl`(16px), `rounded-full`이다. `sm`·`md`·`lg`가 2px 간격으로 가깝다는 한계는 남는다. 값 자체를 합치는 것은 `--radius` 토큰을 건드리는 일이라 범위 밖이다.

### 4.5 가드 테스트 구조

`src/lib/style-guard.test.ts` 하나. 이름과 모양은 구현계획의 Interfaces와 같다.

- `RULES`: 규칙 id 8개(`glow`·`gradient`·`emoji`·`transitionAll`·`tracking`·`bold`·`tinyText`·`radius`)별 정규식과 안내 문구.
- `CLEAN_SCOPES`: 규칙별로 "정리가 끝났다"고 선언한 경로 접두사 목록. 처음엔 모두 비어 있고, 단계가 진행되며 `["src"]`까지 넓어진다.
- `ALLOW`: 의도적으로 남기는 곳(`"경로:규칙"` → 이유). 처음 항목은 둘이다: `schedule-legend.tsx:bold`(범례가 굵은 글자 자체를 보여 준다), `worksite-weather/types/weather.ts:emoji`(`VERDICT_ICON`, 결정 10).
- `scan(rule, scopes)`: `src/**/*.{ts,tsx}`에서 `*.test.*`와 `site-survey`를 뺀 파일을 줄 단위로 읽어 파일·줄·내용을 돌려준다. 앞이 `//`·`/*`·`*`인 주석 줄은 건너뛴다(주석 속 `⛔` 설명을 잡지 않기 위해). `site-survey`를 빼는 이유는 Astryx 화면이라 이 규칙의 대상이 아니기 때문이다.

실패 메시지에 **파일:줄과 안내 문구**를 넣어, RED가 곧 작업 목록이 되게 한다. 규칙 정규식 자체도 예시 문자열로 먼저 테스트한다(`"bg-transparent"`는 `gradient`에 걸리지 않는다 등).

**영구 규칙과 임시 규칙(결정 12).** 가드는 `npm test`에 들어가므로 앞으로 새로 짜는 코드도 이 규칙을 따라야 한다. 안정적인 원칙 5개(`glow`·`gradient`·`emoji`·`transitionAll`·`tracking`)는 그대로 둔다. 취향에 가까운 3개(`bold`·`tinyText`·`radius`)는 정리가 끝난 뒤 구현계획 Task 11에서 `CLEAN_SCOPES`를 `[]`로 비워 더 이상 실패시키지 않는다. 코드와 `ALLOW`는 남겨 두어 필요하면 다시 켠다. 가드가 왜 있는지는 `AGENTS.md`의 "코드베이스 메모"에 한 줄로 적는다.

### 4.6 사용자 확인 절차

제가 직접 볼 수 있는 화면은 로그인 화면뿐이라, 아래는 **사용자가 개발 서버에서 확인**한다. 문제가 있는 화면 이름을 알려 주면 그 화면만 고친다.

| 확인 | 시점 | 무엇을 보나 |
|---|---|---|
| 버튼 대비 | 항목 1 | 라이트 모드의 파란 버튼 글자가 읽히는가 |
| 플로팅 컨트롤 | 항목 1 | 지도 오른쪽 컨트롤 4개의 켜짐/꺼짐이 구분되는가 |
| 태풍 수칙 | 항목 3 | 금지·주의·절차가 아이콘과 색으로 구분되는가 |
| 제목 굵기 | 항목 6 | 로그인·사이드바 제목이 너무 가벼워 보이지 않는가(로그인 화면은 전후 캡처로 비교) |
| 표 폭 | 항목 7 | 마커 상세·편집(사양 목록)·ERP 검토·지도 영역 안내·위성 지도 날씨 말풍선(마커 화면), 대시보드·변환기·CCTV·경로·바코드·그룹 표·계정 표(나머지)가 데스크톱과 모바일 폭에서 줄바꿈·잘림·가로 스크롤 없이 보이는가 |
| 모서리 | 항목 8 | 작은 칩·태그의 모서리가 4px→8px로 커진 것이 어색하지 않은가 |

### 4.7 오류와 예외

| 상황 | 처리 |
|---|---|
| 가드가 실패하는데 의도적으로 남겨야 하는 곳 | `ALLOW`에 `"경로:규칙"`과 이유를 적는다. 이유 없이 넣지 않는다 |
| 글자 상향으로 표 셀이 줄바꿈된다 | 같은 줄의 `gap`·`px`를 한 단계 줄이거나 열 폭 상수를 키운다(표 줄바꿈 금지 규칙이 우선) |
| `tailwind.config.ts`의 `glow`를 지웠는데 쓰는 곳이 남아 있다 | 빌드는 조용히 통과하고 그 클래스만 무시된다. 그래서 가드 `glow`를 먼저 `["src"]`로 넓혀 남은 곳을 잡는다. 가드는 `tailwind.config.ts`·`globals.css`를 읽지 않으므로 Task 1에서 `grep -rn "shadow-glow" src tailwind.config.ts`로 따로 확인한다 |
| 이모지를 지웠더니 줄 정렬이 틀어진다 | 아이콘 `shrink-0`과 기존 `gap`을 그대로 쓴다 |

## 5. 완료 기준

1. 가드 테스트의 규칙 8개가 모두 `CLEAN_SCOPES = ["src"]`로 통과한다(`ALLOW` 예외 제외).
2. `npx tsc --noEmit`, `npx eslint src --max-warnings=0`, `npm test` 통과.
3. 홈 First Load JS **299 kB 이하**(임시 `distDir`로 빌드).
4. 기본 버튼의 흰 글자 대비가 라이트·다크 모두 4.5 이상이다(§2.3).
5. §4.6의 사용자 확인 6가지를 마치고 결과를 구현 문서에 기록한다.
6. 로그인 화면 라이트·다크의 전후 캡처를 비교해 의도하지 않은 변화가 없다.
7. `AGENTS.md` 코드베이스 메모에 가드 한 줄이 있고, `bold`·`tinyText`·`radius`의 `CLEAN_SCOPES`는 비어 있다(결정 12).

## 6. 구현 전에 확인할 것

- **글로를 걷어내는 것**(결정 6)이 맞는지. Ver 2.1의 의도된 디자인이었다. 지도 위 컨트롤에서 활성 표시가 약해 보이면 `ring-1 ring-indigo-400/50`을 더하는 대안이 있다.
- 기본 버튼을 `bg-primary`로 바꾸면 **다크 모드에서 지금보다 약간 밝아진다**(#5168d6 대 그라디언트). 이 정도 차이를 받아들일지.
- 9·10px을 11px로 올릴 때 **어느 화면에서 폭이 부족해지는지는 구현해 봐야 안다.** 문제가 생긴 화면은 그 화면만 예외로 두는 방법도 있다(`ALLOW`).
- 단독 `rounded`(4px)를 8px로 키우는 것(항목 8)이 **작은 배지에서 어색하면**, 그 파일만 4px을 유지하고(`ALLOW`에 `radius`로 기록) 나머지는 그대로 진행한다. 어색한 곳이 많으면 이 항목은 `rounded-xl`→`rounded-lg` 이름 통일만 남기고 단독 `rounded`는 두기로 한다.

## 7. 알려진 한계

- 로그인 뒤 화면은 제가 직접 보지 못한다. 눈으로만 아는 변화는 §4.6의 사용자 확인에 의존한다.
- 가드는 **클래스 글자**만 잡는다. 인라인 `style`이나 CSS 파일의 값, `cn()`으로 조합되는 동적 클래스는 못 잡는다.
- 가드는 `.css`와 설정 파일(`tailwind.config.ts`)을 읽지 않는다. `.ts`는 읽지만 줄 끝에서 합쳐지는 문자열 조각(`"text-" + size`)은 못 잡는다.
- 모서리는 `sm`·`md`·`lg`가 가까운 단계로 남는다(§4.4).
- 한글 서체는 Geist에 한글이 없어 시스템 글꼴로 나오는 상태가 그대로다(범위 밖).

## 8. 검증 기록

### 8.1 설계 단계 사전 검증 (2026-11-13)

점검 집계와 §2.3 대비 계산을 이 날 스크립트로 확인했다. 점검은 `/`·`/gpsmap` 로그인 화면(라이트·다크)을 개발 서버로 캡처했고, 나머지 화면은 코드로 확인했다.

### 8.2 구현 후

구현 완료(2026-11-13): 가드 8개 규칙 통과, `tsc`·`eslint`·`vitest` 1687개 통과, 홈 First Load JS 298 kB. 로그인 화면 전후 캡처를 비교해 로그인 버튼의 기존 버그(그라디언트가 `bg-slate-800`을 덮어 파란 바탕에 회색 글자로 보임)가 해소된 것을 확인했다. §4.6의 사용자 확인 6가지는 **로그인 뒤 화면이라 아직 하지 못했고** 사용자 확인 뒤 여기에 적는다. 상세는 [구현 문서](Ver_3.0_스타일정리_구현.md).
