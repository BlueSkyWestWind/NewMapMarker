# 의존 방향 정리 2차 (설계)

작성일 2026-11-15 · 대상: 피처 사이의 양방향 의존, 셸 내비 상태(`activeNav`·`mapSegment`), 공용 도메인 타입 · 구현계획: [Ver_3.0_의존방향정리2차_구현계획.md](Ver_3.0_의존방향정리2차_구현계획.md) · 구현: [Ver_3.0_의존방향정리2차_구현.md](Ver_3.0_의존방향정리2차_구현.md) · 1차: [Ver_3.0_의존방향정리_구현.md](../의존방향정리/Ver_3.0_의존방향정리_구현.md)

## 1. 배경과 결정 사항

1차(2026-11-14)는 인증을 `src/lib/auth/`로 옮기고 `src/lib`이 `src/features`를 import하지 못하게 막았다. 피처 사이의 방향은 아직 막지 않는다. `map-marker`는 여전히 지도 호스트이면서 데이터·타입의 공용 창구라, 다른 피처가 `map-marker`를 import하는 건수가 96건(테스트 제외)이고, 반대로 `map-marker`가 다른 피처 7곳을 import한다(33건). 이 문서는 **새 양방향 의존이 생기지 않게 막고(가드), 풀기 쉬운 것부터 줄이는** 설계다.

**사용자가 정한 것**

| # | 결정 | 날짜 |
|---|---|---|
| 1 | 동작 변경 없는 구조 리팩터. `AGENTS.md`의 하이드레이션 경계·`useActiveMarkers` 단일 호출 규칙을 유지한다 | 2026-11-14 |
| 2 | 1차에서 셸 내비 상태 분리는 위험이 커 뺐다(이 문서가 후속) | 2026-11-14 |
| 3 | 구현은 agy가 하고 Claude가 diff를 검토·수정한다 | 2026-11-14 |

**설계에서 정한 것(사용자 확인 대상은 §6)**

| # | 결정 |
|---|---|
| 4 | **먼저 래칫 가드**를 둔다. 지금 있는 피처 간 의존(피처 쌍 목록)을 허용 목록으로 고정하고, 목록에 없는 새 의존과 목록에만 남은 사라진 의존을 둘 다 테스트가 잡게 한다. 해소할 때마다 목록이 줄어든다 |
| 5 | 셸 내비 상태(`activeNav`·`mapSegment`)는 **분리하지 않는다**(대안 C). 이유는 §3.2 — 구현 단계에서 setter를 읽고 처음 추천한 분리안(새 persist 스토어)을 철회했다 |
| 6 | 공용 도메인 타입(`types/marker.ts`) 이동과 `shell` 상수 이동은 이번에 하지 않는다 |

## 2. 확인한 사실 (2026-11-15, 테스트 제외)

### 2.1 `map-marker`가 다른 피처를 import하는 곳

| 대상 피처 | 건수 | 대표 원인 |
|---|---:|---|
| `site-lists` | 8 | 상세 모달의 `SiteListMembership`, 백업·목록 훅, `full-backup*.ts`, `select-active-markers.ts` |
| `worksite-weather` | 6 | `location-marker.ts`, `overlay-content.ts`, 스토어의 날씨 타입 |
| `shell` | 5 | 스토어의 `types/nav`·`types/segment`, 페이지의 `AppShell`, 모달의 폭 상수 |
| `route` | 5 | 지도 경로 레이어 훅(`use-kakao-route-layer.ts`), 캔버스 |
| `gpsmap` | 5 | 페이지의 지적도 오버레이, 스토어·모달의 조회 |
| `group-admin` | 3 | 상세 모달(`useMarkerGroupActions`), `use-marker-list.ts` |
| `cctv` | 1 | 스토어의 `types/cctv` |

### 2.2 셸 내비 상태 `activeNav`·`mapSegment`

