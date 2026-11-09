-- =====================================================================
-- 기상청 예보 저장소 — 07~17시 사전 수집과 사용자 조회가 받은 예보를 기준시각별로 저장한다.
--
-- 읽기·쓰기: 서버(서비스 키)에서만 한다. RLS 를 켜고 정책을 만들지 않았으므로
--            anon·authenticated 에게는 어떤 행도 보이지 않고 쓸 수도 없다(서비스 키는 RLS 를 건너뛴다).
-- 한 행 = (기상청 격자, 예보 종류, 기준일, 기준시각). payload 는 기상청 items 배열 그대로다.
-- 기준시각이 바뀌면 새 행이 생긴다. 읽을 때는 항상 정확한 기준시각으로 찾는다.
-- 이틀이 지난 행은 20261116000300_kma_prefetch_cron.sql 의 정리 작업이 매일 지운다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 적용 순서: 20261116000100_kma_api_usage.sql 이후.
-- 적용 전에도 날씨 조회는 그대로 동작하고(실시간 호출), 저장만 건너뛴다.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.kma_forecast_cache (
  nx         integer     NOT NULL,
  ny         integer     NOT NULL,
  kind       text        NOT NULL CHECK (kind IN ('vilage', 'ncst', 'ufcst')),
  base_date  text        NOT NULL,
  base_time  text        NOT NULL,
  payload    jsonb       NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source     text        NOT NULL CHECK (source IN ('user', 'prefetch')),
  PRIMARY KEY (nx, ny, kind, base_date, base_time)
);

COMMENT ON COLUMN public.kma_forecast_cache.kind IS
  'vilage=단기예보, ncst=초단기실황, ufcst=초단기예보';

-- 이틀 지난 행 정리용
CREATE INDEX IF NOT EXISTS kma_forecast_cache_fetched_idx
  ON public.kma_forecast_cache (fetched_at);

-- 정책을 일부러 만들지 않는다: 서비스 키만 접근한다.
ALTER TABLE public.kma_forecast_cache ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

-- 적용 후 확인 (SQL Editor 에서):
--   SELECT tablename, policyname FROM pg_policies WHERE tablename = 'kma_forecast_cache';
--     -- 결과가 0행이어야 한다(정책 없음 = 브라우저에서 접근 불가).
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.kma_forecast_cache'::regclass;
--     -- true 여야 한다.
--   날씨를 조회하거나 07~17시 수집이 돈 뒤:
--   SELECT kind, source, count(*), max(fetched_at) FROM public.kma_forecast_cache GROUP BY kind, source;
