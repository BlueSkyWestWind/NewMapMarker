# Ver 3.0 기상청 API 호출 관리 구현 계획

근거: `Ver_3.0_계획.md` 17장, `Ver_3.0_기상청호출관리_설계.md`.  
작성일: 2026-11-09 · 대상: `features/worksite-weather`, `features/accounts`, 관리자 API

---

## 1. 개요 및 원칙

기상청 API(공공데이터포털 / API 허브)의 일일 호출 한도 초과를 방지하고 사용량을 가시화하기 위해 **1단계(실시간 호출 집계 및 관리자 모니터링)**와 **2단계(1시간 주기 사전 수집 및 DB 캐싱)**를 단계적으로 구현한다.

### 핵심 원칙
- **날씨 응답 무결성:** 호출 기록이나 DB 저장 실패가 실제 날씨 조회 응답을 지연시키거나 에러를 발생시키지 않는다 (`try/catch`로 삼키고 `waitUntil` 또는 fire-and-forget).
- **마이그레이션 적용 분리:** Supabase 마이그레이션은 SQL 파일만 생성하며 실제 DB 반영은 사용자가 수행한다. 테이블이 없어도 앱은 정상 동작한다(`available: false` 폴백).
- **엄격한 관리자 권한:** 사용량 통계 조회는 `authenticateAdminRequest`를 통해 관리자(`is_app_admin()`)에게만 허용된다.
- **UI 표 규칙 준수:** 셀 줄바꿈 금지(`whitespace-nowrap`), 가로 스크롤 금지, 세로 스크롤 허용(`table-no-wrap.mdc`).
- **번들 크기 제약:** 관리자 호출 현황 다이얼로그는 `next/dynamic`으로 지연 로딩하여 홈 First Load JS 295 kB 기준선을 엄수한다.

---

## 2. 1단계: 실시간 호출 집계 (상세 계획)

### Task 1.1: DB 마이그레이션 작성
- **목표:** 기상청 호출 집계 테이블 `kma_api_usage` 및 증가 RPC 함수 `record_kma_call` 생성.
- **파일:** `supabase/migrations/20261116000100_kma_api_usage.sql`
- **주요 내용:**
  - 테이블: `hour_kst`(PK, timestamptz), `provider`(PK, text), `operation`(PK, text), `source`(PK, text), `calls`(int), `errors`(int), `last_error`(text), `updated_at`(timestamptz).
  - 함수: `public.record_kma_call(p_hour, p_provider, p_operation, p_source, p_error)` (`INSERT ... ON CONFLICT DO UPDATE SET calls = calls + 1 ...`).
  - 권한: `REVOKE ALL FROM public, anon, authenticated` (서비스 롤 키만 실행 가능).
  - RLS: `is_app_admin()`인 경우만 SELECT 허용.

### Task 1.2: 순수 계산 유틸리티 구현 및 단위 테스트
- **목표:** KST 정시 절삭, API 오퍼레이션 식별, 일별/시간대별 통계 가공 순수 함수 작성.
- **파일:**
  - `src/features/worksite-weather/lib/kma-usage-utils.ts`
  - `src/features/worksite-weather/lib/kma-usage-utils.test.ts`
- **검증 항목:**
  - 임의의 UTC/KST 시각을 KST 기준 정시(`YYYY-MM-DDTHH:00:00+09:00`)로 정확히 내림 처리.
  - 요청 URL이나 함수 파라미터로부터 올바른 `operation` 문자열(`getVilageFcst`, `getUltraSrtNcst` 등) 추출.
  - 24시간 시간대별 빈 슬롯(0건) 채우기 및 최근 7일 일별 합산 로직.

### Task 1.3: 호출 기록 레이어 구현
- **목표:** 실제 기상청 호출 완료 후 DB 증가 함수를 비동기로 호출하는 클라이언트 헬퍼 작성.
- **파일:** `src/features/worksite-weather/lib/kma-usage.ts`
- **구현 세부:**
  - `recordKmaCall({ provider, operation, source, error? })`: Edge / Node 환경 안전 처리.
  - Cloudflare Workers 환경에서는 `waitUntil` 활용, 로컬 Node에서는 Promise 분리(비동기 발사).
  - 에러 발생 시 `console.warn` 기록 후 완전히 삼킴(예외 전파 금지).

### Task 1.4: `kma-client.ts` 호출 지점 연동
- **목표:** 실제 외부 네트워크 호출이 일어나는 `fetchJson` 및 `fetchAlertsFromHub`의 완료 지점에 집계 연동.
- **파일:**
  - `src/features/worksite-weather/lib/kma-client.ts`
