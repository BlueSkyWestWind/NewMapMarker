"use client";

import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { REASON_MAX_LENGTH } from "@/features/schedule/lib/cell-result";
import { RESULT_STATUSES, resultLabel, type ResultStatus } from "@/features/schedule/types";

const FIELD_CLASS = "h-8 border-slate-700 bg-slate-900 text-xs";

/** 표 셀의 점과 결과 창의 선택 버튼이 같은 색을 쓴다. */
export const RESULT_DOT_CLASS: Record<ResultStatus, string> = {
  done: "bg-emerald-400",
  partial: "bg-amber-400",
  undone: "bg-rose-400",
};

export interface ResultFieldsValue {
  status: ResultStatus | null;
  reason: string;
  rescheduledTo: string;
}

interface ScheduleResultFieldsProps extends ResultFieldsValue {
  disabled: boolean;
  onStatusChange: (status: ResultStatus | null) => void;
  onReasonChange: (reason: string) => void;
  onRescheduledToChange: (date: string) => void;
  /** 다시 잡을 날짜 아래 안내 문구. 개별 창과 일괄 창의 동작 설명이 다르다. */
  rescheduleHint: string;
}

/** 시행 결과 입력칸. 개별 결과 창과 일괄 결과 창이 함께 쓴다. */
export function ScheduleResultFields({
  status,
  reason,
  rescheduledTo,
  disabled,
  onStatusChange,
  onReasonChange,
  onRescheduledToChange,
  rescheduleHint,
}: ScheduleResultFieldsProps) {
  const needsReason = status === "partial" || status === "undone";

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={status === null}
          onClick={() => onStatusChange(null)}
          className={cn(
            "h-7 whitespace-nowrap rounded-md border px-2.5 text-[11px] disabled:opacity-60",
            status === null ? "border-indigo-400 bg-indigo-500/20" : "border-slate-700 hover:bg-slate-800",
          )}
        >
          기록 안 함
        </button>
        {RESULT_STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            disabled={disabled}
            aria-pressed={status === value}
            onClick={() => onStatusChange(value)}
            className={cn(
              "flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[11px] disabled:opacity-60",
              status === value ? "border-indigo-400 bg-indigo-500/20" : "border-slate-700 hover:bg-slate-800",
            )}
          >
            <span className={cn("inline-block h-2 w-2 rounded-full", RESULT_DOT_CLASS[value])} aria-hidden />
            {resultLabel(value)}
          </button>
        ))}
      </div>

      {needsReason ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-slate-300">사유 (필수)</span>
            <Input
              value={reason}
              maxLength={REASON_MAX_LENGTH}
              disabled={disabled}
              autoFocus
              placeholder="왜 못했는지 적어 주세요"
              onChange={(event) => onReasonChange(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-slate-300">다시 잡을 날짜 (선택)</span>
            <DatePicker
              value={rescheduledTo}
              disabled={disabled}
              allowClear
              placeholder="날짜 선택"
              ariaLabel="다시 잡을 날짜 (선택)"
              onChange={onRescheduledToChange}
              className={FIELD_CLASS}
            />
            <span className="text-[11px] text-slate-400">{rescheduleHint}</span>
          </div>
        </>
      ) : null}
    </>
  );
}
