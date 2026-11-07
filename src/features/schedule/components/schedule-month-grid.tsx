"use client";

import type { DragEvent } from "react";
import { cn } from "@/lib/utils";
import {
  monthEntryText,
  type MonthDay,
  type MonthModel,
} from "@/features/schedule/lib/month-layout";
import type { FreezeBadge } from "@/features/schedule/lib/freeze";
import { holidayName } from "@/features/schedule/lib/holidays";
import { todayIso } from "@/features/schedule/lib/week";
import { TEXT_COLOR_DISPLAY } from "@/features/schedule/types";

const WEEKDAY_HEADERS = ["월", "화", "수", "목", "금", "토", "일"] as const;

/** 팀 이름을 끌 때 실어 보내는 표시. 있으면 묶음 전체, 없으면 국소 하나를 옮긴다. */
const GROUP_DRAG_TYPE = "application/x-schedule-group";

function dayLabel(day: MonthDay): string {
  const [, month, date] = day.workDate.split("-").map(Number);
  return day.inMonth ? String(date) : `${month}/${date}`;
}

interface ScheduleMonthGridProps {
  model: MonthModel;
  /** 날짜별 작업금지(프리징) 배지 */
  freezeBadges: Map<string, FreezeBadge[]>;
  /** 관리자만 끌어서 옮길 수 있다. */
  canEdit: boolean;
  /** 날짜를 누르면 그 주의 주간 보기로 간다(칸 편집은 주간에서 한다). */
  onPickDay: (workDate: string) => void;
  /**
   * 끌어 놓은 곳. `columnId`는 다른 팀 블록 위에 놓았을 때 그 팀, 날짜 칸에 놓았으면 null(끈 칸의 팀 그대로).
   * `group`이면 끈 칸이 속한 날짜·팀의 묶음 전체를 옮긴다.
   */
  onDropCell: (cellId: string, workDate: string, columnId: string | null, group: boolean) => void;
}

/**
 * 월 달력(월~일 7열). 팀 이름은 왼쪽에 한 번만 두고 그날의 국소를 오른쪽에 한 줄씩 세로로 나열한다.
 * 관리자는 팀 이름(묶음 전체)이나 국소 한 줄(하나)을 끌어 다른 날짜로 옮길 수 있다(다른 팀 블록 위에 놓으면 그 팀으로).
 */
