-- =====================================================================
-- 장비·축전지 테이블의 삭제를 관리자 전용으로 제한한다 (코드리뷰 개선계획 Task 2)
--
-- 문제: 지금은 로그인한 모든 계정이 5개 테이블에 FOR ALL 권한을 가져, 공개된 anon 키와
--       본인 JWT로 PostgREST를 직접 호출하면 DELETE /rest/v1/markers?id=neq. 로 전체를 지울 수 있다.
--       그룹관리·전체 복원의 관리자 제한이 화면에서만 걸려 있다.
--
-- 변경: {table}_modify_auth(FOR ALL)를 지우고
--         SELECT / INSERT / UPDATE : 로그인 사용자 (지금과 같다)
--         DELETE                   : app_admins에 있는 관리자만
--
-- 영향: 마커 단건 삭제, 위치등록 저장(공정 행 교체), 대기 축전지 규격 재등록, 전체 복원,
--       축전지 전체 삭제는 관리자만 할 수 있다. 등록·수정은 그대로다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 되돌리기: 파일 맨 아래 주석의 SQL.
-- =====================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['markers','information','erp_details','battery_markers','battery_specs']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_modify_auth ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select_auth ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert_auth ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_update_auth ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete_admin ON public.%I', t, t);

    EXECUTE format(
      'CREATE POLICY %I_select_auth ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format(
      'CREATE POLICY %I_insert_auth ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', t, t);
    EXECUTE format(
      'CREATE POLICY %I_update_auth ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t, t);
    EXECUTE format(
      'CREATE POLICY %I_delete_admin ON public.%I FOR DELETE TO authenticated USING (public.is_app_admin())', t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 적용 후 확인 (정책 20개가 보여야 한다: 5개 테이블 x select/insert/update/delete_admin)
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('markers','information','erp_details','battery_markers','battery_specs')
--   ORDER BY 1, 2;
--
-- 동작 확인
--   일반 계정으로 로그인 -> 마커 등록·수정 성공, 삭제는 0행 삭제(RLS가 거름)
--   관리자 계정으로 로그인 -> 삭제 성공
--
-- 되돌리기 (이전 상태로)
--   DO $$ DECLARE t text; BEGIN
--     FOREACH t IN ARRAY ARRAY['markers','information','erp_details','battery_markers','battery_specs'] LOOP
--       EXECUTE format('DROP POLICY IF EXISTS %I_select_auth ON public.%I', t, t);
--       EXECUTE format('DROP POLICY IF EXISTS %I_insert_auth ON public.%I', t, t);
--       EXECUTE format('DROP POLICY IF EXISTS %I_update_auth ON public.%I', t, t);
--       EXECUTE format('DROP POLICY IF EXISTS %I_delete_admin ON public.%I', t, t);
--       EXECUTE format('CREATE POLICY %I_modify_auth ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
--     END LOOP; END $$;
--   NOTIFY pgrst, 'reload schema';
-- ---------------------------------------------------------------------
