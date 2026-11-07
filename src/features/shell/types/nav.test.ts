import { describe, expect, it } from "vitest";
import { isNavAccessible, visibleNavItems } from "./nav";

describe("관리자 전용 메뉴", () => {
  it("그룹관리는 관리자에게만 보인다", () => {
    expect(visibleNavItems(true, false).some((item) => item.key === "groups")).toBe(false);
    expect(visibleNavItems(true, true).some((item) => item.key === "groups")).toBe(true);
    expect(visibleNavItems(true).some((item) => item.key === "groups")).toBe(false);
  });

  it("비로그인이면 관리자 여부와 관계없이 접근할 수 없다", () => {
    expect(isNavAccessible("groups", true, false)).toBe(false);
    expect(isNavAccessible("groups", true, true)).toBe(true);
    expect(isNavAccessible("groups", false, true)).toBe(false);
  });

  it("일반 메뉴는 관리자 여부에 영향받지 않는다", () => {
    expect(isNavAccessible("markers", true, false)).toBe(true);
    expect(isNavAccessible("dashboard", false, false)).toBe(true);
  });
});
