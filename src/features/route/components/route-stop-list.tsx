"use client";

import { useRef, useState } from "react";
import { GripVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isPlottableCoordinate } from "@/features/map-marker/components/map/kakao-map-helpers";
import { useRouteMarkerPool } from "@/features/route/hooks/use-route-marker-pool";
import { useRouteStore } from "@/features/route/store/use-route-store";
import type { MarkerRecord } from "@/features/map-marker/types/marker";

/** 방문 지점 목록 — 드래그 재정렬(§8: 재정렬 즉시 orderSource = manual), 삭제, 추가. */
export function RouteStopList() {
  const stops = useRouteStore((state) => state.stops);
  const pickTarget = useRouteStore((state) => state.pickTarget);
  const setPickTarget = useRouteStore((state) => state.setPickTarget);
  const addStop = useRouteStore((state) => state.addStop);
  const removeStop = useRouteStore((state) => state.removeStop);
  const reorderStops = useRouteStore((state) => state.reorderStops);
  const markers = useRouteMarkerPool();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dragIndexRef = useRef<number | null>(null);

  const filtered = markers
    .filter((marker) => isPlottableCoordinate(marker.lat, marker.lng))
    .filter((marker) => query.trim() === "" || marker.name.includes(query.trim()))
    .slice(0, 30);

  const handleAdd = (marker: MarkerRecord) => {
    addStop({
      routePointId: marker.id,
      markerIds: [marker.id],
      name: marker.name,
      lat: marker.lat,
      lng: marker.lng,
    });
  };

  const handleDrop = (targetIndex: number) => {
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    if (from === null || from === targetIndex) return;
    const next = [...stops];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    reorderStops(next);
  };

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-slate-300">방문 지점</p>

      {stops.length === 0 ? (
        <p className="text-[10px] text-slate-500">방문 지점을 추가하세요.</p>
      ) : (
        <ul className="space-y-1">
          {stops.map((stop, index) => (
            <li
              key={stop.routePointId}
              draggable
              onDragStart={() => {
                dragIndexRef.current = index;
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(index)}
              className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-[11px] text-slate-200"
            >
              <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-slate-500" aria-hidden />
              <span className="w-4 shrink-0 text-slate-500">{index + 1}.</span>
              <span className="min-w-0 flex-1 truncate" title={stop.name}>
                {stop.name}
              </span>
              <button
                type="button"
                className="shrink-0 text-slate-500 hover:text-rose-400"
                onClick={() => removeStop(stop.routePointId)}
                aria-label={`${stop.name} 삭제`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={pickTarget === "stop" ? "default" : "outline"}
          className="h-7 text-[11px]"
          onClick={() => setPickTarget(pickTarget === "stop" ? null : "stop")}
        >
          지도에서 추가
        </Button>
        <Button
          type="button"
          size="sm"
          variant={isSearchOpen ? "default" : "outline"}
          className="h-7 text-[11px]"
          onClick={() => setIsSearchOpen((prev) => !prev)}
        >
          + 지점 추가
        </Button>
      </div>

      {pickTarget === "stop" ? (
        <p className="text-[10px] text-sky-400">지도에서 마커를 클릭해 방문 지점으로 추가하세요.</p>
      ) : null}

      {isSearchOpen ? (
        <div className="space-y-1 rounded-md border border-slate-700 bg-slate-900/80 p-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="국소명 검색"
            className="h-7 text-[11px] text-slate-100"
          />
          <div className="max-h-40 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-1 py-1 text-[10px] text-slate-500">검색 결과가 없습니다.</p>
            ) : (
              filtered.map((marker) => (
                <button
                  key={marker.id}
                  type="button"
                  className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] text-slate-200 hover:bg-slate-800"
                  onClick={() => handleAdd(marker)}
                >
                  {marker.name}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
