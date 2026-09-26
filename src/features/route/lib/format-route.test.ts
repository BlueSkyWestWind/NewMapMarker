import { describe, expect, it } from "vitest";
import { formatDistance, formatDuration, formatToll } from "./format-route";

describe("formatDistance", () => {
  it("1000m 이상은 km로 표시한다", () => {
    expect(formatDistance(130_400)).toBe("130.4km");
  });

  it("1000m 미만은 m로 표시한다", () => {
    expect(formatDistance(850)).toBe("850m");
  });
});

describe("formatDuration", () => {
  it("1시간 미만은 분만 표시한다", () => {
    expect(formatDuration(39 * 60)).toBe("39분");
  });

  it("1시간 이상은 시간+분으로 표시한다", () => {
    expect(formatDuration(99 * 60)).toBe("1시간 39분");
  });

  it("0초는 0분", () => {
    expect(formatDuration(0)).toBe("0분");
  });
});

describe("formatToll", () => {
  it("0원 이하는 무료로 표시한다", () => {
    expect(formatToll(0)).toBe("무료");
  });

  it("천단위 콤마를 붙인다", () => {
    expect(formatToll(5000)).toBe("5,000원");
  });
});
