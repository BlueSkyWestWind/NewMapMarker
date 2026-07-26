"use client";

import {
  VERDICT_ICON,
  type HazardKind,
  type HazardSummary,
} from "@/features/worksite-weather/types/weather";

interface HazardSummaryListProps {
  summary: HazardSummary;
}

const HAZARD_META: Array<{ kind: HazardKind; label: string; unit: string }> = [
  { kind: "heat", label: "폭염", unit: "℃" },
  { kind: "wind", label: "강풍", unit: "m/s" },
  { kind: "rain", label: "강수", unit: "" },
  { kind: "cold", label: "한파", unit: "℃" },
];

export function HazardSummaryList({ summary }: HazardSummaryListProps) {
  return (
    <ul className="space-y-1.5">
      {HAZARD_META.map(({ kind, label, unit }) => {
        const entry = summary[kind];
        const icon = entry.level === "none" ? "⚪" : VERDICT_ICON[entry.level];
        const peak =
          entry.peak === null
            ? ""
            : `${kind === "rain" && entry.peak <= 100 && !unit ? "최대 " : "최고 "}${entry.peak}${unit}` +
              (entry.peakTime ? ` (${entry.peakTime})` : "");

        return (
          <li key={kind} className="rounded-md bg-slate-900/60 px-2 py-1.5">
            <div className="flex items-baseline gap-1.5 text-[11px]">
              <span>{icon}</span>
              <span className="font-semibold text-slate-200">{label}</span>
              <span className="tabular-nums text-slate-400">{peak}</span>
            </div>
            <p className="mt-0.5 pl-5 text-[10px] leading-relaxed text-slate-400">
              {entry.note}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
