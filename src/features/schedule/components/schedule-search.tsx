"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import {
  SEARCH_RESULT_LIMIT,
  searchScheduleCellsFiltered,
} from "@/features/schedule/api";
import { NOTE_COLUMN_LABEL } from "@/features/schedule/lib/day-stations";
import { normalizeSearchQuery } from "@/features/schedule/lib/search-cells";
import type { SearchOptions } from "@/features/schedule/lib/search-filter";
import { isValidIso, weekdayLabel } from "@/features/schedule/lib/week";
import { resultLabel, type ScheduleCell, type ScheduleColumn } from "@/features/schedule/types";
import { RESULT_DOT_CLASS } from "./schedule-result-dialog";

/** 입력을 멈추고 이 시간(ms)이 지나면 조회한다. */
const DEBOUNCE_MS = 300;

interface ScheduleSearchProps {
  columns: ScheduleColumn[];
  /** 결과를 누르면 그 날짜로 이동하고 해당 칸을 강조한다(지금 보는 주간·월간 그대로). */
  onPick: (cell: ScheduleCell) => void;
}

/**
 * 국소 검색. 과거를 포함한 모든 날짜에서 그 국소가 일정에 잡힌 날을 최근 순으로 보여 준다.
 * 언제 시설했는지 찾을 때 쓴다. 결과를 누르면 그 날짜가 보이는 주·달로 이동한다.
 */
