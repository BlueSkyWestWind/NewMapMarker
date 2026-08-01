# MapMarker Pro - 구현 계획 Ver 2.0

| 항목 | 내용 |
|------|------|
| 버전 | 2.0 |
| 작성일 | 2026-08-01 |
| 작업명 | UI 셸 개편 — 좌측 네비게이션 레일 + 설정 패널 + 전역 검색 |

> 파일명은 `Ver_2.0_implementation_plan.md`. 버전마다 새 파일을 만들고
> 이전 버전 파일은 수정하지 않는다. 버전번호는 사용자에게 확인한 값만 쓴다.

---

## 사용자 요청 (원문)

**최초 요청**
> [Image #17] 이미지의 ui로 변경하고 싶은데 현재 프로젝트 구조를 파악하여 이미지로 변경하기 위한
> 계획서 구성해줘

첨부 이미지: 좌측 아이콘 네비게이션 레일 + 중앙 설정 패널 + 우측 전면 지도, 상단 전역 검색바 구성의 목업.

---

## 0. 목업 해석 (가정)

제공된 목업의 한글 라벨 일부가 깨져 있어(`테시보드`, `그룰 관리`, `CCTV 므나미칭`,
`킹스 대미터`, `강소 도가`, `접물 명모드`, `내밫내기`) 아래와 같이 읽었다.
**틀린 항목이 있으면 1단계 착수 전에 바로잡는다.**

| 목업 표기 | 해석 |
|---|---|
| 테시보드 | 대시보드 |
| 마커 관리 | 마커 관리 |
| 그룰 관리 | 그룹 관리 |
| CCTV 므나미칭 | CCTV 모니터링 |
| 데미터 분석 | 데이터 분석 |
| 설평 | 설정 |
| 정소 설정 / CCTV 실정 | 장소 설정 / CCTV 설정 |
| 킹스 대미터 | 장소 데이터 |
| + 강소 도가 | + 장소 추가 |
| + 접물 명모드 / + 내밫내기 | + 엑셀 업로드 / + 내보내기 |
| 정소 징헤... `68` | 장소 검색... + 건수 배지 |

목업의 지도는 위성 영상이다. 현재 프로젝트는 카카오맵 기반이며 위성/일반 전환 기능이
이미 있으므로 **스킨 차이일 뿐 별도 작업이 아니다.**

---

## 1. 목표

화면의 **껍데기(셸)** 를 목업 구조로 교체한다. 기능 자체는 그대로 두고 배치만 바꾼다.

- 좌측 상단 브랜드 + 아이콘 네비게이션 레일 신설
- 중앙 설정 패널(카드형) — 세그먼트 탭 + 액션 버튼 + 검색/필터
- 우측 지도 전면 배치
- 상단 전역 검색바 (`Ctrl+K`)

## 2. 현재 구조 (As-Is)

```
app/page.tsx
└ MapMarkerPage
  ├ MapSidebar            aside w-[340px]  ← 좌측 전부를 이것 하나가 담당
  │ ├ header  : AuthHeader · 주소/좌표 통합 변환기 링크
  │ ├ ModeTabs: 장비 | 축전지 | 위치 | 날씨&CCTV      ← 데이터 도메인 전환
  │ ├ body    : (날씨 모드) WorksiteWeatherPanel + CCTV 아코디언
  │ │           (그 외)     Accordion — 주소검색·엑셀·필터·장소검색·마커목록
  │ └ footer  : 백업/복원 아코디언
  ├ KakaoMapCanvas + MapFloatingControls
  └ 모달: Roadview · MarkerDetail · MarkerEdit · CctvVideo
```

| 사실 | 값 |
|---|---|
| 라우트 | `/` (지도), `/gpsmap` (별도 도구) — 사실상 단일 화면 |
| 사이드바 폭 | `340px` 고정 (`map-sidebar.tsx:130`) |
| 화면 전환 축 | `MapMode` = `equipment \| battery \| location \| weather` |
| UI 상태 | Zustand + `persist` (`mode`, `isSidebarOpen`, `isClusteringEnabled`, `markerListFilter` 등) |
| 사이드바 구성 파일 | `components/sidebar/` 12개 |

**핵심 제약**: 현재는 **모드(데이터 도메인)** 가 최상위 전환 축인데,
목업은 **메뉴(기능 영역)** 가 최상위다. 이 축의 재배치가 이번 작업의 본질이다.

## 3. 목표 구조 (To-Be)

```
AppShell
├ NavRail          w-[200px]  브랜드 + 메뉴 7개
├ WorkPanel        w-[320px]  현재 메뉴에 해당하는 설정 카드
├ TopSearchBar     전역 검색 (Ctrl+K)
└ MapStage         나머지 전부 — 지도 + 플로팅 컨트롤 + 모달
```

### 3.1 메뉴 ↔ 기존 기능 매핑

| 메뉴 | 이번 버전 처리 | 재사용하는 기존 자산 |
|---|---|---|
| 대시보드 | **비활성**(준비 중 표시) | — |
| 지도 | 기본 화면. 도메인 셀렉터(장비/축전지/위치) + 장소 액션 | `ModeTabs` 재구성, `equipment-excel-section`, `location-*` |
| 마커 관리 | 마커 목록 + 필터 | `markers-list-panel`, `filter-panel` |
| 그룹 관리 | **비활성**(준비 중 표시) | — |
| CCTV 모니터링 | CCTV 조회 패널 | `cctv-panel` (현재 날씨탭 안) |
| 데이터 분석 | **비활성**(준비 중 표시) | — |
| 설정 | 백업/복원, 클러스터링, 지적도 등 | `backup-restore-section`, `map-floating-controls` 일부 |

> 날씨(`WorksiteWeatherPanel`)는 목업 메뉴에 대응 항목이 없다.
> **「지도」 메뉴의 세그먼트 탭에 배치**하는 것을 기본안으로 하고, 1단계에서 확정한다.

### 3.2 세그먼트 탭 (목업의 `장소 설정 | CCTV 설정`)

메뉴가 최상위가 되면 모드는 패널 안쪽 세그먼트로 내려간다.
`MapMode`를 없애지 않고 **그대로 유지**한다 — 스토어·쿼리·오버레이가 전부 이 값에 묶여 있어
제거하면 변경 범위가 기능 전체로 번진다.

## 4. 범위

**포함**

- `AppShell` / `NavRail` / `WorkPanel` / `TopSearchBar` 신설
- `MapSidebar` 해체 — 내부 섹션 컴포넌트는 **그대로 재사용**, 배치만 이동
- 전역 검색(`Ctrl+K`) — 기존 `place-search-section` 로직 재사용
- `340px` 하드코딩 상수 정리 (`cctv-video-modal.tsx`, `map-region-capture-panel-view.tsx`)
- 미구현 메뉴의 "준비 중" 상태 표시

**제외**

- 대시보드·그룹 관리·데이터 분석 **기능 신설** (셸만 교체하기로 결정)
- DB 스키마 변경, RLS 정책 변경
- 라우트 분리(`/dashboard` 등) — 이번엔 **단일 라우트 + 클라이언트 상태**로 전환.
  URL 공유·뒤로가기가 필요해지면 다음 버전에서 라우트로 승격한다
- 지도 렌더링·마커 로직·엑셀 입출력 내부 변경
- CCTV 배포 이슈(`ITS_API_KEY` 등록) — 별건, `Ver_1.1_CCTV_PLAN.md` 부록 E 참조

## 5. 작업 항목

| # | 대상 파일 | 변경 내용 |
|---|-----------|-----------|
| 1 | `features/shell/types/nav.ts` (신규) | `NavKey` 타입 7종, 라벨·아이콘·활성여부 메타 |
| 2 | `store/use-map-marker-store.ts` | `activeNav` 추가(+`persist`). `mode`는 유지 |
| 3 | `features/shell/components/nav-rail.tsx` (신규) | 브랜드 + 메뉴 목록. 비활성 항목은 `disabled`+툴팁 |
| 4 | `features/shell/components/work-panel.tsx` (신규) | `activeNav`별 패널 스위치. 카드형 컨테이너 |
| 5 | `features/shell/components/top-search-bar.tsx` (신규) | 전역 검색 + `Ctrl+K`. 로직은 기존 장소검색 재사용 |
| 6 | `features/shell/components/app-shell.tsx` (신규) | 4영역 레이아웃. `MapMarkerPage`가 이걸 사용 |
| 7 | `components/map-marker-page.tsx` | `MapSidebar` 제거 → `AppShell` 조립으로 교체 |
| 8 | `components/sidebar/map-sidebar.tsx` | **삭제**. 내부 섹션은 `WorkPanel`이 직접 렌더 |
| 9 | `components/sidebar/mode-tabs.tsx` | 세그먼트 컨트롤로 축소(레일로 옮긴 역할 제거) |
| 10 | `cctv/components/cctv-video-modal.tsx` | `SIDEBAR_WIDTH_PX=340` → 레일+패널 합산 폭으로 |
| 11 | `map/map-region-capture-panel-view.tsx` | `left-4` 절대배치가 새 패널과 겹침 → 오프셋 조정 |
| 12 | `features/shell/components/coming-soon.tsx` (신규) | 미구현 메뉴 공통 안내 |
| 13 | `docs/Ver_2.0/` | IA·DESIGN·COMPONENT 문서 갱신(1.1 구조 계승) |

## 6. 단계

| 단계 | 내용 | 산출 |
|---|---|---|
| 1 | 목업 라벨 확정 · 날씨 배치 확정 · 레일/패널 폭 확정 | 합의 |
| 2 | `AppShell` + `NavRail` 골격, 기존 사이드바를 패널에 통째로 끼워 동작 유지 | 화면 깨짐 없음 |
| 3 | `WorkPanel` 메뉴별 분해 — 지도·마커관리·CCTV·설정 | 기능 동등 |
| 4 | `TopSearchBar` + `Ctrl+K` | 검색 동작 |
| 5 | 340px 상수 정리, 반응형·키보드 접근성 | 회귀 없음 |

2단계에서 **기존 사이드바를 통째로 패널에 넣어 한 번 동작시킨 뒤** 분해한다.
한 번에 분해하면 어디서 깨졌는지 특정하기 어렵다.

## 7. 위험 요소

| 위험 | 영향 | 대응 |
|---|---|---|
| `mode`에 묶인 코드가 광범위 | 제거 시 기능 전반 회귀 | `mode` 유지, 표시 위치만 이동 |
| `backdrop-blur` 컨테이닝 블록 | 모달이 패널 안에 갇힘 | 모달은 계속 `body` 포털 유지 |
| 절대배치 패널 좌표 충돌 | 캡처 패널이 레일에 겹침 | 폭을 상수 한 곳(`shell/constants`)에서 관리 |
| 좁은 화면 | 레일+패널+지도 3단이 안 들어감 | 1024px 미만에서 패널 접힘 규칙 정의 |
| persist된 `mode` 값 | 개편 후 예상 못한 화면으로 복원 | `activeNav` 기본값 `map`으로 보정 |

## 8. 완료 기준

- [ ] 좌측 레일 7개 메뉴 렌더, 비활성 3개는 "준비 중" 표시
- [ ] 지도·마커관리·CCTV·설정 메뉴에서 **기존 기능이 모두 동작** (엑셀 업/다운로드, 필터, 백업/복원 포함)
- [ ] 전역 검색이 `Ctrl+K`로 열리고 장소 검색 결과가 지도에 반영
- [ ] CCTV 영상 모달·캡처 패널이 새 레이아웃에서 지도 영역 기준으로 정렬
- [ ] `tsc --noEmit` 0 · `eslint --max-warnings=0` 0 · `vitest` 전건 통과 · `next build` 성공
- [ ] 홈 First Load JS가 현재(295 kB) 대비 증가하지 않음
- [ ] 1280px·1024px·768px 폭에서 가로 스크롤 없음

## 9. 참고

- 이전 버전: `docs/Ver_1.1/Ver_1.1_PLAN.md` · `Ver_1.1_IA.md` · `Ver_1.1_COMPONENT.md`
- CCTV 도메인 경위: `docs/Ver_1.1/Ver_1.1_CCTV_PLAN.md` 부록 E
- 구조 점검 이력: `docs/PROJECT_ANALYSIS_2026-07-18.md`
- UI 표 규칙: 셀 줄바꿈 금지·가로 스크롤 금지 (`table-no-wrap`)
