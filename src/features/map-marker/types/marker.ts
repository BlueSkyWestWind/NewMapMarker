export type MapMode = "equipment" | "battery" | "location" | "weather";

export interface BatterySpecItem {
  id?: string;
  erpName: string;
  address: string;
  capacity: number;
  quantity: number;
  stationName: string;
  createdAt?: string;
}

export interface BaseMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  memo: string;
  tags: string[];
  color: string;
  facilityTeam: string;
  createdAt: string;
  isPending?: boolean;
  isTemp?: boolean;
}

export interface EquipmentMarker extends BaseMarker {
  roadAddress: string;
  jibunAddress: string;
  facilityCode: string;
  projectCode: string;
  facilityYear: string;
  businessType: string;
  finalStationName: string;
  eqClass: string;
  eqType: string;
  installDate: string;
  openDate: string;
  /** null/undefined = 대표 국소, 값 있음 = 해당 대표의 서브 */
  parentMarkerId?: string | null;
  /** DB/백업 구분: 대표 | SUB */
  groupRole?: string | null;
  /**
   * 번지 하위 분리 그룹 키. null = 번지 주소로 그룹(기본).
   * 값 있음 = 그 키로 별도 그룹(같은 번지라도 분리). 예: 아파트 동/공장 구역 분리.
   */
  groupKey?: string | null;
  /** 같은 번지 SUB를 지도에 개별 마커로 표시할지(기본 false, 대표만 표시) */
  detachedVisible?: boolean;
  /** 국소 검색용 별칭(쉼표 구분). 현장 호칭이 제각각이라 다중 등록을 허용한다. */
  siteAlias?: string | null;
  /** 'ground' | 'elevated'. 고소 국소는 작업 안전 날씨에서 강풍 판정을 강화한다. */
  workType?: string | null;
}

export interface BatteryMarker extends BaseMarker {
  address: string;
  items: BatterySpecItem[];
  capacity: number;
  quantity: number;
  stationName: string;
  /** 국소 검색용 별칭(쉼표 구분). 현장 호칭이 제각각이라 다중 등록을 허용한다. */
  siteAlias?: string | null;
  /** 'ground' | 'elevated'. 고소 국소는 작업 안전 날씨에서 강풍 판정을 강화한다. */
  workType?: string | null;
}

/** 브라우저 전용 임시 위치 마커 (DB 미저장) */
export interface LocationMarker extends BaseMarker {
  address: string;
}

export type MarkerRecord = EquipmentMarker | BatteryMarker | LocationMarker;

export interface MarkerFilterState {
  selectedYears: Set<string>;
  selectedBusinesses: Set<string>;
  selectedColors: Set<string>;
  selectedTags: Set<string>;
  selectedCapacities: Set<string>;
  selectedQuantities: Set<string>;
  selectedStations: Set<string>;
}

export interface MarkerVisibilityStats {
  total: number;
  visible: number;
  excludedByColor: number;
  excludedByTag: number;
  excludedByYear: number;
  excludedByBusiness: number;
}

export interface MapMarkersPayload {
  equipmentMarkers: EquipmentMarker[];
  batteryMarkers: BatteryMarker[];
}

/**
 * 위치등록(공정관리) 업로드를 즉시 저장하지 않고 "미리보기 후 적용"하기 위한 스테이징 데이터.
 * 파싱·지오코딩까지 끝난 markers/information/erp_details 행을 담아두고, [적용] 시 DB에 커밋한다.
 */
export interface StagedErpUpload {
  markerRows: Record<string, unknown>[];
  infoRows: Record<string, unknown>[];
  erpRows: Record<string, unknown>[];
  meta: {
    preservedCoordCount: number;
    newCoordCount: number;
    geocodeFailCount: number;
    /** 사람이 읽을 수 있게 포맷된 실패 주소 목록 */
    geocodeFailedAddresses: string[];
  };
}
