import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/features/shell/types/nav";
import {
  activeMobileTab,
  filterNavTree,
  hasNavSegments,
  mobileMoreItems,
  mobileTabItems,
  segmentsOfNav,
} from "./nav-model";

describe("segmentsOfNav", () => {
  it("지도는 네 가지, 마커관리는 장비·축전지다", () => {
    expect(segmentsOfNav("map")).toEqual(["equipment", "battery", "location", "converter"]);
    expect(segmentsOfNav("markers")).toEqual(["equipment", "battery"]);
  });

  it("다른 메뉴는 하위 메뉴가 없다", () => {
    expect(segmentsOfNav("cctv")).toEqual([]);
    expect(hasNavSegments("cctv")).toBe(false);
    expect(hasNavSegments("map")).toBe(true);
  });
});

describe("모바일 메뉴", () => {
  it("로그인하면 탭 네 개와 더보기 항목 네 개로 모든 메뉴가 나뉜다", () => {
    const tabs = mobileTabItems(true, true).map((item) => item.key);
    const more = mobileMoreItems(true, true).map((item) => item.key);
    expect(tabs).toEqual(["dashboard", "map", "markers", "cctv"]);
    expect(more).toEqual(["groups", "barcode", "backup", "settings"]);
    expect([...tabs, ...more].sort()).toEqual(NAV_ITEMS.map((item) => item.key).sort());
  });

  it("관리자가 아니면 더보기에 그룹관리가 없다", () => {
    expect(mobileMoreItems(true, false).map((item) => item.key)).toEqual([
      "barcode",
      "backup",
      "settings",
    ]);
  });

  it("비로그인이면 잠긴 메뉴를 숨긴다", () => {
    expect(mobileTabItems(false).map((item) => item.key)).toEqual(["dashboard", "map", "cctv"]);
    expect(mobileMoreItems(false)).toEqual([]);
  });

  it("더보기 안의 메뉴를 보고 있으면 더보기 탭이 활성이다", () => {
    expect(activeMobileTab("map", false)).toBe("map");
    expect(activeMobileTab("barcode", false)).toBe("more");
    expect(activeMobileTab("map", true)).toBe("more");
  });
});

describe("filterNavTree", () => {
  const items = NAV_ITEMS.filter((item) => ["map", "markers", "cctv"].includes(item.key));

  it("검색어가 없으면 전체를 돌려준다", () => {
    expect(filterNavTree(items, "  ").map((n) => n.item.key)).toEqual(["map", "markers", "cctv"]);
    expect(filterNavTree(items, "").find((n) => n.item.key === "markers")?.segments).toEqual([
      "equipment",
      "battery",
    ]);
  });

  it("상위 메뉴 이름이 맞으면 하위 메뉴를 모두 남긴다", () => {
    expect(filterNavTree(items, "지도")).toEqual([
      expect.objectContaining({ segments: ["equipment", "battery", "location", "converter"] }),
    ]);
  });

  it("하위 메뉴 이름만 맞으면 그 하위 메뉴와 상위 메뉴만 남긴다", () => {
    expect(filterNavTree(items, "축전지").map((n) => [n.item.key, n.segments])).toEqual([
      ["map", ["battery"]],
      ["markers", ["battery"]],
    ]);
  });

  it("대소문자를 구분하지 않고, 맞는 것이 없으면 비운다", () => {
    expect(filterNavTree(items, "cctv").map((n) => n.item.key)).toEqual(["cctv"]);
    expect(filterNavTree(items, "없는메뉴")).toEqual([]);
  });
});
