# Implementation Plan

## [2026-07-23] 동/구역 실제 그룹 분리 — group_key 도입(번지 하위 분리·원복)

### 사용자 요청 (원문)

**최초 요청**
> 지번에 여러대의 장비가 있을 때 하나를 대표로 잡고 추가로 등록된 장비를 SUB로 함, 그러나 지번에 1나만 있을때는 단독임 이게 기본 전제인데, 아파트나 공장등 번지가 큰데는 동일 지번에 여러군데에 장비가 시설이되어 이분분을 위치를 분리를 하고 싶어, 쉽게말해서 아파트는 동단위로 시설이 되니 설명할께
> 예시로 광주 북구 월출동 695-6번지 여기에 103동, 107동, 105동, 110동 이렇게 들어가고 지하에도 들어가는데 맨처음 등록은 1개의 대표로 나머지는 SUB임, 내가 동의로 분리 했으면  매처음 만들었던 그룹에서는 빠지고, 분리된 동의로 새로이 대표, SUB로 해서 만들어줬으면해, 맨처음 만들었던 그룹에 대표까 뺘져나갔다 그럼 남아있는 장비중에 대표로 돌리는 수정을 해줘

**확인 (질의응답)**
- 기존 `detached_visible`(동 개별 표시, 핀만 노출)은 **유지**하고, 실제 그룹을 만드는 **별도 "분리" 버튼**을 새로 추가. 아파트뿐 아니라 **공장 등 범용** 개념으로.
- 분리한 그룹을 원래 번지 그룹으로 되돌리는 **"합치기(원복)"** 기능 필요.
- **지하/기타**도 각각 별도 분리 가능해야 함.

### 파악 결과

- 그룹은 **번지 키**(`getLotAddressKey`)로 매번 계산. `parent_marker_id`/`group_role`은 저장하지만, 상세 모달 `getAddressGroupMates`가 같은 번지면 무조건 다시 한 그룹으로 합침 → 번지 하위 분리가 영구히 유지되지 않음.
- 현재 "동 개별 표시"는 `detached_visible`(지도 핀만 노출)일 뿐, SUB는 여전히 번지 대표의 자식 → 진짜 그룹 분리가 아님.
- 지도(`kakao-map-canvas`)는 `parent_marker_id==null`(대표/단독) 또는 `detached_visible`만 렌더 → 새 그룹의 대표(parent=null)는 자동으로 핀이 뜸(추가 작업 불필요).
- 재그룹/백업이 번지 키로 재계산·왕복하므로 분리 상태를 보존할 **영구 식별자**가 필요.

### 설계

**데이터 모델: `markers.group_key text NULL` 추가**
- 유효 그룹 키 `getEffectiveGroupKey(row)` = `group_key`(있으면) ↔ 없으면 `getLotAddressKey(주소)`.
- 그룹 = 유효 키가 같은 마커 집합. 그룹 내 대표(있으면 유지, 없으면 `created_at` 최초)·나머지 SUB·1개면 단독 — 기존 규칙 그대로, 키만 유효 키로 교체.

**분리 라벨 파서 일반화 (`parseSeparationLabel`)**
- `NNN동` → `"103동"`, `지하`/`B1` 등 → `"지하"`, 그 외 → `"기타"`. (아파트 동/공장 구역 범용, 국소명 기반)
- 기존 `parseDongLabel`/`getMarkerDongLabel`을 이 파서로 확장(지하 인식 추가).

**분리(split) — 라벨 그룹 단위**
- 선택 라벨 그룹의 국소들에 새 `group_key = ${lotKey}#${label}#${repId8}` 부여(안정 유니크).
- 그 그룹 내: 기존 대표 있으면 유지, 없으면 최초 created_at → 대표(parent=null), 나머지 SUB(parent=대표), 1개면 단독.
- **원 번지 그룹에서 대표가 빠져나갔으면** 잔여 국소 중 최초를 새 대표로 승격(1개면 단독) — 기존 `changeMarkerGroupRole`의 승격 로직 재사용/공용화.

**합치기(원복)**
- 해당 라벨 그룹 국소들의 `group_key=null` → 번지 그룹 복귀 후, 번지 그룹 전체 대표/SUB 재정렬.

**재그룹·상세·백업 유효 키 반영**
- `address-group.ts` `assignMarkerParentsByLotAddress`·`applyMarkerRolesFromStoredGroupRole`: `group_key` 조회·유효 키로 그룹·`group_key` 보존(단독 보존과 동일 패턴).
- 상세 모달 `getAddressGroupMates`/`relatedEquipmentMarkers`/`changeMarkerGroupRole`: 유효 키 기준으로 변경 → 분리된 그룹은 상세·구분 변경이 그 그룹 안에서만 동작.
- 백업 `full-backup.ts` `TABLE_COLUMNS.markers`에 `group_key` 추가 → 백업/복원 왕복 보존.

**UI**
- "동일 번지 국소 개별 배치" 패널 각 라벨 그룹 헤더에 **"분리"**(미분리 시) / **"번지로 합치기"**(분리됨 시) 버튼 추가. 기존 detached 개별표시 버튼은 유지.

### 변경 파일

- `supabase/migrations/2026072x_add_group_key.sql` (신규): `group_key` 컬럼+인덱스+`NOTIFY pgrst`.
- `src/features/map-marker/types/marker.ts`: `EquipmentMarker.groupKey`.
- `src/features/map-marker/api.ts`: `group_key`→`groupKey` 매핑.
- `src/features/map-marker/lib/address-group.ts`: `getEffectiveGroupKey`·분리/원복 헬퍼·재그룹 함수 유효 키화.
- `src/features/map-marker/components/modals/marker-detail-modal.tsx`: 라벨 파서 확장, 분리/합치기 핸들러·버튼, 유효 키 기반 mates.
- `src/features/map-marker/lib/excel/data-manager/full-backup.ts`: 백업 컬럼에 `group_key`.

