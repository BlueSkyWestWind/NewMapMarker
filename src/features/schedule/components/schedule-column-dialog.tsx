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
import { useAuthSession } from "@/lib/auth/use-auth-session";
import { updateScheduleColumn } from "@/features/schedule/api";
import type { ScheduleColumn } from "@/features/schedule/types";
import { useToast } from "@/hooks/use-toast";

interface ScheduleColumnDialogProps {
  column: ScheduleColumn | null;
  onClose: () => void;
  onSaved: () => void;
}

/** 팀 머리글(팀 이름·팀장) 수정. 관리자만 열 수 있다. */
export function ScheduleColumnDialog({ column, onClose, onSaved }: ScheduleColumnDialogProps) {
  return (
    <Dialog open={column !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {column ? (
        <ColumnForm key={column.id} column={column} onClose={onClose} onSaved={onSaved} />
      ) : null}
    </Dialog>
  );
}

function ColumnForm({
  column,
  onClose,
  onSaved,
}: {
  column: ScheduleColumn;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const [teamLabel, setTeamLabel] = useState(column.teamLabel);
  const [leaderLabel, setLeaderLabel] = useState(column.leaderLabel);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || teamLabel.trim() === "") return;
    setIsSaving(true);
    try {
      await updateScheduleColumn(supabase, column.id, {
        teamLabel: teamLabel.trim(),
        leaderLabel: leaderLabel.trim(),
      });
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
      <DialogTitle className="text-base">팀 머리글 수정</DialogTitle>
      <DialogDescription className="sr-only">팀 이름과 팀장 이름을 고칩니다.</DialogDescription>
      <form className="flex flex-col gap-3 text-xs" onSubmit={handleSave}>
        <label className="flex flex-col gap-1">
          <span className="text-slate-300">팀 이름</span>
          <Input
            value={teamLabel}
            maxLength={30}
            onChange={(event) => setTeamLabel(event.target.value)}
            className="h-8 border-slate-700 bg-slate-900 text-xs"
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-slate-300">팀장</span>
          <Input
            value={leaderLabel}
            maxLength={30}
            onChange={(event) => setLeaderLabel(event.target.value)}
            className="h-8 border-slate-700 bg-slate-900 text-xs"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-8 border-slate-700 text-xs text-slate-200"
            onClick={onClose}
          >
            취소
          </Button>
          <Button
            type="submit"
            disabled={isSaving || teamLabel.trim() === ""}
            className="h-8 bg-indigo-600 text-xs hover:bg-indigo-500"
          >
            {isSaving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
