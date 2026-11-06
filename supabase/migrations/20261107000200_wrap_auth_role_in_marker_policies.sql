-- =====================================================================
-- Performance Advisor 경고 정리: Auth RLS Initialization Plan
--
-- 대상: markers, information, erp_details, battery_markers, battery_specs
--
-- 20261017000000 의 *_modify_auth 정책이 auth.role()을 행마다 다시 계산한다.
-- (select auth.role())로 감싸면 쿼리당 한 번만 계산한다. 조건의 의미는 같아서
-- 권한은 바뀌지 않는다. 로그인 사용자만 조회·조작할 수 있는 그대로다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- =====================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['markers','information','erp_details','battery_markers','battery_specs']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_modify_auth'
    ) THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.%I '
        || 'USING ((select auth.role()) = ''authenticated'') '
        || 'WITH CHECK ((select auth.role()) = ''authenticated'')',
        t || '_modify_auth', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 적용 후 확인: 5행 모두 qual 과 with_check 에 SELECT auth.role() 이 보여야 한다.
--   SELECT tablename, policyname, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('markers','information','erp_details','battery_markers','battery_specs');
-- ---------------------------------------------------------------------