### 완료 기준

- 695-6번지 예시에서 103동 "분리" → 103동이 번지 그룹에서 빠지고 독립 대표+SUB, 지도에 별도 대표 핀. 지하/기타도 각각 분리 가능.
- 분리로 원 대표가 빠지면 잔여 국소에 새 대표(또는 단독) 승격.
- "번지로 합치기"로 원복, 재정렬.
- 엑셀 재업로드·백업/복원 후에도 분리 상태 유지.
- tsc/eslint/vitest 통과.

---

## [2026-07-23] 연관 상세 범위 — 동 분리 여부에 따라 전체/해당 동 + 대표 단독 시 승격

### 사용자 요청 (원문)

> 동일지번에 동으로 분리를 안했는데, 장비가 동의 장비만 보이네.. 분리가 안됐으면 안됀거는 장비 전체가 보여야 되고, 분리가 됐으면 분리된 장비만 보여야됨, 그리고 대표가 분리 됐으면 남아있는 것중에 하나가 대표로 변경되어야 하는껏도 수정이 필요함

### 파악 결과

- `detailEquipmentMarkers`가 국소명에 동 표기만 있으면 항상 동 필터 → 미분리여도 `(103동 N건)`만 표시.
- 대표→단독 변경 시 남은 국소 대표 승격 없음.

### 설계

- 동 필터는 **해당 동이 개별 표시(detached_visible)된 경우만** 적용. 아니면 동일 번지 전체.
- 표 제목도 동일 조건(`103동 N건` vs `동일 번지 N건`).
- `changeMarkerGroupRole(단독)`: 대상이 대표였으면 남은 국소 중 1명을 새 대표(1명만 남으면 단독)로 승격.

### 완료 기준

- 동 미분리 상세 → 동일 번지 전체. 동 개별 표시 후 → 그 동만.
- 대표 단독 분리 시 잔여 국소에 새 대표(또는 단독) 지정.
- tsc/eslint 통과.

---

## [2026-07-23] 연관 상세 구분 — 국소별 대표/단독/SUB 변경

### 사용자 요청 (원문)

> 동으로 분리를 했는데, 국소별로 대표, 단독, SUB 변경하고 싶은데 없어 추가해줘

### 파악 결과

- 동 분리 후 연관 상세 `(103동 N건)` 표의 **구분**은 텍스트만 표시(이전 `대표로`/`단독으로` 버튼은 동 그룹 UI 도입 때 제거됨).
- DB 역할은 `markers.group_role` + `parent_marker_id` (`address-group.ts`의 대표/SUB/단독).

### 설계

- 구분 열에 `<select>`(대표/단독/SUB). 로그인 시에만 변경.
- `changeMarkerGroupRole(markerId, role)`:
  - **대표**: 동일 번지 그룹에서 이 국소를 대표(`parent=null`), 나머지(단독 제외)는 SUB로 이 국소에 연결.
  - **단독**: `parent=null`, `group_role=단독`(그룹 이탈, 지도에 단독 표시).
  - **SUB**: 현재 대표(없으면 다른 국소를 승격)에 `parent` 연결.
- 표 구분은 DB 실제 역할 표시. 동 표시용 `applyDongDisplayRoles` 덮어쓰기는 표에서 제거(선택값과 불일치 방지). 지도 핀은 기존 `detached_visible` 유지.

### 완료 기준

- 103동 상세 표에서 국소마다 구분 변경 가능, 저장 후 목록/지도 반영.
- tsc/eslint 통과.

---

## [2026-07-23] 동 개별 표시 — 동당 대표 1핀만 (SUB 지도 숨김)

### 사용자 요청 (원문)

> 동을 동으로 분리를 했는데 마커가 1국소씩 분리가 됐는데 개별분리를 했어도 동이 같의니 이중에 하나를 대표로 해주고 SUB 마커를 표시 안해줬면 함

### 파악 결과

- `동 전체 개별 표시`가 동 내 전 국소 `detached_visible=true` → 지도에 국소마다 핀이 생김.
- 요구: 같은 동이면 대표 1개만 지도에, SUB는 숨김. 상세 표의 구분도 동 내 1대표+SUB.

### 설계

- `pickDongMapRepresentative(subs)`: 이미 표시 중인 국소 우선, 없으면 이름순 첫 국소.
- `setGroupDetached(true)`: 대표만 `detached_visible=true`, 동 내 나머지 false.
- `setMarkerDetached(true)`: 해당 국소를 동 대표로(같은 동 다른 핀은 끔).
- 상세 오픈 시 동당 표시 핀이 2개 이상이면 1개로 자동 정리.
- 상세 표(동 필터): 동 대표를 `대표`, 나머지를 `SUB`로 표시.
- UI 문구: 동당 대표 1핀 기준으로 버튼/안내 수정.

### 완료 기준

- 103동 개별 표시 → 지도 핀 1개, 연관 상세는 103동 N건(1대표+SUB).
- tsc/eslint 통과.

---

## [2026-07-22] 연관 상세 — 개별 표시 동(棟)만 필터

### 사용자 요청 (원문)

> 103동만 개별분리 했으면 장비 상세도 103동만 나와야 하는데 모든게 다보이네 .. 수정해줘

### 파악 결과

- 103동 SUB를 개별 표시로 열어보면 표 제목이 `(동일 번지 16건)` — 같은 번지 전체(109·115·121동 등)가 나옴.
- 직전 수정에서 `relatedEquipmentMarkers`(대표+전 형제)를 표에 그대로 써서 동 범위가 무시됨.
- 그룹 빌더의 information **잔여 행 append**도 다른 동 행을 추가로 붙일 수 있음.

### 설계

