"use client";

import dynamic from "next/dynamic";
import { match } from "ts-pattern";
import { ModeTabs } from "@/features/map-marker/components/sidebar/mode-tabs";
import { CctvPanel } from "@/features/cctv/components/cctv-panel";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { useHasMounted } from "@/hooks/use-has-mounted";
import { ComingSoon } from "@/features/shell/components/coming-soon";
import { MapPanel } from "@/features/shell/components/panels/map-panel";
import { MarkersPanel } from "@/features/shell/components/panels/markers-panel";
import { BackupPanel } from "@/features/shell/components/panels/backup-panel";
import { SettingsPanel } from "@/features/shell/components/panels/settings-panel";
import { NAV_ITEMS } from "@/features/shell/types/nav";
import type { NavKey } from "@/features/shell/types/nav";
import type { MapMode } from "@/features/map-marker/types/marker";
import type { PanelDataProps } from "@/features/shell/components/panels/types";

// 대시보드는 진입 전까지 필요 없다. 기상 조회 화면 일체를 초기 번들에서 뺀다.
const DashboardPanel = dynamic(
  () =>
    import("@/features/dashboard/components/dashboard-panel").then(
      (m) => m.DashboardPanel,
    ),
  {
    ssr: false,
    loading: () => <p className="text-[11px] text-slate-500">불러오는 중...</p>,
  },
);

interface WorkPanelProps extends PanelDataProps {
  /** 하이드레이션 안전값. 셸이 마운트 전후를 판정해 내려 준다. */
  activeNav: NavKey;
  equipmentCount: number;
  batteryCount: number;
  locationCount: number;
}

const MARKERS_MODES: MapMode[] = ["equipment", "battery"];

export function WorkPanel({
  mode,
  activeNav,
  markers,
  filterOptions,
  filters,
  equipmentCount,
  batteryCount,
  locationCount,
}: WorkPanelProps) {
  const hasMounted = useHasMounted();
  const { isAuthenticated } = useAuthSession();
  const setMode = useMapMarkerStore((state) => state.setMode);

  const authed = hasMounted && isAuthenticated;
  const navItem = NAV_ITEMS.find((item) => item.key === activeNav);

  // 위치 세그먼트만 잠근다. 장비·축전지 조회는 비로그인도 가능하다.
  const lockedModes: MapMode[] = hasMounted && !authed ? ["location"] : [];

  const showSegments = activeNav === "map" || activeNav === "markers";
  const segmentModes = activeNav === "markers" ? MARKERS_MODES : undefined;

  const countLabel = match(mode)
    .with("equipment", () => `장비 ${equipmentCount}건`)
    .with("battery", () => `축전지 ${batteryCount}건`)
    .with("location", () => `위치 ${locationCount}건 · 임시`)
    .with("weather", () => "")
    .exhaustive();

  const body = match(activeNav)
    .with("dashboard", () => <DashboardPanel />)
    .with("map", () => (
      <MapPanel
        mode={mode}
        markers={markers}
        filterOptions={filterOptions}
        filters={filters}
      />
    ))
    .with("markers", () => (
      <MarkersPanel
        mode={mode}
        markers={markers}
        filterOptions={filterOptions}
        filters={filters}
      />
    ))
    .with("groups", () => (
      <ComingSoon
        title="그룹관리"
        description="마커를 그룹으로 묶어 관리하는 기능은 아직 없습니다."
      />
    ))
    .with("cctv", () => <CctvPanel />)
    .with("backup", () => (
      <BackupPanel
        mode={mode}
        equipmentCount={equipmentCount}
        batteryCount={batteryCount}
      />
    ))
    .with("settings", () => <SettingsPanel />)
    .exhaustive();

  return (
    <aside
      /*
       * 1024px 미만에서는 지도가 너무 좁아진다 — 자리를 차지하는 대신 지도 위에 겹쳐 띄운다.
       * 폭 값은 셸이 CSS 변수로 내려 주므로 여기에 숫자를 적지 않는다.
       */
      className="flex h-full w-[var(--panel-w)] shrink-0 flex-col border-r border-slate-800 bg-slate-950/95 text-slate-100 max-lg:absolute max-lg:inset-y-0 max-lg:left-[var(--rail-w)] max-lg:z-30 max-lg:shadow-2xl max-md:left-14 max-md:w-[min(var(--panel-w),calc(100vw-3.5rem))]"
      aria-label={navItem?.label}
    >
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="truncate text-sm font-bold">{navItem?.label ?? ""}</h1>
          {showSegments && countLabel ? (
            <span className="shrink-0 whitespace-nowrap text-[10px] text-slate-500">
              {countLabel}
            </span>
          ) : null}
        </div>

        {showSegments ? (
          <div className="mt-3">
            <ModeTabs
              mode={mode}
              onChange={setMode}
              lockedModes={lockedModes}
              modes={segmentModes}
            />
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">{body}</div>
    </aside>
  );
}
