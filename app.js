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

// 커스텀 SVG 마커 이미지 정의 (에메랄드 그린 & 오렌지 골드)
const MARKER_SVG_EMERALD = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="30" height="45">
  <defs>
    <linearGradient id="pin-emerald" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10b981" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
  </defs>
  <path d="M12,2 C6.48,2 2,6.48 2,12 C2,19.2 12,34 12,34 C12,34 22,19.2 22,12 C22,6.48 17.52,2 12,2 Z" fill="url(#pin-emerald)" stroke="#ffffff" stroke-width="1.5"/>
  <circle cx="12" cy="12" r="4.5" fill="#ffffff"/>
</svg>`);

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
        this.currentEditingId = null; // 현재 편집 중인 마커 ID (null이면 신규 등록)
        this.focusedMarkerIndex = -1; // 키보드 탐색을 위한 포커스된 마커 인덱스
        this.currentRoadview = null; // 현재 활성화된 로드뷰 객체
        this.lastLoadedPanoId = null; // 마지막으로 가져온 촬영 일자의 파노라마 ID
        this.currentMovingMarkerId = null; // 현재 위치 이동 수정 중인 마커 ID
        this.originalMarkerPosition = null; // 위치 수정 전 원래 좌표 (LatLng)
        this.mapClickMoveListener = null; // 위치 수정 중 지도 클릭 감지 리스너
        
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
        this.importMarkersJsonFile = document.getElementById('import-markers-json-file');
        this.exportInfoJsonBtn = document.getElementById('export-info-json-btn');
        this.importInfoJsonFile = document.getElementById('import-info-json-file');
        
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
        
        if (this.backupAccordionToggle) {
            this.backupAccordionToggle.addEventListener('click', () => {
                this.backupAccordionToggle.closest('.sidebar-footer').classList.toggle('active');
                this.backupAccordionContent.classList.toggle('hidden');
            });
        }
        if (this.exportMarkersJsonBtn) {
            this.exportMarkersJsonBtn.addEventListener('click', () => this.handleExportMarkersJSON());
        }
        if (this.importMarkersJsonFile) {
            this.importMarkersJsonFile.addEventListener('change', (e) => this.handleImportMarkersJSON(e));
        }
        if (this.exportInfoJsonBtn) {
            this.exportInfoJsonBtn.addEventListener('click', () => this.handleExportInfoJSON());
        }
        if (this.importInfoJsonFile) {
            this.importInfoJsonFile.addEventListener('change', (e) => this.handleImportInfoJSON(e));
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
                
                // 4. markersData 구성 시 place_name 기준으로 information 정보 결합
                this.markersData = (markersList || []).map(row => {
                    const markerName = row.name ? row.name.trim() : "";
                    const infos = infoMap.get(markerName) || [];
                    
                    // N개의 장비 중 첫 번째 정보를 대표 정보로 사용
                    const repInfo = infos[0] || null;
                    
                    return {
                        id: row.id,
                        name: row.name,
                        lat: row.lat,
                        lng: row.lng,
                        memo: row.memo || "",
                        tags: row.tags || [],
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
                this.markersData = JSON.parse(saved);
            } catch (e) {
                console.error("저장된 마커 파싱 오류:", e);
                this.markersData = [];
            }
        }
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
        // 1. 고유 연도 및 사업구분 수집
        const yearsSet = new Set();
        const businessesSet = new Set();

        this.markersData.forEach(marker => {
            const year = marker.facilityYear ? marker.facilityYear.toString().trim() : "미지정";
            const business = marker.businessType ? marker.businessType.toString().trim() : "미지정";
            yearsSet.add(year);
            businessesSet.add(business);
        });

        // 2. 정렬
        // 연도는 숫자 기준 내림차순 정렬, "미지정"은 맨 아래로 배치
        this.uniqueYears = Array.from(yearsSet).sort((a, b) => {
            if (a === "미지정") return 1;
            if (b === "미지정") return -1;
            return parseInt(b) - parseInt(a);
        });

        // 사업구분은 사전식 오름차순 정렬, "미지정"은 맨 아래로 배치
        this.uniqueBusinesses = Array.from(businessesSet).sort((a, b) => {
            if (a === "미지정") return 1;
            if (b === "미지정") return -1;
            return a.localeCompare(b);
        });

        // 3. 첫 로드 시에는 전체 값을 기본 선택 상태로 셋업
        if (isFirstLoad) {
            this.selectedYears = new Set(this.uniqueYears);
            this.selectedBusinesses = new Set(this.uniqueBusinesses);
        } else {
            // 신규 데이터 추가/삭제 시 유효한 선택만 필터 셋에 남김
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
        }

        // 4. 드롭다운 HTML 렌더링
        this.renderFilterDropdowns();
    }

    // 커스텀 드롭다운 내 옵션 체크박스 리스트 그리기
    renderFilterDropdowns() {
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

            // 트리거 영역 라벨 갱신
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

            // 트리거 영역 라벨 갱신
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
    }

    // 특정 필터 옵션 선택 상태 토글 핸들러
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
        }

        // 라벨 및 스타일 리렌더링
        this.renderFilterDropdowns();

        // 필터링 상태 적용하여 지도 마커와 사이드바 목록 갱신
        this.renderMarkersOnMap();
        this.renderMarkersList();
    }

    // 모두 선택 기능 수행
    selectAllFilterOptions(type) {
        if (type === 'year') {
            this.selectedYears = new Set(this.uniqueYears);
        } else if (type === 'business') {
            this.selectedBusinesses = new Set(this.uniqueBusinesses);
        }

        // 라벨 및 스타일 리렌더링
        this.renderFilterDropdowns();

        // 필터링 상태 적용하여 지도 마커와 사이드바 목록 갱신
        this.renderMarkersOnMap();
        this.renderMarkersList();
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
                if (addrObj.roadAddress) {
                    html += `<div>${addrObj.roadAddress}</div>`;
                }
                if (addrObj.jibunAddress) {
                    html += `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">(지번) ${addrObj.jibunAddress}</div>`;
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
                if (addrObj.roadAddress) {
                    html += `<div>${addrObj.roadAddress}</div>`;
                }
                if (addrObj.jibunAddress) {
                    html += `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">(지번) ${addrObj.jibunAddress}</div>`;
                }
                if (!addrObj.roadAddress && !addrObj.jibunAddress) {
                    html = '주소를 확인할 수 없음';
                }
                modalAddrEl.innerHTML = html;
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
            modalAddrEl.innerHTML = '주소 조회 중...';
            this.resolveAddress(markerData.lat, markerData.lng, (addrObj) => {
                let html = '';
                if (addrObj.roadAddress) {
                    html += `<div>${addrObj.roadAddress}</div>`;
                }
                if (addrObj.jibunAddress) {
                    html += `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">(지번) ${addrObj.jibunAddress}</div>`;
                }
                if (!addrObj.roadAddress && !addrObj.jibunAddress) {
                    html = '주소를 확인할 수 없음';
                }
                modalAddrEl.innerHTML = html;
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
        this.clearCellSelection(); // 편집 진입 시 기존 셀 선택 하이라이트 리셋
        this.saveMarkerBtn.classList.remove('hidden');
        this.cancelModalBtn.textContent = '취소';

        // 테이블 뷰 토글 (상세 보기 모드와 동일하게 상세장비정보를 테이블 형태로 노출하도록 변경)
        if (this.detailedInfoFormWrapper) this.detailedInfoFormWrapper.classList.add('hidden');
        if (this.detailedInfoTableWrapper) this.detailedInfoTableWrapper.classList.remove('hidden');
        
        // 상세 정보 테이블 값 세팅 (로컬 캐시 기준 1행 기본 렌더링, 수정 가능한 input 형태)
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

        // 상세 정보 테이블에서 여러 개의 행 데이터 수집 시도
        const tbody = document.getElementById('detailed-info-table-body');
        const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
        let infoListToUpsert = [];
        
        // 폼 입력창에서 단일 필드 취득
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
                        install_date: rowData.install_date || "",
                        open_date: rowData.open_date || ""
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
                    install_date: installDate,
                    open_date: openDate
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
            
        if (this.currentEditingId) {
            // 수정 모드
            const index = this.markersData.findIndex(m => m.id === this.currentEditingId);
            if (index !== -1) {
                const repInfo = infoListToUpsert[0] || {};
                const updatedItem = {
                    ...this.markersData[index],
                    name,
                    memo,
                    tags,
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
                this.showToast('마커 정보가 수정되었습니다.');
            }
        } else {
            // 신규 추가 모드
            const repInfo = infoListToUpsert[0] || {};
            const newMarker = {
                id: 'marker_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                name,
                lat, // 정밀한 Float 값 보존
                lng, // 정밀한 Float 값 보존
                memo,
                tags,
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
            this.showToast('새 마커가 성공적으로 등록되었습니다.');
        }
        
        // 로컬 저장소 동기화
        this.syncLocalStorage();
        
        // 필터 초기화 및 리렌더링
        this.initFilters(false);
        
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
        
        // 필터 초기화
        this.initFilters(false);
        
        this.renderMarkersList();
        this.closeModal();
        this.showToast('마커가 삭제되었습니다.');
    }

    removeMarkerFromMap(id) {
        if (this.mapMarkers.has(id)) {
            const marker = this.mapMarkers.get(id);
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
        
        if (this.clusterer) {
            this.clusterer.clear();
        }
        
        const markersToCluster = [];
        
        // 현재 데이터셋 순회하며 마커 생성
        this.markersData.forEach(data => {
            // 필터링 적용 (연도 & 사업구분이 선택되어 있는지 확인)
            const year = data.facilityYear ? data.facilityYear.toString().trim() : "미지정";
            const business = data.businessType ? data.businessType.toString().trim() : "미지정";
            if (!this.selectedYears.has(year) || !this.selectedBusinesses.has(business)) {
                return;
            }

            const position = new kakao.maps.LatLng(data.lat, data.lng);
            
            // 1. 마커 객체 생성 (대기 상태 마커인 경우 골드, 일반 마커인 경우 에메랄드 그린 커스텀 SVG 적용)
            const markerImage = data.isPending
                ? new kakao.maps.MarkerImage(MARKER_SVG_GOLD, new kakao.maps.Size(30, 45), { offset: new kakao.maps.Point(15, 45) })
                : new kakao.maps.MarkerImage(MARKER_SVG_EMERALD, new kakao.maps.Size(30, 45), { offset: new kakao.maps.Point(15, 45) });

            const isMovingThis = this.currentMovingMarkerId === data.id;
            const marker = new kakao.maps.Marker({
                position: position,
                title: data.name,
                image: markerImage,
                draggable: isMovingThis // 현재 위치 수정 중인 마커만 드래그 가능
            });
            
            this.mapMarkers.set(data.id, marker);
            markersToCluster.push(marker);
            
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
                if (addrObj.roadAddress) {
                    html += `<span class="road-addr">${addrObj.roadAddress}</span>`;
                }
                if (addrObj.jibunAddress) {
                    html += `<span class="jibun-addr" style="font-size: 10px; color: var(--text-muted); display: block; margin-top: 2px;">(지번) ${addrObj.jibunAddress}</span>`;
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
        // 리스너 해제
        if (this.mapClickMoveListener) {
            kakao.maps.event.removeListener(this.map, 'click', this.mapClickMoveListener);
            this.mapClickMoveListener = null;
        }

        const markerData = this.markersData.find(m => m.id === id);
        if (markerData) {
            const lat = markerData.lat;
            const lng = markerData.lng;

            if (!markerData.isPending && this.supabase) {
                try {
                    const { error } = await this.supabase
                        .from('markers')
                        .update({ lat, lng })
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
            this.showToast(`'${markerData.name}' 위치가 성공적으로 저장되었습니다.`);
        }

        this.currentMovingMarkerId = null;
        this.originalMarkerPosition = null;

        // UI 모드 해제를 위한 리렌더링
        this.renderMarkersOnMap();

        // 오버레이 복원 노출
        if (this.customOverlays.has(id)) {
            this.customOverlays.get(id).setMap(this.map);
        }
    }

    // 위치 변경 취소
    cancelMarkerPositionChange(id) {
        // 리스너 해제
        if (this.mapClickMoveListener) {
            kakao.maps.event.removeListener(this.map, 'click', this.mapClickMoveListener);
            this.mapClickMoveListener = null;
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

        this.resolveAddress(data.lat, data.lng, (addrObj) => {
            let html = '';
            if (addrObj.roadAddress) {
                html += `<span class="road-addr">${addrObj.roadAddress}</span>`;
            }
            if (addrObj.jibunAddress) {
                html += `<span class="jibun-addr" style="font-size: 10px; color: var(--text-muted); display: block; margin-top: 2px;">(지번) ${addrObj.jibunAddress}</span>`;
            }
            if (!addrObj.roadAddress && !addrObj.jibunAddress) {
                html = '<span class="road-addr">주소를 확인할 수 없음</span>';
            }
            addressDiv.innerHTML = html;
        });

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
        
        if (data.memo) {
            const memo = document.createElement('div');
            memo.className = 'overlay-memo';
            memo.textContent = data.memo;
            container.appendChild(memo);
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
        this.initFilters(false);
        this.renderMarkersOnMap();
        this.renderMarkersList();
        this.showToast('선택한 위치가 Supabase에 저장되었습니다.');
    }

    // 왼쪽 사이드바 마커 목록 렌더링
    renderMarkersList() {
        const filterText = this.markerFilter.value.trim().toLowerCase();
        
        // 목록 리셋
        this.markersList.innerHTML = '';
        
        // 연도 및 사업구분 필터가 적용된 마커 선별
        const filteredByDropdowns = this.markersData.filter(marker => {
            const year = marker.facilityYear ? marker.facilityYear.toString().trim() : "미지정";
            const business = marker.businessType ? marker.businessType.toString().trim() : "미지정";
            return this.selectedYears.has(year) && this.selectedBusinesses.has(business);
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
            if (roadAddr) {
                addrHtml += `<div class="result-address">${roadAddr}</div>`;
            }
            if (jibunAddr && jibunAddr !== roadAddr) {
                addrHtml += `<div class="result-address jibun-addr" style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">(지번) ${jibunAddr}</div>`;
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
                if (roadAddr) {
                    tempAddrHtml += `<span class="road-addr">${roadAddr}</span>`;
                }
                if (jibunAddr && jibunAddr !== roadAddr) {
                    tempAddrHtml += `<span class="jibun-addr" style="font-size: 10px; color: var(--text-muted); display: block; margin-top: 2px;">(지번) ${jibunAddr}</span>`;
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
                    facilityCode: m.facility_code,
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

    // 위치 마커 JSON 복원
    handleImportMarkersJSON(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        DataManager.importFromJSON(file)
            .then(async (newMarkers) => {
                if (newMarkers.length === 0) {
                    this.showToast('복원할 마커 데이터가 없습니다.');
                    this.importMarkersJsonFile.value = '';
                    return;
                }
                
                this.showToast('데이터 복원 처리 중...');
                
                if (this.supabase) {
                     try {
                         // Supabase upsert 데이터 빌드 (동일 ID 존재 시 덮어쓰기)
                         const bulkData = newMarkers.map(m => ({
                             id: m.id,
                             name: m.name,
                             lat: m.lat,
                             lng: m.lng,
                             memo: m.memo || "",
                             tags: m.tags || [],
                             facility_code: m.facilityCode || null,
                             created_at: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString()
                         }));
                         
                         const { error } = await this.supabase
                             .from('markers')
                             .upsert(bulkData, { onConflict: 'id' });
                         
                         if (error) throw error;
                     } catch (e) {
                         this.showToast('Supabase 위치 마커 복원 실패: ' + e.message, 5000);
                         this.importMarkersJsonFile.value = '';
                         return;
                     }
                } else {
                     // Supabase가 없을 경우 로컬 스토리지 데이터 병합
                     const existingIds = new Set(this.markersData.map(m => m.id));
                     const merged = [...this.markersData];
                     let addedLocalCount = 0;
                     
                     newMarkers.forEach(m => {
                         if (!existingIds.has(m.id)) {
                             merged.push(m);
                             addedLocalCount++;
                         }
                     });
                     this.markersData = merged;
                     this.syncLocalStorage();
                }
                
                // Supabase 데이터와 로컬 메모리 최신 동기화 진행
                await this.init();
                
                this.showToast(`위치 마커 복원이 완료되었습니다. (총 ${newMarkers.length}건)`);
                this.importMarkersJsonFile.value = '';
            })
            .catch(err => {
                this.showToast(err.message, 5000);
                this.importMarkersJsonFile.value = '';
            });
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
                
                // 간단한 유효성 검사 (첫 번째 행에 facility_code가 있는지 검사)
                if (parsedData.length > 0 && !parsedData[0].hasOwnProperty('facility_code')) {
                    throw new Error('상세 장비 정보 형식이 아닙니다. (facility_code 필드가 필요합니다)');
                }
                
                this.showToast('상세 장비 데이터 복원 처리 중...');
                
                // Supabase upsert (동일 facility_code 존재 시 덮어쓰기)
                const { error } = await this.supabase
                    .from('information')
                    .upsert(parsedData, { onConflict: 'facility_code' });
                    
                if (error) throw error;
                
                // 전체 리프레시 및 조인 데이터 동기화
                await this.init();
                
                this.showToast(`상세 장비 정보 복원이 완료되었습니다. (총 ${parsedData.length}건)`);
                this.importInfoJsonFile.value = '';
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
        this.initFilters(false);
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
        this.initFilters(false);
        this.renderMarkersOnMap();
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
                .then(response => {
                    if (!response.ok) {
                        throw new Error('네트워크 응답이 올바르지 않습니다.');
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
                // 오류 발생 시에는 사용자 경험 저해를 막기 위해 드롭다운 숨김 처리 후 로드뷰 화면은 그대로 노출
                const dateContainer = document.getElementById('roadview-date-container');
                if (dateContainer) {
                    dateContainer.classList.add('hidden');
                }
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
}

// DOM 로딩 완료 시 앱 구동
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MapMarkerApp();
});