- 상세 표 전용 `detailEquipmentMarkers`: 현재 국소명에서 `parseDongLabel` → 같은 동만 필터. 동 표기 없으면 기존처럼 동일 번지 전체.
- `buildEquipmentDetailRows` 그룹 분기: 잔여 information append 제거(다른 동 오염 방지).
- 제목: 동 필터 시 `(103동 N건)`, 아니면 `(동일 번지 N건)`.

### 완료 기준

- 103동 개별 표시 마커 상세 → 연관 상세에 103동 국소만.
- tsc/eslint 통과.

---

## [2026-07-22] 연관 상세 장비 목록 — 동일 번지 그룹 전원 표시

### 사용자 요청 (원문)

> 그룹으로 분리를 했는데
> 2번째이미지에 장비상세부분에 장비가 4개가 보여야 하는데 1개만 보여 수정해줘

### 파악 결과

- 동일 번지 섹션(동 그룹)에는 SUB 4개가 보이지만, `연관 상세 장비 목록`은 1행만 렌더.
- 원인: `equipmentRows`가 `detailedInfo.length > 0`이면 DB 행만 그대로 사용. fetch 보완 로직이 `facility_code`로 "이미 커버됨"을 판정해, 코드가 겹치거나 information이 1건만 있으면 나머지 국소 행을 넣지 않음.
- 부가: SUB 마커를 열면 `relatedEquipmentMarkers`가 자기 자신만 포함(형제·대표 미포함).

### 설계

- `relatedEquipmentMarkers`: 대표면 자식, SUB면 대표+형제 전체.
- `equipmentRows`: 동일 번지 국소 **1국소=1행**. information은 marker_id·국소명으로 매칭해 채우고, 없으면 마커 필드로 합성. 단독(그룹 1개)일 때만 information 다건을 그대로 표시.
- fetch 보완: `facility_code` 커버 판정 제거, `marker_id`만으로 누락 보완.

### 완료 기준

- 동 그룹에 4개면 연관 상세에도 동일 번지 국소가 모두 행으로 보인다.
- tsc/eslint 통과.

---

## [2026-07-22] 동일 번지 국소 목록 — 동(棟)별 그룹화 + 동 단위 개별 표시

### 사용자 요청 (원문)

> & 'c:\Users\hyste\OneDrive\사진\Screenshots\스크린샷 2026-07-22 233017.png' 이미지를 보면 오늘쪽에 대표로, 단독으로  로, 으로를 붙였는데 이거 지워주고 이미지처럼 동으로 그룹으로 분리를 하고 싶은데 기능 만들어줘

### 요구사항 확인

- (질문) 동 그룹 후 '지도에 개별 표시' 동작 → **답변: 동 단위 일괄 + 국소 개별 둘 다**.

### 파악 결과

- 대상: `src/features/map-marker/components/modals/marker-detail-modal.tsx` 의 "동일 번지 국소 개별 배치" 섹션.
- 각 SUB 행에 `대표로`(makeRepresentative) · `단독으로`(makeStandalone) · `지도에 개별 표시`(setMarkerDetached) 3버튼.
- 국소명(예: `광천E편한세상121동옥상_2-AAU`, `(5963)…103동옥상-RRU(F2)`)에 `숫자+동` 이 포함됨.

### 설계

- 국소명에서 동 라벨 파싱: `parseDongLabel(name)` → `/(\d+)\s*동/` → `"103동"` 없으면 `null`(→ "기타" 그룹).
- SUB 목록을 동 라벨로 그룹핑, 동 번호 오름차순 정렬(기타는 맨 뒤).
- 렌더: 동별 헤더(동 라벨 + 건수 + **[동 전체 개별 표시 / 동 전체 숨기기]** 일괄 토글) 아래에 국소 행 나열.
- 국소 행: `대표로`·`단독으로` 제거, 기존 국소별 `지도에 개별 표시 / 표시 중·숨기기` 토글은 유지.
- 자기 자신이 detached SUB인 상단 배너의 `단독으로` 버튼도 제거(개별 표시 해제만 유지).
- 일괄 토글: `setGroupDetached(ids, detached)` — `markers.detached_visible` 를 `.in('id', ids)` 로 일괄 update. 그룹 전원이 이미 표시 중이면 '숨기기', 아니면 '개별 표시'. 진행 상태는 `detachingGroup`(동 라벨).
- 미사용화되는 `makeRepresentative`·`makeStandalone`·`changingRepId` 및 관련 import 제거(lint).

### 완료 기준

- 대표로/단독으로 버튼이 사라지고, 목록이 동별로 묶여 표시된다.
- 동 헤더의 일괄 토글로 해당 동 전체가 한 번에 개별 표시/숨김된다.
- 국소별 개별 토글도 그대로 동작한다. 타입체크/린트 통과.

## [2026-07-22] 위치등록(공정관리) 업로드 — 즉시 저장 → 미리보기 후 적용

### 사용자 요청 (원문)

> 위치등록 업로드에서 등록시 바로 데이터 베이스에 입력을 하지말고 내가 위치를 확인 후에 적용을 누를꺼야 이렇게 진행 될 수 있도록 수정해줘

### 파악 결과

- "위치등록 업로드" 버튼(`equipment-excel-section.tsx`) = `uploadErpExcel`(공정관리 시트) → 파싱·지오코딩 후 `markers`·`information`·`erp_details` 에 **즉시 upsert**(미리보기 없음).
- 축전지/장비 pending 흐름은 이미 `addPendingMarkers` → 지도 표시 → "DB 저장 / 전체 취소 / 개별 등록" 패턴 존재(`battery-excel-section.tsx`). → 위치등록에 이 패턴 이식.
- 지도 pending 마커는 드래그 시 `updatePendingMarker`로 좌표가 갱신됨(`kakao-map-canvas.tsx:468`). → "위치 확인 후 적용" 시 드래그로 조정한 좌표를 그대로 저장 가능.
- pending·스테이징 상태는 store `partialize`에 없어 새로고침 시 소멸(임시 특성 유지), 모드 전환에는 잔존.

