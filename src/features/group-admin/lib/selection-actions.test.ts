import { describe, expect, it } from "vitest";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import { storedGroupRoleOf } from "@/features/map-marker/lib/marker-detail-rows";
import { applyOpsToMarkers } from "./group-ops";
import {
  planDeleteSelected,
  planSeparateSelected,
  planStandaloneSelected,
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
});
