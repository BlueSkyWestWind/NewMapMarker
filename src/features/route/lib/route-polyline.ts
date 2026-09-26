import { maybeSimplifyPath } from "@/features/route/lib/simplify-path";
import type { NormalizedRouteLeg } from "@/features/route/types/route";

const LEG_COLOR: Record<NormalizedRouteLeg["type"], string> = {
  outbound: "#38bdf8",
  return: "#a78bfa",
};

/**
 * leg별 Polyline 객체를 유지한다(§17.3) — 실패/재계산 관리와 구간별 강조가 쉽다.
 * 기존 polylines를 전부 지우고 legs로 새로 그린다.
 */
export function syncRoutePolylines(
  map: KakaoMap,
  legs: NormalizedRouteLeg[],
  existing: KakaoPolyline[],
): KakaoPolyline[] {
  clearRoutePolylines(existing);
  if (!window.kakao?.maps) return [];

  return legs
    .filter((leg) => leg.path.length > 1)
    .map((leg) => {
      const path = maybeSimplifyPath(leg.path).map(
        (point) => new window.kakao!.maps.LatLng(point.lat, point.lng),
      );
      const polyline = new window.kakao!.maps.Polyline({
        path,
        strokeWeight: 5,
        strokeColor: LEG_COLOR[leg.type],
        strokeOpacity: 0.85,
        strokeStyle: "solid",
        zIndex: 6,
      });
      polyline.setMap(map);
      return polyline;
    });
}

export function clearRoutePolylines(polylines: KakaoPolyline[]): void {
  polylines.forEach((polyline) => polyline.setMap(null));
}

/** 전체 경로 좌표 기준으로 지도를 맞춘다(§10 13단계). */
export function fitMapToRoute(map: KakaoMap, legs: NormalizedRouteLeg[]): void {
  if (!window.kakao?.maps) return;
  const bounds = new window.kakao.maps.LatLngBounds();
  let hasPoint = false;

  legs.forEach((leg) => {
    leg.path.forEach((point) => {
      bounds.extend(new window.kakao!.maps.LatLng(point.lat, point.lng));
      hasPoint = true;
    });
  });

  if (hasPoint) map.setBounds(bounds);
}
