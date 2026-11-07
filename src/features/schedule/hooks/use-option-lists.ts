"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { addOption, DAY_QUERY_KEY, deleteOption, fetchOptionLists } from "@/features/schedule/day-api";
import type { OptionListKey, OptionLists } from "@/features/schedule/lib/day-types";
import { cloneOptionLists, OPTION_LIST_SEEDS } from "@/features/schedule/lib/option-lists";
import { isScheduleTableMissing } from "@/features/schedule/lib/table-missing";

export const OPTION_LISTS_QUERY_KEY = [...DAY_QUERY_KEY, "option-lists"] as const;

interface OptionListsResult {
  lists: OptionLists;
  /** 마이그레이션 전이라 테이블이 없다 */
  tableMissing: boolean;
}

/**
 * 불러오기 전에 쓰는 처음 값 복사본. 렌더마다 새로 만들지 않도록 한 번만 만든다.
 * 상수(`OPTION_LIST_SEEDS`) 자체가 아니라서 받는 쪽이 바꿔도 상수는 안전하다.
 */
let fallbackLists: OptionLists | null = null;
function getFallbackLists(): OptionLists {
  fallbackLists ??= cloneOptionLists(OPTION_LIST_SEEDS);
  return fallbackLists;
}

/**
 * 드롭다운 목록. 불러오기 전이나 테이블이 아직 없을 때는 처음 값(`OPTION_LIST_SEEDS`)을 돌려줘
 * 입력 칸이 비지 않는다. 값 추가·삭제는 관리자만 DB가 받아 준다.
 */
export function useOptionLists() {
  const { supabase, user } = useAuthSession();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  const query = useQuery<OptionListsResult>({
    queryKey: [...OPTION_LISTS_QUERY_KEY, userId],
    queryFn: async () => {
      try {
        return { lists: await fetchOptionLists(supabase!), tableMissing: false };
      } catch (error) {
        if (isScheduleTableMissing(error)) return { lists: cloneOptionLists(OPTION_LIST_SEEDS), tableMissing: true };
        throw error;
      }
    },
    enabled: Boolean(supabase && userId),
    // 테이블이 없다는 결과는 캐시하지 않는다. 마이그레이션을 적용한 뒤 새로고침 없이도 다시 확인되게 한다.
    staleTime: (current) => (current.state.data?.tableMissing ? 0 : 5 * 60_000),
    refetchOnWindowFocus: false,
    retry: false,
  });

  const add = useCallback(
    async (key: OptionListKey, value: string) => {
      if (!supabase) throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
      await addOption(supabase, key, value);
      await queryClient.invalidateQueries({ queryKey: OPTION_LISTS_QUERY_KEY });
    },
    [supabase, queryClient],
  );

  const remove = useCallback(
    async (key: OptionListKey, value: string) => {
      if (!supabase) throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
      await deleteOption(supabase, key, value);
      await queryClient.invalidateQueries({ queryKey: OPTION_LISTS_QUERY_KEY });
    },
    [supabase, queryClient],
  );

  return {
    lists: query.data?.lists ?? getFallbackLists(),
    isTableMissing: query.data?.tableMissing ?? false,
    add,
    remove,
  };
}
