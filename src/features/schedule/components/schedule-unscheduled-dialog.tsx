"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { createScheduleCell, fetchScheduleCells } from "@/features/schedule/api";
import { MAX_ROWS } from "@/features/schedule/lib/cell-grid";
import {
  UNSCHEDULED_PARTNER,
  useUnscheduledStations,
} from "@/features/schedule/hooks/use-unscheduled-stations";
import { NOTE_COLUMN_LABEL } from "@/features/schedule/lib/day-stations";
import { nextFreeRows } from "@/features/schedule/lib/unscheduled-stations";
import { isValidIso } from "@/features/schedule/lib/week";
import type { ScheduleColumn } from "@/features/schedule/types";
import { useToast } from "@/hooks/use-toast";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const normalizeQuery = (value: string) => value.toLowerCase().replace(/\s+/g, "");

interface ScheduleUnscheduledDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ScheduleColumn[];
  /** 추가할 날짜의 처음 값 */
  defaultDate: string;
  /** 추가한 뒤 일정표를 다시 읽는다 */
  onAdded: () => void;
}

/**
 * 미배정 국소: 시설일이 없고 오늘 이후 일정에도 없는 장비 국소를 조회해, 고른 국소를
 * 선택한 날짜·팀 칸에 행으로 이어 붙인다. 표는 줄바꿈 없이 말줄임으로 보인다(전체 글은 툴팁).
 */
