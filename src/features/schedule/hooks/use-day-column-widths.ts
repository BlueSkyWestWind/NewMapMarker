"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DAY_COLUMNS } from "@/features/schedule/lib/day-columns";

const STORAGE_KEY = "schedule-day-column-widths-v1";
/** 엑셀 열 폭(문자 수)을 화면 픽셀로 바꾸는 배율. 글자 크기(text-sm)에 맞춘다. */
const PX_PER_CHAR = 9;
const MIN_WIDTH = 48;
const MAX_WIDTH = 800;

export const CHECK_COLUMN_PX = 40;

const defaultWidths = (): Record<string, number> =>
  Object.fromEntries(DAY_COLUMNS.map((column) => [column.key, Math.round(column.widthChars * PX_PER_CHAR + 16)]));

const clamp = (value: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));

const readStored = (): Record<string, number> => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) result[key] = clamp(value);
    }
    return result;
  } catch {
    return {};
  }
};

/** 일자별 표의 열 폭(px). 헤더 경계를 끌어 바꾸고 브라우저에 기억한다. */
export function useDayColumnWidths() {
  const [widths, setWidths] = useState<Record<string, number>>(defaultWidths);
  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  // 하이드레이션 뒤에 저장값을 얹는다(서버 렌더와 어긋나지 않게).
  useEffect(() => {
    setWidths((prev) => ({ ...prev, ...readStored() }));
  }, []);

  const persist = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(widthsRef.current));
    } catch {
      // 저장 불가(사생활 보호 모드 등)면 이번 화면에서만 적용한다.
    }
  }, []);

  /** 헤더 경계의 pointerdown에서 호출. 끄는 동안 폭을 바꾸고 놓으면 저장한다. */
  const startResize = useCallback(
    (key: string, event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = widthsRef.current[key] ?? MIN_WIDTH;
      const onMove = (move: PointerEvent) => {
        setWidths((prev) => ({ ...prev, [key]: clamp(startWidth + move.clientX - startX) }));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        persist();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [persist],
  );

  /** 더블클릭: 기본 폭으로 되돌린다. */
  const resetWidth = useCallback(
    (key: string) => {
      setWidths((prev) => ({ ...prev, [key]: defaultWidths()[key] }));
      setTimeout(persist, 50);
    },
    [persist],
  );

  return { widths, startResize, resetWidth };
}
