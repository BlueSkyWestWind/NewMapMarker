import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RoutePoint } from "@/features/route/types/route";

interface SavedOriginsState {
  origins: RoutePoint[];
  addOrigin: (point: RoutePoint) => void;
  removeOrigin: (routePointId: string) => void;
}

/**
 * 자주 쓰는 출발지(사무실·차고 등)를 즐겨찾기로 저장해 재사용한다.
 * 국소 DB가 아니라 이 브라우저(localStorage)에만 남는 개인용 목록이다.
 */
export const useSavedOriginsStore = create<SavedOriginsState>()(
  persist(
    (set) => ({
      origins: [],
      addOrigin: (point) =>
        set((state) => {
          if (state.origins.some((origin) => origin.routePointId === point.routePointId)) {
            return state;
          }
          return { origins: [...state.origins, point] };
        }),
      removeOrigin: (routePointId) =>
        set((state) => ({
          origins: state.origins.filter((origin) => origin.routePointId !== routePointId),
        })),
    }),
    { name: "route-saved-origins" },
  ),
);
