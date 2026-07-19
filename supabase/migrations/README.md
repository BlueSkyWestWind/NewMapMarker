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

- **조회(SELECT)**: `anon`, `authenticated` 모두 허용 → 비로그인도 지도 관람 가능
- **조작(INSERT/UPDATE/DELETE)**: `authenticated`(로그인)만 허용

## 파일 목록

| 파일 | 역할 |
| --- | --- |
| `20260718120000_recreate_full_schema_with_erp.sql` | **최신·정식.** 전체 스키마(+ERP, `parent_marker_id`, `group_role`) + RLS. 이 파일 하나로 완결 |
| `20260627000001_enable_rls_and_policies.sql` | (구) RLS 활성화·정책. 위 파일에 통합되어 대체됨 |
| `20260627000000_disable_rls_battery_tables.sql` | (구) 축전지 RLS 임시 비활성 핫픽스. 위 파일에서 정상 RLS로 복구됨 |
| `20260626000000_map_marker_schema_reference.sql` | 스키마 요약 주석(참조용) |

> Supabase CLI(`supabase db push`)로 순서대로 적용하면 위 3·4번째의 (구) RLS 파일이 먼저 실행됐다가 최신 파일이 최종 상태로 덮어씁니다. **SQL Editor 수동 실행 시에는 최신 파일 하나만** 실행하면 됩니다.

## 기존 `001.MapMarker` DB 재사용

이미 구축된 DB가 있으면 `.env`만 연결하면 됩니다. 다만 이 앱은 `erp_details` 테이블과 `markers.parent_marker_id` / `group_role` 컬럼을 사용하므로, 없으면 위 최신 파일을 재실행해 **누락분만 추가**하세요(재실행 안전).
