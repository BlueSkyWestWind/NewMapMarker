export type MapMode = "equipment" | "battery" | "location";

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
}

export interface BatteryMarker extends BaseMarker {
  address: string;
  items: BatterySpecItem[];
  capacity: number;
  quantity: number;
  stationName: string;
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
