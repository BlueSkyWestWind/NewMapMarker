"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RouteOriginPicker } from "@/features/route/components/route-origin-picker";
import { RouteStopList } from "@/features/route/components/route-stop-list";
import { RouteSummary } from "@/features/route/components/route-summary";
import { useRoutePlan } from "@/features/route/hooks/use-route-plan";
import { useRouteStore } from "@/features/route/store/use-route-store";
import type { RoutePriority } from "@/features/route/types/route";

const PRIORITY_LABEL: Record<RoutePriority, string> = {
  RECOMMEND: "추천",
  TIME: "최단 시간",
  DISTANCE: "최단 거리",
};

/**
 * 경로탐색 패널 — 계획서 §8. 카카오모빌리티 길찾기 API로 실제 도로 경로를 조회한다.
 * 대시보드 탭 하나로 내장되며, 별도 셸 nav 메뉴는 추가하지 않는다(사용자 확정).
 */
export function RoutePanel() {
  const origin = useRouteStore((state) => state.origin);
  const stops = useRouteStore((state) => state.stops);
  const roundTrip = useRouteStore((state) => state.roundTrip);
  const setRoundTrip = useRouteStore((state) => state.setRoundTrip);
  const priority = useRouteStore((state) => state.priority);
  const setPriority = useRouteStore((state) => state.setPriority);
  const avoidToll = useRouteStore((state) => state.avoidToll);
  const setAvoidToll = useRouteStore((state) => state.setAvoidToll);
  const status = useRouteStore((state) => state.status);
  const result = useRouteStore((state) => state.result);
  const error = useRouteStore((state) => state.error);
  const warning = useRouteStore((state) => state.warning);
  const reset = useRouteStore((state) => state.reset);
  const setPickTarget = useRouteStore((state) => state.setPickTarget);
  const { canCompute, computeRoute } = useRoutePlan();

  const disabledReason = !origin
    ? "출발지를 먼저 지정하세요."
    : stops.length === 0
      ? "방문 지점을 먼저 추가하세요."
      : null;

  useEffect(() => {
    // 패널 이탈(탭 전환·언마운트) 시 지도 클릭 픽업 모드를 꺼 둔다.
    return () => setPickTarget(null);
  }, [setPickTarget]);

  return (
    <div className="space-y-3">
      <RouteOriginPicker />
      <RouteStopList />

      <label className="flex items-center gap-2 text-[11px] text-slate-300">
        <input
          type="checkbox"
          checked={roundTrip}
          onChange={(event) => setRoundTrip(event.target.checked)}
          className="h-3.5 w-3.5"
        />
        출발지로 복귀(왕복)
      </label>

      <div className="grid grid-cols-2 gap-1.5">
        <select
          value={priority}
          onChange={(event) => setPriority(event.target.value as RoutePriority)}
          className="h-7 rounded-md border border-slate-700 bg-slate-900 px-1.5 text-[11px] text-slate-200"
        >
          {(Object.keys(PRIORITY_LABEL) as RoutePriority[]).map((key) => (
            <option key={key} value={key}>
              {PRIORITY_LABEL[key]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
          <input
            type="checkbox"
            checked={avoidToll}
            onChange={(event) => setAvoidToll(event.target.checked)}
            className="h-3.5 w-3.5"
          />
          유료도로 회피
        </label>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-8 text-[11px]"
          disabled={!canCompute || status === "loading"}
          onClick={computeRoute}
        >
          {status === "loading" ? "계산 중..." : "경로 계산"}
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8 text-[11px]" onClick={reset}>
          <RotateCcw className="mr-1 h-3 w-3" aria-hidden />
          초기화
        </Button>
      </div>

      {!canCompute && disabledReason ? (
        <p className="text-[10px] text-slate-500">{disabledReason}</p>
      ) : null}

      {warning ? (
        <p className="flex items-start gap-1 text-[10px] text-amber-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          {warning}
        </p>
      ) : null}

      {error ? <p className="text-[11px] text-rose-400">{error.message}</p> : null}

      {result ? <RouteSummary result={result} /> : null}
    </div>
  );
}
