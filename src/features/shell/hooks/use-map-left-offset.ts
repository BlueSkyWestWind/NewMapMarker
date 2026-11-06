"use client";

import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { mapLeftOffsetPx } from "@/features/shell/constants";
import { hasNavSegments } from "@/features/shell/lib/nav-model";
import { useShellStore } from "@/features/shell/store/use-shell-store";

/** 지도 왼쪽을 가리는 폭. 뷰포트 고정 모달이 지도 중앙에 오도록 비키는 데 쓴다. */
export function useMapLeftOffset(): number {
  const isMobile = useIsMobile();
  const isTreeOpen = useShellStore((state) => state.isTreeOpen);
  const panelStep = useShellStore((state) => state.panelStep);
  const isSidebarOpen = useMapMarkerStore((state) => state.isSidebarOpen);
  const activeNav = useMapMarkerStore((state) => state.activeNav);

  // 트리에서는 하위 메뉴 첫 단계를 트리가 대신하므로 패널이 열리지 않는다.
  const isPanelOpen =
    isSidebarOpen &&
    (!isTreeOpen || !hasNavSegments(activeNav) || panelStep === "detail");

  return mapLeftOffsetPx({ isMobile, isTreeOpen, isPanelOpen });
}
