# Ver_1.0 계획문서 (Project Plan)

- 프로젝트: **MapMarker Pro** (`0004_NewMapMarker`)
- 문서 버전: **Ver_1.0**
- 작성일: 2026-07-25
- 저장소: https://github.com/BlueSkyWestWind/NewMapMarker
- 관련 문서: [PRD](./Ver_1.0_PRD.md) · [IA](./Ver_1.0_IA.md) · [USECASE](./Ver_1.0_USECASE.md) · [DESIGN](./Ver_1.0_DESIGN.md)

---

## 1. 배경

기존 `001.MapMarker`(바닐라 JS 기반 단일 페이지)는 통신 장비·축전지의 설치 국소를 카카오맵 위에 표시·관리하는 사내 도구였다.
기능이 누적되면서 다음 문제가 드러났다.

| 문제 | 영향 |
| --- | --- |
| 모듈 경계 없는 단일 스크립트 | 기능 추가 시 회귀 위험, 리뷰 불가 |
| 타입 안전성 부재 | 엑셀 79열 파싱·좌표 처리에서 런타임 오류 |
| 외부 지도 API 키 노출 경로 | 정적맵/타일 요청이 클라이언트에서 직접 발생 |
| 배포·환경변수 관리 수작업 | 운영 반영 지연 |

Ver_1.0은 이를 **Next.js 15(App Router) + TypeScript + Supabase + Cloudflare Workers** 구조로 재구성하고,
현장에서 실제 사용 중인 기능 전량을 이관·안정화하는 것을 목표로 한다.

## 2. 목적 (Goals)

1. **기능 동등성 확보** — `001.MapMarker`의 모든 운영 기능을 누락 없이 이관한다.
2. **데이터 정합성** — 같은 번지에 여러 장비가 있는 실제 현장 구조를 그룹(대표/SUB)·분리 키로 정확히 표현한다.
3. **보안 경계 확립** — 외부 지도/좌표 API 호출을 서버 프록시로 통일하고 SSRF·키 노출을 차단한다.
4. **운영 자립** — 엑셀 업로드/백업·복원만으로 담당자가 데이터를 스스로 유지할 수 있게 한다.
5. **배포 자동화** — Git 연동 Cloudflare Workers 배포로 반영 리드타임을 단축한다.

### 비목표 (Non-Goals)

- 모바일 전용 앱 / 반응형 모바일 레이아웃 최적화
- 실시간 협업(동시 편집·커서 공유)
- 지도 위 자유 도형 그리기·측량 기능
- 조직도·권한 관리 콘솔(Supabase Auth 기본 계정 운용으로 대체)

## 3. 범위 (Scope)

### 3.1 포함 (In Scope)

| # | 영역 | 내용 |
| --- | --- | --- |
| S1 | 지도 코어 | 카카오맵 SDK 로드, 뷰포트 제어, 지적편집도, 줌 컨트롤, 내 위치 |
| S2 | 3개 모드 | 장비 / 축전지 / 위치(임시) 모드 전환 및 모드별 사이드바 |
| S3 | 마커 렌더 | SVG 마커, 색상(시설팀), 클러스터(파이/도넛), 정보창 오버레이·드래그 |
| S4 | 필터·검색 | 연도·사업·색상·태그·용량·수량·국소 필터, 마커 목록 검색, 장소 검색 |
| S5 | 그룹핑 | 번지 단위 대표/SUB/단독 판정, 동·구역 실제 분리(`group_key`), 원복 |
| S6 | 마커 CRUD | 상세·편집 모달, 시설팀 지정, 삭제, 좌표 드래그 이동 |
| S7 | 엑셀 I/O | 장비·축전지·ERP(79열)·추가항목 업로드, 위치등록 스테이징·적용 |
| S8 | 백업/복원 | 전체 테이블 엑셀 백업·복원(왕복 무손실) |
| S9 | 캡처 | 영역 선택 → 격자 캡처 → PNG 스티칭, 캡처용 정보창 배치 |
| S10 | 로드뷰 | 로드뷰 모달 + 촬영일자 조회 |
| S11 | 인증 | Supabase 이메일 로그인/로그아웃, 모드·기능 잠금 |
| S12 | GPSMAP | 주소/좌표 통합 변환기(단건·일괄), VWorld 지도 + 로드뷰 대조, 엑셀 내보내기 |
| S13 | 서버 프록시 | 정적맵 · 지도 타일 · 로드뷰 촬영일자 (호스트 allowlist) |
| S14 | 배포 | OpenNext + Cloudflare Workers, 환경변수 런타임 주입 |

