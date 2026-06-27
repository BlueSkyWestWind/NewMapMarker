# MapMarker DB 마이그레이션

기존 `001.MapMarker/sql/` 스크립트와 동일한 Supabase 스키마를 사용합니다.

이미 `001.MapMarker`용 DB가 구축되어 있다면 **추가 마이그레이션 없이** `.env`만 연결하면 됩니다.

신규 프로젝트인 경우 Supabase SQL Editor에서 아래 순서로 `001.MapMarker/sql/` 파일을 실행하세요.

1. `update_schema.sql`
2. `create_battery_tables.sql`
3. `add_color_to_markers.sql`
4. `add_address_to_markers.sql`
5. `add_facility_team_to_markers.sql`
6. `add_equipment_relationships.sql`
7. `enable_rls_policies.sql`
8. `fix_db_write_permissions.sql` (필요 시)

`20260626000000_map_marker_schema_reference.sql`은 스키마 요약 참조용입니다.
