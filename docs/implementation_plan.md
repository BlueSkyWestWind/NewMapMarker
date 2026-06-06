# MapMarker Pro - 구현 계획 이력 (Implementation Plans History)

본 문서는 개발 과정에 따라 작성된 기능별 구현 계획서의 역사적 기록물입니다. 새로운 기능의 구현 계획은 상단(가장 최신)에 누적하여 추가합니다.

---

## [2026-06-06] 마커 클러스터러(MarkerClusterer) 구현 계획

### 1. 개요
지도에 표시되는 마커 수가 많아질 때 발생하는 시각적 혼잡도를 개선하고 브라우저 성능을 확보하기 위해, 지도 줌 레벨(확대/축소)에 따라 마커들을 그룹화하여 개수로 표시해주는 카카오 지도 SDK의 `MarkerClusterer`를 구현합니다.

### 2. User Review Required
> [!NOTE]
> - 지도를 축소하여 줌 레벨이 6 이상이 되면 인접한 마커들이 클러스터러(원형 숫자로 표시)로 그룹화됩니다.
> - 클러스터를 클릭하거나 지도를 확대(줌 레벨 5 이하)하면 개별 마커들이 다시 맵 위에 표시됩니다.
> - 대기 마커(Pending Marker)와 영구 등록 마커가 모두 클러스터러의 관리 대상이 되어 일관성 있게 시각화됩니다.
> - 마커 추가, 수정(드래그 이동), 삭제 시 클러스터러에 실시간 반영되어 지도의 데이터 무결성이 유지됩니다.

### 3. Proposed Changes

#### [Logic / JS]
##### [MODIFY] [app.js](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/app.js)
- **`constructor()`**:
  - `this.clusterer = null;` 초기화 멤버 변수를 선언합니다.
- **`initializeMap()`**:
  - 지도 인스턴스(`this.map`)가 생성된 직후 `new kakao.maps.MarkerClusterer` 객체를 초기화하여 `this.clusterer`에 바인딩합니다.
  - 평균 위치 기준 배치(`averageCenter: true`), 최소 클러스터 레벨 6(`minLevel: 6`), 클릭 시 자동 줌 인(`disableClickZoom: false`) 옵션을 지정합니다.
- **`renderMarkersOnMap()`**:
  - 렌더링 초입에 `this.clusterer.clear()`를 호출하여 이전 클러스터 마커 배열을 완전 초기화합니다.
  - 개별 마커(`new kakao.maps.Marker`) 생성 시 `map: this.map` 속성을 제외하여 지도에 바로 꽂히지 않고 클러스터러가 그리는 순서를 타도록 구조를 개선합니다.
  - 생성된 마커들을 임시 배열에 모은 후 루프가 끝나면 `this.clusterer.addMarkers(markersArray)`로 일괄 등록합니다.
- **`removeMarkerFromMap(id)`**:
  - 마커가 지도에서 제거될 때 `this.clusterer.removeMarker(marker)`를 호출하여 클러스터 목록에서도 영구 제거합니다.
- **`handleMarkerDragEnd(id, newPosition)`**:
  - 마커 드래그 이동이 완료되면 `this.clusterer.redraw()`를 호출하여 클러스터러가 변경된 좌표를 인식하고 다시 렌더링하도록 반영합니다.

### 4. Verification Plan

#### Automated Tests
- 없음

#### Manual Verification
1. 브라우저에서 지도 페이지를 새로고침합니다.
2. 여러 위치에 마커들을 등록하거나, 엑셀 업로드를 통해 다량의 대기 마커를 띄웁니다.
3. 지도를 축소(줌 아웃)하여 줌 레벨이 6 이상이 될 때 마커들이 숫자가 적힌 동그라미 클러스터로 바르게 합쳐지는지 확인합니다.
4. 클러스터 서클을 클릭하면 지도가 확대되면서 개별 마커들로 분리되는지 확인합니다.
5. 마커 하나를 드래그하여 다른 곳으로 이동시켰을 때 클러스터 개수가 실시간으로 정상 갱신되는지 확인합니다.
6. 마커를 삭제했을 때 클러스터 목록에서 마커가 정상적으로 누락되어 숫자가 줄어드는지 확인합니다.

