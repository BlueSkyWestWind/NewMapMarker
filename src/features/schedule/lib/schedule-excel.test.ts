import { describe, expect, it } from "vitest";
import type {
  ScheduleCell,
  ScheduleColumn,
  ScheduleDayNote,
  ScheduleMark,
} from "@/features/schedule/types";
import {
  buildExportRows,
  EXPORT_MIN_ROWS,
  matchColumns,
  normalizeTextColor,
  parseScheduleRows,
  parseSheetDate,
  planImport,
  toExcelSerial,
  type ParsedSchedule,
} from "./schedule-excel";

describe("parseSheetDate", () => {
  it("m/d/yy 와 m/d/yyyy 를 읽는다", () => {
    expect(parseSheetDate("6/29/26")).toBe("2026-06-29");
    expect(parseSheetDate("11/9/2026")).toBe("2026-11-09");
  });

  it("yyyy-mm-dd 를 읽는다", () => {
    expect(parseSheetDate("2026-11-09")).toBe("2026-11-09");
  });

  it("엑셀 일련번호를 읽는다", () => {
    expect(parseSheetDate(toExcelSerial("2026-11-09"))).toBe("2026-11-09");
  });

  it("날짜가 아닌 값은 null이다", () => {
    expect(parseSheetDate("끝")).toBeNull();
    expect(parseSheetDate("")).toBeNull();
    expect(parseSheetDate(undefined)).toBeNull();
    expect(parseSheetDate("13/40/26")).toBeNull();
  });
});

describe("toExcelSerial", () => {
  it("엑셀 기준 일련번호를 준다", () => {
    expect(toExcelSerial("1900-03-01")).toBe(61);
    expect(toExcelSerial("2026-11-09")).toBe(toExcelSerial("2026-11-08") + 1);
  });
});

describe("normalizeTextColor", () => {
  it("파랑 계열은 0070C0 하나로 합친다", () => {
    expect(normalizeTextColor("0070C0")).toBe("0070C0");
    expect(normalizeTextColor("00B0F0")).toBe("0070C0");
    expect(normalizeTextColor("THEME4")).toBe("0070C0");
  });

  it("빨강은 따로 둔다", () => {
    expect(normalizeTextColor("FF0000")).toBe("FF0000");
  });

  it("검정·테마 기본·없음·그 밖의 색은 null이다", () => {
    expect(normalizeTextColor("000000")).toBeNull();
    expect(normalizeTextColor("THEME1")).toBeNull();
    expect(normalizeTextColor(null)).toBeNull();
    expect(normalizeTextColor("123456")).toBeNull();
  });
});

const LABEL_ROW = ["", "", "1팀", "", "", ""];
const HEADER_ROW = ["날짜", "", "팀장A", "", "시험팀", ""];

