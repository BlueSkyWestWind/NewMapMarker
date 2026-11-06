"use client";

import { useCallback } from "react";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import type { MapMode } from "@/features/map-marker/types/marker";
import { useHasMounted } from "@/hooks/use-has-mounted";
import {
  AUTH_ONLY_SEGMENTS,
  hasNavSegments,
} from "@/features/shell/lib/nav-model";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import type { NavKey } from "@/features/shell/types/nav";
import type { MapSegment } from "@/features/shell/types/segment";

/** 레일·트리·패널·모바일 메뉴가 함께 쓰는 메뉴 이동 동작 */
export function useShellNav() {
  const hasMounted = useHasMounted();
  const { isAuthenticated } = useAuthSession();
  // 인증 분기는 마운트 이후에만 한다. SSR 결과와 어긋나면 하이드레이션이 깨진다.
  const authed = hasMounted && isAuthenticated;

  const setActiveNav = useMapMarkerStore((state) => state.setActiveNav);
  const setMapSegment = useMapMarkerStore((state) => state.setMapSegment);
  const setMode = useMapMarkerStore((state) => state.setMode);
  const isSidebarOpen = useMapMarkerStore((state) => state.isSidebarOpen);
  const toggleSidebar = useMapMarkerStore((state) => state.toggleSidebar);
  const setPanelStep = useShellStore((state) => state.setPanelStep);

  const openPanel = useCallback(() => {
    if (!isSidebarOpen) toggleSidebar();
  }, [isSidebarOpen, toggleSidebar]);

  /** 메뉴를 고른다. 하위 메뉴가 있으면 패널 첫 단계, 없으면 바로 내용을 보여 준다. */
  const pickNav = useCallback(
    (nav: NavKey) => {
      setActiveNav(nav);
      setPanelStep(hasNavSegments(nav) ? "root" : "detail");
      openPanel();
    },
    [setActiveNav, setPanelStep, openPanel],
  );

  /**
   * 하위 메뉴를 고른다. 지도는 변환기까지 다루므로 `setMapSegment`를 쓰고,
   * 마커관리는 도메인만 바꾸면 되므로 `setMode`를 쓴다.
   */
  const pickSegment = useCallback(
    (nav: NavKey, segment: MapSegment) => {
      setActiveNav(nav);
      if (nav === "markers") {
        setMode(segment as MapMode);
      } else {
        setMapSegment(segment);
      }
      setPanelStep("detail");
      openPanel();
    },
    [setActiveNav, setMode, setMapSegment, setPanelStep, openPanel],
  );

  // 위치·변환기만 잠근다. 장비·축전지 조회는 비로그인도 가능하다.
  const isSegmentLocked = useCallback(
    (segment: MapSegment) =>
      hasMounted && !authed && AUTH_ONLY_SEGMENTS.includes(segment),
    [hasMounted, authed],
  );

  return { authed, hasMounted, pickNav, pickSegment, isSegmentLocked };
}
