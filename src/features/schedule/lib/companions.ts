import { firstFreeRow } from "@/features/schedule/lib/cell-grid";
import type { CellPosition, ScheduleCell, ScheduleTextInput } from "@/features/schedule/types";

/**
 * 입회·신호수 항목(순수 함수). 엑셀 일정표는 같은 팀 열의 **별도 행**에
 * `입회 : 이름`, `신호수 : 이름`을 뒤 칸 글로 적는다(국소 칸은 비어 있다).
 * 칸 창의 체크박스는 이 별도 행을 만들고, 고치고, 지운다.
 */

export type CompanionKind = "입회" | "신호수";
export const COMPANION_KINDS: readonly CompanionKind[] = ["입회", "신호수"];

// `입회`, `입회 : 이름`, `신호수: 이름`(전각 콜론 포함). `신호수 2명`·`입회자`는 해당 없음.
const COMPANION_PATTERN = /^(입회|신호수)\s*(?:[:：]\s*(.*))?$/;

export function parseCompanionText(subText: string): { kind: CompanionKind; names: string } | null {
  const match = COMPANION_PATTERN.exec(subText.trim());
  if (!match) return null;
  return { kind: match[1] as CompanionKind, names: (match[2] ?? "").trim() };
}

/** 이름이 있으면 `종류 : 이름`, 없으면 종류만. */
export function formatCompanionText(kind: CompanionKind, names: string): string {
  const trimmed = names.trim();
  return trimmed === "" ? kind : `${kind} : ${trimmed}`;
}

/** 국소 칸이 비고 뒤 칸이 입회·신호수 글인 칸인가. */
export function isCompanionCell(cell: ScheduleCell): boolean {
  return cell.mainText === "" && parseCompanionText(cell.subText) !== null;
}

/** 같은 날짜·팀에서 종류별 항목 칸을 찾는다. 겹치면 앞 행을 쓰고, `excludeId`인 칸은 건너뛴다. */
export function findCompanions(
  cells: ScheduleCell[],
  workDate: string,
  columnId: string,
  excludeId: string | null = null,
): Record<CompanionKind, ScheduleCell | null> {
  const found: Record<CompanionKind, ScheduleCell | null> = { 입회: null, 신호수: null };
  const sorted = cells
    .filter(
      (cell) =>
        cell.workDate === workDate &&
        cell.columnId === columnId &&
        cell.id !== excludeId &&
        cell.mainText === "",
    )
    .sort((a, b) => a.rowNo - b.rowNo);
  for (const cell of sorted) {
    const kind = parseCompanionText(cell.subText)?.kind;
    if (kind && found[kind] === null) found[kind] = cell;
  }
  return found;
}

export interface CompanionInput {
  kind: CompanionKind;
  enabled: boolean;
  names: string;
}

export type CompanionOp =
  | { op: "create"; position: CellPosition; text: ScheduleTextInput }
  | { op: "update"; id: string; text: ScheduleTextInput }
  | { op: "delete"; id: string };

/**
 * 체크 상태에 맞춰 할 일을 계산한다. 체크했는데 칸이 없으면 만들고, 글이 바뀌었으면 고치고,
 * 체크를 풀었는데 칸이 있으면 지운다. 새 칸은 `anchorRow` 아래의 빈 행부터 쓰고(없으면 위로 돌아간다),
 * `reservedRows`는 같은 저장에서 방금 만들 칸이 쓰는 행이라 비어 있지 않은 것으로 본다.
 * 빈 행이 없으면 `{ error: "full" }`.
 */
export function planCompanionOps(input: {
  cells: ScheduleCell[];
  workDate: string;
  columnId: string;
  excludeId: string | null;
  companions: CompanionInput[];
  anchorRow?: number;
  reservedRows?: number[];
}): { ops: CompanionOp[] } | { error: "full" } {
  const { workDate, columnId } = input;
  const existing = findCompanions(input.cells, workDate, columnId, input.excludeId);
  const working: ScheduleCell[] = [...input.cells];
  const occupy = (rowNo: number) =>
    working.push({
      id: `reserved-${rowNo}`,
      workDate,
      columnId,
      rowNo,
      mainText: "-",
      subText: "",
      textColor: null,
    });
  for (const rowNo of input.reservedRows ?? []) occupy(rowNo);
  const fromRow = (input.anchorRow ?? -1) + 1;

  const ops: CompanionOp[] = [];
  for (const companion of input.companions) {
    const found = existing[companion.kind];
    if (!companion.enabled) {
      if (found) ops.push({ op: "delete", id: found.id });
      continue;
    }
    const subText = formatCompanionText(companion.kind, companion.names);
    if (found) {
      if (found.subText !== subText) {
        ops.push({
          op: "update",
          id: found.id,
          text: { mainText: "", subText, textColor: found.textColor },
        });
      }
      continue;
    }
    const rowNo = firstFreeRow(working, workDate, columnId, fromRow);
    if (rowNo === null) return { error: "full" };
    occupy(rowNo);
    ops.push({
      op: "create",
      position: { workDate, columnId, rowNo },
      text: { mainText: "", subText, textColor: null },
    });
  }
  return { ops };
}
