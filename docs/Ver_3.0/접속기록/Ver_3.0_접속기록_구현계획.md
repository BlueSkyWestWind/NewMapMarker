# 접속기록 전용 테이블 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인·로그아웃을 `auth.sessions` 트리거로 `public.login_history`에 영구 기록하고, 계정설정의 접속 기록 창이 그 테이블만 읽게 한다. IP와 브라우저를 함께 남긴다.

**Architecture:** DB 쪽은 마이그레이션 한 파일(테이블·RLS·트리거·백필·1년 정리 cron)이다. 앱 쪽은 API 라우트가 서비스 키로 테이블을 직접 읽고, 순수 함수 `toLoginEvents`가 행을 `LoginEvent`로 바꾼다. 임시 코드(`mergeLoginEvents`)는 걷어 낸다.

**Tech Stack:** Supabase Postgres(트리거·pg_cron) · Next.js route handler · TypeScript · vitest. 의존성 추가 없음.

**Spec:** [Ver_3.0_접속기록_설계.md](Ver_3.0_접속기록_설계.md)

## Global Constraints

- **커밋하지 않는다.** 사용자가 "커밋"이라고 할 때만 한다. 각 Task 끝에는 `git status` 확인만 한다.
- **Supabase는 로컬 실행 금지.** 마이그레이션은 `supabase/migrations/20261119000000_login_history.sql` 파일로만 만들고 적용은 사용자가 한다. 운영 DB에 DDL을 직접 실행하지 않는다.
- 트리거 함수: `SECURITY DEFINER` · `SET search_path = ''` · 본문 `EXCEPTION WHEN OTHERS THEN NULL`(기록 실패가 로그인·로그아웃을 막지 않는다).
- `login_history.user_id`에 외래키를 걸지 않는다(계정 삭제 후에도 기록 유지). 보관 1년, 작업 이름 `login-history-cleanup`.
- 표는 셀 줄바꿈·가로 스크롤 금지(세로 스크롤만). 소스는 UTF-8, 읽은 줄바꿈(LF/CRLF)을 지킨다.
- 검증 명령: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`. 개발 서버가 떠 있으면 `next build`는 임시 `distDir`로만 한다. 홈 First Load JS는 **299 kB를 늘리지 않는다**.

## Review Focus

1. **마이그레이션 전에 API만 먼저 배포되면 접속 기록이 다시 빈다** → Task 3은 사용자가 마이그레이션을 적용·확인한 뒤에 한다(Task 2 끝의 체크포인트).
2. **`auth.sessions` 트리거 권한이 거부될 수 있다** → Task 1 Step 1에서 사용자가 확인 SQL을 먼저 돌린다. 거부되면 계획을 멈추고 설계 §5.3 대안으로 바꾼다(이 계획 밖).
3. **백필 재실행·트리거와 백필의 겹침으로 같은 세션이 두 번 들어간다** → 백필은 `NOT EXISTS (session_id, action='login')`로 멱등. 정적 테스트가 이 조건을 확인한다.
4. **`logout`의 IP·브라우저는 세션 생성 시점 값이다** → 화면 문구가 "마지막으로 기록된 IP"로 오해되지 않게 Task 3에서 안내한다.
5. **잘못된 `action` 값·null IP·null user_agent 행** → Task 2 테스트가 걸러내고 null을 보존한다.

---

## 파일 구조

| 파일 | 역할 | 동작 |
|---|---|---|
| `supabase/migrations/20261119000000_login_history.sql` | 테이블·인덱스·RLS·트리거·백필·cron | 신규 |
| `supabase/migrations/README.md` | 적용 목록에 한 줄 | 수정 |
| `src/features/accounts/lib/login-history-migration.test.ts` | SQL 파일에 필수 구문이 있는지 정적 확인 | 신규 |
| `src/features/accounts/types.ts` | `LoginEvent.userAgent?` 추가, 주석 정정 | 수정 |
| `src/features/accounts/lib/login-history.ts` | `toLoginEvents` 추가, `sessionsToLoginEvents`·`mergeLoginEvents` 제거 | 수정 |
| `src/features/accounts/lib/login-history.test.ts` | 변환 테스트로 교체 | 수정 |
| `src/app/api/admin/users/[id]/history/route.ts` | `login_history` 직접 조회 | 수정 |
| `src/features/accounts/components/account-history-dialog.tsx` | 문구·브라우저 표시 | 수정 |

---

### Task 1: 마이그레이션 파일

**Files:**
- Create: `supabase/migrations/20261119000000_login_history.sql`
- Modify: `supabase/migrations/README.md`
- Test: `src/features/accounts/lib/login-history-migration.test.ts`

**Interfaces:**
- Produces: 테이블 `public.login_history(id, occurred_at, user_id, email, action, ip, user_agent, session_id)` — Task 2·3이 이 열 이름을 읽는다. 함수 `public.handle_auth_session_event()`, 트리거 `on_auth_session_login_history`, cron `login-history-cleanup`.

- [ ] **Step 1 (사용자): 트리거 권한 확인** — 설계 §8.1의 확인 SQL을 Supabase SQL Editor에서 실행해 오류 없이 끝나는지 알려 달라고 한다. 권한 오류(`must be owner` 등)면 여기서 중단하고 설계 §5.3 대안으로 계획을 바꾼다.
- [ ] **Step 2: 실패하는 정적 테스트 작성** — `login-history-migration.test.ts`가 SQL 파일을 읽어 아래 문자열·패턴이 모두 있는지 단언한다(파일이 없으면 FAIL). 테스트 이름과 단언:
  - `테이블과 인덱스 2개`: `CREATE TABLE IF NOT EXISTS public.login_history`, `login_history_user_occurred_idx`, `login_history_occurred_idx`
  - `action CHECK`: `CHECK (action IN ('login', 'logout'))`
  - `외래키가 없다`: `REFERENCES` 가 없다
  - `RLS는 관리자 SELECT만`: `ENABLE ROW LEVEL SECURITY`, `login_history_select_admin`, `is_app_admin()`, `FOR INSERT|UPDATE|DELETE` 정책 없음
  - `트리거 함수는 SECURITY DEFINER·빈 search_path·예외 삼킴`: `SECURITY DEFINER`, `SET search_path = ''`, `EXCEPTION WHEN OTHERS`
  - `트리거는 auth.sessions INSERT·DELETE`: `AFTER INSERT OR DELETE ON auth.sessions`, `on_auth_session_login_history`
  - `백필은 멱등`: `NOT EXISTS`, `session_id`, `'login'`
  - `1년 정리 cron`: `login-history-cleanup`, `interval '1 year'`
- [ ] **Step 3: 테스트가 실패하는지 확인** — Run: `npx vitest run src/features/accounts/lib/login-history-migration.test.ts` / Expected: FAIL(파일 없음).
- [ ] **Step 4: 마이그레이션 작성** — 설계 §4~§6의 SQL을 한 파일로 쓴다. 함수 `public.handle_auth_session_event() RETURNS trigger`: `TG_OP='INSERT'`이면 `NEW`로 `login`(`occurred_at = COALESCE(NEW.created_at, now())`), `'DELETE'`이면 `OLD`로 `logout`(`occurred_at = now()`). 이메일은 `auth.users`에서 `SELECT email … WHERE id = …`로 읽고 없으면 `''`. `ip`는 `host(NEW.ip)`. 반환은 `COALESCE(NEW, OLD)`가 아니라 AFTER 트리거라 `RETURN NULL`. 트리거는 `DROP TRIGGER IF EXISTS` 뒤 `CREATE TRIGGER`(재실행 안전). 파일 끝에 설계 §8.2의 확인 SQL을 주석으로 붙인다. cron 등록은 설계 §6.2 그대로(`DO` 블록으로 기존 작업 해제 후 등록).
- [ ] **Step 5: 테스트 통과 확인** — Run: 같은 명령 / Expected: PASS.
- [ ] **Step 6: `supabase/migrations/README.md`에 한 줄 추가** — `20261119000000_login_history.sql`(접속기록 테이블·트리거). 기존 줄 형식을 따른다.
- [ ] **Step 7: `git status` 확인** — 신규 SQL·테스트, README 수정만 보인다.

---

### Task 2: 타입과 변환 함수 (임시 합치기 제거)

**Files:**
- Modify: `src/features/accounts/types.ts`, `src/features/accounts/lib/login-history.ts`
- Test: `src/features/accounts/lib/login-history.test.ts`

**Interfaces:**
- Consumes: Task 1의 열 이름(`occurred_at`, `action`, `ip`, `user_agent`).
- Produces: `interface LoginHistoryRow { occurred_at: string; action: string; ip: string | null; user_agent: string | null }`, `toLoginEvents(rows: readonly LoginHistoryRow[]): LoginEvent[]`(최근 순), `LoginEvent`에 `userAgent?: string | null`. Task 3이 사용한다.

- [ ] **Step 1: 테스트 교체(RED)** — `login-history.test.ts`에서 `sessionsToLoginEvents` 블록을 지우고 `toLoginEvents` 블록으로 바꾼다. 테스트:
  - `login·logout 행을 이벤트로 바꾸고 userAgent를 담는다`: 입력 `{occurred_at:"2026-11-10T00:00:00Z", action:"login", ip:"1.1.1.1", user_agent:"UA"}` → `{at, action:"login", ip:"1.1.1.1", userAgent:"UA"}`
  - `알 수 없는 action 행은 버린다`: `action:"refresh"` → 빈 배열
  - `ip·user_agent가 null이면 null로 보존한다`
  - `최근 순으로 정렬한다`: 두 행(11-09, 11-10) → 11-10이 먼저
  기존 `summarizeLoginHistory` 테스트는 그대로 둔다.
- [ ] **Step 2: RED 확인** — Run: `npx vitest run src/features/accounts/lib/login-history.test.ts` / Expected: FAIL(`toLoginEvents` 없음).
- [ ] **Step 3: 구현** — `types.ts`의 `LoginEvent`에 `userAgent?: string | null`을 넣고 주석을 "로그인·로그아웃 이벤트 하나(`public.login_history`). 로그아웃 행의 IP·브라우저는 세션이 만들어질 때의 값이다"로 고친다. `login-history.ts`에서 `sessionsToLoginEvents`·`mergeLoginEvents`와 쓰지 않게 된 `AdminSession` import를 지우고 `LoginHistoryRow`·`toLoginEvents`를 추가한다(`action`이 `login`/`logout`인 행만, `at` 내림차순).
- [ ] **Step 4: GREEN 확인** — Run: 같은 명령 / Expected: PASS. 이어서 `npx tsc --noEmit` — Expected: `history/route.ts`의 `mergeLoginEvents` import 오류만 남는다(Task 3에서 해결).
- [ ] **Step 5: 체크포인트** — 사용자에게 "마이그레이션(`20261119000000_login_history.sql`)을 SQL Editor에서 적용하고 설계 §8.2의 확인 SQL 결과를 알려 달라"고 한 뒤 Task 3으로 간다. 적용 확인 전에는 Task 3을 하지 않는다.

---

### Task 3: API 라우트와 접속 기록 창

**Files:**
- Modify: `src/app/api/admin/users/[id]/history/route.ts`, `src/features/accounts/components/account-history-dialog.tsx`

**Interfaces:**
- Consumes: Task 2의 `toLoginEvents`, `LoginHistoryRow`; 테이블 `login_history`.
- Produces: `GET /api/admin/users/[id]/history` → `{ events: LoginEvent[]; available: boolean }`(응답 모양 불변).

- [ ] **Step 1: 라우트 교체** — `admin_user_login_history`·`admin_user_sessions` RPC와 세션 변환 코드를 지우고 `auth.adminClient.from("login_history").select("occurred_at, action, ip, user_agent").eq("user_id", id).order("occurred_at", { ascending: false }).limit(HISTORY_LIMIT)` 한 번으로 읽는다. `error`가 있으면 `{ events: [], available: false }`(테이블 없음), 아니면 `{ events: toLoginEvents(data ?? []), available: true }`. 쓰지 않는 import(`mergeLoginEvents`, `AdminSession`)를 지운다.
- [ ] **Step 2: 창 문구·표시** — ① 미적용 안내를 "접속 기록 테이블이 아직 없습니다. `20261119000000_login_history.sql`을 Supabase SQL Editor에서 실행해 주세요."로 바꾼다. ② 빈 상태 문구를 "저장된 접속 기록이 없습니다."로 바꾼다. ③ 전체 이력 표의 IP 칸에 `describeUserAgent(event.userAgent)`(`../lib/session-info`)를 옅은 보조 글자로 덧붙인다(열 추가 없음, `truncate whitespace-nowrap` 유지, `title`에 IP와 브라우저 모두). ④ 표 아래에 한 줄 설명: "로그아웃 행의 IP·브라우저는 로그인 때 기록된 값입니다."
- [ ] **Step 3: 검증** — Run: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npm test` / Expected: 오류 0, 전체 테스트 통과(기존 1723 + 새 테스트).
- [ ] **Step 4: 화면 확인(사용자)** — 로그인 후 `설정 > 계정설정`에서 계정의 접속 기록을 열어 ⓐ 백필된 로그인 행과 IP·브라우저가 보이는지 ⓑ 한 계정으로 로그인→로그아웃한 뒤 `login`·`logout` 두 행이 남는지 확인해 달라고 한다.
- [ ] **Step 5: `git status` 확인.**

