# 접속기록 전용 테이블 (설계)

작성일 2026-11-13 · 대상: 설정 > 계정설정 > 접속 기록 (`public.login_history`, `/api/admin/users/[id]/history`)

## 1. 배경과 목표

계정설정 화면의 계정별 "접속 기록" 창은 관리자가 각 계정의 로그인·로그아웃 시각과 접속 IP를 확인하는 기능이지만, 이 프로젝트의 Supabase `auth.audit_log_entries`에 로그인 이벤트가 기록되지 않아(0건) 창이 비어 있었다. 임시 조치로 현재 살아 있는 세션(`auth.sessions`)의 생성 시각과 IP를 로그인 이벤트로 합쳐 보여 주고 있으나, 로그아웃하면 세션 행이 삭제되어 과거 접속 기록이 함께 사라지고 로그아웃 시각도 남지 않는다. 이 문서는 `auth.sessions`의 생성·삭제 시점에 전용 테이블 `public.login_history`로 접속 이력을 영구 기록하고, 1년 보관 주기와 관리자 조회 경로를 정한다. 일반 사용자의 본인 접속 기록 열람, 실시간 접속 알림, 로그인 실패(비밀번호 오류 등) 기록은 이번 범위에서 하지 않는다(비목표).

## 2. 현재 한계와 원인

- **원인 (`auth.audit_log_entries` 미기록)**: 기존 조회 함수 `public.admin_user_login_history(uuid, integer)`(`supabase/migrations/04_admin_accounts.sql`)는 `auth.audit_log_entries`에서 `action IN ('login', 'logout')`을 읽도록 작성되었으나, 이 프로젝트의 Supabase Auth는 로그인·로그아웃 이벤트를 해당 테이블에 남기지 않아 조회 결과가 0건이다.
- **임시 조치와 한계**: `src/app/api/admin/users/[id]/history/route.ts`에서 `admin_user_sessions()` 함수가 돌려주는 `auth.sessions`의 세션 생성 시각(`created_at`)과 IP를 `mergeLoginEvents`(`src/features/accounts/lib/login-history.ts`)로 합쳐 로그인 기록으로 보여 주고 있다. 그러나 사용자가 로그아웃하면 `auth.sessions` 행이 즉시 지워져 이전 접속 기록까지 사라지며, 로그아웃 이벤트 자체는 전혀 알 수 없다.
- **`auth.sessions` 구조**: 열은 `id`, `user_id`, `created_at`, `updated_at`, `not_after`, `refreshed_at`, `user_agent`, `ip`(`inet`) 등이다. 테이블 소유자는 `supabase_auth_admin`이며 현재 걸려 있는 트리거는 0개다.
- **기존 감사 테이블 패턴**: `public.admin_audit_log`(`supabase/migrations/04_admin_accounts.sql`)는 RLS를 켜고 관리자만 `SELECT` 정책(`(SELECT public.is_app_admin())`)을 두며, 쓰기 정책 없이 서버에서 서비스 키로만 기록한다.
- **스케줄러 환경**: 이미 `pg_cron` 확장을 사용 중이다(`supabase/migrations/20261116000300_kma_prefetch_cron.sql`의 `kma-prefetch-cleanup` 작업).
- **운영 방식**: Supabase는 로컬에서 실행하지 않는다. 테이블·트리거·크론 변경은 `supabase/migrations/*.sql` 파일(예: `supabase/migrations/20261119000000_login_history.sql`)로 만들어 두면 사용자가 Supabase SQL Editor에서 직접 적용한다.

## 3. 결정 요약 표

