'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchMapMarkers } from '@/features/map-marker/api';
import { MAP_MARKER_QUERY_KEY } from '@/features/map-marker/constants/map-config';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export function useMapMarkersQuery() {
  const supabase = getSupabaseBrowserClient();

  return useQuery({
    queryKey: MAP_MARKER_QUERY_KEY,
    queryFn: async () => {
      if (!supabase) {
        throw new Error(
          'Supabase 환경변수가 설정되지 않았습니다. .env.local을 확인하세요.',
        );
      }
      return fetchMapMarkers(supabase);
    },
    enabled: !!supabase,
    staleTime: 30_000,
  });
}
