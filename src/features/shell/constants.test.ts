import { describe, expect, it } from "vitest";
import { mapLeftOffsetPx } from "./constants";

describe("mapLeftOffsetPx", () => {
  it("레일과 패널은 436px, 패널을 닫으면 56px이다", () => {
    expect(mapLeftOffsetPx({ isMobile: false, isTreeOpen: false, isPanelOpen: true })).toBe(436);
    expect(mapLeftOffsetPx({ isMobile: false, isTreeOpen: false, isPanelOpen: false })).toBe(56);
  });

  it("트리와 패널은 636px, 패널을 닫으면 256px이다", () => {
    expect(mapLeftOffsetPx({ isMobile: false, isTreeOpen: true, isPanelOpen: true })).toBe(636);
    expect(mapLeftOffsetPx({ isMobile: false, isTreeOpen: true, isPanelOpen: false })).toBe(256);
  });

  it("모바일은 왼쪽 메뉴가 없어 0이다", () => {
    expect(mapLeftOffsetPx({ isMobile: true, isTreeOpen: true, isPanelOpen: true })).toBe(0);
  });
});
