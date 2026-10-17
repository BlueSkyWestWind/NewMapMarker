'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMapMarkers } from '@/features/map-marker/api';
import { MAP_MARKER_QUERY_KEY } from '@/features/map-marker/constants/map-config';
import { useAuthSession } from '@/features/map-marker/hooks/use-auth-session';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * 마커는 로그인한 사용자에게만 조회한다. DB RLS도 같은 규칙이지만(authenticated만 SELECT),
 * 비로그인 상태에서 요청 자체를 보내지 않아 화면에 빈 지도만 남게 한다.
 *
 * 쿼리 키 앞부분(`MAP_MARKER_QUERY_KEY`)은 그대로 두고 사용자 id만 덧붙인다 —
 * 기존 `invalidateQueries({ queryKey: MAP_MARKER_QUERY_KEY })`가 접두사로 계속 맞는다.
 */
export function useMapMarkersQuery() {
  const supabase = getSupabaseBrowserClient();
  const queryClient = useQueryClient();
  const { user, isLoading: isAuthLoading } = useAuthSession();
  const userId = user?.id ?? null;

  // 로그아웃·세션 만료 시 이전 사용자의 마커가 메모리에 남지 않게 비운다
  useEffect(() => {
    if (!isAuthLoading && !userId) {
      queryClient.removeQueries({ queryKey: MAP_MARKER_QUERY_KEY });
    }
  }, [isAuthLoading, userId, queryClient]);

  return useQuery({
    queryKey: [...MAP_MARKER_QUERY_KEY, userId],
    queryFn: async () => {
      if (!supabase) {
        throw new Error(
          'Supabase 환경변수가 설정되지 않았습니다. .env.local을 확인하세요.',
        );
      }
      return fetchMapMarkers(supabase);
    },
    enabled: !!supabase && !!userId,
    staleTime: 30_000,
  });
}
