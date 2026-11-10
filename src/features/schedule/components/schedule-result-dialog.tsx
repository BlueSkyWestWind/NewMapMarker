"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { copyCellToDate, updateScheduleCellResult } from "@/features/schedule/api";
import { REASON_MAX_LENGTH, validateResult } from "@/features/schedule/lib/cell-result";
import { ScheduleResultFields } from "@/features/schedule/components/schedule-result-fields";
import { weekdayLabel } from "@/features/schedule/lib/week";
import { type ResultStatus, type ScheduleCell } from "@/features/schedule/types";
import { useToast } from "@/hooks/use-toast";

export { RESULT_DOT_CLASS } from "@/features/schedule/components/schedule-result-fields";

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
        <ScheduleResultFields
          status={status}
          reason={reason}
          rescheduledTo={rescheduledTo}
          disabled={disabled}
          onStatusChange={setStatus}
          onReasonChange={setReason}
          onRescheduledToChange={setRescheduledTo}
          rescheduleHint="날짜를 넣고 저장하면 이 국소 정보가 그 날짜의 같은 팀 첫 빈 행에 추가됩니다. 날짜를 바꿔 저장하면 새 날짜에 한 번 더 추가되고, 이전 날짜의 칸은 그대로 남습니다."
        />

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
