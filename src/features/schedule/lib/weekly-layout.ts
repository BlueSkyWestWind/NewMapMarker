import { EXPORT_MIN_ROWS } from "@/features/schedule/lib/schedule-excel";
import { weekdayLabel, weekDatesOf } from "@/features/schedule/lib/week";
import type { ScheduleCell, ScheduleDayNote } from "@/features/schedule/types";

/**
 * 주간 배포 파일 계산. 주 단위 날짜 블록 구성과 용지별 확대율을 구한다(순수 함수).
 * 맞춤 인쇄(Fit to)는 쓰지 않는다 — Excel은 맞춤 인쇄일 때 수동 쪽 나눔을 무시하므로 확대율을 고정한다.
 */

export type PaperSize = "A3" | "A4";
/** 가로 방향 용지 크기(pt). */
export const PAPER_PT = {
  A3: { width: 1190.55, height: 841.89 },
  A4: { width: 841.89, height: 595.28 },
} as const;

/** 원본 일정표_New의 행 높이. */
export const WEEKLY_ROW_HEIGHT_PT = 21.95;
/** 팀 이름 + 팀장 두 줄. */
export const WEEKLY_HEADER_HEIGHT_PT = 34;
/** 0.4인치. */
export const WEEKLY_MARGIN_PT = 28.8;
/** 원본 열 너비(px): 날짜. */
export const WEEKLY_DATE_COL_PX = 142;
/** 원본 열 너비(px): 요일·날짜 메모. */
export const WEEKLY_WEEKDAY_COL_PX = 76;
/** 팀 앞 칸(국소·작업). */
export const WEEKLY_MAIN_COL_PX = 205;
/** 팀 뒤 칸(모국·장비·메모). */
export const WEEKLY_SUB_COL_PX = 125;

const PX_TO_PT = 0.75;
const MIN_SCALE = 10;
const MAX_SCALE = 100;

export interface WeeklyDay {
  workDate: string;
  /** "월요일" */
  weekday: string;
  note: string;
  rowCount: number;
}

export interface WeeklyWeek {
  start: string;
  days: WeeklyDay[];
}

/** 그 날짜 블록의 행 수: 최소 10행, 행 번호가 크면 그 아래까지. */
export function weeklyDayRowCount(cells: ScheduleCell[], workDate: string): number {
  let maxRow = -1;
  for (const cell of cells) {
    if (cell.workDate === workDate && cell.rowNo > maxRow) maxRow = cell.rowNo;
  }
  return Math.max(EXPORT_MIN_ROWS, maxRow + 1);
}

export function buildWeeklyWeeks(input: {
  weekStarts: string[];
  cells: ScheduleCell[];
  dayNotes: ScheduleDayNote[];
}): WeeklyWeek[] {
  const noteByDate = new Map(input.dayNotes.map((entry) => [entry.workDate, entry.note]));
  return input.weekStarts.map((start) => ({
    start,
    days: weekDatesOf(start).map((workDate) => ({
      workDate,
      weekday: `${weekdayLabel(workDate)}요일`,
      note: noteByDate.get(workDate) ?? "",
      rowCount: weeklyDayRowCount(input.cells, workDate),
    })),
  }));
}

/** 표 내용 폭(pt). */
export function weeklyContentWidthPt(columnCount: number): number {
  const px =
    WEEKLY_DATE_COL_PX + WEEKLY_WEEKDAY_COL_PX + columnCount * (WEEKLY_MAIN_COL_PX + WEEKLY_SUB_COL_PX);
  return px * PX_TO_PT;
}

/** 한 주가 한 쪽에 들어가는 확대율(정수 %, 10~100). */
export function computeWeeklyScale(input: {
  paper: PaperSize;
  columnCount: number;
  weekRowCounts: number[];
}): number {
  const paper = PAPER_PT[input.paper];
  const printableWidth = paper.width - 2 * WEEKLY_MARGIN_PT;
  const printableHeight = paper.height - 2 * WEEKLY_MARGIN_PT;
  const maxRows = Math.max(0, ...input.weekRowCounts);
  const contentHeight = WEEKLY_HEADER_HEIGHT_PT + maxRows * WEEKLY_ROW_HEIGHT_PT;
  const ratio = Math.min(
    printableWidth / weeklyContentWidthPt(input.columnCount),
    printableHeight / contentHeight,
  );
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.floor(ratio * 100)));
}
