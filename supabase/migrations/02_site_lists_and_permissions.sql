-- 국소 목록·관리자 판별 함수, Advisor 정리, 마커 삭제 권한 제한
-- 아래 파일들을 파일명 순서대로 이어 붙인 것이다(내용은 원본 그대로, 구분선 주석만 추가).
-- 이미 적용된 DB에는 다시 실행하지 않는다. 새 DB를 만들 때만 번호 순서대로 실행한다.

-- ============================================================
-- 원본: 20261107000000_site_lists.sql
-- ============================================================
-- =====================================================================
-- 위치 메뉴 국소 목록 (Ver 3.0)
--
-- 테이블
--   app_admins         : 관리자 목록. 앱에서 수정할 수 없고 SQL Editor로만 추가·제외한다.
--   site_lists         : 목록(이름, 색상). 관리자가 만든 목록은 관리자만 수정한다.
--   site_list_members  : 목록과 장비 국소의 연결.
--
-- site_list_members.marker_id 에는 markers 외래 키를 두지 않는다. 마커 삭제나 전체 복원으로
-- 소속이 지워지지 않게 하기 위해서다. 같은 ID의 마커가 돌아오면 소속이 그대로 이어지고,
-- 마커가 없는 소속 행은 화면에 표시하지 않는다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- 첫 관리자 등록은 이 파일에 넣지 않는다(저장소가 공개라 이메일을 적지 않는다).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.site_lists (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (length(btrim(name)) > 0),
  color         text NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  is_admin_list boolean NOT NULL DEFAULT false,
  created_by    uuid DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.site_list_members (
  list_id    uuid NOT NULL REFERENCES public.site_lists (id) ON DELETE CASCADE,
  marker_id  text NOT NULL,
  added_by   uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, marker_id)
);

CREATE INDEX IF NOT EXISTS site_list_members_marker_id_idx
  ON public.site_list_members (marker_id);

-- ---------------------------------------------------------------------
-- 권한 판별 함수. RLS 안에서 app_admins·site_lists를 읽어야 하므로 SECURITY DEFINER다.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_admins WHERE user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_site_list(target_list_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.site_lists
    WHERE id = target_list_id
      AND (NOT is_admin_list OR public.is_app_admin())
  );
$$;

REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_site_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_site_list(uuid) TO authenticated;

-- 수정 시각
CREATE OR REPLACE FUNCTION public.touch_site_list_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_lists_touch_updated_at ON public.site_lists;
CREATE TRIGGER site_lists_touch_updated_at
  BEFORE UPDATE ON public.site_lists
  FOR EACH ROW EXECUTE FUNCTION public.touch_site_list_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.app_admins        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_lists        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_list_members ENABLE ROW LEVEL SECURITY;

-- app_admins: 자기 행만 읽는다. 쓰기 정책이 없어 앱에서는 수정할 수 없다.
DROP POLICY IF EXISTS app_admins_select_self ON public.app_admins;
CREATE POLICY app_admins_select_self ON public.app_admins
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- site_lists: 조회는 로그인 사용자 전체. 관리자 목록의 쓰기와 is_admin_list 변경은 관리자만.
DROP POLICY IF EXISTS site_lists_select_auth ON public.site_lists;
CREATE POLICY site_lists_select_auth ON public.site_lists
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS site_lists_insert_auth ON public.site_lists;
CREATE POLICY site_lists_insert_auth ON public.site_lists
  FOR INSERT TO authenticated
  WITH CHECK (NOT is_admin_list OR public.is_app_admin());

DROP POLICY IF EXISTS site_lists_update_auth ON public.site_lists;
CREATE POLICY site_lists_update_auth ON public.site_lists
  FOR UPDATE TO authenticated
  USING (NOT is_admin_list OR public.is_app_admin())
  WITH CHECK (NOT is_admin_list OR public.is_app_admin());

DROP POLICY IF EXISTS site_lists_delete_auth ON public.site_lists;
CREATE POLICY site_lists_delete_auth ON public.site_lists
  FOR DELETE TO authenticated
  USING (NOT is_admin_list OR public.is_app_admin());

-- site_list_members: 조회는 로그인 사용자 전체. 쓰기는 소속 목록을 수정할 수 있는 사용자만.
DROP POLICY IF EXISTS site_list_members_select_auth ON public.site_list_members;
CREATE POLICY site_list_members_select_auth ON public.site_list_members
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS site_list_members_insert_auth ON public.site_list_members;
CREATE POLICY site_list_members_insert_auth ON public.site_list_members
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_site_list(list_id));

