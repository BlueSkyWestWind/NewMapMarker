# 접속기록 전용 테이블 (구현)

구현일 2026-11-13 · 설계: [Ver_3.0_접속기록_설계.md](Ver_3.0_접속기록_설계.md) · 계획: [Ver_3.0_접속기록_구현계획.md](Ver_3.0_접속기록_구현계획.md)

`auth.audit_log_entries`가 0건이라 계정설정의 접속 기록 창이 비어 있었고, 임시로 `auth.sessions`를 합쳐 보여 줬으나 로그아웃하면 세션 행이 지워져 기록이 사라지는 한계가 있었다. `auth.sessions` 트리거가 로그인·로그아웃을 `public.login_history`에 영구 기록하고, 접속 기록 창이 이 테이블만 직접 읽도록 바꿨다.

## 직접 하실 일 (사용자 확인 대기)

1. **화면에서 접속 기록 창 확인**: 계정설정에서 계정의 접속 기록 창을 열어 백필된 행과 IP·브라우저 표시가 정상으로 보이는지 확인한다(**사용자 확인 대기**).
2. **로그인·로그아웃 왕복 확인**: 테스트 계정으로 로그인한 뒤 로그아웃해 `login`·`logout` 두 행이 모두 남아 있는지 확인한다(**사용자 확인 대기**).

## 만든 것 · 고친 것

| 영역 | 파일 | 변경 |
|---|---|---|
| DB 마이그레이션 | `supabase/migrations/20261119000000_login_history.sql` | 테이블 `public.login_history`(id, occurred_at, user_id, email, action `login\|logout`, ip, user_agent, session_id), 인덱스 2개, RLS(관리자 SELECT만), 트리거 `on_auth_session_login_history`, 기존 세션 백필, pg_cron `login-history-cleanup` |
| 타입·변환 | `src/features/accounts/types.ts` | `LoginEvent`에 `userAgent?` 추가 |
| | `src/features/accounts/lib/login-history.ts` | `toLoginEvents` 추가, 임시 `sessionsToLoginEvents`·`mergeLoginEvents` 제거 |
| API | `src/app/api/admin/users/[id]/history/route.ts` | `public.login_history`를 서비스 키로 직접 조회. 테이블이 없으면 `available: false` |
| 화면 | `src/features/accounts/components/account-history-dialog.tsx` | 안내 문구 정리, 전체 이력 표의 IP 칸에 브라우저(`describeUserAgent`)를 보조 글자로 표시, 표 아래에 "로그아웃 행의 IP·브라우저는 로그인 때 기록된 값입니다." 안내 |
| 테스트 | `src/features/accounts/lib/login-history-migration.test.ts` | SQL 정적 검사 8건 |
| | `src/features/accounts/lib/login-history.test.ts` | `toLoginEvents` 단위 테스트 4건 포함 |

## 구현 내용

- **트리거 기반 영구 기록**: `auth.sessions`의 `INSERT`는 `login`, `DELETE`는 `logout`으로 `public.login_history`에 기록한다. 트리거 함수는 `SECURITY DEFINER`, `SET search_path = ''`로 두고 예외를 삼켜 기록 실패가 로그인·로그아웃을 막지 않는다. `user_id`에 외래키를 걸지 않고 `email` 스냅샷을 함께 저장해 계정이 삭제돼도 기록을 유지한다.
- **이관·보관**: 마이그레이션에서 기존 `auth.sessions` 행을 `login`으로 멱등 백필(`NOT EXISTS`)했다. `pg_cron` 작업 `login-history-cleanup`이 매일 09:05 UTC에 1년 지난 행을 지운다.
- **조회 단순화**: API가 RPC 두 개를 불러 `mergeLoginEvents`로 합치던 임시 경로를 걷어 내고 서비스 키로 `public.login_history`만 직접 읽는다.

## 검증 (2026-11-13)

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | 오류 0 |
| `npx eslint . --max-warnings=0` | 오류 0 |
| `npm test` | 1735 통과 · 3 건너뜀(이전 1723). `login-history-migration.test.ts` 8건, `login-history.test.ts` `toLoginEvents` 4건 포함 |
| 운영 DB 확인(마이그레이션 적용 후) | RLS 정책 1개, 트리거 1개, 백필 로그인 38건(IP·브라우저 모두 있음), cron 1개 |
| 화면·왕복 확인 | **사용자 확인 대기** |

## 알려진 한계

- `logout` 행의 IP·브라우저는 세션 생성 때 기록된 값이다(로그아웃 요청 시점의 값이 아니다).
- 세션 만료·강제 종료로 `auth.sessions` 행이 지워져도 `DELETE` 트리거가 돌아 `logout`으로 기록된다(자발적 로그아웃과 구분 불가).
- 로그인 실패(비밀번호 오류 등)는 기록하지 않는다.
- 일반 사용자의 본인 접속 기록 열람 화면은 없다.