| # | 결정 | 내용 | 이유 |
|---|---|---|---|
| 1 | 기록 방식 | `auth.sessions`의 `AFTER INSERT OR DELETE` 트리거로 `public.login_history`에 자동 기록한다(INSERT → `login`, DELETE → `logout`). 트리거 권한이 막히면 클라이언트 API 호출 대안으로 전환한다 | 앱 로그인·로그아웃 코드를 건드리지 않고 모든 세션 생성·종료를 한 곳에서 빠짐없이 잡는다 |
| 2 | 저장 항목과 IP 필수 기록 | `id`(bigint identity PK), `occurred_at`, `user_id`(FK 없음), `email`(스냅샷), `action`('login'\|'logout'), `ip`(`host(ip)` 텍스트), `user_agent`, `session_id`를 저장한다 | 사용자가 IP 주소 기록을 특별히 요청했고, 세션 단위로 로그인과 로그아웃을 대조할 수 있어야 한다 |
| 3 | 예외 격리 | 트리거 함수는 `SECURITY DEFINER`, `SET search_path = ''`로 만들고 본문을 `EXCEPTION WHEN OTHERS THEN NULL`로 감싼다 | 기록 테이블 오류나 권한 문제가 실제 로그인·로그아웃 진행을 절대 막지 않게 한다 |
| 4 | 계정 삭제 후 보존 | `user_id`에 `auth.users` 외래키(FK)를 걸지 않고 기록 시점의 `email`을 스냅샷으로 함께 적는다 | 계정이 삭제된 뒤에도 과거 접속 감사 이력과 이메일 식별값을 유지한다(`admin_audit_log`와 같은 방식) |
| 5 | 보관 주기 | `pg_cron` 작업 `login-history-cleanup`으로 매일 1년 지난 행을 지운다 | 무한 적재를 막으면서 감사·보안 확인에 필요한 1년 치 이력을 남긴다 |
| 6 | 조회 권한 | RLS 활성화, `authenticated` 중 `(SELECT public.is_app_admin())`만 `SELECT` 허용, 쓰기 정책 없음 | 접속 기록과 IP는 관리자만 열람해야 하며 브라우저에서의 직접 추가·수정·삭제를 차단한다 |
| 7 | 기존 세션 이관 및 조회 단순화 | 마이그레이션에서 현재 `auth.sessions` 행을 `login`으로 1회 백필(`session_id` 중복 방지)하고, API는 서비스 키로 `public.login_history`를 직접 읽으며 `mergeLoginEvents` 임시 합치기를 제거한다 | 백필로 현재 접속 중인 세션 이력을 보존한 뒤 조회 경로를 단일 테이블로 단순화한다 |

## 4. 테이블 설계

### 4.1 열 정의 (`public.login_history`)

| 열 이름 | 타입 | 제약 및 기본값 | 설명 |
|---|---|---|---|
| `id` | `bigint` | `GENERATED ALWAYS AS IDENTITY PRIMARY KEY` | 행 고유 번호 |
| `occurred_at` | `timestamptz` | `NOT NULL DEFAULT now()` | 이벤트 발생 시각(백필 시에는 세션의 `created_at`) |
| `user_id` | `uuid` | `NOT NULL` (외래키 없음) | 계정 UUID. 계정이 삭제되어도 행이 남도록 FK를 걸지 않는다 |
| `email` | `text` | `NOT NULL DEFAULT ''` | 기록 시점의 `auth.users.email` 스냅샷 |
| `action` | `text` | `NOT NULL CHECK (action IN ('login', 'logout'))` | 이벤트 종류 |
| `ip` | `text` | `NULL` | 접속 IP 문자열(`host(s.ip)`로 변환한 값). 사용자 필수 요청 항목 |
| `user_agent` | `text` | `NULL` | 브라우저·OS User-Agent 원문 |
| `session_id` | `uuid` | `NULL` | `auth.sessions.id`. 같은 세션의 로그인·로그아웃 대조 및 백필 중복 방지에 쓴다 |

### 4.2 인덱스

| 인덱스 이름 | 대상 열 | 용도 |
|---|---|---|
| `login_history_user_occurred_idx` | `(user_id, occurred_at DESC)` | 계정별 접속 기록 창(`/api/admin/users/[id]/history`)에서 특정 사용자의 최근 이력을 빠르게 읽는다 |
| `login_history_occurred_idx` | `(occurred_at DESC)` | 전체 시간순 조회 및 `pg_cron`의 1년 경과 행 일괄 삭제에 쓴다 |

### 4.3 RLS 정책

