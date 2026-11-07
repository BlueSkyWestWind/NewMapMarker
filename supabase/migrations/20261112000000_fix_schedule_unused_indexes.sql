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
