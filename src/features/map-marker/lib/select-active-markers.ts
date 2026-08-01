import type { MapMode, MarkerRecord } from "@/features/map-marker/types/marker";

/**
 * 모드별 마커 선별의 입력. 훅이 스토어·쿼리에서 모은 값을 그대로 넘긴다.
 * React에 기대지 않는 순수 입력이라 테스트에서 그대로 구성할 수 있다.
 */
export interface ActiveMarkerSources {
  /** DB 조회 결과. 아직 로드 전이면 null */
  equipmentMarkers: MarkerRecord[] | null;
  batteryMarkers: MarkerRecord[] | null;
  pendingEquipmentMarkers: MarkerRecord[];
  pendingBatteryMarkers: MarkerRecord[];
  pendingLocationMarkers: MarkerRecord[];
}

/**
 * 지도에 올릴 마커 목록을 모드에 따라 고른다.
 *
 * 훅에서 떼어낸 이유: 이 판정이 틀리면 지도에 없어야 할 마커가 뜨거나 있어야 할 마커가 빠지는데,
 * 훅 안에 있으면 렌더링 없이 확인할 방법이 없다. 순수함수로 두면 조합을 표로 고정할 수 있다.
 */
export function selectActiveMarkers(
  mode: MapMode,
  sources: ActiveMarkerSources,
): MarkerRecord[] {
  // 날씨 모드는 지도에 마커를 두지 않는다.
  // 사이드바가 날씨 패널만 렌더하므로(map-sidebar.tsx) 이 목록의 유일한 소비처가 지도다.
  if (mode === "weather") {
    return [];
  }

  // 위치 모드는 DB 없이 브라우저 메모리 목록만 사용한다.
  if (mode === "location") {
    return sources.pendingLocationMarkers;
  }

  const isEquipment = mode === "equipment";
  const base =
    (isEquipment ? sources.equipmentMarkers : sources.batteryMarkers) ?? [];
  const pending = isEquipment
    ? sources.pendingEquipmentMarkers
    : sources.pendingBatteryMarkers;

  // 같은 id가 양쪽에 있으면 pending이 이긴다 — 사용자가 방금 올린 값이 최신이다.
  const pendingIds = new Set(pending.map((marker) => marker.id));

  return [...base.filter((marker) => !pendingIds.has(marker.id)), ...pending];
}
