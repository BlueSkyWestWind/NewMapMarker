"use client";

import { useEffect, useRef, useState } from "react";
import {
  CapturePanelView,
  type CapturePhase,
} from "@/features/map-marker/components/map/map-region-capture-panel-view";
import {
  MAX_MAP_LEVEL,
  MIN_MAP_LEVEL,
} from "@/features/map-marker/constants/map-config";
import {
  buildCaptureGridPlan,
  createCaptureTimestamp,
  downloadTilesAsZip,
  estimateSpanAtLevel,
  getMarkerIdsInBounds,
  MAX_RECOMMENDED_CAPTURE_TILES,
  measureViewportSpan,
  runGridCapture,
  type CaptureGridPlan,
  type CapturedTileImage,
  type MapBoundsLiteral,
} from "@/features/map-marker/lib/map-capture-stitch";
import { runCaptureOverlayLayout } from "@/features/map-marker/lib/capture-overlay-layout";
import {
  canvasToBlob,
  captureMapViewport,
  downloadBlob,
  waitForCaptureOverlays,
  waitForKakaoMapIdle,
} from "@/features/map-marker/lib/map-viewport-capture";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import type { MarkerRecord } from "@/features/map-marker/types/marker";

export interface CaptureGuideState {
  plan: CaptureGridPlan | null;
  viewportSpan: { latSpan: number; lngSpan: number } | null;
  capturedCount: number;
}

interface MapRegionCapturePanelProps {
  map: KakaoMap;
  mapContainer: HTMLElement;
  bounds: MapBoundsLiteral;
  /** 현재 지도에 표시 중인 마커 (필터 반영) */
  markers: MarkerRecord[];
  onClose: () => void;
  onReselectRegion: () => void;
  onGuideChange?: (guide: CaptureGuideState) => void;
}

function clampMapLevel(level: number): number {
  return Math.min(MAX_MAP_LEVEL, Math.max(MIN_MAP_LEVEL, level));
}

function buildLevelOptions(): number[] {
  const levels: number[] = [];
  for (let level = MIN_MAP_LEVEL; level <= MAX_MAP_LEVEL; level += 1) {
    levels.push(level);
  }
  return levels;
}

const LEVEL_OPTIONS = buildLevelOptions();

/**
 * 지정 범위를 캡처 레벨 격자로 자동 촬영·합성한다.
 */
