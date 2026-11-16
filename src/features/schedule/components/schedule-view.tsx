"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, ChevronLeft, ChevronRight, Copy, Download, ListPlus, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import { arrangeScheduleGroup, fetchScheduleCells, moveScheduleCell } from "@/features/schedule/api";
import {
  filterVisibleScheduleColumns,
  groupOfCell,
  isOptionalScheduleColumn,
  leftoverGroupAfterMove,
  MAX_ROWS,
  planDrop,
  planGroupDrop,
} from "@/features/schedule/lib/cell-grid";
import { freezeBadgesByDate } from "@/features/schedule/lib/freeze";
import { snapshotGroups, type GroupKey } from "@/features/schedule/lib/group-state";
import { buildMonthModel } from "@/features/schedule/lib/month-layout";
import { completionSummary, toggleDone } from "@/features/schedule/lib/quick-result";
import {
  loadDateState,
  loadViewState,
  saveDateState,
  saveViewState,
  VIEW_STATE_KEY,
  type KeyValueStore,
} from "@/features/schedule/lib/view-state";
import {
  addDays,
  addMonths,
  isValidIso,
  isValidMonth,
  monthGridDates,
  monthOf,
  todayIso,
  weekStartOf,
} from "@/features/schedule/lib/week";
import { useScheduleFreezes } from "@/features/schedule/hooks/use-schedule-freezes";
import { useScheduleRange } from "@/features/schedule/hooks/use-schedule-range";
import { useScheduleWrite } from "@/features/schedule/hooks/use-schedule-write";
import { useScheduleJumpStore } from "@/features/schedule/store/use-schedule-jump-store";
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
import { ScheduleFreezeDialog } from "./schedule-freeze-dialog";
import { ScheduleGrid } from "./schedule-grid";
import { ScheduleImportDialog } from "./schedule-import-dialog";
import { ScheduleLegend } from "./schedule-legend";
import { ScheduleMonthGrid } from "./schedule-month-grid";
import { ScheduleArchiveView } from "./schedule-archive-view";
import { ScheduleDayView } from "./schedule-day-view";
import { ScheduleMailView } from "./schedule-mail-view";
import { ScheduleCopyDialog } from "./schedule-copy-dialog";
import { ScheduleUnscheduledDialog } from "./schedule-unscheduled-dialog";
import { ScheduleSectionSwitch } from "./schedule-section-switch";
import { ScheduleSearch } from "./schedule-search";
import { ScheduleViewToggle, type ScheduleViewKind } from "./schedule-view-toggle";

/** 한 번에 볼 수 있는 주 수(1~4)와 달 수(1~3) */
const WEEK_COUNTS = [1, 2, 3, 4];
const MONTH_COUNTS = [1, 2, 3];

const FACILITY_VIEW_KINDS: readonly ScheduleViewKind[] = ["week", "month"];
const DAILY_VIEW_KINDS: readonly ScheduleViewKind[] = ["day", "archive"];

const TABLE_MISSING_MESSAGE =
  "DB에 시설일정 테이블이 없습니다. 마이그레이션(03_facility_schedule.sql)을 Supabase에 적용해 주세요.";

function getLocalStore(): KeyValueStore | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSessionStore(): KeyValueStore | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function truncateCellLabel(cell: ScheduleCell): string {
  const raw = cell.mainText.trim() || cell.subText.trim() || "항목";
  return raw.length > 16 ? `${raw.slice(0, 16)}…` : raw;
}

/**
 * 시설일정 화면. 지도 자리(오른쪽 전체)를 차지한다. 주간(관리자 수정)과 월간(월 달력, 조회 전용)을 전환한다.
 * 부모(`main`)가 `relative`이므로 `absolute inset-0`으로 영역을 채운다.
 */
