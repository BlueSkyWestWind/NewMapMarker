"use client";

import dynamic from "next/dynamic";
import { Filter, List, Waypoints } from "lucide-react";
import { FilterPanel } from "@/features/map-marker/components/sidebar/filter-panel";
import { MarkersListPanel } from "@/features/map-marker/components/sidebar/markers-list-panel";
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

// 위치 메뉴를 고를 때 받는다. 홈 번들 기준을 지키기 위해 첫 로딩에서 뺀다.
const SiteListsPanel = dynamic(
  () =>
    import("@/features/site-lists/components/site-lists-panel").then(
      (m) => m.SiteListsPanel,
    ),
  {
    ssr: false,
    loading: () => <p className="text-[11px] text-slate-500">불러오는 중...</p>,
  },
);

// CCTV 메뉴를 고를 때 받는다. 홈 번들 기준을 지키기 위해 첫 로딩에서 뺀다.
const CctvPanel = dynamic(
  () => import("@/features/cctv/components/cctv-panel").then((m) => m.CctvPanel),
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
  // 도로 CCTV 조회는 지도 하위 세그먼트다.
  if (segment === "cctv") {
    return <CctvPanel />;
  }

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
    return <SiteListsPanel markers={markers} />;
  }

  return (
    <div className="space-y-3">
      <PanelSection icon={Filter} title="연도·상태·사업·색상·태그 표시" iconClassName="h-3.5 w-3.5 text-indigo-400">
        <FilterPanel mode={mode} filterOptions={filterOptions} />
      </PanelSection>

      <PanelSection icon={List} title="위치 찾기">
        <MarkersListPanel mode={mode} markers={markers} filters={filters} />
      </PanelSection>
    </div>
  );
}