---

### Task 4: 문서 정리

**Files:**
- Modify: `docs/Ver_3.0/Ver_3.0_계획.md`(접속기록 문단), `docs/Ver_3.0/계정관리/Ver_3.0_계정관리_구현.md`(접속 기록 절을 새 테이블 기준으로)
- Create: `docs/Ver_3.0/접속기록/Ver_3.0_접속기록_구현.md`

- [ ] **Step 1:** 문서 작성은 agy에게 맡긴다(Orca "agy 서브" 터미널). 프롬프트 파일에 변경된 파일 목록·검증 결과·사용자 확인 결과를 담고 기존 `Ver_3.0_*_구현.md`의 어투를 따르게 한다.
- [ ] **Step 2:** `git diff`로 톤과 사실을 확인하고, 검증 명령 결과(테스트 수, tsc, eslint, 번들 크기)를 구현 문서에 적는다. 이전 버전 문서(`docs/이전버젼/`)는 수정하지 않는다.
- [ ] **Step 3:** 메모리 `MEMORY.md`에 한 줄을 추가한다 — "접속 기록은 `public.login_history`(트리거 기록)가 원본. `auth.audit_log_entries`는 0건이라 쓰지 않는다."

---

## 자체 점검

- 설계 7개 결정: 트리거(T1) · 항목+IP(T1,2) · 보관 cron(T1) · 관리자 RLS(T1) · 백필+합치기 제거(T1,2,3) · 계정 삭제 후 유지(T1 FK 없음) · 인덱스(T1) 모두 Task에 있다.
- 타입 일치: `LoginHistoryRow`·`toLoginEvents`·`LoginEvent.userAgent`는 Task 2에서 정의하고 Task 3이 쓴다.
- 범위: SQL 실제 동작(트리거가 정말 기록하는가)은 로컬에서 시험할 수 없어 정적 테스트와 사용자 확인(Task 2 체크포인트·Task 3 Step 4)으로 갈음한다.
