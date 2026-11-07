"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { fetchIsAppAdmin } from "@/features/map-marker/lib/admin";

const ADMIN_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * 로그인한 사용자가 관리자인지. 조회 실패·테이블 없음은 관리자 아님으로 본다.
 * 세션 확인 중에도 `isLoading`이 true라 호출부가 판정을 미룰 수 있다.
 */
export function useIsAdmin(): { isAdmin: boolean; isLoading: boolean } {
  const { supabase, user, isLoading: isAuthLoading } = useAuthSession();
  const userId = user?.id ?? null;

  const query = useQuery({
    queryKey: ["is-admin", userId],
    queryFn: () => fetchIsAppAdmin(supabase!, userId!),
    enabled: !!supabase && !!userId,
    retry: false,
    staleTime: ADMIN_STALE_TIME_MS,
  });

  return {
    isAdmin: query.data === true,
    isLoading: isAuthLoading || (!!userId && query.isLoading),
  };
}
