# 작업 명세서 — 기존 파란색(#2563eb) 마커를 에메랄드(#10b981)로 일괄 변경하는 Supabase 마이그레이션 작성

## 배경
0007_Process_Management(별도 저장소)의 `register-map-marker` API가 새 마커를 등록할 때
`color: '#2563eb'`(파란색)로 하드코딩해서 Supabase `markers` 테이블에 써 왔다. 이 저장소의
기본 마커색(`DEFAULT_MARKER_COLOR`, `src/features/map-marker/constants/facility-teams.ts:12`)은
이미 에메랄드(`#10b981`)이므로, 이미 등록된 파란색 마커 데이터만 에메랄드로 맞추면 된다.
소스 쪽 수정(0007_Process_Management)은 별도 저장소라 이 작업 범위에 포함하지 않는다.

## 요구사항
- `supabase/migrations/` 아래에 새 마이그레이션 파일을 만든다.
  - 파일명: `20260826000000_fix_blue_marker_default_color.sql`
    (기존 파일 중 가장 최신인 `20260817165000_allow_anon_map_marker_registration.sql`보다 뒤 타임스탬프)
  - 내용: `public.markers` 테이블에서 `color` 컬럼 값이 정확히 `'#2563eb'`인 모든 행을
    `'#10b981'`로 갱신하는 `UPDATE` 문 하나.
    ```sql
    UPDATE public.markers
    SET color = '#10b981'
    WHERE color = '#2563eb';
    ```
  - 기존 마이그레이션 파일들(`supabase/migrations/*.sql`)의 주석 스타일(파일 상단에 목적을
    한글로 설명하는 구분선 주석)을 참고해 짧은 설명 주석을 상단에 남긴다.
- 이 마이그레이션은 **로컬에서 실행하지 않는다** — 파일만 만들어 두면 사용자가 Supabase
  대시보드에서 직접 적용한다(`AGENTS.md`의 "Supabase는 로컬 실행 금지" 규칙).
- 애플리케이션 코드(`src/**`)는 건드리지 않는다 — `DEFAULT_MARKER_COLOR`는 이미 에메랄드라
  변경 불필요.

## 제약
- 이 저장소의 `AGENTS.md`/`CLAUDE.md` 규칙을 따를 것.
- 순수 데이터 마이그레이션 SQL 파일 1개 생성 외에 다른 파일은 만들거나 고치지 않는다.

## 참고할 기존 코드/패턴
- 기존 마이그레이션 예시: `supabase/migrations/20260817165000_allow_anon_map_marker_registration.sql`
- 색상 상수: `src/features/map-marker/constants/facility-teams.ts`

## 하지 말 것
- `src/` 아래 애플리케이션 코드 수정.
- 마이그레이션을 실제로 Supabase에 적용(실행)하는 행위 — 파일만 생성.
- `id LIKE 'erp_%'` 등으로 범위를 좁히지 말 것 — 사용자가 "color가 #2563eb인 모든 마커"를
  명시적으로 확인했다.

## 완료 기준
- [ ] `supabase/migrations/20260826000000_fix_blue_marker_default_color.sql` 파일이 생성되고,
      `WHERE color = '#2563eb'` 조건의 `UPDATE public.markers SET color = '#10b981'` 문을 포함한다.
- [ ] 다른 파일은 변경되지 않는다.
