"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardCopy, Download, ListChecks, Plus, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { ScheduleDayAddRowDialog } from "@/features/schedule/components/schedule-day-add-row-dialog";
import { ScheduleDayInlineCell } from "@/features/schedule/components/schedule-day-inline-cell";
import { ScheduleDayDetailDialog } from "@/features/schedule/components/schedule-day-detail-dialog";
import { ScheduleOptionListsDialog } from "@/features/schedule/components/schedule-option-lists-dialog";
import { useOptionLists } from "@/features/schedule/hooks/use-option-lists";
import { CHECK_COLUMN_PX, useDayColumnWidths } from "@/features/schedule/hooks/use-day-column-widths";
import { useDaySheet } from "@/features/schedule/hooks/use-day-sheet";
import { shouldAutoArchive } from "@/features/schedule/lib/day-archive";
import { buildCopyText } from "@/features/schedule/lib/day-copy";
import { DAY_COLUMNS } from "@/features/schedule/lib/day-columns";
import { formatRefNotice, summarizeRefSources } from "@/features/schedule/lib/day-ref-summary";
import { defaultDayDate, type DayRow } from "@/features/schedule/lib/day-rows";
import type { DayDetailPatch, RefValues } from "@/features/schedule/lib/day-types";
import { downloadDayWorkbook } from "@/features/schedule/lib/write-day-workbook";
import { stationKey } from "@/features/schedule/lib/day-stations";
import { addDays, isValidIso, todayIso } from "@/features/schedule/lib/week";
import { useToast } from "@/hooks/use-toast";

const TABLE_MISSING_MESSAGE =
  "DB에 일자별 상세 테이블이 없습니다. 마이그레이션(03_facility_schedule.sql)을 Supabase에 적용해 주세요.";
const EMPTY_MESSAGE =
  "이 날짜의 일정에 국소가 없습니다. 먼저 주간 보기에서 일정을 입력하거나 일정표를 가져오세요.";

const PAST_ARCHIVE_CONFIRM =
  "지난 날짜의 누적을 지금 일정 기준으로 다시 저장합니다. 이전에 저장된 값이 바뀌고, 지금 일정에 없는 국소는 누적에서 빠집니다. 계속할까요?";

/** 틀 고정 열: 순번~국소명(왼쪽 끝부터 이어진 열) */
const FROZEN_KEYS: string[] = [
  "seq",
  "project",
  "facilityCode",
  "bizClass",
  "bizKind",
  "constructionType",
  "workCategory",
  "region",
  "site",
];
const HEAD_CELL = "border-b border-r border-slate-700 bg-slate-900 py-1.5 font-semibold";
const BODY_CELL = "border-b border-r border-slate-700 py-1.5";

/** 표에서 바로 고치는 열 */
const INLINE_KEYS = ["workType", "equipment", "workContent", "workDetail"] as const;
type InlineKey = (typeof INLINE_KEYS)[number];
const isInlineKey = (key: string): key is InlineKey => (INLINE_KEYS as readonly string[]).includes(key);
/** 글자 수 상한(DB CHECK와 같다): 짧은 칸 200자, 작업내용 상세 500자 */
const SHORT_MAX_LENGTH = 200;
const DETAIL_MAX_LENGTH = 500;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

interface ScheduleDayViewProps {
  /** 관리자만 true: 누적 저장을 한다 */
  canEdit: boolean;
}

/**
 * 시설일정 > 일자별. 날짜 하나의 국소별 24열 상세표(조회·복사·엑셀).
 * 표 셀은 줄바꿈 없이 말줄임으로 보이고(전체 글은 툴팁), 가로 스크롤은 쓰지 않는다.
 */
