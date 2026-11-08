"use client";

import { cn } from "@/lib/utils";
import { useShellStore } from "@/features/shell/store/use-shell-store";

const SECTIONS = [
  { key: "facility", label: "시설일정" },
  { key: "daily", label: "일일일정" },
] as const;

/**
 * 일정관리 화면 머리글의 시설일정 | 일일일정 전환.
 * 사이드바를 접어 둔 채(레일)로도 하위 화면을 오갈 수 있게 제목 자리에 둔다.
 */
export function ScheduleSectionSwitch({ section }: { section: "facility" | "daily" }) {
  const setScheduleSegment = useShellStore((state) => state.setScheduleSegment);
  return (
    <div className="flex shrink-0 gap-1" role="group" aria-label="일정 화면">
      {SECTIONS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          aria-pressed={section === key}
          onClick={() => setScheduleSegment(key)}
          className={cn(
            "h-8 whitespace-nowrap rounded-md px-2.5 text-base font-semibold transition-colors",
            section === key ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-200",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
