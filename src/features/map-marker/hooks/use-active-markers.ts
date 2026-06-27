'use client';

import { useEffect, useMemo } from 'react';
import { useMapMarkersQuery } from '@/features/map-marker/hooks/use-map-markers-query';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import {
  collectFilterOptions,
  createDefaultFilterState,
} from '@/features/map-marker/lib/marker-filters';
import type { MarkerFilterState, MarkerRecord } from '@/features/map-marker/types/marker';

function setsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function mergeFilterState(
  current: MarkerFilterState,
  options: ReturnType<typeof collectFilterOptions>,
): MarkerFilterState {
  const hasAnySelection =
    current.selectedColors.size > 0 || current.selectedTags.size > 0;

  if (!hasAnySelection) {
    return createDefaultFilterState(options);
  }

  return {
    ...current,
    selectedYears: new Set(
      options.years.filter((year) => current.selectedYears.has(year)),
    ),
    selectedBusinesses: new Set(
      options.businesses.filter((business) =>
        current.selectedBusinesses.has(business),
      ),
    ),
    selectedColors: new Set(
      options.colors.filter((color) => current.selectedColors.has(color)),
    ),
    selectedTags: new Set(
      options.tags.filter((tag) => current.selectedTags.has(tag)),
    ),
  };
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

  useEffect(() => {
    if (!markers.length) return;

    const nextFilters = mergeFilterState(filters, filterOptions);
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

  return {
    markers,
    filterOptions,
    isLoading,
    isError,
    error,
    refetch,
    equipmentCount: data?.equipmentMarkers.length ?? 0,
    batteryCount: data?.batteryMarkers.length ?? 0,
  };
}
