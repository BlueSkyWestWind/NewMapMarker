# Ver 3.0 계정관리 구현

근거: `Ver_3.0_계획.md` 16장. 상태: **설계 완료, 구현 준비** (2026-11-08).

## 1. 목적

사이드바에 **관리자 전용 「계정설정」** 메뉴를 신설하여, 웹 화면에서 사용자 계정의 목록 조회, 관리자 권한 부여/회수, 신규 계정 생성, 계정 삭제를 안전하게 수행할 수 있도록 한다.

## 2. 확정한 결정 (2026-11-08)

| 항목 | 결정 |
|---|---|
| 메뉴 노출 | `adminOnly: true` — 로그인한 관리자에게만 사이드바에 메뉴 노출 |
| 아키텍처 | **Next.js Route Handler (`/api/admin/users`)** + Supabase Admin SDK (`auth.admin`) |
| 권한 저장소 | 기존 `public.app_admins` 테이블 (`user_id REFERENCES auth.users(id) ON DELETE CASCADE`) 재사용 |
| 보안 파이프라인 | 클라이언트 JWT 토큰 전달 -> 서버에서 토큰 검증 -> `is_app_admin` 확인 -> Service Role Key로 조작 |
| 본인 계정 보호 | 로그인 중인 본인 계정의 관리자 권한 해제 및 본인 계정 삭제 불가 |
| UI 표 규칙 | 셀 줄바꿈 금지(`whitespace-nowrap`), 가로 스크롤 금지, 세로 스크롤 허용 (프로젝트 공통 규칙) |

## 3. 사이드바 및 네비게이션 연동

- **메뉴 키:** `accounts`
- **라벨:** `계정설정`
- **아이콘:** `UserCog` (`lucide-react`)
- **속성:** `auth: true`, `enabled: true`, `adminOnly: true`
- **위치:** `src/features/shell/types/nav.ts`의 `NAV_ITEMS` 배열에서 `groups`(그룹관리) 바로 다음 순서로 배치.
- 관리자가 아닌 사용자에게는 사이드바 트리 및 레일에서 완전히 숨김(`visibleNavItems`가 자동 필터링).

## 4. 화면 구성

### 4.1 계정관리 메인 화면 (`src/features/accounts/components/accounts-panel.tsx`)
- 전체 화면 또는 넓은 뷰 패널을 사용하여 테이블이 여유 있게 보이도록 구성.
- **상단 툴바:**
  - 제목: `계정설정` 및 총 계정 수(`총 N명`)
  - 우측 액션: `[새로고침]`, `[+ 계정 추가]` 버튼
- **계정 목록 테이블:**
  - 열 구성:
    1. `번호`: 1부터 시작하는 순번
    2. `이메일`: 계정 이메일 주소 (본인인 경우 `(나)` 배지 표시)
    3. `가입일`: `yyyy-mm-dd HH:mm`
    4. `최근 로그인`: `yyyy-mm-dd HH:mm` (미로그인 계정은 `-`)
    5. `권한`: 관리자 토글 스위치 (Switch 컴포넌트)
       - 스위치 켜짐: `관리자` (배지 또는 라벨)
       - 스위치 꺼짐: `일반 사용자`
       - 본인 계정인 경우 토글 비활성화(disabled) 및 툴팁("본인 계정의 권한은 해제할 수 없습니다")
    6. `관리`: 삭제 버튼 (`Trash2` 아이콘)
       - 본인 계정인 경우 삭제 버튼 비활성화(disabled)
  - 테이블 스타일: `whitespace-nowrap`, 박스/패널 폭을 충분히 확보하여 가로 스크롤 방지.

### 4.2 신규 계정 추가 모달 (`src/features/accounts/components/account-create-dialog.tsx`)
- 입력 폼:
  - `이메일`: 이메일 형식 검증 (Zod 스키마)
  - `비밀번호`: 최소 6자리 이상 (Supabase 기본 요건)
  - `비밀번호 확인`: 비밀번호 일치 확인
  - `관리자 권한 부여`: 스위치 또는 체크박스 (기본값: false)
- 생성 동작:
  - 이메일 인증 절차를 건너뛰고 즉시 로그인할 수 있도록 `email_confirm: true`로 생성.
  - 생성 완료 후 목록 자동 갱신 및 토스트 알림("계정이 생성되었습니다.").

