# MapMarker Pro - 구현 계획 이력 (Implementation Plans History)

본 문서는 개발 과정에 따라 작성된 기능별 구현 계획서의 역사적 기록물입니다. 새로운 기능의 구현 계획은 상단(가장 최신)에 누적하여 추가합니다.

---

## [2026-06-06] Supabase 'information' 테이블 필드 확장(국소명-최종 등) 및 업로드/조회 연동 계획

### 1. 개요
상세 장비 업로드용 Excel 데이터(국소명-최종, 가동일 등)를 완벽하게 반영하기 위해 Supabase `information` 테이블의 스키마를 보완하고, 웹마커 앱 내에서 데이터 누락 없이 수집·upsert 및 상세 보기 모달 연동이 가능하도록 관련 모듈을 전면 업데이트합니다.

### 2. User Review Required
> [!IMPORTANT]
> **데이터베이스 스키마 및 UI 매핑 정보**
> 1. **`final_station_name` (국소명-최종)**: `information` 테이블에 새로운 필드로 정의하며, `place_name` (장소 이름)과는 별개로 저장하여 정밀 매칭 및 데이터 무결성을 유지합니다.
> 2. **`open_date` (가동일 / 개통일)**: 엑셀 내 `가동일` 컬럼이 `open_date` 필드로 바르게 수집 및 변환될 수 있도록 파싱 매핑 규칙을 보강합니다.
> 3. **SQL 스크립트 실행 필요**: 본 작업이 완료된 후 사용자는 제공되는 `001.MapMarker/sql/update_schema.sql` 쿼리를 Supabase SQL Editor에서 한 번 실행해야 합니다.

### 3. Proposed Changes

#### [SQL DDL]
##### [NEW] [update_schema.sql](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/sql/update_schema.sql)
- `information` 테이블에 `final_station_name` (국소명-최종) 컬럼 추가.
- `open_date` 컬럼에 `가동일` 데이터가 정상 수집되도록 호환성 마련.
- 기존 테이블이 없는 사용자를 위해 전체 `information` 및 `markers` 확장 테이블 생성 쿼리 포함.

#### [UI / HTML]
##### [MODIFY] [index.html](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/index.html)
- 마커 상세 정보 수정/등록 폼(`detailed-info-form-wrapper`) 내에 `국소명-최종`을 직접 작성 및 수정할 수 있는 입력 필드(`marker-final-station-name`) 추가.
- 상세장비 정보 전송 확인 모달(`info-confirm-modal`)의 테이블 헤더를 이미지의 필드 순서와 일치하도록 수정: `국소명` -> `장소 이름` 및 `국소명-최종`으로 헤더 분리.

#### [Logic / JS]
##### [MODIFY] [data-manager.js](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/data-manager.js)
- **`parseInfoExcel(file)` (상세장비 엑셀 파싱)**:
  - `placeName` 매핑 시 `장소 이름` 또는 `장소`를 우선 탐색하도록 수정.
  - `finalStationName` 매핑 규칙 추가 (`국소명-최종`, `국소명_최종` 등).
  - `openDate` 매핑 시 `가동일`도 지원하도록 정규식/포함 문자열 확장 (`가동일|개통일|개통|open`).
  - 파싱 결과로 반환되는 데이터 객체 구조에 `final_station_name` 반영.
- **`parseExcelOrCSV(file)` (일반 위치 엑셀 파싱)**:
  - `finalStationName` 및 `openDate` 매핑 보완.
  - 파싱 결과 객체 구조에 `finalStationName` 반영.

##### [MODIFY] [app.js](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/app.js)
- **UI 캐시 및 상태 관리**:
  - `markerFinalStationNameInput` 캐싱 추가.
  - `toggleModalReadOnly` 폼 제어 메소드에 `markerFinalStationNameInput` 추가.