---

## [2026-06-06] 마커 편집 모드 시 테이블 셀 복사/드래그 간섭 차단 및 기본 입력 기능 정상화 계획

### 1. 개요
마커 편집(수정) 모드일 때, 데이터 복사를 유도하는 마우스 드래그 선택 및 Ctrl+C 단축키 감지, 더블클릭 이벤트가 테이블 인풋 필드에 간섭하여 브라우저의 정상적인 인풋 편집 기능(텍스트 선택, 드래그 수정 등)을 방해하던 문제를 해결합니다. 편집 모드에서는 셀 복사 로직의 작동을 일시 정지(Bypass)시켜 부드러운 수정을 가능하게 합니다.

### 2. User Review Required
> [!NOTE]
> - 상세 보기(Detail) 모드에서는 기존의 편리한 엑셀식 드래그 선택 및 셀 복사 기능이 100% 정상 작동합니다.
> - 편집(Edit) 모드로 전환되면 셀 선택 파란색 하이라이트가 즉시 지워지며 드래그 선택, 더블클릭 복사, Ctrl+C 셀 복사 기능이 일시적으로 완전 비활성화됩니다.
> - 대신, 일반 인풋 필드와 같이 마우스 드래그를 이용한 텍스트 범위 선택 및 글자 수정 등의 브라우저 순수 기본 입력 동작이 온전히 허용됩니다.

### 3. Proposed Changes

#### [Logic / JS]
##### [MODIFY] [app.js](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/app.js)
- **상세 정보 테이블 이벤트 리스너 우회 분기 추가**:
  - `mousedown`, `mouseover`, `dblclick`, 그리고 전역 `keydown`(Ctrl+C) 복사 이벤트 핸들러의 초입에 `const isEditable = !this.markerNameInput.readOnly;` 조건을 대입합니다.
  - 편집 모드(`isEditable === true`)인 경우 즉시 조기 반환(`return`) 및 `e.preventDefault()`를 차단하여, 크롬 등의 브라우저 네이티브 입력 및 드래그 동작이 동작하도록 설계합니다.
- **`openEditMarkerModal()`**:
  - 편집 모달을 여는 시점에 `this.clearCellSelection()`을 트리거하여, 이전 상세 조회에서 남아있을 수 있는 파란색 셀 선택 효과를 완벽하게 제거합니다.

### 4. Verification Plan

#### Automated Tests
- 없음

#### Manual Verification
1. 임의의 마커를 클릭하고 [편집] 버튼을 눌러 모달 창을 엽니다.
2. 상세장비정보 인풋 상자에 텍스트를 입력하고, 마우스로 긁어서 일부분만 드래그 선택(텍스트 하이라이트)이 되는지 확인합니다. (이때 파란색 셀 블록이 잡히지 않아야 함)
3. 인풋 내의 값을 임의로 편집한 뒤 정상적으로 수정되는지 확인합니다.
4. 더블클릭이나 Ctrl+C를 실행했을 때 셀 복사 토스트가 발생하지 않고 브라우저 기본 기능(텍스트 단어 선택 및 텍스트 복사)이 잘 돌아가는지 검증합니다.
5. 모달을 닫고 다시 [상세] 버튼으로 열었을 때는 엑셀식 셀 드래그 및 복사 토스트가 정상적으로 회복되는지 최종 검증합니다.

---

## [2026-06-06] 마커 정보 수정 시 상세장비정보 테이블 인라인 편집 초기화 누락 개선 계획

### 1. 개요
마커 정보 수정 모달(`openEditMarkerModal`)에 진입했을 때, 상세장비정보가 테이블 뷰로 렌더링되는 구조에서 로컬 메모리의 마커 캐시 1행이 테이블에 인풋 필드로 초기 생성되지 않아 대기 마커(Pending Marker) 및 기등록 마커의 수정을 할 수 없던 결함을 수정합니다. 

