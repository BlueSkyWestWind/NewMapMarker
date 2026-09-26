"use client";

import { useState } from "react";
import { Crosshair, ListFilter, Search, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isPlottableCoordinate } from "@/features/map-marker/components/map/kakao-map-helpers";
import { geocodeAddress } from "@/features/map-marker/lib/geocode";
import { useRouteMarkerPool } from "@/features/route/hooks/use-route-marker-pool";
import { useRouteStore } from "@/features/route/store/use-route-store";
import { useSavedOriginsStore } from "@/features/route/store/use-saved-origins-store";
import type { MarkerRecord } from "@/features/map-marker/types/marker";

export function RouteOriginPicker() {
  const origin = useRouteStore((state) => state.origin);
  const pickTarget = useRouteStore((state) => state.pickTarget);
  const setPickTarget = useRouteStore((state) => state.setPickTarget);
  const setOrigin = useRouteStore((state) => state.setOrigin);
  const clearOrigin = useRouteStore((state) => state.clearOrigin);
  const markers = useRouteMarkerPool();
  const savedOrigins = useSavedOriginsStore((state) => state.origins);
  const addSavedOrigin = useSavedOriginsStore((state) => state.addOrigin);
  const removeSavedOrigin = useSavedOriginsStore((state) => state.removeOrigin);
  const isOriginSaved = origin
    ? savedOrigins.some((saved) => saved.routePointId === origin.routePointId)
    : false;

  const [isListOpen, setIsListOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [addressQuery, setAddressQuery] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  const filtered = markers
    .filter((marker) => isPlottableCoordinate(marker.lat, marker.lng))
    .filter((marker) => query.trim() === "" || marker.name.includes(query.trim()))
    .slice(0, 30);

  const handlePick = (marker: MarkerRecord) => {
    setOrigin({
      routePointId: marker.id,
      markerIds: [marker.id],
      name: marker.name,
      lat: marker.lat,
      lng: marker.lng,
    });
    setIsListOpen(false);
    setQuery("");
  };

  const handleAddressSearch = async () => {
    const trimmed = addressQuery.trim();
    if (!trimmed || isGeocoding) return;

    setIsGeocoding(true);
    setAddressError(null);
    const coords = await geocodeAddress(trimmed);
    setIsGeocoding(false);

    if (!coords) {
      setAddressError(
        typeof window !== "undefined" && !window.kakao?.maps?.services
          ? "지도를 불러오는 중입니다. 잠시 후 다시 시도하세요."
          : "주소를 찾을 수 없습니다. 다른 표기로 시도해 보세요.",
      );
      return;
    }

    setOrigin({
      routePointId: `address:${trimmed}`,
      markerIds: [],
      name: trimmed,
      lat: coords.lat,
      lng: coords.lng,
    });
    setAddressQuery("");
  };

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-slate-300">출발지</p>

      {origin ? (
        <div className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-[11px] text-slate-200">
          <span className="min-w-0 flex-1 truncate" title={origin.name}>
            {origin.name}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {!isOriginSaved ? (
              <button
                type="button"
                className="text-slate-500 hover:text-amber-400"
                title="즐겨찾기에 저장"
                onClick={() => addSavedOrigin(origin)}
              >
                <Star className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button type="button" className="text-slate-500 hover:text-slate-300" onClick={clearOrigin}>
              변경
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-slate-500">출발지를 지정하세요.</p>
      )}

      {savedOrigins.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {savedOrigins.map((saved) => (
            <span
              key={saved.routePointId}
              className="flex items-center gap-1 rounded-full border border-amber-600/40 bg-amber-950/30 py-0.5 pl-2 pr-1 text-[10px] text-amber-200"
            >
              <button
                type="button"
                className="max-w-[8rem] truncate"
                title={`${saved.name} — 출발지로 지정`}
                onClick={() => setOrigin(saved)}
              >
                ★ {saved.name}
              </button>
              <button
                type="button"
                className="text-amber-400/70 hover:text-rose-400"
                aria-label={`${saved.name} 즐겨찾기 삭제`}
                onClick={() => removeSavedOrigin(saved.routePointId)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex gap-1.5">
        <Input
          value={addressQuery}
          onChange={(event) => {
            setAddressQuery(event.target.value);
            setAddressError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleAddressSearch();
            }
          }}
          placeholder="주소로 출발지 검색 (예: 순천시 조례동 사무실)"
          className="h-7 flex-1 text-[11px] text-slate-100"
        />
        <Button
          type="button"
          size="sm"
          className="h-7 shrink-0 px-2 text-[11px]"
          disabled={!addressQuery.trim() || isGeocoding}
          onClick={() => void handleAddressSearch()}
        >
          <Search className="h-3 w-3" aria-hidden />
        </Button>
      </div>
      {addressError ? <p className="text-[10px] text-rose-400">{addressError}</p> : null}

      <div className="grid grid-cols-2 gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={pickTarget === "origin" ? "default" : "outline"}
          className="h-7 text-[11px]"
          onClick={() => setPickTarget(pickTarget === "origin" ? null : "origin")}
        >
          <Crosshair className="mr-1 h-3 w-3" aria-hidden />
          지도에서 선택
        </Button>
        <Button
          type="button"
          size="sm"
          variant={isListOpen ? "default" : "outline"}
          className="h-7 text-[11px]"
          onClick={() => setIsListOpen((prev) => !prev)}
        >
          <ListFilter className="mr-1 h-3 w-3" aria-hidden />
          마커 목록에서 선택
        </Button>
      </div>

      {pickTarget === "origin" ? (
        <p className="text-[10px] text-sky-400">지도에서 마커를 클릭해 출발지로 지정하세요.</p>
      ) : null}

      {isListOpen ? (
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
                  onClick={() => handlePick(marker)}
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
