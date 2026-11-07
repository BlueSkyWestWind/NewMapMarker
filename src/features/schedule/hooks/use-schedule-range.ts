"use client";

import { useCallback } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { useIsAdmin } from "@/features/map-marker/hooks/use-is-admin";
import { fetchScheduleRange } from "@/features/schedule/api";
import { isScheduleTableMissing } from "@/features/schedule/lib/table-missing";
import type {
  ScheduleCell,
  ScheduleColumn,
  ScheduleDayNote,
  ScheduleMark,
} from "@/features/schedule/types";

export const SCHEDULE_QUERY_KEY = ["facility-schedule"] as const;

const NO_COLUMNS: ScheduleColumn[] = [];
const NO_CELLS: ScheduleCell[] = [];
const NO_NOTES: ScheduleDayNote[] = [];
const NO_MARKS: ScheduleMark[] = [];

/**
 * 기간(`from`~`to`, `yyyy-mm-dd`)의 일정 조회. 주간·월간 보기가 같은 훅을 쓰고,
 * `enabled`로 보이지 않는 보기의 조회를 끈다. 마이그레이션 전에는 `isTableMissing`이 true다.
 */
export function useScheduleRange(from: string, to: string, enabled = true) {
  const { supabase, user } = useAuthSession();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const { isAdmin } = useIsAdmin();

  const query = useQuery({
    queryKey: [...SCHEDULE_QUERY_KEY, userId, from, to],
    queryFn: () => fetchScheduleRange(supabase!, from, to),
    enabled: enabled && Boolean(supabase && userId),
    retry: false,
    // 주·달을 넘길 때 표가 깜박이며 비지 않게 이전 데이터를 유지한다.
    placeholderData: keepPreviousData,
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: SCHEDULE_QUERY_KEY }),
    [queryClient],
  );

  return {
    columns: query.data?.columns ?? NO_COLUMNS,
    cells: query.data?.cells ?? NO_CELLS,
    dayNotes: query.data?.dayNotes ?? NO_NOTES,
    marks: query.data?.marks ?? NO_MARKS,
    isAdmin,
    isLoading: query.isLoading,
    isTableMissing: isScheduleTableMissing(query.error),
    error: query.error,
    refresh,
  };
}
