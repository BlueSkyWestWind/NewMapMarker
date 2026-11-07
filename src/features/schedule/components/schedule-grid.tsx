"use client";

import { useMemo, type DragEvent } from "react";
import { cn } from "@/lib/utils";
import { indexCells, positionKey, visibleRowCount } from "@/features/schedule/lib/cell-grid";
import { todayIso, weekdayLabel } from "@/features/schedule/lib/week";
import {
  TEXT_COLOR_DISPLAY,
  type CellPosition,
  type ScheduleCell,
  type ScheduleColumn,
  type ScheduleDayNote,
  type ScheduleMark,
} from "@/features/schedule/types";
import { SCHEDULE_DATE_COLUMN_WIDTH_PX } from "@/features/shell/constants";

/** 날짜×팀 색 위에 얹는 투명도(8자리 hex의 알파 `59` ≈ 35%). 어두운 테마에서도 글자가 읽힌다. */
const MARK_ALPHA = "59";

interface ScheduleGridProps {
  weekDates: string[];
  columns: ScheduleColumn[];
  cells: ScheduleCell[];
  dayNotes: ScheduleDayNote[];
  marks: ScheduleMark[];
  canEdit: boolean;
  onEditCell: (cell: ScheduleCell | null, position: CellPosition) => void;
  onDropCell: (dragged: ScheduleCell, target: CellPosition) => void;
  onEditColumn: (column: ScheduleColumn) => void;
  onEditDay: (workDate: string) => void;
}

/**
 * 주간 일정표. 날짜는 세로 블록, 팀은 가로 열이다(엑셀 `일정표_New`와 같은 눈높이).
 * 표 셀은 줄바꿈 없이 말줄임으로 보이고(전체 글은 툴팁), 가로 스크롤은 쓰지 않는다.
 */
