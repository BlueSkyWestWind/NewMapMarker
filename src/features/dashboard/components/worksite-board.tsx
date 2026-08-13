"use client";

import { BookmarkCheck, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WorksiteRow } from "@/features/dashboard/components/worksite-row";
import type { BoardRow } from "@/features/dashboard/hooks/use-worksite-board";

interface WorksiteBoardProps {
  rows: BoardRow[];
  selectedSiteId: string | null;
  isAllOverlaysOpen: boolean;
  onSelect: (siteId: string) => void;
  onToggleAllOverlays: () => void;
  onRetry: (siteId: string) => void;
  onRemove: (siteId: string) => void;
  onClearAll: () => void;
}

/** 작업대상 목록. 상태를 갖지 않는 표시 전용 컴포넌트다. */
export function WorksiteBoard({
  rows,
  selectedSiteId,
  isAllOverlaysOpen,
  onSelect,
  onToggleAllOverlays,
  onRetry,
  onRemove,
  onClearAll,
}: WorksiteBoardProps) {
  return (
    <section className="space-y-2">
      <header className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-900/90 px-2 py-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-slate-200">
          <BookmarkCheck className="h-3.5 w-3.5 shrink-0 text-sky-400" aria-hidden />
          오늘의 작업 국소 ({rows.length}건)
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 px-1.5 text-[10px]",
              isAllOverlaysOpen
                ? "text-sky-300 hover:text-sky-200"
                : "text-slate-400 hover:text-slate-200",
            )}
            onClick={onToggleAllOverlays}
          >
            {isAllOverlaysOpen ? (
              <Eye className="mr-1 h-3 w-3" aria-hidden />
            ) : (
              <EyeOff className="mr-1 h-3 w-3" aria-hidden />
            )}
            {isAllOverlaysOpen ? "마커창 전체 숨김" : "마커창 전체 표시"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-rose-300 hover:text-rose-200"
            onClick={onClearAll}
          >
            전체 삭제
          </Button>
        </div>
      </header>

      <ul className="max-h-64 space-y-1.5 overflow-y-auto">
        {rows.map((row) => (
          <WorksiteRow
            key={row.site.id}
            row={row}
            isSelected={row.site.id === selectedSiteId}
            onSelect={() => onSelect(row.site.id)}
            onRetry={() => onRetry(row.site.id)}
            onRemove={() => onRemove(row.site.id)}
          />
        ))}
      </ul>
    </section>
  );
}
