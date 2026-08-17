-- =====================================================================
-- 0007_Process_Management -> 0004_NewMapMarker 위치마커 자동 등록 허용
-- 
-- 적용 방법: Supabase 대시보드(bgdqjtmkdprqencgnrbx) -> SQL Editor에 붙여넣고 Run
-- =====================================================================

-- 1. markers 테이블에 anon 쓰기/수정 권한 정책 추가
DROP POLICY IF EXISTS markers_insert_anon ON public.markers;
DROP POLICY IF EXISTS markers_update_anon ON public.markers;

CREATE POLICY markers_insert_anon ON public.markers
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY markers_update_anon ON public.markers
    FOR UPDATE TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 2. information 테이블에 anon 쓰기/수정 권한 정책 추가
DROP POLICY IF EXISTS information_insert_anon ON public.information;
DROP POLICY IF EXISTS information_update_anon ON public.information;

CREATE POLICY information_insert_anon ON public.information
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY information_update_anon ON public.information
    FOR UPDATE TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 3. erp_details 테이블에 anon 쓰기/수정 권한 정책 추가 (선택)
DROP POLICY IF EXISTS erp_details_insert_anon ON public.erp_details;
DROP POLICY IF EXISTS erp_details_update_anon ON public.erp_details;

CREATE POLICY erp_details_insert_anon ON public.erp_details
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY erp_details_update_anon ON public.erp_details
    FOR UPDATE TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 4. PostgREST API 스키마 캐시 즉시 갱신 통보
NOTIFY pgrst, 'reload schema';
