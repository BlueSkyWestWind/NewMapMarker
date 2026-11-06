# 데이터베이스 문서 (Database)

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 문서 버전: **Ver_1.0**
- 최종 갱신: 2026-07-25
- DBMS: **Supabase PostgreSQL**
- 관련 문서: [IA §5](./Ver_1.0_IA.md) · [ARCHITECTURE](./ARCHITECTURE.md) · [BUSINESS_RULE](./BUSINESS_RULE.md) · [API](./API.md)

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
                  └─────────┬──────────┘
                            │ 1:N (CASCADE)
                            ▼
                  ┌────────────────────┐
                  │   battery_specs    │
                  └────────────────────┘
```

| 관계 | FK | 삭제 정책 | 이유 |
| --- | --- | --- | --- |
| markers → information | `marker_id` | **CASCADE** | 마커 삭제 시 부가 정보 잔존 금지(FR-27) |
| markers → erp_details | `marker_id` | **CASCADE** | 동일 |
| markers → markers | `parent_marker_id` | **SET NULL** | 대표 삭제 시 SUB는 남기고 재판정으로 복구 |
| battery_markers → battery_specs | `marker_id` | **CASCADE** | 동일 |

> 장비계열(`markers`)과 축전지계열(`battery_markers`)은 **완전 분리된 두 그래프**다. FK로 연결되지 않는다.

## 2. 테이블 명세

### 2.1 `markers` — 장비 국소

| 컬럼 | 타입 | Null | 기본 | 설명 |
| --- | --- | :---: | --- | --- |
| `id` | text | ✕ | — | PK. 마커 식별자 |
| `name` | text | ○ | — | 국소명 |
| `lat` | double precision | ○ | — | 위도. null이면 지도 미렌더 |
| `lng` | double precision | ○ | — | 경도 |
| `memo` | text | ○ | — | 메모 |
| `tags` | jsonb | ○ | `[]` | 태그 배열. 문자열/JSON/구분자 입력을 배열로 정규화 |
| `color` | text | ○ | `#10b981` | 마커 색(hex). 시설팀 지정 시 팀 색으로 갱신 |
| `facility_team` | text | ○ | — | 시설팀 ID (1~5, 7) |
| `facility_code` | text | ○ | — | 통합시설코드 |
| `road_address` | text | ○ | — | 도로명 주소 |
| `jibun_address` | text | ○ | — | **지번 주소** — 번지 그룹 키의 원천 |
| `parent_marker_id` | text FK→markers | ○ | null | **null = 대표/단독**, 값 = 해당 대표의 SUB |
| `group_role` | text | ○ | — | `대표` \| `SUB`. 백업 엑셀 `구분` 열과 동기화 |
| `group_key` | text | ○ | null | 번지 하위 분리 그룹 키. **null = 번지 주소로 그룹** |
| `detached_visible` | boolean | ○ | `false` | 같은 번지 SUB를 지도에 개별 핀으로 표시 |
| `created_at` | timestamptz | ✕ | `now()` | **대표 승격 순서의 결정 기준** |

**의미 제약(앱 레벨 보장, [BUSINESS_RULE](./BUSINESS_RULE.md) 참조)**

- 같은 유효 키 그룹 안에 `parent_marker_id IS NULL`인 행은 **정확히 1개**
- SUB의 부모는 **같은 유효 키** 안에 존재해야 함
- 분리(`group_key` 부여) 시 이동 멤버의 `detached_visible`은 `false`로 리셋

> ⚠️ 위 제약은 DB 제약조건이 아니라 애플리케이션 로직으로 유지된다. 원자성 보강은 [CR-003](./CHANGE_REQUEST/CR-003.md).

### 2.2 `information` — 마커 부가 정보 (1:N)

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `marker_id` | text FK→markers (CASCADE) | 소속 마커 |
| `place_name` | text | 국소명. **레거시 매칭 키** |
| `facility_code` | text | 통합시설코드 |
| `project_code` | text | 사업 코드 |
| `facility_year` | text | 시설 연도 — 연도 필터 원천 |
| `business_type` | text | 사업 유형 — 사업 필터 원천 |
| `final_station_name` | text | 최종 국사명 |
| `eq_class` | text | 장비 분류 |
| `eq_type` | text | 장비 유형 |
| `install_date` | text | 설치일 |
| `open_date` | text | 개통일 |
| `created_at` | timestamptz | 생성 시각 |

**조회 규칙**

1. `marker_id`로 우선 인덱싱한다.
2. 없으면 `place_name`으로 매칭한다(레거시 데이터 대응).
3. 여러 행이면 **첫 행을 대표 정보**로 사용한다.

### 2.3 `erp_details` — ERP 79열

매핑 컬럼 **29개** + 원본 보존 컬럼 `raw`.

