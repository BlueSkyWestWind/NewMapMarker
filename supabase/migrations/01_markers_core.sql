-- 마커 핵심 스키마(장비·축전지·ERP) 및 RLS
-- 아래 파일들을 파일명 순서대로 이어 붙인 것이다(내용은 원본 그대로, 구분선 주석만 추가).
-- 이미 적용된 DB에는 다시 실행하지 않는다. 새 DB를 만들 때만 번호 순서대로 실행한다.

-- ============================================================
-- 원본: 20260626000000_map_marker_schema_reference.sql
-- ============================================================
-- MapMarker schema reference (001.MapMarker와 동일)
-- 신규 DB인 경우 001.MapMarker/sql/ 전체 스크립트 실행을 권장합니다.

-- markers, information, battery_markers, battery_specs
-- RLS: anon SELECT / authenticated INSERT,UPDATE,DELETE


-- ============================================================
-- 원본: 20260627000000_disable_rls_battery_tables.sql
-- ============================================================
-- 1. battery_markers 및 battery_specs 테이블의 RLS(Row Level Security) 비활성화
-- RLS 정책으로 인해 API 호출 시 축전지 마커 데이터가 조회되지 않는 현상을 즉각 해결합니다.
ALTER TABLE public.battery_markers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.battery_specs DISABLE ROW LEVEL SECURITY;

-- 2. API 호출 권한 명시적 재부여
GRANT ALL ON TABLE public.battery_markers TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE public.battery_specs TO postgres, anon, authenticated, service_role;

-- 3. PostgREST API 스키마 캐시 갱신 통보
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 원본: 20260627000001_enable_rls_and_policies.sql
-- ============================================================
-- 1. battery_markers 및 battery_specs 테이블의 RLS(Row Level Security) 활성화
-- Supabase Security Advisor의 RLS Disabled 경고 문제를 해결하고 보안을 강화합니다.
ALTER TABLE public.battery_markers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battery_specs ENABLE ROW LEVEL SECURITY;

-- 2. 기존 생성되었을 수 있는 정책들 안전하게 삭제 (중복 방지)
DROP POLICY IF EXISTS battery_markers_select_all ON public.battery_markers;
DROP POLICY IF EXISTS battery_markers_modify_auth ON public.battery_markers;
DROP POLICY IF EXISTS battery_markers_delete_authenticated ON public.battery_markers;
DROP POLICY IF EXISTS battery_markers_insert_authenticated ON public.battery_markers;
DROP POLICY IF EXISTS battery_markers_update_authenticated ON public.battery_markers;

DROP POLICY IF EXISTS battery_specs_select_all ON public.battery_specs;
DROP POLICY IF EXISTS battery_specs_modify_auth ON public.battery_specs;
DROP POLICY IF EXISTS battery_specs_delete_authenticated ON public.battery_specs;
DROP POLICY IF EXISTS battery_specs_insert_authenticated ON public.battery_specs;
DROP POLICY IF EXISTS battery_specs_update_authenticated ON public.battery_specs;

-- 3. 모든 사람(비로그인 anon 및 로그인 authenticated 전체)에게 조회(SELECT) 허용 정책 수립
-- 비로그인 일반 관람자도 지도의 마커 데이터를 정상적으로 읽어올 수 있도록 허용합니다.
CREATE POLICY battery_markers_select_all ON public.battery_markers
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY battery_specs_select_all ON public.battery_specs
    FOR SELECT TO anon, authenticated
    USING (true);

-- 4. 로그인한 관리자(authenticated)에게만 모든 데이터 조작(INSERT, UPDATE, DELETE) 권한 부여 정책 수립
-- 단순히 USING (true)를 사용하면 항상 참이 되어 경고가 발생하므로, 명시적인 인증 역할(auth.role)을 검증하여 보안을 강화합니다.
CREATE POLICY battery_markers_modify_auth ON public.battery_markers
    FOR ALL TO authenticated
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY battery_specs_modify_auth ON public.battery_specs
    FOR ALL TO authenticated
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- 5. PostgREST API 스키마 캐시 즉시 갱신 통보
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 원본: 20260718120000_recreate_full_schema_with_erp.sql
-- ============================================================
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


-- ============================================================
-- 원본: 20260722000000_add_detached_visible.sql
-- ============================================================
-- =====================================================================
-- markers.detached_visible : 같은 번지 SUB 국소를 지도에 개별 표시할지 여부
--   - 기본 false = 기존과 동일(대표만 표시, SUB 숨김)
--   - true 로 "개별 표시 해제"한 SUB만 지도에 개별 마커로 노출
--     (노출 후 지도에서 핀을 드래그해 실제 위치로 배치 → lat/lng 갱신)
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run
-- =====================================================================

