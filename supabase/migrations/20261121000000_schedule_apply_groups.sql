-- =====================================================================
-- 시설일정 그룹 단위 원자 저장 RPC (Ver 3.0 / 1B)
--
-- 목적:
--   칸 단위 요청(create/update/delete/move)을 여러 번 보내다 중간에 실패하면
--   일부만 저장되는 문제를 막기 위해, 영향받는 (work_date, column_id) 그룹마다
--   최종 칸 목록을 받아 한 트랜잭션으로 교체한다.
--   base_ids 비교로 다른 관리자의 동시 수정(stale_group)을 감지하고 전체 취소한다.
--
-- 입력 모양:
--   p_groups: [
--     {
--       "work_date": "yyyy-mm-dd",
--       "column_id": "uuid",
--       "base_ids": ["uuid", ...],
--       "cells": [
--         {
--           "id": "uuid | null",
--           "row_no": 0,
--           "main_text": "...",
--           "sub_text": "...",
--           "text_color": "0070C0 | FF0000 | null",
--           "companion_target": false,
--           "result_status": "done | partial | undone | null",
--           "result_reason": "",
--           "rescheduled_to": "yyyy-mm-dd | null"
--         }
--       ]
--     }
--   ]
--   p_marks: [
--     { "work_date": "yyyy-mm-dd", "column_id": "uuid", "color": "D9F2D0 | ... | null" }
--   ]
--
-- 반환:
--   { "created": [ { "group_index": 0, "cell_index": 0, "id": "uuid" }, ... ] }
--
-- 적용 방법:
--   Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
--   적용 순서: 03_facility_schedule.sql 이후.
--
-- 되돌리는 방법:
--   DROP FUNCTION IF EXISTS public.apply_schedule_groups(jsonb, jsonb);
-- =====================================================================

