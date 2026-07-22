-- =====================================================================
-- markers.detached_visible : 같은 번지 SUB 국소를 지도에 개별 표시할지 여부
--   - 기본 false = 기존과 동일(대표만 표시, SUB 숨김)
--   - true 로 "개별 표시 해제"한 SUB만 지도에 개별 마커로 노출
--     (노출 후 지도에서 핀을 드래그해 실제 위치로 배치 → lat/lng 갱신)
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run
-- =====================================================================

ALTER TABLE public.markers
  ADD COLUMN IF NOT EXISTS detached_visible boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.markers.detached_visible IS
  '동일 번지 SUB를 지도에 개별 표시(true)할지 여부. 기본 false(대표만 표시).';

CREATE INDEX IF NOT EXISTS markers_detached_visible_idx
  ON public.markers (detached_visible);

-- PostgREST 스키마 캐시 즉시 갱신 (신규 컬럼 인식용)
NOTIFY pgrst, 'reload schema';
