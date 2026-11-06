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
  /** 위치 메뉴에서 선택한 목록의 색상. 저장 색상 `color`와 별개다 */
  siteListColors?: string[];
  /** 색상으로 표시하지 못한 나머지 목록 수 */
  siteListExtraCount?: number;
}

/** 올해 장비 기준 시설 진행 상태. 판정은 `lib/facility-status.ts` */
export type FacilityStatus = "미시설" | "시설" | "개통완료" | "올해 대상 없음";

/** 한 장비(information 행)의 연도와 시설·개통일 */
export interface FacilityRecord {
  year: string;
  installDate: string;
  openDate: string;
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
  /** 이 마커 자신의 장비 전부. 조회 때 채운다(없으면 장비 없음으로 본다) */
  facilityRecords?: FacilityRecord[];
  /** 연도 필터용. 자기 + 숨은 SUB의 장비 연도. 조회 때 채운다 */
  groupYears?: string[];
  /** 기준 연도의 대표 상태. 조회 때 채운다(없으면 `올해 대상 없음`) */
  facilityStatus?: FacilityStatus;
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
  selectedStatuses: Set<string>;
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
  excludedByStatus: number;
}

export interface MapMarkersPayload {
  equipmentMarkers: EquipmentMarker[];
  batteryMarkers: BatteryMarker[];
}

/** 신규 / DB에 있지만 좌표 없음 / DB에 있고 좌표 있음 */
export type StagedErpRowKind = "new" | "missingCoords" | "existing";

/** 위치등록 파일의 한 행. 저장할 markers·information·erp_details 내용을 담는다. */
export interface StagedErpRow {
  id: string;
  kind: StagedErpRowKind;
  name: string;
  /** 엑셀의 주소. 마커 위치와 대조할 때 쓴다 */
  address: string;
  lat: number | null;
  lng: number | null;
  marker: Record<string, unknown>;
  info: Record<string, unknown>;
  erp: Record<string, unknown>;
}

/** 위치등록 파일에서 저장하지 않는 행 */
export interface StagedErpSkippedRow {
  name: string;
  address: string;
  reason: "코드 없음" | "주소 없음";
}

/**
 * 위치등록(공정관리) 업로드의 대기 데이터.
 * 확인 대상은 [확인] 때 건별로, 기존 건은 [기존 건 갱신] 때 저장한다.
 */
export interface StagedErpUpload {
  reviewRows: StagedErpRow[];
  existingRows: StagedErpRow[];
  /** 코드나 주소가 없어 저장하지 않는 행 */
  skippedRows: StagedErpSkippedRow[];
  /** 저장한 건이 있어 대표/SUB 재정리가 남아 있는지 */
  needsRegroup: boolean;
  /** 사람이 읽을 수 있게 포맷된 실패 주소 목록 */
  geocodeFailedAddresses: string[];
}
