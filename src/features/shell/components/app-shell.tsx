"use client";

import { match } from "ts-pattern";
import { Button } from "@/components/ui/button";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { NavRail } from "@/features/shell/components/nav-rail";
import { TopSearchBar } from "@/features/shell/components/top-search-bar";
import { WorkPanel } from "@/features/shell/components/work-panel";
import {
  NAV_RAIL_WIDTH_PX,
  WORK_PANEL_WIDTH_PX,
} from "@/features/shell/constants";
import type { PanelDataProps } from "@/features/shell/components/panels/types";
import type { CSSProperties, ReactNode } from "react";

interface AppShellProps extends PanelDataProps {
  equipmentCount: number;
  batteryCount: number;
  locationCount: number;
  invalidCoordinateCount: number;
  isLoading: boolean;
  /** 지도 영역. 셸은 자리만 잡고 내용은 관여하지 않는다. */
  children: ReactNode;
}

/**
 * 4영역 레이아웃 — 레일 / 패널 / 상단 검색 / 지도.
 *
 * `useActiveMarkers()`는 호출하지 않는다. 그 훅은 스토어에 쓰는 부수효과가 있어
 * 트리에서 한 번만 불러야 하고, 지금은 `MapMarkerPage`가 그 자리다.
 */
export function AppShell({
  mode,
  markers,
  filterOptions,
  filters,
  equipmentCount,
  batteryCount,
  locationCount,
  invalidCoordinateCount,
  isLoading,
  children,
}: AppShellProps) {
  const isSidebarOpen = useMapMarkerStore((state) => state.isSidebarOpen);
  const toggleSidebar = useMapMarkerStore((state) => state.toggleSidebar);

  const countLabel = match(mode)
    .with("equipment", () => `장비 ${equipmentCount}건`)
    .with("battery", () => `축전지 ${batteryCount}건`)
    .with("location", () => `위치 ${locationCount}건 · 임시`)
    .with("weather", () => "국소 작업 안전 날씨")
    .exhaustive();

  const countSummary = [
    countLabel,
    isLoading ? "로딩 중" : "",
    mode !== "location" && mode !== "weather" && invalidCoordinateCount > 0
      ? `좌표 없음 ${invalidCoordinateCount}건`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="relative flex h-[100dvh] w-full overflow-hidden bg-slate-950"
      /*
       * 폭 상수를 CSS 변수로 흘려보낸다. 이렇게 해야 값의 단일 소스를 지키면서도
       * 미디어 쿼리(좁은 화면 축소)를 클래스로 얹을 수 있다.
       */
      style={
        {
          "--rail-w": `${NAV_RAIL_WIDTH_PX}px`,
          "--panel-w": `${WORK_PANEL_WIDTH_PX}px`,
        } as CSSProperties
      }
    >
      <NavRail countSummary={countSummary} />

      {isSidebarOpen ? (
        <WorkPanel
          mode={mode}
          markers={markers}
          filterOptions={filterOptions}
          filters={filters}
          equipmentCount={equipmentCount}
          batteryCount={batteryCount}
          locationCount={locationCount}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopSearchBar />
        <main className="relative min-h-0 flex-1">
          {children}

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute left-3 top-3 z-20 h-8 w-8 border-slate-700 bg-slate-900/90 text-slate-200"
            onClick={toggleSidebar}
            title={isSidebarOpen ? "패널 접기" : "패널 펼치기"}
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>
        </main>
      </div>
    </div>
  );
}
