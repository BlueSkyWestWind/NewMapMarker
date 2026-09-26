import type { RouteCoordinate } from "@/features/route/types/route";

/** 점 p에서 선분 a-b까지 수직 거리(위경도를 평면 근사). */
function perpendicularDistance(
  p: RouteCoordinate,
  a: RouteCoordinate,
  b: RouteCoordinate,
): number {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) {
    return Math.hypot(p.lng - a.lng, p.lat - a.lat);
  }
  const t = ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy);
  const projX = a.lng + t * dx;
  const projY = a.lat + t * dy;
  return Math.hypot(p.lng - projX, p.lat - projY);
}

/** Douglas–Peucker. tolerance는 위경도 단위(도)다. */
export function douglasPeucker(
  path: RouteCoordinate[],
  tolerance: number,
): RouteCoordinate[] {
  if (path.length < 3) return path;

  let maxDistance = 0;
  let maxIndex = 0;
  const first = path[0];
  const last = path[path.length - 1];

  for (let i = 1; i < path.length - 1; i += 1) {
    const distance = perpendicularDistance(path[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  if (maxDistance > tolerance) {
    const left = douglasPeucker(path.slice(0, maxIndex + 1), tolerance);
    const right = douglasPeucker(path.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

const SIMPLIFY_VERTEX_THRESHOLD = 5000;
const DEFAULT_TOLERANCE_DEG = 0.00005;

/** §17.4: 정점 수가 임계치를 넘을 때만 단순화한다. 시작/끝 좌표는 항상 보존된다. */
export function maybeSimplifyPath(
  path: RouteCoordinate[],
  threshold: number = SIMPLIFY_VERTEX_THRESHOLD,
  tolerance: number = DEFAULT_TOLERANCE_DEG,
): RouteCoordinate[] {
  if (path.length <= threshold) return path;
  return douglasPeucker(path, tolerance);
}
