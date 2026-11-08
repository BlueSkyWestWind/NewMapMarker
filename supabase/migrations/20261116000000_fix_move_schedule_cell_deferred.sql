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
