# 상태 관리 문서 (State)

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 문서 버전: **Ver_1.0**
- 최종 갱신: 2026-07-25
- 관련 문서: [IA §7](./Ver_1.0_IA.md) · [ARCHITECTURE](./ARCHITECTURE.md) · [COMPONENT](./COMPONENT.md) · [BUSINESS_RULE](./BUSINESS_RULE.md)

---

## 1. 상태 이원화 원칙

| 체계 | 담당 | 도구 | 저장소 |
| --- | --- | --- | --- |
| **클라이언트 UI 상태** | 모드·필터·선택·모달·대기 데이터 | Zustand 4 | 메모리 + 일부 `localStorage` |
| **서버 상태** | 마커·축전지·세션 | TanStack Query 5 | 쿼리 캐시 |

### 판단 기준

```
이 값이 서버에 존재하는가?
 ├ YES → TanStack Query (절대 Zustand에 복사해두지 않는다)
 └ NO  → Zustand
        ├ 새로고침 후에도 유지되어야 하는가?
        │   ├ YES → persist 대상 (mode · 클러스터 2종 · 지적편집도)
        │   └ NO  → persist 제외
        └ 한 컴포넌트에서만 쓰는가? → useState (스토어에 올리지 않는다)
```

> **금지 패턴**: 쿼리 결과를 `useEffect`로 Zustand에 복사하는 것. 캐시 무효화와 어긋나 stale 데이터의 원인이 된다.

## 2. Zustand — `use-map-marker-store`

### 2.1 슬라이스 전체

| 그룹 | 키 | 타입 | persist | 초기화 시점 |
| --- | --- | --- | :---: | --- |
| 모드 | `mode` | `'장비'\|'축전지'\|'위치'` | ● | — |
| 레이아웃 | `isSidebarOpen` | boolean | – | 세션 시작 |
| 지도 옵션 | `isClusteringEnabled` | boolean | ● | — |
| 지도 옵션 | `clusterIconStyle` | `'파이'\|'도넛'` | ● | — |
| 지도 옵션 | `isCadastralMode` | boolean | ● | — |
| 필터 | `filters` | 7종 Set | – | **모드 전환 시** |
| 필터 | `markerListFilter` | string | – | 모드 전환 시 |
| 대기 마커 | `pendingEquipmentMarkers` | array | – | 새로고침 시 소멸 |
| 대기 마커 | `pendingBatteryMarkers` | array | – | 새로고침 시 소멸 |
| 대기 마커 | `pendingLocationMarkers` | array | – | 새로고침 시 소멸 |
| 스테이징 | `stagedErpUpload` | object\|null | – | **의도적 비저장** |
| 선택 | `selectedMarkerId` | string\|null | – | 모드 전환 시 |
| 선택 | `selectedMarkerIds` | string[] | – | 모드 전환 시 |
| 모달 | `isDetailOpen` | boolean | – | — |
| 모달 | `isEditOpen` | boolean | – | — |
| 모달 | `isRoadviewOpen` | boolean | – | — |
| 모달 | `roadviewPosition` | `{lat,lng}`\|null | – | — |
| 캡처 | `isInfoWindowCaptureMode` | boolean | – | — |
| 검색 | `placeSearch` | 필지 경계 결과 | – | — |

### 2.2 persist 정책

```
localStorage key : map-marker-ui
저장 대상        : mode · isClusteringEnabled · clusterIconStyle · isCadastralMode
```

| 값 | 저장 | 이유 |
| --- | :---: | --- |
| `mode` | ● | 담당자가 늘 같은 모드로 시작한다 |
| 클러스터 on/off · 아이콘 스타일 | ● | 개인 선호(FR-10, UC-23) |
| 지적편집도 | ● | FR-03 수용 기준 |
| `pendingLocationMarkers` | ✕ | **임시 데이터임을 명시**(위치 모드 배너 "새로고침 시 사라집니다") |
| `stagedErpUpload` | ✕ | 미커밋 데이터가 세션을 넘어 남으면 오적용 위험(UC-15 5b) |
| `filters` | ✕ | 모드별 축이 달라 복원 시 혼란 |
| 선택·모달 | ✕ | 세션 컨텍스트 |

