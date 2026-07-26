"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchWorksiteWeather,
  worksiteWeatherKey,
} from "@/features/worksite-weather/lib/worksite-weather-api";
import type { SiteMatch } from "@/features/worksite-weather/types/weather";

/**
 * 선택된 국소의 당일 07~17시 기상 판정.
 * 실제 요청·캐시는 lib/worksite-weather-api가 담당한다(지도 오버레이와 공유).
 */
export function useWorksiteWeather(site: SiteMatch | null) {
  return useQuery({
    queryKey: ["worksite-weather", site ? worksiteWeatherKey(site) : null],
    queryFn: () => fetchWorksiteWeather(site as SiteMatch),
    enabled: !!site,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}
