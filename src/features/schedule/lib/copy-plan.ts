import { nextFreeRows } from "@/features/schedule/lib/unscheduled-stations";
import { addDays, weekDatesOf, weekStartOf } from "@/features/schedule/lib/week";
import type {
  CellPosition,
  ScheduleCell,
  ScheduleTextInput,
} from "@/features/schedule/types";

export type CopyMode = "skip" | "append";

export interface CopyPair {
  from: string;
  to: string;
}

export interface CopyInput {
  /** 날짜 복제: 원본 하나 × 대상 여러 개 / 주 복제: 7일 × N주 */
  pairs: CopyPair[];
  /** 복제할 팀(비고 열은 호출부가 제외한다) */
  columnIds: string[];
  mode: CopyMode;
  /** from과 to 날짜의 칸 전부 */
  cells: ScheduleCell[];
  maxRows: number;
}

export interface CopyDaySummary {
  to: string;
  copied: number;
  skippedTeams: number;
  skippedFull: number;
}

export interface CopyPlan {
  creates: { position: CellPosition; text: ScheduleTextInput }[];
  summary: CopyDaySummary[];
}

const MAX_DATE_TARGETS = 31;
const MAX_WEEK_COPIES = 8;

function toCopyText(cell: ScheduleCell): ScheduleTextInput {
  return {
    mainText: cell.mainText,
    subText: cell.subText,
    textColor: cell.textColor,
    ...(cell.companionTarget ? { companionTarget: true } : {}),
  };
}

/**
 * 원본 날짜(`from`)와 대상 날짜들(`targets`)을 복제 쌍으로 만든다.
 * 중복과 `from` 자신은 빼고 최대 31개까지만 남긴다.
 */
export function buildDatePairs(from: string, targets: readonly string[]): CopyPair[] {
  const seen = new Set<string>();
  const pairs: CopyPair[] = [];
  for (const to of targets) {
    if (to === from || seen.has(to)) continue;
    seen.add(to);
    pairs.push({ from, to });
    if (pairs.length >= MAX_DATE_TARGETS) break;
  }
  return pairs;
}

/**
 * `anyDateInWeek`가 속한 주(월~일 7일)를 다음 `weeks`주(최대 8주)의 같은 요일에 매핑한다.
 */
export function buildWeekPairs(anyDateInWeek: string, weeks: number): CopyPair[] {
  const clamped = Math.min(MAX_WEEK_COPIES, Math.max(0, Math.floor(weeks)));
  const sourceDays = weekDatesOf(weekStartOf(anyDateInWeek));
  const pairs: CopyPair[] = [];
  for (let w = 1; w <= clamped; w += 1) {
    for (const from of sourceDays) {
      pairs.push({ from, to: addDays(from, 7 * w) });
    }
  }
  return pairs;
}

/**
 * 선택한 날짜·주 쌍과 팀에 대해 일정 복제 계획을 세운다(순수 함수).
 * 시행 결과(`result`)·날짜 메모·칸 색은 복제하지 않는다.
 */
export function planCopy(input: CopyInput): CopyPlan {
  const creates: CopyPlan["creates"] = [];
  const summary: CopyDaySummary[] = [];

  const uniqueColumnIds = [...new Set(input.columnIds)];
  const seenTo = new Set<string>();
  const uniquePairs: CopyPair[] = [];
  for (const pair of input.pairs) {
    if (seenTo.has(pair.to)) continue;
    seenTo.add(pair.to);
    uniquePairs.push(pair);
  }

  for (const { from, to } of uniquePairs) {
    let copied = 0;
    let skippedTeams = 0;
    let skippedFull = 0;

    for (const columnId of uniqueColumnIds) {
      const source = input.cells
        .filter((cell) => cell.workDate === from && cell.columnId === columnId)
        .sort((a, b) => a.rowNo - b.rowNo);
      if (source.length === 0) continue;

      const dest = input.cells.filter(
        (cell) => cell.workDate === to && cell.columnId === columnId,
      );

      if (input.mode === "skip") {
        if (dest.length > 0) {
          skippedTeams += 1;
          continue;
        }
        for (const cell of source) {
          if (cell.rowNo >= input.maxRows) {
            skippedFull += 1;
            continue;
          }
          creates.push({
            position: { workDate: to, columnId, rowNo: cell.rowNo },
            text: toCopyText(cell),
          });
          copied += 1;
        }
        continue;
      }

      const usedRows = dest.map((cell) => cell.rowNo);
      const freeRows = nextFreeRows(usedRows, source.length, input.maxRows);
      for (let i = 0; i < freeRows.length; i += 1) {
        creates.push({
          position: { workDate: to, columnId, rowNo: freeRows[i] },
          text: toCopyText(source[i]),
        });
        copied += 1;
      }
      skippedFull += source.length - freeRows.length;
    }

    summary.push({ to, copied, skippedTeams, skippedFull });
  }

  return { creates, summary };
}

function formatShortDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

/**
 * 복제 미리보기 요약을 `7/28 12건 · 7/29 8건 (건너뜀 2팀 · 넣지 못함 1건)` 형태로 만든다.
 */
export function formatCopyPreview(summary: readonly CopyDaySummary[]): string {
  const dayText = summary
    .filter((item) => item.copied > 0)
    .map((item) => `${formatShortDate(item.to)} ${item.copied}건`)
    .join(" · ");

  const skippedTeams = summary.reduce((acc, item) => acc + item.skippedTeams, 0);
  const skippedFull = summary.reduce((acc, item) => acc + item.skippedFull, 0);
  const notes = [
    skippedTeams > 0 ? `건너뜀 ${skippedTeams}팀` : null,
    skippedFull > 0 ? `넣지 못함 ${skippedFull}건` : null,
  ].filter((part): part is string => part !== null);

  if (dayText === "" && notes.length === 0) return "";
  if (dayText === "") return notes.join(" · ");
  if (notes.length === 0) return dayText;
  return `${dayText} (${notes.join(" · ")})`;
}
