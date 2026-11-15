# 정확성 보강 구현계획

> **실행 방식:** 구현(코드 작성)은 agy가 하고, Claude가 diff를 검토해 틀린 곳을 고친다. 단계는 체크박스(`- [ ]`)로 추적한다. **설계 §6의 확인(특히 `NEXT_PUBLIC_KAKAO_REST_API_KEY` 설정 여부와 테스트 위치)이 끝난 뒤에 시작한다.**

**Goal:** 오래된 비동기 응답이 최신 상태를 덮는 두 곳, UTC 기준 날짜 11곳, `kakao-static-map` 입력 검증, `survey_settings` 트리거 함수의 `search_path`를 고친다.

**Architecture:** 규칙은 순수 모듈 3개(`latest-request`, `local-date`, `parseStaticMapParams`)로 빼서 테스트하고, 훅·컴포넌트·라우트는 그 모듈을 부르기만 한다. Task마다 TDD(실패 확인 → 구현 → 통과)로 진행한다.

**Tech Stack:** TypeScript · React 19 · Next.js 15 · Vitest · Supabase(SQL 마이그레이션). 의존성 추가 없음.

**Spec:** [Ver_3.0_정확성보강_설계.md](Ver_3.0_정확성보강_설계.md)

## Global Constraints

- **커밋하지 않는다.** 사용자가 "커밋"을 요청할 때만 커밋한다.
- **문서(`docs/`, `AGENTS.md`, `README.md`, `supabase/migrations/README.md`)는 수정하지 않는다.** SQL 마이그레이션 파일 1개는 만든다.
- **Supabase를 로컬에서 실행하지 않는다.** 마이그레이션은 파일만 만들고 사용자가 적용한다.
- **동작 변경은 결함 수정 범위로 한정한다.** 마크업·문구·effect 의존성 배열은 바꾸지 않는다(cleanup만 더한다).
- **모든 명령은 포그라운드로 실행하고 출력이 화면에 보이게 한다. 백그라운드 작업(background task, `&`, `Start-Process`)으로 돌려 두고 기다리지 않는다.**
- **검증 명령**: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`.
- 기존 줄바꿈(CRLF/LF)을 파일마다 유지한다. 새 파일은 같은 폴더 파일의 줄바꿈을 따른다. BOM 없는 UTF-8.

## Review Focus

1. 훅의 effect cleanup이 `invalidate()`를 부르고, 캐시 적중 경로를 오히려 막지 않는지 (Task 2, diff 검토).
2. `localDateIso`가 로컬 달력(`getFullYear/getMonth/getDate`)을 쓰고 `toISOString`을 쓰지 않는지, 11곳이 모두 바뀌었는지 (Task 3, Step 4의 `grep`).
3. `export.ts`의 메서드 안에서 `this`를 건드리지 않았는지 (Task 3, diff).
4. 폴백 제거 뒤에도 키가 없을 때 기존 안내 오류(500)가 그대로 나는지 (Task 4 테스트).
5. 마이그레이션 SQL이 설계의 한 줄과 같고, 기존 파일을 고치지 않았는지 (Task 5).

---

### Task 1: `lib/latest-request.ts`

**Files:**
- Create: `src/lib/latest-request.ts`, `src/lib/latest-request.test.ts`

**Interfaces:**
```ts
export interface RequestTicket { isCurrent(): boolean }
export interface LatestRequest { begin(): RequestTicket; invalidate(): void }
export function createLatestRequest(): LatestRequest;
```

**Steps:**
- [ ] 실패하는 테스트를 먼저 쓴다 `latest-request.test.ts`: ① `begin()` 한 번 → 티켓 `isCurrent()`가 `true`. ② `begin()` 두 번 → 첫 티켓은 `false`, 둘째는 `true`. ③ `begin()` 뒤 `invalidate()` → `false`, 그 뒤 새 `begin()` 티켓은 `true`. ④ 서로 다른 `createLatestRequest()` 인스턴스는 서로 영향을 주지 않는다. 실행: `npx vitest run src/lib/latest-request.test.ts` → 모듈 없음으로 FAIL.
- [ ] `createLatestRequest`를 구현한다(내부 증가 카운터와 티켓이 만들 때의 값을 비교). 실행 → PASS.
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

---

### Task 2: 두 훅에 "마지막 요청만" 적용

**Files:**
- Modify: `src/features/map-marker/hooks/use-marker-gps-info.ts`
- Modify: `src/features/map-marker/components/modals/marker-detail-modal.tsx` (`fetchDetail` effect)

**Steps:**
- [ ] `use-marker-gps-info.ts`: `const latestRef = useRef(createLatestRequest())`를 둔다. `loadGpsInfo`에서 **캐시에 없을 때만** 네트워크 요청 직전에 `const ticket = latestRef.current.begin()`을 만들고, `await runSingleLookup(...)` 뒤 `setGpsInfo`·`setGpsError`·`setGpsLoading` 호출(성공·실패·`finally` 모두)을 `if (!ticket.isCurrent()) return`으로 건너뛴다. 마커·모달이 바뀔 때(`resetKey` effect)와 언마운트 때 `latestRef.current.invalidate()`를 부른다. 캐시 적중 경로는 그대로 둔다.
- [ ] `marker-detail-modal.tsx`: `fetchDetail` effect 안에서 `const ticket = latest.begin()`(이 effect 전용 `createLatestRequest()` 또는 컴포넌트 `useRef`)을 만들고, 두 번의 `await` 뒤 `setDetailedInfo`·`setIsLoading` 호출 전에 `if (!ticket.isCurrent()) return`을 둔다. effect cleanup `return () => latest.invalidate()`를 더한다. **의존성 배열은 바꾸지 않는다.**
- [ ] 두 변경 모두 화면 확인용이다. 훅·컴포넌트 렌더 테스트는 쓰지 않는다(Task 1의 모듈 테스트가 규칙을 지킨다).
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

---

### Task 3: `lib/local-date.ts`와 11곳 교체

**Files:**
- Create: `src/lib/local-date.ts`, `src/lib/local-date.test.ts`
- Modify: `src/features/schedule/lib/week.ts`(`todayIso`를 `localDateIso` 호출 한 줄로), 그리고 설계 §2.2 표의 11곳: `components/ui/multi-date-picker.tsx`, `map-marker/api.ts`(3), `map-marker/lib/excel/data-manager/export.ts`(3), `.../parse.ts`(2), `map-marker/lib/excel-upload-helpers.ts`(2)

**Interfaces:**
```ts
export function localDateIso(now?: Date): string; // "YYYY-MM-DD", 로컬 달력 기준
```

**Steps:**
- [ ] 실패하는 테스트를 먼저 쓴다 `local-date.test.ts`(파일 맨 위에서 `process.env.TZ = "Asia/Seoul"`): `localDateIso(new Date(2026, 10, 15, 0, 30))` → `"2026-11-15"`, `localDateIso(new Date(2026, 11, 1, 0, 30))` → `"2026-12-01"`, `localDateIso(new Date(2026, 0, 1, 0, 5))` → `"2026-01-01"`, `localDateIso(new Date(2026, 10, 15, 23, 59))` → `"2026-11-15"`. 같은 입력에서 옛 방식 `toISOString().slice(0,10)`은 앞의 세 입력에서 전날이 나온다는 사실을 테스트 안 주석으로 적는다(근거). 실행 → 모듈 없음으로 FAIL.
- [ ] `localDateIso`를 구현한다(`getFullYear`·`getMonth() + 1`·`getDate`, 두 자리 0 채움). 실행 → PASS. 기존 `week.test.ts`의 `todayIso` 테스트가 있으면 함께 통과해야 한다.
- [ ] `week.ts`의 `todayIso(now)`를 `localDateIso(now)` 호출로 바꾼다(export 이름 유지). 11곳을 `localDateIso()`로 바꾼다.
- [ ] 확인: `grep -rnE "toISOString\(\)\.(slice\(0, ?10\)|split\(.T.\)\[0\])" src --include=*.ts --include=*.tsx`에서 테스트 파일 외 **0건**이어야 한다. 출력을 보고에 붙인다.
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

---

### Task 4: `kakao-static-map` 입력 검증과 키 폴백 제거 (설계 §6 항목 1이 허락한 경우)

**Files:**
- Create: `src/app/api/kakao-static-map/params.ts`, `src/app/api/kakao-static-map/params.test.ts`
- Modify: `src/app/api/kakao-static-map/route.ts`

**Interfaces:**
```ts
export interface StaticMapParams { lat: number; lng: number; level: number; width: number; height: number; mapType: "ROADMAP" | "SKYVIEW" }
export function parseStaticMapParams(params: URLSearchParams): StaticMapParams | { error: string };
```

**Steps:**
- [ ] 실패하는 테스트를 먼저 쓴다 `params.test.ts`: ① 정상값(`lat=37.5&lng=127&level=3&width=600&height=400`) → 그대로. ② `lat`가 숫자가 아님 → `{ error }`(기존 400 메시지와 같은 문구). ③ `level=abc` → `level: 3`, `width=abc`·`height=abc` → 600·400. ④ `width=99999` → 기존 `MAX_SIZE` 상한으로 자름. ⑤ `width=601` → 600(짝수). ⑥ `mapType=roadmap` → `"ROADMAP"`, 그 밖 → `"SKYVIEW"`. 실행 → 모듈 없음으로 FAIL.
- [ ] `params.ts`를 구현하고(`toEvenSize`·`MAX_SIZE`는 route에서 옮기거나 export해서 재사용), `route.ts`가 이를 쓰게 한다. 기존 응답 코드·문구는 바꾸지 않는다.
- [ ] `route.ts`에서 `process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY` 폴백을 지운다. 키가 없을 때의 500 안내 오류 경로는 그대로다.
- [ ] 실행: `npx vitest run src/app/api/kakao-static-map/params.test.ts` → PASS, `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

