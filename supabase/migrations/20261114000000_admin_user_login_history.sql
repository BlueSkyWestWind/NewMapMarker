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
