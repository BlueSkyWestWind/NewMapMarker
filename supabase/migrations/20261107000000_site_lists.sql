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
