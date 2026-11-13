"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import {
  fetchWorksiteWeather,
  refreshWorksiteWeather,
  type RefreshSummary,
} from "@/features/worksite-weather/lib/worksite-weather-api";
import type {
  SiteMatch,
  WorksiteWeatherResponse,
} from "@/features/worksite-weather/types/weather";

export type BoardRowStatus = "loading" | "ok" | "error";

export interface BoardRow {
  site: SiteMatch;
  status: BoardRowStatus;
  data?: WorksiteWeatherResponse;
  error?: string;
}

/**
 * 국소가 많아도 기상청을 한꺼번에 때리지 않는다. 10분 캐시가 있긴 하지만
 * 첫 진입에는 캐시가 비어 있어 저장 국소 수만큼 동시 요청이 나간다.
 */
const MAX_CONCURRENCY = 4;

/**
 * 대시보드 목록의 국소별 기상 조회.
 *
 * 캐시를 새로 만들지 않고 `fetchWorksiteWeather`의 모듈 캐시(10분)를 그대로 탄다 —
 * 지도 오버레이가 같은 캐시를 쓰므로, 따로 두면 같은 국소가 지도와 목록에서 다른 값이 된다.
 */
export function useWorksiteBoard() {
  const savedWeatherSites = useMapMarkerStore((state) => state.savedWeatherSites);
  const [resultById, setResultById] = useState<
    Record<string, { data?: WorksiteWeatherResponse; error?: string }>
  >({});
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // 언마운트 후 setState 방지. 대시보드는 메뉴 전환으로 자주 사라진다.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async (sites: SiteMatch[]) => {
    if (sites.length === 0) return;

    setLoadingIds((prev) => [...new Set([...prev, ...sites.map((s) => s.id)])]);

    const queue = [...sites];
    const runWorker = async () => {
      for (;;) {
        const site = queue.shift();
        if (!site) return;

        try {
          const data = await fetchWorksiteWeather(site);
          if (!aliveRef.current) return;
          setResultById((prev) => ({ ...prev, [site.id]: { data } }));
        } catch (err) {
          if (!aliveRef.current) return;
          // 한 국소가 실패해도 나머지는 계속 채운다.
          setResultById((prev) => ({
            ...prev,
            [site.id]: {
              error: err instanceof Error ? err.message : "조회에 실패했습니다.",
            },
          }));
        } finally {
          if (aliveRef.current) {
            setLoadingIds((prev) => prev.filter((id) => id !== site.id));
          }
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENCY, sites.length) }, runWorker),
    );
  }, []);

  // 아직 결과가 없는 국소만 조회한다. 캐시가 살아 있으면 즉시 돌아온다.
  useEffect(() => {
    const pending = savedWeatherSites.filter((site) => !resultById[site.id]);
    if (pending.length === 0) return;
    void load(pending);
    // resultById를 의존성에 넣으면 조회 결과가 들어올 때마다 다시 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedWeatherSites, load]);

  const retry = useCallback(
    (siteId: string) => {
      const site = savedWeatherSites.find((candidate) => candidate.id === siteId);
      if (!site) return;
      setResultById((prev) => {
        const next = { ...prev };
        delete next[siteId];
        return next;
      });
      void load([site]);
    },
    [savedWeatherSites, load],
  );

  /**
   * [현재 데이터로 갱신]: 기상청에서 새로 받아 저장한 뒤 모든 국소를 다시 읽는다.
   * 같은 격자는 서버가 5분 안에 다시 받지 않으므로 여러 번 눌러도 호출이 늘지 않는다.
   */
  const refreshAll = useCallback(async (): Promise<RefreshSummary | null> => {
    if (savedWeatherSites.length === 0) return null;
    setIsRefreshing(true);
    setRefreshError(null);
    setProgress({ done: 0, total: savedWeatherSites.length });
    try {
      const summary = await refreshWorksiteWeather(savedWeatherSites, (done, total) => {
        if (aliveRef.current) setProgress({ done, total });
      });
      if (aliveRef.current) {
        setResultById({});
        void load(savedWeatherSites);
      }
      return summary;
    } catch (err) {
      if (aliveRef.current) setRefreshError(err instanceof Error ? err.message : "갱신하지 못했습니다.");
      return null;
    } finally {
      if (aliveRef.current) {
        setIsRefreshing(false);
        setProgress(null);
      }
    }
  }, [savedWeatherSites, load]);

  const rows = useMemo<BoardRow[]>(
    () =>
      savedWeatherSites.map((site) => {
        const result = resultById[site.id];
        if (loadingIds.includes(site.id) || !result) {
          return { site, status: "loading" };
        }
        if (result.error) {
          return { site, status: "error", error: result.error };
        }
        return { site, status: "ok", data: result.data };
      }),
    [savedWeatherSites, resultById, loadingIds],
  );

  return { rows, retry, refreshAll, isRefreshing, progress, refreshError };
}
