-- =====================================================================
-- 계정설정: 접속 기록 전용 테이블 (public.login_history)
--
-- 배경: auth.audit_log_entries 가 이 프로젝트에서는 0건이라 접속 기록 창이 비어 있었다.
--       auth.sessions 의 생성(INSERT)을 login, 삭제(DELETE)를 logout 으로 이 테이블에 남긴다.
--
-- 기록 항목: 시각, 계정 ID, 이메일(기록 시점 스냅샷), 이벤트, IP, 브라우저(User-Agent), 세션 ID.
-- 주의:
--   - logout 행의 IP·브라우저는 세션이 만들어질 때의 값이다(로그아웃 요청 시점 값이 아니다).
--   - 세션 만료·강제 종료·정리로 행이 지워져도 logout 으로 기록된다(직접 로그아웃과 구분 불가).
--   - user_id 에 외래키를 걸지 않는다. 계정을 지워도 기록은 남고 email 로 누구였는지 알아본다.
--
-- 권한: 관리자만 읽는다(RLS). 쓰기 정책은 없고, 아래 트리거 함수(SECURITY DEFINER)만 기록한다.
-- 실패 처리: 트리거 함수는 예외를 삼켜 기록 실패가 로그인·로그아웃을 막지 않는다.
-- 보관: pg_cron 작업 login-history-cleanup 이 매일 1년 지난 행을 지운다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 적용 전에는 접속 기록 창에 "아직 없습니다" 안내가 보인다.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.login_history (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id     uuid NOT NULL,
  email       text NOT NULL DEFAULT '',
  action      text NOT NULL CHECK (action IN ('login', 'logout')),
  ip          text,
  user_agent  text,
  session_id  uuid
);

CREATE INDEX IF NOT EXISTS login_history_user_occurred_idx
  ON public.login_history (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS login_history_occurred_idx
  ON public.login_history (occurred_at DESC);

ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS login_history_select_admin ON public.login_history;
CREATE POLICY login_history_select_admin ON public.login_history
  FOR SELECT TO authenticated
  USING ((SELECT public.is_app_admin()));

-- auth.sessions 의 생성·삭제를 기록하는 트리거 함수.
CREATE OR REPLACE FUNCTION public.handle_auth_session_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_email   text;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      v_user_id := NEW.user_id;
      SELECT u.email INTO v_email FROM auth.users AS u WHERE u.id = v_user_id;
      INSERT INTO public.login_history (occurred_at, user_id, email, action, ip, user_agent, session_id)
      VALUES (COALESCE(NEW.created_at, now()), v_user_id, COALESCE(v_email, ''), 'login', host(NEW.ip), NEW.user_agent, NEW.id);
    ELSIF TG_OP = 'DELETE' THEN
      v_user_id := OLD.user_id;
      SELECT u.email INTO v_email FROM auth.users AS u WHERE u.id = v_user_id;
      INSERT INTO public.login_history (occurred_at, user_id, email, action, ip, user_agent, session_id)
      VALUES (now(), v_user_id, COALESCE(v_email, ''), 'logout', host(OLD.ip), OLD.user_agent, OLD.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- 기록 실패가 로그인·로그아웃을 막지 않는다.
    NULL;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_auth_session_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_session_login_history ON auth.sessions;
CREATE TRIGGER on_auth_session_login_history
  AFTER INSERT OR DELETE ON auth.sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_session_event();

-- 지금 살아 있는 세션을 로그인 기록으로 한 번 옮긴다(같은 세션이 이미 있으면 건너뛴다).
INSERT INTO public.login_history (occurred_at, user_id, email, action, ip, user_agent, session_id)
SELECT s.created_at, s.user_id, COALESCE(u.email, ''), 'login', host(s.ip), s.user_agent, s.id
FROM auth.sessions AS s
LEFT JOIN auth.users AS u ON u.id = s.user_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.login_history AS h
  WHERE h.session_id = s.id
    AND h.action = 'login'
);

-- 매일 09:05 UTC(KST 18:05)에 1년 지난 기록을 지운다. 다시 실행하면 기존 작업을 지우고 새로 등록한다.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'login-history-cleanup';
END
$$;

SELECT cron.schedule(
  'login-history-cleanup',
  '5 9 * * *',
  $cron$ DELETE FROM public.login_history WHERE occurred_at < now() - interval '1 year'; $cron$
);

NOTIFY pgrst, 'reload schema';

-- 적용 후 확인 (SQL Editor 에서):
--   SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'login_history';
--     -- SELECT 정책 1개만 있어야 한다.
--   SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'auth.sessions'::regclass AND NOT tgisinternal;
--   SELECT occurred_at, email, action, ip, session_id FROM public.login_history ORDER BY occurred_at DESC LIMIT 10;
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'login-history-cleanup';
