-- =====================================================================
-- CR-004 · 국소 작업 안전 날씨: 국소 검색/판정용 컬럼
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run
-- 기존 마이그레이션과 동일하게 재실행 안전(IF NOT EXISTS)하게 작성
--
-- 축전지(battery_markers)와 장비(markers) 양쪽에 동일하게 추가한다.
-- 옥상·철탑 작업은 축전지 수거뿐 아니라 장비 국소에도 있어 두 모드 모두 판정이 필요하다.
-- =====================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['battery_markers', 'markers']
  LOOP
    -- 검색용 별칭. 현장 호칭이 제각각이라 다중 등록을 허용한다(쉼표 구분).
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS site_alias text', t);

    -- 'ground'(지상) | 'elevated'(옥상·철탑). NULL = 미분류 → 지상으로 취급.
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS work_type text', t);

    EXECUTE format(
      'COMMENT ON COLUMN public.%I.site_alias IS %L', t,
      '국소 검색용 별칭. 쉼표 구분. 예: 조례,순천조례,조례동,SC-조례');
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.work_type IS %L', t,
      '작업 형태: ground(지상) | elevated(옥상·철탑). elevated는 강풍 판정을 한 단계 강화');

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (site_alias)',
      t || '_site_alias_idx', t);
  END LOOP;
END $$;

-- RLS는 두 테이블 모두 이미 적용되어 있다(select_all / modify_auth).
-- 컬럼 추가는 기존 정책이 그대로 덮으므로 정책 변경 불필요.

-- PostgREST 스키마 캐시 즉시 갱신 (신규 컬럼 인식용)
NOTIFY pgrst, 'reload schema';
