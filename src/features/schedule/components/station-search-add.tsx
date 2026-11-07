"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { useStationOptions } from "@/features/schedule/hooks/use-station-options";
import { searchStations } from "@/features/schedule/lib/station-search";
import { StationSuggestionList } from "./station-suggestion-list";

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
 * 국소 검색해서 추가. 국소명·통합시설코드·프로젝트코드·주소·별칭으로 등록된 장비 국소를 검색해 보여 주고,
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
  const options = useStationOptions();
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
        aria-autocomplete="list"
        value={query}
        disabled={disabled}
        autoComplete="off"
        placeholder="국소명·통합시설코드·프로젝트코드로 검색 — 고르면 목록에 추가됩니다(Enter: 입력한 이름 그대로 추가)"
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
        <StationSuggestionList
          floating
          results={results}
          activeIndex={activeIndex}
          addedLabels={existingSet}
          onPick={add}
        />
      ) : null}
    </div>
  );
}
