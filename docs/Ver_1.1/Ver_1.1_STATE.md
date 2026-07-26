# Ver_1.1 상태 관리 문서 (State Management)

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 문서 버전: **Ver_1.1**
- 최종 갱신: 2026-07-26
- 관련 문서: [IA §7](./Ver_1.1_IA.md) · [COMPONENT](./Ver_1.1_COMPONENT.md) · [ARCHITECTURE](./Ver_1.1_ARCHITECTURE.md)

---

## 1. 상태 이원화 원칙

| 계층 | 도구 | 대상 |
| --- | --- | --- |
| 서버 상태 | TanStack Query | Supabase 마커, 기상 판정 |
| UI 상태 | Zustand | 모드·선택·모달·필터·저장 국소 |
| 로컬 상태 | `useState` | 폼 입력, 컴포넌트 내부 토글 |
| **파생 상태** | `useMemo` / 계산식 | 활성 마커, 검색 결과, **선택 국소** |

**Ver_1.1 강조**: 파생 가능한 값은 state로 두지 않는다. §7 참조.

## 2. Zustand — `use-map-marker-store`

### 2.1 상태 필드

| 필드 | 타입 | persist |
| --- | --- | --- |
| `mode` | `MapMode` (4종) | ✓ |
| `isSidebarOpen` | boolean | ✗ |
| `isClusteringEnabled` | boolean | ✓ |
| `clusterIconStyle` | `ClusterIconStyle` | ✓ |
| `isCadastralMode` | boolean | ✓ |
| `markerListFilter` | string | ✗ |
| `filters` | `MarkerFilterState` | ✗ |
| `pendingEquipmentMarkers` / `pendingBatteryMarkers` / `pendingLocationMarkers` | `MarkerRecord[]` | ✗ |
| `stagedErpUpload` | `StagedErpUpload \| null` | ✗ |
| `selectedMarkerId` / `selectedMarkerIds` | string / string[] | ✗ |
| `isInfoWindowCaptureMode` | boolean | ✗ |
| `isDetailOpen` / `isEditOpen` / `isRoadviewOpen` | boolean | ✗ |
| `roadviewPosition` | 좌표+이름 | ✗ |
| `placeSearch` | `PlaceSearchResult \| null` | ✗ |
| **`weatherSearchMarkerIds`** | `string[] \| null` | ✗ |
| **`savedWeatherSites`** | `SiteMatch[]` | **✓** |

> ⚠️ **Ver_1.1 사고 사례**: 날씨 필드를 추가하면서 인터페이스의 `placeSearch` **선언만 삭제**되어
> 초기값·setter·소비자가 남은 채 빌드가 깨졌다. 상태 추가 시 기존 필드 선언을 건드리지 않았는지 확인한다.

### 2.2 Ver_1.1 신규 액션

| 액션 | 동작 |
| --- | --- |
| `setWeatherSearchMarkerIds(ids \| null)` | 날씨 모드 지도 마커 필터. `null`이면 전체 |
| `saveWeatherSites(sites)` | 오늘의 작업 국소 저장 (덮어쓰기) |
| `clearSavedWeatherSites()` | 전체 삭제 |
| `removeSavedWeatherSite(id)` | 개별 삭제 |

### 2.3 모드 전환 부수효과

`setMode`는 다음을 초기화한다: `filters` · `selectedMarkerId` · `selectedMarkerIds` · **`weatherSearchMarkerIds`**.
`savedWeatherSites`는 유지된다(모드와 무관한 작업 목록).

### 2.4 `MapMode` 확장 시 필수 처리

`MapMode`에 값을 추가하면 **`.exhaustive()` 지점 2곳**을 반드시 처리해야 한다.
누락 시 런타임에서 throw 된다.

| 위치 | 용도 |
| --- | --- |
| `use-map-marker-store.ts` `getPendingKey()` | pending 키 매핑 |
| `map-sidebar.tsx` `countLabel` | 건수 요약 문구 |

> `weather` 모드는 `pendingEquipmentMarkers`를 공유한다.
> `use-active-markers`도 날씨 모드에서 장비 마커를 쓰므로 일관적이다.

## 3. TanStack Query — 서버 상태

| 키 | 훅 | staleTime |
| --- | --- | --- |
| `MAP_MARKER_QUERY_KEY` | `useMapMarkersQuery` | 30초 |
| `['worksite-weather', key]` | `useWorksiteWeather` | **10분** |

### 3.1 `useWorksiteWeather`

```
queryKey  ['worksite-weather', worksiteWeatherKey(site)]
enabled   !!site
retry     1
queryFn   fetchWorksiteWeather (lib/worksite-weather-api)
```

`worksiteWeatherKey`는 **좌표·작업형태·지역**으로 만든다. 마커 id가 달라도 같은 좌표면 같은 키다.

## 4. 3단 캐시 구조 (Ver_1.1)

```
[컴포넌트]  useWorksiteWeather        ─ TanStack Query (staleTime 10분)
                    │
[모듈]      fetchWorksiteWeather      ─ Map 캐시 TTL 10분 + in-flight 병합
                    │                   ↑ 지도 오버레이도 여기를 공유
[서버]      kma-client.ts             ─ isolate 메모리 캐시
                                        단기 3h / 초단기 50m / 특보 10m
```