- 정의: `use-map-marker-store.ts`(persist 키 `map-marker-ui`의 `partialize`에 `mode`·`activeNav`·`mapSegment` 등이 함께 있다).
- 사용: 테스트를 제외하고 15개 파일 — `cctv-panel`, `dashboard-panel`, `use-auto-open-worksites`, `map-marker-page`, `use-marker-list`, `use-map-marker-store`, `app-shell`, `mobile-shell`, `nav-rail`, `nav-tree`, `panel-body`, `work-panel`, `use-map-left-offset`, `use-shell-nav`, `nav-model`.
- `src/features/shell/store/use-shell-store.ts`가 이미 있다. 이 스토어는 **persist하지 않는다**(서버 렌더와 첫 렌더가 같은 값이라 하이드레이션 경계를 늘리지 않으려는 의도적 설계). 따라서 내비 상태를 여기에 합치면 그 전제가 깨진다.
- 하이드레이션 규칙: persist 값의 마운트 전후 판정은 `map-marker-page.tsx` 한 곳에서만 한다(`AGENTS.md`).

### 2.3 공용 도메인 타입

`@/features/map-marker/types/marker`를 `map-marker` 밖에서 import하는 파일이 37개다. 타입만 있어 런타임 결합은 없다.

## 3. 설계

### 3.1 래칫 가드

- 위치: `src/lib/arch-guard.test.ts`에 규칙 `feature-edges`를 추가한다(1차의 `no-lib-to-feature` 옆).
- 동작: `src/features/<A>/`(테스트 제외)에서 `@/features/<B>/`를 import하면 방향 있는 쌍 `A->B`로 기록한다. 쌍 집합을 허용 목록(`ALLOWED_FEATURE_EDGES`, 각 항목에 이유)과 비교해 ① 목록에 없는 새 쌍, ② 목록에는 있는데 코드에는 없는 쌍(해소됐으니 목록에서 지운다)을 둘 다 실패로 한다.
- 추가로 **양방향 쌍(A->B와 B->A가 모두 있음)의 수**를 단언해, 현재 값보다 늘지 않게 한다(줄어들면 값을 갱신해야 실패하므로 줄 때마다 숫자를 낮춘다).
- 허용 목록의 초기 내용은 현재 코드에서 만든다(1차 조사에서 30쌍 안팎). 사람이 외우는 목록이 아니라 테스트가 출력하는 현재 쌍으로 채운다.

### 3.2 내비 상태 분리 — 하지 않는다 (대안 C)

처음 설계(2026-11-15 초안)는 `activeNav`·`mapSegment`를 새 persist 스토어로 분리하는 안 A를 추천했다. 구현을 맡기기 전에 `use-map-marker-store.ts`의 setter를 읽고 **이 추천을 철회했다.**

**근거 (`use-map-marker-store.ts`)**

- `setActiveNav`(281~345줄 부근)는 한 번의 `set`으로 `activeNav`, `mode`, `mapSegment`, `selectionByNav`, `selectedMarkerIds`, `selectedMarkerId`, `isMarkersVisible`, CCTV 상태(`cctvMarkers`·`selectedCctv`·`isCctvVisible`)를 함께 바꾼다. 다음 `mode`는 `lastDomainMode`와 현재 `mapSegment`로 결정되고, 다음 세그먼트는 `segmentOfMode(nextMode)`로 정한다.
- `setMapSegment`(240~270줄 부근)도 `mode`, `lastDomainMode`, `filters`, 선택, `isMarkersVisible`, CCTV 상태를 한 번에 바꾼다.
- 즉 내비 상태는 지도 상태(모드·필터·선택·마커 표시·CCTV)와 **한 트랜잭션**으로 움직인다.

**분리하면 생기는 문제**

