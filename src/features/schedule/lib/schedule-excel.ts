import { MAX_ROWS } from "@/features/schedule/lib/cell-grid";
import { isValidIso, weekdayLabel } from "@/features/schedule/lib/week";
import {
  isMarkColor,
  type MarkColor,
  type ScheduleCell,
  type ScheduleColumn,
  type ScheduleDayNote,
  type ScheduleMark,
  type TextColor,
} from "@/features/schedule/types";

/**
 * 엑셀 `일정표_New` 형식 ↔ 일정 변환. React·xlsx·exceljs에 의존하지 않는 순수 함수다.
 *
 * 파일 구조: 헤더 행은 A열이 `날짜`인 행, 그 바로 위 행이 팀 라벨 행이다. 팀 열 쌍은 C열(인덱스 2)부터
 * `2+2k`(국소·작업)·`3+2k`(모국·장비·메모). 날짜마다 여러 행의 블록이고, 같은 날짜 안에서 나타난 순서가 행 번호다.
 */

export const EXPORT_MIN_ROWS = 10;
/** 날짜 메모 최대 길이(DB 제약과 같다). */
const NOTE_MAX_LENGTH = 100;
/** 칸 글(국소·작업, 모국·장비·메모) 최대 길이(DB 제약과 같다). */
const CELL_TEXT_MAX_LENGTH = 500;
/** 날짜 메모를 쓰는 블록 안 행(0부터). 원본 일정표와 같다. */
const NOTE_ROW_OFFSET = 3;
const FIRST_PAIR_COL = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const JUNK_PATTERN = /^[`'\s]+$/;

export interface ParsedColumn {
  index: number;
  teamLabel: string;
  leaderLabel: string;
}

export interface ParsedCell {
  workDate: string;
  columnIndex: number;
  rowNo: number;
  mainText: string;
  subText: string;
  textColor: TextColor | null;
}

export interface ParsedDayNote {
  workDate: string;
  note: string;
}

export interface ParsedMark {
  workDate: string;
  columnIndex: number;
  color: MarkColor;
}

export interface ParsedSchedule {
  columns: ParsedColumn[];
  cells: ParsedCell[];
  dayNotes: ParsedDayNote[];
  marks: ParsedMark[];
  dayCount: number;
  firstDate: string | null;
  lastDate: string | null;
  ignoredCount: number;
}

/**
 * fillAt: 해당 셀의 배경색(6자리 대문자 RGB). 없으면 null.
 * textColorAt: 해당 셀의 글자색 원본 키(6자리 대문자 RGB 또는 `THEME<번호>`). 없으면 null.
 * 색을 못 읽는 호출부는 생략한다. 행·열 인덱스는 0부터.
 */
export interface ParseOptions {
  fillAt?: (rowIndex: number, colIndex: number) => string | null;
  textColorAt?: (rowIndex: number, colIndex: number) => string | null;
}

export interface ExportFill {
  rowIndex: number;
  colIndex: number;
  color: MarkColor;
}

export interface ExportFont {
  rowIndex: number;
  colIndex: number;
  color: TextColor;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 엑셀 날짜 값을 `yyyy-mm-dd`로. 날짜가 아니면 null. */
export function parseSheetDate(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 20000 || value > 80000) return null;
    const date = new Date(EXCEL_EPOCH_MS + Math.floor(value) * DAY_MS);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
  if (us) {
    const year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
    const iso = `${year}-${pad(Number(us[1]))}-${pad(Number(us[2]))}`;
    return isValidIso(iso) ? iso : null;
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) {
    const normalized = `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;
    return isValidIso(normalized) ? normalized : null;
  }
  return null;
}

/** 엑셀 날짜 일련번호. 1900-03-01 이후 날짜에서 엑셀의 값과 같다(1900-02-29 오류 이후 구간). */
export function toExcelSerial(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - EXCEL_EPOCH_MS) / DAY_MS);
}

