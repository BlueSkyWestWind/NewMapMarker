import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type { EditDraft, InfoRecord } from "../types";
import { setInfoEdit, setMarkerEdit } from "./edit-draft";

/** 일괄 수정으로 바꿀 값. 정의된 항목만 적용한다. */
export interface BulkValues {
  businessType?: string;
  facilityTeam?: string;
  color?: string;
  addTags?: string[];
  removeTags?: string[];
}

function cleanTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((t) => t.trim()).filter((t) => t !== ""))];
}

/** 현재 태그에 추가·제거를 적용한 새 태그 목록. 기존 순서를 지키고 중복을 만들지 않는다. */
function nextTags(current: string[], add: string[], remove: string[]): string[] {
  const removed = new Set(remove);
  const kept = current.filter((t) => !removed.has(t));
  return [...kept, ...add.filter((t) => !kept.includes(t) && !removed.has(t))];
}

/**
 * 선택한 마커들에 일괄 수정을 변경분으로 쌓는다. 바로 저장하지 않는다.
 * 사업구분은 마커의 모든 정보 행에 적용하고, 정보 행이 없는 마커는 건너뛴 수(`skipped`)로 센다.
 */
export function planBulkEdit(
  draft: EditDraft,
  markers: EquipmentMarker[],
  infoRows: InfoRecord[],
  values: BulkValues,
): { draft: EditDraft; skipped: number } {
  const add = cleanTags(values.addTags);
  const remove = cleanTags(values.removeTags);
  const rowsByMarker = new Map<string, InfoRecord[]>();
  for (const row of infoRows) {
    const list = rowsByMarker.get(row.markerId);
    if (list) list.push(row);
    else rowsByMarker.set(row.markerId, [row]);
  }

  let next = draft;
  let skipped = 0;
  for (const marker of markers) {
    const patch: Parameters<typeof setMarkerEdit>[2] = {};
    if (values.facilityTeam !== undefined) patch.facilityTeam = values.facilityTeam;
    if (values.color !== undefined) patch.color = values.color;
    if (add.length > 0 || remove.length > 0) {
      // 이미 쌓인 태그 변경분 위에 이어 쌓는다. 원본과의 비교는 setMarkerEdit이 한다.
      const base = next.markerEdits[marker.id]?.tags ?? marker.tags ?? [];
      patch.tags = nextTags(base, add, remove);
    }
    if (Object.keys(patch).length > 0) next = setMarkerEdit(next, marker, patch);

    if (values.businessType !== undefined) {
      const rows = rowsByMarker.get(marker.id) ?? [];
      if (rows.length === 0) skipped += 1;
      for (const row of rows) {
        next = setInfoEdit(next, row, { businessType: values.businessType });
      }
    }
  }
  return { draft: next, skipped };
}
