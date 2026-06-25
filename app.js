/**
 * MapMarker Pro - 메인 애플리케이션 스크립트
 * 
 * [주요 기능]
 * 1. 카카오맵 SDK 동적 로드 및 상태 관리
 * 2. 지도 초기화, 이벤트 핸들링 (클릭시 마커 추가)
 * 3. 로컬 저장소(localStorage) 기반 마커 CRUD
 * 4. 카카오 Local API를 통한 키워드 장소 검색
 * 5. 지오로케이션(Geolocation)을 활용한 현재 위치 트래킹
 * 6. CSV/JSON 내보내기 및 데이터 관리 연동
 */

// 커스텀 SVG 마커 이미지 정의 (오렌지 골드)
const MARKER_SVG_GOLD = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="30" height="45">
  <defs>
    <linearGradient id="pin-gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
  </defs>
  <path d="M12,2 C6.48,2 2,6.48 2,12 C2,19.2 12,34 12,34 C12,34 22,19.2 22,12 C22,6.48 17.52,2 12,2 Z" fill="url(#pin-gold)" stroke="#ffffff" stroke-width="1.5"/>
  <circle cx="12" cy="12" r="4.5" fill="#ffffff"/>
</svg>`);

// 입력된 색상 코드를 기준으로 입체적인 그라디언트가 적용된 SVG 마커 이미지를 동적으로 생성
function getMarkerSvg(colorHex) {
    const gradients = {
        '#10b981': { start: '#10b981', end: '#059669' }, // Emerald Green
        '#6366f1': { start: '#6366f1', end: '#4f46e5' }, // Indigo Blue
        '#f43f5e': { start: '#f43f5e', end: '#e11d48' }, // Rose Red
        '#f59e0b': { start: '#f59e0b', end: '#d97706' }, // Orange Gold
        '#8b5cf6': { start: '#8b5cf6', end: '#7c3aed' }  // Purple
    };

    const theme = gradients[colorHex] || { start: colorHex, end: colorHex };
    const gradId = 'grad-' + colorHex.replace('#', '');

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="30" height="45">
  <defs>
    <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.start}" />
      <stop offset="100%" stop-color="${theme.end}" />
    </linearGradient>
  </defs>
  <path d="M12,2 C6.48,2 2,6.48 2,12 C2,19.2 12,34 12,34 C12,34 22,19.2 22,12 C22,6.48 17.52,2 12,2 Z" fill="url(#${gradId})" stroke="#ffffff" stroke-width="1.5"/>
  <circle cx="12" cy="12" r="4.5" fill="#ffffff"/>
</svg>`;

    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.trim());
}

class MapMarkerApp {
    constructor() {
        // 상태 정의
        this.map = null;
        this.placesService = null;
        this.markersData = []; // { id, name, lat, lng, memo, tags, createdAt }
        this.mapMarkers = new Map(); // id -> kakao.maps.Marker
        this.customOverlays = new Map(); // id -> kakao.maps.CustomOverlay
        this.tempMarker = null; // 클릭시 생성되는 임시 마커
        this.clusterer = null; // 마커 클러스터러 객체
        this.selectedYears = new Set(); // 선택된 연도 필터 셋
        this.selectedBusinesses = new Set(); // 선택된 사업구분 필터 셋
        this.selectedColors = new Set(); // 선택된 마커 색상 필터 셋
        this.selectedTags = new Set(); // 선택된 마커 태그 필터 셋
        this.currentEditingId = null; // 현재 편집 중인 마커 ID (null이면 신규 등록)
        this.focusedMarkerIndex = -1; // 키보드 탐색을 위한 포커스된 마커 인덱스
        this.currentRoadview = null; // 현재 활성화된 로드뷰 객체
        this.lastLoadedPanoId = null; // 마지막으로 가져온 촬영 일자의 파노라마 ID
        this.currentMovingMarkerId = null; // 현재 위치 이동 수정 중인 마커 ID
        this.originalMarkerPosition = null; // 위치 수정 전 원래 좌표 (LatLng)
        this.mapClickMoveListener = null; // 위치 수정 중 지도 클릭 감지 리스너
        this.selectedColor = '#10b981'; // 현재 모달에서 선택된 마커 색상 Hex
        
        // 축전지 모드 관련 추가 상태 정의
        this.currentMode = 'equipment'; // 'equipment' or 'battery'
        this.eqMarkersData = [];
        this.batteryMarkersData = [];
        this.selectedCapacities = new Set(); // 축전지 용량 필터 셋
        this.selectedQuantities = new Set(); // 축전지 수량 필터 셋
        this.selectedStations = new Set(); // 축전지 국소명 필터 셋
        
        // DOM 요소 캐시
        this.cacheElements();
        
        // 이벤트 바인딩
        this.bindEvents();
        
        // 앱 초기화 진행
        this.init();
    }

    cacheElements() {
        this.searchInput = document.getElementById('search-input');
        this.searchBtn = document.getElementById('search-btn');
        this.searchResultsContainer = document.getElementById('search-results-container');
        this.searchResultsList = document.getElementById('search-results-list');
        this.closeSearchBtn = document.getElementById('close-search-btn');
        
        this.markerFilter = document.getElementById('marker-filter');
        this.markersList = document.getElementById('markers-list');
        this.markerCount = document.getElementById('marker-count');
        
        this.exportMarkersJsonBtn = document.getElementById('export-markers-json-btn');
        this.exportMarkersExcelBtn = document.getElementById('export-markers-excel-btn');
        this.importMarkersJsonFile = document.getElementById('import-markers-json-file');
        this.importMarkersExcelFile = document.getElementById('import-markers-excel-file');
        this.exportInfoJsonBtn = document.getElementById('export-info-json-btn');
        this.exportInfoExcelBtn = document.getElementById('export-info-excel-btn');
        this.importInfoJsonFile = document.getElementById('import-info-json-file');
        this.importInfoExcelFile = document.getElementById('import-info-excel-file');
        
        // 백업 아코디언 요소 캐시
        this.backupAccordionToggle = document.getElementById('backup-accordion-toggle');
        this.backupAccordionContent = document.getElementById('backup-accordion-content');
        
        // Excel/CSV 업로드 요소 캐시
        this.importExcelFile = document.getElementById('import-excel-file');
        this.excelStatus = document.getElementById('excel-status');
        this.excelStatusText = document.getElementById('excel-status-text');
        
        // 대기 마커 제어 UI 요소 캐시
        this.pendingActions = document.getElementById('pending-actions');
        this.pendingCount = document.getElementById('pending-count');
        this.uploadPendingBtn = document.getElementById('upload-pending-btn');
        this.cancelPendingBtn = document.getElementById('cancel-pending-btn');
        
        this.myLocationBtn = document.getElementById('my-location-btn');
        this.zoomInBtn = document.getElementById('zoom-in-btn');
        this.zoomOutBtn = document.getElementById('zoom-out-btn');
        this.toast = document.getElementById('toast');
        
        // 모달 요소
        this.markerModal = document.getElementById('marker-modal');
        this.modalTitle = document.getElementById('modal-title');
        this.markerNameInput = document.getElementById('marker-name');
        this.markerLatInput = document.getElementById('marker-lat');
        this.markerLngInput = document.getElementById('marker-lng');
        this.markerMemoInput = document.getElementById('marker-memo');
        this.markerTagsInput = document.getElementById('marker-tags');
        
        // 상세 장비 정보 입력 필드 캐시
        this.markerFacilityCodeInput = document.getElementById('marker-facility-code');
        this.markerProjectCodeInput = document.getElementById('marker-project-code');
        this.markerFacilityYearInput = document.getElementById('marker-facility-year');
        this.markerBusinessTypeInput = document.getElementById('marker-business-type');
        this.markerFinalStationNameInput = document.getElementById('marker-final-station-name');
        this.markerEqClassInput = document.getElementById('marker-eq-class');
        this.markerEqTypeInput = document.getElementById('marker-eq-type');
        this.markerInstallDateInput = document.getElementById('marker-install-date');
        this.markerOpenDateInput = document.getElementById('marker-open-date');
        
        this.saveMarkerBtn = document.getElementById('save-marker-btn');
        this.cancelModalBtn = document.getElementById('cancel-modal-btn');
        this.closeModalBtn = document.getElementById('close-modal-btn');
        this.deleteMarkerModalBtn = document.getElementById('delete-marker-modal-btn');
        this.copySelectedBtn = document.getElementById('copy-selected-btn');
        this.colorChips = document.querySelectorAll('.color-chip');

        // 사이드바 토글 관련 캐시
        this.sidebar = document.querySelector('.sidebar');
        this.sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');

        // 테이블 뷰 관련 요소 캐시
        this.detailedInfoFormWrapper = document.getElementById('detailed-info-form-wrapper');
        this.detailedInfoTableWrapper = document.getElementById('detailed-info-table-wrapper');
        this.copyTableBtn = document.getElementById('copy-table-btn');
        this.tableFacilityCode = document.getElementById('table-facility-code');
        this.tableProjectCode = document.getElementById('table-project-code');
        this.tableFacilityYear = document.getElementById('table-facility-year');
        this.tableBusinessType = document.getElementById('table-business-type');
        this.tableEqClass = document.getElementById('table-eq-class');
        this.tableEqType = document.getElementById('table-eq-type');
        this.tableInstallDate = document.getElementById('table-install-date');
        this.tableOpenDate = document.getElementById('table-open-date');

        // 상세장비정보 업로드 관련 요소 캐시
        this.importInfoFile = document.getElementById('import-info-file');
        this.infoUploadStatus = document.getElementById('info-upload-status');
        this.infoUploadStatusText = document.getElementById('info-upload-status-text');
        this.infoConfirmModal = document.getElementById('info-confirm-modal');
        this.closeInfoConfirmBtn = document.getElementById('close-info-confirm-btn');
        this.cancelInfoConfirmBtn = document.getElementById('cancel-info-confirm-btn');
        this.sendInfoConfirmBtn = document.getElementById('send-info-confirm-btn');
        this.infoConfirmTableBody = document.getElementById('info-confirm-table-body');
        this.infoConfirmCount = document.getElementById('info-confirm-count');
        this.pendingInfoData = null;

        // 필터 요소 캐시
        this.filterAccordionToggle = document.getElementById('filter-accordion-toggle');
        this.filterAccordionContent = document.getElementById('filter-accordion-content');

        // 업로드 섹션 아코디언 캐시
        this.excelAccordionToggle = document.getElementById('excel-accordion-toggle');
        this.excelAccordionContent = document.getElementById('excel-accordion-content');
        this.infoAccordionToggle = document.getElementById('info-accordion-toggle');
        this.infoAccordionContent = document.getElementById('info-accordion-content');

        this.selectYearsTrigger = document.getElementById('select-years-trigger');
        this.optionsYearsContainer = document.getElementById('options-years-container');
        this.selectBusinessesTrigger = document.getElementById('select-businesses-trigger');
        this.optionsBusinessesContainer = document.getElementById('options-businesses-container');
        this.btnSelectAllYears = document.getElementById('btn-select-all-years');
        this.btnSelectAllBusinesses = document.getElementById('btn-select-all-businesses');
        this.selectedYearsLabel = document.getElementById('selected-years-label');
        this.selectedBusinessesLabel = document.getElementById('selected-businesses-label');
        this.selectColorsTrigger = document.getElementById('select-colors-trigger');
        this.optionsColorsContainer = document.getElementById('options-colors-container');
        this.btnSelectAllColors = document.getElementById('btn-select-all-colors');
        this.selectedColorsLabel = document.getElementById('selected-colors-label');

        this.selectTagsTrigger = document.getElementById('select-tags-trigger');
        this.optionsTagsContainer = document.getElementById('options-tags-container');
        this.btnSelectAllTags = document.getElementById('btn-select-all-tags');
        this.selectedTagsLabel = document.getElementById('selected-tags-label');

        // 엑셀 위치 등록 확인 모달 요소 캐시
        this.excelConfirmModal = document.getElementById('excel-confirm-modal');
        this.closeExcelConfirmBtn = document.getElementById('close-excel-confirm-btn');
        this.cancelExcelConfirmBtn = document.getElementById('cancel-excel-confirm-btn');
        this.sendExcelConfirmBtn = document.getElementById('send-excel-confirm-btn');
        this.excelConfirmTableBody = document.getElementById('excel-confirm-table-body');
        this.excelConfirmCount = document.getElementById('excel-confirm-count');

        // 지적편집도 관련 요소 캐시 및 상태
        this.cadastralBtn = document.getElementById('cadastral-btn');
        this.isCadastralMode = localStorage.getItem('cadastral_mode') === 'true';

        // 축전지 모드 관련 추가 캐시
        this.modeEqBtn = document.getElementById('mode-eq-btn');
        this.modeBatteryBtn = document.getElementById('mode-battery-btn');
        this.eqExcelSection = document.getElementById('eq-excel-section');
        this.eqInfoUploadSection = document.getElementById('eq-info-upload-section');
        this.batteryExcelSection = document.getElementById('battery-excel-section');
        this.batteryExcelAccordionToggle = document.getElementById('battery-excel-accordion-toggle');
        this.batteryExcelAccordionContent = document.getElementById('battery-excel-accordion-content');
        this.importExcelFileBattery = document.getElementById('import-excel-file-battery');
        this.batteryExcelStatus = document.getElementById('battery-excel-status');
        this.batteryExcelStatusText = document.getElementById('battery-excel-status-text');

        this.eqFiltersRow = document.getElementById('eq-filters-row');
        this.batteryFiltersRow = document.getElementById('battery-filters-row');

        this.selectCapacitiesTrigger = document.getElementById('select-capacities-trigger');
        this.optionsCapacitiesContainer = document.getElementById('options-capacities-container');
        this.selectQuantitiesTrigger = document.getElementById('select-quantities-trigger');
        this.optionsQuantitiesContainer = document.getElementById('options-quantities-container');
        this.selectStationsTrigger = document.getElementById('select-stations-trigger');
        this.optionsStationsContainer = document.getElementById('options-stations-container');
        this.btnSelectAllCapacities = document.getElementById('btn-select-all-capacities');
        this.btnSelectAllQuantities = document.getElementById('btn-select-all-quantities');
        this.btnSelectAllStations = document.getElementById('btn-select-all-stations');
        this.selectedCapacitiesLabel = document.getElementById('selected-capacities-label');
        this.selectedQuantitiesLabel = document.getElementById('selected-quantities-label');
        this.selectedStationsLabel = document.getElementById('selected-stations-label');

        this.markerCapacityInput = document.getElementById('marker-capacity');
        this.markerQuantityInput = document.getElementById('marker-quantity');
        this.markerStationInput = document.getElementById('marker-station');
        this.markerNameLabel = document.getElementById('marker-name-label');
        this.modalSubTitle = document.getElementById('modal-sub-title');
        this.modalSubIcon = document.getElementById('modal-sub-icon');
        this.batteryInfoFormWrapper = document.getElementById('battery-info-form-wrapper');

        this.batteryInfoTableWrapper = document.getElementById('battery-info-table-wrapper');
        this.batteryInfoTableBody = document.getElementById('battery-info-table-body');
        this.batteryCopySelectedBtn = document.getElementById('battery-copy-selected-btn');
        this.batteryCopyTableBtn = document.getElementById('battery-copy-table-btn');

        this.batteryExcelConfirmModal = document.getElementById('battery-excel-confirm-modal');
        this.closeBatteryExcelConfirmBtn = document.getElementById('close-battery-excel-confirm-btn');
        this.cancelBatteryExcelConfirmBtn = document.getElementById('cancel-battery-excel-confirm-btn');
        this.sendBatteryExcelConfirmBtn = document.getElementById('send-battery-excel-confirm-btn');
        this.sendBatteryExcelTempBtn = document.getElementById('send-battery-excel-temp-btn');
        this.batteryExcelConfirmTableBody = document.getElementById('battery-excel-confirm-table-body');
        this.batteryExcelConfirmCount = document.getElementById('battery-excel-confirm-count');
        this.pendingBatteryExcelData = [];
    }

