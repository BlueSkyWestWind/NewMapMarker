-- =====================================================================
-- Performance Advisor 정리: 사용하지 않는 public 인덱스 4개 삭제
--
-- 근거(2026-11-07 확인)
--   * pg_stat_user_indexes.idx_scan = 0. 통계는 2026-05-22부터 쌓였다.
--   * 앱 코드에 이 열들로 조건을 거는 조회가 없다. 전부 읽은 뒤 화면에서 거른다.
--   * site_list_members는 (list_id, marker_id) 기본 키로 충분하다.
--
-- 인덱스만 지운다. 데이터는 그대로이고 언제든 다시 만들 수 있다(아래 복구 참고).
-- erp 스키마는 다른 앱의 것이라 건드리지 않는다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- =====================================================================

DROP INDEX IF EXISTS public.erp_details_raw_gin_idx;
DROP INDEX IF EXISTS public.markers_detached_visible_idx;
DROP INDEX IF EXISTS public.markers_group_key_idx;
DROP INDEX IF EXISTS public.site_list_members_marker_id_idx;

-- ---------------------------------------------------------------------
-- 복구가 필요하면
--   CREATE INDEX erp_details_raw_gin_idx ON public.erp_details USING gin (raw);
--   CREATE INDEX markers_detached_visible_idx ON public.markers (detached_visible);
--   CREATE INDEX markers_group_key_idx ON public.markers (group_key);
--   CREATE INDEX site_list_members_marker_id_idx ON public.site_list_members (marker_id);
-- ---------------------------------------------------------------------
