import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type {
  SiteList,
  SiteListBackup,
  SiteListBadge,
  SiteListMember,
} from "@/features/site-lists/types";

/** 목록에 고를 수 있는 색. 마커 색상 15색과 같다(`LEGACY_COLOR_NAMES`에서 미지정·흰색 제외). */
export const SITE_LIST_COLORS = [
  "#10b981",
  "#6366f1",
  "#f43f5e",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#14b8a6",
  "#f97316",
  "#1e3a8a",
  "#38bdf8",
  "#facc15",
  "#92400e",
  "#9f1239",
] as const;

/** 핀에 칠하는 목록 색상 수. 나머지는 `+2`처럼 개수로 표시한다. */
const MAX_BADGE_COLORS = 3;

/** 선택한 목록에 속한 국소별 색상. 맵으로 모으므로 같은 국소는 마커가 하나다. */
export function buildSiteListBadges(
  lists: SiteList[],
  members: SiteListMember[],
  selectedIds: string[],
): Map<string, SiteListBadge> {
  const selected = new Set(selectedIds);
  const orderedLists = lists.filter((list) => selected.has(list.id));
  const memberKeys = new Set(
    members.map((member) => `${member.listId}|${member.markerId}`),
  );
  const markerIds = new Set(
    members.filter((member) => selected.has(member.listId)).map((m) => m.markerId),
  );

  const badges = new Map<string, SiteListBadge>();
  for (const markerId of markerIds) {
    const colors = orderedLists
      .filter((list) => memberKeys.has(`${list.id}|${markerId}`))
      .map((list) => list.color);
    if (colors.length === 0) continue;
    badges.set(markerId, {
      colors: colors.slice(0, MAX_BADGE_COLORS),
      extraCount: Math.max(colors.length - MAX_BADGE_COLORS, 0),
    });
  }
  return badges;
}

/** 한 국소의 전체 소속 목록. 상세 화면에 쓴다. */
export function listsOfMarker(
  markerId: string,
  lists: SiteList[],
  members: SiteListMember[],
): SiteList[] {
  const listIds = new Set(
    members.filter((member) => member.markerId === markerId).map((m) => m.listId),
  );
  return lists.filter((list) => listIds.has(list.id));
}

/** 화면 판단용이다. 실제 권한은 DB 정책이 막는다. */
export function canEditSiteList(list: SiteList, isAdmin: boolean): boolean {
  return !list.isAdminList || isAdmin;
}

function compact(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

/** 국소명, 최종 국소명, 코드, 사업구분, 주소로 장비 국소를 찾는다. */
export function searchEquipmentSites(
  markers: EquipmentMarker[],
  query: string,
): EquipmentMarker[] {
  const needle = compact(query);
  if (!needle) return [];
  return markers.filter((marker) =>
    [
      marker.name,
      marker.finalStationName,
      marker.facilityCode,
      marker.projectCode,
      marker.businessType,
      marker.roadAddress,
      marker.jibunAddress,
    ].some((value) => compact(value ?? "").includes(needle)),
  );
}

/** 복원할 내용을 고른다. 일반 사용자는 일반 목록만 다룬다(DB 정책과 같은 규칙). */
export function planSiteListRestore(
  backup: SiteListBackup,
  isAdmin: boolean,
): SiteListBackup {
  const lists = backup.lists.filter(
    (list) => isAdmin || String(list.is_admin_list).toLowerCase() !== "true",
  );
  const listIds = new Set(lists.map((list) => String(list.id)));
  return {
    lists,
    members: backup.members.filter((member) => listIds.has(String(member.list_id))),
  };
}

/** 마이그레이션을 적용하기 전이면 테이블이 없다. */
export function isSiteListsTableMissing(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "PGRST205" || code === "42P01";
}