- `ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;`
- **조회 정책 (`login_history_select_admin`)**: `FOR SELECT TO authenticated USING ((SELECT public.is_app_admin()))`. 관리자만 읽을 수 있고 일반 사용자의 본인 기록 열람 정책은 두지 않는다.
- **쓰기 정책 없음**: `anon`·`authenticated` 역할에는 `INSERT`·`UPDATE`·`DELETE` 정책을 만들지 않는다. 기록은 `SECURITY DEFINER` 트리거 함수(또는 서버 서비스 키)로만 수행한다.

## 5. 기록 경로

### 5.1 트리거 동작 표 (`auth.sessions` → `public.login_history`)

트리거 `on_auth_session_login_history`는 `auth.sessions`의 `AFTER INSERT OR DELETE FOR EACH ROW`로 동작하며, 함수 `public.handle_auth_session_event()`를 호출한다.

| `TG_OP` | 참조 레코드 | `occurred_at` | `action` | `user_id` | `email` | `ip` | `user_agent` | `session_id` |
|---|---|---|---|---|---|---|---|---|
| `INSERT` | `NEW` | `COALESCE(NEW.created_at, now())` | `'login'` | `NEW.user_id` | `auth.users`에서 조회(없으면 `''`) | `host(NEW.ip)` | `NEW.user_agent` | `NEW.id` |
| `DELETE` | `OLD` | `now()` | `'logout'` | `OLD.user_id` | `auth.users`에서 조회(없으면 기존 기록·`''`) | `host(OLD.ip)` | `OLD.user_agent` | `OLD.id` |

- **주의 (로그아웃 시점의 IP·User-Agent 한계)**: `DELETE` 트리거는 지워지는 `OLD` 행만 볼 수 있으므로, `logout` 행에 적히는 `ip`와 `user_agent`는 로그아웃 요청을 보낸 시점의 값이 아니라 **그 세션이 처음 만들어질 때(또는 마지막으로 세션 행에 저장된 때)의 값**이다.
- **주의 (만료·정리 세션 구분 불가)**: 사용자가 직접 로그아웃 버튼을 누른 경우뿐 아니라, 세션 만료·비밀번호 변경·관리자 강제 종료·Supabase 내부 정리로 `auth.sessions` 행이 삭제될 때도 모두 `DELETE` 이벤트가 발생해 `logout`으로 기록된다. 트리거만으로는 자발적 로그아웃과 만료 삭제를 구분할 수 없다.

### 5.2 실패 처리

트리거 함수는 `LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''`로 선언하고, 본문 전체를 `BEGIN ... EXCEPTION WHEN OTHERS THEN NULL; END;` 블록으로 감싼다. `public.login_history`에 쓰는 도중 어떤 예외가 나더라도 조용히 삼켜서 Supabase Auth의 로그인·로그아웃 트랜잭션이 롤백되지 않게 한다.

### 5.3 위험과 대안 (`auth.sessions` 트리거 권한)

- **위험**: `auth.sessions`의 소유자는 `supabase_auth_admin`이다. Supabase 클라우드 프로젝트의 SQL Editor 실행 역할(`postgres`)이 `auth.sessions`에 트리거를 생성할 권한이 있는지 아직 확정되지 않았다.
- **대안 (권한 거부 시 전환)**: 구현 첫 단계에서 권한 확인 SQL을 먼저 실행한다. 만약 권한 오류(`must be owner of table sessions` 또는 `permission denied for schema auth`)가 나면 DB 트리거 방식을 버리고 **클라이언트→서버 API 기록 방식**으로 전환한다.
  - 로그인 직후와 로그아웃 직전에 클라이언트가 서버 API(`POST /api/auth/login-history`)를 호출해 서비스 키로 `public.login_history`에 기록한다.
  - 이때 Supabase 클라이언트의 `onAuthStateChange`에서 오는 `SIGNED_IN` 이벤트는 실제 로그인뿐 아니라 **브라우저 탭 복귀·토큰 자동 갱신 때도 반복 발생**한다. 따라서 세션 ID(`session.access_token`의 `session_id` 클레임 또는 `auth.sessions.id`) 기준으로 `(user_id, session_id, action='login')` 중복을 서버에서 걸러 한 세션당 한 번만 기록해야 한다.

