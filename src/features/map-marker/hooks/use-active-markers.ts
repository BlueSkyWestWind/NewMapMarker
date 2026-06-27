'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useMapMarkersQuery } from '@/features/map-marker/hooks/use-map-markers-query';
import {
  emptyFilterState,
  useMapMarkerStore,
} from '@/features/map-marker/store/use-map-marker-store';
import {
  collectFilterOptions,
  createDefaultFilterState,
  hasAnyFilterSelection,
  mergeFilterState,
} from '@/features/map-marker/lib/marker-filters';
import type { MarkerFilterState, MarkerRecord } from '@/features/map-marker/types/marker';

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

export function useActiveMarkers() {
  const mode = useMapMarkerStore((state) => state.mode);
  const pendingEquipmentMarkers = useMapMarkerStore(
    (state) => state.pendingEquipmentMarkers,
  );
  const pendingBatteryMarkers = useMapMarkerStore(
    (state) => state.pendingBatteryMarkers,
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

  const markers = useMemo<MarkerRecord[]>(() => {
    const base = !data
      ? []
      : mode === 'equipment'
        ? data.equipmentMarkers
        : data.batteryMarkers;
    const pending =
      mode === 'equipment' ? pendingEquipmentMarkers : pendingBatteryMarkers;
    const pendingIds = new Set(pending.map((marker) => marker.id));
    const merged = [...base.filter((marker) => !pendingIds.has(marker.id)), ...pending];
    return merged;
  }, [data, mode, pendingEquipmentMarkers, pendingBatteryMarkers]);

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
  }, [
    markers.length,
    mode,
    filterOptions.years.join(','),
    filterOptions.businesses.join(','),
    filterOptions.colors.join(','),
    filterOptions.tags.join(','),
    filters,
    setFilters,
  ]);

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
    isLoading,
    isError,
    error,
    refetch,
    equipmentCount: data?.equipmentMarkers.length ?? 0,
    batteryCount: data?.batteryMarkers.length ?? 0,
  };
}
