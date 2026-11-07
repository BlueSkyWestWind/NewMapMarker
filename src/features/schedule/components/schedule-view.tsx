"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { moveScheduleCell } from "@/features/schedule/api";
import { planDrop } from "@/features/schedule/lib/cell-grid";
import { buildMonthModel } from "@/features/schedule/lib/month-layout";
import {
  addDays,
  addMonths,
  isValidIso,
  isValidMonth,
  monthGridDates,
  monthOf,
  todayIso,
  weekDatesOf,
  weekStartOf,
} from "@/features/schedule/lib/week";
import { useScheduleRange } from "@/features/schedule/hooks/use-schedule-range";
import type {
  CellPosition,
  ScheduleCell,
  ScheduleColumn,
} from "@/features/schedule/types";
import { useToast } from "@/hooks/use-toast";
import { ScheduleCellDialog, type CellEditorState } from "./schedule-cell-dialog";
import { ScheduleColumnDialog } from "./schedule-column-dialog";
import { ScheduleDayDialog } from "./schedule-day-dialog";
import { ScheduleExportDialog } from "./schedule-export-dialog";
import { ScheduleGrid } from "./schedule-grid";
import { ScheduleImportDialog } from "./schedule-import-dialog";
import { ScheduleLegend } from "./schedule-legend";
import { ScheduleMonthGrid } from "./schedule-month-grid";

type ScheduleView = "week" | "month";

const TABLE_MISSING_MESSAGE =
  "DB에 시설일정 테이블이 없습니다. 마이그레이션(20261108000000_facility_schedule.sql)을 Supabase에 적용해 주세요.";

/**
 * 시설일정 화면. 지도 자리(오른쪽 전체)를 차지한다. 주간(관리자 수정)과 월간(월 달력, 조회 전용)을 전환한다.
 * 부모(`main`)가 `relative`이므로 `absolute inset-0`으로 영역을 채운다.
 */
