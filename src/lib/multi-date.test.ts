import { describe, expect, it } from "vitest";
import { toggleDate } from "./multi-date";

describe("toggleDate", () => {
  it("고르지 않은 날짜를 누르면 더하고 날짜 순서로 정렬한다", () => {
    expect(toggleDate(["2026-11-18"], "2026-11-17", { max: 31 })).toEqual(["2026-11-17", "2026-11-18"]);
  });

  it("이미 고른 날짜를 누르면 뺀다", () => {
    expect(toggleDate(["2026-11-17", "2026-11-18"], "2026-11-17", { max: 31 })).toEqual(["2026-11-18"]);
  });

  it("고정 날짜(창의 날짜)는 누를 수 없고 목록에도 들어가지 않는다", () => {
    expect(toggleDate([], "2026-11-16", { locked: "2026-11-16", max: 31 })).toEqual([]);
    expect(toggleDate(["2026-11-17"], "2026-11-16", { locked: "2026-11-16", max: 31 })).toEqual([
      "2026-11-17",
    ]);
  });

  it("최대 개수에 닿으면 더 늘리지 않지만 빼는 것은 된다", () => {
    const full = ["2026-11-17", "2026-11-18"];
    expect(toggleDate(full, "2026-11-19", { max: 2 })).toEqual(full);
    expect(toggleDate(full, "2026-11-18", { max: 2 })).toEqual(["2026-11-17"]);
  });

  it("원래 배열을 바꾸지 않는다", () => {
    const original = ["2026-11-18"];
    toggleDate(original, "2026-11-17", { max: 31 });
    expect(original).toEqual(["2026-11-18"]);
  });
});
