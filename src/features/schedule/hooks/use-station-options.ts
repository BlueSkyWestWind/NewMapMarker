"use client";

import { useMemo } from "react";
import { useMapMarkersQuery } from "@/features/map-marker/hooks/use-map-markers-query";
import { buildStationOptions, type StationOption } from "@/features/schedule/lib/station-search";

/**
 * 일정 칸에서 검색할 수 있는 국소 후보(장비 마커의 국소명·통합시설코드·프로젝트코드·주소·별칭).
 * 마커는 `useMapMarkersQuery`가 한 번만 받아 캐시하므로 여러 입력창이 불러도 요청이 늘지 않는다.
 */
export function useStationOptions(): StationOption[] {
  const { data } = useMapMarkersQuery();
  const equipmentMarkers = data?.equipmentMarkers;
  return useMemo(() => buildStationOptions(equipmentMarkers ?? []), [equipmentMarkers]);
}
