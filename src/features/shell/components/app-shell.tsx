"use client";

import dynamic from "next/dynamic";
import { match } from "ts-pattern";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { useHasMounted } from "@/hooks/use-has-mounted";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { useIsAdmin } from "@/features/map-marker/hooks/use-is-admin";
import { NavRail } from "@/features/shell/components/nav-rail";
import { TopSearchBar } from "@/features/shell/components/top-search-bar";
import { WorkPanel } from "@/features/shell/components/work-panel";

// 홈 첫 로딩 번들에서 분리한다. 하단 메뉴와 시트는 모바일에서만, 트리는 펼칠 때만 필요하다.
const MobileSheet = dynamic(
  () =>
    import("@/features/shell/components/mobile-shell").then((m) => m.MobileSheet),
  { ssr: false },
);
const MobileBottomNav = dynamic(
  () =>
    import("@/features/shell/components/mobile-shell").then(
      (m) => m.MobileBottomNav,
    ),
  { ssr: false },
);
const NavTree = dynamic(
  () => import("@/features/shell/components/nav-tree").then((m) => m.NavTree),
  { ssr: false },
);

// 바코드/QR 탭에서만 필요하다. zbar-wasm·xlsx 의존 트리와 묶여 무거워 지연 로딩한다.
const BarcodeResultsMain = dynamic(
  () =>
    import("@/features/barcode/components/barcode-results-main").then(
      (m) => m.BarcodeResultsMain,
    ),
  { ssr: false },
);
// 일정관리 탭에서만 필요하다. 표·엑셀 변환 코드를 홈 첫 로딩 번들에서 뺀다.
const ScheduleMain = dynamic(
  () => import("@/features/schedule/components/schedule-view").then((m) => m.ScheduleView),
  { ssr: false },
);
// 계정설정 탭에서만 필요하다. 관리자 화면을 홈 첫 로딩 번들에서 분리한다.
const AccountsMain = dynamic(
  () =>
    import("@/features/accounts/components/accounts-main").then(
      (m) => m.AccountsMain,
    ),
  { ssr: false },
);
import {
  NAV_RAIL_WIDTH_PX,
  NAV_TREE_WIDTH_PX,
  WORK_PANEL_WIDTH_PX,
} from "@/features/shell/constants";
import { isPanelVisible } from "@/features/shell/lib/nav-model";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import { isNavAccessible } from "@/features/shell/types/nav";
import type { NavKey } from "@/features/shell/types/nav";
import type { MapSegment } from "@/features/shell/types/segment";
import type { PanelDataProps } from "@/features/shell/components/panels/types";

interface AppShellProps extends PanelDataProps {
  /** 하이드레이션 안전값. `MapMarkerPage`가 마운트 전후를 판정해 내려 준다. */
  activeNav: NavKey;
  segment: MapSegment;
  equipmentCount: number;
  batteryCount: number;
  locationCount: number;
  invalidCoordinateCount: number;
  isLoading: boolean;
  /** 지도 영역. 셸은 자리만 잡고 내용은 관여하지 않는다. */
  children: ReactNode;
}

/**
 * 레이아웃 — 레일 또는 트리 / 패널 / 상단 검색 / 지도. 모바일은 하단 메뉴와 시트로 바뀐다.
 * 지도가 다시 마운트되지 않도록 데스크톱과 모바일이 같은 트리를 쓴다.
 *
 * `useActiveMarkers()`는 호출하지 않는다. 그 훅은 스토어에 쓰는 부수효과가 있어
 * 트리에서 한 번만 불러야 하고, 지금은 `MapMarkerPage`가 그 자리다.
 */
