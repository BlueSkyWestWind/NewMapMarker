import {
  COLOR_FILTER_ORDER,
  UNSPECIFIED_FILTER_LABEL,
} from '@/features/map-marker/constants/facility-teams';
import { getEffectiveMarkerColor } from '@/features/map-marker/lib/marker-svg';
import type {
  EquipmentMarker,
  MapMode,
  MarkerFilterState,
  MarkerRecord,
  MarkerVisibilityStats,
} from '@/features/map-marker/types/marker';

export function normalizeFilterValue(value: string | undefined | null) {
  const trimmed = value?.toString().trim();
  return trimmed || UNSPECIFIED_FILTER_LABEL;
}

export function markerPassesFilters(
  marker: MarkerRecord,
  mode: MapMode,
  filters: MarkerFilterState,
) {
  if (marker.isPending || marker.isTemp) {
    return true;
  }

  const color = getEffectiveMarkerColor(marker, mode).toLowerCase().trim();
  if (
    filters.selectedColors.size > 0 &&
    !filters.selectedColors.has(color)
  ) {
    return false;
  }

  if (filters.selectedTags.size > 0) {
    const hasMatchingTag =
      marker.tags.length > 0
        ? marker.tags.some((tag) => filters.selectedTags.has(tag.trim()))
        : filters.selectedTags.has(UNSPECIFIED_FILTER_LABEL);

    if (!hasMatchingTag) {
      return false;
    }
  }

  if (mode === 'equipment') {
    const equipment = marker as EquipmentMarker;
    const year = normalizeFilterValue(equipment.facilityYear);
    const business = normalizeFilterValue(equipment.businessType);

    if (
      filters.selectedYears.size > 0 &&
      !filters.selectedYears.has(year)
    ) {
      return false;
    }

    if (
      filters.selectedBusinesses.size > 0 &&
      !filters.selectedBusinesses.has(business)
    ) {
      return false;
    }
  }

  return true;
}

