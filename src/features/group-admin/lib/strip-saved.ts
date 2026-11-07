import type { EditDraft, InfoRecord } from "../types";
import { sortOps, type SaveResult } from "./save-draft";

/**
 * 저장이 끝난 항목만 변경분에서 빼고 나머지는 남긴다.
 * 끝난 삭제 연산의 마커는 saveDraft가 수정·정보 수정을 보내지 않으므로(저장됨으로 보고되지 않는다)
 * 여기서 그 마커의 수정과 정보 행 수정(`infoRows`로 마커→행 매핑)도 함께 뺀다.
 */
export function stripSaved(
  draft: EditDraft,
  result: SaveResult,
  infoRows: InfoRecord[] = [],
): EditDraft {
  const markerEdits = { ...draft.markerEdits };
  for (const id of result.savedMarkerIds) delete markerEdits[id];
  const infoEdits = { ...draft.infoEdits };
  for (const id of result.savedInfoIds) delete infoEdits[id];
  // saveDraft는 삭제를 뒤로 보내 실행하므로 같은 정렬의 앞쪽 completedOps개가 끝난 것이다.
  const done = new Set(sortOps(draft.ops).slice(0, result.completedOps));
  const deletedIds = new Set<string>();
  for (const op of done) {
    if (op.type === "delete") op.ids.forEach((id) => deletedIds.add(id));
  }
  for (const id of deletedIds) delete markerEdits[id];
  for (const row of infoRows) {
    if (deletedIds.has(row.markerId)) delete infoEdits[row.id];
  }
  return {
    markerEdits,
    infoEdits,
    ops: draft.ops.filter((op) => !done.has(op)),
  };
}
