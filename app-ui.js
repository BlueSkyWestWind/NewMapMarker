/**
 * MapMarkerApp Prototype Extension - app-ui.js
 */
Object.assign(MapMarkerApp.prototype, {
    cacheElements() {
        this.searchInput = document.getElementById('search-input');
        this.searchBtn = document.getElementById('search-btn');
        this.searchResultsContainer = document.getElementById('search-results-container');
        this.searchResultsList = document.getElementById('search-results-list');
        this.closeSearchBtn = document.getElementById('close-search-btn');
        
        this.markerFilter = document.getElementById('marker-filter');
        this.markersSectionTitle = document.getElementById('markers-section-title');
        this.markersList = document.getElementById('markers-list');
        this.markerCount = document.getElementById('marker-count');
        
        this.exportMarkersExcelBtn = document.getElementById('export-markers-excel-btn');
        this.deleteAllBatteryMarkersBtn = document.getElementById('delete-all-battery-markers-btn');
        this.importMarkersExcelFile = document.getElementById('import-markers-excel-file');
        this.exportInfoExcelBtn = document.getElementById('export-info-excel-btn');
        this.importInfoExcelFile = document.getElementById('import-info-excel-file');
        
        // 백업 아코디언 요소 캐시
        this.sidebarFooter = document.getElementById('sidebar-footer');
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
        this.facilityTeamPicker = document.getElementById('facility-team-picker');
        this.facilityTeamFormGroup = document.getElementById('facility-team-form-group');
        this.facilityTeamChips = document.querySelectorAll('.facility-team-chip');

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
        this.filterAccordionTitle = document.getElementById('filter-accordion-title');

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

        // 클러스터 토글 관련 요소 캐시 및 상태
        this.clusterToggleBtn = document.getElementById('cluster-toggle-btn');
        this.isClusteringEnabled = localStorage.getItem('clustering_mode') !== 'false';

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
        this.colorFiltersRow = document.getElementById('color-filters-row');
        this.tagsFiltersRow = document.getElementById('tags-filters-row');

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
        // 인증 관련 요소 캐시
        this.authModalBtn = document.getElementById('auth-modal-btn');
        this.closeAuthModalBtn = document.getElementById('close-auth-modal-btn');
        this.btnLogout = document.getElementById('btn-logout');
        this.authUserInfo = document.getElementById('auth-user-info');
        this.authUserEmail = document.getElementById('auth-user-email');
        this.authModal = document.getElementById('auth-modal');
        this.authModalTitle = document.getElementById('auth-modal-title');
        this.authTabLogin = document.getElementById('auth-tab-login');
        this.authTabSignup = document.getElementById('auth-tab-signup');
        this.authForm = document.getElementById('auth-form');
        this.authEmailInput = document.getElementById('auth-email');
        this.authPasswordInput = document.getElementById('auth-password');
        this.authPasswordConfirmInput = document.getElementById('auth-password-confirm');
        this.authPasswordConfirmGroup = document.getElementById('auth-password-confirm-group');
        this.authErrorMsg = document.getElementById('auth-error-msg');
        this.authErrorText = document.getElementById('auth-error-text');
        this.authSuccessMsg = document.getElementById('auth-success-msg');
        this.authSuccessText = document.getElementById('auth-success-text');
        this.authSubmitBtn = document.getElementById('auth-submit-btn');
        this.markerIsTemp = document.getElementById('marker-is-temp');
    },

    bindEvents() {
        
        // 인증 관련 이벤트 등록
        if (this.authModalBtn) {
            this.authModalBtn.addEventListener('click', () => this.openAuthModal());
        }
        if (this.closeAuthModalBtn) {
            this.closeAuthModalBtn.addEventListener('click', () => this.closeAuthModal());
        }
        if (this.btnLogout) {
            this.btnLogout.addEventListener('click', () => this.handleLogout());
        }
        if (this.authTabLogin) {
            this.authTabLogin.addEventListener('click', () => this.switchAuthTab('login'));
        }
        if (this.authTabSignup) {
            this.authTabSignup.addEventListener('click', () => this.switchAuthTab('signup'));
        }
        if (this.authForm) {
            this.authForm.addEventListener('submit', (e) => this.handleAuthSubmit(e));
        }
        if (this.authModal) {
            this.authModal.addEventListener('click', (e) => {
                if (e.target === this.authModal) this.closeAuthModal();
            });
        }

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
        if (this.exportMarkersExcelBtn) {
            this.exportMarkersExcelBtn.addEventListener('click', () => this.handleExportMarkersExcel());
        }
        if (this.importMarkersExcelFile) {
            this.importMarkersExcelFile.addEventListener('change', (e) => this.handleImportMarkersExcel(e));
        }
        if (this.deleteAllBatteryMarkersBtn) {
            this.deleteAllBatteryMarkersBtn.addEventListener('click', () => this.handleDeleteAllBatteryMarkers());
        }
        if (this.exportInfoExcelBtn) {
            this.exportInfoExcelBtn.addEventListener('click', () => this.handleExportInfoExcel());
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
        if (this.clusterToggleBtn) {
            this.clusterToggleBtn.addEventListener('click', () => this.toggleClusteringMode());
        }
        
        // 모달 이벤트
        this.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.cancelModalBtn.addEventListener('click', () => this.closeModal());
        this.saveMarkerBtn.addEventListener('click', () => this.handleSaveMarker());
        this.deleteMarkerModalBtn.addEventListener('click', () => this.handleDeleteMarker(this.currentEditingId));
        
        // 시설팀 칩 선택 이벤트
        if (this.facilityTeamChips) {
            this.facilityTeamChips.forEach(chip => {
                chip.addEventListener('click', () => {
                    const isReadOnly = this.markerNameInput && this.markerNameInput.readOnly;
                    if (!isReadOnly) {
                        this.selectFacilityTeam(chip.getAttribute('data-team') || '');
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
    },

    closeAllDropdowns() {
        const wrappers = document.querySelectorAll('.custom-select-wrapper');
        wrappers.forEach(w => w.classList.remove('open'));
        const containers = document.querySelectorAll('.custom-options-container');
        containers.forEach(c => c.classList.add('hidden'));
    },

    expandFilterSelectionsForNewData() {
        if (this.currentMode === 'equipment') {
            this.uniqueYears.forEach(year => this.selectedYears.add(year));
            this.uniqueBusinesses.forEach(business => this.selectedBusinesses.add(business));
        }
        this.uniqueColors.forEach(color => this.selectedColors.add(color));
        this.uniqueTags.forEach(tag => this.selectedTags.add(tag));
    },

    markerPassesMapFilters(data) {
        if (data.isPending || data.isTemp) {
            return true;
        }

        const color = getEffectiveMarkerColor(data, this.currentMode).toLowerCase().trim();
        if (!this.selectedColors.has(color)) {
            return false;
        }

        let hasMatchingTag = false;
        if (data.tags && data.tags.length > 0) {
            hasMatchingTag = data.tags.some(tag => this.selectedTags.has(tag.toString().trim()));
        } else {
            hasMatchingTag = this.selectedTags.has("미지정");
        }
        if (!hasMatchingTag) {
            return false;
        }

        if (this.currentMode === 'equipment') {
            const year = data.facilityYear ? data.facilityYear.toString().trim() : "미지정";
            const business = data.businessType ? data.businessType.toString().trim() : "미지정";
            return this.selectedYears.has(year) && this.selectedBusinesses.has(business);
        }

        return true;
    },

    getMarkerVisibilityStats() {
        const registered = this.markersData.filter(m => !m.isPending && !m.isTemp);
        let visible = 0;
        let excludedByColor = 0;
        let excludedByTag = 0;
        let excludedByYear = 0;
        let excludedByBusiness = 0;

        registered.forEach(data => {
            const color = getEffectiveMarkerColor(data, this.currentMode).toLowerCase().trim();
            if (!this.selectedColors.has(color)) {
                excludedByColor++;
                return;
            }

            let hasMatchingTag = false;
            if (data.tags && data.tags.length > 0) {
                hasMatchingTag = data.tags.some(tag => this.selectedTags.has(tag.toString().trim()));
            } else {
                hasMatchingTag = this.selectedTags.has("미지정");
            }
            if (!hasMatchingTag) {
                excludedByTag++;
                return;
            }

            if (this.currentMode === 'equipment') {
                const year = data.facilityYear ? data.facilityYear.toString().trim() : "미지정";
                const business = data.businessType ? data.businessType.toString().trim() : "미지정";
                if (!this.selectedYears.has(year)) {
                    excludedByYear++;
                    return;
                }
                if (!this.selectedBusinesses.has(business)) {
                    excludedByBusiness++;
                    return;
                }
            }

            visible++;
        });

        return {
            total: registered.length,
            visible,
            excludedByColor,
            excludedByTag,
            excludedByYear,
            excludedByBusiness
        };
    },

    logMarkerVisibilityIfFiltered() {
        const stats = this.getMarkerVisibilityStats();
        if (stats.visible >= stats.total) {
            return;
        }
        console.warn(
            `[MapMarker] 지도 표시 ${stats.visible}건 / 전체 ${stats.total}건 — 필터로 ${stats.total - stats.visible}건 제외`,
            stats
        );
    },

    updateMarkerCountLabel(visibleCount, totalRegistered) {
        if (!this.markerCount) {
            return;
        }
        if (visibleCount === totalRegistered) {
            this.markerCount.textContent = String(visibleCount);
        } else {
            this.markerCount.textContent = `${visibleCount} / ${totalRegistered}`;
        }
    },

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
                const color = getEffectiveMarkerColor(marker, this.currentMode).toLowerCase().trim();
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
 
            const colorOrder = [
                '#2563eb', '#d946ef', '#84cc16', '#9333ea', '#ea580c', '#0891b2', '#64748b',
                '#10b981', '#6366f1', '#f43f5e', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#14b8a6', '#f97316'
            ];
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
            const colorsSet = new Set();
            const tagsSet = new Set();

            this.markersData.forEach(marker => {
                const color = getEffectiveMarkerColor(marker, this.currentMode).toLowerCase().trim();
                colorsSet.add(color);

                if (marker.tags && marker.tags.length > 0) {
                    marker.tags.forEach(tag => {
                        const cleanTag = tag.toString().trim();
                        if (cleanTag) tagsSet.add(cleanTag);
                    });
                } else {
                    tagsSet.add("미지정");
                }
            });

            const colorOrder = [
                '#2563eb', '#d946ef', '#84cc16', '#9333ea', '#ea580c', '#0891b2', '#64748b',
                '#10b981', '#6366f1', '#f43f5e', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#14b8a6', '#f97316'
            ];
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
                this.selectedColors = new Set(this.uniqueColors);
                this.selectedTags = new Set(this.uniqueTags);
            } else {
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
    },

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
        }

        // --- 색상 선택 드롭다운 ---
        if (this.optionsColorsContainer) {
            this.optionsColorsContainer.innerHTML = '';
            
            this.uniqueColors.forEach(color => {
                const item = document.createElement('div');
                const isSelected = this.selectedColors.has(color);
                item.className = `filter-option-item ${isSelected ? 'selected' : ''}`;
                
                const name = getMarkerColorLabel(color);
                
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
                    const firstLabel = getMarkerColorLabel(firstSelected);
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
    },

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
    },

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
    },

    openAddMarkerModal(lat, lng, defaultName = '') {
        if (!this.canEditData()) {
            this.showToast('마커 등록은 로그인 후 이용할 수 있습니다.');
            this.clearTempMarker();
            return;
        }

        this.currentEditingId = null;
        this.isDetailViewMode = false;
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
        
        // 기본 색상 초기화 (장비: 색상, 축전지: 시설팀)
        if (this.currentMode === 'battery') {
            this.selectFacilityTeam('');
        } else {
            this.selectColorChip(DEFAULT_MARKER_COLOR);
        }
        this.updateFacilityTeamVisibility();

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
    },

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
            this.setModalFieldEditable(input, !isReadOnly);
        });

        if (this.facilityTeamPicker) {
            this.facilityTeamPicker.classList.toggle('is-readonly', isReadOnly);
        }
    },

    setModalFieldEditable(input, editable) {
        if (!input) return;
        input.readOnly = !editable;
        input.classList.toggle('input-readonly', !editable);
    },

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

        // 저장된 색상/시설팀 동기화 (상세 보기 모드)
        if (this.currentMode === 'battery') {
            this.selectFacilityTeam(markerData.facilityTeam || '');
        } else {
            this.selectColorChip(markerData.color || DEFAULT_MARKER_COLOR);
        }
        this.updateFacilityTeamVisibility();
 
        // 폼 잠금 및 버튼 설정 (비로그인: 조회 전용, 태그·저장 불가)
        this.isDetailViewMode = true;
        this.toggleModalReadOnly(true);
        const canEdit = this.canEditData();
        this.setModalFieldEditable(this.markerTagsInput, canEdit);
        if (canEdit) {
            this.saveMarkerBtn.classList.remove('hidden');
            this.saveMarkerBtn.textContent = '태그 저장';
        } else {
            this.saveMarkerBtn.classList.add('hidden');
        }
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
    },

    openEditMarkerModal(id) {
        if (!this.canEditData()) {
            this.showToast('편집은 로그인 후 이용할 수 있습니다.');
            return;
        }

        const markerData = this.markersData.find(m => m.id === id);
        if (!markerData) return;
        
        this.currentEditingId = id;
        this.isDetailViewMode = false;
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
        
        // 저장된 색상/시설팀 동기화 (수정 모드)
        if (this.currentMode === 'battery') {
            this.selectFacilityTeam(markerData.facilityTeam || '');
        } else {
            this.selectColorChip(markerData.color || DEFAULT_MARKER_COLOR);
        }
        this.updateFacilityTeamVisibility();
 
        // 폼 잠금 해제 및 저장 버튼 노출 설정
        this.toggleModalReadOnly(false);
        this.clearCellSelection(); // 편집 진입 시 기존 셀 선택 하이라이트 리셋
        this.saveMarkerBtn.classList.remove('hidden');
        this.saveMarkerBtn.textContent = '저장';
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
    },

    closeModal() {
        this.markerModal.classList.add('hidden');
        this.isDetailViewMode = false;
        if (this.saveMarkerBtn) {
            this.saveMarkerBtn.textContent = '저장';
        }
        this.clearTempMarker();
    },

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
    },

    updateFacilityTeamVisibility() {
        const show = this.currentMode === 'battery';
        if (this.facilityTeamFormGroup) {
            this.facilityTeamFormGroup.classList.toggle('hidden', !show);
        }
    },

    updateFilterSectionVisibility() {
        const isBattery = this.currentMode === 'battery';

        if (this.filterAccordionTitle) {
            this.filterAccordionTitle.textContent = isBattery
                ? '마커 필터'
                : '연도·사업·색상·태그 표시';
        }
        if (this.eqFiltersRow) {
            this.eqFiltersRow.classList.toggle('hidden', isBattery);
        }
        if (this.batteryFiltersRow) {
            this.batteryFiltersRow.classList.add('hidden');
        }
        if (this.tagsFiltersRow) {
            this.tagsFiltersRow.classList.remove('hidden');
        }
        if (this.colorFiltersRow) {
            this.colorFiltersRow.classList.remove('hidden');
        }
        if (this.markersSectionTitle) {
            this.markersSectionTitle.textContent = '저장된 위치';
        }
        if (this.markerFilter) {
            this.markerFilter.placeholder = isBattery
                ? '이름·메모·태그로 검색...'
                : '저장된 위치 필터링...';
        }
    },

    selectFacilityTeam(teamId) {
        this.selectedFacilityTeam = teamId || '';
        this.selectedColor = getFacilityTeamColor(this.selectedFacilityTeam);
        if (this.facilityTeamChips) {
            this.facilityTeamChips.forEach(chip => {
                const chipTeam = chip.getAttribute('data-team') || '';
                chip.classList.toggle('selected', chipTeam === this.selectedFacilityTeam);
            });
        }
    },

    buildSaveTeamFields(isTemp) {
        if (isTemp) {
            return { facilityTeam: '', color: '#ef4444' };
        }
        if (this.currentMode === 'battery') {
            const facilityTeam = this.selectedFacilityTeam || '';
            return {
                facilityTeam,
                color: getFacilityTeamColor(facilityTeam)
            };
        }
        return {
            facilityTeam: '',
            color: this.selectedColor || DEFAULT_MARKER_COLOR
        };
    },

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
    },

    renderMarkersList() {
        const filterText = this.markerFilter.value.trim().toLowerCase();
        
        // 목록 리셋
        this.markersList.innerHTML = '';
        
        const filteredByDropdowns = this.markersData.filter(marker => this.markerPassesMapFilters(marker));
        const totalRegistered = this.markersData.filter(m => !m.isPending && !m.isTemp).length;
        const visibleRegistered = filteredByDropdowns.filter(m => !m.isPending && !m.isTemp).length;
        
        const pendingMarkers = filteredByDropdowns.filter(m => m.isPending);

        // 검색어(필터)가 없는 경우 리스트를 렌더링하지 않으나, 대기 중인 마커가 있으면 대기 마커 리스트 노출
        if (!filterText) {
            this.updateMarkerCountLabel(visibleRegistered, totalRegistered);
            
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
    },

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
                    ${marker.isPending && this.canEditData() ? `
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
    },

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
    },

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
    },

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
    },

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
                if (this.canEditData()) {
                    actions.appendChild(addBtn);
                }
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
    },

    hideSearchResults() {
        this.searchResultsContainer.classList.add('hidden');
        this.searchResultsList.innerHTML = '';
    },

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
    },

    getCellValue(td) {
        if (!td) return '';
        const input = td.querySelector('.table-input');
        return input ? input.value : td.textContent.trim();
    },

    clearCellSelection() {
        const selected = document.querySelectorAll('#detailed-info-table-body .cell-selected');
        selected.forEach(td => td.classList.remove('cell-selected'));
        this.updateCopySelectedBtnVisibility();
    },

    updateCopySelectedBtnVisibility() {
        if (!this.copySelectedBtn) return;
        const selectedCount = document.querySelectorAll('#detailed-info-table-body .cell-selected').length;
        if (selectedCount > 0) {
            this.copySelectedBtn.classList.remove('hidden');
        } else {
            this.copySelectedBtn.classList.add('hidden');
        }
    },

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
    },

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
    },

    updateExcelUploadSectionsVisibility() {
        const eqExcelSec = this.eqExcelSection || document.getElementById('eq-excel-section');
        const eqInfoSec = this.eqInfoUploadSection || document.getElementById('eq-info-upload-section');
        const batExcelSec = this.batteryExcelSection || document.getElementById('battery-excel-section');
        const batteryAccordionContent = document.getElementById('battery-excel-accordion-content');
        const isLoggedIn = !!this.currentUser;

        if (!isLoggedIn) {
            if (eqExcelSec) {
                eqExcelSec.classList.add('hidden');
                eqExcelSec.classList.remove('active');
            }
            if (eqInfoSec) {
                eqInfoSec.classList.add('hidden');
                eqInfoSec.classList.remove('active');
            }
            if (batExcelSec) {
                batExcelSec.classList.add('hidden');
                batExcelSec.classList.remove('active');
            }
            if (this.excelAccordionContent) this.excelAccordionContent.classList.add('hidden');
            if (this.infoAccordionContent) this.infoAccordionContent.classList.add('hidden');
            if (batteryAccordionContent) batteryAccordionContent.classList.add('hidden');
            return;
        }

        if (this.currentMode === 'equipment') {
            if (eqExcelSec) eqExcelSec.classList.remove('hidden');
            if (eqInfoSec) eqInfoSec.classList.remove('hidden');
            if (batExcelSec) batExcelSec.classList.add('hidden');
        } else {
            if (eqExcelSec) eqExcelSec.classList.add('hidden');
            if (eqInfoSec) eqInfoSec.classList.add('hidden');
            if (batExcelSec) batExcelSec.classList.remove('hidden');
        }
    },

    updateBatteryBulkDeleteButtonVisibility() {
        if (!this.deleteAllBatteryMarkersBtn) return;
        const show = this.currentMode === 'battery';
        this.deleteAllBatteryMarkersBtn.classList.toggle('hidden', !show);
    },

    switchMode(mode) {
        if (this.currentMode === mode) return;
        this.currentMode = mode;
        this.markersData = mode === 'equipment' ? this.eqMarkersData : this.batteryMarkersData;
        
        // UI 변경
        this.updateModeButtonsUI();
        
        // 드롭다운 및 아코디언 토글
        this.closeAllDropdowns();
        
        const backupSection1Title = document.getElementById('backup-section-1-title');
        const backupSection1Icon = document.getElementById('backup-section-1-icon');
        const backupSection1Wrapper = document.getElementById('backup-section-1-wrapper');
        const backupSection2Wrapper = document.getElementById('backup-section-2-wrapper');
        
        if (mode === 'equipment') {
            if (this.clusterToggleBtn) this.clusterToggleBtn.classList.remove('hidden');

            if (backupSection1Title) backupSection1Title.textContent = "위치 마커 (markers)";
            if (backupSection1Icon) backupSection1Icon.className = "fa-solid fa-location-dot";
            if (backupSection1Wrapper) backupSection1Wrapper.style.borderBottom = "1px dashed var(--border-color)";
            if (backupSection2Wrapper) backupSection2Wrapper.style.display = "block";
        } else {
            if (this.clusterToggleBtn) this.clusterToggleBtn.classList.add('hidden');

            if (backupSection1Title) backupSection1Title.textContent = "축전지 내역 (battery)";
            if (backupSection1Icon) backupSection1Icon.className = "fa-solid fa-battery-three-quarters";
            if (backupSection1Wrapper) backupSection1Wrapper.style.borderBottom = "none";
            if (backupSection2Wrapper) backupSection2Wrapper.style.display = "none";
        }

        this.updateExcelUploadSectionsVisibility();

        this.updateBatteryBulkDeleteButtonVisibility();
        this.updateFacilityTeamVisibility();
        this.updateFilterSectionVisibility();
        
        // 필터 및 마커 목록 갱신
        this.initFilters(false);
        this.renderMarkersOnMap();
        this.renderMarkersList();
        
        this.showToast(`${mode === 'equipment' ? '장비' : '축전지'}로 전환되었습니다.`);
    },

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
    },

    clearCellSelectionBattery() {
        const selected = document.querySelectorAll('#battery-info-table-body .cell-selected');
        selected.forEach(td => td.classList.remove('cell-selected'));
        this.updateCopySelectedBtnVisibilityBattery();
    },

    updateCopySelectedBtnVisibilityBattery() {
        if (!this.batteryCopySelectedBtn) return;
        const selectedCount = document.querySelectorAll('#battery-info-table-body .cell-selected').length;
        if (selectedCount > 0) {
            this.batteryCopySelectedBtn.classList.remove('hidden');
        } else {
            this.batteryCopySelectedBtn.classList.add('hidden');
        }
    },

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
    },

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
    },

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
    },

    updateAuthUI(user) {
        if (user) {
            if (this.authModalBtn) this.authModalBtn.classList.add('hidden');
            if (this.authUserInfo) {
                this.authUserInfo.classList.remove('hidden');
                this.authUserInfo.style.display = 'flex';
            }
            if (this.authUserEmail) {
                this.authUserEmail.textContent = user.email;
                this.authUserEmail.title = user.email;
            }
            if (this.markerIsTemp) {
                this.markerIsTemp.disabled = false;
                this.markerIsTemp.checked = false;
            }
            const tempWrapper = document.getElementById('temp-checkbox-wrapper');
            if (tempWrapper) {
                tempWrapper.style.opacity = '1';
                tempWrapper.title = '';
            }
            if (this.sidebarFooter) {
                this.sidebarFooter.classList.remove('hidden');
            }
        } else {
            if (this.authModalBtn) this.authModalBtn.classList.remove('hidden');
            if (this.authUserInfo) {
                this.authUserInfo.classList.add('hidden');
                this.authUserInfo.style.display = '';
            }
            if (this.authUserEmail) this.authUserEmail.textContent = '';
            if (this.markerIsTemp) {
                this.markerIsTemp.checked = true;
                this.markerIsTemp.disabled = true;
            }
            const tempWrapper = document.getElementById('temp-checkbox-wrapper');
            if (tempWrapper) {
                tempWrapper.style.opacity = '0.7';
                tempWrapper.title = '로그인 시 DB 등록 기능을 잠금 해제할 수 있습니다.';
            }
            if (this.sidebarFooter) {
                this.sidebarFooter.classList.add('hidden');
                this.sidebarFooter.classList.remove('active');
            }
            if (this.backupAccordionContent) {
                this.backupAccordionContent.classList.add('hidden');
            }
            if (this.markerModal && !this.markerModal.classList.contains('hidden')) {
                this.closeModal();
            }
            if (typeof this.closeInfoConfirmModal === 'function') {
                this.closeInfoConfirmModal();
            }
            this.clearTempMarker();
        }

        this.updateExcelUploadSectionsVisibility();

        if (!user && this.currentMovingMarkerId) {
            this.cancelMarkerPositionChange(this.currentMovingMarkerId);
        }
        if (typeof this.renderMarkersOnMap === 'function') {
            this.renderMarkersOnMap();
        }
    },

    openAuthModal() {
        if (!this.supabase) {
            this.showToast('Supabase에 연결되지 않았습니다. index.html의 SDK 로드와 config.js(URL·ANON_KEY)를 확인해주세요.', 6000);
            return;
        }
        if (this.authModal) {
            this.authModal.classList.remove('hidden');
            this.switchAuthTab('login');
            if (this.authEmailInput) this.authEmailInput.value = '';
            if (this.authPasswordInput) this.authPasswordInput.value = '';
            if (this.authPasswordConfirmInput) this.authPasswordConfirmInput.value = '';
            if (this.authErrorMsg) this.authErrorMsg.classList.add('hidden');
            if (this.authSuccessMsg) this.authSuccessMsg.classList.add('hidden');
        }
    },

    closeAuthModal() {
        if (this.authModal) {
            this.authModal.classList.add('hidden');
        }
    },

    switchAuthTab(tab) {
        if (!this.authTabLogin || !this.authTabSignup) return;
        if (tab === 'login') {
            this.authTabLogin.classList.add('active');
            this.authTabLogin.style.background = 'var(--primary)';
            this.authTabLogin.style.color = '#fff';
            this.authTabSignup.classList.remove('active');
            this.authTabSignup.style.background = 'transparent';
            this.authTabSignup.style.color = 'var(--text-secondary)';
            if (this.authModalTitle) this.authModalTitle.textContent = '관리자 로그인';
            if (this.authSubmitBtn) this.authSubmitBtn.textContent = '로그인';
            if (this.authPasswordConfirmGroup) {
                this.authPasswordConfirmGroup.classList.add('hidden');
                this.authPasswordConfirmGroup.style.display = 'none';
            }
            if (this.authPasswordConfirmInput) {
                this.authPasswordConfirmInput.required = false;
            }
        } else {
            this.authTabSignup.classList.add('active');
            this.authTabSignup.style.background = 'var(--primary)';
            this.authTabSignup.style.color = '#fff';
            this.authTabLogin.classList.remove('active');
            this.authTabLogin.style.background = 'transparent';
            this.authTabLogin.style.color = 'var(--text-secondary)';
            if (this.authModalTitle) this.authModalTitle.textContent = '계정 등록';
            if (this.authSubmitBtn) this.authSubmitBtn.textContent = '회원가입';
            if (this.authPasswordConfirmGroup) {
                this.authPasswordConfirmGroup.classList.remove('hidden');
                this.authPasswordConfirmGroup.style.display = 'flex';
            }
            if (this.authPasswordConfirmInput) {
                this.authPasswordConfirmInput.required = true;
            }
        }
        if (this.authErrorMsg) this.authErrorMsg.classList.add('hidden');
        if (this.authSuccessMsg) this.authSuccessMsg.classList.add('hidden');
    },

    async handleAuthSubmit(e) {
        e.preventDefault();
        if (!this.authEmailInput || !this.authPasswordInput || !this.authSubmitBtn) return;
        const email = this.authEmailInput.value.trim();
        const password = this.authPasswordInput.value;

        if (!email || !password) return;

        const isLogin = this.authTabLogin.classList.contains('active');

        if (!isLogin) {
            if (password.length < 6) {
                if (this.authErrorMsg && this.authErrorText) {
                    this.authErrorMsg.classList.remove('hidden');
                    this.authErrorText.textContent = '비밀번호는 6자 이상이어야 합니다.';
                }
                if (this.authSuccessMsg) this.authSuccessMsg.classList.add('hidden');
                return;
            }
            const passwordConfirm = this.authPasswordConfirmInput ? this.authPasswordConfirmInput.value : '';
            if (password !== passwordConfirm) {
                if (this.authErrorMsg && this.authErrorText) {
                    this.authErrorMsg.classList.remove('hidden');
                    this.authErrorText.textContent = '비밀번호 확인이 일치하지 않습니다.';
                }
                if (this.authSuccessMsg) this.authSuccessMsg.classList.add('hidden');
                return;
            }
        }

        this.authSubmitBtn.disabled = true;
        this.authSubmitBtn.textContent = isLogin ? '로그인 중...' : '가입 처리 중...';

        if (this.authErrorMsg) this.authErrorMsg.classList.add('hidden');
        if (this.authSuccessMsg) this.authSuccessMsg.classList.add('hidden');

        let res;
        if (isLogin) {
            res = await this.handleLogin(email, password);
        } else {
            res = await this.handleSignUp(email, password);
        }

        this.authSubmitBtn.disabled = false;
        this.authSubmitBtn.textContent = isLogin ? '로그인' : '회원가입';

        if (res.error) {
            if (this.authErrorMsg && this.authErrorText) {
                this.authErrorMsg.classList.remove('hidden');
                this.authErrorText.textContent = res.error.message || '인증 처리에 실패했습니다.';
            }
            return;
        }

        if (isLogin) {
            if (res.data?.session) {
                this.applyAuthSession(res.data.session);
            }
            this.closeAuthModal();
            this.showToast('로그인되었습니다. DB 저장·수정이 가능합니다.');
            return;
        }

        if (res.needsEmailConfirmation) {
            if (this.authSuccessMsg && this.authSuccessText) {
                this.authSuccessMsg.classList.remove('hidden');
                this.authSuccessText.textContent =
                    `${email}로 가입 요청이 접수되었습니다. Supabase에서 인증 메일을 확인한 뒤, 메일 링크 클릭 후 로그인해주세요. (Authentication → Users에서 미인증 사용자도 확인 가능)`;
            }
            this.switchAuthTab('login');
            if (this.authPasswordInput) this.authPasswordInput.value = '';
            if (this.authPasswordConfirmInput) this.authPasswordConfirmInput.value = '';
            return;
        }

        this.closeAuthModal();
        if (res.data?.session) {
            this.applyAuthSession(res.data.session);
        }
        this.showToast('회원가입이 완료되었습니다. DB 저장·수정이 가능합니다.');
    }

});