DROP POLICY IF EXISTS site_list_members_update_auth ON public.site_list_members;
CREATE POLICY site_list_members_update_auth ON public.site_list_members
  FOR UPDATE TO authenticated
  USING (public.can_edit_site_list(list_id))
  WITH CHECK (public.can_edit_site_list(list_id));

DROP POLICY IF EXISTS site_list_members_delete_auth ON public.site_list_members;
CREATE POLICY site_list_members_delete_auth ON public.site_list_members
  FOR DELETE TO authenticated
  USING (public.can_edit_site_list(list_id));

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 원본: 20261107000100_site_lists_invoker_functions.sql
-- ============================================================
-- =====================================================================
-- Security Advisor 경고 정리: 국소 목록 권한 함수
--
-- 경고: Signed-In Users Can Execute SECURITY DEFINER Function
--   public.is_app_admin(), public.can_edit_site_list(uuid)
--
-- 두 함수는 DEFINER 권한이 필요 없다.
--   is_app_admin       : app_admins의 자기 행을 읽는다. app_admins_select_self 정책이 허용한다.
--   can_edit_site_list : site_lists를 읽는다. site_lists_select_auth 정책이 허용한다.
-- 두 정책 모두 이 함수들을 다시 부르지 않아 재귀도 없다. 판별 결과는 그대로다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- =====================================================================

ALTER FUNCTION public.is_app_admin() SECURITY INVOKER;
ALTER FUNCTION public.can_edit_site_list(uuid) SECURITY INVOKER;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 적용 후 확인: 두 행 모두 is_definer 가 false 여야 한다.
--   SELECT proname, prosecdef AS is_definer
--   FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('is_app_admin', 'can_edit_site_list');
-- ---------------------------------------------------------------------


-- ============================================================
-- 원본: 20261107000200_wrap_auth_role_in_marker_policies.sql
-- ============================================================
-- =====================================================================
-- Performance Advisor 경고 정리: Auth RLS Initialization Plan
--
-- 대상: markers, information, erp_details, battery_markers, battery_specs
--
-- 20261017000000 의 *_modify_auth 정책이 auth.role()을 행마다 다시 계산한다.
-- (select auth.role())로 감싸면 쿼리당 한 번만 계산한다. 조건의 의미는 같아서
-- 권한은 바뀌지 않는다. 로그인 사용자만 조회·조작할 수 있는 그대로다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- =====================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['markers','information','erp_details','battery_markers','battery_specs']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_modify_auth'
    ) THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.%I '
        || 'USING ((select auth.role()) = ''authenticated'') '
        || 'WITH CHECK ((select auth.role()) = ''authenticated'')',
        t || '_modify_auth', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 적용 후 확인: 5행 모두 qual 과 with_check 에 SELECT auth.role() 이 보여야 한다.
--   SELECT tablename, policyname, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('markers','information','erp_details','battery_markers','battery_specs');
-- ---------------------------------------------------------------------


-- ============================================================
-- 원본: 20261107000300_drop_unused_public_indexes.sql
-- ============================================================
-- =====================================================================
-- Performance Advisor 정리: 사용하지 않는 public 인덱스 4개 삭제
--
-- 근거(2026-11-07 확인)
--   * pg_stat_user_indexes.idx_scan = 0. 통계는 2026-05-22부터 쌓였다.
--   * 앱 코드에 이 열들로 조건을 거는 조회가 없다. 전부 읽은 뒤 화면에서 거른다.
--   * site_list_members는 (list_id, marker_id) 기본 키로 충분하다.
--
-- 인덱스만 지운다. 데이터는 그대로이고 언제든 다시 만들 수 있다(아래 복구 참고).
-- erp 스키마는 다른 앱의 것이라 건드리지 않는다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- =====================================================================

DROP INDEX IF EXISTS public.erp_details_raw_gin_idx;
DROP INDEX IF EXISTS public.markers_detached_visible_idx;
DROP INDEX IF EXISTS public.markers_group_key_idx;
DROP INDEX IF EXISTS public.site_list_members_marker_id_idx;

-- ---------------------------------------------------------------------
-- 복구가 필요하면
--   CREATE INDEX erp_details_raw_gin_idx ON public.erp_details USING gin (raw);
--   CREATE INDEX markers_detached_visible_idx ON public.markers (detached_visible);
--   CREATE INDEX markers_group_key_idx ON public.markers (group_key);
--   CREATE INDEX site_list_members_marker_id_idx ON public.site_list_members (marker_id);
-- ---------------------------------------------------------------------