describe("parseScheduleRows", () => {
  const rows: unknown[][] = [
    LABEL_ROW,
    HEADER_ROW,
    ["6/29/26", "월요일", "국소1", "모국1", "시험건", ""],
    ["6/29/26", "", "국소2", "", "", ""],
    ["6/29/26", "", "`", "", "", ""],
    ["6/30/26", "화요일", "", "", "", ""],
    ["끝", "끝"],
  ];

  it("열·칸·날짜 범위를 읽고 기호만 있는 칸은 무시 건수로 센다", () => {
    const parsed = parseScheduleRows(rows)!;
    expect(parsed.columns).toEqual([
      { index: 0, teamLabel: "1팀", leaderLabel: "팀장A" },
      { index: 1, teamLabel: "시험팀", leaderLabel: "" },
    ]);
    expect(parsed.cells).toEqual([
      { workDate: "2026-06-29", columnIndex: 0, rowNo: 0, mainText: "국소1", subText: "모국1", textColor: null },
      { workDate: "2026-06-29", columnIndex: 1, rowNo: 0, mainText: "시험건", subText: "", textColor: null },
      { workDate: "2026-06-29", columnIndex: 0, rowNo: 1, mainText: "국소2", subText: "", textColor: null },
    ]);
    expect(parsed.dayCount).toBe(2);
    expect(parsed.firstDate).toBe("2026-06-29");
    expect(parsed.lastDate).toBe("2026-06-30");
    expect(parsed.ignoredCount).toBe(1);
  });

  it("헤더가 없으면 null이다", () => {
    expect(parseScheduleRows([["a", "b"], ["c", "d"]])).toBeNull();
  });

  it("같은 날짜가 떨어져서 두 번 나와도 행 번호가 이어진다", () => {
    const parsed = parseScheduleRows([
      LABEL_ROW,
      HEADER_ROW,
      ["6/29/26", "", "가", "", "", ""],
      ["6/30/26", "", "나", "", "", ""],
      ["6/29/26", "", "다", "", "", ""],
    ])!;
    const day29 = parsed.cells.filter((cell) => cell.workDate === "2026-06-29");
    expect(day29.map((cell) => [cell.mainText, cell.rowNo])).toEqual([
      ["가", 0],
      ["다", 1],
    ]);
  });

  it("500자를 넘는 칸 글은 500자로 자르고 무시 건수로 센다(DB 제약 500자)", () => {
    const parsed = parseScheduleRows([
      LABEL_ROW,
      HEADER_ROW,
      ["6/29/26", "", "가".repeat(501), "나".repeat(500), "", ""],
    ])!;
    expect(parsed.cells[0].mainText).toHaveLength(500);
    expect(parsed.cells[0].subText).toHaveLength(500);
    expect(parsed.ignoredCount).toBe(1);
  });

  it("헤더 쌍 범위 밖의 값은 무시 건수로 센다", () => {
    const parsed = parseScheduleRows([
      LABEL_ROW,
      HEADER_ROW,
      ["6/29/26", "", "가", "", "", "", "범위밖"],
    ])!;
    expect(parsed.cells).toHaveLength(1);
    expect(parsed.ignoredCount).toBe(1);
  });

  describe("날짜 메모", () => {
    const base = (b: string[]): unknown[][] => [
      LABEL_ROW,
      HEADER_ROW,
      ...b.map((value, index) => ["6/29/26", index === 0 ? "월요일" : value, "", "", "", ""]),
    ];

    it("블록 4번째 행 B열 이름이 그 날짜의 메모다", () => {
      const parsed = parseScheduleRows(base(["", "", "", "담당A"]))!;
      expect(parsed.dayNotes).toEqual([{ workDate: "2026-06-29", note: "담당A" }]);
    });

    it("여러 개면 중복을 빼고 쉼표로 합친다", () => {
      const parsed = parseScheduleRows(base(["", "담당A", "담당B", "담당A"]))!;
      expect(parsed.dayNotes).toEqual([{ workDate: "2026-06-29", note: "담당A, 담당B" }]);
    });

    it("요일은 메모가 아니고, 메모가 없으면 항목이 없다", () => {
      const parsed = parseScheduleRows(base(["", "", "", ""]))!;
      expect(parsed.dayNotes).toEqual([]);
    });

    it("101자 값은 100자로 자른다", () => {
      const parsed = parseScheduleRows(base(["", "", "", "가".repeat(101)]))!;
      expect(parsed.dayNotes[0].note).toHaveLength(100);
    });
  });

  describe("칸 색", () => {
    const colored: unknown[][] = [
      LABEL_ROW,
      HEADER_ROW,
      ["6/29/26", "월요일", "국소1", "", "", ""],
      ["6/29/26", "", "국소2", "", "", ""],
      ["6/30/26", "화요일", "국소3", "", "", ""],
    ];

    it("블록 첫 행·팀 앞 칸의 배경색이 그 날짜×열의 색이다", () => {
      const parsed = parseScheduleRows(colored, {
        fillAt: (row, col) => (row === 2 && col === 2 ? "D9F2D0" : null),
      })!;
      expect(parsed.marks).toEqual([{ workDate: "2026-06-29", columnIndex: 0, color: "D9F2D0" }]);
    });

    it("5색 외 색과 색 없음은 무시한다", () => {
      const parsed = parseScheduleRows(colored, {
        fillAt: (row, col) => (row === 2 && col === 2 ? "FFFFFF" : null),
      })!;
      expect(parsed.marks).toEqual([]);
    });

    it("첫 행이 아니라 둘째 행만 색이 있으면 색이 아니다", () => {
      const parsed = parseScheduleRows(colored, {
        fillAt: (row, col) => (row === 3 && col === 2 ? "D9F2D0" : null),
      })!;
      expect(parsed.marks).toEqual([]);
    });

    it("fillAt을 안 주면 색을 읽지 않는다", () => {
      expect(parseScheduleRows(colored)!.marks).toEqual([]);
    });
  });

  describe("글자색", () => {
    const rows2: unknown[][] = [
      LABEL_ROW,
      HEADER_ROW,
      ["6/29/26", "월요일", "국소1", "", "", ""],
      ["6/29/26", "", "", "스카이", "", ""],
    ];

    it("팀 앞 칸의 글자색을 정리해 담는다", () => {
      const parsed = parseScheduleRows(rows2, {
        textColorAt: (row, col) => (row === 2 && col === 2 ? "00B0F0" : null),
      })!;
      expect(parsed.cells[0].textColor).toBe("0070C0");
    });

    it("앞 칸이 비어 있으면 뒤 칸의 글자색을 쓴다", () => {
      const parsed = parseScheduleRows(rows2, {
        textColorAt: (row, col) => (row === 3 && col === 3 ? "FF0000" : null),
      })!;
      expect(parsed.cells[1].textColor).toBe("FF0000");
    });

    it("textColorAt을 안 주면 모두 null이다", () => {
      expect(parseScheduleRows(rows2)!.cells.map((cell) => cell.textColor)).toEqual([null, null]);
    });
  });
});

