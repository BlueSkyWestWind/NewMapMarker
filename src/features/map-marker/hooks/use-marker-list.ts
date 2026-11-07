"use client";

import { useMemo } from "react";
import { useMapMarkersQuery } from "@/features/map-marker/hooks/use-map-markers-query";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { selectActiveMarkers } from "@/features/map-marker/lib/select-active-markers";
import { useMarkerGroups } from "@/features/group-admin/hooks/use-marker-groups";
import { useSiteLists } from "@/features/site-lists/hooks/use-site-lists";
import { buildSiteListBadges } from "@/features/site-lists/lib/site-list-view";
import type { MarkerRecord } from "@/features/map-marker/types/marker";

/**
 * 현재 모드의 마커 목록만 준다. **스토어에 쓰지 않는다.**
 *
 * `useActiveMarkers`는 필터 옵션을 스토어에 되쓰는 `useEffect` 2개를 갖고 있어
 * 트리에서 한 번만 불러야 한다. 목록만 필요한 쪽(상세·편집 모달)이 그 훅을 부르면
 * 인스턴스마다 별도의 ref로 같은 필터를 번갈아 덮어써 필터가 튄다.
 * 그래서 파생 계산만 여기로 떼어 냈다.
 *
 * `useMapMarkersQuery`는 TanStack Query라 여러 곳에서 불러도 요청이 한 번만 나간다.
 */
export function useMarkerList(): MarkerRecord[] {
  const mode = useMapMarkerStore((state) => state.mode);
  const pendingEquipmentMarkers = useMapMarkerStore(
    (state) => state.pendingEquipmentMarkers,
  );
  const pendingBatteryMarkers = useMapMarkerStore(
    (state) => state.pendingBatteryMarkers,
  );
  const pendingLocationMarkers = useMapMarkerStore(
    (state) => state.pendingLocationMarkers,
  );
  const savedWeatherSites = useMapMarkerStore((state) => state.savedWeatherSites);
  // 배열 정체성이 매번 바뀌면 아래 useMemo가 헛돈다. id 목록으로 좁혀 잡는다.
  const savedWeatherSiteIds = useMemo(
    () => savedWeatherSites.map((site) => site.id),
    [savedWeatherSites],
  );
  const { data } = useMapMarkersQuery();
  const mapSegment = useMapMarkerStore((state) => state.mapSegment);
  const selectedSiteListIds = useMapMarkerStore((state) => state.selectedSiteListIds);
  const { lists, members } = useSiteLists();
  // 변환기도 위치 모드를 쓰지만 목록 화면이 아니므로 올리지 않는다.
  const siteListBadges = useMemo(
    () =>
      buildSiteListBadges(
        lists,
        members,
        mapSegment === "location" ? selectedSiteListIds : [],
      ),
    [lists, members, mapSegment, selectedSiteListIds],
  );

  const activeNav = useMapMarkerStore((state) => state.activeNav);
  const selectedGroupKeys = useMapMarkerStore((state) => state.selectedGroupKeys);
  const isGroupNav = activeNav === "markers" && mapSegment === "groups";
  const groups = useMarkerGroups(isGroupNav);
  // 그룹관리 화면에서만 체크한 묶음의 마커 ID를 넘긴다. 그 밖에는 null이라 위치 목록 동작 그대로다.
  const groupAdminMarkerIds = useMemo(() => {
    if (!isGroupNav) return null;
    const keys = new Set(selectedGroupKeys);
    return groups
      .filter((group) => keys.has(group.key))
      .flatMap((group) => group.markers.map((marker) => marker.id));
  }, [isGroupNav, groups, selectedGroupKeys]);

  return useMemo(
    () =>
      selectActiveMarkers(mode, {
        equipmentMarkers: data?.equipmentMarkers ?? null,
        batteryMarkers: data?.batteryMarkers ?? null,
        pendingEquipmentMarkers,
        pendingBatteryMarkers,
        pendingLocationMarkers,
        savedWeatherSiteIds,
        siteListBadges,
        groupAdminMarkerIds,
      }),
    [
      savedWeatherSiteIds,
      data,
      mode,
      pendingEquipmentMarkers,
      pendingBatteryMarkers,
      pendingLocationMarkers,
      siteListBadges,
      groupAdminMarkerIds,
    ],
  );
}
