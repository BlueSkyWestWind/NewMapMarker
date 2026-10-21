import type { MapBoundsLiteral } from "./types";


export function readPointXY(point: KakaoPoint): { x: number; y: number } {
  return {
    x: typeof point.x === "number" ? point.x : point.getX(),
    y: typeof point.y === "number" ? point.y : point.getY(),
  };
}


export function padBounds(
  bounds: MapBoundsLiteral,
  paddingRatio: number,
): MapBoundsLiteral {
  const latPad = (bounds.ne.lat - bounds.sw.lat) * paddingRatio;
  const lngPad = (bounds.ne.lng - bounds.sw.lng) * paddingRatio;

  return {
    sw: {
      lat: bounds.sw.lat - latPad,
      lng: bounds.sw.lng - lngPad,
    },
    ne: {
      lat: bounds.ne.lat + latPad,
      lng: bounds.ne.lng + lngPad,
    },
  };
}


export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

