"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fetchScheduleCells } from "@/features/schedule/api";
import { useScheduleWrite } from "@/features/schedule/hooks/use-schedule-write";
import { MAX_ROWS } from "@/features/schedule/lib/cell-grid";
import {
  buildDatePairs,
  buildWeekPairs,
  formatCopyPreview,
  planCopy,
  type CopyMode,
} from "@/features/schedule/lib/copy-plan";
import { NOTE_COLUMN_LABEL } from "@/features/schedule/lib/day-stations";
import {
  applyOpsToGroups,
  snapshotGroups,
  type WriteOp,
} from "@/features/schedule/lib/group-state";
import {
  addDays,
  isValidIso,
  weekDatesOf,
  weekdayLabel,
  weekStartOf,
} from "@/features/schedule/lib/week";
import type { ScheduleColumn } from "@/features/schedule/types";
import { useToast } from "@/hooks/use-toast";
import { useAuthSession } from "@/lib/auth/use-auth-session";

interface ScheduleCopyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ScheduleColumn[];
  defaultDate: string;
  onSaved: () => void;
}

type CopyKind = "date" | "week";

const MAX_TARGET_DATES = 31;
const MAX_WEEKS = 8;

function clampWeeks(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_WEEKS, Math.max(1, Math.floor(n)));
}

/**
 * 일정 복제 창. 날짜 하나 또는 주 전체를 다른 날짜·다음 N주에 복제한다.
 * 시행 결과·날짜 메모·칸 색은 복제하지 않는다.
 */