export function ScheduleUnscheduledDialog({
  open,
  onOpenChange,
  columns,
  defaultDate,
  onAdded,
}: ScheduleUnscheduledDialogProps) {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const { stations, isLoading, error } = useUnscheduledStations(open);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [date, setDate] = useState(defaultDate);
  const [columnId, setColumnId] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const addingRef = useRef(false);

  // 비고 열에는 국소를 넣지 않는다(일정 국소 집계에서도 빠지는 열).
  const sortedColumns = useMemo(
    () => columns.filter((column) => column.teamLabel.trim() !== NOTE_COLUMN_LABEL).sort((a, b) => a.sortOrder - b.sortOrder),
    [columns],
  );
  const effectiveColumnId = columnId || sortedColumns[0]?.id || "";

  const shown = useMemo(() => {
    const needle = normalizeQuery(query);
    if (needle === "") return stations;
    return stations.filter((station) =>
      normalizeQuery(
        [
          station.label,
          station.address,
          station.facilityCode,
          station.projectCode,
          station.method,
          station.businessType,
          station.eqType,
        ].join(" "),
      ).includes(needle),
    );
  }, [stations, query]);
  const pickedShown = shown.filter((station) => picked.has(station.id));
  const allShownPicked = shown.length > 0 && pickedShown.length === shown.length;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAllShown = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const station of shown) {
        if (allShownPicked) next.delete(station.id);
        else next.add(station.id);
      }
      return next;
    });

  const canAdd = !isAdding && pickedShown.length > 0 && isValidIso(date) && effectiveColumnId !== "";

  const handleAdd = async () => {
    if (!canAdd || addingRef.current || !supabase) return;
    addingRef.current = true;
    setIsAdding(true);
    const targets = pickedShown;
    let added = 0;
    try {
      // 저장 시점의 그 칸 행 번호를 읽어 그 다음 행부터 넣는다.
      const dayCells = await fetchScheduleCells(supabase, date, date);
      const used = dayCells.filter((cell) => cell.columnId === effectiveColumnId).map((cell) => cell.rowNo);
      const rows = nextFreeRows(used, targets.length, MAX_ROWS);
      for (let index = 0; index < rows.length; index += 1) {
        await createScheduleCell(
          supabase,
          { workDate: date, columnId: effectiveColumnId, rowNo: rows[index] },
          { mainText: targets[index].label, subText: "", textColor: null },
        );
        added += 1;
      }
      const skipped = targets.length - added;
      toast({
        title: `${added}건을 일정에 추가했습니다`,
        description: skipped > 0 ? `행이 모자라 ${skipped}건은 넣지 못했습니다.` : `${date}`,
        variant: skipped > 0 ? "destructive" : undefined,
      });
    } catch (cause) {
      toast({
        title: added > 0 ? `${added}건만 추가하고 멈췄습니다` : "추가하지 못했습니다",
        description: errorMessage(cause),
        variant: "destructive",
      });
    } finally {
      addingRef.current = false;
      setIsAdding(false);
      if (added > 0) {
        // 추가한 국소는 목록에서 빠지므로(오늘 이후 일정에 생겼다면) 선택에서도 지운다.
        setPicked(new Set());
        onAdded();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isAdding && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90vh] w-[min(1400px,96vw)] max-w-none flex-col gap-3 p-5">
        <DialogTitle className="text-base">미배정 국소</DialogTitle>
        <DialogDescription className="text-xs text-slate-400">
          시설일이 없고 오늘 이후 시설일정에도 없는 장비 국소입니다(업체: {UNSCHEDULED_PARTNER}). 체크한 국소를 아래에서 고른 날짜·팀 칸에 추가합니다.
        </DialogDescription>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            aria-label="미배정 국소 검색"
            placeholder="국소명·주소·통합시설코드·프로젝트코드"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 w-72 border-slate-700 bg-slate-900 text-xs"
          />
          <span className="whitespace-nowrap text-xs text-slate-300">
            {shown.length}건{query.trim() ? ` (전체 ${stations.length}건)` : ""} · 선택 {pickedShown.length}건
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-800">
          {error ? (
            <p className="p-4 text-sm text-rose-400">불러오지 못했습니다. {errorMessage(error)}</p>
          ) : isLoading ? (
            <p className="p-4 text-sm text-slate-400">불러오는 중...</p>
          ) : shown.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">
              {stations.length === 0 ? "조건에 맞는 국소가 없습니다." : "검색 결과가 없습니다."}
            </p>
          ) : (
            <table className="w-full table-fixed border-separate border-spacing-0 text-sm text-slate-100">
              <colgroup>
                <col style={{ width: 40 }} />
                <col style={{ width: 300 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 150 }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  {[
                    <input
                      key="all"
                      type="checkbox"
                      aria-label="보이는 국소 전체 선택"
                      checked={allShownPicked}
                      onChange={toggleAllShown}
                      className="h-3.5 w-3.5 rounded-sm border-slate-600 bg-slate-900 accent-indigo-500"
                    />,
                    "국소명",
                    "통합시설코드",
                    "프로젝트코드",
                    "방식",
                    "사업구분",
                    "장비최종",
                    "주소",
                  ].map((head, index) => (
                    <th
                      key={index}
                      className="sticky top-0 z-10 truncate whitespace-nowrap border-b border-slate-700 bg-slate-900 px-2 py-1.5 text-center font-semibold"
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((station) => (
                  <tr
                    key={station.id}
                    onClick={() => toggle(station.id)}
                    className={picked.has(station.id) ? "cursor-pointer bg-indigo-950/60" : "cursor-pointer hover:bg-slate-800/60"}
                  >
                    <td className="border-b border-slate-800 px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${station.label} 선택`}
                        checked={picked.has(station.id)}
                        onChange={() => toggle(station.id)}
                        onClick={(event) => event.stopPropagation()}
                        className="h-3.5 w-3.5 rounded-sm border-slate-600 bg-slate-900 accent-indigo-500"
                      />
                    </td>
                    {[
                      station.label,
                      station.facilityCode,
                      station.projectCode,
                      station.method,
                      station.businessType,
                      station.eqType,
                      station.address,
                    ].map((value, index) => (
                      <td
                        key={index}
                        title={value}
                        className="truncate whitespace-nowrap border-b border-slate-800 px-2 py-1.5"
                      >
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 pt-3">
          <span className="text-xs text-slate-400">추가할 칸</span>
          <DatePicker ariaLabel="추가할 날짜" value={date} onChange={(next) => isValidIso(next) && setDate(next)} className="w-36" />
          <select
            aria-label="추가할 팀"
            value={effectiveColumnId}
            disabled={isAdding}
            onChange={(event) => setColumnId(event.target.value)}
            className="h-8 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
          >
            {sortedColumns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.teamLabel}
                {column.leaderLabel ? ` · ${column.leaderLabel}` : ""}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            disabled={isAdding}
            onClick={() => onOpenChange(false)}
            className="h-8 border-slate-700 text-xs text-slate-200"
          >
            닫기
          </Button>
          <Button
            type="button"
            disabled={!canAdd}
            onClick={() => void handleAdd()}
            className="h-8 bg-indigo-600 text-xs hover:bg-indigo-500"
          >
            {isAdding ? "추가 중…" : `일정에 추가 (${pickedShown.length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