**모듈 캐시가 핵심이다.** 지도 정보창은 React 밖의 DOM 빌더라 Query 훅을 쓸 수 없다.
모듈 캐시를 두지 않으면 마커를 열 때마다 기상청 API가 4건씩 새로 나간다.

### 4.1 실패는 캐시하지 않는다

`inFlight`에서만 제거하고 `responseCache`에는 넣지 않는다. 재시도가 가능해야 한다.

## 5. 파생 상태 — `use-active-markers`

Ver_1.0 로직에 날씨 모드 분기가 추가됐다.

```
mode === 'location'  → pendingLocationMarkers
mode === 'equipment' | 'weather' → equipmentMarkers + pendingEquipmentMarkers
mode === 'battery'   → batteryMarkers + pendingBatteryMarkers

if (mode === 'weather') {
  weatherSearchMarkerIds !== null → 검색된 마커만
  savedWeatherSites.length > 0    → 저장된 국소만
}
```

## 6. 날씨 패널 상태 — 파생 우선 설계

### 6.1 상태와 파생

```
[state]  query · selectedId · geocodeSite · isGeocoding · searchError
         isSatelliteModalOpen · isTyphoonModalOpen

[파생]   isSearchActive = Boolean(query.trim())
         candidates     = useMemo(마커 → SiteCandidate[])
         searchResults  = useMemo(searchSitesMulti)
         activeList     = isSearchActive ? searchResults : savedWeatherSites
         site           = geocodeSite ?? activeList.find(selectedId) ?? activeList[0] ?? null
         selectedIndex  = activeList에서 site 위치
```

### 6.2 왜 `site`를 state로 두지 않는가

Ver_1.1 초기 구현은 `site`를 state로 두고 **`useEffect` 3개가 각자 `setSite`** 를 호출했다.

| 위치 | 트리거 |
| --- | --- |
| effect A | `[query, searchResults]` → 첫 결과 선택 |
| effect B | `[mode]` → 초기화 |
| effect C | `[savedWeatherSites, query, site]` → 저장 목록 첫 항목 |

**증상**: 목록에서 3번째를 골라도 검색어가 한 글자 바뀌면 1번째로 되돌아간다.
이전/다음으로 옮긴 선택도 같은 방식으로 날아간다.

**해결**: 선택을 `selectedId`(사용자 의도)로만 두고 나머지는 파생. effect 3개 → 1개.

### 6.3 남은 effect 2개 (둘 다 정당함)

| effect | deps | 역할 |
| --- | --- | --- |
| 지도 이동 | `[site]` | `useRef` 가드로 같은 국소 반복 이동 방지 |
| 모드 초기화 | `[mode]` | 다른 국소 목록으로 전환 |
| (검색 결과 → 스토어) | `[mode, query, searchResults]` | 지도 마커 필터 동기화 |

검색어 변경 시 선택 초기화는 **effect가 아니라 `changeQuery` 이벤트 핸들러**에서 한다.

## 7. 안티패턴

| 안티패턴 | 대안 |
| --- | --- |
| 파생 가능한 값을 state로 두기 | 계산식 / `useMemo` |
| 여러 effect가 같은 state를 씀 | 소유권을 한 곳으로. 이벤트 핸들러 우선 |
| 사용자 선택을 effect가 덮어씀 | 사용자 의도(`selectedId`)를 별도로 보존 |
| React 밖 DOM에서 Query 우회 호출 | 공유 모듈 캐시 경유 |
| `lib`에서 `hooks` import | 요청 함수를 `lib`로 이동 |
| 상태 추가 시 기존 선언 삭제 | 추가만. `tsc`로 확인 |
| 컴포넌트에 표기 상수 재정의 | `types/weather.ts` 참조 |

## 8. 상태 수명 요약

| 상태 | 수명 |
| --- | --- |
| `mode`·클러스터·지적도 | localStorage 영속 |
| **`savedWeatherSites`** | **localStorage 영속** |
| pending 마커·staged 업로드 | 탭 세션 |
| 선택·모달·필터 | 모드 전환 시 초기화 |
| 마커 쿼리 | 30초 stale |
| 기상 판정 | 10분 (3단 캐시) |
| 날씨 패널 선택 | 모드 전환·검색어 변경 시 초기화 |

## 9. 디버깅 체크리스트

| 증상 | 확인 |
| --- | --- |
| 날씨 조회가 안 됨 | 인증키 설정 → 활용신청 승인 → 좌표 국내 여부 |
| 특보가 항상 비어 있음 | `region` 파라미터 전달 여부, `warnings` 확인 |
| 판정이 화면마다 다름 | 컴포넌트에 등급 맵 재정의했는지 |
| 선택이 자꾸 리셋됨 | `setSite` 계열을 effect에서 호출하는지 |
| 마커가 일부만 보임 | `fetchAllRows` 우회해 `select('*')` 단발 호출했는지 |
| 저장 국소가 지도에 없음 | 원본 마커 삭제 여부 (동기화 미구현) |
| 배포 후에만 `NO_DATA` | KST 보정 누락 (Workers는 UTC) |
