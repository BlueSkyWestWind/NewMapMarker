'use client';

import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import {
  markerPassesFilters,
  getMarkerVisibilityStats,
} from '@/features/map-marker/lib/marker-filters';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import type { MapMode, MarkerRecord } from '@/features/map-marker/types/marker';

interface MarkersListPanelProps {
  mode: MapMode;
  markers: MarkerRecord[];
}

export function MarkersListPanel({ mode, markers }: MarkersListPanelProps) {
  const filters = useMapMarkerStore((state) => state.filters);
  const markerListFilter = useMapMarkerStore((state) => state.markerListFilter);
  const setMarkerListFilter = useMapMarkerStore(
    (state) => state.setMarkerListFilter,
  );

  const filteredMarkers = useMemo(() => {
    const byDropdown = markers.filter((marker) =>
      markerPassesFilters(marker, mode, filters),
    );
    const text = markerListFilter.trim().toLowerCase();
    if (!text) return byDropdown;

    return byDropdown.filter((marker) => {
      const nameMatch = marker.name.toLowerCase().includes(text);
      const memoMatch = marker.memo.toLowerCase().includes(text);
      const tagMatch = marker.tags.some((tag) =>
        tag.toLowerCase().includes(text),
      );
      return nameMatch || memoMatch || tagMatch;
    });
  }, [markers, mode, filters, markerListFilter]);

  const stats = getMarkerVisibilityStats(markers, mode, filters);
  const countLabel =
    stats.visible === stats.total
      ? String(stats.total)
      : `${stats.visible} / ${stats.total}`;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-100">
          저장된 위치 ({countLabel})
        </h2>
      </div>
      <Input
        value={markerListFilter}
        onChange={(e) => setMarkerListFilter(e.target.value)}
        placeholder="저장된 위치 필터링..."
        className="mb-3 h-8 border-slate-700 bg-slate-900/60 text-xs"
      />
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-700/50 bg-slate-900/30">
        {!markerListFilter.trim() ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-xs text-slate-500">
            <p>필터링 검색어를 입력하면</p>
            <p>저장된 위치 목록이 여기에 표시됩니다.</p>
          </div>
        ) : filteredMarkers.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            검색 필터와 일치하는 마커가 없습니다.
          </div>
        ) : (
          <ul className="divide-y divide-slate-800/80">
            {filteredMarkers.map((marker) => (
              <li
                key={marker.id}
                className="cursor-pointer px-3 py-2 text-xs hover:bg-slate-800/50"
              >
                <p className="font-medium text-slate-100">{marker.name}</p>
                {marker.memo ? (
                  <p className="mt-0.5 truncate text-slate-500">{marker.memo}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
