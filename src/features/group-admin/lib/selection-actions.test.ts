import { describe, expect, it } from "vitest";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import { storedGroupRoleOf } from "@/features/map-marker/lib/marker-detail-rows";
import { buildMarkerGroups } from "./build-groups";
import { applyOpsToMarkers } from "./group-ops";
import {
  planDeleteSelected,
  planSeparateSelected,
  planStandaloneSelected,
  planSubSelected,
} from "./selection-actions";

function m(
  id: string,
  groupRole: "대표" | "단독" | "SUB",
  parentMarkerId?: string,
  name = id,
): EquipmentMarker {
  return {
    id,
    name,
    lat: 0,
    lng: 0,
    groupKey: "g",
    groupRole,
    parentMarkerId,
  } as EquipmentMarker;
}

const group = [
  m("r", "대표"),
  m("s1", "SUB", "r"),
  m("s2", "SUB", "r"),
];

describe("planDeleteSelected", () => {
  it("대표를 지우면 남은 마커 중 새 대표를 미리 알려 준다", () => {
    const plan = planDeleteSelected([group[0]], group);
    expect(plan.newRepresentatives.map((x) => x.id)).toEqual(["s1"]);
    const after = applyOpsToMarkers(group, plan.ops);
    expect(after.map((x) => x.id)).toEqual(["s1", "s2"]);
    expect(storedGroupRoleOf(after[0])).toBe("대표");
  });

  it("SUB만 지우면 새 대표가 없다", () => {
    expect(planDeleteSelected([group[1]], group).newRepresentatives).toEqual([]);
  });

  it("삭제 연산이 마지막에 온다", () => {
    const plan = planDeleteSelected([group[0]], group);
    expect(plan.ops[plan.ops.length - 1].type).toBe("delete");
  });
});

describe("planStandaloneSelected", () => {
  it("여러 마커를 앞 변경 위에 이어서 단독으로 만든다", () => {
    const plan = planStandaloneSelected([group[1], group[2]], group);
    const after = applyOpsToMarkers(group, plan.ops);
    expect(after.filter((x) => storedGroupRoleOf(x) === "단독").map((x) => x.id).sort()).toEqual(
      ["s1", "s2"],
    );
    expect(storedGroupRoleOf(after.find((x) => x.id === "r")!)).toBe("대표");
  });

  it("이미 단독이면 아무것도 하지 않는다", () => {
    const solo = [m("a", "단독")];
    expect(planStandaloneSelected(solo, solo).ops).toEqual([]);
  });
});

describe("planSubSelected", () => {
  const withStandalone = [...group, m("x", "단독")];

  it("같은 묶음의 단독 마커를 현재 대표 아래 SUB로 바꾼다", () => {
    const plan = planSubSelected([withStandalone[3]], withStandalone);
    const after = applyOpsToMarkers(withStandalone, plan.ops);
    const x = after.find((item) => item.id === "x")!;
    expect(storedGroupRoleOf(x)).toBe("SUB");
    expect(x.parentMarkerId).toBe("r");
    expect(storedGroupRoleOf(after.find((item) => item.id === "r")!)).toBe("대표");
  });

  it("대표를 SUB로 바꾸면 남은 마커 중 하나가 새 대표가 되고 나머지는 그 아래로 간다", () => {
    const plan = planSubSelected([group[0]], group);
    const after = applyOpsToMarkers(group, plan.ops);
    expect(storedGroupRoleOf(after.find((item) => item.id === "s1")!)).toBe("대표");
    expect(after.find((item) => item.id === "r")!.parentMarkerId).toBe("s1");
    expect(after.find((item) => item.id === "s2")!.parentMarkerId).toBe("s1");
  });

  it("여러 마커를 앞 변경 위에 이어서 SUB로 바꾼다", () => {
    const solos = [m("r", "대표"), m("a", "단독"), m("b", "단독")];
    const plan = planSubSelected([solos[1], solos[2]], solos);
    const after = applyOpsToMarkers(solos, plan.ops);
    expect(after.filter((x) => storedGroupRoleOf(x) === "SUB").map((x) => x.id).sort()).toEqual([
      "a",
      "b",
    ]);
    expect(after.every((x) => x.id === "r" || x.parentMarkerId === "r")).toBe(true);
  });

  it("이미 SUB면 아무것도 하지 않는다", () => {
    expect(planSubSelected([group[1]], group).ops).toEqual([]);
  });
});