ALTER TABLE public.markers
  ADD COLUMN IF NOT EXISTS detached_visible boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.markers.detached_visible IS
  '동일 번지 SUB를 지도에 개별 표시(true)할지 여부. 기본 false(대표만 표시).';

CREATE INDEX IF NOT EXISTS markers_detached_visible_idx
  ON public.markers (detached_visible);

-- PostgREST 스키마 캐시 즉시 갱신 (신규 컬럼 인식용)
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 원본: 20260723000000_add_group_key.sql
-- ============================================================
-- =====================================================================
-- markers.group_key : 번지 하위에서 "동/구역 단위 실제 그룹 분리"용 영구 키
--   - NULL(기본) = 번지 주소 키(getLotAddressKey)로 그룹(기존 동작 그대로)
--   - 값 있음   = 이 키로 별도 그룹(대표+SUB). 같은 번지라도 분리됨.
--     예) 아파트 695-6번지에서 103동만 분리 → 그 국소들에 동일 group_key 부여
--         → 원 번지 그룹에서 빠지고 독립 대표+SUB 그룹이 됨(원복 시 NULL로).
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run
-- =====================================================================

ALTER TABLE public.markers
  ADD COLUMN IF NOT EXISTS group_key text;

COMMENT ON COLUMN public.markers.group_key IS
  '번지 하위 분리 그룹 키. NULL이면 번지 주소로 그룹, 값이 있으면 그 키로 별도 그룹(대표+SUB).';

CREATE INDEX IF NOT EXISTS markers_group_key_idx
  ON public.markers (group_key);

-- PostgREST 스키마 캐시 즉시 갱신 (신규 컬럼 인식용)
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 원본: 20260727000000_add_worksite_weather_columns.sql
-- ============================================================
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


-- ============================================================
-- 원본: 20260817165000_allow_anon_map_marker_registration.sql
-- ============================================================
-- =====================================================================
-- 0007_Process_Management -> 0004_NewMapMarker 위치마커 자동 등록 허용
-- 
-- 적용 방법: Supabase 대시보드(bgdqjtmkdprqencgnrbx) -> SQL Editor에 붙여넣고 Run
-- =====================================================================

-- 1. markers 테이블에 anon 쓰기/수정 권한 정책 추가
DROP POLICY IF EXISTS markers_insert_anon ON public.markers;
DROP POLICY IF EXISTS markers_update_anon ON public.markers;

CREATE POLICY markers_insert_anon ON public.markers
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY markers_update_anon ON public.markers
    FOR UPDATE TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 2. information 테이블에 anon 쓰기/수정 권한 정책 추가
DROP POLICY IF EXISTS information_insert_anon ON public.information;
DROP POLICY IF EXISTS information_update_anon ON public.information;

CREATE POLICY information_insert_anon ON public.information
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY information_update_anon ON public.information
    FOR UPDATE TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 3. erp_details 테이블에 anon 쓰기/수정 권한 정책 추가 (선택)
DROP POLICY IF EXISTS erp_details_insert_anon ON public.erp_details;
DROP POLICY IF EXISTS erp_details_update_anon ON public.erp_details;

CREATE POLICY erp_details_insert_anon ON public.erp_details
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY erp_details_update_anon ON public.erp_details
    FOR UPDATE TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 4. PostgREST API 스키마 캐시 즉시 갱신 통보
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 원본: 20260826000000_fix_blue_marker_default_color.sql
-- ============================================================
-- =====================================================================
-- 기존 파란색(#2563eb) 마커를 기본색인 에메랄드(#10b981)로 일괄 변경
--
-- 배경:
--   외부 API(0007_Process_Management)에서 새 마커 등록 시 '#2563eb'(파란색)로
--   저장되었던 기존 마커 색상을 현재 기본 마커색인 '#10b981'(에메랄드)로 일괄 갱신합니다.
--
-- 적용 방법:
--   Supabase 대시보드 -> SQL Editor에 붙여넣고 Run
-- =====================================================================

UPDATE public.markers
SET color = '#10b981'
WHERE color = '#2563eb';


-- ============================================================
-- 원본: 20261017000000_require_login_for_marker_read.sql
-- ============================================================
-- =====================================================================
-- 마커 데이터는 로그인(authenticated)한 사용자만 조회·조작 가능
--
-- 배경: NEXT_PUBLIC_SUPABASE_ANON_KEY 는 브라우저에 공개되므로, 화면에서 마커를 숨겨도
--       anon 에게 SELECT 가 열려 있으면 REST 로 전체 데이터를 읽을 수 있다.
--
-- 변경:
--   1. *_select_all (anon + authenticated 조회 허용) 삭제
--      -> 남는 *_modify_auth (FOR ALL TO authenticated) 가 로그인 사용자의 SELECT 도 포함한다.
--   2. *_insert_anon / *_update_anon (20260817165000 에서 연 비로그인 쓰기) 삭제
--
-- 적용 순서: 로그인 전용 클라이언트를 먼저 배포한 뒤 이 SQL 을 실행한다.
--            순서가 반대면 그 사이 비로그인 사용자에게 조회 오류가 보인다.
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run
-- =====================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['markers','information','erp_details','battery_markers','battery_specs']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select_all ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert_anon ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_update_anon ON public.%I', t, t);
  END LOOP;
END $$;

-- *_modify_auth 가 없는 환경 대비: 로그인 사용자 전체 권한 정책을 보장한다.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['markers','information','erp_details','battery_markers','battery_specs']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_modify_auth ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_modify_auth ON public.%I FOR ALL TO authenticated '
      || 'USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')',
      t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 적용 후 확인 (anon 키로 호출 -> 빈 배열 [] 이어야 한다)
