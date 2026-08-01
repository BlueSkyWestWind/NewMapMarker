"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMapMarkersQuery } from "@/features/map-marker/hooks/use-map-markers-query";
import {
  emptyFilterState,
  useMapMarkerStore,
} from "@/features/map-marker/store/use-map-marker-store";
import {
  collectFilterOptions,
  createDefaultFilterState,
  hasAnyFilterSelection,
  mergeFilterState,
} from "@/features/map-marker/lib/marker-filters";
import { useMarkerList } from "@/features/map-marker/hooks/use-marker-list";
import type { MarkerFilterState } from "@/features/map-marker/types/marker";

function setsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function shouldUpdateFilters(
  current: MarkerFilterState,
  next: MarkerFilterState,
) {
  return (
    !setsEqual(current.selectedYears, next.selectedYears) ||
    !setsEqual(current.selectedBusinesses, next.selectedBusinesses) ||
    !setsEqual(current.selectedColors, next.selectedColors) ||
    !setsEqual(current.selectedTags, next.selectedTags)
  );
}

/**
 * 마커 목록 + 필터 옵션 동기화.
 *
 * **트리에서 한 번만 호출한다.** 아래 `useEffect` 2개가 `setFilters`로 스토어에 쓰고
 * 그 판단을 인스턴스별 `useRef`에 담기 때문에, 두 곳 이상에서 부르면 서로의 필터를
 * 번갈아 덮어쓴다. 목록만 필요하면 `useMarkerList`를 쓴다.
 */
export function useActiveMarkers() {
  const mode = useMapMarkerStore((state) => state.mode);
  // 건수 표시에만 쓴다. 목록 파생은 `useMarkerList`가 맡는다.
  const pendingLocationMarkers = useMapMarkerStore(
    (state) => state.pendingLocationMarkers,
  );
  const { data, isLoading, isError, error, refetch } = useMapMarkersQuery();
  const filters = useMapMarkerStore((state) => state.filters);
  const setFilters = useMapMarkerStore((state) => state.setFilters);
  const prevFilterOptionsRef = useRef<ReturnType<typeof collectFilterOptions>>({
    years: [],
    businesses: [],
    colors: [],
    tags: [],
  });
  const previousModeRef = useRef(mode);

  // 목록 파생은 `useMarkerList`가 단독으로 맡는다. 여기서는 그 결과에 필터 부수효과를 얹는다.
  const markers = useMarkerList();

  const filterOptions = useMemo(
    () => collectFilterOptions(markers, mode),
    [markers, mode],
  );

  const invalidCoordinateCount = useMemo(
    () =>
      markers.filter(
        (marker) =>
          !marker.isPending &&
          !marker.isTemp &&
          (!Number.isFinite(marker.lat) ||
            !Number.isFinite(marker.lng) ||
            (marker.lat === 0 && marker.lng === 0)),
      ).length,
    [markers],
  );

  useEffect(() => {
    if (previousModeRef.current === mode) {
      return;
    }
    previousModeRef.current = mode;

    prevFilterOptionsRef.current = {
      years: [],
      businesses: [],
      colors: [],
      tags: [],
    };

    if (markers.length === 0) {
      setFilters(emptyFilterState);
      return;
    }

    setFilters(createDefaultFilterState(filterOptions));
  }, [mode, markers.length, filterOptions, setFilters]);

  // 복잡 표현식을 의존성 배열에서 정적으로 검사 가능하도록 key 변수로 추출한다.
  const filterOptionsKey = [
    filterOptions.years.join(","),
    filterOptions.businesses.join(","),
    filterOptions.colors.join(","),
    filterOptions.tags.join(","),
  ].join("|");

  useEffect(() => {
    if (!markers.length) return;

    const nextFilters = mergeFilterState(
      filters,
      filterOptions,
      prevFilterOptionsRef.current,
    );
    prevFilterOptionsRef.current = filterOptions;

    if (!shouldUpdateFilters(filters, nextFilters)) {
      return;
    }

    setFilters(nextFilters);
    // filterOptions는 filterOptionsKey(내용 해시)로 변화를 감지하므로 객체 자체는 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers.length, mode, filterOptionsKey, filters, setFilters]);

  const effectiveFilters = useMemo(() => {
    if (!markers.length || !hasAnyFilterSelection(filters)) {
      return createDefaultFilterState(filterOptions);
    }
    return filters;
  }, [filters, filterOptions, markers.length]);

  return {
    markers,
    filterOptions,
    effectiveFilters,
    invalidCoordinateCount,
    isLoading: mode === "location" ? false : isLoading,
    isError: mode === "location" ? false : isError,
    error,
    refetch,
    equipmentCount: data?.equipmentMarkers.length ?? 0,
    batteryCount: data?.batteryMarkers.length ?? 0,
    locationCount: pendingLocationMarkers.length,
  };
}
