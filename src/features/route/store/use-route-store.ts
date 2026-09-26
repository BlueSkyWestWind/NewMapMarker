import { create } from "zustand";
import type {
  NormalizedRouteResult,
  RouteErrorPayload,
  RoutePoint,
  RoutePriority,
} from "@/features/route/types/route";

export type RoutePickTarget = "origin" | "stop" | null;
export type RouteStatus = "idle" | "loading" | "success" | "error";
export type RouteOrderSource = "auto" | "manual";

interface RouteState {
  origin: RoutePoint | null;
  stops: RoutePoint[];
  roundTrip: boolean;
  priority: RoutePriority;
  avoidToll: boolean;
  orderSource: RouteOrderSource;
  /** 지도 클릭으로 출발지/방문지점을 고르는 중인지(§8 UI동작규칙). */
  pickTarget: RoutePickTarget;
  status: RouteStatus;
  result: NormalizedRouteResult | null;
  error: RouteErrorPayload | null;
  /**
   * 각 leg의 구간(section)이 어느 지점→지점인지 라벨로 보여주기 위한 지점 이름 순서.
   * 카카오 응답의 sections[i]는 legPointNames[leg.type][i] → [i+1] 구간과 1:1 대응한다
   * (요청 시 넘긴 origin+stops 순서 그대로이므로 클라이언트가 계산해 둔다).
   */
  legPointNames: Partial<Record<"outbound" | "return", string[]>> | null;
  /** §13 1,500km 사전 경고. 계산을 막지는 않는다. */
  warning: string | null;

  setPickTarget: (target: RoutePickTarget) => void;
  setOrigin: (point: RoutePoint) => void;
  clearOrigin: () => void;
  addStop: (point: RoutePoint) => void;
  removeStop: (routePointId: string) => void;
  /** 드래그 재정렬 — orderSource를 manual로 고정한다. */
  reorderStops: (nextStops: RoutePoint[]) => void;
  setRoundTrip: (value: boolean) => void;
  setPriority: (value: RoutePriority) => void;
  setAvoidToll: (value: boolean) => void;
  setStatus: (status: RouteStatus) => void;
  setResult: (result: NormalizedRouteResult | null) => void;
  setError: (error: RouteErrorPayload | null) => void;
  setLegPointNames: (names: RouteState["legPointNames"]) => void;
  setWarning: (warning: string | null) => void;
  reset: () => void;
}

const initialState = {
  origin: null as RoutePoint | null,
  stops: [] as RoutePoint[],
  roundTrip: false,
  priority: "RECOMMEND" as RoutePriority,
  avoidToll: false,
  orderSource: "auto" as RouteOrderSource,
  pickTarget: null as RoutePickTarget,
  status: "idle" as RouteStatus,
  result: null as NormalizedRouteResult | null,
  error: null as RouteErrorPayload | null,
  legPointNames: null as Partial<Record<"outbound" | "return", string[]>> | null,
  warning: null as string | null,
};

export const useRouteStore = create<RouteState>()((set) => ({
  ...initialState,

  setPickTarget: (target) => set({ pickTarget: target }),

  setOrigin: (point) =>
    set({
      origin: point,
      orderSource: "auto",
      result: null,
      error: null,
      legPointNames: null,
    }),

  clearOrigin: () =>
    set({ origin: null, result: null, error: null, legPointNames: null }),

  addStop: (point) =>
    set((state) => {
      if (state.stops.some((stop) => stop.routePointId === point.routePointId)) {
        return state;
      }
      return {
        stops: [...state.stops, point],
        orderSource: "auto",
        result: null,
        error: null,
        legPointNames: null,
      };
    }),

  removeStop: (routePointId) =>
    set((state) => ({
      stops: state.stops.filter((stop) => stop.routePointId !== routePointId),
      orderSource: "auto",
      result: null,
      error: null,
      legPointNames: null,
    })),

  reorderStops: (nextStops) =>
    set({
      stops: nextStops,
      orderSource: "manual",
      result: null,
      error: null,
      legPointNames: null,
    }),

  setRoundTrip: (value) =>
    set({
      roundTrip: value,
      orderSource: "auto",
      result: null,
      error: null,
      legPointNames: null,
    }),

  setPriority: (value) => set({ priority: value }),
  setAvoidToll: (value) => set({ avoidToll: value }),
  setStatus: (status) => set({ status }),
  setResult: (result) => set({ result }),
  setError: (error) => set({ error }),
  setLegPointNames: (names) => set({ legPointNames: names }),
  setWarning: (warning) => set({ warning }),

  reset: () => set({ ...initialState }),
}));
