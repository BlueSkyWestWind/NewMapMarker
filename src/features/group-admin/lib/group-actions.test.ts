import { describe, expect, it } from "vitest";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import { planAssignGroup } from "./group-actions";

function marker(
  overrides: Partial<EquipmentMarker> & { id: string },
): EquipmentMarker {
  return { name: "", lat: 0, lng: 0, ...overrides } as EquipmentMarker;
}

describe("planAssignGroup", () => {
  it("기존 대표가 있으면 그 마커가 대표가 된다", () => {
    const members = [
      marker({ id: "a", createdAt: "2024-01-01", groupRole: "SUB" }),
      marker({ id: "b", createdAt: "2024-01-02", groupRole: "대표" }),
      marker({ id: "c", createdAt: "2024-01-03", groupRole: "SUB" }),
    ];
    const { ops, rep } = planAssignGroup(members, "g1");
    expect(rep?.id).toBe("b");
    expect(ops).toEqual([
      {
        type: "update",
        ids: ["b"],
        patch: {
          group_key: "g1",
          parent_marker_id: null,
          group_role: "대표",
          detached_visible: false,
        },
      },
      {
        type: "update",
        ids: ["a", "c"],
        patch: {
          group_key: "g1",
          parent_marker_id: "b",
          group_role: "SUB",
          detached_visible: false,
        },
      },
    ]);
  });

  it("preferredRepId가 기존 대표보다 우선한다", () => {
    const members = [
      marker({ id: "a", createdAt: "2024-01-01", groupRole: "대표" }),
      marker({ id: "b", createdAt: "2024-01-02" }),
    ];
    const { rep } = planAssignGroup(members, "g1", "b");
    expect(rep?.id).toBe("b");
  });

  it("대표가 없으면 createdAt이 가장 빠른 것, 동률이면 id 순", () => {
    const members = [
      marker({ id: "z", createdAt: "2024-01-01" }),
      marker({ id: "m", createdAt: "2024-01-01" }),
      marker({ id: "a", createdAt: "2024-02-01" }),
    ];
    expect(planAssignGroup(members, null).rep?.id).toBe("m");
  });

  it("1개면 단독이고 SUB 연산이 없다", () => {
    const { ops, rep } = planAssignGroup([marker({ id: "a" })], "g1");
    expect(rep?.id).toBe("a");
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      type: "update",
      ids: ["a"],
      patch: { group_role: "단독", parent_marker_id: null },
    });
  });

  it("빈 배열이면 연산이 없다", () => {
    expect(planAssignGroup([], "g1")).toEqual({ ops: [], rep: null });
  });
});
