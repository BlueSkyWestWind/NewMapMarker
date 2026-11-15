"use client";

import { useCallback, useRef, useState } from "react";
import type { MapBoundsLiteral } from "@/features/map-marker/lib/map-capture-stitch";
import type { CaptureGuideState } from "@/features/map-marker/components/map/map-region-capture-panel";
import { nextExcludedTiles } from "@/features/map-marker/lib/capture-guide-state";

const INITIAL_CAPTURE_GUIDE: CaptureGuideState = {
  plan: null,
  viewportSpan: null,
  capturedCount: 0,
};

/**
 * 지도 영역 캡처 선택 모드·가이드·제외 타일 상태를 관리한다.
 */
export function useKakaoCaptureGuide() {
  const [isRegionSelectMode, setIsRegionSelectMode] = useState(false);
  const [isCapturePanelOpen, setIsCapturePanelOpen] = useState(false);
  const [captureBounds, setCaptureBounds] = useState<MapBoundsLiteral | null>(
    null,
  );
  const [captureGuide, setCaptureGuide] = useState<CaptureGuideState>(
    INITIAL_CAPTURE_GUIDE,
  );
  const [excludedTiles, setExcludedTiles] = useState<Set<number>>(
    () => new Set(),
  );
  const prevTileCountRef = useRef(0);

  // 격자 구성(레벨·겹침·범위)이 바뀌어 타일 수가 달라지면 제외 선택을 초기화한다.
  const handleCaptureGuideChange = useCallback((guide: CaptureGuideState) => {
    const count = guide.plan?.tiles.length ?? 0;
    const prevCount = prevTileCountRef.current;
    if (count !== prevCount) {
      prevTileCountRef.current = count;
      setExcludedTiles((prev) => nextExcludedTiles(prevCount, count, prev));
    }
    setCaptureGuide(guide);
  }, []);

  const handleToggleExcludedTile = useCallback((index: number) => {
    setExcludedTiles((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const resetCapture = useCallback(() => {
    setIsCapturePanelOpen(false);
    setCaptureBounds(null);
    setExcludedTiles(new Set());
    prevTileCountRef.current = 0;
    setCaptureGuide(INITIAL_CAPTURE_GUIDE);
  }, []);

  const startRegionSelect = useCallback(() => {
    resetCapture();
    setIsRegionSelectMode(true);
  }, [resetCapture]);

  const cancelRegionSelect = useCallback(() => {
    setIsRegionSelectMode(false);
  }, []);

  const completeRegion = useCallback((bounds: MapBoundsLiteral) => {
    setCaptureBounds(bounds);
    setIsRegionSelectMode(false);
    setIsCapturePanelOpen(true);
  }, []);

  const reselectRegion = useCallback(() => {
    resetCapture();
    setIsRegionSelectMode(true);
  }, [resetCapture]);

  const editRegion = useCallback(() => {
    setIsRegionSelectMode(true);
  }, []);

  return {
    isRegionSelectMode,
    isCapturePanelOpen,
    captureBounds,
    captureGuide,
    excludedTiles,
    handleCaptureGuideChange,
    handleToggleExcludedTile,
    setCaptureBounds,
    startRegionSelect,
    cancelRegionSelect,
    completeRegion,
    resetCapture,
    reselectRegion,
    editRegion,
  };
}
