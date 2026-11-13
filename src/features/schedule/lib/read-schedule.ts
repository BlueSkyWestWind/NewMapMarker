import type * as XLSX from "xlsx";
import type { Workbook } from "exceljs";
import { parseScheduleRows, type ParsedSchedule } from "@/features/schedule/lib/schedule-excel";

/**
 * 엑셀 일정표 읽기(파일 쓰기는 write-workbook.ts).
 * 시트·행·배경색은 `xlsx`가 읽는다(테마 색을 RGB로 풀어 준다). `xlsx` 무료판은 글자색을 읽지 못해
 * 글자색만 `exceljs`로 같은 파일을 한 번 더 읽는다. `exceljs`는 일정이 있을 때만 불러온다.
 */

const PREFERRED_SHEET = "일정표_New";
const HEADER_NOT_FOUND = "일정표 형식(A열 '날짜' 머리글)을 찾지 못했습니다.";
const NO_SCHEDULE = "가져올 일정이 없습니다.";

export type ReadScheduleResult = { sheetName: string; parsed: ParsedSchedule } | { error: string };

type ColorAt = (rowIndex: number, colIndex: number) => string | null;

/** 0부터 시작하는 행·열을 A1 주소로 바꾼다(`xlsx`의 `encode_cell`과 같은 결과, 런타임 import 없이). */
export function encodeA1Cell(rowIndex: number, colIndex: number): string {
  let column = "";
  for (let n = colIndex + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    column = String.fromCharCode(65 + ((n - 1) % 26)) + column;
  }
  return `${column}${rowIndex + 1}`;
}

/** 셀 배경색을 6자리 대문자 RGB로. 채움이 없으면 null. 인덱스는 시트 기준 절대 좌표(0부터). */
export function buildFillAt(sheet: XLSX.WorkSheet): ColorAt {
  return (rowIndex, colIndex) => {
    const cell = sheet[encodeA1Cell(rowIndex, colIndex)];
    const style = cell?.s;
    if (!style || style.patternType !== "solid") return null;
    const rgb = style.fgColor?.rgb;
    return typeof rgb === "string" && rgb.length >= 6 ? rgb.slice(-6).toUpperCase() : null;
  };
}

/** 글자색 원본 키: 6자리 대문자 RGB 또는 `THEME<번호>`. 없으면 null. 인덱스는 절대 좌표(0부터). */
export function buildTextColorAt(workbook: Workbook, sheetName: string): ColorAt {
  const sheet = workbook.getWorksheet(sheetName);
  return (rowIndex, colIndex) => {
    const color = sheet?.getCell(rowIndex + 1, colIndex + 1).font?.color;
    if (!color) return null;
    if (typeof color.argb === "string" && color.argb.length >= 6) {
      return color.argb.slice(-6).toUpperCase();
    }
    if (typeof color.theme === "number") return `THEME${color.theme}`;
    return null;
  };
}

function isHidden(workbook: XLSX.WorkBook, index: number): boolean {
  const flag = workbook.Workbook?.Sheets?.[index]?.Hidden;
  return typeof flag === "number" && flag !== 0;
}

/** `일정표_New`가 있으면 먼저, 그 밖에는 보이는 시트를 순서대로. */
function orderedSheetNames(workbook: XLSX.WorkBook): string[] {
  const visible = workbook.SheetNames.filter((_, index) => !isHidden(workbook, index));
  const preferred = visible.filter((name) => name === PREFERRED_SHEET);
  return [...preferred, ...visible.filter((name) => name !== PREFERRED_SHEET)];
}

export async function parseWorkbookBuffer(
  data: ArrayBuffer | Uint8Array,
): Promise<ReadScheduleResult> {
  // `xlsx`는 무거워 일정 파일을 실제로 읽을 때만 불러온다.
  const xlsx = await import("xlsx");
  const workbook = xlsx.read(data, { type: "array", cellStyles: true });

  for (const sheetName of orderedSheetNames(workbook)) {
    const sheet = workbook.Sheets[sheetName];
    const range = xlsx.utils.decode_range(sheet["!ref"] ?? "A1");
    const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    // 시트가 A1에서 시작하지 않아도 색 좌표가 맞도록 시작 위치만큼 옮긴다.
    const shift = (colorAt: ColorAt): ColorAt => (r, c) => colorAt(r + range.s.r, c + range.s.c);
    const fillAt = shift(buildFillAt(sheet));

    const first = parseScheduleRows(rows, { fillAt });
    if (!first) continue;
    if (first.cells.length === 0) return { error: NO_SCHEDULE };

    const excelModule = await import("exceljs");
    const ExcelJS = excelModule.default ?? excelModule;
    const excelWorkbook = new ExcelJS.Workbook();
    await excelWorkbook.xlsx.load(data as ArrayBuffer);
    const textColorAt = shift(buildTextColorAt(excelWorkbook, sheetName));

    const parsed = parseScheduleRows(rows, { fillAt, textColorAt });
    return parsed ? { sheetName, parsed } : { error: HEADER_NOT_FOUND };
  }
  return { error: HEADER_NOT_FOUND };
}

export async function readScheduleWorkbook(file: File): Promise<ReadScheduleResult> {
  return parseWorkbookBuffer(await file.arrayBuffer());
}
