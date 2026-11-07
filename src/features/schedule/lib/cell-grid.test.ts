import { describe, expect, it } from "vitest";
import type { ScheduleCell } from "@/features/schedule/types";
import {
  firstFreeRow,
  indexCells,
  MAX_ROWS,
  MIN_VISIBLE_ROWS,
  planDrop,
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

  it("칸이 없어도 엑셀 일정표와 같은 10행을 보여 준다", () => {
    expect(MIN_VISIBLE_ROWS).toBe(10);
    expect(visibleRowCount([], D)).toBe(10);
  });

  it("10행 안에서는 행 수가 늘지 않는다", () => {
    expect(visibleRowCount([cell(D, "a", 2)], D)).toBe(10);
    expect(visibleRowCount([cell(D, "a", 8)], D)).toBe(10);
  });

  it("마지막 행(10번째)까지 쓰면 새 칸을 넣을 빈 행 하나를 더 보여 준다", () => {
    expect(visibleRowCount([cell(D, "a", 9)], D)).toBe(11);
    expect(visibleRowCount([cell(D, "a", 12)], D)).toBe(14);
  });

  it("최대 행 수를 넘지 않는다", () => {
    expect(MAX_ROWS).toBe(30);
    expect(visibleRowCount([cell(D, "a", 29)], D)).toBe(30);
  });

  it("다른 날짜의 칸은 세지 않는다", () => {
    expect(visibleRowCount([cell("2026-11-10", "a", 15)], D)).toBe(10);
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
