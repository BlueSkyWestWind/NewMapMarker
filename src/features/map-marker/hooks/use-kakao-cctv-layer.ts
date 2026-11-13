"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";

const CCTV_MARKER_IMAGE =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">' +
      '<circle cx="11" cy="11" r="9.5" fill="#0f766e" stroke="#5eead4" stroke-width="1.5"/>' +
      '<rect x="5.5" y="8" width="8" height="6" rx="1" fill="#f0fdfa"/>' +
      '<path d="M14 9.5 L16.5 8 v6 l-2.5 -1.5 z" fill="#f0fdfa"/>' +
    "</svg>",
  );

/**
 * 도로 CCTV 마커 레이어 (장비 모드).
 * 국소 마커 체계(클러스터·정보창)와 섞지 않고 별도 레이어로 올렸다 내린다.
 * 지도 인스턴스는 `KakaoMapCanvas`가 만들어 ref로 넘긴다.
 */
export function useKakaoCctvLayer({
  mapInstanceRef,
  isReady,
}: {
  mapInstanceRef: MutableRefObject<KakaoMap | null>;
  isReady: boolean;
}) {
  const cctvMarkers = useMapMarkerStore((state) => state.cctvMarkers);
  const isCctvVisible = useMapMarkerStore((state) => state.isCctvVisible);
  const setSelectedCctv = useMapMarkerStore((state) => state.setSelectedCctv);
  const cctvMarkersRef = useRef<KakaoMarker[]>([]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.kakao?.maps) return;
    const kakao = window.kakao;

    cctvMarkersRef.current.forEach((marker) => marker.setMap(null));
    cctvMarkersRef.current = [];

    if (!isCctvVisible || cctvMarkers.length === 0) return;

    const image = new kakao.maps.MarkerImage(
      CCTV_MARKER_IMAGE,
      new kakao.maps.Size(22, 22),
      { offset: new kakao.maps.Point(11, 11) },
    );

    for (const item of cctvMarkers) {
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue;

      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(item.lat, item.lng),
        image,
        title: item.name,
        zIndex: 4,
      });
      marker.setMap(map);
      kakao.maps.event.addListener(marker, "click", () => setSelectedCctv(item));
      cctvMarkersRef.current.push(marker);
    }

    return () => {
      cctvMarkersRef.current.forEach((marker) => marker.setMap(null));
      cctvMarkersRef.current = [];
    };
  }, [cctvMarkers, isCctvVisible, isReady, setSelectedCctv, mapInstanceRef]);
}
