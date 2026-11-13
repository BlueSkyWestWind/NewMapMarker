"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import { fetchSiteListCount, fetchSiteListData } from "@/features/site-lists/api";
import { isSiteListsTableMissing } from "@/features/site-lists/lib/site-list-view";
import type { SiteList, SiteListMember } from "@/features/site-lists/types";

export const SITE_LISTS_QUERY_KEY = ["site-lists"] as const;

const NO_LISTS: SiteList[] = [];
const NO_MEMBERS: SiteListMember[] = [];

/**
 * 목록과 소속 조회. 지도 데이터와 쿼리를 나눈다 — 마이그레이션 전이거나 조회에 실패해도
 * 지도와 다른 메뉴는 그대로 동작해야 한다.
 */
export function useSiteLists() {
  const { supabase, user } = useAuthSession();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...SITE_LISTS_QUERY_KEY, userId],
    queryFn: () => fetchSiteListData(supabase!, userId!),
    enabled: Boolean(supabase && userId),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: SITE_LISTS_QUERY_KEY }),
    [queryClient],
  );

  return {
    lists: query.data?.lists ?? NO_LISTS,
    members: query.data?.members ?? NO_MEMBERS,
    isAdmin: query.data?.isAdmin ?? false,
    isLoading: query.isLoading,
    isTableMissing: isSiteListsTableMissing(query.error),
    error: query.error,
    refresh,
  };
}

/**
 * 이벤트관리 배지용 목록 수. `useSiteLists`는 모든 소속 행까지 받아 오므로 앱 시작에는 쓰지 않는다.
 * 키가 `SITE_LISTS_QUERY_KEY`로 시작해, 목록을 바꾼 뒤의 `refresh`에 함께 갱신된다.
 */
export function useSiteListCount(): number {
  const { supabase, user } = useAuthSession();
  const userId = user?.id ?? null;
  const query = useQuery({
    queryKey: [...SITE_LISTS_QUERY_KEY, "count", userId],
    queryFn: () => fetchSiteListCount(supabase!),
    enabled: Boolean(supabase && userId),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  return query.data ?? 0;
}
