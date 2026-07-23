# 프로젝트 분석 보고서

- 대상: `0004_NewMapMarker` (구 `002_geographic_tech` — 배터리/장비 지도 마커 + GPSMAP)
- 작성일: 2026-07-18 (초판) · 2차 2026-07-19 · 3차 2026-07-22 · **4차 2026-07-23**
- 검사 방법: 구조 스캔 · `tsc --noEmit` · `eslint .` · `next build` · `vitest run` · 패턴 그렙(XSS/any/console/SSRF/env)

---

## [2026-07-23] 4차 검수 — `group_key`(동/구역 실제 그룹 분리) 구조 변경 영향 분석

> 범위: 같은 번지 하위를 동/지하/구역 단위로 **실제 분리**하는 기능(`markers.group_key`) 도입 후,
> 그룹 판정·재그룹·백업·지도 렌더 경로의 정합성 재검수. 코드 수정 없음(문서화만).
> 변경 커밋: `765c16b`. 관련 파일: `address-group.ts` · `marker-detail-modal.tsx` · `api.ts` · `types/marker.ts` · `full-backup.ts` + migration `20260723000000_add_group_key.sql`.

### 검사 결과 요약

| 검사 | 결과 |
| --- | --- |
| `tsc --noEmit` | ✅ 0 오류 |
| `eslint .` | ✅ 0 문제 |
| `next build` | ✅ 성공 (정적 9 페이지, Compile ~4.7s) · 홈 First Load **482 kB (3차와 동일 — 회귀 없음)** |
| `vitest run` | ✅ 4 files / 39 tests 통과 |

> 신규 UI(분리/합치기/대표 선택)는 이미 `next/dynamic`으로 지연 로드되는 상세 모달 내부에 있어 홈 번들에 영향 없음.

### 구조 변경 요지

- **그룹 판정 키의 일반화**: 기존 "번지 주소 키"(`getLotAddressKey`) 단일 기준 → **유효 키**(`getEffectiveGroupKey` = `group_key`가 있으면 그것, 없으면 번지 키). 같은 번지라도 `group_key`가 다르면 별도 그룹.
- **분리/원복**: 상세 모달에서 라벨(동/지하/기타) 단위로 `group_key` 부여(분리)·제거(원복). 분리 시 대표 국소 직접 선택, 대표 이탈 시 잔여 그룹 자동 승격.
- **재그룹·백업 반영**: `assignMarkerParentsByLotAddress`/`applyMarkerRolesFromStoredGroupRole`를 유효 키 기준으로 변경(엑셀 재업로드에도 분리 유지), 백업 컬럼(`full-backup.ts`)에 `group_key` 추가.

### 정합성 점검 (양호)

- ✅ **그룹 판정 우회 없음**: `getLotAddressKey` 잔여 호출 5곳 모두 (a) 유효 키 폴백 내부이거나 (b) 분리 키 생성·lot 멤버 필터용 — 그룹을 직접 병합하는 경로 아님.
- ✅ **지도 렌더 불변**: `kakao-map-canvas`는 `parent_marker_id==null`(+`detached_visible`) 기준 렌더. 분리 그룹의 새 대표는 parent=null이라 자동 노출 — 캔버스 수정 불필요.
- ✅ **백업 왕복·하위호환**: `group_key`는 `TABLE_COLUMNS.markers` passthrough로 왕복. 복원 시 parent는 재파생(유효 키+`group_role`)되어 분리 구조 재구성. **구 백업엔 컬럼 부재 → null → 번지 그룹**으로 안전 폴백.
- ✅ **`detached_visible` 병존**: 분리 시 이동 국소의 `detached_visible`를 false로 리셋. 기존 "동 개별 표시"는 미분리 SUB에 대해 그대로 동작(충돌 없음).

### 신규 발견·리스크

#### 🟠 G1 — `marker-detail-modal.tsx` 2,006줄로 최대 파일 등극 (R2 심화)

- 3차 시점 1,106줄 → (07-23 연관상세/구분변경) 1,668 → (이번 group_key) **2,006줄**. `use-excel-upload-actions.tsx`(1,507)를 넘어 **단일 최대 파일**.
- 한 파일에 상세 표·GPS 조회·동 개별표시(detached)·구분 변경(`changeMarkerGroupRole`)·**분리/합치기(`assignGroupMembers`/`separateLabelGroup`/`mergeSplitGroupToLot`)** 가 밀집.
- 권장 분할: ① 그룹 조작 로직(구분 변경 + 분리/합치기 + `assignGroupMembers`)을 `use-marker-grouping.ts` 훅으로, ② 상세 표(셀 드래그 복사)와 GPS 카드를 하위 컴포넌트로.

#### 🟡 G2 — 유효 키 규칙 2중 구현 (드리프트 위험)

- `address-group.getEffectiveGroupKey`(snake_case row)와 `marker-detail-modal.getMarkerEffectiveKey`(camelCase marker)가 **같은 규칙을 각각 구현**. 한쪽만 바뀌면 그룹 경계가 어긋날 수 있음.
- 권장: 순수 함수 하나(예: `(groupKey, address) => …`)로 규칙을 단일화하고 두 어댑터가 이를 호출.

#### 🟡 G3 — `group_key` 미마이그레이션 시 안내 부재

