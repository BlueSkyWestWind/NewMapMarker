import { describe, expect, it } from "vitest";
import { isMapSegment } from "./segment";

describe("isMapSegment", () => {
  it("일정관리·공정관리 하위 화면은 지도 세그먼트가 아니다", () => {
    for (const key of ["facility", "daily", "mail", "survey"] as const) {
      expect(isMapSegment(key), key).toBe(false);
    }
  });

  it("지도 세그먼트는 true다", () => {
    for (const key of ["equipment", "battery", "location", "cctv", "converter", "groups"] as const) {
      expect(isMapSegment(key), key).toBe(true);
    }
  });
});
