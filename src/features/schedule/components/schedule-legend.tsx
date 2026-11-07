"use client";

import {
  MARK_COLORS,
  markLabel,
  TEXT_COLOR_DISPLAY,
  textColorLabel,
} from "@/features/schedule/types";

/** 범례에 이름이 있는 칸 색만(이름 없는 `빨강 칸`·`회색 칸`은 보이지 않는다). */
const NAMED_MARKS = MARK_COLORS.filter((color) => !markLabel(color).endsWith("칸"));

/** 일정표 위의 범례: 칸 색(중장비·승주·K대응)과 글자색(축전지수거). */
export function ScheduleLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-300" aria-label="범례">
      {NAMED_MARKS.map((color) => (
        <li key={color} className="flex items-center gap-1.5 whitespace-nowrap">
          <span
            className="inline-block h-3 w-5 rounded-sm border border-slate-600"
            style={{ backgroundColor: `#${color}` }}
            aria-hidden
          />
          {markLabel(color)}
        </li>
      ))}
      <li className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="font-bold" style={{ color: TEXT_COLOR_DISPLAY["0070C0"] }} aria-hidden>
          가
        </span>
        {textColorLabel("0070C0")}
      </li>
    </ul>
  );
}
