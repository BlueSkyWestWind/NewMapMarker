"use client";

import { useEffect, useState } from "react";
import {
  Camera,
  CircleDot,
  Layers,
  LocateFixed,
  Minus,
  PieChart,
  Plus,
  Shapes,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_LEVEL,
  MAX_MAP_LEVEL,
  MIN_MAP_LEVEL,
} from "@/features/map-marker/constants/map-config";

interface MapFloatingControlsProps {
  map: KakaoMap | null;
  onStartRegionCapture?: () => void;
}

function clampMapLevel(level: number) {
  return Math.min(MAX_MAP_LEVEL, Math.max(MIN_MAP_LEVEL, level));
}

export function MapFloatingControls({
  map,
  onStartRegionCapture,
}: MapFloatingControlsProps) {
  const mode = useMapMarkerStore((state) => state.mode);
  const isClusteringEnabled = useMapMarkerStore(
    (state) => state.isClusteringEnabled,
  );
  const clusterIconStyle = useMapMarkerStore((state) => state.clusterIconStyle);
  const isCadastralMode = useMapMarkerStore((state) => state.isCadastralMode);
  const setClusteringEnabled = useMapMarkerStore(
    (state) => state.setClusteringEnabled,
  );
  const setClusterIconStyle = useMapMarkerStore(
    (state) => state.setClusterIconStyle,
  );
  const setCadastralMode = useMapMarkerStore((state) => state.setCadastralMode);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_MAP_LEVEL);

  useEffect(() => {
    if (!map || !window.kakao?.maps) return;

    const syncZoomLevel = () => {
      setZoomLevel(map.getLevel());
    };

    syncZoomLevel();
    window.kakao.maps.event.addListener(map, "zoom_changed", syncZoomLevel);

    return () => {
      window.kakao?.maps.event.removeListener(
        map,
        "zoom_changed",
        syncZoomLevel,
      );
    };
  }, [map]);

  const applyZoomLevel = (nextLevel: number) => {
    if (!map) return;
    const level = clampMapLevel(nextLevel);
    if (level === map.getLevel()) return;
    map.setLevel(level, { animate: true });
    setZoomLevel(level);
  };

  const handleZoom = (delta: number) => {
    if (!map) return;
    applyZoomLevel(map.getLevel() + delta);
  };

  const handleMyLocation = () => {
    if (!map || !navigator.geolocation || !window.kakao?.maps) return;
    navigator.geolocation.getCurrentPosition((position) => {
      const latlng = new window.kakao.maps.LatLng(
        position.coords.latitude,
        position.coords.longitude,
      );
      map.setCenter(latlng);
      applyZoomLevel(3);
    });
  };

  const handleResetCenter = () => {
    if (!map || !window.kakao?.maps) return;
    map.setCenter(
      new window.kakao.maps.LatLng(
        DEFAULT_MAP_CENTER.lat,
        DEFAULT_MAP_CENTER.lng,
      ),
    );
    applyZoomLevel(DEFAULT_MAP_LEVEL);
  };

  const handleToggleClusterStyle = () => {
    setClusterIconStyle(clusterIconStyle === "donut" ? "pie" : "donut");
  };

  return (
    <div
      className="absolute bottom-4 right-4 z-10 flex flex-col items-center gap-2"
      data-capture-hide="true"
    >
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="h-9 w-9 bg-slate-900/90 text-slate-100"
        onClick={onStartRegionCapture}
        disabled={!map || !onStartRegionCapture}
        title="영역 격자 자동 캡처"
      >
        <Camera className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="h-9 w-9 bg-slate-900/90 text-slate-100"
        onClick={handleMyLocation}
        title="내 위치"
      >
        <LocateFixed className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="h-9 w-9 bg-slate-900/90 text-slate-100"
        onClick={() => setCadastralMode(!isCadastralMode)}
        title="지적편집도"
      >
        <Layers className={isCadastralMode ? "text-emerald-400" : ""} />
      </Button>
      {mode === "equipment" ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-9 w-9 bg-slate-900/90 text-slate-100"
          onClick={() => setClusteringEnabled(!isClusteringEnabled)}
          title="클러스터"
        >
          <Shapes className={isClusteringEnabled ? "text-emerald-400" : ""} />
        </Button>
      ) : null}
      {mode === "equipment" && isClusteringEnabled ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-9 w-9 bg-slate-900/90 text-slate-100"
          onClick={handleToggleClusterStyle}
          title={
            clusterIconStyle === "donut"
              ? "클러스터 스타일: 도넛 (클릭 시 파이)"
              : "클러스터 스타일: 파이 (클릭 시 도넛)"
          }
        >
          {clusterIconStyle === "donut" ? (
            <CircleDot className="h-4 w-4 text-emerald-400" />
          ) : (
            <PieChart className="h-4 w-4 text-emerald-400" />
          )}
        </Button>
      ) : null}

      <div className="flex flex-col items-center gap-1 rounded-lg bg-slate-900/90 px-2 py-2 shadow-lg">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-slate-100 hover:bg-slate-800"
          onClick={() => handleZoom(-1)}
          disabled={zoomLevel <= MIN_MAP_LEVEL}
          title="확대 (1단계)"
        >
          <Plus className="h-4 w-4" />
        </Button>

        <div
          className="flex h-28 w-8 items-center justify-center"
          title="드래그하여 확대/축소 (1레벨 단위)"
        >
          <input
            type="range"
            min={MIN_MAP_LEVEL}
            max={MAX_MAP_LEVEL}
            step={1}
            value={zoomLevel}
            onChange={(event) => {
              applyZoomLevel(Number(event.target.value));
            }}
            className="map-zoom-slider cursor-pointer appearance-none bg-transparent"
            aria-label="지도 확대 축소"
          />
        </div>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-slate-100 hover:bg-slate-800"
          onClick={() => handleZoom(1)}
          disabled={zoomLevel >= MAX_MAP_LEVEL}
          title="축소 (1단계)"
        >
          <Minus className="h-4 w-4" />
        </Button>

        <span
          className="mt-0.5 text-[10px] font-semibold tabular-nums text-slate-300"
          title={`현재 줌 레벨 ${zoomLevel} (작을수록 확대)`}
        >
          Lv {zoomLevel}
        </span>
      </div>

      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="h-9 w-9 bg-slate-900/90 text-slate-100"
        onClick={handleResetCenter}
        title="광주 시청"
      >
        G
      </Button>
    </div>
  );
}
