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
