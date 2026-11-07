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

/** 표에서 직접 수정하는 `markers` 쪽 필드(마커 단위). */
export interface MarkerFields {
  name: string;
  lat: number | null;
  lng: number | null;
  memo: string;
  tags: string[];
  color: string;
  facilityTeam: string;
  facilityCode: string;
  roadAddress: string;
  jibunAddress: string;
}

/** `information` 한 행. 마커 하나에 여러 개일 수 있다. */
export interface InfoRecord {
  id: number;
  markerId: string;
  projectCode: string;
  facilityYear: string;
  businessType: string;
  finalStationName: string;
  eqClass: string;
  eqType: string;
  installDate: string;
  openDate: string;
}

/** 정보 행에서 수정할 수 있는 필드. */
export type InfoFields = Omit<InfoRecord, "id" | "markerId">;

/** 저장 전까지 쌓아 두는 변경분. 마커는 마커 ID, 정보는 정보 행 ID로 쌓는다. */
export interface EditDraft {
  markerEdits: Record<string, Partial<MarkerFields>>;
  infoEdits: Record<number, Partial<InfoFields>>;
  ops: MarkerOp[];
}

/** 입력 검증 결과 한 건. `key`는 `marker:<id>:<field>` / `info:<id>:<field>`. */
export interface DraftIssue {
  key: string;
  message: string;
}
