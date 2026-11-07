import {
  CalendarDays,
  Database,
  Layers,
  LayoutDashboard,
  Map,
  MapPin,
  ScanBarcode,
  Settings,
  UserCog,
  type LucideIcon,
} from "lucide-react";

/** 좌측 레일의 최상위 메뉴. 화면 전환 축이다(모드는 패널 안 세그먼트로 내려간다). */
export type NavKey =
  | "dashboard"
  | "map"
  | "markers"
  | "schedule"
  | "groups"
  | "barcode"
  | "backup"
  | "settings"
  | "accounts";

export interface NavItem {
  key: NavKey;
  /** 화면 표기. 사용자 확인을 받은 문자열이라 축약·의역하지 않는다. */
  label: string;
  icon: LucideIcon;
  /** true면 비로그인 시 목록에서 제외한다(비활성이 아니라 숨김). */
  auth: boolean;
  /** false면 「준비 중」 — 보이되 눌리지 않는다. */
  enabled: boolean;
  /** true면 관리자에게만 보인다. */
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "대시보드", icon: LayoutDashboard, auth: false, enabled: true },
  { key: "map", label: "지도", icon: Map, auth: false, enabled: true },
  { key: "markers", label: "마커관리", icon: MapPin, auth: true, enabled: true },
  { key: "schedule", label: "일정관리", icon: CalendarDays, auth: true, enabled: true },
  { key: "groups", label: "그룹관리", icon: Layers, auth: true, enabled: true, adminOnly: true },
  { key: "barcode", label: "바코드/QR", icon: ScanBarcode, auth: true, enabled: true },
  { key: "backup", label: "데이터백업/복원", icon: Database, auth: true, enabled: true },
  { key: "settings", label: "설정", icon: Settings, auth: true, enabled: true },
  { key: "accounts", label: "계정설정", icon: UserCog, auth: true, enabled: true, adminOnly: true },
];

/** 비로그인 상태에서 볼 수 있는 메뉴인가. */
export function isNavAccessible(
  key: NavKey,
  isAuthenticated: boolean,
  isAdmin = false,
): boolean {
  const item = NAV_ITEMS.find((candidate) => candidate.key === key);
  if (!item) return false;
  if (item.adminOnly && !(isAuthenticated && isAdmin)) return false;
  return isAuthenticated || !item.auth;
}

/** 로그인 상태에 맞는 메뉴 목록. 잠긴 항목은 렌더하지 않는다. */
export function visibleNavItems(isAuthenticated: boolean, isAdmin = false): NavItem[] {
  return NAV_ITEMS.filter((item) => isNavAccessible(item.key, isAuthenticated, isAdmin));
}
