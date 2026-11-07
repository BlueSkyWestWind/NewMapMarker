"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { applyScheduleImport } from "@/features/schedule/api";
import { readScheduleWorkbook, type ReadScheduleResult } from "@/features/schedule/lib/read-schedule";
import { matchColumns, planImport } from "@/features/schedule/lib/schedule-excel";
import { isValidIso } from "@/features/schedule/lib/week";
import type { ScheduleColumn } from "@/features/schedule/types";
import { useToast } from "@/hooks/use-toast";

interface ScheduleImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ScheduleColumn[];
  /** 가져오기가 끝난 뒤. 가져온 첫 날짜를 넘겨 일정표가 그 주로 이동하게 한다. */
  onImported: (firstDate: string) => void;
}

/** 엑셀 `일정표_New`를 읽어 미리 보고, 확인하면 날짜 범위를 덮어쓴다. 관리자 전용. */
export function ScheduleImportDialog({
  open,
  onOpenChange,
  columns,
  onImported,
}: ScheduleImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <ImportBody columns={columns} onClose={() => onOpenChange(false)} onImported={onImported} />
      ) : null}
    </Dialog>
  );
}

function ImportBody({
  columns,
  onClose,
  onImported,
}: {
  columns: ScheduleColumn[];
  onClose: () => void;
  onImported: (firstDate: string) => void;
}) {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const [result, setResult] = useState<ReadScheduleResult | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const parsed = result && !("error" in result) ? result.parsed : null;
  const plan = useMemo(
    () => (parsed && isValidIso(fromDate) ? planImport(parsed, columns, fromDate) : null),
    [parsed, columns, fromDate],
  );
  const unmatchedColumns = useMemo(
    () => (parsed ? matchColumns(parsed.columns, columns).filter((id) => id === null).length : 0),
    [parsed, columns],
  );

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsReading(true);
    setConfirming(false);
    try {
      const read = await readScheduleWorkbook(file);
      setResult(read);
      if (!("error" in read) && read.parsed.firstDate) setFromDate(read.parsed.firstDate);
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "파일을 읽지 못했습니다." });
    } finally {
      setIsReading(false);
    }
  };

  const handleApply = async () => {
    if (!supabase || !plan) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setIsApplying(true);
    try {
      const { count, warning } = await applyScheduleImport(supabase, plan);
      toast(
        warning
          ? { title: `${count}칸을 가져왔습니다`, description: warning, variant: "destructive" }
          : { title: `${count}칸을 가져왔습니다` },
      );
      onImported(plan.deleteFrom);
      onClose();
    } catch (error) {
      toast({
        title: "가져오지 못했습니다",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
      setConfirming(false);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <DialogContent className="flex max-w-lg flex-col gap-3 p-5">
      <DialogTitle className="text-base">엑셀에서 가져오기</DialogTitle>
      <DialogDescription className="sr-only">
        엑셀 일정표를 읽어 날짜 범위의 일정을 덮어씁니다.
      </DialogDescription>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-slate-300">엑셀 파일(.xlsx, 시트 이름 일정표_New)</span>
        <input
          type="file"
          accept=".xlsx,.xlsm"
          disabled={isReading || isApplying}
          onChange={handleFile}
          className="text-xs text-slate-200 file:mr-3 file:rounded-md file:border file:border-slate-700 file:bg-slate-900 file:px-3 file:py-1 file:text-xs file:text-slate-200"
        />
      </label>
      {isReading ? <p className="text-[11px] text-slate-400">파일을 읽는 중…</p> : null}

      {result && "error" in result ? (
        <p className="text-[11px] text-rose-400">{result.error}</p>
      ) : null}

      {parsed && result && !("error" in result) ? (
        <div className="flex flex-col gap-2 text-xs">
          <ul className="space-y-0.5 rounded-md border border-slate-800 bg-slate-900/60 p-2.5 text-[11px] text-slate-300">
            <li>시트: {result.sheetName}</li>
            <li>
              기간: {parsed.firstDate} ~ {parsed.lastDate} ({parsed.dayCount}일)
            </li>
            <li>
              일정 {parsed.cells.length}칸 · 날짜 메모 {parsed.dayNotes.length}개 · 칸 색{" "}
              {parsed.marks.length}개 · 글자색 {parsed.cells.filter((cell) => cell.textColor).length}칸
            </li>
            {parsed.ignoredCount > 0 ? <li>무시한 값 {parsed.ignoredCount}개(기호만 있는 칸 등)</li> : null}
            {unmatchedColumns > 0 ? (
              <li className="text-amber-400">
                {unmatchedColumns}개 열은 대응하는 팀 열이 없어 건너뜁니다.
              </li>
            ) : null}
          </ul>

          <label className="flex flex-col gap-1">
            <span className="text-slate-300">가져오기 시작일(이 날짜부터만 덮어씁니다)</span>
            <Input
              type="date"
              value={fromDate}
              onChange={(event) => {
                setFromDate(event.target.value);
                setConfirming(false);
              }}
              className="h-8 border-slate-700 bg-slate-900 text-xs"
            />
          </label>

          {plan ? (
            <p className="rounded-md border border-rose-900 bg-rose-950/40 p-2.5 text-[11px] text-rose-200">
              {plan.deleteFrom} ~ {plan.deleteTo} 기간의 기존 일정(칸·날짜 메모·색)이 지워지고{" "}
              {plan.inserts.length}칸으로 바뀝니다.
              {plan.skippedCount > 0 ? ` (${plan.skippedCount}건은 건너뜁니다)` : ""}
            </p>
          ) : (
            <p className="text-[11px] text-amber-400">시작일 이후 가져올 일정이 없습니다.</p>
          )}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-8 border-slate-700 text-xs text-slate-200"
          onClick={onClose}
        >
          닫기
        </Button>
        <Button
          type="button"
          disabled={!plan || isApplying || isReading}
          className="h-8 bg-rose-600 text-xs hover:bg-rose-500"
          onClick={handleApply}
        >
          {isApplying
            ? "가져오는 중…"
            : confirming
              ? "정말 덮어쓰시겠습니까? 다시 눌러 실행"
              : "가져오기"}
        </Button>
      </div>
    </DialogContent>
  );
}
