import { describe, expect, it } from "vitest";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type { GroupRole } from "@/features/map-marker/lib/address-group";
import { storedGroupRoleOf } from "@/features/map-marker/lib/marker-detail-rows";
import { applyOpsToMarkers } from "./group-ops";
import { planAssignGroup, planRoleChange } from "./group-actions";

function marker(
  overrides: Partial<EquipmentMarker> & { id: string },
): EquipmentMarker {
  return { name: "", lat: 0, lng: 0, ...overrides } as EquipmentMarker;
}

/** 같은 그룹(group_key "g")의 마커. groupRole·parentMarkerId는 항상 명시한다. */
function member(
  id: string,
  groupRole: "대표" | "단독" | "SUB",
  parentMarkerId?: string,
): EquipmentMarker {
  return marker({ id, name: id, groupKey: "g", groupRole, parentMarkerId });
}

/** 대표 없는 SUB(부모가 없거나 대표가 아닌 SUB)의 id 목록. */
function orphanSubs(markers: EquipmentMarker[]): string[] {
  const byId = new Map(markers.map((m) => [m.id, m]));
  return markers
    .filter((m) => storedGroupRoleOf(m) === "SUB")
    .filter((m) => {
      const parent = m.parentMarkerId ? byId.get(m.parentMarkerId) : undefined;
      return !parent || storedGroupRoleOf(parent) !== "대표";
    })
    .map((m) => m.id);
}

function run(target: EquipmentMarker, role: GroupRole, all: EquipmentMarker[]) {
  const plan = planRoleChange(target, role, all);
  const after = applyOpsToMarkers(all, plan.ops);
  expect(orphanSubs(after)).toEqual([]);
  return { ...plan, after };
}

