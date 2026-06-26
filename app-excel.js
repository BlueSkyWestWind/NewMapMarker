/**
 * MapMarkerApp Prototype Extension - app-excel.js
 */
Object.assign(MapMarkerApp.prototype, {
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
    },

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
                    color: m.color || DEFAULT_MARKER_COLOR,
                    facilityTeam: m.facility_team || '',
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
    },

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
    },

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
                    color: m.color || DEFAULT_MARKER_COLOR,
                    facility_team: m.facilityTeam || "",
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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

    closeExcelConfirmModal() {
        if (this.excelConfirmModal) {
            this.excelConfirmModal.classList.add('hidden');
        }
    },

    updateExcelConfirmCount() {
        if (this.excelConfirmCount && this.excelConfirmTableBody) {
            const rowCount = this.excelConfirmTableBody.querySelectorAll('tr').length;
            this.excelConfirmCount.textContent = rowCount;
        }
    },

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
    },

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
    },

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
    },

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
    },

    closeInfoConfirmModal() {
        if (this.infoConfirmModal) {
            this.infoConfirmModal.classList.add('hidden');
        }
        this.pendingInfoData = null;
    },

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
    },

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
    },

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
    },

    closeBatteryExcelConfirmModal() {
        if (this.batteryExcelConfirmModal) {
            this.batteryExcelConfirmModal.classList.add('hidden');
        }
    },

    updateBatteryExcelConfirmCount() {
        if (this.batteryExcelConfirmCount && this.batteryExcelConfirmTableBody) {
            const rowCount = this.batteryExcelConfirmTableBody.querySelectorAll('tr').length;
            this.batteryExcelConfirmCount.textContent = rowCount;
        }
    },

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
    },

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
    },

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
                    color: m.color || DEFAULT_MARKER_COLOR,
                    facility_team: m.facilityTeam || "",
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
    },

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
                        color: m.color || DEFAULT_MARKER_COLOR,
                        facilityTeam: m.facility_team || '',
                        createdAt: m.created_at,
                        items: specs.map(s => ({
                            id: s.id,
                            erpName: s.erp_name || "",
                            address: m.address || "",
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
});
