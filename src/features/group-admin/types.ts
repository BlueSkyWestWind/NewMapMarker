import type { EquipmentMarker } from "@/features/map-marker/types/marker";
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

/** 번지(또는 분리 키) 단위로 묶은 장비 마커 한 묶음. */
export interface MarkerGroup {
  key: string;
  lotAddress: string;
  markers: EquipmentMarker[];
  representative: EquipmentMarker | null;
  hasNoCoord: boolean;
  /** 마커가 2개 이상인데 모두 `단독`이라 묶임이 빠진 것으로 의심되는 묶음. */
  isSuspect: boolean;
}

/** 묶음 목록 필터. 배열이 비면 그 조건은 걸러내지 않는다. */
export interface GroupFilters {
  query: string;
  years: string[];
  statuses: string[];
  businesses: string[];
  onlyNoCoord: boolean;
  onlySuspect: boolean;
}