### 2. User Review Required
> [!IMPORTANT]
> - 마커의 [편집] 버튼을 눌러 모달 창을 띄우는 순간, 상세장비정보 영역의 테이블 뷰에 로컬에 캐싱되어 있던 대표 장비 행이 쓰기 가능한 인풋 필드(`<input type="text" class="table-input">`)의 기본 1행 형태로 즉시 노출됩니다.
> - 기등록 마커인 경우, 백그라운드에서 Supabase fetch가 완료되면 해당 테이블에 여러 장비 행이 추가 및 덮어씌워 렌더링되며 모두 수정 가능 상태로 활성화됩니다.
> - [저장]을 클릭하면 수정된 모든 장비 데이터가 Supabase와 로컬 스토리지에 upsert 처리됩니다.

### 3. Proposed Changes

#### [Logic / JS]
##### [MODIFY] [app.js](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/app.js)
- **`openEditMarkerModal(id)`**:
  - 테이블 뷰 활성화(`detailedInfoTableWrapper` 노출) 후, `tbody#detailed-info-table-body` 에 `markerData` 로컬 캐시 정보(시설연도, 프로젝트코드, 통합시설코드, 사업구분, 국소명-최종, 장비타입, 시설일, 개통일)를 수정 가능한 인풋 필드 구조의 기본 1행으로 우선 렌더링하는 코드를 보강합니다.

### 4. Verification Plan

#### Automated Tests
- 없음

#### Manual Verification
1. 대기 마커 또는 기등록 마커를 지도상에서 선택하고 [편집] 버튼을 클릭합니다.
2. 상세 정보 테이블 섹션에 해당 마커의 상세 정보 1행이 즉시 수정 가능한 인풋 필드 형태로 노출되는지 확인합니다.
3. 임의의 텍스트 필드를 수정한 뒤 [저장]을 눌러 모달을 닫습니다.
4. 다시 동일한 마커의 [상세] 또는 [편집] 모달을 열어 수정한 데이터가 바르게 저장 및 유지되어 나타나는지 검증합니다.

---

## [2026-06-06] 로드뷰 모달 팝업창 마우스 드래그 이동 기능 구현 계획

### 1. 개요
로드뷰 모달창이 화면을 가려 아래 지도를 탐색하는 데 지장을 주는 사용성을 개선하기 위해, 모달창의 헤더 영역을 클릭 및 드래그하여 창을 자유롭게 원하는 위치로 옮길 수 있는 마우스 드래그 이동(Draggable Popup) 기능을 구현합니다.

### 2. User Review Required
> [!NOTE]
> - 로드뷰 팝업창의 헤더 영역(`div.modal-header`)에 마우스를 올리면 `move` 커서가 노출되어 드래그가 가능함을 인지할 수 있습니다.
> - 헤더를 클릭한 채 드래그하면 모달 카드가 마우스 이동 경로에 맞춰 자유롭게 이동합니다.
> - 모달을 닫았다가 다시 열면 매번 초기화되어 정중앙(Flex Center)에 정렬되어 팝업되도록 구조를 설계했습니다.

### 3. Proposed Changes

#### [UI / HTML]
##### [MODIFY] [index.html](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/index.html)
- `#roadview-modal` 내 `.modal-header` 태그에 인라인 스타일 `cursor: move; user-select: none;`을 적용하여 시각적 힌트를 주고 텍스트 드래그 혼선을 방지합니다.

#### [Logic / JS]
##### [MODIFY] [app.js](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/app.js)
- **`bindEvents()`**:
  - `this.initRoadviewDrag()`를 호출하여 이벤트가 초기 바인딩되도록 연결합니다.
- **`openRoadviewModal(lat, lng, name)`**:
  - 모달을 열 때마다 드래그로 변경되어 기록되어 있던 인라인 위치 스타일(position, margin, transform, left, top)을 일괄 청소하여 정중앙에 정렬되도록 리셋하는 방식을 추가합니다.
- **`initRoadviewDrag()` 신설**:
  - `mousedown`, `mousemove`, `mouseup` 전역 이벤트를 사용하여 마우스 드래그 거리를 산출하고, 모달 카드의 `left`/`top` 속성을 절대 좌표(`absolute`)로 동적 조절하는 드래그 제어 모듈을 구축합니다.

### 4. Verification Plan

#### Automated Tests
- 없음