- **모달 데이터 연동 및 조회**:
  - `fetchAndBindDetailedInfo`: Supabase `information` 테이블에서 연동된 상세 데이터 조회 시 `final_station_name`도 바인딩하여 상세 모달 표에 렌더링.
  - `openDetailMarkerModal` / `openEditMarkerModal`: 로컬 메모리상 마커 데이터 내 `finalStationName` 값을 읽어 입력 폼 및 테이블 뷰에 렌더링.
- **Supabase 데이터 동기화**:
  - `handleSaveMarker`: `final_station_name` 입력을 획득하여 Supabase `information` 테이블 upsert 데이터에 포함. 로컬 `markersData`에도 저장 처리.
  - `handleUploadSinglePending` / `handleUploadPending`: 벌크/단건 대기 마커를 Supabase에 보낼 때 `final_station_name`이 `information` 테이블에 함께 upsert되도록 구조 추가.
- **상세장비 확인 및 업로드**:
  - `openInfoConfirmModal`: 전송 전 테이블 렌더링 시 `place_name`과 `final_station_name`을 명확히 구분하여 출력.
  - `handleSendInfoToSupabase`: 전송할 데이터에 `final_station_name`이 정확하게 포함되어 전송되도록 검증.

### 4. Verification Plan

#### Automated Tests
- 없음 (프론트엔드 환경)

#### Manual Verification
1. **엑셀 업로드 테스트**: 사용자가 제공한 스크린샷과 유사한 양식(장소 이름, 시설연도, 프로젝트코드, 통합시설코드, 사업구분, 국소명-최종, 장비분류, 장비타입, 시설일, 가동일)의 테스트 엑셀 파일을 작성하고 `상세장비 Excel 업로드` 버튼으로 업로드해 팝업 내 컬럼 매핑 및 데이터 수가 올바른지 확인.
2. **Supabase 전송 검증**: 전송 후 Supabase `information` 테이블에 `final_station_name` 및 `open_date` (가동일) 데이터가 정상적으로 들어가는지 행 조회.
3. **상세 조회 연동 테스트**: 마커의 정보창에서 `[상세]` 버튼 클릭 시, 해당 마커의 장소 이름과 연계된 상세 장비 목록(국소명-최종 등 컬럼 포함)이 모달 내부 표에 온전히 출력되는지 확인.

---

## [2026-06-06] Supabase 'information' 테이블 설계 및 엑셀 업로드 구현 계획 (수정)

### User Review Required
> [!IMPORTANT]
> **데이터베이스 스키마 및 장소이름 연동**
> 1. **`information` 테이블**: 통합시설코드(`facility_code`)를 Primary Key로 정의하며, 위치 마커의 이름과 동일한 **`place_name` (장소이름)** 열을 함께 저장하도록 설계합니다.
> 2. **모달창 상세 테이블 매핑**: 지도 상의 마커(장소이름)를 클릭하여 정보창의 **[상세]** 또는 **[편집]** 버튼을 통해 모달을 열면, `information` 테이블의 장비 상세 정보가 로딩되어 모달 하단에 구조화된 표/폼 형태로 즉시 표시됩니다.

### 1. Supabase SQL DDL 실행 가이드 (수정)
사용자는 Supabase SQL Editor에서 아래 쿼리를 실행하여 테이블 설정을 업데이트해야 합니다.
```sql
-- 1. 상세 정보를 담을 information 테이블 생성 (place_name 컬럼 추가)
CREATE TABLE IF NOT EXISTS information (
    facility_code VARCHAR(255) PRIMARY KEY,
    place_name VARCHAR(255) DEFAULT '', -- 장소이름 (국소명)
    facility_year VARCHAR(100) DEFAULT '',
    project_code VARCHAR(255) DEFAULT '',
    business_type VARCHAR(100) DEFAULT '',
    eq_class VARCHAR(100) DEFAULT '',
    eq_type VARCHAR(100) DEFAULT '',
    install_date VARCHAR(100) DEFAULT '',
    open_date VARCHAR(100) DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. 기존 markers 테이블에 통합시설코드(facility_code) 참조용 컬럼 추가
ALTER TABLE markers ADD COLUMN IF NOT EXISTS facility_code VARCHAR(255);
```

