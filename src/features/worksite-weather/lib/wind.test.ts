import { describe, expect, it } from "vitest";
import { windDirection, windLabel } from "./wind";

describe("windDirection", () => {
  it.each([
    [0, "북"],
    [90, "동"],
    [180, "남"],
    [270, "서"],
    [225, "남서"],
    [247, "서남서"],
  ])("%d° → %s", (deg, expected) => {
    expect(windDirection(deg)).toBe(expected);
  });

  it("16방위 경계값 — 348.75° 이상은 다시 북", () => {
    expect(windDirection(348.74)).toBe("북북서");
    expect(windDirection(348.75)).toBe("북");
    expect(windDirection(11.24)).toBe("북");
    expect(windDirection(11.25)).toBe("북북동");
  });

  it("360 초과·음수도 한 바퀴로 정규화한다", () => {
    expect(windDirection(360)).toBe("북");
    expect(windDirection(450)).toBe("동");
    expect(windDirection(-90)).toBe("서");
  });

  it("값이 없으면 '-'", () => {
    expect(windDirection(null)).toBe("-");
    expect(windDirection(Number.NaN)).toBe("-");
  });
});

describe("windLabel", () => {
  it.each([
    [1.8, "약함"],
    [3.99, "약함"],
    [4, "약간 강함"],
    [8.9, "약간 강함"],
    [9, "강함"],
    [11.2, "강함"],
    [14, "매우 강함"],
  ])("%d m/s → %s", (ms, expected) => {
    expect(windLabel(ms)).toBe(expected);
  });

  it("값이 없으면 '-'", () => {
    expect(windLabel(null)).toBe("-");
  });
});