#### Manual Verification
1. 마커 또는 검색 임시 핀에서 `[로드뷰]`를 띄웁니다.
2. 팝업창의 "현장 로드뷰" 제목 헤더 부근에 마우스 호버 시 십자 화살표 이동 커서가 뜨는지 확인합니다.
3. 클릭 후 드래그하여 팝업창이 마우스 포인터를 자연스럽게 따라오는지 확인합니다.
4. 모달창을 닫았다가 다시 열었을 때, 드래그 이전에 있던 화면의 정중앙에 올바르게 초기화되어 열리는지 확인합니다.

---

## [2026-06-06] 웹 진입 초기 지도 준비 알림 토스트 제거 계획

### 1. 개요
지도가 처음 성공적으로 렌더링되었을 때 표시되는 안내 목적의 토스트 알림("지도가 준비되었습니다. Excel 파일을 업로드하여 핀을 꽂아보세요.")이 불필요한 시각적 방해 요소라고 판단되어 제거합니다.

### 2. User Review Required
> [!NOTE]
> - 웹페이지 최초 진입 및 지도 로드가 성공했을 때 나타나던 토스트 노티피케이션이 더 이상 나타나지 않습니다.

### 3. Proposed Changes

#### [Logic / JS]
##### [MODIFY] [app.js](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/app.js)
- `initializeMap()` 메소드 내에서 지도 컨트롤 활성화 및 마커 렌더링 후 발생시키던 `this.showToast` 호출 코드를 삭제합니다.

### 4. Verification Plan

#### Automated Tests
- 없음

#### Manual Verification
1. 웹마커 페이지를 새로고침하여 진입합니다.
2. 지도가 로드된 후 화면 중앙 상단에 "지도가 준비되었습니다..." 토스트 메시지가 나타나지 않는지 검증합니다.

---

## [2026-06-06] 로드뷰 모달창 50% 크기 확장 및 자유 크기 조절 기능 구현 계획

### 1. 개요
기존 로드뷰 팝업창 크기(800x600)를 사용자의 높은 몰입감을 위해 50% 더 키운 초기 크기(1200x900)로 확대합니다. 또한 사용자가 직접 팝업 모퉁이를 드래그하여 원하는 크기로 동적 조절(Resizable)할 수 있도록 CSS 속성을 보강하고, 브라우저 크기 조정 시 카카오맵 로드뷰 SDK 화면이 비례하여 바르게 갱신될 수 있도록 리포지셔닝 핸들러를 추가합니다.

### 2. User Review Required
> [!NOTE]
> - 로드뷰 팝업창의 기본 크기가 1200x900(기존 800x600 대비 가로/세로 1.5배)으로 확장되어 렌더링됩니다.
> - 모달 카드의 우측 하단 모서리를 마우스로 자유롭게 드래그하여 창의 가로/세로 길이를 조절할 수 있습니다.
> - 크기를 변경하는 과정에서 실시간으로 3D 로드뷰가 어색함 없이 깨지지 않도록 카카오맵 로드뷰 레이아웃 렌더링 갱신(`rv.relayout()`)이 Trigger됩니다.

### 3. Proposed Changes

#### [UI / HTML]
##### [MODIFY] [index.html](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/index.html)
- 로드뷰 모달 `#roadview-modal` 내부의 `.modal-card` 인라인 스타일을 수정:
  - `max-width: 800px; height: 600px;` -> `width: 1200px; height: 900px; max-width: 95vw; max-height: 90vh; resize: both; overflow: hidden; min-width: 400px; min-height: 300px;`

#### [Logic / JS]
##### [MODIFY] [app.js](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/app.js)
- **`openRoadviewModal(lat, lng, name)`**:
  - `ResizeObserver` API를 초기화하여 `#roadview-modal`의 `.modal-card` 크기 변화를 실시간 감지하도록 설정.
  - 변화가 감지될 때마다 생성된 카카오 로드뷰 `rv` 객체의 `relayout()`을 트리거하여 3D 뷰어 화면을 재배치.
- **`closeRoadviewModal()`**:
  - 모달을 닫을 시 등록되어 있던 `ResizeObserver` 인스턴스를 해제(`disconnect()`)하여 메모리 누수를 원천 차단.