export function collectFilterOptions(markers: MarkerRecord[], mode: MapMode) {
  const years = new Set<string>();
  const businesses = new Set<string>();
  const colors = new Set<string>();
  const tags = new Set<string>();

  markers.forEach((marker) => {
    const color = getEffectiveMarkerColor(marker, mode).toLowerCase().trim();
    colors.add(color);

    if (marker.tags.length > 0) {
      marker.tags.forEach((tag) => {
        const clean = tag.trim();
        if (clean) tags.add(clean);
      });
    } else {
      tags.add(UNSPECIFIED_FILTER_LABEL);
    }

    if (mode === 'equipment') {
      const equipment = marker as EquipmentMarker;
      years.add(normalizeFilterValue(equipment.facilityYear));
      businesses.add(normalizeFilterValue(equipment.businessType));
    }
  });

  const sortWithUnspecifiedLast = (values: string[]) =>
    [...values].sort((a, b) => {
      if (a === UNSPECIFIED_FILTER_LABEL) return 1;
      if (b === UNSPECIFIED_FILTER_LABEL) return -1;
      return a.localeCompare(b);
    });

  const sortYears = (values: string[]) =>
    [...values].sort((a, b) => {
      if (a === UNSPECIFIED_FILTER_LABEL) return 1;
      if (b === UNSPECIFIED_FILTER_LABEL) return -1;
      return Number.parseInt(b, 10) - Number.parseInt(a, 10);
    });

  const sortColors = (values: string[]) =>
    [...values].sort((a, b) => {
      const idxA = COLOR_FILTER_ORDER.indexOf(a);
      const idxB = COLOR_FILTER_ORDER.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

  return {
    years: sortYears([...years]),
    businesses: sortWithUnspecifiedLast([...businesses]),
    colors: sortColors([...colors]),
    tags: sortWithUnspecifiedLast([...tags]),
  };
}

/**
 * 연도 필터의 기본 선택. **올해 + 미지정**이다.
 *
 * - 연도 정보가 없는 마커(미지정)는 새로 등록한 직후에도 흔하므로 함께 보여 준다.
 * - 올해 마커가 하나도 없으면(예: 새해 첫날) 지도가 비지 않도록 전체를 선택한다.
 * - 연도 목록 자체가 비어 있으면(축전지·위치 모드 등) 빈 집합 그대로다.
 */
export function defaultSelectedYears(years: string[], now: Date = new Date()): Set<string> {
  const thisYear = String(now.getFullYear());
  if (!years.includes(thisYear)) {
    return new Set(years);
  }
  return new Set(
    years.filter((year) => year === thisYear || year === UNSPECIFIED_FILTER_LABEL),
  );
}

/**
 * 필터 드롭다운 버튼에 보일 요약 문구.
 *
 * `nameLimit`이 있으면 선택된 값이 그 개수 이하일 때 **이름**을 목록 순서대로 보여 준다
 * (연도 필터: "2026", "2026, 미지정"). 값이 하나뿐인 목록에서도 "전체" 대신 그 이름이 보인다.
 * 한도를 넘거나 한도가 없으면 "전체" / "선택 안 함" / "n/m 선택" 규칙이다.
 */
export function summarizeFilterSelection(
  values: string[],
  selected: Set<string>,
  nameLimit?: number,
): string {
  const selectedCount = values.filter((value) => selected.has(value)).length;
  if (selectedCount === 0) return '선택 안 함';

  if (nameLimit !== undefined && selectedCount <= nameLimit) {
    return values.filter((value) => selected.has(value)).join(', ');
  }
  if (selectedCount === values.length) return '전체';
  return `${selectedCount}/${values.length} 선택`;
}

export function createDefaultFilterState(
  options: ReturnType<typeof collectFilterOptions>,
  now: Date = new Date(),
) {
  return {
    selectedYears: defaultSelectedYears(options.years, now),
    selectedBusinesses: new Set(options.businesses),
    selectedColors: new Set(options.colors),
    selectedTags: new Set(options.tags),
    selectedCapacities: new Set<string>(),
    selectedQuantities: new Set<string>(),
    selectedStations: new Set<string>(),
  };
}

export function hasAnyFilterSelection(filters: MarkerFilterState) {
  return (
    filters.selectedColors.size > 0 ||
    filters.selectedTags.size > 0 ||
    filters.selectedYears.size > 0 ||
    filters.selectedBusinesses.size > 0
  );
}

export function mergeFilterState(
  current: MarkerFilterState,
  options: ReturnType<typeof collectFilterOptions>,
  previousOptions?: ReturnType<typeof collectFilterOptions>,
): MarkerFilterState {
  if (!hasAnyFilterSelection(current)) {
    return createDefaultFilterState(options);
  }

  const mergeDimension = (
    selected: Set<string>,
    allValues: string[],
    prevValues?: string[],
  ) => {
    const retained = allValues.filter((value) => selected.has(value));
    if (retained.length === 0) {
      return new Set(allValues);
    }

    const merged = new Set(retained);
    if (prevValues) {
      for (const value of allValues) {
        if (!prevValues.includes(value)) {
          merged.add(value);
        }
      }
    }
    return merged;
  };

  return {
    selectedYears: mergeDimension(current.selectedYears, options.years),
    selectedBusinesses: mergeDimension(
      current.selectedBusinesses,
      options.businesses,
    ),
    selectedColors: mergeDimension(
      current.selectedColors,
      options.colors,
      previousOptions?.colors,
    ),
    selectedTags: mergeDimension(
      current.selectedTags,
      options.tags,
      previousOptions?.tags,
    ),
    selectedCapacities: current.selectedCapacities,
    selectedQuantities: current.selectedQuantities,
    selectedStations: current.selectedStations,
  };
}

export function getMarkerVisibilityStats(
  markers: MarkerRecord[],
  mode: MapMode,
  filters: MarkerFilterState,
): MarkerVisibilityStats {
  const registered = markers.filter((m) => !m.isPending && !m.isTemp);
  let visible = 0;
  let excludedByColor = 0;
  let excludedByTag = 0;
  let excludedByYear = 0;
  let excludedByBusiness = 0;

  registered.forEach((marker) => {
    const color = getEffectiveMarkerColor(marker, mode).toLowerCase().trim();
    if (
      filters.selectedColors.size > 0 &&
      !filters.selectedColors.has(color)
    ) {
      excludedByColor++;
      return;
    }

    if (filters.selectedTags.size > 0) {
      const hasMatchingTag =
        marker.tags.length > 0
          ? marker.tags.some((tag) => filters.selectedTags.has(tag.trim()))
          : filters.selectedTags.has(UNSPECIFIED_FILTER_LABEL);

      if (!hasMatchingTag) {
        excludedByTag++;
        return;
      }
    }

    if (mode === 'equipment') {
      const equipment = marker as EquipmentMarker;
      const year = normalizeFilterValue(equipment.facilityYear);
      const business = normalizeFilterValue(equipment.businessType);

      if (
        filters.selectedYears.size > 0 &&
        !filters.selectedYears.has(year)
      ) {
        excludedByYear++;
        return;
      }

      if (
        filters.selectedBusinesses.size > 0 &&
        !filters.selectedBusinesses.has(business)
      ) {
        excludedByBusiness++;
        return;
      }
    }

    visible++;
  });

  return {
    total: registered.length,
    visible,
    excludedByColor,
    excludedByTag,
    excludedByYear,
    excludedByBusiness,
  };
}
