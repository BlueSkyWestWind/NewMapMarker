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

/** 코드 하나로 볼 수 있는 최소 길이. 짧은 숫자 몇 개는 코드 목록으로 보지 않는다. */
const MIN_CODE_LENGTH = 4;

/**
 * 붙여 넣은 코드 목록이면 코드 조각을 돌려준다. 아니면 null이다.
 * 공백·쉼표·세미콜론·줄바꿈으로 나눈 조각이 둘 이상이고, 모두 숫자를 포함한 영숫자 코드일 때만이다.
 * 국소명이나 주소처럼 공백이 들어간 검색은 코드 목록이 아니다.
 */
function parseCodeList(query: string): string[] | null {
  const tokens = [
    ...new Set(
      query
        .split(/[\s,;]+/)
        .map((token) => token.trim())
        .filter(Boolean),
    ),
  ];
  if (tokens.length < 2) return null;
  const looksLikeCode = (token: string) =>
    token.length >= MIN_CODE_LENGTH &&
    /\d/.test(token) &&
    /^[A-Za-z0-9._-]+$/.test(token);
  return tokens.every(looksLikeCode) ? tokens : null;
}

/** 코드 목록에서 소문자로 맞춘 비교용 값. 같은 코드는 한 번만 센다. */
function lowerCodes(codes: string[]): string[] {
  return [...new Set(codes.map((code) => code.toLowerCase()))];
}

function codeMatches(marker: EquipmentMarker, lowerCode: string): boolean {
  return (
    (marker.facilityCode ?? "").toLowerCase() === lowerCode ||
    (marker.projectCode ?? "").toLowerCase() === lowerCode
  );
}

/**
 * 국소명, 최종 국소명, 코드, 사업구분, 주소로 장비 국소를 찾는다.
 * 통합시설코드나 프로젝트코드를 여러 개 붙여 넣으면 각각 정확히 같은 국소를 모두 찾는다.
 */
export function searchEquipmentSites(
  markers: EquipmentMarker[],
  query: string,
): EquipmentMarker[] {
  const codes = parseCodeList(query);
  if (codes) {
    const wanted = lowerCodes(codes);
    return markers.filter((marker) =>
      wanted.some((code) => codeMatches(marker, code)),
    );
  }

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

/**
 * 코드 목록으로 검색했을 때 일치하는 국소가 없는 코드. 코드 목록이 아니면 빈 배열이다.
 * 넣은 코드 중 몇 개가 빠졌는지 사용자에게 알려 주는 데 쓴다.
 */
export function findMissingCodes(
  markers: EquipmentMarker[],
  query: string,
): string[] {
  const codes = parseCodeList(query);
  if (!codes) return [];
  const seen = new Set<string>();
  return codes.filter((code) => {
    const lower = code.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return !markers.some((marker) => codeMatches(marker, lower));
  });
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