## 6. 이관·보관·정리

### 6.1 초기 백필 (기존 `auth.sessions` 이관)

마이그레이션 파일(`supabase/migrations/20261119000000_login_history.sql`) 안에서 테이블과 트리거를 만든 직후, 현재 살아 있는 `auth.sessions` 행을 `action = 'login'`, `occurred_at = s.created_at`으로 한 번 복사한다.

```sql
INSERT INTO public.login_history (occurred_at, user_id, email, action, ip, user_agent, session_id)
SELECT
  s.created_at,
  s.user_id,
  COALESCE(u.email, ''),
  'login',
  host(s.ip),
  s.user_agent,
  s.id
FROM auth.sessions AS s
LEFT JOIN auth.users AS u ON u.id = s.user_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.login_history AS h
  WHERE h.session_id = s.id
    AND h.action = 'login'
);
```

- `WHERE NOT EXISTS (session_id = s.id AND action = 'login')` 조건을 두어 마이그레이션 SQL을 여러 번 다시 실행해도 같은 세션이 중복으로 들어가지 않는다(멱등).

### 6.2 1년 보관 크론 (`login-history-cleanup`)

이미 켜져 있는 `pg_cron`을 이용해 매일 1년(`interval '1 year'`)이 지난 기록을 지운다. 기존 `kma-prefetch-cleanup`과 같은 방식으로 재실행 시 기존 작업을 지우고 다시 등록한다.

```sql
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job
   WHERE jobname = 'login-history-cleanup';
END
$$;

-- 매일 09:05 UTC (KST 18:05)에 1년 지난 접속 기록을 지운다.
SELECT cron.schedule(
  'login-history-cleanup',
  '5 9 * * *',
  $cron$ DELETE FROM public.login_history WHERE occurred_at < now() - interval '1 year'; $cron$
);
```

## 7. 앱 변경 범위

### 7.1 조회 경로 선택 (RPC 함수 교체 vs 테이블 직접 조회)

- **비교**:
  1. 기존 RPC 함수 `public.admin_user_login_history` 본문을 `public.login_history`를 읽도록 바꾸는 방안.
  2. API 라우트가 `admin_audit_log` 조회(`/api/admin/audit`)와 똑같이 서비스 키(`auth.adminClient`)로 `public.login_history` 테이블을 직접 `.from("login_history").select(...)` 하는 방안.
- **결정(권장)**: **2번(API가 서비스 키로 `public.login_history`를 직접 읽고, 기존 `admin_user_login_history` 함수는 삭제하지 않고 그대로 둔다)**을 택한다.
  - 근거: `public` 스키마 테이블은 서비스 키로 바로 읽을 수 있어 별도 `SECURITY DEFINER` 래퍼 함수가 필요 없고, `src/app/api/admin/audit/route.ts`와 코드 모양이 통일된다. 기존 함수를 삭제(`DROP FUNCTION`)하지 않으면 롤백이나 이전 코드와의 호환 문제도 없다.

### 7.2 파일별 변경 사항

| 파일 | 변경 내용 |
|---|---|
| `src/app/api/admin/users/[id]/history/route.ts` | `admin_user_login_history`·`admin_user_sessions` 두 RPC 호출과 `mergeLoginEvents` 합치기를 제거한다. 대신 `auth.adminClient.from("login_history").select("occurred_at, action, ip, user_agent").eq("user_id", id).order("occurred_at", { ascending: false }).limit(HISTORY_LIMIT)` 한 번으로 읽는다. 테이블이 아직 없을 때(마이그레이션 전 `error`)는 기존처럼 `{ events: [], available: false }`를 돌려준다 |
| `src/features/accounts/lib/login-history.ts` | 임시 합치기 함수 `sessionsToLoginEvents`·`mergeLoginEvents`를 제거하고, DB 행을 `LoginEvent`로 변환하는 순수 함수(예: `toLoginEvents`)와 기존 `summarizeLoginHistory`·`localDateKey`·`formatClock`을 유지한다 |
| `src/features/accounts/lib/login-history.test.ts` | `sessionsToLoginEvents`·`mergeLoginEvents` 테스트를 제거하고 새 행 변환 단위 테스트로 교체한다 |
| `src/features/accounts/types.ts` | `LoginEvent` 타입에 `userAgent?: string \| null` 필드를 추가한다. 주석의 "Supabase 감사 기록 / 브라우저 정보는 없다"를 `public.login_history` 기준으로 고친다 |
| `src/features/accounts/components/account-history-dialog.tsx` | ① 미적용 안내 문구를 `20261119000000_login_history.sql` 실행 안내로 바꾼다. ② 빈 상태 문구에서 "로그아웃한 세션은 지워지므로..." 설명을 빼고 "저장된 접속 기록이 없습니다."로 고친다. ③ 브라우저 표시 여부(§7.3) 반영 |

