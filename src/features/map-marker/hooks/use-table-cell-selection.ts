"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cellRangeKeys } from "@/features/map-marker/lib/table-tsv";

/**
 * 표 셀을 마우스로 드래그해 사각형으로 고르는 상태.
 * 드래그가 표 밖에서 끝나도 선택이 끝나도록 창 전체의 mouseup도 듣는다.
 */
export function useTableCellSelection() {
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const dragStart = useRef<{ r: number; c: number } | null>(null);
  const isDragging = useRef(false);

  const handleMouseDown = (r: number, c: number) => {
    isDragging.current = true;
    dragStart.current = { r, c };
    setSelectedCells(new Set([`${r},${c}`]));
  };

  const handleMouseOver = (r: number, c: number) => {
    if (!isDragging.current || !dragStart.current) return;
    setSelectedCells(cellRangeKeys(dragStart.current, { r, c }));
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    dragStart.current = null;
  };

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  // 상세 조회 effect의 의존성이므로 렌더마다 바뀌지 않아야 한다.
  const clearSelection = useCallback(() => setSelectedCells(new Set()), []);

  return {
    selectedCells,
    clearSelection,
    handleMouseDown,
    handleMouseOver,
    handleMouseUp,
  };
}
