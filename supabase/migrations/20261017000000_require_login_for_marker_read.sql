-- =====================================================================
-- 마커 데이터는 로그인(authenticated)한 사용자만 조회·조작 가능
--
-- 배경: NEXT_PUBLIC_SUPABASE_ANON_KEY 는 브라우저에 공개되므로, 화면에서 마커를 숨겨도
--       anon 에게 SELECT 가 열려 있으면 REST 로 전체 데이터를 읽을 수 있다.
--
-- 변경:
--   1. *_select_all (anon + authenticated 조회 허용) 삭제
--      -> 남는 *_modify_auth (FOR ALL TO authenticated) 가 로그인 사용자의 SELECT 도 포함한다.
--   2. *_insert_anon / *_update_anon (20260817165000 에서 연 비로그인 쓰기) 삭제
--
-- 적용 순서: 로그인 전용 클라이언트를 먼저 배포한 뒤 이 SQL 을 실행한다.
--            순서가 반대면 그 사이 비로그인 사용자에게 조회 오류가 보인다.
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run
-- =====================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['markers','information','erp_details','battery_markers','battery_specs']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select_all ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert_anon ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_update_anon ON public.%I', t, t);
  END LOOP;
END $$;

-- *_modify_auth 가 없는 환경 대비: 로그인 사용자 전체 권한 정책을 보장한다.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['markers','information','erp_details','battery_markers','battery_specs']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_modify_auth ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_modify_auth ON public.%I FOR ALL TO authenticated '
      || 'USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')',
      t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 적용 후 확인 (anon 키로 호출 -> 빈 배열 [] 이어야 한다)
--   curl "<SUPABASE_URL>/rest/v1/markers?select=id&limit=1" \
--        -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
-- ---------------------------------------------------------------------
