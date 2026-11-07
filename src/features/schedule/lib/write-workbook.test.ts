import { describe, expect, it } from "vitest";
import type {
  ScheduleCell,
  ScheduleColumn,
  ScheduleDayNote,
  ScheduleMark,
} from "@/features/schedule/types";
import { buildMonthModel, computeMonthScale, monthWeekHeightPt } from "./month-layout";
import { parseWorkbookBuffer } from "./read-schedule";
import { computeWeeklyScale } from "./weekly-layout";
import {
  buildDataWorkbook,
  buildMonthlyWorkbook,
  buildWeeklyWorkbook,
} from "./write-workbook";

const COLUMNS: ScheduleColumn[] = [
  { id: "c1", sortOrder: 0, teamLabel: "1팀", leaderLabel: "팀장A" },
  { id: "c2", sortOrder: 1, teamLabel: "시험팀", leaderLabel: "" },
];
const DAY = "2026-11-09"; // 월요일
const CELLS: ScheduleCell[] = [
  {
    id: "x1",
    workDate: DAY,
    columnId: "c1",
    rowNo: 0,
    mainText: "국소1",
    subText: "모국1",
    textColor: "0070C0",
  },
  {
    id: "x2",
    workDate: DAY,
    columnId: "c1",
    rowNo: 1,
    mainText: "국소2",
    subText: "",
    textColor: null,
  },
];
const NOTES: ScheduleDayNote[] = [{ workDate: DAY, note: "메모A" }];
const MARKS: ScheduleMark[] = [{ workDate: DAY, columnId: "c2", color: "D9F2D0" }];
const INPUT = { columns: COLUMNS, cells: CELLS, dayNotes: NOTES, marks: MARKS };

/** exceljs 타입에는 없지만 실제 객체에 있는 쪽 나눔 목록. */
function rowBreaksOf(ws: unknown): unknown[] {
  return (ws as { rowBreaks?: unknown[] }).rowBreaks ?? [];
}

function argbOf(fill: unknown): string | undefined {
  return (fill as { fgColor?: { argb?: string } } | undefined)?.fgColor?.argb;
}

