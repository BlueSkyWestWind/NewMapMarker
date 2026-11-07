import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { buildFillAt, parseWorkbookBuffer } from "./read-schedule";

const HEADER_NOT_FOUND = "일정표 형식(A열 '날짜' 머리글)을 찾지 못했습니다.";
const NO_SCHEDULE = "가져올 일정이 없습니다.";

/** 팀 둘(1팀/팀장A, 시험팀)짜리 일정표 시트를 만든다. */
function addScheduleSheet(wb: ExcelJS.Workbook, name: string, dataRows: unknown[][]) {
  const ws = wb.addWorksheet(name);
  ws.addRow(["", "", "1팀", "", "", ""]);
  ws.addRow(["날짜", "요일", "팀장A", "", "시험팀", ""]);
  dataRows.forEach((row) => ws.addRow(row));
  return ws;
}

async function toBuffer(wb: ExcelJS.Workbook) {
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("parseWorkbookBuffer", () => {
  it("일정표_New 시트의 열·칸을 읽는다", async () => {
    const wb = new ExcelJS.Workbook();
    addScheduleSheet(wb, "일정표_New", [["6/29/26", "월요일", "국소1", "모국1", "", ""]]);
    const result = await parseWorkbookBuffer(await toBuffer(wb));
    if ("error" in result) throw new Error(result.error);
    expect(result.sheetName).toBe("일정표_New");
    expect(result.parsed.columns.map((column) => column.teamLabel)).toEqual(["1팀", "시험팀"]);
    expect(result.parsed.cells).toHaveLength(1);
    expect(result.parsed.cells[0]).toMatchObject({ mainText: "국소1", subText: "모국1" });
  });

  it("숨김 시트는 건너뛰고, 일정표_New가 없으면 헤더가 있는 첫 보이는 시트를 읽는다", async () => {
    const wb = new ExcelJS.Workbook();
    const old = addScheduleSheet(wb, "일정표_Old", [["6/29/26", "", "옛것", "", "", ""]]);
    old.state = "hidden";
    addScheduleSheet(wb, "시트B", [["6/29/26", "", "새것", "", "", ""]]);
    const result = await parseWorkbookBuffer(await toBuffer(wb));
    if ("error" in result) throw new Error(result.error);
    expect(result.sheetName).toBe("시트B");
    expect(result.parsed.cells[0].mainText).toBe("새것");
  });

  it("일정표_New가 있으면 다른 보이는 시트보다 먼저 쓴다", async () => {
    const wb = new ExcelJS.Workbook();
    addScheduleSheet(wb, "시트A", [["6/29/26", "", "다른것", "", "", ""]]);
    addScheduleSheet(wb, "일정표_New", [["6/29/26", "", "이것", "", "", ""]]);
    const result = await parseWorkbookBuffer(await toBuffer(wb));
    if ("error" in result) throw new Error(result.error);
    expect(result.sheetName).toBe("일정표_New");
  });

  it("헤더가 없으면 오류 문구를 준다", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("시트").addRow(["a", "b"]);
    expect(await parseWorkbookBuffer(await toBuffer(wb))).toEqual({ error: HEADER_NOT_FOUND });
  });

  it("칸이 하나도 없으면 오류 문구를 준다", async () => {
    const wb = new ExcelJS.Workbook();
    addScheduleSheet(wb, "일정표_New", [["6/29/26", "월요일", "", "", "", ""]]);
    expect(await parseWorkbookBuffer(await toBuffer(wb))).toEqual({ error: NO_SCHEDULE });
  });

  it("배경색과 글자색을 읽는다(파랑 계열은 합치고 검정은 없음)", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = addScheduleSheet(wb, "일정표_New", [
      ["6/29/26", "월요일", "국소1", "", "", ""],
      ["6/29/26", "", "국소2", "", "", ""],
      ["6/29/26", "", "", "스카이", "", ""],
      ["6/29/26", "", "국소4", "", "", ""],
      ["6/29/26", "", "국소5", "", "", ""],
    ]);
    // 데이터 첫 행은 시트의 3행이다.
    ws.getCell("C3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9F2D0" } };
    ws.getCell("C3").font = { color: { argb: "FF0070C0" } };
    ws.getCell("C4").font = { color: { argb: "FF00B0F0" } };
    ws.getCell("D5").font = { color: { argb: "FFFF0000" } };
    ws.getCell("C6").font = { color: { theme: 4 } };
    ws.getCell("C7").font = { color: { argb: "FF000000" } };

    const result = await parseWorkbookBuffer(await toBuffer(wb));
    if ("error" in result) throw new Error(result.error);
    expect(result.parsed.marks).toEqual([
      { workDate: "2026-06-29", columnIndex: 0, color: "D9F2D0" },
    ]);
    expect(result.parsed.cells.map((cell) => [cell.mainText || cell.subText, cell.textColor])).toEqual([
      ["국소1", "0070C0"],
      ["국소2", "0070C0"],
      ["스카이", "FF0000"],
      ["국소4", "0070C0"],
      ["국소5", null],
    ]);
  });
});

describe("buildFillAt", () => {
  const ws = XLSX.utils.aoa_to_sheet([["a", "b", "c"]]);
  ws["A1"].s = { patternType: "solid", fgColor: { rgb: "FFD9F2D0" } };
  ws["B1"].s = { patternType: "none" };
  ws["C1"].s = { patternType: "solid", fgColor: { rgb: "4e95d9" } };
  const fillAt = buildFillAt(ws);

  it("알파가 붙은 8자리 색도 6자리 대문자로 준다", () => {
    expect(fillAt(0, 0)).toBe("D9F2D0");
    expect(fillAt(0, 2)).toBe("4E95D9");
  });

  it("채움이 없거나 셀이 없으면 null이다", () => {
    expect(fillAt(0, 1)).toBeNull();
    expect(fillAt(5, 5)).toBeNull();
  });
});
