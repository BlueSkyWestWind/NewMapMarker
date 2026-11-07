"use client";

import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useOptionLists } from "@/features/schedule/hooks/use-option-lists";
import { OPTION_LIST_KEYS, type OptionListKey } from "@/features/schedule/lib/day-types";
import { OPTION_LIST_LABELS } from "@/features/schedule/lib/option-lists";
import { useToast } from "@/hooks/use-toast";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

interface ScheduleOptionListsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 관리자만 true: 값을 더하고 지운다 */
  canEdit: boolean;
}

/**
 * 일자별 상세의 드롭다운 목록 8개를 보고 값을 더하거나 지우는 창(순서는 추가한 순서).
 * 값을 지워도 이미 상세에 저장된 값은 그대로 남는다.
 */
export function ScheduleOptionListsDialog({ open, onOpenChange, canEdit }: ScheduleOptionListsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <OptionListsForm canEdit={canEdit} onClose={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function OptionListsForm({ canEdit, onClose }: { canEdit: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { lists, isTableMissing, add, remove } = useOptionLists();
  const [listKey, setListKey] = useState<OptionListKey>(OPTION_LIST_KEYS[0]);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const values = lists[listKey];
  const trimmed = draft.trim();
  const canAdd = canEdit && !isSaving && !isTableMissing && trimmed !== "" && !values.includes(trimmed);

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    if (!canAdd) return;
    setIsSaving(true);
    try {
      await add(listKey, trimmed);
      setDraft("");
    } catch (error) {
      toast({ title: "추가하지 못했습니다", description: errorMessage(error), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (value: string) => {
    if (!canEdit || isSaving || isTableMissing) return;
    setIsSaving(true);
    try {
      await remove(listKey, value);
    } catch (error) {
      toast({ title: "삭제하지 못했습니다", description: errorMessage(error), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DialogContent className="flex max-h-[92vh] max-w-xl flex-col gap-3 overflow-y-auto p-5">
      <DialogTitle className="text-base">목록 관리</DialogTitle>
      <DialogDescription className="text-xs text-slate-400">
        일자별 상세의 드롭다운 목록입니다. 값을 지워도 이미 상세에 저장된 값은 그대로 남습니다.
      </DialogDescription>

      {isTableMissing ? (
        <p className="text-xs text-amber-400">
          DB에 목록 테이블이 없습니다. 마이그레이션(20261111000000_schedule_day_details.sql)을 Supabase에 적용해 주세요.
          지금은 처음 값만 보이며 고칠 수 없습니다.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="목록 선택">
        {OPTION_LIST_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={key === listKey}
            onClick={() => setListKey(key)}
            className={cn(
              "h-7 whitespace-nowrap rounded-md border px-2.5 text-xs",
              key === listKey
                ? "border-indigo-500 bg-indigo-950/60 text-indigo-100"
                : "border-slate-700 text-slate-300 hover:border-slate-500",
            )}
          >
            {OPTION_LIST_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-slate-300">
          {OPTION_LIST_LABELS[listKey]} ({values.length}개)
        </span>
        {values.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-700 p-3 text-[11px] text-slate-400">
            값이 없습니다.
          </p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
            {values.map((value) => (
              <li
                key={value}
                className="flex items-center gap-2 rounded-md border border-slate-800 px-2.5 py-1 text-xs"
              >
                <span className="min-w-0 flex-1 truncate whitespace-nowrap" title={value}>
                  {value}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={isSaving || isTableMissing}
                    aria-label={`${value} 삭제`}
                    title="삭제"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:border-rose-700 hover:text-rose-300 disabled:opacity-50"
                    onClick={() => void handleRemove(value)}
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit ? (
        <form className="flex items-center gap-2 border-t border-slate-800 pt-3 text-xs" onSubmit={handleAdd}>
          <Input
            value={draft}
            aria-label={`${OPTION_LIST_LABELS[listKey]} 새 값`}
            placeholder="+ 새 값"
            disabled={isSaving || isTableMissing}
            onChange={(event) => setDraft(event.target.value)}
            className="h-8 min-w-0 flex-1 border-slate-700 bg-slate-900 text-xs"
          />
          <Button type="submit" disabled={!canAdd} className="h-8 shrink-0 bg-indigo-600 text-xs hover:bg-indigo-500">
            {isSaving ? "저장 중…" : "추가"}
          </Button>
        </form>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          className="h-8 border-slate-700 text-xs text-slate-200"
          onClick={onClose}
        >
          닫기
        </Button>
      </div>
    </DialogContent>
  );
}
