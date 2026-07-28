"use client";

import { useQuery } from "@tanstack/react-query";
import { cctvQueryKey, fetchCctv, type CctvQuery } from "@/features/cctv/lib/cctv-api";

/**
 * CCTV 목록 조회.
 * ITS는 월 1회 갱신이므로(계획서 §8.1) 자주 다시 부를 이유가 없다.
 */
export function useCctvQuery(query: CctvQuery | null) {
  return useQuery({
    queryKey: ["cctv", query ? cctvQueryKey(query) : null],
    queryFn: () => fetchCctv(query as CctvQuery),
    enabled: !!query,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}
