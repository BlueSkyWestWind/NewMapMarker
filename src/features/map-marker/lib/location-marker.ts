import { DEFAULT_MARKER_COLOR } from "@/features/map-marker/constants/facility-teams";
import type {
  BatteryMarker,
  EquipmentMarker,
  LocationMarker,
} from "@/features/map-marker/types/marker";
import {
  equipmentMarkerToCandidate,
  isSubCandidate,
  normalize,
} from "@/features/worksite-weather/lib/site-search";
import type { SiteMatch } from "@/features/worksite-weather/types/weather";

function createLocationMarkerId() {
  return `loc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 임시 위치 마커를 생성한다. (브라우저 메모리 전용)
 */
export function createLocationMarker(params: {
  lat: number;
  lng: number;
  name: string;
  address?: string;
  id?: string;
}): LocationMarker {
  return {
    id: params.id ?? createLocationMarkerId(),
    name: params.name,
    lat: params.lat,
    lng: params.lng,
    address: params.address ?? "",
    memo: "",
    tags: [],
    color: DEFAULT_MARKER_COLOR,
    facilityTeam: "",
    createdAt: new Date().toISOString(),
  };
}

/**
 * 장비 엑셀 파싱 결과를 임시 위치 마커로 변환한다.
 */
export function createLocationMarkerFromExcelRow(
  row: {
    id?: string;
    name?: string;
    lat?: number;
    lng?: number;
    address?: string;
    roadAddress?: string;
    jibunAddress?: string;
  },
  fallbackIndex: number,
): LocationMarker | null {
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const address = String(
    row.roadAddress || row.address || row.jibunAddress || "",
  ).trim();
  const name =
    String(row.name ?? "").trim() || address || `위치 ${fallbackIndex}`;

  return createLocationMarker({
    id: row.id ? String(row.id) : undefined,
    lat,
    lng,
    name,
    address,
  });
}

/**
 * 위치 마커를 대시보드 작업 국소(SiteMatch)로 변환한다.
 * 좌표만 있으면 기상 조회가 가능하므로 작업 유형은 기본값(지상)으로 둔다.
 */
export function locationMarkerToSiteMatch(marker: LocationMarker): SiteMatch {
  return {
    id: marker.id,
    name: marker.name,
    address: marker.address,
    lat: marker.lat,
    lng: marker.lng,
    workType: "ground",
    matchedBy: "manual",
  };
}

/**
 * 위치 마커의 주소와 같은 주소를 가진 장비 마커를 찾는다(대표 국소만 대상 — SUB는 제외).
 */
export function findEquipmentMarkerByAddress(
  equipmentMarkers: EquipmentMarker[],
  address: string,
): EquipmentMarker | null {
  const needle = normalize(address);
  if (!needle) return null;

  for (const marker of equipmentMarkers) {
    if (isSubCandidate(equipmentMarkerToCandidate(marker))) continue;
    const road = normalize(marker.roadAddress ?? "");
    const jibun = normalize(marker.jibunAddress ?? "");
    if ((road && road === needle) || (jibun && jibun === needle)) {
      return marker;
    }
  }
  return null;
}

/** 주소로 찾은 저장된(DB) 마커의 위치·이름만 뽑아낸 결과 */
export interface SavedMarkerPosition {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/**
 * 입력 주소와 같은 저장된 마커(장비·축전지)가 있으면 그 마커의 좌표를 그대로 쓴다.
 * 새로 지오코딩하면 기존 등록 위치와 미세하게 어긋날 수 있어, 이미 등록된 주소는
 * 저장된 마커 위치를 우선한다(장비 → 축전지 순, 둘 다 대표 국소만 대상).
 */
export function findSavedMarkerByAddress(
  address: string,
  equipmentMarkers: EquipmentMarker[],
  batteryMarkers: BatteryMarker[] = [],
): SavedMarkerPosition | null {
  const equipmentMatch = findEquipmentMarkerByAddress(equipmentMarkers, address);
  if (equipmentMatch) {
    return {
      id: equipmentMatch.id,
      name: equipmentMatch.name || equipmentMatch.finalStationName || address,
      lat: equipmentMatch.lat,
      lng: equipmentMatch.lng,
    };
  }

  const needle = normalize(address);
  if (!needle) return null;

  const batteryMatch = batteryMarkers.find(
    (marker) => normalize(marker.address ?? "") === needle,
  );
  if (batteryMatch) {
    return {
      id: batteryMatch.id,
      name: batteryMatch.name || batteryMatch.stationName || address,
      lat: batteryMatch.lat,
      lng: batteryMatch.lng,
    };
  }

  return null;
}

/**
 * 위치 등록을 대시보드 작업 국소로 변환한다.
 * 주소가 같은 장비 마커가 있으면 그 장비 마커를 그대로 국소로 쓴다 — 지도·대시보드에
 * 위치 핀이 아니라 기존 장비 마커로 표시되어 중복이 생기지 않는다.
 */
export function resolveWeatherSiteForLocation(
  marker: LocationMarker,
  equipmentMarkers: EquipmentMarker[],
): SiteMatch {
  const matched = findEquipmentMarkerByAddress(equipmentMarkers, marker.address);
  if (!matched) {
    return locationMarkerToSiteMatch(marker);
  }

  return {
    id: matched.id,
    name: matched.name || matched.finalStationName || marker.name,
    address: matched.roadAddress || matched.jibunAddress || marker.address,
    lat: matched.lat,
    lng: matched.lng,
    workType: matched.workType === "elevated" ? "elevated" : "ground",
    matchedBy: "address",
  };
}
