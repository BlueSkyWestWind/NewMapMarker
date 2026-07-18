"use client";

import { useCallback, useRef, useState } from "react";

interface MapRegionSelectOverlayProps {
  onComplete: (rect: {
    clientX1: number;
    clientY1: number;
    clientX2: number;
    clientY2: number;
  }) => void;
  onCancel: () => void;
}

interface DragRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const MIN_DRAG_PX = 16;

/**
 * 지도 위에서 드래그로 캡처 범위를 지정한다.
 */
export function MapRegionSelectOverlay({
  onComplete,
  onCancel,
}: MapRegionSelectOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [dragRect, setDragRect] = useState<DragRect | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const toLocalPoint = useCallback(
    (clientX: number, clientY: number) => {
      const overlay = overlayRef.current;
      if (!overlay) return { x: clientX, y: clientY };
      const rect = overlay.getBoundingClientRect();
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    },
    [],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const point = toLocalPoint(event.clientX, event.clientY);
      dragStartRef.current = { x: event.clientX, y: event.clientY };
      setDragRect({
        x1: point.x,
        y1: point.y,
        x2: point.x,
        y2: point.y,
      });
    },
    [toLocalPoint],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStartRef.current) return;
      const startLocal = toLocalPoint(
        dragStartRef.current.x,
        dragStartRef.current.y,
      );
      const current = toLocalPoint(event.clientX, event.clientY);
      setDragRect({
        x1: startLocal.x,
        y1: startLocal.y,
        x2: current.x,
        y2: current.y,
      });
    },
    [toLocalPoint],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStartRef.current) return;

      const start = dragStartRef.current;
      dragStartRef.current = null;

      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // 이미 해제된 경우 무시
      }

      const width = Math.abs(event.clientX - start.x);
      const height = Math.abs(event.clientY - start.y);
      setDragRect(null);

      if (width < MIN_DRAG_PX || height < MIN_DRAG_PX) {
        return;
      }

      onComplete({
        clientX1: start.x,
        clientY1: start.y,
        clientX2: event.clientX,
        clientY2: event.clientY,
      });
    },
    [onComplete],
  );

  const left = dragRect ? Math.min(dragRect.x1, dragRect.x2) : 0;
  const top = dragRect ? Math.min(dragRect.y1, dragRect.y2) : 0;
  const width = dragRect ? Math.abs(dragRect.x2 - dragRect.x1) : 0;
  const height = dragRect ? Math.abs(dragRect.y2 - dragRect.y1) : 0;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-30 cursor-crosshair"
      data-capture-hide="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        dragStartRef.current = null;
        setDragRect(null);
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-slate-950/35" />
      <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-lg border border-slate-600 bg-slate-900/95 px-4 py-2 text-center text-sm text-slate-100 shadow-lg">
        드래그로 캡처 범위를 지정하세요
        <button
          type="button"
          className="pointer-events-auto ml-3 rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
          onClick={onCancel}
        >
          취소
        </button>
      </div>
      {dragRect ? (
        <div
          className="pointer-events-none absolute border-2 border-sky-400 bg-sky-400/15"
          style={{ left, top, width, height }}
        />
      ) : null}
    </div>
  );
}
