"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchIncompleteCells, type IncompleteQuery } from "@/features/schedule/api";
import { SCHEDULE_QUERY_KEY } from "@/features/schedule/hooks/use-schedule-range";
import { isResultColumnMissing } from "@/features/schedule/lib/table-missing";
import type { ScheduleCell } from "@/features/schedule/types";
import { useAuthSession } from "@/lib/auth/use-auth-session";

const NO_CELLS: ScheduleCell[] = [];

/** 미시설(`undone`) 또는 일부완료(`partial`) 일정 칸 목록을 조회한다. */
export function useIncompleteCells(queryInput: IncompleteQuery) {
  const { supabase, user } = useAuthSession();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  const sortedColumnIds = useMemo(
    () => (queryInput.columnIds ? [...queryInput.columnIds].sort() : []),
    [queryInput.columnIds],
  );

  const query = useQuery({
    queryKey: [
      ...SCHEDULE_QUERY_KEY,
      "incomplete",
      userId,
      queryInput.status,
      queryInput.from ?? null,
      queryInput.to ?? null,
      sortedColumnIds,
    ],
    queryFn: () =>
      fetchIncompleteCells(supabase!, {
        status: queryInput.status,
        from: queryInput.from,
        to: queryInput.to,
        columnIds: sortedColumnIds,
      }),
    enabled: Boolean(supabase && userId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [...SCHEDULE_QUERY_KEY, "incomplete"] }),
    [queryClient],
  );

  return {
    cells: query.data?.cells ?? NO_CELLS,
    truncated: query.data?.truncated ?? false,
    isLoading: query.isLoading,
    error: query.error,
    isResultMissing: isResultColumnMissing(query.error),
    refresh,
  };
}