/** 파랑 계열 셋은 `0070C0` 하나로 합치고 빨강만 따로 둔다. 그 밖(검정·기본·없음)은 null. */
export function normalizeTextColor(raw: string | null): TextColor | null {
  if (!raw) return null;
  const key = raw.toUpperCase();
  if (key === "0070C0" || key === "00B0F0" || key === "THEME4") return "0070C0";
  if (key === "FF0000") return "FF0000";
  return null;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function lastNonEmptyIndex(row: unknown[]): number {
  for (let i = row.length - 1; i >= 0; i -= 1) {
    if (text(row[i]) !== "") return i;
  }
  return -1;
}

export function parseScheduleRows(
  rows: unknown[][],
  options: ParseOptions = {},
): ParsedSchedule | null {
  const headerIndex = rows.findIndex((row) => text(row[0]) === "날짜");
  if (headerIndex < 0) return null;
  const header = rows[headerIndex];
  const labelRow = rows[headerIndex - 1] ?? [];

  const lastHeaderIndex = lastNonEmptyIndex(header);
  const columns: ParsedColumn[] = [];
  for (let k = 0; FIRST_PAIR_COL + 2 * k <= lastHeaderIndex; k += 1) {
    const col = FIRST_PAIR_COL + 2 * k;
    const upper = text(labelRow[col]);
    const lower = text(header[col]);
    columns.push({
      index: k,
      teamLabel: upper || lower,
      leaderLabel: upper ? lower : "",
    });
  }
  const pairEnd = FIRST_PAIR_COL + 2 * columns.length;

  let ignoredCount = 0;
  /** 기호만 있는 값은 일정이 아니다. 빈 값으로 보고 무시 건수에 더한다. */
  const clean = (value: unknown): string => {
    const cleaned = text(value);
    if (cleaned !== "" && JUNK_PATTERN.test(cleaned)) {
      ignoredCount += 1;
      return "";
    }
    return cleaned;
  };

  /** DB 제약(500자)을 넘는 글은 잘라서 넣고 무시 건수에 더한다. 넘기면 가져오기 전체가 실패한다. */
  const limit = (value: string): string => {
    if (value.length <= CELL_TEXT_MAX_LENGTH) return value;
    ignoredCount += 1;
    return value.slice(0, CELL_TEXT_MAX_LENGTH);
  };

  const cells: ParsedCell[] = [];
  const rowCounter = new Map<string, number>();
  const firstRowOfDate = new Map<string, number>();
  const notesByDate = new Map<string, string[]>();

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const workDate = parseSheetDate(row[0]);
    if (!workDate) continue;

    const rowNo = rowCounter.get(workDate) ?? 0;
    rowCounter.set(workDate, rowNo + 1);
    if (!firstRowOfDate.has(workDate)) firstRowOfDate.set(workDate, rowIndex);

    const sideValue = clean(row[1]);
    if (sideValue !== "" && !sideValue.endsWith("요일")) {
      const list = notesByDate.get(workDate) ?? [];
      list.push(sideValue);
      notesByDate.set(workDate, list);
    }

    columns.forEach((column, k) => {
      const mainCol = FIRST_PAIR_COL + 2 * k;
      const mainText = limit(clean(row[mainCol]));
      const subText = limit(clean(row[mainCol + 1]));
      if (mainText === "" && subText === "") return;
      const colorCol = mainText !== "" ? mainCol : mainCol + 1;
      cells.push({
        workDate,
        columnIndex: column.index,
        rowNo,
        mainText,
        subText,
        textColor: normalizeTextColor(options.textColorAt?.(rowIndex, colorCol) ?? null),
      });
    });

    for (let col = pairEnd; col < row.length; col += 1) {
      if (text(row[col]) !== "") ignoredCount += 1;
    }
  }

  const dayNotes: ParsedDayNote[] = [];
  for (const [workDate, values] of notesByDate) {
    const note = [...new Set(values)].join(", ").slice(0, NOTE_MAX_LENGTH);
    dayNotes.push({ workDate, note });
  }

  const marks: ParsedMark[] = [];
  if (options.fillAt) {
    for (const [workDate, rowIndex] of firstRowOfDate) {
      columns.forEach((column, k) => {
        const fill = options.fillAt?.(rowIndex, FIRST_PAIR_COL + 2 * k) ?? null;
        if (isMarkColor(fill)) marks.push({ workDate, columnIndex: column.index, color: fill });
      });
    }
  }

  const dates = [...rowCounter.keys()].sort();
  return {
    columns,
    cells,
    dayNotes,
    marks,
    dayCount: dates.length,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    ignoredCount,
  };
}

