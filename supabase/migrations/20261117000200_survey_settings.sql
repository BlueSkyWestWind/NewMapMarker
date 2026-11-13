-- 현장실사서 → 세부 시트 정리: 환경설정(항상 1행).
-- 수정은 관리자만, 읽기는 로그인한 모든 사용자. 사용자가 Supabase SQL Editor에서 적용한다.
-- 적용 전에는 앱이 기본 설정으로 동작하고 저장만 막힌다.
-- 적용 순서: 20261108000000_facility_schedule.sql(public.is_app_admin) 이후.

CREATE TABLE IF NOT EXISTS public.survey_settings (
  id         text PRIMARY KEY CHECK (id = 'default'),
  settings   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION public.touch_survey_settings_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS survey_settings_touch ON public.survey_settings;
CREATE TRIGGER survey_settings_touch BEFORE UPDATE ON public.survey_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_survey_settings_updated_at();

ALTER TABLE public.survey_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS survey_settings_select ON public.survey_settings;
CREATE POLICY survey_settings_select ON public.survey_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS survey_settings_insert ON public.survey_settings;
CREATE POLICY survey_settings_insert ON public.survey_settings
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_app_admin()));

DROP POLICY IF EXISTS survey_settings_update ON public.survey_settings;
CREATE POLICY survey_settings_update ON public.survey_settings
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_app_admin()))
  WITH CHECK ((SELECT public.is_app_admin()));

-- DELETE 정책은 두지 않는다(삭제 불가). 기본값으로 되돌리기는 settings를 '{}'로 저장한다.