describe("planRoleChange", () => {
  it("이미 그 구분이면 아무것도 하지 않는다", () => {
    const all = [member("r", "대표"), member("a", "SUB", "r")];
    expect(planRoleChange(all[1], "SUB", all)).toEqual({ ops: [], notice: "" });
  });

  it("① 대표를 단독으로: 남은 2개 이상이면 새 대표 승격 + 나머지 SUB", () => {
    const all = [
      member("r", "대표"),
      member("b", "SUB", "r"),
      member("a", "SUB", "r"),
      member("c", "SUB", "r"),
    ];
    const { ops, notice, after } = run(all[0], "단독", all);
    expect(ops).toEqual([
      {
        type: "update",
        ids: ["r"],
        patch: { parent_marker_id: null, group_role: "단독" },
      },
      {
        type: "update",
        ids: ["a"],
        patch: { parent_marker_id: null, group_role: "대표" },
      },
      {
        type: "update",
        ids: ["b", "c"],
        patch: { parent_marker_id: "a", group_role: "SUB" },
      },
    ]);
    expect(notice).toBe(
      "단독으로 분리했습니다. 'a'을(를) 새 대표로 지정했습니다.",
    );
    expect(after.find((m) => m.id === "a")?.groupRole).toBe("대표");
  });

  it("② 대표를 단독으로: 남은 1개면 그 1개도 단독", () => {
    const all = [member("r", "대표"), member("a", "SUB", "r")];
    const { ops, notice, after } = run(all[0], "단독", all);
    expect(ops).toEqual([
      {
        type: "update",
        ids: ["r"],
        patch: { parent_marker_id: null, group_role: "단독" },
      },
      {
        type: "update",
        ids: ["a"],
        patch: { parent_marker_id: null, group_role: "단독" },
      },
    ]);
    expect(notice).toBe(
      "단독으로 분리했습니다. 남은 1국소도 단독으로 변경했습니다.",
    );
    expect(after.every((m) => m.groupRole === "단독")).toBe(true);
  });

  it("③ 대표를 단독으로: 남은 0개면 자기만 단독", () => {
    const all = [member("r", "대표"), member("s", "단독")];
    const { ops, notice } = run(all[0], "단독", all);
    expect(ops).toEqual([
      {
        type: "update",
        ids: ["r"],
        patch: { parent_marker_id: null, group_role: "단독" },
      },
    ]);
    expect(notice).toBe("단독으로 변경했습니다. 그룹에서 분리됩니다.");
  });

  it("④ SUB를 단독으로: 자기만 단독", () => {
    const all = [
      member("r", "대표"),
      member("a", "SUB", "r"),
      member("b", "SUB", "r"),
    ];
    const { ops, notice } = run(all[1], "단독", all);
    expect(ops).toEqual([
      {
        type: "update",
        ids: ["a"],
        patch: { parent_marker_id: null, group_role: "단독" },
      },
    ]);
    expect(notice).toBe("단독으로 변경했습니다. 그룹에서 분리됩니다.");
  });

  it("대표로: 단독이 아닌 같은 번지 마커가 모두 SUB, 단독은 그대로", () => {
    const all = [
      member("r", "대표"),
      member("a", "SUB", "r"),
      member("s", "단독"),
    ];
    const { ops, notice, after } = run(all[1], "대표", all);
    expect(ops).toEqual([
      {
        type: "update",
        ids: ["a"],
        patch: { parent_marker_id: null, group_role: "대표" },
      },
      {
        type: "update",
        ids: ["r"],
        patch: { parent_marker_id: "a", group_role: "SUB" },
      },
    ]);
    expect(notice).toBe("대표로 변경했습니다. (SUB 1건)");
    expect(after.find((m) => m.id === "s")?.groupRole).toBe("단독");
  });

  it("대표로: 남은 마커가 없으면 SUB 연산이 없고 문구에 건수가 없다", () => {
    const all = [member("a", "단독"), member("s", "단독")];
    const { ops, notice } = run(all[0], "대표", all);
    expect(ops).toHaveLength(1);
    expect(notice).toBe("대표로 변경했습니다.");
  });

  it("⑤ SUB로: 현재 대표 아래로 연결", () => {
    const all = [
      member("r", "대표"),
      member("a", "SUB", "r"),
      member("s", "단독"),
    ];
    const { ops, notice } = run(all[2], "SUB", all);
    // 모달 동작 그대로: 부모 없는 단독도 wasRep으로 보아 대표를 한 번 더 확정한다.
    expect(ops).toEqual([
      {
        type: "update",
        ids: ["r"],
        patch: { parent_marker_id: null, group_role: "대표" },
      },
      {
        type: "update",
        ids: ["a"],
        patch: { parent_marker_id: "r", group_role: "SUB" },
      },
      {
        type: "update",
        ids: ["s"],
        patch: { parent_marker_id: "r", group_role: "SUB" },
      },
    ]);
    expect(notice).toBe("SUB로 변경했습니다.");
  });

  it("⑥ SUB로: 대상이 대표면 다른 마커를 승격하고 나머지를 재연결", () => {
    const all = [
      member("r", "대표"),
      member("a", "SUB", "r"),
      member("b", "SUB", "r"),
    ];
    const { ops, notice, after } = run(all[0], "SUB", all);
    expect(ops).toEqual([
      {
        type: "update",
        ids: ["a"],
        patch: { parent_marker_id: null, group_role: "대표" },
      },
      {
        type: "update",
        ids: ["b"],
        patch: { parent_marker_id: "a", group_role: "SUB" },
      },
      {
        type: "update",
        ids: ["r"],
        patch: { parent_marker_id: "a", group_role: "SUB" },
      },
    ]);
    expect(notice).toBe("SUB로 변경했습니다.");
    expect(after.find((m) => m.id === "r")?.parentMarkerId).toBe("a");
  });

  it("⑦ SUB로: 연결할 대표가 없으면 단독", () => {
    const all = [member("r", "대표"), member("s", "단독")];
    const { ops, notice, after } = run(all[0], "SUB", all);
    expect(ops).toEqual([
      {
        type: "update",
        ids: ["r"],
        patch: { parent_marker_id: null, group_role: "단독" },
      },
    ]);
    expect(notice).toBe(
      "같은 번지에 연결할 대표가 없어 단독으로 설정했습니다.",
    );
    expect(after.find((m) => m.id === "r")?.groupRole).toBe("단독");
  });

  it("검사 자체가 헛돌지 않는다: 부모 없는 SUB를 실제로 잡아낸다", () => {
    expect(orphanSubs([member("a", "SUB", "ghost")])).toEqual(["a"]);
    expect(
      orphanSubs([member("x", "단독"), member("a", "SUB", "x")]),
    ).toEqual(["a"]);
  });
});

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
      marker({ id: "z", createdAt: "2024-01-01", groupRole: "SUB" }),
      marker({ id: "m", createdAt: "2024-01-01", groupRole: "SUB" }),
      marker({ id: "a", createdAt: "2024-02-01", groupRole: "SUB" }),
    ];
    expect(planAssignGroup(members, null).rep?.id).toBe("m");
  });

  it("대표가 여러 명이면 그중 가장 빠른 것이 대표가 된다", () => {
    const members = [
      marker({ id: "a", createdAt: "2024-01-01", groupRole: "SUB" }),
      marker({ id: "c", createdAt: "2024-03-01", groupRole: "대표" }),
      marker({ id: "b", createdAt: "2024-02-01", groupRole: "대표" }),
    ];
    expect(planAssignGroup(members, null).rep?.id).toBe("b");
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
