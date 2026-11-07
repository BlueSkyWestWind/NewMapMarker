import { describe, expect, it } from "vitest";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type { GroupFilters, MarkerGroup } from "../types";
import { filterGroups } from "./group-filters";

const NONE: GroupFilters = {
  query: "",
  years: [],
  statuses: [],
  businesses: [],
  onlyNoCoord: false,
  onlySuspect: false,
};

function marker(
  overrides: Partial<EquipmentMarker> & { id: string },
): EquipmentMarker {
  return {
    name: overrides.id,
    lat: 35.1,
    lng: 126.8,
    roadAddress: "",
    jibunAddress: "",
    facilityCode: "",
    projectCode: "",
    facilityYear: "2025",
    businessType: "LTE",
    finalStationName: "",
    groupRole: "대표",
    ...overrides,
  } as EquipmentMarker;
}

function group(
  key: string,
  markers: EquipmentMarker[],
  extra: Partial<MarkerGroup> = {},
): MarkerGroup {
  return {
    key,
    lotAddress: key,
    markers,
    representative: markers[0] ?? null,
    hasNoCoord: false,
    isSuspect: false,
    ...extra,
  };
}

const g1 = group("g1", [
  marker({ id: "a", name: "중흥국소", facilityCode: "F-100", facilityYear: "2024", businessType: "5G", facilityStatus: "개통완료" }),
  marker({ id: "a2", name: "서브하나", groupRole: "SUB", parentMarkerId: "a", facilityYear: "2024", businessType: "5G", facilityStatus: "개통완료" }),
]);
const g2 = group(
  "g2",
  [marker({ id: "b", name: "운암국소", facilityCode: "F-200", projectCode: "P-9", facilityYear: "2025", businessType: "LTE", facilityStatus: "시설" })],
  { hasNoCoord: true },
);
const g3 = group(
  "g3",
  [marker({ id: "c", name: "첨단국소", facilityCode: "F-300", groupRole: "단독" }), marker({ id: "d", name: "첨단B", groupRole: "단독" })],
  { isSuspect: true },
);
const ALL = [g1, g2, g3];

describe("filterGroups", () => {
  it("빈 필터는 전체를 돌려준다", () => {
    expect(filterGroups(ALL, NONE)).toEqual(ALL);
  });

  it("검색어가 SUB 이름에만 맞아도 묶음이 남는다", () => {
    const out = filterGroups(ALL, { ...NONE, query: "서브하나" });
    expect(out.map((g) => g.key)).toEqual(["g1"]);
  });

  it("공백 검색어는 필터하지 않고, 공백을 무시해 찾는다", () => {
    expect(filterGroups(ALL, { ...NONE, query: "   " })).toHaveLength(3);
    expect(filterGroups(ALL, { ...NONE, query: "운 암 국소" }).map((g) => g.key)).toEqual(["g2"]);
  });

  it("코드 여러 개를 붙여 넣으면 각각에 맞는 묶음이 남는다", () => {
    const out = filterGroups(ALL, { ...NONE, query: "F-100\nF-300" });
    expect(out.map((g) => g.key)).toEqual(["g1", "g3"]);
  });

  it("연도 필터", () => {
    expect(filterGroups(ALL, { ...NONE, years: ["2024"] }).map((g) => g.key)).toEqual(["g1"]);
  });

  it("상태 필터", () => {
    expect(filterGroups(ALL, { ...NONE, statuses: ["시설"] }).map((g) => g.key)).toEqual(["g2"]);
  });

  it("사업구분 필터", () => {
    expect(filterGroups(ALL, { ...NONE, businesses: ["5G"] }).map((g) => g.key)).toEqual(["g1"]);
  });

  it("onlyNoCoord와 onlySuspect", () => {
    expect(filterGroups(ALL, { ...NONE, onlyNoCoord: true }).map((g) => g.key)).toEqual(["g2"]);
    expect(filterGroups(ALL, { ...NONE, onlySuspect: true }).map((g) => g.key)).toEqual(["g3"]);
  });

  it("조건은 모두 만족해야 한다", () => {
    expect(filterGroups(ALL, { ...NONE, years: ["2025"], onlyNoCoord: true, businesses: ["5G"] })).toEqual([]);
  });
});