- `dbErrorMessage`는 `detached_visible` 컬럼 부재만 마이그레이션 문구로 안내. `group_key` 컬럼이 없으면(마이그레이션 미적용) 분리/합치기 update가 **일반 오류 메시지**로만 표시됨(PGRST204/42703).
- 권장: `dbErrorMessage`의 `missingColumn` 판정에 `group_key`도 포함해 "`20260723000000_add_group_key.sql` 적용" 안내 추가.

#### 🟠 G6 — 분리/합치기/구분변경의 다단계 DB 업데이트가 비원자적 (부분 실패 시 그룹 깨짐) ✅ 부분 조치

> **조치**: `separateLabelGroup`에서 **남은 번지 그룹 재승격을 분리보다 먼저** 실행하도록 순서 변경 → 뒤 단계 실패 시에도 남은 SUB가 (분리돼 나갈) 옛 대표를 가리키는 **dangling parent가 남지 않음**(최악의 경우 잔여 중복 대표만 남고, 이는 다음 재정렬로 자가치유). 성공 경로에선 두 그룹이 서로소라 결과 동일. **완전 원자화(트랜잭션/RPC)는 미적용** — 표시·조작 방어는 G7로 보강.



- `separateLabelGroup`·`mergeSplitGroupToLot`·`changeMarkerGroupRole`은 **여러 개의 순차 `await update`**로 대표/SUB/`group_key`를 바꾼다. **트랜잭션·롤백이 없다.**
- 특히 헤드라인 시나리오("분리로 원 대표가 빠짐")가 이 위험을 지난다: `separateLabelGroup`은 ① 분리 대상에 새 `group_key`+대표 지정 → ② 남은 번지 그룹 재승격, **두 단계 사이**에 남은 SUB들의 `parent_marker_id`는 아직 **분리돼 나간 옛 대표**(이제 다른 `group_key`)를 가리킨다. ②가 실패하면 이 **경계 넘는 dangling parent**가 영구히 남는다.
- DB에 `parent_marker_id`↔`group_key` 정합 제약(FK/트리거)이 없어 앱 로직에만 의존.
- 권장: (a) 최소한 **재승격(②)을 먼저** 수행해 남은 SUB의 부모를 항상 유효하게 유지, 또는 (b) Postgres **RPC(함수)로 묶어 원자화**. 최소 방어는 G7.

#### 🟠 G7 — `relatedEquipmentMarkers`가 부모체인을 유효 키로 재검증하지 않음 (dangling 시 그룹 혼합) ✅ 수정 완료

> **조치**: `relatedEquipmentMarkers`(modal:898~) 최종 집합에 **유효 키 필터** 추가 — 선택 마커와 `getMarkerEffectiveKey`가 일치하는 멤버만 남김(빈 키 마커는 기존 동작 보존). 부모체인으로 끌려온 경계 넘는 dangling 멤버를 제외해 상세·분리·합치기가 그룹 경계를 넘지 않는다. `tsc`/`eslint`/`vitest 39` 통과.



- `relatedEquipmentMarkers`(modal:898~)는 **부모체인(parentId)** 으로 모은 뒤 **유효 키 mates**를 합집합한다. 부모체인 쪽은 **부모가 같은 `group_key`인지 확인하지 않는다.**
- 따라서 G6 등으로 `parent_marker_id`가 그룹 경계를 넘어 남아 있으면, **다른 분리 그룹의 대표+형제까지 이 그룹 상세에 섞여** 표시되고, 그 오염된 목록으로 `separateLabelGroup`/`mergeSplitGroupToLot`의 `targets`/`remaining`이 잘못 산정될 수 있다.
- 정상 데이터에선 재현되지 않지만, **저비용 방어 가치가 큼**.
- 권장(작은 수정): 최종 집합을 **선택 마커의 유효 키와 일치하는 멤버로 필터**(`getMarkerEffectiveKey(m) === getMarkerEffectiveKey(equipmentMarker)`). dangling parent가 있어도 화면·조작이 그룹 경계를 넘지 않도록 방어.

#### ⚪ G4 — 원복 시 대표 재선정 규칙 (무해)

- 분리 그룹을 번지로 합칠 때, 되돌린 분리 대표와 원 번지 대표가 **둘 다 `group_role=대표`** 일 수 있음. `assignGroupMembers`는 `created_at` 최초의 대표-역할을 대표로 택 → 결정적이나 **원 번지 대표가 바뀔 수 있음**. 단일 대표 보장은 유지되어 정합성엔 무해. 필요 시 "원 번지 대표 우선" 규칙 명시 가능.

#### ⚪ G5 — 분리 직후 대표 핀 좌표 겹침 (의도)

- 새 분리 대표는 지오코딩 좌표(번지 중심)를 그대로 물려받아 **원 대표와 같은 위치에 겹쳐** 표시됨 → 사용자가 드래그해 실위치 배치(설계 의도). UI 토스트로 안내 중.

### 잔여(기존) 항목 — 상태 변화 없음

- **R1** 홈 First Load 482 kB(이번 변경과 무관, 지속). **R2** 대형 파일 — G1로 악화. **R3/R5** `any` 잔존. **R4** data-manager `ThisType`. **P4** 죽은 코드 보존.

### 권장 조치 순서 (코드 변경은 별도 요청 시)

1. ✅ **G7** `relatedEquipmentMarkers` 유효 키 필터 — **적용 완료**.
2. ✅ **G6** 분리 순서 조정(재승격 선행) — **적용 완료**(완전 원자화 RPC는 후속).
3. **G3** `group_key` 미적용 안내(작은 변경, 운영 안전).
4. **G2** 유효 키 규칙 단일화(회귀 예방).
5. **G1/R2** 상세 모달 그룹 로직 훅 분리 · R1 번들 재프로파일 · R3/R5 `any` 축소.