### 2. Proposed Changes

#### [Logic / JS]

##### [MODIFY] [data-manager.js](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/data-manager.js)
- **엑셀 파싱 필드 확장**:
  - `parseExcelOrCSV`에서 장소이름(`rawName`)을 마커의 `placeName`으로 보관하여 반환 객체에 대입합니다.
  - 나머지 시설 상세 속성(`facilityCode`, `facilityYear`, `projectCode`, `businessType`, `eqClass`, `eqType`, `installDate`, `openDate`)을 매핑 수집해 저장합니다.

##### [MODIFY] [app.js](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/app.js)
- **Supabase upsert 시 place_name 추가**:
  - `handleUploadSinglePending`, `handleUploadPending`, `handleSaveMarker` 실행 시 `information` 테이블에 `place_name: marker.name`을 포함하여 upsert 처리합니다.
- **모달 데이터 로딩 및 바인딩**:
  - `openDetailMarkerModal` 및 `openEditMarkerModal`이 호출되면, 해당 마커에 `facility_code`가 있는 경우 Supabase `information` 테이블에서 상세 레코드를 fetch 해옵니다.
  - 조회한 상세 정보를 모달창 내부의 전용 인풋 필드에 알맞게 세팅합니다.
  - 상세 조회 모드일 경우 이 부가 필드들도 전부 `readonly` 스타일 토글에 통합 처리합니다.

#### [UI / HTML]

##### [MODIFY] [index.html](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/index.html)
- **상세 정보 테이블/폼 마크업 추가**:
  - 모달 카드(`modal-card`) 바디 내부에 **"상세 장비 정보 (Information)"** 섹션을 정의합니다.
  - `통합시설코드`, `프로젝트코드`, `시설연도`, `사업구분`, `장비분류`, `장비타입`, `시설일`, `개통일`을 보여주는 그리드식 인풋 필드를 배치합니다.

---

## [2026-06-06] 웹 시작 초기 위치 변경 구현 계획

### 1. 개요
지도가 처음 로드될 때 설정되는 기본 중심 좌표를 서울시청에서 광주광역시청으로 변경하여 최초 탐색 편의성을 조율합니다.

### 2. 주요 변경점
- `app.js` 내 `initializeMap()`의 `defaultCenter` 변수 좌표값을 광주광역시청 좌표(위도: `35.159542`, 경도: `126.8526012`)로 변경 수정합니다.

---

## [2026-06-06] 마커 상세 정보 보기 및 편집 모드 분리 구현 계획

### 1. 개요
지도 상의 마커 정보창(CustomOverlay)에서 기존에 통합되어 있던 "상세/편집" 메뉴를 **[상세]**와 **[편집]** 버튼으로 이원화하고, 모달 창의 모드에 따라 읽기 전용 상태와 쓰기 활성화 상태를 명확히 분리합니다.

### 2. 모드별 요구사항
1. **상세(Detail) 모드**:
   - 장소 이름, 메모, 태그 등의 모든 폼 입력창에 `readonly` 속성과 `input-readonly` CSS 스타일이 적용되어 편집이 불가능해집니다.
   - [저장] 및 [삭제] 버튼은 감추고, 우측 하단 취소 버튼이 **[닫기]**로 변경됩니다.
2. **편집(Edit) 모드**:
   - 모든 폼 입력창이 일반 쓰기 가능 상태로 활성화됩니다.
   - [저장] 버튼이 활성화되고, 영구 저장된 마커인 경우에만 [삭제] 버튼이 활성화됩니다. (대기 마커인 경우 삭제 불가)
3. **정보창 버튼 배치**:
   - 마커 클릭 시 뜨는 말풍선 내부에 **[상세]**와 **[편집]** 버튼을 나란히 배치하여 사용자가 선택적으로 모달을 열 수 있도록 구조화합니다.

