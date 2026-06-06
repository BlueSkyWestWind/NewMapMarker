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
        this.saveMarkerBtn = document.getElementById('save-marker-btn');
        this.cancelModalBtn = document.getElementById('cancel-modal-btn');
        this.closeModalBtn = document.getElementById('close-modal-btn');
        this.deleteMarkerModalBtn = document.getElementById('delete-marker-modal-btn');
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
        
        // 지도 플로팅 컨트롤 이벤트
        this.myLocationBtn.addEventListener('click', () => this.goToMyLocation());
        this.zoomInBtn.addEventListener('click', () => this.zoomMap(true));
        this.zoomOutBtn.addEventListener('click', () => this.zoomMap(false));
        
        // 모달 이벤트
        this.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.cancelModalBtn.addEventListener('click', () => this.closeModal());
        this.saveMarkerBtn.addEventListener('click', () => this.handleSaveMarker());
        this.deleteMarkerModalBtn.addEventListener('click', () => this.handleDeleteMarker(this.currentEditingId));
        
        // 뒷배경 클릭시 모달 닫기 방지 (실수 방지 목적, 취소 버튼 명시 유도)
        this.markerModal.addEventListener('click', (e) => {
            if (e.target === this.markerModal) this.closeModal();
        });
    }

    init() {
        // 로컬 스토리지에서 저장된 마커 불러오기
        const saved = localStorage.getItem('saved_markers');
        if (saved) {
            try {
                this.markersData = JSON.parse(saved);
            } catch (e) {
                console.error("저장된 마커 파싱 오류:", e);
                this.markersData = [];
            }
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

    // 지도 인스턴스 생성 및 초기화
    initializeMap() {
        const mapContainer = document.getElementById('map');
        const defaultCenter = new kakao.maps.LatLng(37.566826, 126.9786567); // 서울시청 기준
        
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
        
        this.deleteMarkerModalBtn.classList.add('hidden');
        this.markerModal.classList.remove('hidden');
        this.markerNameInput.focus();
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
        
        this.deleteMarkerModalBtn.classList.remove('hidden');
        this.markerModal.classList.remove('hidden');
        this.markerNameInput.focus();
    }

    closeModal() {
        this.markerModal.classList.add('hidden');
        this.clearTempMarker();
    }

    // 마커 추가/수정 로직
    handleSaveMarker() {
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
            
        if (this.currentEditingId) {
            // 수정 모드
            const index = this.markersData.findIndex(m => m.id === this.currentEditingId);
            if (index !== -1) {
                // 수정 시 기존 정보 중 위도, 경도 좌표는 변경 없이 보존
                this.markersData[index] = {
                    ...this.markersData[index],
                    name,
                    memo,
                    tags
                };
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
                createdAt: new Date().toISOString().split('T')[0]
            };
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
    handleDeleteMarker(id) {
        if (!confirm('이 마커를 삭제하시겠습니까?')) return;
        
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
        localStorage.setItem('saved_markers', JSON.stringify(this.markersData));
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
            
            // 1. 마커 객체 생성
            const marker = new kakao.maps.Marker({
                position: position,
                map: this.map,
                title: data.name
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
                this.map.panTo(position);
            });
        });
    }

    closeAllOverlays() {
        this.customOverlays.forEach(overlay => overlay.setMap(null));
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
        
        if (data.memo) {
            const memo = document.createElement('div');
            memo.className = 'overlay-memo';
            memo.textContent = data.memo;
            container.appendChild(memo);
        }
        
        const actions = document.createElement('div');
        actions.className = 'overlay-actions';
        
        const editBtn = document.createElement('button');
        editBtn.className = 'overlay-btn overlay-btn-edit';
        editBtn.textContent = '상세/편집';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openEditMarkerModal(data.id);
        });
        
        actions.appendChild(editBtn);
        container.appendChild(actions);
        
        return container;
    }

    // 왼쪽 사이드바 마커 목록 렌더링
    renderMarkersList() {
        const filterText = this.markerFilter.value.trim().toLowerCase();
        
        // 목록 리셋
        this.markersList.innerHTML = '';
        
        // 검색어(필터)가 없는 경우 리스트를 렌더링하지 않음
        if (!filterText) {
            this.markerCount.textContent = this.markersData.length;
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
        
        filtered.forEach(marker => {
            const item = document.createElement('li');
            item.className = 'marker-item';
            
            // 마커 항목 마크업 조립
            item.innerHTML = `
                <div class="marker-item-header">
                    <h3 class="marker-title" title="${marker.name}">${marker.name}</h3>
                    <span class="marker-date">${marker.createdAt}</span>
                </div>
                ${marker.memo ? `<p class="marker-memo">${marker.memo}</p>` : ''}
                <div class="marker-tags">
                    ${(marker.tags || []).map(tag => `<span class="tag">#${tag}</span>`).join('')}
                </div>
            `;
            
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
            .then(newMarkers => {
                // 기존 데이터에 병합 (중복 아이디 방지)
                const existingIds = new Set(this.markersData.map(m => m.id));
                const merged = [...this.markersData];
                
                let addedCount = 0;
                newMarkers.forEach(m => {
                    if (!existingIds.has(m.id)) {
                        merged.push(m);
                        addedCount++;
                    } else {
                        // 중복 ID가 존재할 경우 신규 아이디 발급하여 추가
                        m.id = 'marker_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                        merged.push(m);
                        addedCount++;
                    }
                });

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
                
                // 최종 마커 취합
                const finalMarkers = [...withCoords, ...geocodeResults];
                
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
                this.syncLocalStorage();
                
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
                
                let summaryMsg = `엑셀 위치 마킹 완료! 총 ${addedCount}개 장소 추가.`;
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
}

// DOM 로딩 완료 시 앱 구동
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MapMarkerApp();
});
