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
  /** 대시보드에 올릴 작업등록 국소의 id. 지도에는 이 중 **장비 마커만** 뜬다(§3.4). */
  savedWeatherSiteIds: string[];
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
  /*
   * 대시보드(weather)는 일반 마커를 전부 감추고 **작업등록한 장비 국소만** 올린다.
   *
   * 축전지 국소는 목록에만 나오고 지도에는 올리지 않는다(사용자 확정) —
   * 따라서 지도 마커 수 ≤ 목록 건수이고, 둘이 같을 필요는 없다.
   */
  if (mode === "weather") {
    if (sources.savedWeatherSiteIds.length === 0) return [];

    const savedIds = new Set(sources.savedWeatherSiteIds);
    return (sources.equipmentMarkers ?? []).filter((marker) =>
      savedIds.has(marker.id),
    );
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
