import type { Alignment, Fill, Workbook, Worksheet } from "exceljs";
import { DAY_COLUMNS } from "@/features/schedule/lib/day-columns";
import type { DayValues, OptionLists } from "@/features/schedule/lib/day-types";
import { toExcelSerial } from "@/features/schedule/lib/schedule-excel";

/** 일자별 상세(14장) 엑셀 쓰기: 원본 상세 시트의 서식을 재현한다. */
export interface SheetInput {
  sheetName: string;
  rows: readonly DayValues[];
  lists: OptionLists;
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FONT_NAME = "뫼비우스 Regular";
const LIST_SHEET_NAME = "목록";
const HEADER_FILL_ARGB = "FFECEEF0";
const DETAIL_HEADER_FILL_ARGB = "FFE2EFDA";
const HEADER_ROW = 2;
const FIRST_DATA_ROW = 3;
/** 표에 행이 적어도 드롭다운은 이 행까지 걸어 둔다(새 행을 손으로 더하는 경우). */
const MIN_LAST_DATA_ROW = 24;
const FROZEN_COLUMNS = 9;
const ZOOM_SCALE = 80;
const BLANK_ROW_HEIGHT = 26.25;
const HEADER_ROW_HEIGHT = 42;
const DATA_ROW_HEIGHT = 24.95;
const LEFT_ALIGNED_KEYS: ReadonlySet<string> = new Set(["site", "address"]);

async function createWorkbook(): Promise<Workbook> {
  const excelModule = await import("exceljs");
  const ExcelJS = excelModule.default ?? excelModule;
  return new ExcelJS.Workbook();
}

function solid(argb: string): Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function applyHeaderRow(ws: Worksheet): void {
  const row = ws.getRow(HEADER_ROW);
  row.height = HEADER_ROW_HEIGHT;
  DAY_COLUMNS.forEach((column, index) => {
    const cell = row.getCell(index + 1);
    cell.value = column.header;
    cell.font = { name: FONT_NAME, size: 11, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = solid(column.letter === "X" ? DETAIL_HEADER_FILL_ARGB : HEADER_FILL_ARGB);
    cell.border = {
      left: { style: "thin" },
      right: { style: "thin" },
      top: { style: "thin" },
      bottom: { style: "hair" },
    };
  });
}

function dataAlignment(key: string): Partial<Alignment> {
  return {
    horizontal: LEFT_ALIGNED_KEYS.has(key) ? "left" : "center",
    vertical: "middle",
    shrinkToFit: true,
  };
}

function applyDataRows(ws: Worksheet, rows: readonly DayValues[]): void {
  rows.forEach((values, rowIndex) => {
    const row = ws.getRow(FIRST_DATA_ROW + rowIndex);
    row.height = DATA_ROW_HEIGHT;
    DAY_COLUMNS.forEach((column, index) => {
      const cell = row.getCell(index + 1);
      if (column.key === "seq") {
        cell.value = rowIndex + 1;
      } else if (column.key === "workDate") {
        cell.value = values.workDate ? toExcelSerial(values.workDate) : null;
        cell.numFmt = "mm/dd";
      } else {
        cell.value = values[column.key] || null;
      }
      cell.font = { name: FONT_NAME, size: column.key === "seq" ? 14 : 11 };
      cell.alignment = dataAlignment(column.key);
      cell.border = {
        left: { style: "thin" },
        right: { style: "thin" },
        top: { style: "hair" },
        bottom: { style: "hair" },
      };
    });
  });
}

/**
 * 숨김 시트 `목록`에 드롭다운 값을 담는다. 값에 쉼표가 있어(`이동식크레인,굴착기`)
 * 인라인 쉼표 목록은 쓸 수 없으므로 각 목록을 데이터 열과 같은 열 문자에 세로로 둔다.
 */
function addListSheet(wb: Workbook, lists: OptionLists): void {
  const ws = wb.addWorksheet(LIST_SHEET_NAME, { state: "hidden" });
  for (const column of DAY_COLUMNS) {
    if (!column.list) continue;
    lists[column.list].forEach((value, index) => {
      ws.getCell(`${column.letter}${index + 1}`).value = value;
    });
  }
}

function applyValidations(ws: Worksheet, lists: OptionLists, lastRow: number): void {
  for (const column of DAY_COLUMNS) {
    if (!column.list) continue;
    const count = Math.max(lists[column.list].length, 1);
    const formula = `'${LIST_SHEET_NAME}'!$${column.letter}$1:$${column.letter}$${count}`;
    for (let rowNo = FIRST_DATA_ROW; rowNo <= lastRow; rowNo += 1) {
      ws.getCell(`${column.letter}${rowNo}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [formula],
      };
    }
  }
}

export async function buildSheetWorkbook(input: SheetInput): Promise<Workbook> {
  const wb = await createWorkbook();
  const ws = wb.addWorksheet(input.sheetName, {
    views: [{ state: "frozen", xSplit: FROZEN_COLUMNS, ySplit: HEADER_ROW, zoomScale: ZOOM_SCALE }],
  });
  DAY_COLUMNS.forEach((column, index) => {
    ws.getColumn(index + 1).width = column.widthChars;
  });
  ws.getRow(1).height = BLANK_ROW_HEIGHT;
  applyHeaderRow(ws);
  applyDataRows(ws, input.rows);
  addListSheet(wb, input.lists);
  applyValidations(ws, input.lists, Math.max(MIN_LAST_DATA_ROW, HEADER_ROW + input.rows.length));
  return wb;
}

/** `2026-11-09` → `261109` */
function compactDate(iso: string): string {
  return iso.replaceAll("-", "").slice(2);
}

export function dayFileName(workDate: string): string {
  return `${compactDate(workDate)}_시설일정_상세.xlsx`;
}

export function archiveFileName(today: string): string {
  return `시설일정_누적_${compactDate(today)}.xlsx`;
}

async function saveWorkbook(wb: Workbook, fileName: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadDayWorkbook(
  workDate: string,
  rows: readonly DayValues[],
  lists: OptionLists,
): Promise<void> {
  const wb = await buildSheetWorkbook({ sheetName: workDate, rows, lists });
  await saveWorkbook(wb, dayFileName(workDate));
}

/** 누적 내려받기: 시트 이름은 `List`. */
export async function downloadArchiveWorkbook(
  rows: readonly DayValues[],
  lists: OptionLists,
  today: string,
): Promise<void> {
  const wb = await buildSheetWorkbook({ sheetName: "List", rows, lists });
  await saveWorkbook(wb, archiveFileName(today));
}
