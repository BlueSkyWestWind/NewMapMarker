import {
  GROUP_ROLE_REPRESENTATIVE,
  GROUP_ROLE_STANDALONE,
  GROUP_ROLE_SUB,
} from "@/features/map-marker/lib/address-group";
import type { GroupRole } from "@/features/map-marker/lib/address-group";
import {
  getAddressGroupMates,
  pickNextAddressRepresentative,
  storedGroupRoleOf,
} from "@/features/map-marker/lib/marker-detail-rows";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type { MarkerOp } from "../types";

function roleOp(
  ids: string[],
  parentMarkerId: string | null,
  groupRole: GroupRole,
): MarkerOp {
  return {
    type: "update",
    ids,
    patch: { parent_marker_id: parentMarkerId, group_role: groupRole },
  };
}

/**
 * 국소 구분(대표/단독/SUB) 변경 계획을 만든다(DB 호출 없음).
 * 상세 화면의 changeMarkerGroupRole과 같은 분기·순서이며 notice는 그 토스트 문구다.
 * - 대표: 동일 번지에서 이 국소를 대표로, 나머지(단독 제외)는 SUB
 * - 단독: 그룹에서 이탈. 대상이 대표였으면 남은 국소 중 새 대표(1명이면 단독) 승격
 * - SUB: 현재 대표(없으면 다른 국소 승격) 아래로 연결
 */
export function planRoleChange(
  target: EquipmentMarker,
  nextRole: GroupRole,
  all: EquipmentMarker[],
): { ops: MarkerOp[]; notice: string } {
  if (storedGroupRoleOf(target) === nextRole) return { ops: [], notice: "" };

  const mates = getAddressGroupMates(target, all);
  const notStandaloneOthers = (excludeIds: string[]) =>
    mates.filter(
      (item) =>
        !excludeIds.includes(item.id) &&
        storedGroupRoleOf(item) !== GROUP_ROLE_STANDALONE,
    );

  if (nextRole === GROUP_ROLE_STANDALONE) {
    const wasRep =
      storedGroupRoleOf(target) === GROUP_ROLE_REPRESENTATIVE ||
      (!target.parentMarkerId &&
        storedGroupRoleOf(target) !== GROUP_ROLE_STANDALONE);
    const ops: MarkerOp[] = [roleOp([target.id], null, GROUP_ROLE_STANDALONE)];
    const detached = "단독으로 변경했습니다. 그룹에서 분리됩니다.";
    if (!wasRep) return { ops, notice: detached };

    const remaining = notStandaloneOthers([target.id]);
    if (remaining.length === 0) return { ops, notice: detached };
    if (remaining.length === 1) {
      ops.push(roleOp([remaining[0].id], null, GROUP_ROLE_STANDALONE));
      return {
        ops,
        notice: "단독으로 분리했습니다. 남은 1국소도 단독으로 변경했습니다.",
      };
    }
    const newRep = pickNextAddressRepresentative(remaining);
    if (!newRep) return { ops, notice: detached };
    ops.push(roleOp([newRep.id], null, GROUP_ROLE_REPRESENTATIVE));
    const subIds = remaining
      .filter((item) => item.id !== newRep.id)
      .map((item) => item.id);
    if (subIds.length > 0) ops.push(roleOp(subIds, newRep.id, GROUP_ROLE_SUB));
    return {
      ops,
      notice: `단독으로 분리했습니다. '${newRep.finalStationName || newRep.name}'을(를) 새 대표로 지정했습니다.`,
    };
  }

  if (nextRole === GROUP_ROLE_REPRESENTATIVE) {
    const ops: MarkerOp[] = [
      roleOp([target.id], null, GROUP_ROLE_REPRESENTATIVE),
    ];
    const subIds = notStandaloneOthers([target.id]).map((item) => item.id);
    if (subIds.length > 0) ops.push(roleOp(subIds, target.id, GROUP_ROLE_SUB));
    return {
      ops,
      notice: `대표로 변경했습니다.${subIds.length > 0 ? ` (SUB ${subIds.length}건)` : ""}`,
    };
  }

  // SUB
  const candidates = notStandaloneOthers([target.id]);
  const rep =
    candidates.find(
      (item) => storedGroupRoleOf(item) === GROUP_ROLE_REPRESENTATIVE,
    ) ??
    candidates.find((item) => !item.parentMarkerId) ??
    candidates[0];

  if (!rep) {
    return {
      ops: [roleOp([target.id], null, GROUP_ROLE_STANDALONE)],
      notice: "같은 번지에 연결할 대표가 없어 단독으로 설정했습니다.",
    };
  }

  const ops: MarkerOp[] = [];
  const wasRep =
    storedGroupRoleOf(target) === GROUP_ROLE_REPRESENTATIVE ||
    !target.parentMarkerId;
  if (wasRep) {
    ops.push(roleOp([rep.id], null, GROUP_ROLE_REPRESENTATIVE));
    const reassignIds = notStandaloneOthers([target.id, rep.id]).map(
      (item) => item.id,
    );
    if (reassignIds.length > 0) {
      ops.push(roleOp(reassignIds, rep.id, GROUP_ROLE_SUB));
    }
  }
  ops.push(roleOp([target.id], rep.id, GROUP_ROLE_SUB));
  return { ops, notice: "SUB로 변경했습니다." };
}

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
