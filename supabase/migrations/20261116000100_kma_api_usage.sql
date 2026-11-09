-- =====================================================================
-- 기상청 API 호출 집계 — 기상청으로 실제 나간 호출을 시간대별로 센다.
--
-- 쓰기: 서버(서비스 키)에서만 한다. record_kma_call() 은 anon·authenticated 에서 실행할 수 없고
--       테이블에도 쓰기 정책이 없어 브라우저에서는 값을 올리거나 지울 수 없다.
-- 읽기: 관리자(public.is_app_admin())만. 앱은 /api/admin/kma-usage 로 읽는다.
-- 한 행 = (KST 정시, 포털, 호출 종류, 출처). 같은 조건의 호출은 calls 가 +1 된다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 적용 순서: 20261108000000_facility_schedule.sql(is_app_admin) 이후.
-- 적용 전에도 날씨 조회는 그대로 동작하고, 집계만 쌓이지 않는다.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.kma_api_usage (
  hour_kst   timestamptz NOT NULL,
  provider   text        NOT NULL CHECK (provider IN ('apihub', 'datago')),
  operation  text        NOT NULL,
  source     text        NOT NULL CHECK (source IN ('user', 'prefetch')),
  calls      integer     NOT NULL DEFAULT 0,
  errors     integer     NOT NULL DEFAULT 0,
  last_error text,
  PRIMARY KEY (hour_kst, provider, operation, source)
);

CREATE INDEX IF NOT EXISTS kma_api_usage_hour_idx
  ON public.kma_api_usage (hour_kst DESC);

ALTER TABLE public.kma_api_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kma_api_usage_select_admin ON public.kma_api_usage;
CREATE POLICY kma_api_usage_select_admin ON public.kma_api_usage
  FOR SELECT TO authenticated
  USING ((SELECT public.is_app_admin()));

-- 호출 1건을 올린다. p_error 가 있으면 실패 건수와 마지막 오류 코드도 갱신한다.
CREATE OR REPLACE FUNCTION public.record_kma_call(
  p_hour      timestamptz,
  p_provider  text,
  p_operation text,
  p_source    text,
  p_error     text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.kma_api_usage AS u (hour_kst, provider, operation, source, calls, errors, last_error)
  VALUES (
    p_hour, p_provider, p_operation, p_source, 1,
    CASE WHEN p_error IS NULL THEN 0 ELSE 1 END,
    p_error
  )
  ON CONFLICT (hour_kst, provider, operation, source) DO UPDATE
    SET calls      = u.calls + 1,
        errors     = u.errors + CASE WHEN p_error IS NULL THEN 0 ELSE 1 END,
        last_error = COALESCE(p_error, u.last_error);
$$;

-- 서비스 키(service_role)만 호출한다.
REVOKE ALL ON FUNCTION public.record_kma_call(timestamptz, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_kma_call(timestamptz, text, text, text, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';

-- 적용 후 확인 (SQL Editor 에서):
--   SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'kma_api_usage';
--     -- SELECT 정책 1개만 있어야 한다(쓰기 정책 없음).
--   날씨를 몇 번 조회한 뒤:
--   SELECT hour_kst, provider, operation, source, calls, errors
--     FROM public.kma_api_usage ORDER BY hour_kst DESC, operation LIMIT 20;
--
-- 90일이 지난 기록 정리 (필요할 때 직접 실행):
--   DELETE FROM public.kma_api_usage WHERE hour_kst < now() - interval '90 days';