> **적용 커밋(예정)**: G7 필터 + G6 순서 조정. 남은 G1~G3은 별도 요청 시.

---

## [2026-07-22] 3차 검수 — 구조 스냅샷 + 전체 재검수

> 범위: 폴더/스택/규모 + `tsc`/`eslint`/`next build`/`vitest` + XSS·any·console·SSRF·env 패턴.
> 기준 트리: 워크스페이스 현재 디스크 상태(미커밋 변경 포함). 코드 수정은 하지 않음(문서화만).

### 검사 결과 요약

| 검사 | 결과 |
| --- | --- |
| `tsc --noEmit` | ✅ 0 오류 |
| `eslint .` | ✅ 0 문제 |
| `next build` | ✅ 성공 (정적 9 페이지, Compile ~7.9s) |
| `vitest run` | ✅ **4 files / 39 tests 통과** |
| 패턴 그렙 | 아래 R1~R6 · 잔여 P4 |

> `next build`는 여전히 **"Skipping linting"** — lint는 `eslint .`로 별도 확인.

### 규모·스택 델타 (초판 2026-07-18 대비)

| 항목 | 초판 | 3차(현재) | 비고 |
| --- | --- | --- | --- |
| 소스 `src` ts/tsx | 84 | **110** | +26 |
| 총 LOC(대략) | — | **~20,600** | |
| 최대 단일 파일 | 728줄 | **1,508줄** | `use-excel-upload-actions.tsx` |
| deps / devDeps | 36 / 13 | **37 / 16** | leaflet·vitest·@types/leaflet 등 |
| 홈 First Load JS | 297 kB (P2 후) | **482 kB** | **회귀 (+185 kB)** |
| 라우트 | `/` + API 3 | `/` · **`/gpsmap`** · API 3 | GPSMAP 신설 |

**추가된 주요 기술**

| 항목 | 내용 |
| --- | --- |
| 지도(GPSMAP) | Leaflet + VWorld 타일/WMS/JSONP |
| 필지·건축물 | `parcel-boundary.ts` · `vworld-gpsmap.ts` (브라우저 JSONP, 서버 프록시 제거) |
| 엑셀 | ERP 파서 · 전체 백업/복원(`full-backup.ts`) · 위치마커 |
| 보안 | `lib/api/proxy-guard.ts` (same-origin + IP 레이트리밋 300/min) |
| 테스트 | Vitest 단위(`proxy-guard`·`coords`·`marker-filters`·`kakao-map-helpers`) + 기존 Playwright E2E |
| Node | `engines.node >= 22` |

**현재 폴더 구조 (feature 기반, ★=초판 이후 신설·확장)**

```
src/
  app/           layout · page · providers · gpsmap/page ★
                 api/{kakao-static-map, map-tile-proxy, roadview-dates}
  components/    ui/(shadcn) · public-env-script · kakao-sdk-script ★
  hooks/ lib/ types/
  lib/api/proxy-guard.ts ★ (+ proxy-guard.test.ts)
  features/
    map-marker/  (기존 마커 앱)
      api · types · constants · store · providers
      hooks/  … · use-excel-upload-actions(1.5k) · use-marker-edit-form · use-data-backup-actions
      lib/    geocode · overlay-* · marker-* · address-group ★ · location-marker* ★
              parcel-boundary ★ · map-capture-stitch/ · excel/data-manager/
                (+ erp-parse ★ · full-backup ★)
      components/ map/ · modals/ · sidebar/(+ location-excel-section ★)
    gpsmap/ ★    주소·좌표 통합 변환기
      components/ gpsmap-page · vworld-map-pane · roadview-pane
      lib/        vworld-gpsmap · lookup · batch-lookup · coords · export-excel
```

**대형 파일 TOP (현재, 줄 수 = 물리 라인)**

| 파일 | LOC | 판단 |
| --- | --- | --- |
| `hooks/use-excel-upload-actions.tsx` | **1,508** | 🔴 재비대화 — 분할 1순위 |
| `modals/marker-detail-modal.tsx` | **1,106** | 🔴 재비대화 |
| `map/kakao-map-canvas.tsx` | **993** | 🟠 이전 728에서 재증가 |
| `excel/data-manager/full-backup.ts` | **837** | 🟠 신설 대형 |
| `gpsmap/components/gpsmap-page.tsx` | **746** | 🟠 신설 대형 |
| `lib/overlay-content.ts` | 569 | 🟡 |
| `lib/map-viewport-capture.ts` | 509 | 🟡 |
| `excel/data-manager/parse.ts` | 507 | 🟡 |

### 🟠 R1 — 홈 번들 회귀 (First Load 297 → 482 kB)

- `next build` 라우트: `/` **138 kB / First Load 482 kB**, `/gpsmap` 15 kB / First Load 348 kB, shared 103 kB.
- P2에서 모달 dynamic + xlsx 지연으로 297 kB까지 줄였던 효과가 **상당 부분 되돌아감**(약 +62%).
- 추정 요인: ERP/전체백업·주소그룹·필지·상세모달 비대화에 따른 홈 정적 그래프 증가, shared 청크 상향(103 kB).
- 권장: 홈에서 GPSMAP·무거운 사이드 섹션·상세 모달의 import 경계를 재점검하고, `next/dynamic`·액션 단위 `import()`를 다시 적용한 뒤 First Load 목표(예: ≤350 kB)를 재설정.