### 3. 주요 변경점
- **커스텀 오버레이 버튼 구성 변경 (`createOverlayContent`)**:
  - [상세] 버튼과 [편집] 버튼을 모두 생성하여 하단 액션바에 추가합니다.
  - [상세] 클릭 시 `openDetailMarkerModal(id)` 실행.
  - [편집] 클릭 시 `openEditMarkerModal(id)` 실행.
- **상세 보기 전용 모달 메소드 신설 및 편집 모달 수정 (`openDetailMarkerModal` / `openEditMarkerModal`)**:
  - 인풋 창의 읽기 전용 상태를 토글하는 헬퍼 함수 `toggleModalReadOnly(isReadOnly)`를 신설합니다.
  - `openDetailMarkerModal(id)`: 폼을 읽기 전용으로 잠그고, 저장/삭제 버튼을 숨기며 취소 버튼을 "닫기"로 바꿉니다.
  - `openEditMarkerModal(id)`: 폼 잠금을 해제하고, 저장 버튼을 노출하며 대기 마커가 아닌 경우에만 삭제 버튼을 노출합니다. 취소 버튼은 "취소"로 바꿉니다.

---

## [2026-06-05] 마커 드래그 위치 수정 구현 계획

### 1. 개요
지도 상의 마커를 마우스 드래그를 통해 자유롭게 이동시킬 수 있도록 설정하고, 이동이 완료되는 시점(`dragend`)에 해당 좌표를 실시간으로 저장 및 Supabase DB에 동기화할 수 있도록 기능을 개선합니다.

### 2. 주요 설계 사항
- 카카오맵 마커 생성 시 `draggable: true` 속성을 기본 부여합니다.
- 마커 객체에 `dragend` 이벤트 리스너를 매칭하여 이동 종료 시점을 포착합니다.
- `handleMarkerDragEnd(id, newPosition)` 비동기 메서드를 신설합니다.
  - 이동된 마커 ID의 데이터를 메모리 내 `markersData`에서 찾아 위경도 값을 업데이트합니다.
  - 맵 위에 배치된 커스텀 오버레이(말풍선) 역시 갱신된 위경도 좌표로 즉시 위치를 리렌더링(setPosition)합니다.
  - 대기 마커(`isPending = true`)인 경우 로컬 메모리상에서만 반영하고, 저장 완료된 마커인 경우 Supabase의 테이블 행을 비동기로 `update` 반영합니다.

---

## [2026-06-04] 엑셀 대기 마커 검증 및 전송 시스템 구현 계획

### 1. 개요
엑셀/CSV 데이터를 임포트할 때 곧바로 데이터베이스에 넣지 않고, 지도 상에 별 모양의 대기 마커(Pending Marker) 형태로 먼저 표시하여 검증 단계를 제공합니다. 사용자는 데이터 검증 후 개별 전송 또는 전체 일괄 전송을 선택하여 DB에 보관할 수 있습니다.

### 2. 주요 설계 사항
- **대기 마커 속성 추가**: 업로드된 파일 파싱 결과 데이터에 `isPending: true` 플래그를 할당합니다.
- **지도상 대기 마커 비주얼 구분**: 일반 마커와 달리 대기 상태인 마커는 카카오 개발자 문서 기본 별표 마커 이미지(`markerStar.png`)를 적용하여 시각적 혼선을 방지합니다.
- **대기 마커 전용 사이드바 UI**:
  - 왼쪽 목록 of 장소명 좌측에 `[대기]` 레이블과 개별 `[전송]` 미니 버튼을 추가 배치합니다.
  - 사이드바 내에 대기 중인 위치 건수(`pending-count`)와 함께 `[전체 전송]`, `[전체 취소]` 액션 버튼을 생성합니다.
- **페이지 이탈 방지**: 대기 중인 마커가 존재할 경우 브라우저 닫기/새로고침 시 경고 얼럿(`beforeunload`)을 띄우는 이탈 방지 핸들러를 바인딩합니다.