describe("planSeparateSelected", () => {
  it("선택 마커를 새 group_key로 분리한다", () => {
    const plan = planSeparateSelected([group[1], group[2]], group);
    expect(plan.newKey).not.toBe("");
    const after = applyOpsToMarkers(group, plan.ops);
    const keys = new Set(after.filter((x) => x.id !== "r").map((x) => x.groupKey));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe(plan.newKey);
    expect(after.find((x) => x.id === "r")!.groupKey).toBe("g");
  });

  it("선택이 없으면 빈 계획", () => {
    expect(planSeparateSelected([], group).ops).toEqual([]);
  });

  it("선택이 여러 묶음에 걸치면 묶음마다 남은 마커의 대표를 다시 정한다", () => {
    // 앞서 쌓인 분리로 s1·s2가 "k" 묶음(s1 대표)이 된 뒤, r과 s1을 함께 분리한다.
    const working = [
      m("r", "대표"),
      { ...m("s1", "대표"), groupKey: "k" },
      { ...m("s2", "SUB", "s1"), groupKey: "k" },
      m("s3", "SUB", "r"),
    ];
    const plan = planSeparateSelected([working[0], working[1]], working);
    const after = applyOpsToMarkers(working, plan.ops);
    const byId = new Map(after.map((x) => [x.id, x]));
    const orphans = after
      .filter((x) => storedGroupRoleOf(x) === "SUB")
      .filter((x) => {
        const parent = x.parentMarkerId ? byId.get(x.parentMarkerId) : undefined;
        return !parent || storedGroupRoleOf(parent) !== "대표";
      })
      .map((x) => x.id);
    expect(orphans).toEqual([]);
    expect(byId.get("s2")?.groupKey).toBe("k");
    expect(byId.get("s3")?.groupKey).toBe("g");
  });
});

describe("planStandaloneSelected — 목록에서도 각각 따로 보인다", () => {
  const at = (id: string, role: "대표" | "단독" | "SUB", parent?: string, key = "k#기타#erp_2026") =>
    ({
      ...m(id, role, parent),
      groupKey: key,
      roadAddress: "전남 광양시 금호동 631번지",
    }) as EquipmentMarker;

  it("대표·SUB 두 마커를 모두 단독으로 하면 목록에 각각 한 줄씩 나온다", () => {
    const pair = [at("r", "대표"), at("s", "SUB", "r")];
    const plan = planStandaloneSelected(pair, pair);
    const after = applyOpsToMarkers(pair, plan.ops);
    expect(after.every((x) => storedGroupRoleOf(x) === "단독")).toBe(true);
    expect(buildMarkerGroups(after)).toHaveLength(2);
  });

  it("이미 단독이지만 같은 키로 한 묶음처럼 보이는 마커도 각각으로 떼어 낸다", () => {
    const solos = [at("a", "단독"), at("b", "단독")];
    expect(buildMarkerGroups(solos)).toHaveLength(1);
    const plan = planStandaloneSelected(solos, solos);
    expect(plan.ops.length).toBeGreaterThan(0);
    expect(buildMarkerGroups(applyOpsToMarkers(solos, plan.ops))).toHaveLength(2);
  });

  it("떼어 낸 마커의 키는 마커마다 다르다(공정 ID 앞부분이 같아도)", () => {
    const solos = [at("erp_202631040", "단독"), at("erp_202631092", "단독")];
    const after = applyOpsToMarkers(solos, planStandaloneSelected(solos, solos).ops);
    expect(new Set(after.map((x) => x.groupKey)).size).toBe(2);
  });

  it("묶음의 일부만 단독으로 하면 나머지는 그 묶음에 남는다", () => {
    const trio = [at("r", "대표"), at("s1", "SUB", "r"), at("s2", "SUB", "r")];
    const after = applyOpsToMarkers(trio, planStandaloneSelected([trio[2]], trio).ops);
    const groups = buildMarkerGroups(after);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.markers.length === 2)?.markers.map((x) => x.id).sort()).toEqual(["r", "s1"]);
  });
});
