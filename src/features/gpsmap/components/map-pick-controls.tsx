"use client";

import { Crosshair, Eye, FileDown, SquareStack } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";

/**
 * 지도 사용 모드 토글 — 클릭 조회 · 로드뷰 · 지적도 화면 · 엑셀.
 *
 * 좌측 패널이 아니라 **상단 바 우측**에 둔다. 넷 다 지도를 대상으로 하는 조작이라
 * 지도를 보는 시선 안에 있어야 하고, 패널에 있으면 조회 폼과 섞여 성격이 흐려진다.
 * [엑셀]은 사이드바(단건 조회)에 있던 버튼을 옮긴 것 — 결과는 스토어의
 * `converterSingleResult`로 받는다.
 */
export function MapPickControls() {
  const mapPickMode = useMapMarkerStore((state) => state.mapPickMode);
  const setMapPickMode = useMapMarkerStore((state) => state.setMapPickMode);
  const isVworldPaneOpen = useMapMarkerStore((state) => state.isVworldPaneOpen);
  const setVworldPaneOpen = useMapMarkerStore((state) => state.setVworldPaneOpen);
  const converterSingleResult = useMapMarkerStore(
    (state) => state.converterSingleResult,
  );

  const base =
    "flex h-7 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        aria-pressed={mapPickMode === "lookup"}
        onClick={() => setMapPickMode(mapPickMode === "lookup" ? "off" : "lookup")}
        title="지도를 클릭한 지점을 조회합니다"
        className={cn(
          base,
          mapPickMode === "lookup"
            ? "border-indigo-500/60 bg-indigo-600/25 text-indigo-200"
            : "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-slate-200",
        )}
      >
        <Crosshair className="h-3.5 w-3.5 shrink-0" aria-hidden />
        클릭 조회
      </button>

      <button
        type="button"
        aria-pressed={mapPickMode === "roadview"}
        onClick={() =>
          setMapPickMode(mapPickMode === "roadview" ? "off" : "roadview")
        }
        title="로드뷰가 있는 도로를 표시하고, 도로를 클릭하면 로드뷰를 엽니다"
        className={cn(
          base,
          mapPickMode === "roadview"
            ? "border-amber-500/60 bg-amber-600/25 text-amber-200"
            : "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-slate-200",
        )}
      >
        <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
        로드뷰
      </button>

      <button
        type="button"
        aria-pressed={isVworldPaneOpen}
        onClick={() => setVworldPaneOpen(!isVworldPaneOpen)}
        title="지도 하단에 브이월드 지적도 화면을 띄웁니다"
        className={cn(
          base,
          isVworldPaneOpen
            ? "border-emerald-500/60 bg-emerald-600/25 text-emerald-200"
            : "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-slate-200",
        )}
      >
        <SquareStack className="h-3.5 w-3.5 shrink-0" aria-hidden />
        지적도 화면
      </button>

      <button
        type="button"
        disabled={!converterSingleResult}
        onClick={() => {
          if (!converterSingleResult) return;
          // xlsx는 무거워 홈 번들에 정적으로 끌고 오지 않는다 — 클릭 시점에만 불러온다.
          void import("@/features/gpsmap/lib/export-excel").then(({ downloadSingleExcel }) =>
            downloadSingleExcel(converterSingleResult),
          );
        }}
        title="단건 조회 결과를 엑셀로 내려받습니다"
        className={cn(
          base,
          "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-slate-400",
        )}
      >
        <FileDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
        엑셀
      </button>
    </div>
  );
}
