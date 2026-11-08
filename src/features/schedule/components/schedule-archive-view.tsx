"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardCopy, Download, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { DEFAULT_ARCHIVE_LIMIT } from "@/features/schedule/day-api";
import { CHECK_COLUMN_PX, useDayColumnWidths } from "@/features/schedule/hooks/use-day-column-widths";
import { useArchive } from "@/features/schedule/hooks/use-archive";
import { useOptionLists } from "@/features/schedule/hooks/use-option-lists";
import { buildCopyText } from "@/features/schedule/lib/day-copy";
import { DAY_COLUMNS } from "@/features/schedule/lib/day-columns";
import { downloadArchiveWorkbook } from "@/features/schedule/lib/write-day-workbook";
import { isValidIso, todayIso } from "@/features/schedule/lib/week";
import { useToast } from "@/hooks/use-toast";

const TABLE_MISSING_MESSAGE =
  "DB에 일자별 상세 테이블이 없습니다. 마이그레이션(20261111000000_schedule_day_details.sql)을 Supabase에 적용해 주세요.";
const EMPTY_MESSAGE = "쌓인 상세가 없습니다. 일자별 보기에서 누적 저장을 누르거나 표를 복사하면 쌓입니다.";
const EMPTY_FILTERED_MESSAGE = "조건에 맞는 상세가 없습니다.";

/** 입력을 멈추고 이 시간(ms)이 지나면 조회한다. 글자마다 DB를 부르지 않게 한다. */
const DEBOUNCE_MS = 300;

/** 틀 고정 열(왼쪽부터 이 순서로 붙는다). 일자별 표와 같다. */
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

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
/** 누적 행의 식별(작업일 + 국소). 같은 국소가 여러 날 쌓이므로 국소 키만으로는 모자란다. */
const rowId = (workDate: string, stationKey: string) => `${workDate}|${stationKey}`;

interface ScheduleArchiveViewProps {
  /** 관리자만 true: 행을 골라 삭제한다 */
  canEdit: boolean;
}

/**
 * 시설일정 > 누적. 일자별 보기에서 쌓은 24열 상세를 작업일 내림차순으로 보여 준다(기간·글 거르기, 복사·엑셀).
 * 표 셀은 줄바꿈 없이 말줄임으로 보이고(전체 글은 툴팁), 순번~국소명은 틀 고정, 열 폭은 끌어서 바꾼다.
 */
