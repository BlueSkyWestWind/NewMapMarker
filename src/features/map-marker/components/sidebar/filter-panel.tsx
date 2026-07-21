'use client';

import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  onSetAll,
  renderLabel,
}: {
  title: string;
  values: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  /** 전체 선택([...values]) / 해제([]) 를 한 번에 반영 */
  onSetAll: (values: string[]) => void;
  renderLabel?: (value: string) => string;
}) {
  if (!values.length) return null;

  const allSelected = values.every((value) => selected.has(value));
  const summary = allSelected
    ? '전체'
    : selected.size === 0
      ? '선택 안 함'
      : `${selected.size}/${values.length} 선택`;

  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-700/50 pb-3">
      <p className="shrink-0 text-xs font-semibold tracking-wide text-slate-300">
        {title}
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-7 min-w-[8rem] max-w-[12rem] items-center justify-between gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-2 text-[11px] text-slate-200 outline-none hover:bg-slate-800 focus:border-slate-500"
          >
            <span className="truncate">{summary}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="max-h-64 w-56 overflow-y-auto border-slate-700 bg-slate-900 text-slate-200"
        >
          <div className="flex gap-1 p-1">
            <button
              type="button"
              className="flex-1 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-700"
              onClick={() => onSetAll(values)}
            >
              전체 선택
            </button>
            <button
              type="button"
              className="flex-1 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-700"
              onClick={() => onSetAll([])}
            >
              해제
            </button>
          </div>
          <DropdownMenuSeparator className="bg-slate-700" />
          {values.map((value) => (
            <DropdownMenuCheckboxItem
              key={value}
              checked={selected.has(value)}
              // 항목 선택 시 메뉴가 닫히지 않도록(다중 선택 유지)
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={() => onToggle(value)}
              className="text-[11px] focus:bg-slate-800 focus:text-slate-100"
            >
              <span className="truncate">
                {renderLabel ? renderLabel(value) : value}
              </span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
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
            onSetAll={(values) => selectAllFilterValues('year', values)}
          />
          <FilterGroup
            title="사업구분"
            values={filterOptions.businesses}
            selected={filters.selectedBusinesses}
            onToggle={(value) => toggleFilterValue('business', value)}
            onSetAll={(values) => selectAllFilterValues('business', values)}
          />
        </>
      )}
      <FilterGroup
        title="색상"
        values={filterOptions.colors}
        selected={filters.selectedColors}
        onToggle={(value) => toggleFilterValue('color', value)}
        onSetAll={(values) => selectAllFilterValues('color', values)}
        renderLabel={(value) => getMarkerColorLabel(value)}
      />
      <FilterGroup
        title="태그"
        values={filterOptions.tags}
        selected={filters.selectedTags}
        onToggle={(value) => toggleFilterValue('tag', value)}
        onSetAll={(values) => selectAllFilterValues('tag', values)}
      />
    </div>
  );
}
