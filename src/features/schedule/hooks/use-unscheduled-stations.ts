"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { useMapMarkersQuery } from "@/features/map-marker/hooks/use-map-markers-query";
import { fetchScheduleCells } from "@/features/schedule/api";
import { fetchErpMethods } from "@/features/schedule/day-api";
import { stationKey } from "@/features/schedule/lib/day-stations";
import { SCHEDULE_QUERY_KEY } from "@/features/schedule/hooks/use-schedule-range";
import {
  findUnscheduledStations,
  type UnscheduledStation,
} from "@/features/schedule/lib/unscheduled-stations";
import { todayIso } from "@/features/schedule/lib/week";

/** 오늘 이후 일정을 모두 읽기 위한 끝 날짜 */
const FAR_FUTURE = "2099-12-31";
const NO_STATIONS: UnscheduledStation[] = [];

/**
 * 시설일이 없고 오늘 이후 일정에도 없는 장비 국소. 창이 열려 있을 때만 일정을 읽는다.
 * 쿼리 키가 `facility-schedule`로 시작해 일정 갱신(`refresh`) 때 함께 다시 읽는다.
 */
export function useUnscheduledStations(enabled: boolean) {
  const { supabase, user } = useAuthSession();
  const userId = user?.id ?? null;
  const markersQuery = useMapMarkersQuery();
  const equipmentMarkers = markersQuery.data?.equipmentMarkers;
  const today = todayIso();

  const cellsQuery = useQuery({
    queryKey: [...SCHEDULE_QUERY_KEY, "unscheduled", userId, today],
    queryFn: () => fetchScheduleCells(supabase!, today, FAR_FUTURE),
    enabled: enabled && Boolean(supabase && userId),
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const stations = useMemo(() => {
    if (!equipmentMarkers || !cellsQuery.data) return NO_STATIONS;
    return findUnscheduledStations(
      equipmentMarkers,
      cellsQuery.data.map((cell) => cell.mainText),
    );
  }, [equipmentMarkers, cellsQuery.data]);

  // 방식은 마커에 없고 공정관리(erp_details)에만 있다. 목록이 정해지면 그 국소들만 읽는다.
  const labels = useMemo(() => stations.map((station) => station.label), [stations]);
  const methodsQuery = useQuery({
    queryKey: [...SCHEDULE_QUERY_KEY, "unscheduled-methods", userId, labels],
    queryFn: () => fetchErpMethods(supabase!, labels),
    enabled: enabled && Boolean(supabase && userId) && labels.length > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const methods = methodsQuery.data;
  const withMethods = useMemo(
    () => stations.map((station) => ({ ...station, method: methods?.get(stationKey(station.label)) ?? "" })),
    [stations, methods],
  );

  return {
    stations: withMethods,
    isMethodsLoading: methodsQuery.isLoading,
    isLoading: markersQuery.isLoading || cellsQuery.isLoading || (enabled && cellsQuery.isFetching),
    error: markersQuery.error ?? cellsQuery.error,
  };
}
