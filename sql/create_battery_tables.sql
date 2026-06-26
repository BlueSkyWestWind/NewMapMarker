-- 1. 기존 테이블 삭제 (초기화 필요시 대비)
DROP TABLE IF EXISTS public.battery_specs CASCADE;
DROP TABLE IF EXISTS public.battery_markers CASCADE;

-- 2. battery_markers 테이블 생성 (축전지 사이트의 대표 위치 정보)
CREATE TABLE public.battery_markers (
    id VARCHAR(255) PRIMARY KEY,          -- 마커 고유 ID
    name VARCHAR(255) NOT NULL,           -- 대표 사이트/창고/국소명
    lat DOUBLE PRECISION NOT NULL,        -- 위도
    lng DOUBLE PRECISION NOT NULL,        -- 경도
    address VARCHAR(500) DEFAULT '',      -- 대표 주소
    memo TEXT DEFAULT '',                 -- 비고 / 메모
    tags VARCHAR(255)[] DEFAULT '{}',     -- 태그 목록
    color VARCHAR(50) DEFAULT '#10b981',  -- 마커 색상
    facility_team VARCHAR(10) DEFAULT '', -- 시설팀 (1,2,3,4,5,7)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS 활성화 (정책 상세는 sql/enable_rls_policies.sql 실행)
ALTER TABLE public.battery_markers ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.battery_markers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.battery_markers TO authenticated;
GRANT ALL ON TABLE public.battery_markers TO postgres, service_role;

-- 3. battery_specs 테이블 생성 (국소에 속한 개별 축전지 스펙 정보)
CREATE TABLE public.battery_specs (
    id BIGSERIAL PRIMARY KEY,             -- 개별 스펙 ID
    marker_id VARCHAR(255) REFERENCES public.battery_markers(id) ON DELETE CASCADE, -- 대표 마커 외래키 연동 (Cascade 삭제)
    erp_name VARCHAR(255) DEFAULT '',     -- 통합시설명칭(ERP)
    capacity INTEGER DEFAULT 600,         -- 용량 (AH)
    quantity INTEGER DEFAULT 12,          -- 수량 (Cell)
    station_name VARCHAR(255) DEFAULT '', -- 행별 실제 창고/국소/국사명
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS 활성화 (정책 상세는 sql/enable_rls_policies.sql 실행)
ALTER TABLE public.battery_specs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.battery_specs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.battery_specs TO authenticated;
GRANT ALL ON TABLE public.battery_specs TO postgres, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.battery_specs_id_seq TO authenticated;

-- 4. Supabase PostgREST API 스키마 캐시 즉시 강제 리로드
NOTIFY pgrst, 'reload schema';
