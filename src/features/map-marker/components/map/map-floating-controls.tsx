'use client';

import {
  Layers,
  LocateFixed,
  Minus,
  Plus,
  Shapes,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import { DEFAULT_MAP_CENTER } from '@/features/map-marker/constants/map-config';

interface MapFloatingControlsProps {
  map: KakaoMap | null;
}

export function MapFloatingControls({ map }: MapFloatingControlsProps) {
  const mode = useMapMarkerStore((state) => state.mode);
  const isClusteringEnabled = useMapMarkerStore(
    (state) => state.isClusteringEnabled,
  );
  const isCadastralMode = useMapMarkerStore((state) => state.isCadastralMode);
  const setClusteringEnabled = useMapMarkerStore(
    (state) => state.setClusteringEnabled,
  );
  const setCadastralMode = useMapMarkerStore((state) => state.setCadastralMode);

  const handleZoom = (delta: number) => {
    if (!map) return;
    map.setLevel(Math.max(1, map.getLevel() + delta));
  };

  const handleMyLocation = () => {
    if (!map || !navigator.geolocation || !window.kakao?.maps) return;
    navigator.geolocation.getCurrentPosition((position) => {
      const latlng = new window.kakao.maps.LatLng(
        position.coords.latitude,
        position.coords.longitude,
      );
      map.setCenter(latlng);
      map.setLevel(3);
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
    map.setLevel(6);
  };

  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
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
        <Layers className={isCadastralMode ? 'text-emerald-400' : ''} />
      </Button>
      {mode === 'equipment' ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-9 w-9 bg-slate-900/90 text-slate-100"
          onClick={() => setClusteringEnabled(!isClusteringEnabled)}
          title="클러스터"
        >
          <Shapes className={isClusteringEnabled ? 'text-emerald-400' : ''} />
        </Button>
      ) : null}
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="h-9 w-9 bg-slate-900/90 text-slate-100"
        onClick={() => handleZoom(-1)}
        title="확대"
      >
        <Plus className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="h-9 w-9 bg-slate-900/90 text-slate-100"
        onClick={() => handleZoom(1)}
        title="축소"
      >
        <Minus className="h-4 w-4" />
      </Button>
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
