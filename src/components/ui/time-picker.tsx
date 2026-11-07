"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const PANEL_WIDTH = 320;
const PANEL_ESTIMATED_HEIGHT = 380;
/** 분 선택 간격. 이 간격에 없는 값(예: 23:59)이 이미 들어 있으면 그 값도 선택칸에 함께 보인다. */
const MINUTE_STEP = 5;
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, index) => index * MINUTE_STEP);

const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `HH:mm`이 올바르면 시·분, 아니면 0시 0분. */
function parseTime(value: string): { hour: number; minute: number } {
  const match = TIME_PATTERN.exec(value);
  if (!match) return { hour: 0, minute: 0 };
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : { hour: 0, minute: 0 };
}

export interface TimePickerProps {
  /** 24시간제 "HH:mm". 비어 있으면 선택 전이다 */
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
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
 * 프로젝트 공통 시각 선택기. `DatePicker`와 같은 모양(어두운 패널, 동그란 선택칸, 하단 확인 버튼)이다.
 * 시(0~23)와 분(5분 단위)을 격자에서 고른다. 브라우저 기본 시간 입력은 오전/오후 목록이라 쓰지 않는다.
 */
export function TimePicker({
  value,
  onChange,
  placeholder = "시각 선택",
  ariaLabel,
  disabled = false,
  className,
}: TimePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<FloatingPosition>({ top: 0, left: 0 });
  const [draft, setDraft] = useState(() => parseTime(value));

  const computePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8));
    if (spaceBelow < PANEL_ESTIMATED_HEIGHT && rect.top > spaceBelow) {
      setPos({ bottom: Math.max(8, window.innerHeight - rect.top + 6), left });
    } else {
      setPos({ top: rect.bottom + 6, left });
    }
  }, []);

  const openPicker = () => {
    if (disabled) return;
    setDraft(parseTime(value));
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

  const handleConfirm = () => {
    onChange(`${pad(draft.hour)}:${pad(draft.minute)}`);
    setOpen(false);
  };

  const hasValue = value.trim().length > 0;
  // 간격에 없는 분(예: 59)이 이미 선택돼 있으면 그 값을 끝에 더해 선택된 모습을 보인다.
  const minutes = MINUTES.includes(draft.minute) ? MINUTES : [...MINUTES, draft.minute];
  const cellClass = (selected: boolean) =>
    cn(
      "mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors",
      selected
        ? "bg-indigo-500/15 font-semibold text-indigo-300"
        : "text-slate-100 hover:bg-slate-800/50",
    );

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
        <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
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
                aria-label={ariaLabel ?? "시각 선택"}
                style={{ top: pos.top, bottom: pos.bottom, left: pos.left }}
                onMouseDown={(e) => e.stopPropagation()}
                className="fixed z-[101] w-[320px] select-none rounded-xl border border-slate-800 bg-slate-900 text-slate-100 shadow-elevation-lg"
              >
                <div className="p-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-4">
                    <div className="mb-3 rounded-md bg-slate-950 py-1.5 text-center text-sm font-medium">
                      {pad(draft.hour)}:{pad(draft.minute)}
                    </div>

                    <p className="mb-1 text-xs text-slate-500">시</p>
                    <div className="grid grid-cols-6 gap-y-1 text-center">
                      {HOURS.map((hour) => (
                        <button
                          key={hour}
                          type="button"
                          onClick={() => setDraft((prev) => ({ ...prev, hour }))}
                          className={cellClass(hour === draft.hour)}
                        >
                          {pad(hour)}
                        </button>
                      ))}
                    </div>

                    <p className="mb-1 mt-3 text-xs text-slate-500">분</p>
                    <div className="grid grid-cols-6 gap-y-1 text-center">
                      {minutes.map((minute) => (
                        <button
                          key={minute}
                          type="button"
                          onClick={() => setDraft((prev) => ({ ...prev, minute }))}
                          className={cellClass(minute === draft.minute)}
                        >
                          {pad(minute)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-4 py-2.5">
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
