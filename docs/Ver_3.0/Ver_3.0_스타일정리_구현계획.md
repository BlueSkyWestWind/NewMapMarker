# 스타일 정리 (unslop 점검) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** unslop 점검(2026-11-13)에서 나온 슬롭 신호를 shadcn/Tailwind 안에서 정리한다. Astryx로 갈아타지 않는다(현장실사서만 Astryx로 남는다).

**Architecture:** 공통 컴포넌트(`button`·`dialog`·`input`)부터 고치고 화면으로 퍼진다. 모든 항목은 **스타일 가드 테스트**(`src/lib/style-guard.test.ts`) 하나로 묶어, 항목마다 "정리가 끝난 범위"(`CLEAN_SCOPES`)를 넓혀 가며 RED→GREEN으로 확인한다. 눈으로만 알 수 있는 것(표 폭·대비)은 **사용자 확인 단계**를 둔다.

**Tech Stack:** Next.js 15 · Tailwind v3 · shadcn/ui · lucide-react · vitest. 의존성 추가 없음.

**Spec:** [Ver_3.0_스타일정리_설계.md](Ver_3.0_스타일정리_설계.md) (범위: 점검에서 나온 슬롭만, 한글 서체·임의 px·상태색·모달 그림자는 범위 밖).

## 점검 결과 (근거)

가벼운 슬롭(Light). 중립 램프·라이트/다크는 정돈되어 있고, 보라 그라디언트·블롭·`animate-pulse`·`hover:scale`·이탈릭은 없다. 아래만 남아 있다. 로그인 없이 볼 수 있는 화면은 로그인 화면뿐이라 나머지는 코드로 점검했다.

| # | 신호 | 위치(개수) |
|---|---|---|
| 1 | 기본 버튼 그라디언트 + 인디고 글로 | `button.tsx:13`, `dialog.tsx:37`, `input.tsx:14`, `map-floating-controls.tsx`(4), `markers-list-panel.tsx:123`, `tailwind.config.ts:114-115` |
| 2 | 그라디언트 배너·그라디언트 글자 | `dashboard-panel.tsx:98`, `roadview-modal.tsx:225` |
| 3 | 이모지 38곳(.tsx 19파일) 중 기능 기호 `✓ ✕ ★` 3곳과 판정 폴백 `⚪` 1곳은 제외, `🟨 🟩` 3곳은 점으로 교체, `.ts`의 `overlay-content.ts` 말풍선도 포함. 가장 많은 곳은 `typhoon-modal.tsx` 14 | 아래 Task 3·4 |
| 4 | `transition-all` 5곳 | `toast.tsx:28`, `account-table-row.tsx:106`, `map-region-capture-panel-view.tsx:263`, `marker-detail-modal.tsx:1378,1386` |
| 5 | 대문자+넓은 자간 라벨 9곳 | `marker-detail-modal.tsx`(6), `marker-edit-modal.tsx`(2), `dropdown-menu.tsx:177` |
| 6 | `font-bold`·`font-extrabold` 29줄(.tsx 20파일, `schedule-legend` 1줄은 예외)과 `overlay-content.ts` 2줄 | 제목(`h1`·`h3`·`DialogTitle`)과 숫자 배지 위주 |
| 7 | 9px(10곳)·10px(128곳) 글자 | 35파일, 가장 많은 곳은 `marker-detail-modal.tsx` 23 |
| 8 | 둥근 모서리 혼용(기본 `rounded`=4px 약 70곳, `rounded-xl`=12px로 `rounded-lg`와 값이 같음) | 전체 |

**범위 밖(보고만):** 임의 px 값 455곳(대부분 폭), 한글 서체(Geist는 한글이 없어 시스템 글꼴로 나옴), 상태색(rose·amber 등), 모달의 `shadow-2xl`.

## Global Constraints

