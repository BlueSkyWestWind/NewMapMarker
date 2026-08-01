"use client";

import { useCallback, useState } from "react";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { fetchParcelBoundary } from "@/features/map-marker/lib/parcel-boundary";

/**
 * 장소 검색. 사이드바 섹션과 상단 전역 검색바가 **같은 구현을 쓰도록** 훅으로 뺐다.
 * 두 벌이 되면 같은 검색어가 화면마다 다른 결과를 낸다.
 */
export function usePlaceSearch() {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const placeSearch = useMapMarkerStore((state) => state.placeSearch);
  const setPlaceSearch = useMapMarkerStore((state) => state.setPlaceSearch);

  const runSearch = useCallback(
    async (rawQuery?: string) => {
      const trimmed = (rawQuery ?? query).trim();
      if (!trimmed || isSearching) return;

      setIsSearching(true);
      setIsError(false);
      setStatus("경계 조회 중...");

      try {
        const result = await fetchParcelBoundary(trimmed);
        setPlaceSearch(result);
        if (result.parcels.length === 0) {
          setStatus("필지 경계를 찾지 못해 위치로 이동했습니다.");
        } else {
          setStatus(
            `경계 ${result.parcels.length}건 표시${result.label ? ` · ${result.label}` : ""}`,
          );
        }
      } catch (err) {
        setIsError(true);
        setStatus(err instanceof Error ? err.message : "검색에 실패했습니다.");
      } finally {
        setIsSearching(false);
      }
    },
    [query, isSearching, setPlaceSearch],
  );

  const clearSearch = useCallback(() => {
    setPlaceSearch(null);
    setStatus(null);
    setIsError(false);
    setQuery("");
  }, [setPlaceSearch]);

  return {
    query,
    setQuery,
    isSearching,
    status,
    isError,
    hasResult: Boolean(placeSearch),
    runSearch,
    clearSearch,
  };
}
