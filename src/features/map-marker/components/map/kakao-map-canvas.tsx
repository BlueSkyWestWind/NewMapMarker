'use client';

import { useEffect, useRef } from 'react';
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_LEVEL,
} from '@/features/map-marker/constants/map-config';
import { markerPassesFilters } from '@/features/map-marker/lib/marker-filters';
import { getMarkerImageUri } from '@/features/map-marker/lib/marker-svg';
import { useKakaoMapSdk } from '@/features/map-marker/hooks/use-kakao-map-sdk';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import type { MapMode, MarkerRecord } from '@/features/map-marker/types/marker';
import { MapFloatingControls } from '@/features/map-marker/components/map/map-floating-controls';

interface KakaoMapCanvasProps {
  markers: MarkerRecord[];
  mode: MapMode;
}

export function KakaoMapCanvas({ markers, mode }: KakaoMapCanvasProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<KakaoMap | null>(null);
  const clustererRef = useRef<KakaoMarkerClusterer | null>(null);
  const markersRef = useRef<KakaoMarker[]>([]);
  const { isReady, error } = useKakaoMapSdk();
  const filters = useMapMarkerStore((state) => state.filters);
  const isClusteringEnabled = useMapMarkerStore(
    (state) => state.isClusteringEnabled,
  );
  const isCadastralMode = useMapMarkerStore((state) => state.isCadastralMode);

  useEffect(() => {
    if (!isReady || !mapRef.current || !window.kakao?.maps) return;
    if (mapInstanceRef.current) return;

    const center = new window.kakao.maps.LatLng(
      DEFAULT_MAP_CENTER.lat,
      DEFAULT_MAP_CENTER.lng,
    );

    const map = new window.kakao.maps.Map(mapRef.current, {
      center,
      level: DEFAULT_MAP_LEVEL,
      mapTypeId: window.kakao.maps.MapTypeId.HYBRID,
    });

    mapInstanceRef.current = map;
    clustererRef.current = new window.kakao.maps.MarkerClusterer({
      map,
      averageCenter: true,
      minLevel: 6,
      disableClickZoom: false,
      styles: [
        {
          width: '42px',
          height: '42px',
          background: 'linear-gradient(135deg, #10b981, #059669)',
          borderRadius: '21px',
          color: '#ffffff',
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: '13px',
          lineHeight: '38px',
          border: '2px solid #ffffff',
        },
      ],
    });
  }, [isReady]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const clusterer = clustererRef.current;
    if (!map || !window.kakao?.maps) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];
    clusterer?.clear();

    const visibleMarkers = markers.filter((marker) =>
      markerPassesFilters(marker, mode, filters),
    );

    const markersToCluster: KakaoMarker[] = [];

    visibleMarkers.forEach((data) => {
      if (!Number.isFinite(data.lat) || !Number.isFinite(data.lng)) {
        return;
      }

      const position = new window.kakao.maps.LatLng(data.lat, data.lng);
      const markerImage = new window.kakao.maps.MarkerImage(
        getMarkerImageUri(data, mode),
        new window.kakao.maps.Size(30, 45),
        { offset: new window.kakao.maps.Point(15, 45) },
      );

      const marker = new window.kakao.maps.Marker({
        position,
        title: data.name,
        image: markerImage,
        zIndex: 3,
      });

      markersRef.current.push(marker);

      if (mode === 'battery' || !isClusteringEnabled) {
        marker.setMap(map);
      } else {
        markersToCluster.push(marker);
      }
    });

    if (clusterer && mode === 'equipment' && isClusteringEnabled) {
      clusterer.addMarkers(markersToCluster);
    }
  }, [markers, mode, filters, isClusteringEnabled]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.kakao?.maps) return;

    if (isCadastralMode) {
      map.addOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT);
    } else {
      map.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT);
    }
  }, [isCadastralMode, isReady]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 p-6 text-center text-sm text-rose-300">
        {error}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="h-full w-full" />
      {!isReady ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-sm text-slate-300">
          지도 로딩 중...
        </div>
      ) : null}
      <MapFloatingControls map={mapInstanceRef.current} />
    </div>
  );
}
