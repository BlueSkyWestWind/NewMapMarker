-- 1. battery_markers 및 battery_specs 테이블의 RLS(Row Level Security) 비활성화
-- RLS 정책으로 인해 API 호출 시 축전지 마커 데이터가 조회되지 않는 현상을 즉각 해결합니다.
ALTER TABLE public.battery_markers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.battery_specs DISABLE ROW LEVEL SECURITY;

-- 2. API 호출 권한 명시적 재부여
GRANT ALL ON TABLE public.battery_markers TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE public.battery_specs TO postgres, anon, authenticated, service_role;

-- 3. PostgREST API 스키마 캐시 갱신 통보
NOTIFY pgrst, 'reload schema';
