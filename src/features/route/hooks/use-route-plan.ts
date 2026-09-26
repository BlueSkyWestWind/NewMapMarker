"use client";

import { useCallback } from "react";
import { buildDistanceMatrix, estimateRoadDistance, mergeDuplicateStops } from "@/features/route/lib/haversine";
import { solveTsp } from "@/features/route/lib/solve-tsp";
import { planRoute, RouteApiError } from "@/features/route/lib/kakao-route-client";
import { useRouteStore } from "@/features/route/store/use-route-store";
import type { RoutePoint } from "@/features/route/types/route";

const DISTANCE_WARNING_THRESHOLD_M = 1_500_000;

/**
 * 최적화 → API 호출 → 결과 반영 오케스트레이션(§10).
 * orderSource가 auto일 때만 Haversine 기반 NN+2-opt로 순서를 다시 계산한다.
 * 계산 결과(병합·재정렬된 목록)는 store.stops에도 반영해 UI가 실제 계산 대상과 일치하게 한다.
 */
export function useRoutePlan() {
  const origin = useRouteStore((state) => state.origin);
  const stops = useRouteStore((state) => state.stops);

  const canCompute = origin !== null && stops.length >= 1;

  const computeRoute = useCallback(async () => {
    const state = useRouteStore.getState();
    if (!state.origin || state.stops.length === 0) return;

    const originPoint = state.origin;
    const merged = mergeDuplicateStops(state.stops);

    let orderedStops = merged;
    if (state.orderSource === "auto" && merged.length > 1) {
      const allPoints: RoutePoint[] = [originPoint, ...merged];
      const matrix = buildDistanceMatrix(allPoints);
      const order = solveTsp(matrix, { roundTrip: state.roundTrip });
      orderedStops = order.slice(1).map((index) => allPoints[index]);
    }

    useRouteStore.setState({ stops: orderedStops });

    const estimated = estimateRoadDistance([originPoint, ...orderedStops]);
    useRouteStore.getState().setWarning(
      estimated >= DISTANCE_WARNING_THRESHOLD_M
        ? "예상 거리가 1,500km를 넘을 수 있어 카카오 API가 요청을 거부할 수 있습니다."
        : null,
    );

    useRouteStore.getState().setError(null);
    useRouteStore.getState().setStatus("loading");

    try {
      const result = await planRoute({
        origin: {
          id: originPoint.routePointId,
          name: originPoint.name,
          lat: originPoint.lat,
          lng: originPoint.lng,
        },
        stops: orderedStops.map((stop) => ({
          id: stop.routePointId,
          name: stop.name,
          lat: stop.lat,
          lng: stop.lng,
        })),
        roundTrip: state.roundTrip,
        priority: state.priority,
        avoidToll: state.avoidToll,
      });

      // 카카오 sections[i]는 요청 시 넘긴 지점 순서의 i→i+1 구간과 1:1 대응한다(§7).
      const lastStop = orderedStops[orderedStops.length - 1];
      useRouteStore.getState().setLegPointNames({
        outbound: [originPoint.name, ...orderedStops.map((stop) => stop.name)],
        ...(state.roundTrip
          ? { return: [lastStop.name, originPoint.name] }
          : {}),
      });
      useRouteStore.getState().setResult(result);
      useRouteStore.getState().setStatus("success");
    } catch (err) {
      useRouteStore.getState().setError(
        err instanceof RouteApiError
          ? { code: err.code, message: err.message }
          : { code: "SERVER_ERROR", message: "알 수 없는 오류가 발생했습니다." },
      );
      useRouteStore.getState().setStatus("error");
    }
  }, []);

  return { canCompute, computeRoute };
}
