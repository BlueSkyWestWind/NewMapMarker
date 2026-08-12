"use client";

import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  markerPassesFilters,
  getMarkerVisibilityStats,
} from "@/features/map-marker/lib/marker-filters";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import type {
  LocationMarker,
  MapMode,
  MarkerFilterState,
  MarkerRecord,
} from "@/features/map-marker/types/marker";

interface MarkersListPanelProps {
  mode: MapMode;
  markers: MarkerRecord[];
  filters: MarkerFilterState;
}

function getMarkerAddress(marker: MarkerRecord, mode: MapMode) {
  if (mode === "location" || mode === "battery") {
    return (marker as LocationMarker).address;
  }
  return "";
}

export function MarkersListPanel({
  mode,
  markers,
  filters,
}: MarkersListPanelProps) {
  const markerListFilter = useMapMarkerStore((state) => state.markerListFilter);
  const setMarkerListFilter = useMapMarkerStore(
    (state) => state.setMarkerListFilter,
  );
  const removePendingMarkers = useMapMarkerStore(
    (state) => state.removePendingMarkers,
  );
  const removeSavedWeatherSite = useMapMarkerStore(
    (state) => state.removeSavedWeatherSite,
  );
  const selectedMarkerId = useMapMarkerStore((state) => state.selectedMarkerId);
  const isLocationMode = mode === "location";

  const filteredMarkers = useMemo(() => {
    const byDropdown = markers.filter((marker) =>
      markerPassesFilters(marker, mode, filters),
    );
    const text = markerListFilter.trim().toLowerCase();
    if (!text) {
      return isLocationMode ? byDropdown : [];
    }

    return byDropdown.filter((marker) => {
      const nameMatch = marker.name.toLowerCase().includes(text);
      const memoMatch = marker.memo.toLowerCase().includes(text);
      const tagMatch = marker.tags.some((tag) =>
        tag.toLowerCase().includes(text),
      );
      const addressMatch = getMarkerAddress(marker, mode)
        .toLowerCase()
        .includes(text);
      return nameMatch || memoMatch || tagMatch || addressMatch;
    });
  }, [markers, mode, filters, markerListFilter, isLocationMode]);

  const stats = getMarkerVisibilityStats(markers, mode, filters);
  const countLabel =
    stats.visible === stats.total
      ? String(stats.total)
      : `${stats.visible} / ${stats.total}`;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      {isLocationMode ? (
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">
            등록 위치 ({countLabel})
          </h2>
        </div>
      ) : null}
      <Input
        value={markerListFilter}
        onChange={(e) => setMarkerListFilter(e.target.value)}
        placeholder={
          isLocationMode ? "이름·주소로 필터링..." : "이름·주소로 위치 찾기..."
        }
        className="mb-3 h-8 border-slate-700 bg-slate-900/60 text-xs"
      />
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-700/50 bg-slate-900/30">
        {!isLocationMode && !markerListFilter.trim() ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-xs text-slate-500">
            <p>검색어를 입력하면</p>
            <p>위치 목록이 여기에 표시됩니다.</p>
          </div>
        ) : filteredMarkers.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            {isLocationMode
              ? "엑셀을 업로드해 위치를 등록하세요."
              : "검색 필터와 일치하는 마커가 없습니다."}
          </div>
        ) : (
          <ul className="divide-y divide-slate-800/80">
            {filteredMarkers.map((marker) => {
              const address = getMarkerAddress(marker, mode);

              return (
                <li
                  key={marker.id}
                  className={
                    marker.id === selectedMarkerId
                      ? "flex cursor-pointer items-start gap-2 border-l-2 border-indigo-500 bg-indigo-500/10 px-3 py-2 text-xs shadow-glow-sm"
                      : "flex cursor-pointer items-start gap-2 border-l-2 border-transparent px-3 py-2 text-xs hover:bg-slate-800/50"
                  }
                  onClick={() => {
                    useMapMarkerStore.getState().setSelectedMarkerId(marker.id);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-100">{marker.name}</p>
                    {address ? (
                      <p className="mt-0.5 truncate text-slate-500">
                        {address}
                      </p>
                    ) : isLocationMode ? (
                      <p className="mt-0.5 truncate text-slate-600">
                        주소 조회 중...
                      </p>
                    ) : null}
                    {!isLocationMode && marker.memo ? (
                      <p className="mt-0.5 truncate text-slate-500">
                        {marker.memo}
                      </p>
                    ) : null}
                  </div>
                  {isLocationMode ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-slate-500 hover:text-rose-300"
                      title="삭제"
                      onClick={(event) => {
                        event.stopPropagation();
                        removePendingMarkers("location", [marker.id]);
                        removeSavedWeatherSite(marker.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
