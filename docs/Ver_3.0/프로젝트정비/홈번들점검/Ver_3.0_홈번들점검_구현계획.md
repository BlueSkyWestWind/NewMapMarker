# 홈 번들 점검 구현계획

> **실행 방식:** 측정(Task 1)은 agy가 읽기 전용으로 하고 Claude가 수치를 검증한다. 코드 변경(Task 3)은 agy가 하고 Claude가 diff를 검토한다. 단계는 체크박스(`- [ ]`)로 추적한다.

**Goal:** 홈(`/`) First Load JS가 어디에서 나오는지 모듈 단위로 측정하고, 측정으로 확인된 후보만 골라 295 kB 이하로 되돌린다(또는 기준을 근거와 함께 갱신한다).

**Architecture:** 측정 → 후보 선택(사용자 확인) → 지연 로드 적용 → 재측정 순으로, 각 단계가 앞 단계의 수치를 입력으로 받는다. 절감량은 추정하지 않고 측정값만 쓴다.

**Tech Stack:** Next.js 15.5 (App Router) · 빌드 산출물 소스맵 · `npx source-map-explorer`(프로젝트 의존성에 추가하지 않는다) · Vitest. 의존성 추가 없음.

**Spec:** [Ver_3.0_홈번들점검_설계.md](Ver_3.0_홈번들점검_설계.md)

## Global Constraints

