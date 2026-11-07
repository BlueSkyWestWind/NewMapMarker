import { Battery, MapPin, Server, Waypoints, type LucideIcon } from "lucide-react";
import {
  visibleNavItems,
  type NavItem,
  type NavKey,
} from "@/features/shell/types/nav";
import type { MapSegment } from "@/features/shell/types/segment";

export const SEGMENT_META: Record<MapSegment, { label: string; icon: LucideIcon }> = {
  equipment: { label: "장비", icon: Server },
  battery: { label: "축전지", icon: Battery },
  location: { label: "위치", icon: MapPin },
  converter: { label: "위치/좌표", icon: Waypoints },
};

const NAV_SEGMENTS: Partial<Record<NavKey, MapSegment[]>> = {
  map: ["equipment", "battery", "location", "converter"],
  markers: ["equipment", "battery"],
};

/** 패널 첫 단계의 설명 문구 */
export const NAV_DESCRIPTIONS: Partial<Record<NavKey, string>> = {
  map: "표시할 데이터를 고르고 위치를 찾습니다",
  markers: "마커를 등록하고 목록을 관리합니다",
};

/** 비로그인 때 잠그는 하위 메뉴 */
export const AUTH_ONLY_SEGMENTS: MapSegment[] = ["location", "converter"];

const MOBILE_TAB_KEYS: NavKey[] = ["dashboard", "map", "markers", "cctv"];

export function segmentsOfNav(nav: NavKey): MapSegment[] {
  return NAV_SEGMENTS[nav] ?? [];
}

export function hasNavSegments(nav: NavKey): boolean {
  return segmentsOfNav(nav).length > 0;
}

export function mobileTabItems(isAuthenticated: boolean, isAdmin = false): NavItem[] {
  return visibleNavItems(isAuthenticated, isAdmin).filter((item) =>
    MOBILE_TAB_KEYS.includes(item.key),
  );
}

export function mobileMoreItems(isAuthenticated: boolean, isAdmin = false): NavItem[] {
  return visibleNavItems(isAuthenticated, isAdmin).filter(
    (item) => !MOBILE_TAB_KEYS.includes(item.key),
  );
}

export type MobileTabKey = NavKey | "more";

/** 더보기 목록을 열었거나 더보기 안의 메뉴를 보고 있으면 더보기 탭이 활성이다. */
export function activeMobileTab(nav: NavKey, isMoreOpen: boolean): MobileTabKey {
  if (isMoreOpen) return "more";
  return MOBILE_TAB_KEYS.includes(nav) ? nav : "more";
}

export interface NavTreeNode {
  item: NavItem;
  segments: MapSegment[];
}

/**
 * 메뉴 검색. 상위 메뉴 이름이 맞으면 하위 메뉴를 모두 남기고,
 * 하위 메뉴 이름만 맞으면 그 하위 메뉴와 상위 메뉴만 남긴다.
 */
export function filterNavTree(
  items: NavItem[],
  query: string,
): NavTreeNode[] {
  const needle = query.trim().toLowerCase();
  const matches = (label: string) => label.toLowerCase().includes(needle);

  return items.flatMap((item) => {
    const segments = segmentsOfNav(item.key);
    if (!needle || matches(item.label)) return [{ item, segments }];
    const hits = segments.filter((segment) => matches(SEGMENT_META[segment].label));
    return hits.length > 0 ? [{ item, segments: hits }] : [];
  });
}
