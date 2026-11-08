import {
  Battery,
  CalendarRange,
  ClipboardList,
  Mail,
  Layers,
  MapPin,
  Server,
  Video,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import {
  visibleNavItems,
  type NavItem,
  type NavKey,
} from "@/features/shell/types/nav";
import type { MapSegment, NavSubKey, ScheduleSegment } from "@/features/shell/types/segment";

export const SEGMENT_META: Record<NavSubKey, { label: string; icon: LucideIcon }> = {
  equipment: { label: "장비", icon: Server },
  battery: { label: "축전지", icon: Battery },
  groups: { label: "그룹관리", icon: Layers },
  location: { label: "이벤트관리", icon: MapPin },
  cctv: { label: "CCTV", icon: Video },
  converter: { label: "위치/좌표", icon: Waypoints },
  facility: { label: "시설일정", icon: CalendarRange },
  daily: { label: "일일일정", icon: ClipboardList },
  mail: { label: "메일양식", icon: Mail },
};

const NAV_SEGMENTS: Partial<Record<NavKey, NavSubKey[]>> = {
  map: ["equipment", "battery", "location", "cctv", "converter"],
  markers: ["equipment", "battery", "groups"],
  schedule: ["facility", "daily", "mail"],
};

/** 패널 첫 단계의 설명 문구 */
export const NAV_DESCRIPTIONS: Partial<Record<NavKey, string>> = {
  map: "표시할 데이터를 고르고 위치를 찾습니다",
  markers: "마커를 등록하고 목록을 관리합니다",
  schedule: "시설팀 일정표와 일일 작업 상세를 보고 메일 양식을 만듭니다",
  accounts: "사용자 계정과 관리자 권한을 관리합니다",
};

/** 비로그인 때 잠그는 하위 메뉴 */
export const AUTH_ONLY_SEGMENTS: NavSubKey[] = ["location", "converter"];

/** 관리자에게만 보이는 하위 메뉴 */
export const ADMIN_ONLY_SEGMENTS: NavSubKey[] = ["groups"];

const MOBILE_TAB_KEYS: NavKey[] = ["dashboard", "map", "markers", "schedule"];

export function segmentsOfNav(nav: NavKey, isAdmin = false): NavSubKey[] {
  const all = NAV_SEGMENTS[nav] ?? [];
  return all.filter((s) => !ADMIN_ONLY_SEGMENTS.includes(s) || isAdmin);
}

export function hasNavSegments(nav: NavKey, isAdmin = false): boolean {
  return segmentsOfNav(nav, isAdmin).length > 0;
}

/**
 * 메뉴를 눌렀을 때 패널의 첫 단계. 하위 메뉴가 있으면 `root`(하위 메뉴 목록)지만,
 * 일정관리는 하위 화면이 하나뿐이고 화면 전체를 쓰므로 바로 `detail`이다.
 */
export function initialPanelStep(nav: NavKey): "root" | "detail" {
  return hasNavSegments(nav) && nav !== "schedule" ? "root" : "detail";
}

/**
 * 왼쪽 작업 패널을 보일지. **셸과 지도 오프셋 계산이 같은 판정을 쓴다.**
 * 일정관리는 지도·패널 없이 오른쪽 전체를 일정표가 쓰므로 패널이 없다.
 * 트리 모드에서는 하위 메뉴 첫 단계를 트리가 대신하므로 상세 단계에서만 패널이 열린다.
 */
export function isPanelVisible(input: {
  activeNav: NavKey;
  isSidebarOpen: boolean;
  isTreeOpen: boolean;
  panelStep: "root" | "detail";
}): boolean {
  if (input.activeNav === "schedule" || input.activeNav === "accounts") return false;
  return (
    input.isSidebarOpen &&
    (!input.isTreeOpen || !hasNavSegments(input.activeNav) || input.panelStep === "detail")
  );
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

/**
 * 하위 메뉴가 지금 활성인가. 일정관리는 지도 세그먼트와 무관하게 고른 일정 화면(`scheduleSegment`)이,
 * 지도·마커관리는 현재 세그먼트와 같은 항목이 활성이다.
 */
export function isSubActive(
  nav: NavKey,
  key: NavSubKey,
  segment: MapSegment,
  scheduleSegment: ScheduleSegment = "facility",
): boolean {
  if (nav === "schedule") return key === scheduleSegment;
  return key === segment;
}

/** 패널·시트 제목에 쓰는 하위 메뉴 이름. 일정관리는 고른 일정 화면 이름, 그 밖은 현재 세그먼트 이름. */
export function subLabelOf(
  nav: NavKey,
  segment: MapSegment,
  scheduleSegment: ScheduleSegment = "facility",
): string {
  return nav === "schedule" ? SEGMENT_META[scheduleSegment].label : SEGMENT_META[segment].label;
}

/** 마커 건수 요약(설명 줄)을 보일 화면인가. 지도·마커관리의 변환기·CCTV·그룹관리가 아닌 세그먼트만. */
export function showsMarkerSummary(nav: NavKey, segment: MapSegment): boolean {
  return (
    hasNavSegments(nav) &&
    nav !== "schedule" &&
    segment !== "converter" &&
    segment !== "cctv" &&
    segment !== "groups"
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
  segments: NavSubKey[];
}

/**
 * 메뉴 검색. 상위 메뉴 이름이 맞으면 하위 메뉴를 모두 남기고,
 * 하위 메뉴 이름만 맞으면 그 하위 메뉴와 상위 메뉴만 남긴다.
 */
export function filterNavTree(
  items: NavItem[],
  query: string,
  isAdmin = false,
): NavTreeNode[] {
  const needle = query.trim().toLowerCase();
  const matches = (label: string) => label.toLowerCase().includes(needle);

  return items.flatMap((item) => {
    const segments = segmentsOfNav(item.key, isAdmin);
    if (!needle || matches(item.label)) return [{ item, segments }];
    const hits = segments.filter((segment) => matches(SEGMENT_META[segment].label));
    return hits.length > 0 ? [{ item, segments: hits }] : [];
  });
}