export function MapRegionCapturePanel({
  map,
  mapContainer,
  bounds,
  markers,
  onClose,
  onReselectRegion,
  onGuideChange,
}: MapRegionCapturePanelProps) {
  const setSelectedMarkerIds = useMapMarkerStore(
    (state) => state.setSelectedMarkerIds,
  );
  const setInfoWindowCaptureMode = useMapMarkerStore(
    (state) => state.setInfoWindowCaptureMode,
  );
  const [overlapPercent, setOverlapPercent] = useState(20);
  const [includeInfoWindows, setIncludeInfoWindows] = useState(true);
  const [captureLevel, setCaptureLevel] = useState(() =>
    clampMapLevel(map.getLevel()),
  );
  const [gridPlan, setGridPlan] = useState<CaptureGridPlan | null>(null);
  const [viewportSpan, setViewportSpan] = useState<{
    latSpan: number;
    lngSpan: number;
  } | null>(null);
  const [phase, setPhase] = useState<CapturePhase>("preview");
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stitchedCanvas, setStitchedCanvas] =
    useState<HTMLCanvasElement | null>(null);
  const [capturedTiles, setCapturedTiles] = useState<CapturedTileImage[]>([]);
  const [isPreparing, setIsPreparing] = useState(false);
  const [currentMapLevel, setCurrentMapLevel] = useState(() => map.getLevel());

  const cancelledRef = useRef(false);
  const previousSelectionRef = useRef<string[] | null>(null);
  const onGuideChangeRef = useRef(onGuideChange);
  onGuideChangeRef.current = onGuideChange;
  const previewUrlRef = useRef(previewUrl);
  previewUrlRef.current = previewUrl;

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      setInfoWindowCaptureMode(false);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      onGuideChangeRef.current?.({
        plan: null,
        viewportSpan: null,
        capturedCount: 0,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, []);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    if (phaseRef.current === "capturing") return;

    let cancelled = false;

    const rebuildPlan = async () => {
      setIsPreparing(true);
      setErrorMessage("");

      try {
        if (map.getLevel() !== captureLevel) {
          map.setLevel(captureLevel);
          await waitForKakaoMapIdle(map);
        }

        if (cancelled || cancelledRef.current) return;

        const viewportSize = {
          width: mapContainer.clientWidth || 1,
          height: mapContainer.clientHeight || 1,
        };
        const span = measureViewportSpan(map, viewportSize);
        const plan = buildCaptureGridPlan({
          map,
          bounds,
          viewportSpan: span,
          viewportSize,
          overlapRatio: Math.min(0.4, Math.max(0, overlapPercent / 100)),
        });

        if (cancelled || cancelledRef.current) return;

        setViewportSpan(span);
        setGridPlan(plan);
        setCurrentMapLevel(map.getLevel());
        setPhase("preview");
        setProgressCurrent(0);
        setStitchedCanvas(null);
        setCapturedTiles([]);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      } catch (error) {
        if (cancelled || cancelledRef.current) return;

        try {
          const viewportSize = {
            width: mapContainer.clientWidth || 1,
            height: mapContainer.clientHeight || 1,
          };
          const currentLevel = map.getLevel();
          const currentSpan = measureViewportSpan(map, viewportSize);
          const span = estimateSpanAtLevel(
            currentSpan,
            currentLevel,
            captureLevel,
          );
          const plan = buildCaptureGridPlan({
            bounds,
            viewportSpan: span,
            viewportSize,
            overlapRatio: Math.min(0.4, Math.max(0, overlapPercent / 100)),
          });
          setViewportSpan(span);
          setGridPlan(plan);
          setPhase("preview");
        } catch {
          const message =
            error instanceof Error
              ? error.message
              : "격자 계획을 만들지 못했습니다.";
          setErrorMessage(message);
          setGridPlan(null);
          setViewportSpan(null);
          setPhase("error");
        }
      } finally {
        if (!cancelled) setIsPreparing(false);
      }
    };

    void rebuildPlan();

    return () => {
      cancelled = true;
    };
  }, [bounds, captureLevel, map, mapContainer, overlapPercent]);

  useEffect(() => {
    onGuideChangeRef.current?.({
      plan: gridPlan,
      viewportSpan,
      capturedCount: progressCurrent,
    });
  }, [gridPlan, viewportSpan, progressCurrent]);

  useEffect(() => {
    if (!window.kakao?.maps) return;

    const syncLevel = () => setCurrentMapLevel(map.getLevel());
    window.kakao.maps.event.addListener(map, "zoom_changed", syncLevel);
    window.kakao.maps.event.addListener(map, "idle", syncLevel);

    return () => {
      window.kakao.maps.event.removeListener(map, "zoom_changed", syncLevel);
      window.kakao.maps.event.removeListener(map, "idle", syncLevel);
    };
  }, [map]);

  const tileCount = gridPlan?.tiles.length ?? 0;
  const isOverRecommended = tileCount > MAX_RECOMMENDED_CAPTURE_TILES;
  const isLevelMismatch = currentMapLevel !== captureLevel;
  const isBusy = phase === "capturing" || isPreparing;
  const markersInBoundsCount = getMarkerIdsInBounds(markers, bounds).length;

  // 미리보기 단계에서 정보창을 미리 열어 사용자가 원하는 위치로 드래그할 수 있게 한다.
  // (자동 배치를 하지 않고, 캡처 시 이 위치를 그대로 촬영)
  // 값이 실제로 바뀔 때만 상태를 갱신해 무한 렌더 루프를 방지한다.
  const desiredMarkerIdsKey = includeInfoWindows
    ? getMarkerIdsInBounds(markers, bounds).join(",")
    : "";

  useEffect(() => {
    if (phaseRef.current === "capturing") return;

    const store = useMapMarkerStore.getState();

    if (!includeInfoWindows) {
      if (store.isInfoWindowCaptureMode) setInfoWindowCaptureMode(false);
      return;
    }

    if (previousSelectionRef.current === null) {
      previousSelectionRef.current = [...store.selectedMarkerIds];
    }

    if (!store.isInfoWindowCaptureMode) setInfoWindowCaptureMode(true);

    const desiredIds = desiredMarkerIdsKey ? desiredMarkerIdsKey.split(",") : [];
    if (store.selectedMarkerIds.join(",") !== desiredMarkerIdsKey) {
      setSelectedMarkerIds(desiredIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store setters are stable
  }, [includeInfoWindows, desiredMarkerIdsKey]);

  const restorePreviousSelection = () => {
    setInfoWindowCaptureMode(false);
    if (!previousSelectionRef.current) return;
    setSelectedMarkerIds(previousSelectionRef.current);
    previousSelectionRef.current = null;
  };

  const openInfoWindowsInBounds = async () => {
    if (!includeInfoWindows) return 0;

    const markerIds = getMarkerIdsInBounds(markers, bounds);
    if (previousSelectionRef.current === null) {
      previousSelectionRef.current = [
        ...useMapMarkerStore.getState().selectedMarkerIds,
      ];
    }

    // 정보창이 열려 있는지 확인 (사용자가 드래그해 둔 위치를 그대로 사용)
    setInfoWindowCaptureMode(true);
    setSelectedMarkerIds(markerIds);

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
    await waitForCaptureOverlays(mapContainer, markerIds.length, 2500);
    runCaptureOverlayLayout();
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 80);
    });
    return markerIds.length;
  };

  const handleStartCapture = async () => {
    if (!gridPlan) return;

    cancelledRef.current = false;
    setPhase("capturing");
    setProgressCurrent(0);
    setProgressTotal(gridPlan.tiles.length);
    setErrorMessage("");
    setStitchedCanvas(null);
    setCapturedTiles([]);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    try {
      if (map.getLevel() !== captureLevel) {
        map.setLevel(captureLevel);
        await waitForKakaoMapIdle(map);
      }

      // 레벨 적용 후 화면 투영 기준으로 격자 재계산
      const viewportSize = {
        width: mapContainer.clientWidth || 1,
        height: mapContainer.clientHeight || 1,
      };
      const span = measureViewportSpan(map, viewportSize);
      const plan = buildCaptureGridPlan({
        map,
        bounds,
        viewportSpan: span,
        viewportSize,
        overlapRatio: Math.min(0.4, Math.max(0, overlapPercent / 100)),
      });
      setViewportSpan(span);
      setGridPlan(plan);
      setProgressTotal(plan.tiles.length);

      const openedCount = await openInfoWindowsInBounds();
      if (cancelledRef.current) {
        restorePreviousSelection();
        return;
      }

      const result = await runGridCapture({
        plan,
        map,
        settleMs: 500,
        setCenter: async (center) => {
          if (cancelledRef.current) {
            throw new Error("CAPTURE_CANCELLED");
          }
          map.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
        },
        getCenter: () => {
          const center = map.getCenter();
          return { lat: center.getLat(), lng: center.getLng() };
        },
        captureViewport: async () => {
          if (cancelledRef.current) {
            throw new Error("CAPTURE_CANCELLED");
          }
          // 타일마다 현재 화면 기준으로 정보창을 다시 배치 (잘림·겹침 방지)
          if (includeInfoWindows && openedCount > 0) {
            await waitForCaptureOverlays(mapContainer, 1, 800);
            runCaptureOverlayLayout();
          }
          return captureMapViewport(mapContainer, map);
        },
        onProgress: (current, total) => {
          if (cancelledRef.current) return;
          setProgressCurrent(current);
          setProgressTotal(total);
        },
      });

      if (cancelledRef.current) {
        restorePreviousSelection();
        return;
      }

      const blob = await canvasToBlob(result.stitched);
      const url = URL.createObjectURL(blob);
      setStitchedCanvas(result.stitched);
      setCapturedTiles(result.tiles);
      setPreviewUrl(url);
      setProgressCurrent(result.tiles.length);
      setPhase("done");
    } catch (error) {
      if (
        cancelledRef.current ||
        (error instanceof Error && error.message === "CAPTURE_CANCELLED")
      ) {
        setPhase("preview");
        setProgressCurrent(0);
        restorePreviousSelection();
        return;
      }
      const message =
        error instanceof Error ? error.message : "자동 캡처에 실패했습니다.";
      setErrorMessage(message);
      setPhase("error");
    } finally {
      if (!cancelledRef.current) {
        restorePreviousSelection();
      }
    }
  };

  const handleCancelCapture = () => {
    cancelledRef.current = true;
    setPhase("preview");
    setProgressCurrent(0);
    setErrorMessage("캡처가 취소되었습니다.");
    restorePreviousSelection();
  };

  const handleDownloadPng = async () => {
    if (!stitchedCanvas) return;
    const stamp = createCaptureTimestamp();
    downloadBlob(await canvasToBlob(stitchedCanvas), `map-stitch-${stamp}.png`);
  };

  const handleDownloadZip = async () => {
    if (capturedTiles.length === 0) return;
    const stamp = createCaptureTimestamp();
    await downloadTilesAsZip(capturedTiles, `map-tiles-${stamp}.zip`);
  };

  const progressRatio =
    progressTotal > 0
      ? Math.min(100, Math.round((progressCurrent / progressTotal) * 100))
      : 0;

  return (
    <CapturePanelView
      onClose={onClose}
      onReselectRegion={onReselectRegion}
      phase={phase}
      captureLevel={captureLevel}
      currentMapLevel={currentMapLevel}
      isLevelMismatch={isLevelMismatch}
      levelOptions={LEVEL_OPTIONS}
      onLevelChange={(value) => {
        setPhase("preview");
        setCaptureLevel(clampMapLevel(Number(value)));
      }}
      overlapPercent={overlapPercent}
      onOverlapChange={(value) => {
        setPhase("preview");
        setOverlapPercent(Math.min(40, Math.max(0, Number(value) || 0)));
      }}
      includeInfoWindows={includeInfoWindows}
      onToggleInfoWindows={setIncludeInfoWindows}
      markersInBoundsCount={markersInBoundsCount}
      isBusy={isBusy}
      isPreparing={isPreparing}
      gridPlan={gridPlan}
      tileCount={tileCount}
      isOverRecommended={isOverRecommended}
      progressCurrent={progressCurrent}
      progressTotal={progressTotal}
      progressRatio={progressRatio}
      capturedTilesCount={capturedTiles.length}
      hasStitched={!!stitchedCanvas}
      previewUrl={previewUrl}
      errorMessage={errorMessage}
      onStartCapture={() => void handleStartCapture()}
      onCancelCapture={handleCancelCapture}
      onDownloadZip={() => void handleDownloadZip()}
      onDownloadPng={() => void handleDownloadPng()}
    />
  );
}
