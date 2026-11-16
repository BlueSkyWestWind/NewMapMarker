"use client";

import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import { deleteScheduleFreeze, saveScheduleDayNote } from "@/features/schedule/api";
import type { FreezeBadge } from "@/features/schedule/lib/freeze";
import { weekdayLabel } from "@/features/schedule/lib/week";
import { useToast } from "@/hooks/use-toast";

interface ScheduleDayDialogProps {
  workDate: string | null;
  note: string;
  freezes: FreezeBadge[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
  onFreezeDeleted: () => void;
}

/** 날짜 메모(날짜 아래에 적는 이름 등) 수정. 비우고 저장하면 메모가 지워진다. */
export function ScheduleDayDialog({
  workDate,
  note,
  freezes,
  canEdit,
  onClose,
  onSaved,
  onFreezeDeleted,
}: ScheduleDayDialogProps) {
  return (
    <Dialog open={workDate !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {workDate ? (
        <DayForm
          key={workDate}
          workDate={workDate}
          note={note}
          freezes={freezes}
          canEdit={canEdit}
          onClose={onClose}
          onSaved={onSaved}
          onFreezeDeleted={onFreezeDeleted}
        />
      ) : null}
    </Dialog>
  );
}

function formatFreezePeriod(freeze: FreezeBadge): string {
  const prefix = `${freeze.reason} · `;
  return freeze.title.startsWith(prefix) ? freeze.title.slice(prefix.length) : freeze.time;
}

function DayForm({
  workDate,
  note,
  freezes,
  canEdit,
  onClose,
  onSaved,
  onFreezeDeleted,
}: {
  workDate: string;
  note: string;
  freezes: FreezeBadge[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
  onFreezeDeleted: () => void;
}) {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const [value, setValue] = useState(note);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !canEdit) return;
    setIsSaving(true);
    try {
      await saveScheduleDayNote(supabase, workDate, value);
      toast({ title: "저장했습니다" });
      onSaved();
      onClose();
    } catch (error) {
      toast({
        title: "저장하지 못했습니다",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFreeze = async (freeze: FreezeBadge) => {
    if (!supabase || !canEdit || deletingId !== null) return;
    if (
      !window.confirm(
        `'${freeze.reason}' 작업금지 기간 전체를 삭제합니다. 여러 날에 걸친 기간이면 모든 날짜에서 사라집니다. 계속할까요?`,
      )
    ) {
      return;
    }
    setDeletingId(freeze.id);
    try {
      await deleteScheduleFreeze(supabase, freeze.id);
      toast({ title: "작업금지 기간을 삭제했습니다" });
      onFreezeDeleted();
    } catch (error) {
      toast({
        title: "삭제하지 못했습니다",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <DialogContent className="flex max-w-sm flex-col gap-3 p-5">
      <DialogTitle className="text-base">
        날짜 메모 · {workDate} ({weekdayLabel(workDate)})
      </DialogTitle>
      <DialogDescription className="sr-only">
        날짜 아래에 표시되는 메모를 고칩니다. 비우고 저장하면 지워집니다.
      </DialogDescription>
      <form className="flex flex-col gap-3 text-xs" onSubmit={handleSave}>
        <label className="flex flex-col gap-1">
          <span className="text-slate-300">날짜 메모</span>
          <Input
            value={value}
            maxLength={100}
            disabled={!canEdit || isSaving}
            onChange={(event) => setValue(event.target.value)}
            className="h-8 border-slate-700 bg-slate-900 text-xs"
            autoFocus
          />
          <span className="text-[11px] text-slate-400">비우고 저장하면 메모가 삭제됩니다.</span>
        </label>
        <div className="flex justify-end gap-2">
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
              disabled={isSaving}
              className="h-8 bg-indigo-600 text-xs hover:bg-indigo-500"
            >
              {isSaving ? "저장 중…" : "저장"}
            </Button>
          ) : null}
        </div>
      </form>

      {freezes.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-slate-800 pt-3 text-xs">
          <span className="text-slate-300">이 날짜의 작업금지 기간</span>
          <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {freezes.map((freeze) => (
              <li
                key={freeze.id}
                className="flex items-center gap-2 rounded-md border border-slate-800 px-2.5 py-1.5"
              >
                <div className="min-w-0 flex-1" title={freeze.title}>
                  <p className="truncate whitespace-nowrap font-semibold text-rose-300">
                    {freeze.reason}
                  </p>
                  <p className="truncate whitespace-nowrap text-[11px] text-slate-400">
                    {formatFreezePeriod(freeze)}
                  </p>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={deletingId === freeze.id || isSaving}
                    aria-label="이 작업금지 기간 삭제"
                    title="삭제"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:border-rose-700 hover:text-rose-300 disabled:opacity-50"
                    onClick={() => void handleDeleteFreeze(freeze)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </DialogContent>
  );
}
