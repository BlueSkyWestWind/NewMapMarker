import { describe, expect, it } from "vitest";
import type { SurveyDoc } from "../types";
import { mergeDocsByName } from "./merge-docs";

const doc = (fileName: string, tag = ""): SurveyDoc => ({
  fileName,
  get: () => tag,
  has: () => false,
  notes: () => [],
  ids: () => ({ year: "", project: "", facilityCode: "" }),
});

describe("mergeDocsByName", () => {
  it("새 파일은 뒤에 붙인다", () => {
    expect(mergeDocsByName([doc("a")], [doc("b")]).map((d) => d.fileName)).toEqual(["a", "b"]);
  });

  it("같은 파일 이름을 다시 올리면 제자리에서 바꿔 넣는다", () => {
    const merged = mergeDocsByName([doc("a", "old"), doc("b")], [doc("a", "new")]);
    expect(merged.map((d) => d.fileName)).toEqual(["a", "b"]);
    expect(merged[0].get({ section: 1, label: "", direction: "below" })).toBe("new");
  });
});