const LEGEND_LABELS = ["중장비", "승주", "축전지수거", "K대응"] as const;
const WEEKDAY_SUFFIX = "요일";

export function buildExportRows(input: {
  dates: string[];
  columns: ScheduleColumn[];
  cells: ScheduleCell[];
  dayNotes: ScheduleDayNote[];
  marks: ScheduleMark[];
}): {
  rows: (string | number)[][];
  dateRowIndexes: number[];
  fills: ExportFill[];
  fonts: ExportFont[];
} {
  const columns = [...input.columns].sort((a, b) => a.sortOrder - b.sortOrder);
  const columnIndexById = new Map(columns.map((column, k) => [column.id, k]));
  const width = FIRST_PAIR_COL + 2 * columns.length;
  const noteByDate = new Map(input.dayNotes.map((entry) => [entry.workDate, entry.note]));

  const rows: (string | number)[][] = [];
  const fills: ExportFill[] = [];
  const fonts: ExportFont[] = [];

  // 범례 1~4행(A열만). 원본 일정표와 같다.
  LEGEND_LABELS.forEach((label) => rows.push([label]));
  fills.push({ rowIndex: 0, colIndex: 0, color: "D9F2D0" });
  fills.push({ rowIndex: 1, colIndex: 0, color: "F2CFEE" });
  fonts.push({ rowIndex: 2, colIndex: 0, color: "0070C0" });
  fills.push({ rowIndex: 3, colIndex: 0, color: "4E95D9" });

  // 팀 라벨 행: 팀장이 있는 열만 팀 라벨을 위에 쓴다(없으면 헤더 행에 팀 라벨이 온다).
  const labelRow: (string | number)[] = new Array(width).fill("");
  const headerRow: (string | number)[] = new Array(width).fill("");
  headerRow[0] = "날짜";
  headerRow[1] = "요일";
  columns.forEach((column, k) => {
    const col = FIRST_PAIR_COL + 2 * k;
    if (column.leaderLabel) {
      labelRow[col] = column.teamLabel;
      headerRow[col] = column.leaderLabel;
    } else {
      headerRow[col] = column.teamLabel;
    }
  });
  rows.push(labelRow, headerRow);

  const dateRowIndexes: number[] = [];
  for (const workDate of input.dates) {
    const dayCells = input.cells.filter((cell) => cell.workDate === workDate);
    const maxRow = dayCells.reduce((max, cell) => Math.max(max, cell.rowNo), -1);
    const rowCount = Math.max(EXPORT_MIN_ROWS, maxRow + 1);
    const blockStart = rows.length;
    const serial = toExcelSerial(workDate);
    const note = noteByDate.get(workDate) ?? "";

    for (let r = 0; r < rowCount; r += 1) {
      const row: (string | number)[] = new Array(width).fill("");
      row[0] = serial;
      if (r === 0) row[1] = `${weekdayLabel(workDate)}${WEEKDAY_SUFFIX}`;
      else if (r === NOTE_ROW_OFFSET) row[1] = note;
      rows.push(row);
      dateRowIndexes.push(blockStart + r);
    }

    for (const cell of dayCells) {
      const k = columnIndexById.get(cell.columnId);
      if (k === undefined || cell.rowNo >= rowCount) continue;
      const rowIndex = blockStart + cell.rowNo;
      const col = FIRST_PAIR_COL + 2 * k;
      rows[rowIndex][col] = cell.mainText;
      rows[rowIndex][col + 1] = cell.subText;
      if (cell.textColor) {
        fonts.push({ rowIndex, colIndex: col, color: cell.textColor });
        fonts.push({ rowIndex, colIndex: col + 1, color: cell.textColor });
      }
    }

    for (const mark of input.marks) {
      if (mark.workDate !== workDate) continue;
      const k = columnIndexById.get(mark.columnId);
      if (k === undefined) continue;
      const col = FIRST_PAIR_COL + 2 * k;
      for (let r = 0; r < rowCount; r += 1) {
        fills.push({ rowIndex: blockStart + r, colIndex: col, color: mark.color });
        fills.push({ rowIndex: blockStart + r, colIndex: col + 1, color: mark.color });
      }
    }
  }

  return { rows, dateRowIndexes, fills, fonts };
}

