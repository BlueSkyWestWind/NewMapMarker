# Ver_1.1 문서 세트

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 릴리스: **1.1.0** — 2026-07-26
- 이전 버전: [Ver_1.0](../Ver_1.0/)

> Ver_1.1의 주제는 **국소 작업 안전 날씨**다.
> "국소가 어디에 있는가"에서 **"오늘 그 국소에서 작업해도 되는가"** 로 제품의 질문을 옮겼다.

---

## 문서 목록

### 버전 문서 (Ver_1.1 접두)

| 문서 | 내용 |
| --- | --- |
| [Ver_1.1_PLAN](./Ver_1.1_PLAN.md) | 배경·목표·범위·마일스톤·리스크·릴리스 계획 |
| [Ver_1.1_PRD](./Ver_1.1_PRD.md) | 기능 요구사항(FR-W/S/K/J/A/O)·비기능(NFR-14~23)·수용 기준 |
| [Ver_1.1_IA](./Ver_1.1_IA.md) | 사이트맵·라우트·데이터 모델·상태 구조·모듈 맵 |
| [Ver_1.1_USECASE](./Ver_1.1_USECASE.md) | UC-W01~W09 상세·추적표·E2E 시나리오 |
| [Ver_1.1_DESIGN](./Ver_1.1_DESIGN.md) | 판정 등급 색상 체계·타임라인 표·컴포넌트 스펙 |

### 공통 문서

| 문서 | 내용 |
| --- | --- |
| [ARCHITECTURE](./Ver_1.1_ARCHITECTURE.md) | 시스템 개요·ADR·레이어·캐시·장애 설계·부채 |
| [API](./Ver_1.1_API.md) | 4개 라우트 계약·기상청 업스트림·인증키 |
| [DATABASE](./Ver_1.1_DATABASE.md) | 스키마 변경·마이그레이션·조회 상한 대응 |
| [BUSINESS_RULE](./Ver_1.1_BUSINESS_RULE.md) | BR-W 안전 판정 규칙 (최우선 도메인) |
| [STATE](./Ver_1.1_STATE.md) | 상태 이원화·3단 캐시·파생 우선 설계 |
| [COMPONENT](./Ver_1.1_COMPONENT.md) | 컴포넌트 트리·신규 컴포넌트 명세·작성 규칙 |
| [TEST_CASE](./Ver_1.1_TEST_CASE.md) | 단위 221건·수동 체크리스트·회귀 스위트 |
| [CODING_GUIDE](./Ver_1.1_CODING_GUIDE.md) | 스택·디렉터리·번들 관리·릴리스 게이트 |
| [CHANGELOG](./Ver_1.1_CHANGELOG.md) | 1.1.0 변경 이력 |

### 변경요청 (CR)

CR 문서는 `Ver_1.0/`에 그대로 둔다.

| CR | 제목 | 상태 |
| --- | --- | --- |
| [CR-001](../Ver_1.0/CR-001.md) | `group_key` 미마이그레이션 안내 | 📋 미착수 |
| [CR-002](../Ver_1.0/CR-002.md) | 유효 그룹 키 규칙 단일화 | 📋 미착수 |
| [CR-003](../Ver_1.0/CR-003.md) | 그룹 조작 RPC 원자화 | 📋 미착수 |
| [CR-004](../Ver_1.0/CR-004.md) | 국소 작업 안전 날씨 | ✅ **Ver_1.1에서 구현** |

---

## Ver_1.0 → Ver_1.1 요약

| 지표 | Ver_1.0 | Ver_1.1 |
| --- | --- | --- |
| 지도 모드 | 3종 | **4종** (+날씨) |
| 서버 라우트 | 3종 | **4종** |
| 소스 코드 | 약 21,700줄 | **약 27,400줄** |
| 단위 테스트 | 39건 / 4파일 | **221건 / 15파일** |
| 홈 First Load JS | 482 kB | **289 kB** |
| 마이그레이션 | 6개 | **7개** |
| 외부 데이터 | 카카오·VWorld | +**기상청 API 허브** |

---

## 배포 전 필수 확인

1. **Supabase 마이그레이션 실행** — `20260727000000_add_worksite_weather_columns.sql`
2. **기상청 인증키 설정** — `wrangler secret put KMA_API_HUB_KEY`
   (`wrangler.jsonc`의 `vars`에 넣지 말 것 — 커밋된다)
3. 배포 환경에서 KST 보정 실동작 확인 (Workers는 UTC)
4. [TEST_CASE §6](./Ver_1.1_TEST_CASE.md) 수동 체크리스트

## 문서를 읽는 순서

| 목적 | 순서 |
| --- | --- |
| 전체 파악 | PLAN → PRD → IA |
| 기능 구현 | BUSINESS_RULE → USECASE → COMPONENT |
| 데이터 변경 | DATABASE → API |
| 성능·구조 | ARCHITECTURE → STATE |
| 릴리스 | TEST_CASE → CODING_GUIDE §14 → CHANGELOG |
