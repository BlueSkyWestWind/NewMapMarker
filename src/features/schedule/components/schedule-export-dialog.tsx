"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import { fetchScheduleRange } from "@/features/schedule/api";
import { computeMonthScale, MONTH_MIN_WEEK_HEIGHT_PT } from "@/features/schedule/lib/month-layout";
import {
  addDays,
  isValidIso,
  isValidMonth,
  monthGridDates,
  monthOf,
  weekStartsOf,
} from "@/features/schedule/lib/week";
import { computeWeeklyScale, type PaperSize } from "@/features/schedule/lib/weekly-layout";
import { useToast } from "@/hooks/use-toast";

type ExportMode = "weekly" | "monthly" | "data" | "image";

const MODE_LABEL: Record<ExportMode, string> = {
  weekly: "주간 배포용",
  monthly: "월간 배포용",
  data: "일정표_New 형식",
  image: "이미지(PNG)",
};
const MODE_HINT: Record<ExportMode, string> = {
  weekly: "주마다 한 쪽, 쪽마다 팀 머리글이 반복되는 배포 양식입니다.",
  monthly: "한 달을 한 쪽 달력으로 담는 배포 양식입니다.",
  data: "엑셀 일정표와 같은 열 구성입니다. 다시 가져올 수 있습니다.",
  image: "지금 화면의 일정표(주간·월간 보기 그대로)를 그림 한 장으로 저장합니다. 가려진 부분까지 모두 담깁니다.",
};
const MAX_WEEKS = 12;
const MAX_DATA_DAYS = 366;
/** 미리보기용 어림값: 칸이 많지 않은 한 주(7일 × 10행). */
const TYPICAL_WEEK_ROWS = 70;
const DEFAULT_COLUMN_COUNT = 10;
const SELECT_CLASS =
  "h-8 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100";
const FIELD_CLASS = "h-8 border-slate-700 bg-slate-900 text-xs";

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}

interface ScheduleExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 기본값: 현재 주의 월요일 */
  defaultFrom: string;
  /** 기본값: 현재 주의 일요일 */
  defaultTo: string;
  /** 미리보기 확대율 어림에 쓰는 팀 열 수 */
  columnCount?: number;
  /** 이미지로 저장할 일정표 요소. 없거나 `null`이면 이미지 저장을 쓸 수 없다 */
  getCaptureTarget?: () => HTMLElement | null;
  /** 이미지 맨 위에 넣는 제목(예: 시설일정 2026-11-02 ~ 2026-11-15) */
  captureTitle?: string;
}

export function ScheduleExportDialog({
  open,
  onOpenChange,
  defaultFrom,
  defaultTo,
  columnCount = DEFAULT_COLUMN_COUNT,
  getCaptureTarget,
  captureTitle = "시설일정",
}: ScheduleExportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <ExportBody
          defaultFrom={defaultFrom}
          defaultTo={defaultTo}
          columnCount={columnCount}
          getCaptureTarget={getCaptureTarget}
          captureTitle={captureTitle}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}

