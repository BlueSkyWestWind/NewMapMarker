# 구조 점검 지적사항 보완 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ver 2.1 구조 점검에서 확인된 E2E 실행 불안정·느슨한 타입 검사·버전 식별 혼선을 줄이고 검증 가능한 상태로 만든다.

**Architecture:** 기존 기능 로직은 유지하고 테스트 실행 경계와 정적 검사 설정만 보완한다. 타입 규칙은 전체 코드베이스를 한 번에 깨뜨리지 않도록 우선 변경 대상과 새 코드에 적용 가능한 규칙부터 정리하며, 버전은 제품 릴리스 표기와 npm 패키지 버전의 관계를 문서화한다.

**Tech Stack:** Next.js 15, TypeScript, ESLint 9, Vitest, Playwright, npm.

**Spec:** `docs/Ver_2.0/project_review.md`의 2026-09-26 구조 점검 기록.

## 사용자 요청 (원문)

**최초 요청**
> 문제로 지적된거 수정을 해줘~

## Global Constraints

- 기존 미커밋 변경은 되돌리거나 정리하지 않는다.
- Supabase 로컬 실행과 마이그레이션 적용은 하지 않는다.
- 패키지 추가 없이 현재 npm 의존성으로 해결한다.
- 홈 First Load JS는 295kB 이하를 유지한다.
- 변경 후 `npm test`, `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm run build`를 실행한다.

## Review Focus

- 포트 3000이 이미 사용 중일 때 E2E 서버 재사용/기동이 테스트 URL과 일치하는가.
- Playwright 브라우저가 실행되지 않거나 페이지 로딩이 멈출 때 테스트가 무기한 대기하지 않는가.
- 타입 검사 완화 설정을 강화해 기존 외부 SDK·엑셀 경계에 불필요한 대량 오류를 만들지 않는가.
- `any` 사용과 ESLint 규칙 변경이 현재 통과하던 린트 결과를 깨뜨리지 않는가.
- 제품 릴리스 버전과 npm 버전의 역할이 README와 계획서에서 명확한가.

---

### Task 1: Playwright 실행 경계 안정화

**Files:**
- Modify: `playwright.config.ts`
- Modify: `e2e/smoke.spec.ts` (필요한 경우에만 테스트 타임아웃 진단 보강)

**Interfaces:**
- Consumes: 기존 `npm run dev`, `reuseExistingServer`, `/` 스모크 흐름
- Produces: 포트 점유 환경에서도 baseURL과 webServer 동작이 일치하고 유한 시간 안에 종료되는 E2E 설정

- [ ] **Step 1: 재현 결과 기준으로 설정 문제를 최소 수정한다**
- [ ] **Step 2: 포트 점유 및 서버 재사용 조건을 검증한다**
- [ ] **Step 3: `npm run test:e2e`를 실행해 2개 스모크 결과를 확인한다**

### Task 2: 정적 타입·린트 안전성 보완

**Files:**
- Modify: `tsconfig.json`
- Modify: `eslint.config.mjs`
- Modify: 현재 오류가 발생하는 파일만 필요 최소 범위로 수정

**Interfaces:**
- Consumes: 기존 TypeScript 경로 별칭, Next.js ESLint preset, 외부 SDK 선언
- Produces: 점진적으로 강화된 타입/린트 기준과 오류가 명시적 타입으로 해소된 코드

- [ ] **Step 1: 강화할 규칙의 오류 목록을 먼저 수집한다**
- [ ] **Step 2: 새/변경 영역 중심으로 타입을 보완한다**
- [ ] **Step 3: 타입 검사·린트를 재실행하고 기존 테스트를 통과시킨다**

### Task 3: 버전 식별 문서화

**Files:**
- Modify: `README.md`
- Modify: `docs/Ver_2.2/Ver_2.2_implementation_plan.md`

**Interfaces:**
- Consumes: 제품 릴리스 `Ver_2.1`, npm `package.json` 버전 `0.1.0`
- Produces: 두 버전 표기의 역할과 변경 정책을 명시한 문서

- [ ] **Step 1: 제품 릴리스 버전과 패키지 버전의 역할을 README에 명시한다**
- [ ] **Step 2: 임의로 `package.json` 버전을 변경하지 않았는지 확인한다**

### Task 4: 결과 기록 및 전체 검증

**Files:**
- Modify: `docs/walkthrough.md`
- Modify: `docs/Ver_2.0/project_review.md`

- [ ] **Step 1: 전체 검증 명령을 실행한다**
- [ ] **Step 2: 실제 결과와 남은 환경 의존 항목을 기록한다**
- [ ] **Step 3: 작업 트리에서 기존 변경과 이번 변경을 구분해 확인한다**
