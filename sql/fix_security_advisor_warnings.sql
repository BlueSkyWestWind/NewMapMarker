-- ============================================================
-- Security Advisor 경고 해결 스크립트
-- Supabase Dashboard → SQL Editor 에서 이 파일 전체를 실행하세요.
--
-- 해결 대상
--   1. RLS Policy Always True (markers 등)
--      - 레거시 "Allow all anonymous operations for ALL" 제거
--      - INSERT/UPDATE/DELETE 의 USING(true) → auth.uid() 검사로 교체
--   2. Leaked Password Protection
--      - SQL로 설정 불가 → 아래 [대시보드 수동 설정] 참고
--
-- 동작 (앱과 동일)
--   anon: SELECT(읽기)만
--   authenticated + 유효 JWT(uid): INSERT / UPDATE / DELETE
-- ============================================================

-- ------------------------------------------------------------
-- 0. 레거시 과도 허용 정책 제거 (Security Advisor 주요 원인)
--    ※ 대시보드에 표시되는 이름: "Allow all anonymous operations" (for ALL 없음)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all anonymous operations" ON public.markers;
DROP POLICY IF EXISTS "Allow all anonymous operations" ON public.information;
DROP POLICY IF EXISTS "Allow all anonymous operations" ON public.battery_markers;
DROP POLICY IF EXISTS "Allow all anonymous operations" ON public.battery_specs;

DROP POLICY IF EXISTS "Allow all anonymous operations for ALL" ON public.markers;
DROP POLICY IF EXISTS "Allow all anonymous operations for ALL" ON public.information;
DROP POLICY IF EXISTS "Allow all anonymous operations for ALL" ON public.battery_markers;
DROP POLICY IF EXISTS "Allow all anonymous operations for ALL" ON public.battery_specs;

DROP POLICY IF EXISTS "Allow anonymous access to markers" ON public.markers;
DROP POLICY IF EXISTS "Allow anonymous access to information" ON public.information;
DROP POLICY IF EXISTS "Allow anonymous access to battery_markers" ON public.battery_markers;
DROP POLICY IF EXISTS "Allow anonymous access to battery_specs" ON public.battery_specs;

-- anon 에 ALL(전체) 권한을 주는 기타 레거시 정책 자동 제거
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('markers', 'information', 'battery_markers', 'battery_specs')
          AND (
              policyname ILIKE '%anonymous%'
              OR policyname ILIKE '%allow all%'
              OR (cmd IN ('*', 'ALL') AND 'anon' = ANY(roles))
          )
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON %I.%I',
            pol.policyname, pol.schemaname, pol.tablename
        );
        RAISE NOTICE 'Dropped legacy policy: % on %.%', pol.policyname, pol.schemaname, pol.tablename;
    END LOOP;
END $$;


-- ------------------------------------------------------------
-- 1. markers — 쓰기 정책만 재생성 (SELECT true 는 공개 읽기용으로 유지)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "markers_insert_authenticated" ON public.markers;
DROP POLICY IF EXISTS "markers_update_authenticated" ON public.markers;
DROP POLICY IF EXISTS "markers_delete_authenticated" ON public.markers;

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


-- ------------------------------------------------------------
-- 2. information
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "information_insert_authenticated" ON public.information;
DROP POLICY IF EXISTS "information_update_authenticated" ON public.information;
DROP POLICY IF EXISTS "information_delete_authenticated" ON public.information;

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


-- ------------------------------------------------------------
-- 3. battery_markers
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "battery_markers_insert_authenticated" ON public.battery_markers;
DROP POLICY IF EXISTS "battery_markers_update_authenticated" ON public.battery_markers;
DROP POLICY IF EXISTS "battery_markers_delete_authenticated" ON public.battery_markers;

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


-- ------------------------------------------------------------
-- 4. battery_specs
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "battery_specs_insert_authenticated" ON public.battery_specs;
DROP POLICY IF EXISTS "battery_specs_update_authenticated" ON public.battery_specs;
DROP POLICY IF EXISTS "battery_specs_delete_authenticated" ON public.battery_specs;

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


NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- [실행 후 확인] 아래 SELECT 를 따로 실행해 정책 목록을 점검하세요.
-- "Allow all anonymous operations" 가 없어야 합니다.
--
-- SELECT tablename, policyname, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('markers', 'information', 'battery_markers', 'battery_specs')
-- ORDER BY tablename, policyname;
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- [대시보드 수동 설정] Leaked Password Protection Disabled
-- SQL로 변경 불가 — 아래를 Supabase Dashboard에서 설정하세요.
--
--   Authentication → Attack Protection (또는 Providers → Email 하단)
--   → "Prevent use of leaked passwords" (유출 비밀번호 사용 방지) 활성화
--
-- Pro 플랜 이상에서 제공될 수 있습니다. 무료 플랜이면 경고가 남을 수 있습니다.
-- ------------------------------------------------------------
