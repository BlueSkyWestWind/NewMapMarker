# 프로젝트 분석 보고서

- 대상: `002_geographic_tech` (배터리/장비 지도 마커 관리 웹앱)
- 작성일: 2026-07-18
- 검사 방법: 구조 스캔 · `tsc --noEmit` · `next lint` · `next build` · 패턴 그렙(XSS/any/console/SSRF/env)

---

## 1. 기술 스택 & 구조

| 항목       | 내용                                        |
| ---------- | ------------------------------------------- |
| 프레임워크 | Next.js 15.5.18 (App Router, Turbopack dev) |
| 배포       | Cloudflare Pages (`@opennextjs/cloudflare`) |
| 데이터     | Supabase, TanStack Query                    |
| 지도       | Kakao Maps JS SDK, Kakao REST(정적맵/좌표)  |
| UI         | Tailwind CSS, shadcn/ui (Radix)             |
| 규모       | 소스 84개 (분할 후), 최대 단일 파일 728줄   |
| 의존성     | deps 36 / devDeps 13                        |

**폴더 구조 (feature 기반, 대형 파일 분할 반영 — 소스 84개, ★=이번 세션 신설)**

```
src/
  app/           layout · page · providers · api/{kakao-static-map,map-tile-proxy,roadview-dates}
  components/     ui/(shadcn 18) · public-env-script
  hooks/ lib/ types/  use-toast · utils · public-env · supabase/client · kakao-maps.d.ts
  features/map-marker/
    api.ts · types/marker · constants/{facility-teams,map-config} · store/use-map-marker-store
    providers/auth-provider
    hooks/  use-auth-session · use-map-markers-query · use-kakao-map-sdk
            use-active-markers · use-data-backup-actions · use-excel-upload-actions
    lib/
      geocode · marker-filters · marker-svg · cluster-pie
      overlay-drag · overlay-content ★ · capture-overlay-layout · map-viewport-capture
      map-capture-stitch/ ★  index·types·helpers·bounds·plan·capture
      excel/data-manager/ ★   index·shared·date-utils·info-records·headers·parse·export
    components/
      map-marker-page
      map/     kakao-map-canvas · map-floating-controls · map-region-select-overlay
               map-region-bounds-guide · map-region-capture-panel · map-region-capture-panel-view ★
      modals/  auth-modal · marker-detail-modal · marker-edit-modal · marker-edit-spec-lists ★ · roadview-modal
      sidebar/ map-sidebar · auth-header · mode-tabs · filter-panel · place-search-section
               markers-list-panel · equipment-info-section · backup-restore-section
               equipment-excel-section · battery-excel-section
```

**대형 파일 (분할 전 LOC — 아래 5개 모두 §5-2에서 분할 완료, 최대 단일 파일 728줄로 축소)**

| 파일                                          | LOC   |
| --------------------------------------------- | ----- |
| `lib/excel/data-manager.ts`                   | 1,145 |
| `components/map/kakao-map-canvas.tsx`         | 1,118 |
| `components/modals/marker-edit-modal.tsx`     | 814   |
| `lib/map-capture-stitch.ts`                   | 809   |
| `components/map/map-region-capture-panel.tsx` | 675   |

---

## 2. 빌드/타입 검사 결과

| 검사           | 결과                           |
| -------------- | ------------------------------ |
| `tsc --noEmit` | ✅ 통과 (0 오류)               |
| `next build`   | ✅ 성공 (정적 8 페이지, 11.7s) |
| `next lint`    | ⚠️ **오류 1 + 경고 6**         |

> 주의: `next build`는 **"Skipping linting"** 으로 lint를 건너뛰므로 빌드는 성공하지만, lint 오류는 별도로 존재합니다.

---

## 3. 발견된 문제 (우선순위순)

### 🔴 P1 — `data-manager.ts` 전체 타입 검사 비활성 (`@ts-nocheck`) ✅ 수정 완료