export function ScheduleCopyDialog({
  open,
  onOpenChange,
  columns,
  defaultDate,
  onSaved,
}: ScheduleCopyDialogProps) {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const scheduleWrite = useScheduleWrite();

  const [kind, setKind] = useState<CopyKind>("date");
  const [sourceDate, setSourceDate] = useState(defaultDate);
  const [targetDates, setTargetDates] = useState<string[]>([]);
  const [pickerDate, setPickerDate] = useState(() => addDays(defaultDate, 1));
  const [sourceWeekDate, setSourceWeekDate] = useState(defaultDate);
  const [weeksRaw, setWeeksRaw] = useState("1");
  const [excludedColumnIds, setExcludedColumnIds] = useState<Set<string>>(() => new Set());
  const [mode, setMode] = useState<CopyMode>("skip");
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setNotice(null);
    setSourceDate(defaultDate);
    setPickerDate(addDays(defaultDate, 1));
    setSourceWeekDate(defaultDate);
  }, [open, defaultDate]);

  const weekCount = clampWeeks(weeksRaw);

  const pairs = useMemo(() => {
    if (kind === "date") {
      if (!isValidIso(sourceDate)) return [];
      return buildDatePairs(sourceDate, targetDates);
    }
    if (!isValidIso(sourceWeekDate)) return [];
    return buildWeekPairs(sourceWeekDate, weekCount);
  }, [kind, sourceDate, targetDates, sourceWeekDate, weekCount]);

  const sourceDates = useMemo(() => {
    if (kind === "date") return isValidIso(sourceDate) ? [sourceDate] : [];
    return isValidIso(sourceWeekDate) ? weekDatesOf(weekStartOf(sourceWeekDate)) : [];
  }, [kind, sourceDate, sourceWeekDate]);

  const { minDate, maxDate } = useMemo(() => {
    const all = [...sourceDates, ...pairs.map((pair) => pair.to)].filter(isValidIso).sort();
    if (all.length === 0) return { minDate: "", maxDate: "" };
    return { minDate: all[0], maxDate: all[all.length - 1] };
  }, [sourceDates, pairs]);

  const rangeQuery = useQuery({
    queryKey: ["schedule-copy-range", minDate, maxDate],
    queryFn: () => fetchScheduleCells(supabase!, minDate, maxDate),
    enabled: open && Boolean(supabase) && minDate !== "" && maxDate !== "",
    staleTime: 30_000,
  });

  const sourceColumns = useMemo(() => {
    const cells = rangeQuery.data ?? [];
    const sourceSet = new Set(sourceDates);
    const activeColumnIds = new Set(
      cells.filter((cell) => sourceSet.has(cell.workDate)).map((cell) => cell.columnId),
    );
    return [...columns]
      .filter(
        (column) =>
          column.teamLabel.trim() !== NOTE_COLUMN_LABEL && activeColumnIds.has(column.id),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [columns, rangeQuery.data, sourceDates]);

  const selectedColumnIds = useMemo(
    () => sourceColumns.filter((col) => !excludedColumnIds.has(col.id)).map((col) => col.id),
    [sourceColumns, excludedColumnIds],
  );

  const previewPlan = useMemo(() => {
    if (pairs.length === 0 || selectedColumnIds.length === 0 || !rangeQuery.data) return null;
    return planCopy({
      pairs,
      columnIds: selectedColumnIds,
      mode,
      cells: rangeQuery.data,
      maxRows: MAX_ROWS,
    });
  }, [pairs, selectedColumnIds, mode, rangeQuery.data]);

  const previewText = useMemo(() => {
    if (!previewPlan) return "";
    return formatCopyPreview(previewPlan.summary);
  }, [previewPlan]);

  const addTargetDate = (next: string) => {
    if (!isValidIso(next) || next === sourceDate) return;
    setNotice(null);
    setTargetDates((prev) => {
      if (prev.includes(next) || prev.length >= MAX_TARGET_DATES) return prev;
      return [...prev, next].sort();
    });
  };

  const removeTargetDate = (target: string) => {
    setNotice(null);
    setTargetDates((prev) => prev.filter((item) => item !== target));
  };

  const toggleColumn = (id: string) => {
    setNotice(null);
    setExcludedColumnIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canCopy =
    !isSaving &&
    pairs.length > 0 &&
    selectedColumnIds.length > 0 &&
    minDate !== "" &&
    maxDate !== "";

  const handleCopy = async () => {
    if (!canCopy || savingRef.current || !supabase) return;
    savingRef.current = true;
    setIsSaving(true);
    setNotice(null);

    try {
      const freshCells = await fetchScheduleCells(supabase, minDate, maxDate);
      const plan = planCopy({
        pairs,
        columnIds: selectedColumnIds,
        mode,
        cells: freshCells,
        maxRows: MAX_ROWS,
      });

      if (plan.creates.length === 0) {
        setNotice("복제할 일정이 없습니다(원본이 비어 있거나 모두 건너뜀)");
        return;
      }

      const ops: WriteOp[] = plan.creates.map((item) => ({
        op: "create",
        position: item.position,
        text: item.text,
      }));
      const after = applyOpsToGroups({ cells: freshCells, ops, arrange: false });
      const before = snapshotGroups(freshCells, after);
      const result = await scheduleWrite.write("복제", before, after, [], []);

      if (result === "ok") {
        const skippedFull = plan.summary.reduce((acc, item) => acc + item.skippedFull, 0);
        toast({
          title: `${plan.creates.length}건을 복제했습니다`,
          description:
            skippedFull > 0 ? `행이 가득 차 ${skippedFull}건은 넣지 못했습니다.` : undefined,
          action: scheduleWrite.createUndoAction(),
          variant: skippedFull > 0 ? "destructive" : undefined,
        });
        onSaved();
        onOpenChange(false);
        return;
      }
      if (result === "stale") {
        setNotice("다른 곳에서 일정이 바뀌었습니다. 새로 고친 뒤 다시 시도하세요");
        return;
      }
      if (result === "legacy") {
        setNotice("DB 함수가 아직 적용되지 않아 복제를 사용할 수 없습니다");
        return;
      }
      setNotice("복제하지 못했습니다. 다시 시도해 주세요");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      toast({
        title: "복제하지 못했습니다",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const sourceWeekStart = isValidIso(sourceWeekDate) ? weekStartOf(sourceWeekDate) : "";
  const sourceWeekEnd = sourceWeekStart ? addDays(sourceWeekStart, 6) : "";

  return (
    <Dialog open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90vh] w-[min(900px,96vw)] max-w-none flex-col gap-3 p-5">
        <DialogTitle className="text-base">일정 복제</DialogTitle>
        <DialogDescription className="text-xs text-slate-400">
          선택한 날짜 또는 주의 일정을 다른 날짜로 복제합니다. 시행 결과·날짜 메모·칸 색은 복제하지 않습니다.
        </DialogDescription>

        <div className="flex items-center gap-4 border-b border-slate-800 pb-2 text-xs text-slate-200">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              name="copy-kind"
              checked={kind === "date"}
              disabled={isSaving}
              onChange={() => {
                setNotice(null);
                setKind("date");
              }}
              className="accent-indigo-500"
            />
            날짜 복제
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              name="copy-kind"
              checked={kind === "week"}
              disabled={isSaving}
              onChange={() => {
                setNotice(null);
                setKind("week");
              }}
              className="accent-indigo-500"
            />
            주 복제
          </label>
        </div>

        {kind === "date" ? (
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 shrink-0 text-slate-400">원본 날짜</span>
              <DatePicker
                ariaLabel="원본 날짜"
                value={sourceDate}
                onChange={(next) => {
                  if (!isValidIso(next)) return;
                  setNotice(null);
                  setSourceDate(next);
                  setTargetDates((prev) => prev.filter((item) => item !== next));
                }}
                className="w-36"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 shrink-0 text-slate-400">대상 날짜</span>
              <DatePicker
                ariaLabel="대상 날짜 선택"
                value={pickerDate}
                onChange={(next) => {
                  if (isValidIso(next)) setPickerDate(next);
                }}
                className="w-36"
              />
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => addTargetDate(pickerDate)}
                className="h-8 border-slate-700 px-2.5 text-xs"
              >
                날짜 추가
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isSaving || !isValidIso(sourceDate)}
                onClick={() => addTargetDate(addDays(sourceDate, 1))}
                className="h-8 border-slate-700 px-2.5 text-xs"
              >
                +1일
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isSaving || !isValidIso(sourceDate)}
                onClick={() => addTargetDate(addDays(sourceDate, 7))}
                className="h-8 border-slate-700 px-2.5 text-xs"
              >
                +7일
              </Button>
              <span className="text-slate-400">({targetDates.length}/{MAX_TARGET_DATES})</span>
            </div>
            {targetDates.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pl-20">
                {targetDates.map((target) => (
                  <span
                    key={target}
                    className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-200"
                  >
                    {target} ({weekdayLabel(target)})
                    <button
                      type="button"
                      aria-label={`${target} 제거`}
                      disabled={isSaving}
                      onClick={() => removeTargetDate(target)}
                      className="text-slate-400 hover:text-slate-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-slate-400">원본 주</span>
            <DatePicker
              ariaLabel="원본 주 날짜"
              value={sourceWeekDate}
              onChange={(next) => {
                if (isValidIso(next)) {
                  setNotice(null);
                  setSourceWeekDate(next);
                }
              }}
              className="w-36"
            />
            {sourceWeekStart ? (
              <span className="text-slate-300">
                ({sourceWeekStart} ~ {sourceWeekEnd})
              </span>
            ) : null}
            <span className="text-slate-400">다음</span>
            <Input
              type="number"
              min={1}
              max={MAX_WEEKS}
              aria-label="복제할 주 수"
              value={weeksRaw}
              disabled={isSaving}
              onChange={(event) => {
                setNotice(null);
                setWeeksRaw(event.target.value);
              }}
              className="h-8 w-16 border-slate-700 bg-slate-900 text-xs"
            />
            <span className="text-slate-400">주 (최대 {MAX_WEEKS}주)</span>
          </div>
        )}

        <div className="flex flex-col gap-1.5 border-t border-slate-800 pt-2 text-xs">
          <span className="text-slate-400">복제할 팀 (원본에 일정이 있는 팀)</span>
          {rangeQuery.isLoading ? (
            <p className="text-slate-400">일정을 불러오는 중...</p>
          ) : sourceColumns.length === 0 ? (
            <p className="text-slate-400">원본 날짜에 일정이 있는 팀이 없습니다.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {sourceColumns.map((column) => (
                <label
                  key={column.id}
                  className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-slate-200"
                >
                  <input
                    type="checkbox"
                    checked={!excludedColumnIds.has(column.id)}
                    disabled={isSaving}
                    onChange={() => toggleColumn(column.id)}
                    className="h-3.5 w-3.5 rounded-sm border-slate-600 bg-slate-900 accent-indigo-500"
                  />
                  {column.teamLabel}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-slate-800 pt-2 text-xs text-slate-200">
          <span className="text-slate-400">대상 팀에 이미 일정이 있으면</span>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              name="copy-mode"
              checked={mode === "skip"}
              disabled={isSaving}
              onChange={() => {
                setNotice(null);
                setMode("skip");
              }}
              className="accent-indigo-500"
            />
            건너뛰기
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              name="copy-mode"
              checked={mode === "append"}
              disabled={isSaving}
              onChange={() => {
                setNotice(null);
                setMode("append");
              }}
              className="accent-indigo-500"
            />
            뒤에 이어 붙이기
          </label>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-800 pt-3">
          {notice ? (
            <p className="rounded border border-rose-700/60 bg-rose-950/50 px-2.5 py-1.5 text-xs text-rose-200">
              {notice}
            </p>
          ) : null}
          {previewText ? (
            <p title={previewText} className="truncate whitespace-nowrap text-right text-xs text-slate-300">
              {previewText}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
              className="h-8 border-slate-700 text-xs text-slate-200"
            >
              닫기
            </Button>
            <Button
              type="button"
              disabled={!canCopy}
              onClick={() => void handleCopy()}
              className="h-8 bg-indigo-600 text-xs hover:bg-indigo-500"
            >
              {isSaving ? "복제 중…" : "복제"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
