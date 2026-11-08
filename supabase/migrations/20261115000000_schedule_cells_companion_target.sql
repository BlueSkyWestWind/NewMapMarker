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