### 설계

- `uploadErpExcel`을 **빌드(head)** 와 **DB 커밋(tail)** 으로 분리:
  - `buildErpPayload(file)` → `{ markerRows, infoRows, erpRows, meta }`(파싱+지오코딩+행 생성, 기존 좌표 보존 로직 포함)
  - `commitErpToDb(payload, coordOverrides)` → 기존 DB 쓰기(자식행 삭제 → `markers` upsert → `information`/`erp_details` insert → 번지 재그룹 → invalidate)
- 신규 함수:
  - `prepareErpUpload(file)`: build → 스테이징(store) 저장 + `addPendingMarkers("equipment")`(지도 표시). **DB 미저장.**
  - `applyStagedErp()`: 스테이징 payload를 지도상의 (드래그로 조정된) pending 좌표로 덮어써 `commitErpToDb`. 성공 시 pending·스테이징 정리.
  - `cancelStagedErp()`: pending·스테이징 정리.
- 기존 `uploadErpExcel`(직접 저장)은 **자동 라우팅**(`uploadEquipmentExcel`/`uploadLocationExcel`의 ERP 감지 폴백)용으로 유지 → location 모드 등 회귀 방지.
- store: `stagedErpUpload: StagedErpUpload | null` + `setStagedErpUpload`(persist 제외). 타입은 `types/marker.ts`에 정의.
- UI(`equipment-excel-section.tsx`): 업로드 버튼 → `prepareErpUpload`. 아래에 pending 미리보기 패널(건수, **[적용]**/[전체 취소], 개별 위치확인·수정·삭제) — `battery-excel-section` 미러링.

### 동작 (변경 후)

1. 위치등록 업로드 → 파싱·지오코딩 → **지도에 임시(노란) 마커**로 표시(저장 안 함).
2. 사용자가 지도에서 위치 확인, 필요 시 **드래그로 조정**.
3. **[적용]** → 조정된 좌표로 `markers`·`information`·`erp_details` 저장 + 번지 재그룹. [취소] 시 폐기.

### 단계

1. `types/marker.ts`: `StagedErpUpload` 타입.
2. store: `stagedErpUpload` 상태 + 세터.
3. hook: build/commit 분리 리팩터 + prepare/apply/cancel + 반환값 확장(`stagedErpCount`).
4. `equipment-excel-section.tsx`: 버튼 → prepare, pending 미리보기 패널 추가.
5. 검증: `tsc`/`eslint`, 수동(업로드→지도확인→드래그→적용 저장 / 취소 폐기 / 좌표 없는 행은 좌표 없이 저장).

### 범위 밖

- location 모드 ERP 자동 라우팅은 기존 즉시저장 유지. 축전지/장비 기존 pending 흐름 불변. 좌표 없는(지오코딩 실패) 행의 지도 확인(맵 미표시 — 저장은 됨).

---

## [2026-07-22] 같은 지번 다중 시설 — 드래그 개별 배치 + 선택적 SUB 해제

### 사용자 요청 (원문)

> 여기는 광양제철소로 지번이 매우 넓음, 근데 시설위치는 서로 다른데로 마커를 찍어야 하는데 같은 번지라 마커를 1개로 처리 하게되어 있음 이부분을 풀어야 함 어떻게 해야 할까???

### 확정된 요구사항 (질문 확인)

- **좌표 확보**: 지도에서 **드래그로 지정**(소스 엑셀에 시설별 좌표 없음 가정).
- **그룹핑**: SUB는 **기본 숨김 유지**, 사용자가 "해제"한 시설만 개별 마커로 표시(전역 토글 아님, 시설별 옵트인).

### 원인 분석 (현재 "1개로 합쳐지는" 3단계)

1. **지오코딩 좌표 단일화** — `geocode.ts` `geocodeAddressQueue`가 주소 문자열로 캐시 → 같은 지번 = 동일 중심 좌표 1개(넓은 필지는 전부 겹침). 단 엑셀 행별 위경도가 있으면 우선(`parse.ts:129`).
2. **번지 그룹핑** — `address-group.ts` `assignMarkerParentsByLotAddress`가 `getLotAddressKey`(…번지)로 대표 1 + SUB N 지정.
3. **SUB 렌더 제외** — `kakao-map-canvas.tsx:371-379` `isEquipmentSubMarker`면 숨김. → 대표 1개만 보임.
   - 참고: `MarkerClusterer`(`:310`,`:529`)가 이미 있어, 숨김만 풀면 밀집은 클러스터가 자동 처리.

### 설계

- **DB(가산적 마이그레이션)**: `markers`에 `detached_visible boolean not null default false` 추가. 좌표는 기존 `lat`/`lng`(위경도) 컬럼을 드래그 값으로 갱신. → **되돌리기 어려운 스키마 변경이므로 파일만 준비하고 적용은 사용자 승인/실행.**
- **타입·매핑**: `EquipmentMarker.detachedVisible?: boolean`, `api.ts` 매핑에 `detached_visible` 추가(`:145` 부근).
- **렌더 필터**(`kakao-map-canvas.tsx`): `isEquipmentSubMarker(m) && !m.detachedVisible` 일 때만 숨김 → 해제된 SUB는 표시.
- **그룹핑 유지**: 대표/SUB 집계(상세 "동일 번지 N건")는 그대로. 그룹 재계산은 `parent_marker_id`/`group_role`만 갱신하므로 `detached_visible`·좌표를 건드리지 않음(충돌 없음). 해제된 SUB도 같은 번지 그룹에 남아 대표 상세에 계속 집계됨.
- **위치 지정(드래그) UX**:
  - 진입: 대표 마커 상세 모달의 "연관 상세 장비 목록"(동일 번지) 각 행에 **[지도에 개별 표시]** 버튼.
  - 동작: 모달 닫고 지도에 해당 시설의 **드래그 가능한 핀**을 대표 위치에 띄움 → 사용자가 실위치로 드래그 → **[확정]** → `lat`/`lng` + `detached_visible=true` 저장 → 개별 마커로 고정.
  - 되돌리기: 표시된 개별 마커에 **[개별 표시 해제]**(`detached_visible=false`). 좌표는 유지(다음 해제/재표시 시 재사용).
