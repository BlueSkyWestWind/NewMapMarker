-- 시설일정(테이블·함수·결과·프리징·일자별 상세·누적·보정)
-- 아래 파일들을 파일명 순서대로 이어 붙인 것이다(내용은 원본 그대로, 구분선 주석만 추가).
-- 이미 적용된 DB에는 다시 실행하지 않는다. 새 DB를 만들 때만 번호 순서대로 실행한다.

-- ============================================================
-- 원본: 20261108000000_facility_schedule.sql
-- ============================================================
-- =====================================================================
-- 시설일정 (Ver 3.0) — 일정관리 > 시설일정
--
-- 테이블
--   schedule_columns : 일정표 열 설정(팀 이름, 팀장 이름, 순서). 앱에서는 이름만 수정한다.
--   schedule_cells   : 일정표의 한 칸 쌍(국소·작업 / 모국·장비·메모) = 한 행.
--   schedule_days    : 날짜별 메모(날짜 아래에 적는 이름 등).
--   schedule_marks   : 날짜 x 팀 칸 색(중장비·승주·K대응 등).
--
-- 권한: 조회는 로그인 사용자 전체, 쓰기는 관리자(public.is_app_admin())만.
-- 팀장 이름은 직원 실명이라 이 파일에 넣지 않는다. 앱 화면이나 엑셀 가져오기로 입력한다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 적용 순서: 20261107000000_site_lists.sql(app_admins, is_app_admin) 이후.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 테이블
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schedule_columns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order   int  NOT NULL UNIQUE,
  team_label   text NOT NULL CHECK (length(btrim(team_label)) > 0),
  leader_label text NOT NULL DEFAULT ''
);

INSERT INTO public.schedule_columns (sort_order, team_label) VALUES
  (0, '1팀'),
  (1, '2팀'),
  (2, '3팀'),
  (3, '4팀'),
  (4, '5팀'),
  (5, '7팀'),
  (6, '6팀'),
  (7, '시험팀'),
  (8, '실사&재하도급'),
  (9, '비고')
ON CONFLICT (sort_order) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.schedule_cells (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_date  date NOT NULL,
  column_id  uuid NOT NULL REFERENCES public.schedule_columns (id) ON DELETE CASCADE,
  row_no     int  NOT NULL CHECK (row_no BETWEEN 0 AND 29),
  main_text  text NOT NULL DEFAULT '' CHECK (length(main_text) <= 500),
  sub_text   text NOT NULL DEFAULT '' CHECK (length(sub_text) <= 500),
  text_color text CHECK (text_color IN ('0070C0', 'FF0000')),
  created_by uuid DEFAULT auth.uid(),
  updated_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_cells_has_text CHECK (length(main_text) + length(sub_text) > 0),
  -- 맞바꾸기(move_schedule_cell)가 트랜잭션 안에서 두 칸의 자리를 바꾸므로 지연 가능해야 한다.
  CONSTRAINT schedule_cells_position_key UNIQUE (work_date, column_id, row_no)
    DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX IF NOT EXISTS schedule_cells_column_id_idx
  ON public.schedule_cells (column_id);

CREATE TABLE IF NOT EXISTS public.schedule_days (
  work_date  date PRIMARY KEY,
  note       text NOT NULL CHECK (length(btrim(note)) > 0 AND length(note) <= 100),
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.schedule_marks (
  work_date date NOT NULL,
  column_id uuid NOT NULL REFERENCES public.schedule_columns (id) ON DELETE CASCADE,
  color     text NOT NULL CHECK (color IN ('D9F2D0', 'F2CFEE', '4E95D9', 'FF5050', 'D1D1D1')),
  PRIMARY KEY (work_date, column_id)
);

CREATE INDEX IF NOT EXISTS schedule_marks_column_id_idx
  ON public.schedule_marks (column_id);

-- ---------------------------------------------------------------------
-- 수정 시각·수정자
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_schedule_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schedule_cells_touch_updated_at ON public.schedule_cells;
CREATE TRIGGER schedule_cells_touch_updated_at
  BEFORE UPDATE ON public.schedule_cells
  FOR EACH ROW EXECUTE FUNCTION public.touch_schedule_updated_at();

DROP TRIGGER IF EXISTS schedule_days_touch_updated_at ON public.schedule_days;
CREATE TRIGGER schedule_days_touch_updated_at
  BEFORE UPDATE ON public.schedule_days
  FOR EACH ROW EXECUTE FUNCTION public.touch_schedule_updated_at();

-- ---------------------------------------------------------------------
-- RLS: 조회는 로그인 사용자 전체, 쓰기는 관리자만
-- ---------------------------------------------------------------------
ALTER TABLE public.schedule_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_cells   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_days    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_marks   ENABLE ROW LEVEL SECURITY;

-- schedule_columns: 이름 수정만 허용한다(추가·삭제 정책 없음).
DROP POLICY IF EXISTS schedule_columns_select_auth ON public.schedule_columns;
CREATE POLICY schedule_columns_select_auth ON public.schedule_columns
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS schedule_columns_update_admin ON public.schedule_columns;
CREATE POLICY schedule_columns_update_admin ON public.schedule_columns
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_app_admin()))
  WITH CHECK ((SELECT public.is_app_admin()));

