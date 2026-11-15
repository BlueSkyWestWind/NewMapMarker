-- =====================================================================
-- survey_settings 트리거 함수의 search_path를 빈 값('')으로 고정한다.
--
-- 기존 20261117000200_survey_settings.sql 의 touch_survey_settings_updated_at() 은
-- SET search_path = public 으로 되어 있어, 다른 마이그레이션 함수들과 일관성을 맞추기 위해
-- 빈 search_path 로 정리한다. 본문은 pg_catalog.now() 만 사용하므로 동일하게 동작한다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run.
-- =====================================================================

ALTER FUNCTION public.touch_survey_settings_updated_at() SET search_path = '';
