-- 관리자 계정 기능(접속 정보·접속 기록·작업 감사 기록)
-- 아래 파일들을 파일명 순서대로 이어 붙인 것이다(내용은 원본 그대로, 구분선 주석만 추가).
-- 이미 적용된 DB에는 다시 실행하지 않는다. 새 DB를 만들 때만 번호 순서대로 실행한다.

-- ============================================================
-- 원본: 20261113000000_admin_user_sessions.sql
-- ============================================================
-- =====================================================================
-- 계정설정: 계정별 접속 정보(IP·브라우저·마지막 활동) 조회
--
-- Supabase Auth 는 로그인 세션마다 IP·User-Agent·생성/갱신 시각을 auth.sessions 에 저장한다.
-- auth 스키마는 API 로 노출되지 않아, 서비스 키로만 부를 수 있는 함수로 감싸 계정설정(관리자 전용 API)에서 읽는다.
--
-- 권한: service_role 만 실행할 수 있다(anon·authenticated 는 실행 불가). 앱은 /api/admin/users 에서
--       관리자 확인을 거친 뒤에만 이 함수를 부른다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 적용 전에도 계정설정은 그대로 열리고, 접속 정보 열만 비어 있다.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_user_sessions()
RETURNS TABLE (
  user_id uuid,
  session_id uuid,
  ip text,
  user_agent text,
  created_at timestamptz,
  last_active_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    s.user_id,
    s.id,
    host(s.ip),
    s.user_agent,
    s.created_at,
    COALESCE(s.updated_at, s.created_at)
  FROM auth.sessions AS s
  WHERE s.not_after IS NULL OR s.not_after > now();
$$;

REVOKE ALL ON FUNCTION public.admin_user_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_sessions() TO service_role;

NOTIFY pgrst, 'reload schema';

-- 적용 후 확인 (SQL Editor 에서):
--   SELECT * FROM public.admin_user_sessions() ORDER BY last_active_at DESC LIMIT 5;


-- ============================================================
-- 원본: 20261114000000_admin_user_login_history.sql
-- ============================================================
-- =====================================================================
-- 계정설정: 계정별 접속 기록(로그인·로그아웃 시각과 IP) 조회
--
-- Supabase Auth 는 로그인·로그아웃 같은 이벤트를 auth.audit_log_entries 에 남긴다(시각, IP, payload).
-- auth 스키마는 API 로 노출되지 않아, 서비스 키로만 부를 수 있는 함수로 감싸 계정설정(관리자 전용 API)에서 읽는다.
-- 토큰 갱신은 한 시간마다 쌓여 이력을 어지럽히므로 뺀다(로그인·로그아웃만).
--
-- 주의: 이 기록에는 브라우저/OS(User-Agent)가 없다. 시각과 IP 만 있다.
--       프로젝트 설정에 따라 감사 기록이 꺼져 있거나 일정 기간만 보관될 수 있다.
--
-- 권한: service_role 만 실행할 수 있다(anon·authenticated 는 실행 불가).
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 적용 전에도 계정설정은 그대로 열리고, 접속 기록 창에 "아직 적용되지 않았습니다"가 보인다.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_user_login_history(p_user_id uuid, p_limit integer DEFAULT 500)
RETURNS TABLE (
  occurred_at timestamptz,
  action text,
  ip text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    e.created_at,
    e.payload ->> 'action',
    NULLIF(e.ip_address, '')
  FROM auth.audit_log_entries AS e
  WHERE e.payload ->> 'actor_id' = p_user_id::text
    AND e.payload ->> 'action' IN ('login', 'logout')
  ORDER BY e.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 2000));
$$;

REVOKE ALL ON FUNCTION public.admin_user_login_history(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_login_history(uuid, integer) TO service_role;

NOTIFY pgrst, 'reload schema';

-- 적용 후 확인 (SQL Editor 에서):
--   SELECT payload ->> 'action' AS action, count(*) FROM auth.audit_log_entries GROUP BY 1 ORDER BY 2 DESC;
--   SELECT * FROM public.admin_user_login_history('<사용자 UUID>'::uuid, 20);


-- ============================================================
-- 원본: 20261115000000_admin_audit_log.sql
-- ============================================================
-- =====================================================================
-- 관리자 작업 감사 기록 — 계정설정의 계정 생성·삭제·관리자 권한 변경을 누가 언제 했는지 남긴다.
--
-- 쓰기: 서버(서비스 키)에서만 한다. authenticated·anon 에는 INSERT/UPDATE/DELETE 정책이 없어
--       브라우저에서는 쓰거나 지울 수 없다(서비스 키는 RLS 를 건너뛴다).
-- 읽기: 관리자(public.is_app_admin())만. 앱은 /api/admin/audit 로 읽는다.
-- 삭제된 계정도 남도록 대상 이메일은 복사해서 저장한다(대상 ID 에는 외래키를 걸지 않는다).
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 적용 순서: 20261108000000_facility_schedule.sql(is_app_admin) 이후.
-- 적용 전에도 계정설정은 그대로 동작하고, 기록만 남지 않는다.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  actor_id     uuid,
  actor_email  text NOT NULL DEFAULT '',
  action       text NOT NULL CHECK (action IN ('account_create', 'account_delete', 'admin_grant', 'admin_revoke')),
  target_id    uuid,
  target_email text NOT NULL DEFAULT '',
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip           text
);

CREATE INDEX IF NOT EXISTS admin_audit_log_occurred_idx
  ON public.admin_audit_log (occurred_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_audit_log_select_admin ON public.admin_audit_log;
CREATE POLICY admin_audit_log_select_admin ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING ((SELECT public.is_app_admin()));

NOTIFY pgrst, 'reload schema';

-- 적용 후 확인 (SQL Editor 에서):
--   SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'admin_audit_log';
--     -- SELECT 정책 1개만 있어야 한다(쓰기 정책 없음).
--   계정설정에서 계정을 추가·삭제하거나 권한을 바꾼 뒤:
--   SELECT occurred_at, actor_email, action, target_email, ip FROM public.admin_audit_log ORDER BY occurred_at DESC LIMIT 10;

