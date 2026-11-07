import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type { DraftIssue, EditDraft } from "../types";

/**
 * 변경분을 합친 마커 목록에서 위도·경도가 한쪽만 비어 있는 마커를 찾는다.
 * `validateDraft`는 원본을 못 봐 한쪽만 고친 경우를 놓치므로 합친 결과로 다시 본다.
 * 좌표를 건드린 마커만 검사한다(원래 한쪽이 비어 있던 마커가 저장을 막지 않도록).
 */
export function validateMergedCoords(
  merged: EquipmentMarker[],
  draft: EditDraft,
): DraftIssue[] {
  const issues: DraftIssue[] = [];
  for (const marker of merged) {
    const edit = draft.markerEdits[marker.id];
    if (!edit || !("lat" in edit || "lng" in edit)) continue;
    if ((marker.lat == null) !== (marker.lng == null)) {
      issues.push({
        key: `marker:${marker.id}:lat`,
        message: "위도와 경도를 함께 입력하거나 함께 비워 주세요.",
      });
    }
  }
  return issues;
}
