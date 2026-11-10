"use client";

import { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { copyCellToDate, updateScheduleCellResult } from "@/features/schedule/api";
import {
  REASON_MAX_LENGTH,
  cellsToReschedule,
  validateResult,
} from "@/features/schedule/lib/cell-result";
import { weekdayLabel } from "@/features/schedule/lib/week";
import {
  RESULT_DOT_CLASS,
  ScheduleResultFields,
} from "@/features/schedule/components/schedule-result-fields";
import { resultLabel, type ResultStatus, type ScheduleCell } from "@/features/schedule/types";
import { useToast } from "@/hooks/use-toast";

const ERROR_TEXT = {
  reason: "일부완료·미시설은 사유를 적어 주세요.",
  reasonLength: `사유는 ${REASON_MAX_LENGTH}자까지 적을 수 있습니다.`,
  date: "다시 잡을 날짜는 원래 날짜 이후의 올바른 날짜여야 합니다.",
} as const;

interface ScheduleBulkResultDialogProps {
  /** 일괄 기록할 후보 칸(저장된 칸만). 같은 팀·날짜의 칸이다. */
  cells: ScheduleCell[];
  open: boolean;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * 같은 팀·날짜의 국소 여러 건에 시행 결과를 한 번에 기록하는 창. 대상은 체크로 고른다(처음은 전체).
 * 한 건씩 기록하려면 칸 편집 창의 국소별 "결과" 버튼을 쓴다. 이미 기록된 결과는 덮어쓴다.
 */
export function ScheduleBulkResultDialog({
  cells,
  open,
  canEdit,
  onClose,
  onSaved,
}: ScheduleBulkResultDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      {open ? (
        <BulkForm cells={cells} canEdit={canEdit} onClose={onClose} onSaved={onSaved} />
      ) : null}
    </Dialog>
  );
}

function BulkForm({
  cells,
  canEdit,
  onClose,
  onSaved,
}: Omit<ScheduleBulkResultDialogProps, "open">) {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(cells.map((cell) => cell.id)));
  const [status, setStatus] = useState<ResultStatus | null>("done");
  const [reason, setReason] = useState("");
  const [rescheduledTo, setRescheduledTo] = useState("");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const disabled = !canEdit || isSaving;
  const targets = cells.filter((cell) => selected.has(cell.id));
  const overwriteCount = targets.filter((cell) => cell.result).length;
  const allSelected = targets.length === cells.length;
  const workDate = cells[0]?.workDate ?? "";

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !canEdit) return;
    if (targets.length === 0) {
      setNotice("결과를 기록할 국소를 하나 이상 골라 주세요.");
      return;
    }
    const check = validateResult({ status, reason, rescheduledTo, workDate });
    if (!check.ok) {
      setNotice(ERROR_TEXT[check.error]);
      return;
    }

    setIsSaving(true);
    setNotice("");
    let saved = 0;
    try {
      const target = check.value?.rescheduledTo ?? null;
      const copyIds = new Set(cellsToReschedule(targets, target).map((cell) => cell.id));
      // 칸마다 복사를 먼저 한다. 복사가 실패해도 날짜만 남지 않게 한다. 복사는 같은 팀의 빈 행을 차례로 채우므로 순서대로 한다.
      for (const cell of targets) {
        if (target !== null && copyIds.has(cell.id)) await copyCellToDate(supabase, cell, target);
        await updateScheduleCellResult(supabase, cell.id, check.value);
        saved += 1;
      }
      toast({ title: `${saved}건에 결과를 기록했습니다` });
      onSaved();
      onClose();
    } catch (error) {
      toast({
        title: saved > 0 ? `${saved}건만 저장하고 멈췄습니다` : "저장하지 못했습니다",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
      onSaved(); // 일부만 저장됐거나 복사만 됐을 수 있으니 화면을 새로 고친다.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DialogContent className="flex max-w-lg flex-col gap-3 p-5">
      <DialogTitle className="text-base">
        시행 결과 일괄 기록 · {workDate.slice(5)} ({workDate ? weekdayLabel(workDate) : ""})
      </DialogTitle>
      <DialogDescription className="text-xs text-slate-400">
        고른 국소에 같은 결과를 한 번에 기록합니다. 국소마다 다르게 적으려면 목록의 &quot;결과&quot; 버튼을 쓰세요.
      </DialogDescription>
      <form className="flex flex-col gap-3 text-xs" onSubmit={handleSave}>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-300">
              대상 국소{" "}
              <span className="text-slate-500">
                ({targets.length}/{cells.length}건)
              </span>
            </span>
            <button
              type="button"
              disabled={disabled}
              className="h-6 whitespace-nowrap rounded-md border border-slate-700 px-2 text-[11px] hover:bg-slate-800 disabled:opacity-50"
              onClick={() => setSelected(allSelected ? new Set() : new Set(cells.map((cell) => cell.id)))}
            >
              {allSelected ? "전체 해제" : "전체 선택"}
            </button>
          </div>
          <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-slate-800 p-1.5">
            {cells.map((cell) => (
              <li key={cell.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-800/60">
                  <input
                    type="checkbox"
                    checked={selected.has(cell.id)}
                    disabled={disabled}
                    onChange={() => toggle(cell.id)}
                  />
                  <span className="min-w-0 flex-1 truncate" title={cell.mainText}>
                    {cell.mainText || "(이름 없음)"}
                  </span>
                  {cell.result ? (
                    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-slate-400">
                      <span
                        className={cn("inline-block h-2 w-2 rounded-full", RESULT_DOT_CLASS[cell.result.status])}
                        aria-hidden
                      />
                      {resultLabel(cell.result.status)}
                    </span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        </div>

        <ScheduleResultFields
          status={status}
          reason={reason}
          rescheduledTo={rescheduledTo}
          disabled={disabled}
          onStatusChange={setStatus}
          onReasonChange={setReason}
          onRescheduledToChange={setRescheduledTo}
          rescheduleHint="날짜를 넣으면 고른 국소가 그 날짜의 같은 팀 빈 행에 차례로 추가됩니다. 이미 그 날짜로 추가해 둔 국소는 다시 추가하지 않습니다."
        />

        {overwriteCount > 0 ? (
          <p className="text-[11px] text-slate-400">
            이미 결과가 있는 {overwriteCount}건은 이 값으로 덮어씁니다.
          </p>
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
            <Button
              type="submit"
              disabled={isSaving || targets.length === 0}
              className="h-8 bg-indigo-600 text-xs hover:bg-indigo-500"
            >
              {isSaving ? "저장 중…" : `${targets.length}건 저장`}
            </Button>
          ) : null}
        </div>
      </form>
    </DialogContent>
  );
}
