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
