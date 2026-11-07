"use client";

import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { createScheduleFreeze, deleteScheduleFreeze } from "@/features/schedule/api";
import { useScheduleFreezes } from "@/features/schedule/hooks/use-schedule-freezes";
import { FREEZE_REASON_MAX_LENGTH, validateFreeze } from "@/features/schedule/lib/freeze";
import { todayIso, weekdayLabel } from "@/features/schedule/lib/week";
import { useToast } from "@/hooks/use-toast";

const FIELD_CLASS = "h-8 border-slate-700 bg-slate-900 text-xs";

const ERROR_TEXT = {
  date: "시작과 종료 날짜·시각을 모두 올바르게 입력해 주세요.",
  order: "종료는 시작보다 늦어야 합니다.",
  reason: `사유를 적어 주세요(${FREEZE_REASON_MAX_LENGTH}자까지).`,
} as const;

interface ScheduleFreezeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
}

/** `2026-11-19T08:10` → `11-19(목) 08:10` */
function formatPoint(local: string): string {
  const date = local.slice(0, 10);
  return `${date.slice(5)}(${weekdayLabel(date)}) ${local.slice(11)}`;
}

/**
 * 작업금지(프리징) 기간 창. 추가·삭제하면 `refresh`가 작업금지 조회를 모두 무효화해 일정표 배지도 새로 그려진다. 수능처럼 작업을 못 하는 기간을 몇 월 며칠 몇 시부터 몇 월 며칠 몇 시까지로 정하고
 * 사유를 적는다. 일정표의 해당 날짜에 `⛔ 사유 시간대`로 표시만 하고 일정 입력을 막지는 않는다.
 * 지난 기간은 목록에 나오지 않는다(오늘 이후에 끝나는 기간만).
 */
export function ScheduleFreezeDialog({ open, onOpenChange, canEdit }: ScheduleFreezeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <FreezeForm canEdit={canEdit} onClose={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

/**
 * 날짜는 프로젝트 공통 달력(`DatePicker`)으로, 시각은 같은 모양의 시각 선택기(`TimePicker`)로 받는다.
 * 값은 한국 시각 `yyyy-mm-ddTHH:mm` 문자열이다.
 */
function DateTimeField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-slate-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <DatePicker
          value={date}
          disabled={disabled}
          ariaLabel={`${label} 날짜`}
          onChange={(nextDate) => onChange(`${nextDate}T${time || "00:00"}`)}
          className={cn(FIELD_CLASS, "min-w-0 flex-1")}
        />
        <TimePicker
          value={time}
          disabled={disabled}
          ariaLabel={`${label} 시각`}
          onChange={(nextTime) => onChange(`${date}T${nextTime}`)}
          className="w-28 shrink-0"
        />
      </div>
    </div>
  );
}

function FreezeForm({ canEdit, onClose }: { canEdit: boolean; onClose: () => void }) {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const today = todayIso();
  const { freezes, isTableMissing, isLoading, error, refresh } = useScheduleFreezes({ from: today });
  const [start, setStart] = useState(`${today}T00:00`);
  const [end, setEnd] = useState(`${today}T23:59`);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !canEdit) return;
    const check = validateFreeze({ start, end, reason });
    if (!check.ok) {
      setNotice(ERROR_TEXT[check.error]);
      return;
    }
    setNotice("");
    setIsSaving(true);
    try {
      await createScheduleFreeze(supabase, check.value);
      setReason("");
      await refresh();
      toast({ title: "작업금지 기간을 추가했습니다" });
    } catch (saveError) {
      toast({
        title: "추가하지 못했습니다",
        description: saveError instanceof Error ? saveError.message : String(saveError),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!supabase || !canEdit) return;
    setIsSaving(true);
    try {
      await deleteScheduleFreeze(supabase, id);
      await refresh();
    } catch (deleteError) {
      toast({
        title: "삭제하지 못했습니다",
        description: deleteError instanceof Error ? deleteError.message : String(deleteError),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DialogContent className="flex max-h-[92vh] max-w-xl flex-col gap-3 overflow-y-auto p-5">
      <DialogTitle className="text-base">작업금지(프리징) 기간</DialogTitle>
      <DialogDescription className="text-xs text-slate-400">
        작업을 못 하는 기간입니다. 일정표의 해당 날짜에 표시만 하고 일정 입력을 막지는 않습니다.
      </DialogDescription>

      {isTableMissing ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-xs text-amber-400">
            DB에 작업금지 테이블이 없습니다. 마이그레이션(20261110000000_schedule_freezes.sql)을 Supabase에 적용해 주세요.
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-8 border-slate-700 text-xs text-slate-200"
            onClick={() => void refresh()}
          >
            다시 확인
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-slate-300">등록된 기간 (오늘 이후)</span>
            {error ? (
              <p className="text-xs text-rose-400">
                불러오지 못했습니다. {error instanceof Error ? error.message : ""}
              </p>
            ) : isLoading ? (
              <p className="text-xs text-slate-400">불러오는 중…</p>
            ) : freezes.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-700 p-3 text-[11px] text-slate-400">
                등록된 작업금지 기간이 없습니다.
              </p>
            ) : (
              <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
                {freezes.map((freeze) => (
                  <li
                    key={freeze.id}
                    className="flex items-center gap-2 rounded-md border border-slate-800 px-2.5 py-1.5 text-xs"
                  >
                    <span className="shrink-0 whitespace-nowrap font-semibold text-rose-300">
                      {formatPoint(freeze.start)} ~ {formatPoint(freeze.end)}
                    </span>
                    <span className="min-w-0 flex-1 truncate whitespace-nowrap" title={freeze.reason}>
                      {freeze.reason}
                    </span>
                    {canEdit ? (
                      <button
                        type="button"
                        disabled={isSaving}
                        aria-label="이 기간 삭제"
                        title="삭제"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:border-rose-700 hover:text-rose-300 disabled:opacity-50"
                        onClick={() => void handleDelete(freeze.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canEdit ? (
            <form className="flex flex-col gap-2 border-t border-slate-800 pt-3 text-xs" onSubmit={handleAdd}>
              <span className="text-slate-300">기간 추가</span>
              <div className="grid grid-cols-2 gap-3">
                <DateTimeField label="시작 (몇 일 몇 시부터)" value={start} disabled={isSaving} onChange={setStart} />
                <DateTimeField label="종료 (몇 일 몇 시까지)" value={end} disabled={isSaving} onChange={setEnd} />
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-slate-400">사유</span>
                <Input
                  value={reason}
                  maxLength={FREEZE_REASON_MAX_LENGTH}
                  disabled={isSaving}
                  placeholder="예: 수능"
                  onChange={(event) => setReason(event.target.value)}
                  className={FIELD_CLASS}
                />
              </label>
              {notice ? <p className="text-[11px] text-amber-400">{notice}</p> : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 border-slate-700 text-xs text-slate-200"
                  onClick={onClose}
                >
                  닫기
                </Button>
                <Button type="submit" disabled={isSaving} className="h-8 bg-indigo-600 text-xs hover:bg-indigo-500">
                  {isSaving ? "저장 중…" : "추가"}
                </Button>
              </div>
            </form>
          ) : (
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
          )}
        </>
      )}
    </DialogContent>
  );
}
