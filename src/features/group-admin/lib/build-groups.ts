import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import { GROUP_ROLE_STANDALONE } from "@/features/map-marker/lib/address-group";
import {
  getMarkerEffectiveKey,
  storedGroupRoleOf,
} from "@/features/map-marker/lib/marker-detail-rows";
import type { MarkerGroup } from "../types";

const SOLO_PREFIX = "__solo__";

function hasCoord(marker: EquipmentMarker): boolean {
  const { lat, lng } = marker;
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return !(lat === 0 && lng === 0);
}

function pickRepresentative(markers: EquipmentMarker[]): EquipmentMarker | null {
  return (
    markers.find((m) => storedGroupRoleOf(m) === "대표") ??
    markers.find((m) => !m.parentMarkerId) ??
    null
  );
}

/** 장비 마커 목록을 번지(또는 분리 키) 묶음으로 만든다. 대표 국소명 순으로 정렬한다. */
export function buildMarkerGroups(markers: EquipmentMarker[]): MarkerGroup[] {
  const buckets = new Map<string, EquipmentMarker[]>();
  for (const marker of markers) {
    const key = getMarkerEffectiveKey(marker) || `${SOLO_PREFIX}${marker.id}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(marker);
    else buckets.set(key, [marker]);
  }

  const groups: MarkerGroup[] = [];
  for (const [key, members] of buckets) {
    const representative = pickRepresentative(members);
    const ordered = representative
      ? [representative, ...members.filter((m) => m !== representative)]
      : members;
    groups.push({
      key,
      lotAddress: key.startsWith(SOLO_PREFIX) ? "" : key,
      markers: ordered,
      representative,
      hasNoCoord: ordered.some((m) => !hasCoord(m)),
      isSuspect:
        ordered.length >= 2 &&
        ordered.every((m) => storedGroupRoleOf(m) === GROUP_ROLE_STANDALONE),
    });
  }

  const nameOf = (g: MarkerGroup) => (g.representative ?? g.markers[0]).name;
  return groups.sort(
    (a, b) =>
      nameOf(a).localeCompare(nameOf(b), "ko") || a.key.localeCompare(b.key),
  );
}
