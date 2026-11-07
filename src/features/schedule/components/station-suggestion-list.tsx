"use client";

import { cn } from "@/lib/utils";
import type { StationOption } from "@/features/schedule/lib/station-search";

interface StationSuggestionListProps {
  results: StationOption[];
  activeIndex: number;
  /** 항목을 골랐다(마우스 누름 시점) */
  onPick: (label: string) => void;
  /** 주면 각 항목 앞에 체크 칸을 보이고, 이미 추가된 국소는 체크로 표시한다(여러 개 추가용) */
  addedLabels?: Set<string>;
  /** true면 입력창 아래에 떠서 보이고, false면 글 흐름 안에 펼쳐진다 */
  floating?: boolean;
  className?: string;
}

function codesLine(option: StationOption): string {
  return [
    option.facilityCode ? `통합시설코드 ${option.facilityCode}` : "",
    option.projectCode ? `프로젝트 ${option.projectCode}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * 국소 검색 결과 목록. 국소명 아래에 주소와 통합시설코드·프로젝트코드를 보여 준다.
 * 선택은 `mousedown`에서 처리해 입력창의 blur보다 먼저 반영된다.
 */
export function StationSuggestionList({
  results,
  activeIndex,
  onPick,
  addedLabels,
  floating = false,
  className,
}: StationSuggestionListProps) {
  return (
    <ul
      role="listbox"
      aria-multiselectable={addedLabels ? true : undefined}
      className={cn(
        "max-h-56 overflow-y-auto rounded-md border border-slate-700 bg-slate-950 py-1 shadow-lg",
        floating && "absolute left-0 right-0 top-full z-50 mt-1",
        className,
      )}
    >
      {results.map((option, index) => {
        const added = addedLabels?.has(option.label) ?? false;
        const codes = codesLine(option);
        return (
          <li
            key={option.label}
            role="option"
            aria-selected={addedLabels ? added : index === activeIndex}
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(option.label);
            }}
            className={cn(
              "flex cursor-pointer items-center gap-2 px-2 py-1 text-xs",
              index === activeIndex ? "bg-slate-800" : "hover:bg-slate-800",
            )}
          >
            {addedLabels ? (
              <span
                aria-hidden
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[11px] leading-none",
                  added ? "border-indigo-400 bg-indigo-600 text-white" : "border-slate-600",
                )}
              >
                {added ? "✓" : ""}
              </span>
            ) : null}
            <span className="min-w-0">
              <span className="block truncate whitespace-nowrap">{option.label}</span>
              {option.address ? (
                <span className="block truncate whitespace-nowrap text-[11px] opacity-70">
                  {option.address}
                </span>
              ) : null}
              {codes ? (
                <span className="block truncate whitespace-nowrap text-[11px] text-sky-300/80">
                  {codes}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
