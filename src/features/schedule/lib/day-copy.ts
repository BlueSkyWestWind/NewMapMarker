import { DAY_COLUMNS } from "@/features/schedule/lib/day-columns";
import type { DayValues } from "@/features/schedule/lib/day-types";

/** 탭·줄바꿈은 표 구분과 겹치므로 공백 하나로 바꾼다. 쉼표는 구분자가 아니라 그대로 둔다. */
function cleanCell(value: string): string {
  return value.replace(/[\t\r\n]/g, " ");
}

/** 표를 붙여 넣을 수 있는 글로 만든다. 제목 줄 없이 열은 탭, 행은 LF로 잇는다. */
export function buildCopyText(rows: readonly DayValues[]): string {
  return rows.map((row) => DAY_COLUMNS.map((column) => cleanCell(row[column.key])).join("\t")).join("\n");
}
