"use client";

import { useMemo } from "react";
import { useMapMarkersQuery } from "@/features/map-marker/hooks/use-map-markers-query";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import type { MarkerRecord } from "@/features/map-marker/types/marker";

/**
 * 경로탐색용 마커 전체 목록.
 *
 * `useMarkerList()`는 현재 지도 모드로 좁힌다 — 대시보드는 항상 weather 모드라
 * `selectActiveMarkers`가 "오늘의 작업 국소로 저장"한 것만 돌려준다(§select-active-markers.ts).
 * 경로탐색은 모드와 무관하게 장비·축전지·위치 마커 전체에서 골라야 하므로 별도로 합친다.
 */
export function useRouteMarkerPool(): MarkerRecord[] {
  const { data } = useMapMarkersQuery();
  const pendingEquipmentMarkers = useMapMarkerStore(
    (state) => state.pendingEquipmentMarkers,
  );
  const pendingBatteryMarkers = useMapMarkerStore(
    (state) => state.pendingBatteryMarkers,
  );
  const pendingLocationMarkers = useMapMarkerStore(
    (state) => state.pendingLocationMarkers,
  );

  return useMemo(() => {
    const pendingEquipmentIds = new Set(pendingEquipmentMarkers.map((m) => m.id));
    const pendingBatteryIds = new Set(pendingBatteryMarkers.map((m) => m.id));

    return [
      ...(data?.equipmentMarkers ?? []).filter((m) => !pendingEquipmentIds.has(m.id)),
      ...pendingEquipmentMarkers,
      ...(data?.batteryMarkers ?? []).filter((m) => !pendingBatteryIds.has(m.id)),
      ...pendingBatteryMarkers,
      ...pendingLocationMarkers,
    ];
  }, [data, pendingEquipmentMarkers, pendingBatteryMarkers, pendingLocationMarkers]);
}