> ⚠️ persist 대상을 늘릴 때는 **"이 값이 잘못 복원되면 사용자가 오해할 수 있는가"**를 먼저 묻는다. 미저장 데이터가 저장된 것처럼 보이는 상태가 가장 위험하다.

### 2.3 상태 전이 규칙

| 트리거 | 변경 |
| --- | --- |
| **모드 전환** | `filters` 초기화 · `selectedMarkerId` null · `selectedMarkerIds` [] |
| **로그아웃** | 위치 모드였다면 → `mode = '장비'` 강제 전환, 인증 전용 섹션 은닉 |
| 마커 클릭/목록 클릭 | `selectedMarkerId` 설정 → `isDetailOpen = true` |
| 상세 → 편집 | `isEditOpen = true` (상세는 유지 또는 닫힘, 구현 일관 유지) |
| 캡처 진입 | `isInfoWindowCaptureMode = true` → 정보창 분리 배치 |
| 캡처 종료 | `isInfoWindowCaptureMode = false` → 원위치 복귀 |
| ERP 업로드 [적용] | `stagedErpUpload = null` + 쿼리 무효화 |
| ERP 업로드 [취소] | `stagedErpUpload = null` (DB 무변경) |

### 2.4 대기(pending) 마커의 의미

| 종류 | 성격 | DB |
| --- | --- | :---: |
| `pendingEquipmentMarkers` | 업로드 처리 중/직후 임시 표시 | 커밋 대상 |
| `pendingBatteryMarkers` | 동일 | 커밋 대상 |
| `pendingLocationMarkers` | **위치 모드 임시 마커** | ✕ 저장 안 함 |

지도 표시 색: 대기 = 앰버 `#f59e0b`, 위치 모드 임시 = 레드 `#ef4444` (DESIGN §2.3).

## 3. TanStack Query — 서버 상태

### 3.1 쿼리 키

| 키 | 훅 | 데이터 | 무효화 트리거 |
| --- | --- | --- | --- |
| `["map-marker","markers"]` | `use-map-markers-query` | `MapMarkersPayload` (장비+축전지 일괄) | 마커 CRUD · 그룹 조작 · 엑셀 업로드 · 복원 |
| `["map-marker","auth-session"]` | `use-auth-session` | Supabase 세션 | 로그인 · 로그아웃 · 토큰 갱신 |

### 3.2 무효화 매트릭스

| 동작 | 무효화 대상 |
| --- | --- |
| 마커 편집·삭제·좌표 이동 | `["map-marker","markers"]` |
| 그룹 분리 / 합치기 / 구분 변경 / 동 개별 표시 | `["map-marker","markers"]` |
| 장비·축전지·ERP 엑셀 커밋 | `["map-marker","markers"]` |
| 백업 복원 | `["map-marker","markers"]` |
| 로그인 / 로그아웃 | `["map-marker","auth-session"]` (+ 모드 강제 전환) |
| 위치 모드 임시 마커 추가 | **없음** (스토어 전용) |

> 마커 쿼리는 **단일 키**다. 부분 무효화를 도입하려면 키를 모드별로 분리해야 하며, 그 경우 그룹 판정이 전체 집합을 필요로 한다는 점을 함께 고려한다.

### 3.3 캐시 정책

| 항목 | 값 | 근거 |
| --- | --- | --- |
| 중복 요청 억제 | 동일 키 in-flight 공유 | NFR-09 |
| 재조회 | 변경 동작 후 명시적 무효화 | 사내 단일 사용자 편집이 대부분 |
| 낙관적 업데이트 | **사용하지 않음** | 그룹 조작이 다단계·비원자적이라 롤백이 어려움(RK4) |

## 4. 파생 상태 — `use-active-markers`

지도와 목록이 공유하는 **단일 렌더 대상 산출 파이프라인**이다.

