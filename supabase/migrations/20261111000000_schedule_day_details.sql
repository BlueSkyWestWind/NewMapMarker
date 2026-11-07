-- =====================================================================
-- 시설일정 일자별 상세·목록·누적 (Ver 3.0) — 일정관리 > 시설일정
--
-- 테이블
--   schedule_day_details : (작업일, 정규화한 국소명)별 사용자 입력. 작업구분·Level·작업시간·작업유형·
--                          중장비투입·작업내용·상세, 작업자·입회자·신호수 직접 수정값, 자동 열 덮어쓴 값(overrides).
--                          일정 칸이 아니라 (날짜, 국소)에 묶여 있어 일정 가져오기로 칸이 지워져도 남는다.
--   schedule_option_lists: 드롭다운 목록(목록 이름, 값, 순서). 처음 값은 통합 문서1.xlsx `List` 시트 + 작업시간.
--   schedule_archive_rows: 누적. 그날 상세표 한 행의 24열 값을 저장 당시 그대로 복사해 쌓는다.
--
-- 권한: 조회는 로그인 사용자 전체, 쓰기는 관리자(public.is_app_admin())만.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 적용 순서: 20261108000000_facility_schedule.sql(touch_schedule_updated_at, is_app_admin) 이후.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 테이블
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schedule_day_details (
  work_date     date NOT NULL,
  station_key   text NOT NULL,
  site          text NOT NULL,
  work_category text CHECK (length(work_category) <= 200),
  level_label   text CHECK (length(level_label) <= 200),
  work_time     text CHECK (length(work_time) <= 200),
  work_type     text CHECK (length(work_type) <= 200),
  equipment     text CHECK (length(equipment) <= 200),
  work_content  text CHECK (length(work_content) <= 200),
  work_detail   text CHECK (length(work_detail) <= 500),
  worker        text CHECK (length(worker) <= 200),
  witness       text CHECK (length(witness) <= 200),
  signaler      text CHECK (length(signaler) <= 200),
  overrides     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by    uuid DEFAULT auth.uid(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (work_date, station_key)
);

CREATE TABLE IF NOT EXISTS public.schedule_option_lists (
  list_key   text NOT NULL CHECK (list_key IN (
    'bizClass', 'bizKind', 'constructionType', 'workCategory',
    'workTime', 'workType', 'equipment', 'workContent'
  )),
  value      text NOT NULL CHECK (length(btrim(value)) BETWEEN 1 AND 100),
  sort_order int  NOT NULL DEFAULT 0,
  PRIMARY KEY (list_key, value)
);

CREATE TABLE IF NOT EXISTS public.schedule_archive_rows (
  work_date   date NOT NULL,
  station_key text NOT NULL,
  site        text NOT NULL,
  row_values  jsonb NOT NULL,
  search_text text NOT NULL DEFAULT '',
  saved_by    uuid DEFAULT auth.uid(),
  saved_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (work_date, station_key)
);

CREATE INDEX IF NOT EXISTS schedule_archive_rows_station_idx
  ON public.schedule_archive_rows (station_key, work_date DESC);

CREATE INDEX IF NOT EXISTS schedule_archive_rows_date_idx
  ON public.schedule_archive_rows (work_date DESC);

-- ---------------------------------------------------------------------
-- 목록 처음 값 (OPTION_LIST_SEEDS 와 같다). 이미 있는 값은 건드리지 않는다.
-- ---------------------------------------------------------------------
INSERT INTO public.schedule_option_lists (list_key, value, sort_order) VALUES
  ('bizClass', '기지국', 0),
  ('bizClass', '중계기', 1),
  ('bizClass', '인빌딩', 2),
  ('bizClass', '지하철', 3),
  ('bizClass', 'CATV', 4),
  ('bizClass', '택지', 5),
  ('bizClass', 'SKT선로', 6),
  ('bizClass', 'SKB선로', 7),
  ('bizClass', '통합국사', 8),
  ('bizClass', '공통설비', 9),
  ('bizClass', 'IDC', 10),
  ('bizClass', '발전소', 11),
  ('bizClass', '충전소', 12),
  ('bizKind', 'WCDMA', 0),
  ('bizKind', 'LoRa', 1),
  ('bizKind', '기타', 2),
  ('bizKind', '5G', 3),
  ('bizKind', 'Wi-Fi', 4),
  ('bizKind', 'LTE', 5),
  ('constructionType', '철거', 0),
  ('constructionType', '이설', 1),
  ('constructionType', '대개체', 2),
  ('constructionType', '신설', 3),
  ('constructionType', '증설', 4),
  ('workCategory', 'HW', 0),
  ('workCategory', '사업관리', 1),
  ('workCategory', '접속', 2),
  ('workCategory', '관로', 3),
  ('workCategory', '관리', 4),
  ('workCategory', '행정', 5),
  ('workCategory', '실사', 6),
  ('workCategory', '외선', 7),
  ('workCategory', '치국', 8),
  ('workCategory', '시험', 9),
  ('workCategory', 'SPEED', 10),
  ('workCategory', '측량', 11),
  ('workTime', '주간', 0),
  ('workTime', '야간', 1),
  ('workType', '고소(옥상/옥탑)작업', 0),
  ('workType', '고소(철탑/전주)작업', 1),
  ('workType', '실외', 2),
  ('workType', '실내', 3),
  ('workType', '철탑 설치/철거', 4),
  ('workType', '전주 설치/철거', 5),
  ('workType', '치국/현장실사', 6),
  ('workType', '사업관리/민원', 7),
  ('workType', '지하철/터널', 8),
  ('equipment', '이동식크레인', 0),
  ('equipment', '고소작업대(차)', 1),
  ('equipment', '고소작업대(시저형)', 2),
  ('equipment', '굴착기', 3),
  ('equipment', '롤러', 4),
  ('equipment', '펌프트럭', 5),
  ('equipment', '믹서트럭', 6),
  ('equipment', '덤프트럭', 7),
  ('equipment', '지게차', 8),
  ('equipment', '사다리차', 9),
  ('equipment', '이동식크레인,굴착기', 10),
  ('equipment', '이동식크레인,고소작업대(차)', 11),
  ('equipment', '이동식크레인,굴착기,고소작업대(차)', 12),
  ('equipment', '이동식크레인,굴착기,펌프트럭,믹서트럭', 13),
  ('equipment', '이동식크레인,굴착기,믹서트럭', 14),
  ('equipment', '펌프트럭,믹서트럭', 15),
  ('equipment', '승주', 16),
  ('workContent', 'RACK 설치/철거', 0),
  ('workContent', '장비철거', 1),
  ('workContent', '장비설치', 2),
  ('workContent', '장비시험', 3),
  ('workContent', '부대장비 설치/철거', 4),
  ('workContent', 'DU로딩', 5),
  ('workContent', '기타', 6)
ON CONFLICT (list_key, value) DO NOTHING;

-- ---------------------------------------------------------------------
-- 수정 시각·수정자 (20261108000000_facility_schedule.sql 의 touch_schedule_updated_at 재사용)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS schedule_day_details_touch_updated_at ON public.schedule_day_details;
CREATE TRIGGER schedule_day_details_touch_updated_at
  BEFORE UPDATE ON public.schedule_day_details
  FOR EACH ROW EXECUTE FUNCTION public.touch_schedule_updated_at();

-- 누적을 다시 저장(UPDATE)하면 저장자·저장 시각을 새로 고친다. 앱은 saved_at·saved_by를 보내지 않는다.
CREATE OR REPLACE FUNCTION public.touch_schedule_archive_saved()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.saved_by = auth.uid();
  NEW.saved_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schedule_archive_rows_touch_saved ON public.schedule_archive_rows;
CREATE TRIGGER schedule_archive_rows_touch_saved
  BEFORE UPDATE ON public.schedule_archive_rows
  FOR EACH ROW EXECUTE FUNCTION public.touch_schedule_archive_saved();

-- ---------------------------------------------------------------------
-- RLS: 조회는 로그인 사용자 전체, 쓰기는 관리자만
-- ---------------------------------------------------------------------
ALTER TABLE public.schedule_day_details  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_option_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_archive_rows ENABLE ROW LEVEL SECURITY;

-- schedule_day_details
DROP POLICY IF EXISTS schedule_day_details_select_auth ON public.schedule_day_details;
CREATE POLICY schedule_day_details_select_auth ON public.schedule_day_details
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS schedule_day_details_insert_admin ON public.schedule_day_details;
CREATE POLICY schedule_day_details_insert_admin ON public.schedule_day_details
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_app_admin()));

