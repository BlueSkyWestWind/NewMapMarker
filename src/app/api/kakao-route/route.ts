import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardProxyRequest } from "@/lib/api/proxy-guard";
import { fetchDirectionsLeg } from "@/lib/api/kakao-route-upstream";
import type {
  NormalizedRouteResult,
  RouteErrorCode,
  RouteErrorPayload,
} from "@/features/route/types/route";

/**
 * 길찾기 프록시 — 계획서 Ver 2.2 rev.2-final §14.
 * 클라이언트는 정규화된 요청 1개만 보낸다. 편도/왕복 오케스트레이션과
 * GET/POST 자동 선택은 이 라우트와 kakao-route-upstream이 감춘다.
 *
 * 인증: 다른 프록시 라우트와 동일하게 guardProxyRequest를 쓴다
 * (동일 출처 + IP 레이트리밋 + 로그인 Bearer 토큰 검증).
 */

const MAX_BODY_BYTES = 32 * 1024;

const pointSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().max(200),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});

const bodySchema = z.object({
  origin: pointSchema,
  // 출발지 1 + 방문지점 최대 31 = 총 32곳(§6). 마지막 방문지가 목적지, 나머지가 중간 경유지.
  stops: z.array(pointSchema).min(1).max(31),
  roundTrip: z.boolean(),
  priority: z.enum(["RECOMMEND", "TIME", "DISTANCE"]),
  avoidToll: z.boolean(),
});

type ValidatedBody = z.infer<typeof bodySchema>;

// ── best-effort in-memory LRU 캐시 (§16) ────────────────────────────────────
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, { at: number; value: NormalizedRouteResult }>();

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function buildCacheKey(body: ValidatedBody): string {
  return JSON.stringify({
    origin: { lat: round6(body.origin.lat), lng: round6(body.origin.lng) },
    stops: body.stops.map((s) => ({ lat: round6(s.lat), lng: round6(s.lng) })),
    roundTrip: body.roundTrip,
    priority: body.priority,
    avoidToll: body.avoidToll,
  });
}

function cacheGet(key: string): NormalizedRouteResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key: string, value: NormalizedRouteResult): void {
  if (!cache.has(key) && cache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { at: Date.now(), value });
}

function statusForErrorCode(code: RouteErrorCode): number {
  switch (code) {
    case "INVALID_REQUEST":
      return 400;
    case "ORIGIN_UNREACHABLE":
    case "DEST_UNREACHABLE":
    case "WAYPOINT_UNREACHABLE":
    case "SAME_POINT":
      return 422;
    case "RATE_LIMIT":
      return 429;
    case "TIMEOUT":
      return 504;
    case "UPSTREAM_AUTH":
    case "UPSTREAM_ERROR":
      return 502;
    case "SERVER_ERROR":
    default:
      return 500;
  }
}

function errorResponse(error: RouteErrorPayload): NextResponse {
  return NextResponse.json(error, { status: statusForErrorCode(error.code) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const blocked = await guardProxyRequest(request);
  if (blocked) return blocked;

  const rawText = await request.text();
  if (Buffer.byteLength(rawText, "utf-8") > MAX_BODY_BYTES) {
    return errorResponse({ code: "INVALID_REQUEST", message: "요청 본문이 너무 큽니다." });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    return errorResponse({ code: "INVALID_REQUEST", message: "요청 본문이 올바른 JSON이 아닙니다." });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return errorResponse({
      code: "INVALID_REQUEST",
      message: "요청 형식이 올바르지 않습니다.",
    });
  }

  const { origin, stops, roundTrip, priority, avoidToll } = parsed.data;

  const apiKey = (process.env.KAKAO_REST_API_KEY || "").trim();
  if (!apiKey) {
    return errorResponse({
      code: "SERVER_ERROR",
      message: "카카오 REST API 키가 설정되지 않았습니다.",
    });
  }

  const cacheKey = buildCacheKey(parsed.data);
  const cached = cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const destination = stops[stops.length - 1];
  const middleWaypoints = stops.slice(0, -1);

  // §7.1/§7.2 출발 구간: 중간 경유지 0~5개 GET, 6~30개 POST(upstream helper가 자동 분기).
  const outbound = await fetchDirectionsLeg(
    {
      origin: { lat: origin.lat, lng: origin.lng, name: origin.name },
      destination: { lat: destination.lat, lng: destination.lng, name: destination.name },
      waypoints: middleWaypoints.map((s) => ({ lat: s.lat, lng: s.lng, name: s.name })),
      priority,
      avoidToll,
    },
    apiKey,
    "outbound",
  );

  if (outbound.ok === false) return errorResponse(outbound.error);

  const legs = [outbound.leg];

  if (roundTrip) {
    // §7.2/§12.2: 복귀 구간은 항상 경유지 없는 GET이며, origin/destination을 같은 좌표로 보내지 않는다.
    const returnLeg = await fetchDirectionsLeg(
      {
        origin: { lat: destination.lat, lng: destination.lng, name: destination.name },
        destination: { lat: origin.lat, lng: origin.lng, name: origin.name },
        waypoints: [],
        priority,
        avoidToll,
      },
      apiKey,
      "return",
    );

    if (returnLeg.ok === false) return errorResponse(returnLeg.error);
    legs.push(returnLeg.leg);
  }

  const result: NormalizedRouteResult = {
    totalDistance: legs.reduce((sum, leg) => sum + leg.distance, 0),
    totalDuration: legs.reduce((sum, leg) => sum + leg.duration, 0),
    totalToll: legs.reduce((sum, leg) => sum + leg.toll, 0),
    legs,
  };

  cacheSet(cacheKey, result);
  return NextResponse.json(result);
}
