import { describe, expect, it } from "vitest";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import { buildMarkerGroups } from "./build-groups";

function marker(
  overrides: Partial<EquipmentMarker> & { id: string },
): EquipmentMarker {
  return {
    name: overrides.id,
    lat: 35.1,
    lng: 126.8,
    roadAddress: "광주 북구 중흥동 695-6",
    jibunAddress: "",
    groupRole: "단독",
    ...overrides,
  } as EquipmentMarker;
}

describe("buildMarkerGroups", () => {
  it("같은 번지의 마커는 한 묶음으로 묶인다", () => {
    const groups = buildMarkerGroups([
      marker({ id: "a", groupRole: "대표" }),
      marker({ id: "b", groupRole: "SUB", parentMarkerId: "a" }),
      marker({ id: "c", roadAddress: "광주 북구 중흥동 700-1", groupRole: "단독" }),
    ]);
    expect(groups).toHaveLength(2);
    const big = groups.find((g) => g.markers.length === 2);
    expect(big?.markers.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("group_key가 다르면 같은 번지라도 분리된다", () => {
    const groups = buildMarkerGroups([
      marker({ id: "a", groupKey: "x#1", groupRole: "대표" }),
      marker({ id: "b", groupKey: "x#2", groupRole: "대표" }),
      marker({ id: "c", groupRole: "대표" }),
    ]);
    expect(groups.map((g) => g.key).sort()).toEqual(
      ["x#1", "x#2", "광주 북구 중흥동 695-6"].sort(),
    );
  });

  it("주소 없는 마커는 각자 묶음이 된다", () => {
    const groups = buildMarkerGroups([
      marker({ id: "a", roadAddress: "", jibunAddress: "" }),
      marker({ id: "b", roadAddress: "", jibunAddress: "" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.key).sort()).toEqual(["__solo__a", "__solo__b"]);
  });

  it("대표가 맨 앞이고 SUB가 그 뒤에 입력 순서대로 온다", () => {
    const [group] = buildMarkerGroups([
      marker({ id: "s1", groupRole: "SUB", parentMarkerId: "r" }),
      marker({ id: "r", groupRole: "대표" }),
      marker({ id: "s2", groupRole: "SUB", parentMarkerId: "r" }),
    ]);
    expect(group.representative?.id).toBe("r");
    expect(group.markers.map((m) => m.id)).toEqual(["r", "s1", "s2"]);
    expect(group.isSuspect).toBe(false);
  });

  it("대표가 없으면 부모 없는 첫 마커를, 그것도 없으면 null을 쓴다", () => {
    const [noRep] = buildMarkerGroups([
      marker({ id: "s1", groupRole: "SUB", parentMarkerId: "zz" }),
    ]);
    expect(noRep.representative).toBeNull();
  });

  it("좌표가 null이거나 0,0인 마커가 있으면 hasNoCoord", () => {
    const withNull = buildMarkerGroups([
      marker({ id: "a", groupRole: "대표" }),
      marker({
        id: "b",
        groupRole: "SUB",
        parentMarkerId: "a",
        lat: null as unknown as number,
        lng: null as unknown as number,
      }),
    ]);
    expect(withNull[0].hasNoCoord).toBe(true);

    const zero = buildMarkerGroups([marker({ id: "z", lat: 0, lng: 0 })]);
    expect(zero[0].hasNoCoord).toBe(true);

    const ok = buildMarkerGroups([marker({ id: "ok" })]);
    expect(ok[0].hasNoCoord).toBe(false);
  });

  it("모두 단독인 2개 이상 묶음은 isSuspect, 1개나 대표가 있으면 아니다", () => {
    const suspect = buildMarkerGroups([
      marker({ id: "a", groupRole: "단독" }),
      marker({ id: "b", groupRole: "단독" }),
    ]);
    expect(suspect[0].isSuspect).toBe(true);

    const single = buildMarkerGroups([marker({ id: "a", groupRole: "단독" })]);
    expect(single[0].isSuspect).toBe(false);

    const mixed = buildMarkerGroups([
      marker({ id: "a", groupRole: "대표" }),
      marker({ id: "b", groupRole: "단독" }),
    ]);
    expect(mixed[0].isSuspect).toBe(false);
  });

  it("대표 국소명 순, 같으면 키 순으로 안정 정렬한다", () => {
    const groups = buildMarkerGroups([
      marker({ id: "1", name: "다", roadAddress: "A 1", groupRole: "대표" }),
      marker({ id: "2", name: "가", roadAddress: "B 1", groupRole: "대표" }),
      marker({ id: "3", name: "가", roadAddress: "A 2", groupRole: "대표" }),
    ]);
    expect(groups.map((g) => g.markers[0].id)).toEqual(["3", "2", "1"]);
  });
});
