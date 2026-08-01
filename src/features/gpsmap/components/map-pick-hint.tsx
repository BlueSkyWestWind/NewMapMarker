"use client";

import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";

/**
 * 지도 좌상단 안내. 지금 지도를 누르면 무슨 일이 일어나는지 알려 준다.
 *
 * 패널에도 같은 문구가 있지만, 클릭하는 곳은 지도라서 시선이 닿는 자리에 한 번 더 둔다.
 */
export function MapPickHint() {
  const mapPickMode = useMapMarkerStore((state) => state.mapPickMode);

  if (mapPickMode === "off") return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-md border border-slate-700 bg-slate-950/85 px-3 py-1.5 text-[11px] text-slate-200 shadow-lg">
      {mapPickMode === "roadview"
        ? "🚶 파란 도로 위를 클릭하면 로드뷰가 열립니다"
        : "🟨 클릭하면 해당 지점을 조회합니다"}
    </div>
  );
}