describe("buildWeeklyWorkbook", () => {
  async function build(weekStarts = [DAY], paper: "A3" | "A4" = "A3") {
    const wb = await buildWeeklyWorkbook({ ...INPUT, weekStarts, paper });
    return wb.getWorksheet("주간일정")!;
  }

  it("머리글: 팀장이 있으면 팀과 팀장을 두 줄로, 없으면 팀 이름만 쓴다", async () => {
    const ws = await build();
    expect(ws.getCell("A1").value).toBe("날짜");
    expect(ws.getCell("C1").value).toBe("1팀\n팀장A");
    expect(ws.getCell("E1").value).toBe("시험팀");
  });

  it("인쇄 설정: 가로, A3, 고정 확대율, 머리글 반복, 맞춤 인쇄 아님", async () => {
    const ws = await build();
    expect(ws.pageSetup.orientation).toBe("landscape");
    expect(ws.pageSetup.paperSize).toBe(8);
    expect(ws.pageSetup.scale).toBe(
      computeWeeklyScale({ paper: "A3", columnCount: 2, weekRowCounts: [70] }),
    );
    expect(ws.pageSetup.fitToPage).toBeFalsy();
    expect(ws.pageSetup.printTitlesRow).toBe("1:1");
  });

  it("A4는 용지 코드 9다", async () => {
    const ws = await build([DAY], "A4");
    expect(ws.pageSetup.paperSize).toBe(9);
  });

  it("쪽 나눔이 주 수만큼 들어간다", async () => {
    expect(rowBreaksOf(await build())).toHaveLength(1);
    expect(rowBreaksOf(await build([DAY, "2026-11-16"]))).toHaveLength(2);
  });

  it("날짜·요일은 블록 3번째 행, 날짜 메모는 4번째 행에 쓴다", async () => {
    const ws = await build();
    // 머리글 1행 다음부터 월요일 블록이 2행에서 시작한다.
    expect(ws.getCell("A4").value).toBe(DAY);
    expect(ws.getCell("B4").value).toBe("월요일");
    expect(ws.getCell("B5").value).toBe("메모A");
  });

  it("토요일은 파랑, 일요일은 빨강 글자이고 일요일 블록 윗줄은 빨강이다", async () => {
    const ws = await build();
    expect(ws.getCell("A54").font?.color?.argb).toBe("FF0070C0"); // 토요일 블록 3번째 행
    expect(ws.getCell("A64").font?.color?.argb).toBe("FFFF0000"); // 일요일 블록 3번째 행
    expect(ws.getCell("A62").border?.top?.color?.argb).toBe("FFFF0000");
  });

  it("칸 값은 팀의 앞 칸·뒤 칸에 들어가고 글자색이 앞·뒤 모두에 적용된다", async () => {
    const ws = await build();
    expect(ws.getCell("C2").value).toBe("국소1");
    expect(ws.getCell("D2").value).toBe("모국1");
    expect(ws.getCell("C2").font?.color?.argb).toBe("FF0070C0");
    expect(ws.getCell("D2").font?.color?.argb).toBe("FF0070C0");
    expect(ws.getCell("C3").font?.color?.argb).not.toBe("FF0070C0");
  });

  it("칸은 줄바꿈 없이 칸 안에서 글자 크기를 줄여 맞춘다", async () => {
    const ws = await build();
    expect(ws.getCell("C2").alignment?.shrinkToFit).toBe(true);
    expect(ws.getCell("C2").alignment?.wrapText).toBeFalsy();
  });

  it("날짜×팀 색은 그 날의 두 칸 모든 행을 채운다", async () => {
    const ws = await build();
    expect(argbOf(ws.getCell("E2").fill)).toBe("FFD9F2D0");
    expect(argbOf(ws.getCell("F11").fill)).toBe("FFD9F2D0");
    expect(argbOf(ws.getCell("E12").fill)).not.toBe("FFD9F2D0"); // 다음 날 블록
    expect(argbOf(ws.getCell("C2").fill)).not.toBe("FFD9F2D0"); // 다른 팀
  });
});

