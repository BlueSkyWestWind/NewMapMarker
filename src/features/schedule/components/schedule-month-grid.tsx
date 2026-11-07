"use client";

import { cn } from "@/lib/utils";
import {
  MONTH_VISIBLE_LINES,
  monthEntryText,
  monthTeamLineText,
  type MonthDay,
  type MonthModel,
} from "@/features/schedule/lib/month-layout";
import { todayIso } from "@/features/schedule/lib/week";
import { TEXT_COLOR_DISPLAY } from "@/features/schedule/types";

const WEEKDAY_HEADERS = ["월", "화", "수", "목", "금", "토", "일"] as const;

function dayLabel(day: MonthDay): string {
  const [, month, date] = day.workDate.split("-").map(Number);
  return day.inMonth ? String(date) : `${month}/${date}`;
}

interface ScheduleMonthGridProps {
  model: MonthModel;
  /** 날짜를 누르면 그 주의 주간 보기로 간다(편집은 주간에서 한다). */
  onPickDay: (workDate: string) => void;
}

/** 월 달력(월~일 7열). 조회 전용이고, 팀마다 한 줄로 그날의 일정을 요약한다. */
export function ScheduleMonthGrid({ model, onPickDay }: ScheduleMonthGridProps) {
  const today = todayIso();
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
            {week.map((day) => {
              const hidden = day.teams.length - MONTH_VISIBLE_LINES;
              return (
                <td
                  key={day.workDate}
                  className={cn(
                    "h-32 border border-slate-800 p-0 align-top",
                    !day.inMonth && "bg-slate-900/60 text-slate-500",
                    day.workDate === today && "outline outline-2 -outline-offset-2 outline-indigo-500",
                  )}
                >
                  <button
                    type="button"
                    className="block h-full w-full px-1.5 py-1 text-left hover:bg-slate-800/60"
                    title="이 날짜의 주간 보기로 이동"
                    onClick={() => onPickDay(day.workDate)}
                  >
                    <span className="flex items-baseline gap-1.5">
                      <span className="font-semibold">{dayLabel(day)}</span>
                      {day.note ? (
                        <span className="truncate whitespace-nowrap text-[11px] text-slate-400">
                          {day.note}
                        </span>
                      ) : null}
                    </span>
                    {day.teams.slice(0, MONTH_VISIBLE_LINES).map((team) => (
                      <span
                        key={team.columnId}
                        className="mt-0.5 flex items-center gap-1 overflow-hidden whitespace-nowrap text-[11px]"
                        title={monthTeamLineText(team)}
                      >
                        <span
                          className="shrink-0"
                          style={team.markColor ? { color: `#${team.markColor}` } : undefined}
                          aria-hidden
                        >
                          ■
                        </span>
                        <span className="min-w-0 truncate">
                          {team.label} ·{" "}
                          {team.entries.map((entry, i) => (
                            <span
                              key={i}
                              style={entry.textColor ? { color: TEXT_COLOR_DISPLAY[entry.textColor] } : undefined}
                            >
                              {monthEntryText(entry)}
                              {i < team.entries.length - 1 ? ", " : ""}
                            </span>
                          ))}
                        </span>
                      </span>
                    ))}
                    {hidden > 0 ? (
                      <span className="mt-0.5 block text-[11px] text-slate-400">외 {hidden}팀</span>
                    ) : null}
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
