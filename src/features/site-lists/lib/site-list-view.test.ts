import { describe, expect, it } from "vitest";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type { SiteList, SiteListMember } from "@/features/site-lists/types";
import {
  buildSiteListBadges,
  canEditSiteList,
  isSiteListsTableMissing,
  listsOfMarker,
  planSiteListRestore,
  searchEquipmentSites,
  SITE_LIST_COLORS,
} from "./site-list-view";

const list = (id: string, color = "#111111", isAdminList = false): SiteList => ({
  id,
  name: `목록${id}`,
  color,
  isAdminList,
});

const member = (listId: string, markerId: string): SiteListMember => ({ listId, markerId });

const equipment = (over: Partial<EquipmentMarker>) =>
  ({
    id: "m",
    name: "",
    finalStationName: "",
    facilityCode: "",
    projectCode: "",
    businessType: "",
    roadAddress: "",
    jibunAddress: "",
    ...over,
  }) as EquipmentMarker;

describe("SITE_LIST_COLORS", () => {
  it("중복 없는 15색이다", () => {
    expect(new Set(SITE_LIST_COLORS).size).toBe(15);
  });
});

describe("buildSiteListBadges", () => {
  const lists = [list("a", "#aaaaaa"), list("b", "#bbbbbb"), list("c", "#cccccc"), list("d", "#dddddd"), list("e", "#eeeeee")];

  it("선택한 목록에 속한 국소만 담고, 같은 국소는 하나로 모은다", () => {
    const badges = buildSiteListBadges(lists, [member("a", "m1"), member("b", "m1"), member("c", "m2")], ["a", "b"]);
    expect([...badges.keys()]).toEqual(["m1"]);
    expect(badges.get("m1")).toEqual({ colors: ["#aaaaaa", "#bbbbbb"], extraCount: 0 });
  });

  it("색상은 최대 3개이고 나머지는 개수로 준다", () => {
    const all = ["a", "b", "c", "d", "e"];
    const badges = buildSiteListBadges(lists, all.map((id) => member(id, "m1")), all);
    expect(badges.get("m1")).toEqual({
      colors: ["#aaaaaa", "#bbbbbb", "#cccccc"],
      extraCount: 2,
    });
  });

  it("목록 순서를 따르고, 선택이 없으면 비어 있다", () => {
    expect(buildSiteListBadges(lists, [member("c", "m1"), member("a", "m1")], ["c", "a"]).get("m1")?.colors).toEqual(["#aaaaaa", "#cccccc"]);
    expect(buildSiteListBadges(lists, [member("a", "m1")], []).size).toBe(0);
  });

  it("없어진 목록의 소속과 선택은 무시한다", () => {
    expect(buildSiteListBadges(lists, [member("zzz", "m1")], ["zzz"]).size).toBe(0);
  });
});

describe("listsOfMarker", () => {
  it("선택과 상관없이 전체 소속 목록을 준다", () => {
    const lists = [list("a"), list("b"), list("c")];
    expect(listsOfMarker("m1", lists, [member("c", "m1"), member("a", "m1"), member("b", "m2")]).map((l) => l.id)).toEqual(["a", "c"]);
  });
});

describe("canEditSiteList", () => {
  it("일반 목록은 모두, 관리자 목록은 관리자만 수정한다", () => {
    expect(canEditSiteList(list("a"), false)).toBe(true);
    expect(canEditSiteList(list("a", "#111111", true), false)).toBe(false);
    expect(canEditSiteList(list("a", "#111111", true), true)).toBe(true);
  });
});

describe("searchEquipmentSites", () => {
  const sites = [
    equipment({ id: "1", name: "운암국소", facilityCode: "2026Y1", projectCode: "E.M267", businessType: "신규", jibunAddress: "광주 북구 운암동 1" }),
    equipment({ id: "2", name: "두암국소", finalStationName: "두암최종", roadAddress: "광주 북구 서방로 2" }),
  ];
  const ids = (query: string) => searchEquipmentSites(sites, query).map((s) => s.id);

  it("국소명, 최종 국소명, 코드, 사업구분, 주소로 찾는다", () => {
    expect(ids("운암국")).toEqual(["1"]);
    expect(ids("두암최종")).toEqual(["2"]);
    expect(ids("2026y1")).toEqual(["1"]);
    expect(ids("e.m267")).toEqual(["1"]);
    expect(ids("신규")).toEqual(["1"]);
    expect(ids("서방로")).toEqual(["2"]);
    expect(ids("운암동")).toEqual(["1"]);
  });

  it("공백을 무시하고, 빈 검색어는 결과가 없다", () => {
    expect(ids("광주 북구 운암동")).toEqual(["1"]);
    expect(ids("광주북구운암동")).toEqual(["1"]);
    expect(ids("  ")).toEqual([]);
  });
});

describe("planSiteListRestore", () => {
  const data = {
    lists: [
      { id: "a", name: "일반", color: "#111111", is_admin_list: false },
      { id: "b", name: "관리자", color: "#222222", is_admin_list: true },
    ],
    members: [
      { list_id: "a", marker_id: "m1" },
      { list_id: "b", marker_id: "m2" },
      { list_id: "없음", marker_id: "m3" },
    ],
  };

  it("관리자는 전부 되살린다", () => {
    const plan = planSiteListRestore(data, true);
    expect(plan.lists.map((l) => l.id)).toEqual(["a", "b"]);
    expect(plan.members.map((m) => m.marker_id)).toEqual(["m1", "m2"]);
  });

  it("일반 사용자는 일반 목록만 되살린다", () => {
    const plan = planSiteListRestore(data, false);
    expect(plan.lists.map((l) => l.id)).toEqual(["a"]);
    expect(plan.members.map((m) => m.marker_id)).toEqual(["m1"]);
  });
});

describe("isSiteListsTableMissing", () => {
  it("테이블이 없다는 오류만 참이다", () => {
    expect(isSiteListsTableMissing({ code: "PGRST205" })).toBe(true);
    expect(isSiteListsTableMissing({ code: "42P01" })).toBe(true);
    expect(isSiteListsTableMissing({ code: "42501" })).toBe(false);
    expect(isSiteListsTableMissing(null)).toBe(false);
  });
});
