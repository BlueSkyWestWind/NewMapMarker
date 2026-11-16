"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { useMapMarkersQuery } from "@/features/map-marker/hooks/use-map-markers-query";
import { fetchScheduleColumns } from "@/features/schedule/api";
import {
  ScheduleExcludeDialog,
  type ExcludeTargetItem,
} from "@/features/schedule/components/schedule-exclude-dialog";
import { ScheduleResultDialog } from "@/features/schedule/components/schedule-result-dialog";
import { ScheduleSectionSwitch } from "@/features/schedule/components/schedule-section-switch";
import { useExcludedStations } from "@/features/schedule/hooks/use-excluded-stations";
import { useIncompleteCells } from "@/features/schedule/hooks/use-incomplete-cells";
import { SCHEDULE_QUERY_KEY } from "@/features/schedule/hooks/use-schedule-range";
import { NOTE_COLUMN_LABEL } from "@/features/schedule/lib/day-stations";
import {
  countInstalled,
  INCOMPLETE_LIMIT,
  incompleteCounts,
  installedDateOf,
  isRescheduled,
  selectIncomplete,
} from "@/features/schedule/lib/incomplete-list";
import { installedDateByName } from "@/features/schedule/lib/unscheduled-stations";
import { useScheduleJumpStore } from "@/features/schedule/store/use-schedule-jump-store";
import type { ScheduleCell, ScheduleColumn } from "@/features/schedule/types";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import { cn } from "@/lib/utils";

export interface ScheduleIncompleteViewProps {
  status: "undone" | "partial";
}

const NO_COLUMNS: ScheduleColumn[] = [];