export function ScheduleView({ section = "facility" }: { section?: "facility" | "daily" | "mail" }) {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const scheduleWrite = useScheduleWrite();
  const [initialViewState] = useState(() => loadViewState(getLocalStore(), new Set()));
  const [initialDateState] = useState(() => loadDateState(getSessionStore(), todayIso()));
  // 시설일정은 주간·월간, 일일일정은 일자별·누적을 보인다. 두 메뉴가 각자 마지막 보기를 기억한다.
  const [facilityView, setFacilityView] = useState<"week" | "month">(initialViewState.facilityView);
  const [dailyView, setDailyView] = useState<"day" | "archive">(initialViewState.dailyView);
  const isDaily = section === "daily";
  // 메일양식은 주간·월간 조회가 필요 없어 일자별과 같이 취급한다(조회 훅이 꺼진다).
  const view: ScheduleViewKind = section === "mail" ? "day" : isDaily ? dailyView : facilityView;
  const setView = (next: ScheduleViewKind) => {
    if (next === "day" || next === "archive") setDailyView(next);
    else setFacilityView(next);
  };
  const [selectedDate, setSelectedDate] = useState(() => initialDateState?.selectedDate ?? todayIso());
  const [weekStart, setWeekStart] = useState(() => initialDateState?.weekStart ?? weekStartOf(todayIso()));
  const [month, setMonth] = useState(() => initialDateState?.month ?? monthOf(todayIso()));
  const [cellEditor, setCellEditor] = useState<CellEditorState | null>(null);
  const [columnEditor, setColumnEditor] = useState<ScheduleColumn | null>(null);
  const [dayEditor, setDayEditor] = useState<string | null>(null);
  const [isExportOpen, setExportOpen] = useState(false);
  const [isFreezeOpen, setFreezeOpen] = useState(false);
  const [isImportOpen, setImportOpen] = useState(false);
  const [isCopyOpen, setCopyOpen] = useState(false);
  const [isUnscheduledOpen, setUnscheduledOpen] = useState(false);
  /** 이미지로 저장할 일정표(스크롤 영역) */
  const gridAreaRef = useRef<HTMLDivElement>(null);
  const [visibleOptionalColumnIds, setVisibleOptionalColumnIds] = useState<Set<string>>(
    () => new Set(),
  );
  const restoredOptionalRef = useRef(false);
  const [highlightCellId, setHighlightCellId] = useState<string | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const scrolledCellIdRef = useRef<string | null>(null);
  const togglingIdsRef = useRef<Set<string>>(new Set());

  // 한 번에 보는 주·달 수(1~3). 다음 주·달 일정을 옮길 때 칸 편집 창을 열지 않고 한 화면에서 끌어 옮기려는 용도다(주 4주, 달 3달까지).
  const [weekCount, setWeekCount] = useState(initialViewState.weekCount);
  const [monthCount, setMonthCount] = useState(initialViewState.monthCount);

  const weekDates = useMemo(
    () => Array.from({ length: weekCount * 7 }, (_, offset) => addDays(weekStart, offset)),
    [weekStart, weekCount],
  );
  const monthKeys = useMemo(
    () => Array.from({ length: monthCount }, (_, offset) => addMonths(month, offset)),
    [month, monthCount],
  );
  const monthFrom = useMemo(() => monthGridDates(monthKeys[0])[0], [monthKeys]);
  const monthTo = useMemo(() => {
    const dates = monthGridDates(monthKeys[monthKeys.length - 1]);
    return dates[dates.length - 1];
  }, [monthKeys]);
  const weekData = useScheduleRange(weekStart, weekDates[weekDates.length - 1], view === "week");
  const monthData = useScheduleRange(monthFrom, monthTo, view === "month");

  // 작업금지(프리징) 기간. 일정표 본 조회와 따로 불러 이 테이블이 없어도 일정표는 열린다.
  const weekFreezes = useScheduleFreezes(
    { from: weekDates[0], to: weekDates[weekDates.length - 1] },
    view === "week",
  );
  const monthFreezes = useScheduleFreezes({ from: monthFrom, to: monthTo }, view === "month");
  const weekFreezeBadges = useMemo(
    () => freezeBadgesByDate(weekFreezes.freezes, weekDates),
    [weekFreezes.freezes, weekDates],
  );
  const monthFreezeBadges = useMemo(() => {
    const dates: string[] = [];
    for (let cursor = monthFrom; cursor <= monthTo; cursor = addDays(cursor, 1)) dates.push(cursor);
    return freezeBadgesByDate(monthFreezes.freezes, dates);
  }, [monthFreezes.freezes, monthFrom, monthTo]);
  const data = view === "week" ? weekData : monthData;
  const { isAdmin } = data;

  useEffect(() => {
    if (restoredOptionalRef.current || data.columns.length === 0) return;
    restoredOptionalRef.current = true;
    const validIds = new Set(data.columns.map((column) => column.id));
    const restored = loadViewState(getLocalStore(), validIds).visibleOptionalColumnIds;
    if (restored.length > 0) setVisibleOptionalColumnIds(new Set(restored));
  }, [data.columns]);

  useEffect(() => {
    const store = getLocalStore();
    let optionalIds: string[];
    if (restoredOptionalRef.current) {
      optionalIds = Array.from(visibleOptionalColumnIds);
    } else {
      optionalIds = [];
      try {
        const raw = store?.getItem(VIEW_STATE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (
            parsed &&
            typeof parsed === "object" &&
            Array.isArray((parsed as { visibleOptionalColumnIds?: unknown }).visibleOptionalColumnIds)
          ) {
            optionalIds = (parsed as { visibleOptionalColumnIds: unknown[] }).visibleOptionalColumnIds.filter(
              (id): id is string => typeof id === "string",
            );
          }
        }
      } catch {
        optionalIds = [];
      }
    }
    saveViewState(store, {
      facilityView,
      dailyView,
      weekCount,
      monthCount,
      visibleOptionalColumnIds: optionalIds,
    });
  }, [facilityView, dailyView, weekCount, monthCount, visibleOptionalColumnIds]);

  useEffect(() => {
    saveDateState(getSessionStore(), { selectedDate, weekStart, month }, todayIso());
  }, [selectedDate, weekStart, month]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
      if (scrollRafRef.current !== null) window.cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (section !== "facility" || !isAdmin) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== "z") return;

      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.matches("input, textarea, select, [contenteditable]") || active.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) {
        return;
      }

      event.preventDefault();
      void scheduleWrite.undoWithToast();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isAdmin, scheduleWrite, section]);

  useEffect(() => {
    if (!highlightCellId || scrolledCellIdRef.current === highlightCellId) return;
    if (scrollRafRef.current !== null) window.cancelAnimationFrame(scrollRafRef.current);
    const tryScroll = (retriesLeft: number) => {
      const escaped = highlightCellId.replace(/"/g, '\\"');
      const el = gridAreaRef.current?.querySelector<HTMLElement>(`[data-cell-id="${escaped}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", inline: "nearest" });
        scrolledCellIdRef.current = highlightCellId;
        return;
      }
      if (retriesLeft > 0) {
        scrollRafRef.current = window.requestAnimationFrame(() => tryScroll(retriesLeft - 1));
      }
    };
    scrollRafRef.current = window.requestAnimationFrame(() => tryScroll(1));
  }, [highlightCellId, data.cells, view]);

  const optionalColumns = useMemo(
    () =>
      [...data.columns]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .filter(isOptionalScheduleColumn),
    [data.columns],
  );
  const visibleWeekColumns = useMemo(
    () => filterVisibleScheduleColumns(weekData.columns, visibleOptionalColumnIds),
    [weekData.columns, visibleOptionalColumnIds],
  );
  const visibleMonthColumns = useMemo(
    () => filterVisibleScheduleColumns(monthData.columns, visibleOptionalColumnIds),
    [monthData.columns, visibleOptionalColumnIds],
  );

  const monthModels = useMemo(
    () =>
      monthKeys.map((key) =>
        buildMonthModel({
          month: key,
          columns: visibleMonthColumns,
          cells: monthData.cells,
          dayNotes: monthData.dayNotes,
          marks: monthData.marks,
        }),
      ),
    [monthKeys, visibleMonthColumns, monthData.cells, monthData.dayNotes, monthData.marks],
  );

  const goPrev = () => {
    if (view === "week") {
      setWeekStart(addDays(weekStart, -7));
      setSelectedDate(addDays(selectedDate, -7));
    } else {
      setMonth(addMonths(month, -1));
    }
  };
  const goNext = () => {
    if (view === "week") {
      setWeekStart(addDays(weekStart, 7));
      setSelectedDate(addDays(selectedDate, 7));
    } else {
      setMonth(addMonths(month, 1));
    }
  };
  /** 그 날짜가 보이는 주·달로 이동한다. 보기(주간·월간)는 그대로다. */
  const jumpToDate = (workDate: string) => {
    if (!isValidIso(workDate)) return;
    setSelectedDate(workDate);
    setWeekStart(weekStartOf(workDate));
    setMonth(monthOf(workDate));
  };
  const handlePickSearch = (cell: ScheduleCell) => {
    jumpToDate(cell.workDate);
    scrolledCellIdRef.current = null;
    setHighlightCellId(cell.id);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightCellId(null);
    }, 3000);
  };

  const jumpTarget = useScheduleJumpStore((s) => s.target);
  useEffect(() => {
    if (section !== "facility" || !jumpTarget) return;
    const target = useScheduleJumpStore.getState().consume();
    if (!target || !isValidIso(target.date)) return;
    setSelectedDate(target.date);
    setWeekStart(weekStartOf(target.date));
    setMonth(monthOf(target.date));
    if (target.cellId) {
      scrolledCellIdRef.current = null;
      setHighlightCellId(target.cellId);
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightCellId(null);
      }, 3000);
    }
  }, [section, jumpTarget]);
  const goToday = () => {
    const today = todayIso();
    setSelectedDate(today);
    setWeekStart(weekStartOf(today));
    setMonth(monthOf(today));
  };

  /**
   * 끌어 놓기. 같은 날짜·팀에 한꺼번에 등록한 국소들은 한 묶음이라 **묶음 전체**를 옮긴다
   * (도착 팀의 빈 행에 행 순서대로 이어 붙는다). 묶음이 한 칸뿐이거나 Shift를 누르고 놓으면
   * 끈 칸 하나만 옮기고, 놓은 자리가 차 있으면 맞바꾼다. `append`(월간 보기)는 놓은 자리의 행이 정해져 있지 않아
   * 맞바꾸지 않고 도착 팀의 빈 행에 하나를 이어 붙인다.
   * 주간·월간 모두 지금 보이는 보기의 칸(`data.cells`)으로 판단한다.
   */
  /**
   * 다른 날짜·팀으로 옮긴 뒤 원래 팀에 남은 빈 행을 위로 닫는다. 칸은 이미 옮겨졌으므로
   * 정리가 실패해도 옮김은 취소하지 않고 따로 알린다.
   */
  const closeLeftoverGap = async (dragged: CellPosition, target: CellPosition) => {
    const leftover = leftoverGroupAfterMove(dragged, target);
    if (!supabase || leftover === null) return;
    try {
      await arrangeScheduleGroup(supabase, leftover.workDate, leftover.columnId);
    } catch (error) {
      toast({
        title: "행 순서 정리에 실패했습니다",
        description: `칸은 옮겨졌습니다. ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    }
  };

  const handleDropCell = async (
    dragged: ScheduleCell,
    target: CellPosition,
    options: { single: boolean; append?: boolean },
  ) => {
    if (!supabase || !isAdmin) return;
    const viewCells = data.cells;
    const affectedKeys: GroupKey[] = [
      { workDate: dragged.workDate, columnId: dragged.columnId },
      { workDate: target.workDate, columnId: target.columnId },
    ];
    const fetchAffectedCells = async () => {
      const dates = [...new Set(affectedKeys.map((key) => key.workDate))];
      const pages = await Promise.all(dates.map((date) => fetchScheduleCells(supabase, date, date)));
      return pages.flat();
    };
    const recordDragUndo = async (label: string) => {
      const before = snapshotGroups(viewCells, affectedKeys);
      const fresh = await fetchAffectedCells();
      const after = snapshotGroups(fresh, affectedKeys);
      scheduleWrite.recordUndo({ label, before, marksBefore: [], after });
    };

    const moveGroup = !options.single && groupOfCell(viewCells, dragged).length > 1;
    try {
      if (moveGroup) {
        const plan = planGroupDrop(viewCells, dragged, target);
        if (plan.kind === "none") return;
        if (plan.kind === "full") {
          toast({
            title: "옮기지 못했습니다",
            description: "도착 날짜·팀의 행이 모자랍니다.",
            variant: "destructive",
          });
          return;
        }
        // 순서대로 하나씩 옮긴다. 중간에 실패해도 화면은 새로 고쳐 실제 상태를 보여 준다.
        let movedCount = 0;
        try {
          for (const id of plan.ids) {
            await moveScheduleCell(supabase, id, { ...target, rowNo: null });
            movedCount += 1;
          }
          if (movedCount > 0) {
            await recordDragUndo(`${movedCount}건 이동`);
            toast({
              title: `${movedCount}건을 옮겼습니다`,
              action: scheduleWrite.createUndoAction(),
            });
          }
        } finally {
          await weekData.refresh();
        }
        return;
      }
      if (options.append) {
        if (dragged.workDate === target.workDate && dragged.columnId === target.columnId) return;
        if (groupOfCell(viewCells, target).length >= MAX_ROWS) {
          toast({
            title: "옮기지 못했습니다",
            description: "도착 날짜·팀의 행이 모자랍니다.",
            variant: "destructive",
          });
          return;
        }
        await moveScheduleCell(supabase, dragged.id, { ...target, rowNo: null });
        await closeLeftoverGap(dragged, target);
        await recordDragUndo("일정 이동");
        await weekData.refresh();
        toast({
          title: `${truncateCellLabel(dragged)}을(를) 옮겼습니다`,
          action: scheduleWrite.createUndoAction(),
        });
        return;
      }
      const plan = planDrop(viewCells, dragged, target);
      if (plan.kind === "none") return;
      await moveScheduleCell(supabase, dragged.id, target);
      await closeLeftoverGap(dragged, target);
      await recordDragUndo(plan.kind === "swap" ? "자리 맞바꾸기" : "일정 이동");
      await weekData.refresh();
      if (plan.kind === "swap") {
        toast({
          title: `${truncateCellLabel(dragged)}와 ${truncateCellLabel(plan.with)}의 자리를 맞바꿨습니다`,
          action: scheduleWrite.createUndoAction(),
        });
      } else {
        toast({
          title: `${truncateCellLabel(dragged)}을(를) 옮겼습니다`,
          action: scheduleWrite.createUndoAction(),
        });
      }
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

  const handleToggleDone = async (cell: ScheduleCell) => {
    const toggle = toggleDone(cell.result ?? null);
    if (toggle.kind === "open-dialog") {
      openCellEditor(cell, {
        workDate: cell.workDate,
        columnId: cell.columnId,
        rowNo: cell.rowNo,
      });
      return;
    }
    if (togglingIdsRef.current.has(cell.id)) return;
    togglingIdsRef.current.add(cell.id);
    try {
      const label = toggle.next
        ? `${truncateCellLabel(cell)} 완료 기록`
        : `${truncateCellLabel(cell)} 완료 취소`;
      await scheduleWrite.writeResult(label, cell.id, cell.result ?? null, toggle.next);
    } finally {
      togglingIdsRef.current.delete(cell.id);
    }
  };

  const todaySummary = useMemo(
    () => completionSummary(weekData.cells, todayIso()),
    [weekData.cells],
  );

  const markOfEditor = cellEditor
    ? (weekData.marks.find(
        (mark) =>
          mark.workDate === cellEditor.position.workDate &&
          mark.columnId === cellEditor.position.columnId,
      )?.color ?? null)
    : null;

  const rangeLabel =
    view === "week"
      ? `${weekDates[0]} ~ ${weekDates[weekDates.length - 1]}`
      : monthCount === 1
        ? `${month.replace("-", "년 ")}월`
        : `${month.replace("-", "년 ")}월 ~ ${monthKeys[monthKeys.length - 1].replace("-", "년 ")}월`;
  const countLabel = view === "week" ? "주" : "달";
  const activeCount = view === "week" ? weekCount : monthCount;
  const setActiveCount = view === "week" ? setWeekCount : setMonthCount;

  // 메일양식은 일일일정 값으로 글을 만든다. 주간·월간의 조회·이동 도구가 필요 없다.
  if (section === "mail") {
    return (
      <section
        className="absolute inset-0 flex flex-col gap-2 overflow-hidden bg-slate-950 p-4 text-slate-100"
        aria-label="메일양식"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="sr-only">메일양식</h1>
          <ScheduleSectionSwitch section="mail" />
        </div>
        <ScheduleMailView />
      </section>
    );
  }

  // 일자별·누적 보기는 주간·월간의 조회·이동 도구가 필요 없다. 훅은 모두 위에서 불렀다.
  if (view === "day" || view === "archive") {
    return (
      <section
        className="absolute inset-0 flex flex-col gap-2 overflow-hidden bg-slate-950 p-4 text-slate-100"
        aria-label="일일일정"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="sr-only">일일일정</h1>
          <ScheduleSectionSwitch section="daily" />
          <ScheduleViewToggle view={view} onChange={setView} kinds={DAILY_VIEW_KINDS} />
        </div>
        {view === "day" ? (
          <ScheduleDayView canEdit={isAdmin} />
        ) : (
          <ScheduleArchiveView canEdit={isAdmin} />
        )}
      </section>
    );
  }

  return (
    <section
      className="absolute inset-0 flex flex-col gap-2 overflow-hidden bg-slate-950 p-4 text-slate-100"
      aria-label="시설일정"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="sr-only">시설일정</h1>
        <ScheduleSectionSwitch section="facility" />
        {isAdmin ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="h-8 shrink-0 gap-1.5 border-slate-700 px-3 text-xs"
              title="시설일이 없고 오늘 이후 일정에도 없는 국소를 찾아 일정에 추가합니다"
              onClick={() => setUnscheduledOpen(true)}
            >
              <ListPlus className="h-3.5 w-3.5" aria-hidden />
              미배정 국소
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-8 shrink-0 gap-1.5 border-slate-700 px-3 text-xs"
              title="날짜 또는 주 단위로 일정을 다른 날짜에 복제합니다"
              onClick={() => setCopyOpen(true)}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              복제
            </Button>
          </>
        ) : null}

        <ScheduleViewToggle view={view} onChange={setView} kinds={FACILITY_VIEW_KINDS} />

        <div
          className="flex overflow-hidden rounded-md border border-slate-700"
          role="group"
          aria-label={`한 번에 보는 ${countLabel} 수`}
        >
          {(view === "week" ? WEEK_COUNTS : MONTH_COUNTS).map((count) => (
            <button
              key={count}
              type="button"
              aria-pressed={activeCount === count}
              onClick={() => setActiveCount(count)}
              className={cn(
                "h-8 whitespace-nowrap px-2.5 text-xs",
                activeCount === count ? "bg-indigo-600 text-white" : "text-slate-200 hover:bg-slate-800",
              )}
            >
              {count}
              {countLabel}
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
          <DatePicker
            ariaLabel="날짜로 이동"
            value={selectedDate}
            onChange={(nextIso) => {
              if (!isValidIso(nextIso)) return;
              setSelectedDate(nextIso);
              setWeekStart(weekStartOf(nextIso));
              setMonth(monthOf(nextIso));
            }}
            className="w-36"
          />
        ) : (
          <DatePicker
            mode="month"
            ariaLabel="월로 이동"
            value={month}
            onChange={(nextMonth) => {
              if (!isValidMonth(nextMonth)) return;
              setMonth(nextMonth);
            }}
            className="w-36"
          />
        )}

        <ScheduleSearch columns={data.columns} onPick={handlePickSearch} />

        {todaySummary.total > 0 ? (
          <span
            title={`전체 ${todaySummary.total}건 중 ${todaySummary.recorded}건 기록`}
            className="whitespace-nowrap rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 text-xs text-slate-200"
          >
            {todaySummary.recorded === 0
              ? "기록 없음"
              : `오늘 완료 ${todaySummary.done}/${todaySummary.recorded}`}
          </span>
        ) : null}

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
            onClick={() => setFreezeOpen(true)}
          >
            <Ban className="h-3.5 w-3.5" aria-hidden />
            작업금지
          </Button>
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ScheduleLegend />
        {optionalColumns.length > 0 ? (
          <div
            className="flex items-center gap-3 text-xs text-slate-300"
            role="group"
            aria-label="선택 열 표시"
          >
            {optionalColumns.map((column) => {
              const checked = visibleOptionalColumnIds.has(column.id);
              return (
                <label
                  key={column.id}
                  className="inline-flex cursor-pointer select-none items-center gap-1.5 whitespace-nowrap hover:text-slate-100"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setVisibleOptionalColumnIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(column.id)) next.delete(column.id);
                        else next.add(column.id);
                        return next;
                      })
                    }
                    className="h-3.5 w-3.5 rounded-sm border-slate-600 bg-slate-900 accent-indigo-500"
                  />
                  <span>{column.teamLabel}</span>
                </label>
              );
            })}
          </div>
        ) : null}
      </div>

      <div ref={gridAreaRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
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
            columns={visibleWeekColumns}
            cells={weekData.cells}
            dayNotes={weekData.dayNotes}
            marks={weekData.marks}
            freezeBadges={weekFreezeBadges}
            highlightCellId={highlightCellId}
            canEdit={isAdmin}
            onEditCell={openCellEditor}
            onDropCell={handleDropCell}
            onEditColumn={setColumnEditor}
            onEditDay={setDayEditor}
            onToggleDone={isAdmin ? (cell) => void handleToggleDone(cell) : undefined}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {monthModels.map((model) => (
              <div key={model.month}>
                {monthCount > 1 ? (
                  <h2 className="mb-1 text-sm font-semibold text-slate-200">{model.title}</h2>
                ) : null}
                <ScheduleMonthGrid
                  model={model}
                  freezeBadges={monthFreezeBadges}
                  highlightCellId={highlightCellId}
                  canEdit={isAdmin}
                  onDropCell={(cellId, workDate, columnId, group) => {
                    const dragged = monthData.cells.find((candidate) => candidate.id === cellId);
                    if (!dragged) return;
                    void handleDropCell(
                      dragged,
                      { workDate, columnId: columnId ?? dragged.columnId, rowNo: 0 },
                      { single: !group, append: true },
                    );
                  }}
                  onPickDay={(workDate) => {
                    setSelectedDate(workDate);
                    setWeekStart(weekStartOf(workDate));
                    setView("week");
                  }}
                />
              </div>
            ))}
          </div>
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
        freezes={dayEditor ? (weekFreezeBadges.get(dayEditor) ?? []) : []}
        canEdit={isAdmin}
        onClose={() => setDayEditor(null)}
        onSaved={() => void weekData.refresh()}
        onFreezeDeleted={() => void weekFreezes.refresh()}
      />
      {isAdmin ? (
        <>
          <ScheduleUnscheduledDialog
            open={isUnscheduledOpen}
            onOpenChange={setUnscheduledOpen}
            columns={data.columns}
            defaultDate={selectedDate}
            onAdded={() => void data.refresh()}
          />
          <ScheduleCopyDialog
            open={isCopyOpen}
            onOpenChange={setCopyOpen}
            columns={data.columns}
            defaultDate={selectedDate}
            onSaved={() => void data.refresh()}
          />
        </>
      ) : null}
      <ScheduleFreezeDialog open={isFreezeOpen} onOpenChange={setFreezeOpen} canEdit={isAdmin} />
      <ScheduleExportDialog
        open={isExportOpen}
        onOpenChange={setExportOpen}
        defaultFrom={weekDates[0]}
        defaultTo={weekDates[6]}
        columnCount={weekData.columns.length || undefined}
        getCaptureTarget={() => gridAreaRef.current}
        captureTitle={`시설일정 ${rangeLabel}`}
      />
      <ScheduleImportDialog
        open={isImportOpen}
        onOpenChange={setImportOpen}
        columns={weekData.columns}
        onImported={(firstDate) => {
          setView("week");
          setSelectedDate(firstDate);
          setWeekStart(weekStartOf(firstDate));
          void weekData.refresh();
        }}
      />
    </section>
  );
}
