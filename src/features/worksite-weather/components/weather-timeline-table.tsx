"use client";

import { cn } from "@/lib/utils";
import {
  SLOT_SOURCE_LABEL,
  VERDICT_ICON,
  VERDICT_LABEL,
  type WeatherSlot,
} from "@/features/worksite-weather/types/weather";

interface WeatherTimelineTableProps {
  slots: WeatherSlot[];
}

const HEAD = ["시각", "기온/체감", "습도", "바람", "강수", "판정"];

function formatWind(slot: WeatherSlot): string {
  if (slot.windSpeed === null) return "-";
  return `${slot.windDir} ${slot.windSpeed}`;
}

function formatRain(slot: WeatherSlot): string {
  const pop = slot.pop === null ? "-" : `${slot.pop}%`;
  return slot.pcp > 0 ? `${pop} ${slot.pcpLabel}` : pop;
}

function formatTemp(slot: WeatherSlot): string {
  if (slot.temp === null) return "-";
  return slot.apparent === null ? `${slot.temp}` : `${slot.temp} / ${slot.apparent}`;
}

/**
 * 데스크톱 타임라인 표.
 * 프로젝트 UI 규칙에 따라 전 셀 nowrap이며 가로 스크롤을 만들지 않는다.
 * 바람은 방위+수치를, 강수는 확률+강수량을 한 셀에 합쳐 6열로 맞췄다.
 */
export function WeatherTimelineTable({ slots }: WeatherTimelineTableProps) {
  return (
    <table className="w-full table-fixed border-collapse text-[11px]">
      <colgroup>
        <col className="w-[9%]" />
        <col className="w-[27%]" />
        <col className="w-[11%]" />
        <col className="w-[19%]" />
        <col className="w-[24%]" />
        <col className="w-[10%]" />
      </colgroup>
      <thead>
        <tr className="border-b border-slate-700 text-slate-400">
          <th className="whitespace-nowrap px-0.5 py-1.5 text-center font-medium">시각</th>
          <th className="whitespace-nowrap px-0.5 py-1.5 text-center font-medium">기온/체감</th>
          <th className="whitespace-nowrap px-0.5 py-1.5 text-center font-medium">습도</th>
          <th className="whitespace-nowrap px-0.5 py-1.5 text-center font-medium">바람</th>
          <th className="whitespace-nowrap px-0.5 py-1.5 text-center font-medium">강수</th>
          <th className="whitespace-nowrap px-0.5 py-1.5 text-center font-medium">판정</th>
        </tr>
      </thead>
      <tbody>
        {slots.map((slot) => {
          const isPast = slot.source === "past";
          return (
            <tr
              key={slot.time}
              className={cn(
                "border-b border-slate-800/60",
                isPast && "text-slate-600",
                !isPast && "text-slate-200",
              )}
              title={slot.reasons.length > 0 ? slot.reasons.join(" · ") : undefined}
            >
              <td className="whitespace-nowrap px-0.5 py-1 tabular-nums text-center">
                {slot.time.slice(0, 2)}시
              </td>
              <td className="whitespace-nowrap px-0.5 py-1 tabular-nums text-center font-medium">
                {formatTemp(slot)}
              </td>
              <td className="whitespace-nowrap px-0.5 py-1 tabular-nums text-center font-medium text-slate-300">
                {slot.humidity === null ? "-" : `${slot.humidity}%`}
              </td>
              <td className="whitespace-nowrap px-0.5 py-1 tabular-nums text-center">
                {formatWind(slot)}
              </td>
              <td className="whitespace-nowrap px-0.5 py-1 tabular-nums text-center">
                {formatRain(slot)}
              </td>
              <td
                className="whitespace-nowrap px-0.5 py-1 text-center"
                title={`${VERDICT_LABEL[slot.verdict]} · ${SLOT_SOURCE_LABEL[slot.source]}`}
              >
                {VERDICT_ICON[slot.verdict]}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
