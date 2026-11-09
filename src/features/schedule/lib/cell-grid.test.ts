import { describe, expect, it } from "vitest";
import type { ScheduleCell, ScheduleColumn } from "@/features/schedule/types";
import {
  filterVisibleScheduleColumns,
  firstFreeRow,
  indexCells,
  isOptionalScheduleColumn,
  leftoverGroupAfterMove,
  MAX_ROWS,
  MIN_VISIBLE_ROWS,
  planDrop,
  planGroupDrop,
  positionKey,
  visibleRowCount,
} from "./cell-grid";

function cell(
  workDate: string,
  columnId: string,
  rowNo: number,
  mainText = "국소",
): ScheduleCell {
  return {
    id: `${workDate}|${columnId}|${rowNo}`,
    workDate,
    columnId,
    rowNo,
    mainText,
    subText: "",
    textColor: null,
  };
}

describe("visibleRowCount", () => {
  const D = "2026-11-09";

  it("칸이 없어도 기본 4행을 보여 준다", () => {
    expect(MIN_VISIBLE_ROWS).toBe(4);
    expect(visibleRowCount([], D)).toBe(4);
  });

  it("4행 안에서는 행 수가 늘지 않는다", () => {
    expect(visibleRowCount([cell(D, "a", 1)], D)).toBe(4);
    expect(visibleRowCount([cell(D, "a", 2)], D)).toBe(4);
  });

  it("마지막 행(4번째)까지 쓰면 새 칸을 넣을 빈 행 하나를 더 보여 준다", () => {
    expect(visibleRowCount([cell(D, "a", 3)], D)).toBe(5);
    expect(visibleRowCount([cell(D, "a", 12)], D)).toBe(14);
  });

  it("최대 행 수를 넘지 않는다", () => {
    expect(MAX_ROWS).toBe(30);
    expect(visibleRowCount([cell(D, "a", 29)], D)).toBe(30);
  });

  it("다른 날짜의 칸은 세지 않는다", () => {
    expect(visibleRowCount([cell("2026-11-10", "a", 15)], D)).toBe(4);
  });
});

describe("firstFreeRow", () => {
  const D = "2026-11-09";

  it("앞에서부터 비어 있는 가장 작은 행을 준다", () => {
    expect(firstFreeRow([cell(D, "a", 0), cell(D, "a", 1)], D, "a")).toBe(2);
    expect(firstFreeRow([cell(D, "a", 0), cell(D, "a", 2)], D, "a")).toBe(1);
  });

  it("다른 열·날짜의 칸은 무시한다", () => {
    expect(firstFreeRow([cell(D, "b", 0), cell("2026-11-10", "a", 0)], D, "a")).toBe(0);
  });

  it("fromRow가 있으면 그 행부터 찾고, 아래가 모두 차 있으면 위로 돌아간다", () => {
    const used = [cell(D, "a", 0), cell(D, "a", 1)];
    expect(firstFreeRow(used, D, "a", 1)).toBe(2);
    expect(firstFreeRow(used, D, "a", 5)).toBe(5);
    expect(firstFreeRow([...used, cell(D, "a", 29)], D, "a", 29)).toBe(2);
  });

  it("행이 모두 차 있으면 null이다", () => {
    const full = Array.from({ length: MAX_ROWS }, (_, row) => cell(D, "a", row));
    expect(firstFreeRow(full, D, "a")).toBeNull();
  });
});

describe("planDrop", () => {
  const D = "2026-11-09";
  const dragged = cell(D, "a", 0, "끌린 칸");
  const other = cell(D, "b", 1, "있던 칸");

  it("같은 자리에 놓으면 아무 일도 없다", () => {
    expect(planDrop([dragged], dragged, { workDate: D, columnId: "a", rowNo: 0 })).toEqual({
      kind: "none",
    });
  });

  it("빈 칸에 놓으면 이동이다", () => {
    expect(planDrop([dragged], dragged, { workDate: D, columnId: "b", rowNo: 3 })).toEqual({
      kind: "move",
    });
  });

  it("찬 칸에 놓으면 맞바꾼다", () => {
    expect(
      planDrop([dragged, other], dragged, { workDate: D, columnId: "b", rowNo: 1 }),
    ).toEqual({ kind: "swap", with: other });
  });

  it("다른 날짜의 찬 칸에도 같은 규칙이다", () => {
    const next = cell("2026-11-10", "a", 0, "다음 날 칸");
    expect(
      planDrop([dragged, next], dragged, { workDate: "2026-11-10", columnId: "a", rowNo: 0 }),
    ).toEqual({ kind: "swap", with: next });
  });
});

