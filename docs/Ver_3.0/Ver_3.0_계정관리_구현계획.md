# Ver 3.0 계정관리 구현 계획

근거: `Ver_3.0_계획.md` 16장, `Ver_3.0_계정관리_구현.md`.  
상태: **계획 수립 완료, 실행 대기** (2026-11-08).

## 1. 개요 및 원칙

관리자 전용 계정관리 기능을 구현한다. TDD와 점진적 빌드 검증을 준수하며, 서버 라우트와 클라이언트 UI를 계층별로 분리하여 개발한다.

### 핵심 원칙
- **철저한 권한 격리:** 일반 사용자는 API 호출 및 UI 접근 모두 차단 (`adminOnly: true`).
- **클라이언트 보안:** `SUPABASE_SERVICE_ROLE_KEY`는 서버 라우트에서만 사용하며 브라우저에 노출 금지.
- **UI 표 규칙:** 줄바꿈 금지(`whitespace-nowrap`), 가로 스크롤 금지, 세로 스크롤 허용.
- **번들 크기 제약:** First Load JS 295 kB 이하 유지 (`next/dynamic` 필요 시 적용).

---

## 2. 작업 목록 및 단계별 계획

### Task 1: 사이드바 네비게이션 등록 및 권한 모델 갱신
- **목표:** 사이드바에 `계정설정`(`accounts`, 아이콘 `UserCog`)을 `adminOnly: true`로 추가.
- **파일:**
  - `src/features/shell/types/nav.ts` (`NAV_ITEMS`에 `accounts` 추가)
  - `src/features/shell/types/nav.test.ts` (가시성 및 `adminOnly` 테스트 추가)
  - `src/features/shell/lib/nav-model.ts` (패널/세그먼트 분기 확인)
  - `src/features/shell/lib/nav-model.test.ts`
- **검증:** `npm test src/features/shell/` 통과.

### Task 2: 서버 API 라우트 및 관리자 검증 유틸리티 구현
- **목표:** Next.js Route Handler로 `/api/admin/users` 및 `[id]` 엔드포인트 구현.
- **파일:**
  - `src/features/accounts/server/admin-auth.ts`: 호출자 토큰 검증 및 `is_app_admin` 확인 유틸리티.
  - `src/features/accounts/server/admin-auth.test.ts`: 본인 권한 해제 방지 및 권한 유효성 검사 단위 테스트.
  - `src/app/api/admin/users/route.ts`: GET(목록), POST(계정 생성).
  - `src/app/api/admin/users/[id]/route.ts`: PATCH(권한 토글), DELETE(계정 삭제).
- **검증:** 테스트 코드 작성 및 API 엔드포인트 검증.

### Task 3: 클라이언트 API 및 TanStack Query 훅 구현
- **목표:** 계정 목록 조회, 생성, 삭제, 권한 토글 API 호출 함수 및 React Query 훅 작성.
- **파일:**
  - `src/features/accounts/types.ts`: 계정 데이터 타입 정의 (`AdminUser`, `CreateAccountInput` 등).
  - `src/features/accounts/api.ts`: `fetchAdminUsers`, `createAdminUser`, `updateAdminUserRole`, `deleteAdminUser`.
  - `src/features/accounts/hooks/use-admin-users.ts`: TanStack Query 기반 훅 (`useQuery`, `useMutation`).
  - `src/features/accounts/lib/account-helpers.ts` 및 단위 테스트: 날짜 포맷팅, 본인 판별 헬퍼.
- **검증:** `npm test src/features/accounts/` 통과.

### Task 4: 계정 관리 UI 컴포넌트 구현
- **목표:** 사용자 친화적이고 직관적인 계정 관리 패널 및 모달 구현.
- **파일:**
  - `src/features/accounts/components/account-table-row.tsx`: 줄바꿈 방지 표 행 컴포넌트 (본인 뱃지, 토글 스위치, 삭제 버튼).
  - `src/features/accounts/components/account-create-dialog.tsx`: 신규 계정 등록 모달 (이메일/비밀번호/관리자 체크).
  - `src/features/accounts/components/account-delete-dialog.tsx`: 계정 삭제 확인 모달.
  - `src/features/accounts/components/accounts-panel.tsx`: 툴바 + 목록 표 메인 패널.
- **검증:** 컴포넌트 렌더링 및 UI 테스트.

### Task 5: AppShell 및 화면 전환 연동
- **목표:** 사이드바에서 `accounts` 선택 시 `AccountsPanel` 렌더링.
- **파일:**
  - `src/features/shell/components/app-shell.tsx`: `activeNav === "accounts"` 분기 연결.
  - `src/features/shell/components/panel-body.tsx`: 패널 분기 연결.
- **검증:** 관리자 로그인 시 사이드바에서 메뉴 클릭 시 정상 진입 확인.

### Task 6: 전체 검증 및 번들 크기 확인
- **목표:** 모든 회귀 테스트 및 빌드 검증.
- **실행 명령:**
  - `npx tsc --noEmit`
  - `npx eslint . --max-warnings=0`
  - `npm test`
  - `npx next build` (First Load JS 295 kB 이하 유지 확인)

---

## 3. 환경 변수 체크리스트 (사용자 안내)

- [ ] `.env.local`에 `SUPABASE_SERVICE_ROLE_KEY` 추가
- [ ] Cloudflare Pages / Workers 환경 변수에 `SUPABASE_SERVICE_ROLE_KEY` 추가