function ExportBody({
  defaultFrom,
  defaultTo,
  columnCount,
  getCaptureTarget,
  captureTitle,
  onClose,
}: {
  defaultFrom: string;
  defaultTo: string;
  columnCount: number;
  getCaptureTarget?: () => HTMLElement | null;
  captureTitle: string;
  onClose: () => void;
}) {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const [mode, setMode] = useState<ExportMode>("weekly");
  const [startDate, setStartDate] = useState(defaultFrom);
  const [weeks, setWeeks] = useState(1);
  const [paper, setPaper] = useState<PaperSize>("A3");
  const [month, setMonth] = useState(monthOf(defaultFrom));
  const [dataFrom, setDataFrom] = useState(defaultFrom);
  const [dataTo, setDataTo] = useState(defaultTo);
  const [isBusy, setIsBusy] = useState(false);

  const weekStarts = isValidIso(startDate) ? weekStartsOf(startDate, weeks) : [];
  const monthValid = isValidMonth(month);
  const dataDays =
    isValidIso(dataFrom) && isValidIso(dataTo) ? daysBetween(dataFrom, dataTo) : 0;

  let summary = "";
  let blocked = "";
  if (mode === "weekly") {
    if (weekStarts.length === 0) blocked = "시작 날짜를 입력해 주세요.";
    else {
      const scale = computeWeeklyScale({
        paper,
        columnCount,
        weekRowCounts: [TYPICAL_WEEK_ROWS],
      });
      summary = `${weeks}주 · ${weekStarts[0]} ~ ${addDays(weekStarts[weekStarts.length - 1], 6)} · 확대율 약 ${scale}% (일정이 많으면 더 작아질 수 있습니다)`;
    }
  } else if (mode === "monthly") {
    if (!monthValid) blocked = "월을 선택해 주세요.";
    else {
      const weekCount = monthGridDates(month).length / 7;
      const scale = computeMonthScale({
        paper,
        weekHeightsPt: Array(weekCount).fill(MONTH_MIN_WEEK_HEIGHT_PT),
      });
      summary = `${month.replace("-", "년 ")}월 · ${weekCount}주 · 확대율 최대 약 ${scale}% (일정이 많으면 더 작아질 수 있습니다)`;
    }
  } else if (mode === "image") {
    if (!getCaptureTarget) blocked = "이 보기에서는 이미지로 저장할 수 없습니다.";
    else summary = captureTitle;
  } else if (dataDays <= 0) {
    blocked = "시작일과 종료일을 확인해 주세요(종료일이 시작일보다 빠를 수 없습니다).";
  } else if (dataDays > MAX_DATA_DAYS) {
    blocked = `기간은 최대 ${MAX_DATA_DAYS}일까지입니다.`;
  } else {
    summary = `${dataFrom} ~ ${dataTo} · ${dataDays}일`;
  }

  const handleDownload = async () => {
    if (blocked) return;
    if (mode === "image") {
      const target = getCaptureTarget?.();
      if (!target) {
        toast({ title: "저장할 일정표를 찾지 못했습니다", variant: "destructive" });
        return;
      }
      setIsBusy(true);
      try {
        // html2canvas는 이 시점에 처음 불러온다(홈 번들에 넣지 않는다).
        const capture = await import("@/features/schedule/lib/capture-schedule-image");
        const blob = await capture.captureScheduleImage(target, captureTitle);
        capture.downloadBlob(blob, `${captureTitle.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_")}.png`);
        toast({ title: "이미지를 저장했습니다" });
        onClose();
      } catch (error) {
        toast({
          title: "이미지를 저장하지 못했습니다",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      } finally {
        setIsBusy(false);
      }
      return;
    }
    if (!supabase) return;
    setIsBusy(true);
    try {
      // exceljs는 이 시점에 처음 불러온다(홈 번들에 넣지 않는다).
      const writers = await import("@/features/schedule/lib/write-workbook");
      if (mode === "weekly") {
        const last = addDays(weekStarts[weekStarts.length - 1], 6);
        const range = await fetchScheduleRange(supabase, weekStarts[0], last);
        await writers.downloadWeeklyWorkbook({
          ...range,
          weekStarts,
          paper,
          fileName: `시설일정_주간_${weekStarts[0]}_${weeks}주.xlsx`,
        });
      } else if (mode === "monthly") {
        const dates = monthGridDates(month);
        const range = await fetchScheduleRange(supabase, dates[0], dates[dates.length - 1]);
        await writers.downloadMonthlyWorkbook({
          ...range,
          month,
          paper,
          fileName: `시설일정_월간_${month}.xlsx`,
        });
      } else {
        const range = await fetchScheduleRange(supabase, dataFrom, dataTo);
        const dates = Array.from({ length: dataDays }, (_, i) => addDays(dataFrom, i));
        await writers.downloadDataWorkbook({
          ...range,
          dates,
          fileName: `시설일정_${dataFrom}_${dataTo}.xlsx`,
        });
      }
      toast({ title: "엑셀 파일을 내려받았습니다" });
      onClose();
    } catch (error) {
      toast({
        title: "내려받지 못했습니다",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <DialogContent className="flex max-w-lg flex-col gap-3 p-5">
      <DialogTitle className="text-base">내보내기</DialogTitle>
      <DialogDescription className="sr-only">
        시설일정을 엑셀 파일이나 이미지로 내려받습니다.
      </DialogDescription>

      <div className="flex flex-col gap-1.5 text-xs" role="radiogroup" aria-label="내려받기 방식">
        {(Object.keys(MODE_LABEL) as ExportMode[]).map((key) => (
          <label
            key={key}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5",
              mode === key ? "border-indigo-400 bg-indigo-500/10" : "border-slate-700 hover:bg-slate-800/60",
            )}
          >
            <input
              type="radio"
              name="export-mode"
              checked={mode === key}
              onChange={() => setMode(key)}
              className="mt-0.5"
            />
            <span>
              <span className="block font-semibold">{MODE_LABEL[key]}</span>
              <span className="block text-[11px] text-slate-400">{MODE_HINT[key]}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        {mode === "weekly" ? (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-slate-300">시작 날짜(그 주의 월요일부터)</span>
              <DatePicker
                value={startDate}
                onChange={setStartDate}
                ariaLabel="시작 날짜(그 주의 월요일부터)"
                className={FIELD_CLASS}
              />
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-slate-300">주 수(1~{MAX_WEEKS})</span>
              <Input
                type="number"
                min={1}
                max={MAX_WEEKS}
                value={weeks}
                onChange={(event) =>
                  setWeeks(Math.min(MAX_WEEKS, Math.max(1, Number(event.target.value) || 1)))
                }
                className={FIELD_CLASS}
              />
            </label>
          </>
        ) : null}
        {mode === "monthly" ? (
          <div className="col-span-1 flex flex-col gap-1">
            <span className="text-slate-300">월</span>
            <DatePicker
              mode="month"
              value={month}
              onChange={setMonth}
              ariaLabel="월"
              className={FIELD_CLASS}
            />
          </div>
        ) : null}
        {mode === "data" ? (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-slate-300">시작일</span>
              <DatePicker
                value={dataFrom}
                onChange={setDataFrom}
                ariaLabel="시작일"
                className={FIELD_CLASS}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-slate-300">종료일</span>
              <DatePicker
                value={dataTo}
                onChange={setDataTo}
                ariaLabel="종료일"
                className={FIELD_CLASS}
              />
            </div>
          </>
        ) : mode === "image" ? null : (
          <label className="flex flex-col gap-1">
            <span className="text-slate-300">용지(가로)</span>
            <select
              value={paper}
              onChange={(event) => setPaper(event.target.value as PaperSize)}
              className={SELECT_CLASS}
            >
              <option value="A3">A3</option>
              <option value="A4">A4</option>
            </select>
          </label>
        )}
      </div>

      {blocked ? <p className="text-[11px] text-amber-400">{blocked}</p> : null}
      {!blocked && summary ? <p className="text-[11px] text-slate-400">{summary}</p> : null}

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
          disabled={isBusy || blocked !== ""}
          className="h-8 bg-indigo-600 text-xs hover:bg-indigo-500"
          onClick={handleDownload}
        >
          {isBusy ? "준비 중…" : "내려받기"}
        </Button>
      </div>
    </DialogContent>
  );
}
