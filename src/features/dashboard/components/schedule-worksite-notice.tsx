"use client";

import { CalendarDays } from "lucide-react";
import type { ScheduleWorksiteSummary } from "@/features/dashboard/hooks/use-schedule-worksites";

interface ScheduleWorksiteNoticeProps {
  summary: ScheduleWorksiteSummary | null;
}

/** 오늘 시설일정 국소가 작업 국소에 담긴 결과 안내. 오늘 일정에 국소가 없으면 아무것도 보이지 않는다. */
export function ScheduleWorksiteNotice({ summary }: ScheduleWorksiteNoticeProps) {
  if (!summary || summary.total === 0) return null;
  return (
    <p className="rounded-md border border-indigo-500/30 bg-indigo-950/30 px-2.5 py-1.5 text-[11px] leading-snug text-indigo-100">
      <CalendarDays aria-hidden className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
      {summary.matched === 0
        ? `오늘 시설일정에 국소 ${summary.total}개가 있지만 등록된 장비 국소와 이름이 같은 것이 없어 작업 국소에 담지 못했습니다.`
        : `오늘 시설일정 국소 ${summary.total}개 중 ${summary.matched}개가 등록된 장비 국소와 일치해 작업 국소에 담깁니다.${
            summary.unmatched > 0 ? ` (${summary.unmatched}개는 이름이 달라 제외)` : ""
          }`}
    </p>
  );
}
