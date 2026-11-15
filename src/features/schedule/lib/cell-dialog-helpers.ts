import {
  findCompanions,
  parseCompanionText,
  type CompanionKind,
} from "@/features/schedule/lib/companions";
import { draftsFromCells, type EntryDraft } from "@/features/schedule/lib/group-edit";
import type {
  CellPosition,
  ScheduleCell,
  ScheduleColumn,
  TextColor,
} from "@/features/schedule/types";

export const CLICKED_NEW_KEY = "clicked";

export interface CellEditorState {
  cell: ScheduleCell | null;
  position: CellPosition;
}

export type CompanionFields = Record<
  CompanionKind,
  { enabled: boolean; names: string }
>;

export function columnLabel(column: ScheduleColumn): string {
  return column.leaderLabel
    ? `${column.teamLabel} · ${column.leaderLabel}`
    : column.teamLabel;
}

/** 글자색을 없음 → 파랑 → 빨강 → 없음 순으로 돌린다. */
export function nextTextColor(color: TextColor | null): TextColor | null {
  if (color === null) return "0070C0";
  if (color === "0070C0") return "FF0000";
  return null;
}

/** 클릭한 빈 행의 새 항목을 행 순서에 맞게 끼워 넣은 처음 목록. */
export function initialDrafts(
  cells: ScheduleCell[],
  state: CellEditorState,
): EntryDraft[] {
  const { cell, position } = state;
  const drafts = draftsFromCells(cells, position.workDate, position.columnId);
  if (cell !== null) return drafts;
  const blank: EntryDraft = {
    key: CLICKED_NEW_KEY,
    id: null,
    rowNo: position.rowNo,
    mainText: "",
    subText: "",
    textColor: null,
    companionTarget: false,
  };
  const index = drafts.findIndex((draft) => (draft.rowNo ?? 0) > position.rowNo);
  return index === -1
    ? [...drafts, blank]
    : [...drafts.slice(0, index), blank, ...drafts.slice(index)];
}

export function initialCompanions(
  cells: ScheduleCell[],
  position: CellPosition,
): CompanionFields {
  const found = findCompanions(cells, position.workDate, position.columnId);
  const fieldOf = (kind: CompanionKind) => {
    const existing = found[kind];
    return {
      enabled: existing !== null,
      names: existing ? (parseCompanionText(existing.subText)?.names ?? "") : "",
    };
  };
  return { 입회: fieldOf("입회"), 신호수: fieldOf("신호수") };
}
