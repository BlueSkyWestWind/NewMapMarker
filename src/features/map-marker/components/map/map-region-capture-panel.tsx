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
  /** 캡처에서 제외할 타일 인덱스 (격자 순서 기준) */
  excludedTiles?: Set<number>;
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
  excludedTiles,
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
  const [overlapPercent, setOverlapPercent] = useState(5);
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

    // 미리보기는 지도를 실제로 줌하지 않고, 현재 레벨의 뷰포트 span을
    // 목표 레벨로 환산해 격자를 즉시 계산한다. (레벨 변경 시 실시간 반영)
    setIsPreparing(true);
    setErrorMessage("");

    try {
      const viewportSize = {
        width: mapContainer.clientWidth || 1,
        height: mapContainer.clientHeight || 1,
      };
      const currentLevel = map.getLevel();
      const currentSpan = measureViewportSpan(map, viewportSize);
      const span =
        currentLevel === captureLevel
          ? currentSpan
          : estimateSpanAtLevel(currentSpan, currentLevel, captureLevel);
      // 지도를 줌하지 않고, 화면 투영 픽셀 기준으로 목표 레벨 격자를 정밀 계산
      const plan = buildCaptureGridPlan({
        map,
        captureLevel,
        bounds,
        viewportSpan: span,
        viewportSize,
        overlapRatio: Math.min(0.4, Math.max(0, overlapPercent / 100)),
      });

      setViewportSpan(span);
      setGridPlan(plan);
      setCurrentMapLevel(currentLevel);
      setPhase("preview");
      setProgressCurrent(0);
      setStitchedCanvas(null);
      setCapturedTiles([]);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "격자 계획을 만들지 못했습니다.";
      setErrorMessage(message);
      setGridPlan(null);
      setViewportSpan(null);
      setPhase("error");
    } finally {
      setIsPreparing(false);
    }
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
  const excludedCount = gridPlan
    ? gridPlan.tiles.reduce(
        (acc, _tile, index) => acc + (excludedTiles?.has(index) ? 1 : 0),
        0,
      )
    : 0;
  const activeTileCount = Math.max(0, tileCount - excludedCount);
  const isOverRecommended = activeTileCount > MAX_RECOMMENDED_CAPTURE_TILES;
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

    const desiredIds = desiredMarkerIdsKey
      ? desiredMarkerIdsKey.split(",")
      : [];
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

      // 미리보기에서 사용자가 본 격자를 그대로 사용한다.
      // (타일 중심은 위경도라 레벨과 무관하게 유효하고, dest는 촬영 후
      //  실제 중심으로 재보정되므로 여기서 투영 재계산은 하지 않는다 →
      //  제외 인덱스가 미리보기와 항상 일치)
      const fullPlan = gridPlan;

      // 사용자가 격자에서 제외한 타일을 건너뛴다 (dest 좌표는 유지 → 위치 보존)
      const plan: CaptureGridPlan = excludedTiles?.size
        ? {
            ...fullPlan,
            tiles: fullPlan.tiles.filter(
              (_tile, index) => !excludedTiles.has(index),
            ),
          }
        : fullPlan;

      if (plan.tiles.length === 0) {
        setErrorMessage("캡처할 격자가 없습니다. 최소 한 칸은 포함하세요.");
        setPhase("preview");
        return;
      }

      setProgressTotal(plan.tiles.length);

      const openedCount = await openInfoWindowsInBounds();
      if (cancelledRef.current) {
        restorePreviousSelection();
        return;
      }

      const result = await runGridCapture({
        plan,
        map,
        // idle + 타일 100% 로드를 별도로 기다리므로 고정 대기는 최소화
        settleMs: 150,
        setCenter: async (center) => {
          if (cancelledRef.current) {
            throw new Error("CAPTURE_CANCELLED");
          }
          map.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
          // 이동 완료(idle)까지 대기
          await waitForKakaoMapIdle(map);
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
          return captureMapViewport(mapContainer);
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
      activeTileCount={activeTileCount}
      excludedCount={excludedCount}
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
