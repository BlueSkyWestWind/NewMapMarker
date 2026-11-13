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

## 문서(docs) 구조 (2026-11-14 정리)

- 현재 버전 `docs/Ver_3.0/`은 **기능별 하위 폴더**(`계정관리/`·`시설일정/`·`위치/` 등)에 설계·구현계획·구현을 함께 둔다. 루트에는 `Ver_3.0_계획.md`·`Ver_3.0_코드리뷰_개선계획.md`만 둔다.
- **기능·변경마다 3종 필수**: `Ver_3.0_<기능>_설계.md` → `_구현계획.md` → (코드) → `_구현.md`. 견본 `docs/Ver_3.0/스타일정리/`. 작은 수정은 기존 `구현.md`에 덧붙인다. 새 기능은 폴더를 만들고 `docs/README.md` 표에 한 줄 추가.
- 스킬 기본 경로(`docs/superpowers/specs|plans`) 금지 — 스킬 호출 시 위 경로·이름을 직접 지정한다(스킬 기본값이 프로젝트 규칙보다 우선하지 않는다).
- 작업 시작 전 `AGENTS.md`·Serena `core`/`conventions`/`pitfalls`·`MEMORY.md`를 먼저 읽는다. 규칙과 다르게 하려면 먼저 사용자에게 알린다.
- **문서 목차의 단일 원본은 `docs/README.md`.** 루트 `README.md`에는 목차 표를 다시 만들지 않는다(안내 한 줄만).
- `docs/이전버젼/`은 수정·이동 금지(목차 링크만 `docs/README.md`에 둔다). 문서 이동 후에는 `README.md`·`AGENTS.md`·소스 주석의 `docs/Ver_3.0/...` 경로를 같이 고친다.
- `.superpowers/`(SDD 진행 기록·백업)는 git 제외 로컬 폴더. 작업이 `main`에 커밋되면 지워도 된다.