### 4. Verification Plan

#### Automated Tests
- 없음

#### Manual Verification
1. 마커 클릭 후 `[로드뷰]` 버튼을 누르면 초기 창이 화면의 약 1.5배 확대된 세련된 크기(1200x900)로 표시되는지 확인합니다.
2. 팝업창 우측 하단 모서리를 마우스로 드래그하여 크기를 늘리거나 줄여봅니다.
3. 크기가 바뀌는 과정에서 실시간으로 파노라마 뷰가 깨짐 없이 조절된 크기에 가득 채워지는지 확인합니다.
4. 모달 팝업을 닫았다가 다시 열었을 때 정상적으로 로드뷰가 구동되는지 검증합니다.

---

## [2026-06-06] 마커 상세 정보창 및 임시 마커 오버레이 내 로드뷰 확인 기능 구현 계획

### 1. 개요
지도상의 마커 또는 주소 검색 결과로 생성된 임시 핀의 커스텀 말풍선(CustomOverlay) 내부 액션바에 `[로드뷰]` 버튼을 추가합니다. 버튼을 클릭하면 앱 내 모달 팝업으로 카카오 맵 로드뷰 SDK를 통해 현장의 3D 파노라마 뷰를 확인할 수 있도록 합니다. 주변 100m 이내에 로드뷰가 없는 경우 에러 레이아웃을 통해 친절하게 사용자에게 안내합니다.

### 2. User Review Required
> [!NOTE]
> - 등록된 마커 및 검색 임시 핀 말풍선에 `[로드뷰]` 버튼(Emerald Green 그라디언트 디자인)이 배치됩니다.
> - 버튼 클릭 시 `index.html` 내부에 정의된 모달창(`roadview-modal`)이 열리며, 카카오 로드뷰 SDK가 로드한 실시간 파노라마 뷰가 출력됩니다.
> - 주변에 로드뷰가 존재하지 않으면 "해당 좌표 주변에 제공되는 로드뷰가 없습니다."라는 안내 레이어가 표시됩니다.
> - 로드뷰 모달창은 우측 상단 `X` 버튼 또는 모달 바깥 어두운 배경 영역을 클릭하여 닫을 수 있습니다.

### 3. Proposed Changes

#### [UI / HTML]
##### [MODIFY] [index.html](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/index.html)
- (이미 이전 단계에서 모달 마크업 `#roadview-modal` 등이 구현되어 있으므로 마크업 추가는 불필요하지만, 스타일링이나 구조를 확인합니다.)

#### [Logic / JS]
##### [MODIFY] [app.js](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/app.js)
- **`bindEvents()`**:
  - `#close-roadview-btn` 클릭 시 `closeRoadviewModal()`을 호출하도록 이벤트 바인딩.
  - `#roadview-modal` 자체의 클릭 이벤트 감지 시 바깥 영역 클릭으로 모달 닫기 연동.
- **`createOverlayContent(data)`**:
  - 마커 말풍선 버튼 목록에 `[로드뷰]` 버튼을 추가하고 클릭 시 `openRoadviewModal(data.lat, data.lng, data.name)`이 동작하도록 핸들러 설정.
- **`displaySearchResults(results)`**:
  - 검색된 결과 항목을 클릭하여 생성되는 임시 핀 말풍선(`tempOverlay`)의 액션 버튼에 `[로드뷰]` 버튼을 추가하고 클릭 시 `openRoadviewModal(lat, lng, place.place_name)`이 동작하도록 핸들러 설정.
- **`openRoadviewModal(lat, lng, placeName)` 및 `closeRoadviewModal()` 신설**:
  - `kakao.maps.Roadview` 및 `kakao.maps.RoadviewClient`를 생성하고, `getNearestPanoId`를 사용하여 100m 이내 가장 가까운 파노라마 뷰를 검색.
  - panoId가 있으면 컨테이너에 세팅하고, 없으면 에러 영역(`roadview-error`) 노출.

### 4. Verification Plan

#### Automated Tests
- 없음