### 🔴 R2 — 대형 파일 재비대화 (분할 효과 후퇴)

- 초판 §5-2에서 최대 728줄로 정리했으나, 이후 ERP 업로드·동일번지·전체백업·상세 UI 확장으로 **1,000줄+ 파일이 3개** 재등장.
- 특히 `use-excel-upload-actions.tsx`(1,508)는 파싱·지오코딩·스테이징·토스트·DB 반영이 한 훅에 밀집 — SRP·테스트·리뷰 비용이 큼.
- 권장 분할 후보:
  1. 엑셀 업로드: 파서/지오코드 큐/DB upsert/토스트 포맷을 파일·훅 단위로 분리
  2. `marker-detail-modal.tsx`: 뷰 vs 데이터 로딩/저장 훅
  3. `gpsmap-page.tsx`: 조회 폼 · 지도 패널 · 결과 테이블 분리

### 🟡 R3 — `roadview-modal.tsx` `any` 잔존

- `useRef<any>`, `data: any`, `item: any`, `(window as any).kakao`, `catch (...: any)` 등 **약 8곳**.
- Kakao Roadview 타입 공백이 원인이며, 기존 `kakao-maps.d.ts` 확장 또는 좁은 로컬 인터페이스로 치환 가능.
- lint는 통과(규칙이 `any`를 에러로 막지 않음) — 프로젝트 규칙(any 금지) 관점의 기술부채.

### 🟡 R4 — data-manager `ThisType<any>` 합성 유지 (의도적)

- `parse`/`export`/`headers`/`date-utils`/`info-records`/`index`의 `Record<string, any> & ThisType<any>` — N6에서 이미 “합성 재설계 전까지 유지”로 기록된 항목. 상태 변화 없음.
- `parse.ts` 내부 `Record<string, any>` 행 객체 + `console.warn`(업로드 행 스킵 안내) 유지.

### 🟡 R5 — 편집 폼 행 변경 핸들러 `value: any`

- `use-marker-edit-form.ts`: `handleEquipmentRowChange` / `handleBatteryRowChange`의 `value: any`.
- 스펙 리스트는 `keyof`로 키가 제약되어 있으나 값 타입은 미좁힘. `string | number` 등으로 좁히기 쉬움.

### ⚪ R6 — 기타 관찰 (경미·운영)

- **P4 죽은 코드** `computeCaptureOverlayOffsets`: 정의만 존재, **호출 0** — 계속 의도적 보존.
- **XSS**: `overlay-content.ts`의 `escapeHtml` + 동적 `innerHTML` 이스케이프 유지. `roadview-pane`/`roadview-modal`의 `container.innerHTML = ''`는 컨테이너 비우기용으로 무해.
- **SSRF**: `map-tile-proxy` 호스트 allowlist 유지 + **`guardProxyRequest`**(Origin/Referer + 레이트리밋) 신설 — 양호.
- **PostgREST**: `quotePostgrestValue` 유지. 과거 raw `.not(..., 'in', ...)` 패턴은 현재 훅에서 **미검출**.
- **env**: `.env*` gitignore 유지. `wrangler.jsonc` `vars`에 `NEXT_PUBLIC_*`(Kakao·Supabase anon·VWorld) 커밋 — 클라이언트 공개키 전제·도메인 제한 모델. **service_role/비공개 시크릿은 문서상 미포함**.
- **VWorld**: 서버 `/api/parcel-boundary` 제거 → 브라우저 JSONP. Cloudflare egress 제약 회피 설계는 타당. 키는 Referer/도메인 제한에 의존.
- **워킹트리**: `main`에 미커밋 변경(gpsmap·엑셀·마커 API/스토어·`docs/*`·migration `detached_visible` 등). 본 검수는 해당 상태를 포함.

### 잔여·권장 조치 순서 (코드 변경은 별도 요청 시)

1. **R2** 대형 파일 재분할 (`use-excel-upload-actions` → `marker-detail-modal` → `gpsmap-page`)
2. **R1** 홈 First Load 번들 재프로파일·지연 로드 복구
3. **R3·R5** `any` 축소 (roadview · edit form value)
4. (선택) data-manager `ThisType` 합성의 점진 타입화 — R4
5. P4 죽은 코드 — 사용자 보존 방침 유지

### 양호하게 유지·강화된 점

- ✅ 타입·lint·프로덕션 빌드·단위 테스트(39) 모두 통과
- ✅ 프록시 가드(출처 검증 + 레이트리밋)로 카카오 쿼터 남용 완화
- ✅ 타일 프록시 SSRF allowlist · PostgREST 이스케이프 · overlay XSS 이스케이프 유지
- ✅ feature 폴더에 `gpsmap` 분리, map-marker와 경로 경계 명확
- ✅ Vitest 도입으로 순수 로직(필터·좌표·프록시 가드) 회귀 방지 기반 확보

---

## 1. 기술 스택 & 구조

| 항목       | 내용                                        |
| ---------- | ------------------------------------------- |
| 프레임워크 | Next.js 15.5.18 (App Router, Turbopack dev) |
| 배포       | Cloudflare Pages (`@opennextjs/cloudflare`) |
| 데이터     | Supabase, TanStack Query                    |
| 지도       | Kakao Maps JS SDK, Kakao REST(정적맵/좌표)  |
| UI         | Tailwind CSS, shadcn/ui (Radix)             |
| 규모       | 소스 84개 (분할 후), 최대 단일 파일 728줄   |
| 의존성     | deps 36 / devDeps 13                        |

