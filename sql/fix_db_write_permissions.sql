-- ============================================================
-- DB 쓰기 권한 복구 (information 등 permission denied 42501 해결)
-- Supabase Dashboard → SQL Editor 에서 전체 실행
--
-- 증상: "DB 쓰기 권한이 없습니다" / permission denied for table information
-- 원인: authenticated 역할에 INSERT 권한 없음, 또는 RLS 쓰기 정책 누락
-- ============================================================

-- 1. anon 은 읽기만 (과도 권한 회수)
REVOKE ALL ON TABLE public.markers FROM anon;
REVOKE ALL ON TABLE public.information FROM anon;
REVOKE ALL ON TABLE public.battery_markers FROM anon;
REVOKE ALL ON TABLE public.battery_specs FROM anon;

-- 2. authenticated 에 읽기·쓰기 권한 부여
GRANT SELECT ON TABLE public.markers TO anon, authenticated;
GRANT SELECT ON TABLE public.information TO anon, authenticated;
GRANT SELECT ON TABLE public.battery_markers TO anon, authenticated;
GRANT SELECT ON TABLE public.battery_specs TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE public.markers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.information TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.battery_markers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.battery_specs TO authenticated;

GRANT ALL ON TABLE public.markers TO postgres, service_role;
GRANT ALL ON TABLE public.information TO postgres, service_role;
GRANT ALL ON TABLE public.battery_markers TO postgres, service_role;
GRANT ALL ON TABLE public.battery_specs TO postgres, service_role;

GRANT USAGE, SELECT ON SEQUENCE public.battery_specs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.battery_specs_id_seq TO postgres, service_role;


-- 3. information RLS + 쓰기 정책
ALTER TABLE public.information ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all anonymous operations" ON public.information;
DROP POLICY IF EXISTS "Allow all anonymous operations for ALL" ON public.information;

DROP POLICY IF EXISTS "information_select_anon_authenticated" ON public.information;
DROP POLICY IF EXISTS "information_insert_authenticated" ON public.information;
DROP POLICY IF EXISTS "information_update_authenticated" ON public.information;
DROP POLICY IF EXISTS "information_delete_authenticated" ON public.information;

CREATE POLICY "information_select_anon_authenticated" ON public.information
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "information_insert_authenticated" ON public.information
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "information_update_authenticated" ON public.information
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) IS NOT NULL)
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "information_delete_authenticated" ON public.information
    FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) IS NOT NULL);


NOTIFY pgrst, 'reload schema';

-- [확인] authenticated INSERT 권한
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND table_name = 'information' AND grantee = 'authenticated';
