"use client";

import { RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  VERDICT_ICON,
  VERDICT_LABEL,
  VERDICT_TONE,
} from "@/features/worksite-weather/types/weather";
import type { BoardRow } from "@/features/dashboard/hooks/use-worksite-board";
import type { HazardSummary } from "@/features/worksite-weather/types/weather";

interface WorksiteRowProps {
  row: BoardRow;
  isSelected: boolean;
  onSelect: () => void;
  onRetry: () => void;
  onRemove: () => void;
}

/** 위험요약에서 실제로 해당되는 것만 한 줄로 추린다. 전부 나열하면 행이 길어진다. */
function hazardHeadline(summary: HazardSummary): string {
  return Object.values(summary)
    .filter((entry) => entry.level !== "none" && entry.level !== "safe")
    .map((entry) => entry.note)
    .slice(0, 2)
    .join(" · ");
}

export function WorksiteRow({
  row,
  isSelected,
  onSelect,
  onRetry,
  onRemove,
}: WorksiteRowProps) {
  const { site, status, data, error } = row;

  return (
    <li
      className={cn(
        "rounded-md border px-2 py-1.5 transition-colors",
        isSelected
          ? "border-sky-500/50 bg-sky-950/60"
          : "border-slate-800 bg-slate-900/60 hover:border-slate-700",
      )}
    >
      <div className="flex items-start gap-1">
        {/* 행 전체가 누를 수 있어야 한다 — 현장 태블릿·장갑 기준 */}
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <div className="flex items-center gap-1.5">
            <span aria-hidden>
              {status === "ok" && data ? VERDICT_ICON[data.overall] : "⏳"}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-100">
              {site.name}
            </span>
            {status === "ok" && data ? (
              <span
                className={cn(
                  "shrink-0 rounded border px-1 text-[10px] leading-4",
                  VERDICT_TONE[data.overall],
                )}
              >
                {VERDICT_LABEL[data.overall]}
              </span>
            ) : null}
          </div>

          <p className="mt-0.5 truncate text-[11px] text-slate-400" title={site.address}>
            {site.address || "주소 없음"}
            {site.workType === "elevated" ? " · 옥상·철탑" : ""}
          </p>

          {status === "loading" ? (
            <p className="mt-0.5 text-[11px] text-slate-500">조회 중...</p>
          ) : null}

          {status === "ok" && data ? (
            <>
              {hazardHeadline(data.hazardSummary) ? (
                <p className="mt-0.5 truncate text-[11px] text-slate-300">
                  {hazardHeadline(data.hazardSummary)}
                </p>
              ) : null}
              <p className="mt-0.5 truncate text-[11px] text-emerald-300">
                {data.recommendedWindows.length > 0
                  ? `권장 ${data.recommendedWindows
                      .map((w) => `${w.from}~${w.to}`)
                      .join(", ")}`
                  : "권장 시간대 없음"}
              </p>
            </>
          ) : null}

          {status === "error" ? (
            <p className="mt-0.5 truncate text-[11px] text-amber-400" title={error}>
              ⚠️ 조회 실패
            </p>
          ) : null}
        </button>

        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={onRemove}
            title="작업 국소에서 빼기"
            className="rounded p-0.5 text-slate-500 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {status === "error" ? (
            <button
              type="button"
              onClick={onRetry}
              title="다시 시도"
              className="rounded p-0.5 text-amber-400 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
