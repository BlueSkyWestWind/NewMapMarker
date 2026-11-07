import type { Border, Cell, Fill, Font, RichText, Workbook, Worksheet } from "exceljs";
import {
  buildMonthModel,
  computeMonthScale,
  monthEntryText,
  monthWeekHeightPt,
  MONTH_DAY_COL_PX,
  MONTH_HEADER_HEIGHT_PT,
  MONTH_TITLE_HEIGHT_PT,
  type MonthDay,
} from "@/features/schedule/lib/month-layout";
import { buildExportRows } from "@/features/schedule/lib/schedule-excel";
import {
  buildWeeklyWeeks,
  computeWeeklyScale,
  WEEKLY_DATE_COL_PX,
  WEEKLY_HEADER_HEIGHT_PT,
  WEEKLY_MAIN_COL_PX,
  WEEKLY_ROW_HEIGHT_PT,
  WEEKLY_SUB_COL_PX,
  WEEKLY_WEEKDAY_COL_PX,
  type PaperSize,
} from "@/features/schedule/lib/weekly-layout";
import type {
  ScheduleCell,
  ScheduleColumn,
  ScheduleDayNote,
  ScheduleMark,
} from "@/features/schedule/types";

/**
 * 엑셀 파일 쓰기(`exceljs`). 주간 배포용·월간 배포용·일정표_New 형식 세 가지.
 * `build*`는 DOM을 쓰지 않아 노드 테스트에서 호출하고, `download*`만 브라우저 다운로드를 한다.
 * `exceljs`는 크므로 `build*` 안에서만 `await import`로 불러온다(홈 번들에 넣지 않는다).
 */

