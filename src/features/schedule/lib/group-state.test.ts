import { describe, expect, it } from "vitest";
import { planCompanionArrangement } from "@/features/schedule/lib/companion-arrange";
import { planCompanionOps } from "@/features/schedule/lib/companions";
import { planCrossTeamCreate } from "@/features/schedule/lib/cross-team";
import { draftsFromCells, planGroupOps } from "@/features/schedule/lib/group-edit";
import {
  applyOpsToGroups,
  buildRestoreGroups,
  countDeletes,
  fillCreatedIds,
  snapshotGroups,
  type GroupCell,
  type GroupState,
  type WriteOp,
} from "@/features/schedule/lib/group-state";
import { planWorkDatesCreate } from "@/features/schedule/lib/period";
import type { CellPosition, ScheduleCell, ScheduleTextInput } from "@/features/schedule/types";

const D1 = "2026-11-09";
const D2 = "2026-11-10";
const D3 = "2026-11-11";
const COL_A = "col-a";
const COL_B = "col-b";
const MAX_ROWS = 30;

function makeCell(
  id: string,
  workDate: string,
  columnId: string,
  rowNo: number,
  mainText: string,
  subText = "",
  options: {
    textColor?: ScheduleCell["textColor"];
    companionTarget?: boolean;
    result?: ScheduleCell["result"];
  } = {},
): ScheduleCell {
  return {
    id,
    workDate,
    columnId,
    rowNo,
    mainText,
    subText,
    textColor: options.textColor ?? null,
    companionTarget: options.companionTarget ?? false,
    result: options.result ?? null,
  };
}

/**
 * 기존 칸 단위 실행(schedule-cell-dialog.tsx의 create/update/delete/moveScheduleCell +
 * planCompanionArrangement)을 그대로 흉내 내는 메모리 안 가짜 실행기.
 */
class FakeStore {
  private cells: ScheduleCell[];
  private seq = 0;

  constructor(initial: ScheduleCell[]) {
    this.cells = initial.map((c) => ({ ...c }));
  }

  snapshot(): ScheduleCell[] {
    return this.cells.map((c) => ({ ...c }));
  }

  create(position: CellPosition, text: ScheduleTextInput): string {
    const clash = this.cells.find(
      (c) =>
        c.workDate === position.workDate &&
        c.columnId === position.columnId &&
        c.rowNo === position.rowNo,
    );
    if (clash) {
      throw new Error(`position conflict: ${position.workDate}|${position.columnId}|${position.rowNo}`);
    }
    this.seq += 1;
    const id = `fake-${this.seq}`;
    this.cells.push({
      id,
      workDate: position.workDate,
      columnId: position.columnId,
      rowNo: position.rowNo,
      mainText: text.mainText,
      subText: text.subText,
      textColor: text.textColor,
      companionTarget: text.companionTarget === true,
      result: null,
    });
    return id;
  }

  update(id: string, text: ScheduleTextInput): void {
    const target = this.cells.find((c) => c.id === id);
    if (!target) throw new Error(`cell not found: ${id}`);
    target.mainText = text.mainText;
    target.subText = text.subText;
    target.textColor = text.textColor;
    if (text.companionTarget !== undefined) {
      target.companionTarget = text.companionTarget;
    }
  }