> **조치 완료**: BOM + `@ts-nocheck` 제거 후 **21개 타입 오류를 로직 변경 없이 타입만 보정**:
> `event.target.result as ArrayBuffer`(Uint8Array 오버로드 4곳), `(error as Error).message`(catch unknown 4곳),
> `Record<string, any>`/`Record<string, string>` 주석(동적 파싱 객체 13곳), `sheet_to_json<any[]>` 제네릭.
> **엑셀 왕복 무결성 테스트(Node + 최소 브라우저 shim) 18/18 통과** — 좌표 정밀도(double 정밀도까지 정확) 보존,
> 국소명·용량·수량·items 매핑 보존, `formatDateToYmd` 정규화 정상. `tsc`/`next build`/`eslint .` 모두 통과.
> 이제 이 모듈도 정적 타입 검사 대상에 포함됨.

원래 진단 내용 - 위치: `src/features/map-marker/lib/excel/data-manager.ts:1` - 내용: 파일 첫 줄 `// @ts-nocheck` → **1,145줄 전체가 타입 검사 대상에서 제외**. `next lint`에서 `@typescript-eslint/ban-ts-comment` **에러**로 잡힘. - 추가: 지시문 앞에 **BOM(`﻿`) 문자**가 붙어 있음(`﻿// @ts-nocheck`). 엑셀 내보내기/가져오기 핵심 로직이 타입 무방비 상태 → 좌표/셀 매핑 오류가 런타임까지 숨을 수 있음. - **실측**: `@ts-nocheck` 제거 시 **21개 타입 오류** 노출 (동적 객체 리터럴 속성 누락 `lat/lng/items/address`, `catch (err: unknown)`의 `.message` 접근, XLSX 오버로드 불일치 등). - 판단: 이 파일은 좌표 정밀도 보존이 핵심이라 **실제 엑셀 왕복 테스트 없이 21곳을 수정하면 데이터 무결성 훼손 위험**. 이번엔 원상 복구하고 별도 작업으로 분리 권장. - 권장(분리 작업): ① BOM 제거 ② `MarkerRecord` 유니온으로 객체 타입 명시 ③ `err instanceof Error` 가드 ④ 각 수정 후 실제 xlsx 내보내기→가져오기 값 대조.

### 🟠 P2 — 홈 라우트 번들 과대 ✅ 수정 완료

- 이전: `/` 라우트 자체 279 kB, 공유 포함 First Load JS **448 kB**.
- 조치:
  - 상세/편집/로드뷰 **모달 3종을** `next/dynamic`**(ssr:false) 지연 로드**로 전환.
  - `xlsx`**(대용량) 지연 로드**: `use-data-backup-actions` / `use-excel-upload-actions` 훅에서 `data-manager` 정적 import 제거 → 각 액션 함수 내부에서 `await import()`로 필요 시 로드 (호출부 수정 없이 지역 상수로 처리).
- **결과: First Load JS 448 kB → 297 kB (-151 kB, 약 34% 감소)**, `/` 자체 279 kB → 128 kB.

### 🟠 P3 — `innerHTML` 문자열 주입 (잠재 XSS) ✅ 수정 완료

- 위치: `kakao-map-canvas.tsx` 다수 (`addressDiv.innerHTML = ...`, `specSummary.innerHTML = ...`).
- 현재는 주소가 Kakao 지오코더/DB에서 오고 편집 모달에서 직접 주소를 타이핑하지는 않아 실제 악용 가능성은 낮았으나, DB 값/향후 사용자 입력이 이스케이프 없이 DOM에 삽입되던 저장형 XSS 소지.
- 조치: `escapeHtml()` 헬퍼 추가 후 `innerHTML`에 보간되던 **모든 동적 값(주소 지번/도로명, 배터리 용량/수량)을 이스케이프**. 정적 문자열(닫기 아이콘, "주소 조회 중..." 등)은 무해하여 그대로 둠.
  - 적용 지점: 정보창 주소(직접/지오코더 콜백 2곳), 텍스트 라벨 주소(`renderAddress`), 배터리 스펙 요약 else 분기.
  - `parts`(스펙 요약)는 `Number()`로 강제되는 값이라 주입 불가.

### 🟡 P4 — 사용되지 않는 죽은 코드

- `overlay-drag.ts`의 `computeCaptureOverlayOffsets`(+ `screenPanelToOffset`, `readPointXY`, `buildCandidates` 등 약 180줄)은 수동 드래그/텍스트 라벨 방식 전환 후 **호출되지 않음**.
- 상태: **사용자 요청으로 향후 자동배치 재사용 위해 의도적으로 보존 중**. 기술부채로만 기록.

