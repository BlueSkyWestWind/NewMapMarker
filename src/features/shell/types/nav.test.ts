import { describe, expect, it } from "vitest";
import { isNavAccessible, visibleNavItems } from "./nav";

describe("관리자 전용 메뉴", () => {
  it("계정설정은 관리자에게만 보인다", () => {
    expect(visibleNavItems(true, false).some((item) => item.key === "accounts")).toBe(false);
    expect(visibleNavItems(true, true).some((item) => item.key === "accounts")).toBe(true);
    expect(visibleNavItems(true).some((item) => item.key === "accounts")).toBe(false);
  });

  it("비로그인이면 관리자 여부와 관계없이 접근할 수 없다", () => {
    expect(isNavAccessible("accounts", true, false)).toBe(false);
    expect(isNavAccessible("accounts", true, true)).toBe(true);
    expect(isNavAccessible("accounts", false, true)).toBe(false);
  });

  it("계정설정은 설정 바로 다음 위치에 있다", () => {
    const keys = visibleNavItems(true, true).map((item) => item.key);
    expect(keys.indexOf("accounts")).toBe(keys.indexOf("settings") + 1);
  });

  it("일반 메뉴는 관리자 여부에 영향받지 않는다", () => {
    expect(isNavAccessible("markers", true, false)).toBe(true);
    expect(isNavAccessible("dashboard", false, false)).toBe(true);
  });
});

describe("일정관리 메뉴", () => {
  it("로그인한 사용자에게는 관리자 여부와 상관없이 보이고 비로그인에게는 숨는다", () => {
    expect(visibleNavItems(true, false).some((item) => item.key === "schedule")).toBe(true);
    expect(visibleNavItems(true, true).some((item) => item.key === "schedule")).toBe(true);
    expect(visibleNavItems(false).some((item) => item.key === "schedule")).toBe(false);
    expect(isNavAccessible("schedule", true, false)).toBe(true);
    expect(isNavAccessible("schedule", false, false)).toBe(false);
  });

  it("마커관리 바로 다음, 바코드/QR 바로 앞에 있다", () => {
    const keys = visibleNavItems(true, true).map((item) => item.key);
    expect(keys.indexOf("schedule")).toBe(keys.indexOf("markers") + 1);
    expect(keys.indexOf("barcode")).toBe(keys.indexOf("schedule") + 1);
  });
});
