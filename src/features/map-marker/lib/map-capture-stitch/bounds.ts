import type {
  LatLngLiteral, MapBoundsLiteral, ViewportSize,
  CaptureTilePlan, CaptureGridPlan, BuildCaptureGridOptions,
  CapturedTileImage, GridCaptureResult,
} from "./types";
import {
  DEFAULT_OVERLAP_RATIO, DEFAULT_PADDING_RATIO, MAX_RECOMMENDED_CAPTURE_TILES,
} from "./types";
import { readPointXY, clamp, padBounds } from "./helpers";


/**
 * 마커 목록에서 캡처 대상 bounds를 만든다.
 */
/**
 * bounds 안에 있는 마커 ID 목록을 반환한다.
 */
export function getMarkerIdsInBounds(
  markers: Array<{ id: string; lat: number; lng: number }>,
  bounds: MapBoundsLiteral,
): string[] {
  return markers
    .filter(
      (marker) =>
        Number.isFinite(marker.lat) &&
        Number.isFinite(marker.lng) &&
        marker.lat >= bounds.sw.lat &&
        marker.lat <= bounds.ne.lat &&
        marker.lng >= bounds.sw.lng &&
        marker.lng <= bounds.ne.lng,
    )
    .map((marker) => marker.id);
}


export function buildBoundsFromMarkers(
  markers: Array<{ lat: number; lng: number }>,
): MapBoundsLiteral | null {
  const valid = markers.filter(
    (marker) =>
      Number.isFinite(marker.lat) &&
      Number.isFinite(marker.lng) &&
      !(marker.lat === 0 && marker.lng === 0),
  );

  if (valid.length === 0) return null;

  let minLat = valid[0].lat;
  let maxLat = valid[0].lat;
  let minLng = valid[0].lng;
  let maxLng = valid[0].lng;

  for (const marker of valid) {
    minLat = Math.min(minLat, marker.lat);
    maxLat = Math.max(maxLat, marker.lat);
    minLng = Math.min(minLng, marker.lng);
    maxLng = Math.max(maxLng, marker.lng);
  }

  // 마커 1개면 최소 영역 확보
  if (valid.length === 1) {
    const pad = 0.002;
    return {
      sw: { lat: minLat - pad, lng: minLng - pad },
      ne: { lat: maxLat + pad, lng: maxLng + pad },
    };
  }

  return {
    sw: { lat: minLat, lng: minLng },
    ne: { lat: maxLat, lng: maxLng },
  };
}


/**
 * 현재 화면(컨테이너) 기준 뷰포트 lat/lng span을 측정한다.
 */
export function measureViewportSpan(
  map: KakaoMap,
  viewportSize?: ViewportSize,
): {
  latSpan: number;
  lngSpan: number;
} {
  const projection = map.getProjection?.();
  const width = viewportSize?.width;
  const height = viewportSize?.height;

  if (projection && width && height && width > 0 && height > 0) {
    const nw = projection.coordsFromContainerPoint(
      new window.kakao.maps.Point(0, 0),
    );
    const se = projection.coordsFromContainerPoint(
      new window.kakao.maps.Point(width, height),
    );
    return {
      latSpan: Math.abs(nw.getLat() - se.getLat()),
      lngSpan: Math.abs(se.getLng() - nw.getLng()),
    };
  }

  const bounds = map.getBounds?.();
  if (!bounds) {
    throw new Error("지도 bounds를 읽을 수 없습니다.");
  }

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  return {
    latSpan: Math.abs(ne.getLat() - sw.getLat()),
    lngSpan: Math.abs(ne.getLng() - sw.getLng()),
  };
}


/**
 * 고정 줌에서 두 좌표의 화면 픽셀 오프셋을 구한다.
 * (호출 시점의 지도 중심/레벨 기준)
 */
export function measurePixelOffsetBetween(
  map: KakaoMap,
  from: LatLngLiteral,
  to: LatLngLiteral,
): { dx: number; dy: number } {
  const projection = map.getProjection();
  if (!projection) {
    throw new Error("지도 projection을 읽을 수 없습니다.");
  }

  if (projection.pointFromCoords && projection.coordsFromPoint) {
    const fromPoint = readPointXY(
      projection.pointFromCoords(
        new window.kakao.maps.LatLng(from.lat, from.lng),
      ),
    );
    const toPoint = readPointXY(
      projection.pointFromCoords(new window.kakao.maps.LatLng(to.lat, to.lng)),
    );
    return {
      dx: toPoint.x - fromPoint.x,
      dy: toPoint.y - fromPoint.y,
    };
  }

  const fromContainer = readPointXY(
    projection.containerPointFromCoords(
      new window.kakao.maps.LatLng(from.lat, from.lng),
    ),
  );
  const toContainer = readPointXY(
    projection.containerPointFromCoords(
      new window.kakao.maps.LatLng(to.lat, to.lng),
    ),
  );

  return {
    dx: toContainer.x - fromContainer.x,
    dy: toContainer.y - fromContainer.y,
  };
}


/**
 * 화면 드래그 사각형을 지도 bounds로 변환한다.
 */
export function screenRectToMapBounds(
  map: KakaoMap,
  mapContainer: HTMLElement,
  clientX1: number,
  clientY1: number,
  clientX2: number,
  clientY2: number,
): MapBoundsLiteral {
  if (!window.kakao?.maps) {
    throw new Error("카카오맵 SDK가 준비되지 않았습니다.");
  }

  const rect = mapContainer.getBoundingClientRect();
  const left = Math.min(clientX1, clientX2) - rect.left;
  const right = Math.max(clientX1, clientX2) - rect.left;
  const top = Math.min(clientY1, clientY2) - rect.top;
  const bottom = Math.max(clientY1, clientY2) - rect.top;

  const projection = map.getProjection();
  const nw = projection.coordsFromContainerPoint(
    new window.kakao.maps.Point(left, top),
  );
  const se = projection.coordsFromContainerPoint(
    new window.kakao.maps.Point(right, bottom),
  );

  return {
    sw: { lat: se.getLat(), lng: nw.getLng() },
    ne: { lat: nw.getLat(), lng: se.getLng() },
  };
}


/**
 * 줌 레벨 차이에 따른 viewport span 추정.
 * (레벨이 커질수록 축소 → span 증가)
 */
export function estimateSpanAtLevel(
  spanAtCurrentLevel: { latSpan: number; lngSpan: number },
  currentLevel: number,
  targetLevel: number,
): { latSpan: number; lngSpan: number } {
  const factor = 2 ** (targetLevel - currentLevel);
  return {
    latSpan: spanAtCurrentLevel.latSpan * factor,
    lngSpan: spanAtCurrentLevel.lngSpan * factor,
  };
}