**폴더 구조 (feature 기반, 대형 파일 분할 반영 — 소스 84개, ★=이번 세션 신설)**

```
src/
  app/           layout · page · providers · api/{kakao-static-map,map-tile-proxy,roadview-dates}
  components/     ui/(shadcn 18) · public-env-script
  hooks/ lib/ types/  use-toast · utils · public-env · supabase/client · kakao-maps.d.ts
  features/map-marker/
    api.ts · types/marker · constants/{facility-teams,map-config} · store/use-map-marker-store
    providers/auth-provider
    hooks/  use-auth-session · use-map-markers-query · use-kakao-map-sdk
            use-active-markers · use-data-backup-actions · use-excel-upload-actions
    lib/
      geocode · marker-filters · marker-svg · cluster-pie
      overlay-drag · overlay-content ★ · capture-overlay-layout · map-viewport-capture
      map-capture-stitch/ ★  index·types·helpers·bounds·plan·capture
      excel/data-manager/ ★   index·shared·date-utils·info-records·headers·parse·export
    components/
      map-marker-page
      map/     kakao-map-canvas · map-floating-controls · map-region-select-overlay
               map-region-bounds-guide · map-region-capture-panel · map-region-capture-panel-view ★
      modals/  auth-modal · marker-detail-modal · marker-edit-modal · marker-edit-spec-lists ★ · roadview-modal
      sidebar/ map-sidebar · auth-header · mode-tabs · filter-panel · place-search-section
               markers-list-panel · equipment-info-section · backup-restore-section
               equipment-excel-section · battery-excel-section
```

**대형 파일 (분할 전 LOC — 아래 5개 모두 §5-2에서 분할 완료, 최대 단일 파일 728줄로 축소)**

| 파일                                          | LOC   |
| --------------------------------------------- | ----- |
| `lib/excel/data-manager.ts`                   | 1,145 |
| `components/map/kakao-map-canvas.tsx`         | 1,118 |
| `components/modals/marker-edit-modal.tsx`     | 814   |
| `lib/map-capture-stitch.ts`                   | 809   |
| `components/map/map-region-capture-panel.tsx` | 675   |

---

## 2. 빌드/타입 검사 결과

| 검사           | 결과                           |
| -------------- | ------------------------------ |
| `tsc --noEmit` | ✅ 통과 (0 오류)               |
| `next build`   | ✅ 성공 (정적 8 페이지, 11.7s) |
| `next lint`    | ⚠️ **오류 1 + 경고 6**         |

> 주의: `next build`는 **"Skipping linting"** 으로 lint를 건너뛰므로 빌드는 성공하지만, lint 오류는 별도로 존재합니다.

---

## 3. 발견된 문제 (우선순위순)

### 🔴 P1 — `data-manager.ts` 전체 타입 검사 비활성 (`@ts-nocheck`) ✅ 수정 완료

> **조치 완료**: BOM + `@ts-nocheck` 제거 후 **21개 타입 오류를 로직 변경 없이 타입만 보정**:
> `event.target.result as ArrayBuffer`(Uint8Array 오버로드 4곳), `(error as Error).message`(catch unknown 4곳),
> `Record<string, any>`/`Record<string, string>` 주석(동적 파싱 객체 13곳), `sheet_to_json<any[]>` 제네릭.
> **엑셀 왕복 무결성 테스트(Node + 최소 브라우저 shim) 18/18 통과** — 좌표 정밀도(double 정밀도까지 정확) 보존,
> 국소명·용량·수량·items 매핑 보존, `formatDateToYmd` 정규화 정상. `tsc`/`next build`/`eslint .` 모두 통과.
> 이제 이 모듈도 정적 타입 검사 대상에 포함됨.

원래 진단 내용 - 위치: `src/features/map-marker/lib/excel/data-manager.ts:1` - 내용: 파일 첫 줄 `// @ts-nocheck` → **1,145줄 전체가 타입 검사 대상에서 제외**. `next lint`에서 `@typescript-eslint/ban-ts-comment` **에러**로 잡힘. - 추가: 지시문 앞에 **BOM(`﻿`) 문자**가 붙어 있음(`﻿// @ts-nocheck`). 엑셀 내보내기/가져오기 핵심 로직이 타입 무방비 상태 → 좌표/셀 매핑 오류가 런타임까지 숨을 수 있음. - **실측**: `@ts-nocheck` 제거 시 **21개 타입 오류** 노출 (동적 객체 리터럴 속성 누락 `lat/lng/items/address`, `catch (err: unknown)`의 `.message` 접근, XLSX 오버로드 불일치 등). - 판단: 이 파일은 좌표 정밀도 보존이 핵심이라 **실제 엑셀 왕복 테스트 없이 21곳을 수정하면 데이터 무결성 훼손 위험**. 이번엔 원상 복구하고 별도 작업으로 분리 권장. - 권장(분리 작업): ① BOM 제거 ② `MarkerRecord` 유니온으로 객체 타입 명시 ③ `err instanceof Error` 가드 ④ 각 수정 후 실제 xlsx 내보내기→가져오기 값 대조.

### 🟠 P2 — 홈 라우트 번들 과대 ✅ 수정 완료

