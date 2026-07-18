"use client";

import { match } from "ts-pattern";
import {
  Database,
  FileSpreadsheet,
  Filter,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AuthHeader } from "@/features/map-marker/components/sidebar/auth-header";
import { BackupRestoreSection } from "@/features/map-marker/components/sidebar/backup-restore-section";
import { BatteryExcelSection } from "@/features/map-marker/components/sidebar/battery-excel-section";
import { EquipmentExcelSection } from "@/features/map-marker/components/sidebar/equipment-excel-section";
import { EquipmentInfoSection } from "@/features/map-marker/components/sidebar/equipment-info-section";
import { FilterPanel } from "@/features/map-marker/components/sidebar/filter-panel";
import { LocationExcelSection } from "@/features/map-marker/components/sidebar/location-excel-section";
import { MarkersListPanel } from "@/features/map-marker/components/sidebar/markers-list-panel";
import { ModeTabs } from "@/features/map-marker/components/sidebar/mode-tabs";
import { PlaceSearchSection } from "@/features/map-marker/components/sidebar/place-search-section";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { useHasMounted } from "@/hooks/use-has-mounted";
import type {
  MarkerFilterState,
  MarkerRecord,
} from "@/features/map-marker/types/marker";

interface MapSidebarProps {
  markers: MarkerRecord[];
  filterOptions: {
    years: string[];
    businesses: string[];
    colors: string[];
    tags: string[];
  };
  filters: MarkerFilterState;
  equipmentCount: number;
  batteryCount: number;
  locationCount: number;
  invalidCoordinateCount: number;
  isLoading: boolean;
}

export function MapSidebar({
  markers,
  filterOptions,
  filters,
  equipmentCount,
  batteryCount,
  locationCount,
  invalidCoordinateCount,
  isLoading,
}: MapSidebarProps) {
  const { isAuthenticated } = useAuthSession();
  const hasMounted = useHasMounted();
  const mode = useMapMarkerStore((state) => state.mode);
  const isSidebarOpen = useMapMarkerStore((state) => state.isSidebarOpen);
  const setMode = useMapMarkerStore((state) => state.setMode);
  const toggleSidebar = useMapMarkerStore((state) => state.toggleSidebar);
  const clearPendingMarkers = useMapMarkerStore(
    (state) => state.clearPendingMarkers,
  );

  const showAuthenticatedSections =
    hasMounted && isAuthenticated && mode !== "location";
  const isLocationMode = mode === "location";

  const countLabel = match(mode)
    .with("equipment", () => `장비 ${equipmentCount}건`)
    .with("battery", () => `축전지 ${batteryCount}건`)
    .with("location", () => `위치 ${locationCount}건 · 임시`)
    .exhaustive();

  const countSummary = [
    countLabel,
    hasMounted && isLoading ? "로딩 중" : "",
    !isLocationMode && invalidCoordinateCount > 0
      ? `좌표 없음 ${invalidCoordinateCount}건`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const defaultAccordion = ["markers"];

  if (!isSidebarOpen) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="absolute left-3 top-3 z-20 border-slate-700 bg-slate-900/90 text-slate-200"
        onClick={toggleSidebar}
      >
        <PanelLeftOpen className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-r border-slate-800 bg-slate-950/95 text-slate-100 backdrop-blur">
      <header className="border-b border-slate-800 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <MapPin className="h-5 w-5 shrink-0 text-emerald-400" />
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight">
                MapMarker <span className="text-indigo-400">Pro</span>
              </h1>
              <p
                className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-slate-500"
                title={countSummary}
              >
                {countSummary}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <AuthHeader />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-400"
              onClick={toggleSidebar}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <ModeTabs mode={mode} onChange={setMode} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isLocationMode ? (
          <div className="mb-3 rounded-lg border border-emerald-800/50 bg-emerald-950/40 px-3 py-2 text-[11px] leading-relaxed text-emerald-200/90">
            엑셀 업로드로 위치를 등록하세요. 이름·주소만 표시하며, 새로고침 시
            사라집니다. 우측 카메라로 영역 캡처할 수 있습니다.
          </div>
        ) : null}

        <Accordion
          type="multiple"
          defaultValue={
            isLocationMode ? ["location-excel", "markers"] : defaultAccordion
          }
          className="space-y-2"
        >
          {isLocationMode ? (
            <AccordionItem value="location-excel" className="border-slate-800">
              <AccordionTrigger className="py-2 text-xs font-semibold hover:no-underline">
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                  엑셀로 위치 찍기
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <LocationExcelSection />
              </AccordionContent>
            </AccordionItem>
          ) : null}

          {showAuthenticatedSections && mode === "equipment" ? (
            <AccordionItem value="equipment-location" className="border-slate-800">
              <AccordionTrigger className="py-2 text-xs font-semibold hover:no-underline">
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-indigo-400" />
                  위치 등록 및 관리
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  <EquipmentExcelSection />
                  <EquipmentInfoSection />
                </div>
              </AccordionContent>
            </AccordionItem>
          ) : null}

          {showAuthenticatedSections && mode === "battery" ? (
            <AccordionItem value="battery-excel" className="border-slate-800">
              <AccordionTrigger className="py-2 text-xs font-semibold hover:no-underline">
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                  엑셀로 위치 찍기 (축전지)
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <BatteryExcelSection />
              </AccordionContent>
            </AccordionItem>
          ) : null}

          {!isLocationMode ? (
            <>
              <AccordionItem value="filters" className="border-slate-800">
                <AccordionTrigger className="py-2 text-xs font-semibold hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-indigo-400" />
                    연도·사업·색상·태그 표시
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <FilterPanel mode={mode} filterOptions={filterOptions} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="search" className="border-slate-800">
                <AccordionTrigger className="py-2 text-xs font-semibold hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Search className="h-3.5 w-3.5 text-slate-400" />
                    장소 검색
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <PlaceSearchSection />
                </AccordionContent>
              </AccordionItem>
            </>
          ) : null}

          <AccordionItem value="markers" className="border-slate-800">
            <AccordionTrigger className="py-2 text-xs font-semibold hover:no-underline">
              {isLocationMode
                ? `임시 위치 (${markers.length})`
                : '위치 찾기'}
            </AccordionTrigger>
            <AccordionContent className="pb-0">
              {isLocationMode && markers.length > 0 ? (
                <div className="mb-2 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-rose-300 hover:text-rose-200"
                    onClick={() => clearPendingMarkers("location")}
                  >
                    전체 삭제
                  </Button>
                </div>
              ) : null}
              <MarkersListPanel
                mode={mode}
                markers={markers}
                filters={filters}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {showAuthenticatedSections ? (
        <footer className="border-t border-slate-800">
          <Accordion type="single" collapsible>
            <AccordionItem value="backup" className="border-0">
              <AccordionTrigger className="px-4 py-3 text-xs font-semibold hover:no-underline">
                <span className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-emerald-400" />
                  데이터 백업 및 복원
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <BackupRestoreSection mode={mode} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </footer>
      ) : null}
    </aside>
  );
}
