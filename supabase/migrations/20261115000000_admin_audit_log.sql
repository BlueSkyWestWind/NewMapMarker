-- =====================================================================
-- 관리자 작업 감사 기록 — 계정설정의 계정 생성·삭제·관리자 권한 변경을 누가 언제 했는지 남긴다.
--
-- 쓰기: 서버(서비스 키)에서만 한다. authenticated·anon 에는 INSERT/UPDATE/DELETE 정책이 없어
--       브라우저에서는 쓰거나 지울 수 없다(서비스 키는 RLS 를 건너뛴다).
-- 읽기: 관리자(public.is_app_admin())만. 앱은 /api/admin/audit 로 읽는다.
-- 삭제된 계정도 남도록 대상 이메일은 복사해서 저장한다(대상 ID 에는 외래키를 걸지 않는다).
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 적용 순서: 20261108000000_facility_schedule.sql(is_app_admin) 이후.
-- 적용 전에도 계정설정은 그대로 동작하고, 기록만 남지 않는다.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  actor_id     uuid,
  actor_email  text NOT NULL DEFAULT '',
  action       text NOT NULL CHECK (action IN ('account_create', 'account_delete', 'admin_grant', 'admin_revoke')),
  target_id    uuid,
  target_email text NOT NULL DEFAULT '',
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip           text
);

CREATE INDEX IF NOT EXISTS admin_audit_log_occurred_idx
  ON public.admin_audit_log (occurred_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_audit_log_select_admin ON public.admin_audit_log;
CREATE POLICY admin_audit_log_select_admin ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING ((SELECT public.is_app_admin()));

NOTIFY pgrst, 'reload schema';

-- 적용 후 확인 (SQL Editor 에서):
--   SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'admin_audit_log';
--     -- SELECT 정책 1개만 있어야 한다(쓰기 정책 없음).
--   계정설정에서 계정을 추가·삭제하거나 권한을 바꾼 뒤:
--   SELECT occurred_at, actor_email, action, target_email, ip FROM public.admin_audit_log ORDER BY occurred_at DESC LIMIT 10;