- 이전: `/` 라우트 자체 279 kB, 공유 포함 First Load JS **448 kB**.
- 조치:
  - 상세/편집/로드뷰 **모달 3종을** `next/dynamic`**(ssr:false) 지연 로드**로 전환.
  - `xlsx`**(대용량) 지연 로드**: `use-data-backup-actions` / `use-excel-upload-actions` 훅에서 `data-manager` 정적 import 제거 → 각 액션 함수 내부에서 `await import()`로 필요 시 로드 (호출부 수정 없이 지역 상수로 처리).
- **결과: First Load JS 448 kB → 297 kB (-151 kB, 약 34% 감소)**, `/` 자체 279 kB → 128 kB.

### 🟠 P3 — `innerHTML` 문자열 주입 (잠재 XSS) ✅ 수정 완료

- 위치: `kakao-map-canvas.tsx` 다수 (`addressDiv.innerHTML = ...`, `specSummary.innerHTML = ...`).
- 현재는 주소가 Kakao 지오코더/DB에서 오고 편집 모달에서 직접 주소를 타이핑하지는 않아 실제 악용 가능성은 낮았으나, DB 값/향후 사용자 입력이 이스케이프 없이 DOM에 삽입되던 저장형 XSS 소지.
- 조치: `escapeHtml()` 헬퍼 추가 후 `innerHTML`에 보간되던 **모든 동적 값(주소 지번/도로명, 배터리 용량/수량)을 이스케이프**. 정적 문자열(닫기 아이콘, "주소 조회 중..." 등)은 무해하여 그대로 둠.
  - 적용 지점: 정보창 주소(직접/지오코더 콜백 2곳), 텍스트 라벨 주소(`renderAddress`), 배터리 스펙 요약 else 분기.
  - `parts`(스펙 요약)는 `Number()`로 강제되는 값이라 주입 불가.

### 🟡 P4 — 사용되지 않는 죽은 코드

- `overlay-drag.ts`의 `computeCaptureOverlayOffsets`(+ `screenPanelToOffset`, `readPointXY`, `buildCandidates` 등 약 180줄)은 수동 드래그/텍스트 라벨 방식 전환 후 **호출되지 않음**.
- 상태: **사용자 요청으로 향후 자동배치 재사용 위해 의도적으로 보존 중**. 기술부채로만 기록.

### 🟡 P5 — React Hooks 의존성 경고 ✅ 수정 완료

- `hooks/use-active-markers.ts`: `useEffect` 복잡 표현식 의존성 4건 + 누락 의존성 경고.
- 조치: 복잡 표현식(`filterOptions.years.join(',')` 등)을 `filterOptionsKey` **단일 변수로 추출**해 정적 검사 가능하게 만들고, 의도된 변화 감지 방식임을 주석으로 명시. `next lint` 경고 6건 → **0건**.

### 🟡 P6 — 프로덕션 디버그 로그 잔존 ✅ 수정 완료

- `components/modals/roadview-modal.tsx:38` `console.log('[RoadviewDebug] ...')` 상시 출력.
- 조치: `process.env.NODE_ENV !== "production"` 가드로 감싸 프로덕션에서 미출력하도록 수정함.

### ⚪ P7 — 기타(경미) ✅ 수정 완료

- **(a)** `components/public-env-script.tsx`: `next/script beforeInteractive` → **일반 인라인 `<script>`**로 변경(레이아웃 `<body>` 최상단, 하이드레이션 전 실행 보장). Next 경고 제거.
- **(b)** `marker-detail-modal.tsx`의 `marker as any` **약 30곳 제거**: 모드에 맞춰 좁힌 `equipmentMarker`/`batteryMarker`(EquipmentMarker/BatteryMarker) 뷰와 `BatterySpecItem` 타입으로 치환. `catch (err: any)` → `catch (err)`.
- **(c)** `next lint`(Next 16 제거 예정) → **ESLint CLI로 마이그레이션**: `eslint.config.mjs`에 빌드 산출물 `ignores` 추가, `package.json` `lint` 스크립트를 `eslint .`로 변경.

---

## 4. 양호한 점 (유지)

- ✅ `map-tile-proxy` 라우트에 **호스트 allowlist 기반 SSRF 방지** 적용 (kakao/daum CDN만 허용).
- ✅ `.env*` 가 `.gitignore`에 포함, `.env.local` **git 미추적** (시크릿 노출 없음).
- ✅ 타입체크·프로덕션 빌드 통과, feature 기반 폴더 구조 일관성.
- ✅ 캡처 타일 로딩 대기 로직 강화(미완료 타일 0 대기)로 흰색 빈 구간 방지 개선 반영됨.

---

## 5. 권장 조치 순서 — ✅ 전부 완료

P1~P7 및 대형 파일 분할까지 이번 세션에서 모두 처리됨(상세 §3, §5-1, §5-2).
남은 항목은 **P4(죽은 코드 `computeCaptureOverlayOffsets`) — 사용자 요청으로 의도적 보존**뿐.

향후 개선 후보:

