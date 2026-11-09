-- =====================================================================
-- 기상청 사전 수집 크론 — KST 07시~17시, 각 시의 0~28분 사이 2분마다 수집 라우트를 부른다.
--
-- 수집 라우트(POST /api/internal/kma-prefetch)는 한 번 불릴 때 빠진 격자 최대 8개만 받는 멱등 조각이다.
-- 이미 받은 것은 다시 받지 않으므로 한 시간에 여러 번 불려도 기상청 호출은 늘지 않는다.
--
-- ※ 먼저 해야 할 일 (이 파일을 실행하기 전):
--   1) Supabase 대시보드 -> Database -> Extensions 에서 pg_cron, pg_net 을 켠다.
--   2) 임의의 긴 토큰을 하나 만든다(예: 32자 이상 무작위 문자열).
--   3) Cloudflare 에 같은 토큰을 Secret 으로 등록한다:  npx wrangler secret put KMA_PREFETCH_TOKEN
--   4) SQL Editor 에서 vault 에 두 값을 저장한다(값 자리는 직접 채운다. 이 파일에는 값을 쓰지 않는다):
--        select vault.create_secret('<여기에 토큰>', 'kma_prefetch_token');
--        select vault.create_secret('<여기에 https://배포주소/api/internal/kma-prefetch>', 'kma_prefetch_url');
--      값을 바꿀 때는 vault.update_secret 을 쓴다.
--
-- 적용 방법: 위 준비 뒤 SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다(작업을 지우고 다시 등록).
-- 적용 순서: 20261116000200_kma_forecast_cache.sql 이후.
-- vault 값이 없으면 함수가 아무것도 하지 않고 끝난다(오류 없음).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.run_kma_prefetch_slice()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url   text;
  v_token text;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'kma_prefetch_url' LIMIT 1;
  SELECT decrypted_secret INTO v_token
    FROM vault.decrypted_secrets WHERE name = 'kma_prefetch_token' LIMIT 1;

  IF v_url IS NULL OR v_token IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url                  := v_url,
    headers              := jsonb_build_object(
                              'Content-Type', 'application/json',
                              'x-kma-prefetch-token', v_token
                            ),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
END;
$$;

-- 크론(postgres)만 실행한다. 브라우저 역할에서는 호출할 수 없다.
REVOKE ALL ON FUNCTION public.run_kma_prefetch_slice() FROM PUBLIC, anon, authenticated;

-- 이미 등록돼 있으면 지우고 다시 등록한다(멱등).
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job
   WHERE jobname IN ('kma-prefetch', 'kma-prefetch-cleanup');
END
$$;

-- KST 07~17시 = UTC 22~23시(전날) + 0~8시. pg_cron 은 UTC 기준이다.
SELECT cron.schedule(
  'kma-prefetch',
  '0-28/2 22-23,0-8 * * *',
  $cron$ SELECT public.run_kma_prefetch_slice(); $cron$
);

-- 매일 18시(KST) = UTC 09:00 에 이틀 지난 저장분을 지운다.
SELECT cron.schedule(
  'kma-prefetch-cleanup',
  '0 9 * * *',
  $cron$ DELETE FROM public.kma_forecast_cache WHERE fetched_at < now() - interval '2 days'; $cron$
);

-- 적용 후 확인 (SQL Editor 에서):
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'kma-prefetch%';
--     -- 2행(kma-prefetch, kma-prefetch-cleanup)이 보여야 한다.
--   SELECT status, return_message, start_time FROM cron.job_run_details
--    ORDER BY start_time DESC LIMIT 10;
--   SELECT id, status_code, content FROM net._http_response ORDER BY created DESC LIMIT 5;
--     -- 07~17시(KST) 안에서는 status_code 200 과 {"status":"done",...} 이 보여야 한다.
--
-- 중지하려면:  SELECT cron.unschedule('kma-prefetch');