- **저장**: Supabase `markers` update(lat,lng,detached_visible) + 스토어/`useActiveMarkers` 갱신(낙관적 반영 후 refetch).

### 구현 순서 (단계)

1. 마이그레이션 파일 작성(`supabase/migrations/…_add_detached_visible.sql`) — 컬럼 추가. **적용은 사용자.**
2. `types/marker.ts` + `api.ts` 매핑에 `detachedVisible` 반영.
3. `kakao-map-canvas.tsx` 렌더 필터 조건 수정(+ 드래그 핀/확정 오버레이).
4. 마커 위치·해제 저장 API(작은 `updateMarkerPlacement(id, {lat,lng,detachedVisible})`) 추가 + 스토어 연동.
5. `marker-detail-modal.tsx` 목록 행에 [지도에 개별 표시] 버튼, 개별 마커에 [해제].
6. 검증: 마이그레이션 없이도 타입/빌드 통과, 광양제철소 케이스 수동 확인(해제→드래그→저장→새로고침 유지, 미해제 SUB는 여전히 숨김).

### 범위 밖 (이번 제외)

- 축전지/location 모드. 엑셀 시설별 좌표 자동 매핑. 자동 분산(스파이럴). 대량 일괄 배치 UI.

### 확정 필요 (구현 착수 전)

- 드래그 진입점: 위 "대표 상세 모달의 시설 목록 버튼" 방식으로 OK인지(대안: 지도에서 대표 우클릭 → 시설 선택).
- 마이그레이션 적용 방식: 파일만 만들고 사용자가 `supabase db push`/대시보드로 적용 vs. 다른 절차.

---

## [2026-07-22] 마커 상세 모달 — GPSMAP 좌표·주소 변환 + 건축물대장 연동

### 사용자 요청 (원문)

> 마커 상세 정보에도 [스크린샷 215704.png] 이정보가 들어가도록 우선 계획 웹페이지 구현해줘

(스크린샷 = GPSMAP 변환 결과: 구/신주소·우편번호·좌표·위도/경도(도분초)·구글좌표·PNU + 건축물대장 9항목)

### 확정된 요구사항 (질문 확인)

- **적용 범위**: 장비(equipment) 마커 상세 모달만. 축전지 모달은 기존 유지.
- **조회 시점**: 모달 열 때 마커 좌표로 자동 조회(로딩 표시, 재열람 캐시로 중복 호출 방지).
- **표시 항목**: 스크린샷 전체 — 주소/좌표 변환(구주소·신주소·우편번호·좌표·위도(도분초)·경도(도분초)·구글좌표·PNU) + 건축물대장(건물명칭·동명칭·지상층수·지하층수·연면적·대지면적·건축면적·주용도·세부용도).

### 파악 결과

- 마커는 모두 `lat`/`lng` 보유(`BaseMarker`). → 좌표 기반 조회 가능.
- 기존 GPSMAP 로직 재사용: `runSingleLookup(\`${lat}, ${lng}\`)`(`features/gpsmap/lib/lookup.ts`)이 좌표 입력을 그대로 받아 역주소·PNU·필지·건축물대장까지 병합해 `GpsLookupResult` 반환. 스크린샷 항목 전부 이미 포함.
- VWorld 호출은 전부 브라우저 JSONP(`vworld-gpsmap.ts`), 키는 `NEXT_PUBLIC_VWORLD_API_KEY`(앱에 이미 설정). 별도 백엔드 불필요.
- 대상 파일: `features/map-marker/components/modals/marker-detail-modal.tsx` (좌표·주소 정규화는 직전 작업으로 `normalizeRegionForDisplay` 반영 완료).

### 목표 (이번 증분)

- 장비 상세 모달에 **「좌표·주소 변환」** + **「건축물대장」** 두 카드(또는 섹션) 추가.
- 모달 열림 + 장비 모드 + 좌표 유효 시 `runSingleLookup`으로 자동 조회. 로딩/실패 상태 표기.
- 재열람 시 같은 좌표는 재호출하지 않도록 좌표 키 캐시(간단 Map 또는 마지막 좌표 비교).
- 표 무개행·가로 스크롤 금지 규칙 준수(세로 스크롤 허용). 값 없으면 `-`.

### 구현 계획 (단계)

1. 모달에 상태 추가: `gpsInfo: GpsLookupResult | null`, `gpsLoading: boolean`, `gpsError: string | null`, 마지막 조회 좌표 ref(캐시).
2. `useEffect`(deps: isDetailOpen, mode, marker.lat, marker.lng): 장비 모드·좌표 유효 시 `runSingleLookup` 호출 → 성공 시 저장, 실패 시 에러 문구. 좌표 동일하면 skip.
3. UI: 기존 `위치 정보` 카드 아래(또는 grid 다음)에 접이식 섹션 2개.
   - 좌표·주소 변환: 구주소·신주소·우편번호·좌표·위도(도분초)·경도(도분초)·구글좌표·PNU (label/value 행).
   - 건축물대장: 9항목. 조회 결과 없으면 안내 문구(기존 gpsmap 페이지와 동일 톤).
