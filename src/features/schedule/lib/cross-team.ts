import { firstFreeRow } from "@/features/schedule/lib/cell-grid";
import { isCompanionCell } from "@/features/schedule/lib/companions";
import { stationKey } from "@/features/schedule/lib/day-stations";
import type {
  CellPosition,
  ScheduleCell,
  ScheduleTextInput,
  TextColor,
} from "@/features/schedule/types";

/**
 * 같은 날짜의 여러 팀에 같은 국소를 한 번에 등록하는 계획(순수 함수).
 * 팀마다 같은 입력을 반복하지 않게, 칸 편집 창에서 새로 추가한 국소를 고른 팀에도 만든다.
 */

export interface CrossTeamEntry {
  mainText: string;
  subText: string;
  textColor: TextColor | null;
  noCompanion: boolean;
}

export interface CrossTeamPlan {
  /** 팀(열)별로 만들 칸 */
  creates: { columnId: string; position: CellPosition; text: ScheduleTextInput }[];
  /** 건너뛴 항목. `full`은 그 팀의 행이 모자라서, `duplicate`는 같은 국소가 이미 있어서 */
  skipped: { columnId: string; reason: "full" | "duplicate"; mainText: string }[];
}

export function planCrossTeamCreate(input: {
  cells: ScheduleCell[];
  workDate: string;
  targetColumnIds: string[];
  entries: CrossTeamEntry[];
}): CrossTeamPlan {
  const { workDate } = input;
  const plan: CrossTeamPlan = { creates: [], skipped: [] };
  const entries = input.entries.filter((entry) => entry.mainText.trim() !== "");

  for (const columnId of new Set(input.targetColumnIds)) {
    const working = [...input.cells];
    const inColumn = (cell: ScheduleCell) => cell.workDate === workDate && cell.columnId === columnId;
    const existingKeys = new Set(
      working
        .filter((cell) => inColumn(cell) && !isCompanionCell(cell))
        .map((cell) => stationKey(cell.mainText)),
    );
    // 입회·신호수 칸을 뺀 일정 목록의 마지막 행 아래부터 빈 행을 찾는다(없으면 위로 돌아간다).
    const anchorRow = Math.max(
      -1,
      ...working.filter((cell) => inColumn(cell) && !isCompanionCell(cell)).map((cell) => cell.rowNo),
    );

    for (const entry of entries) {
      const mainText = entry.mainText.trim();
      const key = stationKey(mainText);
      if (existingKeys.has(key)) {
        plan.skipped.push({ columnId, reason: "duplicate", mainText });
        continue;
      }
      const rowNo = firstFreeRow(working, workDate, columnId, anchorRow + 1);
      if (rowNo === null) {
        plan.skipped.push({ columnId, reason: "full", mainText });
        continue;
      }
      working.push({
        id: `cross-${columnId}-${rowNo}`,
        workDate,
        columnId,
        rowNo,
        mainText,
        subText: "",
        textColor: null,
      });
      existingKeys.add(key);
      const text: ScheduleTextInput = {
        mainText,
        subText: entry.subText.trim(),
        textColor: entry.textColor,
        // 표시했을 때만 값을 싣는다(컬럼이 없는 DB에서도 저장되도록).
        ...(entry.noCompanion ? { noCompanion: true } : {}),
      };
      plan.creates.push({ columnId, position: { workDate, columnId, rowNo }, text });
    }
  }
  return plan;
}
