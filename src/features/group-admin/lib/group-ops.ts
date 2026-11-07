import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type { MarkerOp, MarkerPatch } from "../types";

/** 일부 연산만 반영된 채 실패했을 때 던진다. `completed`는 성공한 연산 수. */
export class MarkerOpsError extends Error {
  readonly completed: number;
  readonly cause: unknown;

  constructor(completed: number, cause: unknown) {
    super("마커 변경 중 일부가 실패했습니다.");
    this.name = "MarkerOpsError";
    this.completed = completed;
    this.cause = cause;
  }
}

/** DB 컬럼명 패치를 마커 필드(camelCase)로 옮긴다. */
function patchToFields(patch: MarkerPatch): Partial<EquipmentMarker> {
  const fields: Partial<EquipmentMarker> = {};
  if ("parent_marker_id" in patch) fields.parentMarkerId = patch.parent_marker_id;
  if ("group_role" in patch) fields.groupRole = patch.group_role;
  if ("group_key" in patch) fields.groupKey = patch.group_key;
  if ("detached_visible" in patch) fields.detachedVisible = patch.detached_visible;
  return fields;
}

/** 연산을 메모리의 마커 목록에 반영한 새 배열을 돌려준다(원본 불변). */
export function applyOpsToMarkers(
  markers: EquipmentMarker[],
  ops: MarkerOp[],
): EquipmentMarker[] {
  return ops.reduce<EquipmentMarker[]>((list, op) => {
    const ids = new Set(op.ids);
    if (op.type === "delete") return list.filter((m) => !ids.has(m.id));
    const fields = patchToFields(op.patch);
    return list.map((m) => (ids.has(m.id) ? { ...m, ...fields } : m));
  }, markers);
}

/** 연산을 순서대로 Supabase `markers`에 보낸다. 실패하면 `MarkerOpsError`. */
export async function applyMarkerOps(
  supabase: SupabaseBrowserClient,
  ops: MarkerOp[],
): Promise<void> {
  let completed = 0;
  for (const op of ops) {
    const table = supabase.from("markers");
    const { error } =
      op.type === "update"
        ? await table.update(op.patch).in("id", op.ids)
        : await table.delete().in("id", op.ids);
    if (error) throw new MarkerOpsError(completed, error);
    completed += 1;
  }
}