export function ScheduleMonthGrid({
  model,
  freezeBadges,
  canEdit,
  onPickDay,
  onDropCell,
}: ScheduleMonthGridProps) {
  const today = todayIso();

  const handleDrop = (event: DragEvent<HTMLElement>, workDate: string, columnId: string | null) => {
    if (!canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    const cellId = event.dataTransfer.getData("text/plain");
    if (!cellId) return;
    onDropCell(cellId, workDate, columnId, event.dataTransfer.getData(GROUP_DRAG_TYPE) === "1");
  };

  const startDrag = (event: DragEvent<HTMLElement>, cellId: string, group: boolean) => {
    event.dataTransfer.setData("text/plain", cellId);
    if (group) event.dataTransfer.setData(GROUP_DRAG_TYPE, "1");
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <table className="w-full table-fixed border-collapse text-xs text-slate-100">
      <thead className="sticky top-0 z-10 bg-slate-900">
        <tr>
          {WEEKDAY_HEADERS.map((label, i) => (
            <th
              key={label}
              className={cn(
                "border border-slate-700 py-1 text-center font-semibold",
                i === 5 && "text-sky-400",
                i === 6 && "text-rose-400",
              )}
            >
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {model.weeks.map((week) => (
          <tr key={week[0].workDate}>
            {week.map((day, columnIndex) => {
              const holiday = holidayName(day.workDate);
              // 월요일 시작이라 5번째가 토요일, 6번째가 일요일이다. 공휴일은 요일과 무관하게 빨간색이다.
              const isSaturday = columnIndex === 5;
              const isRed = columnIndex === 6 || holiday !== null;
              const badges = freezeBadges.get(day.workDate) ?? [];
              return (
              <td
                key={day.workDate}
                className={cn(
                  "h-32 border border-slate-800 p-0 align-top",
                  !day.inMonth && "bg-slate-900/60 text-slate-500",
                  badges.length > 0 && "bg-rose-950/40",
                  day.workDate === today && "outline outline-2 -outline-offset-2 outline-indigo-500",
                )}
                onDragOver={(event) => {
                  if (canEdit) event.preventDefault();
                }}
                onDrop={(event) => handleDrop(event, day.workDate, null)}
              >
                {/* 안쪽을 끌 수 있어야 해서 button이 아니라 role=button인 div다. button 안은 브라우저마다 끌기가 안 된다. */}
                <div
                  role="button"
                  tabIndex={0}
                  className="flex h-full w-full cursor-pointer flex-col items-stretch justify-start px-1.5 py-1 text-left hover:bg-slate-800/60"
                  title="이 날짜의 주간 보기로 이동"
                  onClick={() => onPickDay(day.workDate)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onPickDay(day.workDate);
                    }
                  }}
                >
                  <span className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "font-semibold",
                        isSaturday && !isRed && (day.inMonth ? "text-sky-400" : "text-sky-400/50"),
                        isRed && (day.inMonth ? "text-rose-400" : "text-rose-400/50"),
                      )}
                    >
                      {dayLabel(day)}
                    </span>
                    {holiday ? (
                      <span className="truncate whitespace-nowrap text-[11px] font-semibold text-rose-400" title={holiday}>
                        {holiday}
                      </span>
                    ) : null}
                    {day.note ? (
                      <span className="truncate whitespace-nowrap text-[11px] text-slate-400">
                        {day.note}
                      </span>
                    ) : null}
                  </span>
                  {badges.map((badge) => (
                    <span
                      key={badge.id}
                      className="mt-0.5 block truncate whitespace-nowrap text-[11px] font-semibold text-rose-300"
                      title={badge.title}
                    >
                      {"⛔ "}
                      {badge.reason} {badge.time}
                    </span>
                  ))}
                  {day.teams.map((team) => (
                    <span
                      key={team.columnId}
                      className="mt-0.5 flex items-start gap-1 text-[11px]"
                      onDragOver={(event) => {
                        if (canEdit) event.preventDefault();
                      }}
                      onDrop={(event) => handleDrop(event, day.workDate, team.columnId)}
                    >
                      <span
                        className={cn(
                          "flex shrink-0 items-center gap-0.5 whitespace-nowrap font-semibold",
                          canEdit && "cursor-grab",
                        )}
                        draggable={canEdit && team.entries.length > 0}
                        title={canEdit ? `${team.label} 묶음 전체를 끌어 옮기기` : undefined}
                        onDragStart={(event) => startDrag(event, team.entries[0].id, true)}
                      >
                        <span
                          style={team.markColor ? { color: `#${team.markColor}` } : undefined}
                          aria-hidden
                        >
                          ■
                        </span>
                        {team.label}
                      </span>
                      <span className="min-w-0 flex-1">
                        {team.entries.map((entry) => (
                          <span
                            key={entry.id}
                            className={cn("block truncate whitespace-nowrap", canEdit && "cursor-grab")}
                            draggable={canEdit}
                            title={
                              canEdit
                                ? `${monthEntryText(entry)} (끌어서 이 국소만 옮기기)`
                                : monthEntryText(entry)
                            }
                            onDragStart={(event) => startDrag(event, entry.id, false)}
                            style={entry.textColor ? { color: TEXT_COLOR_DISPLAY[entry.textColor] } : undefined}
                          >
                            {monthEntryText(entry)}
                          </span>
                        ))}
                      </span>
                    </span>
                  ))}
                </div>
              </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
