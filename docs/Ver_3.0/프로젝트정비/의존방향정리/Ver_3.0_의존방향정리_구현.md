# 의존 방향 정리 (구현)

구현일 2026-11-14 · 설계: [Ver_3.0_의존방향정리_설계.md](Ver_3.0_의존방향정리_설계.md) · 계획: [Ver_3.0_의존방향정리_구현계획.md](Ver_3.0_의존방향정리_구현계획.md) · 커밋 `971366b`

공용 인증·권한 4개 파일을 `map-marker`에서 `src/lib/auth/`로 옮기고, `src/lib`이 `src/features`를 import하지 못하게 하는 가드 테스트를 추가했다. 셸 내비 상태(`activeNav`·`mapSegment`) 분리는 설계 §4에 따라 하지 않았다. 후속은 [의존방향정리2차](../의존방향정리2차/Ver_3.0_의존방향정리2차_설계.md)에서 다룬다.

## 직접 하실 일

1. **로그인·로그아웃과 관리자 전용 메뉴를 확인한다.** 모든 화면이 이 인증 훅을 쓴다. 로그인 창, 로그아웃, 계정설정, 그룹관리, 일정관리(관리자 수정) 중 몇 곳을 열어 본다.
2. 이상이 없으면 이 작업은 끝이다. 문제가 있으면 `971366b`를 되돌리지 않고 알려 주시면 고친다.

## 한 일

| 구분 | 내용 |
|---|---|
| 옮긴 파일 | `auth-provider.tsx`, `use-auth-session.ts`, `use-is-admin.ts`, `admin.ts`, `admin.test.ts` → `src/lib/auth/` (내용 그대로, import 경로만 바뀜) |
| 바뀐 소비자 | `src/`·`e2e/`의 43개 파일의 import 경로 |
| 삭제 | `map-marker`의 원본 5개. 임시 re-export는 남기지 않았다 |
| 새 테스트 | `src/lib/arch-guard.test.ts` (2개): `src/lib`이 `@/features/`를 import하지 않는다 / 허용 예외 파일이 실제로 존재한다 |
| 허용 예외 | `src/lib/api/kakao-route-upstream.ts` 1건(`@/features/route/types/route` 타입 import). 타입을 `src/types/`로 옮기면 지운다 |

구현은 agy가 하고 Claude가 diff를 검토했다.

## 검토에서 고친 것

- agy가 계획에 없던 규칙 `no-map-marker-store-to-shell`과, 하지 않기로 한 Task 3을 가리키는 허용 예외를 가드에 넣었다. 둘 다 제거했다.
- 계획에 `kakao-route-upstream.ts` 예외가 빠져 있었다(가드가 처음부터 통과해야 하는데 위반 1건이 이미 있었다). 계획과 설계에 반영했다.
- 옮긴 5개 파일을 줄바꿈을 무시하고 원본과 비교해, import 경로 줄 외에 차이가 없음을 확인했다.

## 검증

| 명령 | 결과 |
|---|---|
| `npx tsc --noEmit` | 오류 0건 |
| `npx eslint . --max-warnings=0` | 오류 0건 |
| `npm test` | 151개 파일 통과, 1개 스킵 / 1,776개 통과, 3개 스킵 |
| 옛 경로 `grep` (`src/`·`e2e/`) | 0건 |
| `npx next build`(임시 distDir, 설정 원복) | 성공. 홈 301 kB, `/gpsmap` 207 kB(이동 전과 같음) |

## 효과와 한계

- 다른 피처가 `map-marker`를 import하는 건수는 테스트를 제외하고 96건이다. 설계의 기준값 128건과는 집계 방식이 달라 정확한 감소량은 비교하지 않았다.
- `map-marker`가 다른 피처를 import하는 역참조(`site-lists` 8, `worksite-weather` 6, `shell` 5, `route` 5, `gpsmap` 5, `group-admin` 3, `cctv` 1)는 그대로다.
- 가드는 `src/lib`만 지킨다. 피처 사이의 방향은 아직 막지 않는다. 후속 작업에서 다룬다.
