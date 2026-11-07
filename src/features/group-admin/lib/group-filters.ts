import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import {
  getMarkerFilterYears,
  normalizeFilterValue,
} from "@/features/map-marker/lib/marker-filters";
import { searchEquipmentSites } from "@/features/site-lists/lib/site-list-view";
import type { GroupFilters, MarkerGroup } from "../types";

const DEFAULT_STATUS = "올해 대상 없음";

function anyMarkerMatches(
  group: MarkerGroup,
  selected: string[],
  valuesOf: (marker: EquipmentMarker) => string[],
): boolean {
  if (selected.length === 0) return true;
  return group.markers.some((m) =>
    valuesOf(m).some((value) => selected.includes(value)),
  );
}

/** 필터를 모두 만족하는 묶음만 남긴다. 배열이 비면 그 조건은 걸러내지 않는다. */
export function filterGroups(
  groups: MarkerGroup[],
  filters: GroupFilters,
): MarkerGroup[] {
  const query = filters.query.trim();
  return groups.filter((group) => {
    if (filters.onlyNoCoord && !group.hasNoCoord) return false;
    if (filters.onlySuspect && !group.isSuspect) return false;
    if (query && searchEquipmentSites(group.markers, query).length === 0) {
      return false;
    }
    return (
      anyMarkerMatches(group, filters.years, getMarkerFilterYears) &&
      anyMarkerMatches(group, filters.statuses, (m) => [
        m.facilityStatus ?? DEFAULT_STATUS,
      ]) &&
      anyMarkerMatches(group, filters.businesses, (m) => [
        normalizeFilterValue(m.businessType),
      ])
    );
  });
}