  delete(id: string): void {
    const idx = this.cells.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`cell not found: ${id}`);
    this.cells.splice(idx, 1);
  }

  /** move_schedule_cell(id, { workDate, columnId, rowNo: null | number }) 규칙 */
  move(id: string, target: { workDate: string; columnId: string; rowNo: number | null }): void {
    const cell = this.cells.find((c) => c.id === id);
    if (!cell) throw new Error(`cell not found: ${id}`);

    let targetRow = target.rowNo;
    if (targetRow === null) {
      const used = new Set(
        this.cells
          .filter((c) => c.workDate === target.workDate && c.columnId === target.columnId)
          .map((c) => c.rowNo),
      );
      for (let r = 0; r < MAX_ROWS; r += 1) {
        if (!used.has(r)) {
          targetRow = r;
          break;
        }
      }
      if (targetRow === null) throw new Error("column is full");
    }

    if (
      cell.workDate === target.workDate &&
      cell.columnId === target.columnId &&
      cell.rowNo === targetRow
    ) {
      return;
    }

    const other = this.cells.find(
      (c) =>
        c.workDate === target.workDate &&
        c.columnId === target.columnId &&
        c.rowNo === targetRow,
    );
    if (other) {
      other.workDate = cell.workDate;
      other.columnId = cell.columnId;
      other.rowNo = cell.rowNo;
    }
    cell.workDate = target.workDate;
    cell.columnId = target.columnId;
    cell.rowNo = targetRow;
  }

  arrangeGroup(workDate: string, columnId: string): void {
    const group = this.cells.filter((c) => c.workDate === workDate && c.columnId === columnId);
    for (const step of planCompanionArrangement(group)) {
      this.move(step.id, { workDate, columnId, rowNo: step.toRow });
    }
  }

  groupView(workDate: string, columnId: string) {
    return this.cells
      .filter((c) => c.workDate === workDate && c.columnId === columnId)
      .sort((a, b) => a.rowNo - b.rowNo)
      .map(normalizeCell);
  }
}

function normalizeCell(cell: Pick<GroupCell, "rowNo" | "mainText" | "subText" | "textColor" | "companionTarget">) {
  return {
    rowNo: cell.rowNo,
    mainText: cell.mainText,
    subText: cell.subText,
    textColor: cell.textColor,
    companionTarget: cell.companionTarget === true,
  };
}

function groupViewFromStates(states: GroupState[], workDate: string, columnId: string) {
  const found = states.find((g) => g.workDate === workDate && g.columnId === columnId);
  expect(found).toBeDefined();
  return [...(found as GroupState).cells]
    .sort((a, b) => a.rowNo - b.rowNo)
    .map(normalizeCell);
}

describe("snapshotGroups & countDeletes", () => {
  it("snapshotGroups는 그룹의 현재 칸과 결과 필드·baseIds를 행 순서로 담는다", () => {
    const cells = [
      makeCell("c2", D1, COL_A, 2, "국소2", "모국2", {
        textColor: "0070C0",
        companionTarget: true,
        result: { status: "partial", reason: "우천", rescheduledTo: D2 },
      }),
      makeCell("c1", D1, COL_A, 0, "국소1", "모국1"),
      makeCell("c3", D1, COL_B, 0, "다른팀"),
    ];
    const snaps = snapshotGroups(cells, [
      { workDate: D1, columnId: COL_A },
      { workDate: D1, columnId: COL_A }, // 중복 키는 한 번만
      { workDate: D2, columnId: COL_A }, // 빈 그룹
    ]);

    expect(snaps).toHaveLength(2);
    expect(snaps[0].baseIds).toEqual(["c1", "c2"]);
    expect(snaps[0].cells).toEqual([
      {
        id: "c1",
        rowNo: 0,
        mainText: "국소1",
        subText: "모국1",
        textColor: null,
        companionTarget: false,
        result: null,
      },
      {
        id: "c2",
        rowNo: 2,
        mainText: "국소2",
        subText: "모국2",
        textColor: "0070C0",
        companionTarget: true,
        result: { status: "partial", reason: "우천", rescheduledTo: D2 },
      },
    ]);
    expect(snaps[1]).toEqual({ workDate: D2, columnId: COL_A, baseIds: [], cells: [] });
  });

  it("countDeletes는 before에 있고 after에 없는 id 수를 센다", () => {
    const before: GroupState[] = [
      {
        workDate: D1,
        columnId: COL_A,
        baseIds: ["c1", "c2", "c3"],
        cells: [
          { id: "c1", rowNo: 0, mainText: "A", subText: "", textColor: null },
          { id: "c2", rowNo: 1, mainText: "B", subText: "", textColor: null },
          { id: "c3", rowNo: 2, mainText: "C", subText: "", textColor: null },
        ],
      },
    ];
    const after: GroupState[] = [
      {
        workDate: D1,
        columnId: COL_A,
        baseIds: ["c1", "c2", "c3"],
        cells: [
          { id: "c1", rowNo: 0, mainText: "A", subText: "", textColor: null },
          { id: null, rowNo: 1, mainText: "D", subText: "", textColor: null },
        ],
      },
    ];
    expect(countDeletes(before, after)).toBe(2);
  });
});

