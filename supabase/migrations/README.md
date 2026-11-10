# MapMarker DB 마이그레이션

이 폴더가 **현재 스키마의 정식 소스**입니다. (`001.MapMarker/sql/`는 과거 참조용)

## 신규 · 초기화 DB

Supabase 대시보드 → **SQL Editor** 에서 아래 파일을 **번호 순서대로** 한 파일씩 붙여넣고 **Run** 합니다.
`01`~`04`는 예전 마이그레이션 29개를 순서대로 이어 붙인 것이고(내용은 원본 그대로, 구분선 주석만 추가),
`2026…` 파일은 그 뒤에 새로 만든 개별 파일입니다.

```
01_markers_core.sql
02_site_lists_and_permissions.sql
03_facility_schedule.sql
04_admin_accounts.sql
20261116000100_kma_api_usage.sql
20261116000200_kma_forecast_cache.sql
20261116000300_kma_prefetch_cron.sql   ← pg_cron·pg_net·Secret·vault 준비 후(파일 머리말 참고)
```

- **이미 운영 중인 DB에는 `01`~`04`를 다시 실행하지 않는다.** 이미 적용된 내용이고, 일부는 다시 실행하면 안 된다
  (`03`의 일자별 상세는 사용자가 지운 처음 목록 값을 되살리고, 칸 맞바꾸기 함수는 마지막에 고친 정의로 끝나야 한다).
- 앞으로 추가하는 마이그레이션은 `2026…` 타임스탬프 개별 파일로 만든다. 적용 전 파일을 한눈에 찾기 위해서다.
  적용이 끝나 안정되면 같은 방식으로 영역별 번호 파일에 합친다.

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

> 위 정책은 `01_markers_core.sql` 맨 끝(구 `20261017000000_require_login_for_marker_read`) 적용 후의 상태다. 같은 파일 앞쪽에서 anon 조회를 여는 정책을 만들었다가 뒤에서 닫으므로 **파일 전체를 순서대로** 실행해야 한다. 삭제(DELETE)는 `02`의 마지막 구간에서 관리자 전용으로 다시 좁힌다.

## 파일 목록

| 파일 | 합쳐진 원본 | 역할 |
| --- | --- | --- |
| `01_markers_core.sql` | `20260626` 참조 주석 · `20260627` RLS 핫픽스·정책(구) · `20260718` 정식 스키마 · `20260722` `detached_visible` · `20260723` `group_key` · `20260727` 날씨 컬럼 · `20260817` anon 등록 허용 · `20260826` 파란 마커 기본색 · `20261017` 로그인 필수 · `20261021` erp 린트 | 장비·축전지·ERP 테이블과 RLS. 앞쪽에서 anon 조회를 열었다가 `20261017` 구간에서 닫는다 |
| `02_site_lists_and_permissions.sql` | `20261107000000`~`000400` · `20261113` 마커 삭제 제한 | 국소 목록(`app_admins`·`site_lists`·`site_list_members`)·`is_app_admin()`, Advisor 정리(INVOKER 함수·`auth.role()` 래핑·미사용 인덱스), `erp` 스키마 제거(되돌릴 수 없음), 장비·축전지 삭제를 관리자 전용으로 제한 |
| `03_facility_schedule.sql` | `20261108`~`20261110` · `20261111` · `20261112`×2 · `20261114` · `20261115` · `20261116000000` | 시설일정 전체: 4개 테이블·칸 이동·날짜 범위 교체 함수, 시행 결과, 작업금지, 일자별 상세·목록·누적, 수동 행, 인덱스 정리, 입회·신호수 대상, 칸 맞바꾸기 수정. `01`·`02`(`is_app_admin`) **다음에** 실행 |
| `04_admin_accounts.sql` | `20261113` 접속 세션 · `20261114` 접속 기록 · `20261115` 작업 감사 기록 | 관리자 계정설정의 `admin_user_sessions`·`admin_user_login_history`·`admin_audit_log`. `02`(`is_app_admin`) **다음에** 실행 |
| `20261116000100_kma_api_usage.sql` | — | 기상청 호출 횟수를 시간대별로 집계(`kma_api_usage`·`record_kma_call()`). 읽기는 관리자만 |
| `20261116000200_kma_forecast_cache.sql` | — | 기상청 예보를 기준시각별로 저장(`kma_forecast_cache`, 서비스 키 전용). 적용 전에도 날씨는 실시간으로 동작 |
| `20261116000300_kma_prefetch_cron.sql` | — | `pg_cron`으로 KST 07~17시 사전 수집 + 매일 정리. 파일 머리말의 준비 사항 필요 |

세부 사유(예: 칸 맞바꾸기 409 원인, 미시설 필수 사유)는 각 구간의 원본 주석에 그대로 남아 있다.

## 기존 `001.MapMarker` DB 재사용

이미 구축된 DB가 있으면 `.env`만 연결하면 됩니다. 다만 이 앱은 `erp_details` 테이블과 `markers.parent_marker_id` / `group_role` 컬럼을 사용하므로, 없으면 `01_markers_core.sql`을 재실행해 **누락분만 추가**하세요(`IF NOT EXISTS`라 재실행 안전).

## Security Advisor 경고 정리 (2026-10-21, 22건)

| 경고 | 건수 | 해결 |
| --- | --- | --- |
| `public.markers/information/erp_details` 의 `*_insert_anon`·`*_update_anon` (RLS Policy Always True) | 6 | `01_markers_core.sql`(구 `20261017000000`) |
| `erp.*_auth_all` (RLS Policy Always True) | 14 | `01_markers_core.sql`(구 `20261021000000`) (경고 해소, 권한은 동일) |
| `erp.set_updated_at` (Function Search Path Mutable) | 1 | `01_markers_core.sql`(구 `20261021000000`) |
| Leaked Password Protection Disabled | 1 | SQL 아님. 대시보드 **Authentication → Sign In / Providers → Email → Prevent use of leaked passwords** 켜기 (Pro 플랜 이상에서 제공) |

> **가입 차단 확인**: 이 앱의 `authenticated` 는 "이 Supabase 프로젝트에 가입된 누구나"다. 앱 화면에는 가입 UI가 없지만,
> 대시보드 **Authentication → Sign In / Providers → Allow new users to sign up** 이 켜져 있으면 anon 키로 직접 가입해 로그인 벽을 통과할 수 있다.
> 사용자를 직접 만들어 쓴다면 이 옵션을 끄는 것을 권한다.
