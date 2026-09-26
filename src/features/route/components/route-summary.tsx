"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatDistance, formatDuration, formatToll } from "@/features/route/lib/format-route";
import { useRouteStore } from "@/features/route/store/use-route-store";
import type { NormalizedRouteResult } from "@/features/route/types/route";

const LEG_LABEL = { outbound: "출발", return: "복귀" } as const;

export function RouteSummary({ result }: { result: NormalizedRouteResult }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const legPointNames = useRouteStore((state) => state.legPointNames);

  return (
    <div className="space-y-1.5 rounded-lg border border-emerald-600/40 bg-emerald-950/20 p-2.5">
      <p className="text-center text-sm font-bold text-emerald-200">
        총 {formatDistance(result.totalDistance)} · {formatDuration(result.totalDuration)} ·{" "}
        {formatToll(result.totalToll)}
      </p>

      <button
        type="button"
        className="flex w-full items-center justify-center gap-1 text-[11px] text-emerald-300"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        구간별 보기
        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {isExpanded ? (
        <div className="space-y-2 border-t border-emerald-800/40 pt-2">
          {result.legs.map((leg) => {
            // 카카오 sections[i]는 요청 시 넘긴 지점 순서의 i→i+1 구간과 1:1 대응한다.
            const pointNames = legPointNames?.[leg.type];

            return (
              <div key={leg.type} className="space-y-1">
                <p className="text-[10px] font-semibold text-emerald-300">
                  {LEG_LABEL[leg.type]} 구간 · {formatDistance(leg.distance)} · {formatDuration(leg.duration)} ·{" "}
                  {formatToll(leg.toll)}
                </p>
                <ul className="space-y-0.5 pl-2">
                  {leg.sections.map((section, index) => {
                    const from = pointNames?.[index];
                    const to = pointNames?.[index + 1];
                    const label = from && to ? `${from} → ${to}` : `${index + 1}구간`;
                    return (
                      <li
                        key={index}
                        className="truncate text-[10px] text-slate-400"
                        title={label}
                      >
                        {label} · {formatDistance(section.distance)} · {formatDuration(section.duration)}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