describe("planGroupDrop (같은 날짜·팀의 국소를 한 묶음으로 옮긴다)", () => {
  const D = "2026-11-09";
  const E = "2026-11-10";
  const g0 = cell(D, "a", 0, "국소1");
  const g1 = cell(D, "a", 1, "국소2");
  const g2 = cell(D, "a", 2, "국소3");
  const otherTeam = cell(D, "b", 0, "다른 팀");

  it("같은 날짜·팀에 놓으면 아무 일도 없다", () => {
    expect(planGroupDrop([g0, g1], g1, { workDate: D, columnId: "a", rowNo: 5 })).toEqual({
      kind: "none",
    });
  });

  it("묶음 전체를 행 순서대로 옮긴다(끈 칸이 가운데여도)", () => {
    expect(
      planGroupDrop([g2, otherTeam, g0, g1], g1, { workDate: E, columnId: "a", rowNo: 0 }),
    ).toEqual({ kind: "move", ids: [g0.id, g1.id, g2.id] });
  });

  it("다른 팀의 칸은 묶음에 넣지 않는다", () => {
    const plan = planGroupDrop([g0, g1, otherTeam], g0, { workDate: E, columnId: "a", rowNo: 0 });
    expect(plan).toEqual({ kind: "move", ids: [g0.id, g1.id] });
  });

  it("도착 자리에 행이 모자라면 full이다", () => {
    const crowded = Array.from({ length: MAX_ROWS - 1 }, (_, row) => cell(E, "b", row, `x${row}`));
    expect(planGroupDrop([g0, g1, ...crowded], g0, { workDate: E, columnId: "b", rowNo: 0 })).toEqual({
      kind: "full",
    });
    expect(
      planGroupDrop([g0, ...crowded], g0, { workDate: E, columnId: "b", rowNo: 0 }),
    ).toEqual({ kind: "move", ids: [g0.id] });
  });
});

describe("positionKey / indexCells", () => {
  it("자리를 키로 찾는다", () => {
    const target = cell("2026-11-09", "a", 3);
    const index = indexCells([target]);
    expect(index.get(positionKey({ workDate: "2026-11-09", columnId: "a", rowNo: 3 }))).toBe(
      target,
    );
    expect(index.get(positionKey({ workDate: "2026-11-09", columnId: "a", rowNo: 4 }))).toBe(
      undefined,
    );
  });
});

describe("선택 열(6팀·시험팀·실사&재하도급) 표시 필터", () => {
  const columns: ScheduleColumn[] = [
    { id: "c1", sortOrder: 0, teamLabel: "1팀", leaderLabel: "" },
    { id: "c7", sortOrder: 6, teamLabel: "6팀", leaderLabel: "" },
    { id: "c8", sortOrder: 7, teamLabel: "시험팀", leaderLabel: "" },
    { id: "c9", sortOrder: 8, teamLabel: "실사&재하도급", leaderLabel: "" },
    { id: "c10", sortOrder: 9, teamLabel: "비고", leaderLabel: "" },
  ];

  it("6팀·시험팀·실사&재하도급만 선택 열로 판정한다", () => {
    expect(columns.filter(isOptionalScheduleColumn).map((c) => c.teamLabel)).toEqual([
      "6팀",
      "시험팀",
      "실사&재하도급",
    ]);
  });

  it("다른 팀(1~5팀, 7팀)과 비고는 선택 열이 아니다", () => {
    const others: ScheduleColumn[] = ["1팀", "2팀", "3팀", "4팀", "5팀", "7팀", "비고"].map(
      (teamLabel, index) => ({ id: `x${index}`, sortOrder: index, teamLabel, leaderLabel: "" }),
    );
    expect(others.filter(isOptionalScheduleColumn)).toEqual([]);
  });

  it("앞뒤 공백이 있는 6팀 이름도 선택 열이다", () => {
    expect(isOptionalScheduleColumn({ id: "x", sortOrder: 0, teamLabel: " 6팀 ", leaderLabel: "" })).toBe(
      true,
    );
  });

  it("기본값(빈 집합)에서는 6팀·시험팀·실사&재하도급을 숨긴다", () => {
    expect(filterVisibleScheduleColumns(columns, new Set()).map((c) => c.teamLabel)).toEqual([
      "1팀",
      "비고",
    ]);
  });

  it("체크한 선택 열만 함께 표시한다", () => {
    expect(
      filterVisibleScheduleColumns(columns, new Set(["c7"])).map((c) => c.teamLabel),
    ).toEqual(["1팀", "6팀", "비고"]);
    expect(
      filterVisibleScheduleColumns(columns, new Set(["c8"])).map((c) => c.teamLabel),
    ).toEqual(["1팀", "시험팀", "비고"]);
    expect(
      filterVisibleScheduleColumns(columns, new Set(["c7", "c8", "c9"])).map((c) => c.teamLabel),
    ).toEqual(["1팀", "6팀", "시험팀", "실사&재하도급", "비고"]);
  });
});

describe("leftoverGroupAfterMove", () => {
  const dragged = { workDate: "2026-11-09", columnId: "team1", rowNo: 2 };

  it("다른 팀으로 옮기면 원래 팀을 정리 대상으로 돌려준다", () => {
    expect(leftoverGroupAfterMove(dragged, { workDate: "2026-11-09", columnId: "team2", rowNo: 0 })).toEqual({
      workDate: "2026-11-09",
      columnId: "team1",
    });
  });

  it("다른 날짜로 옮겨도 원래 날짜·팀을 정리 대상으로 돌려준다", () => {
    expect(leftoverGroupAfterMove(dragged, { workDate: "2026-11-10", columnId: "team1", rowNo: 0 })).toEqual({
      workDate: "2026-11-09",
      columnId: "team1",
    });
  });

  it("같은 날짜·팀 안에서 순서를 바꾸는 끌기는 정리하지 않는다(끈 순서를 되돌리지 않는다)", () => {
    expect(leftoverGroupAfterMove(dragged, { workDate: "2026-11-09", columnId: "team1", rowNo: 0 })).toBeNull();
  });
});