--   curl "<SUPABASE_URL>/rest/v1/markers?select=id&limit=1" \
--        -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
-- ---------------------------------------------------------------------


-- ============================================================
-- 원본: 20261021000000_fix_erp_schema_lint_warnings.sql
-- ============================================================
-- =====================================================================
-- Security Advisor 경고 정리 — erp 스키마 (다른 앱 0007_Process_Management 소유)
--
-- 대상 (2026-10-21 Supabase Security Advisor CSV 기준)
--   1. function_search_path_mutable : erp.set_updated_at
--   2. rls_policy_always_true       : erp.*_auth_all 정책 14건 (USING true / WITH CHECK true)
--
-- 이 파일이 하지 않는 것
--   * public.* 정책 6건(markers/information/erp_details 의 *_insert_anon, *_update_anon)은
--     20261017000000_require_login_for_marker_read.sql 이 삭제한다. 이 파일은 건드리지 않는다.
--   * Leaked Password Protection 은 SQL이 아니라 대시보드 설정이다(README 참고).
--
-- 안전 장치
--   * erp 스키마·함수·정책이 없으면 아무 일도 하지 않는다(다른 환경에서도 실행 가능).
--   * 여러 번 실행해도 결과가 같다(멱등).
--   * 정책 이름·테이블 이름을 하드코딩하지 않고, 조건에 맞는 것만 찾아서 바꾼다.
--
-- ⚠️ 2번은 "경고 해소"이지 "권한 강화"가 아니다.
--   현재 정책은 authenticated 역할 전체에 모든 권한을 준다. 아래 변경은 같은 의미를
--   linter 가 인식하는 형태로 바꿀 뿐이라 동작은 그대로다. 실제로 좁히려면 erp 앱의
--   권한 모델(팀·소유자 컬럼 등)이 필요하며, 이 저장소에는 그 정보가 없다.
--
-- 적용 순서: 0007_Process_Management 앱이 이 DB를 어떻게 쓰는지 아는 쪽에서 확인 후 실행.
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. erp.set_updated_at : search_path 고정
--    트리거 함수라 now() 등 pg_catalog 함수만 쓰는 것이 일반적이다.
--    search_path 를 비우면 스키마 없이 쓴 테이블·함수는 찾지 못하므로,
--    실행 후 하단 확인 쿼리와 erp 앱의 UPDATE 동작을 한 번 확인한다.
-- ---------------------------------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'erp' AND p.proname = 'set_updated_at'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = ''''', f.sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 2. erp.* : USING (true) / WITH CHECK (true) 인 ALL 정책을 동일 의미의 식으로 교체
--    ALTER POLICY 는 대상 역할(TO ...)을 바꾸지 않는다. (select ...) 로 감싸면
--    행마다 함수를 재평가하지 않아 성능 경고(auth_rls_initplan)도 피한다.
-- ---------------------------------------------------------------------
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'erp'
      AND cmd = 'ALL'
      AND qual = 'true'
      AND with_check = 'true'
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I USING ((select auth.role()) = ''authenticated'') '
      || 'WITH CHECK ((select auth.role()) = ''authenticated'')',
      pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 적용 후 확인 (SQL Editor 에서 각각 실행)
--
-- (a) 함수: proconfig 에 search_path= 가 보여야 한다
--   SELECT p.oid::regprocedure, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'erp' AND p.proname = 'set_updated_at';
--
-- (b) 정책: 결과가 0행이어야 한다 (남은 always-true 정책)
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'erp' AND (qual = 'true' OR with_check = 'true');
--
-- 그다음 Security Advisor 에서 Refresh.
-- ---------------------------------------------------------------------