DROP POLICY IF EXISTS schedule_day_details_update_admin ON public.schedule_day_details;
CREATE POLICY schedule_day_details_update_admin ON public.schedule_day_details
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_app_admin()))
  WITH CHECK ((SELECT public.is_app_admin()));

DROP POLICY IF EXISTS schedule_day_details_delete_admin ON public.schedule_day_details;
CREATE POLICY schedule_day_details_delete_admin ON public.schedule_day_details
  FOR DELETE TO authenticated
  USING ((SELECT public.is_app_admin()));

-- schedule_option_lists: 값 추가·삭제만 허용한다(수정 정책 없음).
DROP POLICY IF EXISTS schedule_option_lists_select_auth ON public.schedule_option_lists;
CREATE POLICY schedule_option_lists_select_auth ON public.schedule_option_lists
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS schedule_option_lists_insert_admin ON public.schedule_option_lists;
CREATE POLICY schedule_option_lists_insert_admin ON public.schedule_option_lists
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_app_admin()));

DROP POLICY IF EXISTS schedule_option_lists_delete_admin ON public.schedule_option_lists;
CREATE POLICY schedule_option_lists_delete_admin ON public.schedule_option_lists
  FOR DELETE TO authenticated
  USING ((SELECT public.is_app_admin()));

-- schedule_archive_rows
DROP POLICY IF EXISTS schedule_archive_rows_select_auth ON public.schedule_archive_rows;
CREATE POLICY schedule_archive_rows_select_auth ON public.schedule_archive_rows
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS schedule_archive_rows_insert_admin ON public.schedule_archive_rows;
CREATE POLICY schedule_archive_rows_insert_admin ON public.schedule_archive_rows
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_app_admin()));

