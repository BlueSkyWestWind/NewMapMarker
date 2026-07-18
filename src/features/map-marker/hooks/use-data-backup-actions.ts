'use client';

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_MARKER_COLOR } from '@/features/map-marker/constants/facility-teams';
import { MAP_MARKER_QUERY_KEY } from '@/features/map-marker/constants/map-config';
import { useAuthSession } from '@/features/map-marker/hooks/use-auth-session';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import type { MapMode } from '@/features/map-marker/types/marker';

type ParsedMarkerRow = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  memo?: string;
  tags?: string[];
  color?: string;
  facilityTeam?: string;
  facilityCode?: string | null;
  roadAddress?: string;
  jibunAddress?: string;
  address?: string;
  createdAt?: string;
};

function toIsoTimestamp(value?: string) {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

function resetFileInput(input: HTMLInputElement | null) {
  if (input) {
    input.value = '';
  }
}

export function useDataBackupActions() {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mode = useMapMarkerStore((state) => state.mode);
  const [isBusy, setIsBusy] = useState(false);

  const invalidateMarkers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: MAP_MARKER_QUERY_KEY });
  }, [queryClient]);

  const exportMarkersExcel = useCallback(async () => {
      const MapMarkerExcelManager = (await import('@/features/map-marker/lib/excel/data-manager')).default;
    if (!supabase) {
      toast({
        variant: 'destructive',
        description: 'Supabase가 연결되어 있지 않습니다.',
      });
      return;
    }

    setIsBusy(true);
    try {
      const table = mode === 'battery' ? 'battery_markers' : 'markers';
      toast({ description: `Supabase ${table} 테이블 조회 중...` });

      const { data, error } = await supabase.from(table).select('*');
      if (error) throw error;

      if (!data?.length) {
        toast({ description: '백업할 마커가 없습니다.' });
        return;
      }

      if (mode === 'battery') {
        const dateStr = new Date().toISOString().split('T')[0];
        const count = MapMarkerExcelManager.exportBatteryMarkersToExcel(
          data.map((row) => ({
            id: row.id,
            name: row.name,
            lat: row.lat,
            lng: row.lng,
            address: row.address ?? '',
            memo: row.memo ?? '',
            tags: row.tags ?? [],
            color: row.color ?? DEFAULT_MARKER_COLOR,
            facilityTeam: row.facility_team ?? '',
            createdAt: row.created_at,
          })),
          `battery_markers_backup_${dateStr}.xlsx`,
        );
        toast({ description: `축전지 마커 Excel 백업 완료 (총 ${count}건)` });
        return;
      }

      const dateStr = new Date().toISOString().split('T')[0];
      const count = MapMarkerExcelManager.exportMarkersToExcel(
        data.map((row) => ({
          id: row.id,
          name: row.name,
          lat: row.lat,
          lng: row.lng,
          memo: row.memo ?? '',
          tags: row.tags ?? [],
          color: row.color ?? DEFAULT_MARKER_COLOR,
          facilityTeam: row.facility_team ?? '',
          facilityCode: row.facility_code,
          roadAddress: row.road_address ?? '',
          jibunAddress: row.jibun_address ?? '',
          createdAt: row.created_at,
        })),
        `markers_backup_${dateStr}.xlsx`,
      );
      toast({ description: `위치 마커 Excel 백업 완료 (총 ${count}건)` });
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      toast({ variant: 'destructive', description: `Excel 백업 오류: ${message}` });
    } finally {
      setIsBusy(false);
    }
  }, [mode, supabase, toast]);

  const importMarkersExcel = useCallback(
    async (file: File, input?: HTMLInputElement | null) => {
      const MapMarkerExcelManager = (await import('@/features/map-marker/lib/excel/data-manager')).default;
      if (!supabase) {
        toast({
          variant: 'destructive',
          description: 'Supabase가 연결되어 있지 않습니다.',
        });
        resetFileInput(input ?? null);
        return;
      }

      setIsBusy(true);
      try {
        toast({ description: '데이터 복원 처리 중...' });

        const parsed = (mode === 'battery'
          ? await MapMarkerExcelManager.parseBatteryExcel(file)
          : await MapMarkerExcelManager.importMarkersFromExcel(file)) as ParsedMarkerRow[];

        if (!parsed.length) {
          toast({ description: '복원할 마커 데이터가 없습니다.' });
          return;
        }

        if (mode === 'battery') {
          const bulkData = parsed.map((marker) => ({
            id: marker.id,
            name: marker.name,
            lat: marker.lat,
            lng: marker.lng,
            address: marker.address ?? '',
            memo: marker.memo ?? '',
            tags: marker.tags ?? [],
            color: marker.color ?? DEFAULT_MARKER_COLOR,
            facility_team: marker.facilityTeam ?? '',
            created_at: toIsoTimestamp(marker.createdAt),
          }));

          const { error } = await supabase
            .from('battery_markers')
            .upsert(bulkData, { onConflict: 'id' });
          if (error) throw error;
        } else {
          const bulkData = parsed.map((marker) => ({
            id: marker.id,
            name: marker.name,
            lat: marker.lat,
            lng: marker.lng,
            memo: marker.memo ?? '',
            tags: marker.tags ?? [],
            color: marker.color ?? DEFAULT_MARKER_COLOR,
            facility_team: marker.facilityTeam ?? '',
            facility_code: marker.facilityCode ?? null,
            road_address: marker.roadAddress ?? '',
            jibun_address: marker.jibunAddress ?? '',
            created_at: toIsoTimestamp(marker.createdAt),
          }));

          const { error } = await supabase
            .from('markers')
            .upsert(bulkData, { onConflict: 'id' });
          if (error) throw error;
        }

        await invalidateMarkers();
        toast({
          description: `위치 마커 복원이 완료되었습니다. (총 ${parsed.length}건)`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '알 수 없는 오류';
        toast({
          variant: 'destructive',
          description: `복원 실패: ${message}`,
        });
      } finally {
        setIsBusy(false);
        resetFileInput(input ?? null);
      }
    },
    [invalidateMarkers, mode, supabase, toast],
  );

  const exportInfoExcel = useCallback(async () => {
      const MapMarkerExcelManager = (await import('@/features/map-marker/lib/excel/data-manager')).default;
    if (!supabase) {
      toast({
        variant: 'destructive',
        description: 'Supabase가 연결되어 있지 않아 상세 장비 정보를 백업할 수 없습니다.',
      });
      return;
    }

    setIsBusy(true);
    try {
      toast({ description: 'Supabase information 테이블 조회 중...' });
      const { data, error } = await supabase.from('information').select('*');
      if (error) throw error;

      if (!data?.length) {
        toast({ description: '백업할 상세 장비 데이터가 없습니다.' });
        return;
      }

      const dateStr = new Date().toISOString().split('T')[0];
      const count = MapMarkerExcelManager.exportInfoToExcel(
        data,
        `information_backup_${dateStr}.xlsx`,
      );
      toast({ description: `상세 장비 정보 Excel 백업 완료 (총 ${count}건)` });
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      toast({
        variant: 'destructive',
        description: `information Excel 백업 실패: ${message}`,
      });
    } finally {
      setIsBusy(false);
    }
  }, [supabase, toast]);

  const importInfoExcel = useCallback(
    async (file: File, input?: HTMLInputElement | null) => {
      const MapMarkerExcelManager = (await import('@/features/map-marker/lib/excel/data-manager')).default;
      if (!supabase) {
        toast({
          variant: 'destructive',
          description: 'Supabase가 연결되어 있지 않아 복원할 수 없습니다.',
        });
        resetFileInput(input ?? null);
        return;
      }

      setIsBusy(true);
      try {
        toast({ description: '상세 장비 데이터 복원 처리 중...' });
        const parsedData = (await MapMarkerExcelManager.parseInfoExcel(
          file,
        )) as Record<string, unknown>[];

        if (!parsedData.length) {
          toast({ description: '복원할 상세 장비 데이터가 없습니다.' });
          return;
        }

        const { data: markersList, error: markersError } = await supabase
          .from('markers')
          .select('id, name, facility_code');
        if (markersError) throw markersError;

        const result = await MapMarkerExcelManager.upsertInformationToSupabase(
          supabase,
          parsedData,
          markersList ?? [],
        );

        await invalidateMarkers();

        let message = `상세 장비 정보 복원이 완료되었습니다. (총 ${parsedData.length}건)`;
        if (result.unlinkedCount > 0) {
          message += ` marker_id 미연결 ${result.unlinkedCount}건 — 장소이름·통합시설코드를 확인하세요.`;
        }
        if (result.warning) {
          message += ` ${result.warning}`;
        }

        toast({ description: message });
      } catch (error) {
        const message = error instanceof Error ? error.message : '알 수 없는 오류';
        toast({
          variant: 'destructive',
          description: `상세 장비 복원 실패: ${message}`,
        });
      } finally {
        setIsBusy(false);
        resetFileInput(input ?? null);
      }
    },
    [invalidateMarkers, supabase, toast],
  );

  const deleteAllBatteryMarkers = useCallback(async () => {
    if (!supabase) {
      toast({
        variant: 'destructive',
        description: 'Supabase가 연결되어 있지 않습니다.',
      });
      return;
    }

    const { count: dbCountBefore, error: countError } = await supabase
      .from('battery_markers')
      .select('id', { count: 'exact', head: true });
    if (countError) {
      toast({
        variant: 'destructive',
        description: `삭제 전 DB 건수 조회 실패: ${countError.message}`,
      });
      return;
    }

    if (!dbCountBefore) {
      toast({ description: '삭제할 등록된 축전지 데이터가 없습니다.' });
      return;
    }

    const confirmed = window.confirm(
      [
        `DB ${dbCountBefore}건을 모두 삭제합니다.`,
        'Supabase DB(battery_markers·battery_specs)에서 영구 삭제되며 복구할 수 없습니다.',
        '',
        '계속하시겠습니까?',
      ].join('\n'),
    );
    if (!confirmed) return;

    setIsBusy(true);
    try {
      const { error: deleteError } = await supabase
        .from('battery_markers')
        .delete()
        .neq('id', '');
      if (deleteError) throw deleteError;

      const { count: dbCountAfter, error: verifyError } = await supabase
        .from('battery_markers')
        .select('id', { count: 'exact', head: true });
      if (verifyError) throw verifyError;

      if (dbCountAfter && dbCountAfter > 0) {
        throw new Error(`삭제 검증 실패: DB에 ${dbCountAfter}건이 남아 있습니다.`);
      }

      await invalidateMarkers();
      toast({ description: `축전지 등록 데이터 ${dbCountBefore}건이 삭제되었습니다.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      toast({
        variant: 'destructive',
        description: `일괄 삭제 실패: ${message}`,
      });
    } finally {
      setIsBusy(false);
    }
  }, [invalidateMarkers, supabase, toast]);

  return {
    mode: mode as MapMode,
    isBusy,
    exportMarkersExcel,
    importMarkersExcel,
    exportInfoExcel,
    importInfoExcel,
    deleteAllBatteryMarkers,
  };
}
