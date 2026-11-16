import { exclusionKey } from "@/features/schedule/lib/excluded-stations";
import type { ScheduleCell } from "@/features/schedule/types";

export const INCOMPLETE_LIMIT = 500;

/** 후속 일정(`rescheduledTo`)이 잡혀 있는 미완료 칸인지 판별한다. */
export function isRescheduled(cell: ScheduleCell): boolean {
  return Boolean(cell.result?.rescheduledTo?.trim());
}

/** 칸의 국소명(`mainText`)을 정규화해 마커 기준 시설 완료 날짜를 찾는다. 없으면 null. */
export function installedDateOf(
  cell: ScheduleCell,
  installed: ReadonlyMap<string, string>,
): string | null {
  const key = exclusionKey(cell.mainText);
  if (!key) return null;
  return installed.get(key) ?? null;
}

/** 마커 기준 시설 완료에 해당하는 칸 건수를 센다. */
export function countInstalled(
  cells: readonly ScheduleCell[],
  installed: ReadonlyMap<string, string>,
): number {
  let count = 0;
  for (const cell of cells) {
    if (installedDateOf(cell, installed) !== null) count += 1;
  }
  return count;
}

/**
 * 미완료 목록을 필터링하고 정렬한다.
 * - `includeRescheduled`가 false이면 후속 일정이 잡힌 칸은 뺀다.
 * - 영구 제외 국소(`excludedKeys`)와 같은 국소명은 뺀다.
 * - `includeInstalled`가 true가 아니고 `installedDates`에 칸의 키가 있으면(시설 완료) 뺀다.
 * - 최근 작업일(`workDate`) 내림차순으로 정렬한다. 같은 날 안에서는 `columnOrder`(열 id → 순서)가 있으면
 *   팀 순서대로 묶고(목록에 없는 팀은 뒤로), 팀 안에서는 행 번호(`rowNo`) 오름차순이다.
 */
export function selectIncomplete(
  cells: readonly ScheduleCell[],
  opts: {
    includeRescheduled: boolean;
    excludedKeys: ReadonlySet<string>;
    columnOrder?: ReadonlyMap<string, number>;
    installedDates?: ReadonlyMap<string, string>;
    includeInstalled?: boolean;
  },
): ScheduleCell[] {
  const orderOf = (columnId: string) => opts.columnOrder?.get(columnId) ?? Number.MAX_SAFE_INTEGER;
  return cells
    .filter((cell) => {
      if (!opts.includeRescheduled && isRescheduled(cell)) return false;
      const key = exclusionKey(cell.mainText);
      if (key && opts.excludedKeys.has(key)) return false;
      if (!opts.includeInstalled && opts.installedDates && installedDateOf(cell, opts.installedDates) !== null) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.workDate !== b.workDate) {
        return b.workDate.localeCompare(a.workDate);
      }
      const byTeam = orderOf(a.columnId) - orderOf(b.columnId);
      if (byTeam !== 0) return byTeam;
      return a.rowNo - b.rowNo;
    });
}

/** 전체 미완료 건수와 후속 일정이 아직 잡히지 않은(`open`) 건수를 돌려준다. */
export function incompleteCounts(cells: readonly ScheduleCell[]): { total: number; open: number } {
  let open = 0;
  for (const cell of cells) {
    if (!isRescheduled(cell)) open += 1;
  }
  return { total: cells.length, open };
}
