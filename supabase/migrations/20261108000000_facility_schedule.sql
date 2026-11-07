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
