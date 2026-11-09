"use client";

import type { DragEvent } from "react";
import { cn } from "@/lib/utils";
import {
  monthEntryText,
  type MonthDay,
  type MonthModel,
} from "@/features/schedule/lib/month-layout";
import type { FreezeBadge } from "@/features/schedule/lib/freeze";
import { groupMonthTeams } from "@/features/schedule/lib/month-groups";
import { holidayName } from "@/features/schedule/lib/holidays";
import { todayIso } from "@/features/schedule/lib/week";
import { TEXT_COLOR_DISPLAY } from "@/features/schedule/types";

const WEEKDAY_HEADERS = ["월", "화", "수", "목", "금", "토", "일"] as const;
/** 열 폭 비중: 평일은 1.6, 작업이 없는 토·일은 1.0(좁게), 작업이 있는 토·일은 평일과 같은 1.6 */
const WEEKDAY_WEIGHT = 1.6;
const EMPTY_WEEKEND_WEIGHT = 1.0;

/** 요일별 열 폭(%). 보이는 달에 작업이 하나라도 있는 토·일 열은 평일만큼 넓히고, 없으면 좁힌다. */
function columnWidths(model: MonthModel): string[] {
  const hasWork = [5, 6].map((columnIndex) =>
    model.weeks.some((week) => (week[columnIndex]?.teams.length ?? 0) > 0),
  );
  const weights = WEEKDAY_HEADERS.map((_, index) =>
    index < 5 || hasWork[index - 5] ? WEEKDAY_WEIGHT : EMPTY_WEEKEND_WEIGHT,
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => `${(weight / total) * 100}%`);
}

/** 팀 이름을 끌 때 실어 보내는 표시. 있으면 묶음 전체, 없으면 국소 하나를 옮긴다. */
const GROUP_DRAG_TYPE = "application/x-schedule-group";
/** 합쳐진 팀 묶음을 끌 때 실어 보내는, 묶음에 든 팀들의 첫 칸 id 목록(JSON). 팀마다 자기 팀 그대로 날짜만 옮긴다. */
const GROUP_IDS_DRAG_TYPE = "application/x-schedule-group-ids";

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
 * 월 달력(월~일 7열). 팀 이름은 왼쪽에 두고 그날의 국소를 오른쪽에 한 줄씩 세로로 나열한다.
 * 그날 목록이 완전히 같은 팀은 한 묶음으로 합쳐 팀들을 왼쪽에 쌓고 목록은 한 번만 보여 준다.
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
  const widths = columnWidths(model);

  const handleDrop = (event: DragEvent<HTMLElement>, workDate: string, columnId: string | null) => {
    if (!canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    const cellId = event.dataTransfer.getData("text/plain");
    if (!cellId) return;
    // 합쳐진 묶음: 어느 팀 블록 위에 놓아도 팀마다 자기 팀 그대로 그 날짜로 옮긴다.
    const idsRaw = event.dataTransfer.getData(GROUP_IDS_DRAG_TYPE);
    if (idsRaw) {
      try {
        const ids: unknown = JSON.parse(idsRaw);
        if (Array.isArray(ids)) {
          for (const id of ids) if (typeof id === "string") onDropCell(id, workDate, null, true);
          return;
        }
      } catch {
        // 깨진 값이면 첫 칸 하나로 처리한다.
      }
    }
    onDropCell(cellId, workDate, columnId, event.dataTransfer.getData(GROUP_DRAG_TYPE) === "1");
  };

  const startDrag = (event: DragEvent<HTMLElement>, cellId: string, group: boolean, groupCellIds?: string[]) => {
    event.dataTransfer.setData("text/plain", cellId);
    if (group) event.dataTransfer.setData(GROUP_DRAG_TYPE, "1");
    if (groupCellIds && groupCellIds.length > 1) {
      event.dataTransfer.setData(GROUP_IDS_DRAG_TYPE, JSON.stringify(groupCellIds));
    }
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <table className="w-full table-fixed border-collapse text-xs text-slate-100">
      {/* 토·일은 작업이 없으면 좁게(작업이 드물어서), 있으면 평일과 같은 폭으로 쓴다. */}
      <colgroup>
        {WEEKDAY_HEADERS.map((label, i) => (
          <col key={label} style={{ width: widths[i] }} />
        ))}
      </colgroup>
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
                  {groupMonthTeams(day.teams).map((group, groupIndex) => {
                    const first = group.teams[0];
                    const label = group.teams.map((team) => team.label).join(", ");
                    return (
                      <span
                        key={first.columnId}
                        // 팀(묶음) 사이는 간격을 넓혀 구분한다(선은 긋지 않는다).
                        className={cn(
                          "flex items-start gap-1 text-[11px]",
                          groupIndex === 0 ? "mt-0.5" : "mt-2.5",
                        )}
                        onDragOver={(event) => {
                          if (canEdit) event.preventDefault();
                        }}
                        onDrop={(event) => handleDrop(event, day.workDate, first.columnId)}
                      >
                        {/* 같은 목록을 하는 팀은 왼쪽에 세로로 쌓고, 목록은 오른쪽에 한 번만 보여 준다. */}
                        <span
                          className={cn(
                            "flex shrink-0 flex-col whitespace-nowrap font-semibold",
                            canEdit && "cursor-grab",
                          )}
                          draggable={canEdit}
                          title={
                            canEdit
                              ? `${label} 묶음 전체를 끌어 옮기기${group.teams.length > 1 ? " (팀마다 자기 팀 그대로 날짜만 바뀝니다)" : ""}`
                              : undefined
                          }
                          onDragStart={(event) =>
                            startDrag(
                              event,
                              first.entries[0].id,
                              true,
                              group.teams.map((team) => team.entries[0].id),
                            )
                          }
                        >
                          {group.teams.map((team) => (
                            <span key={team.columnId} className="flex items-center gap-0.5">
                              <span
                                style={team.markColor ? { color: `#${team.markColor}` } : undefined}
                                aria-hidden
                              >
                                ■
                              </span>
                              {team.label}
                            </span>
                          ))}
                        </span>
                        <span className="min-w-0 flex-1">
                          {group.entries.map((entry) => (
                            <span
                              key={entry.id}
                              className={cn("block truncate whitespace-nowrap", canEdit && "cursor-grab")}
                              draggable={canEdit}
                              title={
                                canEdit
                                  ? `${monthEntryText(entry)} (끌어서 이 국소만 옮기기${group.teams.length > 1 ? " — 첫 팀의 칸만 옮겨집니다" : ""})`
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
                    );
                  })}
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
