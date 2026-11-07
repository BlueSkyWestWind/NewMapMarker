import { describe, expect, it } from "vitest";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type { GroupRole } from "@/features/map-marker/lib/address-group";
import { storedGroupRoleOf } from "@/features/map-marker/lib/marker-detail-rows";
import { applyOpsToMarkers } from "./group-ops";
import {
  planAssignGroup,
  planDelete,
  planMergeGroups,
  planMergeSplitToLot,
  planRoleChange,
  planSeparate,
} from "./group-actions";

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

/** 번지·그룹키·역할·생성일을 명시한 마커. 역할은 항상 명시한다. */
function lotMember(
  id: string,
  groupRole: "대표" | "단독" | "SUB",
  opts: {
    parent?: string;
    groupKey?: string;
    addr?: string;
    createdAt?: string;
  } = {},
): EquipmentMarker {
  return marker({
    id,
    name: id,
    groupRole,
    parentMarkerId: opts.parent,
    groupKey: opts.groupKey,
    roadAddress: opts.addr ?? "서울특별시 강남구 역삼동 100-1",
    createdAt: opts.createdAt ?? id,
  });
}

describe("planSeparate", () => {
  const lot = [
    lotMember("r", "대표"),
    lotMember("a", "SUB", { parent: "r" }),
    lotMember("b", "SUB", { parent: "r" }),
    lotMember("c", "SUB", { parent: "r" }),
  ];

  it("새 키는 lot#라벨#시드 형식이고, 남은 묶음 연산이 분리 묶음 연산보다 앞선다", () => {
    const targets = [lot[0], lot[1]];
    const remaining = [lot[2], lot[3]];
    const { ops, newKey } = planSeparate(targets, remaining, "지하", "a");
    expect(newKey).toMatch(/^.+#지하#r$/);
    expect(ops).toEqual([
      ...planAssignGroup(remaining, null).ops,
      ...planAssignGroup(targets, newKey, "a").ops,
    ]);
    expect(ops[0]).toMatchObject({ ids: ["b"], patch: { group_key: null } });
    const after = applyOpsToMarkers(lot, ops);
    expect(orphanSubs(after)).toEqual([]);
    expect(after.find((m) => m.id === "a")?.groupRole).toBe("대표");
    expect(after.find((m) => m.id === "r")?.parentMarkerId).toBe("a");
    expect(after.find((m) => m.id === "r")?.groupKey).toBe(newKey);
    expect(after.find((m) => m.id === "c")?.parentMarkerId).toBe("b");
  });

  it("남은 것이 1개면 단독", () => {
    const { ops, newKey } = planSeparate(
      [lot[0], lot[1], lot[2]],
      [lot[3]],
      "지하",
    );
    const after = applyOpsToMarkers(lot, ops);
    expect(orphanSubs(after)).toEqual([]);
    expect(after.find((m) => m.id === "c")?.groupRole).toBe("단독");
    expect(newKey).toContain("#지하#");
  });

  it("남은 마커가 없으면 분리 묶음 연산만", () => {
    const { ops, newKey } = planSeparate(lot, [], "동");
    expect(ops).toEqual(planAssignGroup(lot, newKey).ops);
    expect(orphanSubs(applyOpsToMarkers(lot, ops))).toEqual([]);
  });

  it("주소가 없으면 lot 키를 쓴다", () => {
    const noAddr = [marker({ id: "x", groupRole: "대표" })];
    expect(planSeparate(noAddr, [], "동").newKey).toBe("lot#동#x");
  });
});

describe("planMergeSplitToLot", () => {
  it("group_key를 null로 되돌리고 번지 전체를 한 묶음으로 만든다", () => {
    const all = [
      lotMember("s1", "대표", { groupKey: "k#지하#s1" }),
      lotMember("s2", "SUB", { parent: "s1", groupKey: "k#지하#s1" }),
      lotMember("r", "대표", { createdAt: "0" }),
      lotMember("a", "SUB", { parent: "r", createdAt: "1" }),
      lotMember("o", "대표", { groupKey: "다른#분리#o" }),
      lotMember("z", "대표", { addr: "부산광역시 해운대구 우동 9-9" }),
    ];
    const { ops } = planMergeSplitToLot([all[0], all[1]], all);
    expect(ops[0]).toEqual({
      type: "update",
      ids: ["s1", "s2"],
      patch: { group_key: null },
    });
    const after = applyOpsToMarkers(all, ops);
    expect(orphanSubs(after)).toEqual([]);
    const by = (id: string) => after.find((m) => m.id === id)!;
    expect(by("s1").groupKey).toBeNull();
    expect(by("r").groupRole).toBe("대표");
    expect(by("s1").parentMarkerId).toBe("r");
    expect(by("s2").parentMarkerId).toBe("r");
    expect(by("a").parentMarkerId).toBe("r");
    // 다른 분리 묶음·다른 번지는 건드리지 않는다.
    expect(by("o").groupKey).toBe("다른#분리#o");
    expect(by("z").groupRole).toBe("대표");
    expect(by("z").parentMarkerId).toBeUndefined();
  });

  it("번지를 알 수 없으면 되돌린 멤버만 정리한다", () => {
    const all = [
      marker({ id: "a", groupKey: "k", groupRole: "대표" }),
      marker({ id: "b", groupKey: "k", groupRole: "SUB", parentMarkerId: "a" }),
      marker({ id: "c", groupRole: "대표" }),
    ];
    const { ops } = planMergeSplitToLot([all[0], all[1]], all);
    const after = applyOpsToMarkers(all, ops);
    expect(orphanSubs(after)).toEqual([]);
    expect(after.find((m) => m.id === "c")?.parentMarkerId).toBeUndefined();
  });

  it("분리 멤버가 없으면 연산이 없다", () => {
    expect(planMergeSplitToLot([], [])).toEqual({ ops: [] });
  });

  it("다른 번지에서 합쳐진 멤버는 각자 자기 번지 묶음으로 돌아간다(합치기 → 분리 해제 → 삭제)", () => {
    const SEJONG = "서울특별시 중구 세종대로 110";
    const TAEPYEONG = "서울특별시 중구 태평로1가 31";
    const start = [
      lotMember("A1", "대표", { addr: SEJONG, createdAt: "1" }),
      lotMember("A2", "SUB", { parent: "A1", addr: SEJONG, createdAt: "2" }),
      lotMember("B1", "단독", { addr: TAEPYEONG, createdAt: "3" }),
      lotMember("B2", "단독", { addr: TAEPYEONG, createdAt: "4" }),
    ];
    const merged = applyOpsToMarkers(
      start,
      planMergeGroups([[start[0], start[1]], [start[2]], [start[3]]], start).ops,
    );
    expect(orphanSubs(merged)).toEqual([]);

    const unsplit = applyOpsToMarkers(
      merged,
      planMergeSplitToLot(merged, merged).ops,
    );
    expect(orphanSubs(unsplit)).toEqual([]);
    const by = (id: string) => unsplit.find((m) => m.id === id)!;
    expect(unsplit.every((m) => m.groupKey === null)).toBe(true);
    expect(by("A2").parentMarkerId).toBe("A1");
    expect(by("B1").groupRole).toBe("대표");
    expect(by("B2").parentMarkerId).toBe("B1");

    const afterDelete = applyOpsToMarkers(
      unsplit,
      planDelete([by("A1")], unsplit).ops,
    );
    expect(orphanSubs(afterDelete)).toEqual([]);
  });

  it("주소 없는 멤버는 번지 묶음에 끼지 않고 각자 단독이 된다", () => {
    const all = [
      lotMember("r", "대표", { groupKey: "k#합침#r", createdAt: "1" }),
      marker({ id: "x", groupKey: "k#합침#r", groupRole: "SUB", parentMarkerId: "r", createdAt: "2" }),
      marker({ id: "y", groupKey: "k#합침#r", groupRole: "SUB", parentMarkerId: "r", createdAt: "3" }),
    ];
    const after = applyOpsToMarkers(all, planMergeSplitToLot(all, all).ops);
    expect(orphanSubs(after)).toEqual([]);
    const by = (id: string) => after.find((m) => m.id === id)!;
    expect(by("x")).toMatchObject({ groupRole: "단독", parentMarkerId: null });
    expect(by("y")).toMatchObject({ groupRole: "단독", parentMarkerId: null });
    expect(by("r").groupRole).toBe("단독");
  });
});

describe("planMergeGroups", () => {
  const all = [
    lotMember("r1", "대표", { groupKey: "g1", createdAt: "1" }),
    lotMember("a1", "SUB", { parent: "r1", groupKey: "g1", createdAt: "2" }),
    lotMember("r2", "대표", { groupKey: "g2", createdAt: "3" }),
    lotMember("a2", "SUB", { parent: "r2", groupKey: "g2", createdAt: "4" }),
  ];

  it("서로 다른 두 묶음 → 한 대표 + 나머지 SUB, 같은 새 키", () => {
    const { ops, groupKey } = planMergeGroups(
      [
        [all[0], all[1]],
        [all[2], all[3]],
      ],
      all,
    );
    expect(groupKey).toMatch(/#합침#r1$/);
    const after = applyOpsToMarkers(all, ops);
    expect(orphanSubs(after)).toEqual([]);
    expect(
      after.filter((m) => m.groupRole === "대표").map((m) => m.id),
    ).toEqual(["r1"]);
    expect(after.every((m) => m.groupKey === groupKey)).toBe(true);
    expect(
      after
        .filter((m) => m.id !== "r1")
        .every((m) => m.parentMarkerId === "r1"),
    ).toBe(true);
  });

  it("preferredRepId가 대표가 되고 키도 그 마커로 만든다", () => {
    const { ops, groupKey } = planMergeGroups(
      [
        [all[0], all[1]],
        [all[2], all[3]],
      ],
      all,
      "a2",
    );
    expect(groupKey).toMatch(/#합침#a2$/);
    const after = applyOpsToMarkers(all, ops);
    expect(orphanSubs(after)).toEqual([]);
    expect(after.find((m) => m.id === "a2")?.groupRole).toBe("대표");
    expect(after.find((m) => m.id === "r1")?.parentMarkerId).toBe("a2");
  });

  it("묶음 일부만 합치면 남은 옛 묶음은 같은 키로 대표를 다시 정한다", () => {
    const { ops } = planMergeGroups([[all[0]], [all[2]]], all);
    const after = applyOpsToMarkers(all, ops);
    expect(orphanSubs(after)).toEqual([]);
    // r2가 합쳐져 나갔으므로 a2가 g2의 새 대표(단독)가 된다.
    const a2 = after.find((m) => m.id === "a2")!;
    expect(a2.groupKey).toBe("g2");
    expect(a2.groupRole).toBe("단독");
    expect(a2.parentMarkerId).toBeNull();
  });

  it("빈 입력이면 연산이 없다", () => {
    expect(planMergeGroups([], all).ops).toEqual([]);
  });
});

describe("planDelete", () => {
  const group = () => [
    lotMember("r", "대표", { groupKey: "g", createdAt: "1" }),
    lotMember("a", "SUB", { parent: "r", groupKey: "g", createdAt: "2" }),
    lotMember("b", "SUB", { parent: "r", groupKey: "g", createdAt: "3" }),
  ];

  it("① SUB 삭제 → 연산은 삭제만", () => {
    const all = group();
    const { ops } = planDelete([all[1]], all);
    expect(ops).toEqual([{ type: "delete", ids: ["a"] }]);
    expect(orphanSubs(applyOpsToMarkers(all, ops))).toEqual([]);
  });

  it("② 대표 삭제, 남은 2개 이상 → 새 대표", () => {
    const all = group();
    const { ops } = planDelete([all[0]], all);
    expect(ops[ops.length - 1]).toEqual({ type: "delete", ids: ["r"] });
    const after = applyOpsToMarkers(all, ops);
    expect(orphanSubs(after)).toEqual([]);
    expect(after.map((m) => m.id)).toEqual(["a", "b"]);
    expect(after.find((m) => m.id === "a")?.groupRole).toBe("대표");
    expect(after.find((m) => m.id === "b")?.parentMarkerId).toBe("a");
  });

  it("③ 대표 삭제, 남은 1개 → 단독", () => {
    const all = group().slice(0, 2);
    const { ops } = planDelete([all[0]], all);
    const after = applyOpsToMarkers(all, ops);
    expect(orphanSubs(after)).toEqual([]);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ groupRole: "단독", parentMarkerId: null });
  });

  it("④ 묶음 전체 삭제 → 삭제만", () => {
    const all = group();
    const { ops } = planDelete(all, all);
    expect(ops).toEqual([{ type: "delete", ids: ["r", "a", "b"] }]);
    expect(applyOpsToMarkers(all, ops)).toEqual([]);
  });

  it("⑤ 서로 다른 묶음의 마커를 함께 삭제", () => {
    const other = [
      lotMember("R", "대표", { groupKey: "h", createdAt: "1" }),
      lotMember("A", "SUB", { parent: "R", groupKey: "h", createdAt: "2" }),
      lotMember("B", "SUB", { parent: "R", groupKey: "h", createdAt: "3" }),
    ];
    const all = [...group(), ...other];
    const { ops } = planDelete([all[0], other[0]], all);
    const after = applyOpsToMarkers(all, ops);
    expect(orphanSubs(after)).toEqual([]);
    expect(
      after.filter((m) => m.groupRole === "대표").map((m) => m.id),
    ).toEqual(["a", "A"]);
  });

  it("단독 마커 삭제는 다른 마커를 건드리지 않는다", () => {
    const all = [...group(), lotMember("s", "단독", { groupKey: "g" })];
    const { ops } = planDelete([all[3]], all);
    expect(ops).toEqual([{ type: "delete", ids: ["s"] }]);
  });

  it("대상이 없으면 연산이 없다", () => {
    expect(planDelete([], group())).toEqual({ ops: [] });
  });

  it("다른 묶음에서 지워지는 대표를 가리키는 SUB도 자기 묶음으로 다시 정한다", () => {
    // 옛 분리 해제가 남긴 데이터: B1·B2는 다른 번지인데 A1을 부모로 가리킨다.
    const SEJONG = "서울특별시 중구 세종대로 110";
    const TAEPYEONG = "서울특별시 중구 태평로1가 31";
    const all = [
      lotMember("A1", "대표", { addr: SEJONG, createdAt: "1" }),
      lotMember("A2", "SUB", { parent: "A1", addr: SEJONG, createdAt: "2" }),
      lotMember("B1", "SUB", { parent: "A1", addr: TAEPYEONG, createdAt: "3" }),
      lotMember("B2", "SUB", { parent: "A1", addr: TAEPYEONG, createdAt: "4" }),
    ];
    const after = applyOpsToMarkers(all, planDelete([all[0]], all).ops);
    expect(orphanSubs(after)).toEqual([]);
    const by = (id: string) => after.find((m) => m.id === id)!;
    expect(by("A2").groupRole).toBe("단독");
    expect(by("B1").groupRole).toBe("대표");
    expect(by("B2").parentMarkerId).toBe("B1");
  });

  it("주소 없는 SUB가 지워지는 대표를 가리키면 단독이 된다", () => {
    const all = [
      lotMember("A1", "대표", { createdAt: "1" }),
      marker({ id: "x", groupRole: "SUB", parentMarkerId: "A1" }),
    ];
    const after = applyOpsToMarkers(all, planDelete([all[0]], all).ops);
    expect(orphanSubs(after)).toEqual([]);
    expect(after).toEqual([
      expect.objectContaining({ id: "x", groupRole: "단독", parentMarkerId: null }),
    ]);
  });
});

describe("planMergeGroups 남은 자식", () => {
  it("합쳐져 나가는 대표를 다른 묶음에서 가리키는 SUB도 다시 정한다", () => {
    const all = [
      lotMember("r", "대표", { groupKey: "g", createdAt: "1" }),
      lotMember("q", "SUB", { parent: "r", groupKey: "h", createdAt: "2" }),
      lotMember("p", "SUB", { parent: "r", groupKey: "h", createdAt: "3" }),
      lotMember("t", "대표", { groupKey: "t", createdAt: "4" }),
    ];
    const after = applyOpsToMarkers(
      all,
      planMergeGroups([[all[0]], [all[3]]], all, "t").ops,
    );
    expect(orphanSubs(after)).toEqual([]);
    expect(after.find((m) => m.id === "q")?.groupRole).toBe("대표");
  });
});