export function ScheduleGrid({
  weekDates,
  columns,
  cells,
  dayNotes,
  marks,
  canEdit,
  onEditCell,
  onDropCell,
  onEditColumn,
  onEditDay,
}: ScheduleGridProps) {
  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => a.sortOrder - b.sortOrder),
    [columns],
  );
  const cellIndex = useMemo(() => indexCells(cells), [cells]);
  const cellById = useMemo(() => new Map(cells.map((cell) => [cell.id, cell])), [cells]);
  const noteByDate = useMemo(
    () => new Map(dayNotes.map((entry) => [entry.workDate, entry.note])),
    [dayNotes],
  );
  const markByKey = useMemo(
    () => new Map(marks.map((mark) => [`${mark.workDate}|${mark.columnId}`, mark.color])),
    [marks],
  );
  const today = todayIso();

  const handleDrop = (event: DragEvent<HTMLTableCellElement>, target: CellPosition) => {
    if (!canEdit) return;
    event.preventDefault();
    const dragged = cellById.get(event.dataTransfer.getData("text/plain"));
    if (dragged) onDropCell(dragged, target);
  };

  return (
    <table className="w-full table-fixed border-collapse text-xs text-slate-100">
      <colgroup>
        <col style={{ width: SCHEDULE_DATE_COLUMN_WIDTH_PX }} />
        {sortedColumns.map((column) => (
          <col key={column.id} />
        ))}
      </colgroup>
      <thead className="sticky top-0 z-10 bg-slate-900">
        <tr>
          <th className="border border-slate-700 px-1 py-1 text-center font-semibold">날짜</th>
          {sortedColumns.map((column) => (
            <th key={column.id} className="border border-slate-700 p-0 text-center font-semibold">
              {canEdit ? (
                <button
                  type="button"
                  title="팀 이름·팀장 수정"
                  className="block w-full px-1 py-1 hover:bg-slate-800"
                  onClick={() => onEditColumn(column)}
                >
                  <span className="block truncate whitespace-nowrap">{column.teamLabel}</span>
                  <span className="block h-4 truncate whitespace-nowrap text-[11px] font-normal text-slate-400">
                    {column.leaderLabel}
                  </span>
                </button>
              ) : (
                <div className="px-1 py-1">
                  <span className="block truncate whitespace-nowrap">{column.teamLabel}</span>
                  <span className="block h-4 truncate whitespace-nowrap text-[11px] font-normal text-slate-400">
                    {column.leaderLabel}
                  </span>
                </div>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weekDates.flatMap((workDate) => {
          const rowCount = visibleRowCount(cells, workDate);
          const weekday = weekdayLabel(workDate);
          const isSaturday = weekday === "토";
          const isSunday = weekday === "일";
          const isWeekend = isSaturday || isSunday;
          const note = noteByDate.get(workDate) ?? "";
          const isToday = workDate === today;
          const isLastDay = workDate === weekDates[weekDates.length - 1];
          return Array.from({ length: rowCount }, (_, rowNo) => (
            <tr key={`${workDate}-${rowNo}`}>
              {rowNo === 0 ? (
                <td
                  rowSpan={rowCount}
                  className={cn(
                    "border border-slate-700 bg-slate-900/70 p-0 align-top",
                    isToday && "border-2 border-indigo-500",
                  )}
                >
                  <button
                    type="button"
                    disabled={!canEdit}
                    title={canEdit ? "날짜 메모 수정" : undefined}
                    className="block w-full px-1.5 py-1 text-left enabled:hover:bg-slate-800 disabled:cursor-default"
                    onClick={() => onEditDay(workDate)}
                  >
                    <span
                      className={cn(
                        "block whitespace-nowrap font-semibold",
                        isSaturday && "text-sky-400",
                        isSunday && "text-rose-400",
                      )}
                    >
                      {workDate.slice(5)} {weekday}
                    </span>
                    <span className="block truncate whitespace-nowrap text-[11px] text-slate-400" title={note}>
                      {note || " "}
                    </span>
                  </button>
                </td>
              ) : null}
              {sortedColumns.map((column) => {
                const position: CellPosition = { workDate, columnId: column.id, rowNo };
                const cell = cellIndex.get(positionKey(position));
                const markColor = markByKey.get(`${workDate}|${column.id}`);
                const interactive = canEdit || cell !== undefined;
                const isLastColumn = column.id === sortedColumns[sortedColumns.length - 1]?.id;
                return (
                  <td
                    key={column.id}
                    tabIndex={interactive ? 0 : undefined}
                    draggable={canEdit && cell !== undefined}
                    title={cell ? `${cell.mainText}${cell.subText ? ` · ${cell.subText}` : ""}` : undefined}
                    style={markColor ? { backgroundColor: `#${markColor}${MARK_ALPHA}` } : undefined}
                    className={cn(
                      // 세로선만 두고, 가로선은 날짜 블록의 첫 행 위(날짜 사이 구분)에만 둔다.
                      "h-7 overflow-hidden text-ellipsis whitespace-nowrap border-x border-slate-800 px-1.5",
                      rowNo === 0 && "border-t border-t-slate-700",
                      isLastDay && rowNo === rowCount - 1 && "border-b border-b-slate-700",
                      isToday && rowNo === 0 && "border-t-2 border-t-indigo-500",
                      isToday && rowNo === rowCount - 1 && "border-b-2 border-b-indigo-500",
                      isToday && isLastColumn && "border-r-2 border-r-indigo-500",
                      !markColor && isToday && "bg-indigo-500/10",
                      !markColor && !isToday && isWeekend && "bg-slate-900/40",
                      interactive && "cursor-pointer hover:bg-slate-800/70",
                      canEdit && cell !== undefined && "cursor-grab",
                    )}
                    onClick={() => (interactive ? onEditCell(cell ?? null, position) : undefined)}
                    onKeyDown={(event) => {
                      if (interactive && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        onEditCell(cell ?? null, position);
                      }
                    }}
                    onDragStart={(event) => {
                      if (!cell) return;
                      event.dataTransfer.setData("text/plain", cell.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(event) => {
                      if (canEdit) event.preventDefault();
                    }}
                    onDrop={(event) => handleDrop(event, position)}
                  >
                    {cell ? (
                      <span
                        style={cell.textColor ? { color: TEXT_COLOR_DISPLAY[cell.textColor] } : undefined}
                      >
                        {cell.mainText}
                        {cell.subText ? (
                          <span className="opacity-70">{` · ${cell.subText}`}</span>
                        ) : null}
                      </span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ));
        })}
      </tbody>
    </table>
  );
}
