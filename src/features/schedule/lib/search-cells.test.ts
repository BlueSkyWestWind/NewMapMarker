import { describe, expect, it } from "vitest";
import { MIN_SEARCH_LENGTH, likePattern, normalizeSearchQuery } from "./search-cells";

describe("normalizeSearchQuery", () => {
  it("앞뒤 공백을 지우고 너무 짧으면 null이다", () => {
    expect(normalizeSearchQuery("  동문동  ")).toBe("동문동");
    expect(MIN_SEARCH_LENGTH).toBe(2);
    expect(normalizeSearchQuery("동")).toBeNull();
    expect(normalizeSearchQuery("   ")).toBeNull();
  });
});

describe("likePattern", () => {
  it("포함 검색 패턴으로 바꾼다", () => {
    expect(likePattern("동문동")).toBe("%동문동%");
  });

  it("LIKE 특수문자(% _ 역슬래시)는 글자 그대로 찾도록 이스케이프한다", () => {
    expect(likePattern("RRU1(B7_30)")).toBe("%RRU1(B7\\_30)%");
    expect(likePattern("100%")).toBe("%100\\%%");
    expect(likePattern("a\\b")).toBe("%a\\\\b%");
  });
});
