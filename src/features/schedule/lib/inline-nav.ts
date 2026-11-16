export type InlineMoveKey = "Tab" | "Shift+Tab" | "Enter" | "Shift+Enter";

export interface InlineTarget {
  rowKey: string;
  columnKey: string;
}

/**
 * 일일일정 표에서 Tab·Shift+Tab·Enter·Shift+Enter로 이동할 다음 인라인 칸을 계산한다.
 * 이동할 곳이 없거나 현재 칸을 찾을 수 없으면 null을 돌려준다.
 */
export function nextInlineTarget(input: {
  rowKeys: readonly string[];
  columnKeys: readonly string[];
  current: InlineTarget;
  key: InlineMoveKey;
}): InlineTarget | null {
  const { rowKeys, columnKeys, current, key } = input;
  if (rowKeys.length === 0 || columnKeys.length === 0) return null;

  const rowIdx = rowKeys.indexOf(current.rowKey);
  const colIdx = columnKeys.indexOf(current.columnKey);
  if (rowIdx === -1 || colIdx === -1) return null;

  if (key === "Tab") {
    if (colIdx + 1 < columnKeys.length) {
      return { rowKey: rowKeys[rowIdx], columnKey: columnKeys[colIdx + 1] };
    }
    if (rowIdx + 1 < rowKeys.length) {
      return { rowKey: rowKeys[rowIdx + 1], columnKey: columnKeys[0] };
    }
    return null;
  }

  if (key === "Shift+Tab") {
    if (colIdx > 0) {
      return { rowKey: rowKeys[rowIdx], columnKey: columnKeys[colIdx - 1] };
    }
    if (rowIdx > 0) {
      return { rowKey: rowKeys[rowIdx - 1], columnKey: columnKeys[columnKeys.length - 1] };
    }
    return null;
  }

  if (key === "Enter") {
    return rowIdx + 1 < rowKeys.length
      ? { rowKey: rowKeys[rowIdx + 1], columnKey: columnKeys[colIdx] }
      : null;
  }

  return rowIdx > 0
    ? { rowKey: rowKeys[rowIdx - 1], columnKey: columnKeys[colIdx] }
    : null;
}
