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

class MapMarkerApp {
    constructor() {
        // 상태 정의
        this.map = null;
        this.placesService = null;
        this.markersData = []; // { id, name, lat, lng, memo, tags, createdAt }
        this.mapMarkers = new Map(); // id -> kakao.maps.Marker
        this.customOverlays = new Map(); // id -> kakao.maps.CustomOverlay
        this.tempMarker = null; // 클릭시 생성되는 임시 마커
        this.currentEditingId = null; // 현재 편집 중인 마커 ID (null이면 신규 등록)
        this.focusedMarkerIndex = -1; // 키보드 탐색을 위한 포커스된 마커 인덱스
        
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
        
        this.exportCsvBtn = document.getElementById('export-csv-btn');
        this.exportJsonBtn = document.getElementById('export-json-btn');
        this.importJsonFile = document.getElementById('import-json-file');
        
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
    }

    bindEvents() {
        // 검색 이벤트
        this.searchBtn.addEventListener('click', () => this.handleSearch());
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });
        this.closeSearchBtn.addEventListener('click', () => this.hideSearchResults());
        
        // 필터링 이벤트
        this.markerFilter.addEventListener('input', () => {
            this.focusedMarkerIndex = -1;
            this.renderMarkersList();
        });
        this.markerFilter.addEventListener('keydown', (e) => this.handleMarkerFilterKeydown(e));
        
        // 데이터 내보내기/가져오기 이벤트
        this.exportCsvBtn.addEventListener('click', () => this.handleExportCSV());
        this.exportJsonBtn.addEventListener('click', () => this.handleExportJSON());
        this.importJsonFile.addEventListener('change', (e) => this.handleImportJSON(e));
        
        // Excel/CSV 업로드 이벤트 바인딩
        this.importExcelFile.addEventListener('change', (e) => this.handleImportExcel(e));
        
        // 대기 마커 제어 이벤트 바인딩
        this.uploadPendingBtn.addEventListener('click', () => this.handleUploadPending());
        this.cancelPendingBtn.addEventListener('click', () => this.handleCancelPending());
        
        // 지도 플로팅 컨트롤 이벤트
        this.myLocationBtn.addEventListener('click', () => this.goToMyLocation());
        this.zoomInBtn.addEventListener('click', () => this.zoomMap(true));
        this.zoomOutBtn.addEventListener('click', () => this.zoomMap(false));
        
        // 모달 이벤트
        this.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.cancelModalBtn.addEventListener('click', () => this.closeModal());
        this.saveMarkerBtn.addEventListener('click', () => this.handleSaveMarker());
        this.deleteMarkerModalBtn.addEventListener('click', () => this.handleDeleteMarker(this.currentEditingId));
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

        // 상세 정보 테이블 드래그 범위 선택 및 단축키 복사 이벤트 바인딩
        this.dragStartCell = null;
        this.isDragSelecting = false;

        const infoTable = document.getElementById('detailed-info-table');
        if (infoTable) {
            infoTable.addEventListener('mousedown', (e) => {
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
                    const td = e.target.closest('td');
                    if (td) {
                        const val = td.textContent.trim();
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
            const isCopyKey = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c';
            if (isCopyKey) {
                const selectedCells = document.querySelectorAll('#detailed-info-table-body .cell-selected');
                if (selectedCells.length > 0) {
                    e.preventDefault();
                    this.handleCopySelectedCells();
                }
            }
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
                const { data, error } = await this.supabase
                    .from('markers')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                if (error) throw error;
                
                this.markersData = (data || []).map(row => ({
                    id: row.id,
                    name: row.name,
                    lat: row.lat,
                    lng: row.lng,
                    memo: row.memo || "",
                    tags: row.tags || [],
                    facilityCode: row.facility_code || "",
                    createdAt: row.created_at ? row.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
                }));
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
        
        this.renderMarkersList();
    }

    loadFromLocalStorage() {
        const saved = localStorage.getItem('saved_markers');
        if (saved) {
            try {
                this.markersData = JSON.parse(saved);
            } catch (e) {
                console.error("저장된 마커 파싱 오류:", e);
                this.markersData = [];
            }
        }
    }

    // 지도 인스턴스 생성 및 초기화
    initializeMap() {
        const mapContainer = document.getElementById('map');
        const defaultCenter = new kakao.maps.LatLng(35.159542, 126.8526012); // 광주광역시청 기준
        
        const mapOption = {
            center: defaultCenter,
            level: 3, // 지도 확대 레벨
            mapTypeId: kakao.maps.MapTypeId.HYBRID // [스카이뷰 변경] 위성 지도 + 도로명 레이아웃
        };
        
        try {
            this.map = new kakao.maps.Map(mapContainer, mapOption);
            this.placesService = new kakao.maps.services.Places();
            
            // 지도 컨트롤 및 입력창 활성화
            this.searchInput.disabled = false;
            this.searchBtn.disabled = false;
            
            // [클릭 등록 비활성화] 지도 클릭 이벤트 리스너 제거
            // 기존: kakao.maps.event.addListener(this.map, 'click', ...)
            
            // 기존 저장된 마커 지도 위에 표시
            this.renderMarkersOnMap();
            
            this.showToast('지도가 준비되었습니다. Excel 파일을 업로드하여 핀을 꽂아보세요.');
        } catch (e) {
            console.error("지도 생성 중 에러 발생:", e);
            this.showToast('지도 초기화 오류가 발생했습니다. 개발자 도구를 확인해 주세요.', 5000);
        }
    }

    // 지도 상의 특정 좌표 클릭 이벤트
    handleMapClick(latLng) {
        // 이미 생성된 임시 마커가 있다면 제거
        this.clearTempMarker();
        
        // 임시 마커 생성 (저장 전 상태 시각화)
        this.tempMarker = new kakao.maps.Marker({
            position: latLng,
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
            modalAddrEl.textContent = '주소 조회 중...';
            this.resolveAddress(lat, lng, (addr) => {
                modalAddrEl.textContent = addr || '주소를 확인할 수 없음';
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
        if (this.detailedInfoFormWrapper) this.detailedInfoFormWrapper.classList.remove('hidden');
        if (this.detailedInfoTableWrapper) this.detailedInfoTableWrapper.classList.add('hidden');
        
        this.markerModal.classList.remove('hidden');
        this.markerNameInput.focus();
    }

    // 모달창 내 입력 필드 읽기 전용 토글 헬퍼 함수
    toggleModalReadOnly(isReadOnly) {
        // 위도, 경도는 항상 읽기 전용이므로 장소명, 메모, 태그 및 추가 상세 정보 필드들을 제어
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
            this.markerOpenDateInput
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
                    data.forEach(row => {
                        const tr = document.createElement('tr');
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
            modalAddrEl.textContent = '주소 조회 중...';
            this.resolveAddress(markerData.lat, markerData.lng, (addr) => {
                modalAddrEl.textContent = addr || '주소를 확인할 수 없음';
            });
        }

        // 상세 정보 폼 값 세팅 (로컬 캐시 값 우선)
        if (this.markerFacilityCodeInput) this.markerFacilityCodeInput.value = markerData.facilityCode || '';
        if (this.markerProjectCodeInput) this.markerProjectCodeInput.value = markerData.projectCode || '';
        if (this.markerFacilityYearInput) this.markerFacilityYearInput.value = markerData.facilityYear || '';
        if (this.markerBusinessTypeInput) this.markerBusinessTypeInput.value = markerData.businessType || '';
        if (this.markerFinalStationNameInput) this.markerFinalStationNameInput.value = markerData.finalStationName || '';
        if (this.markerEqClassInput) this.markerEqClassInput.value = markerData.eqClass || '';
        if (this.markerEqTypeInput) this.markerEqTypeInput.value = markerData.eqType || '';
        if (this.markerInstallDateInput) this.markerInstallDateInput.value = this.formatToShortDate(markerData.installDate);
        if (this.markerOpenDateInput) this.markerOpenDateInput.value = this.formatToShortDate(markerData.openDate);

        // 상세 정보 테이블 값 세팅 (로컬 캐시 기준 1행 기본 렌더링, 추후 Supabase 조회 성공 시 연동행 덮어씀)
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
        
        // 폼 잠금 및 버튼 숨김 설정
        this.toggleModalReadOnly(true);
        this.saveMarkerBtn.classList.add('hidden');
        this.deleteMarkerModalBtn.classList.add('hidden');
        this.cancelModalBtn.textContent = '닫기';

        // 테이블 뷰 토글
        if (this.detailedInfoFormWrapper) this.detailedInfoFormWrapper.classList.add('hidden');
        if (this.detailedInfoTableWrapper) this.detailedInfoTableWrapper.classList.remove('hidden');
        
        this.markerModal.classList.remove('hidden');
        this.cancelModalBtn.focus();

        // Supabase DB 실시간 최신 정보 조회 시도 (국소명 기준으로 일치하는 장비들 모두 쿼리)
        if (!markerData.isPending && this.supabase) {
            this.fetchAndBindDetailedInfo(markerData.name, markerData.facilityCode);
        }
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
            modalAddrEl.textContent = '주소 조회 중...';
            this.resolveAddress(markerData.lat, markerData.lng, (addr) => {
                modalAddrEl.textContent = addr || '주소를 확인할 수 없음';
            });
        }
        
        // 상세 정보 폼 값 세팅 (로컬 캐시 값 우선)
        if (this.markerFacilityCodeInput) this.markerFacilityCodeInput.value = markerData.facilityCode || '';
        if (this.markerProjectCodeInput) this.markerProjectCodeInput.value = markerData.projectCode || '';
        if (this.markerFacilityYearInput) this.markerFacilityYearInput.value = markerData.facilityYear || '';
        if (this.markerBusinessTypeInput) this.markerBusinessTypeInput.value = markerData.businessType || '';
        if (this.markerFinalStationNameInput) this.markerFinalStationNameInput.value = markerData.finalStationName || '';
        if (this.markerEqClassInput) this.markerEqClassInput.value = markerData.eqClass || '';
        if (this.markerEqTypeInput) this.markerEqTypeInput.value = markerData.eqType || '';
        if (this.markerInstallDateInput) this.markerInstallDateInput.value = this.formatToShortDate(markerData.installDate);
        if (this.markerOpenDateInput) this.markerOpenDateInput.value = this.formatToShortDate(markerData.openDate);
        
        // 폼 잠금 해제 및 저장 버튼 노출 설정
        this.toggleModalReadOnly(false);
        this.saveMarkerBtn.classList.remove('hidden');
        this.cancelModalBtn.textContent = '취소';

        // 테이블 뷰 토글 (상세 보기 모드와 동일하게 상세장비정보를 테이블 형태로 노출하도록 변경)
        if (this.detailedInfoFormWrapper) this.detailedInfoFormWrapper.classList.add('hidden');
        if (this.detailedInfoTableWrapper) this.detailedInfoTableWrapper.classList.remove('hidden');
        
        // 대기 상태(isPending)가 아닐 때만 삭제 버튼 노출
        if (markerData.isPending) {
            this.deleteMarkerModalBtn.classList.add('hidden');
        } else {
            this.deleteMarkerModalBtn.classList.remove('hidden');
        }
        
        this.markerModal.classList.remove('hidden');
        this.markerNameInput.focus();

        // Supabase DB 실시간 최신 정보 조회 시도
        if (!markerData.isPending && this.supabase) {
            this.fetchAndBindDetailedInfo(markerData.name, markerData.facilityCode);
        }
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
            const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
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

        // 상세 정보 입력 값 취득
        const facilityCode = this.markerFacilityCodeInput ? this.markerFacilityCodeInput.value.trim() : "";
        const projectCode = this.markerProjectCodeInput ? this.markerProjectCodeInput.value.trim() : "";
        const facilityYear = this.markerFacilityYearInput ? this.markerFacilityYearInput.value.trim() : "";
        const businessType = this.markerBusinessTypeInput ? this.markerBusinessTypeInput.value.trim() : "";
        const finalStationName = this.markerFinalStationNameInput ? this.markerFinalStationNameInput.value.trim() : "";
        const eqClass = this.markerEqClassInput ? this.markerEqClassInput.value.trim() : "";
        const eqType = this.markerEqTypeInput ? this.markerEqTypeInput.value.trim() : "";
        const installDate = this.markerInstallDateInput ? this.markerInstallDateInput.value.trim() : "";
        const openDate = this.markerOpenDateInput ? this.markerOpenDateInput.value.trim() : "";

        // 통합시설코드 중복 검증
        if (facilityCode) {
            const isDuplicate = this.markersData.some(m => m.facilityCode === facilityCode && m.id !== this.currentEditingId);
            if (isDuplicate) {
                this.showToast('이미 등록된 통합시설코드입니다. 중복은 허용되지 않습니다.', 5000);
                if (this.markerFacilityCodeInput) this.markerFacilityCodeInput.focus();
                return;
            }
        }
            
        if (this.currentEditingId) {
            // 수정 모드
            const index = this.markersData.findIndex(m => m.id === this.currentEditingId);
            if (index !== -1) {
                const updatedItem = {
                    ...this.markersData[index],
                    name,
                    memo,
                    tags,
                    facilityCode,
                    projectCode,
                    facilityYear,
                    businessType,
                    finalStationName,
                    eqClass,
                    eqType,
                    installDate,
                    openDate
                };

                // 대기 마커(isPending = true)가 아닐 때만 Supabase 데이터 업데이트를 진행함
                if (this.supabase && !updatedItem.isPending) {
                    try {
                        // 1. markers 테이블 업데이트
                        const { error } = await this.supabase
                            .from('markers')
                            .update({
                                name: updatedItem.name,
                                memo: updatedItem.memo,
                                tags: updatedItem.tags,
                                facility_code: updatedItem.facilityCode || null
                            })
                            .eq('id', this.currentEditingId);
                        
                        if (error) throw error;

                        // 2. information 테이블 upsert (통합시설코드가 있는 경우)
                        if (updatedItem.facilityCode) {
                            const { error: infoErr } = await this.supabase
                                .from('information')
                                .upsert({
                                    facility_code: updatedItem.facilityCode,
                                    place_name: updatedItem.name,
                                    facility_year: updatedItem.facilityYear || "",
                                    project_code: updatedItem.projectCode || "",
                                    business_type: updatedItem.businessType || "",
                                    final_station_name: updatedItem.finalStationName || "",
                                    eq_class: updatedItem.eqClass || "",
                                    eq_type: updatedItem.eqType || "",
                                    install_date: updatedItem.installDate || "",
                                    open_date: updatedItem.openDate || ""
                                });
                            if (infoErr) throw infoErr;
                        }
                    } catch (e) {
                        this.showToast('Supabase 데이터 수정 실패: ' + e.message, 5000);
                        return;
                    }
                }

                // 수정 시 기존 정보 중 위도, 경도 좌표는 변경 없이 보존
                this.markersData[index] = updatedItem;
                this.showToast('마커 정보가 수정되었습니다.');
            }
        } else {
            // 신규 추가 모드
            const newMarker = {
                id: 'marker_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                name,
                lat, // 정밀한 Float 값 보존
                lng, // 정밀한 Float 값 보존
                memo,
                tags,
                facilityCode,
                projectCode,
                facilityYear,
                businessType,
                finalStationName,
                eqClass,
                eqType,
                installDate,
                openDate,
                createdAt: new Date().toISOString().split('T')[0]
            };

            if (this.supabase) {
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
                            facility_code: newMarker.facilityCode || null,
                            created_at: new Date().toISOString()
                        });
                    
                    if (error) throw error;

                    // 2. information 테이블 upsert (통합시설코드가 있는 경우)
                    if (newMarker.facilityCode) {
                        const { error: infoErr } = await this.supabase
                            .from('information')
                            .upsert({
                                facility_code: newMarker.facilityCode,
                                place_name: newMarker.name,
                                facility_year: newMarker.facilityYear || "",
                                project_code: newMarker.projectCode || "",
                                business_type: newMarker.businessType || "",
                                final_station_name: newMarker.finalStationName || "",
                                eq_class: newMarker.eqClass || "",
                                eq_type: newMarker.eqType || "",
                                install_date: newMarker.installDate || "",
                                open_date: newMarker.openDate || ""
                            });
                        if (infoErr) throw infoErr;
                    }
                } catch (e) {
                    this.showToast('Supabase 데이터 추가 실패: ' + e.message, 5000);
                    return;
                }
            }

            this.markersData.push(newMarker);
            this.showToast('새 마커가 성공적으로 등록되었습니다.');
        }
        
        // 로컬 저장소 동기화
        this.syncLocalStorage();
        
        // 지도 및 사이드바 목록 리렌더링
        this.renderMarkersOnMap();
        this.renderMarkersList();
        
        this.closeModal();
    }

    // 마커 삭제 로직
    async handleDeleteMarker(id) {
        if (!confirm('이 마커를 삭제하시겠습니까?')) return;
        
        if (this.supabase) {
            try {
                const { error } = await this.supabase
                    .from('markers')
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
        
        this.renderMarkersList();
        this.closeModal();
        this.showToast('마커가 삭제되었습니다.');
    }

    removeMarkerFromMap(id) {
        if (this.mapMarkers.has(id)) {
            this.mapMarkers.get(id).setMap(null);
            this.mapMarkers.delete(id);
        }
        if (this.customOverlays.has(id)) {
            this.customOverlays.get(id).setMap(null);
            this.customOverlays.delete(id);
        }
    }

    syncLocalStorage() {
        const permanentMarkers = this.markersData.filter(m => !m.isPending);
        localStorage.setItem('saved_markers', JSON.stringify(permanentMarkers));
    }

    // 지도 상에 저장된 모든 마커 렌더링
    renderMarkersOnMap() {
        if (!this.map) return;
        
        // 기존 마커 전체 클리어
        this.mapMarkers.forEach((marker, id) => marker.setMap(null));
        this.mapMarkers.clear();
        this.customOverlays.forEach((overlay, id) => overlay.setMap(null));
        this.customOverlays.clear();
        
        // 현재 데이터셋 순회하며 마커 생성
        this.markersData.forEach(data => {
            const position = new kakao.maps.LatLng(data.lat, data.lng);
            
            // 1. 마커 객체 생성 (대기 상태 마커인 경우 노란 별 모양 이미지 적용)
            const markerImage = data.isPending ? new kakao.maps.MarkerImage(
                'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png',
                new kakao.maps.Size(24, 35)
            ) : null;

            const marker = new kakao.maps.Marker({
                position: position,
                map: this.map,
                title: data.name,
                image: markerImage,
                draggable: true // 마우스 드래그로 위치 이동 활성화
            });
            
            this.mapMarkers.set(data.id, marker);
            
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
            
            // 마커 클릭 시 커스텀 오버레이 토글
            kakao.maps.event.addListener(marker, 'click', () => {
                this.closeAllOverlays();
                overlay.setMap(this.map);
                this.map.panTo(marker.getPosition());
            });

            // 마커 드래그 완료 시 좌표 갱신 및 DB/메모리 동기화 처리
            kakao.maps.event.addListener(marker, 'dragend', () => {
                this.handleMarkerDragEnd(data.id, marker.getPosition());
            });
        });
    }

    closeAllOverlays() {
        this.customOverlays.forEach(overlay => overlay.setMap(null));
    }

    // 마커 드래그 이동 종료 시 좌표 업데이트 및 Supabase 연동 처리
    async handleMarkerDragEnd(id, newPosition) {
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
                    const { error } = await this.supabase
                        .from('markers')
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
            this.showToast(`대기 마커 '${markerData.name}'의 위치를 수정했습니다. (전송 시 반영)`);
        }
    }

    // 카카오 Geocoder를 통한 역지오코딩 주소 조회
    resolveAddress(lat, lng, callback) {
        if (!window.kakao || !kakao.maps || !kakao.maps.services) return;
        const geocoder = new kakao.maps.services.Geocoder();
        const coord = new kakao.maps.LatLng(lat, lng);
        geocoder.coord2Address(coord.getLng(), coord.getLat(), (result, status) => {
            if (status === kakao.maps.services.Status.OK && result.length > 0) {
                const addr = result[0].road_address
                    ? result[0].road_address.address_name
                    : result[0].address.address_name;
                callback(addr);
            } else {
                callback('');
            }
        });
    }

    // 세련된 형태의 HTML 커스텀 오버레이 빌딩
    createOverlayContent(data) {
        const container = document.createElement('div');
        container.className = 'custom-overlay';
        
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
        });
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        container.appendChild(header);

        // 주소 표시 영역 (역지오코딩으로 비동기 로드)
        const addressDiv = document.createElement('div');
        addressDiv.className = 'overlay-address';
        addressDiv.textContent = '주소 조회 중...';
        container.appendChild(addressDiv);
        this.resolveAddress(data.lat, data.lng, (addr) => {
            addressDiv.textContent = addr || '주소를 확인할 수 없음';
        });
        
        if (data.memo) {
            const memo = document.createElement('div');
            memo.className = 'overlay-memo';
            memo.textContent = data.memo;
            container.appendChild(memo);
        }
        
        const actions = document.createElement('div');
        actions.className = 'overlay-actions';
        
        // 상세 보기 버튼 추가
        const detailBtn = document.createElement('button');
        detailBtn.className = 'overlay-btn overlay-btn-detail';
        detailBtn.style.background = 'rgba(255, 255, 255, 0.08)';
        detailBtn.style.color = 'var(--text-primary)';
        detailBtn.textContent = '상세';
        detailBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openDetailMarkerModal(data.id);
        });
        
        // 편집 버튼 추가
        const editBtn = document.createElement('button');
        editBtn.className = 'overlay-btn overlay-btn-edit';
        editBtn.textContent = '편집';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openEditMarkerModal(data.id);
        });
        
        actions.appendChild(detailBtn);
        actions.appendChild(editBtn);
        container.appendChild(actions);
        
        return container;
    }

    // 대기 마커 단건 전송 처리
    async handleUploadSinglePending(id) {
        const marker = this.markersData.find(m => m.id === id);
        if (!marker) return;

        if (this.supabase) {
            try {
                this.showToast('Supabase 전송 중...');
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
                        facility_code: marker.facilityCode || null,
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
                            install_date: marker.installDate || "",
                            open_date: marker.openDate || ""
                        });
                    if (infoErr) throw infoErr;
                }
            } catch (e) {
                this.showToast('Supabase 전송 실패: ' + e.message, 5000);
                return;
            }
        }

        // 임시 플래그 제거 및 로컬스토리지 저장
        marker.isPending = false;
        this.syncLocalStorage();
        
        // UI 갱신
        this.updatePendingUI();
        this.renderMarkersOnMap();
        this.renderMarkersList();
        this.showToast('선택한 위치가 Supabase에 저장되었습니다.');
    }

    // 왼쪽 사이드바 마커 목록 렌더링
    renderMarkersList() {
        const filterText = this.markerFilter.value.trim().toLowerCase();
        
        // 목록 리셋
        this.markersList.innerHTML = '';
        
        const pendingMarkers = this.markersData.filter(m => m.isPending);

        // 검색어(필터)가 없는 경우 리스트를 렌더링하지 않으나, 대기 중인 마커가 있으면 대기 마커 리스트 노출
        if (!filterText) {
            this.markerCount.textContent = this.markersData.length;
            
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
        const filtered = this.markersData.filter(marker => {
            const nameMatch = marker.name.toLowerCase().includes(filterText);
            const memoMatch = (marker.memo || '').toLowerCase().includes(filterText);
            const tagMatch = (marker.tags || []).some(t => t.toLowerCase().includes(filterText));
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
            if (highlightPending && marker.isPending) {
                item.className = 'marker-item pending-item';
                item.style.borderLeft = '3px solid #f59e0b';
            }
            
            // 마커 항목 마크업 조립
            item.innerHTML = `
                <div class="marker-item-header" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                    <h3 class="marker-title" style="flex-grow: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 0;" title="${marker.name}">
                        ${marker.isPending ? `<span style="color: #f59e0b; font-size: 10px; margin-right: 4px;"><i class="fa-solid fa-clock"></i> 대기</span>` : ''}
                        ${marker.name}
                    </h3>
                    ${marker.isPending ? `
                        <button class="btn-send-single" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer; flex-shrink: 0; font-weight: 500;">
                            전송
                        </button>
                    ` : ''}
                    <span class="marker-date" style="flex-shrink: 0; font-size: 10px; color: var(--text-muted);">${marker.createdAt}</span>
                </div>
                ${marker.memo ? `<p class="marker-memo" style="margin-top: 4px;">${marker.memo}</p>` : ''}
                <div class="marker-tags" style="margin-top: 6px;">
                    ${(marker.tags || []).map(tag => `<span class="tag">#${tag}</span>`).join('')}
                </div>
            `;
            
            // 개별 전송 버튼 이벤트 바인딩
            const sendBtn = item.querySelector('.btn-send-single');
            if (sendBtn) {
                sendBtn.addEventListener('click', async (e) => {
                    e.stopPropagation(); // 리스트 아이템 클릭(지도 포커싱) 이벤트 버블링 방지
                    await this.handleUploadSinglePending(marker.id);
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

    // 장소 키워드 검색
    handleSearch() {
        const query = this.searchInput.value.trim();
        if (!query) {
            this.showToast('검색어를 입력해 주세요.');
            this.searchInput.focus();
            return;
        }
        
        if (!this.placesService) {
            this.showToast('카카오 지도 서비스가 아직 준비되지 않았습니다.');
            return;
        }
        
        this.placesService.keywordSearch(query, (result, status) => {
            if (status === kakao.maps.services.Status.OK) {
                this.displaySearchResults(result);
            } else if (status === kakao.maps.services.Status.ZERO_RESULT) {
                this.showToast('검색 결과가 존재하지 않습니다.');
                this.hideSearchResults();
            } else {
                this.showToast('검색 중 오류가 발생했습니다.');
                this.hideSearchResults();
            }
        });
    }

    displaySearchResults(results) {
        this.searchResultsList.innerHTML = '';
        
        results.forEach(place => {
            const item = document.createElement('li');
            item.className = 'result-item';
            
            item.innerHTML = `
                <div class="result-name">${place.place_name}</div>
                <div class="result-address">${place.road_address_name || place.address_name}</div>
            `;
            
            item.addEventListener('click', () => {
                const lat = parseFloat(place.y);
                const lng = parseFloat(place.x);
                const position = new kakao.maps.LatLng(lat, lng);
                
                // 지도 포커스 이동
                this.map.setCenter(position);
                this.map.setLevel(3);
                
                // 임시 마커 생성 및 정보 모달 오픈
                this.handleMapClick(position);
                // 모달 폼에 장소명 자동 기입
                this.markerNameInput.value = place.place_name;
                
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

    // 데이터 내보내기 CSV
    handleExportCSV() {
        if (this.markersData.length === 0) {
            this.showToast('내보낼 마커가 없습니다.');
            return;
        }
        try {
            const stats = DataManager.exportToCSV(this.markersData);
            this.showToast(`성공적으로 CSV 내보내기가 완료되었습니다. (총 ${stats.rowCount}건)`);
        } catch (e) {
            this.showToast('CSV 내보내기 오류: ' + e.message);
        }
    }

    // 데이터 내보내기 JSON
    handleExportJSON() {
        if (this.markersData.length === 0) {
            this.showToast('백업할 마커가 없습니다.');
            return;
        }
        try {
            const count = DataManager.exportToJSON(this.markersData);
            this.showToast(`JSON 백업이 완료되었습니다. (총 ${count}건)`);
        } catch (e) {
            this.showToast('JSON 백업 오류: ' + e.message);
        }
    }

    // 데이터 가져오기 JSON
    handleImportJSON(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        DataManager.importFromJSON(file)
            .then(async (newMarkers) => {
                // 기존 데이터에 병합 (중복 아이디 방지)
                const existingIds = new Set(this.markersData.map(m => m.id));
                const merged = [...this.markersData];
                
                let addedCount = 0;
                const dbInsertQueue = [];

                newMarkers.forEach(m => {
                    if (!existingIds.has(m.id)) {
                        merged.push(m);
                        dbInsertQueue.push(m);
                        addedCount++;
                    } else {
                        // 중복 ID가 존재할 경우 신규 아이디 발급하여 추가
                        m.id = 'marker_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                        merged.push(m);
                        dbInsertQueue.push(m);
                        addedCount++;
                    }
                });

                if (this.supabase && dbInsertQueue.length > 0) {
                    try {
                        const bulkData = dbInsertQueue.map(m => ({
                            id: m.id,
                            name: m.name,
                            lat: m.lat,
                            lng: m.lng,
                            memo: m.memo || "",
                            tags: m.tags || [],
                            created_at: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString()
                        }));

                        const { error } = await this.supabase
                            .from('markers')
                            .insert(bulkData);
                        
                        if (error) throw error;
                    } catch (e) {
                        this.showToast('Supabase JSON 동기화 실패: ' + e.message, 5000);
                        this.importJsonFile.value = '';
                        return;
                    }
                }

                this.markersData = merged;
                this.syncLocalStorage();
                
                // 리렌더링
                this.renderMarkersOnMap();
                this.renderMarkersList();
                
                this.showToast(`성공적으로 데이터를 복원했습니다. (새로 추가된 장소: ${addedCount}개)`);
                // 파일 인풋 클리어
                this.importJsonFile.value = '';
            })
            .catch(err => {
                this.showToast(err.message, 5000);
                this.importJsonFile.value = '';
            });
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
                
                // 지도 및 리스트 갱신
                this.renderMarkersOnMap();
                this.renderMarkersList();
                
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

    // 대기 마커 전체 Supabase 전송
    async handleUploadPending() {
        const pendingMarkers = this.markersData.filter(m => m.isPending);
        if (pendingMarkers.length === 0) return;

        if (this.supabase) {
            try {
                this.showToast('Supabase로 전체 전송 중...');
                // 1. markers 벌크 데이터 생성
                const bulkMarkers = pendingMarkers.map(m => ({
                    id: m.id,
                    name: m.name,
                    lat: m.lat,
                    lng: m.lng,
                    memo: m.memo || "",
                    tags: m.tags || [],
                    facility_code: m.facilityCode || null,
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
                        install_date: m.installDate || "",
                        open_date: m.openDate || ""
                    }));

                if (bulkInfo.length > 0) {
                    const { error: infoErr } = await this.supabase
                        .from('information')
                        .upsert(bulkInfo);
                    if (infoErr) throw infoErr;
                }
            } catch (e) {
                this.showToast('Supabase 일괄 전송 실패: ' + e.message, 5000);
                return;
            }
        }

        // 전체 대기 상태 제거 및 로컬스토리지 저장
        pendingMarkers.forEach(m => m.isPending = false);
        this.syncLocalStorage();

        // UI 갱신
        this.updatePendingUI();
        this.renderMarkersOnMap();
        this.renderMarkersList();
        this.showToast(`성공적으로 ${pendingMarkers.length}개의 위치를 Supabase에 저장했습니다.`);
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
        this.renderMarkersList();
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
        if (!this.pendingInfoData || this.pendingInfoData.length === 0) {
            this.showToast('전송할 데이터가 없습니다.');
            return;
        }

        if (!this.supabase) {
            this.showToast('Supabase가 연결되지 않았습니다. config.js를 확인하세요.', 5000);
            return;
        }

        // 전송 버튼 비활성화 (중복 클릭 방지)
        if (this.sendInfoConfirmBtn) {
            this.sendInfoConfirmBtn.disabled = true;
            this.sendInfoConfirmBtn.textContent = '전송 중...';
        }

        try {
            const { error } = await this.supabase
                .from('information')
                .upsert(this.pendingInfoData, { onConflict: 'facility_code' });

            if (error) throw error;

            const count = this.pendingInfoData.length;
            this.closeInfoConfirmModal();
            this.showToast(`상세 장비 정보 ${count}건이 Supabase에 성공적으로 전송되었습니다.`, 5000);
        } catch (e) {
            this.showToast('Supabase 전송 실패: ' + e.message, 5000);
        } finally {
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

    // 날짜 문자열을 yy-mm-dd 포맷으로 변환하는 헬퍼 메서드
    formatToShortDate(dateStr) {
        if (!dateStr) return '';
        
        // 만약 Date 객체 파싱이 가능하면 Date로 변환해 포맷
        let date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            // "2026.06.06" -> "2026-06-06" 등으로 특수문자 보정 시도
            const cleaned = dateStr.replace(/[^0-9]/g, '');
            if (cleaned.length === 8) { // YYYYMMDD
                const yy = cleaned.substring(2, 4);
                const mm = cleaned.substring(4, 6);
                const dd = cleaned.substring(6, 8);
                return `${yy}-${mm}-${dd}`;
            } else if (cleaned.length === 6) { // YYMMDD
                const yy = cleaned.substring(0, 2);
                const mm = cleaned.substring(2, 4);
                const dd = cleaned.substring(4, 6);
                return `${yy}-${mm}-${dd}`;
            }
            return dateStr; // 파싱 불가 시 원본 반환
        }
        
        const yy = String(date.getFullYear()).substring(2, 4);
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yy}-${mm}-${dd}`;
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
                const rowVals = selectedTds.map(td => td.textContent.trim());
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
                colVals.push(tds[colIndex].textContent.trim());
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
}

// DOM 로딩 완료 시 앱 구동
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MapMarkerApp();
});
