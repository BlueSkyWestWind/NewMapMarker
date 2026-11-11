import {
  GROUP_ROLE_REPRESENTATIVE,
  GROUP_ROLE_STANDALONE,
  GROUP_ROLE_SUB,
  buildSplitGroupKey,
  getLotAddressKey,
} from "@/features/map-marker/lib/address-group";
import type { GroupRole } from "@/features/map-marker/lib/address-group";
import {
  getAddressGroupMates,
  getMarkerEffectiveKey,
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

/**
 * 단독으로 떼어 낸 마커에 그 마커만의 group_key를 주는 변경.
 * 키가 없으면 같은 번지 마커끼리 한 묶음으로 보이고, 재정리 때 다시 합쳐질 수 있다.
 */
export function planDetachKey(marker: EquipmentMarker): MarkerOp {
  return {
    type: "update",
    ids: [marker.id],
    patch: { group_key: buildSplitGroupKey(lotKeyOf(marker) || "lot", "단독", marker.id) },
  };
}

/** 마커의 번지 키(도로명 → 지번 순). 주소가 없으면 빈 문자열. */
function lotKeyOf(marker: EquipmentMarker): string {
  return getLotAddressKey(marker.roadAddress || marker.jibunAddress || "");
}

/**
 * 라벨(동/지하/기타) 국소들을 번지 그룹에서 빼내 독립 그룹으로 분리하는 계획.
 * 상세 화면의 separateLabelGroup과 같은 순서다: 남은 번지 그룹 재승격을 먼저,
 * 분리 그룹을 나중에(뒤 단계가 실패해도 남은 SUB가 옛 대표를 가리키는 채로 남지 않게).
 * targets가 비어 있으면 아무것도 하지 않는다(newKey는 빈 문자열).
 */
export function planSeparate(
  targets: EquipmentMarker[],
  remaining: EquipmentMarker[],
  label: string,
  repId?: string,
): { ops: MarkerOp[]; newKey: string } {
  if (targets.length === 0) return { ops: [], newKey: "" };
  const newKey = buildSplitGroupKey(
    lotKeyOf(targets[0]) || "lot",
    label,
    targets[0].id,
  );
  return {
    ops: [
      ...planAssignGroup(remaining, null).ops,
      ...planAssignGroup(targets, newKey, repId).ops,
    ],
    newKey,
  };
}

/** 번지 키, 주소가 없으면 마커 자신만의 키(`__solo__<id>`). */
function lotIdentityOf(marker: EquipmentMarker): string {
  return lotKeyOf(marker) || `__solo__${marker.id}`;
}

/**
 * 분리 그룹(group_key)을 번지 그룹으로 되돌리는 계획(상세 화면의 mergeSplitGroupToLot).
 * group_key를 지우고, 되돌린 멤버를 각자 자기 번지로 나눠 번지마다
 * (되돌린 멤버 + group_key 없는 같은 번지 멤버)를 재정렬한다.
 * 합치기로 다른 번지가 섞인 묶음이어도 SUB가 다른 번지의 대표를 가리키지 않게 한다.
 */
export function planMergeSplitToLot(
  splitMembers: EquipmentMarker[],
  all: EquipmentMarker[],
): { ops: MarkerOp[] } {
  if (splitMembers.length === 0) return { ops: [] };

  const revertIds = new Set(splitMembers.map((m) => m.id));
  const byLot = new Map<string, EquipmentMarker[]>();
  for (const member of splitMembers) {
    const key = lotIdentityOf(member);
    byLot.set(key, [...(byLot.get(key) ?? []), member]);
  }

  const lotOps = [...byLot.values()].flatMap((reverted) => {
    const lotKey = lotKeyOf(reverted[0]);
    const sameLot =
      lotKey === ""
        ? []
        : all.filter(
            (m) =>
              !revertIds.has(m.id) &&
              !(m.groupKey ?? "").trim() &&
              lotKeyOf(m) === lotKey,
          );
    return planAssignGroup([...reverted, ...sameLot], null).ops;
  });

  return {
    ops: [
      { type: "update", ids: [...revertIds], patch: { group_key: null } },
      ...lotOps,
    ],
  };
}

/**
 * 합쳐져 나간 마커들이 떠난 옛 묶음의 나머지(단독 제외)를, 묶음별로 같은 group_key로
 * 대표를 다시 정하는 연산으로 만든다. 떠난 마커를 부모로 가리키는 SUB가 다른 묶음에
 * 있어도(옛 분리 해제가 남긴 데이터 등) 그 SUB의 묶음을 함께 다시 정한다.
 */
function planLeftovers(
  movedIds: Set<string>,
  anchors: EquipmentMarker[],
  all: EquipmentMarker[],
): MarkerOp[] {
  const strandedSubs = all.filter(
    (m) =>
      !movedIds.has(m.id) &&
      !!m.parentMarkerId &&
      movedIds.has(m.parentMarkerId) &&
      storedGroupRoleOf(m) === GROUP_ROLE_SUB,
  );
  const byKey = new Map<string, EquipmentMarker[]>();
  for (const anchor of [...anchors, ...strandedSubs]) {
    const key = getMarkerEffectiveKey(anchor) || `__solo__${anchor.id}`;
    if (byKey.has(key)) continue;
    byKey.set(
      key,
      getAddressGroupMates(anchor, all).filter(
        (m) =>
          !movedIds.has(m.id) && storedGroupRoleOf(m) !== GROUP_ROLE_STANDALONE,
      ),
    );
  }
  return [...byKey.values()].flatMap(
    (left) =>
      planAssignGroup(left, left[0]?.groupKey?.trim() || null).ops,
  );
}

/**
 * 여러 묶음을 하나로 합치는 계획. 대표 1명(지정 → 기존 대표 → 최초 등록), 나머지는 SUB.
 * 새 group_key는 `번지#합침#대표id`. 합쳐져 나가고 남은 옛 묶음은 같은 group_key로
 * 대표를 다시 정한다(먼저 수행해 남은 SUB가 옛 대표를 가리키는 채로 남지 않게).
 */
export function planMergeGroups(
  groups: EquipmentMarker[][],
  all: EquipmentMarker[],
  preferredRepId?: string,
): { ops: MarkerOp[]; groupKey: string } {
  const members = [...new Map(groups.flat().map((m) => [m.id, m])).values()];
  const rep = planAssignGroup(members, null, preferredRepId).rep;
  if (!rep) return { ops: [], groupKey: "" };

  const groupKey = buildSplitGroupKey(lotKeyOf(rep) || "lot", "합침", rep.id);
  const movedIds = new Set(members.map((m) => m.id));
  return {
    ops: [
      ...planLeftovers(movedIds, members, all),
      ...planAssignGroup(members, groupKey, preferredRepId).ops,
    ],
    groupKey,
  };
}

/**
 * 마커 삭제 계획. 대표가 지워지는 묶음은 남은 마커(단독 제외)로 대표를 다시 정하고
 * (1개면 단독), 그 연산을 삭제보다 먼저 둔다. DB는 parent_marker_id가
 * ON DELETE SET NULL이라 재지정 없이 지우면 남은 SUB가 대표 없이 남는다.
 */
export function planDelete(
  targets: EquipmentMarker[],
  all: EquipmentMarker[],
): { ops: MarkerOp[] } {
  if (targets.length === 0) return { ops: [] };

  const deleteIds = new Set(targets.map((m) => m.id));
  const deletedReps = targets.filter(
    (m) => storedGroupRoleOf(m) === GROUP_ROLE_REPRESENTATIVE,
  );
  return {
    ops: [
      ...planLeftovers(deleteIds, deletedReps, all),
      { type: "delete", ids: [...deleteIds] },
    ],
  };
}
