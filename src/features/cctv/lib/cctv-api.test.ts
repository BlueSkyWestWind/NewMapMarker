import { describe, expect, it } from "vitest";
import { cctvQueryKey } from "./cctv-api";

describe("cctvQueryKey", () => {
  const bbox = { minX: 125, maxX: 127.95, minY: 33.85, maxY: 35.5 };

  it("도로 종별 순서가 달라도 같은 키", () => {
    expect(cctvQueryKey({ bbox, roadTypes: ["its", "ex"] })).toBe(
      cctvQueryKey({ bbox, roadTypes: ["ex", "its"] }),
    );
  });

  it("범위가 다르면 다른 키", () => {
    expect(cctvQueryKey({ bbox, roadTypes: ["ex"] })).not.toBe(
      cctvQueryKey({ bbox: { ...bbox, maxX: 127 }, roadTypes: ["ex"] }),
    );
  });
});
