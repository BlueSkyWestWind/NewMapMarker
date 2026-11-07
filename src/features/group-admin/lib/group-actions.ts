import {
  GROUP_ROLE_REPRESENTATIVE,
  GROUP_ROLE_STANDALONE,
  GROUP_ROLE_SUB,
} from "@/features/map-marker/lib/address-group";
import { storedGroupRoleOf } from "@/features/map-marker/lib/marker-detail-rows";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type { MarkerOp } from "../types";

/**
 * 그룹 멤버에 group_key·대표·SUB를 일괄 지정하는 계획을 만든다(DB 호출 없음).
 * 대표 1개(지정 → 기존 대표 → 최초 등록) → parent=null, 나머지 SUB, 1개면 단독.
 */
export function planAssignGroup(
  members: EquipmentMarker[],
  groupKey: string | null,
  preferredRepId?: string,
): { ops: MarkerOp[]; rep: EquipmentMarker | null } {
  if (members.length === 0) return { ops: [], rep: null };

  const ordered = [...members].sort((a, b) => {
    const at = a.createdAt || "";
    const bt = b.createdAt || "";
    if (at !== bt) return at.localeCompare(bt);
    return a.id.localeCompare(b.id);
  });
  const rep =
    (preferredRepId
      ? ordered.find((m) => m.id === preferredRepId)
      : undefined) ??
    ordered.find((m) => storedGroupRoleOf(m) === GROUP_ROLE_REPRESENTATIVE) ??
    ordered[0];

  const ops: MarkerOp[] = [
    {
      type: "update",
      ids: [rep.id],
      patch: {
        group_key: groupKey,
        parent_marker_id: null,
        group_role:
          ordered.length === 1
            ? GROUP_ROLE_STANDALONE
            : GROUP_ROLE_REPRESENTATIVE,
        detached_visible: false,
      },
    },
  ];
  const subIds = ordered.filter((m) => m.id !== rep.id).map((m) => m.id);
  if (subIds.length > 0) {
    ops.push({
      type: "update",
      ids: subIds,
      patch: {
        group_key: groupKey,
        parent_marker_id: rep.id,
        group_role: GROUP_ROLE_SUB,
        detached_visible: false,
      },
    });
  }
  return { ops, rep };
}
