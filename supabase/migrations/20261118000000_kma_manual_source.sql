-- =====================================================================
-- 기상청 3단계 — "현재 데이터로 갱신" 버튼이 받은 값을 저장·집계할 수 있게 source 에 manual 을 허용한다.
--
-- 대상: public.kma_forecast_cache.source, public.kma_api_usage.source
--   기존: ('user', 'prefetch')   변경: ('user', 'prefetch', 'manual')
-- 기존 행은 바뀌지 않는다. 제약 이름은 컬럼 CHECK 의 기본 이름이다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 적용 순서: 20261116000100_kma_api_usage.sql, 20261116000200_kma_forecast_cache.sql 이후.
-- 적용 전에도 화면은 저장된 값을 그대로 보여 준다. 갱신 버튼이 받은 값의 저장·집계만 실패하고,
-- 갱신 결과는 화면에 그대로 보인다(응답에 saved: false 로 알린다).
-- =====================================================================

ALTER TABLE public.kma_forecast_cache
  DROP CONSTRAINT IF EXISTS kma_forecast_cache_source_check;
ALTER TABLE public.kma_forecast_cache
  ADD CONSTRAINT kma_forecast_cache_source_check
  CHECK (source IN ('user', 'prefetch', 'manual'));

ALTER TABLE public.kma_api_usage
  DROP CONSTRAINT IF EXISTS kma_api_usage_source_check;
ALTER TABLE public.kma_api_usage
  ADD CONSTRAINT kma_api_usage_source_check
  CHECK (source IN ('user', 'prefetch', 'manual'));

COMMENT ON COLUMN public.kma_forecast_cache.source IS
  'user=화면 조회가 채움(2단계 방식), prefetch=자동 수집, manual=현재 데이터로 갱신 버튼';
