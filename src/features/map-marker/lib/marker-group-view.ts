import {
  dongSortKey,
  getMarkerDongLabel,
  pickDongMapRepresentative,
} from "@/features/map-marker/lib/marker-detail-rows";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";

export interface DongGroup {
  label: string;
  subs: EquipmentMarker[];
  isDongShown: boolean;
  mapRepId: string | null;
}

/** SUB 국소를 동(棟)별로 묶는다. 동당 지도 핀은 최대 1개. */
export function buildDongGroups(related: EquipmentMarker[]): DongGroup[] {
  const byDong = new Map<string, EquipmentMarker[]>();
  for (const sub of related) {
    if (!sub.parentMarkerId) continue;
    const label = getMarkerDongLabel(sub);
    const list = byDong.get(label) ?? [];
    list.push(sub);
    byDong.set(label, list);
  }
  return Array.from(byDong.entries())
    .sort(([a], [b]) => dongSortKey(a) - dongSortKey(b))
    .map(([label, subs]) => {
      const isDongShown = subs.some((s) => s.detachedVisible);
      const mapRep = pickDongMapRepresentative(subs);
      return { label, subs, isDongShown, mapRepId: mapRep?.id ?? null };
    });
}

/** 번지 그룹 안의 분리 라벨(동/지하/기타)별 개수. */
export function buildSeparationLabelCounts(
  related: EquipmentMarker[],
): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const m of related) {
    const label = getMarkerDongLabel(m);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort(
    ([a], [b]) => dongSortKey(a) - dongSortKey(b),
  );
}

/** 분리된 그룹이 아니고 분리 라벨이 2종 이상이면 번지 분리가 의미가 있다. */
export function canSplitGroup(related: EquipmentMarker[]): boolean {
  const relatedIsSplit = related.some((m) => (m.groupKey ?? "").trim());
  if (relatedIsSplit) return false;
  return buildSeparationLabelCounts(related).length >= 2;
}
