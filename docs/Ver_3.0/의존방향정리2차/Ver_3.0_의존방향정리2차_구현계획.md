# 의존 방향 정리 2차 구현계획

> **실행 방식:** 구현(코드 작성)은 agy가 하고, Claude가 diff를 검토해 틀린 곳을 고친다. 단계는 체크박스(`- [ ]`)로 추적한다.

**Goal:** 피처 사이에 새 의존이 생기지 않게 래칫 가드를 세운다. 셸 내비 상태 분리는 하지 않는다(설계 §3.2에서 대안 C로 정했다).

**Architecture:** `src/lib/arch-guard.test.ts`에 피처 간 의존 규칙을 더한다. 현재 의존 쌍을 허용 목록으로 고정하고, 목록에 없는 새 쌍과 목록에만 남은 사라진 쌍을 둘 다 실패로 잡는다.

**Tech Stack:** TypeScript · Vitest · `node:fs`. 의존성 추가 없음.

**Spec:** [Ver_3.0_의존방향정리2차_설계.md](Ver_3.0_의존방향정리2차_설계.md)

## 계획 변경 기록

원래 계획의 Task 2(내비 상태를 `use-nav-store.ts`로 분리)는 **삭제했다.** `setActiveNav`·`setMapSegment`가 `mode`·필터·선택·마커 표시·CCTV 상태를 한 번의 `set`으로 함께 바꾸고, 두 스토어로 나누면 각 상태가 따로 persist되어 어긋난 채 복원될 수 있다(설계 §3.2). 이 계획은 래칫 가드만 다룬다.

## Global Constraints

- **커밋하지 않는다.** 사용자가 "커밋"을 요청할 때만 커밋한다.
- **문서(`docs/`, `AGENTS.md`, `README.md`)는 수정하지 않는다.** 코드와 테스트만 바꾼다.
- **동작 변경 없음.** 소스(`src/features/**`)는 한 줄도 바꾸지 않는다. 테스트 파일 하나만 바꾼다.
- 새 의존성을 추가하지 않는다.
- **검증 명령**: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`.
- 기존 줄바꿈(CRLF/LF)을 유지하고 BOM 없는 UTF-8을 쓴다.

## Review Focus

1. 허용 목록이 사람이 쓴 값이 아니라 현재 코드에서 수집한 값인지, 각 쌍에 이유가 있는지 (Task 1, Step 3).
2. 가드가 새 쌍과 사라진 쌍을 둘 다 잡는지 — 임시로 허용 목록에서 한 쌍을 지워 보고, 가짜 import를 하나 더해 보아 각각 실패하는지 (Task 1, Step 4).
3. 테스트 파일과 주석·문자열 안의 `@/features/`를 잘못 세지 않는지 (Task 1, Step 1).

---

### Task 1: 피처 간 의존 래칫 가드

**Files:**
- Modify: `src/lib/arch-guard.test.ts` (기존 `no-lib-to-feature` 테스트 옆에 추가)

**Interfaces:**
```ts
// arch-guard.test.ts 내부
const ALLOWED_FEATURE_EDGES: Record<`${string}->${string}`, string>; // "shell->map-marker": 이유
const MAX_BIDIRECTIONAL_PAIRS: number;                                // 현재 양방향 쌍의 수
function collectFeatureEdges(): Map<string, string[]>;                // 쌍 → 근거 파일 목록
```

**Steps:**
- [ ] `src/features/<A>/**`(테스트 파일 `*.test.ts(x)`·`*.spec.ts(x)` 제외)에서 `@/features/<B>/`를 import하는 모든 쌍 `A->B`(A≠B)를 수집하는 함수를 쓴다. 수집은 `node:fs`로 하고(기존 `walk` 함수를 재사용), 주석 줄(`//`·`*` 시작)은 건너뛴다. `from "@/features/..."`와 `import("@/features/...")` 둘 다 센다.
- [ ] 테스트 2개를 쓴다. ① `feature-edges: 허용 목록과 현재 의존이 같다`: 목록에 없는 새 쌍은 `새 의존: A->B (근거 파일 최대 3개)`로, 목록에만 있는 사라진 쌍은 `해소된 의존: A->B (ALLOWED_FEATURE_EDGES에서 지운다)`로 실패 메시지를 낸다. ② `feature-edges: 양방향 쌍은 늘지도 줄지도 않는다`: 양방향 쌍(A->B와 B->A가 모두 있음)의 수가 `MAX_BIDIRECTIONAL_PAIRS`와 다르면 실패하고, 줄었을 때는 "값을 낮춘다"는 메시지를 낸다.
- [ ] 허용 목록과 최대값은 **현재 코드에서 수집한 값으로 채운다.** 임시로 빈 목록과 0으로 테스트를 돌려 실패 메시지에 나온 쌍을 그대로 옮기고, 각 쌍에 한 줄 이유를 적는다(예: `"map-marker->site-lists": "상세 모달이 국소 목록 소속 UI를 쓴다"`). 이유를 코드로 확인하지 못한 쌍은 `확인 필요`라고 적는다. 이유는 근거 파일을 한 곳 이상 읽고 쓴다.
- [ ] 가드가 실제로 동작하는지 확인한다(확인 뒤 원상 복구하고 보고한다): ① 허용 목록에서 쌍 하나를 임시로 지워 테스트가 `새 의존`으로 실패하는지. ② 어떤 피처 파일에 서로 다른 피처의 가짜 import 한 줄을 임시로 넣어(예: `cctv`가 `barcode`를 import) 테스트가 `새 의존`으로 실패하는지. ③ 허용 목록에 존재하지 않는 쌍을 임시로 더해 `해소된 의존`으로 실패하는지.
- [ ] 실행: `npx vitest run src/lib/arch-guard.test.ts` → 모든 테스트 통과.
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

---

### Task 2: 검증과 정리 (Claude가 한다)

**Steps:**
- [ ] agy diff를 전부 읽고, 소스가 한 줄도 바뀌지 않았는지(`git diff --stat -- src/features`가 비어 있음), 줄바꿈 변경과 불필요한 파일 수정이 없는지 확인한다.
- [ ] 허용 목록의 이유를 근거 파일 몇 곳과 대조해, 틀린 이유를 고친다. 양방향 쌍 목록을 구현 문서에 적는다.
- [ ] `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test`를 직접 돌린다.
- [ ] 구현 문서의 "직접 하실 일"은 없음으로 두고(화면 영향 없음), 후속 후보(인터페이스 주입, 내비 상태 재설계)를 한계에 적는다.