4. 로딩 중 스켈레톤/「조회 중…」, 실패 시 회색 안내. 키 없음 등 에러 메시지 그대로 노출 금지(사용자 친화 문구).
5. 검증: `next build`/타입체크, 장비 마커 열어 값 표시 확인, 좌표 없는 마커/조회 실패 케이스 확인.

### 범위 밖 (이번 제외)

- 축전지·location 마커 모달. VWorld 조회 결과 편집/저장(표시 전용). 엑셀 내보내기 연동.

### 남은 항목 (다음 증분 후보)

- 축전지 모달 확장 · 조회 결과 마커 필드에 캐싱/저장 · 상세 모달에서 GPSMAP 페이지로 딥링크

---

## [2026-07-19] GPSMAP — 듀얼 브이월드 지적도(하단 페인·양방향 동기화)

### 사용자 요청 (원문)

> 듀얼 브이월드 지적도 진행해줘

### 파악 결과 (원본 GPSMAP_V3.1 방식)

- 하단 지도 = **Leaflet + VWorld XDWorld 2D 베이스 타일**(`xdworld.vworld.kr/2d/Base/{z}/{x}/{y}.png`, 키 불필요)
- 지적도 = **VWorld WMS 오버레이**(`lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun`, 브라우저 직접 로드 — 서버 프록시 불가)
- 카카오 레벨 ↔ Leaflet 줌 = `20 - 값`, `mapSyncLock`으로 무한 동기화 방지
- 이 프로젝트는 Kakao SDK만 사용 → Leaflet 신규 도입(클라이언트 전용 dynamic import로 SSR/정적 프리렌더 회피)

### 목표

- `/gpsmap` 지도를 상·하 2단(상단 카카오 위성 / 하단 브이월드 지적도)으로 분할해 교차 검증
- 양방향 이동·줌 동기화, 조회 시 두 지도 동시 이동 + 선택 필지 빨간 경계 동시 표시
- 하단 지적도 ON/OFF 토글

### 남은 항목 (다음 증분 후보)

- 건축물대장 동별 콤보박스 · 카카오 지적도(USE_DISTRICT)/로드뷰 ON·OFF · 처리 로그 터미널 · 엑셀 개별시트 지도이미지 삽입

---

## [2026-07-19] GPSMAP — 지도 클릭 탐색 + GPS 도분초 강제이동

### 사용자 요청 (원문)

> 여기 웹에 구현중에 멈췄음 여기에 해줘

### 파악 결과

- 직전 "이어하기"(라우트·사이드바·단건/일괄·엑셀)는 **실제 완료·`next build` 통과** 확인
- 원본 HTML/PPTX 스펙 대비 웹 미구현: **지도 클릭 탐색**, **GPS 도분초 강제이동**, 동별 콤보박스, 듀얼맵(브이월드 지적도), 지적도/로드뷰 토글, 처리 로그 터미널, 엑셀 지도이미지

### 목표 (이번 증분)

- 지도 클릭 → 해당 지점 좌표로 즉시 조회(역주소·필지 강조·건축물대장), 기존 `runSingleLookup` 재사용
- GPS 도분초(위도/경도 각 도·분·초·1/100초) 입력 → 이동, 조회 결과 시 도분초 박스 자동 채움

### 남은 항목 (다음 증분 후보)

- 건축물대장 동별 콤보박스(여러 동) · 듀얼 브이월드 지적도 · 카카오 지적도/로드뷰 ON·OFF · 처리 로그 터미널 · 엑셀 개별시트 지도이미지 삽입

---

## [2026-07-19] GPSMAP 통합 이어하기 — 라우트·일괄·엑셀

### 사용자 요청 (원문)

**최초 요청**
> ## [2026-07-19] GPSMAP 통합 — 주소·좌표·필지·건축물대장 통합 조회/변환기
> 이걸 만들다가 멈췄느데 구조를 파악하고 진행해줘

### 파악 결과
- Phase 1~3 코드(`coords`/`vworld-gpsmap`/`lookup`/`gpsmap-page`)는 있으나 **`/gpsmap` 라우트 미연결**로 진입 불가
- Phase 4~5(일괄·엑셀) 미구현

### 목표
- `/gpsmap` 진입 + 사이드바 링크
- 단건/일괄 조회 + 결과 엑셀 다운로드

---

## [2026-07-19] GPSMAP 통합 — 주소·좌표·필지·건축물대장 통합 조회/변환기

### 사용자 요청 (원문)

**최초 요청**
> & 'c:\Users\hyste\OneDrive\바탕 화면\GPSMAP_V3.1\GPSMAP_V3.1.html'& 'c:\Users\hyste\OneDrive\바탕 화면\업무간소화_주소 및 좌표 통합 변환기(GPSMAP)_260619.pptx' 이기능을 추가할려고 하는데 계획문서 만들어줘

참조: `GPSMAP_V3.1.html`(단일 파일 도구, 1.5MB), 제안서 PPTX(명신정보통신, 2026.06)

### 배경 (제안서 요약)

- ERP 주소/좌표 불일치, BP별 다른 지도 사이트 사용으로 좌표값 차이·오차 발생
- 시험성적서 GPS 좌표와 주소검색 좌표 상이 → 국소별 개별 검색으로 업무 시간 과다
- 필지·건축물 정보 확인 위해 여러 사이트 반복 조회 → 효율화 필요
- 목표: GPS좌표·필지·건축물·지도·로드뷰 **단일 플랫폼 통합 조회**, 100건+ 국소 동시 조회·엑셀 다운로드로 ERP 현행화 지원

### GPSMAP 기능 ↔ 현재 앱 매핑

