-- markers / battery_markers 테이블에 시설팀 컬럼 추가
ALTER TABLE public.markers ADD COLUMN IF NOT EXISTS facility_team VARCHAR(10) DEFAULT '';

ALTER TABLE public.battery_markers ADD COLUMN IF NOT EXISTS facility_team VARCHAR(10) DEFAULT '';

NOTIFY pgrst, 'reload schema';
