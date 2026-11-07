"use client";

import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useMapMarkersQuery } from "@/features/map-marker/hooks/use-map-markers-query";
import { buildStationOptions, searchStations } from "@/features/schedule/lib/station-search";

interface StationSearchAddProps {
  query: string;
  onQueryChange: (value: string) => void;
  /** 이미 목록에 있는 국소명. 목록에서 체크 표시로 보여 준다. */
  existing: string[];
  /** 목록의 국소를 고르거나 직접 입력한 이름을 Enter로 추가한다 */
  onAdd: (label: string) => void;
  disabled?: boolean;
}

/**
 * 국소 검색해서 추가. 쓰는 동안 등록된 장비 국소(국소명·주소·별칭)를 검색해 보여 주고,
 * 클릭하면 일정 목록에 항목으로 추가된다. 고른 뒤에도 목록은 닫히지 않아 이어서 여러 개 고를 수 있다.
 * 목록에 없는 이름은 입력하고 Enter를 누르면 추가된다(이 입력창의 Enter는 폼을 저장하지 않는다).
 */
export function StationSearchAdd({
  query,
  onQueryChange,
  existing,
  onAdd,
  disabled,
}: StationSearchAddProps) {
  const listId = useId();
  const { data } = useMapMarkersQuery();
  const options = useMemo(
    () => buildStationOptions(data?.equipmentMarkers ?? []),
    [data?.equipmentMarkers],
  );
  const [isOpen, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const results = useMemo(
    () => (isOpen ? searchStations(options, query) : []),
    [isOpen, options, query],
  );
  const existingSet = useMemo(() => new Set(existing), [existing]);

  const add = (label: string) => {
    if (!existingSet.has(label.trim())) onAdd(label);
  };

  return (
    <div className="relative">
      <Input
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        disabled={disabled}
        autoComplete="off"
        placeholder="국소명 검색 — 고르면 목록에 추가됩니다(Enter: 입력한 이름 그대로 추가)"
        className="h-8 border-slate-700 bg-slate-900 text-xs"
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && results.length > 0) {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, results.length - 1));
          } else if (event.key === "ArrowUp" && results.length > 0) {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && (activeIndex >= 0 || query.trim() !== "")) {
            // 이 입력창의 Enter는 폼 저장으로 넘어가지 않는다.
            event.preventDefault();
            if (activeIndex >= 0 && results[activeIndex]) {
              add(results[activeIndex].label);
            } else {
              add(query);
              onQueryChange("");
              setOpen(false);
            }
          }
        }}
      />
      {results.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-slate-700 bg-slate-950 py-1 shadow-lg"
        >
          {results.map((option, index) => {
            const added = existingSet.has(option.label);
            return (
              <li
                key={option.label}
                role="option"
                aria-selected={added}
                // blur보다 먼저 처리해야 클릭이 먹고, 목록은 닫지 않아 이어서 고를 수 있다.
                onMouseDown={(event) => {
                  event.preventDefault();
                  add(option.label);
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-2 py-1 text-xs",
                  index === activeIndex ? "bg-slate-800" : "hover:bg-slate-800",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[11px] leading-none",
                    added ? "border-indigo-400 bg-indigo-600 text-white" : "border-slate-600",
                  )}
                >
                  {added ? "✓" : ""}
                </span>
                <span className="min-w-0">
                  <span className="block truncate whitespace-nowrap">{option.label}</span>
                  {option.address ? (
                    <span className="block truncate whitespace-nowrap text-[11px] opacity-70">
                      {option.address}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