### 7.3 `LoginEvent`의 `userAgent` 추가와 브라우저 표시 여부 (선택 사항 및 권장안)

- **타입 및 API**: DB에 `user_agent`가 함께 저장되므로 `LoginEvent`에 `userAgent?: string | null`을 추가해 API 응답까지 내려보낸다.
- **화면 표시 (선택 사항, 권장안 제시)**:
  - **권장안**: 전체 이력 표에 열을 새로 늘리지 않고(표 줄바꿈·가로 스크롤 금지 규칙 보호), 이미 있는 `describeUserAgent(event.userAgent)`(`src/features/accounts/lib/session-info.ts`)를 써서 IP 칸 옆이나 보조 글자로 `Chrome/Windows` 형태를 함께 보여 주거나, 필요할 때만 좁은 `환경` 열(`w-28`)을 추가한다. 날짜별 요약 표는 폭이 좁으므로 지금처럼 날짜·로그인·첫~마지막·접속 IP 4열을 그대로 유지한다.

## 8. 테스트·검증 계획

### 8.1 트리거 권한 사전 확인 SQL (구현 첫 단계)

Supabase SQL Editor에서 아래 구문으로 `auth.sessions`에 빈 트리거를 걸고 지울 수 있는지 먼저 확인한다.

```sql
CREATE OR REPLACE FUNCTION public._test_auth_sessions_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN NULL;
END;
$$;

CREATE TRIGGER _test_auth_sessions_trigger
AFTER INSERT ON auth.sessions
FOR EACH ROW EXECUTE FUNCTION public._test_auth_sessions_trigger_fn();

DROP TRIGGER _test_auth_sessions_trigger ON auth.sessions;
DROP FUNCTION public._test_auth_sessions_trigger_fn();
```

### 8.2 마이그레이션 적용 후 확인 SQL

```sql
-- 1) 테이블·RLS 정책 확인 (SELECT 정책 1개만 있어야 한다)
SELECT tablename, policyname, cmd
  FROM pg_policies
 WHERE tablename = 'login_history';

-- 2) 트리거 등록 확인
SELECT tgname, tgenabled
  FROM pg_trigger
 WHERE tgrelid = 'auth.sessions'::regclass
   AND NOT tgisinternal;

-- 3) 백필된 로그인 행 확인
SELECT id, occurred_at, email, action, ip, session_id
  FROM public.login_history
 ORDER BY occurred_at DESC
 LIMIT 10;

-- 4) 크론 등록 확인
SELECT jobname, schedule, active
  FROM cron.job
 WHERE jobname = 'login-history-cleanup';
```

### 8.3 단위 테스트 (`vitest`)

- `src/features/accounts/lib/login-history.test.ts`:
  - DB 행 배열(`occurred_at`, `action`, `ip`, `user_agent`)을 `LoginEvent[]`로 변환할 때 잘못된 `action` 값을 걸러내고 `ip`·`userAgent`의 `null`을 보존하는지 검증한다.
  - `summarizeLoginHistory`가 `login`·`logout` 이벤트가 섞인 목록에서 로그인 횟수, 로그아웃 횟수, 날짜별 첫~마지막 로그인 시각, 고유 IP 목록, 시간대별 분포를 정확히 계산하는지 검증한다.
- 정적 검증: `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test` 통과.