export function ScheduleView() {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const [view, setView] = useState<ScheduleView>("week");
  const [weekStart, setWeekStart] = useState(() => weekStartOf(todayIso()));
  const [month, setMonth] = useState(() => monthOf(todayIso()));
  const [cellEditor, setCellEditor] = useState<CellEditorState | null>(null);
  const [columnEditor, setColumnEditor] = useState<ScheduleColumn | null>(null);
  const [dayEditor, setDayEditor] = useState<string | null>(null);
  const [isExportOpen, setExportOpen] = useState(false);
  const [isImportOpen, setImportOpen] = useState(false);

  const weekDates = useMemo(() => weekDatesOf(weekStart), [weekStart]);
  const monthDates = useMemo(() => monthGridDates(month), [month]);
  const weekData = useScheduleRange(weekStart, weekDates[6], view === "week");
  const monthData = useScheduleRange(
    monthDates[0],
    monthDates[monthDates.length - 1],
    view === "month",
  );
  const data = view === "week" ? weekData : monthData;
  const { isAdmin } = data;

  const monthModel = useMemo(
    () =>
      buildMonthModel({
        month,
        columns: monthData.columns,
        cells: monthData.cells,
        dayNotes: monthData.dayNotes,
        marks: monthData.marks,
      }),
    [month, monthData.columns, monthData.cells, monthData.dayNotes, monthData.marks],
  );

  const goPrev = () =>
    view === "week" ? setWeekStart(addDays(weekStart, -7)) : setMonth(addMonths(month, -1));
  const goNext = () =>
    view === "week" ? setWeekStart(addDays(weekStart, 7)) : setMonth(addMonths(month, 1));
  const goToday = () => {
    setWeekStart(weekStartOf(todayIso()));
    setMonth(monthOf(todayIso()));
  };

  const handleDropCell = async (dragged: ScheduleCell, target: CellPosition) => {
    if (!supabase || !isAdmin) return;
    const plan = planDrop(weekData.cells, dragged, target);
    if (plan.kind === "none") return;
    try {
      await moveScheduleCell(supabase, dragged.id, target);
      await weekData.refresh();
    } catch (error) {
      toast({
        title: "옮기지 못했습니다",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  const openCellEditor = (cell: ScheduleCell | null, position: CellPosition) =>
    setCellEditor({ cell, position });

  const markOfEditor = cellEditor
    ? (weekData.marks.find(
        (mark) =>
          mark.workDate === cellEditor.position.workDate &&
          mark.columnId === cellEditor.position.columnId,
      )?.color ?? null)
    : null;

  const rangeLabel =
    view === "week"
      ? `${weekDates[0]} ~ ${weekDates[6]}`
      : `${month.replace("-", "년 ")}월`;

  return (
    <section
      className="absolute inset-0 flex flex-col gap-2 overflow-hidden bg-slate-950 p-4 text-slate-100"
      aria-label="시설일정"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="shrink-0 whitespace-nowrap text-base font-semibold">시설일정</h1>

        <div className="flex overflow-hidden rounded-md border border-slate-700" role="group" aria-label="보기">
          {(["week", "month"] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={cn(
                "h-8 whitespace-nowrap px-3 text-xs",
                view === key ? "bg-indigo-600 text-white" : "text-slate-200 hover:bg-slate-800",
              )}
            >
              {key === "week" ? "주간" : "월간"}
            </button>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 border-slate-700"
          aria-label={view === "week" ? "이전 주" : "이전 달"}
          onClick={goPrev}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-8 border-slate-700 px-3 text-xs"
          onClick={goToday}
        >
          오늘
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 border-slate-700"
          aria-label={view === "week" ? "다음 주" : "다음 달"}
          onClick={goNext}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
        <span className="whitespace-nowrap text-sm font-semibold text-slate-100">{rangeLabel}</span>
        {view === "week" ? (
          <Input
            type="date"
            aria-label="날짜로 이동"
            value={weekStart}
            onChange={(event) =>
              isValidIso(event.target.value) && setWeekStart(weekStartOf(event.target.value))
            }
            className="h-8 w-36 border-slate-700 bg-slate-900 text-xs"
          />
        ) : (
          <Input
            type="month"
            aria-label="월로 이동"
            value={month}
            onChange={(event) => isValidMonth(event.target.value) && setMonth(event.target.value)}
            className="h-8 w-36 border-slate-700 bg-slate-900 text-xs"
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          {!isAdmin ? (
            <span className="whitespace-nowrap rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300">
              읽기 전용
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="h-8 gap-1.5 border-slate-700 px-3 text-xs"
            onClick={() => setExportOpen(true)}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            내보내기
          </Button>
          {isAdmin ? (
            <Button
              type="button"
              variant="outline"
              className="h-8 gap-1.5 border-slate-700 px-3 text-xs"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="h-3.5 w-3.5" aria-hidden />
              가져오기
            </Button>
          ) : null}
        </div>
      </div>

      <ScheduleLegend />

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {data.isTableMissing ? (
          <p className="p-4 text-sm text-amber-400">{TABLE_MISSING_MESSAGE}</p>
        ) : data.error ? (
          <p className="p-4 text-sm text-rose-400">
            일정을 불러오지 못했습니다.{" "}
            {data.error instanceof Error ? data.error.message : ""}
          </p>
        ) : data.columns.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">
            {data.isLoading ? "불러오는 중..." : "팀 열 설정이 없습니다."}
          </p>
        ) : view === "week" ? (
          <ScheduleGrid
            weekDates={weekDates}
            columns={weekData.columns}
            cells={weekData.cells}
            dayNotes={weekData.dayNotes}
            marks={weekData.marks}
            canEdit={isAdmin}
            onEditCell={openCellEditor}
            onDropCell={handleDropCell}
            onEditColumn={setColumnEditor}
            onEditDay={setDayEditor}
          />
        ) : (
          <ScheduleMonthGrid
            model={monthModel}
            onPickDay={(workDate) => {
              setWeekStart(weekStartOf(workDate));
              setView("week");
            }}
          />
        )}
      </div>

      <ScheduleCellDialog
        state={cellEditor}
        columns={weekData.columns}
        cells={weekData.cells}
        mark={markOfEditor}
        canEdit={isAdmin}
        onClose={() => setCellEditor(null)}
        onSaved={() => void weekData.refresh()}
      />
      <ScheduleColumnDialog
        column={columnEditor}
        onClose={() => setColumnEditor(null)}
        onSaved={() => void weekData.refresh()}
      />
      <ScheduleDayDialog
        workDate={dayEditor}
        note={
          dayEditor
            ? (weekData.dayNotes.find((entry) => entry.workDate === dayEditor)?.note ?? "")
            : ""
        }
        canEdit={isAdmin}
        onClose={() => setDayEditor(null)}
        onSaved={() => void weekData.refresh()}
      />
      <ScheduleExportDialog
        open={isExportOpen}
        onOpenChange={setExportOpen}
        defaultFrom={weekDates[0]}
        defaultTo={weekDates[6]}
        columnCount={weekData.columns.length || undefined}
      />
      <ScheduleImportDialog
        open={isImportOpen}
        onOpenChange={setImportOpen}
        columns={weekData.columns}
        onImported={(firstDate) => {
          setView("week");
          setWeekStart(weekStartOf(firstDate));
          void weekData.refresh();
        }}
      />
    </section>
  );
}