1. ✅ **완료** — `marker-edit-modal.tsx`의 상태·저장·삭제 로직을 커스텀 훅 **`use-marker-edit-form.ts`**(460줄)로 분리. 모달은 뷰만 남아 **618 → 228줄**. `tsc`/`eslint`/`next build` 통과.
2. ✅ **완료** — `batteryItems`/`equipmentItems`에 **`EquipmentRowItem`/`BatteryRowItem` 인터페이스** 부여(`marker-edit-spec-lists.tsx`에 정의, 훅·리스트 컴포넌트가 공유). `any[]` → 타입 배열, 리스트 `onChange` 키를 `keyof`로 제약. `tsc`/`eslint`/`next build` 통과.
3. ✅ **완료(1차 스모크)** — **Playwright 도입**: `@playwright/test` + Chromium, `playwright.config.ts`(dev 서버 재사용), `e2e/smoke.spec.ts`, `npm run test:e2e`. 앱 셸 렌더·모드 탭(장비/축전지) 전환·런타임 예외 부재를 검증 → **2/2 통과**. 산출물은 `.gitignore` 처리.
   - 후속: Kakao 키(도메인)·Supabase 테스트 환경이 갖춰지면 지도 로드 → 마커 편집 → 영역 캡처 → 엑셀 입출력까지 시나리오 확장 가능.

---

## 5-1. 이번 세션에서 적용한 수정

| 항목                                         | 상태                                      |
| -------------------------------------------- | ----------------------------------------- |
| P2 번들 축소(모달 dynamic + xlsx 지연)       | ✅ 적용 — First Load **448→297 kB**       |
| P3 `innerHTML` 동적 값 이스케이프(XSS)       | ✅ 적용                                   |
| P5 훅 의존성 정리(경고 6→0)                  | ✅ 적용                                   |
| P6 로드뷰 디버그 로그 프로덕션 가드          | ✅ 적용                                   |
| P7a beforeInteractive → 인라인 script        | ✅ 적용                                   |
| P7b `as any` ~30곳 타입 뷰로 치환            | ✅ 적용                                   |
| P7c ESLint CLI 마이그레이션                  | ✅ 적용                                   |
| P1 `@ts-nocheck` 제거 + 21개 타입 오류 수정  | ✅ 적용 — **엑셀 왕복 테스트 18/18 통과** |
| P4 죽은 코드(`computeCaptureOverlayOffsets`) | 보존(사용자 요청)                         |
| 캡처 흰색 구간(타일 미로드) 대기 강화        | ✅ 이전 단계 적용                         |
| 캡처 정보창 → 국소명+주소 텍스트 라벨        | ✅ 이전 단계 적용                         |

**최종 검증**: `tsc --noEmit` ✅(0 오류) · `next build` ✅ · `eslint .` **→ 0 문제(오류·경고 0)** · 엑셀 왕복 무결성 테스트 18/18 ✅ · **Playwright E2E 스모크 2/2 ✅**

---

## 5-2. 대형 파일 분할

### ✅ 완료 (검증됨: tsc·eslint·next build 모두 통과)

| 원본 파일 | 조치 | 결과 |
| --- | --- | --- |
| `kakao-map-canvas.tsx` (1,118) | 순수 DOM 빌더(`createOverlayContent`, `createCaptureLabelContent`, `formatJibunAddress`, `escapeHtml`)를 `lib/overlay-content.ts`로 분리 | **1,118 → 728** + `overlay-content.ts` 413 |
| `lib/map-capture-stitch.ts` (809) | 폴더 `map-capture-stitch/`로 분할 후 `index.ts` 재수출(import 경로 그대로 유지). `types`/`helpers`/`bounds`/`plan`/`capture` 5개 모듈 | 최대 파일 **352줄** (plan) |

> 분할 원칙: 순수 함수/타입만 이동해 런타임 결합이 없는 안전한 경계만 절단. 소비 측 import 경로는 변경 없음.

### ✅ 추가 완료 (2차)

| 원본 파일 | 조치 | 결과 |
| --- | --- | --- |
| `lib/excel/data-manager.ts` (1,144) | 폴더 `data-manager/`로 분할: `date-utils`/`info-records`/`headers`/`parse`/`export` 그룹 객체(`ThisType<any>`)를 `index.ts`에서 합성. `this` 상호호출 그대로 동작. `shared.ts`(FACILITY_TEAM 헬퍼) | 최대 **505줄**(parse). **엑셀 왕복 테스트 11/11 통과**(좌표 정밀도·`this` 호출 검증) |
| `components/modals/marker-edit-modal.tsx` (814) | 장비/축전지 **사양 리스트 UI를 `marker-edit-spec-lists.tsx`**(`EquipmentSpecList`/`BatterySpecList`)로 추출 | **814 → 618** + 257 |
| `components/map/map-region-capture-panel.tsx` (675) | 렌더(프레젠테이션)를 **`map-region-capture-panel-view.tsx`**(`CapturePanelView`)로 분리, 로직/상태는 원본이 소유 | **675 → 483** + 300 |

> 모든 분할 후 `tsc`(0) · `eslint .`(0) · `next build`(성공, 번들 297 kB 유지) 통과. data-manager는 Node 왕복 무결성 테스트로 런타임 동작까지 재확인.

**결과: 5개 대형 파일 분할 후 최대 단일 파일 728줄**(kakao-map-canvas), 나머지는 대부분 300~600줄대로 정리됨.

---

## 6. 운영 메모 (참고)

- 개발 중 dev 서버가 3000/3001 **두 개**로 떠서, 브라우저가 옛 포트(3001)를 보며 "수정이 반영 안 됨"으로 오인한 사례 있었음. `npm run dev` 시 터미널의 **Local 포트**를 확인하고 접속할 것.
- 현재 최신 코드 dev 서버는 `localhost:3000` 단일 실행 중.

