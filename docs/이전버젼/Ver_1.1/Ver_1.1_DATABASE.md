# Ver_1.1 데이터베이스 문서 (Database)

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 문서 버전: **Ver_1.1**
- 최종 갱신: 2026-07-26
- DBMS: **Supabase PostgreSQL**
- 관련 문서: [IA §5](./Ver_1.1_IA.md) · [ARCHITECTURE](./Ver_1.1_ARCHITECTURE.md) · [API §7](./Ver_1.1_API.md)

---

## 1. ER 다이어그램

```
                      ┌──────────────────────────┐
                      │        markers           │
                      │  id (PK, text)           │
                      │  parent_marker_id ──┐    │
                      │  group_role         │    │  self-reference
                      │  group_key          │    │  ON DELETE SET NULL
                      │  detached_visible   │    │
                      │  site_alias   ← 1.1 │    │
                      │  work_type    ← 1.1 │    │
                      └────┬──────────┬─────┴────┘
                           │          │  ▲──────────┘
              1:N          │          │  1:N
                           ▼          ▼
                  ┌────────────┐  ┌──────────────┐
                  │ information│  │ erp_details  │
                  │ marker_id  │  │ marker_id    │
                  │ (CASCADE)  │  │ raw jsonb    │
                  └────────────┘  └──────────────┘

                  ┌────────────────────┐
                  │  battery_markers   │
                  │  id (PK, text)     │
                  │  site_alias  ← 1.1 │
                  │  work_type   ← 1.1 │
                  └─────────┬──────────┘
                            │ 1:N (CASCADE)
                            ▼
                  ┌────────────────────┐
                  │   battery_specs    │
                  └────────────────────┘
```

## 2. 테이블 명세 (Ver_1.1 변경분)

### 2.1 `markers` — 추가 컬럼

| 컬럼 | 타입 | NULL | 설명 |
| --- | --- | --- | --- |
| `site_alias` | text | ✓ | 국소 검색용 별칭. 쉼표 구분 (`조례,순천조례,SC-조례`) |
| `work_type` | text | ✓ | `ground` \| `elevated`. NULL = 미분류 → `ground` 취급 |

### 2.2 `battery_markers` — 추가 컬럼

`markers`와 동일한 2개 컬럼.

> 옥상·철탑 작업은 축전지 수거뿐 아니라 장비 국소에도 있어 **두 테이블 모두** 필요하다.

### 2.3 그 외 테이블

`information` · `erp_details` · `battery_specs`는 Ver_1.0과 동일.
[Ver_1.0 DATABASE §2](../Ver_1.0/DATABASE.md) 참조.

### 2.4 현재 데이터 규모 (2026-07-26 실측)

| 테이블 | 행 수 | gzip 응답 |
| --- | --- | --- |
| `markers` | 685 | 32 KB |
| `information` | 685 | 30 KB |
| `erp_details` | 685 | 조회 안 함 |
| `battery_markers` | 21 | 1 KB |
| `battery_specs` | 44 | 1 KB |

초기 로딩 4개 쿼리 합계 **gzip 65 KB · 병렬 0.19초**. 현 규모에서 데이터는 로딩 병목이 아니다.

## 3. 마이그레이션

| 파일 | 내용 | 적용 |
| --- | --- | --- |
| `20260626000000_map_marker_schema_reference.sql` | 초기 스키마 | ✅ |
| `20260627000000_disable_rls_battery_tables.sql` | 축전지 RLS 임시 해제 | ✅ |
| `20260627000001_enable_rls_and_policies.sql` | RLS 정책 확립 | ✅ |
| `20260718120000_recreate_full_schema_with_erp.sql` | 전체 재생성 + ERP | ✅ |
| `20260722000000_add_detached_visible.sql` | 동 개별 표시 | ✅ |
| `20260723000000_add_group_key.sql` | 번지 하위 그룹 분리 | ✅ |
| **`20260727000000_add_worksite_weather_columns.sql`** | **`site_alias`·`work_type`** | ⏳ **미적용** |

### 3.1 Ver_1.1 마이그레이션

```sql
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['battery_markers', 'markers']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS site_alias text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS work_type text', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (site_alias)',
                   t || '_site_alias_idx', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
```

- **재실행 안전** (`IF NOT EXISTS`)
- RLS 정책 변경 불필요 — 기존 정책이 신규 컬럼을 그대로 덮는다
- `NOTIFY pgrst`로 PostgREST 스키마 캐시 즉시 갱신

### 3.2 미적용 시 동작

앱은 `row.site_alias ?? null` 형태로 **optional 읽기**를 하므로 조회가 깨지지 않는다.
다만 별칭 검색이 동작하지 않고 모든 국소가 `ground`로 판정된다.

## 4. 인덱스 · 조회 패턴