- **커밋하지 않는다.** 이 프로젝트는 사용자가 "커밋"이라고 할 때만 커밋한다. 각 Task 끝에는 `git status` 확인만 한다.
- 패키지 매니저 npm. shadcn 컴포넌트 추가가 필요해도 **설치 명령만 알려 주고** 실행은 사용자가 한다(이번 계획에는 필요 없다).
- **표는 셀 줄바꿈 금지·가로 스크롤 금지**(세로 스크롤만). 글자를 키우는 Task 8·9는 이 규칙을 깨지 않아야 한다.
- 슬레이트·상태색은 CSS 변수라 컴포넌트에 라이트/다크 분기를 넣지 않는다. `Input`·`Textarea`의 `text-slate-100` 하드코딩은 의도적이라 건드리지 않는다.
- 아이콘은 `lucide-react`, 크기는 `h-3.5 w-3.5 shrink-0`, 색은 옆 글자의 색을 따른다.
- 소스 파일은 UTF-8, 한글이 깨지지 않았는지 확인한다. 읽은 줄바꿈(LF/CRLF)을 그대로 지킨다.
- 개발 서버가 떠 있으면 `next build`를 하지 않는다(임시 `distDir`로 빌드, 설정 원복).
- 검증 명령: `npx tsc --noEmit` · `npx eslint src --max-warnings=0` · `npm test`. 홈 First Load JS는 **299 kB에서 늘리지 않는다**.
- **Ver 2.1 결정을 뒤집는다**: `tailwind.config.ts:111` 주석 "섀도 대신 브랜드 글로우로 엘리베이션 표현"은 의도된 디자인 결정이었다. 사용자가 이번 점검 범위로 승인했으므로 글로우를 걷어내고, 활성·선택 표시는 **헤어라인 테두리와 표면 한 단계**로 한다.

- **가드는 `.ts`와 `.tsx`를 읽는다**(`overlay-content.ts`의 카카오 말풍선 HTML 때문). 주석 줄은 건너뛴다. `tailwind.config.ts`·`globals.css`는 읽지 않으므로 Task 1에서 `grep`으로 따로 확인한다.
- **날씨 판정 이모지(`VERDICT_ICON`)는 예외**(`ALLOW`). 기능 기호 `✓ ✕ ★`와 판정 폴백 `⚪`은 이모지 규칙 밖이다.
- **영구 규칙 5개**(`glow`·`gradient`·`emoji`·`transitionAll`·`tracking`)와 **임시 규칙 3개**(`bold`·`tinyText`·`radius`): 임시 규칙은 Task 11에서 `CLEAN_SCOPES`를 비운다.
- **커밋 체크포인트 3곳**: Task 2 뒤, Task 7 뒤, Task 10 뒤에 "여기서 커밋하시겠어요?"라고 묻는다. 실제 커밋은 사용자가 "커밋"이라고 할 때만 한다.

## Review Focus

설계가 말하지 않지만 실제 화면에서 걸릴 것들이다. 각 줄의 확인은 해당 Task에 들어 있다.

1. **글자 상향으로 표가 깨진다**(셀 줄바꿈·가로 스크롤 금지 규칙): 10px→11px로 폭이 늘어난다. → Task 8·9의 사용자 확인
2. **지도 위 플로팅 컨트롤의 활성 표시가 글로 없이 구분되지 않는다**: 4곳이 `shadow-glow`로 활성을 보였다. → Task 1
3. **기본 버튼 대비**: 흰 글자가 라이트·다크 모두 4.5:1 이상이어야 한다(`--primary` 기준 6.28·4.88로 계산 확인). 다크에서 지금보다 약간 밝아진다. → Task 1
4. **이모지를 지우면 ⛔·⚠️·📋의 의미 구분이 사라진다**(태풍 안전 수칙 목록). → Task 3
5. **모바일 폭에서 글자 상향으로 넘친다**(모바일 셸·바텀 시트). → Task 8·9의 사용자 확인

---

## 파일 구조

| 파일 | 책임 | Task |
|---|---|---|
| `src/lib/style-guard.test.ts` | 금지 패턴 가드(규칙 정의 + 정리된 범위 + 예외) | 0 |
| `src/components/ui/{button,dialog,input}.tsx`, `tailwind.config.ts`, `src/app/globals.css` | 글로우·그라디언트 걷기 | 1 |
| 수정: 위 점검표의 각 화면 파일 | 항목별 정리 | 2~10 |
| `docs/Ver_3.0/Ver_3.0_계획.md`, `Ver_3.0_스타일정리_구현.md` | 문서 | 11 |

## Interfaces (Task 0이 정의하고 이후 Task가 쓰는 이름)