| GPSMAP 기능 | 현재 앱 | 조치 |
| --- | --- | --- |
| 카카오맵 표시 | 있음 | 재사용 |
| 필지 경계(빨간 폴리곤) | 있음(VWorld JSONP) | 재사용·확장 |
| 로드뷰 | 있음 | 재사용 |
| 역지오코딩(좌표→주소) | 있음(우클릭) | 재사용 |
| 엑셀 입출력(xlsx) | 있음 | 재사용·확장 |
| 다중 입력 일괄 변환 UI | 없음 | 신규 |
| 스마트 입력 파서(주소/상호/GPS/도분초 자동판별) | 없음 | 신규(HTML 로직 이식) |
| 좌표 변환(십진수↔도분초, 구글검색용) | 없음 | 신규 |
| 구주소/신주소/우편번호 | 부분 | 확장 |
| 건축물대장 요약(층수·연면적·대지·용도·PNU) | 없음 | 신규(VWorld 국가중점+LT_C_BLDGINFO) |
| 결과 일괄 엑셀(+지도캡처) | 부분 | 신규·확장 |

### 아키텍처 방침

- VWorld 호출은 전부 **브라우저 직접 JSONP** (Cloudflare egress 502/520 차단 회피 — 필지 기능에서 검증됨). `lib/parcel-boundary.ts`의 jsonp 헬퍼를 공용 `lib/vworld.ts`로 승격 후 건축물정보에서 재사용.
- 건축물대장: VWorld **국가중점 API(getBuildingUse, PNU 기반)** + **LT_C_BLDGINFO(2D 건축물정보)**. VWorld 키에 "국가중점 API" 권한 필요. 용도코드→한글 매핑 이식.
- 좌표 파서·형식 변환은 HTML의 순수 JS 로직을 TS 순수 함수로 이식(단위 테스트 용이).
- 지오코딩(주소/상호): 카카오 검색. 현재 JS SDK `services` 사용 중이라 우선 재사용, 상호명 검색 정확도 필요 시 카카오 REST(서버 프록시) 검토.

### 배치(UI) — 결정 필요

- (A) 전용 라우트 `/gpsmap` (일괄 변환기 + 지도) ← **권장**(대량 조회/엑셀 워크플로가 마커 지도와 성격이 다름)
- (B) 사이드바 새 모드/탭("변환")으로 통합
- (C) 모달

### 단계별 계획

- **Phase 1 — 코어 유틸(무 UI)**: 입력 타입 판별, 좌표 파서, 십진수↔도분초 변환, 구글검색용 좌표. 단위 테스트.
- **Phase 2 — VWorld 공용 모듈 `lib/vworld.ts`**: jsonp + 지오코딩 + 필지 + 건축물(getBuildingUse/LT_C_BLDGINFO) + 용도코드 한글화.
- **Phase 3 — 단건 조회 패널**: 입력 1건 → 구/신주소·우편·좌표(도분초)·필지경계·건축물대장 표시(지도 연동).
- **Phase 4 — 다중 입력 일괄 처리**: textarea 여러 건 → 순차 큐 → 결과 테이블(진행률).
- **Phase 5 — 결과 엑셀 다운로드**: 전 컬럼(아래), 옵션으로 지도 캡처(기존 `map-capture-stitch` 재사용 검토).
- **Phase 6 — API 키 설정**: env 고정(권장) 또는 설정 UI.

### 출력 엑셀 컬럼 (HTML 기준)

입력값 · 검색출처 · 구주소 · 신주소 · 우편번호 · 위도 · 경도 · GPS_위도 · GPS_경도 · 위도(도/분/초/시) · 경도(도/분/초/시) · 구글검색용 좌표 · PNU · 연면적 · 대지면적 · 건축면적 · 주용도 · 세부용도 · 건물명칭 · 건물동명칭 · 지상층수 · 지하층수

### 리스크 / 확인 필요

- VWorld **국가중점 API 권한**(건축물대장) — 현재 키에 있는지 확인 필요.
- 배포 도메인 `newmarker.celyoon.workers.dev`를 VWorld에 등록해야 브라우저 JSONP Referer 통과.
- 카카오 상호명 검색은 REST 키가 더 정확 — 현재 JS 키만 보유. 필요 시 서버 프록시.
- 지도 캡처 엑셀은 HTML이 화면공유(getDisplayMedia) 사용 — 기존 타일 스티칭(`map-capture-stitch`)으로 대체 가능한지 검토.
- 대량(100건+) 처리 시 API rate limit → 순차 큐·딜레이 필요(기존 `geocodeAddressQueue` 패턴 재사용).

### 완료 기준

- 단건: 주소/좌표 입력 → 지도 이동·필지경계·구/신주소·좌표변환·건축물대장 표시.
- 다건: 여러 건 입력 → 일괄 결과 + 엑셀 다운로드.
- `tsc`/`eslint` 통과, 배포 환경 동작(VWorld 브라우저 JSONP).

---

## [2026-07-19] 프로젝트 코드로 사업연도 추출

### 사용자 요청 (원문)

**최초 요청**
> 사업년도를 확인하는 방법을 알려줄계
> 이미지는 프로젝트 코드인데 영문.영문+26+숫자 혹은 문자.
> 형식인데 영문.영문+여기부분이 연도임
> 이해 했을까??

**추가 확정**
> 맞어 이렇게 하면 사업연도가 됨

### 목표
- 프로젝트 코드 두 번째 구간의 YY를 사업연도(시설연도, `2026` 형식)로 추출

---

## [2026-07-19] 백업 엑셀에 색상 열 추가

### 사용자 요청 (원문)

**최초 요청**
> 데이터 백업 및 복원에서 색상 필드값이 없네, 수정할 수 있게 추가해줘

### 목표
- 전체 백업 선두 열에 `색상`을 넣고, 복원 시 markers.color에 반영

---

## [2026-07-19] 상세 표 줄바꿈 금지 + 규칙 추가

### 사용자 요청 (원문)

**최초 요청**
> 표를 보면 줄빠굼이 있어 난 줄빠굼이 싫어 ~~~
> 이부분 수정해줘 그리고 
> 위내용 부분을 스킬이나, 규칙 부분에 추가해줘

