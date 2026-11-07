"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { saveScheduleDayNote } from "@/features/schedule/api";
import { weekdayLabel } from "@/features/schedule/lib/week";
import { useToast } from "@/hooks/use-toast";

interface ScheduleDayDialogProps {
  workDate: string | null;
  note: string;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** 날짜 메모(날짜 아래에 적는 이름 등) 수정. 비우고 저장하면 메모가 지워진다. */
export function ScheduleDayDialog({
  workDate,
  note,
  canEdit,
  onClose,
  onSaved,
}: ScheduleDayDialogProps) {
  return (
    <Dialog open={workDate !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {workDate ? (
        <DayForm
          key={workDate}
          workDate={workDate}
          note={note}
          canEdit={canEdit}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  );
}

function DayForm({
  workDate,
  note,
  canEdit,
  onClose,
  onSaved,
}: {
  workDate: string;
  note: string;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const [value, setValue] = useState(note);
  const [isSaving, setIsSaving] = useState(false);

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
    </DialogContent>
  );
}
