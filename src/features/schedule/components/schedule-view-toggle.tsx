"use client";

import { cn } from "@/lib/utils";

export type ScheduleViewKind = "week" | "month" | "day" | "archive";

const VIEW_OPTIONS: readonly { key: ScheduleViewKind; label: string }[] = [
  { key: "week", label: "주간" },
  { key: "month", label: "월간" },
  { key: "day", label: "일자별" },
  { key: "archive", label: "누적" },
];

interface ScheduleViewToggleProps {
  view: ScheduleViewKind;
  onChange: (view: ScheduleViewKind) => void;
}

/** 시설일정 보기 전환: 주간 | 월간 | 일자별 | 누적. */
export function ScheduleViewToggle({ view, onChange }: ScheduleViewToggleProps) {
  return (
    <div className="flex overflow-hidden rounded-md border border-slate-700" role="group" aria-label="보기">
      {VIEW_OPTIONS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          aria-pressed={view === key}
          onClick={() => onChange(key)}
          className={cn(
            "h-8 whitespace-nowrap px-3 text-xs",
            view === key ? "bg-indigo-600 text-white" : "text-slate-200 hover:bg-slate-800",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
