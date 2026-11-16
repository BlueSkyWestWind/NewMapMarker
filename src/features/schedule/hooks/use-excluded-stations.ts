"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchExcludedStations } from "@/features/schedule/api";
import { SCHEDULE_QUERY_KEY } from "@/features/schedule/hooks/use-schedule-range";
import {
  excludedKeySet,
  type ExcludedStation,
} from "@/features/schedule/lib/excluded-stations";
import { isScheduleTableMissing } from "@/features/schedule/lib/table-missing";
import { useAuthSession } from "@/lib/auth/use-auth-session";

const NO_EXCLUDED: ExcludedStation[] = [];

interface ExcludedResult {
  rows: ExcludedStation[];
  tableMissing: boolean;
}

/**
 * 제외된 국소 목록 조회.
 * 테이블이 아직 없으면 오류로 만들지 않고 빈 목록과 `isTableMissing`을 돌려준다.
 */
export function useExcludedStations(enabled = true) {
  const { supabase, user } = useAuthSession();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  const query = useQuery<ExcludedResult>({
    queryKey: [...SCHEDULE_QUERY_KEY, "excluded", userId],
    queryFn: async () => {
      try {
        return { rows: await fetchExcludedStations(supabase!), tableMissing: false };
      } catch (error) {
        if (isScheduleTableMissing(error)) {
          return { rows: NO_EXCLUDED, tableMissing: true };
        }
        throw error;
      }
    },
    enabled: enabled && Boolean(supabase && userId),
    staleTime: (current) => (current.state.data?.tableMissing ? 0 : 60_000),
    refetchOnWindowFocus: false,
    retry: false,
  });

  const rows = query.data?.rows ?? NO_EXCLUDED;
  const keys = useMemo(() => excludedKeySet(rows), [rows]);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [...SCHEDULE_QUERY_KEY, "excluded"] }),
    [queryClient],
  );

  return {
    rows,
    keys,
    isTableMissing: query.data?.tableMissing ?? false,
    isLoading: query.isLoading,
    error: query.error,
    refresh,
  };
}