#### Manual Verification
1. 임의의 저장된 마커를 지도상에서 클릭하여 말풍선(CustomOverlay)에 `[로드뷰]` 버튼이 표시되는지 확인합니다.
2. `[로드뷰]` 버튼을 클릭하면 현장 로드뷰 모달이 팝업되고, 주변 풍경이 3D 파노라마로 바르게 나타나는지 검증합니다.
3. 로드뷰 모달 우측 상단 `X` 아이콘 또는 바깥 슬라이드 배경을 누르면 모달창이 정상적으로 닫히고, 지도 화면으로 원복되는지 확인합니다.
4. 로드뷰가 없는 산악 지대나 도서 지역 등 오지에 마커를 임시로 꽂은 후 `[로드뷰]`를 눌렀을 때, 로드뷰가 깨지는 대신 "해당 좌표 주변에 제공되는 로드뷰가 없습니다"라는 에러 피드백이 표시되는지 최종 검증합니다.

---

## [2026-06-06] 주소 검색 마커 표시 방식 개선 및 기존 마커 연동 필터링 구현 계획

### 1. 개요
1. **주소 검색 결과 마커 표시**: 주소 검색 결과를 클릭했을 때 모달 등록 창이 즉시 팝업되는 기존 사용자 경험을 개선합니다. 대신, 지도 상에 임시 마커와 커스텀 말풍선(CustomOverlay)을 띄우고, 말풍선 내에 `[등록]` 버튼을 배치하여 사용자가 원할 때 등록 팝업을 열 수 있도록 변경합니다.
2. **기존 마커 연동 필터링**: 주소창에서 장소/주소 검색 시, 내가 이미 등록해 둔 마커 데이터 중 유사한 정보(장소명, 메모, 태그 등)가 있다면 "저장된 위치" 사이드바 목록에도 즉시 필터링하여 보여줍니다.

### 2. User Review Required
> [!NOTE]
> - 주소 검색 결과를 클릭하면 모달 창이 뜨지 않고 지도에 임시 핀과 말풍선이 생성됩니다.
> - 말풍선 내부의 `[등록]` 버튼을 누르면 그 좌표와 주소명으로 마커 등록 모달이 팝업됩니다.
> - 주소 검색 시 사이드바 필터도 함께 동작하여 기등록된 마커가 필터링 노출됩니다.

### 3. Proposed Changes

#### [Logic / JS]
##### [MODIFY] [app.js](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/app.js)
- **`clearTempMarker()`**:
  - 임시 마커뿐만 아니라 임시 커스텀 오버레이(`this.tempOverlay`)도 맵에서 제거하고 상태를 초기화하도록 변경합니다.
- **`displaySearchResults(results)`**:
  - 결과 아이템 클릭 시 `this.handleMapClick(position)`을 호출하여 바로 등록 팝업을 열지 않고, 결과 데이터를 활용하여 임시 마커 및 말풍선(CustomOverlay)을 동적 생성하여 맵에 렌더링합니다.
  - 말풍선 내부에 `[등록]` 버튼을 구성하여, 이를 클릭하면 해당 좌표와 주소명으로 `openAddMarkerModal`이 트리거되도록 이벤트를 바인딩합니다.
- **`handleSearch()`**:
  - 주소 검색 실행 시, 입력한 검색어(`query`)를 왼쪽 사이드바 마커 필터(`this.markerFilter`)에도 자동으로 반영하고 `this.renderMarkersList()`를 트리거하여 기등록된 마커 중 검색어와 유사한 항목들이 목록에 즉각 필터링되어 출력되도록 유기적으로 연동합니다.

### 4. Verification Plan

#### Automated Tests
- 없음

#### Manual Verification
1. 주소창에 "광주"를 검색합니다.
2. 사이드바의 "저장된 위치" 리스트가 "광주" 관련 저장된 마커들로 필터링되어 나타나는지 확인합니다.
3. 주소 검색 결과 팝업 내에서 검색된 주소 중 하나를 클릭합니다.
4. 지도 중앙이 이동하면서 노란색 별 또는 기본 임시 핀과 함께 말풍선이 지도 위에 표시되는지 확인합니다. (이때 등록 팝업창은 바로 뜨지 않아야 함)
5. 말풍선 내의 `[등록]` 버튼을 누르면 해당 주소명과 좌표가 기입된 마커 등록 모달 팝업이 활성화되는지 확인합니다.