describe("buildDataWorkbook", () => {
  const dates = Array.from({ length: 7 }, (_, i) => `2026-11-${String(9 + i).padStart(2, "0")}`);

  it("범례 4행과 날짜 형식을 쓴다", async () => {
    const wb = await buildDataWorkbook({ ...INPUT, dates });
    const ws = wb.getWorksheet("일정표_New")!;
    expect(ws.getCell("A1").value).toBe("중장비");
    expect(argbOf(ws.getCell("A1").fill)).toBe("FFD9F2D0");
    expect(argbOf(ws.getCell("A2").fill)).toBe("FFF2CFEE");
    expect(ws.getCell("A3").value).toBe("축전지수거");
    expect(ws.getCell("A3").font?.color?.argb).toBe("FF0070C0");
    expect(argbOf(ws.getCell("A4").fill)).toBe("FF4E95D9");
    expect(ws.getCell("A7").numFmt).toBe("m/d/yy");
  });

  it("왕복: 내려받은 파일을 다시 읽으면 같은 일정이 나온다", async () => {
    const wb = await buildDataWorkbook({ ...INPUT, dates });
    const result = await parseWorkbookBuffer((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    if ("error" in result) throw new Error(result.error);
    const { parsed } = result;
    expect(parsed.columns).toEqual([
      { index: 0, teamLabel: "1팀", leaderLabel: "팀장A" },
      { index: 1, teamLabel: "시험팀", leaderLabel: "" },
    ]);
    expect(parsed.cells).toEqual([
      { workDate: DAY, columnIndex: 0, rowNo: 0, mainText: "국소1", subText: "모국1", textColor: "0070C0" },
      { workDate: DAY, columnIndex: 0, rowNo: 1, mainText: "국소2", subText: "", textColor: null },
    ]);
    expect(parsed.dayNotes).toEqual([{ workDate: DAY, note: "메모A" }]);
    expect(parsed.marks).toEqual([{ workDate: DAY, columnIndex: 1, color: "D9F2D0" }]);
    expect(parsed.firstDate).toBe("2026-11-09");
    expect(parsed.lastDate).toBe("2026-11-15");
    expect(parsed.ignoredCount).toBe(0);
  });

  it("왕복: 날짜 메모·색·글자색이 없는 입력도 같게 돌아온다", async () => {
    const plain = [{ ...CELLS[1] }];
    const wb = await buildDataWorkbook({
      columns: COLUMNS,
      cells: plain,
      dayNotes: [],
      marks: [],
      dates,
    });
    const result = await parseWorkbookBuffer((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    if ("error" in result) throw new Error(result.error);
    expect(result.parsed.cells).toHaveLength(1);
    expect(result.parsed.dayNotes).toEqual([]);
    expect(result.parsed.marks).toEqual([]);
    expect(result.parsed.cells[0].textColor).toBeNull();
  });
});

describe("buildMonthlyWorkbook", () => {
  async function build() {
    const wb = await buildMonthlyWorkbook({ ...INPUT, month: "2026-11", paper: "A3" });
    return wb.getWorksheet("월간일정")!;
  }

  it("제목과 요일 머리글을 쓴다", async () => {
    const ws = await build();
    expect(ws.getCell("A1").value).toBe("2026년 11월");
    expect(ws.getCell("A2").value).toBe("월");
    expect(ws.getCell("G2").value).toBe("일");
  });

  it("인쇄 설정: 가로, A3, 계산된 확대율, 쪽 나눔 없음", async () => {
    const ws = await build();
    const model = buildMonthModel({ ...INPUT, month: "2026-11" });
    expect(ws.pageSetup.orientation).toBe("landscape");
    expect(ws.pageSetup.paperSize).toBe(8);
    expect(ws.pageSetup.scale).toBe(
      computeMonthScale({ paper: "A3", weekHeightsPt: model.weeks.map(monthWeekHeightPt) }),
    );
    expect(rowBreaksOf(ws)).toHaveLength(0);
  });

  it("11월은 6주 행이고 달 밖 날짜는 연한 회색이다", async () => {
    const ws = await build();
    // 3행이 첫 주(10/26~11/1), 8행이 마지막 주.
    expect(argbOf(ws.getCell("A3").fill)).toBe("FFF2F2F2");
    expect(argbOf(ws.getCell("G3").fill)).not.toBe("FFF2F2F2");
    expect(ws.getCell("A8").value).toBeTruthy();
    expect(ws.getCell("A9").value).toBeNull();
  });

  it("일정이 있는 날 칸에 날짜·메모·팀 줄을 서식 있는 글로 쓴다", async () => {
    const ws = await build();
    // 3주째(11/9~11/15) 행은 5행, 월요일은 A열.
    const cell = ws.getCell("A5");
    expect(cell.alignment?.wrapText).toBe(true);
    const runs = (cell.value as { richText: { text: string; font?: { color?: { argb?: string } } }[] })
      .richText;
    const joined = runs.map((run) => run.text).join("");
    expect(joined.startsWith("9")).toBe(true);
    expect(joined).toContain("메모A");
    expect(joined).toContain("1팀 · 국소1 (모국1), 국소2");
    const entryRun = runs.find((run) => run.text.startsWith("국소1"));
    expect(entryRun?.font?.color?.argb).toBe("FF0070C0");
  });

  it("달 밖 날짜는 월/일로 쓴다", async () => {
    const ws = await build();
    const runs = (ws.getCell("A3").value as { richText: { text: string }[] }).richText;
    expect(runs[0].text).toBe("10/26");
  });
});
