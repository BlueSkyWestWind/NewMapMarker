"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addExcludedStations } from "@/features/schedule/api";
import {
  buildExclusionRows,
  EXCLUSION_NOTE_MAX,
  EXCLUSION_REASONS,
  validateExclusion,
  type ExclusionReason,
} from "@/features/schedule/lib/excluded-stations";
import { isScheduleTableMissing } from "@/features/schedule/lib/table-missing";
import { useToast } from "@/hooks/use-toast";
import { useAuthSession } from "@/lib/auth/use-auth-session";

export interface ExcludeTargetItem {
  label: string;
  markerId?: string | null;
}

interface ScheduleExcludeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ExcludeTargetItem[];
  onDone: () => void;
  title?: string;
}

const MAX_PREVIEW_NAMES = 5;

/**
 * 선택한 국소를 제외 목록(DB)에 추가하는 창.
 */
export function ScheduleExcludeDialog({
  open,
  onOpenChange,
  items,
  onDone,
  title = "국소 제외",
}: ScheduleExcludeDialogProps) {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const [reason, setReason] = useState<ExclusionReason>("canceled");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason("canceled");
    setNote("");
    setNotice(null);
  }, [open]);

  const previewItems = items.slice(0, MAX_PREVIEW_NAMES);
  const extraCount = Math.max(0, items.length - MAX_PREVIEW_NAMES);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || isSaving) return;

    const check = validateExclusion({ reason, note });
    if (!check.ok) {
      setNotice(
        check.error === "note-required"
          ? "기타 사유를 선택하면 메모를 입력해야 합니다."
          : `메모는 ${EXCLUSION_NOTE_MAX}자 이내여야 합니다.`,
      );
      return;
    }

    const rows = buildExclusionRows(items, reason, check.note);
    if (rows.length === 0) {
      setNotice("제외할 국소가 없습니다.");
      return;
    }

    setNotice(null);
    setIsSaving(true);
    try {
      await addExcludedStations(supabase, rows);
      toast({ title: `${rows.length}건을 제외했습니다` });
      onDone();
      onOpenChange(false);
    } catch (error) {
      if (isScheduleTableMissing(error)) {
        setNotice(
          "DB에 제외 테이블이 없습니다. 마이그레이션(20261122000000_schedule_excluded_stations.sql)을 적용해 주세요",
        );
      } else {
        setNotice(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <DialogContent className="flex max-w-md flex-col gap-3 p-5">
        <DialogTitle className="text-base">{title}</DialogTitle>
        <DialogDescription className="text-xs text-slate-400">
          {items.length}건을 제외합니다. 제외한 국소는 미배정 목록과 미완료 탭에서 사라집니다.
        </DialogDescription>

        {previewItems.length > 0 ? (
          <div className="flex flex-col gap-1 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-200">
            {previewItems.map((item, idx) => (
              <p key={`${item.label}-${idx}`} title={item.label} className="truncate whitespace-nowrap">
                {item.label}
              </p>
            ))}
            {extraCount > 0 ? (
              <p className="text-[11px] text-slate-400">외 {extraCount}건</p>
            ) : null}
          </div>
        ) : null}

        <form className="flex flex-col gap-3 text-xs" onSubmit={(e) => void handleSubmit(e)}>
          <div className="flex flex-col gap-1.5">
            <span className="text-slate-300">제외 사유</span>
            <div className="flex flex-wrap gap-3">
              {EXCLUSION_REASONS.map((opt) => (
                <label key={opt.key} className="inline-flex cursor-pointer items-center gap-1.5 text-slate-200">
                  <input
                    type="radio"
                    name="exclusion-reason"
                    checked={reason === opt.key}
                    disabled={isSaving}
                    onChange={() => {
                      setNotice(null);
                      setReason(opt.key);
                    }}
                    className="accent-indigo-500"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-slate-300">
              메모 {reason === "other" ? "(필수)" : "(선택)"}
            </span>
            <Input
              value={note}
              maxLength={EXCLUSION_NOTE_MAX}
              disabled={isSaving}
              placeholder={reason === "other" ? "제외 사유를 입력하세요" : "메모 (최대 100자)"}
              onChange={(event) => {
                setNotice(null);
                setNote(event.target.value);
              }}
              className="h-8 border-slate-700 bg-slate-900 text-xs"
            />
          </label>

          {notice ? (
            <p className="rounded border border-rose-700/60 bg-rose-950/50 px-2.5 py-1.5 text-xs text-rose-200">
              {notice}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
              className="h-8 border-slate-700 text-xs text-slate-200"
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={isSaving || items.length === 0}
              className="h-8 bg-rose-600 text-xs hover:bg-rose-500"
            >
              {isSaving ? "제외 중…" : "제외"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
