-- ============================================================
-- Supabase RLS 보안 정책 적용 스크립트
-- Supabase Dashboard → SQL Editor 에서 이 파일 전체를 실행하세요.
--
-- 정책 요약
--   anon (비로그인 + ANON KEY): SELECT(읽기)만 허용
--   authenticated (로그인 JWT): INSERT / UPDATE / DELETE 허용
--   service_role: 서버 전용 전체 권한 (프론트엔드에 노출 금지)
--
-- 앱 연동
--   - index.html 로그인 UI → Supabase Auth signInWithPassword / signUp
--   - DB 쓰기는 로그인 세션(JWT, role=authenticated)이 있을 때만 성공
--   - 비로그인: 지도 조회·로컬 임시 마커만 가능
--
-- Supabase Dashboard (Auth) 필수 설정
--   Authentication → Providers → Email: 활성화
--   Authentication → URL Configuration:
--     Site URL: http://127.0.0.1:5500  (Live Server 기본 포트, 환경에 맞게 수정)
--     Redirect URLs: http://127.0.0.1:5500/** , http://localhost:5500/**
--   회원가입 후 이메일 인증 링크는 위 Redirect URL로 돌아와야 세션이 생성됩니다.
--
-- Security Advisor
--   - INSERT/UPDATE/DELETE 에 USING(true) 사용 시 경고 발생 → auth.uid() 검사 사용
--   - 레거시 "Allow all anonymous operations for ALL" 정책은 반드시 제거
--   - 유출 비밀번호 방지: Dashboard → Authentication → Attack Protection 에서 활성화
-- ============================================================

-- 1. anon 역할의 과도한 테이블 권한 회수 (RLS 비활성 시 우회 방지)
REVOKE ALL ON TABLE public.markers FROM anon;
REVOKE ALL ON TABLE public.information FROM anon;
REVOKE ALL ON TABLE public.battery_markers FROM anon;
REVOKE ALL ON TABLE public.battery_specs FROM anon;

-- 2. 역할별 최소 권한 부여
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


-- 3. markers
ALTER TABLE public.markers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all anonymous operations" ON public.markers;
DROP POLICY IF EXISTS "Allow all anonymous operations for ALL" ON public.markers;
DROP POLICY IF EXISTS "Allow anonymous access to markers" ON public.markers;
DROP POLICY IF EXISTS "Allow public read for markers" ON public.markers;
DROP POLICY IF EXISTS "Allow authenticated write for markers" ON public.markers;
DROP POLICY IF EXISTS "markers_select_anon_authenticated" ON public.markers;
DROP POLICY IF EXISTS "markers_insert_authenticated" ON public.markers;
DROP POLICY IF EXISTS "markers_update_authenticated" ON public.markers;
DROP POLICY IF EXISTS "markers_delete_authenticated" ON public.markers;

CREATE POLICY "markers_select_anon_authenticated" ON public.markers
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "markers_insert_authenticated" ON public.markers
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "markers_update_authenticated" ON public.markers
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) IS NOT NULL)
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "markers_delete_authenticated" ON public.markers
    FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) IS NOT NULL);


-- 4. information
ALTER TABLE public.information ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all anonymous operations" ON public.information;
DROP POLICY IF EXISTS "Allow all anonymous operations for ALL" ON public.information;
DROP POLICY IF EXISTS "Allow anonymous access to information" ON public.information;
DROP POLICY IF EXISTS "Allow public read for information" ON public.information;
DROP POLICY IF EXISTS "Allow authenticated write for information" ON public.information;
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


-- 5. battery_markers
ALTER TABLE public.battery_markers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all anonymous operations" ON public.battery_markers;
DROP POLICY IF EXISTS "Allow all anonymous operations for ALL" ON public.battery_markers;
DROP POLICY IF EXISTS "Allow anonymous access to battery_markers" ON public.battery_markers;
DROP POLICY IF EXISTS "Allow public read for battery_markers" ON public.battery_markers;
DROP POLICY IF EXISTS "Allow authenticated write for battery_markers" ON public.battery_markers;
DROP POLICY IF EXISTS "battery_markers_select_anon_authenticated" ON public.battery_markers;
DROP POLICY IF EXISTS "battery_markers_insert_authenticated" ON public.battery_markers;
DROP POLICY IF EXISTS "battery_markers_update_authenticated" ON public.battery_markers;
DROP POLICY IF EXISTS "battery_markers_delete_authenticated" ON public.battery_markers;

CREATE POLICY "battery_markers_select_anon_authenticated" ON public.battery_markers
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "battery_markers_insert_authenticated" ON public.battery_markers
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "battery_markers_update_authenticated" ON public.battery_markers
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) IS NOT NULL)
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "battery_markers_delete_authenticated" ON public.battery_markers
    FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) IS NOT NULL);


-- 6. battery_specs
ALTER TABLE public.battery_specs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all anonymous operations" ON public.battery_specs;
DROP POLICY IF EXISTS "Allow all anonymous operations for ALL" ON public.battery_specs;
DROP POLICY IF EXISTS "Allow anonymous access to battery_specs" ON public.battery_specs;
DROP POLICY IF EXISTS "Allow public read for battery_specs" ON public.battery_specs;
DROP POLICY IF EXISTS "Allow authenticated write for battery_specs" ON public.battery_specs;
DROP POLICY IF EXISTS "battery_specs_select_anon_authenticated" ON public.battery_specs;
DROP POLICY IF EXISTS "battery_specs_insert_authenticated" ON public.battery_specs;
DROP POLICY IF EXISTS "battery_specs_update_authenticated" ON public.battery_specs;
DROP POLICY IF EXISTS "battery_specs_delete_authenticated" ON public.battery_specs;

CREATE POLICY "battery_specs_select_anon_authenticated" ON public.battery_specs
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "battery_specs_insert_authenticated" ON public.battery_specs
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "battery_specs_update_authenticated" ON public.battery_specs
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) IS NOT NULL)
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "battery_specs_delete_authenticated" ON public.battery_specs
    FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) IS NOT NULL);


-- 7. PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
