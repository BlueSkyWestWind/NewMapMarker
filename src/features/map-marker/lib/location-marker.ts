import { DEFAULT_MARKER_COLOR } from "@/features/map-marker/constants/facility-teams";
import type { LocationMarker } from "@/features/map-marker/types/marker";

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