export function AppShell({
  mode,
  activeNav,
  segment,
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
  const hasMounted = useHasMounted();
  const isSidebarOpen = useMapMarkerStore((state) => state.isSidebarOpen);
  const setActiveNav = useMapMarkerStore((state) => state.setActiveNav);
  const isTreeOpen = useShellStore((state) => state.isTreeOpen);
  const panelStep = useShellStore((state) => state.panelStep);
  const isMoreOpen = useShellStore((state) => state.isMoreOpen);
  const isMobile = useIsMobile();
  const { isAuthenticated } = useAuthSession();
  const authed = hasMounted && isAuthenticated;
  const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();

  // 첫 화면 마운트 후 유휴 시간에 주요 메뉴 청크를 미리 받아 두어 첫 메뉴 전환 지연을 줄인다.
  useEffect(() => {
    if (!hasMounted) return;
    const timer = window.setTimeout(() => {
      void import("@/features/dashboard/components/dashboard-panel");
      void import("@/features/schedule/components/schedule-view");
      void import("@/features/site-lists/components/site-lists-panel");
      void import("@/features/group-admin/components/group-panel");
      void import("@/features/cctv/components/cctv-panel");
      void import("@/features/shell/components/panels/backup-panel");
      void import("@/features/shell/components/panels/settings-panel");
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [hasMounted]);
  // persist로 복원된 값도 여기서 함께 걸러진다.
  useEffect(() => {
    // 관리자 판별 중에는 미룬다. 저장된 activeNav가 groups여도 판별 전에 쫓아내지 않는다.
    if (!hasMounted || isAdminLoading) return;
    if (!isNavAccessible(activeNav, authed, isAdmin)) {
      setActiveNav("dashboard");
    }
  }, [hasMounted, isAdminLoading, authed, isAdmin, activeNav, setActiveNav]);

  const countLabel = match(mode)
    .with("equipment", () => `장비 ${equipmentCount}건`)
    .with("battery", () => `축전지 ${batteryCount}건`)
    .with("location", () => `위치 ${locationCount}건`)
    .with("weather", () => "국소 작업 안전 날씨")
    .exhaustive();

  const countSummary = [
    countLabel,
    // 조회 상태도 서버에는 없다. 마운트 전에는 붙이지 않는다.
    hasMounted && isLoading ? "로딩 중" : "",
    mode !== "location" && mode !== "weather" && invalidCoordinateCount > 0
      ? `좌표 없음 ${invalidCoordinateCount}건`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const segmentCounts = {
    equipment: equipmentCount,
    battery: batteryCount,
    location: locationCount,
  };
  const bodyProps = {
    mode,
    activeNav,
    segment,
    markers,
    filterOptions,
    filters,
    equipmentCount,
    batteryCount,
  };
  const isPanelOpen = isPanelVisible({ activeNav, isSidebarOpen, isTreeOpen, panelStep });
  // 바코드/QR·일정관리·계정설정은 지도를 쓰지 않는다. 지도는 언마운트하지 않고 숨기기만 한다.
  const isMapHidden =
    activeNav === "barcode" || activeNav === "schedule" || activeNav === "accounts";
  // 일정관리·계정설정은 모바일에서도 시트 없이 화면 전체를 쓴다. 더보기 목록을 열었을 때만 시트가 뜬다.
  const showMobileSheet =
    isMobile && ((activeNav !== "schedule" && activeNav !== "accounts") || isMoreOpen);

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
          "--tree-w": `${NAV_TREE_WIDTH_PX}px`,
          "--nav-w": `${isTreeOpen ? NAV_TREE_WIDTH_PX : NAV_RAIL_WIDTH_PX}px`,
          "--panel-w": `${WORK_PANEL_WIDTH_PX}px`,
        } as CSSProperties
      }
    >
      {!isMobile && isTreeOpen ? (
        <NavTree activeNav={activeNav} segment={segment} segmentCounts={segmentCounts} />
      ) : null}
      {!isMobile && !isTreeOpen ? <NavRail activeNav={activeNav} /> : null}
      {!isMobile && isPanelOpen ? (
        <WorkPanel
          {...bodyProps}
          countSummary={countSummary}
          segmentCounts={segmentCounts}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 장소 검색은 지도 전용이다 — 바코드/QR·일정관리에는 지도가 없으니 검색바도 필요 없다. */}
        {isMapHidden ? null : (
          <TopSearchBar
            showMapPickControls={activeNav === "map" && segment === "converter"}
          />
        )}
        <main className="relative min-h-0 flex-1">
          {/*
           * 바코드/QR은 지도와 무관한 순수 도구라 지도를 보일 이유가 없다.
           * 언마운트하지 않고 숨기기만 한다 — 다시 돌아왔을 때 카카오맵 SDK를
           * 재초기화하지 않고 마커·카메라 위치가 그대로 남는다.
           */}
          <div className={isMapHidden ? "hidden" : "contents"}>{children}</div>
          {activeNav === "barcode" ? <BarcodeResultsMain /> : null}
          {activeNav === "schedule" ? <ScheduleMain /> : null}
          {activeNav === "accounts" ? <AccountsMain /> : null}

          {showMobileSheet ? (
            <MobileSheet
              {...bodyProps}
              countSummary={countSummary}
              segmentCounts={segmentCounts}
            />
          ) : null}
        </main>
        {isMobile ? <MobileBottomNav activeNav={activeNav} /> : null}
      </div>
    </div>
  );
}
