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
const MARKER_GRADIENTS = {
    '#10b981': { start: '#10b981', end: '#059669' },
    '#6366f1': { start: '#6366f1', end: '#4f46e5' },
    '#f43f5e': { start: '#f43f5e', end: '#e11d48' },
    '#f59e0b': { start: '#f59e0b', end: '#d97706' },
    '#8b5cf6': { start: '#8b5cf6', end: '#7c3aed' },
    '#2563eb': { start: '#2563eb', end: '#1d4ed8' },
    '#d946ef': { start: '#d946ef', end: '#c026d3' },
    '#84cc16': { start: '#84cc16', end: '#65a30d' },
    '#9333ea': { start: '#9333ea', end: '#7e22ce' },
    '#ea580c': { start: '#ea580c', end: '#c2410c' },
    '#0891b2': { start: '#0891b2', end: '#0e7490' },
    '#64748b': { start: '#64748b', end: '#475569' }
};

/** 축전지 모드: 태그 키워드별 마커 내부 홀 모양 (외곽 핀은 동일) */
const BATTERY_TAG_MARKER_SHAPES = {
    '통합국': 'star',
    '창고': 'square',
    '기지국': 'circle'
};

const BATTERY_TAG_SHAPE_PRIORITY = ['통합국', '창고', '기지국'];

const MARKER_PIN_OUTER_PATH = 'M12,2 C6.48,2 2,6.48 2,12 C2,19.2 12,34 12,34 C12,34 22,19.2 22,12 C22,6.48 17.52,2 12,2 Z';

function getMarkerGradientTheme(colorHex) {
    return MARKER_GRADIENTS[colorHex] || { start: colorHex, end: colorHex };
}

function getBatteryMarkerShapeFromTags(tags) {
    if (!tags || tags.length === 0) return 'circle';

    const normalizedTags = tags
        .map(tag => tag.toString().trim())
        .filter(tag => tag.length > 0);

    for (const keyword of BATTERY_TAG_SHAPE_PRIORITY) {
        const matched = normalizedTags.some(tag => tag === keyword || tag.includes(keyword));
        if (matched) {
            return BATTERY_TAG_MARKER_SHAPES[keyword];
        }
    }

    return 'circle';
}

function getMarkerInnerShape(innerShape) {
    if (innerShape === 'square') {
        return '<rect x="7.2" y="6.2" width="9.6" height="9.6" rx="0.6" fill="#ffffff"/>';
    }

    if (innerShape === 'star') {
        return '<path d="M12,5.4 L13.75,9.95 H18.6 L14.7,12.75 L16.45,17.3 L12,14.35 L7.55,17.3 L9.3,12.75 L5.4,9.95 H10.25 Z" fill="#ffffff"/>';
    }

    return '<circle cx="12" cy="11" r="5.2" fill="#ffffff"/>';
}

function getMarkerShapeBody(innerShape, gradId) {
    return `
  <path d="${MARKER_PIN_OUTER_PATH}" fill="url(#${gradId})" stroke="#ffffff" stroke-width="1.5"/>
  ${getMarkerInnerShape(innerShape)}`;
}

function getMarkerSvg(colorHex, innerShape = 'circle') {
    const theme = getMarkerGradientTheme(colorHex);
    const gradId = 'grad-' + colorHex.replace('#', '');

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="30" height="45">
  <defs>
    <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.start}" />
      <stop offset="100%" stop-color="${theme.end}" />
    </linearGradient>
  </defs>
  ${getMarkerShapeBody(innerShape, gradId)}
