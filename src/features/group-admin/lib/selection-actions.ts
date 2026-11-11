import {
  getAddressGroupMates,
  getMarkerDongLabel,
  getMarkerEffectiveKey,
  storedGroupRoleOf,
} from "@/features/map-marker/lib/marker-detail-rows";
import {
  GROUP_ROLE_REPRESENTATIVE,
  GROUP_ROLE_STANDALONE,
  GROUP_ROLE_SUB,
} from "@/features/map-marker/lib/address-group";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type { MarkerOp } from "../types";
import {
  planAssignGroup,
  planDelete,
  planDetachKey,
  planRoleChange,
  planSeparate,
} from "./group-actions";
import { applyOpsToMarkers } from "./group-ops";

/**
 * 체크한 마커들을 하나씩 단독으로 바꾸는 계획. 앞 마커의 변경 결과 위에서 다음 마커를 계획한다
 * (대표를 먼저 빼면 새 대표가 생기므로 순서대로 이어 쌓아야 한다).
 * 떼어 낸 마커는 자기만의 group_key를 받아 목록에도 각각 한 줄로 나온다. 이미 단독이어도
 * 같은 키로 다른 마커와 한 묶음처럼 보이면 같이 떼어 낸다.
 */
export function planStandaloneSelected(
  targets: EquipmentMarker[],
  working: EquipmentMarker[],
): { ops: MarkerOp[]; notice: string } {
  let current = working;
  const ops: MarkerOp[] = [];
  let notice = "";
  for (const target of targets) {
    const latest = current.find((m) => m.id === target.id);
    if (!latest) continue;
    const plan = planRoleChange(latest, GROUP_ROLE_STANDALONE, current);
    const looksGrouped =
      storedGroupRoleOf(latest) === GROUP_ROLE_STANDALONE &&
      getAddressGroupMates(latest, current).length > 1;
    if (plan.ops.length === 0 && !looksGrouped) continue;
    const stepOps = [...plan.ops, planDetachKey(latest)];
    ops.push(...stepOps);
    notice = plan.notice || "단독으로 변경했습니다. 목록에서도 각각 따로 보입니다.";
    current = applyOpsToMarkers(current, stepOps);
  }
  return { ops, notice: targets.length > 1 && ops.length > 0 ? `${targets.length}건을 단독으로 변경했습니다.` : notice };
}

/**
 * 체크한 마커들을 하나씩 SUB로 바꾸는 계획(현재 대표 아래로 연결). 대표를 SUB로 바꾸면
 * 남은 마커가 새 대표가 되므로, 앞 마커의 변경 결과 위에서 다음 마커를 계획한다.
 */
export function planSubSelected(
  targets: EquipmentMarker[],
  working: EquipmentMarker[],
): { ops: MarkerOp[]; notice: string } {
  let current = working;
  const ops: MarkerOp[] = [];
  let notice = "";
  for (const target of targets) {
    const latest = current.find((m) => m.id === target.id);
    if (!latest) continue;
    const plan = planRoleChange(latest, GROUP_ROLE_SUB, current);
    if (plan.ops.length === 0) continue;
    ops.push(...plan.ops);
    notice = plan.notice;
    current = applyOpsToMarkers(current, plan.ops);
  }
  return {
    ops,
    notice: targets.length > 1 && ops.length > 0 ? `${targets.length}건을 SUB로 변경했습니다.` : notice,
  };
}

/**
 * 체크한 마커를 같은 묶음에서 빼내 새 묶음으로 만든다. 라벨은 첫 마커의 동 라벨.
 * 남는 마커는 원래 묶음의 group_key를 유지한 채 대표를 다시 정한다. 선택이 여러 묶음에
 * 걸치면(앞서 쌓인 분리로 키가 바뀐 마커 등) 묶음마다 따로 다시 정한다.
 */
export function planSeparateSelected(
  targets: EquipmentMarker[],
  working: EquipmentMarker[],
): { ops: MarkerOp[]; newKey: string; label: string } {
  if (targets.length === 0) return { ops: [], newKey: "", label: "" };
  const label = getMarkerDongLabel(targets[0]);
  const targetIds = new Set(targets.map((m) => m.id));
  const remainingByKey = new Map<string, EquipmentMarker[]>();
  for (const target of targets) {
    const key = getMarkerEffectiveKey(target) || `__solo__${target.id}`;
    if (remainingByKey.has(key)) continue;
    remainingByKey.set(
      key,
      getAddressGroupMates(target, working).filter((m) => !targetIds.has(m.id)),
    );
  }
  const separated = planSeparate(targets, [], label);
  const remainingOps = [...remainingByKey.values()].flatMap(
    (remaining) =>
      planAssignGroup(remaining, remaining[0]?.groupKey?.trim() || null).ops,
  );
  return {
    ops: [...remainingOps, ...separated.ops],
    newKey: separated.newKey,
    label,
  };
}

/** 삭제 계획과, 대표가 지워져 새로 대표가 되는 마커(미리보기용). */
export function planDeleteSelected(
  targets: EquipmentMarker[],
  working: EquipmentMarker[],
): { ops: MarkerOp[]; newRepresentatives: EquipmentMarker[] } {
  const { ops } = planDelete(targets, working);
  const byId = new Map(working.map((m) => [m.id, m]));
  const newRepresentatives: EquipmentMarker[] = [];
  for (const op of ops) {
    if (op.type !== "update" || op.patch.group_role !== GROUP_ROLE_REPRESENTATIVE) continue;
    for (const id of op.ids) {
      const found = byId.get(id);
      if (found && storedGroupRoleOf(found) !== GROUP_ROLE_REPRESENTATIVE) {
        newRepresentatives.push(found);
      }
    }
  }
  return { ops, newRepresentatives };
}