```ts
// src/lib/style-guard.test.ts 안의 상수(테스트 파일 전용, 다른 파일이 import하지 않는다)
type RuleId = "glow" | "gradient" | "emoji" | "transitionAll" | "tracking" | "bold" | "tinyText" | "radius";
const RULES: Record<RuleId, { pattern: RegExp; hint: string }>;
/** 규칙별로 "이미 정리가 끝났다"고 선언한 경로 접두사. Task가 진행되며 넓어진다 */
const CLEAN_SCOPES: Record<RuleId, string[]>;
/** 의도적으로 남기는 곳: "경로:규칙" → 이유 */
const ALLOW: Record<string, string>; // 처음 항목: "src/features/schedule/components/schedule-legend.tsx:bold", "src/features/worksite-weather/types/weather.ts:emoji"
function scan(rule: RuleId, scopes: string[]): { file: string; line: number; text: string }[];
```

---

### Task 0: 스타일 가드 테스트

**Files:**
- Create: `src/lib/style-guard.test.ts`

**Interfaces:**
- Produces: 위 Interfaces의 `RULES`·`CLEAN_SCOPES`·`ALLOW`·`scan`. 처음에는 `CLEAN_SCOPES`의 모든 규칙이 빈 배열이다.

- [ ] **Step 1: 실패하는 테스트 작성** — 파일이 없으니 규칙 자체를 검증하는 테스트부터 쓴다
  - `RULES.glow.pattern`이 `"hover:shadow-glow"`, `"shadow-glow-sm"`을 잡고 `"shadow-lg"`는 잡지 않는다.
  - `gradient`: `"bg-gradient-to-b"`, `"bg-clip-text"`, `"text-transparent"`를 잡는다. `"bg-transparent"`는 잡지 않는다.
  - `emoji`: `"⚠️ 경고"`, `"📅 일정"`, `"⛔ 금지"`, `"🟨 지도"`를 잡고 `"경고"`, `"✓"`, `"✕"`, `"★"`, `"⚪"`는 잡지 않는다(범위 `/[\u{1F300}-\u{1FAFF}\u26A0\u26D4\u2B50]/u`).
  - 주석 줄 판정: 같은 파일의 `isCommentLine(line: string): boolean`이 `"// ⛔ 주석"`, `" * ⚠️ 설명"`, `"/* 설명 */"`은 true, `"const a = \"⛔\""`는 false다.
  - `transitionAll`: `"transition-all"`을 잡고 `"transition-colors"`는 잡지 않는다.
  - `tracking`: `"uppercase"`, `"tracking-wider"`, `"tracking-widest"`를 잡고 `"tracking-tight"`는 잡지 않는다.
  - `bold`: `"font-bold"`, `"font-extrabold"`, `"font-black"`을 잡고 `"font-semibold"`는 잡지 않는다.
  - `tinyText`: `"text-[9px]"`, `"text-[10px]"`를 잡고 `"text-[11px]"`는 잡지 않는다.
  - `radius`: 단독 `rounded`(뒤에 `-`나 글자가 이어지지 않음)와 `rounded-xl`을 잡고 `rounded-md`·`rounded-lg`·`rounded-full`은 잡지 않는다.
  - `scan("glow", ["src/features/site-survey"])`는 빈 배열(Astryx 화면에는 해당 없음).
  - 정리된 범위 검사: `for (const rule of Object.keys(CLEAN_SCOPES))`에 대해 `scan(rule, CLEAN_SCOPES[rule])`가 `[]`다. **실패 메시지에 파일:줄과 `hint`를 넣는다.**
- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/lib/style-guard.test.ts` → 실패(`scan` 미정의). 
- [ ] **Step 3: 구현** — `scan`은 `src/**/*.{ts,tsx}`에서 `*.test.*`와 `site-survey`를 뺀 파일을 줄 단위로 읽고 `isCommentLine`인 줄은 건너뛴다(`node:fs`, 동기, 파일 목록과 내용은 한 번만 읽어 규칙 8개가 공유한다). `ALLOW`는 위 Interfaces의 두 항목으로 시작한다.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS(모든 `CLEAN_SCOPES`가 비어 있어 본 검사는 통과).
- [ ] **Step 5:** `git status`로 새 파일 하나만 늘었는지 확인.

---

### Task 1: 버튼·글로우 걷기 (항목 1)

**Files:**
- Modify: `src/components/ui/button.tsx:13`, `src/components/ui/dialog.tsx:37`, `src/components/ui/input.tsx:14`, `src/features/map-marker/components/map/map-floating-controls.tsx`(152·167·188·207행), `src/features/map-marker/components/sidebar/markers-list-panel.tsx:123`, `tailwind.config.ts:111-115`, `src/app/globals.css:39`
- Test: `src/lib/style-guard.test.ts`

**Interfaces:** Consumes Task 0의 `CLEAN_SCOPES`. Produces 없음.

- [ ] **Step 1: 가드 확장(RED)** — `CLEAN_SCOPES.glow = ["src"]`. 실행하면 위 8곳이 실패 메시지로 나온다.
- [ ] **Step 2: 구현**
  - `button.tsx` 기본(`default`) 변형을 브랜드 토큰 단색으로: `bg-primary text-primary-foreground hover:bg-primary/90`(그라디언트·`hover:shadow-glow` 제거). 흰 글자 대비는 라이트 6.28, 다크 4.88로 둘 다 4.5 이상이다(설계 §2.3). 지금 그라디언트 시작색 `indigo-500`은 4.47로 기준 미만이다. 다른 변형은 그대로.
  - `dialog.tsx`·`input.tsx`·`markers-list-panel.tsx`·`map-floating-controls.tsx`: `shadow-glow` 토큰만 지운다. 이미 있는 `border-indigo-500/…` 테두리가 활성 표시를 맡는다. 플로팅 컨트롤 활성 상태(4곳)에는 `bg-slate-800`을 더해 표면 한 단계로 구분한다.
  - `tailwind.config.ts`: `glow`·`glow-sm` 항목과 위 주석을 지운다(쓰는 곳이 없음을 `grep -rn "shadow-glow" src`로 확인). `globals.css:39` 주석에서 `shadow-glow` 언급을 고친다.
- [ ] **Step 3: 통과 확인** — `npx vitest run src/lib/style-guard.test.ts` PASS, `npx tsc --noEmit`, `npx eslint src --max-warnings=0`.
- [ ] **Step 4: 사용자 확인(Review Focus 2·3)** — 개발 서버에서 ① 라이트 모드의 파란 버튼 글자가 읽히는지 ② 지도 오른쪽의 플로팅 컨트롤 4개가 켜졌을 때와 꺼졌을 때 구분되는지.
- [ ] **Step 5:** `git status` 확인.

---

### Task 2: 그라디언트 배너·글자 (항목 2) — **[커밋 체크포인트 1]**

**Files:**
- Modify: `src/features/dashboard/components/dashboard-panel.tsx:98`, `src/features/map-marker/components/modals/roadview-modal.tsx:225`
- Test: `src/lib/style-guard.test.ts`

- [ ] **Step 1: 가드 확장(RED)** — `CLEAN_SCOPES.gradient = ["src"]` → 위 두 곳이 실패.
- [ ] **Step 2: 구현** — 대시보드 위성 버튼: `bg-gradient-to-r from-sky-600/20 to-indigo-600/20`을 `bg-sky-600/15`로(테두리 `border-sky-500/40`은 유지). 로드뷰 제목: `bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent`를 지우고 `text-slate-100 font-semibold`.
- [ ] **Step 3: 통과 확인** — 가드·`tsc`·`eslint` 통과.
- [ ] **Step 4:** `git status` 확인.

---

### Task 3: 이모지 정리 A — 작업 안전 날씨 (항목 3)

**Files:**
- Modify: `src/features/worksite-weather/components/typhoon-modal.tsx`(14곳), `typhoon-banner.tsx`(2). `hazard-summary-list.tsx`의 `⚪`는 판정 폴백이라 대상이 아니다
- Test: `src/lib/style-guard.test.ts`

- [ ] **Step 1: 가드 확장(RED)** — `CLEAN_SCOPES.emoji = ["src/features/worksite-weather"]` → 16곳이 실패.
- [ ] **Step 2: 구현** — 의미를 담은 이모지는 lucide 아이콘으로, 장식은 지운다: ⛔→`OctagonX`, ⚠️→`TriangleAlert`, 📋→`ClipboardList`. 아이콘은 `h-3.5 w-3.5 shrink-0`이고 옆 글자의 색 클래스를 그대로 따른다(`text-red-200` 줄의 아이콘은 `text-red-200`). 태풍 수칙 목록 세 줄(`typhoon-modal.tsx` 408~429행 근처)은 번호(`1.`·`2.`·`3.`)와 색이 이미 있으므로 **아이콘으로 위험 수준(금지/주의/절차)이 구분되는지** 확인한다(Review Focus 4).
- [ ] **Step 3: 통과 확인** — 가드·`tsc`·`eslint` 통과.
- [ ] **Step 4: 사용자 확인** — 태풍 정보 창에서 세 수칙이 구분되는지.
- [ ] **Step 5:** `git status` 확인.

### Task 4: 이모지 정리 B — 나머지 (항목 3)

**Files:** Modify 이모지 약 18곳(13개 파일)과 `.ts` 1곳. 기능 기호(`✓` `station-suggestion-list.tsx:74`, `✕` `map-region-bounds-guide.tsx:430`, `★` `route-origin-picker.tsx:121`)는 대상이 아니다. 개수는 괄호 안.
`map-marker/lib/overlay-content.ts`(`📍 이 위치 주소` 제목, 678행. `✕` 닫기와 `⚪` 판정 폴백은 유지),
`gpsmap/components/{map-pick-hint(3), gpsmap-page(2), vworld-map-pane(1)}`, `cctv/components/{cctv-panel(2), cctv-survey-summary(1)}`, `dashboard/components/{dashboard-panel(2), schedule-worksite-notice(1), worksite-row(1)}`, `accounts/components/{account-delete-dialog(1), accounts-panel(1)}`, `schedule/components/{schedule-freeze-dialog(1), schedule-grid(1), schedule-month-grid(1)}`

- [ ] **Step 1: 가드 확장(RED)** — `CLEAN_SCOPES.emoji = ["src"]` → 약 18곳이 실패(위 기능 기호는 규칙 밖).
- [ ] **Step 2: 구현** — Task 3과 같은 규칙. 경고 문구(`⚠️ {warning}` 등)는 앞의 이모지만 `TriangleAlert`로 바꾼다. 📅(`schedule-worksite-notice`)는 `CalendarDays`. `🟨`·`🟩`(`gpsmap-page.tsx:626`, `map-pick-hint.tsx:21`, `vworld-map-pane.tsx:176`)는 지도 색 범례라 지우지 않고 같은 색의 `<span aria-hidden className="inline-block h-2 w-2 rounded-sm bg-yellow-400" />`(🟩는 `bg-green-500`)으로 바꾼다. `overlay-content.ts`의 `📍 이 위치 주소`는 `이 위치 주소`로.
- [ ] **Step 3: 통과 확인** — 가드·`tsc`·`eslint`·`npm test` 통과.
- [ ] **Step 4:** `git status` 확인.

---

### Task 5: `transition-all` (항목 4)

**Files:** Modify `src/components/ui/toast.tsx:28`, `src/features/accounts/components/account-table-row.tsx:106`, `src/features/map-marker/components/map/map-region-capture-panel-view.tsx:263`, `src/features/map-marker/components/modals/marker-detail-modal.tsx:1378,1386`

- [ ] **Step 1: 가드 확장(RED)** — `CLEAN_SCOPES.transitionAll = ["src"]`.
- [ ] **Step 2: 구현** — 일반 요소는 `transition-colors`. `toast.tsx`는 색·그림자·이동이 함께 바뀌므로 `transition-[transform,opacity]`. `account-table-row.tsx`의 토글 손잡이는 `after:transition-transform`. `map-region-capture-panel-view.tsx`의 진행 막대는 **너비를 애니메이션하지 않는다**(전환 클래스 제거).
- [ ] **Step 3: 통과 확인** — 가드·`tsc`·`eslint` 통과.
- [ ] **Step 4:** `git status` 확인.

### Task 6: 대문자·넓은 자간 (항목 5)

**Files:** Modify `marker-detail-modal.tsx`(893·918·979·996·1028행 근처 6곳), `marker-edit-modal.tsx`(2곳), `src/components/ui/dropdown-menu.tsx:177`

- [ ] **Step 1: 가드 확장(RED)** — `CLEAN_SCOPES.tracking = ["src"]`.
- [ ] **Step 2: 구현** — `uppercase tracking-wider`를 지우고 `font-medium`으로(굵기는 `font-semibold`→`font-medium`). `dropdown-menu.tsx`의 단축키 표시는 `tracking-widest`만 지운다.
- [ ] **Step 3: 통과 확인** — 가드·`tsc`·`eslint` 통과.
- [ ] **Step 4:** `git status` 확인.

### Task 7: 굵은 글자 (항목 6) — **[커밋 체크포인트 2]**

**Files:** Modify 위 점검표의 `font-bold`·`font-extrabold` 29줄(.tsx 20파일 중 `schedule-legend` 1줄은 예외 → 28줄)과 `overlay-content.ts` 2줄(184·200행): `cctv-video-modal`, `dashboard-panel`, `gpsmap-page`(2), `map-floating-controls`, `map-region-bounds-guide`, `auth-modal`(2, `font-extrabold`), `marker-detail-modal`, `marker-edit-modal`, `marker-edit-spec-lists`(2), `roadview-modal`(Task 2에서 처리), `route-summary`, `schedule-cell-dialog`, `mobile-shell`(2), `nav-tree`, `work-panel`(2), `site-list-members-dialog`, `typhoon-banner`, `typhoon-modal`(4), `weather-satellite-modal`

- [ ] **Step 1: 가드 확장(RED)** — `CLEAN_SCOPES.bold = ["src"]`. 예외 하나를 `ALLOW`에 넣는다: `"src/features/schedule/components/schedule-legend.tsx:bold"` → "범례가 굵은 파란 글자 자체를 보여 준다".
- [ ] **Step 2: 구현** — `font-bold`·`font-extrabold`를 `font-semibold`로. 로그인 제목(`auth-modal`)의 `font-extrabold tracking-tight`는 `font-semibold tracking-tight`. `overlay-content.ts`의 말풍선 HTML 두 곳(`font-bold`)도 `font-semibold`로.
- [ ] **Step 3: 통과 확인** — 가드·`tsc`·`eslint` 통과.
- [ ] **Step 4: 사용자 확인** — 로그인 화면과 사이드바 제목이 너무 가벼워 보이지 않는지(로그인 화면 전후 캡처를 비교한다).
- [ ] **Step 5:** `git status` 확인.

---

### Task 8: 9·10px 글자 상향 A — 마커 화면 (항목 7)

**Files:** Modify `src/features/map-marker/lib/overlay-content.ts`(10px 11곳, 카카오 말풍선 HTML 문자열)과 `src/features/map-marker/components/` 아래: `modals/marker-detail-modal.tsx`(10px 23), `modals/marker-edit-spec-lists.tsx`(9px 4 + 10px 13), `sidebar/erp-review-panel.tsx`(9px 3 + 10px 9), `map/map-region-bounds-guide.tsx`(5), `map/map-floating-controls.tsx`(9px 1 + 10px 1), `sidebar/filter-panel.tsx`(2), `sidebar/backup-restore-section.tsx`(1), `sidebar/battery-excel-section.tsx`(9px 1 + 10px 1)

- [ ] **Step 1: 가드 확장(RED)** — `CLEAN_SCOPES.tinyText = ["src/features/map-marker"]`.
- [ ] **Step 2: 구현** — `text-[9px]`·`text-[10px]`를 `text-[11px]`로. 줄바꿈이 생기는 셀은 같은 줄의 `gap`·`px`를 한 단계 줄이거나 열 폭 상수를 키운다(표 줄바꿈 금지).
- [ ] **Step 3: 통과 확인** — 가드·`tsc`·`eslint` 통과.
- [ ] **Step 4: 사용자 확인(Review Focus 1·5)** — 마커 상세, 마커 편집(사양 목록), ERP 검토 패널, 지도 영역 안내 창, 위성 지도 위의 날씨 말풍선을 **데스크톱과 모바일 폭**에서 보고 줄바꿈·잘림·가로 스크롤이 없는지. 문제가 있는 화면 이름을 알려 주면 그 화면만 고친다.
- [ ] **Step 5:** `git status` 확인.

### Task 9: 9·10px 글자 상향 B — 나머지 화면 (항목 7)

**Files:** Modify 나머지 27개 파일의 `text-[9px]`(`cctv-survey-summary` 1)·`text-[10px]`. 많은 곳: `cctv-panel`(8), `gps-converter-panel`(5), `gpsmap-page`(5), `route-origin-picker`(5), `barcode-lookup-panel`(4), `typhoon-modal`(4), 그 밖 21개 파일은 1~3곳. 파일 목록은 `grep -rln "text-\[\(9\|10\)px\]" src`로 뽑는다.

- [ ] **Step 1: 가드 확장(RED)** — `CLEAN_SCOPES.tinyText = ["src"]`.
- [ ] **Step 2: 구현** — Task 8과 같다.
- [ ] **Step 3: 통과 확인** — 가드·`tsc`·`eslint`·`npm test` 통과.
- [ ] **Step 4: 사용자 확인(Review Focus 1·5)** — 대시보드, 위치/좌표 변환기, CCTV, 경로, 바코드, 그룹 표, 계정 표를 데스크톱과 모바일 폭에서 본다.
- [ ] **Step 5:** `git status` 확인.

---

### Task 10: 둥근 모서리 정리 (항목 8) — **[커밋 체크포인트 3]**

**Files:** Modify 단독 `rounded`(약 70곳)와 `rounded-xl`(24곳)을 쓰는 모든 `.tsx`. 목록은 `scan("radius", ["src"])` 실패 메시지가 그대로 알려 준다.

- [ ] **Step 1: 가드 확장(RED)** — `CLEAN_SCOPES.radius = ["src"]`. 표시된 파일:줄이 작업 목록이다.
- [ ] **Step 2: 구현** — 단독 `rounded`(4px)를 `rounded-sm`(8px)로, `rounded-xl`을 `rounded-lg`로(둘 다 12px라 모양은 같다). `rounded-full`(배지·토글·아바타)은 그대로.
- [ ] **Step 3: 통과 확인** — 가드·`tsc`·`eslint`·`npm test` 통과.
- [ ] **Step 4: 사용자 확인** — 작은 칩·태그의 모서리가 4px→8px로 커진 것이 어색하지 않은지(마커 목록, 필터, 표 안의 작은 배지).
- [ ] **Step 5:** `git status` 확인.

---

### Task 11: 마무리 검증과 문서

**Files:** Modify `docs/Ver_3.0/Ver_3.0_계획.md`(§19 추가), Create `docs/Ver_3.0/Ver_3.0_스타일정리_구현.md`

- [ ] **Step 1: 전체 검증** — `npx tsc --noEmit`, `npx eslint src --max-warnings=0`, `npm test` 모두 통과. 임시 `distDir`로 `next build`해 홈 First Load JS가 **299 kB 이하**인지 확인.
- [ ] **Step 2: 화면 전후 캡처** — 개발 서버(제가 띄운 포트만)로 로그인 화면 라이트·다크를 찍어 점검 때 캡처와 비교한다.
- [ ] **Step 3: 가드 정리** — 임시 규칙 3개(`bold`·`tinyText`·`radius`)의 `CLEAN_SCOPES`를 `[]`로 비운다(코드와 `ALLOW`는 남김). 프로젝트 `AGENTS.md`의 "코드베이스 메모"에 "`src/lib/style-guard.test.ts`가 그라디언트·글로·그림 이모지·`transition-all`·넓은 자간을 막는다. 의도적으로 쓰려면 `ALLOW`에 이유와 함께 적는다" 한 줄을 더한다.
- [ ] **Step 4: 문서** — 계획서 §19에 요약을, 구현 문서에 만든 것·결정(Ver 2.1 글로우 철회)·사용자 확인 결과·범위 밖 목록을 적는다.
- [ ] **Step 5:** `git status`로 변경 파일 목록만 확인하고 사용자에게 알린다(커밋하지 않는다).

---

## Self-Review

- **점검 커버리지:** 점검표 1→Task 1, 2→Task 2, 3→Task 3·4, 4→Task 5, 5→Task 6, 6→Task 7, 7→Task 8·9, 8→Task 10. 범위 밖 항목은 "점검 결과"에 명시했다.
- **Review Focus 매핑:** 1·5→Task 8·9(사용자 확인), 2·3→Task 1, 4→Task 3.
- **타입·이름 일치:** `RULES`·`CLEAN_SCOPES`·`ALLOW`·`scan`과 규칙 id 8개(`glow`·`gradient`·`emoji`·`transitionAll`·`tracking`·`bold`·`tinyText`·`radius`)가 Task 0과 이후 Task에서 같다.
- **비율:** 계획은 점검 결과표보다 길지만, 코드 본문은 한 줄 클래스 교체뿐이고 나머지는 위치와 판단 기준이다.
- **한계:** 눈으로만 아는 항목(표 폭·대비·모서리 어색함)은 가드로 못 잡아 사용자 확인 단계로 둔다. 로그인 뒤 화면은 제가 직접 볼 수 없다.