### 🟡 P5 — React Hooks 의존성 경고 ✅ 수정 완료

- `hooks/use-active-markers.ts`: `useEffect` 복잡 표현식 의존성 4건 + 누락 의존성 경고.
- 조치: 복잡 표현식(`filterOptions.years.join(',')` 등)을 `filterOptionsKey` **단일 변수로 추출**해 정적 검사 가능하게 만들고, 의도된 변화 감지 방식임을 주석으로 명시. `next lint` 경고 6건 → **0건**.

### 🟡 P6 — 프로덕션 디버그 로그 잔존 ✅ 수정 완료

- `components/modals/roadview-modal.tsx:38` `console.log('[RoadviewDebug] ...')` 상시 출력.
- 조치: `process.env.NODE_ENV !== "production"` 가드로 감싸 프로덕션에서 미출력하도록 수정함.

### ⚪ P7 — 기타(경미) ✅ 수정 완료

- **(a)** `components/public-env-script.tsx`: `next/script beforeInteractive` → **일반 인라인 `<script>`**로 변경(레이아웃 `<body>` 최상단, 하이드레이션 전 실행 보장). Next 경고 제거.
- **(b)** `marker-detail-modal.tsx`의 `marker as any` **약 30곳 제거**: 모드에 맞춰 좁힌 `equipmentMarker`/`batteryMarker`(EquipmentMarker/BatteryMarker) 뷰와 `BatterySpecItem` 타입으로 치환. `catch (err: any)` → `catch (err)`.
- **(c)** `next lint`(Next 16 제거 예정) → **ESLint CLI로 마이그레이션**: `eslint.config.mjs`에 빌드 산출물 `ignores` 추가, `package.json` `lint` 스크립트를 `eslint .`로 변경.

---

## 4. 양호한 점 (유지)

- ✅ `map-tile-proxy` 라우트에 **호스트 allowlist 기반 SSRF 방지** 적용 (kakao/daum CDN만 허용).
- ✅ `.env*` 가 `.gitignore`에 포함, `.env.local` **git 미추적** (시크릿 노출 없음).
- ✅ 타입체크·프로덕션 빌드 통과, feature 기반 폴더 구조 일관성.
- ✅ 캡처 타일 로딩 대기 로직 강화(미완료 타일 0 대기)로 흰색 빈 구간 방지 개선 반영됨.

---

## 5. 권장 조치 순서 — ✅ 전부 완료

P1~P7 및 대형 파일 분할까지 이번 세션에서 모두 처리됨(상세 §3, §5-1, §5-2).
남은 항목은 **P4(죽은 코드 `computeCaptureOverlayOffsets`) — 사용자 요청으로 의도적 보존**뿐.

향후 개선 후보:

1. ✅ **완료** — `marker-edit-modal.tsx`의 상태·저장·삭제 로직을 커스텀 훅 **`use-marker-edit-form.ts`**(460줄)로 분리. 모달은 뷰만 남아 **618 → 228줄**. `tsc`/`eslint`/`next build` 통과.
2. ✅ **완료** — `batteryItems`/`equipmentItems`에 **`EquipmentRowItem`/`BatteryRowItem` 인터페이스** 부여(`marker-edit-spec-lists.tsx`에 정의, 훅·리스트 컴포넌트가 공유). `any[]` → 타입 배열, 리스트 `onChange` 키를 `keyof`로 제약. `tsc`/`eslint`/`next build` 통과.
3. ✅ **완료(1차 스모크)** — **Playwright 도입**: `@playwright/test` + Chromium, `playwright.config.ts`(dev 서버 재사용), `e2e/smoke.spec.ts`, `npm run test:e2e`. 앱 셸 렌더·모드 탭(장비/축전지) 전환·런타임 예외 부재를 검증 → **2/2 통과**. 산출물은 `.gitignore` 처리.
   - 후속: Kakao 키(도메인)·Supabase 테스트 환경이 갖춰지면 지도 로드 → 마커 편집 → 영역 캡처 → 엑셀 입출력까지 시나리오 확장 가능.

---

## 5-1. 이번 세션에서 적용한 수정