---

## [2026-06-06] 마커 수정 팝업 내 상세장비정보 인라인 편집 및 Supabase upsert 연동 계획

### 1. 개요
마커 정보 수정 모달 창에서 상세장비정보가 단순 텍스트로만 표시되어 사용자가 직접 수정할 수 없는 문제를 해결합니다. 모달이 편집 모드로 열렸을 때 상세장비정보 테이블의 각 셀을 입력창(input)으로 렌더링하여 실시간 수정을 허용하고, 저장 시 테이블 내의 모든 수정 사항을 긁어와 Supabase `information` 테이블에 `upsert` 반영합니다.

### 2. User Review Required
> [!IMPORTANT]
> **통합시설코드(Primary Key) 수정 제한**
> - `information` 테이블의 기본 키(Primary Key)인 `facility_code`는 수정할 수 없도록 편집 모드에서도 `readonly`로 처리하여 PK 충돌 및 데이터 무결성 훼손을 차단합니다.
> - 사용자가 수정 버튼을 눌러 저장하면, 테이블에 등록된 여러 상세 장비 정보 행들이 일괄적으로 Supabase `information` 테이블에 `upsert`됩니다.

### 3. Proposed Changes

#### [Logic / JS]
##### [MODIFY] [app.js](file:///c:/Users/celyo/OneDrive/문서/Vibe%20Codeing/001.MapMarker/app.js)
- **`fetchAndBindDetailedInfo(markerName, facilityCode)`**:
  - `const isEditable = !this.markerNameInput.readOnly;` 를 기준으로 분기하여 편집 모드일 시 각 `td`에 `<input type="text" class="table-input" data-key="..." value="...">`를 삽입하도록 변경합니다.
  - `facility_code` input 필드는 `readonly`와 `input-readonly` 클래스를 할당해 수정을 금지합니다.
- **`handleSaveMarker()`**:
  - 상세 장비 테이블 뷰가 활성화되어 있고 행들이 존재하는지 판별하여, 편집 모드 테이블의 모든 행(`tr`)을 순회하며 `.table-input` 값들을 수집합니다.
  - 수집된 복수 개의 상세 장비 정보 리스트(`infoListToUpsert`)를 Supabase `information` 테이블에 `upsert` 처리합니다.
  - 대표 `facility_code` 및 상세정보를 수집된 첫 번째 행의 데이터로 지정하여 `markers` 테이블 및 로컬 `markersData` 메모리 객체와 동기화합니다.
  - 테이블 뷰가 비활성화되어 있거나 행이 없을 시에는 기존 폼 입력 방식의 단일 건 수집을 유지합니다.
- **복사 관련 헬퍼 함수 (`getCellValue(td)`) 신설 및 기존 복사 로직 보완**:
  - `td` 내부의 텍스트가 아닌 `input`의 `value`를 안전하게 획득할 수 있도록 헬퍼 함수를 신설합니다.
  - `handleCopyDetailedTable()`, `handleCopySelectedCells()`, `handleCopyColumn()`, 그리고 td 더블클릭 이벤트 핸들러에서 텍스트 수집 부분을 `this.getCellValue(td)`로 변경합니다.

### 4. Verification Plan

#### Automated Tests
- 없음 (프론트엔드 환경)

#### Manual Verification
1. 마커 목록에서 핀을 선택하고 [편집] 버튼을 눌러 정보 수정 모달을 활성화합니다.
2. 상세장비정보 테이블의 셀들이 입력창 형태로 전환되어 텍스트 타이핑이 가능한지 검증합니다.
3. 통합시설코드(`facility_code`)가 수정이 불가능한 읽기 전용 상태인지 확인합니다.
4. 값을 임의로 수정한 후 [저장]을 클릭하여 모달을 닫습니다.
5. 다시 동일 마커의 [상세] 또는 [편집]을 눌러 수정된 데이터가 Supabase에서 다시 로딩 및 정상 반영되었는지 최종 검증합니다.
6. 테이블 셀들을 드래그 복사 및 단일 셀 복사하여 클립보드에 수정된 텍스트가 바르게 수집되는지 검증합니다.

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
