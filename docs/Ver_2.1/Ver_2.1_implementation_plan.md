# MapMarker Pro - 구현 계획 Ver 2.1

| 항목 | 내용 |
|------|------|
| 버전 | 2.1 |
| 작성일 | 2026-08-02 |
| 작업명 | 디자인 토큰 재매핑 + 라이트/다크 테마 전환 인프라 완성 |

> 파일명은 `Ver_2.1_implementation_plan.md`. 이전 버전 파일(`docs/Ver_2.0/`)은 수정하지 않는다.

---

## 사용자 요청 (원문)

**최초 요청**
> C:\Users\hyste\Downloads\DESIGN.md C:\Users\hyste\Downloads\tokens.json C:\Users\hyste\Downloads\variables.css C:\Users\hyste\Downloads\theme.css 기준으로 디자인 계획 만들어줘 보고 적용여부 확인 할께

**적용 방식 확인**
> "제공하신 DESIGN.md는 Calendly 스타일 — 라이트 배경·네이비 텍스트·에디토리얼 히어로/배지/블롭 장식 등 마케팅 랜딩페이지용 시스템입니다. 반면 이 프로젝트(tailwind.config.ts)는 "LaunchDarkly 네온 컨트롤룸" 컨셉의 다크 테마(차콜 슬레이트 + 인디고)로 이미 리스킨돼 있고, 지도/마커 운영툴이라 히어로·배지·블롭 같은 랜딩페이지 컴포넌트는 해당이 없습니다. 어떻게 반영할까요?" 질문에 대한 답:
> "1번으로 해주는데, 다크 라이트 변경 가능하도록 해"

**버전 확인**
> "Ver 2.1"

## 배경 — 입력 자료 4종

- `DESIGN.md` / `tokens.json` / `variables.css` / `theme.css`: 모두 Calendly.com에서 추출한 동일 토큰 세트(색·타이포·spacing·radius·shadow)를 Markdown 서술 / W3C 토큰 JSON / CSS 변수 / Tailwind v4 `@theme` 4가지 형식으로 중복 제공한 것. 내용은 하나다.
- 원본은 **라이트 마케팅 랜딩페이지** 시스템(네이비 잉크 온 화이트, 80px 에디토리얼 헤드라인, 히어로·배지·블롭 장식, 예약 위젯 카드 등). 이 프로젝트는 지도/마커 **운영툴**이고 이미 "LaunchDarkly 네온 컨트롤룸" 다크 테마로 리스킨돼 있어(`tailwind.config.ts` 주석), 원본을 그대로 이식할 대상 화면이 없다.

## 현황 진단 (계획 근거)

1. **라이트/다크 인프라는 이미 절반 배선돼 있다.** `src/app/providers.tsx`가 `next-themes`의 `ThemeProvider`를 `attribute="class"`, `defaultTheme="system"`, `enableSystem`으로 이미 얹어 놨다. `globals.css`에도 `:root`(라이트)·`.dark`(다크) 두 세트의 shadcn CSS 변수가 이미 정의돼 있다.
2. **그런데 토글 UI가 없다.** `useTheme`을 부르는 컴포넌트가 코드베이스에 전혀 없다 — 사용자가 테마를 바꿀 방법이 없고, `defaultTheme="system"`이라 OS가 라이트면 `.dark` 클래스가 안 붙는다.
3. **앱의 실제 "다크"는 CSS 변수가 아니라 하드코딩이다.** 대시보드·사이드바 패널·지도 플로팅 컨트롤 등 커스텀 컴포넌트 전부가 `bg-slate-900/60 text-slate-200` 식으로 직접 슬레이트 유틸리티를 박아 넣었다(`AGENTS.md` 기존 메모). `.dark` 클래스 유무와 무관하게 이 부분은 항상 어둡게 보인다.
4. **shadcn 원시 컴포넌트(`src/components/ui/*`)만 CSS 변수를 그대로 쓴다.** 그래서 OS가 라이트로 판정되는 사용자 환경에서는 `Button`의 `outline`/`secondary`/`ghost` 변형과 `Input`/`Textarea`가 라이트 팔레트(거의 흰 배경 + 거의 검정 글씨)로 렌더되어 주변 하드코딩 다크 UI와 충돌한다 — 오늘 세션에서 고친 "검색창 글씨 안 보임" 버그, 그리고 `AGENTS.md`의 "shadcn outline·secondary·ghost 변형은 밝게 렌더된다" 메모가 전부 이 원인이다.
5. 즉 지금 상태는 **다크도 라이트도 아닌 어중간한 상태**다. 이번 작업은 여기를 "다크 고정(안전) → 라이트 완성 → 토글로 전환 가능"으로 정리하는 것이다.

