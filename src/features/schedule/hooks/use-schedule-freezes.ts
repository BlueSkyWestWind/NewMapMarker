"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { fetchScheduleFreezes } from "@/features/schedule/api";
import type { Freeze } from "@/features/schedule/lib/freeze";
import { isScheduleTableMissing } from "@/features/schedule/lib/table-missing";

export const FREEZE_QUERY_KEY = ["facility-schedule-freezes"] as const;

const NO_FREEZES: Freeze[] = [];

interface FreezeResult {
  freezes: Freeze[];
  /** 마이그레이션 전이라 테이블이 없다 */
  tableMissing: boolean;
}

/**
 * 작업금지 기간 조회. `from`~`to`를 생략하면 전부다.
 * 테이블이 아직 없으면 오류로 만들지 않고 빈 목록과 `isTableMissing`을 돌려줘 일정표가 그대로 열린다.
 */
export function useScheduleFreezes(range: { from?: string; to?: string }, enabled = true) {
  const { supabase, user } = useAuthSession();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  const query = useQuery<FreezeResult>({
    queryKey: [...FREEZE_QUERY_KEY, userId, range.from ?? null, range.to ?? null],
    queryFn: async () => {
      try {
        return { freezes: await fetchScheduleFreezes(supabase!, range), tableMissing: false };
      } catch (error) {
        if (isScheduleTableMissing(error)) return { freezes: NO_FREEZES, tableMissing: true };
        throw error;
      }
    },
    enabled: enabled && Boolean(supabase && userId),
    // 테이블이 없다는 결과는 캐시하지 않는다. 마이그레이션을 적용한 뒤 새로고침 없이도 다시 확인되게 한다.
    staleTime: (current) => (current.state.data?.tableMissing ? 0 : 5 * 60_000),
    refetchOnWindowFocus: false,
    retry: false,
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: FREEZE_QUERY_KEY }),
    [queryClient],
  );

  return {
    freezes: query.data?.freezes ?? NO_FREEZES,
    isTableMissing: query.data?.tableMissing ?? false,
    isLoading: query.isLoading,
    error: query.error,
    refresh,
  };
}
