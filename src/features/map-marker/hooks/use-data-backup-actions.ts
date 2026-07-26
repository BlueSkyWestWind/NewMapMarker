'use client';

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { MAP_MARKER_QUERY_KEY } from '@/features/map-marker/constants/map-config';
import { useAuthSession } from '@/features/map-marker/hooks/use-auth-session';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import {
  FULL_BACKUP_TABLE_NAMES,
  buildDatedBackupFilename,
  type FullBackupTables,
} from '@/features/map-marker/lib/excel/data-manager/full-backup-schema';
import { applyMarkerRolesFromStoredGroupRole } from '@/features/map-marker/lib/address-group';
import type { MapMode } from '@/features/map-marker/types/marker';

const INSERT_CHUNK_SIZE = 200;
const ERP_INSERT_CHUNK_SIZE = 100;

function resetFileInput(input: HTMLInputElement | null) {
  if (input) {
    input.value = '';
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function stripIdentityId(rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    const clone = { ...row };
    delete clone.id;
    return clone;
  });
}

/**
 * 복원 시 self-FK 충돌을 피하기 위해 parent_marker_id 는 나중에 맞춘다.
 * group_role(구분) 값은 유지해 백업에서 수정한 대표/SUB 를 복원에 반영한다.
 */
function stripParentMarkerId(rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    const clone = { ...row };
    delete clone.parent_marker_id;
    return clone;
  });
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

  /**
   * 전체 스냅샷 백업(Excel 1시트). `yyyymmdd_mapmarker_backup.xlsx` 형식으로 다운로드.
   */
  const exportFullExcel = useCallback(async () => {
    const MapMarkerExcelManager = (await import('@/features/map-marker/lib/excel/data-manager'))
      .default;
    if (!supabase) {
      toast({
        variant: 'destructive',
        description: 'Supabase가 연결되어 있지 않습니다.',
      });
      return;
    }

    setIsBusy(true);
    try {
      toast({ description: '전체 데이터 조회 중...' });
      const tables = {
        markers: [],
        information: [],
        erp_details: [],
        battery_markers: [],
        battery_specs: [],
      } as FullBackupTables;

      for (const name of FULL_BACKUP_TABLE_NAMES) {
        const { data, error } = await supabase.from(name).select('*');
        if (error) throw error;
        tables[name] = (data ?? []) as Record<string, unknown>[];
      }

      if (!tables.erp_details.length && !tables.markers.length) {
        throw new Error('백업할 장비 데이터가 없습니다.');
      }

      const filename = buildDatedBackupFilename('mapmarker_backup');
      const result = MapMarkerExcelManager.exportFullBackupToExcel(tables, filename) as {
        headerCount: number;
        tables: {
          markers: number;
          information: number;
          erp_details: number;
          battery_markers: number;
          battery_specs: number;
        };
      };

      const stationCount = result.tables.erp_details || result.tables.markers;
      toast({
        title: '전체 백업 완료',
        description:
          `${filename} · 열 ${result.headerCount}개 · 국소 ${stationCount}건` +
          (result.tables.battery_markers || result.tables.battery_specs
            ? ` · 축전지 ${result.tables.battery_markers}/${result.tables.battery_specs}`
            : ''),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      toast({ variant: 'destructive', description: `전체 백업 실패: ${message}` });
    } finally {
      setIsBusy(false);
    }
  }, [supabase, toast]);

  /**
   * 전체 스냅샷 복원(Excel 1시트). 기존 DB를 비운 뒤 파일 내용으로 전면 교체한다.
   */
  const importFullExcel = useCallback(
    async (file: File, input?: HTMLInputElement | null) => {
      const MapMarkerExcelManager = (await import('@/features/map-marker/lib/excel/data-manager'))
        .default;
      if (!supabase) {
        toast({
          variant: 'destructive',
          description: 'Supabase가 연결되어 있지 않습니다.',
        });
        resetFileInput(input ?? null);
        return;
      }

      const confirmed = window.confirm(
        [
          '전체 데이터를 이 백업 엑셀로 전면 교체합니다.',
          '현재 markers·information·erp_details·battery 데이터는 모두 삭제됩니다.',
          '',
          '계속하시겠습니까?',
        ].join('\n'),
      );
      if (!confirmed) {
        resetFileInput(input ?? null);
        return;
      }

      setIsBusy(true);
      try {
        toast({ description: '전체 복원 처리 중...' });
        const tables = (await MapMarkerExcelManager.parseFullBackupExcel(file)) as FullBackupTables;
        const markers = tables.markers;
        const information = tables.information;
        const erpDetails = tables.erp_details;
        const batteryMarkers = tables.battery_markers;
        const batterySpecs = tables.battery_specs;

        const { error: clearMarkersError } = await supabase
          .from('markers')
          .delete()
          .neq('id', '');
        if (clearMarkersError) throw clearMarkersError;

        const { error: clearBatteryError } = await supabase
          .from('battery_markers')
          .delete()
          .neq('id', '');
        if (clearBatteryError) throw clearBatteryError;

        for (const batch of chunkArray(stripParentMarkerId(markers), INSERT_CHUNK_SIZE)) {
          const { error } = await supabase.from('markers').insert(batch);
          if (error) throw error;
        }

        for (const batch of chunkArray(stripIdentityId(information), INSERT_CHUNK_SIZE)) {
          const { error } = await supabase.from('information').insert(batch);
          if (error) throw error;
        }
        for (const batch of chunkArray(stripIdentityId(erpDetails), ERP_INSERT_CHUNK_SIZE)) {
          const { error } = await supabase.from('erp_details').insert(batch);
          if (error) throw error;
        }

        for (const batch of chunkArray(batteryMarkers, INSERT_CHUNK_SIZE)) {
          const { error } = await supabase.from('battery_markers').insert(batch);
          if (error) throw error;
        }
        for (const batch of chunkArray(stripIdentityId(batterySpecs), INSERT_CHUNK_SIZE)) {
          const { error } = await supabase.from('battery_specs').insert(batch);
          if (error) throw error;
        }

        const regroup = await applyMarkerRolesFromStoredGroupRole(supabase);

        await invalidateMarkers();
        toast({
          description:
            `전체 복원 완료 — markers ${markers.length} · information ${information.length} · ` +
            `erp_details ${erpDetails.length} · battery ${batteryMarkers.length}/${batterySpecs.length}` +
            (regroup.subCount > 0
              ? ` · ${regroup.usedStoredRoles ? '구분열' : '자동'} 서브 ${regroup.subCount}건`
              : ''),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '알 수 없는 오류';
        toast({ variant: 'destructive', description: `전체 복원 실패: ${message}` });
      } finally {
        setIsBusy(false);
        resetFileInput(input ?? null);
      }
    },
    [invalidateMarkers, supabase, toast],
  );

  return {
    mode: mode as MapMode,
    isBusy,
    exportFullExcel,
    importFullExcel,
    deleteAllBatteryMarkers,
  };
}
