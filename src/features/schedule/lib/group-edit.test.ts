import { describe, expect, it } from "vitest";
import type { ScheduleCell } from "@/features/schedule/types";
import { MAX_ROWS } from "./cell-grid";
import { draftsFromCells, planGroupOps, type EntryDraft } from "./group-edit";

const D = "2026-11-09";
const COL = "col-a";

function cell(
  rowNo: number,
  mainText: string,
  subText = "",
  options: { columnId?: string; workDate?: string; textColor?: ScheduleCell["textColor"] } = {},
): ScheduleCell {
  const workDate = options.workDate ?? D;
  const columnId = options.columnId ?? COL;
  return {
    id: `${workDate}-${columnId}-${rowNo}`,
    workDate,
    columnId,
    rowNo,
    mainText,
    subText,
    textColor: options.textColor ?? null,
  };
}

function draftOf(source: ScheduleCell, patch: Partial<EntryDraft> = {}): EntryDraft {
  return {
    key: source.id,
    id: source.id,
    rowNo: source.rowNo,
    mainText: source.mainText,
    subText: source.subText,
    textColor: source.textColor,
    ...patch,
  };
}

function newDraft(key: string, mainText: string, rowNo: number | null = null, subText = ""): EntryDraft {
  return { key, id: null, rowNo, mainText, subText, textColor: null };
}

describe("draftsFromCells", () => {
  it("같은 팀·날짜의 일정 칸을 행 순서로 준다(입회·신호수와 다른 팀·날짜는 뺀다)", () => {
    const cells = [
      cell(3, "국소3"),
      cell(0, "국소1", "모국"),
      cell(1, "", "스카이"),
      cell(2, "", "입회 : 정성훈"),
      cell(0, "다른팀", "", { columnId: "col-b" }),
      cell(0, "다른날", "", { workDate: "2026-11-10" }),
    ];
    const drafts = draftsFromCells(cells, D, COL);
    expect(drafts.map((draft) => [draft.rowNo, draft.mainText, draft.subText])).toEqual([
      [0, "국소1", "모국"],
      [1, "", "스카이"],
      [3, "국소3", ""],
    ]);
    expect(drafts[0].id).toBe(cells[1].id);
  });
});

describe("planGroupOps", () => {
  const base = { workDate: D, columnId: COL };

  it("바뀐 게 없으면 할 일이 없다", () => {
    const cells = [cell(0, "가"), cell(1, "나")];
    expect(planGroupOps({ ...base, cells, drafts: cells.map((c) => draftOf(c)) })).toEqual({
      ops: [],
      usedRows: [],
    });
  });

  it("글·뒤 칸·글자색이 바뀐 칸만 고친다(앞뒤 공백 차이는 바뀐 것이 아니다)", () => {
    const cells = [cell(0, "가"), cell(1, "나"), cell(2, "다")];
    const result = planGroupOps({
      ...base,
      cells,
      drafts: [
        draftOf(cells[0], { mainText: " 가 " }),
        draftOf(cells[1], { mainText: "나2", subText: "장비", textColor: "FF0000" }),
        draftOf(cells[2]),
      ],
    });
    expect(result).toEqual({
      ops: [
        {
          op: "update",
          id: cells[1].id,
          text: { mainText: "나2", subText: "장비", textColor: "FF0000" },
        },
      ],
      usedRows: [],
    });
  });

  it("목록에서 뺀 칸은 지운다", () => {
    const cells = [cell(0, "가"), cell(1, "나")];
    expect(planGroupOps({ ...base, cells, drafts: [draftOf(cells[0])] })).toEqual({
      ops: [{ op: "delete", id: cells[1].id }],
      usedRows: [],
    });
  });

  it("클릭한 빈 행의 새 항목은 그 행에 만든다", () => {
    const result = planGroupOps({
      ...base,
      cells: [],
      drafts: [newDraft("clicked", "가", 4)],
    });
    expect(result).toEqual({
      ops: [
        {
          op: "create",
          key: "clicked",
          position: { workDate: D, columnId: COL, rowNo: 4 },
          text: { mainText: "가", subText: "", textColor: null },
        },
      ],
      usedRows: [4],
    });
  });

  it("행이 없는 새 항목은 마지막 항목 아래 빈 행에 차례로 만든다", () => {
    const cells = [cell(0, "가"), cell(1, "나")];
    const result = planGroupOps({
      ...base,
      cells,
      drafts: [draftOf(cells[0]), draftOf(cells[1]), newDraft("n1", "다"), newDraft("n2", "라")],
    });
    expect("ops" in result && result.ops.map((op) => op.op === "create" && op.position.rowNo)).toEqual([
      2, 3,
    ]);
  });

  it("차 있는 행(입회·신호수 포함)은 건너뛴다", () => {
    const cells = [cell(0, "가"), cell(1, "", "입회 : 정성훈")];
    const result = planGroupOps({
      ...base,
      cells,
      drafts: [draftOf(cells[0]), newDraft("n1", "나")],
    });
    expect("ops" in result && result.ops[0]).toMatchObject({ op: "create", position: { rowNo: 2 } });
  });

  it("같은 저장에서 지운 칸의 행은 새 항목이 다시 쓸 수 있다", () => {
    const cells = [cell(0, "가"), cell(1, "나")];
    const result = planGroupOps({
      ...base,
      cells,
      drafts: [draftOf(cells[0]), newDraft("n1", "다")],
    });
    expect(result).toEqual({
      ops: [
        { op: "delete", id: cells[1].id },
        {
          op: "create",
          key: "n1",
          position: { workDate: D, columnId: COL, rowNo: 1 },
          text: { mainText: "다", subText: "", textColor: null },
        },
      ],
      usedRows: [1],
    });
  });

  it("비어 있는 새 항목은 무시한다", () => {
    expect(
      planGroupOps({ ...base, cells: [], drafts: [newDraft("n1", "   ")] }),
    ).toEqual({ ops: [], usedRows: [] });
  });

  it("기존 항목의 글을 모두 지우면 오류다(지우려면 목록에서 빼야 한다)", () => {
    const cells = [cell(0, "가", "모국")];
    expect(
      planGroupOps({
        ...base,
        cells,
        drafts: [draftOf(cells[0], { mainText: "", subText: "" })],
      }),
    ).toEqual({ error: "blank" });
  });

  it("행이 모자라면 오류다", () => {
    const full = Array.from({ length: MAX_ROWS }, (_, row) => cell(row, `국소${row}`));
    expect(
      planGroupOps({
        ...base,
        cells: full,
        drafts: [...full.map((c) => draftOf(c)), newDraft("n1", "새국소")],
      }),
    ).toEqual({ error: "full" });
  });
});
