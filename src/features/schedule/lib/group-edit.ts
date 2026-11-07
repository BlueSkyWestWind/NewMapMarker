import { firstFreeRow, indexCells, positionKey } from "@/features/schedule/lib/cell-grid";
import { isCompanionCell } from "@/features/schedule/lib/companions";
import type { CellPosition, ScheduleCell, ScheduleTextInput, TextColor } from "@/features/schedule/types";

/**
 * 한 팀·한 날짜의 일정 칸들을 한 목록으로 고치는 계산(순수 함수).
 * 칸 창은 클릭한 칸 하나가 아니라 그 팀·날짜의 모든 국소를 목록으로 보여 주고,
 * 저장할 때 이 계산이 고침·삭제·추가(행 배정)를 한 번에 정한다. 입회·신호수 칸은 목록에 넣지 않는다.
 */

export interface EntryDraft {
  /** 목록 안에서의 식별자. 기존 칸은 칸 id, 새 항목은 임의 키 */
  key: string;
  /** 기존 칸이면 칸 id, 새 항목이면 null */
  id: string | null;
  /** 기존 칸의 행, 클릭한 빈 행의 새 항목은 그 행, 그 밖의 새 항목은 null */
  rowNo: number | null;
  mainText: string;
  subText: string;
  textColor: TextColor | null;
}

export type GroupOp =
  | { op: "delete"; id: string }
  | { op: "update"; id: string; text: ScheduleTextInput }
  | { op: "create"; key: string; position: CellPosition; text: ScheduleTextInput };

function groupCells(cells: ScheduleCell[], workDate: string, columnId: string): ScheduleCell[] {
  return cells
    .filter(
      (cell) =>
        cell.workDate === workDate && cell.columnId === columnId && !isCompanionCell(cell),
    )
    .sort((a, b) => a.rowNo - b.rowNo);
}

/** 그 팀·날짜의 일정 칸을 행 순서의 목록 초안으로. */
export function draftsFromCells(
  cells: ScheduleCell[],
  workDate: string,
  columnId: string,
): EntryDraft[] {
  return groupCells(cells, workDate, columnId).map((cell) => ({
    key: cell.id,
    id: cell.id,
    rowNo: cell.rowNo,
    mainText: cell.mainText,
    subText: cell.subText,
    textColor: cell.textColor,
  }));
}

/**
 * 목록 초안을 저장할 때 할 일. 순서는 지움 → 고침 → 추가다(지운 칸의 행은 새 항목이 쓸 수 있다).
 * - 목록에서 빠진 기존 칸은 지운다.
 * - 글·뒤 칸·글자색이 바뀐 기존 칸만 고친다(앞뒤 공백 차이는 바뀐 것이 아니다).
 * - 새 항목은 클릭한 행이 있으면 그 행에, 없으면 마지막 항목 아래의 빈 행(없으면 위로 돌아감)에 만든다.
 * - 글이 없는 새 항목은 무시하고, 글을 모두 지운 기존 항목은 `{ error: "blank" }`다.
 * - 빈 행이 모자라면 `{ error: "full" }`.
 * `usedRows`는 새로 만드는 칸의 행이다(입회·신호수 계획이 피해야 할 행).
 */
export function planGroupOps(input: {
  cells: ScheduleCell[];
  workDate: string;
  columnId: string;
  drafts: EntryDraft[];
}): { ops: GroupOp[]; usedRows: number[] } | { error: "blank" | "full" } {
  const { workDate, columnId, drafts } = input;
  const group = groupCells(input.cells, workDate, columnId);
  const groupById = new Map(group.map((cell) => [cell.id, cell]));
  const keptIds = new Set(drafts.flatMap((draft) => (draft.id ? [draft.id] : [])));
  const trimmed = (draft: EntryDraft): ScheduleTextInput => ({
    mainText: draft.mainText.trim(),
    subText: draft.subText.trim(),
    textColor: draft.textColor,
  });
  const isBlank = (text: ScheduleTextInput) => text.mainText === "" && text.subText === "";

  const deletes: GroupOp[] = group
    .filter((cell) => !keptIds.has(cell.id))
    .map((cell) => ({ op: "delete", id: cell.id }));

  const updates: GroupOp[] = [];
  for (const draft of drafts) {
    if (!draft.id) continue;
    const current = groupById.get(draft.id);
    if (!current) continue;
    const text = trimmed(draft);
    if (isBlank(text)) return { error: "blank" };
    if (
      text.mainText !== current.mainText ||
      text.subText !== current.subText ||
      text.textColor !== current.textColor
    ) {
      updates.push({ op: "update", id: draft.id, text });
    }
  }

  // 지울 칸의 행은 같은 저장에서 비는 것으로 본다.
  const deletedIds = new Set(deletes.map((op) => (op.op === "delete" ? op.id : "")));
  const working = input.cells.filter((cell) => !deletedIds.has(cell.id));
  const occupied = indexCells(working);
  const creatable = drafts.filter((draft) => draft.id === null && !isBlank(trimmed(draft)));
  const anchorRow = Math.max(
    -1,
    ...drafts
      .filter((draft) => draft.rowNo !== null && (draft.id !== null || creatable.includes(draft)))
      .map((draft) => draft.rowNo as number),
  );

  const creates: GroupOp[] = [];
  const usedRows: number[] = [];
  for (const draft of creatable) {
    const wanted =
      draft.rowNo !== null && !occupied.has(positionKey({ workDate, columnId, rowNo: draft.rowNo }))
        ? draft.rowNo
        : null;
    const rowNo = wanted ?? firstFreeRow(working, workDate, columnId, anchorRow + 1);
    if (rowNo === null) return { error: "full" };
    const position: CellPosition = { workDate, columnId, rowNo };
    const placeholder: ScheduleCell = {
      id: `new-${draft.key}`,
      workDate,
      columnId,
      rowNo,
      mainText: "-",
      subText: "",
      textColor: null,
    };
    working.push(placeholder);
    occupied.set(positionKey(position), placeholder);
    usedRows.push(rowNo);
    creates.push({ op: "create", key: draft.key, position, text: trimmed(draft) });
  }

  return { ops: [...deletes, ...updates, ...creates], usedRows };
}
