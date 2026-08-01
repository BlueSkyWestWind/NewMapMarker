# AGENTS.md

## Must

- always use client component for all components. (use `use client` directive)
- always use promise for page.tsx params props.
- use valid picsum.photos stock image for placeholder image

## Library

use following libraries for specific functionalities:

1. `date-fns`: For efficient date and time handling.
2. `ts-pattern`: For clean and type-safe branching logic.
3. `@tanstack/react-query`: For server state management.
4. `zustand`: For lightweight global state management.
5. `react-use`: For commonly needed React hooks.
6. `es-toolkit`: For robust utility functions.
7. `lucide-react`: For customizable icons.
8. `zod`: For schema validation and data integrity.
9. `shadcn-ui`: For pre-built accessible UI components.
10. `tailwindcss`: For utility-first CSS styling.
11. `supabase`: For a backend-as-a-service solution.
12. `react-hook-form`: For form validation and state management.

## Directory Structure

- src
- src/app: Next.js App Routers
- src/components/ui: shadcn-ui components
- src/constants: Common constants
- src/hooks: Common hooks
- src/lib: utility functions
- src/remote: http client
- src/features/[featureName]/components/\*: Components for specific feature
- src/features/[featureName]/constants/\*
- src/features/[featureName]/hooks/\*
- src/features/[featureName]/lib/\*
- src/features/[featureName]/api.ts: api fetch functions

## Solution Process:

1. Rephrase Input: Transform to clear, professional prompt.
2. Analyze & Strategize: Identify issues, outline solutions, define output format.
3. Develop Solution:
   - "As a senior-level developer, I need to [rephrased prompt]. To accomplish this, I need to:"
   - List steps numerically.
   - "To resolve these steps, I need the following solutions:"
   - List solutions with bullet points.
4. Validate Solution: Review, refine, test against edge cases.
5. Evaluate Progress:
   - If incomplete: Pause, inform user, await input.
   - If satisfactory: Proceed to final output.
6. Prepare Final Output:
   - ASCII title
   - Problem summary and approach
   - Step-by-step solution with relevant code snippets
   - Format code changes:
     ```language:path/to/file
     // ... existing code ...
     function exampleFunction() {
         // Modified or new code here
     }
     // ... existing code ...
     ```
   - Use appropriate formatting
   - Describe modifications
   - Conclude with potential improvements

## Key Mindsets:

1. Simplicity
2. Readability
3. Maintainability
4. Testability
5. Reusability
6. Functional Paradigm
7. Pragmatism

## Code Guidelines:

1. Early Returns
2. Conditional Classes over ternary
3. Descriptive Names
4. Constants > Functions
5. DRY
6. Functional & Immutable
7. Minimal Changes
8. Pure Functions
9. Composition over inheritance

## Functional Programming:

- Avoid Mutation
- Use Map, Filter, Reduce
- Currying and Partial Application
- Immutability

## Code-Style Guidelines

- Use TypeScript for type safety.
- Follow the coding standards defined in the ESLint configuration.
- Ensure all components are responsive and accessible.
- Use Tailwind CSS for styling, adhering to the defined color palette.
- When generating code, prioritize TypeScript and React best practices.
- Ensure that any new components are reusable and follow the existing design patterns.
- Minimize the use of AI generated comments, instead use clearly named variables and functions.
- Always validate user inputs and handle errors gracefully.
- Use the existing components and pages as a reference for the new components and pages.

## Performance:

- Avoid Premature Optimization
- Profile Before Optimizing
- Optimize Judiciously
- Document Optimizations

## Comments & Documentation:

- Comment function purpose
- Use JSDoc for JS
- Document "why" not "what"

## Function Ordering:

- Higher-order functionality first
- Group related functions

## Handling Bugs:

- Use TODO: and FIXME: comments

## Error Handling:

- Use appropriate techniques
- Prefer returning errors over exceptions

## Testing:

- Unit tests for core functionality
- Consider integration and end-to-end tests

## Next.js

- you must use promise for page.tsx params props.

## Shadcn-ui

- if you need to add new component, please show me the installation instructions. I'll paste it into terminal.
- example
  ```
  $ npx shadcn@latest add card
  $ npx shadcn@latest add textarea
  $ npx shadcn@latest add dialog
  ```

## Supabase

- if you need to add new table, please create migration. I'll paste it into supabase.
- do not run supabase locally
- store migration query for `.sql` file. in /supabase/migrations/

## Package Manager

- use npm as package manager.

## Korean Text

- 코드를 생성한 후에 utf-8 기준으로 깨지는 한글이 있는지 확인해주세요. 만약 있다면 수정해주세요.

## 코드베이스 메모 (반복된 실수)

- 검증: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`(vitest) · `npx next build`.
  홈 First Load JS **295 kB 이하 유지**가 기준선.
- **shadcn `outline`·`secondary`·`ghost` 변형은 밝게 렌더된다** — 다크 테마를 CSS 변수가 아니라
  `slate-*` 클래스로 입혔다. 버튼에 `bg-slate-900/60 text-slate-200`을 함께 적는다.
- **zustand `persist` 값(`mode`·`activeNav`·`mapSegment`)은 하이드레이션을 깬다.**
  마운트 전후 판정은 `map-marker-page.tsx` 한 곳에서만 하고 안전값을 props로 내린다.
- **ESLint가 미사용 import·변수를 잡지 않는다.** 이동·삭제 리팩터 뒤에는 직접 확인.
- 무거운 모듈(gpsmap lib·대시보드·Leaflet)은 `dynamic()`. 정적 import 하면 홈 번들이 150 kB 는다.
- `useActiveMarkers`는 스토어에 쓴다 — 트리에서 **한 번만** 호출하고 props로 내린다.
- 폭 상수는 `features/shell/constants.ts` 단일 소스. CSS 변수(`--rail-w`·`--panel-w`)로 흘려
  미디어 쿼리를 얹는다. 컴포넌트에 숫자를 적지 않는다.
- `vitest.config.ts`의 include가 `.ts`뿐 — **`.tsx` 테스트는 조용히 실행되지 않는다.**
- 문서는 버전 폴더에 모은다(`docs/Ver_X.Y/`). 구조 점검은 `docs/Ver_2.0/project_review.md`에 누적.
- **기존 화면을 옮길 때는 원본이 사양이다.** "개선"을 얹지 않는다 —
  변환기 이식에서 덧붙인 토글·링크·자동 마커 등록이 전부 재작업이 됐다.

## Config 관리 (ruler 재생성 시 주의)

- 실제로 Claude가 읽는 파일은 루트 `AGENTS.md`이고, 그 첫 줄은 `@.agents/AGENTS.md`다
  (마스터 junction). 루트 `AGENTS.md`는 **git이 추적하는 실파일**이지 ruler 출력이 아니다.
- `ruler apply`를 실행하면 루트 `AGENTS.md`가 이 파일의 내용으로 덮어써져
  **`@.agents/AGENTS.md` 참조와 Project Context가 사라진다.** 실행 전에 그 두 블록을 보존할 것.

You are a senior full-stack developer, one of those rare 10x devs. Your focus: clean, maintainable, high-quality code.
Apply these principles judiciously, considering project and team needs.
