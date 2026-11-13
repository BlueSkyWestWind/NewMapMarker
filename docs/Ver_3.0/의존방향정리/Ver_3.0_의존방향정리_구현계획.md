# 의존 방향 정리 구현계획

> **실행 방식:** 구현(코드 작성)은 agy가 하고, Claude가 diff를 검토해 틀린 곳을 고친다. 단계는 체크박스(`- [ ]`)로 추적한다.

**Goal:** `src/features/map-marker`에 있는 공용 인증·권한 4개 파일을 `src/lib/auth/`로 옮겨 다른 피처가 `map-marker`를 거치지 않고 인증을 쓰게 하고, `src/lib/arch-guard.test.ts`로 `lib`이 `features`를 import하는 재발을 막는다.

**Architecture:** 가드 테스트를 먼저 세운 뒤 파일 4개와 테스트 1개를 옮기고, `src/`·`e2e/` 전체의 import 경로를 한 번에 바꾼 뒤 원본을 삭제한다. 임시 re-export는 두지 않는다.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript (`strict`) · TanStack Query · Vitest. 의존성 추가 없음.

**Spec:** [Ver_3.0_의존방향정리_설계.md](Ver_3.0_의존방향정리_설계.md)

## Global Constraints

- **커밋하지 않는다.** 사용자가 "커밋"을 명시적으로 요청할 때만 커밋한다.
- 패키지 매니저는 `npm`, shadcn 컴포넌트 추가·Supabase 로컬 실행은 하지 않는다.
- **문서(`docs/`, `AGENTS.md`, `README.md`)는 수정하지 않는다.** 코드와 테스트만 바꾼다.
- **동작 변경 없음.** 옮기는 4개 파일의 내용·시그니처·`"use client"` 지시어는 그대로 둔다. import 경로만 바꾼다.
- **검증 명령**: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`.
- 기존 줄바꿈(CRLF/LF)을 파일마다 유지한다. 옮긴 파일은 원본의 줄바꿈을 그대로 가져가고, 한글이 깨지지 않았는지 확인한다.
- 셸 내비 상태(`activeNav`·`mapSegment`)와 `useShellStore`는 건드리지 않는다(설계 §4).

## Review Focus

1. 옛 import 경로가 `src/`·`e2e/` 어디에도 남지 않았는지 (Task 2, Step 4의 grep으로 확인).
2. `src/lib/auth/`가 어떤 `@/features/**`도 import하지 않는지, 허용 예외가 `kakao-route-upstream.ts` 1건뿐인지 (Task 1의 가드 테스트로 확인).
3. 옮긴 파일의 내용이 원본과 같은지, 특히 `"use client"` 지시어와 `getSupabaseBrowserClient`·`SupabaseBrowserClient` import (Task 2, Step 2 diff 확인).
4. 원본 4개와 구 `admin.test.ts`가 삭제됐는지 (Task 2, Step 5).

---

### Task 1: 의존 방향 가드 테스트 `src/lib/arch-guard.test.ts`

**Files:**
- Create: `src/lib/arch-guard.test.ts`

**Interfaces:** 내부 전용. 외부에서 쓰지 않는다.

**Steps:**
- [ ] `src/lib/` 아래 모든 `.ts`·`.tsx` 파일(테스트 파일 `*.test.ts` 제외)을 읽어 `@/features/` 문자열을 import하는 파일이 없음을 단언하는 테스트 1개를 쓴다. 테스트 이름: `src/lib은 src/features를 import하지 않는다`. 허용 예외(ALLOW)는 `src/lib/api/kakao-route-upstream.ts` 1건이며(`@/features/route/types/route` 타입 import, 후속 작업에서 타입을 옮길 때까지), 이유를 주석으로 적는다. 그 밖의 위반 파일이 있으면 파일 경로 목록이 실패 메시지에 나오게 한다. 파일 목록은 `node:fs`로 재귀 탐색한다(새 의존성 금지, `src/lib/style-guard.test.ts`가 같은 방식이면 그 방식을 따른다).
- [ ] 실행: `npx vitest run src/lib/arch-guard.test.ts` → 1 passed.

---

### Task 2: 인증·권한 모듈을 `src/lib/auth/`로 이동

**Files:**
- Create (원본 내용 그대로 이동): `src/lib/auth/auth-provider.tsx` ← `src/features/map-marker/providers/auth-provider.tsx`, `src/lib/auth/use-auth-session.ts` ← `src/features/map-marker/hooks/use-auth-session.ts`, `src/lib/auth/use-is-admin.ts` ← `src/features/map-marker/hooks/use-is-admin.ts`, `src/lib/auth/admin.ts` ← `src/features/map-marker/lib/admin.ts`, `src/lib/auth/admin.test.ts` ← `src/features/map-marker/lib/admin.test.ts`
- Modify: `src/`와 `e2e/` 안에서 위 4개 파일을 import하는 모든 파일(약 45개. `src/app/providers.tsx` 포함. 실제 목록은 grep으로 구한다)
- Delete: 원본 5개

**Interfaces:** 이동 후 공개 시그니처는 원본과 같다.
```ts
export function AuthProvider({ children }: { children: ReactNode }): JSX.Element;
export function useAuthSession(): AuthContextValue;
export function useIsAdmin(): { isAdmin: boolean; isLoading: boolean };
export async function fetchIsAppAdmin(supabase: SupabaseBrowserClient, userId: string): Promise<boolean>;
```

**Steps:**
- [ ] 이동 전 기준선: `npx tsc --noEmit && npm test`가 통과하는지 확인한다(실패하면 이동하지 말고 보고한다).
- [ ] 위 5개 파일을 `src/lib/auth/`로 옮긴다. 내용은 그대로 두고, 파일 안에서 서로를 부르는 import(`use-is-admin.ts`가 `use-auth-session`·`admin`을, `admin.test.ts`가 `./admin`을)만 `@/lib/auth/*`(또는 상대 경로)로 맞춘다.
- [ ] `src/`와 `e2e/` 전체(테스트 파일 포함)에서 다음 import 경로를 `@/lib/auth/*`로 바꾼다: `@/features/map-marker/providers/auth-provider` → `@/lib/auth/auth-provider`, `@/features/map-marker/hooks/use-auth-session` → `@/lib/auth/use-auth-session`, `@/features/map-marker/hooks/use-is-admin` → `@/lib/auth/use-is-admin`, `@/features/map-marker/lib/admin` → `@/lib/auth/admin`. `map-marker` 안에서 쓰는 상대 경로 import(`../hooks/use-auth-session` 등)도 같이 찾아 바꾼다.
- [ ] 확인: `grep -rn "map-marker/providers/auth-provider\|map-marker/hooks/use-auth-session\|map-marker/hooks/use-is-admin\|map-marker/lib/admin" src e2e`와 `src/features/map-marker` 안의 상대 경로(`/use-auth-session"`, `/use-is-admin"`, `/auth-provider"`, `/admin"`로 끝나는 import 중 새 위치가 아닌 것)가 결과 0건이어야 한다.
- [ ] 원본 5개(`map-marker`의 `providers/auth-provider.tsx`, `hooks/use-auth-session.ts`, `hooks/use-is-admin.ts`, `lib/admin.ts`, `lib/admin.test.ts`)를 삭제한다. `providers/` 폴더가 비면 폴더도 지운다.
- [ ] 실행: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` → 오류 0건, 전체 테스트 통과, `arch-guard.test.ts` 통과.

---

### Task 3: 빌드 확인 (Claude가 한다)

**Steps:**
- [ ] 개발 서버가 떠 있으므로 임시 `distDir` 빌드로 `npx next build`가 성공하는지, 홈 First Load JS가 직전 측정(301 kB)에서 늘지 않았는지 확인한다. 설정 파일(`next.config.ts`, `tsconfig.json`, `next-env.d.ts`)을 원복한다.
- [ ] `git status`로 의도치 않은 변경이 없는지 확인한다.
