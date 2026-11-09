import { isCompanionCell, parseCompanionText } from "@/features/schedule/lib/companions";
import type { ScheduleCell } from "@/features/schedule/types";

/**
 * 한 팀·한 날짜의 행을 `대상 국소 → 입회 → 신호수 → 나머지 국소` 순으로 정리하는 이동 계획(순수 함수).
 * 일정표에서 입회·신호수가 붙는 국소가 한 묶음으로 보이게 한다.
 *
 * - `cells`는 한 팀·한 날짜의 칸 전부다.
 * - 대상 표시(`companionTarget`)가 있는 국소가 하나도 없으면 **순서는 바꾸지 않고** 빈 행만 닫는다.
 *   (일정을 삭제하면 그 행이 비어 위쪽·입회 위에 빈칸이 남기 때문이다.)
 * - 행은 0행부터 빈틈 없이 이어 붙인다. 국소끼리의 순서는 원래 행 순서를 지킨다.
 * - 반환은 `moveScheduleCell`(도착 자리가 차 있으면 서로 맞바꾼다)을 **차례로** 부를 목록이다.
 */
export function planCompanionArrangement(cells: ScheduleCell[]): { id: string; toRow: number }[] {
  const byRow = [...cells].sort((a, b) => a.rowNo - b.rowNo);
  const stations = byRow.filter((cell) => !isCompanionCell(cell));
  const hasTarget = stations.some((cell) => cell.companionTarget === true);

  const companionRank = (cell: ScheduleCell) => (parseCompanionText(cell.subText)?.kind === "입회" ? 0 : 1);
  const companions = byRow
    .filter((cell) => isCompanionCell(cell))
    .sort((a, b) => companionRank(a) - companionRank(b) || a.rowNo - b.rowNo);

  const desired = hasTarget
    ? [
        ...stations.filter((cell) => cell.companionTarget === true),
        ...companions,
        ...stations.filter((cell) => cell.companionTarget !== true),
      ]
    : byRow;

  // 맞바꾸기 규칙을 그대로 흉내 내며, 0행부터 원하는 칸을 제자리에 앉힌다.
  const rowOf = new Map(cells.map((cell) => [cell.id, cell.rowNo]));
  const moves: { id: string; toRow: number }[] = [];
  desired.forEach((cell, targetRow) => {
    const current = rowOf.get(cell.id) as number;
    if (current === targetRow) return;
    const occupant = [...rowOf.entries()].find(([, row]) => row === targetRow)?.[0];
    rowOf.set(cell.id, targetRow);
    if (occupant !== undefined && occupant !== cell.id) rowOf.set(occupant, current);
    moves.push({ id: cell.id, toRow: targetRow });
  });
  return moves;
}
