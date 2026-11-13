"use client";

import { useCallback } from "react";
import { useIsAdmin } from "@/features/map-marker/hooks/use-is-admin";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import type { MapMode } from "@/features/map-marker/types/marker";
import { useHasMounted } from "@/hooks/use-has-mounted";
import {
  ADMIN_ONLY_SEGMENTS,
  AUTH_ONLY_SEGMENTS,
  initialPanelStep,
} from "@/features/shell/lib/nav-model";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import type { NavKey } from "@/features/shell/types/nav";
import { isMapSegment, type NavSubKey } from "@/features/shell/types/segment";

/** 레일·트리·패널·모바일 메뉴가 함께 쓰는 메뉴 이동 동작 */
export function useShellNav() {
  const hasMounted = useHasMounted();
  const { isAuthenticated } = useAuthSession();
  // 인증 분기는 마운트 이후에만 한다. SSR 결과와 어긋나면 하이드레이션이 깨진다.
  const authed = hasMounted && isAuthenticated;
  const { isAdmin } = useIsAdmin();

  const setActiveNav = useMapMarkerStore((state) => state.setActiveNav);
  const setMapSegment = useMapMarkerStore((state) => state.setMapSegment);
  const setMode = useMapMarkerStore((state) => state.setMode);
  const isSidebarOpen = useMapMarkerStore((state) => state.isSidebarOpen);
  const toggleSidebar = useMapMarkerStore((state) => state.toggleSidebar);
  const setPanelStep = useShellStore((state) => state.setPanelStep);
  const setScheduleSegment = useShellStore((state) => state.setScheduleSegment);

  const openPanel = useCallback(() => {
    if (!isSidebarOpen) toggleSidebar();
  }, [isSidebarOpen, toggleSidebar]);

  /** 메뉴를 고른다. 하위 메뉴가 있으면 패널 첫 단계, 없으면 바로 내용을 보여 준다. */
  const pickNav = useCallback(
    (nav: NavKey) => {
      setActiveNav(nav);
      setPanelStep(initialPanelStep(nav));
      openPanel();
    },
    [setActiveNav, setPanelStep, openPanel],
  );

  /**
   * 하위 메뉴를 고른다. 지도는 변환기·CCTV까지 다루므로 `setMapSegment`를 쓰고,
   * 마커관리는 groups면 `setMapSegment("groups")`, 그 외는 도메인(`setMode`)을 쓴다.
   */
  const pickSegment = useCallback(
    (nav: NavKey, segment: NavSubKey) => {
      setActiveNav(nav);
      // 일정관리의 하위 화면은 지도 모드·세그먼트를 바꾸지 않고 일정 화면만 고른다.
      if (nav === "schedule") {
        if (!isMapSegment(segment) && segment !== "survey") setScheduleSegment(segment);
      } else if (isMapSegment(segment)) {
        if (nav === "markers") {
          if (segment === "groups") {
            setMapSegment("groups");
          } else {
            setMode(segment as MapMode);
          }
        } else {
          setMapSegment(segment);
        }
      }
      setPanelStep("detail");
      openPanel();
    },
    [setActiveNav, setMode, setMapSegment, setScheduleSegment, setPanelStep, openPanel],
  );

  // 위치·변환기는 비로그인 잠금, 그룹관리는 비관리자 잠금.
  const isSegmentLocked = useCallback(
    (segment: NavSubKey) => {
      if (!hasMounted) return false;
      if (!authed && AUTH_ONLY_SEGMENTS.includes(segment)) return true;
      if (!isAdmin && ADMIN_ONLY_SEGMENTS.includes(segment)) return true;
      return false;
    },
    [hasMounted, authed, isAdmin],
  );

  return { authed, isAdmin, hasMounted, pickNav, pickSegment, isSegmentLocked };
}
