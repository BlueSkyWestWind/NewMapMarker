-- =====================================================================
-- 시설일정 작업금지(프리징) 기간 (Ver 3.0) — 일정관리 > 시설일정
--
-- schedule_freezes : 수능처럼 작업을 못 하는 기간. 몇 월 며칠 몇 시부터 몇 월 며칠 몇 시까지 + 사유.
--   일정표의 해당 날짜 칸에 `⛔ 사유 시간대`로 표시만 한다(일정 입력을 막지 않는다).
--
-- 시각은 timestamptz 로 저장한다. 앱이 한국 시각(+09:00)을 붙여 넣는다.
-- 권한: 조회는 로그인 사용자 전체, 쓰기는 관리자(public.is_app_admin())만.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 적용 순서: 20261107000000_site_lists.sql(app_admins, is_app_admin) 이후.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.schedule_freezes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  reason     text NOT NULL CHECK (length(btrim(reason)) > 0 AND length(reason) <= 100),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_freezes_range_check CHECK (ends_at > starts_at)
);

-- 일정표가 보이는 기간과 겹치는 금지 기간을 찾는다.
CREATE INDEX IF NOT EXISTS schedule_freezes_range_idx
  ON public.schedule_freezes (ends_at, starts_at);

ALTER TABLE public.schedule_freezes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schedule_freezes_select_auth ON public.schedule_freezes;
CREATE POLICY schedule_freezes_select_auth ON public.schedule_freezes
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS schedule_freezes_insert_admin ON public.schedule_freezes;
CREATE POLICY schedule_freezes_insert_admin ON public.schedule_freezes
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_app_admin()));

DROP POLICY IF EXISTS schedule_freezes_delete_admin ON public.schedule_freezes;
CREATE POLICY schedule_freezes_delete_admin ON public.schedule_freezes
  FOR DELETE TO authenticated
  USING ((SELECT public.is_app_admin()));

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 적용 후 확인 (SQL Editor 는 service role 로 돌아 RLS 를 건너뛴다)
--   (a) 관리자 계정으로 앱의 「작업금지」 창에서 기간을 추가하면 성공해야 한다.
--   (b) 일반 계정은 목록 조회만 되고 추가·삭제 버튼이 없어야 한다.
--   SELECT count(*) FROM public.schedule_freezes;  -- 0 이상
-- ---------------------------------------------------------------------
