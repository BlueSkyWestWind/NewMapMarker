import { isCompanionCell } from "@/features/schedule/lib/companions";
import type { CellResult, ScheduleCell } from "@/features/schedule/types";

export type QuickToggle =
  | { kind: "set"; next: CellResult | null }
  | { kind: "open-dialog" };

/**
 * 주간 표 ✓ 버튼 클릭 시 다음 시행 결과를 결정한다.
 * 미기록 → 완료, 완료 → 미기록(취소), 일부완료·미시설 → 결과 창 열기.
 */
export function toggleDone(current: CellResult | null): QuickToggle {
  if (current === null) {
    return { kind: "set", next: { status: "done", reason: "", rescheduledTo: null } };
  }
  if (current.status === "done") {
    return { kind: "set", next: null };
  }
  return { kind: "open-dialog" };
}

/**
 * 특정 날짜의 국소 칸(입회·신호수 및 빈 칸 제외)에 대한 완료 현황을 집계한다.
 */
export function completionSummary(
  cells: readonly ScheduleCell[],
  date: string,
): { done: number; recorded: number; total: number } {
  let done = 0;
  let recorded = 0;
  let total = 0;

  for (const cell of cells) {
    if (cell.workDate !== date) continue;
    if (isCompanionCell(cell) || cell.mainText.trim() === "") continue;
    total += 1;
    if (cell.result) {
      recorded += 1;
      if (cell.result.status === "done") {
        done += 1;
      }
    }
  }

  return { done, recorded, total };
}