-- schedule_cells
DROP POLICY IF EXISTS schedule_cells_select_auth ON public.schedule_cells;
CREATE POLICY schedule_cells_select_auth ON public.schedule_cells
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS schedule_cells_insert_admin ON public.schedule_cells;
CREATE POLICY schedule_cells_insert_admin ON public.schedule_cells
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_app_admin()));

DROP POLICY IF EXISTS schedule_cells_update_admin ON public.schedule_cells;
CREATE POLICY schedule_cells_update_admin ON public.schedule_cells
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_app_admin()))
  WITH CHECK ((SELECT public.is_app_admin()));

DROP POLICY IF EXISTS schedule_cells_delete_admin ON public.schedule_cells;
CREATE POLICY schedule_cells_delete_admin ON public.schedule_cells
  FOR DELETE TO authenticated
  USING ((SELECT public.is_app_admin()));

-- schedule_days
DROP POLICY IF EXISTS schedule_days_select_auth ON public.schedule_days;
CREATE POLICY schedule_days_select_auth ON public.schedule_days
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS schedule_days_insert_admin ON public.schedule_days;
CREATE POLICY schedule_days_insert_admin ON public.schedule_days
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_app_admin()));

DROP POLICY IF EXISTS schedule_days_update_admin ON public.schedule_days;
CREATE POLICY schedule_days_update_admin ON public.schedule_days
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_app_admin()))
  WITH CHECK ((SELECT public.is_app_admin()));

DROP POLICY IF EXISTS schedule_days_delete_admin ON public.schedule_days;
CREATE POLICY schedule_days_delete_admin ON public.schedule_days
  FOR DELETE TO authenticated
  USING ((SELECT public.is_app_admin()));

-- schedule_marks
DROP POLICY IF EXISTS schedule_marks_select_auth ON public.schedule_marks;
CREATE POLICY schedule_marks_select_auth ON public.schedule_marks
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS schedule_marks_insert_admin ON public.schedule_marks;
CREATE POLICY schedule_marks_insert_admin ON public.schedule_marks
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_app_admin()));

DROP POLICY IF EXISTS schedule_marks_update_admin ON public.schedule_marks;
CREATE POLICY schedule_marks_update_admin ON public.schedule_marks
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_app_admin()))
  WITH CHECK ((SELECT public.is_app_admin()));

DROP POLICY IF EXISTS schedule_marks_delete_admin ON public.schedule_marks;
CREATE POLICY schedule_marks_delete_admin ON public.schedule_marks
  FOR DELETE TO authenticated
  USING ((SELECT public.is_app_admin()));