| 항목                                         | 상태                                      |
| -------------------------------------------- | ----------------------------------------- |
| P2 번들 축소(모달 dynamic + xlsx 지연)       | ✅ 적용 — First Load **448→297 kB**       |
| P3 `innerHTML` 동적 값 이스케이프(XSS)       | ✅ 적용                                   |
| P5 훅 의존성 정리(경고 6→0)                  | ✅ 적용                                   |
| P6 로드뷰 디버그 로그 프로덕션 가드          | ✅ 적용                                   |
| P7a beforeInteractive → 인라인 script        | ✅ 적용                                   |
| P7b `as any` ~30곳 타입 뷰로 치환            | ✅ 적용                                   |
| P7c ESLint CLI 마이그레이션                  | ✅ 적용                                   |
| P1 `@ts-nocheck` 제거 + 21개 타입 오류 수정  | ✅ 적용 — **엑셀 왕복 테스트 18/18 통과** |
| P4 죽은 코드(`computeCaptureOverlayOffsets`) | 보존(사용자 요청)                         |
| 캡처 흰색 구간(타일 미로드) 대기 강화        | ✅ 이전 단계 적용                         |
| 캡처 정보창 → 국소명+주소 텍스트 라벨        | ✅ 이전 단계 적용                         |

**최종 검증**: `tsc --noEmit` ✅(0 오류) · `next build` ✅ · `eslint .` **→ 0 문제(오류·경고 0)** · 엑셀 왕복 무결성 테스트 18/18 ✅ · **Playwright E2E 스모크 2/2 ✅**

---

## 5-2. 대형 파일 분할

### ✅ 완료 (검증됨: tsc·eslint·next build 모두 통과)

| 원본 파일 | 조치 | 결과 |
| --- | --- | --- |
| `kakao-map-canvas.tsx` (1,118) | 순수 DOM 빌더(`createOverlayContent`, `createCaptureLabelContent`, `formatJibunAddress`, `escapeHtml`)를 `lib/overlay-content.ts`로 분리 | **1,118 → 728** + `overlay-content.ts` 413 |
| `lib/map-capture-stitch.ts` (809) | 폴더 `map-capture-stitch/`로 분할 후 `index.ts` 재수출(import 경로 그대로 유지). `types`/`helpers`/`bounds`/`plan`/`capture` 5개 모듈 | 최대 파일 **352줄** (plan) |

> 분할 원칙: 순수 함수/타입만 이동해 런타임 결합이 없는 안전한 경계만 절단. 소비 측 import 경로는 변경 없음.

### ✅ 추가 완료 (2차)

| 원본 파일 | 조치 | 결과 |
| --- | --- | --- |
| `lib/excel/data-manager.ts` (1,144) | 폴더 `data-manager/`로 분할: `date-utils`/`info-records`/`headers`/`parse`/`export` 그룹 객체(`ThisType<any>`)를 `index.ts`에서 합성. `this` 상호호출 그대로 동작. `shared.ts`(FACILITY_TEAM 헬퍼) | 최대 **505줄**(parse). **엑셀 왕복 테스트 11/11 통과**(좌표 정밀도·`this` 호출 검증) |
| `components/modals/marker-edit-modal.tsx` (814) | 장비/축전지 **사양 리스트 UI를 `marker-edit-spec-lists.tsx`**(`EquipmentSpecList`/`BatterySpecList`)로 추출 | **814 → 618** + 257 |
| `components/map/map-region-capture-panel.tsx` (675) | 렌더(프레젠테이션)를 **`map-region-capture-panel-view.tsx`**(`CapturePanelView`)로 분리, 로직/상태는 원본이 소유 | **675 → 483** + 300 |

> 모든 분할 후 `tsc`(0) · `eslint .`(0) · `next build`(성공, 번들 297 kB 유지) 통과. data-manager는 Node 왕복 무결성 테스트로 런타임 동작까지 재확인.

**결과: 5개 대형 파일 분할 후 최대 단일 파일 728줄**(kakao-map-canvas), 나머지는 대부분 300~600줄대로 정리됨.

---

## 6. 운영 메모 (참고)

- 개발 중 dev 서버가 3000/3001 **두 개**로 떠서, 브라우저가 옛 포트(3001)를 보며 "수정이 반영 안 됨"으로 오인한 사례 있었음. `npm run dev` 시 터미널의 **Local 포트**를 확인하고 접속할 것.
- 현재 최신 코드 dev 서버는 `localhost:3000` 단일 실행 중.