- 한 스토어의 `set` 안에서 다른 스토어를 갱신해야 해서 갱신이 원자적이지 않다. 렌더 사이에 `mode`와 `activeNav`가 어긋난 상태가 보일 수 있다.
- `mode`는 `map-marker-ui`에, `activeNav`·`mapSegment`는 `nav-ui`에 따로 persist된다. 한쪽 저장만 갱신되거나 이관이 어긋나면 복원할 때 `mode`와 메뉴가 서로 맞지 않는다. 하이드레이션 안전값(`STORE_DEFAULT_*`)도 두 스토어에 걸쳐야 한다.
- 이득이 작다. `map-marker`→`shell` 의존은 스토어의 타입 import 2건 외에 `AppShell`(페이지)과 폭 상수(대화상자 2곳)가 남아 있어, 분리해도 순환은 풀리지 않는다.

**대안 비교**

| 대안 | 내용 | 판단 |
|---|---|---|
| A. 새 `use-nav-store.ts` | 상태와 setter를 새 persist 스토어로 | 철회 — 위 문제들 |
| B. 기존 `useShellStore`에 합침 | persist를 켜고 부분 저장 | 비-persist 설계를 깨고 A와 같은 문제가 있다 |
| **C. 분리하지 않음 (채택)** | 상태는 `map-marker` 스토어에 둔다. 가드로 새 의존만 막는다 | 위험 없음 |

**다시 하려면:** 상태가 아니라 **동작**을 먼저 분리해야 한다(예: 메뉴 전환 규칙을 순수 함수 `planNavChange(state, nav) → patch`로 빼고 스토어는 그 patch를 적용만 한다). 그 위에서만 상태 위치를 옮길 수 있다. 이번 범위가 아니다.

### 3.3 선택 작업

- **공용 타입 이동**: `map-marker/types/marker.ts`를 `src/types/marker.ts`로 옮기면 37개 파일의 import가 바뀐다. 얻는 것은 "도메인 타입은 공용"이라는 위치뿐이라 우선순위가 낮다.
- **셸 상수 이동**: `erp-changes-dialog.tsx`·`erp-review-dialog.tsx`가 모달 폭 상수를 `shell/constants.ts`에서 가져온다. `src/lib/layout.ts`로 올리면 `map-marker`→`shell` 한 줄이 사라지나, 폭 상수는 `AGENTS.md`가 `shell/constants.ts` 단일 소스로 정해 두었다. 규칙을 바꾸는 일이라 사용자 확인이 필요하다.

### 3.4 이번에 풀지 않는 역참조

`map-marker` → `site-lists`·`group-admin`·`worksite-weather`·`route`·`gpsmap`·`cctv`는 상세 모달·캔버스·페이지가 다른 피처 UI와 훅을 끌어 쓰는 구조다. 인터페이스 주입(플러그인 방식)으로 풀 수 있으나 설계 비용이 크고 얻는 것이 적다. 래칫 가드로 **늘지 않게만** 막고, 허용 목록에 이유와 함께 남긴다.

## 4. 범위 밖

- 셸 내비 상태 분리(위 §3.2).
- 역참조의 구조 변경(인터페이스 주입).
- `use-map-marker-store.ts`(637줄) 분할, 메뉴 전환 규칙의 순수 함수화.

## 5. 위험과 검증

- **허용 목록의 이유가 틀림**: 이유는 사람이 읽는 설명이라 테스트가 잡지 못한다. 근거 파일을 읽고 쓰고, 모르면 `확인 필요`로 적는다.
- **가드가 느슨함**: 새 쌍과 사라진 쌍을 둘 다 잡아야 한다. 구현 때 임시로 쌍을 지우고 가짜 import를 더해 둘 다 실패하는지 확인한다.
- **정규식 오탐**: 주석·문자열 안의 `@/features/`를 세면 허위 쌍이 생긴다. 주석 줄은 건너뛰고, 테스트 파일은 제외한다.
- **검증**: `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test`.

## 6. 사용자 확인 필요 항목

없음. 내비 상태 분리는 하지 않기로 했고(§3.2), 선택 작업(타입·상수 이동)도 이번에는 제외한다. 다르게 하고 싶은 것이 있으면 알려 달라.