const COL_A: ScheduleColumn = { id: "col-a", sortOrder: 0, teamLabel: "1팀", leaderLabel: "팀장A" };
const COL_B: ScheduleColumn = { id: "col-b", sortOrder: 1, teamLabel: "시험팀", leaderLabel: "" };
const DAY = "2026-11-09";

function makeCell(
  columnId: string,
  rowNo: number,
  mainText: string,
  subText = "",
  textColor: ScheduleCell["textColor"] = null,
  workDate = DAY,
): ScheduleCell {
  return { id: `${workDate}-${columnId}-${rowNo}`, workDate, columnId, rowNo, mainText, subText, textColor };
}

describe("buildExportRows", () => {
  const cells = [makeCell("col-a", 0, "국소1", "모국1", "0070C0")];
  const dayNotes: ScheduleDayNote[] = [{ workDate: DAY, note: "메모A" }];
  const marks: ScheduleMark[] = [{ workDate: DAY, columnId: "col-b", color: "D9F2D0" }];
  const built = buildExportRows({ dates: [DAY], columns: [COL_A, COL_B], cells, dayNotes, marks });

  it("범례 4행 + 팀 라벨 행 + 헤더 행 + 날짜 블록 10행이다", () => {
    expect(EXPORT_MIN_ROWS).toBe(10);
    expect(built.rows).toHaveLength(6 + 10);
    expect(built.rows[0][0]).toBe("중장비");
    expect(built.rows[1][0]).toBe("승주");
    expect(built.rows[2][0]).toBe("축전지수거");
    expect(built.rows[3][0]).toBe("K대응");
    expect(built.rows[4]).toEqual(["", "", "1팀", "", "", ""]);
    expect(built.rows[5]).toEqual(["날짜", "요일", "팀장A", "", "시험팀", ""]);
  });

  it("날짜 블록의 날짜·요일·메모·칸을 쓴다", () => {
    expect(built.rows[6][0]).toBe(toExcelSerial(DAY));
    expect(built.rows[6][1]).toBe("월요일");
    expect(built.rows[7][1]).toBe("");
    expect(built.rows[9][1]).toBe("메모A");
    expect(built.rows[6][2]).toBe("국소1");
    expect(built.rows[6][3]).toBe("모국1");
    expect(built.rows[15][0]).toBe(toExcelSerial(DAY));
    expect(built.dateRowIndexes).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("칸 색은 그 블록 10행 × 두 칸이고, 범례 칸 색 3개가 따로 있다", () => {
    const blockFills = built.fills.filter((fill) => fill.rowIndex >= 6);
    expect(blockFills).toHaveLength(20);
    expect(blockFills.every((fill) => fill.color === "D9F2D0" && [4, 5].includes(fill.colIndex))).toBe(true);
    const legend = built.fills.filter((fill) => fill.colIndex === 0 && fill.rowIndex < 4);
    expect(legend).toEqual([
      { rowIndex: 0, colIndex: 0, color: "D9F2D0" },
      { rowIndex: 1, colIndex: 0, color: "F2CFEE" },
      { rowIndex: 3, colIndex: 0, color: "4E95D9" },
    ]);
  });

  it("글자색은 칸의 앞·뒤 두 칸과 범례의 축전지수거다", () => {
    expect(built.fonts).toEqual([
      { rowIndex: 2, colIndex: 0, color: "0070C0" },
      { rowIndex: 6, colIndex: 2, color: "0070C0" },
      { rowIndex: 6, colIndex: 3, color: "0070C0" },
    ]);
  });

  it("행 번호 11인 칸이 있으면 그 날짜 블록은 12행이다", () => {
    const tall = buildExportRows({
      dates: [DAY],
      columns: [COL_A, COL_B],
      cells: [makeCell("col-a", 11, "아래")],
      dayNotes: [],
      marks: [],
    });
    expect(tall.rows).toHaveLength(6 + 12);
  });

  it("왕복: 내보낸 행을 다시 읽으면 같은 일정이 나온다(팀장 있는 열과 없는 열)", () => {
    const fillMap = new Map(built.fills.map((fill) => [`${fill.rowIndex}|${fill.colIndex}`, fill.color]));
    const fontMap = new Map(built.fonts.map((font) => [`${font.rowIndex}|${font.colIndex}`, font.color]));
    const parsed = parseScheduleRows(built.rows, {
      fillAt: (row, col) => fillMap.get(`${row}|${col}`) ?? null,
      textColorAt: (row, col) => fontMap.get(`${row}|${col}`) ?? null,
    })!;
    expect(parsed.columns).toEqual([
      { index: 0, teamLabel: "1팀", leaderLabel: "팀장A" },
      { index: 1, teamLabel: "시험팀", leaderLabel: "" },
    ]);
    expect(parsed.cells).toEqual([
      { workDate: DAY, columnIndex: 0, rowNo: 0, mainText: "국소1", subText: "모국1", textColor: "0070C0" },
    ]);
    expect(parsed.dayNotes).toEqual([{ workDate: DAY, note: "메모A" }]);
    expect(parsed.marks).toEqual([{ workDate: DAY, columnIndex: 1, color: "D9F2D0" }]);
    expect(parsed.firstDate).toBe(DAY);
    expect(parsed.lastDate).toBe(DAY);
    expect(parsed.ignoredCount).toBe(0);
  });
});

describe("matchColumns", () => {
  const existing: ScheduleColumn[] = [
    { id: "x", sortOrder: 0, teamLabel: "1팀", leaderLabel: "" },
    { id: "y", sortOrder: 1, teamLabel: "시험팀", leaderLabel: "" },
  ];

  it("라벨이 같으면 그 열이다(순서가 달라도)", () => {
    expect(
      matchColumns(
        [
          { index: 0, teamLabel: "시험팀", leaderLabel: "" },
          { index: 1, teamLabel: "1팀", leaderLabel: "" },
        ],
        existing,
      ),
    ).toEqual(["y", "x"]);
  });

  it("라벨이 다르면 같은 번째 열로 대신한다", () => {
    expect(matchColumns([{ index: 0, teamLabel: "3팀", leaderLabel: "" }], existing)).toEqual(["x"]);
  });

  it("기존 열보다 많으면 null이다", () => {
    expect(
      matchColumns(
        [
          { index: 0, teamLabel: "1팀", leaderLabel: "" },
          { index: 1, teamLabel: "시험팀", leaderLabel: "" },
          { index: 2, teamLabel: "새팀", leaderLabel: "" },
        ],
        existing,
      ),
    ).toEqual(["x", "y", null]);
  });

  it("이미 라벨로 맞춘 열은 번째 대체에 다시 쓰지 않는다", () => {
    expect(
      matchColumns(
        [
          { index: 0, teamLabel: "9팀", leaderLabel: "" },
          { index: 1, teamLabel: "1팀", leaderLabel: "" },
        ],
        existing,
      ),
    ).toEqual([null, "x"]);
  });
});

describe("planImport", () => {
  const existing: ScheduleColumn[] = [COL_A, COL_B];
  const parsed: ParsedSchedule = {
    columns: [
      { index: 0, teamLabel: "1팀", leaderLabel: "팀장A" },
      { index: 1, teamLabel: "시험팀", leaderLabel: "팀장B" },
      { index: 2, teamLabel: "새팀", leaderLabel: "" },
    ],
    cells: [
      { workDate: "2026-11-09", columnIndex: 0, rowNo: 0, mainText: "가", subText: "", textColor: "0070C0" },
      { workDate: "2026-11-10", columnIndex: 1, rowNo: 0, mainText: "나", subText: "", textColor: null },
      { workDate: "2026-11-10", columnIndex: 2, rowNo: 0, mainText: "열없음", subText: "", textColor: null },
      { workDate: "2026-11-10", columnIndex: 0, rowNo: 30, mainText: "행초과", subText: "", textColor: null },
    ],
    dayNotes: [
      { workDate: "2026-11-09", note: "메모1" },
      { workDate: "2026-11-10", note: "메모2" },
    ],
    marks: [
      { workDate: "2026-11-09", columnIndex: 0, color: "D9F2D0" },
      { workDate: "2026-11-10", columnIndex: 1, color: "4E95D9" },
    ],
    dayCount: 2,
    firstDate: "2026-11-09",
    lastDate: "2026-11-10",
    ignoredCount: 0,
  };

  it("시작일이 첫 날짜와 같으면 전부 넣고, 열 없음·행 초과는 건너뛴 건수로 센다", () => {
    const plan = planImport(parsed, existing, "2026-11-09")!;
    expect(plan.deleteFrom).toBe("2026-11-09");
    expect(plan.deleteTo).toBe("2026-11-10");
    expect(plan.inserts).toEqual([
      { workDate: "2026-11-09", columnId: "col-a", rowNo: 0, mainText: "가", subText: "", textColor: "0070C0" },
      { workDate: "2026-11-10", columnId: "col-b", rowNo: 0, mainText: "나", subText: "", textColor: null },
    ]);
    expect(plan.days).toEqual([
      { workDate: "2026-11-09", note: "메모1" },
      { workDate: "2026-11-10", note: "메모2" },
    ]);
    expect(plan.marks).toEqual([
      { workDate: "2026-11-09", columnId: "col-a", color: "D9F2D0" },
      { workDate: "2026-11-10", columnId: "col-b", color: "4E95D9" },
    ]);
    expect(plan.skippedCount).toBe(2);
  });

  it("시작일 이전의 칸·메모·색은 제외하고 삭제 범위도 시작일부터다", () => {
    const plan = planImport(parsed, existing, "2026-11-10")!;
    expect(plan.deleteFrom).toBe("2026-11-10");
    expect(plan.inserts.map((insert) => insert.mainText)).toEqual(["나"]);
    expect(plan.days).toEqual([{ workDate: "2026-11-10", note: "메모2" }]);
    expect(plan.marks).toEqual([{ workDate: "2026-11-10", columnId: "col-b", color: "4E95D9" }]);
  });

  it("바뀐 팀장만 columnUpdates에 담는다", () => {
    const plan = planImport(parsed, existing, "2026-11-09")!;
    expect(plan.columnUpdates).toEqual([{ id: "col-b", leaderLabel: "팀장B" }]);
  });

  it("칸·메모·색이 모두 없으면 null이다", () => {
    expect(planImport({ ...parsed, cells: [], dayNotes: [], marks: [] }, existing, "2026-11-09")).toBeNull();
    expect(planImport(parsed, existing, "2026-12-01")).toBeNull();
  });

  it("메모만 있어도 null이 아니다", () => {
    const plan = planImport({ ...parsed, cells: [], marks: [] }, existing, "2026-11-09");
    expect(plan).not.toBeNull();
    expect(plan!.days).toHaveLength(2);
  });
});
