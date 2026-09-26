import type {
  NormalizedRouteResult,
  RouteErrorPayload,
  RoutePlanRequest,
} from "@/features/route/types/route";

export class RouteApiError extends Error {
  code: RouteErrorPayload["code"];

  constructor(payload: RouteErrorPayload) {
    super(payload.message);
    this.code = payload.code;
  }
}

/** `/api/kakao-route` 호출. 실패하면 RouteApiError를 던진다. */
export async function planRoute(
  request: RoutePlanRequest,
): Promise<NormalizedRouteResult> {
  const response = await fetch("/api/kakao-route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    if (json && typeof json.code === "string" && typeof json.message === "string") {
      throw new RouteApiError(json as RouteErrorPayload);
    }
    throw new RouteApiError({
      code: "SERVER_ERROR",
      message: "경로 계산 중 알 수 없는 오류가 발생했습니다.",
    });
  }

  return json as NormalizedRouteResult;
}
