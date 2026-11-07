"use client";

import { useMemo, type DragEvent } from "react";
import { cn } from "@/lib/utils";
import { indexCells, positionKey, visibleRowCount } from "@/features/schedule/lib/cell-grid";
import { resultSummary } from "@/features/schedule/lib/cell-result";
import type { FreezeBadge } from "@/features/schedule/lib/freeze";
import { holidayName } from "@/features/schedule/lib/holidays";
import { todayIso, weekdayLabel } from "@/features/schedule/lib/week";
import {
  resultLabel,
  TEXT_COLOR_DISPLAY,
  type CellPosition,
  type ScheduleCell,
  type ScheduleColumn,
  type ScheduleDayNote,
  type ScheduleMark,
} from "@/features/schedule/types";
import { SCHEDULE_DATE_COLUMN_WIDTH_PX } from "@/features/shell/constants";
import { RESULT_DOT_CLASS } from "./schedule-result-dialog";

/** 날짜×팀 색 위에 얹는 투명도(8자리 hex의 알파 `59` ≈ 35%). 어두운 테마에서도 글자가 읽힌다. */
const MARK_ALPHA = "59";

interface ScheduleGridProps {
  weekDates: string[];
  columns: ScheduleColumn[];
  cells: ScheduleCell[];
  dayNotes: ScheduleDayNote[];
  marks: ScheduleMark[];
  /** 날짜별 작업금지(프리징) 배지 */
  freezeBadges: Map<string, FreezeBadge[]>;
  canEdit: boolean;
  onEditCell: (cell: ScheduleCell | null, position: CellPosition) => void;
  /** `single`이면 Shift를 누른 채 놓은 것이라 끈 칸 하나만 옮긴다(아니면 같은 날짜·팀의 묶음 전체) */
  onDropCell: (dragged: ScheduleCell, target: CellPosition, options: { single: boolean }) => void;
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
  freezeBadges,
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
  const visibleColumnIds = useMemo(
    () => new Set(sortedColumns.map((column) => column.id)),
    [sortedColumns],
  );
  const visibleCells = useMemo(
    () => cells.filter((cell) => visibleColumnIds.has(cell.columnId)),
    [cells, visibleColumnIds],
  );
  const cellIndex = useMemo(() => indexCells(visibleCells), [visibleCells]);
  const cellById = useMemo(
    () => new Map(visibleCells.map((cell) => [cell.id, cell])),
    [visibleCells],
  );
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
    if (dragged) onDropCell(dragged, target, { single: event.shiftKey });
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
          const rowCount = visibleRowCount(visibleCells, workDate);
          const weekday = weekdayLabel(workDate);
          const isSaturday = weekday === "토";
          const isSunday = weekday === "일";
          const holiday = holidayName(workDate);
          // 공휴일은 일요일처럼 빨간색으로 보이고 쉬는 날 배경을 쓴다.
          const isWeekend = isSaturday || isSunday || holiday !== null;
          const badges = freezeBadges.get(workDate) ?? [];
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
                    badges.length > 0 && "bg-rose-950/40",
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
                        isSaturday && holiday === null && "text-sky-400",
                        (isSunday || holiday !== null) && "text-rose-400",
                      )}
                    >
                      {workDate.slice(5)} {weekday}
                    </span>
                    {holiday ? (
                      <span className="block truncate whitespace-nowrap text-[11px] font-semibold text-rose-400" title={holiday}>
                        {holiday}
                      </span>
                    ) : null}
                    {badges.map((badge) => (
                      <span
                        key={badge.id}
                        className="block truncate whitespace-nowrap text-[11px] font-semibold text-rose-300"
                        title={badge.title}
                      >
                        {"⛔ "}
                        {badge.reason} {badge.time}
                      </span>
                    ))}
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
                    title={
                      cell
                        ? `${cell.mainText}${cell.subText ? ` · ${cell.subText}` : ""}${
                            cell.result ? ` — ${resultSummary(cell.result)}` : ""
                          }`
                        : undefined
                    }
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
                    {cell?.result ? (
                      <span
                        className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle", RESULT_DOT_CLASS[cell.result.status])}
                        aria-label={resultLabel(cell.result.status)}
                      />
                    ) : null}
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
