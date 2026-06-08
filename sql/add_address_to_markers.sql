-- markers 테이블에 도로명 주소(road_address) 및 지번 주소(jibun_address) 컬럼 추가
ALTER TABLE public.markers ADD COLUMN IF NOT EXISTS road_address VARCHAR(500) DEFAULT '';
ALTER TABLE public.markers ADD COLUMN IF NOT EXISTS jibun_address VARCHAR(500) DEFAULT '';

-- Supabase PostgREST API 스키마 캐시 즉시 강제 리로드
NOTIFY pgrst, 'reload schema';