-- ---------------------------------------------------------------------
-- 칸 이동. 도착 자리에 다른 칸이 있으면 두 칸을 맞바꾼다(한 트랜잭션).
-- p_row_no 가 null 이면 도착 날짜·열에서 비어 있는 가장 작은 행으로 보낸다.
-- SECURITY INVOKER 라서 RLS 가 그대로 적용된다(관리자만 성공).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_schedule_cell(
  p_cell_id   uuid,
  p_work_date date,
  p_column_id uuid,
  p_row_no    int
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_cell       public.schedule_cells%ROWTYPE;
  v_target_row int := p_row_no;
  v_other_id   uuid;
BEGIN
  SELECT * INTO v_cell FROM public.schedule_cells WHERE id = p_cell_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cell not found';
  END IF;

  IF v_target_row IS NULL THEN
    SELECT g INTO v_target_row
    FROM generate_series(0, 29) AS g
    WHERE NOT EXISTS (
      SELECT 1 FROM public.schedule_cells c
      WHERE c.work_date = p_work_date
        AND c.column_id = p_column_id
        AND c.row_no = g
    )
    ORDER BY g
    LIMIT 1;
    IF v_target_row IS NULL THEN
      RAISE EXCEPTION 'column is full';
    END IF;
  END IF;

  -- 자기 자리면 아무 것도 하지 않는다.
  IF v_cell.work_date = p_work_date
     AND v_cell.column_id = p_column_id
     AND v_cell.row_no = v_target_row THEN
    RETURN;
  END IF;

  SET CONSTRAINTS public.schedule_cells_position_key DEFERRED;

  SELECT id INTO v_other_id
  FROM public.schedule_cells
  WHERE work_date = p_work_date
    AND column_id = p_column_id
    AND row_no = v_target_row
  FOR UPDATE;

  IF v_other_id IS NOT NULL THEN
    UPDATE public.schedule_cells
    SET work_date = v_cell.work_date,
        column_id = v_cell.column_id,
        row_no    = v_cell.row_no
    WHERE id = v_other_id;
  END IF;

  UPDATE public.schedule_cells
  SET work_date = p_work_date,
      column_id = p_column_id,
      row_no    = v_target_row
  WHERE id = p_cell_id;
END;
$$;

-- ---------------------------------------------------------------------
-- 엑셀 가져오기: 날짜 범위의 칸·날짜 메모·칸 색을 지우고 다시 넣는다(한 트랜잭션).
-- 실패하면 기존 일정은 그대로 남는다. 삽입한 칸 수를 돌려준다.
--   p_cells : [{work_date, column_id, row_no, main_text, sub_text, text_color}]
--   p_days  : [{work_date, note}]
--   p_marks : [{work_date, column_id, color}]
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_schedule_cells(
  p_from  date,
  p_to    date,
  p_cells jsonb,
  p_days  jsonb,
  p_marks jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  IF p_from > p_to THEN
    RAISE EXCEPTION 'invalid range';
  END IF;

  DELETE FROM public.schedule_cells WHERE work_date BETWEEN p_from AND p_to;
  DELETE FROM public.schedule_days  WHERE work_date BETWEEN p_from AND p_to;
  DELETE FROM public.schedule_marks WHERE work_date BETWEEN p_from AND p_to;

  INSERT INTO public.schedule_cells (work_date, column_id, row_no, main_text, sub_text, text_color)
  SELECT x.work_date, x.column_id, x.row_no,
         coalesce(x.main_text, ''), coalesce(x.sub_text, ''), x.text_color
  FROM jsonb_to_recordset(coalesce(p_cells, '[]'::jsonb))
       AS x(work_date date, column_id uuid, row_no int, main_text text, sub_text text, text_color text)
  WHERE x.work_date BETWEEN p_from AND p_to;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.schedule_days (work_date, note)
  SELECT x.work_date, x.note
  FROM jsonb_to_recordset(coalesce(p_days, '[]'::jsonb))
       AS x(work_date date, note text)
  WHERE x.work_date BETWEEN p_from AND p_to;

  INSERT INTO public.schedule_marks (work_date, column_id, color)
  SELECT x.work_date, x.column_id, x.color
  FROM jsonb_to_recordset(coalesce(p_marks, '[]'::jsonb))
       AS x(work_date date, column_id uuid, color text)
  WHERE x.work_date BETWEEN p_from AND p_to;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.move_schedule_cell(uuid, date, uuid, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replace_schedule_cells(date, date, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_schedule_cell(uuid, date, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_schedule_cells(date, date, jsonb, jsonb, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 적용 후 확인 (SQL Editor 는 service role 로 돌아 RLS 를 건너뛰므로,
-- 아래 (a)~(c)는 앱에서 로그인한 계정으로 확인하거나, 각 역할을 흉내 내어 실행한다.)
--
-- (a) 관리자 계정으로 앱의 일정표에서 칸을 추가하면 성공해야 한다.
-- (b) 일반 계정으로 칸을 추가하려 하면 실패해야 한다.
--     (new row violates row-level security policy)
-- (c) 일반 계정으로 일정표를 열면 조회는 되고, 칸을 누르면 읽기 전용이어야 한다.
--
-- 구조 확인:
--   SELECT team_label, leader_label FROM public.schedule_columns ORDER BY sort_order;
--   SELECT conname FROM pg_constraint WHERE conname = 'schedule_cells_position_key';
--   SELECT proname, prosecdef AS is_definer FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('move_schedule_cell', 'replace_schedule_cells');  -- is_definer 모두 false
-- ---------------------------------------------------------------------


-- ============================================================
-- 원본: 20261109000000_schedule_result.sql
-- ============================================================
-- =====================================================================
-- 시설일정 시행 결과 (Ver 3.0) — 일정관리 > 시설일정
--
-- schedule_cells 에 당일 시행 결과 3개 컬럼을 더한다.
--   result_status  : 'done'(완료) / 'partial'(일부완료) / 'undone'(미시설). null = 아직 기록 안 함.
--   result_reason  : 일부완료·미시설의 사유. 필수(아래 CHECK).
--   rescheduled_to : 다시 잡은 날짜. 앱이 같은 국소 정보를 그 날짜에 복사한 뒤 남긴다.
--
-- 권한은 기존 RLS 그대로다(조회: 로그인 사용자, 쓰기: 관리자).
-- 엑셀 가져오기(replace_schedule_cells)는 기간의 칸을 지우고 다시 넣으므로 그 기간의 결과는 사라진다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 적용 순서: 20261108000000_facility_schedule.sql 이후.
-- =====================================================================

ALTER TABLE public.schedule_cells
  ADD COLUMN IF NOT EXISTS result_status  text,
  ADD COLUMN IF NOT EXISTS result_reason  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rescheduled_to date;

ALTER TABLE public.schedule_cells
  DROP CONSTRAINT IF EXISTS schedule_cells_result_status_check;
ALTER TABLE public.schedule_cells
  ADD CONSTRAINT schedule_cells_result_status_check
  CHECK (result_status IS NULL OR result_status IN ('done', 'partial', 'undone'));

ALTER TABLE public.schedule_cells
  DROP CONSTRAINT IF EXISTS schedule_cells_result_reason_check;
ALTER TABLE public.schedule_cells
  ADD CONSTRAINT schedule_cells_result_reason_check
  CHECK (
    length(result_reason) <= 300
    AND (
      result_status IS NULL
      OR result_status = 'done'
      OR length(btrim(result_reason)) > 0
    )
  );

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 적용 후 확인
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'schedule_cells'
--     AND column_name IN ('result_status', 'result_reason', 'rescheduled_to');  -- 3행
-- ---------------------------------------------------------------------


-- ============================================================
-- 원본: 20261110000000_schedule_freezes.sql
-- ============================================================
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


-- ============================================================
-- 원본: 20261111000000_schedule_day_details.sql
-- ============================================================
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


-- ============================================================
-- 원본: 20261112000000_fix_schedule_unused_indexes.sql
-- ============================================================
-- =====================================================================
-- Performance Advisor 정리: schedule_cells / schedule_marks 미사용 인덱스(INFO 2건) 해소
--
-- 배경
--   * schedule_cells_column_id_idx, schedule_marks_column_id_idx 는 외래 키(column_id)
--     검사용 일반 인덱스이나, 앱 조회가 항상 work_date 범위 기준이라 idx_scan = 0 이 되어
--     Performance Advisor 의 unused_index(0005) 알림이 발생한다.
--   * 단순 삭제만 하면 unindexed_foreign_keys(0001) 알림이 대신 발생하므로,
--     column_id 가 선두인 UNIQUE 제약(고유 인덱스)으로 교체해 외래 키 인덱스와
--     미사용 인덱스 예외(indisunique = true)를 동시에 충족한다.
--   * move_schedule_cell 이 트랜잭션 안에서 두 칸의 자리를 맞바꿀 때 새 UNIQUE 제약도
--     함께 지연되도록 DEFERRABLE INITIALLY IMMEDIATE 로 선언하고 함수에서 같이 지연시킨다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 적용 순서: 20261108000000_facility_schedule.sql 이후.
-- =====================================================================

DROP INDEX IF EXISTS public.schedule_cells_column_id_idx;
DROP INDEX IF EXISTS public.schedule_marks_column_id_idx;

ALTER TABLE public.schedule_cells
  DROP CONSTRAINT IF EXISTS schedule_cells_column_position_key,
  ADD CONSTRAINT schedule_cells_column_position_key UNIQUE (column_id, work_date, row_no)
    DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.schedule_marks
  DROP CONSTRAINT IF EXISTS schedule_marks_column_work_date_key,
  ADD CONSTRAINT schedule_marks_column_work_date_key UNIQUE (column_id, work_date);

CREATE OR REPLACE FUNCTION public.move_schedule_cell(
  p_cell_id   uuid,
  p_work_date date,
  p_column_id uuid,
  p_row_no    int
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_cell       public.schedule_cells%ROWTYPE;
  v_target_row int := p_row_no;
  v_other_id   uuid;
BEGIN
  SELECT * INTO v_cell FROM public.schedule_cells WHERE id = p_cell_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cell not found';
  END IF;

  IF v_target_row IS NULL THEN
    SELECT g INTO v_target_row
    FROM generate_series(0, 29) AS g
    WHERE NOT EXISTS (
      SELECT 1 FROM public.schedule_cells c
      WHERE c.work_date = p_work_date
        AND c.column_id = p_column_id
        AND c.row_no = g
    )
    ORDER BY g
    LIMIT 1;
    IF v_target_row IS NULL THEN
      RAISE EXCEPTION 'column is full';
    END IF;
  END IF;

  -- 자기 자리면 아무 것도 하지 않는다.
  IF v_cell.work_date = p_work_date
     AND v_cell.column_id = p_column_id
     AND v_cell.row_no = v_target_row THEN
    RETURN;
  END IF;

  SET CONSTRAINTS public.schedule_cells_position_key, public.schedule_cells_column_position_key DEFERRED;

  SELECT id INTO v_other_id
  FROM public.schedule_cells
  WHERE work_date = p_work_date
    AND column_id = p_column_id
    AND row_no = v_target_row
  FOR UPDATE;

  IF v_other_id IS NOT NULL THEN
    UPDATE public.schedule_cells
    SET work_date = v_cell.work_date,
        column_id = v_cell.column_id,
        row_no    = v_cell.row_no
    WHERE id = v_other_id;
  END IF;

  UPDATE public.schedule_cells
  SET work_date = p_work_date,
      column_id = p_column_id,
      row_no    = v_target_row
  WHERE id = p_cell_id;
END;
$$;

REVOKE ALL ON FUNCTION public.move_schedule_cell(uuid, date, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_schedule_cell(uuid, date, uuid, int) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 원본: 20261112000000_schedule_day_manual_rows.sql
-- ============================================================
-- =====================================================================
-- 일일일정(일자별) 직접 추가 행 — 일정관리 > 일일일정
--
-- 시설일정에 없는 국소(통합시설코드가 안 나오는 국소 등)를 일자별 표에 행으로 직접 추가한다.
-- 직접 추가한 행은 schedule_day_details 의 (작업일, 국소) 행에 is_manual = true 로 표시한다.
-- 일정 가져오기로 일정 칸이 지워져 남은 옛 상세(is_manual = false)는 표에 나타나지 않는다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 적용 순서: 20261111000000_schedule_day_details.sql 이후.
-- =====================================================================

ALTER TABLE public.schedule_day_details
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 원본: 20261114000000_schedule_cells_no_companion.sql
-- ============================================================
-- =====================================================================
-- 시설일정: 국소별 "입회·신호수 불필요" 표시 (시설일정 팀등록·입회불필요 설계)
--
-- 같은 팀·같은 날이라도 국소마다 입회·신호수가 필요한지가 다르다.
-- (전주 국소는 필요, 건물 옥상·실내 국소는 불필요) 칸마다 표시해 두고, 일일일정에서
-- 불필요로 표시한 국소는 입회자·신호수 이름을 비운다.
--
-- 기본값 false라 기존 일정의 동작은 바뀌지 않는다. 입회·신호수 칸 자체에는 뜻이 없다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 되돌리기: ALTER TABLE public.schedule_cells DROP COLUMN IF EXISTS no_companion;
-- =====================================================================

ALTER TABLE public.schedule_cells
  ADD COLUMN IF NOT EXISTS no_companion boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.schedule_cells.no_companion IS
  '국소 칸에서 입회·신호수가 필요 없음(건물 옥상·실내 등). 일일일정이 이 국소의 입회자·신호수를 비운다.';

NOTIFY pgrst, 'reload schema';

-- 적용 후 확인
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'schedule_cells' AND column_name = 'no_companion';


-- ============================================================
-- 원본: 20261115000000_schedule_cells_companion_target.sql
-- ============================================================
-- =====================================================================
-- 시설일정: "입회·신호수 불필요" → "입회·신호수 대상" 표시로 뒤집기
--
-- 20261114000000_schedule_cells_no_companion.sql 이 만든 `no_companion` 컬럼을
-- `companion_target`으로 바꾼다. 의미가 뒤집혀 같은 값(true)이 "대상"을 뜻한다.
--   - true  : 이 국소에 입회·신호수가 붙는다(일정표에서 입회·신호수 행 위에 묶여 보인다).
--   - false : 표시 없음. 그 팀·날짜에 true인 칸이 하나도 없으면 모든 국소에 붙는다(기존 일정과 같다).
--
-- 이미 `no_companion`에 체크한 값은 그대로 "대상"이 된다(체크를 필요한 국소에 하셨다면 재입력 불필요).
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
--   20261114000000 을 적용하지 않았어도 이 파일만으로 컬럼이 만들어진다.
-- 되돌리기: ALTER TABLE public.schedule_cells RENAME COLUMN companion_target TO no_companion;
--           (의미가 다시 "불필요"이므로 앱 코드도 이전 버전이어야 한다.)
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'schedule_cells' AND column_name = 'no_companion'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'schedule_cells' AND column_name = 'companion_target'
    ) THEN
      -- 둘 다 있으면(옛 마이그레이션을 다시 실행한 경우) 값을 합치고 옛 컬럼을 지운다.
      UPDATE public.schedule_cells SET companion_target = true WHERE no_companion = true;
      ALTER TABLE public.schedule_cells DROP COLUMN no_companion;
    ELSE
      ALTER TABLE public.schedule_cells RENAME COLUMN no_companion TO companion_target;
    END IF;
  END IF;
END $$;

ALTER TABLE public.schedule_cells
  ADD COLUMN IF NOT EXISTS companion_target boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.schedule_cells.companion_target IS
  '국소 칸을 입회·신호수가 붙는 국소로 표시. 그 팀·날짜에 true가 하나도 없으면 모든 국소가 대상이다.';

NOTIFY pgrst, 'reload schema';

-- 적용 후 확인 (companion_target 만 보여야 한다)
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'schedule_cells'
--     AND column_name IN ('no_companion', 'companion_target');


-- ============================================================
-- 원본: 20261116000000_fix_move_schedule_cell_deferred.sql
-- ============================================================
-- =====================================================================
-- 시설일정: 칸 맞바꾸기(move_schedule_cell) 함수를 다시 만든다
--
-- 증상: 칸을 다른 칸 자리로 옮기면(드래그 맞바꾸기, 입회·신호수 자동 정리) 요청이 409로 거부된다.
--       Postgres 로그: duplicate key value violates unique constraint
--       "schedule_cells_column_position_key"
--
-- 원인: schedule_cells 에는 같은 위치를 막는 UNIQUE 제약이 두 개 있다.
--         schedule_cells_position_key        (work_date, column_id, row_no)
--         schedule_cells_column_position_key (column_id, work_date, row_no)  -- 20261112 가 추가
--       20261112000000 의 함수는 둘 다 DEFERRED 로 두지만, 운영 DB 의 함수는 첫 번째만 미룬다
--       (20261108000000 을 20261112000000 뒤에 다시 실행하면 함수가 옛 정의로 덮어써진다).
--       두 칸이 자리를 바꾸는 중간 상태에서 두 번째 제약이 즉시 위반된다.
--
-- 조치: 함수를 `SET CONSTRAINTS ALL DEFERRED`로 다시 만든다. 지연 가능한 제약을 모두 미루므로
--       이후 제약이 늘어도 같은 문제가 생기지 않는다. 제약 자체는 바꾸지 않는다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 주의: 이 파일을 적용한 뒤에는 20261108000000_facility_schedule.sql 을 다시 실행하지 않는다
--       (함수가 옛 정의로 돌아간다). 다시 실행했다면 이 파일을 한 번 더 실행한다.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.move_schedule_cell(
  p_cell_id   uuid,
  p_work_date date,
  p_column_id uuid,
  p_row_no    int
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_cell       public.schedule_cells%ROWTYPE;
  v_target_row int := p_row_no;
  v_other_id   uuid;
BEGIN
  SELECT * INTO v_cell FROM public.schedule_cells WHERE id = p_cell_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cell not found';
  END IF;

  IF v_target_row IS NULL THEN
    SELECT g INTO v_target_row
    FROM generate_series(0, 29) AS g
    WHERE NOT EXISTS (
      SELECT 1 FROM public.schedule_cells c
      WHERE c.work_date = p_work_date
        AND c.column_id = p_column_id
        AND c.row_no = g
    )
    ORDER BY g
    LIMIT 1;
    IF v_target_row IS NULL THEN
      RAISE EXCEPTION 'column is full';
    END IF;
  END IF;

  -- 자기 자리면 아무 것도 하지 않는다.
  IF v_cell.work_date = p_work_date
     AND v_cell.column_id = p_column_id
     AND v_cell.row_no = v_target_row THEN
    RETURN;
  END IF;

  -- 두 칸이 자리를 바꾸는 동안 위치 UNIQUE 제약(둘 다)이 순간적으로 겹치므로 모두 미룬다.
  SET CONSTRAINTS ALL DEFERRED;

  SELECT id INTO v_other_id
  FROM public.schedule_cells
  WHERE work_date = p_work_date
    AND column_id = p_column_id
    AND row_no = v_target_row
  FOR UPDATE;

  IF v_other_id IS NOT NULL THEN
    UPDATE public.schedule_cells
    SET work_date = v_cell.work_date,
        column_id = v_cell.column_id,
        row_no    = v_cell.row_no
    WHERE id = v_other_id;
  END IF;

  UPDATE public.schedule_cells
  SET work_date = p_work_date,
      column_id = p_column_id,
      row_no    = v_target_row
  WHERE id = p_cell_id;
END;
$$;

REVOKE ALL ON FUNCTION public.move_schedule_cell(uuid, date, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_schedule_cell(uuid, date, uuid, int) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- 적용 후 확인 (true 여야 한다)
--   SELECT prosrc LIKE '%ALL DEFERRED%' AS defers_all
--   FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace AND proname = 'move_schedule_cell';

