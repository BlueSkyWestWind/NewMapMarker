-- 1. 기존 markers 테이블에 color 컬럼 추가 (기본값: 에메랄드 그린 '#10b981')
ALTER TABLE public.markers ADD COLUMN IF NOT EXISTS color VARCHAR(50) DEFAULT '#10b981';

-- 2. Supabase PostgREST API 스키마 캐시 즉시 강제 리로드
NOTIFY pgrst, 'reload schema';
