-- =====================================================================
-- Security Advisor 경고 정리: 국소 목록 권한 함수
--
-- 경고: Signed-In Users Can Execute SECURITY DEFINER Function
--   public.is_app_admin(), public.can_edit_site_list(uuid)
--
-- 두 함수는 DEFINER 권한이 필요 없다.
--   is_app_admin       : app_admins의 자기 행을 읽는다. app_admins_select_self 정책이 허용한다.
--   can_edit_site_list : site_lists를 읽는다. site_lists_select_auth 정책이 허용한다.
-- 두 정책 모두 이 함수들을 다시 부르지 않아 재귀도 없다. 판별 결과는 그대로다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- =====================================================================

ALTER FUNCTION public.is_app_admin() SECURITY INVOKER;
ALTER FUNCTION public.can_edit_site_list(uuid) SECURITY INVOKER;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 적용 후 확인: 두 행 모두 is_definer 가 false 여야 한다.
--   SELECT proname, prosecdef AS is_definer
--   FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('is_app_admin', 'can_edit_site_list');
-- ---------------------------------------------------------------------
