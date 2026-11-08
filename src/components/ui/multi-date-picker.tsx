"use client";

import { useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { buildDayGrid, parseIsoParts, stepYearMonth } from "@/lib/calendar-picker";
import { toggleDate } from "@/lib/multi-date";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export interface MultiDatePickerProps {
  /** 고른 날짜들("yyyy-mm-dd"). `lockedIso`는 넣지 않는다 */
  value: string[];
  onChange: (next: string[]) => void;
  /** 항상 포함되는 날짜(일정 수정 창의 날짜). 달력에 선택된 채로 보이고 누를 수 없다 */
  lockedIso?: string;
  /** 달력의 처음 달을 정할 날짜. 없으면 `lockedIso`, 그것도 없으면 오늘 */
  startIso?: string;
  max?: number;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** 날짜 칩에 붙일 보조 표시(요일·공휴일 등) */
  describeDate?: (iso: string) => string;
  className?: string;
  /**
   * 한 줄에 끼워 넣는 모드. 버튼만 줄에 놓이고(고른 날짜는 버튼 툴팁과 달력 위 칩으로 본다),
   * 달력은 부모 줄(`flex-wrap`이어야 한다) 아래 줄 전체 폭으로 펼쳐진다.
   */
  compact?: boolean;
}

/**
 * 여러 날짜를 고르는 달력. 날짜를 누를 때마다 선택·해제되고, 고른 날짜는 칩으로 보인다.
 * 단일 날짜 `DatePicker`와 달리 [확인] 없이 누르는 즉시 반영되며, 같은 창에서 달을 넘겨 계속 고를 수 있다.
 * 팝업이 아니라 줄 아래에 펼쳐져서 다이얼로그 안에서도 가려지거나 포커스가 꼬이지 않는다.
 */
export function MultiDatePicker({
  value,
  onChange,
  lockedIso,
  startIso,
  max = 31,
  placeholder = "날짜 선택",
  ariaLabel = "여러 날짜 선택",
  disabled,
  describeDate,
  className,
  compact = false,
}: MultiDatePickerProps) {
  const anchor = startIso ?? lockedIso ?? new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const { year, month } = parseIsoParts(anchor);
    return { year, month };
  });

  const selected = new Set(lockedIso ? [lockedIso, ...value] : value);
  const cells = buildDayGrid(view.year, view.month);
  const step = (delta: number) => setView((prev) => stepYearMonth(prev.year, prev.month, delta));
  const label = (iso: string) => `${iso.slice(5)}${describeDate ? describeDate(iso) : ""}`;

  const chips = value.map((iso) => (
    <span
      key={iso}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-slate-200"
    >
      {label(iso)}
      <button
        type="button"
        disabled={disabled}
        aria-label={`${label(iso)} 빼기`}
        className="text-slate-400 hover:text-rose-300 disabled:opacity-50"
        onClick={() => onChange(toggleDate(value, iso, { locked: lockedIso, max }))}
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  ));

  return (
    <div className={cn(compact ? "contents" : "flex flex-col gap-1.5", className)}>
      <div className={cn(compact ? "contents" : "flex flex-wrap items-center gap-2")}>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-expanded={open}
          title={compact ? (value.length > 0 ? value.map(label).join(", ") : ariaLabel) : undefined}
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          <Calendar className="h-3.5 w-3.5" aria-hidden />
          {value.length === 0 ? placeholder : `${placeholder} (${value.length}일)`}
        </button>
        {compact ? null : chips}
      </div>

      {open ? (
        <div
          className={cn(
            "w-[304px] rounded-lg border border-slate-700 bg-slate-950 p-3 shadow-lg",
            compact && "order-last basis-full",
          )}
        >
          {compact && value.length > 0 ? <div className="mb-2 flex flex-wrap gap-1.5">{chips}</div> : null}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="이전 달"
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-300 hover:bg-slate-800"
              onClick={() => step(-1)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <span className="text-sm font-semibold text-slate-100">
              {view.year}년 {view.month}월
            </span>
            <button
              type="button"
              aria-label="다음 달"
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-300 hover:bg-slate-800"
              onClick={() => step(1)}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7 text-center text-[11px] text-slate-500">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className="py-1">
                {weekday}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1 text-center">
            {cells.map((cell) => {
              const isSelected = selected.has(cell.iso);
              const isLocked = cell.iso === lockedIso;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={isLocked}
                  aria-pressed={isSelected}
                  title={isLocked ? "이 일정 수정 창의 날짜(항상 저장됩니다)" : undefined}
                  onClick={() => onChange(toggleDate(value, cell.iso, { locked: lockedIso, max }))}
                  className={cn(
                    "mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs transition-colors",
                    isLocked
                      ? "cursor-default bg-slate-700 font-semibold text-slate-200"
                      : isSelected
                        ? "bg-indigo-500 font-semibold text-white"
                        : cell.inMonth
                          ? "text-slate-100 hover:bg-slate-800/60"
                          : "text-slate-500/60 hover:bg-slate-800/40",
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              {lockedIso ? "회색 날짜는 이 창의 날짜(항상 저장). " : ""}눌러서 선택·해제
            </span>
            <button
              type="button"
              className="rounded-md bg-slate-800 px-2.5 py-1 text-xs text-slate-100 hover:bg-slate-700"
              onClick={() => setOpen(false)}
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