---

## 7. 2차 검수 (2026-07-19) — 추가 발견 및 수정

> 대상: 분할·P1~P7 이후의 mutation/보안 경로 재검수. 아래 **전부 수정 완료**하고 `main`에 커밋(`b8017bd`)·푸시함.
> 검증: `tsc --noEmit`(TS 5.9.3) ✅ 0 오류 · `eslint .` ✅ 0 문제. 변경 4파일 (+91/-62).

### 🔴 N1 — PostgREST `.or()` 필터 인젝션 ✅ 수정 완료

- 위치: `hooks/use-marker-edit-form.ts` (장비 정보 조회).
- 내용: `.or(`facility_code.eq."${fc}",place_name.eq."${marker.name}",marker_id.eq."${marker.id}"`)` — 엑셀 업로드에서 온 **신뢰 불가 값(`marker.name` 등)을 필터 문자열에 직접 보간**. 이름에 `"`·`,`·`)` 등이 있으면 필터 문법이 깨지거나 인젝션 소지. (예: 국소명 `창고(A동), B`)
- 조치: `quotePostgrestValue()`(큰따옴표 래핑 + `\`·`"` 이스케이프) 헬퍼 추가, 각 조건 값에 적용. **빈 값 조건은 제외**해 `eq.""` 과매칭도 함께 차단.

### 🔴 N2 — `not in` 리스트 raw 조립 → `information` 행 오삭제(데이터 손실) ✅ 수정 완료

- 위치: `hooks/use-marker-edit-form.ts` (편집 저장 시 삭제 대상 산정).
- 내용: `.not('facility_code', 'in', `(${currentCodes.join(',')})`)` — 통합시설코드를 콤마로 그대로 이어붙여, **코드에 콤마가 하나라도 있으면 리스트가 잘못 분해되어 보존해야 할 행이 삭제**됨(조용한 데이터 손실).
- 조치: 각 코드를 `quotePostgrestValue()`로 이스케이프 후 조립. `not in` 의미(변경된 코드만 삭제)는 유지해 실패 시 기존 행 보존 안전성도 유지.
- 참고: 같은 프로젝트의 `.in('marker_id', 배열)` 사용부(`use-excel-upload-actions`, `marker-detail-modal`)는 **배열 전달 방식으로 이미 안전**. 본 두 건만 raw 문자열이었음.

### 🟠 N3 — 편집 중 폼 상태 리셋 ✅ 수정 완료

- 위치: `hooks/use-marker-edit-form.ts` 폼 초기화 `useEffect`.
- 내용: 의존성의 `marker` 객체가 **백그라운드 refetch(staleTime 30s / `invalidateQueries`)로 참조만 바뀌면 effect 재실행 → 입력 중이던 name/lat/lng 등이 DB 값으로 덮어써짐**.
- 조치: `initializedKeyRef`(대상 `id:mode` 기준) 가드로 **최초 열림 시 1회만 초기화**. 로딩 지연 시 초기화 보류 로직 유지, 모달 닫힘 시 ref 리셋.

### 🟡 N4 — 편집 훅 코드 정리 ✅ 수정 완료

- 죽은 스칼라 state **9개**(`facilityYear`·`projectCode`·`facilityCode`·`businessType`·`finalStationName`·`eqClass`·`eqType`·`installDate`·`openDate`) 제거 — setter만 호출되고 값은 읽히지 않던 유령 상태(스펙-리스트 리팩터 후 `equipmentItems`가 대체). 선언 + 두 분기 setter 호출 삭제.
- `marker as any`/`item: any` → `EquipmentMarker`/`BatteryMarker`로 좁힘.
- `catch (err: any)` 2곳 → `catch (err)` + `getSupabaseErrorMessage(err: unknown)` 헬퍼(`instanceof Error`·`message`·`details` 안전 추출).

### 🟡 N5 — API/스크립트 하드닝 ✅ 수정 완료

- `app/api/roadview-dates/route.ts`: `panoId`를 `encodeURIComponent`로 감싸 경로 이탈(`/`·`?`) 차단.
- `components/public-env-script.tsx`: `JSON.stringify` 결과의 `<`를 `<`로 이스케이프 → env 값에 `</script>`가 있어도 태그 조기 종료 방지(브레이크아웃 하드닝).

### 🟡 N6 — `lib/excel/data-manager/parse.ts` 타입 정리 ✅ 수정 완료

- deprecated `String.prototype.substr()` 3곳 → `slice()`.
- 미사용 import 제거(`FACILITY_TEAM_MAP`, `getFacilityTeamExportLabel`).
- 4개 파서 메서드 시그니처 확정: `(file: File): Promise<Record<string, unknown>[]>`, JSDoc의 `{타입}` 태그 제거(TS 타입으로 이관). 암시적 `any`·중복 타입 힌트 해소.
- 남김(의도): `parseMethods: Record<string, any> & ThisType<any>`의 `any`는 `index.ts`의 `ThisType` 합성 구조상 유지. 완전 타입화는 합성 재설계가 필요해 별도 작업으로 분리.

### 잔여 항목

- **P4 죽은 코드 `computeCaptureOverlayOffsets`** — 사용자 요청으로 계속 보존.
- **parse.ts 동적 파싱 객체 타입화** — N6에서 시그니처만 확정, 내부 `Record<string, any>`는 향후 스펙 인터페이스 정의로 점진 제거 가능.
