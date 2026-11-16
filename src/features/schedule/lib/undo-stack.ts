import type { GroupState } from "@/features/schedule/lib/group-state";
import type { CellResult, MarkColor } from "@/features/schedule/types";

export interface MarkChange {
  workDate: string;
  columnId: string;
  color: MarkColor | null;
}

export interface UndoEntry {
  label: string;
  before: GroupState[];
  marksBefore: MarkChange[];
  after: GroupState[];
}

export interface ResultUndoEntry {
  kind: "result";
  label: string;
  cellId: string;
  before: CellResult | null;
  after: CellResult | null;
}

export type StackEntry = UndoEntry | ResultUndoEntry;

export function isResultEntry(entry: StackEntry): entry is ResultUndoEntry {
  return "kind" in entry && entry.kind === "result";
}

export interface UndoStack {
  push(e: StackEntry): void;
  pop(): StackEntry | undefined;
  clear(): void;
  readonly size: number;
}

const DEFAULT_UNDO_LIMIT = 20;

/**
 * 세션 메모리 안 되돌리기 스택을 만든다.
 * 한도를 넘기면 가장 오래된 항목을 버린다.
 */
export function createUndoStack(limit = DEFAULT_UNDO_LIMIT): UndoStack {
  const max = Math.max(1, limit);
  const items: StackEntry[] = [];

  return {
    push(entry: StackEntry) {
      items.push(entry);
      if (items.length > max) {
        items.shift();
      }
    },
    pop() {
      return items.pop();
    },
    clear() {
      items.length = 0;
    },
    get size() {
      return items.length;
    },
  };
}
