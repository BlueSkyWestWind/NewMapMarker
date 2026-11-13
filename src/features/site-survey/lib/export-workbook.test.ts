import { describe, expect, it } from "vitest";
import type { Worksheet } from "exceljs";
import { DETAIL_COLUMNS } from "../constants/detail-columns";
import { TEMPLATE_COLUMN_WIDTHS } from "../constants/detail-template";
import type { BuiltRow } from "../types";
import { buildDataRows, buildOutputWorkbook, buildWarningRows, DATA_START_ROW, outputFileName } from "./export-workbook";

const row = (fileName: string, cells: Record<number, string>, warnings: BuiltRow["warnings"] = []): BuiltRow => ({
  fileName,
  cells,
  fields: [],
  warnings,
});
/** exceljs 타입에 없는 조건부 서식 목록 */
const conditionalOf = (ws: Worksheet): { ref: string }[] =>
  (ws as unknown as { conditionalFormattings: { ref: string }[] }).conditionalFormattings;
const many = (n: number): BuiltRow[] => Array.from({ length: n }, (_, i) => row(`f${i}`, { 0: "2026", 7: `국소${i}` }));

describe("outputFileName", () => {
  it("세부_입력값_YYYYMMDD.xlsx", () => {
    expect(outputFileName(new Date(2026, 10, 11))).toBe("세부_입력값_20261111.xlsx");
    expect(outputFileName(new Date(2026, 0, 5))).toBe("세부_입력값_20260105.xlsx");
  });
});

describe("buildDataRows", () => {
  it("파일당 80칸 한 줄이고 값이 없는 열은 빈 문자열이다", () => {
    const rows = buildDataRows([row("a", { 0: "2026", 7: "국소A" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(80);
    expect(rows[0][0]).toBe("2026");
    expect(rows[0][7]).toBe("국소A");
    expect(rows[0][8]).toBe("");
  });

  it("업로드 순서를 유지한다", () => {
    expect(buildDataRows([row("a", { 7: "첫째" }), row("b", { 7: "둘째" })]).map((r) => r[7])).toEqual(["첫째", "둘째"]);
  });
});

describe("buildOutputWorkbook: 양식의 값과 자리", () => {
  it("세부_입력값 시트에 머리글은 5·6행, 데이터는 7행부터다", async () => {
    expect(DATA_START_ROW).toBe(7);
    const wb = await buildOutputWorkbook([row("a", { 0: "2026", 7: "국소A" })]);
    const ws = wb.getWorksheet("세부_입력값")!;
    expect(ws.getCell("A5").value).toBe("연도");
    expect(ws.getCell("B4").value).toBe("일반현황");
    expect(ws.getCell("A7").value).toBe("2026");
    expect(ws.getCell("H7").value).toBe("국소A");
    expect(ws.getCell("A8").value).toBeNull();
    DETAIL_COLUMNS.forEach((c) => {
      expect(String(ws.getRow(5).getCell(c.index + 1).value).replace(/\s+/g, "")).toBe(c.header.replace(/\s+/g, ""));
    });
  });

  it("3행에 열별 개수 합계 수식이 있고 값이 있는 칸 수가 결과로 들어간다", async () => {
    const wb = await buildOutputWorkbook(many(3));
    const ws = wb.getWorksheet("세부_입력값")!;
    const h3 = ws.getCell("H3").value as { formula: string; result: number };
    expect(h3.formula).toBe("SUBTOTAL(3,H$7:H$39)");
    expect(h3.result).toBe(3);
    expect(ws.getCell("A3").value).toBeNull();
  });
});

describe("buildOutputWorkbook: 양식의 모양", () => {
  it("머리글은 초록 바탕에 테두리가 있다", async () => {
    const ws = (await buildOutputWorkbook([]))!.getWorksheet("세부_입력값")!;
    const fill = ws.getCell("A5").fill as { fgColor: { argb: string } };
    const rgb = fill.fgColor.argb.slice(2);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(rgb.slice(i, i + 2), 16));
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    expect(ws.getCell("A5").border?.left?.style).toBe("thin");
    expect(ws.getCell("A5").alignment?.vertical).toBe("middle");
  });

  it("왼쪽 8열·위쪽 6행이 고정되고 눈금선이 꺼져 있다", async () => {
    const ws = (await buildOutputWorkbook([])).getWorksheet("세부_입력값")!;
    expect(ws.views[0]).toMatchObject({ state: "frozen", xSplit: 8, ySplit: 6, showGridLines: false });
  });

  it("열 너비와 머리글 줄 높이가 양식과 같다", async () => {
    const ws = (await buildOutputWorkbook([])).getWorksheet("세부_입력값")!;
    TEMPLATE_COLUMN_WIDTHS.forEach((width, i) => expect(ws.getColumn(i + 1).width).toBeCloseTo(width, 2));
    expect(ws.getColumn(2).width).toBeCloseTo(12.625, 2);
    expect(ws.getRow(5).height).toBeCloseTo(39.95, 1);
  });

  it("필터가 6행 머리글에 걸리고 끝 막대가 데이터 아래에 있다", async () => {
    const ws = (await buildOutputWorkbook(many(3))).getWorksheet("세부_입력값")!;
    expect(ws.autoFilter).toBe("B6:CB39");
    const bar = ws.getCell("A39").fill as { fgColor: { argb: string } };
    expect(bar.fgColor.argb).toBe("FF000000");
  });

  it("입력 안내와 조건부 서식이 옮겨진다", async () => {
    const ws = (await buildOutputWorkbook([])).getWorksheet("세부_입력값")!;
    expect(ws.getCell("BA5").dataValidation?.prompt).toContain("아파트");
    expect(conditionalOf(ws)[0].ref).toBe("H7:H38");
  });
});

describe("buildOutputWorkbook: 데이터가 32건을 넘으면", () => {
  it("행을 늘리고 막대·필터·수식 범위가 따라간다", async () => {
    const ws = (await buildOutputWorkbook(many(40))).getWorksheet("세부_입력값")!;
    expect(ws.getCell("H46").value).toBe("국소39");
    expect(ws.getCell("A47").fill).toMatchObject({ fgColor: { argb: "FF000000" } });
    expect(ws.autoFilter).toBe("B6:CB47");
    expect((ws.getCell("H3").value as { formula: string }).formula).toBe("SUBTOTAL(3,H$7:H$47)");
    expect(conditionalOf(ws)[0].ref).toBe("H7:H46");
    expect(ws.getCell("H46").border?.left?.style).toBe("hair");
  });
});

describe("경고 시트", () => {
  it("경고가 없으면 머리글만 있다", () => {
    expect(buildWarningRows([row("a", {})])).toEqual([["파일명", "항목", "내용"]]);
  });

  it("경고마다 파일명·항목·내용 줄을 만든다", () => {
    const r = row("a.xlsx", {}, [{ fileName: "a.xlsx", field: "철탑 형태", message: "라벨을 찾지 못했습니다: 철탑형태" }]);
    expect(buildWarningRows([r])).toEqual([
      ["파일명", "항목", "내용"],
      ["a.xlsx", "철탑 형태", "라벨을 찾지 못했습니다: 철탑형태"],
    ]);
  });

  it("경고가 있을 때만 경고 시트가 더해진다", async () => {
    expect((await buildOutputWorkbook([row("a", {})])).worksheets.map((w) => w.name)).toEqual(["세부_입력값"]);
    const withWarn = await buildOutputWorkbook([row("a", {}, [{ fileName: "a", field: "x", message: "m" }])]);
    expect(withWarn.worksheets.map((w) => w.name)).toEqual(["세부_입력값", "경고"]);
  });
});
