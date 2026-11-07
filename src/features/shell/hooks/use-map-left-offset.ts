"use client";

import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { mapLeftOffsetPx } from "@/features/shell/constants";
import { isPanelVisible } from "@/features/shell/lib/nav-model";
import { useShellStore } from "@/features/shell/store/use-shell-store";

/** 지도 왼쪽을 가리는 폭. 뷰포트 고정 모달이 지도 중앙에 오도록 비키는 데 쓴다. */
export function useMapLeftOffset(): number {
  const isMobile = useIsMobile();
  const isTreeOpen = useShellStore((state) => state.isTreeOpen);
  const panelStep = useShellStore((state) => state.panelStep);
  const isSidebarOpen = useMapMarkerStore((state) => state.isSidebarOpen);
  const activeNav = useMapMarkerStore((state) => state.activeNav);

  const isPanelOpen = isPanelVisible({ activeNav, isSidebarOpen, isTreeOpen, panelStep });

  return mapLeftOffsetPx({ isMobile, isTreeOpen, isPanelOpen });
}