</svg>`;

    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.trim());
}

function getMarkerImageUri(marker, currentMode = 'equipment') {
    if (marker.isPending) return MARKER_SVG_GOLD;

    const color = getEffectiveMarkerColor(marker, currentMode);
    const innerShape = currentMode === 'battery'
        ? getBatteryMarkerShapeFromTags(marker.tags)
        : 'circle';

    return getMarkerSvg(color, innerShape);
}

/** 시설팀 정의 — 팀 선택 시 마커 색상이 자동 연동됩니다 */
const FACILITY_TEAMS = {
    '1': { label: '1팀', leader: '박경훈', color: '#2563eb' },
    '2': { label: '2팀', leader: '김정배', color: '#d946ef' },
    '3': { label: '3팀', leader: '정종연', color: '#84cc16' },
    '4': { label: '4팀', leader: '이동화', color: '#9333ea' },
    '5': { label: '5팀', leader: '김영남', color: '#ea580c' },
    '7': { label: '7팀', leader: '김성범', color: '#0891b2' }
};

const DEFAULT_MARKER_COLOR = '#10b981';
const BATTERY_UNASSIGNED_COLOR = '#64748b';

const LEGACY_COLOR_NAMES = {
    '#10b981': '에메랄드',
    '#64748b': '미지정',
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

function getFacilityTeamColor(teamId) {
    if (!teamId) return BATTERY_UNASSIGNED_COLOR;
    return FACILITY_TEAMS[teamId]?.color || BATTERY_UNASSIGNED_COLOR;
}

function getFacilityTeamDisplayName(teamId) {
    const team = FACILITY_TEAMS[teamId];
    return team ? `${team.label}(${team.leader})` : '미지정';
}

function getMarkerColorLabel(colorHex) {
    const normalized = (colorHex || '').toLowerCase().trim();
    for (const [teamId, team] of Object.entries(FACILITY_TEAMS)) {
        if (team.color.toLowerCase() === normalized) {
            return getFacilityTeamDisplayName(teamId);
        }
    }
    return LEGACY_COLOR_NAMES[normalized] || colorHex;
}

function getEffectiveMarkerColor(marker, currentMode = 'battery') {
    if (marker.isTemp) return '#ef4444';
    if (currentMode === 'battery') {
        if (marker.facilityTeam && FACILITY_TEAMS[marker.facilityTeam]) {
            return FACILITY_TEAMS[marker.facilityTeam].color;
        }
        return BATTERY_UNASSIGNED_COLOR;
    }
    return marker.color || DEFAULT_MARKER_COLOR;
}

function getBatteryOverlaySpecSummary(data) {
    const rawSpecs = (data.items && data.items.length > 0)
        ? data.items
        : [{
            capacity: data.capacity,
            quantity: data.quantity
        }];

    const summaryByCapacity = new Map();
    rawSpecs.forEach(spec => {
        const capacity = parseInt(spec.capacity, 10);
        const quantity = parseInt(spec.quantity, 10);
        if (isNaN(capacity) || isNaN(quantity)) return;
        summaryByCapacity.set(capacity, (summaryByCapacity.get(capacity) || 0) + quantity);
    });

    return Array.from(summaryByCapacity.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([capacity, totalQuantity]) => ({ capacity, totalQuantity }));
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
        this.selectedColor = DEFAULT_MARKER_COLOR; // 현재 모달에서 선택된 마커 색상 Hex
        this.selectedFacilityTeam = ''; // 현재 모달에서 선택된 시설팀 ID
        
        // 축전지 모드 관련 추가 상태 정의
        this.currentMode = 'equipment'; // 'equipment' or 'battery'
        this.isDetailViewMode = false;
        this.eqMarkersData = [];
        this.batteryMarkersData = [];
        this.selectedCapacities = new Set(); // 축전지 용량 필터 셋
        this.selectedQuantities = new Set(); // 축전지 수량 필터 셋
        this.selectedStations = new Set(); // 축전지 국소명 필터 셋
        
        // 인증 상태 정의
        this.currentUser = null;
        
        // DOM 요소 캐시
        this.cacheElements();
        
        // 이벤트 바인딩
        this.bindEvents();
        
        // 앱 초기화 진행
        this.init();
    }



    async init() {
        this.supabase = typeof this.createSupabaseClient === 'function'
            ? this.createSupabaseClient()
            : null;

        if (this.supabase && typeof this.setupSupabaseAuth === 'function') {
            this.setupSupabaseAuth();
        } else if (typeof this.updateAuthUI === 'function') {
            this.updateAuthUI(null);
        }

        // 오프라인·DB 장애 대비 로컬 캐시 선로드 후, DB가 있으면 최신 데이터로 덮어씀
        this.loadFromLocalStorage();
        if (this.supabase && typeof this.loadFromSupabase === 'function') {
            await this.loadFromSupabase();
        }

        // 정적 스크립트 로드 완료 후 지도 로딩 진행
        if (window.kakao && window.kakao.maps) {
            kakao.maps.load(() => {
                this.initializeMap();
            });
        } else {
            this.showToast('카카오 지도 SDK가 로드되지 않았습니다. index.html 설정을 확인하세요.', 5000);
        }
        
        // DB 반영 후 필터·목록 구성 (로컬 캐시만으로 필터가 고정되면 신규 마커가 누락됨)
        this.initFilters(true);

        this.updateBatteryBulkDeleteButtonVisibility();
        this.updateFacilityTeamVisibility();
        this.updateFilterSectionVisibility();
        this.renderMarkersList();
        this.logMarkerVisibilityIfFiltered();
    }


    // 모든 드롭다운 닫기

    // 데이터 기반 필터 고유 옵션 목록 동적 초기화
 
 
 

    // 지도 인스턴스 생성 및 초기화

    // 지도 상의 특정 좌표 클릭 이벤트

    // 임시 마커 지우기

    // 마커 생성 모달 열기

    // 모달창 내 입력 필드 읽기 전용 토글 헬퍼 함수


    // Supabase에서 국소명 기준으로 연관 상세 정보를 조회하여 테이블 및 폼에 바인딩

    // 마커 상세 보기 전용 모달 열기 (읽기 전용)

    // 마커 수정 모달 열기
 


    // 상세 정보 테이블 클립보드 복사 (TSV 포맷, 엑셀 바로 적용 가능)

    // 마커 추가/수정 로직

    // 마커 삭제 로직



    // 지도 상에 저장된 모든 마커 렌더링


    // 마커 드래그 이동 종료 시 좌표 업데이트 및 Supabase 연동 처리

    // 오버레이(말풍선) 내 주소 실시간 갱신

    // 마커 및 오버레이 임시 위치 이동 처리



    // 선택된 시설팀 및 연동 마커 색상 업데이트


    // 선택된 색상 칩 업데이트 (레거시 호환)

    // 위치 변경 모드 진입

    // 위치 변경 저장

    // 위치 변경 취소

    // 카카오 Geocoder를 통한 역지오코딩 주소 조회 (Promise 래퍼)

    // 지번 주소 포맷터 (숫자로 끝날 시 맨 뒤에 '번지' 추가)

    // 카카오 Geocoder를 통한 역지오코딩 주소 조회

    // 마커 정보창(오버레이)에서 시설팀 선택 시 즉시 저장 (축전지 모드 전용)

    // 세련된 형태의 HTML 커스텀 오버레이 빌딩

    // 대기 마커 단건 전송 또는 임시 등록 처리

    // 왼쪽 사이드바 마커 목록 렌더링

    // 필터링된 마커 리스트 실제 HTML 조립 출력 헬퍼

    // 키보드로 필터링 결과 마커 선택 처리

    // 포커스된 마커 항목의 시각적 갱신 및 스크롤 제어

    // 장소 키워드 및 주소 하이브리드 검색



    // 지적편집도 토글 기능

    // 마커 클러스터러 On/Off 토글 기능

    // 지오로케이션(Geolocation API) 내 위치 찾기

    // 맵 줌인/줌아웃 제어

    // 위치 마커 CSV 내보내기 (Supabase 실시간 데이터 반영)

    // 위치 마커 Excel 백업 (Supabase 실시간 데이터 반영)

    // 위치 마커 Excel 복원

    // 위치 마커 복원 공통 처리 (Excel)

    // 상세 장비 정보 Excel 백업

    // 상세 장비 정보 Excel 복원

    // 상세 장비 정보 복원 공통 처리 (Excel)

    // Excel 파일 가져오기 및 파싱

    // 대기 마커 개수 업데이트 및 UI 제어 (페이지 이탈 방지 경고 포함)

    // 대기 마커 전체 Supabase 또는 임시 등록 처리

    // 대기 마커 전체 취소 및 지도 클리어

    // 주소 변환 큐 처리

    // 개별 주소 geocode

    // 상세장비정보 엑셀 업로드 핸들러

    // 엑셀 위치 등록 확인 모달 열기

    // 엑셀 위치 등록 확인 모달 닫기

    // 모달 표 내부 행 개수 업데이트 헬퍼

    // 엑셀 확인 모달 개별 이동

    // 엑셀 확인 모달 개별 등록 (전송)

    // 엑셀 확인 모달 개별 제외

    // 상세장비정보 전송 확인 모달 열기

    // 상세장비정보 전송 확인 모달 닫기

    // Supabase information 테이블에 전송

    // 토스트 노티피케이션 노출

    // 날짜 문자열을 yyyy-mm-dd 포맷으로 변환하는 헬퍼 메서드
    formatToShortDate(dateStr) {
        return DataManager.formatDateToYmd(dateStr);
    }

    // td 내 텍스트 또는 인풋 값 취득용 헬퍼 함수

    // 선택된 상세 정보 테이블 셀 하이라이트 클리어

    // 선택 셀 복사 버튼 노출 여부 제어

    // 선택된 셀들의 데이터를 엑셀 호환(\n 및 \t 구분) 포맷팅하여 클립보드 복사

    // 상세 정보 테이블의 특정 열 전체 데이터를 세로로 모아서 복사

    // 로드뷰 모달 열기 및 파노라마 매핑

    // 로드뷰 모달 닫기

    // 현재 파노라마 ID를 기준으로 과거 촬영 날짜 목록을 조회하여 선택박스 동적 구성

    // 로드뷰 모달창 드래그 이동 기능 초기화

    // --- 축전지 모드 관련 구현 ---




















}

// DOM 로딩 완료 시 앱 구동
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MapMarkerApp();
});
