"use client";

import { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { copyCellToDate, updateScheduleCellResult } from "@/features/schedule/api";
import {
  REASON_MAX_LENGTH,
  validateResult,
} from "@/features/schedule/lib/cell-result";
import { weekdayLabel } from "@/features/schedule/lib/week";
import {
  RESULT_STATUSES,
  resultLabel,
  type ResultStatus,
  type ScheduleCell,
} from "@/features/schedule/types";
import { useToast } from "@/hooks/use-toast";

const FIELD_CLASS = "h-8 border-slate-700 bg-slate-900 text-xs";

/** 표 셀의 점과 이 창의 선택 버튼이 같은 색을 쓴다. */
export const RESULT_DOT_CLASS: Record<ResultStatus, string> = {
  done: "bg-emerald-400",
  partial: "bg-amber-400",
  undone: "bg-rose-400",
};

const ERROR_TEXT = {
  reason: "일부완료·미시설은 사유를 적어 주세요.",
  reasonLength: `사유는 ${REASON_MAX_LENGTH}자까지 적을 수 있습니다.`,
  date: "다시 잡을 날짜는 원래 날짜 이후의 올바른 날짜여야 합니다.",
} as const;

interface ScheduleResultDialogProps {
  /** 결과를 기록할 저장된 칸. null이면 닫힘 */
  cell: ScheduleCell | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * 시설 국소의 당일 시행 결과 창. 완료 / 일부완료 / 미시설을 고르고, 일부완료·미시설은 사유를 적는다.
 * 다시 잡을 날짜를 넣으면 같은 국소 정보를 그 날짜의 같은 팀 칸에 복사한다. 칸 편집 창과 별개로 바로 저장한다.
 */
export function ScheduleResultDialog({ cell, canEdit, onClose, onSaved }: ScheduleResultDialogProps) {
  return (
    <Dialog open={cell !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {cell ? (
        <ResultForm key={cell.id} cell={cell} canEdit={canEdit} onClose={onClose} onSaved={onSaved} />
      ) : null}
    </Dialog>
  );
}

function ResultForm({
  cell,
  canEdit,
  onClose,
  onSaved,
}: Omit<ScheduleResultDialogProps, "cell"> & { cell: ScheduleCell }) {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const [status, setStatus] = useState<ResultStatus | null>(cell.result?.status ?? null);
  const [reason, setReason] = useState(cell.result?.reason ?? "");
  const [rescheduledTo, setRescheduledTo] = useState(cell.result?.rescheduledTo ?? "");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const disabled = !canEdit || isSaving;
  const needsReason = status === "partial" || status === "undone";

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !canEdit) return;

    const check = validateResult({ status, reason, rescheduledTo, workDate: cell.workDate });
    if (!check.ok) {
      setNotice(ERROR_TEXT[check.error]);
      return;
    }

    setIsSaving(true);
    try {
      const target = check.value?.rescheduledTo ?? null;
      // 이미 그 날짜로 복사해 둔 칸은 다시 복사하지 않는다. 복사를 먼저 해야 실패해도 날짜만 남지 않는다.
      const shouldCopy = target !== null && target !== (cell.result?.rescheduledTo ?? null);
      if (shouldCopy) await copyCellToDate(supabase, cell, target);
      await updateScheduleCellResult(supabase, cell.id, check.value);
      toast({
        title: shouldCopy ? `저장했습니다 · ${target.slice(5)}에 일정을 추가했습니다` : "저장했습니다",
      });
      onSaved();
      onClose();
    } catch (error) {
      toast({
        title: "저장하지 못했습니다",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
      onSaved(); // 복사만 되고 끝났을 수 있으니 화면을 새로 고친다.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DialogContent className="flex max-w-md flex-col gap-3 p-5">
      <DialogTitle className="text-base">
        시행 결과 · {cell.workDate.slice(5)} ({weekdayLabel(cell.workDate)})
      </DialogTitle>
      <DialogDescription className="truncate text-xs text-slate-400" title={cell.mainText}>
        {cell.mainText}
      </DialogDescription>
      <form className="flex flex-col gap-3 text-xs" onSubmit={handleSave}>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={disabled}
            aria-pressed={status === null}
            onClick={() => setStatus(null)}
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
              onClick={() => setStatus(value)}
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
                onChange={(event) => setReason(event.target.value)}
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
                onChange={setRescheduledTo}
                className={FIELD_CLASS}
              />
              <span className="text-[11px] text-slate-400">
                날짜를 넣고 저장하면 이 국소 정보가 그 날짜의 같은 팀 첫 빈 행에 추가됩니다. 날짜를 바꿔 저장하면
                새 날짜에 한 번 더 추가되고, 이전 날짜의 칸은 그대로 남습니다.
              </span>
            </div>
          </>
        ) : null}

        {notice ? <p className="text-[11px] text-amber-400">{notice}</p> : null}

        <div className="mt-1 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-8 border-slate-700 text-xs text-slate-200"
            onClick={onClose}
          >
            {canEdit ? "취소" : "닫기"}
          </Button>
          {canEdit ? (
            <Button type="submit" disabled={isSaving} className="h-8 bg-indigo-600 text-xs hover:bg-indigo-500">
              {isSaving ? "저장 중…" : "저장"}
            </Button>
          ) : null}
        </div>
      </form>
    </DialogContent>
  );
}
