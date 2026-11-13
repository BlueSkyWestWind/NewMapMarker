"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { useRouteStore } from "@/features/route/store/use-route-store";
import { useRouteMarkerPool } from "@/features/route/hooks/use-route-marker-pool";
import {
  clearRoutePolylines,
  fitMapToRoute,
  syncRoutePolylines,
} from "@/features/route/lib/route-polyline";
import { createRoutePointBadge } from "@/features/route/lib/route-point-badge";
import { isPlottableCoordinate } from "@/features/map-marker/components/map/kakao-map-helpers";
import type { MarkerRecord } from "@/features/map-marker/types/marker";

/**
 * 경로탐색 지도 클릭 픽업 아이콘. 대시보드는 지도 모드가 weather로 고정돼 있어
 * 평상시 마커가 대부분 숨어 있으므로, 픽업 중에는 이 전용 아이콘으로 클릭 가능한
 * 지점을 눈에 띄게 보여준다.
 */
const ROUTE_PICK_MARKER_IMAGE =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">' +
      '<circle cx="10" cy="10" r="8.5" fill="#f59e0b" stroke="#fef3c7" stroke-width="1.5"/>' +
      '<path d="M10 5.5v9M5.5 10h9" stroke="#451a03" stroke-width="2" stroke-linecap="round"/>' +
    "</svg>",
  );

/**
 * 경로탐색 지도 레이어: 결과 Polyline, 클릭 픽업 마커, 출발지·방문지점 번호 배지.
 * `markerDataByIdRef`는 일반 레이어에 이미 떠 있는 마커(픽업 마커로 중복 표시하지 않을 것)다.
 */
export function useKakaoRouteLayer({
  mapInstanceRef,
  markerDataByIdRef,
  isReady,
}: {
  mapInstanceRef: MutableRefObject<KakaoMap | null>;
  markerDataByIdRef: MutableRefObject<Map<string, MarkerRecord>>;
  isReady: boolean;
}) {
  const routeResult = useRouteStore((state) => state.result);
  const routePickTarget = useRouteStore((state) => state.pickTarget);
  const routeOrigin = useRouteStore((state) => state.origin);
  const routeStops = useRouteStore((state) => state.stops);
  const routeMarkerPool = useRouteMarkerPool();
  const routePolylinesRef = useRef<KakaoPolyline[]>([]);
  const routePickMarkersRef = useRef<KakaoMarker[]>([]);
  const routePointBadgesRef = useRef<KakaoCustomOverlay[]>([]);

  /** 경로탐색 결과 Polyline. 초기화/패널 이탈로 result가 비면 지도에서 지운다(§21.3). */
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!routeResult) {
      if (routePolylinesRef.current.length > 0) {
        clearRoutePolylines(routePolylinesRef.current);
        routePolylinesRef.current = [];
      }
      return;
    }

    routePolylinesRef.current = syncRoutePolylines(
      map,
      routeResult.legs,
      routePolylinesRef.current,
    );
    fitMapToRoute(map, routeResult.legs);
  }, [routeResult, isReady, mapInstanceRef]);

  useEffect(() => {
    return () => {
      clearRoutePolylines(routePolylinesRef.current);
      routePolylinesRef.current = [];
    };
  }, []);

  /**
   * 경로탐색 지도 클릭 픽업 레이어. 현재 모드(대시보드는 weather 고정)와 무관하게
   * 전체 마커 풀에서 고른다 — 그렇지 않으면 weather 모드에서 저장된 국소 외에는
   * 지도에서 클릭할 것이 아예 없다. 이미 일반 레이어에 떠 있는 마커는 중복 표시하지 않는다.
   */
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.kakao?.maps) return;
    const kakao = window.kakao;

    routePickMarkersRef.current.forEach((marker) => marker.setMap(null));
    routePickMarkersRef.current = [];

    if (!routePickTarget) return;

    const alreadyVisibleIds = new Set(markerDataByIdRef.current.keys());
    const image = new kakao.maps.MarkerImage(
      ROUTE_PICK_MARKER_IMAGE,
      new kakao.maps.Size(20, 20),
      { offset: new kakao.maps.Point(10, 10) },
    );

    routeMarkerPool.forEach((item) => {
      if (alreadyVisibleIds.has(item.id)) return;
      if (!isPlottableCoordinate(item.lat, item.lng)) return;

      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(item.lat, item.lng),
        title: item.name,
        image,
        zIndex: 7,
      });
      marker.setMap(map);
      kakao.maps.event.addListener(marker, "click", () => {
        const routeState = useRouteStore.getState();
        const routePoint = {
          routePointId: item.id,
          markerIds: [item.id],
          name: item.name,
          lat: item.lat,
          lng: item.lng,
        };
        if (routeState.pickTarget === "origin") {
          routeState.setOrigin(routePoint);
          routeState.setPickTarget(null);
        } else if (routeState.pickTarget === "stop") {
          routeState.addStop(routePoint);
        }
      });
      routePickMarkersRef.current.push(marker);
    });

    return () => {
      routePickMarkersRef.current.forEach((marker) => marker.setMap(null));
      routePickMarkersRef.current = [];
    };
  }, [routePickTarget, routeMarkerPool, isReady, mapInstanceRef, markerDataByIdRef]);

  /**
   * 출발지·방문지점 번호 배지. 방문 지점 목록의 순번과 지도 위 번호가 일치해야
   * "N구간"이 어느 위치인지 바로 알아볼 수 있다(§21.3).
   */
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.kakao?.maps) return;
    const kakao = window.kakao;

    routePointBadgesRef.current.forEach((overlay) => overlay.setMap(null));
    routePointBadgesRef.current = [];

    if (routeOrigin) {
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(routeOrigin.lat, routeOrigin.lng),
        content: createRoutePointBadge("출", "origin"),
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 8,
      });
      overlay.setMap(map);
      routePointBadgesRef.current.push(overlay);
    }

    routeStops.forEach((stop, index) => {
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(stop.lat, stop.lng),
        content: createRoutePointBadge(String(index + 1), "stop"),
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 8,
      });
      overlay.setMap(map);
      routePointBadgesRef.current.push(overlay);
    });

    return () => {
      routePointBadgesRef.current.forEach((overlay) => overlay.setMap(null));
      routePointBadgesRef.current = [];
    };
  }, [routeOrigin, routeStops, isReady, mapInstanceRef]);
}