export function ScheduleIncompleteView({ status }: ScheduleIncompleteViewProps) {
  const { supabase, user } = useAuthSession();
  const { isAdmin } = useIsAdmin();
  const setScheduleSegment = useShellStore((s) => s.setScheduleSegment);
  const requestJump = useScheduleJumpStore((s) => s.request);

  const [includeRescheduled, setIncludeRescheduled] = useState(false);
  const [includeInstalled, setIncludeInstalled] = useState(false);
  const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [editingCell, setEditingCell] = useState<ScheduleCell | null>(null);
  const [excludeItem, setExcludeItem] = useState<ExcludeTargetItem | null>(null);

  const isDateReversed = Boolean(fromDate && toDate && fromDate > toDate);

  const columnsQuery = useQuery({
    queryKey: [...SCHEDULE_QUERY_KEY, "columns", user?.id ?? null],
    queryFn: () => fetchScheduleColumns(supabase!),
    enabled: Boolean(supabase && user?.id),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const teamColumns = useMemo(
    () =>
      (columnsQuery.data ?? NO_COLUMNS)
        .filter((col) => col.teamLabel.trim() !== NOTE_COLUMN_LABEL)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [columnsQuery.data],
  );

  const columnLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const col of columnsQuery.data ?? NO_COLUMNS) {
      map.set(col.id, col.teamLabel);
    }
    return map;
  }, [columnsQuery.data]);

  const {
    cells,
    truncated,
    isLoading,
    error,
    isResultMissing,
    refresh,
  } = useIncompleteCells({
    status,
    from: !isDateReversed && fromDate ? fromDate : null,
    to: !isDateReversed && toDate ? toDate : null,
    columnIds: selectedColumnIds,
  });

  const { keys: excludedKeys, refresh: refreshExcluded } = useExcludedStations();
  const markersQuery = useMapMarkersQuery();
  const installedDates = useMemo(
    () => installedDateByName(markersQuery.data?.equipmentMarkers ?? []),
    [markersQuery.data?.equipmentMarkers],
  );

  const counts = useMemo(() => incompleteCounts(cells), [cells]);
  // 미조치 = 다시 잡지 않았고 시설 완료·제외가 아닌 건(기본 보기에서 보이는 건수). 보기 토글과 무관하다.
  const openCount = useMemo(
    () =>
      selectIncomplete(cells, {
        includeRescheduled: false,
        excludedKeys,
        installedDates,
        includeInstalled: false,
      }).length,
    [cells, excludedKeys, installedDates],
  );
  const installedCount = useMemo(
    () => countInstalled(cells, installedDates),
    [cells, installedDates],
  );
  const columnOrder = useMemo(
    () => new Map(teamColumns.map((col, index) => [col.id, index] as const)),
    [teamColumns],
  );
  const visibleCells = useMemo(
    () =>
      selectIncomplete(cells, {
        includeRescheduled,
        excludedKeys,
        columnOrder,
        installedDates,
        includeInstalled,
      }),
    [cells, includeRescheduled, excludedKeys, columnOrder, installedDates, includeInstalled],
  );
  const listLoading = isLoading || markersQuery.isLoading;

  const toggleTeam = (columnId: string) => {
    setSelectedColumnIds((prev) =>
      prev.includes(columnId) ? prev.filter((id) => id !== columnId) : [...prev, columnId],
    );
  };

  const handleJumpToSchedule = (cell: ScheduleCell) => {
    requestJump({ date: cell.workDate, cellId: cell.id });
    setScheduleSegment("facility");
  };

  const title = status === "undone" ? "미시설 국소" : "일부완료 국소";
  const subtitle =
    status === "undone"
      ? "시설 일정에서 미시설로 기록된 국소 목록입니다."
      : "시설 일정에서 일부완료로 기록된 국소 목록입니다.";

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <ScheduleSectionSwitch section={status} />
          <div>
            <h1 className="text-sm font-semibold text-slate-100">{title}</h1>
            <p className="text-xs text-slate-400">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 whitespace-nowrap">
            표시 {visibleCells.length}건 · 미조치 {openCount}건 / 조회 {counts.total}건 · 시설 완료{" "}
            {installedCount}건 {includeInstalled ? "포함" : "숨김"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={listLoading}
            className="h-8 gap-1.5 border-slate-700 bg-slate-900 text-xs text-slate-200 hover:bg-slate-800"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", listLoading && "animate-spin")} />
            새로고침
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-900/50 px-4 py-2.5">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-200 whitespace-nowrap">
          <input
            type="checkbox"
            checked={includeRescheduled}
            onChange={(e) => setIncludeRescheduled(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-sky-500"
          />
          다시 잡은 것 포함
        </label>

        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-200 whitespace-nowrap">
          <input
            type="checkbox"
            checked={includeInstalled}
            onChange={(e) => setIncludeInstalled(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-sky-500"
          />
          시설 완료된 것 포함
        </label>

        <span className="h-4 w-px bg-slate-800" aria-hidden="true" />

        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setSelectedColumnIds([])}
            className={cn(
              "rounded px-2 py-1 text-xs transition-colors whitespace-nowrap",
              selectedColumnIds.length === 0
                ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40"
                : "bg-slate-900 text-slate-400 hover:text-slate-200",
            )}
          >
            전체 팀
          </button>
          {teamColumns.map((col) => {
            const active = selectedColumnIds.includes(col.id);
            return (
              <button
                key={col.id}
                type="button"
                onClick={() => toggleTeam(col.id)}
                className={cn(
                  "rounded px-2 py-1 text-xs transition-colors whitespace-nowrap",
                  active
                    ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200",
                )}
              >
                {col.teamLabel}
              </button>
            );
          })}
        </div>

        <span className="h-4 w-px bg-slate-800" aria-hidden="true" />

        <div className="flex items-center gap-1.5">
          <DatePicker
            value={fromDate}
            onChange={setFromDate}
            placeholder="시작일"
            aria-label="시작일"
            className="h-8 w-36 text-xs"
          />
          <span className="text-xs text-slate-500">~</span>
          <DatePicker
            value={toDate}
            onChange={setToDate}
            placeholder="종료일"
            aria-label="종료일"
            className="h-8 w-36 text-xs"
          />
          {(fromDate || toDate) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
              aria-label="날짜 필터 초기화"
              className="h-8 px-2 text-xs text-slate-400 hover:text-slate-100"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          {isDateReversed && (
            <span className="text-xs text-amber-300 whitespace-nowrap">
              시작일이 종료일보다 뒤입니다.
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {isResultMissing ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-950/30 px-3 py-2.5 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div>
              <p className="font-medium">결과 기록 열(`result_status`)이 아직 데이터베이스에 없습니다.</p>
              <p className="mt-0.5 text-amber-300/80">
                `supabase/migrations/20261116000000_schedule_cell_result.sql`을 적용한 뒤 새로고침하세요.
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-md border border-rose-500/40 bg-rose-950/30 px-3 py-2.5 text-xs text-rose-200">
            조회 중 오류가 발생했습니다: {error instanceof Error ? error.message : String(error)}
          </div>
        ) : null}

        {markersQuery.error && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
            <span>마커 데이터를 읽지 못해 시설 완료 판정을 하지 못했습니다.</span>
          </div>
        )}

        {truncated && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
            <span>
              최근 {INCOMPLETE_LIMIT}건까지만 표시됩니다. 날짜나 팀 필터로 범위를 좁혀 주세요.
            </span>
          </div>
        )}

        <div className="rounded-md border border-slate-800 bg-slate-900/40">
          <table className="w-full table-fixed border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900 text-left text-slate-400">
                <th className="w-[96px] px-3 py-2 font-medium truncate whitespace-nowrap">작업일</th>
                <th className="w-[72px] px-2 py-2 font-medium truncate whitespace-nowrap">팀</th>
                <th className="px-3 py-2 font-medium truncate whitespace-nowrap">국소명</th>
                <th className="px-3 py-2 font-medium truncate whitespace-nowrap">사유</th>
                <th className="w-[104px] px-2 py-2 font-medium truncate whitespace-nowrap">후속 일정</th>
                <th className="w-[228px] px-3 py-2 text-right font-medium truncate whitespace-nowrap">
                  작업
                </th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-400 whitespace-nowrap">
                    불러오는 중입니다...
                  </td>
                </tr>
              ) : visibleCells.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-400 whitespace-nowrap">
                    표시할 {status === "undone" ? "미시설" : "일부완료"} 국소가 없습니다.
                  </td>
                </tr>
              ) : (
                visibleCells.map((cell) => {
                  const rescheduled = isRescheduled(cell);
                  const installedDate = installedDateOf(cell, installedDates);
                  const teamLabel = columnLabelById.get(cell.columnId) ?? "-";
                  return (
                    <tr
                      key={cell.id}
                      className="border-b border-slate-800/70 last:border-b-0 hover:bg-slate-900/70"
                    >
                      <td className="px-3 py-2 text-slate-300 truncate whitespace-nowrap">
                        {cell.workDate}
                      </td>
                      <td className="px-2 py-2 text-slate-300 truncate whitespace-nowrap" title={teamLabel}>
                        {teamLabel}
                      </td>
                      <td
                        className="px-3 py-2 font-medium text-slate-100 truncate whitespace-nowrap"
                        title={cell.mainText}
                      >
                        {cell.mainText || "-"}
                      </td>
                      <td
                        className="px-3 py-2 text-slate-300 truncate whitespace-nowrap"
                        title={cell.result?.reason ?? ""}
                      >
                        {cell.result?.reason || "-"}
                      </td>
                      <td className="px-2 py-2 truncate whitespace-nowrap">
                        {rescheduled ? (
                          <span className="text-sky-300">{cell.result?.rescheduledTo}</span>
                        ) : installedDate ? (
                          <span className="text-emerald-300">{`시설일 ${installedDate.slice(5)}`}</span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleJumpToSchedule(cell)}
                            className="h-7 px-2 text-xs border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                          >
                            일정표에서 보기
                          </Button>
                          {isAdmin && (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingCell(cell)}
                                className="h-7 px-2 text-xs border-slate-700 bg-slate-900 text-sky-200 hover:bg-slate-800"
                              >
                                다시 잡기
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setExcludeItem({ label: cell.mainText })}
                                className="h-7 px-2 text-xs border-slate-700 bg-slate-900 text-rose-200 hover:bg-slate-800"
                              >
                                제외
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ScheduleResultDialog
        cell={editingCell}
        canEdit={isAdmin}
        onClose={() => setEditingCell(null)}
        onSaved={() => {
          void refresh();
        }}
      />

      <ScheduleExcludeDialog
        open={excludeItem !== null}
        onOpenChange={(open) => {
          if (!open) setExcludeItem(null);
        }}
        items={excludeItem ? [excludeItem] : []}
        onDone={() => {
          setExcludeItem(null);
          void refreshExcluded();
          void refresh();
        }}
        title="미완료 목록에서 제외"
      />
    </div>
  );
}