```
입력
 ├ 쿼리 결과 markers / batteryMarkers
 ├ store.mode
 ├ store.filters
 └ store.pending*Markers

파이프라인
 ① 모드 선택        장비 → markers / 축전지 → batteryMarkers / 위치 → pendingLocationMarkers
 ② 필터 적용        marker-filters.ts (제외 사유 집계 동반)
 ③ 대기 마커 병합    pending* 를 앞쪽에 합침
 ④ 렌더 조건 적용    parentMarkerId == null || detachedVisible == true
 ⑤ 좌표 유효성      lat/lng null → 렌더 제외 + "좌표 없음 N건" 집계

출력
 ├ renderMarkers[]      지도 마커 레이어
 ├ listMarkers[]        사이드바 목록 (검색어 추가 적용)
 ├ excludedCounts       필터별 제외 건수
 └ missingCoordCount    좌표 없음 건수
```

**규칙**
- ④의 렌더 조건은 **여기 한 곳에서만** 판정한다. 개별 컴포넌트가 다시 걸러내지 않는다.
- ②의 필터 함수는 순수 함수여야 하며 단위 테스트를 유지한다.
- 결과는 메모이제이션한다. 입력이 바뀌지 않으면 재계산하지 않는다.

## 5. 훅 목록과 소유 상태

| 훅 | 소유/읽는 상태 | 부수효과 |
| --- | --- | --- |
| `use-kakao-map-sdk` | SDK ready(로컬) | 스크립트 로드 감시 |
| `use-map-markers-query` | 쿼리 `["map-marker","markers"]` | Supabase select |
| `use-auth-session` | 쿼리 `["map-marker","auth-session"]` | 세션 구독, 로그아웃 시 모드 전환 |
| `use-active-markers` | 파생(소유 없음) | 없음 |
| `use-marker-edit-form` | react-hook-form 로컬 | 저장 시 쿼리 무효화 |
| `use-excel-upload-actions` | `pending*` · `stagedErpUpload` 갱신 | 파싱·지오코딩·DB 커밋·토스트 |
| `use-data-backup-actions` | 없음(작업형) | 백업 파일 생성 / 복원 후 무효화 |

## 6. 상태 수명 요약

| 상태 | 컴포넌트 언마운트 | 모드 전환 | 새로고침 | 로그아웃 |
| --- | :---: | :---: | :---: | :---: |
| `mode` | 유지 | — | **유지** | 위치→장비 강제 |
| 지도 옵션 3종 | 유지 | 유지 | **유지** | 유지 |
| `filters` | 유지 | **초기화** | 초기화 | 유지 |
| 선택 상태 | 유지 | **초기화** | 초기화 | 유지 |
| `pendingLocationMarkers` | 유지 | 유지 | **소멸** | 소멸(모드 전환) |
| `stagedErpUpload` | 유지 | 유지 | **소멸** | 소멸 |
| 쿼리 캐시 | 유지 | 유지 | 재조회 | 재조회 |

## 7. 안티패턴

| ✕ 하지 말 것 | ○ 대신 |
| --- | --- |
| 쿼리 결과를 스토어에 복사 | 쿼리를 직접 구독 |
| 컴포넌트마다 렌더 조건 재구현 | `use-active-markers` 결과 사용 |
| 그룹 판정 결과를 스토어에 캐싱 | 유효 키로 매번 파생(단일 진실 원천 유지) |
| `stagedErpUpload`를 persist | 미커밋 데이터는 세션 한정 |
| 모달 open 여부를 URL로 관리 | 스토어 boolean 유지(Ver_1.0 범위) |
| 필터 상태를 URL 쿼리로 동기화 | Ver_1.0 범위 외 (도입 시 모드 전환 초기화 규칙과 충돌 검토 필요) |

## 8. 디버깅 체크리스트

| 증상 | 확인 순서 |
| --- | --- |
| 편집했는데 지도에 반영 안 됨 | 쿼리 무효화 호출 여부 → `use-active-markers` 필터 → 렌더 조건 |
| 마커가 사라짐 | 좌표 null 여부 → 필터 제외 건수 → SUB로 전환됐는지(대표 1핀 원칙) |
| 새로고침 후 위치 마커 소멸 | **정상 동작**(persist 제외) |
| 모드 바꾸니 필터가 풀림 | **정상 동작**(전이 규칙) |
| 분리했는데 핀이 안 보임 | 새 대표가 원 대표와 **같은 좌표에 겹침** → 드래그 안내 |
| 로그아웃했더니 화면이 바뀜 | 위치 모드 → 장비 모드 강제 전환 규칙 |
