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
