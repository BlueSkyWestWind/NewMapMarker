"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { SEARCH_RESULT_LIMIT, searchScheduleCells } from "@/features/schedule/api";
import { normalizeSearchQuery } from "@/features/schedule/lib/search-cells";
import { weekdayLabel } from "@/features/schedule/lib/week";
import { resultLabel, type ScheduleColumn } from "@/features/schedule/types";
import { RESULT_DOT_CLASS } from "./schedule-result-dialog";

/** 입력을 멈추고 이 시간(ms)이 지나면 조회한다. */
const DEBOUNCE_MS = 300;

interface ScheduleSearchProps {
  columns: ScheduleColumn[];
  /** 결과를 누르면 그 날짜로 이동한다(지금 보는 주간·월간 그대로). */
  onPick: (workDate: string) => void;
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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(text), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  // 바깥을 누르면 결과 목록을 닫는다.
  useEffect(() => {
    if (!isOpen) return;
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [isOpen]);

  const query = normalizeSearchQuery(debounced);
  const search = useQuery({
    queryKey: ["facility-schedule-search", userId, query],
    queryFn: () => searchScheduleCells(supabase!, query!),
    enabled: Boolean(supabase && userId && query),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const teamById = useMemo(
    () => new Map(columns.map((column) => [column.id, column.teamLabel])),
    [columns],
  );
  const results = search.data ?? [];
  const showPanel = isOpen && text.trim() !== "";

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
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-100"
          onClick={() => {
            setText("");
            setDebounced("");
          }}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}

      {showPanel ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-[26rem] max-w-[80vw] rounded-md border border-slate-700 bg-slate-900 shadow-lg">
          {!query ? (
            <p className="p-3 text-[11px] text-slate-400">두 글자 이상 입력해 주세요.</p>
          ) : search.isFetching && results.length === 0 ? (
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
                {results.length >= SEARCH_RESULT_LIMIT ? ` (최근 ${SEARCH_RESULT_LIMIT}건까지만 보입니다)` : ""}
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
                        onPick(cell.workDate);
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
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
