import { storedGroupRoleOf } from "@/features/map-marker/lib/marker-detail-rows";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type { EditDraft, MarkerGroup } from "../types";
import { setMarkerEdit } from "./edit-draft";

function hasCoord(marker: EquipmentMarker): marker is EquipmentMarker & {
  lat: number;
  lng: number;
} {
  const { lat, lng } = marker;
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return !(lat === 0 && lng === 0);
}

/**
 * 묶음의 SUB 위도·경도를 대표의 값으로 맞추는 변경분을 쌓는다. 바로 저장하지 않는다.
 * - 대표에 좌표가 없으면 그 묶음은 건너뛴다(`skippedNoRep`) — SUB 좌표를 지우지 않는다.
 * - 이미 같은 좌표인 SUB는 건드리지 않는다(`changed`에 세지 않음).
 * - 대표의 좌표는 변경분이 반영된 값을 쓴다. 그래서 대표를 먼저 고쳐 두면 그 값으로 맞춘다.
 * - 단독 국소는 대상이 아니다. SUB(저장된 구분)만 맞춘다.
 */
export function planSyncSubCoords(
  draft: EditDraft,
  groups: MarkerGroup[],
): { draft: EditDraft; changed: number; skippedNoRep: number } {
  let next = draft;
  let changed = 0;
  let skippedNoRep = 0;

  for (const group of groups) {
    const rep = group.representative;
    const subs = group.markers.filter(
      (marker) => marker !== rep && storedGroupRoleOf(marker) === "SUB",
    );
    if (!rep || subs.length === 0) continue;

    const repEdit = draft.markerEdits[rep.id];
    const repWorking = repEdit ? ({ ...rep, ...repEdit } as EquipmentMarker) : rep;
    if (!hasCoord(repWorking)) {
      skippedNoRep += 1;
      continue;
    }

    for (const sub of subs) {
      const subEdit = next.markerEdits[sub.id];
      const subWorking = subEdit ? ({ ...sub, ...subEdit } as EquipmentMarker) : sub;
      if (subWorking.lat === repWorking.lat && subWorking.lng === repWorking.lng) continue;
      next = setMarkerEdit(next, sub, { lat: repWorking.lat, lng: repWorking.lng });
      changed += 1;
    }
  }
  return { draft: next, changed, skippedNoRep };
}
