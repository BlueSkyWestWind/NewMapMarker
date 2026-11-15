import { describe, expect, it } from "vitest";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import {
  buildDongGroups,
  buildSeparationLabelCounts,
  canSplitGroup,
} from "./marker-group-view";

function marker(
  overrides: Partial<EquipmentMarker> & { id: string },
): EquipmentMarker {
  return {
    name: "",
    lat: 0,
    lng: 0,
    roadAddress: "",
    jibunAddress: "",
    facilityCode: "",
    projectCode: "",
    facilityYear: "",
    businessType: "",
    finalStationName: "",
    eqClass: "",
    eqType: "",
    installDate: "",
    openDate: "",
    ...overrides,
  } as EquipmentMarker;
}

describe("buildDongGroups", () => {
  it("parentMarkerId가 있는 SUB만 동별로 묶고 dongSortKey 순으로 정렬한다", () => {
    const rep = marker({ id: "rep", finalStationName: "101동 대표" });
    const subEtc = marker({
      id: "sub-etc",
      parentMarkerId: "rep",
      finalStationName: "관리실",
      detachedVisible: false,
    });
    const sub102 = marker({
      id: "sub-102",
      parentMarkerId: "rep",
      finalStationName: "102동 1층",
      detachedVisible: true,
    });
    const sub101a = marker({
      id: "sub-101-a",
      parentMarkerId: "rep",
      finalStationName: "101동 B",
      detachedVisible: false,
    });
    const sub101b = marker({
      id: "sub-101-b",
      parentMarkerId: "rep",
      finalStationName: "101동 A",
      detachedVisible: false,
    });

    const groups = buildDongGroups([rep, subEtc, sub102, sub101a, sub101b]);
    expect(groups.map((g) => g.label)).toEqual(["101동", "102동", "기타"]);
    expect(groups[0].subs.map((s) => s.id)).toEqual(["sub-101-a", "sub-101-b"]);
    expect(groups[0].isDongShown).toBe(false);
    expect(groups[0].mapRepId).toBe("sub-101-b");

    expect(groups[1].subs.map((s) => s.id)).toEqual(["sub-102"]);
    expect(groups[1].isDongShown).toBe(true);
    expect(groups[1].mapRepId).toBe("sub-102");

    expect(groups[2].isDongShown).toBe(false);
    expect(groups[2].mapRepId).toBe("sub-etc");
  });
});

describe("buildSeparationLabelCounts", () => {
  it("대표와 SUB 전체의 분리 라벨별 개수를 dongSortKey 순으로 집계한다", () => {
    const rep = marker({ id: "rep", finalStationName: "101동 대표" });
    const sub101 = marker({
      id: "sub-101",
      parentMarkerId: "rep",
      finalStationName: "101동 2층",
    });
    const subBasement = marker({
      id: "sub-b1",
      parentMarkerId: "rep",
      finalStationName: "지하1층",
    });
    const subEtc = marker({
      id: "sub-etc",
      parentMarkerId: "rep",
      finalStationName: "경비실",
    });

    const counts = buildSeparationLabelCounts([
      subEtc,
      rep,
      subBasement,
      sub101,
    ]);
    expect(counts).toEqual([
      ["101동", 2],
      ["지하", 1],
      ["기타", 1],
    ]);
  });
});

describe("canSplitGroup", () => {
  it("분리되지 않았고 라벨이 2종 이상이면 true다", () => {
    const m1 = marker({ id: "1", finalStationName: "101동" });
    const m2 = marker({
      id: "2",
      parentMarkerId: "1",
      finalStationName: "102동",
    });
    expect(canSplitGroup([m1, m2])).toBe(true);
  });

  it("라벨이 1종뿐이면 false다", () => {
    const m1 = marker({ id: "1", finalStationName: "101동 A" });
    const m2 = marker({
      id: "2",
      parentMarkerId: "1",
      finalStationName: "101동 B",
    });
    expect(canSplitGroup([m1, m2])).toBe(false);
  });

  it("이미 분리된 그룹(groupKey 있음)이면 라벨이 2종 이상이어도 false다", () => {
    const m1 = marker({
      id: "1",
      finalStationName: "101동",
      groupKey: "split-key",
    });
    const m2 = marker({
      id: "2",
      parentMarkerId: "1",
      finalStationName: "102동",
      groupKey: "split-key",
    });
    expect(canSplitGroup([m1, m2])).toBe(false);
  });
});
