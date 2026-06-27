---
name: main-agent-rules
description: Next.js 15, TypeScript, Tailwind CSS, Supabase 프로젝트를 위한 10x 시니어 개발자 코딩 스타일, 에러 핸들링, 라이브러리 활용 지침 및 해결 프로세스
---

# Senior Developer Guidelines & Agent Rules

이 스킬은 프로젝트 개발 시 준수해야 하는 시니어 개발 규칙 및 행동 원칙을 에이전트에게 전파하고 학습시키기 위한 가이드라인 스펙 문서입니다.

---

## 1. Must (반드시 준수할 것)
* **Client Component 우선**: 모든 컴포넌트는 클라이언트 컴포넌트로 작성합니다. (파일 최상단에 `"use client";` 지시어 기재 필수)
* **Promise params**: Next.js `page.tsx` 의 `params` 및 `searchParams` Props는 반드시 `Promise` 구조로 비동기 처리(await)하여 참조합니다.
* **Placeholder Image**: 컴포넌트 내 플레이스홀더 이미지가 필요할 때는 반드시 `picsum.photos` 의 유효한 스톡 이미지 URL을 사용합니다.
* **한글 UTF-8 인코딩**: 코드 생성 또는 텍스트 삽입 후 한글 인코딩이 깨진 부분이 없는지 UTF-8 기준으로 반드시 검사하고 정정합니다.

---

## 2. Recommended Library (지정 라이브러리 활용)
특정 기능을 구현할 때는 임의로 유틸리티를 작성하지 않고 아래의 표준 라이브러리를 사용합니다:
1. **날짜/시간**: `date-fns` (경량화 및 정밀화)
2. **분기 처리**: `ts-pattern` (타입 세이프 분기 및 조건식 매칭)
3. **서버 상태**: `@tanstack/react-query` (서버 캐시 및 쿼리 동기화)
4. **전역 상태**: `zustand` (가볍고 직관적인 UI 스토어)
5. **공통 훅**: `react-use` (검증된 상태/이벤트 반응형 훅 그룹)
6. **유틸리티**: `es-toolkit` (안전하고 빠른 타입 체커 및 배열/객체 변환 함수)
7. **아이콘**: `lucide-react` (커스텀 리액트 아이콘)
8. **스키마 검증**: `zod` (런타임 데이터 데이터 무결성 검증)
9. **UI 컴포넌트**: `shadcn-ui` (접근성 컴포넌트 마운트)
10. **스타일링**: `tailwindcss` (유틸리티 클래스 기반 디자인)
11. **백엔드 DB**: `supabase` (Supabase Client 및 RESTful API 활용)
12. **폼 핸들링**: `react-hook-form` (폼 제어 및 상태 연동)

---

## 3. Directory Structure (디렉토리 설계)
규정된 아키텍처에 맞게 파일 위치를 관리합니다:
* `src/app/` : Next.js App Router 페이지 및 로직
* `src/components/ui/` : `shadcn-ui` 코어 라이브러리 컴포넌트
* `src/constants/` : 전역 공통 상수
* `src/hooks/` : 전역 공통 커스텀 훅
* `src/lib/` : 공통 헬퍼 및 비즈니스 독립형 유틸리티
* `src/remote/` : HTTP REST API 통신 모듈
* `src/features/[featureName]/components/` : 특정 피처 단위 UI 컴포넌트
* `src/features/[featureName]/constants/` : 피처 전용 상수
* `src/features/[featureName]/hooks/` : 피처 전용 React Query 및 상태 관리 훅
* `src/features/[featureName]/lib/` : 피처 전용 로직 함수
* `src/features/[featureName]/api.ts` : 피처 전용 Supabase/API 통신 모듈

---

## 4. Code Guidelines (코딩 가이드라인)
* **Early Returns**: 복잡한 중첩 분기문을 피하고 조기 리턴 패턴을 활용해 가독성을 높입니다.
* **Conditional Classes**: 복잡한 삼항 연산자 대신 클래스 결합을 활용해 가독성 있는 스타일 조건식을 수립합니다.
* **Descriptive Names**: 변수와 함수명은 직관적이고 설명적으로 길게 명시합니다.
* **Constants > Functions**: 고정 값이나 단순 템플릿 값은 매번 재계산하는 함수형보다 상수로 선언합니다.
* **Immutability (불변성)**: 함수형 패러다임에 입각해 상태 변조(Mutation)를 금지하고, `map`, `filter`, `reduce` 등의 비파괴적 어레이 메소드를 지향합니다.
* **Early Optimization 금지**: 섣부른 조기 최적화 대신 단순하고 명료한 아키텍처를 추구하고, 증명된 병목 지점에서 프로파일링 후 최적화를 조심스럽게 가하되 근거를 반드시 주석으로 기재합니다.
* **Error Handling**: 예외 처리 시 예외(throw Exception)를 날려 앱을 터트리기보다 오류 모델이나 오류 객체를 리턴하여 호출 단계에서 유연하게 수렴 처리할 것을 적극 권장합니다.

---

## 5. Deployment Rules (배포 및 인프라 지침)
* **Shadcn 컴포넌트 설치**: 터미널에 shadcn 명령을 직접 실행할 수 없으므로, 신규 컴포넌트가 필요한 경우 사용자에게 실행 명령(예: `npx shadcn@latest add card`)을 명시하여 실행을 대신 요청합니다.
* **Supabase 스키마 수정**: 로컬 DB 개발 서버를 별도 구동하지 않으며, 테이블 정의 변경이나 마이그레이션이 필요하면 프로젝트 내 `/supabase/migrations/` 경로에 `.sql` 마이그레이션 DDL 쿼리 파일을 추가 저장하고 사용자에게 Supabase 콘솔(SQL Editor) 반영을 대신 가이드합니다.
* **패키지 관리**: 반드시 `npm`을 공식 패키지 매니저로 사용합니다.
