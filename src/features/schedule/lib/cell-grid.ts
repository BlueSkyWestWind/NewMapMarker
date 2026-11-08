import type { CellPosition, ScheduleCell, ScheduleColumn } from "@/features/schedule/types";

/** 칸이 없는 날도 이만큼의 행은 보여 준다. 화면 전용이다(엑셀 내보내기는 `EXPORT_MIN_ROWS` 10행). */
export const MIN_VISIBLE_ROWS = 4;
/** DB의 `row_no` 0..29와 같다. */
export const MAX_ROWS = 30;

/** 기본 숨김(체크 시 표시) 대상인 선택 열 이름. 6팀은 쓰는 날만 켜서 보려고 넣었다. */
export const OPTIONAL_COLUMN_LABELS = ["6팀", "시험팀", "실사&재하도급"] as const;

export function isOptionalScheduleColumn(column: ScheduleColumn): boolean {
  const label = column.teamLabel.trim();
  return (OPTIONAL_COLUMN_LABELS as readonly string[]).includes(label);
}

/** 기본 열은 항상 남기고, 선택 열(6팀·시험팀·실사&재하도급)은 체크된 ID만 남긴다. */
export function filterVisibleScheduleColumns(
  columns: ScheduleColumn[],
  visibleOptionalIds: ReadonlySet<string>,
): ScheduleColumn[] {
  return columns.filter(
    (column) => !isOptionalScheduleColumn(column) || visibleOptionalIds.has(column.id),
  );
}

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

/** 같은 날짜·같은 팀(열)에 있는 칸들. 한꺼번에 등록한 국소들이 한 묶음이다. 행 순서로 정렬한다. */
export function groupOfCell(cells: ScheduleCell[], cell: CellPosition): ScheduleCell[] {
  return cells
    .filter((other) => other.workDate === cell.workDate && other.columnId === cell.columnId)
    .sort((a, b) => a.rowNo - b.rowNo);
}

export type GroupDropPlan =
  | { kind: "none" }
  | { kind: "full" }
  /** `ids`를 이 순서대로 도착 날짜·팀의 빈 행에 하나씩 옮긴다 */
  | { kind: "move"; ids: string[] };

/**
 * 묶음(끈 칸과 같은 날짜·팀의 모든 칸)을 `target`의 날짜·팀으로 옮기는 계획.
 * 같은 날짜·팀이면 없음, 도착 팀의 빈 행이 모자라면 full, 아니면 행 순서대로 옮긴다.
 * 도착 팀에 이미 있는 칸은 건드리지 않고 그 아래 빈 행에 이어 붙는다.
 */
export function planGroupDrop(
  cells: ScheduleCell[],
  dragged: CellPosition,
  target: CellPosition,
): GroupDropPlan {
  if (dragged.workDate === target.workDate && dragged.columnId === target.columnId) {
    return { kind: "none" };
  }
  const group = groupOfCell(cells, dragged);
  const occupied = groupOfCell(cells, target).length;
  if (occupied + group.length > MAX_ROWS) return { kind: "full" };
  return { kind: "move", ids: group.map((cell) => cell.id) };
}

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
