# conventions

## 언어·표기

- 식별자 **영어**, 주석·문서·커밋 메시지 **한글**. 주석은 why만(무엇을 하는지는 코드가 말한다).
- 커밋 접두사: `feat:` `fix:` `refactor:` `docs:` `test:` `chore:`.
- 파일 kebab-case, 타입 PascalCase, 함수 camelCase, 상수 UPPER_SNAKE. TS `any` 금지.
- 생성 후 UTF-8 기준 한글 깨짐 확인.

## 디렉터리

`src/features/{feature}/{components,hooks,lib,constants,types}`.
`components/`는 `lib/`를 쓰고, `lib/`는 `components/`·`hooks/`를 **쓰지 않는다**(React 비의존 유지 → 테스트 가능).

## React

- 모든 컴포넌트 `"use client"`. `page.tsx`의 `params`는 Promise로 받는다.
- 파생 가능한 값을 `useState`로 두지 않는다. 사용자의 선택을 `useEffect`로 덮어쓰지 않는다.
- 모달 인스턴스는 한 곳에서만 소유하고 하위는 콜백을 받는다.
- 유니온 분기는 `ts-pattern` + `exhaustive()`.

## 표 UI (프로젝트 필수)

셀 **줄바꿈 금지**, **가로 스크롤 금지**(표 상자만 `overflow-x-auto` 허용), 세로 스크롤 허용.
폭이 모자라면 열을 합치거나 박스 폭을 키운다.

## 외부 작업 경계 (사용자가 직접 실행)

- shadcn 컴포넌트 추가: 설치 명령만 알려 준다 — `npx shadcn@latest add <name>`.
- Supabase: **로컬 실행 금지**. 스키마 변경은 `supabase/migrations/*.sql`로 만들어 두면 사용자가 적용.
- 커밋·푸시는 요청받았을 때만.

## 기존 화면 이식

**원본이 사양이다.** 토글·링크·자동 등록 같은 "개선"을 얹지 않는다 —
Ver 2.0 변환기 이식에서 덧붙인 것들이 전부 재작업이 됐다.
