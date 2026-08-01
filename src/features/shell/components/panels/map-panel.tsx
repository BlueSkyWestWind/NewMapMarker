"use client";

import dynamic from "next/dynamic";
import { FileSpreadsheet, Filter, List, Search, Waypoints } from "lucide-react";
import { FilterPanel } from "@/features/map-marker/components/sidebar/filter-panel";
import { LocationExcelSection } from "@/features/map-marker/components/sidebar/location-excel-section";
import { MarkersListPanel } from "@/features/map-marker/components/sidebar/markers-list-panel";
import { PlaceSearchSection } from "@/features/map-marker/components/sidebar/place-search-section";
import { PanelSection } from "@/features/shell/components/panels/panel-section";
import type { PanelDataProps } from "@/features/shell/components/panels/types";
import type { MapSegment } from "@/features/shell/types/segment";

interface MapPanelProps extends PanelDataProps {
  segment: MapSegment;
}

/*
 * 변환기는 VWorld 지오코딩·엑셀 등 무거운 모듈을 끌고 온다.
 * 정적으로 import 하면 홈 첫 로드가 150 kB 늘어난다 — 위치 세그먼트를 고를 때 받는다.
 */
const GpsConverterPanel = dynamic(
  () =>
    import("@/features/gpsmap/components/gps-converter-panel").then(
      (m) => m.GpsConverterPanel,
    ),
  {
    ssr: false,
    loading: () => <p className="text-[11px] text-slate-500">불러오는 중...</p>,
  },
);

/**
 * 지도 메뉴 — **무엇을 어떻게 보여줄지**만 담당한다.
 * 데이터를 바꾸는 조작(추가·업로드·내보내기)은 마커관리로 분리했다.
 */
export function MapPanel({
  markers,
  filterOptions,
  filters,
  mode,
  segment,
}: MapPanelProps) {
  // 위치/좌표 변환기는 독립 세그먼트다. 모드는 `location`을 그대로 쓴다.
  if (segment === "converter") {
    return (
      <div className="space-y-3">
        <PanelSection
          icon={Waypoints}
          title="위치/좌표"
          iconClassName="h-3.5 w-3.5 text-indigo-400"
        >
          <GpsConverterPanel />
        </PanelSection>
      </div>
    );
  }

  if (segment === "location") {
    return (
      <div className="space-y-3">
        <PanelSection
          icon={FileSpreadsheet}
          title="엑셀로 위치 찍기"
          iconClassName="h-3.5 w-3.5 text-emerald-400"
        >
          <LocationExcelSection />
        </PanelSection>

        <PanelSection icon={List} title={`임시 위치 (${markers.length})`}>
          <MarkersListPanel mode={mode} markers={markers} filters={filters} />
        </PanelSection>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PanelSection icon={Filter} title="연도·사업·색상·태그 표시" iconClassName="h-3.5 w-3.5 text-indigo-400">
        <FilterPanel mode={mode} filterOptions={filterOptions} />
      </PanelSection>

      <PanelSection icon={Search} title="장소 검색">
        <PlaceSearchSection />
      </PanelSection>

      <PanelSection icon={List} title="위치 찾기">
        <MarkersListPanel mode={mode} markers={markers} filters={filters} />
      </PanelSection>
    </div>
  );
}
