"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildDayGrid,
  buildDecadeGrid,
  buildYearGrid,
  clampIsoToYearMonth,
  normalizeToIsoDate,
  parseIsoParts,
  stepYearMonth,
} from "@/lib/calendar-picker";
import { cn } from "@/lib/utils";

type PanelView = "day" | "month" | "year" | "decade";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const PANEL_WIDTH = 348;
const PANEL_ESTIMATED_HEIGHT = 400;

export interface DatePickerProps {
  /** mode="date"이면 "yyyy-mm-dd", mode="month"이면 "yyyy-mm" */
  value: string;
  onChange: (nextValue: string) => void;
  mode?: "date" | "month";
  placeholder?: string;
  allowClear?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

interface FloatingPosition {
  top?: number;
  bottom?: number;
  left: number;
}

/**
 * 프로젝트 공통 달력 선택기.
 * 일 → 월 → 연도(10년) → 연대(100년) 4단계 드릴다운과 하단 확인 버튼을 제공한다.
 */
export function DatePicker({
  value,
  onChange,
  mode = "date",
  placeholder = "날짜 선택",
  allowClear = false,
  ariaLabel,
  disabled = false,
  className,
}: DatePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<FloatingPosition>({ top: 0, left: 0 });
  const initialIso = normalizeToIsoDate(value, mode);
  const [draftIso, setDraftIso] = useState(initialIso);
  const [viewYear, setViewYear] = useState(() => parseIsoParts(initialIso).year);
  const [viewMonth, setViewMonth] = useState(() => parseIsoParts(initialIso).month);
  const [panelView, setPanelView] = useState<PanelView>(mode === "month" ? "month" : "day");

  const computePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8));

    if (spaceBelow < PANEL_ESTIMATED_HEIGHT && rect.top > spaceBelow) {
      setPos({
        bottom: Math.max(8, window.innerHeight - rect.top + 6),
        left,
      });
    } else {
      setPos({
        top: rect.bottom + 6,
        left,
      });
    }
  }, []);

  const openPicker = () => {
    if (disabled) return;
    const nextIso = normalizeToIsoDate(value, mode);
    const parts = parseIsoParts(nextIso);
    setDraftIso(nextIso);
    setViewYear(parts.year);
    setViewMonth(parts.month);
    setPanelView(mode === "month" ? "month" : "day");
    computePosition();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    const handleReposition = () => computePosition();
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, computePosition]);

  const draftParts = parseIsoParts(draftIso);
  const dayCells = buildDayGrid(viewYear, viewMonth);
  const yearGrid = buildYearGrid(viewYear);
  const decadeGrid = buildDecadeGrid(viewYear);

  const stepPrev = () => {
    if (panelView === "day") {
      const prev = stepYearMonth(viewYear, viewMonth, -1);
      setViewYear(prev.year);
      setViewMonth(prev.month);
    } else if (panelView === "month") {
      setViewYear((y) => y - 1);
    } else if (panelView === "year") {
      setViewYear((y) => y - 10);
    } else {
      setViewYear((y) => y - 100);
    }
  };

  const stepNext = () => {
    if (panelView === "day") {
      const next = stepYearMonth(viewYear, viewMonth, 1);
      setViewYear(next.year);
      setViewMonth(next.month);
    } else if (panelView === "month") {
      setViewYear((y) => y + 1);
    } else if (panelView === "year") {
      setViewYear((y) => y + 10);
    } else {
      setViewYear((y) => y + 100);
    }
  };

  const drillUp = () => {
    if (panelView === "day") setPanelView("month");
    else if (panelView === "month") setPanelView("year");
    else if (panelView === "year") setPanelView("decade");
  };

  const handleConfirm = () => {
    const committed = mode === "month" ? draftIso.slice(0, 7) : draftIso;
    onChange(committed);
    setOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setOpen(false);
  };

  const headerLabel =
    panelView === "day"
      ? `${viewYear}년 ${viewMonth}월`
      : panelView === "month"
        ? `${viewYear}`
        : panelView === "year"
          ? `${yearGrid.decadeStart}-${yearGrid.decadeEnd}`
          : `${decadeGrid.centuryStart}-${decadeGrid.centuryEnd}`;

  const hasValue = value.trim().length > 0;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 transition-colors hover:border-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <span className={cn("truncate", !hasValue && "text-slate-500")}>
          {hasValue ? value : placeholder}
        </span>
        <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-auto fixed inset-0 z-[100]"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={() => setOpen(false)}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                role="dialog"
                aria-label={ariaLabel ?? "날짜 선택"}
                style={{
                  top: pos.top,
                  bottom: pos.bottom,
                  left: pos.left,
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="fixed z-[101] w-[348px] select-none rounded-lg border border-slate-800 bg-slate-900 text-slate-100 shadow-elevation-lg"
              >
                <div className="p-4">
                  <div className="rounded-lg border border-slate-800 bg-slate-900 px-5 py-4">
                    {/* 상단 탐색 헤더 */}
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-label="이전"
                        onClick={stepPrev}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-800/50 hover:text-slate-100"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden />
                      </button>

                      <button
                        type="button"
                        onClick={drillUp}
                        disabled={panelView === "decade"}
                        className={cn(
                          "flex-1 rounded-md py-1.5 text-center text-sm font-medium text-slate-100 transition-colors",
                          panelView === "day"
                            ? "hover:bg-slate-950"
                            : "bg-slate-950 hover:bg-slate-800/50 disabled:cursor-default disabled:hover:bg-slate-950",
                        )}
                      >
                        {headerLabel}
                      </button>

                      <button
                        type="button"
                        aria-label="다음"
                        onClick={stepNext}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-800/50 hover:text-slate-100"
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </button>
                    </div>

                    {/* 1단계: 일(day) 격자 */}
                    {panelView === "day" ? (
                      <div>
                        <div className="mb-2 grid grid-cols-7 text-center text-xs text-slate-500">
                          {WEEKDAYS.map((label) => (
                            <span key={label} className="py-1">
                              {label}
                            </span>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-y-1 text-center">
                          {dayCells.map((cell) => {
                            const isSelected = cell.iso === draftIso;
                            return (
                              <button
                                key={cell.iso}
                                type="button"
                                onClick={() => {
                                  setDraftIso(cell.iso);
                                  const parts = parseIsoParts(cell.iso);
                                  setViewYear(parts.year);
                                  setViewMonth(parts.month);
                                }}
                                className={cn(
                                  "mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors",
                                  isSelected
                                    ? "bg-indigo-500/15 font-semibold text-indigo-300"
                                    : cell.inMonth
                                      ? "text-slate-100 hover:bg-slate-800/50"
                                      : "text-slate-500/60 hover:bg-slate-800/40",
                                )}
                              >
                                {cell.day}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {/* 2단계: 월(month) 격자 */}
                    {panelView === "month" ? (
                      <div className="grid grid-cols-4 gap-y-6 py-3 text-center">
                        {MONTHS.map((m) => {
                          const isSelected = viewYear === draftParts.year && m === draftParts.month;
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                setViewMonth(m);
                                setDraftIso(clampIsoToYearMonth(draftIso, viewYear, m));
                                if (mode === "date") {
                                  setPanelView("day");
                                }
                              }}
                              className={cn(
                                "mx-auto flex h-12 w-12 items-center justify-center rounded-full text-sm transition-colors",
                                isSelected
                                  ? "bg-indigo-500/15 font-semibold text-indigo-300"
                                  : "text-slate-100 hover:bg-slate-800/50",
                              )}
                            >
                              {m}월
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    {/* 3단계: 연도(year, 10년 단위) 격자 */}
                    {panelView === "year" ? (
                      <div className="grid grid-cols-4 gap-y-6 py-3 text-center">
                        {yearGrid.cells.map((cell) => {
                          const isSelected = cell.year === draftParts.year;
                          return (
                            <button
                              key={cell.year}
                              type="button"
                              onClick={() => {
                                setViewYear(cell.year);
                                setDraftIso(clampIsoToYearMonth(draftIso, cell.year, viewMonth));
                                setPanelView("month");
                              }}
                              className={cn(
                                "mx-auto flex h-12 w-12 items-center justify-center rounded-full text-sm transition-colors",
                                isSelected
                                  ? "bg-indigo-500/15 font-semibold text-indigo-300"
                                  : cell.inDecade
                                    ? "text-slate-100 hover:bg-slate-800/50"
                                    : "text-slate-500/60 hover:bg-slate-800/40",
                              )}
                            >
                              {cell.year}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    {/* 4단계: 연대(decade, 100년 단위) 격자 */}
                    {panelView === "decade" ? (
                      <div className="grid grid-cols-4 gap-y-3 py-1 text-center">
                        {decadeGrid.cells.map((cell) => {
                          const isSelected =
                            draftParts.year >= cell.startYear && draftParts.year <= cell.endYear;
                          return (
                            <button
                              key={cell.startYear}
                              type="button"
                              onClick={() => {
                                const targetYear = isSelected ? draftParts.year : cell.startYear;
                                setViewYear(targetYear);
                                setDraftIso(clampIsoToYearMonth(draftIso, targetYear, viewMonth));
                                setPanelView("year");
                              }}
                              className={cn(
                                "mx-auto flex w-14 flex-col items-center justify-center rounded-full py-2.5 text-xs leading-snug transition-colors",
                                isSelected
                                  ? "bg-indigo-500/15 font-semibold text-indigo-300"
                                  : cell.inCentury
                                    ? "text-slate-100 hover:bg-slate-800/50"
                                    : "text-slate-500/60 hover:bg-slate-800/40",
                              )}
                            >
                              <span>{cell.startYear}</span>
                              <span>-</span>
                              <span>{cell.endYear}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* 하단 확인 버튼 영역 */}
                <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-4 py-2.5">
                  {allowClear && hasValue ? (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-800"
                    >
                      초기화
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className="rounded-lg bg-slate-700 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600"
                  >
                    확인
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
