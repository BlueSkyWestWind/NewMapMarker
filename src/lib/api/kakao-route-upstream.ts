import type {
  NormalizedRouteLeg,
  RouteCoordinate,
  RouteErrorPayload,
  RoutePriority,
} from "@/features/route/types/route";

/**
 * 카카오모빌리티 길찾기 upstream 호출 전담 모듈(서버 전용).
 * §14.3: Route Handler의 보안/오케스트레이션과 카카오 프로토콜 코드를 분리한다.
 * §7 rev.2: 중간 경유지 0~5개 → GET directions, 6~30개 → POST waypoints/directions.
 */

const UPSTREAM_HOST = "https://apis-navi.kakaomobility.com";
const TIMEOUT_MS = 10_000;

export interface UpstreamPoint {
  lat: number;
  lng: number;
  name?: string;
}

export interface UpstreamLegRequest {
  origin: UpstreamPoint;
  destination: UpstreamPoint;
  /** 출발지·목적지를 제외한 중간 경유지. */
  waypoints: UpstreamPoint[];
  priority: RoutePriority;
  avoidToll: boolean;
}

export type UpstreamLegResult =
  | { ok: true; leg: NormalizedRouteLeg }
  | { ok: false; error: RouteErrorPayload };

/** 중간 경유지 수만으로 GET/POST를 정한다(rev.2 핵심 규칙). */
export function chooseUpstreamApi(middleWaypointCount: number): "GET" | "POST" {
  return middleWaypointCount <= 5 ? "GET" : "POST";
}

function vertexesToPath(vertexes: number[]): RouteCoordinate[] {
  const path: RouteCoordinate[] = [];
  for (let i = 0; i + 1 < vertexes.length; i += 2) {
    path.push({ lng: vertexes[i], lat: vertexes[i + 1] });
  }
  return path;
}

interface KakaoRouteJson {
  routes?: Array<{
    result_code: number;
    result_msg?: string;
    summary?: { distance: number; duration: number; fare?: { toll?: number } };
    sections?: Array<{
      distance: number;
      duration: number;
      roads?: Array<{ vertexes?: number[] }>;
    }>;
  }>;
}

function resultCodeToError(resultCode: number, message: string): RouteErrorPayload {
  if (resultCode === 102) {
    return { code: "ORIGIN_UNREACHABLE", message };
  }
  if (resultCode === 103) {
    return { code: "DEST_UNREACHABLE", message };
  }
  if (resultCode === 104) {
    return { code: "SAME_POINT", message };
  }
  return { code: "WAYPOINT_UNREACHABLE", message };
}

/** §12.1: HTTP 200만 보고 성공 처리하지 않는다 — result_code === 0을 확인한다. */
function normalizeKakaoJson(
  json: KakaoRouteJson,
  legType: "outbound" | "return",
): UpstreamLegResult {
  const route = json.routes?.[0];
  if (!route) {
    return {
      ok: false,
      error: { code: "UPSTREAM_ERROR", message: "카카오 응답에 경로 정보가 없습니다." },
    };
  }

  if (route.result_code !== 0) {
    return {
      ok: false,
      error: resultCodeToError(
        route.result_code,
        route.result_msg || "경로를 찾을 수 없습니다.",
      ),
    };
  }

  const summary = route.summary;
  const sections = route.sections ?? [];

  return {
    ok: true,
    leg: {
      type: legType,
      distance: summary?.distance ?? 0,
      duration: summary?.duration ?? 0,
      toll: summary?.fare?.toll ?? 0,
      sections: sections.map((section) => ({
        distance: section.distance,
        duration: section.duration,
      })),
      path: sections.flatMap((section) =>
        (section.roads ?? []).flatMap((road) => vertexesToPath(road.vertexes ?? [])),
      ),
    },
  };
}

function pointParam(point: UpstreamPoint): string {
  return `${point.lng},${point.lat}${point.name ? `,name=${encodeURIComponent(point.name)}` : ""}`;
}

