import { describe, expect, it } from "vitest";
import { nextExcludedTiles } from "./capture-guide-state";

describe("nextExcludedTiles", () => {
  it("타일 수가 같으면 기존 제외 Set을 그대로 돌려준다", () => {
    const excluded = new Set([1, 2]);
    const result = nextExcludedTiles(4, 4, excluded);
    expect(result).toBe(excluded);
    expect(Array.from(result)).toEqual([1, 2]);
  });

  it("타일 수가 0에서 0으로 같으면 받은 Set을 그대로 돌려준다", () => {
    const excluded = new Set<number>();
    const result = nextExcludedTiles(0, 0, excluded);
    expect(result).toBe(excluded);
  });

  it("타일 수가 달라지면 빈 Set을 돌려준다", () => {
    const result = nextExcludedTiles(4, 6, new Set([1, 2]));
    expect(result.size).toBe(0);
  });

  it("이전이 0이고 다음이 4처럼 개수가 달라지면 빈 Set을 돌려준다", () => {
    const result = nextExcludedTiles(0, 4, new Set([0]));
    expect(result.size).toBe(0);
  });
});