### 3.2 제외 (Out of Scope)

- 마커 이력(변경 감사 로그) UI
- 다국어(i18n) — 한국어 단일
- 오프라인 모드 / PWA 설치
- 서버 사이드 렌더링 기반 지도 프리렌더

## 4. 산출물 (Deliverables)

| 산출물 | 위치 | 상태 |
| --- | --- | --- |
| 애플리케이션 소스 | `src/` | ✅ |
| DB 스키마·마이그레이션 | `supabase/migrations/` | ✅ |
| 단위 테스트 | `*.test.ts` (coords · marker-filters · proxy-guard · map-helpers) | ✅ 4 files / 39 tests |
| E2E 스모크 | `e2e/smoke.spec.ts` | ✅ |
| 운영 문서 | `README.md`, `docs/VWORLD_CLOUDFLARE_SETUP.md` | ✅ |
| 개발 이력 | `docs/implementation_plan.md`, `docs/walkthrough.md` | ✅ 누적 |
| 검수 보고서 | `docs/PROJECT_ANALYSIS_2026-07-18.md` (4차까지) | ✅ |
| **본 문서 세트** | `docs/Ver_1.0/` | ✅ 본 버전 |

## 5. 마일스톤

| # | 마일스톤 | 완료 기준 | 상태 |
| --- | --- | --- | --- |
| M1 | 골격 이관 | Next.js 15 + TS + Tailwind + shadcn/ui 부트스트랩, 카카오 SDK 로드 | ✅ |
| M2 | 데이터 연결 | Supabase 마커·정보·축전지 조회, React Query 캐시, 인증 | ✅ |
| M3 | 지도 기능 | 마커 렌더·클러스터·필터·검색·상세/편집 모달 | ✅ |
| M4 | 엑셀 파이프라인 | 장비·축전지·ERP 업로드, 백업/복원 왕복 검증 | ✅ |
| M5 | 캡처·로드뷰 | 영역 격자 캡처 스티칭, 로드뷰 촬영일자 | ✅ |
| M6 | 그룹 구조 | 대표/SUB 판정 + `detached_visible` + `group_key` 분리/원복 | ✅ |
| M7 | 보안·배포 | 프록시 SSRF 방어, Workers 배포, 환경변수 런타임 주입 | ✅ |
| M8 | **Ver_1.0 문서화** | PLAN·PRD·IA·USECASE·DESIGN 확정 | ✅ 본 릴리스 |
| M9 | 안정화 | 검수 잔여 항목(G1~G3, R1~R5) 해소 | ⏳ 후속 |

## 6. 일정 요약

```
2026-06-26  DB 스키마 레퍼런스 · RLS 정책
2026-07-18  구조 이관 완료 · 1차 검수 (ERP 79열 스키마 재구성)
2026-07-19  Cloudflare Workers 배포 파이프라인 · 2차 검수
2026-07-22  detached_visible(동 개별 표시) · 3차 검수
2026-07-23  group_key(동·구역 실제 분리) · 위치탭 주소 다중 입력 · 4차 검수
2026-07-25  Ver_1.0 문서 세트 확정  ← 현재
```

## 7. 검증 전략

| 레벨 | 도구 | 대상 | 게이트 |
| --- | --- | --- | --- |
| 타입 | `tsc --noEmit` | 전체 | 오류 0 |
| 정적분석 | `eslint .` | 전체 | 문제 0 |
| 단위 | `vitest run` | 좌표 변환, 마커 필터, 프록시 가드, 지도 헬퍼 | 전량 통과 |
| 통합 | `next build` | 라우트·번들 | 빌드 성공 |
| E2E | `playwright test` | 초기 로드 스모크 | 통과 |
| 수동 | 체크리스트 | 엑셀 백업→복원 왕복, 그룹 분리→원복, 캡처 PNG | 데이터 무손실 |

> `next build`는 "Skipping linting"으로 동작하므로 **lint는 반드시 `eslint .`로 별도 확인**한다.

