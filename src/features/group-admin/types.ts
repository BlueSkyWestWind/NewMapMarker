import type { GroupRole } from "@/features/map-marker/lib/address-group";

/** `markers` 행에 적용할 수 있는 변경 필드(DB 컬럼명). */
export interface MarkerPatch {
  parent_marker_id?: string | null;
  group_role?: GroupRole;
  group_key?: string | null;
  detached_visible?: boolean;
}

/** 마커 변경 계획의 한 단계. 수정 또는 삭제. */
export type MarkerOp =
  | { type: "update"; ids: string[]; patch: MarkerPatch }
  | { type: "delete"; ids: string[] };
