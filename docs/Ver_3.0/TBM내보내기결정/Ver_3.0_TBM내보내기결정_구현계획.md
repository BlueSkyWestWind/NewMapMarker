# TBM 엑셀 내보내기 결정 구현계획

> **실행 방식:** 구현(코드 작성)은 agy가 하고, Claude가 diff를 검토해 틀린 곳을 고친다. **2026-11-15 사용자가 삭제(A)로 결정했다. Task A와 공통 Task만 한다(B·C는 해당 없음).**

**Goal:** `export-tbm.ts`의 처리(삭제·복원·보류 유지)를 사용자가 고른 대로 실행하고, 태풍 모달의 TBM 안내 문구를 화면 상태와 맞춘다.

**Architecture:** 선택지별 독립 Task(A·B·C)로 쓰고, 공통 Task(문구 수정)는 모든 선택에 적용한다.

**Tech Stack:** Next.js 15 · TypeScript · `xlsx`(지연 로드) · Vitest. 의존성 추가 없음.

**Spec:** [Ver_3.0_TBM내보내기결정_설계.md](Ver_3.0_TBM내보내기결정_설계.md)

## Global Constraints

- **커밋하지 않는다.** 사용자가 "커밋"을 요청할 때만 커밋한다.
- **문서(`docs/`, `AGENTS.md`, `README.md`)는 수정하지 않는다.** AGENTS.md의 "복원/삭제 결정 전까지 파일만 남겨 둔다" 문장 정리는 Claude가 한다.
- `xlsx`는 정적 import하지 않는다(홈 번들 보호).
- **검증 명령**: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`.
- 기존 줄바꿈(CRLF/LF)을 파일마다 유지한다. 한글이 깨지지 않았는지 확인한다.

## Review Focus

1. 삭제(A) 뒤 `src`에 `export-tbm`·`exportTbmWorkbook` 문자열이 남지 않았는지 (Task A, Step 2).
2. 복원(B)에서 `xlsx`가 홈 청크에 섞여 들어가지 않았는지 (Task B, Step 5 빌드 비교).
3. 태풍 모달 문구가 선택한 방향과 맞는지 — 삭제면 "출력" 안내가 없어야 하고, 복원이면 출력 위치를 말해야 한다 (공통 Task).

---

### Task A: 삭제 (설계 §6에서 A를 고른 경우)

**Files:**
- Delete: `src/features/worksite-weather/lib/export-tbm.ts`

**Steps:**
- [ ] `grep -rn "export-tbm\|exportTbmWorkbook" src e2e`로 참조가 파일 자신뿐인지 확인한다. 다른 참조가 있으면 지우지 말고 보고한다.
- [ ] 파일을 삭제하고 같은 `grep`이 0건인지 확인한다.
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

---

### Task B: 복원 (설계 §6에서 B를 고른 경우)

세부(버튼 위치·서식)는 설계 §6 항목 2의 답으로 정한다. 아래는 기준안이다.

**Files:**
- Modify: 버튼을 둘 컴포넌트(위치는 사용자 선택에 따라 `dashboard-panel.tsx` 또는 국소 상세)
- Create (필요하면): `src/features/worksite-weather/lib/tbm-input.ts`, `src/features/worksite-weather/lib/tbm-input.test.ts` — 현재 대시보드 데이터에서 `exportTbmWorkbook`의 입력(`SiteMatch`, `WorksiteWeatherResponse`)을 만드는 변환
- Create: `src/features/worksite-weather/lib/export-tbm.test.ts` — `buildRows` 결과 검증(`buildRows`를 `export`하거나 테스트용으로 분리)

**Interfaces:**
```ts
// lib/tbm-input.ts (현재 데이터 모양이 입력 타입과 다를 때만)
export function toTbmInput(/* 대시보드 행 데이터 */): { site: SiteMatch; data: WorksiteWeatherResponse } | null;
// lib/export-tbm.ts
export async function exportTbmWorkbook(site: SiteMatch, data: WorksiteWeatherResponse): Promise<void>; // 변경 없음
```

**Steps:**
- [ ] 대시보드가 쓰는 데이터(기상청 저장 데이터)와 `WorksiteWeatherResponse`·`SiteMatch`의 필드를 비교해 표로 보고한다(어느 필드가 있고 없는지). 변환이 불가능한 필수 필드가 있으면 구현을 멈추고 보고한다.
- [ ] 실패하는 테스트를 먼저 쓴다 `export-tbm.test.ts`: 고정 입력으로 `buildRows` 결과의 첫 행(제목), 국소명·주소·작업 형태 행, 조회 일자 행을 단언한다(작업 형태 `elevated`는 "옥상·철탑(고소)", 그 밖은 "지상"). 실행 → `buildRows`가 export되지 않아 FAIL.
- [ ] 변환 함수가 필요하면 입력 → 기대 출력 단언 테스트를 먼저 쓰고 구현한다.
- [ ] 버튼을 추가하고 `exportTbmWorkbook`을 지연 로드(`import()`)로 호출한다. 클릭 중에는 버튼을 비활성화한다.
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건. Claude가 임시 distDir 빌드로 홈 First Load JS를 직전(301 kB)과 비교한다.

---

### Task C: 보류 유지 (설계 §6에서 C를 고른 경우)

**Steps:**
- [ ] 코드는 바꾸지 않는다. 공통 Task만 한다.

---

### 공통 Task: 태풍 모달 안내 문구 정리

**Files:**
- Modify: `src/features/worksite-weather/components/typhoon-modal.tsx` (약 429~431줄)

**Steps:**
- [ ] A 또는 C: "3. 작업 전 TBM 엑셀 출력 및 안전교육 실시" 항목의 "TBM 엑셀 출력" 표현을 화면에서 할 수 있는 일(당일 기상 상황 확인·안전교육 실시·비상 연락망 재확인)로 바꾼다. 문장의 의미와 톤은 유지하고, 새 기능을 암시하지 않는다.
- [ ] B: 문구를 버튼 이름·위치와 맞춘다(예: 대시보드의 [TBM 엑셀] 버튼으로 출력). 버튼 이름은 Task B에서 정한 것과 같아야 한다.
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

---

### 마무리 (Claude)

**Steps:**
- [ ] agy diff를 읽고 줄바꿈 변경·불필요한 파일 수정을 확인해 고친다.
- [ ] `AGENTS.md`의 "TBM 엑셀 내보내기(`export-tbm.ts`)는 … 복원/삭제 결정 전까지 파일만 남겨 둔다" 문장을 결정 결과에 맞게 고치고(삭제면 문장 삭제, 복원이면 위치 안내, 보류면 유지), `docs/README.md` 표에 `TBM내보내기결정/` 행을 더한다.
- [ ] 구현 문서에 결정과 이유, 복원 경로(삭제한 경우 커밋 `46fb126`·`8764d75`)를 적는다.