- **구현 세부:**
  - 캐시 히트 경로에서는 집계하지 않고, 실제 fetch 수행 후 `finally` 블록에서 `recordKmaCall` 호출.
  - 실패 응답(`!res.ok` 또는 파싱 실패) 시 에러 코드 전달하여 `errors` 카운트 증가.
  - 함수 선택 인자에 `{ source?: "user" | "prefetch" }` 추가 (기본값 `"user"`).

### Task 1.5: 관리자 API 라우트 구현
- **목표:** 관리자 화면에서 오늘의 시간대별 호출량 및 최근 7일 사용량을 조회하는 엔드포인트 제공.
- **파일:**
  - `src/app/api/admin/kma-usage/route.ts`
- **구현 세부:**
  - `authenticateAdminRequest`를 통한 관리자 세션 검증.
  - Supabase `kma_api_usage`에서 오늘 00:00(KST) 이후 및 최근 7일 레코드 조회.
  - 테이블 미존재 시 `available: false` 반환.
  - 일일 한도(`KMA_DAILY_LIMIT = 10000`) 및 사용률(%) 계산 후 반환.

### Task 1.6: 관리자 UI 다이얼로그 구현
- **목표:** 계정설정 화면에서 기상청 호출 통계를 직관적으로 확인할 수 있는 다이얼로그 제공.
- **파일:**
  - `src/features/worksite-weather/constants/kma-usage.ts`: 일일 기본 한도 상수 등.
  - `src/features/worksite-weather/components/kma-usage-dialog.tsx`: 다이얼로그 컴포넌트.
  - `src/features/accounts/components/accounts-panel.tsx`: 버튼 배치 및 `dynamic` 연결.
- **UI 구성:**
  - 상단: 오늘 총 호출 수 / 일일 한도 / 사용률 프로그레스 바 (80% 이상 시 경고 배지).
  - 중단: 오늘 시간대별(00~23시) 호출 표 (`user` / `prefetch` 구분).
  - 하단: 최근 7일 일별 호출 합계 표.
  - 안내 문구: "서버에서 실제 집계된 수치이며, 동일 인증키를 타 시스템에서 사용할 경우 실제 기상청 사용량과 차이가 있을 수 있습니다."

### Task 1.7: 1단계 검증
- **명령어:**
  - `npm.cmd test`
  - `npx tsc --noEmit`
  - `npx eslint . --max-warnings=0`
  - `npx next build` (First Load JS 295 kB 이하 유지 확인)

---

## 3. 2단계: 1시간 사전 수집 및 DB 캐싱 (로드맵)

1단계 집계 데이터를 모니터링하여 실제 호출량과 피크 시간대를 파악한 뒤 순차 적용한다.

### Task 2.1: 예보 캐시 테이블 마이그레이션
- **파일:** `supabase/migrations/20261117000000_kma_forecast_cache.sql`
- **내용:** `(nx, ny, kind, base_date, base_time, payload jsonb, fetched_at)` 캐시 테이블 생성.

### Task 2.2: 대상 격자 추출 유틸리티
- **파일:** `src/features/worksite-weather/lib/kma-grid-prefetch.ts`
- **내용:** `markers` 테이블에서 고유 `(nx, ny)` 격자 목록 추출 (중복 격자 단일화).

### Task 2.3: 내부 크론용 API 라우트
- **파일:** `src/app/api/internal/kma-prefetch/route.ts`
- **내용:** 비밀 토큰(`CRON_SECRET`) 인증, 순차적 격자 예보 수집 (`source: "prefetch"`로 집계).

### Task 2.4: 날씨 조회 API의 DB 캐시 우선 처리
- **파일:** `src/app/api/worksite-weather/route.ts`
- **내용:** DB 캐시 확인 → 최신 유효 데이터 존재 시 즉시 반환 → 부재 시 기상청 실시간 폴백 호출 및 DB 캐시 저장.

### Task 2.5: Supabase `pg_cron` + `pg_net` 스케줄링 가이드
- 매시 정시 실행 SQL 스크립트 작성 및 문서화.

---

## 4. 진행 현황 체크리스트

- [ ] Task 1.1: DB 마이그레이션 SQL 작성 (`20261116000100_kma_api_usage.sql`)
- [ ] Task 1.2: 순수 계산 유틸리티 및 단위 테스트 작성
- [ ] Task 1.3: 호출 기록 헬퍼 (`kma-usage.ts`) 작성
- [ ] Task 1.4: `kma-client.ts`에 호출 집계 연동
- [ ] Task 1.5: 관리자 API `/api/admin/kma-usage` 구현
- [ ] Task 1.6: 관리자 UI `KmaUsageDialog` 및 `accounts-panel.tsx` 연동
- [ ] Task 1.7: 1단계 테스트 및 번들 크기 검증
- [ ] Task 2.1 ~ 2.5: 2단계 사전 수집 설계 구체화 및 구현