export function ScheduleArchiveView({ canEdit }: ScheduleArchiveViewProps) {
  const { toast } = useToast();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [debouncedText, setDebouncedText] = useState("");
  const [selection, setSelection] = useState<{ filterKey: string; ids: Set<string> }>({
    filterKey: "",
    ids: new Set(),
  });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedText(text), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  const archive = useArchive({
    from: from || undefined,
    to: to || undefined,
    text: debouncedText,
  });
  const { lists } = useOptionLists();
  const { rows } = archive;
  // 열 폭은 일자별 표와 같은 값을 쓴다(한쪽에서 바꾸면 다른 쪽도 다음에 열 때 따라온다).
  const { widths, startResize, resetWidth } = useDayColumnWidths();
  // 열 순서는 원래(엑셀) 그대로다. 순번~국소명은 틀 고정이다(왼쪽 끝부터 이어진 열이라 원래 자리 그대로 붙는다).
  const orderedColumns = DAY_COLUMNS;
  const checkPx = canEdit ? CHECK_COLUMN_PX : 0;
  const frozenLeft = useMemo(() => {
    const result: Record<string, number> = {};
    let offset = checkPx;
    for (const key of FROZEN_KEYS) {
      result[key] = offset;
      offset += widths[key] ?? 0;
    }
    return result;
  }, [widths, checkPx]);
  const frozenStyle = (key: string) => (frozenLeft[key] !== undefined ? { left: frozenLeft[key] } : undefined);
  const tableWidth = checkPx + orderedColumns.reduce((sum, column) => sum + (widths[column.key] ?? 0), 0);

  // 거르기 조건이 바뀌면 이전 조건에서 고른 행은 선택에서 빠진다(조건이 같을 때만 선택이 살아 있다).
  const filterKey = `${from}|${to}|${debouncedText.trim()}`;
  const selectedIds = useMemo(
    () => (selection.filterKey === filterKey ? selection.ids : new Set<string>()),
    [selection, filterKey],
  );
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(rowId(row.workDate, row.stationKey))),
    [rows, selectedIds],
  );
  const selectedCount = selectedRows.length;

  const isEmpty = rows.length === 0;
  const isFiltered = Boolean(from || to || debouncedText.trim());
  // 새 조건의 결과가 오는 중(이전 조건의 행이 아직 보임)이거나 입력 뒤 조회 지연(300ms) 중이면 표가 지금 조건의 결과가 아니다.
  const isStale = archive.isStale || text.trim() !== debouncedText.trim();
  // 불러오는 중이거나 실패한 표는 비어 있고, 오래된 표는 다른 조건의 행이라 복사·내려받기·삭제를 막는다.
  const canAct = !isEmpty && !archive.isLoading && !archive.error && !isStale;

  const changeDate = (set: (value: string) => void) => (next: string) => {
    if (next !== "" && !isValidIso(next)) return;
    set(next);
  };

  const toggleRow = (id: string) => {
    if (isStale) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection({ filterKey, ids: next });
  };
  const toggleAll = () => {
    if (isStale) return;
    setSelection({
      filterKey,
      ids:
        selectedCount === rows.length
          ? new Set()
          : new Set(rows.map((row) => rowId(row.workDate, row.stationKey))),
    });
  };

  /** 복사·내려받기·삭제를 하나씩만 돌린다. 끝나기 전의 두 번째 클릭은 무시한다. */
  const runExclusive = async (action: () => Promise<void>) => {
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

  const handleCopy = () =>
    runExclusive(async () => {
      const count = rows.length;
      try {
        await navigator.clipboard.writeText(buildCopyText(rows.map((row) => row.values)));
        toast({ title: "표를 복사했습니다", description: `${count}건을 엑셀에 붙여 넣을 수 있습니다.` });
      } catch (error) {
        toast({ title: "복사하지 못했습니다", description: errorMessage(error), variant: "destructive" });
      }
    });

  const handleDownload = () =>
    runExclusive(async () => {
      try {
        await downloadArchiveWorkbook(
          rows.map((row) => row.values),
          lists,
          todayIso(),
        );
      } catch (error) {
        toast({ title: "내려받지 못했습니다", description: errorMessage(error), variant: "destructive" });
      }
    });

  const handleDelete = () =>
    runExclusive(async () => {
      if (!canEdit || selectedCount === 0) return;
      if (!window.confirm(`선택한 ${selectedCount}건을 누적에서 삭제할까요? 되돌릴 수 없습니다.`)) return;
      const picked = selectedRows.map((row) => ({ workDate: row.workDate, stationKey: row.stationKey }));
      try {
        await archive.remove(picked);
        setSelection({ filterKey, ids: new Set() });
        toast({ title: "누적에서 삭제했습니다", description: `${picked.length}건` });
      } catch (error) {
        toast({ title: "삭제하지 못했습니다", description: errorMessage(error), variant: "destructive" });
      }
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker
          ariaLabel="기간 시작"
          placeholder="시작일"
          value={from}
          onChange={changeDate(setFrom)}
          allowClear
          className="w-36"
        />
        <span className="text-xs text-slate-400">~</span>
        <DatePicker
          ariaLabel="기간 끝"
          placeholder="종료일"
          value={to}
          onChange={changeDate(setTo)}
          allowClear
          className="w-36"
        />
        <Input
          value={text}
          aria-label="누적 검색"
          placeholder="국소명·프로젝트·통합시설코드"
          autoComplete="off"
          onChange={(event) => setText(event.target.value)}
          className="h-8 w-64 border-slate-700 bg-slate-900 text-xs"
        />
        <span className="whitespace-nowrap text-xs text-slate-300">
          {rows.length}건{canEdit ? ` · 선택 ${selectedCount}건` : ""}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              className="h-8 gap-1.5 border-slate-700 px-3 text-xs"
              disabled={!canAct || busy || selectedCount === 0}
              onClick={() => void handleDelete()}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              선택 삭제
            </Button>
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
        </div>
      </div>

      {isStale && !isEmpty ? <p className="text-xs text-slate-400">불러오는 중…</p> : null}
      {archive.isTableMissing ? <p className="text-sm text-amber-400">{TABLE_MISSING_MESSAGE}</p> : null}
      {archive.error ? (
        <p className="text-sm text-rose-400">누적을 불러오지 못했습니다. {errorMessage(archive.error)}</p>
      ) : null}
      {rows.length >= DEFAULT_ARCHIVE_LIMIT ? (
        <p className="text-xs text-amber-400">
          최근 {DEFAULT_ARCHIVE_LIMIT}건까지만 보입니다. 기간이나 검색어로 좁혀 보세요.
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {isEmpty ? (
          <p className="p-4 text-sm text-slate-400">
            {archive.isLoading || isStale
              ? "불러오는 중..."
              : archive.error || archive.isTableMissing
                ? ""
                : isFiltered
                  ? EMPTY_FILTERED_MESSAGE
                  : EMPTY_MESSAGE}
          </p>
        ) : (
          <table
            className="table-fixed border-separate border-spacing-0 border-l border-t border-slate-700 text-sm text-slate-100"
            style={{ width: tableWidth }}
          >
            <colgroup>
              {canEdit ? <col style={{ width: CHECK_COLUMN_PX }} /> : null}
              {orderedColumns.map((column) => (
                <col key={column.key} style={{ width: widths[column.key] }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {canEdit ? (
                  <th className={cn(HEAD_CELL, "sticky left-0 top-0 z-30 px-1 text-center")}>
                    <input
                      type="checkbox"
                      aria-label="전체 선택"
                      checked={selectedCount === rows.length}
                      disabled={isStale}
                      ref={(element) => {
                        if (element) element.indeterminate = selectedCount > 0 && selectedCount < rows.length;
                      }}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-indigo-500"
                    />
                  </th>
                ) : null}
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
                const id = rowId(row.workDate, row.stationKey);
                const isSelected = selectedIds.has(id);
                const stickyBg = isSelected ? "bg-indigo-950" : "bg-slate-900 group-hover:bg-slate-800";
                return (
                  <tr
                    key={id}
                    className={cn("group hover:bg-slate-800/60", isSelected && "bg-indigo-950/40")}
                  >
                    {canEdit ? (
                      <td className={cn(BODY_CELL, "sticky left-0 z-10 px-1 text-center", stickyBg)}>
                        <input
                          type="checkbox"
                          aria-label={`${row.workDate} ${row.site} 선택`}
                          checked={selectedIds.has(id)}
                          disabled={isStale}
                          onChange={() => toggleRow(id)}
                          className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-indigo-500"
                        />
                      </td>
                    ) : null}
                    {orderedColumns.map((column) => {
                      const value = row.values[column.key];
                      return (
                        <td
                          key={column.key}
                          title={value}
                          style={frozenStyle(column.key)}
                          className={cn(
                            BODY_CELL,
                            "truncate whitespace-nowrap px-1.5",
                            frozenLeft[column.key] !== undefined && cn("sticky z-10", stickyBg),
                          )}
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
    </div>
  );
}
