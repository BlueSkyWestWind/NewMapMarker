import type {
  LocationMarker,
  MarkerRecord,
} from "@/features/map-marker/types/marker";

const COORD_PRECISION = 6;

/**
 * 같은 지번(또는 동일 좌표)을 묶기 위한 키.
 * 주소가 있으면 주소 기준, 없으면 좌표 기준으로 묶는다.
 */
export function getLocationGroupKey(marker: MarkerRecord): string {
  const address = String((marker as LocationMarker).address ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (address) {
    return `addr:${address}`;
  }

  return `coord:${marker.lat.toFixed(COORD_PRECISION)},${marker.lng.toFixed(COORD_PRECISION)}`;
}

/**
 * 동일 지번/좌표 그룹의 국소명을 수집한다. (순서 유지, 중복 제거)
 */
export function collectLocationGroupNames(
  marker: MarkerRecord,
  markers: MarkerRecord[],
): string[] {
  const groupKey = getLocationGroupKey(marker);
  const names: string[] = [];
  const seen = new Set<string>();

  markers.forEach((item) => {
    if (getLocationGroupKey(item) !== groupKey) return;
    const name = item.name.trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  });

  if (names.length === 0 && marker.name.trim()) {
    return [marker.name.trim()];
  }

  return names;
}

/**
 * 선택 마커 중 같은 지번 그룹은 대표 1개만 남긴다. (오버레이 중복 방지)
 */
export function pickLocationOverlayRepresentatives(
  selectedIds: string[],
  markers: MarkerRecord[],
): Array<{ markerId: string; marker: MarkerRecord; groupNames: string[] }> {
  const byId = new Map(markers.map((marker) => [marker.id, marker]));
  const seenKeys = new Set<string>();
  const result: Array<{
    markerId: string;
    marker: MarkerRecord;
    groupNames: string[];
  }> = [];

  selectedIds.forEach((markerId) => {
    const marker = byId.get(markerId);
    if (!marker) return;

    const groupKey = getLocationGroupKey(marker);
    if (seenKeys.has(groupKey)) return;
    seenKeys.add(groupKey);

    result.push({
      markerId,
      marker,
      groupNames: collectLocationGroupNames(marker, markers),
    });
  });

  return result;
}
