"use client";

import { useCallback } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { DAY_QUERY_KEY, deleteArchiveRows, fetchArchive } from "@/features/schedule/day-api";
import type { ArchiveRow } from "@/features/schedule/lib/day-types";
import { isScheduleTableMissing } from "@/features/schedule/lib/table-missing";

/** 누적 보기 목록. */
export const ARCHIVE_QUERY_KEY = [...DAY_QUERY_KEY, "archive"] as const;
/** 일자별 표가 참조하는 국소별 가장 최근 누적 행. 누적을 저장·삭제하면 함께 다시 불러온다. */
export const LATEST_ARCHIVE_QUERY_KEY = [...DAY_QUERY_KEY, "latest-archive"] as const;

const NO_ROWS: ArchiveRow[] = [];

interface ArchiveResult {
  rows: ArchiveRow[];
  /** 마이그레이션 전이라 테이블이 없다 */
  tableMissing: boolean;
}

/**
 * 누적 보기 조회(작업일 내림차순). `remove`는 관리자만 DB가 받아 준다.
 * 테이블이 아직 없으면 빈 목록과 `isTableMissing`을 돌려준다.
 */
export function useArchive(filter: { from?: string; to?: string; text?: string }) {
  const { supabase, user } = useAuthSession();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const from = filter.from ?? null;
  const to = filter.to ?? null;
  const text = filter.text?.trim() ?? "";

  const query = useQuery<ArchiveResult>({
    queryKey: [...ARCHIVE_QUERY_KEY, userId, from, to, text],
    queryFn: async () => {
      try {
        const rows = await fetchArchive(supabase!, {
          from: from ?? undefined,
          to: to ?? undefined,
          text,
        });
        return { rows, tableMissing: false };
      } catch (error) {
        if (isScheduleTableMissing(error)) return { rows: NO_ROWS, tableMissing: true };
        throw error;
      }
    },
    enabled: Boolean(supabase && userId),
    // 테이블이 없다는 결과는 캐시하지 않는다. 마이그레이션을 적용한 뒤 새로고침 없이도 다시 확인되게 한다.
    staleTime: (current) => (current.state.data?.tableMissing ? 0 : 60_000),
    refetchOnWindowFocus: false,
    retry: false,
    // 검색어를 바꿀 때 표가 깜박이며 비지 않게 이전 결과를 유지한다.
    placeholderData: keepPreviousData,
  });

  const remove = useCallback(
    async (rows: { workDate: string; stationKey: string }[]) => {
      if (!supabase) throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
      await deleteArchiveRows(supabase, rows);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ARCHIVE_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: LATEST_ARCHIVE_QUERY_KEY }),
      ]);
    },
    [supabase, queryClient],
  );

  return {
    rows: query.data?.rows ?? NO_ROWS,
    isLoading: query.isLoading,
    /** 새 조건의 결과가 오는 중이라 `rows`가 이전 조건의 값이다(`keepPreviousData`). */
    isStale: query.isPlaceholderData,
    error: query.error,
    isTableMissing: query.data?.tableMissing ?? false,
    remove,
  };
}
