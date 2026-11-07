"use client";

import { useMemo } from "react";
import { useMapMarkersQuery } from "@/features/map-marker/hooks/use-map-markers-query";
import { buildMarkerGroups } from "@/features/group-admin/lib/build-groups";
import type { MarkerGroup } from "@/features/group-admin/types";

const NO_GROUPS: MarkerGroup[] = [];

/**
 * 장비 마커를 번지 묶음으로 만든다. 부수효과가 없다(쿼리는 캐시를 공유한다).
 * `enabled`가 false면 계산하지 않는다 — 마커 목록 훅이 모든 메뉴에서 부르기 때문이다.
 */
export function useMarkerGroups(enabled = true): MarkerGroup[] {
  const { data } = useMapMarkersQuery();
  const equipmentMarkers = data?.equipmentMarkers;
  return useMemo(
    () =>
      enabled && equipmentMarkers ? buildMarkerGroups(equipmentMarkers) : NO_GROUPS,
    [enabled, equipmentMarkers],
  );
}
