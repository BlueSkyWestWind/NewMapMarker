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
