import { describe, expect, it } from "vitest";
import type { ScheduleCell, ScheduleColumn } from "@/features/schedule/types";
import {
  CLICKED_NEW_KEY,
  columnLabel,
  initialCompanions,
  initialDrafts,
  nextTextColor,
} from "./cell-dialog-helpers";

function makeColumn(
  overrides: Partial<ScheduleColumn> = {},
): ScheduleColumn {
  return {
    id: "col-1",
    teamLabel: "1팀",
    leaderLabel: "",
    sortOrder: 1,
    ...overrides,
  };
}

function makeCell(
  rowNo: number,
  mainText: string,
  subText = "",
): ScheduleCell {
  return {
    id: `2026-11-15-col-1-${rowNo}`,
    workDate: "2026-11-15",
    columnId: "col-1",
    rowNo,
    mainText,
    subText,
    textColor: null,
  };
}

describe("columnLabel", () => {
  it("팀장이 있으면 '팀 · 팀장'으로 표시한다", () => {
    expect(columnLabel(makeColumn({ teamLabel: "1팀", leaderLabel: "홍길동" }))).toBe(
      "1팀 · 홍길동",
    );
  });

  it("팀장이 없으면 팀 이름만 표시한다", () => {
    expect(columnLabel(makeColumn({ teamLabel: "1팀", leaderLabel: "" }))).toBe(
      "1팀",
    );
  });
});

describe("nextTextColor", () => {
  it("없음(null) → 파랑(0070C0) → 빨강(FF0000) → 없음(null) 한 바퀴를 돈다", () => {
    const first = nextTextColor(null);
    const second = nextTextColor(first);
    const third = nextTextColor(second);
    expect(first).toBe("0070C0");
    expect(second).toBe("FF0000");
    expect(third).toBeNull();
  });
});

describe("initialDrafts", () => {
  const position = { workDate: "2026-11-15", columnId: "col-1", rowNo: 2 };
  const cells = [makeCell(1, "국소A"), makeCell(3, "국소C")];

  it("기존 칸을 열면 draftsFromCells 결과를 그대로 돌려준다", () => {
    const drafts = initialDrafts(cells, { cell: cells[0], position });
    expect(drafts.map((d) => d.mainText)).toEqual(["국소A", "국소C"]);
  });

  it("빈 행을 클릭해 열면 rowNo 순서에 맞춰 빈 항목을 끼워 넣는다", () => {
    const drafts = initialDrafts(cells, { cell: null, position });
    expect(drafts.map((d) => ({ key: d.key, rowNo: d.rowNo }))).toEqual([
      { key: cells[0].id, rowNo: 1 },
      { key: CLICKED_NEW_KEY, rowNo: 2 },
      { key: cells[1].id, rowNo: 3 },
    ]);
  });

  it("클릭한 빈 행이 기존 행보다 뒤면 맨 끝에 붙인다", () => {
    const drafts = initialDrafts(cells, {
      cell: null,
      position: { workDate: "2026-11-15", columnId: "col-1", rowNo: 5 },
    });
    expect(drafts.map((d) => d.rowNo)).toEqual([1, 3, 5]);
    expect(drafts[2].key).toBe(CLICKED_NEW_KEY);
  });
});

describe("initialCompanions", () => {
  it("입회·신호수 칸 유무와 이름을 초기 상태로 만든다", () => {
    const cells = [
      makeCell(1, "국소A"),
      makeCell(5, "", "입회 : 김철수"),
    ];
    const result = initialCompanions(cells, {
      workDate: "2026-11-15",
      columnId: "col-1",
      rowNo: 1,
    });
    expect(result).toEqual({
      입회: { enabled: true, names: "김철수" },
      신호수: { enabled: false, names: "" },
    });
  });
});
