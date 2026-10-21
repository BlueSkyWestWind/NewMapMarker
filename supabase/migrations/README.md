# MapMarker DB 마이그레이션

이 폴더가 **현재 스키마의 정식 소스**입니다. (`001.MapMarker/sql/`는 과거 참조용)

## 신규 · 초기화 DB (권장)

Supabase 대시보드 → **SQL Editor** 에 아래 한 파일만 붙여넣고 **Run** 하면 전체 테이블 + 인덱스 + RLS가 한 번에 구성됩니다.

```
20260718120000_recreate_full_schema_with_erp.sql
```

- 모든 `CREATE`가 `IF NOT EXISTS`, 컬럼 추가는 `ADD COLUMN IF NOT EXISTS`라 **기존 DB에 재실행해도 안전**합니다.
- 실행 후 `NOTIFY pgrst, 'reload schema'`로 PostgREST 캐시가 즉시 갱신됩니다.

## 생성되는 테이블

| 테이블 | 용도 | 주요 관계 |
| --- | --- | --- |
| `markers` | 장비 마커(지도 핀) | `parent_marker_id` → 동일 번지 대표/서브(`group_role`) |
| `information` | 장비 상세정보 | `marker_id` → `markers` (1:N, ON DELETE CASCADE) |
| `erp_details` | 공정관리(ERP) 시트 원본 전량(79열 → `raw` jsonb) | `marker_id` → `markers` |
| `battery_markers` | 축전지 마커 | — |
| `battery_specs` | 축전지 사양(용량/수량) | `marker_id` → `battery_markers` (1:N) |

## RLS 정책

전 테이블 공통:

- **조회·조작(SELECT/INSERT/UPDATE/DELETE) 전부**: `authenticated`(로그인)만 허용 → 비로그인(anon)은 마커를 읽지도 쓰지도 못한다

> 위 정책은 `20261017000000_require_login_for_marker_read.sql` 적용 후의 상태다. 정식 스키마 파일(`20260718120000_…`)은 anon 조회를 여는 정책을 만들므로, **새 DB를 만들 때는 두 파일을 순서대로 모두 실행**해야 한다.

## 파일 목록

| 파일 | 역할 |
| --- | --- |
| `20261021000000_fix_erp_schema_lint_warnings.sql` | **Advisor 정리.** `erp` 스키마(다른 앱 소유)의 `set_updated_at` search_path 고정 + `*_auth_all` 정책 경고 해소. 동작은 그대로(권한 강화 아님). 해당 스키마가 없으면 아무 일도 안 한다 |
| `20261017000000_require_login_for_marker_read.sql` | **보안.** anon 조회·쓰기 정책 삭제 → 로그인 사용자만 마커 접근. 정식 스키마 파일 **다음에** 실행 |
| `20260718120000_recreate_full_schema_with_erp.sql` | **정식 스키마.** 전체 스키마(+ERP, `parent_marker_id`, `group_role`) + RLS(초기 상태는 anon 조회 허용) |
| `20260627000001_enable_rls_and_policies.sql` | (구) RLS 활성화·정책. 위 파일에 통합되어 대체됨 |
| `20260627000000_disable_rls_battery_tables.sql` | (구) 축전지 RLS 임시 비활성 핫픽스. 위 파일에서 정상 RLS로 복구됨 |
| `20260626000000_map_marker_schema_reference.sql` | 스키마 요약 주석(참조용) |

> Supabase CLI(`supabase db push`)로 순서대로 적용하면 위 3·4번째의 (구) RLS 파일이 먼저 실행됐다가 최신 파일이 최종 상태로 덮어씁니다. **SQL Editor 수동 실행 시에는 `20260718120000_…` → `20261017000000_…` 두 파일만** 순서대로 실행하면 됩니다.

## 기존 `001.MapMarker` DB 재사용

이미 구축된 DB가 있으면 `.env`만 연결하면 됩니다. 다만 이 앱은 `erp_details` 테이블과 `markers.parent_marker_id` / `group_role` 컬럼을 사용하므로, 없으면 위 최신 파일을 재실행해 **누락분만 추가**하세요(재실행 안전).

## Security Advisor 경고 정리 (2026-10-21, 22건)

| 경고 | 건수 | 해결 |
| --- | --- | --- |
| `public.markers/information/erp_details` 의 `*_insert_anon`·`*_update_anon` (RLS Policy Always True) | 6 | `20261017000000_require_login_for_marker_read.sql` |
| `erp.*_auth_all` (RLS Policy Always True) | 14 | `20261021000000_fix_erp_schema_lint_warnings.sql` (경고 해소, 권한은 동일) |
| `erp.set_updated_at` (Function Search Path Mutable) | 1 | `20261021000000_fix_erp_schema_lint_warnings.sql` |
| Leaked Password Protection Disabled | 1 | SQL 아님. 대시보드 **Authentication → Sign In / Providers → Email → Prevent use of leaked passwords** 켜기 (Pro 플랜 이상에서 제공) |

> **가입 차단 확인**: 이 앱의 `authenticated` 는 "이 Supabase 프로젝트에 가입된 누구나"다. 앱 화면에는 가입 UI가 없지만,
> 대시보드 **Authentication → Sign In / Providers → Allow new users to sign up** 이 켜져 있으면 anon 키로 직접 가입해 로그인 벽을 통과할 수 있다.
> 사용자를 직접 만들어 쓴다면 이 옵션을 끄는 것을 권한다.