DROP POLICY IF EXISTS schedule_archive_rows_update_admin ON public.schedule_archive_rows;
CREATE POLICY schedule_archive_rows_update_admin ON public.schedule_archive_rows
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_app_admin()))
  WITH CHECK ((SELECT public.is_app_admin()));

DROP POLICY IF EXISTS schedule_archive_rows_delete_admin ON public.schedule_archive_rows;
CREATE POLICY schedule_archive_rows_delete_admin ON public.schedule_archive_rows
  FOR DELETE TO authenticated
  USING ((SELECT public.is_app_admin()));

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 적용 후 확인 (SQL Editor 는 service role 로 돌아 RLS 를 건너뛰므로,
-- 권한은 앱에서 로그인한 계정으로 확인한다.)
--
-- (a) 관리자 계정으로 일자별 상세를 저장하면 성공해야 한다.
-- (b) 일반 계정으로 저장하려 하면 실패해야 한다(new row violates row-level security policy).
-- (c) 일반 계정으로 일자별·누적 보기를 열면 조회는 되고 읽기 전용이어야 한다.
--
-- 구조 확인:
--   SELECT list_key, count(*) FROM public.schedule_option_lists GROUP BY list_key ORDER BY list_key;
--     -- bizClass 13, bizKind 6, constructionType 5, equipment 17, workCategory 12, workContent 7, workTime 2, workType 9
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE tablename IN ('schedule_day_details', 'schedule_option_lists', 'schedule_archive_rows')
--   ORDER BY tablename, cmd;
--   SELECT indexname FROM pg_indexes WHERE tablename = 'schedule_archive_rows';
-- ---------------------------------------------------------------------
