import { describe, expect, it } from "vitest";
import { getMarkerColorLabel } from "@/features/map-marker/lib/marker-svg";

describe("getMarkerColorLabel", () => {
  it("장비 모드에서는 팀 색상과 겹치는 hex라도 범용 색상명을 쓴다", () => {
    // #84cc16(라임)은 장비 색상 팔레트와 축전지 3팀 색상이 우연히 같다.
    expect(getMarkerColorLabel("#84cc16", "equipment")).toBe("라임");
  });

  it("축전지 모드에서는 팀 색상 hex를 담당팀 이름으로 표시한다", () => {
    expect(getMarkerColorLabel("#84cc16", "battery")).toBe("3팀(정종연)");
  });

  it("팀 색상이 아닌 hex는 축전지 모드에서도 범용 색상명을 쓴다", () => {
    expect(getMarkerColorLabel("#10b981", "battery")).toBe("에메랄드");
  });
});