    bindEvents() {
        // 검색 이벤트
        this.searchBtn.addEventListener('click', () => this.handleSearch());
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });
        this.closeSearchBtn.addEventListener('click', () => this.hideSearchResults());

        // 사이드바 토글 이벤트 바인딩
        if (this.sidebarToggleBtn) {
            this.sidebarToggleBtn.addEventListener('click', () => {
                this.sidebar.classList.toggle('collapsed');
                // 클릭 직후 즉시 지도 relayout 호출
                if (this.map) {
                    this.map.relayout();
                }
                // transition 애니메이션(300ms) 완료 후 2차 relayout 호출
                setTimeout(() => {
                    if (this.map) {
                        this.map.relayout();
                    }
                }, 310);
            });
        }
        
        // 필터링 이벤트
        this.markerFilter.addEventListener('input', () => {
            this.focusedMarkerIndex = -1;
            this.renderMarkersList();
        });
        this.markerFilter.addEventListener('keydown', (e) => this.handleMarkerFilterKeydown(e));
        
        if (this.backupAccordionToggle) {
            this.backupAccordionToggle.addEventListener('click', () => {
                this.backupAccordionToggle.closest('.sidebar-footer').classList.toggle('active');
                this.backupAccordionContent.classList.toggle('hidden');
            });
        }
        if (this.exportMarkersJsonBtn) {
            this.exportMarkersJsonBtn.addEventListener('click', () => this.handleExportMarkersJSON());
        }
        if (this.exportMarkersExcelBtn) {
            this.exportMarkersExcelBtn.addEventListener('click', () => this.handleExportMarkersExcel());
        }
        if (this.importMarkersJsonFile) {
            this.importMarkersJsonFile.addEventListener('change', (e) => this.handleImportMarkersJSON(e));
        }
        if (this.importMarkersExcelFile) {
            this.importMarkersExcelFile.addEventListener('change', (e) => this.handleImportMarkersExcel(e));
        }
        if (this.exportInfoJsonBtn) {
            this.exportInfoJsonBtn.addEventListener('click', () => this.handleExportInfoJSON());
        }
        if (this.exportInfoExcelBtn) {
            this.exportInfoExcelBtn.addEventListener('click', () => this.handleExportInfoExcel());
        }
        if (this.importInfoJsonFile) {
            this.importInfoJsonFile.addEventListener('change', (e) => this.handleImportInfoJSON(e));
        }
        if (this.importInfoExcelFile) {
            this.importInfoExcelFile.addEventListener('change', (e) => this.handleImportInfoExcelBackup(e));
        }
        
        // Excel/CSV 업로드 이벤트 바인딩
        this.importExcelFile.addEventListener('change', (e) => this.handleImportExcel(e));
        
        // 대기 마커 제어 이벤트 바인딩
        this.uploadPendingBtn.addEventListener('click', () => this.handleUploadPending());
        this.cancelPendingBtn.addEventListener('click', () => this.handleCancelPending());
        
        // 지도 플로팅 컨트롤 이벤트
        this.myLocationBtn.addEventListener('click', () => this.goToMyLocation());
        this.zoomInBtn.addEventListener('click', () => this.zoomMap(true));
        this.zoomOutBtn.addEventListener('click', () => this.zoomMap(false));
        if (this.cadastralBtn) {
            this.cadastralBtn.addEventListener('click', () => this.toggleCadastralMode());
        }
        
        // 모달 이벤트
        this.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.cancelModalBtn.addEventListener('click', () => this.closeModal());
        this.saveMarkerBtn.addEventListener('click', () => this.handleSaveMarker());
        this.deleteMarkerModalBtn.addEventListener('click', () => this.handleDeleteMarker(this.currentEditingId));
        
        // 색상 칩 선택 이벤트
        if (this.colorChips) {
            this.colorChips.forEach(chip => {
                chip.addEventListener('click', () => {
                    const isReadOnly = this.markerNameInput && this.markerNameInput.readOnly;
                    if (!isReadOnly) {
                        const color = chip.getAttribute('data-color');
                        this.selectColorChip(color);
                    }
                });
            });
        }
        if (this.copyTableBtn) {
            this.copyTableBtn.addEventListener('click', () => this.handleCopyDetailedTable());
        }
        if (this.copySelectedBtn) {
            this.copySelectedBtn.addEventListener('click', () => this.handleCopySelectedCells());
        }
        
        // 뒷배경 클릭시 모달 닫기 방지 (실수 방지 목적, 취소 버튼 명시 유도)
        this.markerModal.addEventListener('click', (e) => {
            if (e.target === this.markerModal) this.closeModal();
        });

        // 상세장비정보 업로드 이벤트 바인딩
        if (this.importInfoFile) {
            this.importInfoFile.addEventListener('change', (e) => this.handleImportInfoExcel(e));
        }
        if (this.closeInfoConfirmBtn) {
            this.closeInfoConfirmBtn.addEventListener('click', () => this.closeInfoConfirmModal());
        }
        if (this.cancelInfoConfirmBtn) {
            this.cancelInfoConfirmBtn.addEventListener('click', () => this.closeInfoConfirmModal());
        }
        if (this.sendInfoConfirmBtn) {
            this.sendInfoConfirmBtn.addEventListener('click', () => this.handleSendInfoToSupabase());
        }
        if (this.infoConfirmModal) {
            this.infoConfirmModal.addEventListener('click', (e) => {
                if (e.target === this.infoConfirmModal) this.closeInfoConfirmModal();
            });
        }

        // 엑셀 위치 등록 확인 모달 이벤트 바인딩
        if (this.closeExcelConfirmBtn) {
            this.closeExcelConfirmBtn.addEventListener('click', () => this.closeExcelConfirmModal());
        }
        if (this.cancelExcelConfirmBtn) {
            this.cancelExcelConfirmBtn.addEventListener('click', () => this.closeExcelConfirmModal());
        }
        if (this.sendExcelConfirmBtn) {
            this.sendExcelConfirmBtn.addEventListener('click', () => this.handleUploadPending());
        }
        if (this.excelConfirmModal) {
            this.excelConfirmModal.addEventListener('click', (e) => {
                if (e.target === this.excelConfirmModal) this.closeExcelConfirmModal();
            });
        }

        // 상세 정보 테이블 드래그 범위 선택 및 단축키 복사 이벤트 바인딩
        this.dragStartCell = null;
        this.isDragSelecting = false;

        const infoTable = document.getElementById('detailed-info-table');
        if (infoTable) {
            infoTable.addEventListener('mousedown', (e) => {
                // 편집 모드일 때는 셀 복사 드래그 기능을 무시하고 기본 브라우저 입력 동작 허용
                const isEditable = this.markerNameInput && !this.markerNameInput.readOnly;
                if (isEditable) return;

                const td = e.target.closest('td');
                if (!td) return;

                const tr = td.closest('tr');
                const tbody = tr.closest('tbody');
                if (!tbody) return; // header 클릭 시 제외

                const rows = Array.from(tbody.querySelectorAll('tr'));
                const rowIndex = rows.indexOf(tr);
                const colIndex = Array.from(tr.querySelectorAll('td')).indexOf(td);

                this.isDragSelecting = true;
                this.dragStartCell = { row: rowIndex, col: colIndex };

                // 단일 클릭 시 기존 선택 초기화 후 현재 셀 선택
                this.clearCellSelection();
                td.classList.add('cell-selected');
                this.updateCopySelectedBtnVisibility();

                // 브라우저 기본 텍스트 영역 지정 드래그 차단
                e.preventDefault();
            });

            infoTable.addEventListener('mouseover', (e) => {
                // 편집 모드일 때는 셀 복사 드래그 기능을 무시
                const isEditable = this.markerNameInput && !this.markerNameInput.readOnly;
                if (isEditable) return;

                if (!this.isDragSelecting || !this.dragStartCell) return;

                const td = e.target.closest('td');
                if (!td) return;

                const tr = td.closest('tr');
                const tbody = tr.closest('tbody');
                if (!tbody) return;

                const rows = Array.from(tbody.querySelectorAll('tr'));
                const rowIndex = rows.indexOf(tr);
                const colIndex = Array.from(tr.querySelectorAll('td')).indexOf(td);

                // 드래그 앤 드롭 선택 범위 연산
                const startRow = this.dragStartCell.row;
                const startCol = this.dragStartCell.col;
                const minRow = Math.min(startRow, rowIndex);
                const maxRow = Math.max(startRow, rowIndex);
                const minCol = Math.min(startCol, colIndex);
                const maxCol = Math.max(startCol, colIndex);

                // 직사각형 범위 내 셀 일괄 하이라이트
                rows.forEach((rowEl, rIdx) => {
                    const tds = Array.from(rowEl.querySelectorAll('td'));
                    tds.forEach((tdEl, cIdx) => {
                        if (rIdx >= minRow && rIdx <= maxRow && cIdx >= minCol && cIdx <= maxCol) {
                            tdEl.classList.add('cell-selected');
                        } else {
                            tdEl.classList.remove('cell-selected');
                        }
                    });
                });

                this.updateCopySelectedBtnVisibility();
            });

            // 전역 마우스업 감지 및 플래그 리셋
            document.addEventListener('mouseup', () => {
                this.isDragSelecting = false;
                this.dragStartCell = null;
            });

            // 헤더 열 복사 버튼 연동
            infoTable.addEventListener('click', (e) => {
                const copyBtn = e.target.closest('.col-copy-btn');
                if (copyBtn) {
                    const th = copyBtn.closest('th');
                    const colIndex = parseInt(th.getAttribute('data-col'));
                    const colName = th.textContent.replace('이 열 전체 복사', '').trim();
                    this.handleCopyColumn(colIndex, colName);
                }
            });

            // 더블클릭 단건 복사 이벤트 유지
            const tbody = document.getElementById('detailed-info-table-body');
            if (tbody) {
                tbody.addEventListener('dblclick', (e) => {
                    // 편집 모드일 때는 더블클릭 복사를 막지 않음 (인풋 단어 선택 등 브라우저 기본값 허용)
                    const isEditable = this.markerNameInput && !this.markerNameInput.readOnly;
                    if (isEditable) return;

                    const td = e.target.closest('td');
                    if (td) {
                        const val = this.getCellValue(td);
                        if (val) {
                            navigator.clipboard.writeText(val)
                                .then(() => {
                                    this.showToast(`'${val}'이(가) 클립보드에 복사되었습니다.`);
                                })
                                .catch(err => console.error('셀 복사 실패:', err));
                        }
                    }
                });
            }
        }

        // 전역 단축키 Ctrl+C 선택 복사 리스너 바인딩
        document.addEventListener('keydown', (e) => {
            // 편집 모드일 때는 단축키 셀 복사 차단 (인풋 내부 복사 허용)
            const isEditable = this.markerNameInput && !this.markerNameInput.readOnly;
            if (isEditable) return;

            const isCopyKey = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c';
            if (isCopyKey) {
                const selectedCells = document.querySelectorAll('#detailed-info-table-body .cell-selected');
                if (selectedCells.length > 0) {
                    e.preventDefault();
                    this.handleCopySelectedCells();
                }
            }
        });

        // 로드뷰 모달 닫기 이벤트 바인딩
        const closeRoadviewBtn = document.getElementById('close-roadview-btn');
        if (closeRoadviewBtn) {
            closeRoadviewBtn.addEventListener('click', () => this.closeRoadviewModal());
        }
        const roadviewModal = document.getElementById('roadview-modal');
        if (roadviewModal) {
            roadviewModal.addEventListener('click', (e) => {
                if (e.target === roadviewModal) this.closeRoadviewModal();
            });
        }

        // 로드뷰 드래그 기능 활성화
        this.initRoadviewDrag();

        // 로드뷰 촬영 일자 선택 변경 이벤트 바인딩
        const roadviewDateSelect = document.getElementById('roadview-date-select');
        if (roadviewDateSelect) {
            roadviewDateSelect.addEventListener('change', (e) => {
                const selectedPanoId = e.target.value;
                if (this.currentRoadview && selectedPanoId) {
                    this.currentRoadview.setPanoId(selectedPanoId);
                }
            });
        }

        // 필터 아코디언 토글 이벤트
        if (this.filterAccordionToggle) {
            this.filterAccordionToggle.addEventListener('click', () => {
                this.filterAccordionToggle.closest('.filter-accordion-section').classList.toggle('active');
                this.filterAccordionContent.classList.toggle('hidden');
            });
        }

        // 엑셀로 위치 찍기 아코디언 토글 이벤트
        if (this.excelAccordionToggle) {
            this.excelAccordionToggle.addEventListener('click', () => {
                this.excelAccordionToggle.closest('.excel-section').classList.toggle('active');
                this.excelAccordionContent.classList.toggle('hidden');
            });
        }

        // 축전지 엑셀로 위치 찍기 아코디언 토글 이벤트
        if (this.batteryExcelAccordionToggle) {
            this.batteryExcelAccordionToggle.addEventListener('click', () => {
                this.batteryExcelAccordionToggle.closest('.excel-section').classList.toggle('active');
                this.batteryExcelAccordionContent.classList.toggle('hidden');
            });
        }

        // 상세장비정보 업로드 아코디언 토글 이벤트
        if (this.infoAccordionToggle) {
            this.infoAccordionToggle.addEventListener('click', () => {
                this.infoAccordionToggle.closest('.info-upload-section').classList.toggle('active');
                this.infoAccordionContent.classList.toggle('hidden');
            });
        }

        // 연도 드롭다운 트리거
        if (this.selectYearsTrigger) {
            this.selectYearsTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const wrapper = this.selectYearsTrigger.closest('.custom-select-wrapper');
                const isOpen = wrapper.classList.contains('open');
                
                // 다른 드롭다운 닫기
                this.closeAllDropdowns();
                
                if (!isOpen) {
                    wrapper.classList.add('open');
                    this.optionsYearsContainer.classList.remove('hidden');
                }
            });
        }

        // 사업구분 드롭다운 트리거
        if (this.selectBusinessesTrigger) {
            this.selectBusinessesTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const wrapper = this.selectBusinessesTrigger.closest('.custom-select-wrapper');
                const isOpen = wrapper.classList.contains('open');
                
                // 다른 드롭다운 닫기
                this.closeAllDropdowns();
                
                if (!isOpen) {
                    wrapper.classList.add('open');
                    this.optionsBusinessesContainer.classList.remove('hidden');
                }
            });
        }

        // 색상 드롭다운 트리거
        if (this.selectColorsTrigger) {
            this.selectColorsTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const wrapper = this.selectColorsTrigger.closest('.custom-select-wrapper');
                const isOpen = wrapper.classList.contains('open');
                
                // 다른 드롭다운 닫기
                this.closeAllDropdowns();
                
                if (!isOpen) {
                    wrapper.classList.add('open');
                    this.optionsColorsContainer.classList.remove('hidden');
                }
            });
        }

        // 태그 드롭다운 트리거
        if (this.selectTagsTrigger) {
            this.selectTagsTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const wrapper = this.selectTagsTrigger.closest('.custom-select-wrapper');
                const isOpen = wrapper.classList.contains('open');
                
                // 다른 드롭다운 닫기
                this.closeAllDropdowns();
                
                if (!isOpen) {
                    wrapper.classList.add('open');
                    this.optionsTagsContainer.classList.remove('hidden');
                }
            });
        }

        // 모두 선택 버튼 이벤트
        if (this.btnSelectAllYears) {
            this.btnSelectAllYears.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectAllFilterOptions('year');
            });
        }

        if (this.btnSelectAllBusinesses) {
            this.btnSelectAllBusinesses.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectAllFilterOptions('business');
            });
        }

        if (this.btnSelectAllColors) {
            this.btnSelectAllColors.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectAllFilterOptions('color');
            });
        }

        if (this.btnSelectAllTags) {
            this.btnSelectAllTags.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectAllFilterOptions('tag');
            });
        }

        // 축전지 모드 관련 추가 바인딩
        if (this.modeEqBtn) {
            this.modeEqBtn.addEventListener('click', () => this.switchMode('equipment'));
        }
        if (this.modeBatteryBtn) {
            this.modeBatteryBtn.addEventListener('click', () => this.switchMode('battery'));
        }
        if (this.importExcelFileBattery) {
            this.importExcelFileBattery.addEventListener('change', (e) => this.handleImportExcelBattery(e));
        }

        // 축전지 필터 드롭다운 트리거
        if (this.selectCapacitiesTrigger) {
            this.selectCapacitiesTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const wrapper = this.selectCapacitiesTrigger.closest('.custom-select-wrapper');
                const isOpen = wrapper.classList.contains('open');
                this.closeAllDropdowns();
                if (!isOpen) {
                    wrapper.classList.add('open');
                    this.optionsCapacitiesContainer.classList.remove('hidden');
                }
            });
        }
        if (this.selectQuantitiesTrigger) {
            this.selectQuantitiesTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const wrapper = this.selectQuantitiesTrigger.closest('.custom-select-wrapper');
                const isOpen = wrapper.classList.contains('open');
                this.closeAllDropdowns();
                if (!isOpen) {
                    wrapper.classList.add('open');
                    this.optionsQuantitiesContainer.classList.remove('hidden');
                }
            });
        }
        if (this.selectStationsTrigger) {
            this.selectStationsTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const wrapper = this.selectStationsTrigger.closest('.custom-select-wrapper');
                const isOpen = wrapper.classList.contains('open');
                this.closeAllDropdowns();
                if (!isOpen) {
                    wrapper.classList.add('open');
                    this.optionsStationsContainer.classList.remove('hidden');
                }
            });
        }

        // 축전지 필터 모두 선택
        if (this.btnSelectAllCapacities) {
            this.btnSelectAllCapacities.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectAllFilterOptions('capacity');
            });
        }
        if (this.btnSelectAllQuantities) {
            this.btnSelectAllQuantities.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectAllFilterOptions('quantity');
            });
        }
        if (this.btnSelectAllStations) {
            this.btnSelectAllStations.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectAllFilterOptions('station');
            });
        }

        // 축전지 확인 모달 이벤트
        if (this.closeBatteryExcelConfirmBtn) {
            this.closeBatteryExcelConfirmBtn.addEventListener('click', () => this.closeBatteryExcelConfirmModal());
        }
        if (this.cancelBatteryExcelConfirmBtn) {
            this.cancelBatteryExcelConfirmBtn.addEventListener('click', () => this.closeBatteryExcelConfirmModal());
        }
        if (this.sendBatteryExcelConfirmBtn) {
            this.sendBatteryExcelConfirmBtn.addEventListener('click', () => this.handleSaveBatteryExcel(false));
        }
        if (this.sendBatteryExcelTempBtn) {
            this.sendBatteryExcelTempBtn.addEventListener('click', () => this.handleSaveBatteryExcel(true));
        }

        // 축전지 상세 정보 테이블 복사 단추 바인딩
        if (this.batteryCopySelectedBtn) {
            this.batteryCopySelectedBtn.addEventListener('click', () => this.handleCopySelectedCellsBattery());
        }
        if (this.batteryCopyTableBtn) {
            this.batteryCopyTableBtn.addEventListener('click', () => this.handleCopyDetailedTableBattery());
        }

        // 축전지 상세 정보 테이블 드래그 복사 및 더블클릭 복사
        const batteryTable = document.getElementById('battery-info-table');
        if (batteryTable) {
            batteryTable.addEventListener('mousedown', (e) => {
                const isEditable = this.markerNameInput && !this.markerNameInput.readOnly;
                if (isEditable) return;

                const td = e.target.closest('td');
                if (!td) return;

                const tr = td.closest('tr');
                const tbody = tr.closest('tbody');
                if (!tbody) return;

                const rows = Array.from(tbody.querySelectorAll('tr'));
                const rowIndex = rows.indexOf(tr);
                const colIndex = Array.from(tr.querySelectorAll('td')).indexOf(td);

                this.isDragSelecting = true;
                this.dragStartCell = { row: rowIndex, col: colIndex };

                this.clearCellSelectionBattery();
                td.classList.add('cell-selected');
                this.updateCopySelectedBtnVisibilityBattery();

                e.preventDefault();
            });

            batteryTable.addEventListener('mouseover', (e) => {
                const isEditable = this.markerNameInput && !this.markerNameInput.readOnly;
                if (isEditable) return;

                if (!this.isDragSelecting || !this.dragStartCell) return;

                const td = e.target.closest('td');
                if (!td) return;

                const tr = td.closest('tr');
                const tbody = tr.closest('tbody');
                if (!tbody) return;

                const rows = Array.from(tbody.querySelectorAll('tr'));
                const rowIndex = rows.indexOf(tr);
                const colIndex = Array.from(tr.querySelectorAll('td')).indexOf(td);

                const startRow = this.dragStartCell.row;
                const startCol = this.dragStartCell.col;
                const minRow = Math.min(startRow, rowIndex);
                const maxRow = Math.max(startRow, rowIndex);
                const minCol = Math.min(startCol, colIndex);
                const maxCol = Math.max(startCol, colIndex);

                rows.forEach((rowEl, rIdx) => {
                    const tds = Array.from(rowEl.querySelectorAll('td'));
                    tds.forEach((tdEl, cIdx) => {
                        if (rIdx >= minRow && rIdx <= maxRow && cIdx >= minCol && cIdx <= maxCol) {
                            tdEl.classList.add('cell-selected');
                        } else {
                            tdEl.classList.remove('cell-selected');
                        }
                    });
                });

                this.updateCopySelectedBtnVisibilityBattery();
            });

            // 헤더 열 복사 버튼 연동
            batteryTable.addEventListener('click', (e) => {
                const copyBtn = e.target.closest('.battery-col-copy-btn');
                if (copyBtn) {
                    const th = copyBtn.closest('th');
                    const colIndex = parseInt(th.getAttribute('data-col'));
                    const colName = th.textContent.replace('이 열 전체 복사', '').trim();
                    this.handleCopyColumnBattery(colIndex, colName);
                }
            });

            const batteryTbody = document.getElementById('battery-info-table-body');
            if (batteryTbody) {
                batteryTbody.addEventListener('dblclick', (e) => {
                    const isEditable = this.markerNameInput && !this.markerNameInput.readOnly;
                    if (isEditable) return;

                    const td = e.target.closest('td');
                    if (td) {
                        const val = this.getCellValue(td);
                        if (val) {
                            navigator.clipboard.writeText(val)
                                .then(() => {
                                    this.showToast(`'${val}'이(가) 클립보드에 복사되었습니다.`);
                                })
                                .catch(err => console.error('셀 복사 실패:', err));
                        }
                    }
                });
            }
        }

        // 외부 클릭 시 드롭다운 닫기
        document.addEventListener('click', () => {
            this.closeAllDropdowns();
        });
    }

    async init() {
        // Supabase 초기화 검증 및 인스턴스 생성
        this.supabase = null;
        if (typeof supabase !== 'undefined' && typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.URL && SUPABASE_CONFIG.URL !== "YOUR_SUPABASE_PROJECT_URL") {
            try {
                this.supabase = supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);
            } catch (e) {
                console.error("Supabase 초기화 실패:", e);
            }
        }

        if (this.supabase) {
            try {
                // 1. markers 테이블 로드
                const { data: markersList, error: markersError } = await this.supabase
                    .from('markers')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                if (markersError) throw markersError;

                // 2. information 테이블 전체 로드 (메모리 조인용)
                const { data: infoList, error: infoError } = await this.supabase
                    .from('information')
                    .select('*');
                
                if (infoError) throw infoError;

                // 3. place_name을 key로 하는 Map 생성 (1:N 대응이므로 배열로 저장)
                const infoMap = new Map();
                if (infoList) {
                    infoList.forEach(info => {
                        const name = info.place_name ? info.place_name.trim() : "";
                        if (name) {
                            if (!infoMap.has(name)) {
                                infoMap.set(name, []);
                            }
                            infoMap.get(name).push(info);
                        }
                    });
                }
                
                // 4. eqMarkersData 구성
                this.eqMarkersData = (markersList || []).map(row => {
                    const markerName = row.name ? row.name.trim() : "";
                    const infos = infoMap.get(markerName) || [];
                    const repInfo = infos[0] || null;
                    
                    return {
                        id: row.id,
                        name: row.name,
                        lat: row.lat,
                        lng: row.lng,
                        memo: row.memo || "",
                        tags: row.tags || [],
                        color: row.color || '#10b981',
                        roadAddress: row.road_address || "",
                        jibunAddress: row.jibun_address || "",
                        facilityCode: row.facility_code || (repInfo ? repInfo.facility_code || "" : ""),
                        projectCode: repInfo ? repInfo.project_code || "" : "",
                        facilityYear: repInfo ? repInfo.facility_year || "" : "",
                        businessType: repInfo ? repInfo.business_type || "" : "",
                        finalStationName: repInfo ? repInfo.final_station_name || "" : "",
                        eqClass: repInfo ? repInfo.eq_class || "" : "",
                        eqType: repInfo ? repInfo.eq_type || "" : "",
                        installDate: repInfo ? repInfo.install_date || "" : "",
                        openDate: repInfo ? repInfo.open_date || "" : "",
                        createdAt: row.created_at ? row.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
                    };
                });

                // 5. battery_markers 테이블 로드
                const { data: bMarkersList, error: bMarkersError } = await this.supabase
                    .from('battery_markers')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (bMarkersError) throw bMarkersError;

                // 6. battery_specs 테이블 전체 로드
                const { data: bSpecsList, error: bSpecsError } = await this.supabase
                    .from('battery_specs')
                    .select('*');

                if (bSpecsError) throw bSpecsError;

                // 7. marker_id를 key로 하는 Map 생성
                const specsMap = new Map();
                if (bSpecsList) {
                    bSpecsList.forEach(spec => {
                        const markerId = spec.marker_id;
                        if (markerId) {
                            if (!specsMap.has(markerId)) {
                                specsMap.set(markerId, []);
                            }
                            specsMap.get(markerId).push(spec);
                        }
                    });
                }

                // 8. batteryMarkersData 구성
                this.batteryMarkersData = (bMarkersList || []).map(row => {
                    const specs = specsMap.get(row.id) || [];
                    const repSpec = specs[0] || null;
                    return {
                        id: row.id,
                        name: row.name,
                        lat: row.lat,
                        lng: row.lng,
                        address: row.address || "",
                        memo: row.memo || "",
                        tags: row.tags || [],
                        color: row.color || '#10b981',
                        createdAt: row.created_at ? row.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
                        items: specs.map(s => ({
                            id: s.id,
                            erpName: s.erp_name || "",
                            address: s.address || "",
                            capacity: s.capacity || 600,
                            quantity: s.quantity || 12,
                            stationName: s.station_name || "",
                            createdAt: s.created_at ? s.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
                        })),
                        capacity: repSpec ? repSpec.capacity : 600,
                        quantity: repSpec ? repSpec.quantity : 12,
                        stationName: repSpec ? repSpec.station_name : (row.name || "")
                    };
                });

                this.markersData = this.currentMode === 'equipment' ? this.eqMarkersData : this.batteryMarkersData;
            } catch (e) {
                console.error("Supabase 데이터 로드 실패, 로컬 캐시를 사용합니다:", e);
                this.loadFromLocalStorage();
            }
        } else {
            this.loadFromLocalStorage();
        }
        
        // 정적 스크립트 로드 완료 후 지도 로딩 진행
        if (window.kakao && window.kakao.maps) {
            kakao.maps.load(() => {
                this.initializeMap();
            });
        } else {
            this.showToast('카카오 지도 SDK가 로드되지 않았습니다. index.html 설정을 확인하세요.', 5000);
        }
        
        // 필터 옵션 동적 구성
        this.initFilters(true);

        this.renderMarkersList();
    }

    loadFromLocalStorage() {
        const saved = localStorage.getItem('saved_markers');
        if (saved) {
            try {
                this.eqMarkersData = JSON.parse(saved);
            } catch (e) {
                console.error("저장된 마커 파싱 오류:", e);
                this.eqMarkersData = [];
            }
        }
        const savedBattery = localStorage.getItem('saved_battery_markers');
        if (savedBattery) {
            try {
                this.batteryMarkersData = JSON.parse(savedBattery);
            } catch (e) {
                console.error("저장된 축전지 마커 파싱 오류:", e);
                this.batteryMarkersData = [];
            }
        }
        
        this.markersData = this.currentMode === 'equipment' ? this.eqMarkersData : this.batteryMarkersData;
    }

    // 모든 드롭다운 닫기
    closeAllDropdowns() {
        const wrappers = document.querySelectorAll('.custom-select-wrapper');
        wrappers.forEach(w => w.classList.remove('open'));
        const containers = document.querySelectorAll('.custom-options-container');
        containers.forEach(c => c.classList.add('hidden'));
    }

    // 데이터 기반 필터 고유 옵션 목록 동적 초기화
    initFilters(isFirstLoad = false) {
        if (this.currentMode === 'equipment') {
            // 1. 고유 연도 및 사업구분, 색상, 태그 수집
            const yearsSet = new Set();
            const businessesSet = new Set();
            const colorsSet = new Set();
            const tagsSet = new Set();
     
            this.markersData.forEach(marker => {
                const year = marker.facilityYear ? marker.facilityYear.toString().trim() : "미지정";
                const business = marker.businessType ? marker.businessType.toString().trim() : "미지정";
                const color = marker.color ? marker.color.toLowerCase().trim() : "#10b981";
                yearsSet.add(year);
                businessesSet.add(business);
                colorsSet.add(color);
 
                // 태그 수집
                if (marker.tags && marker.tags.length > 0) {
                    marker.tags.forEach(tag => {
                        const cleanTag = tag.toString().trim();
                        if (cleanTag) tagsSet.add(cleanTag);
                    });
                } else {
                    tagsSet.add("미지정");
                }
            });
     
            // 2. 정렬
            this.uniqueYears = Array.from(yearsSet).sort((a, b) => {
                if (a === "미지정") return 1;
                if (b === "미지정") return -1;
                return parseInt(b) - parseInt(a);
            });
 
            this.uniqueBusinesses = Array.from(businessesSet).sort((a, b) => {
                if (a === "미지정") return 1;
                if (b === "미지정") return -1;
                return a.localeCompare(b);
            });
 
            const colorOrder = ['#10b981', '#6366f1', '#f43f5e', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#14b8a6', '#f97316'];
            this.uniqueColors = Array.from(colorsSet).sort((a, b) => {
                const idxA = colorOrder.indexOf(a);
                const idxB = colorOrder.indexOf(b);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                return a.localeCompare(b);
            });
 
            this.uniqueTags = Array.from(tagsSet).sort((a, b) => {
                if (a === "미지정") return 1;
                if (b === "미지정") return -1;
                return a.localeCompare(b);
            });
 
            // 3. 첫 로드 시에는 전체 값을 기본 선택 상태로 셋업
            if (isFirstLoad) {
                this.selectedYears = new Set(this.uniqueYears);
                this.selectedBusinesses = new Set(this.uniqueBusinesses);
                this.selectedColors = new Set(this.uniqueColors);
                this.selectedTags = new Set(this.uniqueTags);
            } else {
                const newSelectedYears = new Set();
                this.uniqueYears.forEach(y => {
                    if (this.selectedYears.has(y)) newSelectedYears.add(y);
                });
                this.selectedYears = newSelectedYears.size > 0 ? newSelectedYears : new Set(this.uniqueYears);
 
                const newSelectedBusinesses = new Set();
                this.uniqueBusinesses.forEach(b => {
                    if (this.selectedBusinesses.has(b)) newSelectedBusinesses.add(b);
                });
                this.selectedBusinesses = newSelectedBusinesses.size > 0 ? newSelectedBusinesses : new Set(this.uniqueBusinesses);
 
                const newSelectedColors = new Set();
                this.uniqueColors.forEach(c => {
                    if (this.selectedColors.has(c)) newSelectedColors.add(c);
                });
                this.selectedColors = newSelectedColors.size > 0 ? newSelectedColors : new Set(this.uniqueColors);
 
                const newSelectedTags = new Set();
                this.uniqueTags.forEach(t => {
                    if (this.selectedTags.has(t)) newSelectedTags.add(t);
                });
                this.selectedTags = newSelectedTags.size > 0 ? newSelectedTags : new Set(this.uniqueTags);
            }
        } else {
            // --- 축전지 모드 필터 옵션 초기화 ---
            const capacitiesSet = new Set();
            const quantitiesSet = new Set();
            const stationsSet = new Set();
            const colorsSet = new Set();
            const tagsSet = new Set();
 
            this.markersData.forEach(marker => {
                const color = marker.color ? marker.color.toLowerCase().trim() : "#10b981";
                colorsSet.add(color);
 
                if (marker.tags && marker.tags.length > 0) {
                    marker.tags.forEach(tag => {
                        const cleanTag = tag.toString().trim();
                        if (cleanTag) tagsSet.add(cleanTag);
                    });
                } else {
                    tagsSet.add("미지정");
                }
 
                // 1:N 스펙 수집
                if (marker.items && marker.items.length > 0) {
                    marker.items.forEach(item => {
                        const cap = item.capacity ? item.capacity.toString().trim() + " AH" : "미지정";
                        const qty = item.quantity ? item.quantity.toString().trim() + " Cell" : "미지정";
                        const stName = item.stationName ? item.stationName.toString().trim() : "미지정";
                        capacitiesSet.add(cap);
                        quantitiesSet.add(qty);
                        stationsSet.add(stName);
                    });
                } else {
                    const cap = marker.capacity ? marker.capacity.toString().trim() + " AH" : "미지정";
                    const qty = marker.quantity ? marker.quantity.toString().trim() + " Cell" : "미지정";
                    const stName = marker.stationName ? marker.stationName.toString().trim() : (marker.name || "미지정");
                    capacitiesSet.add(cap);
                    quantitiesSet.add(qty);
                    stationsSet.add(stName);
                }
            });
 
            this.uniqueCapacities = Array.from(capacitiesSet).sort((a, b) => {
                if (a === "미지정") return 1;
                if (b === "미지정") return -1;
                return parseInt(b) - parseInt(a);
            });
            this.uniqueQuantities = Array.from(quantitiesSet).sort((a, b) => {
                if (a === "미지정") return 1;
                if (b === "미지정") return -1;
                return parseInt(b) - parseInt(a);
            });
            this.uniqueStations = Array.from(stationsSet).sort((a, b) => {
                if (a === "미지정") return 1;
                if (b === "미지정") return -1;
                return a.localeCompare(b);
            });
 
            const colorOrder = ['#10b981', '#6366f1', '#f43f5e', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#14b8a6', '#f97316'];
            this.uniqueColors = Array.from(colorsSet).sort((a, b) => {
                const idxA = colorOrder.indexOf(a);
                const idxB = colorOrder.indexOf(b);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                return a.localeCompare(b);
            });
            this.uniqueTags = Array.from(tagsSet).sort((a, b) => {
                if (a === "미지정") return 1;
                if (b === "미지정") return -1;
                return a.localeCompare(b);
            });
 
            if (isFirstLoad) {
                this.selectedCapacities = new Set(this.uniqueCapacities);
                this.selectedQuantities = new Set(this.uniqueQuantities);
                this.selectedStations = new Set(this.uniqueStations);
                this.selectedColors = new Set(this.uniqueColors);
                this.selectedTags = new Set(this.uniqueTags);
            } else {
                const newSelectedCapacities = new Set();
                this.uniqueCapacities.forEach(c => {
                    if (this.selectedCapacities.has(c)) newSelectedCapacities.add(c);
                });
                this.selectedCapacities = newSelectedCapacities.size > 0 ? newSelectedCapacities : new Set(this.uniqueCapacities);
 
                const newSelectedQuantities = new Set();
                this.uniqueQuantities.forEach(q => {
                    if (this.selectedQuantities.has(q)) newSelectedQuantities.add(q);
                });
                this.selectedQuantities = newSelectedQuantities.size > 0 ? newSelectedQuantities : new Set(this.uniqueQuantities);
 
                const newSelectedStations = new Set();
                this.uniqueStations.forEach(s => {
                    if (this.selectedStations.has(s)) newSelectedStations.add(s);
                });
                this.selectedStations = newSelectedStations.size > 0 ? newSelectedStations : new Set(this.uniqueStations);
 
                const newSelectedColors = new Set();
                this.uniqueColors.forEach(c => {
                    if (this.selectedColors.has(c)) newSelectedColors.add(c);
                });
                this.selectedColors = newSelectedColors.size > 0 ? newSelectedColors : new Set(this.uniqueColors);
 
                const newSelectedTags = new Set();
                this.uniqueTags.forEach(t => {
                    if (this.selectedTags.has(t)) newSelectedTags.add(t);
                });
                this.selectedTags = newSelectedTags.size > 0 ? newSelectedTags : new Set(this.uniqueTags);
            }
        }
 
        this.renderFilterDropdowns();
    }
 
    renderFilterDropdowns() {
        if (this.currentMode === 'equipment') {
            // --- 연도 선택 드롭다운 ---
            if (this.optionsYearsContainer) {
                this.optionsYearsContainer.innerHTML = '';
                this.uniqueYears.forEach(year => {
                    const item = document.createElement('div');
                    const isSelected = this.selectedYears.has(year);
                    item.className = `filter-option-item ${isSelected ? 'selected' : ''}`;
                    item.innerHTML = `
                        <div class="filter-option-checkbox"></div>
                        <span class="filter-option-text">${year}</span>
                    `;
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.toggleFilterOption('year', year);
                    });
                    this.optionsYearsContainer.appendChild(item);
                });
 
                if (this.selectedYearsLabel) {
                    const selectedCount = this.selectedYears.size;
                    const totalCount = this.uniqueYears.length;
                    
                    if (selectedCount === totalCount) {
                        this.selectedYearsLabel.textContent = "연도 선택";
                    } else if (selectedCount === 0) {
                        this.selectedYearsLabel.textContent = "선택 안함";
                    } else {
                        const firstSelected = Array.from(this.selectedYears)[0];
                        this.selectedYearsLabel.textContent = selectedCount === 1 ? firstSelected : `${firstSelected} 외 ${selectedCount - 1}`;
                    }
                }
            }
 
            // --- 사업구분 선택 드롭다운 ---
            if (this.optionsBusinessesContainer) {
                this.optionsBusinessesContainer.innerHTML = '';
                this.uniqueBusinesses.forEach(biz => {
                    const item = document.createElement('div');
                    const isSelected = this.selectedBusinesses.has(biz);
                    item.className = `filter-option-item ${isSelected ? 'selected' : ''}`;
                    item.innerHTML = `
                        <div class="filter-option-checkbox"></div>
                        <span class="filter-option-text">${biz}</span>
                    `;
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.toggleFilterOption('business', biz);
                    });
                    this.optionsBusinessesContainer.appendChild(item);
                });
 
                if (this.selectedBusinessesLabel) {
                    const selectedCount = this.selectedBusinesses.size;
                    const totalCount = this.uniqueBusinesses.length;
                    
                    if (selectedCount === totalCount) {
                        this.selectedBusinessesLabel.textContent = "사업구분 선택";
                    } else if (selectedCount === 0) {
                        this.selectedBusinessesLabel.textContent = "선택 안함";
                    } else {
                        const firstSelected = Array.from(this.selectedBusinesses)[0];
                        this.selectedBusinessesLabel.textContent = selectedCount === 1 ? firstSelected : `${firstSelected} 외 ${selectedCount - 1}`;
                    }
                }
            }
        } else {
            // --- 용량(AH) 선택 드롭다운 ---
            if (this.optionsCapacitiesContainer) {
                this.optionsCapacitiesContainer.innerHTML = '';
                this.uniqueCapacities.forEach(cap => {
                    const item = document.createElement('div');
                    const isSelected = this.selectedCapacities.has(cap);
                    item.className = `filter-option-item ${isSelected ? 'selected' : ''}`;
                    item.innerHTML = `
                        <div class="filter-option-checkbox"></div>
                        <span class="filter-option-text">${cap}</span>
                    `;
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.toggleFilterOption('capacity', cap);
                    });
                    this.optionsCapacitiesContainer.appendChild(item);
                });
 
                if (this.selectedCapacitiesLabel) {
                    const selectedCount = this.selectedCapacities.size;
                    const totalCount = this.uniqueCapacities.length;
                    
                    if (selectedCount === totalCount) {
                        this.selectedCapacitiesLabel.textContent = "용량 선택";
                    } else if (selectedCount === 0) {
                        this.selectedCapacitiesLabel.textContent = "선택 안함";
                    } else {
                        const firstSelected = Array.from(this.selectedCapacities)[0];
                        this.selectedCapacitiesLabel.textContent = selectedCount === 1 ? firstSelected : `${firstSelected} 외 ${selectedCount - 1}`;
                    }
                }
            }
 
            // --- 수량(Cell) 선택 드롭다운 ---
            if (this.optionsQuantitiesContainer) {
                this.optionsQuantitiesContainer.innerHTML = '';
                this.uniqueQuantities.forEach(qty => {
                    const item = document.createElement('div');
                    const isSelected = this.selectedQuantities.has(qty);
                    item.className = `filter-option-item ${isSelected ? 'selected' : ''}`;
                    item.innerHTML = `
                        <div class="filter-option-checkbox"></div>
                        <span class="filter-option-text">${qty}</span>
                    `;
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.toggleFilterOption('quantity', qty);
                    });
                    this.optionsQuantitiesContainer.appendChild(item);
                });
 
                if (this.selectedQuantitiesLabel) {
                    const selectedCount = this.selectedQuantities.size;
                    const totalCount = this.uniqueQuantities.length;
                    
                    if (selectedCount === totalCount) {
                        this.selectedQuantitiesLabel.textContent = "수량 선택";
                    } else if (selectedCount === 0) {
                        this.selectedQuantitiesLabel.textContent = "선택 안함";
                    } else {
                        const firstSelected = Array.from(this.selectedQuantities)[0];
                        this.selectedQuantitiesLabel.textContent = selectedCount === 1 ? firstSelected : `${firstSelected} 외 ${selectedCount - 1}`;
                    }
                }
            }
 
            // --- 창고/국소/국사명 선택 드롭다운 ---
            if (this.optionsStationsContainer) {
                this.optionsStationsContainer.innerHTML = '';
                this.uniqueStations.forEach(st => {
                    const item = document.createElement('div');
                    const isSelected = this.selectedStations.has(st);
                    item.className = `filter-option-item ${isSelected ? 'selected' : ''}`;
                    item.innerHTML = `
                        <div class="filter-option-checkbox"></div>
                        <span class="filter-option-text">${st}</span>
                    `;
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.toggleFilterOption('station', st);
                    });
                    this.optionsStationsContainer.appendChild(item);
                });
 
                if (this.selectedStationsLabel) {
                    const selectedCount = this.selectedStations.size;
                    const totalCount = this.uniqueStations.length;
                    
                    if (selectedCount === totalCount) {
                        this.selectedStationsLabel.textContent = "국소명 선택";
                    } else if (selectedCount === 0) {
                        this.selectedStationsLabel.textContent = "선택 안함";
                    } else {
                        const firstSelected = Array.from(this.selectedStations)[0];
                        this.selectedStationsLabel.textContent = selectedCount === 1 ? firstSelected : `${firstSelected} 외 ${selectedCount - 1}`;
                    }
                }
            }
        }
 
        // --- 색상 선택 드롭다운 ---
        if (this.optionsColorsContainer) {
            this.optionsColorsContainer.innerHTML = '';
            
            const COLOR_NAMES = {
                '#10b981': '에메랄드',
                '#6366f1': '인디고',
                '#f43f5e': '로즈',
                '#f59e0b': '골드',
                '#8b5cf6': '퍼플',
                '#06b6d4': '시안',
                '#ec4899': '핑크',
                '#84cc16': '라임',
                '#14b8a6': '틸',
                '#f97316': '오렌지'
            };
 
            this.uniqueColors.forEach(color => {
                const item = document.createElement('div');
                const isSelected = this.selectedColors.has(color);
                item.className = `filter-option-item ${isSelected ? 'selected' : ''}`;
                
                const name = COLOR_NAMES[color] || color;
                
                item.innerHTML = `
                    <div class="filter-option-checkbox"></div>
                    <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${color}; margin-right: 6px; border: 1px solid rgba(255, 255, 255, 0.2);"></div>
                    <span class="filter-option-text">${name}</span>
                `;
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleFilterOption('color', color);
                });
                this.optionsColorsContainer.appendChild(item);
            });
 
            if (this.selectedColorsLabel) {
                const selectedCount = this.selectedColors.size;
                const totalCount = this.uniqueColors.length;
                
                if (selectedCount === totalCount) {
                    this.selectedColorsLabel.textContent = "색상 선택";
                } else if (selectedCount === 0) {
                    this.selectedColorsLabel.textContent = "선택 안함";
                } else {
                    const firstSelected = Array.from(this.selectedColors)[0];
                    const firstLabel = COLOR_NAMES[firstSelected] || firstSelected;
                    this.selectedColorsLabel.textContent = selectedCount === 1 ? firstLabel : `${firstLabel} 외 ${selectedCount - 1}`;
                }
            }
        }
 
        // --- 태그 선택 드롭다운 ---
        if (this.optionsTagsContainer) {
            this.optionsTagsContainer.innerHTML = '';
            this.uniqueTags.forEach(tag => {
                const item = document.createElement('div');
                const isSelected = this.selectedTags.has(tag);
                item.className = `filter-option-item ${isSelected ? 'selected' : ''}`;
                item.innerHTML = `
                    <div class="filter-option-checkbox"></div>
                    <span class="filter-option-text">${tag}</span>
                `;
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleFilterOption('tag', tag);
                });
                this.optionsTagsContainer.appendChild(item);
            });
 
            if (this.selectedTagsLabel) {
                const selectedCount = this.selectedTags.size;
                const totalCount = this.uniqueTags.length;
                
                if (selectedCount === totalCount) {
                    this.selectedTagsLabel.textContent = "태그 선택";
                } else if (selectedCount === 0) {
                    this.selectedTagsLabel.textContent = "선택 안함";
                } else {
                    const firstSelected = Array.from(this.selectedTags)[0];
                    this.selectedTagsLabel.textContent = selectedCount === 1 ? firstSelected : `${firstSelected} 외 ${selectedCount - 1}`;
                }
            }
        }
    }
 
    toggleFilterOption(type, value) {
        if (type === 'year') {
            if (this.selectedYears.has(value)) {
                this.selectedYears.delete(value);
            } else {
                this.selectedYears.add(value);
            }
        } else if (type === 'business') {
            if (this.selectedBusinesses.has(value)) {
                this.selectedBusinesses.delete(value);
            } else {
                this.selectedBusinesses.add(value);
            }
        } else if (type === 'capacity') {
            if (this.selectedCapacities.has(value)) {
                this.selectedCapacities.delete(value);
            } else {
                this.selectedCapacities.add(value);
            }
        } else if (type === 'quantity') {
            if (this.selectedQuantities.has(value)) {
                this.selectedQuantities.delete(value);
            } else {
                this.selectedQuantities.add(value);
            }
        } else if (type === 'station') {
            if (this.selectedStations.has(value)) {
                this.selectedStations.delete(value);
            } else {
                this.selectedStations.add(value);
            }
        } else if (type === 'color') {
            if (this.selectedColors.has(value)) {
                this.selectedColors.delete(value);
            } else {
                this.selectedColors.add(value);
            }
        } else if (type === 'tag') {
            if (this.selectedTags.has(value)) {
                this.selectedTags.delete(value);
            } else {
                this.selectedTags.add(value);
            }
        }
 
        this.renderFilterDropdowns();
 
        this.renderMarkersOnMap();
        this.renderMarkersList();
    }
 
    selectAllFilterOptions(type) {
        if (type === 'year') {
            this.selectedYears = new Set(this.uniqueYears);
        } else if (type === 'business') {
            this.selectedBusinesses = new Set(this.uniqueBusinesses);
        } else if (type === 'capacity') {
            this.selectedCapacities = new Set(this.uniqueCapacities);
        } else if (type === 'quantity') {
            this.selectedQuantities = new Set(this.uniqueQuantities);
        } else if (type === 'station') {
            this.selectedStations = new Set(this.uniqueStations);
        } else if (type === 'color') {
            this.selectedColors = new Set(this.uniqueColors);
        } else if (type === 'tag') {
            this.selectedTags = new Set(this.uniqueTags);
        }
 
        this.renderFilterDropdowns();
 
        this.renderMarkersOnMap();
        this.renderMarkersList();
    }

    // 지도 인스턴스 생성 및 초기화
    initializeMap() {
        const mapContainer = document.getElementById('map');
        const defaultCenter = new kakao.maps.LatLng(35.159542, 126.8526012); // 광주광역시청 기준
        
        const mapOption = {
            center: defaultCenter,
            level: 6, // 지도 확대 레벨
            mapTypeId: kakao.maps.MapTypeId.HYBRID // [스카이뷰 변경] 위성 지도 + 도로명 레이아웃
        };
        
        try {
            this.map = new kakao.maps.Map(mapContainer, mapOption);
            
            // 저장된 지적도 활성화 상태 적용
            if (this.isCadastralMode) {
                this.map.addOverlayMapTypeId(kakao.maps.MapTypeId.USE_DISTRICT);
                if (this.cadastralBtn) {
                    this.cadastralBtn.classList.add('active');
                }
            }
            
            this.placesService = new kakao.maps.services.Places();
            
            // 지도 컨트롤 및 입력창 활성화
            this.searchInput.disabled = false;
            this.searchBtn.disabled = false;
            
            // [클릭 등록 비활성화] 지도 클릭 이벤트 리스너 제거
            // 기존: kakao.maps.event.addListener(this.map, 'click', ...)
            
            // 마커 클러스터러 초기화 (위성 지도에서도 시인성이 뛰어나도록 커스텀 스타일 적용)
            this.clusterer = new kakao.maps.MarkerClusterer({
                map: this.map,
                averageCenter: true,
                minLevel: 6,
                disableClickZoom: false,
                styles: [
                    {
                        // 10개 미만: 에메랄드 그린
                        width: '42px', height: '42px',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        borderRadius: '21px',
                        color: '#ffffff',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: '13px',
                        lineHeight: '38px',
                        border: '2px solid #ffffff',
                        boxShadow: '0 4px 10px rgba(16, 185, 129, 0.45)'
                    },
                    {
                        // 10개 이상 100개 미만: 인디고 블루
                        width: '52px', height: '52px',
                        background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                        borderRadius: '26px',
                        color: '#ffffff',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        lineHeight: '48px',
                        border: '2px solid #ffffff',
                        boxShadow: '0 4px 14px rgba(99, 102, 241, 0.45)'
                    },
                    {
                        // 100개 이상: 로즈 레드
                        width: '62px', height: '62px',
                        background: 'linear-gradient(135deg, #f43f5e, #e11d48)',
                        borderRadius: '31px',
                        color: '#ffffff',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: '15px',
                        lineHeight: '58px',
                        border: '2px solid #ffffff',
                        boxShadow: '0 4px 18px rgba(244, 63, 94, 0.45)'
                    }
                ]
            });
            
            // 기존 저장된 마커 지도 위에 표시
            this.renderMarkersOnMap();
        } catch (e) {
            console.error("지도 생성 중 에러 발생:", e);
            this.showToast('지도 초기화 오류가 발생했습니다. 개발자 도구를 확인해 주세요.', 5000);
        }
    }

    // 지도 상의 특정 좌표 클릭 이벤트
    handleMapClick(latLng) {
        // 이미 생성된 임시 마커가 있다면 제거
        this.clearTempMarker();
        
        // 임시 마커 생성 (저장 전 상태 시각화 - 골드 커스텀 SVG 적용)
        const tempMarkerImage = new kakao.maps.MarkerImage(MARKER_SVG_GOLD, new kakao.maps.Size(30, 45), { offset: new kakao.maps.Point(15, 45) });
        this.tempMarker = new kakao.maps.Marker({
            position: latLng,
            image: tempMarkerImage,
            map: this.map
        });
        
        // 등록 모달 열기
        this.openAddMarkerModal(latLng.getLat(), latLng.getLng());
    }

    // 임시 마커 지우기
    clearTempMarker() {
        if (this.tempMarker) {
            this.tempMarker.setMap(null);
            this.tempMarker = null;
        }
        if (this.tempOverlay) {
            this.tempOverlay.setMap(null);
            this.tempOverlay = null;
        }
    }

    // 마커 생성 모달 열기
    openAddMarkerModal(lat, lng, defaultName = '') {
        this.currentEditingId = null;
        this.modalTitle.textContent = '위치 마커 등록';
        
        // 폼 초기화
        this.markerNameInput.value = defaultName;
        // [정밀도 최우선] 원본 위경도 좌표 소수점을 임의로 반올림하지 않고 그대로 보존
        this.markerLatInput.value = lat;
        this.markerLngInput.value = lng;
        this.markerMemoInput.value = '';
        this.markerTagsInput.value = '';
        
        // 주소 표시 (역지오코딩)
        const modalAddrEl = document.getElementById('marker-address');
        if (modalAddrEl) {
            modalAddrEl.innerHTML = '주소 조회 중...';
            this.resolveAddress(lat, lng, (addrObj) => {
                let html = '';
                if (addrObj.jibunAddress) {
                    html += `<div>${this.formatJibunAddress(addrObj.jibunAddress)}</div>`;
                }
                if (addrObj.roadAddress) {
                    html += `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">(도로명) ${addrObj.roadAddress}</div>`;
                }
                if (!addrObj.roadAddress && !addrObj.jibunAddress) {
                    html = '주소를 확인할 수 없음';
                }
                modalAddrEl.innerHTML = html;
            });
        }

        // 상세 정보 폼 초기화
        if (this.markerFacilityCodeInput) this.markerFacilityCodeInput.value = '';
        if (this.markerProjectCodeInput) this.markerProjectCodeInput.value = '';
        if (this.markerFacilityYearInput) this.markerFacilityYearInput.value = '';
        if (this.markerBusinessTypeInput) this.markerBusinessTypeInput.value = '';
        if (this.markerFinalStationNameInput) this.markerFinalStationNameInput.value = '';
        if (this.markerEqClassInput) this.markerEqClassInput.value = '';
        if (this.markerEqTypeInput) this.markerEqTypeInput.value = '';
        if (this.markerInstallDateInput) this.markerInstallDateInput.value = '';
        if (this.markerOpenDateInput) this.markerOpenDateInput.value = '';
        
        // 폼 잠금 해제 및 버튼 상태 설정
        this.toggleModalReadOnly(false);
        this.saveMarkerBtn.classList.remove('hidden');
        this.cancelModalBtn.textContent = '취소';
        
        this.deleteMarkerModalBtn.classList.add('hidden');
        
        // 기본 색상(에메랄드) 선택 초기화
        this.selectColorChip('#10b981');

        if (this.currentMode === 'equipment') {
            this.markerNameLabel.textContent = '장소 이름';
            this.modalSubTitle.textContent = '일반 장비 위치 마커 등록';
            this.modalSubIcon.className = 'fa-solid fa-server';

            if (this.detailedInfoFormWrapper) this.detailedInfoFormWrapper.classList.remove('hidden');
            if (this.detailedInfoTableWrapper) this.detailedInfoTableWrapper.classList.add('hidden');
            if (this.batteryInfoFormWrapper) this.batteryInfoFormWrapper.classList.add('hidden');
            if (this.batteryInfoTableWrapper) this.batteryInfoTableWrapper.classList.add('hidden');
        } else {
            this.markerNameLabel.textContent = '통합시설명칭(ERP)';
            this.modalSubTitle.textContent = '축전지 적재 위치 마커 등록';
            this.modalSubIcon.className = 'fa-solid fa-battery-three-quarters';

            if (this.detailedInfoFormWrapper) this.detailedInfoFormWrapper.classList.add('hidden');
            if (this.detailedInfoTableWrapper) this.detailedInfoTableWrapper.classList.add('hidden');
            if (this.batteryInfoFormWrapper) this.batteryInfoFormWrapper.classList.remove('hidden');
            if (this.batteryInfoTableWrapper) this.batteryInfoTableWrapper.classList.add('hidden');

            if (this.markerCapacityInput) this.markerCapacityInput.value = '600';
            if (this.markerQuantityInput) this.markerQuantityInput.value = '12';
            if (this.markerStationInput) this.markerStationInput.value = defaultName || '기지국(현장)';
        }
        
        this.markerModal.classList.remove('hidden');
        this.markerNameInput.focus();
    }

    // 모달창 내 입력 필드 읽기 전용 토글 헬퍼 함수
    toggleModalReadOnly(isReadOnly) {
        const inputs = [
            this.markerNameInput,
            this.markerMemoInput,
            this.markerTagsInput,
            this.markerFacilityCodeInput,
            this.markerProjectCodeInput,
            this.markerFacilityYearInput,
            this.markerBusinessTypeInput,
            this.markerFinalStationNameInput,
            this.markerEqClassInput,
            this.markerEqTypeInput,
            this.markerInstallDateInput,
            this.markerOpenDateInput,
            this.markerCapacityInput,
            this.markerQuantityInput,
            this.markerStationInput
        ];
        
        inputs.forEach(input => {
            if (input) {
                input.readOnly = isReadOnly;
                if (isReadOnly) {
                    input.classList.add('input-readonly');
                } else {
                    input.classList.remove('input-readonly');
                }
            }
        });
    }

    // Supabase에서 국소명 기준으로 연관 상세 정보를 조회하여 테이블 및 폼에 바인딩
    async fetchAndBindDetailedInfo(markerName, facilityCode) {
        if (!this.supabase) return;
        
        try {
            // 장소명(place_name)에 마커 이름이 포함되어 있는 모든 장비 레코드 로드 (ILIKE 검색)
            const { data, error } = await this.supabase
                .from('information')
                .select('*')
                .ilike('place_name', `%${markerName}%`);
            
            if (error) throw error;
            
            if (data && data.length > 0) {
                // 1. 테이블 뷰 바인딩 (엑셀 형태의 다중 행 렌더링)
                const tbody = document.getElementById('detailed-info-table-body');
                if (tbody) {
                    tbody.innerHTML = '';
                    const isEditable = !this.markerNameInput.readOnly;
                    data.forEach(row => {
                        const tr = document.createElement('tr');
                        tr.setAttribute('data-facility-code', row.facility_code || '');
                        
                        if (isEditable) {
                            tr.innerHTML = `
                                <td><input type="text" class="table-input" data-key="facility_year" value="${row.facility_year || ''}"></td>
                                <td><input type="text" class="table-input" data-key="project_code" value="${row.project_code || ''}"></td>
                                <td><input type="text" class="table-input input-readonly" data-key="facility_code" value="${row.facility_code || ''}" readonly></td>
                                <td><input type="text" class="table-input" data-key="business_type" value="${row.business_type || ''}"></td>
                                <td><input type="text" class="table-input" data-key="final_station_name" value="${row.final_station_name || ''}"></td>
                                <td><input type="text" class="table-input" data-key="eq_type" value="${row.eq_type || ''}"></td>
                                <td><input type="text" class="table-input" data-key="install_date" value="${this.formatToShortDate(row.install_date)}"></td>
                                <td><input type="text" class="table-input" data-key="open_date" value="${this.formatToShortDate(row.open_date)}"></td>
                            `;
                        } else {
                            tr.innerHTML = `
                                <td>${row.facility_year || ''}</td>
                                <td>${row.project_code || ''}</td>
                                <td>${row.facility_code || ''}</td>
                                <td>${row.business_type || ''}</td>
                                <td>${row.final_station_name || ''}</td>
                                <td>${row.eq_type || ''}</td>
                                <td>${this.formatToShortDate(row.install_date)}</td>
                                <td>${this.formatToShortDate(row.open_date)}</td>
                            `;
                        }
                        tbody.appendChild(tr);
                    });
                }
                
                // 2. 폼 입력 필드 바인딩 (수정은 facilityCode가 일치하는 행 또는 첫 번째 행 타겟)
                const activeRow = data.find(row => row.facility_code === facilityCode) || data[0];
                if (activeRow) {
                    if (this.markerFacilityCodeInput) this.markerFacilityCodeInput.value = activeRow.facility_code || '';
                    if (this.markerProjectCodeInput) this.markerProjectCodeInput.value = activeRow.project_code || '';
                    if (this.markerFacilityYearInput) this.markerFacilityYearInput.value = activeRow.facility_year || '';
                    if (this.markerBusinessTypeInput) this.markerBusinessTypeInput.value = activeRow.business_type || '';
                    if (this.markerFinalStationNameInput) this.markerFinalStationNameInput.value = activeRow.final_station_name || '';
                    if (this.markerEqClassInput) this.markerEqClassInput.value = activeRow.eq_class || '';
                    if (this.markerEqTypeInput) this.markerEqTypeInput.value = activeRow.eq_type || '';
                    if (this.markerInstallDateInput) this.markerInstallDateInput.value = this.formatToShortDate(activeRow.install_date);
                    if (this.markerOpenDateInput) this.markerOpenDateInput.value = this.formatToShortDate(activeRow.open_date);
                }
            }
        } catch (e) {
            console.error("연관 상세 정보 조회 실패:", e);
        }
    }

    // 마커 상세 보기 전용 모달 열기 (읽기 전용)
    openDetailMarkerModal(id) {
        const markerData = this.markersData.find(m => m.id === id);
        if (!markerData) return;
        
        this.currentEditingId = id;
        this.modalTitle.textContent = '마커 상세 정보';
        
        this.markerNameInput.value = markerData.name;
        this.markerLatInput.value = markerData.lat;
        this.markerLngInput.value = markerData.lng;
        this.markerMemoInput.value = markerData.memo || '';
        this.markerTagsInput.value = (markerData.tags || []).join(', ');
        
        // 주소 표시 (역지오코딩)
        const modalAddrEl = document.getElementById('marker-address');
        if (modalAddrEl) {
            modalAddrEl.innerHTML = '주소 조회 중...';
            this.resolveAddress(markerData.lat, markerData.lng, (addrObj) => {
                let html = '';
                if (addrObj.jibunAddress) {
                    html += `<div>${this.formatJibunAddress(addrObj.jibunAddress)}</div>`;
                }
                if (addrObj.roadAddress) {
                    html += `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">(도로명) ${addrObj.roadAddress}</div>`;
                }
                if (!addrObj.roadAddress && !addrObj.jibunAddress) {
                    html = '주소를 확인할 수 없음';
                }
                modalAddrEl.innerHTML = html;
            });
        }

        // 저장된 색상으로 칩 동기화 (상세 보기 모드)
        this.selectColorChip(markerData.color || '#10b981');
 
        // 폼 잠금 및 버튼 숨김 설정
        this.toggleModalReadOnly(true);
        this.saveMarkerBtn.classList.add('hidden');
        this.deleteMarkerModalBtn.classList.add('hidden');
        this.cancelModalBtn.textContent = '닫기';

        if (this.currentMode === 'equipment') {
            this.markerNameLabel.textContent = '장소 이름';
            this.modalSubTitle.textContent = '일반 장비 위치 마커 상세';
            this.modalSubIcon.className = 'fa-solid fa-server';

            if (this.detailedInfoFormWrapper) this.detailedInfoFormWrapper.classList.add('hidden');
            if (this.detailedInfoTableWrapper) this.detailedInfoTableWrapper.classList.remove('hidden');
            if (this.batteryInfoFormWrapper) this.batteryInfoFormWrapper.classList.add('hidden');
            if (this.batteryInfoTableWrapper) this.batteryInfoTableWrapper.classList.add('hidden');

            // 상세 정보 폼 값 세팅
            if (this.markerFacilityCodeInput) this.markerFacilityCodeInput.value = markerData.facilityCode || '';
            if (this.markerProjectCodeInput) this.markerProjectCodeInput.value = markerData.projectCode || '';
            if (this.markerFacilityYearInput) this.markerFacilityYearInput.value = markerData.facilityYear || '';
            if (this.markerBusinessTypeInput) this.markerBusinessTypeInput.value = markerData.businessType || '';
            if (this.markerFinalStationNameInput) this.markerFinalStationNameInput.value = markerData.finalStationName || '';
            if (this.markerEqClassInput) this.markerEqClassInput.value = markerData.eqClass || '';
            if (this.markerEqTypeInput) this.markerEqTypeInput.value = markerData.eqType || '';
            if (this.markerInstallDateInput) this.markerInstallDateInput.value = this.formatToShortDate(markerData.installDate);
            if (this.markerOpenDateInput) this.markerOpenDateInput.value = this.formatToShortDate(markerData.openDate);

            // 상세 정보 테이블 값 세팅 (로컬 캐시 기준 1행 기본 렌더링)
            const tbody = document.getElementById('detailed-info-table-body');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td>${markerData.facilityYear || ''}</td>
                        <td>${markerData.projectCode || ''}</td>
                        <td>${markerData.facilityCode || ''}</td>
                        <td>${markerData.businessType || ''}</td>
                        <td>${markerData.finalStationName || ''}</td>
                        <td>${markerData.eqType || ''}</td>
                        <td>${this.formatToShortDate(markerData.installDate)}</td>
                        <td>${this.formatToShortDate(markerData.openDate)}</td>
                    </tr>
                `;
            }

            // Supabase DB 실시간 최신 정보 조회 시도
            if (!markerData.isPending && this.supabase) {
                this.fetchAndBindDetailedInfo(markerData.name, markerData.facilityCode);
            }
        } else {
            this.markerNameLabel.textContent = '통합시설명칭(ERP)';
            this.modalSubTitle.textContent = '축전지 적재 위치 마커 상세';
            this.modalSubIcon.className = 'fa-solid fa-battery-three-quarters';

            if (this.detailedInfoFormWrapper) this.detailedInfoFormWrapper.classList.add('hidden');
            if (this.detailedInfoTableWrapper) this.detailedInfoTableWrapper.classList.add('hidden');
            if (this.batteryInfoFormWrapper) this.batteryInfoFormWrapper.classList.add('hidden');
            if (this.batteryInfoTableWrapper) this.batteryInfoTableWrapper.classList.remove('hidden');

            if (this.markerCapacityInput) this.markerCapacityInput.value = markerData.capacity || '600';
            if (this.markerQuantityInput) this.markerQuantityInput.value = markerData.quantity || '12';
            if (this.markerStationInput) this.markerStationInput.value = markerData.stationName || markerData.name || '';

            // 축전지 상세 정보 테이블 값 세팅 (로컬 items)
            const tbody = document.getElementById('battery-info-table-body');
            if (tbody) {
                tbody.innerHTML = '';
                const specs = markerData.items && markerData.items.length > 0 ? markerData.items : [{
                    erpName: markerData.memo || "",
                    address: markerData.address || "",
                    capacity: markerData.capacity || 600,
                    quantity: markerData.quantity || 12,
                    stationName: markerData.stationName || markerData.name,
                    createdAt: markerData.createdAt || ""
                }];
                specs.forEach(s => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${s.erpName || ''}</td>
                        <td>${s.address || ''}</td>
                        <td>${s.capacity || ''} AH</td>
                        <td>${s.quantity || ''} Cell</td>
                        <td>${s.stationName || ''}</td>
                        <td>${s.createdAt || ''}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            // Supabase DB 실시간 최신 정보 조회 시도
            if (!markerData.isPending && this.supabase) {
                this.fetchAndBindBatterySpecs(markerData.id);
            }
        }
        
        this.markerModal.classList.remove('hidden');
        this.cancelModalBtn.focus();
    }

    // 마커 수정 모달 열기
    openEditMarkerModal(id) {
        const markerData = this.markersData.find(m => m.id === id);
        if (!markerData) return;
        
        this.currentEditingId = id;
        this.modalTitle.textContent = '마커 정보 수정';
        
        this.markerNameInput.value = markerData.name;
        // [정밀도 최우선] 저장되어 있던 원본 위경도 그대로 대입
        this.markerLatInput.value = markerData.lat;
        this.markerLngInput.value = markerData.lng;
        this.markerMemoInput.value = markerData.memo || '';
        this.markerTagsInput.value = (markerData.tags || []).join(', ');
 
        // 주소 표시 (역지오코딩)
        const modalAddrEl = document.getElementById('marker-address');
        if (modalAddrEl) {
            modalAddrEl.innerHTML = '주소 조회 중...';
            this.resolveAddress(markerData.lat, markerData.lng, (addrObj) => {
                let html = '';
                if (addrObj.jibunAddress) {
                    html += `<div>${this.formatJibunAddress(addrObj.jibunAddress)}</div>`;
                }
                if (addrObj.roadAddress) {
                    html += `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">(도로명) ${addrObj.roadAddress}</div>`;
                }
                if (!addrObj.roadAddress && !addrObj.jibunAddress) {
                    html = '주소를 확인할 수 없음';
                }
                modalAddrEl.innerHTML = html;
            });
        }
        
        // 저장된 색상으로 칩 동기화 (수정 모드)
        this.selectColorChip(markerData.color || '#10b981');
 
        // 폼 잠금 해제 및 저장 버튼 노출 설정
        this.toggleModalReadOnly(false);
        this.clearCellSelection(); // 편집 진입 시 기존 셀 선택 하이라이트 리셋
        this.saveMarkerBtn.classList.remove('hidden');
        this.cancelModalBtn.textContent = '취소';
 
        // 대기 상태(isPending)가 아닐 때만 삭제 버튼 노출
        if (markerData.isPending) {
            this.deleteMarkerModalBtn.classList.add('hidden');
        } else {
            this.deleteMarkerModalBtn.classList.remove('hidden');
        }
 
        if (this.currentMode === 'equipment') {
            this.markerNameLabel.textContent = '장소 이름';
            this.modalSubTitle.textContent = '일반 장비 위치 마커 수정';
            this.modalSubIcon.className = 'fa-solid fa-server';
 
            if (this.detailedInfoFormWrapper) this.detailedInfoFormWrapper.classList.add('hidden');
            if (this.detailedInfoTableWrapper) this.detailedInfoTableWrapper.classList.remove('hidden');
            if (this.batteryInfoFormWrapper) this.batteryInfoFormWrapper.classList.add('hidden');
            if (this.batteryInfoTableWrapper) this.batteryInfoTableWrapper.classList.add('hidden');
 
            // 상세 정보 폼 값 세팅
            if (this.markerFacilityCodeInput) this.markerFacilityCodeInput.value = markerData.facilityCode || '';
            if (this.markerProjectCodeInput) this.markerProjectCodeInput.value = markerData.projectCode || '';
            if (this.markerFacilityYearInput) this.markerFacilityYearInput.value = markerData.facilityYear || '';
            if (this.markerBusinessTypeInput) this.markerBusinessTypeInput.value = markerData.businessType || '';
            if (this.markerFinalStationNameInput) this.markerFinalStationNameInput.value = markerData.finalStationName || '';
            if (this.markerEqClassInput) this.markerEqClassInput.value = markerData.eqClass || '';
            if (this.markerEqTypeInput) this.markerEqTypeInput.value = markerData.eqType || '';
            if (this.markerInstallDateInput) this.markerInstallDateInput.value = this.formatToShortDate(markerData.installDate);
            if (this.markerOpenDateInput) this.markerOpenDateInput.value = this.formatToShortDate(markerData.openDate);
 
            // 상세 정보 테이블 값 세팅
            const tbody = document.getElementById('detailed-info-table-body');
            if (tbody) {
                tbody.innerHTML = `
                    <tr data-facility-code="${markerData.facilityCode || ''}">
                        <td><input type="text" class="table-input" data-key="facility_year" value="${markerData.facilityYear || ''}"></td>
                        <td><input type="text" class="table-input" data-key="project_code" value="${markerData.projectCode || ''}"></td>
                        <td><input type="text" class="table-input input-readonly" data-key="facility_code" value="${markerData.facilityCode || ''}" readonly></td>
                        <td><input type="text" class="table-input" data-key="business_type" value="${markerData.businessType || ''}"></td>
                        <td><input type="text" class="table-input" data-key="final_station_name" value="${markerData.finalStationName || ''}"></td>
                        <td><input type="text" class="table-input" data-key="eq_type" value="${markerData.eqType || ''}"></td>
                        <td><input type="text" class="table-input" data-key="install_date" value="${this.formatToShortDate(markerData.installDate)}"></td>
                        <td><input type="text" class="table-input" data-key="open_date" value="${this.formatToShortDate(markerData.openDate)}"></td>
                    </tr>
                `;
            }
 
            // Supabase DB 실시간 최신 정보 조회 시도
            if (!markerData.isPending && this.supabase) {
                this.fetchAndBindDetailedInfo(markerData.name, markerData.facilityCode);
            }
        } else {
            this.markerNameLabel.textContent = '통합시설명칭(ERP)';
            this.modalSubTitle.textContent = '축전지 적재 위치 마커 수정';
            this.modalSubIcon.className = 'fa-solid fa-battery-three-quarters';
 
            if (this.detailedInfoFormWrapper) this.detailedInfoFormWrapper.classList.add('hidden');
            if (this.detailedInfoTableWrapper) this.detailedInfoTableWrapper.classList.add('hidden');
            if (this.batteryInfoFormWrapper) this.batteryInfoFormWrapper.classList.add('hidden');
            if (this.batteryInfoTableWrapper) this.batteryInfoTableWrapper.classList.remove('hidden');
 
            if (this.markerCapacityInput) this.markerCapacityInput.value = markerData.capacity || '600';
            if (this.markerQuantityInput) this.markerQuantityInput.value = markerData.quantity || '12';
            if (this.markerStationInput) this.markerStationInput.value = markerData.stationName || markerData.name || '';
 
            // 축전지 상세 정보 테이블 값 세팅 (로컬 items, 수정 가능)
            const tbody = document.getElementById('battery-info-table-body');
            if (tbody) {
                tbody.innerHTML = '';
                const specs = markerData.items && markerData.items.length > 0 ? markerData.items : [{
                    id: '',
                    erpName: markerData.memo || "",
                    address: markerData.address || "",
                    capacity: markerData.capacity || 600,
                    quantity: markerData.quantity || 12,
                    stationName: markerData.stationName || markerData.name,
                    createdAt: markerData.createdAt || ""
                }];
                specs.forEach(s => {
                    const tr = document.createElement('tr');
                    tr.setAttribute('data-id', s.id || '');
                    tr.innerHTML = `
                        <td><input type="text" class="table-input" data-key="erp_name" value="${s.erpName || ''}"></td>
                        <td><input type="text" class="table-input" data-key="address" value="${s.address || markerData.address || ''}"></td>
                        <td><input type="text" class="table-input" data-key="capacity" value="${s.capacity || ''}"></td>
                        <td><input type="text" class="table-input" data-key="quantity" value="${s.quantity || ''}"></td>
                        <td><input type="text" class="table-input" data-key="station_name" value="${s.stationName || ''}"></td>
                        <td><span style="font-size: 11px; color: var(--text-muted);">${s.createdAt || ''}</span></td>
                    `;
                    tbody.appendChild(tr);
                });
            }
 
            // Supabase DB 실시간 최신 정보 조회 시도
            if (!markerData.isPending && this.supabase) {
                this.fetchAndBindBatterySpecs(markerData.id);
            }
        }
        
        this.markerModal.classList.remove('hidden');
        this.markerNameInput.focus();
    }
 
    closeModal() {
        this.markerModal.classList.add('hidden');
        this.clearTempMarker();
    }

    // 상세 정보 테이블 클립보드 복사 (TSV 포맷, 엑셀 바로 적용 가능)
    handleCopyDetailedTable() {
        const tbody = document.getElementById('detailed-info-table-body');
        if (!tbody) return;
        
        const rows = Array.from(tbody.querySelectorAll('tr'));
        if (rows.length === 0) {
            this.showToast('복사할 상세 정보가 없습니다.');
            return;
        }

        // 엑셀 헤더 정의 (이미지 레이아웃 기준)
        const headers = ["시설연도", "프로젝트코드", "통합시설코드", "사업구분", "국소명-최종", "장비타입", "시설일", "개통일"];
        const tsvRows = [headers.join('\t')];

        // 각 행의 데이터 수집
        rows.forEach(tr => {
            const tds = Array.from(tr.querySelectorAll('td')).map(td => this.getCellValue(td));
            tsvRows.push(tds.join('\t'));
        });

        const tsvText = tsvRows.join('\n');

        navigator.clipboard.writeText(tsvText)
            .then(() => {
                this.showToast(`상세 정보가 표 형식(총 ${rows.length}건)으로 클립보드에 복사되었습니다! (Excel 붙여넣기 가능)`);
            })
            .catch(err => {
                console.error('클립보드 복사 실패:', err);
                this.showToast('복사에 실패했습니다. 직접 드래그하여 복사해 주세요.');
            });
    }

    // 마커 추가/수정 로직
    async handleSaveMarker() {
        if (this.isSavingMarker) return;
        this.isSavingMarker = true;

        if (this.saveMarkerBtn) {
            this.saveMarkerBtn.disabled = true;
            this.saveMarkerBtn.textContent = '저장 중...';
        }

        try {
            const name = this.markerNameInput.value.trim();
            const lat = parseFloat(this.markerLatInput.value);
            const lng = parseFloat(this.markerLngInput.value);
            const memo = this.markerMemoInput.value.trim();
            const tagsRaw = this.markerTagsInput.value.trim();
            
            if (!name) {
                this.showToast('장소 이름을 입력해주세요.');
                this.markerNameInput.focus();
                return;
            }

            // 태그 파싱
            const tags = tagsRaw 
                ? tagsRaw.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
                : [];

            // 상세 정보 테이블에서 여러 개의 행 데이터 수집 시도 (장비 모드용)
            const tbody = document.getElementById('detailed-info-table-body');
            const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
            let infoListToUpsert = [];
            
            // 폼 입력창에서 단일 필드 취득 (장비 모드용)
            const facilityCode = this.markerFacilityCodeInput ? this.markerFacilityCodeInput.value.trim() : "";
            const projectCode = this.markerProjectCodeInput ? this.markerProjectCodeInput.value.trim() : "";
            const facilityYear = this.markerFacilityYearInput ? this.markerFacilityYearInput.value.trim() : "";
            const businessType = this.markerBusinessTypeInput ? this.markerBusinessTypeInput.value.trim() : "";
            const finalStationName = this.markerFinalStationNameInput ? this.markerFinalStationNameInput.value.trim() : "";
            const eqClass = this.markerEqClassInput ? this.markerEqClassInput.value.trim() : "";
            const eqType = this.markerEqTypeInput ? this.markerEqTypeInput.value.trim() : "";
            const installDate = this.markerInstallDateInput ? this.markerInstallDateInput.value.trim() : "";
            const openDate = this.markerOpenDateInput ? this.markerOpenDateInput.value.trim() : "";

            const isTableMode = this.detailedInfoTableWrapper && !this.detailedInfoTableWrapper.classList.contains('hidden') && rows.length > 0;

            if (this.currentMode === 'equipment') {
                if (isTableMode) {
                    // 테이블 모드이고 행이 존재하는 경우: 각 행의 input 값 수집
                    rows.forEach(tr => {
                        const inputs = tr.querySelectorAll('.table-input');
                        const rowData = {};
                        inputs.forEach(input => {
                            const key = input.getAttribute('data-key');
                            if (key) {
                                rowData[key] = input.value.trim();
                            }
                        });
                        
                        const fCode = rowData.facility_code || tr.getAttribute('data-facility-code') || "";
                        if (fCode) {
                            infoListToUpsert.push({
                                facility_code: fCode,
                                place_name: name, // 마커 이름으로 장소명 동기화
                                facility_year: rowData.facility_year || "",
                                project_code: rowData.project_code || "",
                                business_type: rowData.business_type || "",
                                eq_class: eqClass || "", // 테이블에 분류 열은 없으므로 기존 값 유지
                                eq_type: rowData.eq_type || "",
                                final_station_name: rowData.final_station_name || "",
                                install_date: DataManager.formatDateToYmd(rowData.install_date || ""),
                                open_date: DataManager.formatDateToYmd(rowData.open_date || "")
                            });
                        }
                    });
                } else {
                    // 폼 모드이거나 테이블 행이 없는 경우: 폼에 작성된 단일 건 수집
                    if (facilityCode) {
                        infoListToUpsert.push({
                            facility_code: facilityCode,
                            place_name: name,
                            facility_year: facilityYear,
                            project_code: projectCode,
                            business_type: businessType,
                            eq_class: eqClass,
                            eq_type: eqType,
                            final_station_name: finalStationName,
                            install_date: DataManager.formatDateToYmd(installDate),
                            open_date: DataManager.formatDateToYmd(openDate)
                        });
                    }
                }

                // 통합시설코드 중복 검증 (단일 폼 모드인 경우에만 체크, 테이블 모드일 때는 PK 수정이 불가하므로 제외)
                const primaryFacilityCode = infoListToUpsert.length > 0 ? infoListToUpsert[0].facility_code : (facilityCode || null);
                if (primaryFacilityCode && !isTableMode) {
                    const isDuplicate = this.markersData.some(m => m.facilityCode === primaryFacilityCode && m.id !== this.currentEditingId);
                    if (isDuplicate) {
                        this.showToast('이미 등록된 통합시설코드입니다. 중복은 허용되지 않습니다.', 5000);
                        if (this.markerFacilityCodeInput) this.markerFacilityCodeInput.focus();
                        return;
                    }
                }
            }

            // 축전지 모드용 상세 정보 테이블/폼 수집
            const batteryTbody = document.getElementById('battery-info-table-body');
            const batteryRows = batteryTbody ? Array.from(batteryTbody.querySelectorAll('tr')) : [];
            let batterySpecsToUpsert = [];

            if (this.currentMode === 'battery') {
                const isBatteryTableMode = this.batteryInfoTableWrapper && !this.batteryInfoTableWrapper.classList.contains('hidden') && batteryRows.length > 0;
                
                if (isBatteryTableMode) {
                    batteryRows.forEach(tr => {
                        const inputs = tr.querySelectorAll('.table-input');
                        const rowData = {};
                        inputs.forEach(input => {
                            const key = input.getAttribute('data-key');
                            if (key) {
                                rowData[key] = input.value.trim();
                            }
                        });
                        
                        const specId = tr.getAttribute('data-id') || null;
                        batterySpecsToUpsert.push({
                            id: specId ? parseInt(specId, 10) : undefined,
                            marker_id: this.currentEditingId || undefined,
                            erp_name: rowData.erp_name || "",
                            capacity: parseInt(rowData.capacity, 10) || 600,
                            quantity: parseInt(rowData.quantity, 10) || 12,
                            station_name: rowData.station_name || name,
                            address: rowData.address || ""
                        });
                    });
                } else {
                    const capVal = parseInt(this.markerCapacityInput.value, 10) || 600;
                    const qtyVal = parseInt(this.markerQuantityInput.value, 10) || 12;
                    const stationVal = this.markerStationInput.value.trim() || name;
                    
                    batterySpecsToUpsert.push({
                        capacity: capVal,
                        quantity: qtyVal,
                        station_name: stationVal,
                        erp_name: memo || "",
                        address: ""
                    });
                }
            }
                
            if (this.currentEditingId) {
                // 수정 모드
                const index = this.markersData.findIndex(m => m.id === this.currentEditingId);
                if (index !== -1) {
                    const isTempMarker = this.markersData[index].isTemp;
                    
                    if (this.currentMode === 'equipment') {
                        const repInfo = infoListToUpsert[0] || {};
                        const updatedItem = {
                            ...this.markersData[index],
                            name,
                            memo,
                            tags,
                            color: isTempMarker ? '#ef4444' : (this.selectedColor || '#10b981'),
                            facilityCode: repInfo.facility_code || facilityCode || "",
                            projectCode: repInfo.project_code || projectCode || "",
                            facilityYear: repInfo.facility_year || facilityYear || "",
                            businessType: repInfo.business_type || businessType || "",
                            finalStationName: repInfo.final_station_name || finalStationName || "",
                            eqClass: repInfo.eq_class || eqClass || "",
                            eqType: repInfo.eq_type || eqType || "",
                            installDate: repInfo.install_date || installDate || "",
                            openDate: repInfo.open_date || openDate || ""
                        };

                        // 주소 정보가 유실된 구데이터인 경우 실시간 1회 조회
                        if (!updatedItem.roadAddress && !updatedItem.jibunAddress) {
                            const addrObj = await this.resolveAddressPromise(updatedItem.lat, updatedItem.lng);
                            updatedItem.roadAddress = addrObj.roadAddress;
                            updatedItem.jibunAddress = addrObj.jibunAddress;
                        }

                        // 대기 마커(isPending = true) 및 임시 마커(isTemp = true)가 아닐 때만 Supabase 데이터 업데이트를 진행함
                        if (this.supabase && !updatedItem.isPending && !updatedItem.isTemp) {
                            try {
                                // 1. markers 테이블 업데이트
                                const { error } = await this.supabase
                                    .from('markers')
                                    .update({
                                        name: updatedItem.name,
                                        memo: updatedItem.memo,
                                        tags: updatedItem.tags,
                                        color: updatedItem.color || '#10b981',
                                        facility_code: updatedItem.facilityCode || null,
                                        road_address: updatedItem.roadAddress || "",
                                        jibun_address: updatedItem.jibunAddress || ""
                                    })
                                    .eq('id', this.currentEditingId);
                                
                                if (error) throw error;

                                // 2. information 테이블 upsert (통합시설코드가 있는 모든 행)
                                if (infoListToUpsert.length > 0) {
                                    const { error: infoErr } = await this.supabase
                                        .from('information')
                                        .upsert(infoListToUpsert, { onConflict: 'facility_code' });
                                    if (infoErr) throw infoErr;
                                }
                            } catch (e) {
                                this.showToast('Supabase 데이터 수정 실패: ' + e.message, 5000);
                                return;
                            }
                        }

                        // 수정 시 기존 정보 중 위도, 경도 좌표는 변경 없이 보존
                        this.markersData[index] = updatedItem;
                        this.showToast(isTempMarker ? '임시 마커 정보가 수정되었습니다.' : '마커 정보가 수정되었습니다.');
                    } else {
                        // 축전지 모드 마커 수정
                        const updatedItem = {
                            ...this.markersData[index],
                            name,
                            memo,
                            tags,
                            color: isTempMarker ? '#ef4444' : (this.selectedColor || '#10b981'),
                            items: batterySpecsToUpsert.map(s => ({
                                id: s.id,
                                erpName: s.erp_name,
                                address: s.address,
                                capacity: s.capacity,
                                quantity: s.quantity,
                                stationName: s.station_name,
                                createdAt: s.createdAt || new Date().toISOString().split('T')[0]
                            })),
                            capacity: batterySpecsToUpsert[0] ? batterySpecsToUpsert[0].capacity : 600,
                            quantity: batterySpecsToUpsert[0] ? batterySpecsToUpsert[0].quantity : 12,
                            stationName: batterySpecsToUpsert[0] ? batterySpecsToUpsert[0].station_name : name
                        };

                        if (!updatedItem.address) {
                            const addrObj = await this.resolveAddressPromise(updatedItem.lat, updatedItem.lng);
                            updatedItem.address = addrObj.jibunAddress || addrObj.roadAddress || "";
                        }

                        if (this.supabase && !updatedItem.isPending && !updatedItem.isTemp) {
                            try {
                                // 1. battery_markers 업데이트
                                const { error: markerErr } = await this.supabase
                                    .from('battery_markers')
                                    .update({
                                        name: updatedItem.name,
                                        memo: updatedItem.memo,
                                        tags: updatedItem.tags,
                                        color: updatedItem.color || '#10b981',
                                        address: updatedItem.address || ""
                                    })
                                    .eq('id', this.currentEditingId);
                                
                                if (markerErr) throw markerErr;

                                // 2. battery_specs 1:N 갱신 (지우고 다시 추가)
                                const { error: deleteErr } = await this.supabase
                                    .from('battery_specs')
                                    .delete()
                                    .eq('marker_id', this.currentEditingId);
                                if (deleteErr) throw deleteErr;

                                const specsToInsert = batterySpecsToUpsert.map(s => ({
                                    marker_id: this.currentEditingId,
                                    erp_name: s.erp_name,
                                    capacity: s.capacity,
                                    quantity: s.quantity,
                                    station_name: s.station_name,
                                    address: s.address || updatedItem.address || ""
                                }));
                                const { error: specErr } = await this.supabase
                                    .from('battery_specs')
                                    .insert(specsToInsert);
                                if (specErr) throw specErr;
                            } catch (e) {
                                this.showToast('Supabase 데이터 수정 실패: ' + e.message, 5000);
                                return;
                            }
                        }

                        this.markersData[index] = updatedItem;
                        this.showToast(isTempMarker ? '임시 축전지 정보가 수정되었습니다.' : '축전지 정보가 수정되었습니다.');
                    }
                }
            } else {
                // 신규 추가 모드
                const isTemp = this.markerIsTemp && this.markerIsTemp.checked;
                
                if (this.currentMode === 'equipment') {
                    const repInfo = infoListToUpsert[0] || {};
                    // 신규 추가 시 역지오코딩 조회 실행
                    const addrObj = await this.resolveAddressPromise(lat, lng);
                    
                    const newMarker = {
                        id: 'marker_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                        name,
                        lat, // 정밀한 Float 값 보존
                        lng, // 정밀한 Float 값 보존
                        memo,
                        tags,
                        color: isTemp ? '#ef4444' : (this.selectedColor || '#10b981'),
                        roadAddress: addrObj.roadAddress || "",
                        jibunAddress: addrObj.jibunAddress || "",
                        facilityCode: repInfo.facility_code || facilityCode || "",
                        projectCode: repInfo.project_code || projectCode || "",
                        facilityYear: repInfo.facility_year || facilityYear || "",
                        businessType: repInfo.business_type || businessType || "",
                        finalStationName: repInfo.final_station_name || finalStationName || "",
                        eqClass: repInfo.eq_class || eqClass || "",
                        eqType: repInfo.eq_type || eqType || "",
                        installDate: repInfo.install_date || installDate || "",
                        openDate: repInfo.open_date || openDate || "",
                        createdAt: new Date().toISOString().split('T')[0]
                    };

                    if (isTemp) {
                        newMarker.isTemp = true;
                    }

                    if (this.supabase && !isTemp) {
                        try {
                            // 1. markers 테이블 insert
                            const { error } = await this.supabase
                                .from('markers')
                                .insert({
                                    id: newMarker.id,
                                    name: newMarker.name,
                                    lat: newMarker.lat,
                                    lng: newMarker.lng,
                                    memo: newMarker.memo,
                                    tags: newMarker.tags,
                                    color: newMarker.color || '#10b981',
                                    facility_code: newMarker.facilityCode || null,
                                    road_address: newMarker.roadAddress || "",
                                    jibun_address: newMarker.jibunAddress || "",
                                    created_at: new Date().toISOString()
                                });
                            
                            if (error) throw error;

                            // 2. information 테이블 upsert (통합시설코드가 있는 모든 행)
                            if (infoListToUpsert.length > 0) {
                                const { error: infoErr } = await this.supabase
                                    .from('information')
                                    .upsert(infoListToUpsert, { onConflict: 'facility_code' });
                                if (infoErr) throw infoErr;
                            }
                        } catch (e) {
                            this.showToast('Supabase 데이터 추가 실패: ' + e.message, 5000);
                            return;
                        }
                    }

                    this.markersData.push(newMarker);
                    this.showToast(isTemp ? '임시 마커가 성공적으로 등록되었습니다.' : '새 마커가 성공적으로 등록되었습니다.');
                } else {
                    // 축전지 모드 신규 추가
                    const addrObj = await this.resolveAddressPromise(lat, lng);
                    const finalAddr = addrObj.jibunAddress || addrObj.roadAddress || "";

                    const newMarker = {
                        id: 'marker_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                        name,
                        lat,
                        lng,
                        memo,
                        tags,
                        color: isTemp ? '#ef4444' : (this.selectedColor || '#10b981'),
                        address: finalAddr,
                        items: batterySpecsToUpsert.map(s => ({
                            erpName: s.erp_name,
                            address: s.address || finalAddr,
                            capacity: s.capacity,
                            quantity: s.quantity,
                            stationName: s.station_name,
                            createdAt: new Date().toISOString().split('T')[0]
                        })),
                        capacity: batterySpecsToUpsert[0] ? batterySpecsToUpsert[0].capacity : 600,
                        quantity: batterySpecsToUpsert[0] ? batterySpecsToUpsert[0].quantity : 12,
                        stationName: batterySpecsToUpsert[0] ? batterySpecsToUpsert[0].station_name : name,
                        createdAt: new Date().toISOString().split('T')[0]
                    };

                    if (isTemp) {
                        newMarker.isTemp = true;
                    }

                    if (this.supabase && !isTemp) {
                        try {
                            // 1. battery_markers 추가
                            const { error: markerErr } = await this.supabase
                                .from('battery_markers')
                                .insert({
                                    id: newMarker.id,
                                    name: newMarker.name,
                                    lat: newMarker.lat,
                                    lng: newMarker.lng,
                                    address: newMarker.address || "",
                                    memo: newMarker.memo || "",
                                    tags: newMarker.tags || [],
                                    color: newMarker.color || '#10b981',
                                    created_at: new Date().toISOString()
                                });
                            if (markerErr) throw markerErr;

                            // 2. battery_specs 추가
                            const specsToInsert = batterySpecsToUpsert.map(s => ({
                                marker_id: newMarker.id,
                                erp_name: s.erp_name,
                                capacity: s.capacity,
                                quantity: s.quantity,
                                station_name: s.station_name,
                                address: s.address || newMarker.address || "",
                                created_at: new Date().toISOString()
                            }));
                            const { error: specErr } = await this.supabase
                                .from('battery_specs')
                                .insert(specsToInsert);
                            if (specErr) throw specErr;
                        } catch (e) {
                            this.showToast('Supabase 데이터 추가 실패: ' + e.message, 5000);
                            return;
                        }
                    }

                    this.markersData.push(newMarker);
                    this.showToast(isTemp ? '임시 축전지 마커가 성공적으로 등록되었습니다.' : '새 축전지 마커가 성공적으로 등록되었습니다.');
                }
            }
            
            // 로컬 저장소 동기화
            this.syncLocalStorage();
            
            // 필터 초기화 및 리렌더링
            this.initFilters(false);
            
            // 지도 및 사이드바 목록 리렌더링
            this.renderMarkersOnMap();
            this.renderMarkersList();
            
            this.closeModal();
        } finally {
            this.isSavingMarker = false;
            if (this.saveMarkerBtn) {
                this.saveMarkerBtn.disabled = false;
                this.saveMarkerBtn.textContent = '저장';
            }
        }
    }

    // 마커 삭제 로직
    async handleDeleteMarker(id) {
        if (this.isDeletingMarker) return;
        if (!confirm('이 마커를 삭제하시겠습니까?')) return;
        
        this.isDeletingMarker = true;
        try {
            const marker = this.markersData.find(m => m.id === id);
            const isTemp = marker ? marker.isTemp : false;

            if (this.supabase && !isTemp) {
                try {
                    const table = this.currentMode === 'equipment' ? 'markers' : 'battery_markers';
                    const { error } = await this.supabase
                        .from(table)
                        .delete()
                        .eq('id', id);
                    
                    if (error) throw error;
                } catch (e) {
                    this.showToast('Supabase 데이터 삭제 실패: ' + e.message, 5000);
                    return;
                }
            }

            // 메모리 데이터에서 삭제
            this.markersData = this.markersData.filter(m => m.id !== id);
            this.syncLocalStorage();
            
            // 지도 객체 해제
            this.removeMarkerFromMap(id);
            
            // 필터 초기화
            this.initFilters(false);
            
            this.renderMarkersList();
            this.closeModal();
            this.showToast(isTemp ? '임시 마커가 삭제되었습니다.' : '마커가 삭제되었습니다.');
        } finally {
            this.isDeletingMarker = false;
        }
    }

    removeMarkerFromMap(id) {
        if (this.mapMarkers.has(id)) {
            const marker = this.mapMarkers.get(id);
            // 메모리 누수 방지를 위한 마커 이벤트 리스너의 명시적 해제
            if (marker._clickHandler) {
                kakao.maps.event.removeListener(marker, 'click', marker._clickHandler);
            }
            if (marker._dragstartHandler) {
                kakao.maps.event.removeListener(marker, 'dragstart', marker._dragstartHandler);
            }
            if (marker._dragendHandler) {
                kakao.maps.event.removeListener(marker, 'dragend', marker._dragendHandler);
            }
            if (this.clusterer) {
                this.clusterer.removeMarker(marker);
            }
            marker.setMap(null);
            this.mapMarkers.delete(id);
        }
        if (this.customOverlays.has(id)) {
            this.customOverlays.get(id).setMap(null);
            this.customOverlays.delete(id);
        }
    }

    syncLocalStorage() {
        const permanentMarkers = this.markersData.filter(m => !m.isPending && !m.isTemp);
        if (this.currentMode === 'equipment') {
            this.eqMarkersData = [...this.markersData];
            localStorage.setItem('saved_markers', JSON.stringify(permanentMarkers));
        } else {
            this.batteryMarkersData = [...this.markersData];
            localStorage.setItem('saved_battery_markers', JSON.stringify(permanentMarkers));
        }
    }

    // 지도 상에 저장된 모든 마커 렌더링
    renderMarkersOnMap() {
        if (!this.map) return;
        
        // 기존 마커 전체 클리어 (메모리 누수 방지를 위해 이벤트 리스너 제거 처리 연동)
        this.mapMarkers.forEach((marker, id) => {
            if (marker._clickHandler) {
                kakao.maps.event.removeListener(marker, 'click', marker._clickHandler);
            }
            if (marker._dragstartHandler) {
                kakao.maps.event.removeListener(marker, 'dragstart', marker._dragstartHandler);
            }
            if (marker._dragendHandler) {
                kakao.maps.event.removeListener(marker, 'dragend', marker._dragendHandler);
            }
            marker.setMap(null);
        });
        this.mapMarkers.clear();
        this.customOverlays.forEach((overlay, id) => overlay.setMap(null));
        this.customOverlays.clear();
        
        if (this.clusterer) {
            this.clusterer.clear();
        }
        
        const markersToCluster = [];
        
        // 현재 데이터셋 순회하며 마커 생성
        this.markersData.forEach(data => {
            // 필터링 적용 (대기 마커 및 임시 마커가 아닌 경우에만 연도 & 사업구분 & 색상 & 태그 필터 검사)
            if (!data.isPending && !data.isTemp) {
                const color = data.color ? data.color.toLowerCase().trim() : "#10b981";

                let hasMatchingTag = false;
                if (data.tags && data.tags.length > 0) {
                    hasMatchingTag = data.tags.some(tag => this.selectedTags.has(tag.toString().trim()));
                } else {
                    hasMatchingTag = this.selectedTags.has("미지정");
                }

                if (!this.selectedColors.has(color) || !hasMatchingTag) {
                    return;
                }

                if (this.currentMode === 'equipment') {
                    const year = data.facilityYear ? data.facilityYear.toString().trim() : "미지정";
                    const business = data.businessType ? data.businessType.toString().trim() : "미지정";
                    if (!this.selectedYears.has(year) || !this.selectedBusinesses.has(business)) {
                        return;
                    }
                } else {
                    // 축전지 모드 필터링
                    const specs = data.items && data.items.length > 0 ? data.items : [{
                        capacity: data.capacity,
                        quantity: data.quantity,
                        stationName: data.stationName || data.name
                    }];
                    const hasMatchingSpec = specs.some(spec => {
                        const cap = spec.capacity ? spec.capacity.toString().trim() + " AH" : "미지정";
                        const qty = spec.quantity ? spec.quantity.toString().trim() + " Cell" : "미지정";
                        const stName = spec.stationName ? spec.stationName.toString().trim() : "미지정";
                        
                        return this.selectedCapacities.has(cap) && this.selectedQuantities.has(qty) && this.selectedStations.has(stName);
                    });
                    if (!hasMatchingSpec) {
                        return;
                    }
                }
            }

            const position = new kakao.maps.LatLng(data.lat, data.lng);
            
            // 1. 마커 객체 생성 (대기 상태 마커인 경우 골드, 일반 마커인 경우 저장된 개별 색상의 커스텀 SVG 적용)
            const markerSvgUri = data.isPending
                ? MARKER_SVG_GOLD
                : getMarkerSvg(data.color || '#10b981');
            const markerImage = new kakao.maps.MarkerImage(markerSvgUri, new kakao.maps.Size(30, 45), { offset: new kakao.maps.Point(15, 45) });

            const isMovingThis = this.currentMovingMarkerId === data.id;
            const isPendingThis = data.isPending;
            const marker = new kakao.maps.Marker({
                position: position,
                title: data.name,
                image: markerImage,
                draggable: isMovingThis || isPendingThis, // 현재 위치 수정 중인 마커 및 대기 마커 드래그 가능
                zIndex: (isMovingThis || isPendingThis) ? 100 : 3 // 위치 수정 중 또는 대기 중일 때는 높은 zIndex 부여
            });
            
            this.mapMarkers.set(data.id, marker);
            
            if (isMovingThis || isPendingThis) {
                marker.setMap(this.map); // 위치 수정 중이거나 대기 마커는 클러스터에서 제외하고 직접 맵에 꽂아야 드래그가 정상 작동함
            } else {
                markersToCluster.push(marker);
            }
            
            // 2. 커스텀 오버레이 생성
            const overlayContent = this.createOverlayContent(data);
            const overlay = new kakao.maps.CustomOverlay({
                content: overlayContent,
                position: position,
                xAnchor: 0.5,
                yAnchor: 1.0,
                zIndex: 4
            });
            
            this.customOverlays.set(data.id, overlay);
            
            // 마커 클릭 시 커스텀 오버레이 토글 (이벤트 핸들러 메모리 참조 보관)
            const clickHandler = () => {
                this.closeAllOverlays();
                overlay.setMap(this.map);
                this.map.panTo(marker.getPosition());
            };
            marker._clickHandler = clickHandler;
            kakao.maps.event.addListener(marker, 'click', clickHandler);

            // 마커 드래그 완료 시 좌표 갱신 및 DB/메모리 동기화 처리
            if (isMovingThis || isPendingThis) {
                const dragstartHandler = () => {
                    this.map.setDraggable(false); // 드래그 시작 시 지도 이동 차단
                };
                const dragendHandler = () => {
                    this.map.setDraggable(true); // 드래그 종료 시 지도 이동 복원
                    this.handleMarkerDragEnd(data.id, marker.getPosition());
                };
                marker._dragstartHandler = dragstartHandler;
                marker._dragendHandler = dragendHandler;
                kakao.maps.event.addListener(marker, 'dragstart', dragstartHandler);
                kakao.maps.event.addListener(marker, 'dragend', dragendHandler);
            }
        });

        if (this.clusterer) {
            this.clusterer.addMarkers(markersToCluster);
        }
    }

    closeAllOverlays() {
        this.customOverlays.forEach(overlay => overlay.setMap(null));
    }

    // 마커 드래그 이동 종료 시 좌표 업데이트 및 Supabase 연동 처리
    async handleMarkerDragEnd(id, newPosition) {
        if (this.currentMovingMarkerId === id) {
            this.moveMarkerTemporarily(id, newPosition);
            return;
        }

        const markerData = this.markersData.find(m => m.id === id);
        if (!markerData) return;

        const newLat = newPosition.getLat();
        const newLng = newPosition.getLng();

        // 1. 메모리 데이터 좌표 갱신 (정밀도 유지)
        markerData.lat = newLat;
        markerData.lng = newLng;

        // 2. 커스텀 오버레이(말풍선) 위치 동기화 이동
        if (this.customOverlays.has(id)) {
            this.customOverlays.get(id).setPosition(newPosition);
        }

        // 3. 대기 상태가 아닌(저장된) 일반 마커인 경우 Supabase 실시간 업데이트 실행
        if (!markerData.isPending) {
            if (this.supabase) {
                try {
                    const table = this.currentMode === 'equipment' ? 'markers' : 'battery_markers';
                    const { error } = await this.supabase
                        .from(table)
                        .update({
                            lat: newLat,
                            lng: newLng
                        })
                        .eq('id', id);

                    if (error) throw error;
                } catch (e) {
                    this.showToast('Supabase 위치 업데이트 실패: ' + e.message, 5000);
                    return;
                }
            }
            // 로컬 스토리지 캐시 갱신
            this.syncLocalStorage();
            this.showToast(`'${markerData.name}' 위치가 수정되었습니다.`);
        } else {
            // 대기 마커인 경우
            const addrObj = await this.resolveAddressPromise(newLat, newLng);
            markerData.roadAddress = addrObj.roadAddress;
            markerData.jibunAddress = addrObj.jibunAddress;

            if (this.excelConfirmTableBody) {
                const tr = this.excelConfirmTableBody.querySelector(`tr[data-id="${id}"]`);
                if (tr) {
                    const latInput = tr.querySelector('input[data-key="lat"]');
                    const lngInput = tr.querySelector('input[data-key="lng"]');
                    const addressTd = tr.querySelector('td:nth-last-child(2)'); // 뒤에서 두번째 td (주소)
                    
                    if (latInput) latInput.value = newLat;
                    if (lngInput) lngInput.value = newLng;
                    if (addressTd) {
                        const showAddr = this.formatJibunAddress(addrObj.jibunAddress) || addrObj.roadAddress || '주소 없음';
                        addressTd.textContent = showAddr;
                        addressTd.setAttribute('title', showAddr);
                    }
                }
            }
            this.showToast(`대기 마커 '${markerData.name}'의 위치를 수정했습니다. (전송 시 반영)`);
        }
        
        if (this.clusterer) {
            this.clusterer.redraw();
        }
    }

    // 오버레이(말풍선) 내 주소 실시간 갱신
    updateOverlayAddress(id, lat, lng) {
        const overlay = this.customOverlays.get(id);
        if (!overlay) return;
        const container = overlay.getContent();
        if (!container) return;
        
        const addressDiv = container.querySelector('.overlay-address');
        if (addressDiv) {
            addressDiv.innerHTML = '<span class="road-addr">주소 조회 중...</span>';
            this.resolveAddress(lat, lng, (addrObj) => {
                let html = '';
                if (addrObj.jibunAddress) {
                    html += `<span class="road-addr">${this.formatJibunAddress(addrObj.jibunAddress)}</span>`;
                }
                if (addrObj.roadAddress) {
                    html += `<span class="jibun-addr" style="font-size: 13px; color: var(--text-muted); display: block; margin-top: 2px;">(도로명) ${addrObj.roadAddress}</span>`;
                }
                if (!addrObj.roadAddress && !addrObj.jibunAddress) {
                    html = '<span class="road-addr">주소를 확인할 수 없음</span>';
                }
                addressDiv.innerHTML = html;
            });
        }
    }

    // 마커 및 오버레이 임시 위치 이동 처리
    moveMarkerTemporarily(id, newPosition) {
        const markerData = this.markersData.find(m => m.id === id);
        if (!markerData) return;

        const newLat = newPosition.getLat();
        const newLng = newPosition.getLng();

        // 1. 메모리 좌표 임시 업데이트
        markerData.lat = newLat;
        markerData.lng = newLng;

        // 2. 지도 마커 위치 이동
        const marker = this.mapMarkers.get(id);
        if (marker) {
            marker.setPosition(newPosition);
        }

        // 3. 오버레이 위치 이동
        const overlay = this.customOverlays.get(id);
        if (overlay) {
            overlay.setPosition(newPosition);
        }

        // 4. 오버레이 주소 갱신
        this.updateOverlayAddress(id, newLat, newLng);

        // 5. 클러스터러 갱신
        if (this.clusterer) {
            this.clusterer.redraw();
        }
    }

    // 선택된 색상 칩 업데이트
    selectColorChip(colorHex) {
        this.selectedColor = colorHex || '#10b981';
        if (this.colorChips) {
            this.colorChips.forEach(chip => {
                if (chip.getAttribute('data-color') === this.selectedColor) {
                    chip.classList.add('selected');
                } else {
                    chip.classList.remove('selected');
                }
            });
        }
    }

    // 위치 변경 모드 진입
    enterMarkerPositionChangeMode(id) {
        // 이미 위치 수정 중인 마커가 있다면 취소 처리
        if (this.currentMovingMarkerId && this.currentMovingMarkerId !== id) {
            this.cancelMarkerPositionChange(this.currentMovingMarkerId);
        }

        const markerData = this.markersData.find(m => m.id === id);
        if (!markerData) return;

        const marker = this.mapMarkers.get(id);
        if (!marker) return;

        this.currentMovingMarkerId = id;
        this.originalMarkerPosition = new kakao.maps.LatLng(markerData.lat, markerData.lng);

        // 순간이동을 위한 지도 클릭 리스너 등록
        this.mapClickMoveListener = (mouseEvent) => {
            this.moveMarkerTemporarily(id, mouseEvent.latLng);
        };
        kakao.maps.event.addListener(this.map, 'click', this.mapClickMoveListener);

        // 마커 draggable 활성화를 위해 지도를 리렌더링하여 UI 업데이트
        this.renderMarkersOnMap();

        // 오버레이 다시 노출
        if (this.customOverlays.has(id)) {
            this.customOverlays.get(id).setMap(this.map);
        }

        this.showToast('위치 변경 모드가 활성화되었습니다. 지도를 클릭하거나 핀을 드래그하세요.');
    }

    // 위치 변경 저장
    async saveMarkerPosition(id) {
        if (this.isSavingPosition) return;
        this.isSavingPosition = true;

        try {
            // 리스너 해제
            if (this.mapClickMoveListener) {
                kakao.maps.event.removeListener(this.map, 'click', this.mapClickMoveListener);
                this.mapClickMoveListener = null;
            }

            // 지도 드래그 이동 원복
            if (this.map) {
                this.map.setDraggable(true);
            }

            const markerData = this.markersData.find(m => m.id === id);
            if (markerData) {
                const lat = markerData.lat;
                const lng = markerData.lng;
                
                // 바뀐 좌표에 맞게 도로명/지번 주소 실시간 1회 변환
                const addrObj = await this.resolveAddressPromise(lat, lng);
                if (this.currentMode === 'equipment') {
                    markerData.roadAddress = addrObj.roadAddress;
                    markerData.jibunAddress = addrObj.jibunAddress;
                } else {
                    markerData.address = addrObj.jibunAddress || addrObj.roadAddress || "";
                }

                if (!markerData.isPending && !markerData.isTemp && this.supabase) {
                    try {
                        const table = this.currentMode === 'equipment' ? 'markers' : 'battery_markers';
                        const updateObj = this.currentMode === 'equipment' ? {
                            lat, 
                            lng,
                            road_address: addrObj.roadAddress || "",
                            jibun_address: addrObj.jibunAddress || ""
                        } : {
                            lat,
                            lng,
                            address: addrObj.jibunAddress || addrObj.roadAddress || ""
                        };
                        
                        const { error } = await this.supabase
                            .from(table)
                            .update(updateObj)
                            .eq('id', id);

                        if (error) throw error;
                    } catch (e) {
                        this.showToast('Supabase 위치 저장 실패: ' + e.message, 5000);
                        // 에러 시 롤백
                        this.cancelMarkerPositionChange(id);
                        return;
                    }
                }

                this.syncLocalStorage();
                this.showToast(markerData.isTemp ? `'${markerData.name}' 임시 위치가 변경되었습니다.` : `'${markerData.name}' 위치가 성공적으로 저장되었습니다.`);
            }

            this.currentMovingMarkerId = null;
            this.originalMarkerPosition = null;

            // UI 모드 해제를 위한 리렌더링
            this.renderMarkersOnMap();

            // 오버레이 복원 노출
            if (this.customOverlays.has(id)) {
                this.customOverlays.get(id).setMap(this.map);
            }
        } finally {
            this.isSavingPosition = false;
        }
    }

    // 위치 변경 취소
    cancelMarkerPositionChange(id) {
        // 리스너 해제
        if (this.mapClickMoveListener) {
            kakao.maps.event.removeListener(this.map, 'click', this.mapClickMoveListener);
            this.mapClickMoveListener = null;
        }

        // 지도 드래그 이동 원복
        if (this.map) {
            this.map.setDraggable(true);
        }

        const markerData = this.markersData.find(m => m.id === id);
        if (markerData && this.originalMarkerPosition) {
            // 좌표 원복
            markerData.lat = this.originalMarkerPosition.getLat();
            markerData.lng = this.originalMarkerPosition.getLng();
        }

        this.currentMovingMarkerId = null;
        this.originalMarkerPosition = null;

        // UI 원복을 위한 리렌더링
        this.renderMarkersOnMap();

        // 오버레이 복원 노출
        if (this.customOverlays.has(id)) {
            this.customOverlays.get(id).setMap(this.map);
        }

        this.showToast('위치 변경이 취소되었습니다.');
    }

    // 카카오 Geocoder를 통한 역지오코딩 주소 조회 (Promise 래퍼)
    resolveAddressPromise(lat, lng) {
        return new Promise((resolve) => {
            this.resolveAddress(lat, lng, (addrObj) => {
                resolve(addrObj);
            });
        });
    }

    // 지번 주소 포맷터 (숫자로 끝날 시 맨 뒤에 '번지' 추가)
    formatJibunAddress(addr) {
        if (!addr) return '';
        const trimmed = addr.trim();
        if (trimmed.endsWith('번지')) return trimmed;
        if (/\d$/.test(trimmed)) {
            return trimmed + '번지';
        }
        return trimmed;
    }

    // 카카오 Geocoder를 통한 역지오코딩 주소 조회
    resolveAddress(lat, lng, callback) {
        if (!window.kakao || !kakao.maps || !kakao.maps.services) return;
        const geocoder = new kakao.maps.services.Geocoder();
        const coord = new kakao.maps.LatLng(lat, lng);
        geocoder.coord2Address(coord.getLng(), coord.getLat(), (result, status) => {
            if (status === kakao.maps.services.Status.OK && result.length > 0) {
                const roadAddress = result[0].road_address ? result[0].road_address.address_name : '';
                const jibunAddress = result[0].address ? result[0].address.address_name : '';
                callback({ roadAddress, jibunAddress });
            } else {
                callback({ roadAddress: '', jibunAddress: '' });
            }
        });
    }

    // 세련된 형태의 HTML 커스텀 오버레이 빌딩
    createOverlayContent(data) {
        const container = document.createElement('div');
        container.className = 'custom-overlay';
        
        // 이벤트 버블링 방지 (지도로 클릭이 전달되어 순간이동이 트리거되는 것 차단)
        const stopPropagation = (e) => e.stopPropagation();
        container.addEventListener('click', stopPropagation);
        container.addEventListener('mousedown', stopPropagation);
        container.addEventListener('mouseup', stopPropagation);
        container.addEventListener('touchstart', stopPropagation);
        container.addEventListener('touchend', stopPropagation);
        
        const header = document.createElement('div');
        header.className = 'overlay-header';
        
        const title = document.createElement('div');
        title.className = 'overlay-title';
        title.textContent = data.name;
        
        const closeBtn = document.createElement('i');
        closeBtn.className = 'fa-solid fa-xmark overlay-close';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.customOverlays.get(data.id).setMap(null);
            // 만약 위치 변경 모드인 상태에서 말풍선을 닫았다면, 취소 처리
            if (this.currentMovingMarkerId === data.id) {
                this.cancelMarkerPositionChange(data.id);
            }
        });
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        container.appendChild(header);

        // 주소 표시 영역 (역지오코딩으로 비동기 로드)
        const addressDiv = document.createElement('div');
        addressDiv.className = 'overlay-address';
        addressDiv.style.flexDirection = 'column';
        addressDiv.style.alignItems = 'flex-start';
        addressDiv.style.gap = '2px';
        addressDiv.innerHTML = '<span class="road-addr">주소 조회 중...</span>';
        container.appendChild(addressDiv);

        // 이미 데이터에 주소 정보가 있는 경우 API 호출 생략하고 즉시 렌더링
        if (this.currentMode === 'battery') {
            if (data.address) {
                addressDiv.innerHTML = `<span class="road-addr">${data.address}</span>`;
            } else {
                this.resolveAddress(data.lat, data.lng, async (addrObj) => {
                    const resolvedAddr = addrObj.jibunAddress || addrObj.roadAddress || "주소를 확인할 수 없음";
                    addressDiv.innerHTML = `<span class="road-addr">${resolvedAddr}</span>`;
                    data.address = resolvedAddr === "주소를 확인할 수 없음" ? "" : resolvedAddr;
                    
                    if (!data.isPending && this.supabase && data.address) {
                        try {
                            await this.supabase
                                .from('battery_markers')
                                .update({ address: data.address })
                                .eq('id', data.id);
                        } catch (err) {
                            console.error("백그라운드 축전지 주소 자동 마이그레이션 실패:", err);
                        }
                    }
                });
            }
        } else {
            if (data.roadAddress || data.jibunAddress) {
                let html = '';
                if (data.jibunAddress) {
                    html += `<span class="road-addr">${this.formatJibunAddress(data.jibunAddress)}</span>`;
                }
                if (data.roadAddress) {
                    html += `<span class="jibun-addr" style="font-size: 13px; color: var(--text-muted); display: block; margin-top: 2px;">(도로명) ${data.roadAddress}</span>`;
                }
                addressDiv.innerHTML = html;
            } else {
                // 주소가 없는 기존 마커(구데이터) 폴백 처리: 최초 1회만 API 조회
                this.resolveAddress(data.lat, data.lng, async (addrObj) => {
                    let html = '';
                    if (addrObj.jibunAddress) {
                        html += `<span class="road-addr">${this.formatJibunAddress(addrObj.jibunAddress)}</span>`;
                    }
                    if (addrObj.roadAddress) {
                        html += `<span class="jibun-addr" style="font-size: 13px; color: var(--text-muted); display: block; margin-top: 2px;">(도로명) ${addrObj.roadAddress}</span>`;
                    }
                    if (!addrObj.roadAddress && !addrObj.jibunAddress) {
                        html = '<span class="road-addr">주소를 확인할 수 없음</span>';
                    }
                    addressDiv.innerHTML = html;
                    
                    // 로컬 메모리 동적 캐싱
                    data.roadAddress = addrObj.roadAddress;
                    data.jibunAddress = addrObj.jibunAddress;
                    
                    // 백그라운드 DB 마이그레이션 자동 갱신
                    if (!data.isPending && this.supabase) {
                        try {
                            await this.supabase
                                .from('markers')
                                .update({
                                    road_address: addrObj.roadAddress || "",
                                    jibun_address: addrObj.jibunAddress || ""
                                })
                                .eq('id', data.id);
                        } catch (err) {
                            console.error("백그라운드 주소 자동 마이그레이션 실패:", err);
                        }
                    }
                });
            }
        }

        // 위치 변경 모드용 안내 가이드
        if (this.currentMovingMarkerId === data.id) {
            const guideDiv = document.createElement('div');
            guideDiv.className = 'overlay-guide';
            guideDiv.style.fontSize = '10px';
            guideDiv.style.color = '#f59e0b';
            guideDiv.style.marginTop = '6px';
            guideDiv.style.fontWeight = 'bold';
            guideDiv.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> 지도를 클릭하거나 핀을 드래그해 이동하세요.';
            container.appendChild(guideDiv);
        }
        
        const actions = document.createElement('div');
        actions.className = 'overlay-actions';
        
        if (this.currentMovingMarkerId === data.id) {
            // 위치 변경 모드인 경우: 저장, 취소 버튼 표시
            const saveBtn = document.createElement('button');
            saveBtn.className = 'overlay-btn overlay-btn-save';
            saveBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            saveBtn.style.color = 'white';
            saveBtn.style.border = 'none';
            saveBtn.textContent = '저장';
            saveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.saveMarkerPosition(data.id);
            });
            
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'overlay-btn overlay-btn-cancel';
            cancelBtn.style.background = 'rgba(255, 255, 255, 0.08)';
            cancelBtn.style.color = 'var(--text-primary)';
            cancelBtn.textContent = '취소';
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.cancelMarkerPositionChange(data.id);
            });
            
            actions.appendChild(saveBtn);
            actions.appendChild(cancelBtn);
        } else {
            // 일반 상태인 경우: 로드뷰, 상세, 편집, 위치 변경 버튼 표시
            const roadviewBtn = document.createElement('button');
            roadviewBtn.className = 'overlay-btn overlay-btn-roadview';
            roadviewBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            roadviewBtn.style.color = 'white';
            roadviewBtn.style.border = 'none';
            roadviewBtn.textContent = '로드뷰';
            roadviewBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openRoadviewModal(data.lat, data.lng, data.name);
            });
            
            const detailBtn = document.createElement('button');
            detailBtn.className = 'overlay-btn overlay-btn-detail';
            detailBtn.style.background = 'rgba(255, 255, 255, 0.08)';
            detailBtn.style.color = 'var(--text-primary)';
            detailBtn.textContent = '상세';
            detailBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openDetailMarkerModal(data.id);
            });
            
            const editBtn = document.createElement('button');
            editBtn.className = 'overlay-btn overlay-btn-edit';
            editBtn.textContent = '편집';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openEditMarkerModal(data.id);
            });

            const moveBtn = document.createElement('button');
            moveBtn.className = 'overlay-btn overlay-btn-move';
            moveBtn.style.background = 'rgba(255, 255, 255, 0.08)';
            moveBtn.style.color = 'var(--text-primary)';
            moveBtn.textContent = '위치 변경';
            moveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.enterMarkerPositionChangeMode(data.id);
            });
            
            actions.appendChild(roadviewBtn);
            actions.appendChild(detailBtn);
            actions.appendChild(editBtn);
            actions.appendChild(moveBtn);
        }
        
        container.appendChild(actions);
        
        return container;
    }

    // 대기 마커 단건 전송 또는 임시 등록 처리
    async handleUploadSinglePending(id, isTemp = false) {
        if (this.isUploadingSingle) return;
        this.isUploadingSingle = true;

        const tr = this.markersList ? this.markersList.querySelector(`.marker-item[data-id="${id}"]`) : null;
        const sendBtn = tr ? tr.querySelector('.btn-send-single') : null;
        const tempBtn = tr ? tr.querySelector('.btn-send-temp-single') : null;
        
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.textContent = '등록 중...';
        }
        if (tempBtn) {
            tempBtn.disabled = true;
            tempBtn.textContent = '등록 중...';
        }

        try {
            const marker = this.markersData.find(m => m.id === id);
            if (!marker) return;

            // 전송 전 주소 누락 여부 최종 1회 검증/획득
            if (this.currentMode === 'equipment') {
                if (!marker.roadAddress && !marker.jibunAddress) {
                    const addrObj = await this.resolveAddressPromise(marker.lat, marker.lng);
                    marker.roadAddress = addrObj.roadAddress;
                    marker.jibunAddress = addrObj.jibunAddress;
                }
            } else {
                if (!marker.address) {
                    const addrObj = await this.resolveAddressPromise(marker.lat, marker.lng);
                    marker.address = addrObj.jibunAddress || addrObj.roadAddress || "";
                }
            }

            if (isTemp) {
                // 임시 등록의 경우 Supabase를 우회하고 color와 isTemp 플래그 세팅
                marker.isPending = false;
                marker.isTemp = true;
                marker.color = '#ef4444';
            } else {
                if (this.supabase) {
                    this.showToast('Supabase 전송 중...');
                    
                    if (this.currentMode === 'equipment') {
                        // 1. markers 테이블 insert
                        const { error: markerErr } = await this.supabase
                            .from('markers')
                            .insert({
                                id: marker.id,
                                name: marker.name,
                                lat: marker.lat,
                                lng: marker.lng,
                                memo: marker.memo || "",
                                tags: marker.tags || [],
                                color: marker.color || '#10b981',
                                facility_code: marker.facilityCode || null,
                                road_address: marker.roadAddress || "",
                                jibun_address: marker.jibunAddress || "",
                                created_at: new Date().toISOString()
                            });
                        
                        if (markerErr) throw markerErr;

                        // 2. information 테이블 upsert (통합시설코드가 있는 경우)
                        if (marker.facilityCode) {
                            const { error: infoErr } = await this.supabase
                                .from('information')
                                .upsert({
                                    facility_code: marker.facilityCode,
                                    place_name: marker.name,
                                    facility_year: marker.facilityYear || "",
                                    project_code: marker.projectCode || "",
                                    business_type: marker.businessType || "",
                                    final_station_name: marker.finalStationName || "",
                                    eq_class: marker.eqClass || "",
                                    eq_type: marker.eqType || "",
                                    install_date: DataManager.formatDateToYmd(marker.installDate || ""),
                                    open_date: DataManager.formatDateToYmd(marker.openDate || "")
                                });
                            if (infoErr) throw infoErr;
                        }
                    } else {
                        // 축전지 모드 핀 및 스펙 DB 등록
                        const { error: markerErr } = await this.supabase
                            .from('battery_markers')
                            .insert({
                                id: marker.id,
                                name: marker.name,
                                lat: marker.lat,
                                lng: marker.lng,
                                address: marker.address || "",
                                memo: marker.memo || "",
                                tags: marker.tags || [],
                                color: marker.color || '#10b981',
                                created_at: new Date().toISOString()
                            });
                        if (markerErr) throw markerErr;

                        const specs = marker.items && marker.items.length > 0 ? marker.items : [{
                            erpName: marker.memo || "",
                            capacity: marker.capacity || 600,
                            quantity: marker.quantity || 12,
                            stationName: marker.stationName || marker.name || "",
                            address: marker.address || ""
                        }];

                        const specsToInsert = specs.map(s => ({
                            marker_id: marker.id,
                            erp_name: s.erpName || marker.memo || "",
                            capacity: s.capacity || 600,
                            quantity: s.quantity || 12,
                            station_name: s.stationName || marker.name || "",
                            address: s.address || marker.address || "",
                            created_at: new Date().toISOString()
                        }));

                        const { error: specErr } = await this.supabase
                            .from('battery_specs')
                            .insert(specsToInsert);
                        if (specErr) throw specErr;
                    }
                }
                marker.isPending = false;
            }

            // 로컬스토리지 저장 (syncLocalStorage에서 isTemp 필터링)
            this.syncLocalStorage();
            
            // UI 갱신
            this.updatePendingUI();
            this.initFilters(false);
            this.renderMarkersOnMap();
            this.renderMarkersList();
            this.showToast(isTemp ? '임시 마커가 성공적으로 등록되었습니다.' : '선택한 위치가 Supabase에 저장되었습니다.');
        } catch (e) {
            this.showToast((isTemp ? '임시 등록' : 'Supabase 전송') + ' 실패: ' + e.message, 5000);
        } finally {
            this.isUploadingSingle = false;
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.textContent = '등록';
            }
            if (tempBtn) {
                tempBtn.disabled = false;
                tempBtn.textContent = '임시';
            }
        }
    }

    // 왼쪽 사이드바 마커 목록 렌더링
    renderMarkersList() {
        const filterText = this.markerFilter.value.trim().toLowerCase();
        
        // 목록 리셋
        this.markersList.innerHTML = '';
        
        // 연도, 사업구분 및 색상, 태그 필터가 적용된 마커 선별 (대기 마커 및 임시 마커는 필터 선택 상태에 상관없이 무조건 포함)
        const filteredByDropdowns = this.markersData.filter(marker => {
            if (marker.isPending || marker.isTemp) return true;
            
            const color = marker.color ? marker.color.toLowerCase().trim() : "#10b981";
            let hasMatchingTag = false;
            if (marker.tags && marker.tags.length > 0) {
                hasMatchingTag = marker.tags.some(tag => this.selectedTags.has(tag.toString().trim()));
            } else {
                hasMatchingTag = this.selectedTags.has("미지정");
            }
            
            if (!this.selectedColors.has(color) || !hasMatchingTag) {
                return false;
            }

            if (this.currentMode === 'equipment') {
                const year = marker.facilityYear ? marker.facilityYear.toString().trim() : "미지정";
                const business = marker.businessType ? marker.businessType.toString().trim() : "미지정";
                return this.selectedYears.has(year) && this.selectedBusinesses.has(business);
            } else {
                const specs = marker.items && marker.items.length > 0 ? marker.items : [{
                    capacity: marker.capacity,
                    quantity: marker.quantity,
                    stationName: marker.stationName || marker.name
                }];
                return specs.some(spec => {
                    const cap = spec.capacity ? spec.capacity.toString().trim() + " AH" : "미지정";
                    const qty = spec.quantity ? spec.quantity.toString().trim() + " Cell" : "미지정";
                    const stName = spec.stationName ? spec.stationName.toString().trim() : "미지정";
                    return this.selectedCapacities.has(cap) && this.selectedQuantities.has(qty) && this.selectedStations.has(stName);
                });
            }
        });
        
        const pendingMarkers = filteredByDropdowns.filter(m => m.isPending);

        // 검색어(필터)가 없는 경우 리스트를 렌더링하지 않으나, 대기 중인 마커가 있으면 대기 마커 리스트 노출
        if (!filterText) {
            this.markerCount.textContent = filteredByDropdowns.length;
            
            if (pendingMarkers.length > 0) {
                this.markerCount.textContent = `대기: ${pendingMarkers.length}`;
                this.renderFilteredList(pendingMarkers, true);
                return;
            }

            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
                <i class="fa-solid fa-magnifying-glass"></i>
                <p>필터링 검색어를 입력하면<br>저장된 위치 목록이 여기에 표시됩니다.</p>
            `;
            this.markersList.appendChild(emptyState);
            return;
        }
        
        // 필터링된 데이터 선별
        const filtered = filteredByDropdowns.filter(marker => {
            const nameMatch = (marker.name || '').toString().toLowerCase().includes(filterText);
            const memoMatch = (marker.memo || '').toString().toLowerCase().includes(filterText);
            const tagMatch = (marker.tags || []).some(t => {
                if (t === null || t === undefined) return false;
                return t.toString().toLowerCase().includes(filterText);
            });
            return nameMatch || memoMatch || tagMatch;
        });
        
        this.markerCount.textContent = filtered.length;
        
        if (filtered.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
                <i class="fa-solid fa-location-dot"></i>
                <p>검색 필터와 일치하는 마커가 없습니다.</p>
            `;
            this.markersList.appendChild(emptyState);
            return;
        }
        
        this.renderFilteredList(filtered, true);
    }

    // 필터링된 마커 리스트 실제 HTML 조립 출력 헬퍼
    renderFilteredList(filtered, highlightPending = false) {
        filtered.forEach(marker => {
            const item = document.createElement('li');
            item.className = 'marker-item';
            item.setAttribute('data-id', marker.id);
            if (highlightPending && marker.isPending) {
                item.className = 'marker-item pending-item';
                item.style.borderLeft = '3px solid #f59e0b';
            }
            
            let infoSummary = '';
            if (this.currentMode === 'battery') {
                const specs = marker.items || [];
                if (specs.length > 0) {
                    const summaryList = specs.map(s => `${s.stationName || marker.name} (${s.capacity}AH / ${s.quantity}Cell)`).slice(0, 3);
                    infoSummary = `<p class="marker-memo" style="margin-top: 4px; font-size: 11px; color: var(--text-muted);"><i class="fa-solid fa-battery-three-quarters" style="color: var(--secondary); margin-right: 4px;"></i>${summaryList.join(', ')}${specs.length > 3 ? ' 외 ' + (specs.length - 3) + '건' : ''}</p>`;
                } else {
                    infoSummary = `<p class="marker-memo" style="margin-top: 4px; font-size: 11px; color: var(--text-muted);"><i class="fa-solid fa-battery-three-quarters" style="color: var(--secondary); margin-right: 4px;"></i>${marker.stationName || marker.name} (${marker.capacity}AH / ${marker.quantity}Cell)</p>`;
                }
            } else {
                infoSummary = marker.memo ? `<p class="marker-memo" style="margin-top: 4px;">${marker.memo}</p>` : '';
            }
            
            // 마커 항목 마크업 조립
            item.innerHTML = `
                <div class="marker-item-header" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                    <h3 class="marker-title" style="flex-grow: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 0;" title="${marker.name}">
                        ${marker.isPending ? `<span style="color: #f59e0b; font-size: 10px; margin-right: 4px;"><i class="fa-solid fa-clock"></i> 대기</span>` : ''}
                        ${marker.isTemp ? `<span style="color: #ef4444; font-size: 10px; margin-right: 4px; border: 1px solid #ef4444; padding: 1px 3px; border-radius: 3px; font-weight: bold; background: rgba(239, 68, 68, 0.05);">임시</span>` : ''}
                        ${marker.name}
                    </h3>
                    ${marker.isPending ? `
                        <div class="pending-item-actions" style="display: flex; gap: 4px; flex-shrink: 0;">
                            <button class="btn-send-single" style="background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer; font-weight: 500;">
                                등록
                            </button>
                            <button class="btn-send-temp-single" style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer; font-weight: 500;">
                                임시
                            </button>
                            <button class="btn-remove-single" style="background: #e5e7eb; color: #374151; border: 1px solid #d1d5db; padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer; font-weight: 500;">
                                제외
                            </button>
                        </div>
                    ` : ''}
                    <span class="marker-date" style="flex-shrink: 0; font-size: 10px; color: var(--text-muted);">${marker.createdAt}</span>
                </div>
                ${infoSummary}
                <div class="marker-tags" style="margin-top: 6px;">
                    ${(marker.tags || []).map(tag => `<span class="tag">#${tag}</span>`).join('')}
                </div>
            `;
            
            // 개별 전송(등록) 버튼 이벤트 바인딩
            const sendBtn = item.querySelector('.btn-send-single');
            if (sendBtn) {
                sendBtn.addEventListener('click', async (e) => {
                    e.stopPropagation(); // 리스트 아이템 클릭(지도 포커싱) 이벤트 버블링 방지
                    await this.handleUploadSinglePending(marker.id, false);
                });
            }

            // 개별 임시 등록 버튼 이벤트 바인딩
            const tempBtn = item.querySelector('.btn-send-temp-single');
            if (tempBtn) {
                tempBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.handleUploadSinglePending(marker.id, true);
                });
            }

            // 개별 제외 버튼 이벤트 바인딩
            const removeBtn = item.querySelector('.btn-remove-single');
            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // 리스트 아이템 클릭 이벤트 버블링 방지
                    if (!confirm(`'${marker.name}' 위치를 대기 목록에서 제외하시겠습니까?`)) return;

                    // 메모리 및 지도 객체에서 지우기
                    this.markersData = this.markersData.filter(m => m.id !== marker.id);
                    this.removeMarkerFromMap(marker.id);

                    // UI 및 필터 업데이트
                    this.updatePendingUI();
                    this.initFilters(false);
                    this.renderMarkersOnMap();
                    this.renderMarkersList();
                    this.showToast(`'${marker.name}' 위치가 목록에서 제외되었습니다.`);
                });
            }
            
            // 사이드바 항목 클릭 시 해당 지도로 카메라 이동 및 오버레이 팝업
            item.addEventListener('click', () => {
                const position = new kakao.maps.LatLng(marker.lat, marker.lng);
                this.map.panTo(position);
                
                // 해당 마커의 오버레이 표시
                this.closeAllOverlays();
                if (this.customOverlays.has(marker.id)) {
                    this.customOverlays.get(marker.id).setMap(this.map);
                }
            });
            
            this.markersList.appendChild(item);
        });
    }

    // 키보드로 필터링 결과 마커 선택 처리
    handleMarkerFilterKeydown(e) {
        const items = this.markersList.querySelectorAll('.marker-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.focusedMarkerIndex++;
            if (this.focusedMarkerIndex >= items.length) {
                this.focusedMarkerIndex = items.length - 1;
            }
            this.updateMarkerListFocus(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.focusedMarkerIndex--;
            if (this.focusedMarkerIndex < -1) {
                this.focusedMarkerIndex = -1;
            }
            this.updateMarkerListFocus(items);
        } else if (e.key === 'Enter') {
            if (this.focusedMarkerIndex >= 0 && this.focusedMarkerIndex < items.length) {
                e.preventDefault();
                items[this.focusedMarkerIndex].click();
            }
        }
    }

    // 포커스된 마커 항목의 시각적 갱신 및 스크롤 제어
    updateMarkerListFocus(items) {
        items.forEach((item, idx) => {
            if (idx === this.focusedMarkerIndex) {
                item.classList.add('focused');
                // 포커스된 항목이 화면을 벗어날 경우 자동 스크롤
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                item.classList.remove('focused');
            }
        });
        
        // 인덱스가 -1이면 인풋 창으로 포커스
        if (this.focusedMarkerIndex === -1) {
            this.markerFilter.focus();
        }
    }

    // 장소 키워드 및 주소 하이브리드 검색
    handleSearch() {
        const query = this.searchInput.value.trim();
        if (!query) {
            this.showToast('검색어를 입력해 주세요.');
            this.searchInput.focus();
            return;
        }
        
        if (!window.kakao || !kakao.maps || !kakao.maps.services) {
            this.showToast('카카오 지도 SDK가 로드되지 않았습니다.');
            return;
        }

        const geocoder = new kakao.maps.services.Geocoder();
        
        // 1. 주소 검색(Geocoder) 우선 시도
        geocoder.addressSearch(query, (addrResult, addrStatus) => {
            if (addrStatus === kakao.maps.services.Status.OK && addrResult && addrResult.length > 0) {
                // 주소 검색 결과가 있는 경우 포맷팅하여 표시
                const formatted = addrResult.map(addr => ({
                    place_name: addr.address_name,
                    road_address_name: addr.road_address ? addr.road_address.address_name : '',
                    address_name: addr.address ? addr.address.address_name : addr.address_name,
                    x: addr.x,
                    y: addr.y
                }));
                this.displaySearchResults(formatted);
            } else {
                // 2. 주소 검색 결과가 없으면 키워드 검색 시도
                if (!this.placesService) {
                    this.showToast('검색 결과가 존재하지 않습니다.');
                    this.hideSearchResults();
                    return;
                }
                
                this.placesService.keywordSearch(query, (placeResult, placeStatus) => {
                    if (placeStatus === kakao.maps.services.Status.OK) {
                        this.displaySearchResults(placeResult);
                    } else {
                        // 최종 검색 결과 없음 처리
                        this.showToast('검색 결과가 존재하지 않습니다.');
                        this.hideSearchResults();
                    }
                });
            }
        });
    }

    displaySearchResults(results) {
        this.searchResultsList.innerHTML = '';
        
        results.forEach(place => {
            const item = document.createElement('li');
            item.className = 'result-item';
            const roadAddr = place.road_address_name || '';
            const jibunAddr = place.address_name || '';
            let addrHtml = '';
            if (jibunAddr) {
                addrHtml += `<div class="result-address">${this.formatJibunAddress(jibunAddr)}</div>`;
            }
            if (roadAddr && roadAddr !== jibunAddr) {
                addrHtml += `<div class="result-address jibun-addr" style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">(도로명) ${roadAddr}</div>`;
            }
            
            item.innerHTML = `
                <div class="result-name">${place.place_name}</div>
                ${addrHtml}
            `;
            
            item.addEventListener('click', () => {
                const lat = parseFloat(place.y);
                const lng = parseFloat(place.x);
                const position = new kakao.maps.LatLng(lat, lng);
                
                // 지도 포커스 이동
                this.map.setCenter(position);
                this.map.setLevel(3);
                
                // 임시 마커 및 말풍선 렌더링 (팝업 바로 띄우지 않음 - 골드 커스텀 SVG 적용)
                this.clearTempMarker();
                const tempMarkerImage = new kakao.maps.MarkerImage(MARKER_SVG_GOLD, new kakao.maps.Size(30, 45), { offset: new kakao.maps.Point(15, 45) });
                this.tempMarker = new kakao.maps.Marker({
                    position: position,
                    image: tempMarkerImage,
                    map: this.map
                });

                // 임시 마커용 말풍선(CustomOverlay) 생성
                const tempContent = document.createElement('div');
                tempContent.className = 'custom-overlay';
                
                const header = document.createElement('div');
                header.className = 'overlay-header';
                
                const title = document.createElement('div');
                title.className = 'overlay-title';
                title.textContent = place.place_name;
                
                const closeBtn = document.createElement('i');
                closeBtn.className = 'fa-solid fa-xmark overlay-close';
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.clearTempMarker();
                });
                
                header.appendChild(title);
                header.appendChild(closeBtn);
                tempContent.appendChild(header);

                // 주소 정보 추가
                const addressDiv = document.createElement('div');
                addressDiv.className = 'overlay-address';
                addressDiv.style.flexDirection = 'column';
                addressDiv.style.alignItems = 'flex-start';
                addressDiv.style.gap = '2px';
                
                let tempAddrHtml = '';
                if (jibunAddr) {
                    tempAddrHtml += `<span class="road-addr">${this.formatJibunAddress(jibunAddr)}</span>`;
                }
                if (roadAddr && roadAddr !== jibunAddr) {
                    tempAddrHtml += `<span class="jibun-addr" style="font-size: 13px; color: var(--text-muted); display: block; margin-top: 2px;">(도로명) ${roadAddr}</span>`;
                }
                if (!roadAddr && !jibunAddr) {
                    tempAddrHtml = '<span class="road-addr">주소를 확인할 수 없음</span>';
                }
                addressDiv.innerHTML = tempAddrHtml;
                tempContent.appendChild(addressDiv);
                
                // 등록 버튼 액션 추가
                const actions = document.createElement('div');
                actions.className = 'overlay-actions';
                
                // 로드뷰 버튼 추가
                const roadviewBtn = document.createElement('button');
                roadviewBtn.className = 'overlay-btn overlay-btn-roadview';
                roadviewBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                roadviewBtn.style.color = 'white';
                roadviewBtn.style.border = 'none';
                roadviewBtn.textContent = '로드뷰';
                roadviewBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openRoadviewModal(lat, lng, place.place_name);
                });
                
                const addBtn = document.createElement('button');
                addBtn.className = 'overlay-btn overlay-btn-edit';
                addBtn.textContent = '등록';
                addBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openAddMarkerModal(lat, lng, place.place_name);
                    this.clearTempMarker();
                });
                
                actions.appendChild(roadviewBtn);
                actions.appendChild(addBtn);
                tempContent.appendChild(actions);

                this.tempOverlay = new kakao.maps.CustomOverlay({
                    content: tempContent,
                    position: position,
                    xAnchor: 0.5,
                    yAnchor: 1.0,
                    zIndex: 5
                });
                this.tempOverlay.setMap(this.map);
                
                this.hideSearchResults();
            });
            
            this.searchResultsList.appendChild(item);
        });
        
        this.searchResultsContainer.classList.remove('hidden');
    }

    hideSearchResults() {
        this.searchResultsContainer.classList.add('hidden');
        this.searchResultsList.innerHTML = '';
    }

    // 지적편집도 토글 기능
    toggleCadastralMode() {
        if (!this.map) return;
        
        this.isCadastralMode = !this.isCadastralMode;
        localStorage.setItem('cadastral_mode', this.isCadastralMode);
        
        if (this.isCadastralMode) {
            this.map.addOverlayMapTypeId(kakao.maps.MapTypeId.USE_DISTRICT);
            if (this.cadastralBtn) {
                this.cadastralBtn.classList.add('active');
            }
            this.showToast('지적편집도를 표시합니다.');
        } else {
            this.map.removeOverlayMapTypeId(kakao.maps.MapTypeId.USE_DISTRICT);
            if (this.cadastralBtn) {
                this.cadastralBtn.classList.remove('active');
            }
            this.showToast('지적편집도를 해제합니다.');
        }
    }

    // 지오로케이션(Geolocation API) 내 위치 찾기
    goToMyLocation() {
        if (!navigator.geolocation) {
            this.showToast('이 브라우저는 위치 서비스를 지원하지 않습니다.');
            return;
        }
        
        this.showToast('내 위치 정보를 탐색 중입니다...', 2000);
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const latLng = new kakao.maps.LatLng(lat, lng);
                
                if (this.map) {
                    this.map.panTo(latLng);
                    this.map.setLevel(3);
                    
                    // 내 위치 표시 핀 꽂기 가능하도록 임시 마커 활성화
                    this.handleMapClick(latLng);
                    this.markerNameInput.value = '내 위치';
                    
                    this.showToast('현재 위치로 이동했습니다. 정보를 입력해 저장할 수 있습니다.');
                }
            },
            (error) => {
                let msg = '위치 정보를 가져올 수 없습니다.';
                if (error.code === error.PERMISSION_DENIED) {
                    msg = '위치 정보 접근 권한이 거부되었습니다.';
                }
                this.showToast(msg);
                console.error("Geolocation error:", error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000
            }
        );
    }

    // 맵 줌인/줌아웃 제어
    zoomMap(zoomIn) {
        if (!this.map) return;
        const currentLevel = this.map.getLevel();
        const nextLevel = zoomIn ? currentLevel - 1 : currentLevel + 1;
        
        // 최소/최대 확대 제한 설정 (보통 1~14 레벨 범위)
        if (nextLevel >= 1 && nextLevel <= 14) {
            this.map.setLevel(nextLevel, { animate: true });
        }
    }

    // 위치 마커 CSV 내보내기 (Supabase 실시간 데이터 반영)
    async handleExportMarkersCSV() {
        let dataToExport = this.markersData;
        if (this.supabase) {
            try {
                this.showToast('Supabase markers 테이블 전체 데이터 조회 중...');
                const { data, error } = await this.supabase
                    .from('markers')
                    .select('*')
                    .order('created_at', { ascending: true });
                if (error) throw error;
                
                // markers 데이터 camelCase 맵핑 (DataManager.exportToCSV 형식 호환)
                dataToExport = data.map(m => ({
                    id: m.id,
                    name: m.name,
                    lat: m.lat,
                    lng: m.lng,
                    memo: m.memo,
                    tags: m.tags,
                    facilityCode: m.facility_code,
                    roadAddress: m.road_address || "",
                    jibunAddress: m.jibun_address || "",
                    createdAt: m.created_at
                }));
            } catch (e) {
                console.error('Supabase 데이터 로드 실패, 로컬 캐시 사용:', e);
                this.showToast('Supabase 조회 실패로 로컬 마커 데이터로 대체하여 내보냅니다.', 4000);
                dataToExport = this.markersData;
            }
        }
        
        if (dataToExport.length === 0) {
            this.showToast('내보낼 마커가 없습니다.');
            return;
        }
        try {
            const stats = DataManager.exportToCSV(dataToExport);
            this.showToast(`성공적으로 CSV 내보내기가 완료되었습니다. (총 ${stats.rowCount}건)`);
        } catch (e) {
            this.showToast('CSV 내보내기 오류: ' + e.message);
        }
    }

    // 위치 마커 JSON 백업 (Supabase 실시간 데이터 반영)
    async handleExportMarkersJSON() {
        if (this.currentMode === 'battery') {
            await this.handleExportBatteryMarkersJSON();
            return;
        }
        let dataToExport = this.markersData;
        if (this.supabase) {
            try {
                this.showToast('Supabase markers 테이블 전체 데이터 조회 중...');
                const { data, error } = await this.supabase
                    .from('markers')
                    .select('*');
                if (error) throw error;
                dataToExport = data.map(m => ({
                    id: m.id,
                    name: m.name,
                    lat: m.lat,
                    lng: m.lng,
                    memo: m.memo,
                    tags: m.tags,
                    color: m.color || '#10b981',
                    facilityCode: m.facility_code,
                    roadAddress: m.road_address || "",
                    jibunAddress: m.jibun_address || "",
                    createdAt: m.created_at
                }));
            } catch (e) {
                console.error('Supabase 데이터 조회 실패:', e);
                this.showToast('Supabase 데이터 조회 실패로 로컬 데이터로 백업합니다.', 4000);
                dataToExport = this.markersData;
            }
        }
        
        if (dataToExport.length === 0) {
            this.showToast('백업할 마커가 없습니다.');
            return;
        }
        try {
            const dateStr = new Date().toISOString().split('T')[0];
            const jsonContent = JSON.stringify(dataToExport, null, 2);
            DataManager._triggerDownload(jsonContent, `supabase_markers_backup_${dateStr}.json`, "application/json;charset=utf-8;");
            this.showToast(`위치 마커 JSON 백업 완료 (총 ${dataToExport.length}건)`);
        } catch (e) {
            this.showToast('JSON 백업 오류: ' + e.message);
        }
    }

    // 위치 마커 Excel 백업 (Supabase 실시간 데이터 반영)
    async handleExportMarkersExcel() {
        if (this.currentMode === 'battery') {
            await this.handleExportBatteryMarkersExcel();
            return;
        }
        let dataToExport = this.markersData;
        if (this.supabase) {
            try {
                this.showToast('Supabase markers 테이블 전체 데이터 조회 중...');
                const { data, error } = await this.supabase
                    .from('markers')
                    .select('*');
                if (error) throw error;
                dataToExport = data.map(m => ({
                    id: m.id,
                    name: m.name,
                    lat: m.lat,
                    lng: m.lng,
                    memo: m.memo,
                    tags: m.tags,
                    color: m.color || '#10b981',
                    facilityCode: m.facility_code,
                    roadAddress: m.road_address || "",
                    jibunAddress: m.jibun_address || "",
                    createdAt: m.created_at
                }));
            } catch (e) {
                console.error('Supabase 데이터 조회 실패:', e);
                this.showToast('Supabase 데이터 조회 실패로 로컬 데이터로 백업합니다.', 4000);
                dataToExport = this.markersData;
            }
        }

        if (dataToExport.length === 0) {
            this.showToast('백업할 마커가 없습니다.');
            return;
        }
        try {
            const count = DataManager.exportMarkersToExcel(dataToExport);
            this.showToast(`위치 마커 Excel 백업 완료 (총 ${count}건)`);
        } catch (e) {
            this.showToast('Excel 백업 오류: ' + e.message);
        }
    }

    // 위치 마커 Excel 복원
    handleImportMarkersExcel(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (this.currentMode === 'battery') {
            DataManager.parseBatteryExcel(file)
                .then(async (newMarkers) => {
                    await this.applyBatteryMarkersRestore(newMarkers, this.importMarkersExcelFile);
                })
                .catch(err => {
                    this.showToast(err.message, 5000);
                    this.importMarkersExcelFile.value = '';
                });
        } else {
            DataManager.importMarkersFromExcel(file)
                .then(async (newMarkers) => {
                    await this.applyMarkersRestore(newMarkers, this.importMarkersExcelFile);
                })
                .catch(err => {
                    this.showToast(err.message, 5000);
                    this.importMarkersExcelFile.value = '';
                });
        }
    }

    // 위치 마커 JSON 복원
    handleImportMarkersJSON(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (this.currentMode === 'battery') {
            DataManager.importFromJSON(file)
                .then(async (newMarkers) => {
                    await this.applyBatteryMarkersRestore(newMarkers, this.importMarkersJsonFile);
                })
                .catch(err => {
                    this.showToast(err.message, 5000);
                    this.importMarkersJsonFile.value = '';
                });
        } else {
            DataManager.importFromJSON(file)
                .then(async (newMarkers) => {
                    await this.applyMarkersRestore(newMarkers, this.importMarkersJsonFile);
                })
                .catch(err => {
                    this.showToast(err.message, 5000);
                    this.importMarkersJsonFile.value = '';
                });
        }
    }

    // 위치 마커 복원 공통 처리 (JSON/Excel)
    async applyMarkersRestore(newMarkers, fileInput) {
        if (newMarkers.length === 0) {
            this.showToast('복원할 마커 데이터가 없습니다.');
            if (fileInput) fileInput.value = '';
            return;
        }

        this.showToast('데이터 복원 처리 중...');

        if (this.supabase) {
            try {
                const bulkData = newMarkers.map(m => ({
                    id: m.id,
                    name: m.name,
                    lat: m.lat,
                    lng: m.lng,
                    memo: m.memo || "",
                    tags: m.tags || [],
                    color: m.color || '#10b981',
                    facility_code: m.facilityCode || null,
                    road_address: m.roadAddress || "",
                    jibun_address: m.jibunAddress || "",
                    created_at: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString()
                }));

                const { error } = await this.supabase
                    .from('markers')
                    .upsert(bulkData, { onConflict: 'id' });

                if (error) throw error;
            } catch (e) {
                this.showToast('Supabase 위치 마커 복원 실패: ' + e.message, 5000);
                if (fileInput) fileInput.value = '';
                return;
            }
        } else {
            const existingIds = new Set(this.markersData.map(m => m.id));
            const merged = [...this.markersData];

            newMarkers.forEach(m => {
                if (!existingIds.has(m.id)) {
                    merged.push(m);
                }
            });
            this.markersData = merged;
            this.syncLocalStorage();
        }

        await this.init();
        this.showToast(`위치 마커 복원이 완료되었습니다. (총 ${newMarkers.length}건)`);
        if (fileInput) fileInput.value = '';
    }

    // 상세 장비 정보 JSON 백업
    async handleExportInfoJSON() {
        if (!this.supabase) {
            this.showToast('Supabase가 연결되어 있지 않아 상세 장비 정보를 백업할 수 없습니다.', 5000);
            return;
        }
        try {
            this.showToast('Supabase information 테이블 전체 데이터 조회 중...');
            const { data, error } = await this.supabase
                .from('information')
                .select('*');
            if (error) throw error;
            if (!data || data.length === 0) {
                this.showToast('내보낼 상세 장비 데이터가 없습니다.');
                return;
            }
            const dateStr = new Date().toISOString().split('T')[0];
            const jsonContent = JSON.stringify(data, null, 2);
            DataManager._triggerDownload(jsonContent, `supabase_information_backup_${dateStr}.json`, "application/json;charset=utf-8;");
            this.showToast(`상세 장비 정보 JSON 백업 완료 (총 ${data.length}건)`);
        } catch (e) {
            this.showToast('information 백업 실패: ' + e.message, 5000);
        }
    }

    // 상세 장비 정보 Excel 백업
    async handleExportInfoExcel() {
        if (!this.supabase) {
            this.showToast('Supabase가 연결되어 있지 않아 상세 장비 정보를 백업할 수 없습니다.', 5000);
            return;
        }
        try {
            this.showToast('Supabase information 테이블 전체 데이터 조회 중...');
            const { data, error } = await this.supabase
                .from('information')
                .select('*');
            if (error) throw error;
            if (!data || data.length === 0) {
                this.showToast('보낼 상세 장비 데이터가 없습니다.');
                return;
            }
            const count = DataManager.exportInfoToExcel(data);
            this.showToast(`상세 장비 정보 Excel 백업 완료 (총 ${count}건)`);
        } catch (e) {
            this.showToast('information Excel 백업 실패: ' + e.message, 5000);
        }
    }

    // 상세 장비 정보 Excel 복원
    handleImportInfoExcelBackup(event) {
        const file = event.target.files[0];
        if (!file) return;

        DataManager.parseInfoExcel(file)
            .then(async (parsedData) => {
                await this.applyInfoRestore(parsedData, this.importInfoExcelFile);
            })
            .catch(err => {
                this.showToast(err.message, 5000);
                this.importInfoExcelFile.value = '';
            });
    }

    // 상세 장비 정보 JSON 복원
    handleImportInfoJSON(event) {
        const file = event.target.files[0];
        if (!file) return;
        if (!this.supabase) {
            this.showToast('Supabase가 연결되어 있지 않아 복원할 수 없습니다.', 5000);
            this.importInfoJsonFile.value = '';
            return;
        }
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const parsedData = JSON.parse(e.target.result);
                if (!Array.isArray(parsedData)) {
                    throw new Error('올바르지 않은 JSON 데이터 형식입니다. (배열 형태여야 합니다)');
                }
                if (parsedData.length > 0 && !parsedData[0].hasOwnProperty('facility_code')) {
                    throw new Error('상세 장비 정보 형식이 아닙니다. (facility_code 필드가 필요합니다)');
                }
                await this.applyInfoRestore(parsedData, this.importInfoJsonFile);
            } catch (err) {
                this.showToast('상세 장비 복원 실패: ' + err.message, 5000);
                this.importInfoJsonFile.value = '';
            }
        };
        reader.onerror = () => {
            this.showToast('파일을 읽는 도중 오류가 발생했습니다.');
            this.importInfoJsonFile.value = '';
        };
        reader.readAsText(file);
    }

    // 상세 장비 정보 복원 공통 처리 (JSON/Excel)
    async applyInfoRestore(parsedData, fileInput) {
        if (!this.supabase) {
            this.showToast('Supabase가 연결되어 있지 않아 복원할 수 없습니다.', 5000);
            if (fileInput) fileInput.value = '';
            return;
        }
        if (!parsedData || parsedData.length === 0) {
            this.showToast('복원할 상세 장비 데이터가 없습니다.');
            if (fileInput) fileInput.value = '';
            return;
        }

        this.showToast('상세 장비 데이터 복원 처리 중...');

        const normalizedData = parsedData.map(row => DataManager.normalizeInfoRecord(row));

        const { error } = await this.supabase
            .from('information')
            .upsert(normalizedData, { onConflict: 'facility_code' });

        if (error) {
            this.showToast('상세 장비 복원 실패: ' + error.message, 5000);
            if (fileInput) fileInput.value = '';
            return;
        }

        await this.init();
        this.showToast(`상세 장비 정보 복원이 완료되었습니다. (총 ${parsedData.length}건)`);
        if (fileInput) fileInput.value = '';
    }

    // Excel 파일 가져오기 및 파싱
    handleImportExcel(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // UI 로딩 표시
        this.excelStatus.classList.remove('hidden');
        this.excelStatusText.textContent = 'Excel 파일 분석 중...';
        
        DataManager.parseExcelOrCSV(file)
            .then(async (parsedData) => {
                // 분류: 위경도가 있는 데이터 vs 주소 변환이 필요한 데이터
                const withCoords = parsedData.filter(d => d.lat !== undefined && d.lng !== undefined);
                const needGeocoding = parsedData.filter(d => d.lat === undefined || d.lng === undefined);
                
                let geocodeResults = [];
                let successCount = 0;
                let failCount = 0;
                
                if (needGeocoding.length > 0) {
                    this.excelStatusText.textContent = `주소 좌표 변환 시작... (총 ${needGeocoding.length}건)`;
                    const result = await this.processGeocodingQueue(needGeocoding);
                    geocodeResults = result.results;
                    successCount = result.successCount;
                    failCount = result.failCount;
                }
                
                // 최종 마커 취합 및 대기 상태 플래그 추가
                const finalMarkers = [...withCoords, ...geocodeResults].map(m => ({
                    ...m,
                    isPending: true // DB 저장 대기 임시 마커로 등록
                }));
                
                if (finalMarkers.length === 0) {
                    throw new Error('가져올 수 있는 유효한 위치 데이터가 없습니다.');
                }
                
                // 기존 데이터에 병합 (중복 아이디 방지)
                const existingIds = new Set(this.markersData.map(m => m.id));
                const merged = [...this.markersData];
                
                let addedCount = 0;
                finalMarkers.forEach(m => {
                    if (!existingIds.has(m.id)) {
                        merged.push(m);
                        addedCount++;
                    }
                });
                
                this.markersData = merged;
                
                // 대기 UI 업데이트 (이탈 경고 및 카운터 토글)
                this.updatePendingUI();
                
                // 필터 초기화 및 리렌더링
                this.initFilters(false);
                
                // 지도 및 리스트 갱신
                this.renderMarkersOnMap();
                this.renderMarkersList();

                // 사이드바가 접혀 있다면 자동으로 펼쳐줌
                if (this.sidebar && this.sidebar.classList.contains('collapsed')) {
                    this.sidebar.classList.remove('collapsed');
                    if (this.map) {
                        this.map.relayout();
                        setTimeout(() => this.map.relayout(), 300);
                    }
                }
                
                // 지도를 마지막에 꽂힌 핀으로 이동시킴
                if (finalMarkers.length > 0) {
                    const lastPin = finalMarkers[finalMarkers.length - 1];
                    const position = new kakao.maps.LatLng(lastPin.lat, lastPin.lng);
                    this.map.setCenter(position);
                    this.map.setLevel(4);
                }
                
                let summaryMsg = `엑셀 위치 마킹 완료! 총 ${addedCount}개 장소가 대기 중입니다.`;
                if (failCount > 0) {
                    summaryMsg += ` (주소 찾기 실패: ${failCount}건)`;
                }
                this.showToast(summaryMsg, 5000);
                
                // UI 원복
                this.excelStatus.classList.add('hidden');
                this.importExcelFile.value = '';
            })
            .catch(err => {
                this.showToast(err.message, 5000);
                this.excelStatus.classList.add('hidden');
                this.importExcelFile.value = '';
            });
    }

    // 대기 마커 개수 업데이트 및 UI 제어 (페이지 이탈 방지 경고 포함)
    updatePendingUI() {
        const pendingCount = this.markersData.filter(m => m.isPending).length;
        if (pendingCount > 0) {
            this.pendingCount.textContent = pendingCount;
            this.pendingActions.classList.remove('hidden');
            
            // 페이지 이탈 경고 이벤트 바인딩 (중복 등록 방지)
            if (!this.beforeUnloadHandler) {
                this.beforeUnloadHandler = (e) => {
                    e.preventDefault();
                    e.returnValue = '저장되지 않은 대기 마커가 있습니다. 이 페이지를 벗어나시겠습니까?';
                    return e.returnValue;
                };
                window.addEventListener('beforeunload', this.beforeUnloadHandler);
            }
        } else {
            this.pendingActions.classList.add('hidden');
            
            // 페이지 이탈 경고 해제
            if (this.beforeUnloadHandler) {
                window.removeEventListener('beforeunload', this.beforeUnloadHandler);
                this.beforeUnloadHandler = null;
            }
        }
    }

    // 대기 마커 전체 Supabase 또는 임시 등록 처리
    async handleUploadPending(isTemp = false) {
        if (this.isUploadingPending) return;
        this.isUploadingPending = true;

        if (this.uploadPendingBtn) {
            this.uploadPendingBtn.disabled = true;
            this.uploadPendingBtn.textContent = '전송 중...';
        }
        if (this.sendExcelConfirmBtn) {
            this.sendExcelConfirmBtn.disabled = true;
            this.sendExcelConfirmBtn.textContent = '전송 중...';
        }
        if (this.sendExcelTempBtn) {
            this.sendExcelTempBtn.disabled = true;
            this.sendExcelTempBtn.textContent = '등록 중...';
        }

        try {
            // 모달창이 열려 있는 상태라면 모달 테이블 내 input 값들을 markersData에 강제 동기화
            if (this.excelConfirmModal && !this.excelConfirmModal.classList.contains('hidden') && this.excelConfirmTableBody) {
                const rows = this.excelConfirmTableBody.querySelectorAll('tr');
                for (const tr of rows) {
                    const id = tr.getAttribute('data-id');
                    const nameInput = tr.querySelector('input[data-key="name"]');
                    const latInput = tr.querySelector('input[data-key="lat"]');
                    const lngInput = tr.querySelector('input[data-key="lng"]');
                    
                    const marker = this.markersData.find(m => m.id === id);
                    if (marker) {
                        if (nameInput) marker.name = nameInput.value.trim();
                        if (latInput && lngInput) {
                            const newLat = parseFloat(latInput.value);
                            const newLng = parseFloat(lngInput.value);
                            if (!isNaN(newLat) && !isNaN(newLng)) {
                                if (marker.lat !== newLat || marker.lng !== newLng) {
                                    marker.lat = newLat;
                                    marker.lng = newLng;
                                    // 좌표 변경 시 주소 재조회
                                    const addrObj = await this.resolveAddressPromise(newLat, newLng);
                                    marker.roadAddress = addrObj.roadAddress;
                                    marker.jibunAddress = addrObj.jibunAddress;
                                }
                            }
                        }
                    }
                }
            }

            const pendingMarkers = this.markersData.filter(m => m.isPending);
            if (pendingMarkers.length === 0) return;

            // 주소가 누락된 대기 마커가 있다면 백그라운드 지오코딩으로 채워줌
            for (let m of pendingMarkers) {
                if (!m.roadAddress && !m.jibunAddress) {
                    const addrObj = await this.resolveAddressPromise(m.lat, m.lng);
                    m.roadAddress = addrObj.roadAddress;
                    m.jibunAddress = addrObj.jibunAddress;
                    await new Promise(r => setTimeout(r, 50)); // API 과부하 딜레이
                }
            }

            if (isTemp) {
                // 임시 등록인 경우 Supabase를 우회하고 color와 isTemp 플래그 세팅
                pendingMarkers.forEach(m => {
                    m.isPending = false;
                    m.isTemp = true;
                    m.color = '#ef4444';
                });
            } else {
                if (this.supabase) {
                    this.showToast('Supabase로 전체 전송 중...');
                    
                    // 1. markers 벌크 데이터 생성
                    const bulkMarkers = pendingMarkers.map(m => ({
                        id: m.id,
                        name: m.name,
                        lat: m.lat,
                        lng: m.lng,
                        memo: m.memo || "",
                        tags: m.tags || [],
                        color: m.color || '#10b981',
                        facility_code: m.facilityCode || null,
                        road_address: m.roadAddress || "",
                        jibun_address: m.jibunAddress || "",
                        created_at: new Date().toISOString()
                    }));

                    const { error: markerErr } = await this.supabase
                        .from('markers')
                        .insert(bulkMarkers);
                    
                    if (markerErr) throw markerErr;

                    // 2. information 벌크 upsert 처리
                    const bulkInfo = pendingMarkers
                        .filter(m => m.facilityCode)
                        .map(m => ({
                            facility_code: m.facilityCode,
                            place_name: m.name,
                            facility_year: m.facilityYear || "",
                            project_code: m.projectCode || "",
                            business_type: m.businessType || "",
                            final_station_name: m.finalStationName || "",
                            eq_class: m.eqClass || "",
                            eq_type: m.eqType || "",
                            install_date: DataManager.formatDateToYmd(m.installDate || ""),
                            open_date: DataManager.formatDateToYmd(m.openDate || "")
                        }));

                    if (bulkInfo.length > 0) {
                        const { error: infoErr } = await this.supabase
                            .from('information')
                            .upsert(bulkInfo);
                        if (infoErr) throw infoErr;
                    }
                }
                pendingMarkers.forEach(m => m.isPending = false);
            }

            // 로컬스토리지 저장 (syncLocalStorage에서 isTemp 필터링)
            this.syncLocalStorage();

            // UI 갱신
            this.updatePendingUI();
            this.initFilters(false);
            this.renderMarkersOnMap();
            this.renderMarkersList();
            this.closeExcelConfirmModal();
            this.showToast(isTemp
                ? `대기 마커 ${pendingMarkers.length}개가 임시 마커(빨간색)로 등록되었습니다.`
                : `성공적으로 ${pendingMarkers.length}개의 위치를 Supabase에 저장했습니다.`);
        } catch (e) {
            this.showToast('일괄 등록 실패: ' + e.message, 5000);
        } finally {
            this.isUploadingPending = false;
            if (this.uploadPendingBtn) {
                this.uploadPendingBtn.disabled = false;
                this.uploadPendingBtn.textContent = '일괄등록';
            }
            if (this.sendExcelConfirmBtn) {
                this.sendExcelConfirmBtn.disabled = false;
                this.sendExcelConfirmBtn.textContent = '전체 전송';
            }
            if (this.sendExcelTempBtn) {
                this.sendExcelTempBtn.disabled = false;
                this.sendExcelTempBtn.textContent = '임시 등록';
            }
        }
    }

    // 대기 마커 전체 취소 및 지도 클리어
    handleCancelPending() {
        const pendingMarkers = this.markersData.filter(m => m.isPending);
        if (pendingMarkers.length === 0) return;

        if (!confirm(`대기 중인 ${pendingMarkers.length}개의 위치 마킹을 모두 취소하시겠습니까?`)) return;

        // 대기 상태의 마커들을 메모리에서 완전히 솎아냄
        this.markersData = this.markersData.filter(m => !m.isPending);
        
        // 지도 객체 정리
        pendingMarkers.forEach(m => this.removeMarkerFromMap(m.id));

        // UI 갱신
        this.updatePendingUI();
        this.initFilters(false);
        this.renderMarkersOnMap();
        this.renderMarkersList();
        this.closeExcelConfirmModal();
        this.showToast('임시 대기 마커가 모두 삭제되었습니다.');
    }

    // 주소 변환 큐 처리
    async processGeocodingQueue(items) {
        let successCount = 0;
        let failCount = 0;
        const results = [];
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            this.excelStatusText.textContent = `주소 좌표 변환 중... (${i + 1}/${items.length})`;
            
            const coords = await this.geocodeAddress(item.address);
            if (coords) {
                item.lat = coords.lat;
                item.lng = coords.lng;
                item.roadAddress = item.address; // 엑셀 주소 변환 결과를 로드 어드레스로 맵핑 보존
                item.jibunAddress = "";
                delete item.address;
                results.push(item);
                successCount++;
            } else {
                console.warn(`[주소 변환 실패] 장소: ${item.name}, 주소: ${item.address}`);
                failCount++;
            }
            // API 과부하 방지 50ms 딜레이
            await new Promise(r => setTimeout(r, 50));
        }
        
        return { results, successCount, failCount };
    }

    // 개별 주소 geocode
    geocodeAddress(address) {
        return new Promise((resolve) => {
            const geocoder = new kakao.maps.services.Geocoder();
            geocoder.addressSearch(address, (result, status) => {
                if (status === kakao.maps.services.Status.OK) {
                    resolve({
                        lat: parseFloat(result[0].y),
                        lng: parseFloat(result[0].x)
                    });
                } else {
                    resolve(null);
                }
            });
        });
    }

    // 상세장비정보 엑셀 업로드 핸들러
    handleImportInfoExcel(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (this.infoUploadStatus) {
            this.infoUploadStatus.classList.remove('hidden');
            this.infoUploadStatusText.textContent = '상세 장비 정보 파일 분석 중...';
        }

        DataManager.parseInfoExcel(file)
            .then((parsedData) => {
                if (this.infoUploadStatus) {
                    this.infoUploadStatus.classList.add('hidden');
                }

                // 파싱된 데이터를 임시 보관 후 확인 모달 오픈
                this.pendingInfoData = parsedData;
                this.openInfoConfirmModal(parsedData);

                // 파일 인풋 클리어
                this.importInfoFile.value = '';
            })
            .catch(err => {
                this.showToast(err.message, 5000);
                if (this.infoUploadStatus) {
                    this.infoUploadStatus.classList.add('hidden');
                }
                this.importInfoFile.value = '';
            });
    }

    // 엑셀 위치 등록 확인 모달 열기
    openExcelConfirmModal(data) {
        if (!this.excelConfirmModal) return;

        if (this.excelConfirmTableBody) {
            this.excelConfirmTableBody.innerHTML = '';
            data.forEach(marker => {
                const tr = document.createElement('tr');
                tr.setAttribute('data-id', marker.id);
                tr.innerHTML = `
                    <td><input type="text" class="table-input" data-key="name" value="${marker.name || ''}"></td>
                    <td>${marker.facilityCode || ''}</td>
                    <td>${marker.projectCode || ''}</td>
                    <td>${marker.facilityYear || ''}</td>
                    <td>${marker.businessType || ''}</td>
                    <td>${marker.finalStationName || ''}</td>
                    <td>${marker.eqType || ''}</td>
                    <td><input type="text" class="table-input" data-key="lat" value="${marker.lat || ''}" style="width: 90px;"></td>
                    <td><input type="text" class="table-input" data-key="lng" value="${marker.lng || ''}" style="width: 90px;"></td>
                    <td title="${this.formatJibunAddress(marker.jibunAddress) || marker.roadAddress || ''}" style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.formatJibunAddress(marker.jibunAddress) || marker.roadAddress || ''}</td>
                    <td style="text-align: center;">
                        <button class="btn-table-action btn-table-move"><i class="fa-solid fa-crosshairs"></i> 이동</button>
                        <button class="btn-table-action btn-table-send"><i class="fa-solid fa-check"></i> 등록</button>
                        <button class="btn-table-action btn-table-temp" style="background: rgba(239, 68, 68, 0.05); color: #ef4444; border: 1px solid #ef4444;"><i class="fa-solid fa-clock"></i> 임시</button>
                        <button class="btn-table-action btn-table-remove"><i class="fa-solid fa-trash-can"></i> 제외</button>
                    </td>
                `;

                // 인풋 바인딩 및 지도 동기화
                const nameInput = tr.querySelector('input[data-key="name"]');
                const latInput = tr.querySelector('input[data-key="lat"]');
                const lngInput = tr.querySelector('input[data-key="lng"]');

                const syncMarkerPosition = async () => {
                    const newLat = parseFloat(latInput.value);
                    const newLng = parseFloat(lngInput.value);
                    if (isNaN(newLat) || isNaN(newLng)) {
                        // 올바르지 않은 좌표 입력 시 이전 유효 좌표로 롤백
                        const markerData = this.markersData.find(m => m.id === marker.id);
                        if (markerData) {
                            latInput.value = markerData.lat;
                            lngInput.value = markerData.lng;
                        }
                        return;
                    }

                    const markerData = this.markersData.find(m => m.id === marker.id);
                    if (markerData) {
                        markerData.lat = newLat;
                        markerData.lng = newLng;
                    }
                    
                    // 지도 핀 위치 동기화
                    const kakaoMarker = this.mapMarkers.get(marker.id);
                    if (kakaoMarker) {
                        const newPos = new kakao.maps.LatLng(newLat, newLng);
                        kakaoMarker.setPosition(newPos);
                        
                        // 오버레이 위치 이동
                        if (this.customOverlays.has(marker.id)) {
                            this.customOverlays.get(marker.id).setPosition(newPos);
                        }
                    }
                    
                    // 주소 정보 재변환 후 갱신
                    const addrObj = await this.resolveAddressPromise(newLat, newLng);
                    if (markerData) {
                        markerData.roadAddress = addrObj.roadAddress;
                        markerData.jibunAddress = addrObj.jibunAddress;
                    }
                    
                    const addressTd = tr.querySelector('td:nth-last-child(2)');
                    if (addressTd) {
                        const showAddr = this.formatJibunAddress(addrObj.jibunAddress) || addrObj.roadAddress || '주소 없음';
                        addressTd.textContent = showAddr;
                        addressTd.setAttribute('title', showAddr);
                    }
                };

                latInput.addEventListener('change', syncMarkerPosition);
                lngInput.addEventListener('change', syncMarkerPosition);
                nameInput.addEventListener('change', () => {
                    const markerData = this.markersData.find(m => m.id === marker.id);
                    const newName = nameInput.value.trim();
                    if (markerData) {
                        markerData.name = newName;
                    }
                    const kakaoMarker = this.mapMarkers.get(marker.id);
                    if (kakaoMarker) {
                        kakaoMarker.setTitle(newName);
                    }
                });

                // 개별 버튼 이벤트 연결
                tr.querySelector('.btn-table-move').addEventListener('click', () => this.handleExcelConfirmMove(marker.id));
                tr.querySelector('.btn-table-send').addEventListener('click', () => this.handleExcelConfirmSend(marker.id, tr, false));
                tr.querySelector('.btn-table-temp').addEventListener('click', () => this.handleExcelConfirmSend(marker.id, tr, true));
                tr.querySelector('.btn-table-remove').addEventListener('click', () => this.handleExcelConfirmRemove(marker.id, tr));

                this.excelConfirmTableBody.appendChild(tr);
            });
        }

        this.updateExcelConfirmCount();
        this.excelConfirmModal.classList.remove('hidden');
    }

    // 엑셀 위치 등록 확인 모달 닫기
    closeExcelConfirmModal() {
        if (this.excelConfirmModal) {
            this.excelConfirmModal.classList.add('hidden');
        }
    }

    // 모달 표 내부 행 개수 업데이트 헬퍼
    updateExcelConfirmCount() {
        if (this.excelConfirmCount && this.excelConfirmTableBody) {
            const rowCount = this.excelConfirmTableBody.querySelectorAll('tr').length;
            this.excelConfirmCount.textContent = rowCount;
        }
    }

    // 엑셀 확인 모달 개별 이동
    handleExcelConfirmMove(id) {
        const markerData = this.markersData.find(m => m.id === id);
        if (!markerData) return;

        const position = new kakao.maps.LatLng(markerData.lat, markerData.lng);
        if (this.map) {
            this.map.setCenter(position);
            this.map.setLevel(3);
            
            // 해당 마커의 오버레이 표시
            this.closeAllOverlays();
            if (this.customOverlays.has(id)) {
                this.customOverlays.get(id).setMap(this.map);
            }
            this.showToast(`'${markerData.name}'(으)로 지도를 이동했습니다.`);
        }
    }

    // 엑셀 확인 모달 개별 등록 (전송)
    async handleExcelConfirmSend(id, trElement, isTemp = false) {
        // 전송 전 모달 행 내의 최신 input 값을 가져와 강제 동기화 수행
        const nameInput = trElement.querySelector('input[data-key="name"]');
        const latInput = trElement.querySelector('input[data-key="lat"]');
        const lngInput = trElement.querySelector('input[data-key="lng"]');
        
        const marker = this.markersData.find(m => m.id === id);
        if (marker) {
            if (nameInput) marker.name = nameInput.value.trim();
            if (latInput && lngInput) {
                const newLat = parseFloat(latInput.value);
                const newLng = parseFloat(lngInput.value);
                if (!isNaN(newLat) && !isNaN(newLng)) {
                    if (marker.lat !== newLat || marker.lng !== newLng) {
                        marker.lat = newLat;
                        marker.lng = newLng;
                        // 좌표가 변경되었으므로 주소도 동기적으로 다시 조회
                        const addrObj = await this.resolveAddressPromise(newLat, newLng);
                        marker.roadAddress = addrObj.roadAddress;
                        marker.jibunAddress = addrObj.jibunAddress;
                    }
                }
            }
        }

        await this.handleUploadSinglePending(id, isTemp);
        
        // 데이터 전송에 성공하면 (isPending이 false로 바뀌었을 것임) 모달 표에서 행을 지움
        const updatedMarker = this.markersData.find(m => m.id === id);
        if (updatedMarker && !updatedMarker.isPending) {
            trElement.remove();
            this.updateExcelConfirmCount();
            
            // 더 이상 남은 행이 없으면 모달을 닫음
            const remaining = this.excelConfirmTableBody.querySelectorAll('tr').length;
            if (remaining === 0) {
                this.closeExcelConfirmModal();
            }
        }
    }

    // 엑셀 확인 모달 개별 제외
    handleExcelConfirmRemove(id, trElement) {
        const marker = this.markersData.find(m => m.id === id);
        if (!marker) return;

        if (!confirm(`'${marker.name}' 위치를 대기 목록에서 제외하시겠습니까?`)) return;

        // 메모리 및 지도 객체에서 지우기
        this.markersData = this.markersData.filter(m => m.id !== id);
        this.removeMarkerFromMap(id);
        
        trElement.remove();
        
        // UI 및 필터 업데이트
        this.updatePendingUI();
        this.initFilters(false);
        this.renderMarkersOnMap();
        this.renderMarkersList();
        this.updateExcelConfirmCount();

        this.showToast(`'${marker.name}' 위치가 목록에서 제외되었습니다.`);

        // 남은 항목이 없으면 모달 닫기
        const remaining = this.excelConfirmTableBody.querySelectorAll('tr').length;
        if (remaining === 0) {
            this.closeExcelConfirmModal();
        }
    }

    // 상세장비정보 전송 확인 모달 열기
    openInfoConfirmModal(data) {
        if (!this.infoConfirmModal) return;

        // 테이블 본문 렌더링
        if (this.infoConfirmTableBody) {
            this.infoConfirmTableBody.innerHTML = '';
            data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.facility_year || ''}</td>
                    <td>${row.project_code || ''}</td>
                    <td>${row.facility_code || ''}</td>
                    <td>${row.business_type || ''}</td>
                    <td>${row.place_name || ''}</td>
                    <td>${row.final_station_name || ''}</td>
                    <td>${row.eq_class || ''}</td>
                    <td>${row.eq_type || ''}</td>
                    <td>${this.formatToShortDate(row.install_date)}</td>
                    <td>${this.formatToShortDate(row.open_date)}</td>
                `;
                this.infoConfirmTableBody.appendChild(tr);
            });
        }

        if (this.infoConfirmCount) {
            this.infoConfirmCount.textContent = data.length;
        }

        this.infoConfirmModal.classList.remove('hidden');
    }

    // 상세장비정보 전송 확인 모달 닫기
    closeInfoConfirmModal() {
        if (this.infoConfirmModal) {
            this.infoConfirmModal.classList.add('hidden');
        }
        this.pendingInfoData = null;
    }

    // Supabase information 테이블에 전송
    async handleSendInfoToSupabase() {
        if (this.isSendingInfo) return;
        this.isSendingInfo = true;

        if (!this.pendingInfoData || this.pendingInfoData.length === 0) {
            this.showToast('전송할 데이터가 없습니다.');
            this.isSendingInfo = false;
            return;
        }

        if (!this.supabase) {
            this.showToast('Supabase가 연결되지 않았습니다. config.js를 확인하세요.', 5000);
            this.isSendingInfo = false;
            return;
        }

        // 전송 버튼 비활성화 (중복 클릭 방지)
        if (this.sendInfoConfirmBtn) {
            this.sendInfoConfirmBtn.disabled = true;
            this.sendInfoConfirmBtn.textContent = '전송 중...';
        }

        try {
            const normalizedData = this.pendingInfoData.map(row => DataManager.normalizeInfoRecord(row));
            const { error } = await this.supabase
                .from('information')
                .upsert(normalizedData, { onConflict: 'facility_code' });

            if (error) throw error;

            const count = this.pendingInfoData.length;
            this.closeInfoConfirmModal();
            this.showToast(`상세 장비 정보 ${count}건이 Supabase에 성공적으로 전송되었습니다.`, 5000);
        } catch (e) {
            this.showToast('Supabase 전송 실패: ' + e.message, 5000);
        } finally {
            this.isSendingInfo = false;
            if (this.sendInfoConfirmBtn) {
                this.sendInfoConfirmBtn.disabled = false;
                this.sendInfoConfirmBtn.textContent = '전송';
            }
        }
    }

    // 토스트 노티피케이션 노출
    showToast(message, duration = 3000) {
        this.toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> <span>${message}</span>`;
        this.toast.classList.remove('hidden');
        
        // 이전 타이머 존재시 소멸
        if (this.toastTimeout) {
            clearTimeout(this.toastTimeout);
        }
        
        this.toastTimeout = setTimeout(() => {
            this.toast.classList.add('hidden');
        }, duration);
    }

    // 날짜 문자열을 yyyy-mm-dd 포맷으로 변환하는 헬퍼 메서드
    formatToShortDate(dateStr) {
        return DataManager.formatDateToYmd(dateStr);
    }

    // td 내 텍스트 또는 인풋 값 취득용 헬퍼 함수
    getCellValue(td) {
        if (!td) return '';
        const input = td.querySelector('.table-input');
        return input ? input.value : td.textContent.trim();
    }

    // 선택된 상세 정보 테이블 셀 하이라이트 클리어
    clearCellSelection() {
        const selected = document.querySelectorAll('#detailed-info-table-body .cell-selected');
        selected.forEach(td => td.classList.remove('cell-selected'));
        this.updateCopySelectedBtnVisibility();
    }

    // 선택 셀 복사 버튼 노출 여부 제어
    updateCopySelectedBtnVisibility() {
        if (!this.copySelectedBtn) return;
        const selectedCount = document.querySelectorAll('#detailed-info-table-body .cell-selected').length;
        if (selectedCount > 0) {
            this.copySelectedBtn.classList.remove('hidden');
        } else {
            this.copySelectedBtn.classList.add('hidden');
        }
    }

    // 선택된 셀들의 데이터를 엑셀 호환(\n 및 \t 구분) 포맷팅하여 클립보드 복사
    handleCopySelectedCells() {
        const tbody = document.getElementById('detailed-info-table-body');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr'));
        const selectedRowsData = [];

        rows.forEach(tr => {
            const selectedTds = Array.from(tr.querySelectorAll('td.cell-selected'));
            if (selectedTds.length > 0) {
                const rowVals = selectedTds.map(td => this.getCellValue(td));
                selectedRowsData.push(rowVals.join('\t'));
            }
        });

        if (selectedRowsData.length === 0) {
            this.showToast('복사할 선택 영역이 없습니다.');
            return;
        }

        const textToCopy = selectedRowsData.join('\n');
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                this.showToast(`선택 영역이 클립보드에 복사되었습니다! (Excel 붙여넣기 가능)`);
                this.clearCellSelection();
            })
            .catch(err => {
                console.error('선택 복사 실패:', err);
                this.showToast('복사에 실패했습니다.');
            });
    }

    // 상세 정보 테이블의 특정 열 전체 데이터를 세로로 모아서 복사
    handleCopyColumn(colIndex, colName) {
        const tbody = document.getElementById('detailed-info-table-body');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr'));
        const colVals = [];

        rows.forEach(tr => {
            const tds = tr.querySelectorAll('td');
            if (tds[colIndex]) {
                colVals.push(this.getCellValue(tds[colIndex]));
            }
        });

        if (colVals.length === 0) {
            this.showToast('복사할 열 데이터가 없습니다.');
            return;
        }

        const textToCopy = colVals.join('\n');
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                this.showToast(`'${colName}' 열 데이터 전체(총 ${colVals.length}건)가 세로 형식으로 복사되었습니다.`);
            })
            .catch(err => {
                console.error('열 복사 실패:', err);
                this.showToast('열 복사에 실패했습니다.');
            });
    }

    // 로드뷰 모달 열기 및 파노라마 매핑
    openRoadviewModal(lat, lng, name) {
        if (!window.kakao || !kakao.maps || !kakao.maps.Roadview) {
            this.showToast('카카오 지도 SDK 또는 로드뷰 모듈이 로드되지 않았습니다.');
            return;
        }

        const roadviewContainer = document.getElementById('roadview-container');
        const roadviewError = document.getElementById('roadview-error');
        const roadviewModal = document.getElementById('roadview-modal');
        const roadviewTitle = document.getElementById('roadview-title');

        if (roadviewTitle) {
            roadviewTitle.textContent = `${name} - 현장 로드뷰`;
        }

        // 모달창 위치 스타일 초기화 (드래그 이력이 있으면 중앙 정렬로 복귀)
        if (roadviewModal) {
            const card = roadviewModal.querySelector('.modal-card');
            if (card) {
                card.style.position = '';
                card.style.margin = '';
                card.style.transform = '';
                card.style.left = '';
                card.style.top = '';
            }
        }

        // 모달 표시
        if (roadviewModal) roadviewModal.classList.remove('hidden');
        if (roadviewError) roadviewError.classList.add('hidden');
        if (roadviewContainer) {
            roadviewContainer.classList.remove('hidden');
            roadviewContainer.innerHTML = '';
        }

        try {
            const rv = new kakao.maps.Roadview(roadviewContainer);
            this.currentRoadview = rv;

            // 촬영 일자 오버레이 컨테이너 숨김 초기화
            const dateContainer = document.getElementById('roadview-date-container');
            if (dateContainer) {
                dateContainer.classList.add('hidden');
            }

            const rvClient = new kakao.maps.RoadviewClient();
            const position = new kakao.maps.LatLng(lat, lng);

            rvClient.getNearestPanoId(position, 100, (panoId) => {
                if (panoId === null) {
                    if (roadviewContainer) roadviewContainer.classList.add('hidden');
                    if (roadviewError) roadviewError.classList.remove('hidden');
                } else {
                    rv.setPanoId(panoId, position);
                }
            });

            // 파노라마 ID 변경 이벤트 바인딩 (시점 이동 또는 날짜 선택 시 촬영 일자 목록 갱신)
            kakao.maps.event.addListener(rv, 'pano_changed', () => {
                const currentPanoId = rv.getPanoId();
                this.updateRoadviewDates(currentPanoId);
            });

            // 크기 조절 시 로드뷰 레이아웃 재정렬 감지
            if (this.roadviewResizeObserver) {
                this.roadviewResizeObserver.disconnect();
            }
            this.roadviewResizeObserver = new ResizeObserver(() => {
                if (rv) {
                    rv.relayout();
                }
            });
            const modalCard = roadviewModal ? roadviewModal.querySelector('.modal-card') : null;
            if (modalCard) {
                this.roadviewResizeObserver.observe(modalCard);
            }
        } catch (e) {
            console.error("로드뷰 초기화 실패:", e);
            if (roadviewContainer) roadviewContainer.classList.add('hidden');
            if (roadviewError) roadviewError.classList.remove('hidden');
        }
    }

    // 로드뷰 모달 닫기
    closeRoadviewModal() {
        if (this.roadviewResizeObserver) {
            this.roadviewResizeObserver.disconnect();
            this.roadviewResizeObserver = null;
        }
        this.currentRoadview = null;
        this.lastLoadedPanoId = null;

        const roadviewModal = document.getElementById('roadview-modal');
        if (roadviewModal) {
            roadviewModal.classList.add('hidden');
        }
        
        // 날짜 선택기 초기화
        const dateContainer = document.getElementById('roadview-date-container');
        if (dateContainer) {
            dateContainer.classList.add('hidden');
        }
        const dateSelect = document.getElementById('roadview-date-select');
        if (dateSelect) {
            dateSelect.innerHTML = '';
        }

        const roadviewContainer = document.getElementById('roadview-container');
        if (roadviewContainer) {
            roadviewContainer.innerHTML = '';
        }
    }

    // 현재 파노라마 ID를 기준으로 과거 촬영 날짜 목록을 조회하여 선택박스 동적 구성
    updateRoadviewDates(panoId) {
        if (!panoId) return;

        // 중복 호출 방지 캐시 검증
        if (this.lastLoadedPanoId === panoId) return;
        this.lastLoadedPanoId = panoId;

        // 로컬 프록시 주소 및 카카오 직접 호출 주소 정의 (CORS 대응)
        const localUrl = `/api/roadview-dates?panoId=${panoId}`;
        const remoteUrl = `https://rv.map.kakao.com/roadview-search/v2/node/${panoId}?SERVICE=csspano`;

        const requestData = (fetchUrl) => {
            return fetch(fetchUrl)
                .then(async response => {
                    if (!response.ok) {
                        let errMsg = '네트워크 응답이 올바르지 않습니다.';
                        try {
                            const errData = await response.json();
                            if (errData && errData.error) {
                                errMsg = errData.error;
                            }
                        } catch (e) {}
                        throw new Error(errMsg);
                    }
                    return response.json();
                });
        };

        // 1차로 로컬 프록시 요청 시도, 실패 시 2차로 원격 직접 요청 시도
        requestData(localUrl)
            .catch(err => {
                console.warn('로컬 프록시 API 호출 실패, 카카오 직접 호출 시도:', err);
                return requestData(remoteUrl);
            })
            .then(data => {
                const dateContainer = document.getElementById('roadview-date-container');
                const dateSelect = document.getElementById('roadview-date-select');
                if (!dateContainer || !dateSelect) return;

                const streetList = data.street_view ? data.street_view.streetList : null;
                if (!streetList || streetList.length === 0) {
                    dateContainer.classList.add('hidden');
                    return;
                }

                // 촬영 이력 목록 최신순으로 정렬
                const sortedList = [...streetList].sort((a, b) => b.date.localeCompare(a.date));

                // 셀렉트 박스 옵션 생성
                dateSelect.innerHTML = '';
                sortedList.forEach(item => {
                    const opt = document.createElement('option');
                    opt.value = item.id;

                    // 날짜 포맷팅 (예: "202306" -> "2023년 06월", "20230628" -> "2023년 06월 28일")
                    let formattedDate = item.date;
                    if (item.date && item.date.length === 6) {
                        formattedDate = `${item.date.substring(0, 4)}년 ${item.date.substring(4, 6)}월`;
                    } else if (item.date && item.date.length === 8) {
                        formattedDate = `${item.date.substring(0, 4)}년 ${item.date.substring(4, 6)}월 ${item.date.substring(6, 8)}일`;
                    }

                    opt.textContent = formattedDate;
                    if (String(item.id) === String(panoId)) {
                        opt.selected = true;
                    }
                    dateSelect.appendChild(opt);
                });

                // 현재 촬영 일자 셀렉트 박스 동기화 설정 (현재 panoId가 선택되어 있지 않다면 강제 설정)
                dateSelect.value = panoId;

                // 날짜 옵션 리스트가 있으면 화면에 노출
                dateContainer.classList.remove('hidden');
            })
            .catch(error => {
                console.warn('로드뷰 과거 촬영 날짜 목록 로드 실패 (CORS 또는 네트워크 제한):', error);
                // 오류 발생 시 select 박스 내부에 예외 원인을 갱신하여 인지성 극대화
                const dateContainer = document.getElementById('roadview-date-container');
                const dateSelect = document.getElementById('roadview-date-select');
                if (dateContainer && dateSelect) {
                    dateContainer.classList.remove('hidden');
                    let errorText = '조회 실패 (오류)';
                    const errMsg = error.message ? error.message : '';
                    if (errMsg.includes('504') || errMsg.includes('timeout') || errMsg.includes('시간이 초과')) {
                        errorText = '조회 시간 초과 (504)';
                    }
                    dateSelect.innerHTML = `<option disabled selected style="color: #ef4444; font-weight: 500;">${errorText}</option>`;
                }
                this.showToast(`과거 촬영 일자 로드 실패: ${error.message}`, 4000);
            });
    }

    // 로드뷰 모달창 드래그 이동 기능 초기화
    initRoadviewDrag() {
        const modal = document.getElementById('roadview-modal');
        if (!modal) return;
        const card = modal.querySelector('.modal-card');
        const header = modal.querySelector('.modal-header');
        if (!card || !header) return;

        let isDragging = false;
        let startX = 0, startY = 0;
        let cardLeft = 0, cardTop = 0;

        header.addEventListener('mousedown', (e) => {
            // 닫기 버튼 등 컨트롤 요소를 클릭했을 때는 드래그 방지
            if (e.target.closest('button') || e.target.closest('i')) return;

            isDragging = true;
            
            // 현재 모달 카드의 좌표를 확보하여 절대 위치로 고정
            const rect = card.getBoundingClientRect();
            const parentRect = modal.getBoundingClientRect();
            
            card.style.position = 'absolute';
            card.style.margin = '0';
            card.style.transform = 'none'; // 기존 CSS pop 애니메이션의 transform 효과 초기화
            
            cardLeft = rect.left - parentRect.left;
            cardTop = rect.top - parentRect.top;
            card.style.left = cardLeft + 'px';
            card.style.top = cardTop + 'px';

            startX = e.clientX;
            startY = e.clientY;

            const onMouseMove = (moveEvent) => {
                if (!isDragging) return;
                const deltaX = moveEvent.clientX - startX;
                const deltaY = moveEvent.clientY - startY;

                card.style.left = (cardLeft + deltaX) + 'px';
                card.style.top = (cardTop + deltaY) + 'px';
            };

            const onMouseUp = () => {
                if (isDragging) {
                    const finalRect = card.getBoundingClientRect();
                    const finalParentRect = modal.getBoundingClientRect();
                    cardLeft = finalRect.left - finalParentRect.left;
                    cardTop = finalRect.top - finalParentRect.top;
                    isDragging = false;
                }
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault(); // 텍스트 드래그 선택 방지
        });
    }

    // --- 축전지 모드 관련 구현 ---

    switchMode(mode) {
        if (this.currentMode === mode) return;
        this.currentMode = mode;
        this.markersData = mode === 'equipment' ? this.eqMarkersData : this.batteryMarkersData;
        
        // UI 변경
        this.updateModeButtonsUI();
        
        // 드롭다운 및 아코디언 토글
        this.closeAllDropdowns();
        
        const eqExcelSec = document.getElementById('eq-excel-section');
        const eqInfoSec = document.getElementById('eq-info-upload-section');
        const batExcelSec = document.getElementById('battery-excel-section');
        
        const eqFilters = document.getElementById('eq-filters-row');
        const batFilters = document.getElementById('battery-filters-row');

        const backupSection1Title = document.getElementById('backup-section-1-title');
        const backupSection1Icon = document.getElementById('backup-section-1-icon');
        const backupSection1Wrapper = document.getElementById('backup-section-1-wrapper');
        const backupSection2Wrapper = document.getElementById('backup-section-2-wrapper');
        
        if (mode === 'equipment') {
            if (eqExcelSec) eqExcelSec.classList.remove('hidden');
            if (eqInfoSec) eqInfoSec.classList.remove('hidden');
            if (batExcelSec) batExcelSec.classList.add('hidden');
            
            if (eqFilters) eqFilters.classList.remove('hidden');
            if (batFilters) batFilters.classList.add('hidden');

            if (backupSection1Title) backupSection1Title.textContent = "위치 마커 (markers)";
            if (backupSection1Icon) backupSection1Icon.className = "fa-solid fa-location-dot";
            if (backupSection1Wrapper) backupSection1Wrapper.style.borderBottom = "1px dashed var(--border-color)";
            if (backupSection2Wrapper) backupSection2Wrapper.style.display = "block";
        } else {
            if (eqExcelSec) eqExcelSec.classList.add('hidden');
            if (eqInfoSec) eqInfoSec.classList.add('hidden');
            if (batExcelSec) batExcelSec.classList.remove('hidden');
            
            if (eqFilters) eqFilters.classList.add('hidden');
            if (batFilters) batFilters.classList.remove('hidden');

            if (backupSection1Title) backupSection1Title.textContent = "축전지 내역 (battery)";
            if (backupSection1Icon) backupSection1Icon.className = "fa-solid fa-battery-three-quarters";
            if (backupSection1Wrapper) backupSection1Wrapper.style.borderBottom = "none";
            if (backupSection2Wrapper) backupSection2Wrapper.style.display = "none";
        }
        
        // 필터 및 마커 목록 갱신
        this.initFilters(false);
        this.renderMarkersOnMap();
        this.renderMarkersList();
        
        this.showToast(`${mode === 'equipment' ? '장비' : '축전지'}로 전환되었습니다.`);
    }

    updateModeButtonsUI() {
        if (this.modeEqBtn && this.modeBatteryBtn) {
            if (this.currentMode === 'equipment') {
                this.modeEqBtn.classList.add('active');
                this.modeEqBtn.style.background = 'var(--primary)';
                this.modeEqBtn.style.color = '#fff';
                
                this.modeBatteryBtn.classList.remove('active');
                this.modeBatteryBtn.style.background = 'transparent';
                this.modeBatteryBtn.style.color = 'var(--text-secondary)';
            } else {
                this.modeBatteryBtn.classList.add('active');
                this.modeBatteryBtn.style.background = 'var(--primary)';
                this.modeBatteryBtn.style.color = '#fff';
                
                this.modeEqBtn.classList.remove('active');
                this.modeEqBtn.style.background = 'transparent';
                this.modeEqBtn.style.color = 'var(--text-secondary)';
            }
        }
    }

    handleImportExcelBattery(event) {
        const file = event.target.files[0];
        if (!file) return;

        const statusContainer = this.batteryExcelStatus || document.getElementById('battery-excel-status');
        const statusText = this.batteryExcelStatusText || document.getElementById('battery-excel-status-text');

        if (statusContainer) {
            statusContainer.classList.remove('hidden');
        }
        if (statusText) {
            statusText.textContent = "엑셀 파일 분석 중...";
        }

        DataManager.parseBatteryExcel(file)
            .then(async (parsedList) => {
                if (parsedList.length === 0) {
                    throw new Error("가져올 축전지 데이터가 없거나 형식이 올바르지 않습니다.");
                }
                if (statusText) statusText.textContent = "주소 변환(Geocoding) 중...";
                await this.processGeocodingQueueBattery(parsedList);
            })
            .catch(err => {
                this.showToast(err.message, 5000);
                if (statusContainer) statusContainer.classList.add('hidden');
                if (this.importExcelFileBattery) this.importExcelFileBattery.value = '';
            });
    }

    async processGeocodingQueueBattery(pendingList) {
        let successCount = 0;
        let failCount = 0;
        const results = [];
        
        const statusText = this.batteryExcelStatusText || document.getElementById('battery-excel-status-text');
        const statusContainer = this.batteryExcelStatus || document.getElementById('battery-excel-status');

        for (let i = 0; i < pendingList.length; i++) {
            const item = pendingList[i];
            if (statusText) {
                statusText.textContent = `주소 좌표 변환 중... (${i + 1}/${pendingList.length})`;
            }
            
            // 만약 위도/경도가 이미 채워져 있는 경우 geocoding 스킵
            if (typeof item.lat === 'number' && !isNaN(item.lat) && typeof item.lng === 'number' && !isNaN(item.lng)) {
                results.push(item);
                successCount++;
            } else if (item.address) {
                const coords = await this.geocodeAddress(item.address);
                if (coords) {
                    item.lat = coords.lat;
                    item.lng = coords.lng;
                    results.push(item);
                    successCount++;
                } else {
                    console.warn(`[주소 변환 실패] 장소: ${item.name}, 주소: ${item.address}`);
                    failCount++;
                }
            } else {
                console.warn(`[주소/좌표 모두 부족] 장소: ${item.name}`);
                failCount++;
            }
            
            // API 과부하 방지 50ms 딜레이
            await new Promise(r => setTimeout(r, 50));
        }

        if (statusContainer) {
            statusContainer.classList.add('hidden');
        }
        if (this.importExcelFileBattery) {
            this.importExcelFileBattery.value = '';
        }

        if (results.length === 0) {
            this.showToast(`주소 변환 실패로 가져올 수 있는 항목이 없습니다. (실패: ${failCount}건)`, 5000);
            return;
        }

        // 임시 펜딩 상태 플래그 세팅
        this.pendingBatteryExcelData = results.map(marker => {
            const tempId = marker.id || 'bat_pending_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            return {
                ...marker,
                id: tempId,
                isPending: true,
                isTemp: false
            };
        });

        // 맵에 임시 노란 핀으로 표시
        this.batteryMarkersData = [...this.batteryMarkersData, ...this.pendingBatteryExcelData];
        this.markersData = this.batteryMarkersData;

        this.renderMarkersOnMap();
        this.renderMarkersList();
        
        // 확인 모달 열기
        this.openBatteryExcelConfirmModal(this.pendingBatteryExcelData);
        
        this.showToast(`주소 변환 완료 (성공: ${successCount}건, 실패: ${failCount}건)`);
    }

    openBatteryExcelConfirmModal(data) {
        if (!this.batteryExcelConfirmModal) return;

        if (this.batteryExcelConfirmTableBody) {
            this.batteryExcelConfirmTableBody.innerHTML = '';
            
            data.forEach(marker => {
                const tr = document.createElement('tr');
                tr.setAttribute('data-id', marker.id);
                
                const repSpec = marker.items && marker.items.length > 0 ? marker.items[0] : {
                    erpName: marker.memo || "",
                    capacity: marker.capacity || 600,
                    quantity: marker.quantity || 12,
                    stationName: marker.stationName || marker.name
                };

                tr.innerHTML = `
                    <td><input type="text" class="table-input" data-key="name" value="${marker.name || ''}"></td>
                    <td title="${marker.address || ''}" style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        <input type="text" class="table-input" data-key="address" value="${marker.address || ''}">
                    </td>
                    <td>${repSpec.capacity || ''} AH</td>
                    <td>${repSpec.quantity || ''} Cell</td>
                    <td>${repSpec.stationName || ''}</td>
                    <td>
                        <span style="font-size: 11px; display: block; color: var(--text-secondary);">
                            위도: <input type="text" class="table-input" data-key="lat" value="${marker.lat || ''}" style="width: 70px; display: inline-block;">
                        </span>
                        <span style="font-size: 11px; display: block; color: var(--text-secondary); margin-top: 4px;">
                            경도: <input type="text" class="table-input" data-key="lng" value="${marker.lng || ''}" style="width: 70px; display: inline-block;">
                        </span>
                    </td>
                    <td style="text-align: center;">
                        <button class="btn-table-action btn-table-move"><i class="fa-solid fa-crosshairs"></i> 이동</button>
                        <button class="btn-table-action btn-table-send"><i class="fa-solid fa-check"></i> 등록</button>
                        <button class="btn-table-action btn-table-temp" style="background: rgba(244, 63, 94, 0.05); color: #f43f5e; border: 1px solid #f43f5e;"><i class="fa-solid fa-clock"></i> 임시</button>
                        <button class="btn-table-action btn-table-remove"><i class="fa-solid fa-trash-can"></i> 제외</button>
                    </td>
                `;

                // 인풋 바인딩 및 지도 동기화
                const nameInput = tr.querySelector('input[data-key="name"]');
                const addressInput = tr.querySelector('input[data-key="address"]');
                const latInput = tr.querySelector('input[data-key="lat"]');
                const lngInput = tr.querySelector('input[data-key="lng"]');

                const syncMarkerPositionBattery = async () => {
                    const newLat = parseFloat(latInput.value);
                    const newLng = parseFloat(lngInput.value);
                    if (isNaN(newLat) || isNaN(newLng)) {
                        const markerData = this.markersData.find(m => m.id === marker.id);
                        if (markerData) {
                            latInput.value = markerData.lat;
                            lngInput.value = markerData.lng;
                        }
                        return;
                    }

                    const markerData = this.markersData.find(m => m.id === marker.id);
                    if (markerData) {
                        markerData.lat = newLat;
                        markerData.lng = newLng;
                    }
                    
                    const kakaoMarker = this.mapMarkers.get(marker.id);
                    if (kakaoMarker) {
                        const newPos = new kakao.maps.LatLng(newLat, newLng);
                        kakaoMarker.setPosition(newPos);
                        
                        if (this.customOverlays.has(marker.id)) {
                            this.customOverlays.get(marker.id).setPosition(newPos);
                        }
                    }
                    
                    const addrObj = await this.resolveAddressPromise(newLat, newLng);
                    const resolvedAddress = addrObj.jibunAddress || addrObj.roadAddress || '';
                    if (markerData) {
                        markerData.address = resolvedAddress;
                    }
                    if (addressInput) {
                        addressInput.value = resolvedAddress;
                    }
                };

                latInput.addEventListener('change', syncMarkerPositionBattery);
                lngInput.addEventListener('change', syncMarkerPositionBattery);
                nameInput.addEventListener('change', () => {
                    const markerData = this.markersData.find(m => m.id === marker.id);
                    const newName = nameInput.value.trim();
                    if (markerData) {
                        markerData.name = newName;
                    }
                    const kakaoMarker = this.mapMarkers.get(marker.id);
                    if (kakaoMarker) {
                        kakaoMarker.setTitle(newName);
                    }
                });
                addressInput.addEventListener('change', () => {
                    const markerData = this.markersData.find(m => m.id === marker.id);
                    if (markerData) {
                        markerData.address = addressInput.value.trim();
                    }
                });

                // 개별 버튼 이벤트 연결
                tr.querySelector('.btn-table-move').addEventListener('click', () => this.handleExcelConfirmMove(marker.id));
                tr.querySelector('.btn-table-send').addEventListener('click', () => this.handleExcelConfirmSendBattery(marker.id, tr, false));
                tr.querySelector('.btn-table-temp').addEventListener('click', () => this.handleExcelConfirmSendBattery(marker.id, tr, true));
                tr.querySelector('.btn-table-remove').addEventListener('click', () => this.handleExcelConfirmRemoveBattery(marker.id, tr));

                this.batteryExcelConfirmTableBody.appendChild(tr);
            });
        }

        this.updateBatteryExcelConfirmCount();
        this.batteryExcelConfirmModal.classList.remove('hidden');
    }

    closeBatteryExcelConfirmModal() {
        if (this.batteryExcelConfirmModal) {
            this.batteryExcelConfirmModal.classList.add('hidden');
        }
    }

    updateBatteryExcelConfirmCount() {
        if (this.batteryExcelConfirmCount && this.batteryExcelConfirmTableBody) {
            const rowCount = this.batteryExcelConfirmTableBody.querySelectorAll('tr').length;
            this.batteryExcelConfirmCount.textContent = rowCount;
        }
    }

    async handleExcelConfirmSendBattery(id, trElement, isTemp = false) {
        const nameInput = trElement.querySelector('input[data-key="name"]');
        const addressInput = trElement.querySelector('input[data-key="address"]');
        const latInput = trElement.querySelector('input[data-key="lat"]');
        const lngInput = trElement.querySelector('input[data-key="lng"]');
        
        const marker = this.markersData.find(m => m.id === id);
        if (marker) {
            if (nameInput) marker.name = nameInput.value.trim();
            if (addressInput) marker.address = addressInput.value.trim();
            if (latInput && lngInput) {
                const newLat = parseFloat(latInput.value);
                const newLng = parseFloat(lngInput.value);
                if (!isNaN(newLat) && !isNaN(newLng)) {
                    if (marker.lat !== newLat || marker.lng !== newLng) {
                        marker.lat = newLat;
                        marker.lng = newLng;
                        const addrObj = await this.resolveAddressPromise(newLat, newLng);
                        marker.address = addrObj.jibunAddress || addrObj.roadAddress || '';
                    }
                }
            }
        }

        await this.handleUploadSinglePending(id, isTemp);
        
        const updatedMarker = this.markersData.find(m => m.id === id);
        if (updatedMarker && !updatedMarker.isPending) {
            trElement.remove();
            this.updateBatteryExcelConfirmCount();
            
            const remaining = this.batteryExcelConfirmTableBody.querySelectorAll('tr').length;
            if (remaining === 0) {
                this.closeBatteryExcelConfirmModal();
            }
        }
    }

    handleExcelConfirmRemoveBattery(id, trElement) {
        const marker = this.markersData.find(m => m.id === id);
        if (!marker) return;

        if (!confirm(`'${marker.name}' 위치를 대기 목록에서 제외하시겠습니까?`)) return;

        this.batteryMarkersData = this.batteryMarkersData.filter(m => m.id !== id);
        this.markersData = this.batteryMarkersData;
        this.removeMarkerFromMap(id);
        
        trElement.remove();
        
        this.updatePendingUI();
        this.initFilters(false);
        this.renderMarkersOnMap();
        this.renderMarkersList();
        this.updateBatteryExcelConfirmCount();

        this.showToast(`'${marker.name}' 위치가 목록에서 제외되었습니다.`);

        const remaining = this.batteryExcelConfirmTableBody.querySelectorAll('tr').length;
        if (remaining === 0) {
            this.closeBatteryExcelConfirmModal();
        }
    }

    async handleSaveBatteryExcel(isTemp = false) {
        if (this.isSavingBatteryExcel) return;
        this.isSavingBatteryExcel = true;

        if (this.sendBatteryExcelConfirmBtn) {
            this.sendBatteryExcelConfirmBtn.disabled = true;
            this.sendBatteryExcelConfirmBtn.textContent = '전송 중...';
        }
        if (this.sendBatteryExcelTempBtn) {
            this.sendBatteryExcelTempBtn.disabled = true;
            this.sendBatteryExcelTempBtn.textContent = '등록 중...';
        }

        try {
            if (this.batteryExcelConfirmModal && !this.batteryExcelConfirmModal.classList.contains('hidden') && this.batteryExcelConfirmTableBody) {
                const rows = this.batteryExcelConfirmTableBody.querySelectorAll('tr');
                for (const tr of rows) {
                    const id = tr.getAttribute('data-id');
                    const nameInput = tr.querySelector('input[data-key="name"]');
                    const addressInput = tr.querySelector('input[data-key="address"]');
                    const latInput = tr.querySelector('input[data-key="lat"]');
                    const lngInput = tr.querySelector('input[data-key="lng"]');
                    
                    const marker = this.markersData.find(m => m.id === id);
                    if (marker) {
                        if (nameInput) marker.name = nameInput.value.trim();
                        if (addressInput) marker.address = addressInput.value.trim();
                        if (latInput && lngInput) {
                            const newLat = parseFloat(latInput.value);
                            const newLng = parseFloat(lngInput.value);
                            if (!isNaN(newLat) && !isNaN(newLng)) {
                                if (marker.lat !== newLat || marker.lng !== newLng) {
                                    marker.lat = newLat;
                                    marker.lng = newLng;
                                    const addrObj = await this.resolveAddressPromise(newLat, newLng);
                                    marker.address = addrObj.jibunAddress || addrObj.roadAddress || '';
                                }
                            }
                        }
                    }
                }
            }

            const pendingMarkers = this.markersData.filter(m => m.isPending);
            if (pendingMarkers.length === 0) {
                this.isSavingBatteryExcel = false;
                this.closeBatteryExcelConfirmModal();
                return;
            }

            for (let m of pendingMarkers) {
                if (!m.address) {
                    const addrObj = await this.resolveAddressPromise(m.lat, m.lng);
                    m.address = addrObj.jibunAddress || addrObj.roadAddress || "";
                    await new Promise(r => setTimeout(r, 50));
                }
            }

            if (isTemp) {
                pendingMarkers.forEach(m => {
                    m.isPending = false;
                    m.isTemp = true;
                    m.color = '#f43f5e';
                });
            } else {
                if (this.supabase) {
                    this.showToast('Supabase로 축전지 마커 전송 중...');
                    
                    const bulkMarkers = pendingMarkers.map(m => ({
                        id: m.id,
                        name: m.name,
                        lat: m.lat,
                        lng: m.lng,
                        address: m.address || "",
                        memo: m.memo || "",
                        tags: m.tags || [],
                        color: m.color || '#10b981',
                        created_at: new Date().toISOString()
                    }));

                    const { error: markerErr } = await this.supabase
                        .from('battery_markers')
                        .insert(bulkMarkers);
                    
                    if (markerErr) throw markerErr;

                    const bulkSpecs = [];
                    pendingMarkers.forEach(m => {
                        const specs = m.items && m.items.length > 0 ? m.items : [{
                            erpName: m.memo || "",
                            address: m.address || "",
                            capacity: m.capacity || 600,
                            quantity: m.quantity || 12,
                            stationName: m.stationName || m.name
                        }];
                        specs.forEach(s => {
                            bulkSpecs.push({
                                marker_id: m.id,
                                erp_name: s.erpName || m.memo || "",
                                capacity: typeof s.capacity === 'number' ? s.capacity : parseInt(s.capacity, 10) || 600,
                                quantity: typeof s.quantity === 'number' ? s.quantity : parseInt(s.quantity, 10) || 12,
                                station_name: s.stationName || m.name || "",
                                created_at: new Date().toISOString()
                            });
                        });
                    });

                    if (bulkSpecs.length > 0) {
                        const { error: specsErr } = await this.supabase
                            .from('battery_specs')
                            .insert(bulkSpecs);
                        if (specsErr) throw specsErr;
                    }
                }
                pendingMarkers.forEach(m => m.isPending = false);
            }

            this.syncLocalStorage();

            this.updatePendingUI();
            this.initFilters(false);
            this.renderMarkersOnMap();
            this.renderMarkersList();
            this.closeBatteryExcelConfirmModal();
            
            this.showToast(isTemp
                ? `대기 마커 ${pendingMarkers.length}개가 임시 마커로 화면에 등록되었습니다.`
                : `성공적으로 ${pendingMarkers.length}개의 축전지 위치를 Supabase에 저장했습니다.`);
        } catch (e) {
            this.showToast('일괄 등록 실패: ' + e.message, 5000);
        } finally {
            this.isSavingBatteryExcel = false;
            if (this.sendBatteryExcelConfirmBtn) {
                this.sendBatteryExcelConfirmBtn.disabled = false;
                this.sendBatteryExcelConfirmBtn.textContent = 'DB 저장';
            }
            if (this.sendBatteryExcelTempBtn) {
                this.sendBatteryExcelTempBtn.disabled = false;
                this.sendBatteryExcelTempBtn.textContent = '화면 임시 추가';
            }
        }
    }

    async fetchAndBindBatterySpecs(markerId) {
        if (!this.supabase) return;

        try {
            const { data, error } = await this.supabase
                .from('battery_specs')
                .select('*')
                .eq('marker_id', markerId);

            if (error) throw error;

            if (data && data.length > 0) {
                const tbody = document.getElementById('battery-info-table-body');
                if (tbody) {
                    tbody.innerHTML = '';
                    const isEditable = !this.markerNameInput.readOnly;
                    
                    data.forEach(row => {
                        const tr = document.createElement('tr');
                        tr.setAttribute('data-id', row.id || '');
                        
                        if (isEditable) {
                            tr.innerHTML = `
                                <td><input type="text" class="table-input" data-key="erp_name" value="${row.erp_name || ''}"></td>
                                <td><input type="text" class="table-input" data-key="address" value="${row.address || ''}"></td>
                                <td><input type="text" class="table-input" data-key="capacity" value="${row.capacity || ''}"></td>
                                <td><input type="text" class="table-input" data-key="quantity" value="${row.quantity || ''}"></td>
                                <td><input type="text" class="table-input" data-key="station_name" value="${row.station_name || ''}"></td>
                                <td><span style="font-size: 11px; color: var(--text-muted);">${row.created_at ? row.created_at.split('T')[0] : ''}</span></td>
                            `;
                        } else {
                            tr.innerHTML = `
                                <td>${row.erp_name || ''}</td>
                                <td>${row.address || ''}</td>
                                <td>${row.capacity || ''} AH</td>
                                <td>${row.quantity || ''} Cell</td>
                                <td>${row.station_name || ''}</td>
                                <td>${row.created_at ? row.created_at.split('T')[0] : ''}</td>
                            `;
                        }
                        tbody.appendChild(tr);
                    });
                }
                
                const activeRow = data[0];
                if (activeRow) {
                    if (this.markerCapacityInput) this.markerCapacityInput.value = activeRow.capacity || '600';
                    if (this.markerQuantityInput) this.markerQuantityInput.value = activeRow.quantity || '12';
                    if (this.markerStationInput) this.markerStationInput.value = activeRow.station_name || '';
                }
            }
        } catch (e) {
            console.error("축전지 스펙 정보 조회 실패:", e);
        }
    }

    clearCellSelectionBattery() {
        const selected = document.querySelectorAll('#battery-info-table-body .cell-selected');
        selected.forEach(td => td.classList.remove('cell-selected'));
        this.updateCopySelectedBtnVisibilityBattery();
    }

    updateCopySelectedBtnVisibilityBattery() {
        if (!this.batteryCopySelectedBtn) return;
        const selectedCount = document.querySelectorAll('#battery-info-table-body .cell-selected').length;
        if (selectedCount > 0) {
            this.batteryCopySelectedBtn.classList.remove('hidden');
        } else {
            this.batteryCopySelectedBtn.classList.add('hidden');
        }
    }

    handleCopySelectedCellsBattery() {
        const tbody = document.getElementById('battery-info-table-body');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr'));
        const selectedRowsData = [];

        rows.forEach(tr => {
            const selectedTds = Array.from(tr.querySelectorAll('td.cell-selected'));
            if (selectedTds.length > 0) {
                const rowVals = selectedTds.map(td => this.getCellValue(td));
                selectedRowsData.push(rowVals.join('\t'));
            }
        });

        if (selectedRowsData.length === 0) {
            this.showToast('복사할 선택 영역이 없습니다.');
            return;
        }

        const textToCopy = selectedRowsData.join('\n');
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                this.showToast(`선택 영역이 클립보드에 복사되었습니다! (Excel 붙여넣기 가능)`);
                this.clearCellSelectionBattery();
            })
            .catch(err => {
                console.error('선택 복사 실패:', err);
                this.showToast('복사에 실패했습니다.');
            });
    }

    handleCopyColumnBattery(colIndex, colName) {
        const tbody = document.getElementById('battery-info-table-body');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr'));
        const colVals = [];

        rows.forEach(tr => {
            const tds = tr.querySelectorAll('td');
            if (tds[colIndex]) {
                colVals.push(this.getCellValue(tds[colIndex]));
            }
        });

        if (colVals.length === 0) {
            this.showToast('복사할 열 데이터가 없습니다.');
            return;
        }

        const textToCopy = colVals.join('\n');
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                this.showToast(`'${colName}' 열 데이터 전체(총 ${colVals.length}건)가 세로 형식으로 복사되었습니다.`);
            })
            .catch(err => {
                console.error('열 복사 실패:', err);
                this.showToast('열 복사에 실패했습니다.');
            });
    }

    handleCopyDetailedTableBattery() {
        const tbody = document.getElementById('battery-info-table-body');
        if (!tbody) return;
        
        const rows = Array.from(tbody.querySelectorAll('tr'));
        if (rows.length === 0) {
            this.showToast('복사할 상세 정보가 없습니다.');
            return;
        }

        const headers = ["통합시설명칭(ERP)", "주소", "용량(AH)", "수량(Cell)", "창고/국소/국사명", "등록일"];
        const tsvRows = [headers.join('\t')];

        rows.forEach(tr => {
            const tds = Array.from(tr.querySelectorAll('td')).map(td => this.getCellValue(td));
            tsvRows.push(tds.join('\t'));
        });

        const tsvText = tsvRows.join('\n');

        navigator.clipboard.writeText(tsvText)
            .then(() => {
                this.showToast(`상세 정보가 표 형식(총 ${rows.length}건)으로 클립보드에 복사되었습니다! (Excel 붙여넣기 가능)`);
            })
            .catch(err => {
                console.error('클립보드 복사 실패:', err);
                this.showToast('복사에 실패했습니다. 직접 드래그하여 복사해 주세요.');
            });
    }

    async applyBatteryMarkersRestore(newMarkers, fileInput) {
        if (newMarkers.length === 0) {
            this.showToast('복원할 축전지 마커 데이터가 없습니다.');
            if (fileInput) fileInput.value = '';
            return;
        }

        this.showToast('데이터 복원 처리 중...');

        if (this.supabase) {
            try {
                // 1. battery_markers upsert
                const bulkMarkers = newMarkers.map(m => ({
                    id: m.id,
                    name: m.name,
                    lat: m.lat,
                    lng: m.lng,
                    address: m.address || "",
                    memo: m.memo || "",
                    tags: m.tags || [],
                    color: m.color || '#10b981',
                    created_at: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString()
                }));

                const { error: markerErr } = await this.supabase
                    .from('battery_markers')
                    .upsert(bulkMarkers, { onConflict: 'id' });

                if (markerErr) throw markerErr;

                // 2. battery_specs upsert
                const bulkSpecs = [];
                newMarkers.forEach(m => {
                    const specs = m.items && m.items.length > 0 ? m.items : [{
                        erpName: m.memo || "",
                        address: m.address || "",
                        capacity: m.capacity || 600,
                        quantity: m.quantity || 12,
                        stationName: m.stationName || m.name
                    }];
                    specs.forEach(s => {
                        bulkSpecs.push({
                            id: s.id ? parseInt(s.id, 10) : undefined,
                            marker_id: m.id,
                            erp_name: s.erpName || m.memo || "",
                            capacity: typeof s.capacity === 'number' ? s.capacity : parseInt(s.capacity, 10) || 600,
                            quantity: typeof s.quantity === 'number' ? s.quantity : parseInt(s.quantity, 10) || 12,
                            station_name: s.stationName || m.name || "",
                            address: s.address || m.address || "",
                            created_at: s.createdAt ? new Date(s.createdAt).toISOString() : new Date().toISOString()
                        });
                    });
                });

                if (bulkSpecs.length > 0) {
                    const { error: specsErr } = await this.supabase
                        .from('battery_specs')
                        .upsert(bulkSpecs, { onConflict: 'id' });
                    if (specsErr) throw specsErr;
                }
            } catch (e) {
                this.showToast('Supabase 축전지 마커 복원 실패: ' + e.message, 5000);
                if (fileInput) fileInput.value = '';
                return;
            }
        } else {
            const existingIds = new Set(this.markersData.map(m => m.id));
            const merged = [...this.markersData];

            newMarkers.forEach(m => {
                if (!existingIds.has(m.id)) {
                    merged.push(m);
                }
            });
            this.markersData = merged;
            this.syncLocalStorage();
        }

        await this.init();
        this.showToast(`축전지 마커 복원이 완료되었습니다. (총 ${newMarkers.length}건)`);
        if (fileInput) fileInput.value = '';
    }

    async handleExportBatteryMarkersJSON() {
        let dataToExport = this.markersData;
        if (this.supabase) {
            try {
                this.showToast('Supabase battery_markers 및 specs 데이터 조회 중...');
                const { data: bMarkers, error: bMarkersErr } = await this.supabase
                    .from('battery_markers')
                    .select('*');
                if (bMarkersErr) throw bMarkersErr;

                const { data: bSpecs, error: bSpecsErr } = await this.supabase
                    .from('battery_specs')
                    .select('*');
                if (bSpecsErr) throw bSpecsErr;

                const specsMap = new Map();
                bSpecs.forEach(s => {
                    if (s.marker_id) {
                        if (!specsMap.has(s.marker_id)) specsMap.set(s.marker_id, []);
                        specsMap.get(s.marker_id).push(s);
                    }
                });

                dataToExport = bMarkers.map(m => {
                    const specs = specsMap.get(m.id) || [];
                    const repSpec = specs[0] || null;
                    return {
                        id: m.id,
                        name: m.name,
                        lat: m.lat,
                        lng: m.lng,
                        address: m.address || "",
                        memo: m.memo || "",
                        tags: m.tags || [],
                        color: m.color || '#10b981',
                        createdAt: m.created_at,
                        items: specs.map(s => ({
                            id: s.id,
                            erpName: s.erp_name || "",
                            address: s.address || "",
                            capacity: s.capacity || 600,
                            quantity: s.quantity || 12,
                            stationName: s.station_name || "",
                            createdAt: s.created_at
                        })),
                        capacity: repSpec ? repSpec.capacity : 600,
                        quantity: repSpec ? repSpec.quantity : 12,
                        stationName: repSpec ? repSpec.station_name : (m.name || "")
                    };
                });
            } catch (e) {
                console.error('Supabase 축전지 데이터 조회 실패:', e);
                this.showToast('Supabase 데이터 조회 실패로 로컬 캐시 데이터로 백업합니다.', 4000);
                dataToExport = this.markersData;
            }
        }
        
        if (dataToExport.length === 0) {
            this.showToast('백업할 축전지 마커가 없습니다.');
            return;
        }
        try {
            const dateStr = new Date().toISOString().split('T')[0];
            const jsonContent = JSON.stringify(dataToExport, null, 2);
            DataManager._triggerDownload(jsonContent, `supabase_battery_markers_backup_${dateStr}.json`, "application/json;charset=utf-8;");
            this.showToast(`축전지 마커 JSON 백업 완료 (총 ${dataToExport.length}건)`);
        } catch (e) {
            this.showToast('JSON 백업 오류: ' + e.message);
        }
    }

    async handleExportBatteryMarkersExcel() {
        let dataToExport = this.markersData;
        if (this.supabase) {
            try {
                this.showToast('Supabase battery_markers 및 specs 데이터 조회 중...');
                const { data: bMarkers, error: bMarkersErr } = await this.supabase
                    .from('battery_markers')
                    .select('*');
                if (bMarkersErr) throw bMarkersErr;

                const { data: bSpecs, error: bSpecsErr } = await this.supabase
                    .from('battery_specs')
                    .select('*');
                if (bSpecsErr) throw bSpecsErr;

                const specsMap = new Map();
                bSpecs.forEach(s => {
                    if (s.marker_id) {
                        if (!specsMap.has(s.marker_id)) specsMap.set(s.marker_id, []);
                        specsMap.get(s.marker_id).push(s);
                    }
                });

                dataToExport = bMarkers.map(m => {
                    const specs = specsMap.get(m.id) || [];
                    const repSpec = specs[0] || null;
                    return {
                        id: m.id,
                        name: m.name,
                        lat: m.lat,
                        lng: m.lng,
                        address: m.address || "",
                        memo: m.memo || "",
                        tags: m.tags || [],
                        color: m.color || '#10b981',
                        createdAt: m.created_at,
                        items: specs.map(s => ({
                            id: s.id,
                            erpName: s.erp_name || "",
                            address: s.address || "",
                            capacity: s.capacity || 600,
                            quantity: s.quantity || 12,
                            stationName: s.station_name || "",
                            createdAt: s.created_at
                        })),
                        capacity: repSpec ? repSpec.capacity : 600,
                        quantity: repSpec ? repSpec.quantity : 12,
                        stationName: repSpec ? repSpec.station_name : (m.name || "")
                    };
                });
            } catch (e) {
                console.error('Supabase 축전지 데이터 조회 실패:', e);
                this.showToast('Supabase 데이터 조회 실패로 로컬 캐시 데이터로 백업합니다.', 4000);
                dataToExport = this.markersData;
            }
        }

        if (dataToExport.length === 0) {
            this.showToast('백업할 축전지 마커가 없습니다.');
            return;
        }
        try {
            const count = DataManager.exportBatteryMarkersToExcel(dataToExport);
            this.showToast(`축전지 마커 Excel 백업 완료 (총 ${count}건의 세부스펙행 내보냄)`);
        } catch (e) {
            this.showToast('Excel 백업 오류: ' + e.message);
        }
    }
}

// DOM 로딩 완료 시 앱 구동
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MapMarkerApp();
});