| 그룹 | 컬럼 |
| --- | --- |
| 식별 | `marker_id` · `facility_code` |
| 사업 | `project` · `mgmt_item` · `partner` · `biz_round` · `biz_category` · `biz_type` |
| 지역 | `region_do` · `region_sigungu` · `address_full` |
| 국사 | `station_final` · `station_plan` · `site_name` |
| 방식 | `method` · `access_method` |
| 장비 | `equip_final_major` · `equip_final` · `equip_location` · `erp_usage` |
| 부동산 | `realty_type` · `building_type` |
| 공용 | `sharing` · `sharing_operator` |
| 일정 | `acta_done_date` |
| 담당 | `hw_team` · `test_team` · `ai_manager` |
| 기타 | `remarks` |
| **원본** | **`raw` jsonb — 79열 전체** |

> `raw`가 있기 때문에 ERP 엑셀 포맷이 바뀌어도 **재파싱으로 복구**할 수 있다(RK5 대응). 매핑 컬럼만 늘리거나 줄이는 변경은 데이터 손실 없이 가능하다.

### 2.4 `battery_markers` — 축전지 지점

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | text PK | 식별자 |
| `name` | text | 국소명 |
| `lat` / `lng` | double precision | 좌표 |
| `address` | text | 주소(단일 컬럼) |
| `memo` | text | 메모 |
| `tags` | jsonb | 태그 |
| `color` | text | 마커 색. 미지정 시 `#64748b` |
| `facility_team` | text | 시설팀 |
| `created_at` | timestamptz | 생성 시각 |

축전지에는 `parent_marker_id` · `group_key` · `group_role` · `detached_visible`이 **없다**. 그룹핑은 장비 전용 도메인이다.

### 2.5 `battery_specs` — 축전지 스펙 (1:N)

| 컬럼 | 타입 | 기본 | 설명 |
| --- | --- | --- | --- |
| `marker_id` | text FK (CASCADE) | — | 소속 마커 |
| `erp_name` | text | — | ERP 상 명칭 |
| `capacity` | numeric | **600** | 용량(Ah). 엑셀 미입력·DB null 시 적용 |
| `quantity` | integer | **12** | 수량. 동일 |
| `station_name` | text | — | 국사명 |
| `created_at` | timestamptz | `now()` | 생성 시각 |

> 기본값 600/12는 **표시 시점 폴백**이다. 필터 대상에도 포함된다(FR-15).

## 3. 마이그레이션

### 3.1 적용 순서 (파일명 순서 = 적용 순서)

| # | 파일 | 내용 | 필수 |
| --- | --- | --- | :---: |
| 1 | `20260626000000_map_marker_schema_reference.sql` | 기준 스키마 | ● |
| 2 | `20260627000000_disable_rls_battery_tables.sql` | 축전지 RLS 임시 해제 | ● |
| 3 | `20260627000001_enable_rls_and_policies.sql` | RLS 및 정책 | ● |
| 4 | `20260718120000_recreate_full_schema_with_erp.sql` | ERP 79열 포함 전체 재구성 | ● |
| 5 | `20260722000000_add_detached_visible.sql` | `markers.detached_visible` | ● |
| 6 | `20260723000000_add_group_key.sql` | `markers.group_key` | ● |

### 3.2 규칙

| 규칙 | 내용 |
| --- | --- |
| MG-1 | 모든 마이그레이션은 `IF NOT EXISTS` 등으로 **재실행 안전**해야 한다(NFR-17) |
| MG-2 | 신규 DB는 `001.MapMarker/sql/`을 먼저 순차 실행한 뒤 `supabase/migrations/`를 적용한다 |
| MG-3 | 컬럼 추가는 **nullable 또는 기본값 동반**으로 하여 기존 행을 깨지 않는다 |
| MG-4 | 컬럼 부재로 기능이 실패할 수 있는 경우, 앱이 **마이그레이션 파일명을 안내**해야 한다(NFR-18, [CR-001](./CHANGE_REQUEST/CR-001.md)) |
| MG-5 | 파괴적 변경(DROP/RENAME) 전에는 엑셀 전체 백업(UC-17)을 선행한다 |

### 3.3 미적용 시 증상

| 누락 | 증상 |
| --- | --- |
| `20260722000000_add_detached_visible.sql` | "동 개별 표시" 토글 시 update 실패 |
| `20260723000000_add_group_key.sql` | **그룹 분리/합치기 전 기능 실패**, 상세 모달 그룹 조작 오류 |

## 4. 인덱스 · 조회 패턴

