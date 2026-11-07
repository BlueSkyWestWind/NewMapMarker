import type { CellPosition, ScheduleCell } from "@/features/schedule/types";

/** 칸이 없는 날도 이만큼의 행은 보여 준다. 엑셀 일정표의 날짜 블록(10행)과 같다. */
export const MIN_VISIBLE_ROWS = 10;
/** DB의 `row_no` 0..29와 같다. */
export const MAX_ROWS = 30;

export function positionKey(position: CellPosition): string {
  return `${position.workDate}|${position.columnId}|${position.rowNo}`;
}

export function indexCells(cells: ScheduleCell[]): Map<string, ScheduleCell> {
  return new Map(cells.map((cell) => [positionKey(cell), cell]));
}

/** 그 날짜 블록에서 보여 줄 행 수. 마지막 칸 아래에 빈 행 하나를 더해 새 칸을 넣을 자리를 둔다. */
export function visibleRowCount(cells: ScheduleCell[], workDate: string): number {
  let maxRow = -1;
  for (const cell of cells) {
    if (cell.workDate === workDate && cell.rowNo > maxRow) maxRow = cell.rowNo;
  }
  return Math.min(MAX_ROWS, Math.max(MIN_VISIBLE_ROWS, maxRow + 2));
}

/**
 * 그 날짜·열에서 비어 있는 행. `fromRow`부터 아래로 찾고, 아래가 모두 차 있으면 위(0행)로 돌아간다.
 * 기본은 0행부터라 가장 작은 빈 행이다. 모두 차 있으면 null.
 */
export function firstFreeRow(
  cells: ScheduleCell[],
  workDate: string,
  columnId: string,
  fromRow = 0,
): number | null {
  const used = new Set(
    cells
      .filter((cell) => cell.workDate === workDate && cell.columnId === columnId)
      .map((cell) => cell.rowNo),
  );
  const start = Math.min(Math.max(fromRow, 0), MAX_ROWS - 1);
  for (let offset = 0; offset < MAX_ROWS; offset += 1) {
    const row = (start + offset) % MAX_ROWS;
    if (!used.has(row)) return row;
  }
  return null;
}

export type DropPlan =
  | { kind: "none" }
  | { kind: "move" }
  | { kind: "swap"; with: ScheduleCell };

/** 칸을 끌어 `target`에 놓았을 때 할 일. 같은 자리면 없음, 빈 칸이면 이동, 찬 칸이면 맞바꿈. */
export function planDrop(
  cells: ScheduleCell[],
  dragged: ScheduleCell,
  target: CellPosition,
): DropPlan {
  if (positionKey(dragged) === positionKey(target)) return { kind: "none" };
  const occupant = indexCells(cells).get(positionKey(target));
  if (occupant && occupant.id !== dragged.id) return { kind: "swap", with: occupant };
  return { kind: "move" };
}