export interface WorkbookInput {
  columns: ScheduleColumn[];
  cells: ScheduleCell[];
  dayNotes: ScheduleDayNote[];
  marks: ScheduleMark[];
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FONT_NAME = "맑은 고딕";
const SATURDAY_ARGB = "FF0070C0";
const SUNDAY_ARGB = "FFFF0000";
const GRID_ARGB = "FFBFBFBF";
const DAY_SEPARATOR_ARGB = "FF1F3864";
const OUT_OF_MONTH_ARGB = "FFF2F2F2";
const MUTED_ARGB = "FF808080";
const HEADER_FILL_ARGB = "FFEDEDED";
/** 열 너비(문자 수 단위)로 바꾸는 근사 비율. */
const PX_PER_CHAR = 7;
const PAPER_CODE: Record<PaperSize, number> = { A3: 8, A4: 9 };
const MARGIN_INCH = 0.4;

async function createWorkbook(): Promise<Workbook> {
  const excelModule = await import("exceljs");
  const ExcelJS = excelModule.default ?? excelModule;
  return new ExcelJS.Workbook();
}

function solid(argb: string): Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thin(argb: string): Partial<Border> {
  return { style: "thin", color: { argb } };
}

function sortedColumns(columns: ScheduleColumn[]): ScheduleColumn[] {
  return [...columns].sort((a, b) => a.sortOrder - b.sortOrder);
}

function headerLabel(column: ScheduleColumn): string {
  return column.leaderLabel ? `${column.teamLabel}\n${column.leaderLabel}` : column.teamLabel;
}

function setPageSetup(ws: Worksheet, paper: PaperSize, scale: number, titleRow?: string) {
  ws.pageSetup = {
    paperSize: PAPER_CODE[paper],
    orientation: "landscape",
    scale,
    horizontalCentered: true,
    margins: {
      left: MARGIN_INCH,
      right: MARGIN_INCH,
      top: MARGIN_INCH,
      bottom: MARGIN_INCH,
      header: 0.2,
      footer: 0.2,
    },
    ...(titleRow ? { printTitlesRow: titleRow } : {}),
  };
}

/** 주간 배포용: 주마다 한 쪽, 머리글 반복, 날짜×팀 색, 토·일 글자색. */
export async function buildWeeklyWorkbook(
  input: WorkbookInput & { weekStarts: string[]; paper: PaperSize },
): Promise<Workbook> {
  const wb = await createWorkbook();
  const ws = wb.addWorksheet("주간일정");
  const columns = sortedColumns(input.columns);
  const lastCol = 2 + 2 * columns.length;
  const weeks = buildWeeklyWeeks({
    weekStarts: input.weekStarts,
    cells: input.cells,
    dayNotes: input.dayNotes,
  });
  const weekRowCounts = weeks.map((week) => week.days.reduce((sum, day) => sum + day.rowCount, 0));

  ws.getColumn(1).width = WEEKLY_DATE_COL_PX / PX_PER_CHAR;
  ws.getColumn(2).width = WEEKLY_WEEKDAY_COL_PX / PX_PER_CHAR;
  columns.forEach((_, k) => {
    ws.getColumn(3 + 2 * k).width = WEEKLY_MAIN_COL_PX / PX_PER_CHAR;
    ws.getColumn(4 + 2 * k).width = WEEKLY_SUB_COL_PX / PX_PER_CHAR;
  });

  // 머리글(1행)
  ws.getRow(1).height = WEEKLY_HEADER_HEIGHT_PT;
  const styleHeader = (cell: Cell) => {
    cell.font = { name: FONT_NAME, size: 10, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = solid(HEADER_FILL_ARGB);
    cell.border = {
      top: thin(GRID_ARGB),
      left: thin(GRID_ARGB),
      bottom: thin(GRID_ARGB),
      right: thin(GRID_ARGB),
    };
  };
  ws.mergeCells(1, 1, 1, 2);
  ws.getCell(1, 1).value = "날짜";
  styleHeader(ws.getCell(1, 1));
  styleHeader(ws.getCell(1, 2));
  columns.forEach((column, k) => {
    const left = 3 + 2 * k;
    ws.mergeCells(1, left, 1, left + 1);
    ws.getCell(1, left).value = headerLabel(column);
    styleHeader(ws.getCell(1, left));
    styleHeader(ws.getCell(1, left + 1));
  });

  const columnIndexById = new Map(columns.map((column, k) => [column.id, k]));
  let cursor = 2;
  for (const week of weeks) {
    for (const day of week.days) {
      const start = cursor;
      const end = start + day.rowCount - 1;
      const isSunday = day.weekday === "일요일";
      const dayColor =
        day.weekday === "토요일" ? SATURDAY_ARGB : isSunday ? SUNDAY_ARGB : undefined;
      const marks = input.marks.filter((mark) => mark.workDate === day.workDate);

      for (let row = start; row <= end; row += 1) {
        ws.getRow(row).height = WEEKLY_ROW_HEIGHT_PT;
        for (let col = 1; col <= lastCol; col += 1) {
          const cell = ws.getCell(row, col);
          cell.border = {
            top: row === start && isSunday ? thin(SUNDAY_ARGB) : thin(GRID_ARGB),
            left: thin(GRID_ARGB),
            bottom:
              row === end ? { style: "medium", color: { argb: DAY_SEPARATOR_ARGB } } : thin(GRID_ARGB),
            right: thin(GRID_ARGB),
          };
          if (col > 2) {
            cell.font = { name: FONT_NAME, size: 10 };
            cell.alignment = { vertical: "middle", horizontal: "left", shrinkToFit: true };
          }
        }
      }

      // 날짜·요일은 3번째 행, 날짜 메모는 4번째 행(원본 배포 양식과 같다).
      const dateFont: Partial<Font> = { name: FONT_NAME, size: 10, bold: true, color: dayColor ? { argb: dayColor } : undefined };
      const dateCell = ws.getCell(start + 2, 1);
      dateCell.value = day.workDate;
      dateCell.font = dateFont;
      const weekdayCell = ws.getCell(start + 2, 2);
      weekdayCell.value = day.weekday;
      weekdayCell.font = dateFont;
      if (day.note) {
        const noteCell = ws.getCell(start + 3, 2);
        noteCell.value = day.note;
        noteCell.font = { name: FONT_NAME, size: 10 };
      }

      for (const mark of marks) {
        const k = columnIndexById.get(mark.columnId);
        if (k === undefined) continue;
        for (let row = start; row <= end; row += 1) {
          ws.getCell(row, 3 + 2 * k).fill = solid(`FF${mark.color}`);
          ws.getCell(row, 4 + 2 * k).fill = solid(`FF${mark.color}`);
        }
      }

      for (const cell of input.cells) {
        if (cell.workDate !== day.workDate || cell.rowNo >= day.rowCount) continue;
        const k = columnIndexById.get(cell.columnId);
        if (k === undefined) continue;
        const font: Partial<Font> = {
          name: FONT_NAME,
          size: 10,
          color: cell.textColor ? { argb: `FF${cell.textColor}` } : undefined,
        };
        const main = ws.getCell(start + cell.rowNo, 3 + 2 * k);
        const sub = ws.getCell(start + cell.rowNo, 4 + 2 * k);
        main.value = cell.mainText;
        sub.value = cell.subText;
        main.font = font;
        sub.font = font;
      }
      cursor = end + 1;
    }
    ws.getRow(cursor - 1).addPageBreak();
  }

  setPageSetup(
    ws,
    input.paper,
    computeWeeklyScale({ paper: input.paper, columnCount: columns.length, weekRowCounts }),
    "1:1",
  );
  return wb;
}

function monthDayLabel(day: MonthDay): string {
  const [, month, date] = day.workDate.split("-").map(Number);
  return day.inMonth ? String(date) : `${month}/${date}`;
}

function monthDayRichText(day: MonthDay): RichText[] {
  const runs: RichText[] = [
    { text: monthDayLabel(day), font: { name: FONT_NAME, size: 10, bold: true } },
  ];
  if (day.note) {
    runs.push({ text: `  ${day.note}`, font: { name: FONT_NAME, size: 8, color: { argb: MUTED_ARGB } } });
  }
  for (const team of day.teams) {
    runs.push({ text: "\n" });
    runs.push({
      text: "■",
      font: { name: FONT_NAME, size: 10, color: { argb: team.markColor ? `FF${team.markColor}` : MUTED_ARGB } },
    });
    runs.push({ text: `${team.label} · `, font: { name: FONT_NAME, size: 9 } });
    team.entries.forEach((entry, i) => {
      const separator = i < team.entries.length - 1 ? ", " : "";
      runs.push({
        text: `${monthEntryText(entry)}${separator}`,
        font: {
          name: FONT_NAME,
          size: 9,
          color: entry.textColor ? { argb: `FF${entry.textColor}` } : undefined,
        },
      });
    });
  }
  return runs;
}

/** 월간 배포용: 월 달력 한 쪽, 칸 색·글자색·날짜 메모를 서식 있는 글로 쓴다. */
export async function buildMonthlyWorkbook(
  input: WorkbookInput & { month: string; paper: PaperSize },
): Promise<Workbook> {
  const wb = await createWorkbook();
  const ws = wb.addWorksheet("월간일정");
  const model = buildMonthModel({ ...input, month: input.month });
  const weekHeights = model.weeks.map(monthWeekHeightPt);

  for (let col = 1; col <= 7; col += 1) ws.getColumn(col).width = MONTH_DAY_COL_PX / PX_PER_CHAR;

  ws.mergeCells("A1:G1");
  const title = ws.getCell("A1");
  title.value = model.title;
  title.font = { name: FONT_NAME, size: 14, bold: true };
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = MONTH_TITLE_HEIGHT_PT;

  ["월", "화", "수", "목", "금", "토", "일"].forEach((label, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = label;
    cell.font = {
      name: FONT_NAME,
      size: 10,
      bold: true,
      color: i === 5 ? { argb: SATURDAY_ARGB } : i === 6 ? { argb: SUNDAY_ARGB } : undefined,
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = solid(HEADER_FILL_ARGB);
    cell.border = { top: thin(GRID_ARGB), left: thin(GRID_ARGB), bottom: thin(GRID_ARGB), right: thin(GRID_ARGB) };
  });
  ws.getRow(2).height = MONTH_HEADER_HEIGHT_PT;

  model.weeks.forEach((week, weekIndex) => {
    const row = 3 + weekIndex;
    ws.getRow(row).height = weekHeights[weekIndex];
    week.forEach((day, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.value = { richText: monthDayRichText(day) };
      cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      cell.border = { top: thin(GRID_ARGB), left: thin(GRID_ARGB), bottom: thin(GRID_ARGB), right: thin(GRID_ARGB) };
      if (!day.inMonth) cell.fill = solid(OUT_OF_MONTH_ARGB);
    });
  });

  setPageSetup(
    ws,
    input.paper,
    computeMonthScale({ paper: input.paper, weekHeightsPt: weekHeights }),
  );
  return wb;
}

/** 일정표_New 형식: 범례·날짜 메모·색·글자색을 담아 가져오기와 왕복할 수 있다. */
export async function buildDataWorkbook(
  input: WorkbookInput & { dates: string[] },
): Promise<Workbook> {
  const wb = await createWorkbook();
  const ws = wb.addWorksheet("일정표_New");
  const columns = sortedColumns(input.columns);
  const built = buildExportRows({ ...input, columns });

  ws.getColumn(1).width = WEEKLY_DATE_COL_PX / PX_PER_CHAR;
  ws.getColumn(2).width = WEEKLY_WEEKDAY_COL_PX / PX_PER_CHAR;
  columns.forEach((_, k) => {
    ws.getColumn(3 + 2 * k).width = WEEKLY_MAIN_COL_PX / PX_PER_CHAR;
    ws.getColumn(4 + 2 * k).width = WEEKLY_SUB_COL_PX / PX_PER_CHAR;
  });

  built.rows.forEach((row) => ws.addRow(row));
  // 헤더 행: 범례 4행 + 팀 라벨 행 다음(6번째 행).
  ws.getRow(6).font = { name: FONT_NAME, size: 10, bold: true };
  built.dateRowIndexes.forEach((rowIndex) => {
    ws.getCell(rowIndex + 1, 1).numFmt = "m/d/yy";
  });
  built.fills.forEach((fill) => {
    ws.getCell(fill.rowIndex + 1, fill.colIndex + 1).fill = solid(`FF${fill.color}`);
  });
  built.fonts.forEach((font) => {
    ws.getCell(font.rowIndex + 1, font.colIndex + 1).font = {
      name: FONT_NAME,
      size: 10,
      color: { argb: `FF${font.color}` },
    };
  });
  return wb;
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

export async function downloadWeeklyWorkbook(
  input: WorkbookInput & { weekStarts: string[]; paper: PaperSize; fileName: string },
): Promise<void> {
  await saveWorkbook(await buildWeeklyWorkbook(input), input.fileName);
}

export async function downloadMonthlyWorkbook(
  input: WorkbookInput & { month: string; paper: PaperSize; fileName: string },
): Promise<void> {
  await saveWorkbook(await buildMonthlyWorkbook(input), input.fileName);
}

export async function downloadDataWorkbook(
  input: WorkbookInput & { dates: string[]; fileName: string },
): Promise<void> {
  await saveWorkbook(await buildDataWorkbook(input), input.fileName);
}
