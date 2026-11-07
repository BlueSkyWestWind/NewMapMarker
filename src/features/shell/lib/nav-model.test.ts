import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/features/shell/types/nav";
import {
  activeMobileTab,
  filterNavTree,
  hasNavSegments,
  initialPanelStep,
  isPanelVisible,
  isSubActive,
  mobileMoreItems,
  mobileTabItems,
  segmentsOfNav,
  showsMarkerSummary,
  subLabelOf,
} from "./nav-model";

describe("segmentsOfNav", () => {
  it("지도는 네 가지, 마커관리는 장비·축전지다", () => {
    expect(segmentsOfNav("map")).toEqual(["equipment", "battery", "location", "converter"]);
    expect(segmentsOfNav("markers")).toEqual(["equipment", "battery"]);
  });

  it("일정관리는 시설일정 하나를 가진다", () => {
    expect(segmentsOfNav("schedule")).toEqual(["facility"]);
    expect(hasNavSegments("schedule")).toBe(true);
  });

  it("다른 메뉴는 하위 메뉴가 없다", () => {
    expect(segmentsOfNav("cctv")).toEqual([]);
    expect(hasNavSegments("cctv")).toBe(false);
    expect(hasNavSegments("map")).toBe(true);
  });
});

describe("모바일 메뉴", () => {
  it("로그인하면 탭 네 개와 더보기 항목 여섯 개로 모든 메뉴가 나뉜다", () => {
    const tabs = mobileTabItems(true, true).map((item) => item.key);
    const more = mobileMoreItems(true, true).map((item) => item.key);
    expect(tabs).toEqual(["dashboard", "map", "markers", "cctv"]);
    expect(more).toEqual(["schedule", "groups", "barcode", "backup", "settings", "accounts"]);
    expect([...tabs, ...more].sort()).toEqual(NAV_ITEMS.map((item) => item.key).sort());
  });

  it("관리자가 아니면 더보기에 그룹관리·계정설정이 없고 일정관리는 있다", () => {
    expect(mobileMoreItems(true, false).map((item) => item.key)).toEqual([
      "schedule",
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

describe("일정관리 하위 메뉴", () => {
  it("시설일정으로 검색하면 일정관리와 시설일정만 남는다", () => {
    expect(filterNavTree(NAV_ITEMS, "시설").map((n) => [n.item.key, n.segments])).toEqual([
      ["schedule", ["facility"]],
    ]);
  });

  it("일정으로 검색하면 일정관리 노드가 시설일정을 모두 가진다", () => {
    const node = filterNavTree(NAV_ITEMS, "일정").find((n) => n.item.key === "schedule");
    expect(node?.segments).toEqual(["facility"]);
  });
});

describe("isSubActive", () => {
  it("일정관리는 지도 세그먼트와 무관하게 시설일정이 활성이다", () => {
    expect(isSubActive("schedule", "facility", "equipment")).toBe(true);
    expect(isSubActive("schedule", "facility", "battery")).toBe(true);
  });

  it("지도·마커관리는 현재 세그먼트와 같은 항목만 활성이다", () => {
    expect(isSubActive("map", "battery", "battery")).toBe(true);
    expect(isSubActive("map", "battery", "equipment")).toBe(false);
  });
});

describe("subLabelOf", () => {
  it("일정관리는 시설일정, 그 밖은 현재 세그먼트 이름이다", () => {
    expect(subLabelOf("schedule", "equipment")).toBe("시설일정");
    expect(subLabelOf("map", "battery")).toBe("축전지");
    expect(subLabelOf("map", "location")).toBe("이벤트관리");
  });
});

describe("showsMarkerSummary", () => {
  it("지도·마커관리의 변환기가 아닌 세그먼트에서만 마커 건수 요약을 보인다", () => {
    expect(showsMarkerSummary("map", "equipment")).toBe(true);
    expect(showsMarkerSummary("markers", "battery")).toBe(true);
    expect(showsMarkerSummary("map", "converter")).toBe(false);
  });

  it("하위 메뉴가 없거나 일정관리면 보이지 않는다", () => {
    expect(showsMarkerSummary("schedule", "equipment")).toBe(false);
    expect(showsMarkerSummary("cctv", "equipment")).toBe(false);
  });
});

describe("initialPanelStep", () => {
  it("하위 메뉴가 있는 지도·마커관리는 첫 단계(root)로 시작한다", () => {
    expect(initialPanelStep("map")).toBe("root");
    expect(initialPanelStep("markers")).toBe("root");
  });

  it("일정관리는 하위 메뉴가 하나뿐이라 바로 상세 단계다", () => {
    expect(initialPanelStep("schedule")).toBe("detail");
  });

  it("하위 메뉴가 없는 메뉴는 상세 단계다", () => {
    expect(initialPanelStep("cctv")).toBe("detail");
  });
});

describe("isPanelVisible", () => {
  const base = { isSidebarOpen: true, isTreeOpen: false, panelStep: "root" as const };

  it("일정관리와 계정설정은 지도·패널 없이 화면 전체를 쓰므로 패널이 없다", () => {
    expect(isPanelVisible({ ...base, activeNav: "schedule" })).toBe(false);
    expect(isPanelVisible({ ...base, activeNav: "schedule", panelStep: "detail" })).toBe(false);
    expect(isPanelVisible({ ...base, activeNav: "schedule", isTreeOpen: true, panelStep: "detail" })).toBe(false);
    expect(isPanelVisible({ ...base, activeNav: "accounts" })).toBe(false);
    expect(isPanelVisible({ ...base, activeNav: "accounts", panelStep: "detail" })).toBe(false);
    expect(isPanelVisible({ ...base, activeNav: "accounts", isTreeOpen: true, panelStep: "detail" })).toBe(false);
  });

  it("레일 모드에서 사이드바가 열려 있으면 패널이 보인다", () => {
    expect(isPanelVisible({ ...base, activeNav: "map" })).toBe(true);
    expect(isPanelVisible({ ...base, activeNav: "map", isSidebarOpen: false })).toBe(false);
  });

  it("트리 모드에서는 하위 메뉴 첫 단계를 트리가 대신하므로 상세 단계에서만 보인다", () => {
    expect(isPanelVisible({ ...base, activeNav: "map", isTreeOpen: true })).toBe(false);
    expect(isPanelVisible({ ...base, activeNav: "map", isTreeOpen: true, panelStep: "detail" })).toBe(true);
  });

  it("하위 메뉴가 없는 메뉴는 트리 모드에서도 패널이 보인다", () => {
    expect(isPanelVisible({ ...base, activeNav: "cctv", isTreeOpen: true })).toBe(true);
  });
});