### 목표
- 연관 상세 장비 목록 표 셀 줄바꿈 제거
- Cursor 규칙으로 표 줄바꿈 금지 고정

---

## [2026-07-19] 스키마 마이그레이션 SQL 통합

### 사용자 요청 (원문)

**최초 요청**
> @0004_NewMapMarker/supabase/migrations/20260718120000_recreate_full_schema_with_erp.sql @0004_NewMapMarker/supabase/migrations/20260719010000_add_parent_marker_id.sql @0004_NewMapMarker/supabase/migrations/20260719020000_add_group_role.sql 하나의 sql로 만들어줘

### 목표
- 세 마이그레이션을 하나의 SQL로 통합하고 개별 파일 제거

---

## [2026-07-19] 토스트 UI를 앱 다크 스타일에 맞춤

### 사용자 요청 (원문)

**최초 요청**
> 우측하단에 이미지처럼 창이 뜨는데 현재 ui와 맞지 않은 스타일임 스타일 맞쳐줘

### 목표
- 알림 토스트를 사이드바·모달과 같은 slate 다크 스타일로 통일
- 백업 완료 메시지의 `undefined` 카운트 버그 수정

---

## [2026-07-19] 백업 선두 6열 고정

### 사용자 요청 (원문)

**최초 요청**
> 이 필드값은 데이더 백업다운로드할 때 무조건 맨 앞에 와야함

### 목표
- 백업 엑셀 맨 앞 열을 `위도, 경도, 마커아이디, 등록일, 구분, 시설연도`로 고정

---

## [2026-07-19] 백업 엑셀 열을 공정 업로드 79열과 일치

### 사용자 요청 (원문)

**최초 요청**
> 업로드한 공정의 열과 데이터 백업한 파일의 열과 맞지가 않아 공정 업로드 열로 맞쳐줘

### 목표
- 전체 백업 엑셀 열 순서·이름을 공정관리 업로드(`통합 문서1.xlsx`) 79열과 동일하게 맞춤

### 범위
- 포함: `full-backup.ts` export 헤더 순서
- 제외: 공정 업로드 파서 자체 변경

### 접근
- 공정 79열을 고정 헤더로 사용
- 복원용 `위도/경도/마커아이디/등록일/구분`은 79열 뒤에 붙임

---

## [2026-07-19] 장비 업로드 메뉴 정리·추가항목 업데이트

### 사용자 요청 (원문)

**최초 요청**
> 여기 메뉴에서 불필요한 메뉴는 삭제해주고
> 상세장비 업로드는 공정관리 시트 업로드의 양식파일을 추가된 입력부분이 있음 이것을 업데이트 하는 기능으로 변경해줘

**추가 확정**
> 추천 답안으로 해줘
> (초록 Excel/CSV 삭제, ERP 유지, 보라를 information 추가항목 업데이트로)

### 목표
- 장비 업로드 UI를 ERP + 추가항목 업데이트 2개로 단순화

---

## [2026-07-19] 주소 동일 시 대표·서브 국소 취합

### 사용자 요청 (원문)

**최초 요청**
> 주소가 같을 경우 하나의 국소로 취합을 해야함
> 여러개의  값이 있을건데, 맨먼저 등록된 국소를 대표로 잡고 이후에 등록된 국소를 서브로 설정하면됨

**추가 확정**
> 추천 답안으로 해줘 / 주소가 번지까지 일치하면 같은걸로 보면됨
> (업로드·저장 시 취합, 지도에 대표 핀만, 상세에 서브 목록)

### 목표
- 동일 번지 주소를 대표·서브로 묶어 지도 핀을 1개로 표시

### 접근
- `markers.parent_marker_id` 추가
- ERP 업로드·백업 복원 후 `assignMarkerParentsByLotAddress`로 전량 재취합

---

## [2026-07-19] 전체 백업을 엑셀 1시트로 변경

### 사용자 요청 (원문)

**최초 요청**
> 데이터 백업 및 복원은 다운로드 파일에 엑셀로 해주고
> yyyymmdd_파일명 형식으로 해줘

**추가 확정**
> 하나의 시트로 해줘요~

### 목표
- 전체 백업·복원을 JSON 대신 엑셀 1시트로 제공
- 파일명 `yyyymmdd_mapmarker_backup.xlsx`

### 접근
- `테이블` 구분 열로 5개 테이블 행을 한 시트에 저장
- 복원 시 테이블별 허용 컬럼만 파싱 후 전면 교체

---

## [2026-07-19] 전체 데이터 1파일 백업·복원

### 사용자 요청 (원문)

**최초 요청**
> 장비탭에서 엑셀업로드를 아래 파일로 위치찍기 업로드 파일로 변경했음
> @c:\Users\hyste\OneDrive\바탕 화면\통합 문서1.xlsx
> 그일환으로 데이터 백업 및 복원쪽도 변경을 해줘

**추가 확정**
> 백업 및 복원도 1개의 파일로 하게끔 변경을 해줘 / 전체 데이터를 한번에 / 전면 교체 / 백업 1파일 → 복원 1회 → 주요 화면 데이터 일치 / 바로 구현

### 목표
- 테이블별 Excel 다중 백업·복원을 제거하고, 전체 DB 스냅샷 1파일로 통일
- 복원 시 기존 데이터 전면 교체

### 범위
- 포함: `BackupRestoreSection` UI, `useDataBackupActions` 전체 JSON 백업·복원(전면 교체)
- 제외: 장비탭 위치찍기 업로드(이미 변경됨), 테이블별 Excel export 유틸 자체

### 접근
- 기존 `exportFullJson` / `importFullJson`을 UI에 연결
- 복원 전 markers·battery_markers 전체 삭제(CASCADE로 자식 정리) 후 재삽입

---
