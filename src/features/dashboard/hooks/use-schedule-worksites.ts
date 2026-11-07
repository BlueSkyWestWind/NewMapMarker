"use client";

import { useEffect, useMemo } from "react";
import { useMapMarkersQuery } from "@/features/map-marker/hooks/use-map-markers-query";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { useScheduleRange } from "@/features/schedule/hooks/use-schedule-range";
import { todayIso } from "@/features/schedule/lib/week";
import { equipmentMarkerToCandidate } from "@/features/worksite-weather/lib/site-search";
import {
  matchScheduleStations,
  planScheduleSync,
  todayStationNames,
} from "../lib/schedule-worksites";

export interface ScheduleWorksiteSummary {
  /** 오늘 시설일정의 국소명 개수 */
  total: number;
  /** 등록된 장비 국소와 이름이 일치해 작업 국소로 담기는 개수 */
  matched: number;
  /** 이름이 달라 제외된 개수 */
  unmatched: number;
}

/**
 * 시설일정의 오늘 국소를 오늘의 작업 국소(날씨 판정 보드)에 자동으로 담는다.
 *
 * 일정 조회가 **성공한 뒤에만** 목록을 바꾼다 — 오류·시설일정 테이블 없음·로그인 전에는
 * 기존 작업 국소가 지워지지 않게 아무것도 하지 않는다. 직접 담은 국소는 건드리지 않고,
 * 같은 날 사용자가 뺀 국소는 다시 넣지 않는다(`planScheduleSync`).
 * 저장된 목록은 effect 안에서 `getState()`로 읽어, 사용자가 목록을 고칠 때마다 다시 도는 일이 없게 한다.
 */
export function useScheduleWorksites(): ScheduleWorksiteSummary | null {
  const today = todayIso();
  const { cells, isLoaded } = useScheduleRange(today, today);
  const { data } = useMapMarkersQuery();
  const equipmentMarkers = data?.equipmentMarkers;
  const applyScheduleSync = useMapMarkerStore((state) => state.applyScheduleSync);

  const result = useMemo(() => {
    if (!isLoaded || !equipmentMarkers) return null;
    const names = todayStationNames(cells, today);
    const candidates = equipmentMarkers.map(equipmentMarkerToCandidate);
    return { names, ...matchScheduleStations(names, candidates) };
  }, [isLoaded, equipmentMarkers, cells, today]);

  useEffect(() => {
    if (!result) return;
    const { savedWeatherSites, scheduleSync } = useMapMarkerStore.getState();
    const plan = planScheduleSync({
      saved: savedWeatherSites,
      matches: result.matches,
      today,
      previous: scheduleSync,
    });
    if (plan.changed) applyScheduleSync(plan.sites, plan.sync);
  }, [result, today, applyScheduleSync]);

  return result
    ? {
        total: result.names.length,
        matched: result.matchedCount,
        unmatched: result.unmatched.length,
      }
    : null;
}