-- ============================================================
-- 원본: 20261107000400_drop_erp_schema.sql
-- ============================================================
-- =====================================================================
-- 삭제된 앱의 erp 스키마 제거
--
-- erp 스키마를 쓰던 앱은 삭제됐고, 데이터는 사용자가 엑셀로 갖고 있어
-- 내보내지 않고 지우기로 했다(사용자 결정, 2026-11-07).
--
-- 2026-11-07 확인: 이 앱 코드와 erp 밖의 DB 객체(외래 키, 뷰, 함수, 트리거)에서
-- erp를 참조하는 곳이 없다.
--
-- ⚠️ 되돌릴 수 없다. public.erp_details 는 이 앱의 테이블로 별개이며 지우지 않는다.
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
-- =====================================================================

DROP SCHEMA IF EXISTS erp CASCADE;

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 원본: 20261113000000_restrict_marker_delete_to_admin.sql
-- ============================================================
-- =====================================================================
-- 장비·축전지 테이블의 삭제를 관리자 전용으로 제한한다 (코드리뷰 개선계획 Task 2)
--
-- 문제: 지금은 로그인한 모든 계정이 5개 테이블에 FOR ALL 권한을 가져, 공개된 anon 키와
--       본인 JWT로 PostgREST를 직접 호출하면 DELETE /rest/v1/markers?id=neq. 로 전체를 지울 수 있다.
--       그룹관리·전체 복원의 관리자 제한이 화면에서만 걸려 있다.
--
-- 변경: {table}_modify_auth(FOR ALL)를 지우고
--         SELECT / INSERT / UPDATE : 로그인 사용자 (지금과 같다)
--         DELETE                   : app_admins에 있는 관리자만
--
-- 영향: 마커 단건 삭제, 위치등록 저장(공정 행 교체), 대기 축전지 규격 재등록, 전체 복원,
--       축전지 전체 삭제는 관리자만 할 수 있다. 등록·수정은 그대로다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다.
--   (이미 적용했다면 다시 실행해 INSERT/UPDATE 정책의 조건만 바뀐다.)
-- 되돌리기: 파일 맨 아래 주석의 SQL.
-- =====================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['markers','information','erp_details','battery_markers','battery_specs']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_modify_auth ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select_auth ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert_auth ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_update_auth ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete_admin ON public.%I', t, t);

    EXECUTE format(
      'CREATE POLICY %I_select_auth ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    -- 조건을 literal true로 두면 Security Advisor가 "RLS Policy Always True"(경고)를 낸다.
    -- (select auth.role())은 행마다 다시 계산하지 않아 Performance Advisor의 initplan 경고도 피한다.
    EXECUTE format(
      'CREATE POLICY %I_insert_auth ON public.%I FOR INSERT TO authenticated '
      || 'WITH CHECK ((SELECT auth.role()) = ''authenticated'')', t, t);
    EXECUTE format(
      'CREATE POLICY %I_update_auth ON public.%I FOR UPDATE TO authenticated '
      || 'USING ((SELECT auth.role()) = ''authenticated'') '
      || 'WITH CHECK ((SELECT auth.role()) = ''authenticated'')', t, t);
    EXECUTE format(
      'CREATE POLICY %I_delete_admin ON public.%I FOR DELETE TO authenticated USING (public.is_app_admin())', t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 적용 후 확인: Security Advisor 에 "RLS Policy Always True"가 없어야 한다.
--   (정책 20개가 보여야 한다: 5개 테이블 x select/insert/update/delete_admin)
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('markers','information','erp_details','battery_markers','battery_specs')
--   ORDER BY 1, 2;
--
-- 동작 확인
--   일반 계정으로 로그인 -> 마커 등록·수정 성공, 삭제는 0행 삭제(RLS가 거름)
--   관리자 계정으로 로그인 -> 삭제 성공
--
-- 되돌리기 (이전 상태로)
--   DO $$ DECLARE t text; BEGIN
--     FOREACH t IN ARRAY ARRAY['markers','information','erp_details','battery_markers','battery_specs'] LOOP
--       EXECUTE format('DROP POLICY IF EXISTS %I_select_auth ON public.%I', t, t);
--       EXECUTE format('DROP POLICY IF EXISTS %I_insert_auth ON public.%I', t, t);
--       EXECUTE format('DROP POLICY IF EXISTS %I_update_auth ON public.%I', t, t);
--       EXECUTE format('DROP POLICY IF EXISTS %I_delete_admin ON public.%I', t, t);
--       EXECUTE format('CREATE POLICY %I_modify_auth ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
--     END LOOP; END $$;
--   NOTIFY pgrst, 'reload schema';
-- ---------------------------------------------------------------------

