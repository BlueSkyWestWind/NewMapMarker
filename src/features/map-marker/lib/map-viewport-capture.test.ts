import { describe, expect, it } from "vitest";
import { getA3CaptureViewportRect } from "./map-viewport-capture";

function createContainer(width: number, height: number): HTMLElement {
  return { clientWidth: width, clientHeight: height } as HTMLElement;
}

describe("getA3CaptureViewportRect", () => {
  it("가로 방향 A3 비율을 컨테이너 중앙에 맞춘다", () => {
    const rect = getA3CaptureViewportRect(
      createContainer(1200, 1000),
      "landscape",
    );

    expect(rect).toEqual({ x: 0, y: 75, width: 1200, height: 849 });
    expect(rect.width / rect.height).toBeCloseTo(420 / 297, 2);
  });

  it("세로 방향 A3 비율을 컨테이너 중앙에 맞춘다", () => {
    const rect = getA3CaptureViewportRect(
      createContainer(1200, 1000),
      "portrait",
    );

    expect(rect).toEqual({ x: 246, y: 0, width: 707, height: 1000 });
    expect(rect.width / rect.height).toBeCloseTo(297 / 420, 2);
  });
});
