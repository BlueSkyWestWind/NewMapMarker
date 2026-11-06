# 변경 이력 (Changelog)

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 저장소: https://github.com/BlueSkyWestWind/NewMapMarker
- 형식: [Keep a Changelog](https://keepachangelog.com/) 준용 · 버전: [유의적 버전](https://semver.org/lang/ko/)

> 분류: `추가` `변경` `수정` `제거` `보안` `문서`

---

## [Unreleased]

### 예정 (Ver_1.1 후보)

| 우선순위 | 항목 | CR |
| --- | --- | --- |
| 1 | `group_key` 미마이그레이션 안내 문구 추가 (G3) | [CR-001](./CHANGE_REQUEST/CR-001.md) |
| 2 | 유효 그룹 키 규칙 단일화 (G2) | [CR-002](./CHANGE_REQUEST/CR-002.md) |
| 3 | 그룹 조작 Postgres RPC 원자화 (G6 잔여) | [CR-003](./CHANGE_REQUEST/CR-003.md) |
| 4 | 국소 작업 안전 날씨 조회 — 기상청 API 연동 (신규 기능) | [CR-004](./CR-004.md) |
| 5 | `marker-detail-modal` 훅/컴포넌트 분할 (G1) | — |
| 6 | 홈 번들 재프로파일 — First Load 482 kB 절감 (R1) | — |
| 7 | 잔존 `any` 축소 (R3/R5) | — |
| 8 | 그룹 판정 단위 테스트 자동화 (TC-G01~G13) | — |

---

## [1.0.0] — 2026-07-25

`001.MapMarker`(바닐라 JS 단일 페이지)를 **Next.js 15 + TypeScript + Supabase + Cloudflare Workers** 구조로 재구성한 첫 정식 릴리스.
현장에서 사용 중인 기능 전량을 이관하고 안정화했다.

### 추가

**지도 코어**
- 카카오맵 SDK 로드(`services,clusterer`), 기본 중심 광주(35.159542, 126.8526012) · 레벨 6
- 줌 컨트롤(0~14, 버튼·드래그 슬라이더), 지적편집도, 내 위치, 광주 시청 기준점 복귀
- 장비 / 축전지 / 위치 **3개 모드** 및 모드별 사이드바 섹션 구성

**마커**
- SVG 마커 렌더 + 시설팀 색상 자동 반영(1~5팀, 7팀)
- 클러스터링(파이 / 도넛 아이콘), 정보창 오버레이 및 드래그 이동
- 마커 드래그 좌표 보정, 좌표 없음 건수 집계
- 상세·편집 모달(`next/dynamic` 지연 로드), 시설팀 지정, 삭제(CASCADE)

**필터·검색**
- 연도·사업·색상·태그 다중 필터, 축전지 용량·수량·국소 필터
- 필터별 제외 건수 집계, 마커 목록 텍스트 검색, 장소 검색 및 필지 경계 표시

**그룹핑**
- 번지 단위 대표/SUB/단독 판정, 대표 1핀 렌더 원칙
- 상세 모달에서 동·지하·기타 라벨 단위 그룹 조작

**엑셀 I/O**
- 장비·축전지 엑셀 업로드(지오코딩 배치 큐·캐시·실패 목록)
- ERP 엑셀 **79열** 업로드 및 `raw` jsonb 원본 전량 보존
- 위치등록 업로드 **스테이징 → 미리보기 → [적용]** 커밋 모델
- 전체 테이블 엑셀 백업·복원(왕복 무손실)

**캡처·로드뷰**
- 영역 선택 → 격자 분할 캡처 → PNG 스티칭
- 캡처 모드 정보창 분리 배치
- 로드뷰 모달 + 촬영일자 조회

**인증·부가**
- Supabase 이메일 로그인/로그아웃, 모드·기능 잠금
- GPSMAP(`/gpsmap`) — 주소/좌표 단건(DMS)·일괄 변환, VWorld 지도 + 로드뷰 대조, 엑셀 내보내기

**서버·배포**
- Route Handler 3종: 정적맵 프록시 · 타일 프록시 · 로드뷰 촬영일자
- OpenNext + Cloudflare Workers 배포, 환경변수 **런타임 주입**(`PublicEnvScript`)

### 보안

- 외부 지도 리소스 요청을 **서버 프록시로 단일화**
- 타일 프록시 **호스트 allowlist**로 SSRF 차단 (`proxy-guard` 단위 테스트)
- 프록시 origin 검증(자기 도메인 + `NEXT_PUBLIC_SITE_URL` + `PROXY_ALLOWED_ORIGINS`)
- 카카오 **REST 키 서버 전용화** — 클라이언트 번들 미포함
- Supabase RLS 정책 적용

### 문서

- Ver_1.0 문서 세트 확정: PLAN · PRD · IA · USECASE · DESIGN
- 참조 문서 추가: ARCHITECTURE · DATABASE · COMPONENT · STATE · BUSINESS_RULE · API · CODING_GUIDE · TEST_CASE · CHANGELOG
- 변경 요청 관리 체계 도입: `CHANGE_REQUEST/`

### 알려진 제약

| ID | 내용 | 대응 |
| --- | --- | --- |
| G1 | `marker-detail-modal.tsx` 2,006줄 | Ver_1.1 분할 |
| G2 | 유효 키 규칙 2중 구현 | [CR-002](./CHANGE_REQUEST/CR-002.md) |
| G3 | 마이그레이션 미적용 시 일반 DB 오류만 표시 | [CR-001](./CHANGE_REQUEST/CR-001.md) |
| G6 | 그룹 조작 **트랜잭션 원자성 없음** | [CR-003](./CHANGE_REQUEST/CR-003.md) |
| R1 | 홈 First Load 482 kB | 번들 재프로파일 |
| R3/R5 | 잔존 `any` | 점진 축소 |

---

## [0.6.0] — 2026-07-23 · 4차 검수

### 추가
- **`group_key`** 컬럼 도입 — 같은 번지 안에서 동·구역을 **실제로 분리**하는 그룹 키
  - 마이그레이션: `20260723000000_add_group_key.sql`
  - 분리 시 대표 국소를 사용자가 **직접 선택**
  - 분리 절차를 "잔여 그룹 재승격 → 분리 대상 키 부여 → `detached_visible` 리셋" 순서로 고정해 dangling parent 방지
  - [번지로 합치기] 원복 기능
- 위치 탭 **주소 다중 입력** — 줄 단위 붙여넣기, `이름[Tab]주소` 지원, 중복 제거, 자동 fit, 실패 주소만 입력창 잔류

### 변경
- 그룹 판정 기준을 번지 주소에서 **유효 키(`group_key ?? 번지 키`)**로 전환
- 백업/복원이 `group_key`를 포함하도록 확장 (구 백업은 null 폴백)
- 상세 모달 연관 목록에 **유효 키 재필터** 추가 — 그룹 경계 침범 방지

### 수정
- 분리 후 잔여 SUB가 이탈 대표를 가리키던 문제 (실행 순서 조정)

---

## [0.5.0] — 2026-07-22 · 3차 검수

### 추가
- **`detached_visible`** 컬럼 — 같은 번지 SUB를 지도에 개별 핀으로 표시
  - 마이그레이션: `20260722000000_add_detached_visible.sql`
- 지도 렌더 조건을 `parent_marker_id == null || detached_visible == true`로 확장

---

## [0.4.0] — 2026-07-19 · 2차 검수

### 추가
- **Cloudflare Workers 배포 파이프라인**(OpenNext 어댑터, Git 연동)
- 환경변수 **런타임 주입** — `PublicEnvScript`

### 변경
- Node **22** 고정(`.nvmrc`), `nodejs_compat` 호환성 플래그
- Worker 이름 · `WORKER_SELF_REFERENCE` · `package.json` name을 `newmarker`로 통일
- Deploy command를 `npm run deploy`로, Build command는 비움

---

## [0.3.0] — 2026-07-18 · 1차 검수

### 추가
- 구조 이관 완료 — Next.js 15 App Router + TypeScript + Tailwind + shadcn/ui
- **ERP 79열 스키마 재구성** — 매핑 컬럼 29개 + `raw` jsonb 원본 보존
  - 마이그레이션: `20260718120000_recreate_full_schema_with_erp.sql`
- 엑셀 파이프라인(장비·축전지·ERP), 백업/복원 왕복 검증
- 영역 격자 캡처 스티칭, 로드뷰 촬영일자

### 변경
- 상태 이원화 확립 — Zustand(UI) / TanStack Query(서버)

---

## [0.2.0] — 2026-06-27

### 보안
- Supabase **RLS 및 정책** 적용 — `20260627000001_enable_rls_and_policies.sql`
- 축전지 테이블 RLS 임시 해제 후 정책 재설정 — `20260627000000_disable_rls_battery_tables.sql`

---

## [0.1.0] — 2026-06-26

### 추가
- **DB 스키마 레퍼런스** — `20260626000000_map_marker_schema_reference.sql`
- `markers` / `information` / `battery_markers` / `battery_specs` 기본 구조

---

## 기록 규칙

| 규칙 | 내용 |
| --- | --- |
| CL-1 | 릴리스마다 버전·날짜를 남긴다 |
| CL-2 | 사용자에게 보이는 변화를 **사용자 언어**로 적는다. 내부 리팩터링은 `변경`에 간략히 |
| CL-3 | 마이그레이션이 포함되면 **파일명을 반드시 명시**한다 |
| CL-4 | 파괴적 변경은 `변경` 항목 맨 앞에 ⚠️와 함께 적는다 |
| CL-5 | CR로 처리된 항목은 CR 번호를 링크한다 |
| CL-6 | 알려진 제약은 숨기지 않고 릴리스 항목에 남긴다 |
