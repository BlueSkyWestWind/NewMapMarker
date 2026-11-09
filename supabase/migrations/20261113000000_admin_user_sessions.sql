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
