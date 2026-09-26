import type { RouteCoordinate, RoutePoint } from "@/features/route/types/route";

const EARTH_RADIUS_M = 6_371_000;

/** 두 좌표 사이 직선(대권) 거리(m). */
export function haversineDistance(a: RouteCoordinate, b: RouteCoordinate): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** N×N 대칭 거리행렬(m). points[0]이 출발지라는 관례는 호출부 책임이다. */
export function buildDistanceMatrix(points: RouteCoordinate[]): number[][] {
  const n = points.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const d = haversineDistance(points[i], points[j]);
      matrix[i][j] = d;
      matrix[j][i] = d;
    }
  }
  return matrix;
}

const DUPLICATE_THRESHOLD_M = 20;

/**
 * 20m 이내로 인접한 지점을 대표 지점 하나로 병합한다.
 * 대표 좌표는 그룹의 첫 지점, 이름은 병합된 이름을 "+"로 이어 붙인다.
 * §11: 원래 마커 id는 markerIds에 전부 보존해 결과 화면에서 사라지지 않게 한다.
 */
export function mergeDuplicateStops(points: RoutePoint[]): RoutePoint[] {
  const merged: RoutePoint[] = [];
  const consumed = new Array(points.length).fill(false);

  for (let i = 0; i < points.length; i += 1) {
    if (consumed[i]) continue;
    consumed[i] = true;
    const group = [points[i]];

    for (let j = i + 1; j < points.length; j += 1) {
      if (consumed[j]) continue;
      if (haversineDistance(points[i], points[j]) <= DUPLICATE_THRESHOLD_M) {
        consumed[j] = true;
        group.push(points[j]);
      }
    }

    const representative = group[0];
    merged.push({
      routePointId:
        group.length > 1
          ? `merged:${group.map((p) => p.routePointId).join(",")}`
          : representative.routePointId,
      markerIds: group.flatMap((p) => p.markerIds),
      name:
        group.length > 1
          ? group.map((p) => p.name).join(" + ")
          : representative.name,
      lat: representative.lat,
      lng: representative.lng,
    });
  }

  return merged;
}

/** §13: Haversine 직선거리 × 1.3을 실도로 거리 사전 추정치로 쓴다(절대 차단 기준 아님). */
export function estimateRoadDistance(points: RouteCoordinate[]): number {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i += 1) {
    total += haversineDistance(points[i], points[i + 1]);
  }
  return total * 1.3;
}
