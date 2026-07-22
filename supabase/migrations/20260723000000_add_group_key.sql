-- =====================================================================
-- markers.group_key : 번지 하위에서 "동/구역 단위 실제 그룹 분리"용 영구 키
--   - NULL(기본) = 번지 주소 키(getLotAddressKey)로 그룹(기존 동작 그대로)
--   - 값 있음   = 이 키로 별도 그룹(대표+SUB). 같은 번지라도 분리됨.
--     예) 아파트 695-6번지에서 103동만 분리 → 그 국소들에 동일 group_key 부여
--         → 원 번지 그룹에서 빠지고 독립 대표+SUB 그룹이 됨(원복 시 NULL로).
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run
-- =====================================================================

ALTER TABLE public.markers
  ADD COLUMN IF NOT EXISTS group_key text;

COMMENT ON COLUMN public.markers.group_key IS
  '번지 하위 분리 그룹 키. NULL이면 번지 주소로 그룹, 값이 있으면 그 키로 별도 그룹(대표+SUB).';

CREATE INDEX IF NOT EXISTS markers_group_key_idx
  ON public.markers (group_key);

-- PostgREST 스키마 캐시 즉시 갱신 (신규 컬럼 인식용)
NOTIFY pgrst, 'reload schema';
