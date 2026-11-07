import {
  getAddressGroupMates,
  getMarkerDongLabel,
  storedGroupRoleOf,
} from "@/features/map-marker/lib/marker-detail-rows";
import { GROUP_ROLE_REPRESENTATIVE, GROUP_ROLE_STANDALONE } from "@/features/map-marker/lib/address-group";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type { MarkerOp } from "../types";
import {
  planAssignGroup,
  planDelete,
  planRoleChange,
  planSeparate,
} from "./group-actions";
import { applyOpsToMarkers } from "./group-ops";

/**
 * 체크한 마커들을 하나씩 단독으로 바꾸는 계획. 앞 마커의 변경 결과 위에서 다음 마커를 계획한다
 * (대표를 먼저 빼면 새 대표가 생기므로 순서대로 이어 쌓아야 한다).
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
    if (plan.ops.length === 0) continue;
    ops.push(...plan.ops);
    notice = plan.notice;
    current = applyOpsToMarkers(current, plan.ops);
  }
  return { ops, notice: targets.length > 1 && ops.length > 0 ? `${targets.length}건을 단독으로 변경했습니다.` : notice };
}

/**
 * 체크한 마커를 같은 묶음에서 빼내 새 묶음으로 만든다. 라벨은 첫 마커의 동 라벨.
 * 남는 마커는 원래 묶음의 group_key를 유지한 채 대표를 다시 정한다.
 */
export function planSeparateSelected(
  targets: EquipmentMarker[],
  working: EquipmentMarker[],
): { ops: MarkerOp[]; newKey: string; label: string } {
  if (targets.length === 0) return { ops: [], newKey: "", label: "" };
  const label = getMarkerDongLabel(targets[0]);
  const targetIds = new Set(targets.map((m) => m.id));
  const remaining = getAddressGroupMates(targets[0], working).filter(
    (m) => !targetIds.has(m.id),
  );
  const separated = planSeparate(targets, [], label);
  const remainingKey = remaining[0]?.groupKey?.trim() || null;
  return {
    ops: [...planAssignGroup(remaining, remainingKey).ops, ...separated.ops],
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