| 인덱스 | 용도 |
| --- | --- |
| `markers_facility_code_idx` | 시설코드 조회 |
| `markers_parent_marker_id_idx` | 그룹 멤버 조회 |
| `markers_group_role_idx` | 대표/SUB 필터 |
| `information_marker_id_idx` · `information_facility_code_idx` | 상세 조인 |
| `erp_details_marker_id_idx` · `erp_details_raw_gin_idx` | ERP 조회 |
| `battery_specs_marker_id_idx` | 스펙 조인 |
| **`markers_site_alias_idx`** | 별칭 검색 (Ver_1.1) |
| **`battery_markers_site_alias_idx`** | 별칭 검색 (Ver_1.1) |

> ⚠️ 현재 별칭 검색은 **클라이언트 메모리**에서 수행한다(마커 전량이 이미 로드됨).
> 인덱스는 향후 서버 검색 전환 시를 위한 준비다.

## 5. RLS 정책

Ver_1.0과 동일. 5개 테이블 모두:

| 정책 | 대상 | 동작 |
| --- | --- | --- |
| `{table}_select_all` | anon, authenticated | SELECT 허용 |
| `{table}_modify_auth` | authenticated | ALL 허용 |

날씨 조회는 읽기 전용이라 별도 정책이 필요 없다.

## 6. 조회 상한 대응 (Ver_1.1 신규)

> ⚠️ PostgREST는 요청 범위와 무관하게 **서버 설정 상한**까지만 반환한다.
> `select('*')`만 쓰면 상한 초과분이 **오류 없이 잘린다.**

`fetchAllRows()` 도입:

| 항목 | 값 |
| --- | --- |
| 페이지 크기 | 1,000 |
| 종료 조건 | `rows.length >= count` |
| 커서 | 실제 받은 개수만큼 이동 (상한이 더 작아도 안전) |
| 가드 | 최대 50페이지 |
| 정렬 | **유일 키 `id` tiebreaker 필수** |

`information`·`battery_specs`는 Ver_1.0에서 정렬 자체가 없었다 — 페이징 시 순서가 요청마다
달라져 누락·중복이 발생하므로 `order('id')`를 추가했다.

## 7. 백업 파일 구조 (엑셀)

`FULL_BACKUP_COLUMNS`에 Ver_1.1 컬럼 2종을 추가했다.

| 테이블 | 추가된 열 위치 |
| --- | --- |
| `markers` | `group_key` 다음, `created_at` 앞 |
| `battery_markers` | `facility_team` 다음, `created_at` 앞 |

> 백업 열 목록에 넣지 않으면 **복원 시 신규 컬럼이 유실**된다.
> 스키마 변경 시 반드시 `full-backup.ts`를 함께 수정한다.

### 7.1 모듈 분리 (Ver_1.1)

`full-backup.ts`는 `xlsx`(SheetJS)를 정적으로 끌어온다. 상수·타입만 필요한 훅을 위해
**`full-backup-schema.ts`** 를 분리했다.

| 모듈 | 내용 | xlsx 의존 |
| --- | --- | --- |
| `full-backup-schema.ts` | `FULL_BACKUP_TABLE_NAMES` · 타입 · `buildDatedBackupFilename` | ✗ |
| `full-backup.ts` | 실제 읽기/쓰기 + 위 항목 재export | ✓ |

## 8. 데이터 정합성 체크 쿼리

Ver_1.0의 ①②③에 더해 Ver_1.1 항목:

```sql
-- ④ work_type 값 검증 (ground/elevated/NULL 외 값이 있으면 안 됨)
SELECT work_type, count(*) FROM public.markers
 WHERE work_type IS NOT NULL AND work_type NOT IN ('ground','elevated')
 GROUP BY work_type;

-- ⑤ 좌표 없는 국소 (날씨 조회 불가 대상)
SELECT count(*) FROM public.markers WHERE lat IS NULL OR lng IS NULL;

-- ⑥ 별칭 중복 (검색 혼선 가능)
SELECT site_alias, count(*) FROM public.markers
 WHERE site_alias IS NOT NULL AND site_alias <> ''
 GROUP BY site_alias HAVING count(*) > 1;
```

④는 0행, ⑥은 확인 후 정비 대상이다.

## 9. 변경 시 주의사항

| 상황 | 체크 |
| --- | --- |
| 컬럼 추가 | ① 마이그레이션 ② `api.ts` 매핑 ③ 타입 ④ **백업 열 목록** ⑤ 본 문서 |
| 컬럼 추가 후 배포 | 마이그레이션 **먼저**. 앱은 optional 읽기로 방어하되 의존하지 말 것 |
| 조회 추가 | `select('*')` 단발 금지. `fetchAllRows` 사용 + 정렬에 `id` 포함 |
| 정렬 변경 | 유일 키 tiebreaker 유지 확인 |
| RLS 변경 | 5개 테이블 일관성 유지 |