## 목표

1. Calendly 토큰 세트 중 **구조(스페이싱/라운드/섀도/타입 스케일)** 만 채택해 이 프로젝트 토큰 체계에 편입한다. 색상은 원본 그대로 쓰지 않고 기존 인디고 브랜드에 맞게 재매핑한다.
2. 이미 절반 배선된 `next-themes` 인프라를 완성해 **라이트/다크를 실제로 전환**할 수 있게 만든다.
3. 전환 범위는 **shadcn 원시 컴포넌트 레이어**(`src/components/ui/*`)로 한정한다. 대시보드·사이드바·지도 컨트롤 등 하드코딩된 커스텀 컴포넌트 전면 마이그레이션은 범위가 훨씬 커서 이번 버전에서 하지 않는다(아래 「제외」).

## 범위

**포함**

- `globals.css`
  - `:root`(라이트) 색상 변수를 Calendly 팔레트로 재매핑: `--background`→Cloud `#f8f9fb`, `--card`/`--popover`→Paper `#ffffff`, `--foreground`/`--card-foreground`→Ink Navy `#0b3558`, `--muted-foreground`→Slate Gray `#476788`, `--secondary`/`--muted`/`--accent`→Pebble `#f0f3f8`, `--border`/`--input`→Hairline `#d4e0ed`.
  - `--primary`/`--ring`은 **원본 신호블루(#006bff)로 바꾸지 않고 기존 인디고 브랜드값 유지** — `.dark`쪽 기존 주석("다크에서도 동일한 브랜드 블루를 강조로 사용")과 같은 원칙을 라이트에도 적용해 브랜드 일관성을 지킨다.
  - `.dark`(다크)는 값 유지 — 이미 "네온 컨트롤룸" 다크 룩에 맞춰져 있다.
  - 신규 네임드 토큰 추가(색상 채택분과 별개, 두 테마 공용): `--radius-buttons: 8px`, `--radius-inputs: 8px`, `--radius-cards: 24px`, `--radius-productcards: 16px`, `--radius-badges: 9999px`, `--shadow-elevation-sm/-md/-lg`(Calendly의 슬레이트틴트 3단 섀도, 라이트 카드 전용). 기존 `glow`/`glow-sm`(인디고 발광, 다크·포커스·선택 상태 전용)은 그대로 둔다.
- `tailwind.config.ts`: 위 네임드 radius·shadow를 유틸리티로 노출(`rounded-btn`, `rounded-card`, `shadow-elevation-sm` 등). `darkMode: ['class']`는 이미 맞게 설정돼 있어 변경 불필요.
- `src/app/providers.tsx`: `defaultTheme="system"` → `"dark"`로 고정, `enableSystem` 제거. 토글 UI가 실제로 붙기 전까지 라이트로 새는 현재 버그를 먼저 막는다.
- `src/features/shell/components/panels/settings-panel.tsx`: `useTheme()`으로 라이트/다크 전환 `ToggleRow`(이미 있는 패턴 재사용) 추가.
- `src/components/ui/*`(button, input, textarea, card, dialog, badge 등): 라이트 모드에서 CSS 변수 기반으로 올바르게 렌더되는지 점검. 현재 있는 하드코딩 `text-slate-100` 등 다크 전용 오버라이드가 라이트 렌더를 막는 곳만 세만틱 토큰으로 정리(전면 재작성 아님).

**제외**

- 대시보드/사이드바 패널/지도 플로팅 컨트롤/CCTV 패널 등 **커스텀 컴포넌트에 하드코딩된 `slate-*`/`indigo-*` 유틸리티 전면 마이그레이션.** 파일 수십 개 규모라 별도 버전이 필요하다 — 이번 버전 완료 후 사용자 확인을 받아 Ver 2.2 이상으로 분리 제안.
- 카카오맵 오버레이 말풍선(`globals.css`의 `.overlay-*`, 하드코딩 hex). 위성·도로 이미지 위에 얹히는 요소라 앱 테마와 무관하게 항상 어둡게 유지해야 가독성이 나온다. 라이트 전환 대상에서 명시적으로 제외.
- Calendly의 랜딩페이지 전용 컴포넌트(예약 위젯 카드, 신뢰 로고 스트립, 히어로, 피처 아코디언, 소셜 로그인 버튼, 장식 블롭) — 이 앱에 대응하는 화면이 없어 이식하지 않는다.
- Gilroy 폰트, 38~80px 대형 헤딩 스케일 — 이 앱은 11px 안팎 조밀한 라벨이 기준이라 부적합, 도입하지 않는다.
- `--color-signal-blue`(#006bff)를 새 primary로 채택하는 것 — 기존 인디고 브랜드와 정면 충돌.

## 작업 항목

| # | 대상 파일 | 변경 내용 |
|---|-----------|-----------|
| 1 | `src/app/globals.css` | `:root` 색상 변수를 Calendly 팔레트로 재매핑(색상 표 위 참고), `--primary`/`--ring`은 유지. 네임드 radius·shadow 변수 추가 |
| 2 | `tailwind.config.ts` | 네임드 radius·shadow를 유틸리티 클래스로 노출 |
| 3 | `src/app/providers.tsx` | `defaultTheme="dark"`로 고정, `enableSystem` 제거 |
| 4 | `src/features/shell/components/panels/settings-panel.tsx` | 라이트/다크 전환 `ToggleRow` 추가(`useTheme` 사용) |
| 5 | `src/components/ui/*` | 라이트 모드 렌더 점검·다크 전용 하드코딩 오버라이드 정리(발견되는 것만) |

## 완료 기준

- [ ] `defaultTheme` 방치로 인한 "라이트 OS에서 shadcn 컴포넌트만 밝게 깨짐" 버그 재현 안 됨(다크 고정 확인)
- [ ] 설정 패널에서 토글 클릭 시 `<html class="dark">`가 실제로 붙고 떨어짐
- [ ] 라이트 모드에서 `Button`(default/outline/secondary/ghost) · `Input` · `Textarea` · `Card` · `Dialog` · `Badge`가 Calendly 팔레트로 올바르게 렌더(텍스트 대비 확인)
- [ ] 다크 모드는 기존 "네온 컨트롤룸" 룩 그대로 유지(회귀 없음) — 커스텀 컴포넌트는 계획대로 라이트 전환 대상에서 제외되므로 라이트에서도 부분적으로 다크로 남는 것이 정상(완료 기준 아님, 알려진 제약)
- [ ] `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test` · `npx next build`(홈 First Load JS 295 kB 이내) 통과

## 참고

- 이전 버전: 해당 없음(디자인 토큰 문서는 이번이 처음. 레이아웃 치수는 [Ver_2.0 DESIGN](../Ver_2.0/Ver_2.0_DESIGN.md) 참고, 이번 계획과 항목 겹치지 않음)
- 입력 원본: `C:\Users\hyste\Downloads\{DESIGN.md, tokens.json, variables.css, theme.css}` (Calendly.com 추출, 2026-07-03)
- 완료 후 커스텀 컴포넌트 전면 마이그레이션 여부는 walkthrough에서 별도로 여쭤 Ver 2.2 착수 여부를 정한다.
