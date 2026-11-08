import { describe, expect, it } from "vitest";
import { chunkArray } from "./chunk";

describe("chunkArray", () => {
  it("지정한 크기로 나누고 마지막 조각은 남은 만큼만 담는다", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("빈 배열은 조각이 없다", () => {
    expect(chunkArray([], 3)).toEqual([]);
  });
});