- **커밋하지 않는다.** 사용자가 "커밋"을 요청할 때만 커밋한다.
- **문서(`docs/`, `AGENTS.md`, `README.md`)는 수정하지 않는다.** 측정 결과는 스크래치 폴더에 파일로 쓰고, Claude가 문서로 정리한다.
- **임시 distDir 규칙**: 개발 서버(3000)가 떠 있을 수 있어 `npx next build`를 바로 돌리면 `.next`가 덮어써져 화면이 깨진다. `next.config.ts`에 `distDir: '.next-build-check'`를 잠깐 넣고 빌드한 뒤, `next.config.ts`·`tsconfig.json`·`next-env.d.ts`를 원래대로 되돌리고 `.next-build-check`를 지운다. 끝난 뒤 `git status`에 이 세 파일이 없어야 한다. 시작 전에 세 파일을 백업한다.
- `productionBrowserSourceMaps`는 측정 빌드에서만 켠다. 코드·설정에 남기지 않는다.
- 변경은 동작을 바꾸지 않는다. 지연 로드한 UI는 기존과 같은 조건에서 나타난다.
- **검증 명령**: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`.
- 기존 줄바꿈(CRLF/LF)을 파일마다 유지한다.

## Review Focus

1. 측정 빌드 뒤 `next.config.ts`·`tsconfig.json`·`next-env.d.ts`가 원복됐는지 (Task 1, Step 5와 Task 3 끝에서 `git status`).
2. 소스맵 집계의 합계가 gzip 합(294.1 kB 근방)과 같은 자릿수인지 (Task 1, Step 3 검산).
3. 지연 로드한 컴포넌트가 열리기 전 화면과 같은 위치·상태에서 나타나는지 (Task 3, 화면 확인).

---

### Task 1: 홈 번들 모듈별 측정 (agy, 읽기 전용 + 임시 빌드)

**Files:**
- Create (스크래치 폴더만): `home-bundle-report.md`, 집계 스크립트
- Modify (임시, 끝나면 원복): `next.config.ts`

**Interfaces:** 결과 표 형식 — `| 패키지 또는 소스 경로 | gzip kB | raw kB | 청크 |`, 상위 50행과 패키지별 합계.

**Steps:**
- [ ] `next.config.ts`·`tsconfig.json`·`next-env.d.ts`를 스크래치 폴더에 백업한다.
- [ ] `next.config.ts`에 임시로 `distDir: '.next-build-check'`와 `productionBrowserSourceMaps: true`를 넣고 `npx next build`를 실행한다. 홈 First Load JS가 301 kB 안팎(±1)인지 확인한다. 다르면 보고에 적고 이유를 추정하지 않는다.
- [ ] `.next-build-check/app-build-manifest.json`의 `pages["/page"]` 청크 11개를 소스맵으로 분해해 모듈별 크기를 표로 만든다. 검산: 표의 gzip 합이 청크 gzip 합(294.1 kB, ±5%)과 맞는지 적는다.
- [ ] 보고서에 ① 패키지별 합계(`@supabase/*`, `react-dom`, `next`, `@radix-ui/*`, `zustand`, `ts-pattern`, `@tanstack/*`, `lucide-react` 등), ② 프로젝트 소스 상위 30개 파일(경로와 크기), ③ `@supabase/supabase-js` 안에서 `storage`·`realtime`·`functions`·`postgrest`·`auth`가 각각 차지하는 크기를 적는다.
- [ ] 설정 3개를 백업본으로 되돌리고 `.next-build-check`를 지운다. `git status --short next.config.ts tsconfig.json next-env.d.ts`가 비어 있어야 한다.
- [ ] 스크래치 폴더에 `home-bundle-report.md`를 저장한다.

---

### Task 2: 후보 선택 (Claude와 사용자)

**Steps:**
- [ ] Claude가 보고서 수치를 확인하고(설정 원복 여부, 합계 검산), 설계 §3.1의 L1~L4를 측정값으로 다시 평가해 사용자에게 표로 보여 준다: 후보별 측정 절감량, 변경 파일 수, 위험.
- [ ] 사용자가 §6의 목표(295 kB로 되돌리기 / 기준 갱신)와 적용할 후보를 정한다. 이 Task가 끝나기 전에는 Task 3을 시작하지 않는다.

---

### Task 3: 선택한 후보 적용 (agy)

이 Task의 세부는 Task 2의 선택으로 확정한다. 아래는 가장 유력한 L2(영역 캡처 UI 지연 로드)의 기준안이다.

**Files:**
- Modify: `src/features/map-marker/components/map/kakao-map-canvas.tsx`
- Create (필요하면): 캡처 UI 묶음을 한 번에 받는 진입 컴포넌트 `src/features/map-marker/components/map/map-region-capture-root.tsx`

**Interfaces:**
```ts
// kakao-map-canvas.tsx
const MapRegionCaptureRoot = dynamic(
  () => import("@/features/map-marker/components/map/map-region-capture-root").then((m) => m.MapRegionCaptureRoot),
  { ssr: false },
);
// 캡처 모드(isRegionSelectMode 또는 isCapturePanelOpen 또는 captureBounds)일 때만 렌더한다.
```

**Steps:**
- [ ] `MapRegionSelectOverlay`·`MapRegionBoundsGuide`·`MapRegionCapturePanel`과 이들이 끌고 오는 `map-viewport-capture`·`map-capture-stitch` import가 `kakao-map-canvas.tsx`의 정적 import에서 빠지게 한다(다른 모듈이 같은 파일을 정적으로 import하면 지연 로드가 무효이므로, 빌드 결과로 확인한다).
- [ ] 캡처 시작 버튼에 마우스를 올리거나 누르는 순간 `import()`를 시작해, 눌렀을 때 받는 지연을 줄인다(선택, 동작은 바꾸지 않는다).
- [ ] 로딩 중 표시는 기존 캡처 UI와 같은 톤의 짧은 문구 하나로 한다.
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

---

### Task 4: 재측정과 기록 (Claude)

**Steps:**
- [ ] 임시 distDir 빌드로 홈·`/gpsmap` First Load JS를 다시 측정하고, 설정 3개 원복과 `git status`를 확인한다.
- [ ] 구현 문서에 전·후 표(후보별 측정 절감량 포함)를 적는다. 295 kB에 닿지 못했다면 남은 격차와 이유를 적고 사용자가 §6 항목 1(기준 갱신)을 정하게 한다.
- [ ] 화면 확인 목록을 구현 문서 맨 위 "직접 하실 일"에 적는다: 영역 캡처 시작 → 영역 선택 → 가이드 → 타일 제외 → 저장/닫기, 처음 눌렀을 때의 지연이 거슬리지 않는지.