export function ScheduleSearch({ columns, onPick }: ScheduleSearchProps) {
  const { supabase, user } = useAuthSession();
  const userId = user?.id ?? null;
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [isOpen, setOpen] = useState(false);
  const [selectedColumnIds, setSelectedColumnIds] = useState<Set<string>>(() => new Set());
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [includeSub, setIncludeSub] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(text), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  // 바깥을 누르면 결과 목록을 닫는다(포털로 열리는 DatePicker 달력은 제외).
  useEffect(() => {
    if (!isOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('[role="dialog"]')) return;
      if (!containerRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [isOpen]);

  const filterColumns = useMemo(
    () =>
      [...columns]
        .filter((column) => column.teamLabel.trim() !== NOTE_COLUMN_LABEL)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [columns],
  );
  const sortedColumnIds = useMemo(
    () => Array.from(selectedColumnIds).sort(),
    [selectedColumnIds],
  );
  const invalidDateRange = fromDate !== "" && toDate !== "" && toDate < fromDate;
  const hasActiveFilter =
    selectedColumnIds.size > 0 || fromDate !== "" || toDate !== "" || includeSub;

  const optionsKey = useMemo(
    () =>
      JSON.stringify({
        columnIds: sortedColumnIds,
        from: fromDate || null,
        to: toDate || null,
        includeSub,
      }),
    [sortedColumnIds, fromDate, toDate, includeSub],
  );

  const query = normalizeSearchQuery(debounced);
  const search = useQuery({
    queryKey: ["facility-schedule-search", userId, query, optionsKey],
    queryFn: async () => {
      const options: SearchOptions = {
        columnIds: sortedColumnIds.length > 0 ? sortedColumnIds : undefined,
        from: fromDate || null,
        to: toDate || null,
        includeSub,
      };
      try {
        const res = await searchScheduleCellsFiltered(supabase!, query!, options);
        return { ...res, subFallback: false };
      } catch (error) {
        if (includeSub) {
          const fallback = await searchScheduleCellsFiltered(supabase!, query!, {
            ...options,
            includeSub: false,
          });
          return { ...fallback, subFallback: true };
        }
        throw error;
      }
    },
    enabled: Boolean(supabase && userId && query && !invalidDateRange),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const teamById = useMemo(
    () => new Map(columns.map((column) => [column.id, column.teamLabel])),
    [columns],
  );
  const results = search.data?.cells ?? [];
  const truncated = search.data?.truncated ?? false;
  const subFallback = search.data?.subFallback ?? false;
  const showPanel = isOpen && text.trim() !== "";

  const toggleColumn = (id: string) => {
    setSelectedColumnIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const resetFilters = () => {
    setSelectedColumnIds(new Set());
    setFromDate("");
    setToDate("");
    setIncludeSub(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Search
        className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <Input
        value={text}
        aria-label="국소 검색"
        placeholder="국소 검색 (언제 했는지 찾기)"
        autoComplete="off"
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className="h-8 w-56 border-slate-700 bg-slate-900 pl-7 pr-7 text-xs"
      />
      {text ? (
        <button
          type="button"
          aria-label="검색어 지우기"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:text-slate-100"
          onClick={() => {
            setText("");
            setDebounced("");
          }}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}

      {showPanel ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-[32rem] max-w-[90vw] rounded-md border border-slate-700 bg-slate-900 shadow-lg">
          <div className="flex flex-col gap-2 border-b border-slate-800 px-3 py-2 text-[11px]">
            {filterColumns.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                {filterColumns.map((column) => {
                  const active = selectedColumnIds.has(column.id);
                  return (
                    <button
                      key={column.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleColumn(column.id)}
                      className={cn(
                        "rounded border px-2 py-0.5 whitespace-nowrap",
                        active
                          ? "border-indigo-500 bg-indigo-600/30 text-indigo-100"
                          : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800",
                      )}
                    >
                      {column.teamLabel}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <DatePicker
                  ariaLabel="검색 시작 날짜"
                  placeholder="시작일"
                  value={fromDate}
                  onChange={(next) => {
                    if (next === "" || isValidIso(next)) setFromDate(next);
                  }}
                  className="w-32"
                />
                {fromDate ? (
                  <button
                    type="button"
                    aria-label="시작 날짜 비우기"
                    onClick={() => setFromDate("")}
                    className="rounded p-0.5 text-slate-400 hover:text-slate-100"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                ) : null}
              </div>
              <span className="text-slate-500">~</span>
              <div className="flex items-center gap-1">
                <DatePicker
                  ariaLabel="검색 끝 날짜"
                  placeholder="종료일"
                  value={toDate}
                  onChange={(next) => {
                    if (next === "" || isValidIso(next)) setToDate(next);
                  }}
                  className="w-32"
                />
                {toDate ? (
                  <button
                    type="button"
                    aria-label="끝 날짜 비우기"
                    onClick={() => setToDate("")}
                    className="rounded p-0.5 text-slate-400 hover:text-slate-100"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                ) : null}
              </div>

              <label className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap text-slate-300">
                <input
                  type="checkbox"
                  checked={includeSub}
                  onChange={(event) => setIncludeSub(event.target.checked)}
                  className="h-3.5 w-3.5 rounded-sm border-slate-600 bg-slate-900 accent-indigo-500"
                />
                메모 포함
              </label>

              {hasActiveFilter ? (
                <div className="ml-auto flex items-center gap-1.5 whitespace-nowrap">
                  <span className="text-sky-300">필터 적용 중</span>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                  >
                    초기화
                  </button>
                </div>
              ) : null}
            </div>

            {invalidDateRange ? (
              <p className="text-rose-400">끝 날짜가 시작 날짜보다 빠릅니다</p>
            ) : null}
          </div>

          {!query ? (
            <p className="p-3 text-[11px] text-slate-400">두 글자 이상 입력해 주세요.</p>
          ) : invalidDateRange ? null : search.isFetching && results.length === 0 ? (
            <p className="p-3 text-[11px] text-slate-400">찾는 중…</p>
          ) : search.error ? (
            <p className="p-3 text-[11px] text-rose-400">
              검색하지 못했습니다. {search.error instanceof Error ? search.error.message : ""}
            </p>
          ) : results.length === 0 ? (
            <p className="p-3 text-[11px] text-slate-400">일정에 없는 국소입니다.</p>
          ) : (
            <>
              <p className="border-b border-slate-800 px-3 py-1.5 text-[11px] text-slate-400">
                {results.length}건 · 최근 날짜순
                {subFallback ? " · 메모 검색을 쓰지 못해 국소 글만 찾았습니다" : ""}
              </p>
              <ul className="max-h-80 overflow-y-auto py-1">
                {results.map((cell) => (
                  <li key={cell.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
                        "hover:bg-slate-800 focus-visible:bg-slate-800 focus-visible:outline-none",
                      )}
                      onClick={() => {
                        onPick(cell);
                        setOpen(false);
                      }}
                    >
                      <span className="shrink-0 whitespace-nowrap font-semibold text-slate-200">
                        {cell.workDate} ({weekdayLabel(cell.workDate)})
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-slate-400">
                        {teamById.get(cell.columnId) ?? "-"}
                      </span>
                      <span className="min-w-0 flex-1 truncate whitespace-nowrap" title={cell.mainText}>
                        {cell.mainText}
                      </span>
                      {cell.result ? (
                        <span
                          className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-slate-300"
                          title={cell.result.reason || undefined}
                        >
                          <span
                            className={cn("inline-block h-1.5 w-1.5 rounded-full", RESULT_DOT_CLASS[cell.result.status])}
                            aria-hidden
                          />
                          {resultLabel(cell.result.status)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
              {truncated ? (
                <p className="border-t border-slate-800 px-3 py-1.5 text-[11px] text-amber-300">
                  최근 {SEARCH_RESULT_LIMIT}건만 표시합니다. 팀·기간으로 좁혀 보세요
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