function squash(label: string): string {
  return label.replace(/\s+/g, "");
}

/** 파싱한 열마다 대응하는 기존 열 id. 라벨이 같으면 그 열, 아니면 같은 번째 열, 그것도 없으면 null. */
export function matchColumns(
  parsed: ParsedColumn[],
  existing: ScheduleColumn[],
): (string | null)[] {
  const sorted = [...existing].sort((a, b) => a.sortOrder - b.sortOrder);
  const result: (string | null)[] = parsed.map(() => null);
  const used = new Set<string>();

  parsed.forEach((column, i) => {
    const hit = sorted.find(
      (candidate) =>
        !used.has(candidate.id) && squash(candidate.teamLabel) === squash(column.teamLabel),
    );
    if (hit) {
      result[i] = hit.id;
      used.add(hit.id);
    }
  });
  parsed.forEach((column, i) => {
    if (result[i] !== null) return;
    const byIndex = sorted[column.index];
    if (byIndex && !used.has(byIndex.id)) {
      result[i] = byIndex.id;
      used.add(byIndex.id);
    }
  });
  return result;
}

export interface ImportInsert {
  workDate: string;
  columnId: string;
  rowNo: number;
  mainText: string;
  subText: string;
  textColor: TextColor | null;
}

export interface ImportPlan {
  deleteFrom: string;
  deleteTo: string;
  inserts: ImportInsert[];
  days: ScheduleDayNote[];
  marks: ScheduleMark[];
  columnUpdates: { id: string; leaderLabel: string }[];
  skippedCount: number;
}

/**
 * 가져오기 계획. `fromDate` 이전 날짜는 제외하고, 삭제 범위는 `[max(fromDate, 첫 날짜), 마지막 날짜]`다.
 * 열을 못 찾았거나 행 번호가 `MAX_ROWS`를 넘는 칸은 건너뛰고 건수로 센다.
 * 범위에 넣을 칸·날짜 메모·색이 하나도 없으면 null.
 */
export function planImport(
  parsed: ParsedSchedule,
  existing: ScheduleColumn[],
  fromDate: string,
): ImportPlan | null {
  if (!parsed.firstDate || !parsed.lastDate) return null;
  const deleteFrom = fromDate > parsed.firstDate ? fromDate : parsed.firstDate;
  const deleteTo = parsed.lastDate;
  if (deleteFrom > deleteTo) return null;

  const ids = matchColumns(parsed.columns, existing);
  const columnIdOf = (columnIndex: number): string | null => ids[columnIndex] ?? null;
  let skippedCount = 0;

  const inserts: ImportInsert[] = [];
  for (const cell of parsed.cells) {
    if (cell.workDate < deleteFrom) continue;
    const columnId = columnIdOf(cell.columnIndex);
    if (columnId === null || cell.rowNo >= MAX_ROWS) {
      skippedCount += 1;
      continue;
    }
    inserts.push({
      workDate: cell.workDate,
      columnId,
      rowNo: cell.rowNo,
      mainText: cell.mainText,
      subText: cell.subText,
      textColor: cell.textColor,
    });
  }

  const days = parsed.dayNotes.filter((entry) => entry.workDate >= deleteFrom);

  const marks: ScheduleMark[] = [];
  for (const mark of parsed.marks) {
    if (mark.workDate < deleteFrom) continue;
    const columnId = columnIdOf(mark.columnIndex);
    if (columnId === null) {
      skippedCount += 1;
      continue;
    }
    marks.push({ workDate: mark.workDate, columnId, color: mark.color });
  }

  if (inserts.length === 0 && days.length === 0 && marks.length === 0) return null;

  const existingById = new Map(existing.map((column) => [column.id, column]));
  const columnUpdates: { id: string; leaderLabel: string }[] = [];
  parsed.columns.forEach((column, i) => {
    const id = ids[i];
    if (!id || !column.leaderLabel) return;
    if (existingById.get(id)?.leaderLabel !== column.leaderLabel) {
      columnUpdates.push({ id, leaderLabel: column.leaderLabel });
    }
  });

  return { deleteFrom, deleteTo, inserts, days, marks, columnUpdates, skippedCount };
}