describe("applyOpsToGroups 동등성 시험 (FakeStore 대비)", () => {
  // 참고: ⑦ 행이 가득 찬 그룹(MAX_ROWS 초과)은 계획 함수(planGroupOps 등)가 오류를 내므로 이 모듈까지 오지 않는다.

  it("① 새 국소 추가", () => {
    const initial = [makeCell("c1", D1, COL_A, 0, "기존국소", "모국1")];
    const plan = planGroupOps({
      cells: initial,
      workDate: D1,
      columnId: COL_A,
      drafts: [
        ...draftsFromCells(initial, D1, COL_A),
        { key: "new-1", id: null, rowNo: null, mainText: "새국소", subText: "장비A", textColor: "FF0000", companionTarget: false },
      ],
    });
    if ("error" in plan) throw new Error(plan.error);

    const store = new FakeStore(initial);
    for (const op of plan.ops) {
      if (op.op === "create") store.create(op.position, op.text);
      else if (op.op === "update") store.update(op.id, op.text);
      else store.delete(op.id);
    }
    store.arrangeGroup(D1, COL_A);

    const groups = applyOpsToGroups({
      cells: initial,
      ops: plan.ops,
      arrange: true,
    });

    expect(groupViewFromStates(groups, D1, COL_A)).toEqual(store.groupView(D1, COL_A));
    expect(groups[0].baseIds).toEqual(["c1"]);
  });

  it("② 국소 수정·삭제 (중간 행 삭제 → 빈 행 닫힘)", () => {
    const initial = [
      makeCell("c1", D1, COL_A, 0, "국소1", "모국1"),
      makeCell("c2", D1, COL_A, 1, "국소2", "모국2"),
      makeCell("c3", D1, COL_A, 2, "국소3", "모국3"),
    ];
    const drafts = draftsFromCells(initial, D1, COL_A)
      .filter((d) => d.id !== "c2")
      .map((d) => (d.id === "c3" ? { ...d, mainText: "국소3수정", textColor: "0070C0" as const } : d));

    const plan = planGroupOps({ cells: initial, workDate: D1, columnId: COL_A, drafts });
    if ("error" in plan) throw new Error(plan.error);

    const store = new FakeStore(initial);
    for (const op of plan.ops) {
      if (op.op === "delete") store.delete(op.id);
      else if (op.op === "update") store.update(op.id, op.text);
      else store.create(op.position, op.text);
    }
    store.arrangeGroup(D1, COL_A);

    const groups = applyOpsToGroups({
      cells: initial,
      ops: plan.ops,
      arrange: true,
    });

    expect(groupViewFromStates(groups, D1, COL_A)).toEqual(store.groupView(D1, COL_A));
  });

  it("③ 입회·신호수 추가 (대상 국소 → 입회 → 신호수 → 나머지 국소 순 정리)", () => {
    const initial = [
      makeCell("c1", D1, COL_A, 0, "일반국소", "모국1"),
      makeCell("c2", D1, COL_A, 1, "대상국소", "모국2", { companionTarget: false }),
    ];
    const drafts = draftsFromCells(initial, D1, COL_A).map((d) =>
      d.id === "c2" ? { ...d, companionTarget: true } : d,
    );
    const groupPlan = planGroupOps({ cells: initial, workDate: D1, columnId: COL_A, drafts });
    if ("error" in groupPlan) throw new Error(groupPlan.error);

    const companionPlan = planCompanionOps({
      cells: initial,
      workDate: D1,
      columnId: COL_A,
      excludeId: null,
      companions: [
        { kind: "입회", enabled: true, names: "사람A" },
        { kind: "신호수", enabled: true, names: "사람B" },
      ],
      anchorRow: 1,
      reservedRows: groupPlan.usedRows,
    });
    if ("error" in companionPlan) throw new Error(companionPlan.error);

    const allOps: WriteOp[] = [...groupPlan.ops, ...companionPlan.ops];

    const store = new FakeStore(initial);
    for (const op of allOps) {
      if (op.op === "delete") store.delete(op.id);
      else if (op.op === "update") store.update(op.id, op.text);
      else store.create(op.position, op.text);
    }
    store.arrangeGroup(D1, COL_A);

    const groups = applyOpsToGroups({
      cells: initial,
      ops: allOps,
      arrange: true,
    });

    expect(groupViewFromStates(groups, D1, COL_A)).toEqual(store.groupView(D1, COL_A));
  });

  it("④ 날짜·팀 이동 (여러 칸이 도착 팀의 빈 행에 차례로 들어가고 정리됨)", () => {
    const initial = [
      makeCell("s1", D1, COL_A, 0, "이동국소1", "모국1", { companionTarget: true }),
      makeCell("s2", D1, COL_A, 1, "", "입회 : 사람A"),
      makeCell("s3", D1, COL_A, 2, "이동국소2", "모국2"),
      // 도착 그룹에는 0행과 2행에 이미 칸이 있음 (1행은 비어 있음)
      makeCell("d1", D2, COL_B, 0, "도착기존1", "모국X"),
      makeCell("d2", D2, COL_B, 2, "도착기존2", "모국Y"),
    ];

    const store = new FakeStore(initial);
    for (const id of ["s1", "s2", "s3"]) {
      store.move(id, { workDate: D2, columnId: COL_B, rowNo: null });
    }
    store.arrangeGroup(D2, COL_B);

    const groups = applyOpsToGroups({
      cells: initial,
      ops: [],
      moveTo: { workDate: D2, columnId: COL_B, ids: ["s1", "s2", "s3"] },
      arrange: true,
    });

    expect(groupViewFromStates(groups, D1, COL_A)).toEqual(store.groupView(D1, COL_A));
    expect(groupViewFromStates(groups, D2, COL_B)).toEqual(store.groupView(D2, COL_B));
    // 도착 그룹으로 옮겨진 칸은 DB에서 새로 삽입되도록 id가 null이어야 한다.
    const destGroup = groups.find((g) => g.workDate === D2 && g.columnId === COL_B);
    expect(destGroup?.baseIds).toEqual(["d1", "d2"]);
    expect(destGroup?.cells.filter((c) => c.id === null)).toHaveLength(3);
  });

  it("⑤ 함께 등록할 팀 (planCrossTeamCreate)", () => {
    const initial = [
      makeCell("a1", D1, COL_A, 0, "국소A", "모국A", { companionTarget: true }),
      makeCell("b1", D1, COL_B, 1, "기존B", "모국B"),
    ];
    const crossPlan = planCrossTeamCreate({
      cells: initial,
      workDate: D1,
      targetColumnIds: [COL_B],
      entries: [{ mainText: "국소A", subText: "모국A", textColor: null, companionTarget: true }],
      companions: [{ kind: "입회", names: "사람A" }],
    });

    const ops: WriteOp[] = crossPlan.creates.map((c) => ({
      op: "create",
      position: c.position,
      text: c.text,
    }));

    const store = new FakeStore(initial);
    for (const op of ops) {
      if (op.op === "create") store.create(op.position, op.text);
    }
    store.arrangeGroup(D1, COL_B);

    const groups = applyOpsToGroups({
      cells: initial,
      ops,
      arrange: true,
    });

    expect(groupViewFromStates(groups, D1, COL_B)).toEqual(store.groupView(D1, COL_B));
  });

  it("⑥ 작업일자 여러 날 (planWorkDatesCreate)", () => {
    const initial = [
      makeCell("d2-1", D2, COL_A, 0, "기존D2", "모국"),
      makeCell("d3-1", D3, COL_A, 2, "기존D3", "모국"),
    ];
    const periodPlan = planWorkDatesCreate({
      cells: initial,
      startIso: D1,
      targetColumnIds: [COL_A, COL_B],
      entries: [
        {
          mainText: "기간국소",
          subText: "장비1",
          textColor: "0070C0",
          companionTarget: true,
          dates: [D2, D3],
        },
      ],
      companions: [{ kind: "신호수", names: "사람C" }],
    });
    if ("error" in periodPlan) throw new Error(periodPlan.error);

    const ops: WriteOp[] = periodPlan.creates.map((c) => ({
      op: "create",
      position: c.position,
      text: c.text,
    }));

    const store = new FakeStore(initial);
    for (const op of ops) {
      if (op.op === "create") store.create(op.position, op.text);
    }
    for (const date of periodPlan.dates) {
      for (const col of [COL_A, COL_B]) {
        store.arrangeGroup(date, col);
      }
    }

    const groups = applyOpsToGroups({
      cells: initial,
      ops,
      arrange: true,
    });

    for (const date of [D2, D3]) {
      for (const col of [COL_A, COL_B]) {
        expect(groupViewFromStates(groups, date, col)).toEqual(store.groupView(date, col));
      }
    }
  });

  it("⑧ 새 국소 추가 + 날짜·팀 이동 (새 칸이 중간 행에 만들어져도 이동 전 rowNo 순으로 도착 빈 행에 들어감)", () => {
    const initial = [
      makeCell("s1", D1, COL_A, 0, "기존국소0", "모국0"),
      makeCell("s2", D1, COL_A, 2, "기존국소2", "모국2"),
      makeCell("d1", D2, COL_B, 0, "도착기존", "모국X"),
    ];
    // 1행(중간 행)에 새 국소를 추가하면서 그룹 전체를 D2, COL_B로 이동
    const drafts = [
      ...draftsFromCells(initial, D1, COL_A),
      {
        key: "new-mid",
        id: null,
        rowNo: 1,
        mainText: "중간새국소",
        subText: "모국1",
        textColor: null,
        companionTarget: false,
      },
    ];
    const plan = planGroupOps({ cells: initial, workDate: D1, columnId: COL_A, drafts });
    if ("error" in plan) throw new Error(plan.error);

    const store = new FakeStore(initial);
    const toMove: { id: string; rowNo: number }[] = [
      { id: "s1", rowNo: 0 },
      { id: "s2", rowNo: 2 },
    ];
    for (const op of plan.ops) {
      if (op.op === "create") {
        const createdId = store.create(op.position, op.text);
        toMove.push({ id: createdId, rowNo: op.position.rowNo });
      } else if (op.op === "update") {
        store.update(op.id, op.text);
      } else {
        store.delete(op.id);
      }
    }
    for (const item of [...toMove].sort((a, b) => a.rowNo - b.rowNo)) {
      store.move(item.id, { workDate: D2, columnId: COL_B, rowNo: null });
    }
    store.arrangeGroup(D2, COL_B);

    const groups = applyOpsToGroups({
      cells: initial,
      ops: plan.ops,
      // ids 순서를 의도적으로 뒤집어 넘겨도 rowNo(0 -> 1 -> 2) 순서로 이동해야 한다.
      moveTo: { workDate: D2, columnId: COL_B, ids: ["s2", "s1"], includeCreated: true },
      arrange: true,
    });

    expect(groupViewFromStates(groups, D1, COL_A)).toEqual(store.groupView(D1, COL_A));
    expect(groupViewFromStates(groups, D2, COL_B)).toEqual(store.groupView(D2, COL_B));
  });

  it("⑨ 이동 + 입회/신호수 create 동반 (대상 국소·입회·신호수가 함께 도착 팀으로 이동·정리됨)", () => {
    const initial = [
      makeCell("s1", D1, COL_A, 0, "대상국소", "모국1", { companionTarget: true }),
      makeCell("s2", D1, COL_A, 1, "일반국소", "모국2"),
      makeCell("d1", D2, COL_B, 0, "도착기존", "모국X"),
    ];
    const companionPlan = planCompanionOps({
      cells: initial,
      workDate: D1,
      columnId: COL_A,
      excludeId: null,
      companions: [
        { kind: "입회", enabled: true, names: "사람A" },
        { kind: "신호수", enabled: true, names: "사람B" },
      ],
      anchorRow: 1,
    });
    if ("error" in companionPlan) throw new Error(companionPlan.error);

    const store = new FakeStore(initial);
    const toMove: { id: string; rowNo: number }[] = [
      { id: "s1", rowNo: 0 },
      { id: "s2", rowNo: 1 },
    ];
    for (const op of companionPlan.ops) {
      if (op.op === "create") {
        const createdId = store.create(op.position, op.text);
        toMove.push({ id: createdId, rowNo: op.position.rowNo });
      }
    }
    for (const item of [...toMove].sort((a, b) => a.rowNo - b.rowNo)) {
      store.move(item.id, { workDate: D2, columnId: COL_B, rowNo: null });
    }
    store.arrangeGroup(D2, COL_B);

    const groups = applyOpsToGroups({
      cells: initial,
      ops: companionPlan.ops,
      moveTo: { workDate: D2, columnId: COL_B, ids: ["s1", "s2"], includeCreated: true },
      arrange: true,
    });

    expect(groupViewFromStates(groups, D1, COL_A)).toEqual(store.groupView(D1, COL_A));
    expect(groupViewFromStates(groups, D2, COL_B)).toEqual(store.groupView(D2, COL_B));
  });
});

