# zod 업그레이드 구현계획

> **실행 방식:** 구현(코드 작성)은 agy가 하고, Claude가 diff를 검토해 틀린 곳을 고친다. 단계는 체크박스(`- [ ]`)로 추적한다. **설계 §6의 결정(올릴지)이 정해진 뒤에 시작한다.**

**Goal:** `zod`를 3.25.76에서 4.6.7로 올려 `npm audit`의 zod 높음 경고를 없애고, 동작이 바뀌지 않았음을 테스트로 확인한다.

**Architecture:** 먼저 현재 동작을 고정하는 테스트를 보강하고(Task 1), 의존성을 올리고 호환 변경 1~2줄을 적용한 뒤(Task 2), 번들·감사 결과를 확인한다(Task 3).

**Tech Stack:** `zod` 3 → 4 · TypeScript 5.9 · Next.js 15 · Vitest.

**Spec:** [Ver_3.0_zod업그레이드_설계.md](Ver_3.0_zod업그레이드_설계.md) · 조사: [Ver_3.0_zod업그레이드_조사.md](Ver_3.0_zod업그레이드_조사.md)

## Global Constraints

- **커밋하지 않는다.** 사용자가 "커밋"을 요청할 때만 커밋한다.
- **문서(`docs/`, `AGENTS.md`, `README.md`)는 수정하지 않는다.**
- `package.json`과 `package-lock.json`만 의존성 변경 대상이다. 다른 패키지를 올리지 않는다. `npm audit fix`·`--force`는 쓰지 않는다(옛 버전으로 내리라는 잘못된 제안이 나온다).
- **모든 명령은 포그라운드로 실행하고 출력이 화면에 보이게 한다. 백그라운드 작업(background task, `&`, `Start-Process`)으로 돌려 두고 기다리지 않는다.**
- **검증 명령**: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`.
- 기존 줄바꿈(CRLF/LF)을 파일마다 유지한다. BOM 없는 UTF-8.
- 이 작업 중 개발 서버(3000)가 떠 있을 수 있다. `npx next build`는 임시 `distDir`로만 한다(Claude가 한다).

## Review Focus

1. 이전 전에 쓴 특성화 테스트가 **이전 후에도 같은 기대값으로** 통과하는지 (Task 1과 Task 2의 테스트 파일 diff가 기대값을 바꾸지 않았는지).
2. `package-lock.json`에서 `zod`가 4.6.7(또는 고정 버전) 한 벌만 있고, 다른 패키지가 옛 zod를 끌고 오지 않는지 (Task 2, `npm ls zod`).
3. 소스 변경이 설계 §3.1의 1~2줄뿐인지 (Task 2, diff).
4. `npm audit --omit=dev`에서 zod 항목이 사라졌는지, 그리고 나머지 취약점 목록이 늘지 않았는지 (Task 3).

---

### Task 1: 이전 전 특성화 테스트 보강

**Files:**
- Modify or Create: `src/features/site-survey/lib/settings-schema.test.ts` (없으면 만든다), `src/app/api/kakao-route/route.test.ts`

**Steps:**
- [ ] 기준선: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test`가 통과하는지 확인한다(실패하면 멈추고 보고한다).
- [ ] 이미 있는 테스트를 읽고 어떤 입력을 다루는지 목록으로 정리한다(`settings-schema`: `parseOverrides`의 정상값, 잘못된 값, 알 수 없는 키 / `kakao-route`: 정상 본문, 필수 필드 누락, 형식 오류).
- [ ] 빠진 케이스의 특성화 테스트를 **현재 코드에서 먼저 통과하도록** 쓴다. 기대값은 코드가 돌려준 값을 베끼지 말고, 입력에서 스키마(`settings-schema.ts`, `route.ts`의 `bodySchema`)가 요구하는 것을 읽어 독립적으로 정한다. 필수 케이스: ① `settings-schema`의 `record` 필드(`z.record(sourceRef)`가 쓰이는 필드)에 정상 객체와 값 타입이 틀린 객체. ② `kakao-route`에 `stops` 32개(상한 31 초과) → 400, `stops` 0개(`min(1)` 위반) → 400, `lat`에 `Infinity` 또는 문자열 → 400. ③ `settings-schema`가 오류를 돌려줄 때 문구를 **고정하지 않는다**(문구가 v4에서 바뀔 수 있다). 대신 오류가 있다는 사실과 `path`를 단언한다.
- [ ] 실행: 새 테스트가 **현재(3.25.76)에서 통과**하는지 확인한다. `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건.

---

### Task 2: 의존성 올리기와 호환 수정

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `src/features/site-survey/lib/settings-schema.ts` (21줄 부근 `z.record`)
- Modify (선택): `src/app/api/kakao-route/route.ts` (`.finite()` 제거)

**Steps:**
- [ ] 공급망 확인: `npm view zod@4.6.7 dist.integrity dist.tarball`을 실행해 보고에 붙인다. `npm audit signatures`가 가능하면 실행하고 결과를 붙인다(실패하거나 지원하지 않으면 그대로 보고한다). 이상이 보이면 여기서 멈추고 보고한다.
- [ ] 실행: `npm install zod@^4.6.7`. 그 외 패키지의 버전이 바뀌지 않았는지 `git diff package.json`과 락파일 변경 요약으로 확인한다(zod 관련 줄 외 변경이 크면 보고한다).
- [ ] 실행: `npm ls zod` → 한 벌(4.x)만 나와야 한다. 옛 3.x가 다른 패키지 아래에 있으면 보고한다.
- [ ] `npx tsc --noEmit`을 실행해 실제로 깨지는 곳을 확인한다(예상: `settings-schema.ts:21`). 컴파일 오류가 설계 §3.1의 항목과 같은지 비교하고, 다른 곳이 깨지면 보고한다.
- [ ] `settings-schema.ts`의 `z.record(sourceRef)`를 `z.record(z.string(), sourceRef)`로 바꾼다. 설계 §3.1 항목 3(`.finite()` 제거)을 적용한다.
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건. Task 1의 테스트가 **기대값 변경 없이** 통과해야 한다. 문구를 고정한 기존 테스트가 실패하면 기대값을 새 문구로 바꾸지 말고, 어떤 문구가 어떻게 바뀌었는지 보고한다(Claude가 판단한다).

---

### Task 3: 번들과 감사 확인 (Claude가 한다)

**Steps:**
- [ ] agy diff를 읽는다: 소스가 설계의 1~2줄뿐인지, 테스트 기대값이 바뀌지 않았는지, 락파일에 zod 외 큰 변경이 없는지.
- [ ] `npm audit --omit=dev`를 다시 실행해 zod 항목이 사라지고 나머지 목록이 늘지 않았는지 확인한다.
- [ ] 임시 distDir 빌드로 홈 First Load JS(282 kB)와 현장실사서가 쓰는 청크의 크기를 전후 비교한다. 홈이 늘었으면 원인(zod가 홈 청크에 정적으로 들어왔는지)을 확인하고 사용자에게 알린다.
- [ ] 구현 문서에 결과를 적는다: 전후 `npm audit` 출력 요약, 번들 전후 표, 바뀐 소스 줄, 오류 문구가 바뀐 곳(있으면). "직접 하실 일": 현장실사서 설정 화면에서 잘못된 값을 저장해 보고 오류 안내가 자연스러운지 확인, 경로탐색을 한 번 실행.