## 8. 리스크 및 대응

| ID | 리스크 | 영향 | 대응 |
| --- | --- | --- | --- |
| RK1 | 카카오 지도 API 정책·쿼터 변경 | 지도 전면 장애 | 정적맵 실패 시 타일 프록시 폴백 경로 유지 |
| RK2 | 도메인 미등록으로 SDK 차단 | 배포 후 지도 백지 | 배포 URL을 카카오 JS 키 도메인에 사전 등록 |
| RK3 | 마이그레이션 미적용(`group_key` 등) | 분리 기능 오류 | `IF NOT EXISTS` 마이그레이션 + 컬럼 부재 시 안내 메시지 |
| RK4 | 그룹 조작의 다단계 DB 업데이트 비원자성 | 부분 실패 시 그룹 훼손 | 재승격 선행 순서로 dangling parent 방지, 유효 키 필터 방어. **RPC 원자화는 후속** |
| RK5 | 엑셀 원본 포맷 변동(ERP 79열) | 파싱 실패 | `raw` jsonb에 원본 전량 보존, 헤더 매핑 테이블 분리 |
| RK6 | 홈 First Load 482 kB | 저사양 단말 초기 지연 | 상세 모달 등 `next/dynamic` 지연 로드 유지, 후속 번들 재프로파일 |
| RK7 | 대형 파일(`marker-detail-modal.tsx` 2,006줄) | 유지보수·리뷰 비용 | 그룹 조작 로직 훅 분리(M9) |

## 9. 성공 지표

| 지표 | 목표 |
| --- | --- |
| 기능 이관율 | `001.MapMarker` 대비 100% (README 대비표 전 항목 ✅) |
| 빌드 게이트 | tsc·eslint·vitest·next build 전부 통과 |
| 백업 왕복 무손실 | 백업 → 복원 후 마커/정보/축전지/ERP 행 수·그룹 구조 동일 |
| 지도 초기 표시 | SDK 로드~마커 렌더 3초 이내(사내망 기준) |
| 운영 자립 | 담당자가 개발자 개입 없이 엑셀만으로 월간 데이터 갱신 |

## 10. 릴리스·운영 계획

### 배포

- 방식: Cloudflare **Workers**(Git 연동) + OpenNext 어댑터
- Deploy command: `npm run deploy` (= `opennextjs-cloudflare build && … deploy`), Build command는 **비움**
- Node **22** 고정(`.nvmrc`), Compatibility flag `nodejs_compat`
- Worker 이름 · `WORKER_SELF_REFERENCE` service · `package.json` name 모두 `newmarker`로 일치

### 환경변수

| 구분 | 변수 |
| --- | --- |
| 필수 | `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` |
| 선택 | `KAKAO_REST_API_KEY` · `NEXT_PUBLIC_SITE_URL` · `PROXY_ALLOWED_ORIGINS` |

### DB 반영 순서

1. 신규 DB인 경우 `001.MapMarker/sql/` 순차 실행
2. `supabase/migrations/` 를 **파일명 순서대로** 실행 (`IF NOT EXISTS`로 재실행 안전)
3. `20260722000000_add_detached_visible.sql` → `20260723000000_add_group_key.sql` 누락 시 해당 기능 오류

### 롤백

- 앱: Cloudflare 대시보드에서 직전 Deployment로 되돌림
- 데이터: 운영 전 **엑셀 전체 백업** 선행 → 문제 시 복원 시나리오로 되돌림

## 11. 후속 과제 (Ver_1.1 후보)

| 우선순위 | 항목 | 근거 |
| --- | --- | --- |
| 1 | `group_key` 미마이그레이션 안내 문구 추가 (G3) | 운영 안전, 변경 소규모 |
| 2 | 유효 그룹 키 규칙 단일화 (G2) | 규칙 2중 구현 드리프트 예방 |
| 3 | 그룹 조작 Postgres RPC 원자화 (G6 잔여) | 부분 실패 시 그룹 훼손 근본 차단 |
| 4 | `marker-detail-modal` 훅/컴포넌트 분할 (G1) | 단일 최대 파일 해소 |
| 5 | 홈 번들 재프로파일 (R1) | First Load 482 kB 절감 |
| 6 | 잔존 `any` 축소 (R3/R5) | 타입 안전성 |