---

### Task 5: `survey_settings` 트리거 함수 `search_path` 마이그레이션

**Files:**
- Create: `supabase/migrations/20261120000000_survey_settings_search_path.sql`

**Steps:**
- [ ] 파일 내용은 머리 주석(목적, 적용 방법: SQL Editor에서 실행)과 아래 한 줄이다. 기존 마이그레이션 파일은 수정하지 않는다.
```sql
ALTER FUNCTION public.touch_survey_settings_updated_at() SET search_path = '';
```
- [ ] 다른 마이그레이션의 머리 주석 형식을 따른다(`supabase/migrations/20261117000100_split_jibun_from_road_address.sql`의 머리를 참고).
- [ ] Supabase는 실행하지 않는다. 파일이 UTF-8(BOM 없음)이고 이름 순서가 마지막 파일(`20261119000000_login_history.sql`)보다 뒤인지 확인한다.

---

### Task 6: 검증과 정리 (Claude)

**Steps:**
- [ ] agy diff를 전부 읽는다. 특히 두 훅의 cleanup과 캐시 경로, `export.ts`의 `this` 보존, 11곳 교체 누락, 마이그레이션이 설계 한 줄과 같은지.
- [ ] `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test`를 직접 돌리고, 임시 distDir 빌드로 홈 First Load JS가 282 kB에서 늘지 않았는지 확인한다.
- [ ] 문서(Claude): `README.md` 구조 트리에 `features/site-survey/` 줄 추가, `supabase/migrations/README.md` 표와 실행 순서에 새 마이그레이션 추가, README의 마이그레이션 개수 문구 갱신, `docs/README.md` 표에 행 추가, 구현 문서 작성.
- [ ] 구현 문서 "직접 하실 일"에 ① 새 마이그레이션 SQL 적용 ② 화면 확인(마커를 빠르게 바꿔 가며 상세 창의 GPS·표가 섞이지 않는지, KST 오전에 일정 선택기가 오늘 달로 열리는지, 내보내기 파일 이름 날짜)을 적는다.