| 조회 | 패턴 | 권장 인덱스 |
| --- | --- | --- |
| 전체 마커 로드 | `select * from markers` (전량) | PK만으로 충분(사내 규모) |
| 부가 정보 조인 | `information.marker_id IN (...)` | `information(marker_id)` |
| ERP 상세 | `erp_details.marker_id = ?` | `erp_details(marker_id)` |
| 그룹 멤버 조회 | 앱에서 유효 키로 그룹핑 | `markers(group_key)` · `markers(jibun_address)` |
| SUB 조회 | `parent_marker_id = ?` | `markers(parent_marker_id)` |
| 축전지 스펙 | `battery_specs.marker_id IN (...)` | `battery_specs(marker_id)` |

> Ver_1.0은 **전량 로드 후 클라이언트 필터** 모델이다. 데이터가 수만 건 규모로 커지면 서버 사이드 필터·페이지네이션 도입을 재검토한다.

## 5. RLS 정책

| 대상 | 정책 |
| --- | --- |
| 읽기 | 익명(anon) 허용 — 비로그인 열람 요구사항(FR-45) |
| 쓰기 | 인증 사용자(authenticated)만 허용 |
| 축전지 테이블 | 2단계 마이그레이션에서 임시 해제 후 3단계에서 정책 재설정 |

정의 위치: `supabase/migrations/20260627000001_enable_rls_and_policies.sql`

> 클라이언트는 **anon 키만** 사용한다. service_role 키는 앱 어디에도 포함하지 않는다.

## 6. 백업 파일 구조 (엑셀)

UC-17 백업은 테이블별 시트로 구성된다.

| 시트 | 원본 테이블 | 비고 |
| --- | --- | --- |
| markers | `markers` | **`group_key` 포함**, `구분` 열 = `group_role` |
| information | `information` | 전 행 |
| erp_details | `erp_details` | 매핑 컬럼 + `raw` |
| battery_markers | `battery_markers` | 전 행 |
| battery_specs | `battery_specs` | 전 행 |

### 6.1 복원 규칙

| 규칙 | 내용 |
| --- | --- |
| RS-1 | `parent_marker_id`는 **저장/복원하지 않는다.** 유효 키 + `group_role`로 **재파생**한다 |
| RS-2 | `group_key` 열이 없는 **구 백업**은 null로 읽혀 번지 그룹으로 안전 폴백한다(FR-37) |
| RS-3 | 색상은 한글 색상명(오타 `에멜랄드` 포함)을 hex로 정규화한다 |
| RS-4 | 시트/헤더 불일치 시 복원을 **중단**하고 안내한다(부분 반영 금지) |
| RS-5 | 복원은 기존 데이터를 덮어쓴다. **실행 전 백업 선행**을 안내한다 |

### 6.2 왕복 무손실 검증 (릴리스 게이트)

```
백업 → (DB 초기화 또는 그대로) → 복원
검증: markers / information / erp_details / battery_markers / battery_specs 행 수 동일
      그룹 구조(대표·SUB·분리 그룹) 동일
      단일 대표 보장 유지
```

## 7. 데이터 정합성 체크 쿼리

운영 점검용. 결과가 **0행이어야 정상**이다.

```sql
-- ① 부모가 존재하지 않는 SUB (dangling parent)
select m.id, m.parent_marker_id
from markers m
left join markers p on p.id = m.parent_marker_id
where m.parent_marker_id is not null and p.id is null;

-- ② 부모와 group_key가 다른 SUB (그룹 경계 위반)
select m.id, m.group_key, p.group_key as parent_group_key
from markers m
join markers p on p.id = m.parent_marker_id
where coalesce(m.group_key,'') <> coalesce(p.group_key,'');

-- ③ 같은 group_key 안에 대표가 2개 이상
select group_key, count(*) as leaders
from markers
where parent_marker_id is null and group_key is not null
group by group_key
having count(*) > 1;

-- ④ 좌표 없는 마커 수 (0행이 아니어도 정상 — 집계 확인용)
select count(*) from markers where lat is null or lng is null;

-- ⑤ 고아 정보 행 (CASCADE가 정상이면 0행)
select count(*) from information i
left join markers m on m.id = i.marker_id
where i.marker_id is not null and m.id is null;
```

## 8. 변경 시 주의사항

| 변경 | 영향 | 필수 조치 |
| --- | --- | --- |
| `jibun_address` 정규화 규칙 변경 | **전 그룹 재판정** 발생 | 백업 선행 + `address-group` 테스트 갱신 |
| `group_key` 포맷 변경 | 기존 분리 상태 해석 불가 | 마이그레이션으로 일괄 변환 |
| ERP 매핑 컬럼 추가/삭제 | 백업 엑셀 헤더 변동 | `headers` 매핑 + 복원 파서 동시 수정 |
| 컬럼 rename | 백업 파일 호환성 파괴 | 구 백업 폴백 규칙 추가 필수 |
| 기본값(600/12) 변경 | 기존 표시 값 변동 | PRD FR-30 개정 동반 |
