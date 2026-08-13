"use client";

import { useEffect, useState } from "react";
import { BookmarkPlus, Satellite, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { WorksiteBoard } from "@/features/dashboard/components/worksite-board";
import { useWorksiteBoard } from "@/features/dashboard/hooks/use-worksite-board";
import { HazardSummaryList } from "@/features/worksite-weather/components/hazard-summary-list";
import { TyphoonBanner } from "@/features/worksite-weather/components/typhoon-banner";
import { TyphoonModal } from "@/features/worksite-weather/components/typhoon-modal";
import { WeatherSatelliteModal } from "@/features/worksite-weather/components/weather-satellite-modal";
import { WeatherTimelineTable } from "@/features/worksite-weather/components/weather-timeline-table";
import {
  OVERALL_TONE,
  VERDICT_ICON,
  VERDICT_LABEL,
} from "@/features/worksite-weather/types/weather";

/**
 * 대시보드 — 당일 작업대상별로 "지금 작업해도 되는가"를 한 화면에서 답한다.
 *
 * 선택 국소를 `useState`로 두되 **파생을 우선한다**: 목록이 바뀌어 선택이 사라지면
 * 첫 항목으로 떨어진다. Ver 1.1에서 `useEffect`로 선택을 덮어써 사용자가 고른 국소가
 * 되돌아가던 문제가 있었다.
 */
export function DashboardPanel() {
  const { rows, retry } = useWorksiteBoard();
  const setActiveNav = useMapMarkerStore((state) => state.setActiveNav);
  const setMapSegment = useMapMarkerStore((state) => state.setMapSegment);
  const setSelectedMarkerId = useMapMarkerStore((state) => state.setSelectedMarkerId);
  const selectedMarkerIds = useMapMarkerStore(
    (state) => state.selectedMarkerIds,
  );
  const setSelectedMarkerIds = useMapMarkerStore(
    (state) => state.setSelectedMarkerIds,
  );
  const clearSelectedMarkers = useMapMarkerStore(
    (state) => state.clearSelectedMarkers,
  );
  const clearSavedWeatherSites = useMapMarkerStore(
    (state) => state.clearSavedWeatherSites,
  );
  const removeSavedWeatherSite = useMapMarkerStore(
    (state) => state.removeSavedWeatherSite,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isTyphoonOpen, setIsTyphoonOpen] = useState(false);
  const [isSatelliteOpen, setIsSatelliteOpen] = useState(false);

  const allSiteIds = rows.map((row) => row.site.id);
  const isAllOverlaysOpen =
    allSiteIds.length > 0 &&
    allSiteIds.every((id) => selectedMarkerIds.includes(id));

  const handleToggleAllOverlays = () => {
    if (isAllOverlaysOpen) {
      clearSelectedMarkers();
    } else {
      setSelectedMarkerIds(allSiteIds);
    }
  };

  const selectedRow =
    rows.find((row) => row.site.id === selectedId) ?? rows[0] ?? null;
  const selectedSiteId = selectedRow?.site.id;
  const data = selectedRow?.status === "ok" ? selectedRow.data : undefined;

  useEffect(() => {
    if (selectedSiteId) {
      setSelectedMarkerId(selectedSiteId);
    }
  }, [selectedSiteId, setSelectedMarkerId]);

  const handleSelect = (siteId: string) => {
    setSelectedId(siteId);
    // 축전지 국소는 지도에 마커가 없다(§3.4). 그래도 선택은 되어야 상세가 열린다.
    setSelectedMarkerId(siteId);
  };

  const weatherButtons = (
    <div className="grid grid-cols-2 gap-1.5">
      <Button
        type="button"
        size="sm"
        className="h-8 border border-sky-500/40 bg-gradient-to-r from-sky-600/20 to-indigo-600/20 text-[11px] text-sky-200"
        onClick={() => setIsSatelliteOpen(true)}
      >
        <Satellite className="mr-1 h-3.5 w-3.5" aria-hidden />
        위성/레이더
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-8 border border-rose-500/40 bg-rose-950/40 text-[11px] text-rose-200"
        onClick={() => setIsTyphoonOpen(true)}
      >
        <Wind className="mr-1 h-3.5 w-3.5" aria-hidden />
        태풍 정보
      </Button>
    </div>
  );

  const weatherModals = (
    <>
      <TyphoonModal
        isOpen={isTyphoonOpen}
        onClose={() => setIsTyphoonOpen(false)}
        typhoon={data?.typhoon ?? null}
      />
      <WeatherSatelliteModal
        isOpen={isSatelliteOpen}
        onClose={() => setIsSatelliteOpen(false)}
      />
    </>
  );

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        {weatherButtons}
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center">
          <BookmarkPlus className="h-6 w-6 text-sky-400" aria-hidden />
          <p className="text-xs font-semibold text-slate-200">
            저장된 작업 국소가 없습니다
          </p>
          <p className="text-[11px] leading-relaxed text-slate-500">
            지도에서 국소를 검색해 「오늘의 작업 국소로 저장」을 누르거나,
            위치 탭에서 엑셀·주소로 위치를 등록하면 여기에 당일 기상 판정이
            표시됩니다.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-1 h-8 text-[11px]"
            onClick={() => {
              setActiveNav("map");
              setMapSegment("location");
            }}
          >
            지도로 이동
          </Button>
        </div>
        {weatherModals}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {weatherButtons}

      <WorksiteBoard
        rows={rows}
        selectedSiteId={selectedRow?.site.id ?? null}
        isAllOverlaysOpen={isAllOverlaysOpen}
        onSelect={handleSelect}
        onToggleAllOverlays={handleToggleAllOverlays}
        onRetry={retry}
        onRemove={removeSavedWeatherSite}
        onClearAll={clearSavedWeatherSites}
      />

      {selectedRow ? (
        <section className="space-y-2 border-t border-slate-800 pt-3">
          <p className="truncate text-[11px] text-slate-400" title={selectedRow.site.name}>
            {selectedRow.site.name}
          </p>

          {selectedRow.status === "loading" ? (
            <p className="text-[11px] text-slate-500">기상 정보를 불러오는 중...</p>
          ) : null}

          {selectedRow.status === "error" ? (
            <p className="text-[11px] text-rose-400">{selectedRow.error}</p>
          ) : null}

          {data ? (
            <>
              <TyphoonBanner
                typhoon={data.typhoon}
                onOpenDetail={() => setIsTyphoonOpen(true)}
              />

              <div
                className={cn(
                  "rounded-lg border px-3 py-2 text-center",
                  OVERALL_TONE[data.overall],
                )}
              >
                <p className="text-sm font-bold">
                  <span aria-hidden>{VERDICT_ICON[data.overall]}</span>{" "}
                  {VERDICT_LABEL[data.overall]}
                </p>
                <p className="mt-0.5 text-[11px]">
                  {data.recommendedWindows.length > 0
                    ? `권장 ${data.recommendedWindows
                        .map((w) => `${w.from}~${w.to}`)
                        .join(", ")}`
                    : "권장 시간대 없음"}
                </p>
              </div>

              <HazardSummaryList summary={data.hazardSummary} />
              <WeatherTimelineTable slots={data.timeline} />

              {data.warnings.length > 0 ? (
                <ul className="space-y-0.5">
                  {data.warnings.map((warning) => (
                    <li key={warning} className="text-[10px] text-amber-400">
                      ⚠️ {warning}
                    </li>
                  ))}
                </ul>
              ) : null}

              <p className="text-[10px] leading-relaxed text-slate-500">
                ⚠️ {data.disclaimer}
              </p>
            </>
          ) : null}
        </section>
      ) : null}

      {weatherModals}
    </div>
  );
}
