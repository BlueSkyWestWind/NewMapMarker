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
  /** 엑셀에서 올린 도로명(신) 주소 */
  roadAddress: string;
  /** 엑셀에서 올린 지번 주소 */
  jibunAddress: string;
  /** 마커 좌표의 주소(도로명 우선). 위치를 저장하거나 옮길 때 구한다. 엑셀 주소와 다를 수 있다 */
  markerAddress?: string;
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

/**
 * 신규 / DB에 있지만 좌표 없음 / DB에 있고 좌표 있음 /
 * 같은 마커에 상세 행만 덧붙이는 추가 사업(같은 코드·연도, 다른 프로젝트코드)
 */
export type StagedErpRowKind = "new" | "missingCoords" | "existing" | "addon";

/** 갱신·추가 전에 보여 줄 한 행의 변경 내용. 화면용이며 저장하지 않는다. */
export interface ErpRowPreview {
  /** update: 기존 건 갱신(바뀌는 칸만), add: 추가 사업(새로 들어갈 값) */
  kind: "update" | "add";
  /** 화면에 보일 현재 국소명 */
  currentName: string;
  /** 갱신이면 `이전 → 이후`, 추가면 이전이 빈 값인 새 값 목록 */
  changes: Array<{ label: string; before: string; after: string }>;
  /** 반영하면 시설 상태가 바뀔 수 있을 때의 안내. 없으면 빈 문자열 */
  warning: string;
}

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
  /** 확인 목록에서 직접 묶은 대표/SUB 그룹. 저장할 마커 행에도 같은 값이 실려 있다 */
  group?: { key: string; role: "대표" | "SUB" };
  /** 기존 건 갱신·추가 사업의 변경 내용 미리보기. 확인 목록(new)에는 없다 */
  preview?: ErpRowPreview;
}

/** 위치등록 파일에서 저장하지 않는 행 */
export interface StagedErpSkippedRow {
  name: string;
  address: string;
  reason: "코드 없음" | "주소 없음" | "지난 사업연도";
}

/**
 * 위치등록(공정관리) 업로드의 대기 데이터.
 * 확인 대상은 [확인] 때 건별로, 기존 건은 [기존 건 갱신] 때 저장한다.
 */
export interface StagedErpUpload {
  reviewRows: StagedErpRow[];
  existingRows: StagedErpRow[];
  /** 같은 마커에 상세 행으로 덧붙일 추가 사업. 없으면 비어 있는 것으로 본다 */
  addonRows?: StagedErpRow[];
  /** 코드나 주소가 없어 저장하지 않는 행 */
  skippedRows: StagedErpSkippedRow[];
  /** 저장한 건이 있어 대표/SUB 재정리가 남아 있는지 */
  needsRegroup: boolean;
  /** 사람이 읽을 수 있게 포맷된 실패 주소 목록 */
  geocodeFailedAddresses: string[];
}
