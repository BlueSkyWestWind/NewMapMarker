-- =====================================================================
-- MapMarker 전체 스키마 재생성 + ERP(공정관리) 상세 테이블
-- + 동일 번지 대표/서브 (parent_marker_id, group_role)
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run
-- (기존 테이블이 drop 된 상태 복구. 이미 있으면 IF NOT EXISTS 로 건너뜀)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. markers : 장비 마커 (지도 핀)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.markers (
  id            text PRIMARY KEY,
  name          text NOT NULL DEFAULT '',
  lat           double precision,
  lng           double precision,
  memo          text DEFAULT '',
  tags          jsonb DEFAULT '[]'::jsonb,
  color         text,
  facility_team text DEFAULT '',
  facility_code text,
  road_address  text DEFAULT '',
  jibun_address text DEFAULT '',
  -- 동일 번지 그룹: 대표는 parent_marker_id NULL, 서브는 대표 id
  parent_marker_id text REFERENCES public.markers (id) ON DELETE SET NULL,
  group_role    text, -- 대표 | SUB (백업 엑셀 `구분` 열과 동기화)
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 이미 markers 가 있던 DB용 (CREATE IF NOT EXISTS 는 컬럼을 추가하지 않음)
ALTER TABLE public.markers
  ADD COLUMN IF NOT EXISTS parent_marker_id text
  REFERENCES public.markers (id) ON DELETE SET NULL;

ALTER TABLE public.markers
  ADD COLUMN IF NOT EXISTS group_role text;

COMMENT ON COLUMN public.markers.group_role IS '동일 번지 그룹 역할: 대표 | SUB';

CREATE INDEX IF NOT EXISTS markers_facility_code_idx ON public.markers (facility_code);
CREATE INDEX IF NOT EXISTS markers_parent_marker_id_idx ON public.markers (parent_marker_id);
CREATE INDEX IF NOT EXISTS markers_group_role_idx ON public.markers (group_role);

-- ---------------------------------------------------------------------
-- 2. information : 장비 상세정보 (marker 1:N, 이름/코드로 조인)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.information (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  marker_id          text REFERENCES public.markers (id) ON DELETE CASCADE,
  place_name         text,
  facility_code      text,
  project_code       text,
  facility_year      text,
  business_type      text,
  final_station_name text,
  eq_class           text,
  eq_type            text,
  install_date       text,
  open_date          text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS information_marker_id_idx ON public.information (marker_id);
CREATE INDEX IF NOT EXISTS information_facility_code_idx ON public.information (facility_code);

-- ---------------------------------------------------------------------
-- 3. erp_details : 공정관리(ERP) 시트 원본 전량 보관
--    핵심 열은 개별 컬럼, 79열 전체는 raw jsonb (열이름=키)로 무손실 저장.
--    나중에 raw->>'열이름' 또는 명명 컬럼으로 추가 기능 연결.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.erp_details (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  marker_id         text REFERENCES public.markers (id) ON DELETE CASCADE,
  facility_code     text,               -- 통합시설코드
  project           text,               -- 프로젝트
  mgmt_item         text,               -- 관리항목
  partner           text,               -- 협력사
  region_do         text,               -- 지역 구분
  region_sigungu    text,               -- 지역 세부
  station_final     text,               -- 국소명-최종
  station_plan      text,               -- 국소명-계획
  method            text,               -- 방식
  biz_round         text,               -- 사업 차수
  biz_category      text,               -- 사업 구분
  biz_type          text,               -- 사업 유형
  equip_final_major text,               -- 장비최종 대분류
  equip_final       text,               -- 장비최종
  erp_usage         text,               -- ERP 활용구분
  acta_done_date    text,               -- ACTA 구축완료일
  realty_type       text,               -- 부동산 형태
  building_type     text,               -- 건물유형
  equip_location    text,               -- 장비위치
  sharing           text,               -- 공용화 단독/공용
  sharing_operator  text,               -- 공용화 주관사
  address_full      text,               -- 주소(전체)
  access_method     text,               -- 출입방법
  site_name         text,               -- Site명
  hw_team           text,               -- HW팀
  test_team         text,               -- 시험팀
  ai_manager        text,               -- AI담당
  remarks           text,               -- 특이사항
  raw               jsonb NOT NULL DEFAULT '{}'::jsonb,  -- 79열 전체 원본
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS erp_details_marker_id_idx ON public.erp_details (marker_id);
CREATE INDEX IF NOT EXISTS erp_details_facility_code_idx ON public.erp_details (facility_code);
CREATE INDEX IF NOT EXISTS erp_details_raw_gin_idx ON public.erp_details USING gin (raw);

-- ---------------------------------------------------------------------
-- 4. battery_markers / battery_specs : 축전지
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.battery_markers (
  id            text PRIMARY KEY,
  name          text NOT NULL DEFAULT '',
  lat           double precision,
  lng           double precision,
  address       text DEFAULT '',
  memo          text DEFAULT '',
  tags          jsonb DEFAULT '[]'::jsonb,
  color         text,
  facility_team text DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.battery_specs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  marker_id    text REFERENCES public.battery_markers (id) ON DELETE CASCADE,
  erp_name     text,
  capacity     integer,
  quantity     integer,
  station_name text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS battery_specs_marker_id_idx ON public.battery_specs (marker_id);

-- ---------------------------------------------------------------------
-- 5. RLS : anon = 조회(SELECT), authenticated = 조작(INSERT/UPDATE/DELETE)
-- ---------------------------------------------------------------------
ALTER TABLE public.markers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.information     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_details     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battery_markers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battery_specs   ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['markers','information','erp_details','battery_markers','battery_specs']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select_all ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_modify_auth ON public.%I', t, t);

    -- 비로그인 포함 전체 조회 허용 (지도 관람)
    EXECUTE format(
      'CREATE POLICY %I_select_all ON public.%I FOR SELECT TO anon, authenticated USING (true)',
      t, t);

    -- 로그인(authenticated)만 조작 허용
    EXECUTE format(
      'CREATE POLICY %I_modify_auth ON public.%I FOR ALL TO authenticated '
      || 'USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')',
      t, t);
  END LOOP;
END $$;

-- PostgREST 스키마 캐시 즉시 갱신 (테이블 인식용)
NOTIFY pgrst, 'reload schema';