export function ScheduleDayView({ canEdit }: ScheduleDayViewProps) {
  const { toast } = useToast();
  const [workDate, setWorkDate] = useState(() => defaultDayDate());
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const sheet = useDaySheet(workDate);
  const { lists } = useOptionLists();
  const { rows } = sheet;

  const isEmpty = rows.length === 0;
  // 상세·참조 값이 아직 오는 중이거나 불러오기에 실패하면 행이 비어 있으므로 복사·내려받기·누적 저장을 막는다.
  const canAct = !isEmpty && !sheet.isLoading && !sheet.error;
  // 일자별 테이블이 아직 없으면(마이그레이션 전) 쓰기는 모두 막는다.
  const canWrite = canEdit && !sheet.isTableMissing;
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  /** 상세 창에 보여 줄 행(하나면 상세, 둘 이상이면 일괄 적용). `null`이면 창이 닫혀 있다. */
  const [detailRows, setDetailRows] = useState<DayRow[] | null>(null);
  const [isListsOpen, setListsOpen] = useState(false);
  const [isAddRowOpen, setAddRowOpen] = useState(false);
  const selectedCount = useMemo(
    () => rows.filter((row) => selected.has(row.stationKey)).length,
    [rows, selected],
  );
  const { widths, startResize, resetWidth } = useDayColumnWidths();
  // 열 순서는 원래(엑셀) 그대로다. 순번~국소명은 틀 고정이다(왼쪽 끝부터 이어진 열이라 원래 자리 그대로 붙는다).
  const orderedColumns = DAY_COLUMNS;
  // 고정 열의 left 오프셋(체크 칸 폭 + 앞선 고정 열 폭)
  const frozenLeft = useMemo(() => {
    const result: Record<string, number> = {};
    let offset = CHECK_COLUMN_PX;
    for (const key of FROZEN_KEYS) {
      result[key] = offset;
      offset += widths[key] ?? 0;
    }
    return result;
  }, [widths]);
  const frozenStyle = (key: string) => (frozenLeft[key] !== undefined ? { left: frozenLeft[key] } : undefined);
  const tableWidth = CHECK_COLUMN_PX + orderedColumns.reduce((sum, column) => sum + (widths[column.key] ?? 0), 0);
  const selectedManualRows = useMemo(
    () => rows.filter((row) => row.isManual && selected.has(row.stationKey)),
    [rows, selected],
  );
  const refNotice = useMemo(() => formatRefNotice(summarizeRefSources(rows)), [rows]);

  const changeDate = (next: string) => {
    if (!isValidIso(next) || next === workDate) return;
    setWorkDate(next);
    setSelected(new Set());
  };

  const toggleRow = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleAll = () =>
    setSelected(selectedCount === rows.length ? new Set() : new Set(rows.map((row) => row.stationKey)));

  /** 저장·복사·내려받기를 하나씩만 돌린다. 끝나기 전의 두 번째 클릭은 무시한다. */
  const runExclusive = async (action: () => Promise<void>) => {
    // 불러오는 중이거나 실패한 표는 상세·참조 값이 비어 있어 누적을 빈 값으로 덮을 수 있다.
    if (!canAct || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /**
   * 복사·내려받기 뒤에 누적에 저장한다(관리자만). 저장이 실패해도 이미 한 복사·내려받기는 그대로다.
   * 지난 날짜는 "만든 당시의 값"을 지키려고 조용히 건너뛴다(고치려면 `누적 저장` 버튼).
   */
  const archiveAfterExport = async () => {
    if (!canWrite || !shouldAutoArchive(workDate, todayIso())) return;
    try {
      await sheet.saveArchive();
    } catch (error) {
      toast({
        title: "누적 저장에 실패했습니다",
        description: errorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleCopy = () =>
    runExclusive(async () => {
      const text = buildCopyText(rows.map((row) => row.values));
      const count = rows.length;
      // 브라우저의 사용자 동작 인정(Safari 클립보드)이 끊기지 않도록 복사를 먼저 한다.
      try {
        await navigator.clipboard.writeText(text);
        toast({ title: "표를 복사했습니다", description: `${count}건을 엑셀에 붙여 넣을 수 있습니다.` });
      } catch (error) {
        toast({ title: "복사하지 못했습니다", description: errorMessage(error), variant: "destructive" });
      }
      await archiveAfterExport();
    });

  const handleDownload = () =>
    runExclusive(async () => {
      const values = rows.map((row) => row.values);
      try {
        await downloadDayWorkbook(workDate, values, lists);
      } catch (error) {
        toast({ title: "내려받지 못했습니다", description: errorMessage(error), variant: "destructive" });
      }
      await archiveAfterExport();
    });

  /** 상세 창의 저장. 성공하면 창을 닫고, 실패하면 창을 열어 둔 채 오류를 알린다. */
  const handleSaveDetails = (patches: { station: DayRow; patch: DayDetailPatch }[], notice?: string) =>
    runExclusive(async () => {
      try {
        await sheet.saveDetails(patches);
        toast({ title: "상세를 저장했습니다", description: notice ?? `${patches.length}건` });
        setDetailRows(null);
      } catch (error) {
        toast({ title: "저장하지 못했습니다", description: errorMessage(error), variant: "destructive" });
      }
    });

  /** 표 칸에서 바로 고친 한 칸을 저장한다. 실패하면 오류만 알리고 표는 저장된 값 그대로다. */
  const handleInlineSave = (row: DayRow, key: InlineKey, next: string) =>
    runExclusive(async () => {
      try {
        await sheet.saveDetails([{ station: row, patch: { [key]: next } }]);
      } catch (error) {
        toast({ title: "저장하지 못했습니다", description: errorMessage(error), variant: "destructive" });
      }
    });

  /** 이미 표에 있는 국소명이면 이유를 돌려준다. */
  const checkNewSite = (site: string) =>
    rows.some((row) => row.stationKey === stationKey(site)) ? "이미 이 날짜 표에 있는 국소입니다." : null;

  /** 일정이 빈 날에도 추가할 수 있어야 하므로 `runExclusive`(행이 있어야 동작)를 쓰지 않고 직접 막는다. 실패는 창이 보여 준다. */
  const handleAddRow = async (site: string, overrides: RefValues) => {
    if (busyRef.current) throw new Error("다른 저장이 끝나기를 기다린 뒤 다시 시도하세요.");
    busyRef.current = true;
    setBusy(true);
    try {
      await sheet.addManualRow(site, overrides);
      toast({ title: "행을 추가했습니다", description: site });
      setAddRowOpen(false);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /** 직접 추가한 행만 지운다. 일정에서 온 행은 일정표에서 고친다. */
  const deleteManual = (targets: DayRow[]) =>
    runExclusive(async () => {
      const manual = targets.filter((row) => row.isManual);
      if (manual.length === 0) return;
      const label = manual.length === 1 ? `"${manual[0].site}" 행` : `직접 추가한 ${manual.length}개 행`;
      if (!window.confirm(`${label}을 삭제할까요? 입력한 상세도 함께 지워지며 되돌릴 수 없습니다.`)) return;
      try {
        await sheet.deleteManualRows(manual.map((row) => row.stationKey));
        toast({ title: "행을 삭제했습니다", description: `${manual.length}건` });
        setDetailRows(null);
        setSelected(new Set());
      } catch (error) {
        toast({ title: "삭제하지 못했습니다", description: errorMessage(error), variant: "destructive" });
      }
    });

  /** 행 클릭: 상세 창. 불러오는 중이거나 실패한 표는 값이 비어 있어 열지 않는다. */
  const openRow = (row: DayRow) => {
    if (canAct) setDetailRows([row]);
  };

  const openBulk = () => {
    const picked = rows.filter((row) => selected.has(row.stationKey));
    if (picked.length > 0) setDetailRows(picked);
  };

  const handleArchive = () =>
    runExclusive(async () => {
      if (workDate < todayIso() && !window.confirm(PAST_ARCHIVE_CONFIRM)) return;
      try {
        await sheet.saveArchive();
        toast({ title: "누적에 저장했습니다", description: `${workDate} ${rows.length}건` });
      } catch (error) {
        toast({
          title: "누적 저장에 실패했습니다",
          description: errorMessage(error),
          variant: "destructive",
        });
      }
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 border-slate-700"
          aria-label="이전 날"
          onClick={() => changeDate(addDays(workDate, -1))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <DatePicker ariaLabel="날짜 선택" value={workDate} onChange={changeDate} className="w-36" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 border-slate-700"
          aria-label="다음 날"
          onClick={() => changeDate(addDays(workDate, 1))}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-8 border-slate-700 px-3 text-xs"
          onClick={() => changeDate(defaultDayDate())}
        >
          내일
        </Button>
        <span className="whitespace-nowrap text-xs text-slate-300">
          {rows.length}건 · 선택 {selectedCount}건
        </span>

        <div className="ml-auto flex items-center gap-2">
          {canEdit ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-8 border-slate-700 px-3 text-xs"
                disabled={!canWrite || !canAct || busy || selectedCount === 0}
                onClick={openBulk}
              >
                선택한 {selectedCount}건 일괄 적용
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-8 gap-1.5 border-slate-700 px-3 text-xs"
                title="직접 추가한 행 중 체크한 행을 지웁니다(일정에서 온 행은 지워지지 않습니다)"
                disabled={!canWrite || !canAct || busy || selectedManualRows.length === 0}
                onClick={() => void deleteManual(selectedManualRows)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                선택 행 삭제{selectedManualRows.length > 0 ? ` (${selectedManualRows.length})` : ""}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-8 gap-1.5 border-slate-700 px-3 text-xs"
                disabled={!canWrite || sheet.isLoading || Boolean(sheet.error) || busy}
                onClick={() => setAddRowOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                행 추가
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-8 gap-1.5 border-slate-700 px-3 text-xs"
                onClick={() => setListsOpen(true)}
              >
                <ListChecks className="h-3.5 w-3.5" aria-hidden />
                목록 관리
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="h-8 gap-1.5 border-slate-700 px-3 text-xs"
            disabled={!canAct || busy}
            onClick={() => void handleCopy()}
          >
            <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
            표 복사
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 gap-1.5 border-slate-700 px-3 text-xs"
            disabled={!canAct || busy}
            onClick={() => void handleDownload()}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            엑셀 내려받기
          </Button>
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              className="h-8 gap-1.5 border-slate-700 px-3 text-xs"
              disabled={!canWrite || !canAct || busy}
              onClick={() => void handleArchive()}
            >
              <Save className="h-3.5 w-3.5" aria-hidden />
              누적 저장
            </Button>
          ) : null}
        </div>
      </div>

      {sheet.isTableMissing ? <p className="text-sm text-amber-400">{TABLE_MISSING_MESSAGE}</p> : null}
      {sheet.error ? (
        <p className="text-sm text-rose-400">
          일자별 상세를 불러오지 못했습니다. {errorMessage(sheet.error)}
        </p>
      ) : null}
      {refNotice ? (
        <p
          className="text-xs text-amber-400"
          title="공정관리(erp_details)에서 찾지 못해 누적·마커로 채웠거나 비어 있는 국소입니다. 표에서 배경색이 있는 참조 열 칸이 해당 값입니다."
        >
          {refNotice}
        </p>
      ) : null}

      {/* 틀 고정: 체크·국소명·장비타입은 가로로 밀어도 왼쪽에 남고, 머리글은 세로로 밀어도 위에 남는다. */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isEmpty ? (
          <p className="p-4 text-sm text-slate-400">
            {sheet.isLoading ? "불러오는 중..." : sheet.error ? "" : EMPTY_MESSAGE}
          </p>
        ) : (
          <table
            className="table-fixed border-separate border-spacing-0 border-l border-t border-slate-700 text-sm text-slate-100"
            style={{ width: tableWidth }}
          >
            <colgroup>
              <col style={{ width: CHECK_COLUMN_PX }} />
              {orderedColumns.map((column) => (
                <col key={column.key} style={{ width: widths[column.key] }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className={cn(HEAD_CELL, "sticky left-0 top-0 z-30 px-1 text-center")}>
                  <input
                    type="checkbox"
                    aria-label="전체 선택"
                    checked={selectedCount === rows.length}
                    ref={(element) => {
                      if (element) element.indeterminate = selectedCount > 0 && selectedCount < rows.length;
                    }}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-indigo-500"
                  />
                </th>
                {orderedColumns.map((column) => (
                  <th
                    key={column.key}
                    title={column.header}
                    style={frozenStyle(column.key)}
                    className={cn(
                      HEAD_CELL,
                      "relative truncate whitespace-nowrap px-1 text-center",
                      frozenLeft[column.key] !== undefined ? "sticky top-0 z-30" : "sticky top-0 z-20",
                    )}
                  >
                    {column.header}
                    {/* 경계를 끌면 열 폭이 바뀌고, 더블클릭하면 기본 폭으로 돌아온다. */}
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`${column.header} 열 폭 조절`}
                      onPointerDown={(event) => startResize(column.key, event)}
                      onDoubleClick={() => resetWidth(column.key)}
                      className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none hover:bg-indigo-500/60"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSelected = selected.has(row.stationKey);
                const stickyBg = isSelected ? "bg-indigo-950" : "bg-slate-900 group-hover:bg-slate-800";
                return (
                <tr
                  key={row.stationKey}
                  tabIndex={0}
                  onClick={() => openRow(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && event.target === event.currentTarget) openRow(row);
                  }}
                  className={cn("group cursor-pointer hover:bg-slate-800/60", isSelected && "bg-indigo-950/40")}
                >
                  {/* 체크 칸의 클릭은 행 클릭(상세 창 열기)으로 번지지 않게 한다. */}
                  <td
                    className={cn(BODY_CELL, "sticky left-0 z-10 px-1 text-center", stickyBg)}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      aria-label={`${row.site} 선택`}
                      checked={selected.has(row.stationKey)}
                      onChange={() => toggleRow(row.stationKey)}
                      className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-indigo-500"
                    />
                  </td>
                  {orderedColumns.map((column) => {
                    const value = row.values[column.key];
                    const frozen = frozenLeft[column.key] !== undefined;
                    const cellClass = cn(
                      BODY_CELL,
                      "truncate whitespace-nowrap px-1.5",
                      frozen && cn("sticky z-10", stickyBg),
                      !frozen && column.kind === "ref" && row.refSource !== "erp" && "bg-amber-950/30 text-slate-400",
                    );
                    // 작업유형·중장비투입·작업내용·작업내용 상세는 표에서 바로 고른다(관리자). 새 창을 열지 않는다.
                    const inlineKey = column.key;
                    if (isInlineKey(inlineKey)) {
                      return (
                        <ScheduleDayInlineCell
                          key={column.key}
                          value={value}
                          options={column.list ? lists[column.list] : undefined}
                          maxLength={column.key === "workDetail" ? DETAIL_MAX_LENGTH : SHORT_MAX_LENGTH}
                          editable={canWrite && canAct && !busy}
                          style={frozenStyle(column.key)}
                          className={cellClass}
                          onCommit={(next) => void handleInlineSave(row, inlineKey, next)}
                        />
                      );
                    }
                    return (
                      <td
                        key={column.key}
                        title={value}
                        style={frozenStyle(column.key)}
                        className={cellClass}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {detailRows ? (
        <ScheduleDayDetailDialog
          rows={detailRows}
          canEdit={canWrite}
          latestArchive={sheet.latestArchive}
          onClose={() => setDetailRows(null)}
          onSave={handleSaveDetails}
          onDeleteRow={(row) => deleteManual([row])}
        />
      ) : null}
      {isAddRowOpen ? (
        <ScheduleDayAddRowDialog
          checkSite={checkNewSite}
          onClose={() => setAddRowOpen(false)}
          onSubmit={handleAddRow}
        />
      ) : null}
      {canEdit ? <ScheduleOptionListsDialog open={isListsOpen} onOpenChange={setListsOpen} canEdit={canEdit} /> : null}
    </div>
  );
}
