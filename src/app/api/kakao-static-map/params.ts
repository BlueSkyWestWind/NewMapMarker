export const MAX_SIZE = 1024;

export function toEvenSize(value: number): number {
  const clamped = Math.min(MAX_SIZE, Math.max(2, Math.round(value)));
  return clamped % 2 === 0 ? clamped : clamped - 1;
}

export interface StaticMapParams {
  lat: number;
  lng: number;
  level: number;
  width: number;
  height: number;
  mapType: "ROADMAP" | "SKYVIEW";
}

function finiteOrDefault(raw: string | null, fallback: number): number {
  if (raw === null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Static Map 쿼리 파라미터를 검증·정규화한다. */
export function parseStaticMapParams(
  params: URLSearchParams,
): StaticMapParams | { error: string } {
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "lat, lng 파라미터가 필요합니다." };
  }

  const level = finiteOrDefault(params.get("level"), 3);
  const width = toEvenSize(finiteOrDefault(params.get("width"), 600));
  const height = toEvenSize(finiteOrDefault(params.get("height"), 400));
  const mapType = params.get("mapType") === "roadmap" ? "ROADMAP" : "SKYVIEW";

  return { lat, lng, level, width, height, mapType };
}
