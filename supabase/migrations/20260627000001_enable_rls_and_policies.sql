-- 1. battery_markers 및 battery_specs 테이블의 RLS(Row Level Security) 활성화
-- Supabase Security Advisor의 RLS Disabled 경고 문제를 해결하고 보안을 강화합니다.
ALTER TABLE public.battery_markers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battery_specs ENABLE ROW LEVEL SECURITY;

-- 2. 기존 생성되었을 수 있는 정책들 안전하게 삭제 (중복 방지)
DROP POLICY IF EXISTS battery_markers_select_all ON public.battery_markers;
DROP POLICY IF EXISTS battery_markers_modify_auth ON public.battery_markers;
DROP POLICY IF EXISTS battery_markers_delete_authenticated ON public.battery_markers;
DROP POLICY IF EXISTS battery_markers_insert_authenticated ON public.battery_markers;
DROP POLICY IF EXISTS battery_markers_update_authenticated ON public.battery_markers;

DROP POLICY IF EXISTS battery_specs_select_all ON public.battery_specs;
DROP POLICY IF EXISTS battery_specs_modify_auth ON public.battery_specs;
DROP POLICY IF EXISTS battery_specs_delete_authenticated ON public.battery_specs;
DROP POLICY IF EXISTS battery_specs_insert_authenticated ON public.battery_specs;
DROP POLICY IF EXISTS battery_specs_update_authenticated ON public.battery_specs;

-- 3. 모든 사람(비로그인 anon 및 로그인 authenticated 전체)에게 조회(SELECT) 허용 정책 수립
-- 비로그인 일반 관람자도 지도의 마커 데이터를 정상적으로 읽어올 수 있도록 허용합니다.
CREATE POLICY battery_markers_select_all ON public.battery_markers
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY battery_specs_select_all ON public.battery_specs
    FOR SELECT TO anon, authenticated
    USING (true);

-- 4. 로그인한 관리자(authenticated)에게만 모든 데이터 조작(INSERT, UPDATE, DELETE) 권한 부여 정책 수립
-- 단순히 USING (true)를 사용하면 항상 참이 되어 경고가 발생하므로, 명시적인 인증 역할(auth.role)을 검증하여 보안을 강화합니다.
CREATE POLICY battery_markers_modify_auth ON public.battery_markers
    FOR ALL TO authenticated
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY battery_specs_modify_auth ON public.battery_specs
    FOR ALL TO authenticated
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- 5. PostgREST API 스키마 캐시 즉시 갱신 통보
NOTIFY pgrst, 'reload schema';
