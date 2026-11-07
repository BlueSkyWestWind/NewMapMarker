import type { EditDraft } from "../types";
import { sortOps, type SaveResult } from "./save-draft";

/** 저장이 끝난 항목만 변경분에서 빼고 나머지는 남긴다. */
export function stripSaved(draft: EditDraft, result: SaveResult): EditDraft {
  const markerEdits = { ...draft.markerEdits };
  for (const id of result.savedMarkerIds) delete markerEdits[id];
  const infoEdits = { ...draft.infoEdits };
  for (const id of result.savedInfoIds) delete infoEdits[id];
  // saveDraft는 삭제를 뒤로 보내 실행하므로 같은 정렬의 앞쪽 completedOps개가 끝난 것이다.
  const done = new Set(sortOps(draft.ops).slice(0, result.completedOps));
  return {
    markerEdits,
    infoEdits,
    ops: draft.ops.filter((op) => !done.has(op)),
  };
}
