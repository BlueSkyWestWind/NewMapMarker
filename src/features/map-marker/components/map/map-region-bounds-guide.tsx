"use client";

import { useEffect, useState } from "react";
import type {
  CaptureGridPlan,
  MapBoundsLiteral,
} from "@/features/map-marker/lib/map-capture-stitch";

interface MapRegionBoundsGuideProps {
  map: KakaoMap;
  bounds: MapBoundsLiteral;
  plan: CaptureGridPlan | null;
  viewportSpan: { latSpan: number; lngSpan: number } | null;
  /** 이미 촬영한 타일 수 — 다음 칸 강조용 */
  capturedCount?: number;
}

interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface GridCellScreen extends ScreenRect {
  key: string;
  label: string;
  index: number;
}

function projectBoundsToScreen(
  map: KakaoMap,
  swLat: number,
  swLng: number,
  neLat: number,
  neLng: number,
): ScreenRect | null {
  const projection = map.getProjection();
  if (!projection) return null;

  const swPoint = projection.containerPointFromCoords(
    new window.kakao.maps.LatLng(swLat, swLng),
  );
  const nePoint = projection.containerPointFromCoords(
    new window.kakao.maps.LatLng(neLat, neLng),
  );

  const left = Math.min(swPoint.x, nePoint.x);
  const right = Math.max(swPoint.x, nePoint.x);
  const top = Math.min(swPoint.y, nePoint.y);
  const bottom = Math.max(swPoint.y, nePoint.y);

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

/**
 * 지정 범위와 캡처 격자를 지도 위에 표시한다.
 */
export function MapRegionBoundsGuide({
  map,
  bounds,
  plan,
  viewportSpan,
  capturedCount = 0,
}: MapRegionBoundsGuideProps) {
  const [regionRect, setRegionRect] = useState<ScreenRect | null>(null);
  const [cells, setCells] = useState<GridCellScreen[]>([]);

  useEffect(() => {
    if (!window.kakao?.maps) return;

    const update = () => {
      setRegionRect(
        projectBoundsToScreen(
          map,
          bounds.sw.lat,
          bounds.sw.lng,
          bounds.ne.lat,
          bounds.ne.lng,
        ),
      );

      if (!plan || !viewportSpan) {
        setCells([]);
        return;
      }

      const halfLat = viewportSpan.latSpan / 2;
      const halfLng = viewportSpan.lngSpan / 2;

      const nextCells: GridCellScreen[] = [];
      for (let index = 0; index < plan.tiles.length; index += 1) {
        const tile = plan.tiles[index];
        const rect = projectBoundsToScreen(
          map,
          tile.center.lat - halfLat,
          tile.center.lng - halfLng,
          tile.center.lat + halfLat,
          tile.center.lng + halfLng,
        );
        if (!rect) continue;

        nextCells.push({
          ...rect,
          key: `${tile.row}-${tile.col}`,
          label: `${index + 1}`,
          index,
        });
      }
      setCells(nextCells);
    };

    update();
    window.kakao.maps.event.addListener(map, "idle", update);
    window.kakao.maps.event.addListener(map, "zoom_changed", update);
    window.kakao.maps.event.addListener(map, "center_changed", update);

    return () => {
      window.kakao.maps.event.removeListener(map, "idle", update);
      window.kakao.maps.event.removeListener(map, "zoom_changed", update);
      window.kakao.maps.event.removeListener(map, "center_changed", update);
    };
  }, [map, bounds, plan, viewportSpan]);

  if (!regionRect) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      <div
        className="absolute border-2 border-dashed border-sky-400 bg-sky-400/10"
        data-capture-hide="true"
        style={{
          left: regionRect.left,
          top: regionRect.top,
          width: regionRect.width,
          height: regionRect.height,
        }}
      />

      {cells.map((cell) => {
        const isCaptured = cell.index < capturedCount;
        const isNext = cell.index === capturedCount;

        return (
          <div
            key={cell.key}
            className={
              isNext
                ? "absolute border-2 border-amber-400 bg-amber-400/20"
                : isCaptured
                  ? "absolute border border-emerald-400/80 bg-emerald-400/15"
                  : "absolute border border-sky-300/70 bg-sky-300/10"
            }
            data-capture-hide="true"
            style={{
              left: cell.left,
              top: cell.top,
              width: cell.width,
              height: cell.height,
            }}
          >
            <span
              className={
                isNext
                  ? "absolute left-1 top-1 rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-950"
                  : isCaptured
                    ? "absolute left-1 top-1 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    : "absolute left-1 top-1 rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-semibold text-sky-100"
              }
            >
              {cell.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
