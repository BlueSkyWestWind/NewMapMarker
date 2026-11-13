// 결과 엑셀: 세부 시트 양식(초록 머리글·필터 줄·회색 열·테두리·검정 막대)을 그대로 따른다.
// 1~6행은 머리글 블록, 데이터는 7행부터 파일당 1줄, 데이터 아래에 끝 막대 행이 있다.
// `exceljs`는 홈 번들에 들어가지 않도록 내려받을 때 처음 불러온다.

import type { Style, Workbook, Worksheet } from "exceljs";
import { DETAIL_COLUMNS, columnLetter } from "../constants/detail-columns";
import {
  DATA_START_ROW,
  TEMPLATE_BAR_ROW,
  TEMPLATE_COLUMN_WIDTHS,
  TEMPLATE_CONDITIONAL,
  TEMPLATE_COUNT_COLUMNS,
  TEMPLATE_DATA_ROWS,
  TEMPLATE_FREEZE,
  TEMPLATE_GROUPS,
  TEMPLATE_HEADER_5,
  TEMPLATE_HEADER_6,
  TEMPLATE_ROW_HEIGHTS,
  TEMPLATE_STYLES,
  TEMPLATE_STYLE_ROWS,
  TEMPLATE_VALIDATIONS,
} from "../constants/detail-template";
import type { BuiltRow } from "../types";

export { DATA_START_ROW };

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const STYLE_ID = "0123456789abcdefghijklmnopqrstuvwxyz";
const DATA_ROW_HEIGHT = 15.95;
const COLUMN_COUNT = DETAIL_COLUMNS.length;

const pad = (n: number): string => String(n).padStart(2, "0");

export function outputFileName(date: Date): string {
  return `세부_입력값_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}.xlsx`;
}

/** 파일당 80칸 한 줄. 만들지 않은 칸은 빈 문자열 */
export function buildDataRows(rows: BuiltRow[]): string[][] {
  return rows.map((row) => DETAIL_COLUMNS.map((c) => row.cells[c.index] ?? ""));
}

export function buildWarningRows(rows: BuiltRow[]): string[][] {
  const lines = rows.flatMap((row) => row.warnings.map((w) => [w.fileName, w.field, w.message]));
  return [["파일명", "항목", "내용"], ...lines];
}

/** 양식 행 번호(1~39)의 서식 번호 → 서식 */
function styleOf(templateRow: number, column: number): Partial<Style> {
  const id = STYLE_ID.indexOf(TEMPLATE_STYLE_ROWS[templateRow - 1][column]);
  return TEMPLATE_STYLES[id] as Partial<Style>;
}

/**
 * 결과 행이 쓸 양식 행. 7~37행은 그대로, 38행은 데이터 영역의 마지막 줄 서식이다.
 * 32건을 넘어 늘어난 줄은 중간 줄(37행) 서식을 따르고 마지막 줄만 38행 서식을 쓴다.
 */
function templateRowFor(row: number, lastData: number): number {
  if (row < DATA_START_ROW) return row;
  if (row === lastData) return TEMPLATE_DATA_ROWS + DATA_START_ROW - 1;
  return Math.min(row, TEMPLATE_DATA_ROWS + DATA_START_ROW - 2);
}

function fillSheet(ws: Worksheet, rows: BuiltRow[]): void {
  const data = buildDataRows(rows);
  const dataCount = Math.max(data.length, TEMPLATE_DATA_ROWS);
  const lastData = DATA_START_ROW + dataCount - 1;
  const barRow = lastData + 1;

  TEMPLATE_COLUMN_WIDTHS.forEach((width, i) => {
    ws.getColumn(i + 1).width = width;
  });

  // 서식(모든 칸)
  for (let r = 1; r <= barRow; r++) {
    const row = ws.getRow(r);
    row.height = TEMPLATE_ROW_HEIGHTS[r] ?? DATA_ROW_HEIGHT;
    const source = r === barRow ? TEMPLATE_BAR_ROW : templateRowFor(r, lastData);
    for (let c = 0; c < COLUMN_COUNT; c++) row.getCell(c + 1).style = styleOf(source, c);
  }

  // 3행: 열별 개수 합계(값이 있는 칸 수). 엑셀이 열 때 다시 계산한다
  for (let c = TEMPLATE_COUNT_COLUMNS.from; c <= TEMPLATE_COUNT_COLUMNS.to; c++) {
    const letter = columnLetter(c);
    const count = data.filter((line) => line[c] !== "").length;
    ws.getCell(3, c + 1).value = { formula: `SUBTOTAL(3,${letter}$${DATA_START_ROW}:${letter}$${barRow})`, result: count };
  }

  // 4~6행: 그룹 이름과 머리글
  for (const [column, name] of Object.entries(TEMPLATE_GROUPS)) ws.getCell(4, Number(column) + 1).value = name;
  TEMPLATE_HEADER_5.forEach((text, c) => {
    if (text !== "") ws.getCell(5, c + 1).value = text;
  });
  TEMPLATE_HEADER_6.forEach((text, c) => {
    if (text !== "") ws.getCell(6, c + 1).value = text;
  });

  // 데이터(7행부터). 빈 칸은 비워 둬서 개수 합계에 잡히지 않게 한다
  data.forEach((line, i) => {
    line.forEach((value, c) => {
      if (value !== "") ws.getCell(DATA_START_ROW + i, c + 1).value = value;
    });
  });

  ws.autoFilter = `B6:${columnLetter(COLUMN_COUNT - 1)}${barRow}`;

  for (const [address, validation] of Object.entries(TEMPLATE_VALIDATIONS)) {
    ws.getCell(address).dataValidation = validation as never;
  }
  for (const rule of TEMPLATE_CONDITIONAL) {
    ws.addConditionalFormatting({
      ref: rule.ref.replace(/\d+$/, String(lastData)),
      rules: rule.rules as never,
    });
  }
}

export async function buildOutputWorkbook(rows: BuiltRow[]): Promise<Workbook> {
  const excelModule = await import("exceljs");
  const ExcelJS = excelModule.default ?? excelModule;
  const wb = new ExcelJS.Workbook();
  wb.calcProperties.fullCalcOnLoad = true;

  const sheet = wb.addWorksheet("세부_입력값", {
    views: [
      {
        state: "frozen",
        xSplit: TEMPLATE_FREEZE.xSplit,
        ySplit: TEMPLATE_FREEZE.ySplit,
        topLeftCell: `${columnLetter(TEMPLATE_FREEZE.xSplit)}${TEMPLATE_FREEZE.ySplit + 1}`,
        showGridLines: false,
      },
    ],
  });
  fillSheet(sheet, rows);

  const warnings = buildWarningRows(rows);
  if (warnings.length > 1) {
    const warningSheet = wb.addWorksheet("경고");
    warningSheet.addRows(warnings);
    warningSheet.getRow(1).font = { bold: true };
    [36, 16, 60].forEach((width, i) => {
      warningSheet.getColumn(i + 1).width = width;
    });
  }
  return wb;
}

export async function downloadOutput(rows: BuiltRow[], date: Date = new Date()): Promise<void> {
  const wb = await buildOutputWorkbook(rows);
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: XLSX_MIME }));
  const link = document.createElement("a");
  link.href = url;
  link.download = outputFileName(date);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
