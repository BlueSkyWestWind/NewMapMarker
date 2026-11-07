import {
  PAPER_PT,
  WEEKLY_MARGIN_PT,
  type PaperSize,
} from "@/features/schedule/lib/weekly-layout";
import { monthGridDates } from "@/features/schedule/lib/week";
import type {
  MarkColor,
  ScheduleCell,
  ScheduleColumn,
  ScheduleDayNote,
  ScheduleMark,
  TextColor,
} from "@/features/schedule/types";

/**
 * 월 달력 계산(순수 함수). 월요일 시작 격자에 날짜별 메모와 팀별 일정 줄을 채우고,
 * 월간 배포 파일의 행 높이·확대율을 어림한다.
 */

export const MONTH_DAY_COL_PX = 190;
export const MONTH_TITLE_HEIGHT_PT = 30;
export const MONTH_HEADER_HEIGHT_PT = 20;
export const MONTH_LINE_HEIGHT_PT = 12;
export const MONTH_MIN_WEEK_HEIGHT_PT = 60;
export const MONTH_CHARS_PER_LINE = 24;

const PX_TO_PT = 0.75;
const MIN_SCALE = 10;
const MAX_SCALE = 100;
const WEEK_PADDING_PT = 6;

export interface MonthEntry {
  /** 일정 칸 id. 월간 보기에서 끌어 옮길 때 쓴다 */
  id: string;
  mainText: string;
  subText: string;
  textColor: TextColor | null;
}

export interface MonthTeam {
  columnId: string;
  label: string;
  markColor: MarkColor | null;
  entries: MonthEntry[];
}

export interface MonthDay {
  workDate: string;
  inMonth: boolean;
  note: string;
  teams: MonthTeam[];
}

export interface MonthModel {
  month: string;
  /** "2026년 11월" */
  title: string;
  /** 4~6주, 각 7일(월~일) */
  weeks: MonthDay[][];
}

export function buildMonthModel(input: {
  month: string;
  columns: ScheduleColumn[];
  cells: ScheduleCell[];
  dayNotes: ScheduleDayNote[];
  marks: ScheduleMark[];
}): MonthModel {
  const columns = [...input.columns].sort((a, b) => a.sortOrder - b.sortOrder);
  const noteByDate = new Map(input.dayNotes.map((entry) => [entry.workDate, entry.note]));
  const markByKey = new Map(
    input.marks.map((mark) => [`${mark.workDate}|${mark.columnId}`, mark.color]),
  );
  const cellsByKey = new Map<string, ScheduleCell[]>();
  for (const cell of input.cells) {
    const key = `${cell.workDate}|${cell.columnId}`;
    const list = cellsByKey.get(key) ?? [];
    list.push(cell);
    cellsByKey.set(key, list);
  }

  const days: MonthDay[] = monthGridDates(input.month).map((workDate) => {
    const teams: MonthTeam[] = [];
    for (const column of columns) {
      const key = `${workDate}|${column.id}`;
      const entries = [...(cellsByKey.get(key) ?? [])]
        .sort((a, b) => a.rowNo - b.rowNo)
        .map((cell) => ({
          id: cell.id,
          mainText: cell.mainText,
          subText: cell.subText,
          textColor: cell.textColor,
        }));
      if (entries.length === 0) continue;
      teams.push({
        columnId: column.id,
        label: column.teamLabel,
        markColor: markByKey.get(key) ?? null,
        entries,
      });
    }
    return {
      workDate,
      inMonth: workDate.startsWith(`${input.month}-`),
      note: noteByDate.get(workDate) ?? "",
      teams,
    };
  });

  const weeks: MonthDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const [year, month] = input.month.split("-");
  return { month: input.month, title: `${year}년 ${Number(month)}월`, weeks };
}

/** 국소 + (모국). 국소가 없으면 모국만. */
export function monthEntryText(entry: MonthEntry): string {
  if (!entry.mainText) return entry.subText;
  return entry.subText ? `${entry.mainText} (${entry.subText})` : entry.mainText;
}

/** `팀 · 항목1, 항목2` */
export function monthTeamLineText(team: MonthTeam): string {
  return `${team.label} · ${team.entries.map(monthEntryText).join(", ")}`;
}

/** 글자 수로 줄 수를 어림한다. */
export function estimateLines(value: string): number {
  return Math.max(1, Math.ceil(value.length / MONTH_CHARS_PER_LINE));
}

function dayLineCount(day: MonthDay): number {
  return day.teams.reduce((sum, team) => sum + estimateLines(monthTeamLineText(team)), 0);
}

/** 한 주 행의 높이(pt). 가장 바쁜 날의 줄 수 + 날짜 줄 1개로 정한다. */
export function monthWeekHeightPt(week: MonthDay[]): number {
  const busiest = week.reduce((max, day) => Math.max(max, dayLineCount(day)), 0);
  return Math.max(
    MONTH_MIN_WEEK_HEIGHT_PT,
    (1 + busiest) * MONTH_LINE_HEIGHT_PT + WEEK_PADDING_PT,
  );
}

/** 한 달이 한 쪽에 들어가는 확대율(정수 %, 10~100). */
export function computeMonthScale(input: { paper: PaperSize; weekHeightsPt: number[] }): number {
  const paper = PAPER_PT[input.paper];
  const printableWidth = paper.width - 2 * WEEKLY_MARGIN_PT;
  const printableHeight = paper.height - 2 * WEEKLY_MARGIN_PT;
  const contentWidth = 7 * MONTH_DAY_COL_PX * PX_TO_PT;
  const contentHeight =
    MONTH_TITLE_HEIGHT_PT +
    MONTH_HEADER_HEIGHT_PT +
    input.weekHeightsPt.reduce((sum, height) => sum + height, 0);
  const ratio = Math.min(printableWidth / contentWidth, printableHeight / contentHeight);
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.floor(ratio * 100)));
}
