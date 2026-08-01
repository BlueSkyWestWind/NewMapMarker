"use client";

import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePlaceSearch } from "@/features/map-marker/hooks/use-place-search";

/**
 * 전역 장소 검색. `Ctrl+K`(macOS는 `⌘K`)로 어디서든 포커스를 가져온다.
 * 검색 자체는 `usePlaceSearch`를 쓰므로 사이드바 장소 검색과 결과가 항상 같다.
 */
export function TopSearchBar() {
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    query,
    setQuery,
    isSearching,
    status,
    isError,
    hasResult,
    runSearch,
    clearSearch,
  } = usePlaceSearch();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-950/80 px-4">
      <div className="relative w-full max-w-md">
        <Search
          className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500"
          aria-hidden
        />
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void runSearch();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              inputRef.current?.blur();
            }
          }}
          placeholder="장소, 주소 검색..."
          aria-label="전역 장소 검색"
          className="h-8 border-slate-700 bg-slate-900/60 pl-8 pr-16 text-xs"
        />
        <span className="pointer-events-none absolute right-2 top-1.5 rounded border border-slate-700 px-1 text-[10px] leading-5 text-slate-500">
          Ctrl K
        </span>
      </div>

      {status ? (
        <p
          className={`min-w-0 truncate text-[10px] ${isError ? "text-rose-400" : "text-slate-400"}`}
          title={status}
        >
          {isSearching ? "검색 중..." : status}
        </p>
      ) : null}

      {hasResult ? (
        <button
          type="button"
          onClick={clearSearch}
          title="경계 지우기"
          className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