describe("fillCreatedIds", () => {
  it("RPC가 돌려준 created id를 해당 groupIndex·cellIndex 칸과 baseIds에 채운다", () => {
    const after: GroupState[] = [
      {
        workDate: D1,
        columnId: COL_A,
        baseIds: ["c1"],
        cells: [
          { id: "c1", rowNo: 0, mainText: "기존", subText: "", textColor: null },
          { id: null, rowNo: 1, mainText: "신규1", subText: "", textColor: null },
        ],
      },
      {
        workDate: D2,
        columnId: COL_B,
        baseIds: [],
        cells: [{ id: null, rowNo: 0, mainText: "신규2", subText: "", textColor: null }],
      },
    ];

    const filled = fillCreatedIds(after, [
      { groupIndex: 0, cellIndex: 1, id: "new-id-1" },
      { groupIndex: 1, cellIndex: 0, id: "new-id-2" },
    ]);

    expect(filled[0].cells[1].id).toBe("new-id-1");
    expect(filled[0].baseIds).toEqual(["c1", "new-id-1"]);
    expect(filled[1].cells[0].id).toBe("new-id-2");
    expect(filled[1].baseIds).toEqual(["new-id-2"]);
    // 원본 after는 변경하지 않는다
    expect(after[0].cells[1].id).toBeNull();
  });
});

describe("buildRestoreGroups", () => {
  it("before의 칸을 유지하면서 baseIds만 after의 현재 id 집합으로 바꾼다", () => {
    const before: GroupState[] = [
      {
        workDate: D1,
        columnId: COL_A,
        baseIds: ["c1"],
        cells: [{ id: "c1", rowNo: 0, mainText: "원래", subText: "", textColor: null }],
      },
    ];
    const after: GroupState[] = [
      {
        workDate: D1,
        columnId: COL_A,
        baseIds: ["c1"],
        cells: [
          { id: "c1", rowNo: 0, mainText: "수정", subText: "", textColor: null },
          { id: "c2", rowNo: 1, mainText: "추가", subText: "", textColor: null },
        ],
      },
    ];

    const restore = buildRestoreGroups(before, after);
    expect(restore[0].cells).toEqual(before[0].cells);
    expect(restore[0].baseIds).toEqual(["c1", "c2"]);
  });
});
