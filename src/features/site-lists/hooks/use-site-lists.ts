"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { fetchSiteListData } from "@/features/site-lists/api";
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