CREATE OR REPLACE FUNCTION public.apply_schedule_groups(
  p_groups jsonb,
  p_marks  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  g            record;
  c            record;
  m            record;
  v_group_idx  int;
  v_cell_idx   int;
  v_work_date  date;
  v_column_id  uuid;
  v_actual_ids     uuid[];
  v_base_ids       uuid[];
  v_keep_ids       uuid[];
  v_group_actuals  jsonb := '{}'::jsonb;
  v_cell_id        uuid;
  v_new_id         uuid;
  v_created        jsonb := '[]'::jsonb;
  v_mark_date      date;
  v_mark_col       uuid;
  v_mark_color     text;
BEGIN
  SET CONSTRAINTS public.schedule_cells_position_key, public.schedule_cells_column_position_key DEFERRED;

  -- 1단계: 모든 그룹의 잠금 · stale_group 검사 · duplicate_row 검사 · 삭제
  FOR g IN
    SELECT elem, (ord - 1)::int AS idx
    FROM jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
  LOOP
    v_group_idx := g.idx;
    v_work_date := (g.elem->>'work_date')::date;
    v_column_id := (g.elem->>'column_id')::uuid;

    PERFORM 1
    FROM public.schedule_cells
    WHERE work_date = v_work_date
      AND column_id = v_column_id
    FOR UPDATE;

    SELECT coalesce(array_agg(id ORDER BY id), '{}'::uuid[])
    INTO v_actual_ids
    FROM public.schedule_cells
    WHERE work_date = v_work_date
      AND column_id = v_column_id;

    SELECT coalesce(array_agg(DISTINCT x::uuid ORDER BY x::uuid), '{}'::uuid[])
    INTO v_base_ids
    FROM jsonb_array_elements_text(coalesce(g.elem->'base_ids', '[]'::jsonb)) AS t(x);

    IF v_actual_ids IS DISTINCT FROM v_base_ids THEN
      RAISE EXCEPTION 'stale_group' USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(coalesce(g.elem->'cells', '[]'::jsonb)) AS r(row_no int)
      GROUP BY r.row_no
      HAVING count(*) > 1 OR r.row_no IS NULL
    ) THEN
      RAISE EXCEPTION 'duplicate_row' USING ERRCODE = 'P0001';
    END IF;

    SELECT coalesce(array_agg((item->>'id')::uuid), '{}'::uuid[])
    INTO v_keep_ids
    FROM jsonb_array_elements(coalesce(g.elem->'cells', '[]'::jsonb)) AS item
    WHERE nullif(item->>'id', '') IS NOT NULL;

    DELETE FROM public.schedule_cells
    WHERE work_date = v_work_date
      AND column_id = v_column_id
      AND NOT (id = ANY(v_keep_ids));

    v_group_actuals := jsonb_set(
      v_group_actuals,
      ARRAY[v_group_idx::text],
      to_jsonb(v_actual_ids)
    );
  END LOOP;

  -- 2단계: 모든 그룹의 갱신 · 복원 삽입 · 신규 삽입
  FOR g IN
    SELECT elem, (ord - 1)::int AS idx
    FROM jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
  LOOP
    v_group_idx := g.idx;
    v_work_date := (g.elem->>'work_date')::date;
    v_column_id := (g.elem->>'column_id')::uuid;
    v_actual_ids := ARRAY(
      SELECT jsonb_array_elements_text(coalesce(v_group_actuals->(v_group_idx::text), '[]'::jsonb))::uuid
    );

    FOR c IN
      SELECT elem, (ord - 1)::int AS idx
      FROM jsonb_array_elements(coalesce(g.elem->'cells', '[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
    LOOP
      v_cell_idx := c.idx;

      IF nullif(c.elem->>'id', '') IS NOT NULL THEN
        v_cell_id := (c.elem->>'id')::uuid;

        IF v_cell_id = ANY(v_actual_ids) THEN
          UPDATE public.schedule_cells
          SET row_no           = (c.elem->>'row_no')::int,
              main_text        = coalesce(c.elem->>'main_text', ''),
              sub_text         = coalesce(c.elem->>'sub_text', ''),
              text_color       = nullif(c.elem->>'text_color', ''),
              companion_target = coalesce((c.elem->>'companion_target')::boolean, false)
          WHERE id = v_cell_id
            AND work_date = v_work_date
            AND column_id = v_column_id;
        ELSE
          -- 되돌리기로 지워졌거나 다른 그룹에 있던 칸을 원래 id로 복원 삽입한다(created에는 넣지 않는다).
          INSERT INTO public.schedule_cells (
            id,
            work_date,
            column_id,
            row_no,
            main_text,
            sub_text,
            text_color,
            companion_target,
            result_status,
            result_reason,
            rescheduled_to
          ) VALUES (
            v_cell_id,
            v_work_date,
            v_column_id,
            (c.elem->>'row_no')::int,
            coalesce(c.elem->>'main_text', ''),
            coalesce(c.elem->>'sub_text', ''),
            nullif(c.elem->>'text_color', ''),
            coalesce((c.elem->>'companion_target')::boolean, false),
            nullif(c.elem->>'result_status', ''),
            coalesce(c.elem->>'result_reason', ''),
            nullif(c.elem->>'rescheduled_to', '')::date
          );
        END IF;
      ELSE
        INSERT INTO public.schedule_cells (
          work_date,
          column_id,
          row_no,
          main_text,
          sub_text,
          text_color,
          companion_target,
          result_status,
          result_reason,
          rescheduled_to
        ) VALUES (
          v_work_date,
          v_column_id,
          (c.elem->>'row_no')::int,
          coalesce(c.elem->>'main_text', ''),
          coalesce(c.elem->>'sub_text', ''),
          nullif(c.elem->>'text_color', ''),
          coalesce((c.elem->>'companion_target')::boolean, false),
          nullif(c.elem->>'result_status', ''),
          coalesce(c.elem->>'result_reason', ''),
          nullif(c.elem->>'rescheduled_to', '')::date
        )
        RETURNING id INTO v_new_id;

        v_created := v_created || jsonb_build_array(
          jsonb_build_object(
            'group_index', v_group_idx,
            'cell_index', v_cell_idx,
            'id', v_new_id
          )
        );
      END IF;
    END LOOP;
  END LOOP;

  FOR m IN
    SELECT value AS elem
    FROM jsonb_array_elements(coalesce(p_marks, '[]'::jsonb))
  LOOP
    v_mark_date  := (m.elem->>'work_date')::date;
    v_mark_col   := (m.elem->>'column_id')::uuid;
    v_mark_color := nullif(m.elem->>'color', '');

    IF v_mark_color IS NULL THEN
      DELETE FROM public.schedule_marks
      WHERE work_date = v_mark_date
        AND column_id = v_mark_col;
    ELSE
      INSERT INTO public.schedule_marks (work_date, column_id, color)
      VALUES (v_mark_date, v_mark_col, v_mark_color)
      ON CONFLICT (work_date, column_id)
      DO UPDATE SET color = EXCLUDED.color;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', v_created);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_schedule_groups(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_schedule_groups(jsonb, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 적용 후 확인 (SQL Editor에서 실행, 먼 미래 날짜 2099-01-01 만 사용하고 끝에 정리한다)
-- 비관리자 확인은 앱에서 일반 계정으로 저장해 실패하는지 확인한다.
--
-- DO $$
-- DECLARE
--   v_col_id  uuid;
--   v_col_id2 uuid;
--   v_res     jsonb;
--   v_id1     uuid;
--   v_id2     uuid;
--   v_cnt     int;
--   v_row1    int;
--   v_row2    int;
--   v_owner   uuid;
-- BEGIN
--   SELECT id INTO v_col_id  FROM public.schedule_columns ORDER BY sort_order LIMIT 1;
--   SELECT id INTO v_col_id2 FROM public.schedule_columns ORDER BY sort_order OFFSET 1 LIMIT 1;
--   DELETE FROM public.schedule_cells WHERE work_date = DATE '2099-01-01' AND column_id IN (v_col_id, v_col_id2);
--
--   -- (a) 한 그룹에 칸 2개 만들기 -> 개수 확인
--   v_res := public.apply_schedule_groups(
--     jsonb_build_array(jsonb_build_object(
--       'work_date', '2099-01-01',
--       'column_id', v_col_id,
--       'base_ids', '[]'::jsonb,
--       'cells', jsonb_build_array(
--         jsonb_build_object('id', null, 'row_no', 0, 'main_text', '국소A', 'sub_text', '모국A', 'text_color', null, 'companion_target', false),
--         jsonb_build_object('id', null, 'row_no', 1, 'main_text', '국소B', 'sub_text', '모국B', 'text_color', '0070C0', 'companion_target', true)
--       )
--     )),
--     '[]'::jsonb
--   );
--   v_id1 := (v_res->'created'->0->>'id')::uuid;
--   v_id2 := (v_res->'created'->1->>'id')::uuid;
--   SELECT count(*) INTO v_cnt FROM public.schedule_cells WHERE work_date = DATE '2099-01-01' AND column_id = v_col_id;
--   ASSERT v_cnt = 2, format('(a) expected 2, got %s', v_cnt);
--
--   -- (d) 두 칸의 row_no를 맞바꾸는 교체 (0 <-> 1)
--   PERFORM public.apply_schedule_groups(
--     jsonb_build_array(jsonb_build_object(
--       'work_date', '2099-01-01',
--       'column_id', v_col_id,
--       'base_ids', jsonb_build_array(v_id1, v_id2),
--       'cells', jsonb_build_array(
--         jsonb_build_object('id', v_id1, 'row_no', 1, 'main_text', '국소A', 'sub_text', '모국A', 'text_color', null, 'companion_target', false),
--         jsonb_build_object('id', v_id2, 'row_no', 0, 'main_text', '국소B', 'sub_text', '모국B', 'text_color', '0070C0', 'companion_target', true)
--       )
--     )),
--     '[]'::jsonb
--   );
--   SELECT row_no INTO v_row1 FROM public.schedule_cells WHERE id = v_id1;
--   SELECT row_no INTO v_row2 FROM public.schedule_cells WHERE id = v_id2;
--   ASSERT v_row1 = 1 AND v_row2 = 0, format('(d) swap failed: %s, %s', v_row1, v_row2);
--
--   -- (c) 잘못된 base_ids로 호출 -> stale_group으로 실패하고 데이터가 그대로인지
--   BEGIN
--     PERFORM public.apply_schedule_groups(
--       jsonb_build_array(jsonb_build_object(
--         'work_date', '2099-01-01',
--         'column_id', v_col_id,
--         'base_ids', jsonb_build_array(gen_random_uuid()),
--         'cells', '[]'::jsonb
--       )),
--       '[]'::jsonb
--     );
--     RAISE EXCEPTION 'expected stale_group error';
--   EXCEPTION WHEN SQLSTATE 'P0001' THEN
--     IF SQLERRM <> 'stale_group' THEN RAISE; END IF;
--   END;
--   SELECT count(*) INTO v_cnt FROM public.schedule_cells WHERE work_date = DATE '2099-01-01' AND column_id = v_col_id;
--   ASSERT v_cnt = 2, format('(c) expected 2 after rollback, got %s', v_cnt);
--
--   -- (b) 같은 그룹을 칸 1개로 교체 -> 1개 확인
--   PERFORM public.apply_schedule_groups(
--     jsonb_build_array(jsonb_build_object(
--       'work_date', '2099-01-01',
--       'column_id', v_col_id,
--       'base_ids', jsonb_build_array(v_id1, v_id2),
--       'cells', jsonb_build_array(
--         jsonb_build_object('id', v_id2, 'row_no', 0, 'main_text', '국소B', 'sub_text', '모국B', 'text_color', '0070C0', 'companion_target', true)
--       )
--     )),
--     '[]'::jsonb
--   );
--   SELECT count(*) INTO v_cnt FROM public.schedule_cells WHERE work_date = DATE '2099-01-01' AND column_id = v_col_id;
--   ASSERT v_cnt = 1, format('(b) expected 1, got %s', v_cnt);
--
--   -- (f) 삭제한 칸(v_id1)을 원래 id로 복원 (created는 비어 있어야 한다)
--   v_res := public.apply_schedule_groups(
--     jsonb_build_array(jsonb_build_object(
--       'work_date', '2099-01-01',
--       'column_id', v_col_id,
--       'base_ids', jsonb_build_array(v_id2),
--       'cells', jsonb_build_array(
--         jsonb_build_object('id', v_id2, 'row_no', 0, 'main_text', '국소B', 'sub_text', '모국B', 'text_color', '0070C0', 'companion_target', true),
--         jsonb_build_object('id', v_id1, 'row_no', 1, 'main_text', '국소A', 'sub_text', '모국A', 'text_color', null, 'companion_target', false)
--       )
--     )),
--     '[]'::jsonb
--   );
--   SELECT count(*) INTO v_cnt FROM public.schedule_cells WHERE work_date = DATE '2099-01-01' AND column_id = v_col_id;
--   ASSERT v_cnt = 2, format('(f) expected 2 after restore, got %s', v_cnt);
--   ASSERT jsonb_array_length(v_res->'created') = 0, format('(f) expected 0 created, got %s', v_res->'created');
--
--   -- (g) 두 그룹 사이 이동 되돌리기: v_id1을 v_col_id -> v_col_id2로 옮긴 뒤,
--   --     v_col_id에 넣고(0번) v_col_id2에서 빼는(1번) 호출이 PK 충돌 없이 성공하는지 확인
--   PERFORM public.move_schedule_cell(v_id1, DATE '2099-01-01', v_col_id2, 0);
--   PERFORM public.apply_schedule_groups(
--     jsonb_build_array(
--       jsonb_build_object(
--         'work_date', '2099-01-01',
--         'column_id', v_col_id,
--         'base_ids', jsonb_build_array(v_id2),
--         'cells', jsonb_build_array(
--           jsonb_build_object('id', v_id2, 'row_no', 0, 'main_text', '국소B', 'sub_text', '모국B', 'text_color', '0070C0', 'companion_target', true),
--           jsonb_build_object('id', v_id1, 'row_no', 1, 'main_text', '국소A', 'sub_text', '모국A', 'text_color', null, 'companion_target', false)
--         )
--       ),
--       jsonb_build_object(
--         'work_date', '2099-01-01',
--         'column_id', v_col_id2,
--         'base_ids', jsonb_build_array(v_id1),
--         'cells', '[]'::jsonb
--       )
--     ),
--     '[]'::jsonb
--   );
--   SELECT column_id INTO v_owner FROM public.schedule_cells WHERE id = v_id1;
--   ASSERT v_owner = v_col_id, format('(g) expected v_id1 back in v_col_id, got %s', v_owner);
--
--   -- (e) 정리 삭제
--   DELETE FROM public.schedule_cells WHERE work_date = DATE '2099-01-01' AND column_id IN (v_col_id, v_col_id2);
--   RAISE NOTICE 'apply_schedule_groups verification passed';
-- END $$;
-- ---------------------------------------------------------------------