### 4.3 계정 삭제 확인 모달 (`src/features/accounts/components/account-delete-dialog.tsx`)
- 실수 방지를 위한 안전 확인 대화상자:
  - "정말로 `[이메일]` 계정을 삭제하시겠습니까?"
  - 경고 문구: "계정 삭제 시 연관된 모든 관리자 권한도 함께 삭제되며, 되돌릴 수 없습니다."
  - 확인 버튼: `[삭제]` (파괴적 액션 스타일 `destructive`)

## 5. 백엔드 API 사양 (`/api/admin/users`)

서버 라우트는 Next.js App Router의 Route Handler로 구현한다.
파일 위치: `src/app/api/admin/users/route.ts` 및 `src/app/api/admin/users/[id]/route.ts`

### 5.1 공통 인증 미들웨어 로직 (`src/features/accounts/server/admin-auth.ts`)
```ts
// 1. Authorization: Bearer <token> 헤더 추출
// 2. createClient(SUPABASE_URL, SUPABASE_ANON_KEY)로 supabase.auth.getUser(token) 검증
// 3. fetchIsAppAdmin(supabase, user.id)로 관리자 여부 확인
// 4. 비관리자 또는 미인증 시 401 Unauthorized / 403 Forbidden 반환
// 5. 검증 완료 시 createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) 인스턴스 반환
```

### 5.2 API 엔드포인트 목록

1. **`GET /api/admin/users`**
   - 계정 목록 조회
   - 동작: `auth.admin.listUsers()` 호출 + `public.app_admins` 테이블 조회 결과를 병합.
   - 응답:
     ```json
     {
       "users": [
         {
           "id": "uuid",
           "email": "user@example.com",
           "createdAt": "2026-11-01T...",
           "lastSignInAt": "2026-11-07T...",
           "isAdmin": true
         }
       ]
     }
     ```

2. **`POST /api/admin/users`**
   - 신규 계정 생성
   - 본문: `{ "email": "...", "password": "...", "isAdmin": boolean }`
   - 동작:
     1. `auth.admin.createUser({ email, password, email_confirm: true })`
     2. `isAdmin === true`인 경우 `public.app_admins`에 `{ user_id }` 삽입
   - 응답: `201 Created`

3. **`PATCH /api/admin/users/[id]`**
   - 관리자 권한 변경
   - 본문: `{ "isAdmin": boolean }`
   - 동작:
     - 대상 ID가 요청자 본인(`reqUser.id === id`)이고 `isAdmin === false`인 경우 `400 Bad Request` ("본인 관리자 권한 해제 불가")
     - `isAdmin === true`: `public.app_admins`에 INSERT (ON CONFLICT DO NOTHING)
     - `isAdmin === false`: `public.app_admins`에서 DELETE WHERE `user_id = id`
   - 응답: `200 OK`

4. **`DELETE /api/admin/users/[id]`**
   - 계정 삭제
   - 동작:
     - 대상 ID가 요청자 본인인 경우 `400 Bad Request` ("본인 계정 삭제 불가")
     - `auth.admin.deleteUser(id)` 실행 (`app_admins`는 외래키 CASCADE로 자동 제거)
   - 응답: `200 OK`

## 6. 환경 변수 요건

- **`SUPABASE_SERVICE_ROLE_KEY`**:
  - Supabase 대시보드 -> Project Settings -> API -> `service_role` (secret) 키.
  - `.env.local` 및 Cloudflare 배포 환경(Wrangler secret / Pages 환경변수)에 등록 필요.
  - 이 키는 반드시 서버 라우트(`src/app/api/...`)에서만 참조해야 하며, 절대 클라이언트 번들(`NEXT_PUBLIC_*`)로 노출해서는 안 된다.

## 7. 검증 및 테스트 계획

- **단위 테스트:**
  - `nav.test.ts` / `nav-model.test.ts`: `accounts` 메뉴의 `adminOnly` 속성 및 가시성 검증
  - `admin-auth.test.ts`: 관리자 토큰 검증, 본인 권한 해제 방지 로직 테스트
  - `account-row.test.ts`: 줄바꿈 방지 및 버튼 비활성화 규칙 테스트
- **통합 검증:**
  - `npx tsc --noEmit`
  - `npx eslint . --max-warnings=0`
  - `npm test`
  - `npx next build` (First Load JS 295 kB 이하 유지 확인)