### 8.4 수동 검증 (로그인·로그아웃 후 확인)

1. 테스트 계정으로 로그인한 뒤 `public.login_history`에 `action = 'login'`, 접속 IP, User-Agent, `session_id`가 적힌 행이 1건 생기는지 확인한다.
2. 같은 계정으로 로그아웃한 뒤 `action = 'logout'` 행이 추가되고, 방금 만든 `login` 행도 지워지지 않고 그대로 남아 있는지 확인한다.
3. 관리자 계정으로 `설정 > 계정설정 > 접속 기록` 창을 열어 로그인·로그아웃 두 행과 접속 IP가 모두 표시되는지 확인한다.

## 9. 위험과 열린 질문

| 항목 | 내용 및 대응 |
|---|---|
| `auth.sessions` 트리거 생성 권한 | Supabase 호스팅 환경에서 `auth.sessions`에 트리거 생성이 거부될 수 있다. 구현 1단계에서 §8.1 SQL로 즉시 확인하고, 막히면 §5.3의 클라이언트 API 호출 + `session_id` 중복 제거 방식으로 전환한다 |
| 만료·정리 세션과 자발적 로그아웃 구분 불가 | `auth.sessions` 행이 만료·강제 종료·정리로 지워져도 `DELETE` 트리거가 돌아 `logout`으로 남는다. 로그아웃 시각이 "세션이 실제로 끝난 시각"을 뜻한다고 문구로 안내하고, 엄격한 구분이 필요해지면 클라이언트 로그아웃 API를 병행한다 |
| 로그아웃 행의 IP·User-Agent 시점 차이 | `DELETE` 시점에는 요청 헤더가 없어 세션 생성 시점의 `OLD.ip`·`OLD.user_agent`가 기록된다. 같은 세션의 종료 기록이라는 점에서는 일관되나, 이동 중 네트워크가 바뀐 경우 실제 로그아웃 요청 IP와 다를 수 있다 |
| IP 개인정보 1년 보관 근거 | IP 주소는 개인정보에 해당할 수 있으나, 이 앱은 사내·협력사 인가 계정만 사용하는 폐쇄형 업무 시스템이고 부정 접속 확인·감사 목적으로 관리자에게만 공개하며 `pg_cron`으로 1년 뒤 자동 파기한다. 사내 보안 정책상 보관 기간 조정이 필요하면 크론의 `interval '1 year'`만 바꾸면 된다 |

## 10. 구현 순서

1. **트리거 권한 확인**: 사용자가 Supabase SQL Editor에서 §8.1의 확인 SQL을 실행해 `auth.sessions`에 트리거를 걸 수 있는지 확인한다(실패 시 §5.3 대안으로 전환).
2. **마이그레이션 작성**: `supabase/migrations/20261119000000_login_history.sql`에 `public.login_history` 테이블, 인덱스 2개, RLS 정책, `public.handle_auth_session_event()` 함수와 `auth.sessions` 트리거, 기존 세션 백필 `INSERT`, `login-history-cleanup` 크론 등록을 작성한다.
3. **마이그레이션 적용 및 DB 검증**: 사용자가 SQL Editor에서 마이그레이션을 실행하고 §8.2 확인 SQL로 정책·트리거·백필·크론을 확인한다.
4. **타입·라이브러리 정리**: `src/features/accounts/types.ts`의 `LoginEvent`를 갱신하고, `src/features/accounts/lib/login-history.ts`에서 `sessionsToLoginEvents`·`mergeLoginEvents`를 제거한 뒤 변환 함수와 단위 테스트(`login-history.test.ts`)를 수정한다.
5. **API 라우트 전환**: `src/app/api/admin/users/[id]/history/route.ts`가 `public.login_history`를 직접 조회하도록 바꾼다.
6. **화면 문구 및 표시 정리**: `src/features/accounts/components/account-history-dialog.tsx`의 미적용·빈 상태 문구를 고치고 필요시 브라우저 표시(§7.3)를 반영한다.
7. **검증**: `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test`를 실행하고 §8.4의 로그인·로그아웃 수동 검증을 마친다.
