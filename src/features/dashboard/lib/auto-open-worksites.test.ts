import { describe, expect, it } from "vitest";
import { planAutoOpen } from "./auto-open-worksites";

describe("planAutoOpen", () => {
  it("처음 보는 작업 국소 전체를 펼치고 지도를 전체에 맞춘다", () => {
    expect(planAutoOpen({ allIds: ["a", "b"], opened: [], selected: [] })).toEqual({
      selected: ["a", "b"],
      opened: ["a", "b"],
      fitIds: ["a", "b"],
    });
  });

  it("직접 닫은 국소(이미 펼쳐 본 국소)는 다시 펼치지 않고 새 국소만 펼친다", () => {
    expect(planAutoOpen({ allIds: ["a", "b"], opened: ["a"], selected: [] })).toEqual({
      selected: ["b"],
      opened: ["a", "b"],
      fitIds: ["a", "b"],
    });
  });

  it("작업 국소가 아닌 다른 선택은 그대로 둔다", () => {
    expect(planAutoOpen({ allIds: ["a"], opened: [], selected: ["x"] })).toEqual({
      selected: ["x", "a"],
      opened: ["a"],
      fitIds: ["a"],
    });
  });

  it("이미 선택된 국소는 중복해서 넣지 않는다", () => {
    expect(planAutoOpen({ allIds: ["a", "b"], opened: [], selected: ["a"] })?.selected).toEqual([
      "a",
      "b",
    ]);
  });

  it("새로 펼칠 국소가 없으면 아무것도 하지 않는다", () => {
    expect(planAutoOpen({ allIds: ["a", "b"], opened: ["a", "b"], selected: [] })).toBeNull();
  });

  it("작업 국소가 없으면 아무것도 하지 않는다", () => {
    expect(planAutoOpen({ allIds: [], opened: [], selected: [] })).toBeNull();
  });
});
