import { describe, expect, it } from "vitest";
import type { EditDraft, InfoRecord } from "../types";
import type { SaveResult } from "./save-draft";
import { stripSaved } from "./strip-saved";

const draft: EditDraft = {
  markerEdits: { a: { name: "A2" }, b: { memo: "m" } },
  infoEdits: { 1: { openDate: "2026-01-01" }, 2: { facilityYear: "2025" } },
  ops: [
    { type: "delete", ids: ["x"] },
    { type: "update", ids: ["y"], patch: { group_role: "단독" } },
  ],
};

function result(partial: Partial<SaveResult>): SaveResult {
  return { savedMarkerIds: [], savedInfoIds: [], completedOps: 0, error: null, ...partial };
}

describe("stripSaved", () => {
  it("저장된 마커·정보 칸만 변경분에서 뺀다", () => {
    const next = stripSaved(draft, result({ savedMarkerIds: ["a"], savedInfoIds: [2], error: { message: "x", step: "info" } }));
    expect(Object.keys(next.markerEdits)).toEqual(["b"]);
    expect(Object.keys(next.infoEdits)).toEqual(["1"]);
    expect(next.ops).toHaveLength(2);
  });

  it("삭제는 뒤로 정렬되므로 완료 건수만큼 정렬 순서 앞에서 뺀다", () => {
    const next = stripSaved(draft, result({ completedOps: 1, error: { message: "x", step: "ops" } }));
    expect(next.ops).toEqual([{ type: "delete", ids: ["x"] }]);
  });

  it("원본 변경분을 바꾸지 않는다", () => {
    stripSaved(draft, result({ savedMarkerIds: ["a", "b"], completedOps: 2 }));
    expect(Object.keys(draft.markerEdits)).toEqual(["a", "b"]);
    expect(draft.ops).toHaveLength(2);
  });

  it("완료된 삭제 연산의 마커 수정·정보 수정도 함께 뺀다", () => {
    const d: EditDraft = {
      markerEdits: { x: { name: "지울 것" }, b: { memo: "m" } },
      infoEdits: { 1: { openDate: "2026-01-01" }, 2: { facilityYear: "2025" } },
      ops: [{ type: "delete", ids: ["x"] }],
    };
    const rows = [
      { id: 1, markerId: "x" },
      { id: 2, markerId: "b" },
    ] as InfoRecord[];
    const next = stripSaved(d, result({ completedOps: 1 }), rows);
    expect(Object.keys(next.markerEdits)).toEqual(["b"]);
    expect(Object.keys(next.infoEdits)).toEqual(["2"]);
    expect(next.ops).toEqual([]);
  });

  it("삭제가 끝나지 않았으면 그 마커의 수정은 남긴다", () => {
    const d: EditDraft = {
      markerEdits: { x: { name: "지울 것" } },
      infoEdits: {},
      ops: [{ type: "delete", ids: ["x"] }],
    };
    const next = stripSaved(d, result({ completedOps: 0, error: { message: "x", step: "ops" } }), []);
    expect(Object.keys(next.markerEdits)).toEqual(["x"]);
  });
});
