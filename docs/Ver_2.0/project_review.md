# MapMarker Pro - 구조 점검 이력 (Project Review History)

본 문서는 프로젝트 구조 파악과 그때 발견한 문제점을 누적 기록합니다. 최신 점검을 상단에 추가합니다.
발견 항목은 근거(파일·줄)와 함께 적고, 해소되면 그 자리에 「해소: [날짜] 조치」를 덧붙입니다.

> 위치: `docs/Ver_2.0/project_review.md`. 이후 점검도 **이 파일에 누적**합니다.
> 회차별로 새 파일을 만들지 않습니다.

---

## [2026-08-01] 1차 구조 점검 — Ver 2.0 계획 대비 현행 구조 검증

점검 범위: `src/` **160파일 · 29,095줄** 전체 + `docs/Ver_2.0/` 문서 5종.
계획서가 코드에 대해 주장하는 내용을 **한 건씩 실측 대조**하는 데 초점을 뒀다.
검증 실행: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test`.

### 1. 구조 요약

#### 1.1 레이어 트리

```
src/
├── app/                          Next.js App Router
│   ├── page.tsx                  홈 — MapMarkerPage 하나만 띄운다
│   ├── providers.tsx             QueryClient · Theme · Auth
│   ├── gpsmap/page.tsx           주소/좌표 통합 변환기 (별도 라우트)
│   └── api/                      5개 라우트 (아래 1.3)
│
├── features/map-marker/          69파일 — 지도·마커 본체
│   ├── components/map-marker-page.tsx   (101) 사이드바 + 지도 + 모달 조립. useActiveMarkers 단일 호출점
│   ├── components/sidebar/              12파일 — 좌측 전부. map-sidebar(350)가 모드별 분기 담당
│   ├── components/map/                  kakao-map-canvas(1,068) 지도 인스턴스·오버레이·캡처
│   ├── components/modals/               marker-detail-modal(2,016) 최대 파일
│   ├── hooks/use-active-markers.ts      (175) 모드별 마커 목록 + 필터 옵션 파생. 스토어에 쓰기도 한다
│   ├── lib/overlay-content.ts           (739) 정보창 DOM 빌더 (React 아님)
│   ├── lib/excel/                       full-backup(836) · parse(506) 엑셀 입출력
│   └── store/use-map-marker-store.ts    (304) Zustand + persist. UI 상태 단일 소스
│
├── features/worksite-weather/    기상 판정 도메인 — lib 12모듈이 전부 순수함수, 테스트 밀집
│   ├── components/worksite-weather-panel.tsx (559) 검색·저장·결과표시 한 파일
│   ├── lib/verdict.ts                   판정 엔진 (테스트 41건)
│   ├── lib/kma-client.ts                (490) 서버 전용 기상청 호출
│   └── types/weather.ts                 VERDICT_* 표기 상수 단일 소스
│
├── features/cctv/                ITS 도로 CCTV — 조회 패널 + 영상 모달
├── features/gpsmap/              gpsmap-page(745) 변환기 전체가 한 파일
└── lib/api/proxy-guard.ts        프록시 라우트 공통 가드 (origin + 레이트리밋)
```

#### 1.2 주요 데이터 흐름

| 기능 | 흐름 |
| --- | --- |
| 마커 표시 | `mode` 변경 → `useActiveMarkers` → (weather면 빈 배열) → `KakaoMapCanvas` 렌더 |
| 필터 | `FilterPanel` → 스토어 `filters` → `useActiveMarkers.effectiveFilters` → 지도·목록 |
| 기상 판정 | 국소 좌표 → `/api/worksite-weather` → 기상청 4종 병렬 → `buildTimeline` → `evaluateSlot` → `overallVerdict` |
| 기상 캐시 | 클라이언트 모듈 캐시(10분) ← 지도 오버레이와 사이드바가 **공유** |
| CCTV | 브라우저 → `/api/its-key`(런타임 키) → ITS 직접 호출 → 스토어 `cctvMarkers` → 지도 |
| 백업 | `exportFullExcel()` → 장비+축전지 **통합 파일 하나** |

#### 1.3 외부 표면과 신뢰 경계

| 라우트 | 가드 |
| --- | --- |
| `/api/kakao-static-map` · `/api/map-tile-proxy` · `/api/roadview-dates` | `guardProxyRequest` |
| `/api/worksite-weather` | origin 검사 + 파라미터 검증(격자 범위 포함) |
| `/api/its-key` | `guardProxyRequest` — origin 허용목록 + IP 레이트리밋 |

`isSameOriginRequest`는 Origin/Referer가 **둘 다 없으면 통과**시키고 레이트리밋으로 막는다
(`proxy-guard.ts:43` 주석에 근거 명시). 의도된 트레이드오프다.

#### 1.4 설계상 잘 지켜지고 있는 것 — 점검했으나 문제 없음

- **검증 전건 통과**: `tsc --noEmit` 0 · `eslint --max-warnings=0` 0 · `vitest` **254건 / 18파일 통과**(6.7초).
- **시크릿 위생**: `.gitignore:35`에 `.env*`. `git ls-files`에 추적되는 `.env`·`*.pem`·`*.key`·credential **없음**.
- **표기 단일 소스**: `VERDICT_RANK/ICON/LABEL/TONE`·`SLOT_SOURCE_LABEL`이 `types/weather.ts`에만 있고, 컴포넌트 재정의 없음.
- **순수 계층 분리**: `worksite-weather/lib/` 12모듈이 React 비의존이라 테스트가 촘촘하다. 테스트 18파일 중 **17개가 `lib/`**.
- **`.test.tsx` 0개**: `vitest.config.ts`의 `include`가 `.ts`뿐이라 `.tsx` 테스트는 실행되지 않지만, **현재 그런 파일이 없어 조용히 누락되는 테스트는 없다.**
- **계획서 인용 좌표 전건 실재**: `map-sidebar.tsx:130`(`w-[340px]`) · `filter-panel.tsx:115`(`mode === 'equipment'`) · `cctv-video-modal.tsx:18`(`SIDEBAR_WIDTH_PX = 340`) · `map-region-capture-panel-view.tsx:95`(`left-4`) · `use-active-markers.ts:65`(weather 분기) · `use-map-marker-store.ts:153`(`setMode`) 모두 확인.
- **계획서 §3.3 재사용 자산 전건 실재**: `hazard-summary-list` · `weather-timeline-table` · `typhoon-banner` · `worksite-weather-api` · `map-floating-controls` · `cctv-panel`.
- **계획서 §9 참조 문서 실재**: `Ver_1.1_CCTV_PLAN.md:685` 부록 E 존재.
- **지오코딩 국소의 id 불일치 우려 없음**: `geocode:{주소}` 형태의 합성 id를 갖는 `SiteMatch`는 `worksite-weather-panel.tsx:232`에서 만들어지지만, 저장 경로(`saveWeatherSites(searchResults)`, 같은 파일 325행)는 **검색 결과만** 저장한다. 따라서 `savedWeatherSites`의 id는 항상 실제 마커 id다.

### 2. 발견된 문제점

#### 높음

**H-1. 대시보드 마커 규칙을 그대로 되살리면 축전지 국소가 지도에서 누락된다 (계획 §3.4)**

- 위치: 계획서 §3.4 「`savedWeatherSites`의 id로 걸러 낸 목록으로 바꾼다 … Ver 1.1에서 한 번 있다가 제거된 로직이라 되살리는 형태다」
- 근거: 제거된 원본 로직(`git show 2c6e542`)은 `merged`를 걸렀는데, 그 `merged`는 weather 모드에서 **`data.equipmentMarkers`만** 담았다(`isEquipmentOrWeather` 분기). 반면 저장 후보는 `worksite-weather-panel.tsx:95-106`에서 **장비+축전지를 통합**해 만든다.
- 즉 축전지 마커로 저장한 국소는 `savedWeatherSites`에는 들어가지만 걸러 낼 대상 배열에 없어 **지도에 뜨지 않는다.**
- 영향: 계획서 §8 완료 기준 「지도 마커 건수와 대시보드 목록 건수가 항상 일치」가 **조용히 깨진다.** 작업 가능 여부를 판단하는 화면이라 누락이 그대로 오판으로 이어진다.
- 제안: 복원 시 `equipmentMarkers`가 아니라 **두 도메인을 합친 목록**에서 거른다. 건수 일치를 단위 테스트로 고정한다(현재 `use-active-markers`에 테스트 없음 — H-2 참조).
- **해소: [2026-08-01] 사용자 결정 — 「대시보드에서는 축전지 마커를 볼 필요 없음」.**
  장비 마커만 거르는 것이 의도된 동작으로 확정. 대신 **건수 일치 기준을 폐기**하고
  「지도 마커 ⊆ 목록」으로 바꿨다(계획서 §3.4·§8). 마커 없는 국소를 클릭하면 좌표 이동만 한다.

**H-2. `useActiveMarkers`에 테스트가 없다**

- 위치: `src/features/map-marker/hooks/use-active-markers.ts` (175줄) — 대응하는 `.test.ts` 없음
- 근거: 테스트 18파일 중 17개가 `lib/` 순수함수. 이 훅은 마커 목록 결정 + `setFilters` 부수효과 2개를 동시에 갖는데 회귀 안전망이 없다.
- 영향: Ver 2.0에서 이 파일의 weather 분기를 바꾼다(작업항목 17). H-1이 실제로 발생해도 **아무 테스트도 실패하지 않는다.**
- 제안: 마커 선별 로직(`markers` useMemo)을 순수함수로 추출해 `lib/`에 두고 테스트를 붙인다. 훅 자체를 테스트하는 것보다 싸다.
- **해소: [2026-08-01]** `lib/select-active-markers.ts`로 추출하고 `select-active-markers.test.ts` **10건** 작성.
  4모드 × 조합(DB만·pending만·id 중복·로드 전 null)과 입력 불변성을 고정했다. **동작은 그대로다.**
  날씨 분기의 현재 규칙(`return []`)도 테스트로 고정해, Ver 2.0에서 바꿀 때 의도한 변경인지 드러난다.

#### 중간

**M-1. `weatherSearchMarkerIds`가 쓰기 전용 상태다**

- 위치: 쓰기 `worksite-weather-panel.tsx:115-129` / 정의 `use-map-marker-store.ts:51,144-145,162` / **읽는 곳 없음**
- 근거: 소비처였던 `use-active-markers`의 분기가 `2c6e542`에서 제거됐다. 커밋 메시지도 "스토어에는 유지"라고 적고 있다. 현재 날씨 탭에서 검색할 때마다 `setWeatherSearchMarkerIds`가 스토어를 갱신하지만 아무도 읽지 않는다.
- 영향: 검색 입력마다 불필요한 스토어 갱신. 더 큰 문제는 **Ver_1.1 IA §7.1이 이 필드를 "날씨 모드 지도 마커 필터"로 설명**하고 있어, Ver 2.0 구현자가 이미 동작하는 기능으로 오인할 수 있다.
- 제안: Ver 2.0 §3.4 구현 시 함께 정리한다 — 되살려 쓰거나(대시보드 검색 필터), 필드·setter·`setMode`의 초기화까지 삭제하거나 둘 중 하나. 지금처럼 반만 남겨두지 않는다.
- **해소: [2026-08-01] 삭제** — 필드·setter·`setMode`의 초기화·패널의 `useEffect` 전부 제거.
  대시보드 검색 필터가 필요해지면 그때 소비처와 함께 만든다. Ver_2.0 IA §6.1에 무효 사실을 명시했다.

**M-2. 계획 작업항목 #11(캡처 패널 오프셋 조정)은 전제가 틀렸다**

- 위치: 계획서 §5 항목 11 「`map-region-capture-panel-view.tsx` — `left-4` 절대배치가 새 패널과 겹침 → 오프셋 조정」
- 근거: 이 패널은 `kakao-map-canvas.tsx:1023`에서 렌더되고, 캔버스 루트가 `kakao-map-canvas.tsx:957`의 `<div className="relative h-full w-full">`다. 그 위는 `map-marker-page.tsx`의 `<main className="relative min-w-0 flex-1">`. **`absolute left-4`는 지도 영역 기준**이므로 좌측에 레일·패널이 늘어도 겹치지 않는다.
- 영향: 필요 없는 파일을 건드리게 된다(§0.3 최소 변경 위반). 오프셋을 더하면 오히려 지도 안쪽으로 340px 밀려 **없던 버그가 생긴다.**
- 제안: 항목 11을 「오프셋 조정」이 아니라 「폭 `w-[340px]`을 상수 참조로 교체」로 축소한다. 실제 위험은 다른 데 있다 — 지도 영역이 1024px 화면에서 484px로 줄어드는데 이 패널이 340px를 차지한다(M-3).
- **해소: [2026-08-01]** 계획서 §5 항목 11을 「오프셋은 건드리지 않는다」로 고치고, 근거를 §3.10에 적었다.

**M-3. 좁은 화면에서 캡처 패널이 지도 대부분을 덮는다**

- 위치: `map-region-capture-panel-view.tsx:95` — `w-[340px]`
- 근거: Ver 2.0에서 좌측 점유가 340 → 540px로 는다. 1024px 화면 기준 지도 영역은 684 → **484px**. 그 안에 340px 패널이 뜨면 남는 지도는 144px다.
- 영향: 영역 캡처 기능이 좁은 화면에서 사실상 못 쓰게 된다. 계획서 §8의 「1024px에서 가로 스크롤 없음」은 통과하지만 실사용은 막힌다.
- 제안: DESIGN §3의 반응형 규칙에 캡처 패널을 포함한다. 1024px 미만에서 패널 폭을 줄이거나 하단 배치로 전환.
- **해소: [2026-08-01] 설계 확정** — DESIGN §3.1 신설, 계획서 §3.10 추가. 구현은 6단계(반응형) 몫이다.

**M-4. 메뉴 전환이 필터·CCTV 조회 결과를 초기화한다**

- 위치: `use-map-marker-store.ts:153-167` — `setMode`가 `filters`·`selectedMarkerId(s)`·`weatherSearchMarkerIds`·`cctvMarkers`·`selectedCctv`를 비운다
- 근거: 대시보드는 `mode: 'weather'`를 쓰기로 했다(계획 §3.1). 지도 ↔ 대시보드 왕복만으로 `equipment → weather → equipment`가 되어 두 번 초기화된다.
- 영향: 필터를 걸어둔 채 날씨를 확인하고 돌아오면 필터가 풀려 있다. Ver_1.1에서는 사용자가 탭을 직접 누를 때만 일어나 납득됐지만, 메뉴 이동은 빈도가 다르다.
- 제안: 메뉴 전환 전용 액션을 두어 초기화를 건너뛴다. 세그먼트를 직접 누른 경우(진짜 도메인 전환)에는 현행 유지.
- 기록: COMPONENT §7.3에 3단계 결정 사항으로 등재됨.
- **해소: [2026-08-01] 설계 확정** — 계획서 §3.9. **메뉴 이동은 보존, 세그먼트 전환은 초기화.**
  `setActiveNav`가 `mode`만 바꾸고 `setMode`의 현행 동작은 세그먼트용으로 남긴다. 구현은 2~3단계 몫.

**M-5. 백업/복원의 도메인 비대칭 — 장비에는 일괄 삭제 수단이 없다**

- 위치: `backup-restore-section.tsx:61` — `mode === 'battery'`일 때만 삭제 버튼. `use-data-backup-actions.ts:290-296`의 반환값에 `deleteAllBatteryMarkers`(295행)만 있다.
- 근거: 같은 성격의 두 도메인인데 한쪽에만 정리 수단이 있다(§1-4 비대칭 점검).
- 영향: 장비 데이터를 일괄 정리하려면 DB를 직접 만져야 한다. 또한 UI상 버튼이 모드에 따라 나타났다 사라져 사용자에겐 불규칙해 보인다.
- 제안: **이번 버전에서 만들지 않는다**(계획 §3.8로 「이동만」 확정). 의도된 제약인지(장비는 지우면 안 되는 데이터인지) 확인한 뒤 별도 버전에서 다룬다. 확인 전까지는 비대칭을 유지하는 편이 안전하다.
- **보류: [2026-08-01]** 조치는 「만들지 않는다」이므로 코드 변경 없음. **장비 일괄 삭제의 부재가 의도인지 사용자 확인이 남아 있다** — 확인되면 이 항목을 닫는다.

**M-6. Ver 2.0 문서 일체가 미커밋 상태다**

- 위치: `git status --short` — `D docs/Ver_2.0_implementation_plan.md` · `D docs/implementation_plan.md` · `?? docs/Ver_1.0/implementation_plan.md` · `?? docs/Ver_2.0/`
- 근거: 계획서가 `docs/` → `docs/Ver_2.0/`로 이동했고 신규 문서 4종이 전부 untracked다. 되돌릴 지점이 없다.
- 영향: 이 시점에서 작업 디렉터리가 손상되면 계획서 개정분과 설계 문서 1,500줄이 사라진다.
- 제안: 구현 착수 **전에** 문서 이동+신규분을 한 번 커밋한다. 파일 이동은 `git add -A`로 잡아야 rename으로 인식된다.

#### 낮음

**L-1. 계획서 §3.0의 폭 근거가 옛 라벨을 가리킨다**

- 위치: 계획서 §3.0 「아이콘 + 최장 라벨(**「데이터분석」**)이 줄바꿈 없이 들어간다」
- 근거: 같은 문서 §0.1에서 6번 메뉴를 「데이터백업/복원」으로 교체했다(개정 이력 25행). 최장 라벨은 6자에서 **9자**로 늘었는데 근거 문장은 갱신되지 않았다.
- 영향: 200px 산정 근거가 실제 최장 라벨을 반영하지 않는다. 실제로 들어가는지는 미확인.
- 제안: 문구를 「데이터백업/복원」으로 고치고, 구현 2단계에서 200px에 줄바꿈 없이 들어가는지 실측한다.
- **해소: [2026-08-01]** 계획서 §3.0 문구 정정 + 「2단계에서 실측」 명시. 실측 자체는 화면이 나온 뒤다.

**L-2. `340`이 세 파일에 하드코딩돼 있다**

- 위치: `map-sidebar.tsx:130` · `cctv-video-modal.tsx:18` · `map-region-capture-panel-view.tsx:95`
- 근거: 세 곳 모두 같은 사이드바 폭을 뜻하는데 서로 모른다. `cctv-video-modal.tsx:114`는 이 값으로 모달 `paddingLeft`를 계산한다(뷰포트 고정이라 실제로 값이 필요하다).
- 영향: 한 곳만 고치면 모달이 지도 중앙에서 어긋난다.
- 제안: 계획서 작업항목 10에 이미 포함. `shell/constants.ts`로 단일화.

**L-3. `OVERALL_TONE`이 패널 파일 내부 상수다**

- 위치: `worksite-weather-panel.tsx:32`
- 영향: 대시보드가 같은 배너를 그리려면 복사하게 되고, Ver_1.1에서 겪은 표기 불일치가 재발할 수 있다.
- 제안: `types/weather.ts` 또는 `constants/`로 승격. COMPONENT §7.2에 등재됨.
- **해소: [2026-08-01]** `types/weather.ts`로 이동. 패널은 import만 한다. 값은 그대로다.

**L-4. 대형 파일 4종이 그대로 남아 있다**

- 위치: `marker-detail-modal.tsx`(2,016) · `use-excel-upload-actions.tsx`(1,516) · `kakao-map-canvas.tsx`(1,068) · `full-backup.ts`(836)
- 영향: 지금 당장 아무도 다치지 않는다. Ver_1.0부터 이어진 부채다.
- 제안: 이번 범위 밖. Ver 2.0은 셸 개편이므로 건드리지 않는다. `gpsmap-page.tsx`(745)와 `worksite-weather-panel.tsx`(559)만 **두 곳에서 써야 해서** 분리한다.

### 3. 처리 결과 (2026-08-01 같은 날 조치)

| 항목 | 상태 | 조치 |
| --- | --- | --- |
| H-1 | ✅ 해소 | 사용자 결정으로 축전지 국소 제외 확정. 검수 기준을 「지도 마커 ⊆ 목록」으로 교체 |
| H-2 | ✅ 해소 | `select-active-markers.ts` 추출 + 테스트 10건 (코드) |
| M-1 | ✅ 해소 | `weatherSearchMarkerIds` 완전 삭제 (코드) |
| M-2 | ✅ 해소 | 계획 항목 11 축소 |
| M-3 | ✅ 설계 확정 | DESIGN §3.1 · 계획 §3.10. 구현은 6단계 |
| M-4 | ✅ 설계 확정 | 계획 §3.9. 구현은 2~3단계 |
| M-5 | ⏸ 보류 | 「만들지 않는다」로 확정. 장비 삭제 부재가 의도인지 확인 대기 |
| M-6 | ✅ 해소 | 커밋 2건 (아래) — 되돌릴 지점 확보 |
| L-1 | ✅ 해소 | 계획 §3.0 문구 정정 |
| L-2 | 📋 계획 반영됨 | 계획 항목 10 — 2단계에 구현 |
| L-3 | ✅ 해소 | `OVERALL_TONE` 승격 (코드) |
| L-4 | 📋 범위 밖 | 셸 개편에서 손대지 않는다 |

**조치 후 검증**: `tsc --noEmit` 0 · `eslint --max-warnings=0` 0 · `vitest` **264건 / 19파일 통과**(254 → +10) ·
`next build` 성공, 홈 First Load JS **295 kB**(계획서 기준값과 동일, 증가 없음).

#### 커밋

| 해시 | 내용 |
| --- | --- |
| `7e703e7` | `refactor:` H-2·M-1·L-3 코드 조치. **동작 변경 없음** |
| `8f0a1c1` | `docs:` Ver 2.0 문서 세트 신설 + 계획서 §3.4·§3.8·§3.9·§3.10 개정 |

점검 직전 상태로 되돌리려면 `40d0565`(계획서 개정)이 기준점이다.

#### 조치의 설계 의도 — 왜 `select-active-markers`를 뽑았나

**줄 수를 줄이려던 것이 아니라 관측 가능성 때문이다.** 마커 선별이 훅 안에 있으면
"지도에 없어야 할 마커가 떴는가"를 확인하는 데 화면이 필요했다. 순수함수로 두면
모드 × 입력 조합을 표로 고정할 수 있고, Ver 2.0에서 이 파일 하나만 바꾸면
대시보드 마커 규칙이 끝난다. 그 변경이 다른 모드를 건드렸는지는 테스트가 알려 준다.

날씨 분기의 현재 규칙(`return []`)을 굳이 테스트로 고정한 것도 같은 이유다 —
4단계에서 그 테스트가 **의도대로 실패**하는 것이 규칙이 바뀌었다는 신호가 된다.

### 3.1 추가 발견 — Serena 참조 추적 (2026-08-01, 조치 후)

**H-3. `useActiveMarkers`가 3곳에서 호출된다 (미해소)**

- 위치: `components/map-marker-page.tsx:86` · `components/modals/marker-detail-modal.tsx:310` ·
  `hooks/use-marker-edit-form.ts:51`(→ `modals/marker-edit-modal.tsx:62`)
- 근거: Serena `find_referencing_symbols`로 확인. 앞의 둘은 **기존 코드**이고 이번 개편이 만든 것이 아니다.
  `marker-detail-modal`의 `if (!marker) return null`은 훅(310행)보다 **아래**(1328행)라 훅은 항상 실행되고,
  `MapMarkerPage`가 두 모달을 상시 마운트한다 → **인스턴스 3개 동시 동작**.
- 영향: 이 훅은 `previousModeRef`·`prevFilterOptionsRef`를 인스턴스별로 들고 `useEffect` 2개가
  `setFilters`에 쓴다. ref가 서로 어긋나 같은 스토어 필터를 번갈아 덮어쓸 수 있다 —
  「필터가 저절로 풀린다」 류 증상의 유력한 경로다. H-2 조치(순수함수 추출)는 마커 선별만 다뤘고
  이 부수효과는 그대로 남아 있다.
- 제안: 마커 목록을 컨텍스트나 셀렉터로 내려받게 바꿔 훅 호출을 한 곳으로 되돌린다.
  `marker-detail-modal.tsx`가 2,016줄이라 범위 합의 후 착수할 것.
- 문서 정정: `AGENTS.md`와 `Ver_2.0_COMPONENT.md` §3.1이 "한 번만 호출한다"고 **현황처럼** 적고 있던 것을
  "그래야 하지만 현재 3곳"으로 고쳤다(2026-08-01).
- **해소: [2026-08-01]** 부수효과 없는 파생 훅 `hooks/use-marker-list.ts`를 분리했다.
  `useActiveMarkers`는 이제 `useMarkerList()` 결과에 필터 부수효과만 얹고 `map-marker-page` 단독 호출로 돌아갔다.
  두 모달은 `useMarkerList()`를 쓴다 — 목록 계산은 여전히 한 벌이고(`selectActiveMarkers`),
  `useMapMarkersQuery`가 TanStack Query라 요청도 늘지 않는다.
  `marker-detail-modal.tsx`(2,016줄)는 import와 호출 한 줄만 바꿔 큰 파일을 건드리지 않았다.

### 4. 다음 점검 때 볼 것

| 순서 | 항목 | 이유 |
| --- | --- | --- |
| 1 | **M-5** 장비 일괄 삭제 부재 | 사용자 확인만 남았다. 의도가 아니면 별도 버전 과제 |
| 2 | 2단계 후 **L-1 실측** | 200px에 「데이터백업/복원」이 들어가는지 |
| 3 | 6단계 후 **M-3 실측** | 1024px에서 캡처 패널이 지도를 얼마나 덮는지 |
| 4 | 4단계 후 날씨 분기 | `select-active-markers`의 weather 테스트가 **의도대로 실패**하고 새 규칙으로 갱신됐는지 |
| 5 | **H-3 회귀 감시** | `useActiveMarkers` 호출처가 다시 늘지 않았는지. `find_referencing_symbols`로 1건이어야 한다 |