async function callUpstream(
  input: string,
  init: RequestInit,
): Promise<{ status: number; json: KakaoRouteJson | null }> {
  const response = await fetch(input, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const json = (await response.json().catch(() => null)) as KakaoRouteJson | null;
  return { status: response.status, json };
}

function httpStatusError(status: number): RouteErrorPayload | null {
  if (status === 401 || status === 403) {
    return { code: "UPSTREAM_AUTH", message: "카카오 API 인증에 실패했습니다." };
  }
  if (status === 429) {
    return { code: "RATE_LIMIT", message: "카카오 API 사용량 한도를 초과했습니다." };
  }
  if (status >= 500) {
    return { code: "UPSTREAM_ERROR", message: "카카오모빌리티 서버에 일시적인 오류가 있습니다." };
  }
  return null;
}

async function fetchDirectionsGet(
  leg: UpstreamLegRequest,
  apiKey: string,
  legType: "outbound" | "return",
): Promise<UpstreamLegResult> {
  const url = new URL(`${UPSTREAM_HOST}/v1/directions`);
  url.searchParams.set("origin", pointParam(leg.origin));
  url.searchParams.set("destination", pointParam(leg.destination));
  if (leg.waypoints.length > 0) {
    url.searchParams.set("waypoints", leg.waypoints.map(pointParam).join("|"));
  }
  url.searchParams.set("priority", leg.priority);
  if (leg.avoidToll) url.searchParams.set("avoid", "toll");
  url.searchParams.set("summary", "false");

  const { status, json } = await callUpstream(url.toString(), {
    method: "GET",
    headers: { Authorization: `KakaoAK ${apiKey}` },
  });

  const statusError = httpStatusError(status);
  if (statusError) return { ok: false, error: statusError };
  if (!json) {
    return { ok: false, error: { code: "UPSTREAM_ERROR", message: "카카오 응답을 해석하지 못했습니다." } };
  }
  return normalizeKakaoJson(json, legType);
}

async function fetchWaypointsPost(
  leg: UpstreamLegRequest,
  apiKey: string,
  legType: "outbound" | "return",
): Promise<UpstreamLegResult> {
  const body = {
    origin: { x: leg.origin.lng, y: leg.origin.lat, name: leg.origin.name },
    destination: { x: leg.destination.lng, y: leg.destination.lat, name: leg.destination.name },
    waypoints: leg.waypoints.map((point) => ({
      x: point.lng,
      y: point.lat,
      name: point.name,
    })),
    priority: leg.priority,
    avoid: leg.avoidToll ? "toll" : undefined,
    summary: false,
  };

  const { status, json } = await callUpstream(`${UPSTREAM_HOST}/v1/waypoints/directions`, {
    method: "POST",
    headers: {
      Authorization: `KakaoAK ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const statusError = httpStatusError(status);
  if (statusError) return { ok: false, error: statusError };
  if (!json) {
    return { ok: false, error: { code: "UPSTREAM_ERROR", message: "카카오 응답을 해석하지 못했습니다." } };
  }
  return normalizeKakaoJson(json, legType);
}

/** 경유지 수에 따라 GET/POST를 자동 선택해 카카오 길찾기를 1회 호출한다. */
export async function fetchDirectionsLeg(
  leg: UpstreamLegRequest,
  apiKey: string,
  legType: "outbound" | "return",
): Promise<UpstreamLegResult> {
  try {
    const api = chooseUpstreamApi(leg.waypoints.length);
    return api === "GET"
      ? await fetchDirectionsGet(leg, apiKey, legType)
      : await fetchWaypointsPost(leg, apiKey, legType);
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    return {
      ok: false,
      error: isTimeout
        ? { code: "TIMEOUT", message: "카카오 API 요청이 시간 초과됐습니다." }
        : { code: "UPSTREAM_ERROR", message: "카카오 API 요청 중 오류가 발생했습니다." },
    };
  }
}
