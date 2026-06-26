-- 1. 기존 information 테이블 삭제 (권한 및 구조 꼬임 해결을 위해 완전 재생성)
DROP TABLE IF EXISTS public.information CASCADE;

-- 2. public 스키마에 명시적으로 information 테이블 생성
CREATE TABLE public.information (
    facility_code VARCHAR(255) PRIMARY KEY, -- 통합시설코드
    place_name VARCHAR(255) DEFAULT '', -- 장소이름
    facility_year VARCHAR(100) DEFAULT '', -- 시설연도
    project_code VARCHAR(255) DEFAULT '', -- 프로젝트코드
    business_type VARCHAR(100) DEFAULT '', -- 사업구분
    final_station_name VARCHAR(255) DEFAULT '', -- 국소명-최종
    eq_class VARCHAR(100) DEFAULT '', -- 장비분류
    eq_type VARCHAR(100) DEFAULT '', -- 장비타입
    install_date VARCHAR(100) DEFAULT '', -- 시설일
    open_date VARCHAR(100) DEFAULT '', -- 가동일/개통일
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. RLS 활성화 (정책 상세는 sql/enable_rls_policies.sql 실행)
ALTER TABLE public.information ENABLE ROW LEVEL SECURITY;

-- 4. API 호출용 최소 권한 부여
REVOKE ALL ON TABLE public.information FROM anon;
GRANT SELECT ON TABLE public.information TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.information TO authenticated;
GRANT ALL ON TABLE public.information TO postgres, service_role;

-- 5. 기존 markers 테이블에 통합시설코드(facility_code) 참조용 컬럼 추가 (존재하지 않을 경우에만)
ALTER TABLE public.markers ADD COLUMN IF NOT EXISTS facility_code VARCHAR(255);

-- 6. 장비 관계(FK) 설정 — sql/add_equipment_relationships.sql 실행
--    information.marker_id → markers.id (축전지 battery_specs.marker_id 와 동일 패턴)

-- 7. Supabase PostgREST API 스키마 캐시 즉시 강제 리로드
NOTIFY pgrst, 'reload schema';
