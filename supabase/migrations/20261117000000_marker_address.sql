-- =====================================================================
-- 마커주소 — 마커가 놓인 좌표의 실제 주소를 저장한다.
--
-- road_address·jibun_address 는 엑셀에서 올린 주소(지번/신주소)이고, marker_address 는
-- 위치를 확인하고 저장하거나 마커를 옮길 때 그 좌표를 주소로 바꾼 값이다(도로명 우선).
-- 엑셀 주소와 마커 위치가 다르면 두 값이 달라지므로 따로 둔다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 적용 전에도 마커 조회·위치 저장은 그대로 동작하고, 마커주소만 저장·표시되지 않는다.
-- =====================================================================

ALTER TABLE public.markers
  ADD COLUMN IF NOT EXISTS marker_address text DEFAULT '';

COMMENT ON COLUMN public.markers.marker_address IS
  '마커 좌표의 주소(도로명 우선). 엑셀 주소(road_address·jibun_address)와 다를 수 있다.';

NOTIFY pgrst, 'reload schema';
