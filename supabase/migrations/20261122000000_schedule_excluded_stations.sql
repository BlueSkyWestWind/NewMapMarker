-- =====================================================================
-- 시설일정 미배정·미완료 제외 국소 목록 (Ver 3.0)
--
-- 목적:
--   사업 취소·시설 불필요 등으로 일정에서 제외한 국소를 DB에 저장해
--   모든 관리자가 공유하고, 필요할 때 다시 복원할 수 있게 한다.
--
-- 컬럼:
--   id          : 행 식별자(uuid PK)
--   station_key : normalize(국소명) (1~200자, UNIQUE)
--   label       : 제외할 때의 국소명(표시용, 1~200자)
--   marker_id   : 참고용 마커 id(미배정 창에서 제외했을 때만)
--   reason      : 'canceled'(사업 취소) / 'unneeded'(시설 불필요) / 'other'(기타)
--   note        : 메모(100자 이하, reason='other'이면 필수)
--   created_by  : 등록자 uid
--   created_at  : 등록 시각
--
-- 권한:
--   조회(SELECT)는 로그인 사용자(authenticated) 전체,
--   추가(INSERT)·삭제(DELETE)는 관리자(public.is_app_admin())만 허용한다.
--   UPDATE 정책은 두지 않는다(ON CONFLICT (station_key) DO NOTHING은 INSERT 정책만으로 동작).
--
-- 적용 방법:
--   Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
--   적용 순서: 03_facility_schedule.sql(is_app_admin) 이후.
--
-- 되돌리는 방법:
--   DROP TABLE IF EXISTS public.schedule_excluded_stations;
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.schedule_excluded_stations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_key text NOT NULL UNIQUE
    CHECK (length(btrim(station_key)) > 0 AND length(station_key) <= 200),
  label       text NOT NULL
    CHECK (length(btrim(label)) > 0 AND length(label) <= 200),
  marker_id   text,
  reason      text NOT NULL
    CHECK (reason IN ('canceled', 'unneeded', 'other')),
  note        text NOT NULL DEFAULT ''
    CHECK (length(note) <= 100 AND (reason <> 'other' OR length(btrim(note)) > 0)),
  created_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_excluded_stations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schedule_excluded_stations_select_auth ON public.schedule_excluded_stations;
CREATE POLICY schedule_excluded_stations_select_auth ON public.schedule_excluded_stations
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS schedule_excluded_stations_insert_admin ON public.schedule_excluded_stations;
CREATE POLICY schedule_excluded_stations_insert_admin ON public.schedule_excluded_stations
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_app_admin()));

DROP POLICY IF EXISTS schedule_excluded_stations_delete_admin ON public.schedule_excluded_stations;
CREATE POLICY schedule_excluded_stations_delete_admin ON public.schedule_excluded_stations
  FOR DELETE TO authenticated
  USING ((SELECT public.is_app_admin()));

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 적용 후 확인 (SQL Editor에서 실행, 가짜 값 '__확인용국소__' 만 사용하고 끝에 지운다)
-- 비관리자 확인은 앱에서 일반 계정으로 [제외]가 막히는지 본다.
--
-- DO $$
-- DECLARE
--   v_cnt int;
-- BEGIN
--   DELETE FROM public.schedule_excluded_stations WHERE station_key = '__확인용국소__';
--
--   -- (a) 한 건 추가 -> 조회 1건
--   INSERT INTO public.schedule_excluded_stations (station_key, label, reason, note)
--   VALUES ('__확인용국소__', '__확인용국소__', 'canceled', '');
--   SELECT count(*) INTO v_cnt FROM public.schedule_excluded_stations WHERE station_key = '__확인용국소__';
--   ASSERT v_cnt = 1, format('(a) expected 1, got %s', v_cnt);
--
--   -- (b) 같은 station_key를 ON CONFLICT DO NOTHING으로 다시 추가 -> 여전히 1건
--   INSERT INTO public.schedule_excluded_stations (station_key, label, reason, note)
--   VALUES ('__확인용국소__', '__확인용국소__', 'unneeded', '')
--   ON CONFLICT (station_key) DO NOTHING;
--   SELECT count(*) INTO v_cnt FROM public.schedule_excluded_stations WHERE station_key = '__확인용국소__';
--   ASSERT v_cnt = 1, format('(b) expected 1, got %s', v_cnt);
--
--   -- (c) reason='other'이고 note='' -> CHECK 제약 오류
--   BEGIN
--     INSERT INTO public.schedule_excluded_stations (station_key, label, reason, note)
--     VALUES ('__확인용국소2__', '__확인용국소2__', 'other', '');
--     RAISE EXCEPTION 'expected check_violation';
--   EXCEPTION WHEN check_violation THEN
--     NULL;
--   END;
--
--   -- (d) 정리 삭제
--   DELETE FROM public.schedule_excluded_stations WHERE station_key IN ('__확인용국소__', '__확인용국소2__');
--   RAISE NOTICE 'schedule_excluded_stations verification passed';
-- END $$;
-- ---------------------------------------------------------------------
