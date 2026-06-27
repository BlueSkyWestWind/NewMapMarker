'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { getMarkerColorLabel } from '@/features/map-marker/lib/marker-svg';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import type { MapMode } from '@/features/map-marker/types/marker';

interface FilterPanelProps {
  mode: MapMode;
  filterOptions: {
    years: string[];
    businesses: string[];
    colors: string[];
    tags: string[];
  };
}

function FilterGroup({
  title,
  values,
  selected,
  onToggle,
  onSelectAll,
  renderLabel,
}: {
  title: string;
  values: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onSelectAll: () => void;
  renderLabel?: (value: string) => string;
}) {
  if (!values.length) return null;

  return (
    <div className="space-y-2 border-b border-slate-700/50 pb-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-300">{title}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px] text-slate-400"
          onClick={onSelectAll}
        >
          전체
        </Button>
      </div>
      <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
        {values.map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800/60"
          >
            <Checkbox
              checked={selected.has(value)}
              onCheckedChange={() => onToggle(value)}
            />
            <span className="truncate">
              {renderLabel ? renderLabel(value) : value}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function FilterPanel({ mode, filterOptions }: FilterPanelProps) {
  const filters = useMapMarkerStore((state) => state.filters);
  const toggleFilterValue = useMapMarkerStore((state) => state.toggleFilterValue);
  const selectAllFilterValues = useMapMarkerStore(
    (state) => state.selectAllFilterValues,
  );

  return (
    <div className="space-y-3">
      {mode === 'equipment' && (
        <>
          <FilterGroup
            title="연도"
            values={filterOptions.years}
            selected={filters.selectedYears}
            onToggle={(value) => toggleFilterValue('year', value)}
            onSelectAll={() =>
              selectAllFilterValues('year', filterOptions.years)
            }
          />
          <FilterGroup
            title="사업구분"
            values={filterOptions.businesses}
            selected={filters.selectedBusinesses}
            onToggle={(value) => toggleFilterValue('business', value)}
            onSelectAll={() =>
              selectAllFilterValues('business', filterOptions.businesses)
            }
          />
        </>
      )}
      <FilterGroup
        title="색상"
        values={filterOptions.colors}
        selected={filters.selectedColors}
        onToggle={(value) => toggleFilterValue('color', value)}
        onSelectAll={() => selectAllFilterValues('color', filterOptions.colors)}
        renderLabel={(value) => getMarkerColorLabel(value)}
      />
      <FilterGroup
        title="태그"
        values={filterOptions.tags}
        selected={filters.selectedTags}
        onToggle={(value) => toggleFilterValue('tag', value)}
        onSelectAll={() => selectAllFilterValues('tag', filterOptions.tags)}
      />
    </div>
  );
}
