'use client';

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { MAP_MARKER_QUERY_KEY } from '@/features/map-marker/constants/map-config';
import { useAuthSession } from '@/features/map-marker/hooks/use-auth-session';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import {
  type FullBackupTables,
} from '@/features/map-marker/lib/excel/data-manager/full-backup-schema';
import { chunkArray } from '@/features/map-marker/lib/chunk';
import { downloadFullBackupFile } from '@/features/map-marker/lib/full-backup-file';
import { runWithSafetyBackup, SafetyBackupError } from '@/features/map-marker/lib/safe-restore';
import { applyMarkerRolesFromStoredGroupRole } from '@/features/map-marker/lib/address-group';
import type { MapMode, StagedErpUpload } from '@/features/map-marker/types/marker';
import type { SiteListBackup } from '@/features/site-lists/types';
import { SITE_LISTS_QUERY_KEY } from '@/features/site-lists/hooks/use-site-lists';

const INSERT_CHUNK_SIZE = 200;
const ERP_INSERT_CHUNK_SIZE = 100;

function resetFileInput(input: HTMLInputElement | null) {
  if (input) {
    input.value = '';
  }
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
      const result = await downloadFullBackupFile(supabase, 'mapmarker_backup');
      if (!result) throw new Error('백업할 장비 데이터가 없습니다.');

      const stationCount = result.tables.erp_details || result.tables.markers;
      toast({
        title: '전체 백업 완료',
        description:
          `${result.filename} · 열 ${result.headerCount}개 · 국소 ${stationCount}건` +
          (result.tables.battery_markers || result.tables.battery_specs
            ? ` · 축전지 ${result.tables.battery_markers}/${result.tables.battery_specs}`
            : '') +
          (result.siteListCount !== null ? ` · 국소 목록 ${result.siteListCount}개` : ''),
        duration: 10000,
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
          '(삭제 전에 현재 데이터를 파일로 먼저 내려받습니다.)',
          '(좌표 없이 주소만 있는 장비는 저장하지 않고, 위치 확인 후 등록 대기로 넘깁니다.)',
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
        const parsedTables = (await MapMarkerExcelManager.parseFullBackupExcel(file)) as FullBackupTables;

        // 좌표 없이 주소만 채워 넣은 장비 행은 DB에 넣지 않고 위치 확인 흐름으로 보낸다.
        // DB를 비우기 전에 주소 변환까지 끝내 둔다 — 변환이 실패해도 데이터가 사라지지 않게.
        const { splitBackupForLocationReview } = await import(
          '@/features/map-marker/lib/excel/data-manager/full-backup-split'
        );
        const split = splitBackupForLocationReview(parsedTables);
        const tables = split.restore;
        let stagedUpload: StagedErpUpload | null = null;
        if (split.deferredFacilityCodes.size > 0) {
          toast({
            description: `위치 확인 대상 ${split.deferredFacilityCodes.size}건의 주소를 좌표로 변환 중... (잠시 걸립니다)`,
          });
          const [{ parseErpSheet }, { stageErpRows }] = await Promise.all([
            import('@/features/map-marker/lib/excel-upload-helpers'),
            import('@/features/map-marker/lib/erp-staging'),
          ]);
          const reviewRows = (await parseErpSheet(file)).filter((row) =>
            split.deferredFacilityCodes.has(String(row.facilityCode ?? '').trim()),
          );
          const staged = await stageErpRows({
            rows: reviewRows,
            existing: [],
            previous: new Map(),
            needsRegroup: false,
          });
          // 가려낸 마커 수와 확인 대기 행 수가 다르면 중단한다. 이 행들은 복원에서 빠져 있어
          // 그대로 진행하면 유실된다(통합시설코드가 겹치거나 시트 양식이 다를 때).
          if (staged.reviewRows.length !== split.deferredCount) {
            throw new Error(
              `위치 확인 대상 ${split.deferredCount}건 중 ${staged.reviewRows.length}건만 읽혀 복원을 중단했습니다. 데이터는 바뀌지 않았습니다. 통합시설코드 중복·시트 양식을 확인하세요.`,
            );
          }
          // 복원하는 행(좌표 있음)은 확인할 필요가 없고, 코드·주소 없는 행도 이미 복원된다.
          stagedUpload = { ...staged, existingRows: [], skippedRows: [] };
        }

        const markers = tables.markers;
        const information = tables.information;
        const erpDetails = tables.erp_details;
        const batteryMarkers = tables.battery_markers;
        const batterySpecs = tables.battery_specs;

        // 파일을 받지 못했는데 DB를 지우면 되돌릴 수 없다. 현재 데이터를 먼저 내려받고, 실패하면 중단한다.
        await runWithSafetyBackup(
          async () => {
            toast({ description: '복원 전 현재 데이터를 파일로 내려받는 중...' });
            await downloadFullBackupFile(supabase, '복원전_mapmarker_backup');
          },
          async () => {
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
          },
        );

        const regroup = await applyMarkerRolesFromStoredGroupRole(supabase);

        await invalidateMarkers();

        if (stagedUpload) {
          const { stagedMarkerRowToPending } = await import(
            '@/features/map-marker/lib/excel-upload-helpers'
          );
          const store = useMapMarkerStore.getState();
          store.clearPendingMarkers('equipment');
          store.addPendingMarkers(
            'equipment',
            stagedUpload.reviewRows
              .filter((row) => row.lat !== null && row.lng !== null)
              .map(stagedMarkerRowToPending),
          );
          store.setStagedErpUpload(stagedUpload);
        }

        // 장비 복원이 끝난 뒤라, 목록 복원이 실패해도 장비 복원을 되돌리지 않고 따로 알린다.
        try {
          const siteListBackup = (await MapMarkerExcelManager.parseSiteListBackup(
            file,
          )) as SiteListBackup | null;
          const userId = (await supabase.auth.getUser()).data.user?.id;
          if (siteListBackup && userId) {
            const siteListApi = await import('@/features/site-lists/api');
            const isAdmin = await siteListApi.fetchIsAppAdmin(supabase, userId);
            await siteListApi.restoreSiteLists(supabase, siteListBackup, isAdmin);
            await queryClient.invalidateQueries({ queryKey: SITE_LISTS_QUERY_KEY });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : '알 수 없는 오류';
          toast({
            variant: 'destructive',
            description: `장비는 복원했지만 국소 목록 복원에 실패했습니다: ${message}`,
          });
        }

        toast({
          description:
            `전체 복원 완료 — markers ${markers.length} · information ${information.length} · ` +
            `erp_details ${erpDetails.length} · battery ${batteryMarkers.length}/${batterySpecs.length}` +
            (regroup.subCount > 0
              ? ` · ${regroup.usedStoredRoles ? '구분열' : '자동'} 서브 ${regroup.subCount}건`
              : '') +
            (stagedUpload
              ? ` · 위치 확인 대기 ${stagedUpload.reviewRows.length}건(마커관리 → 장비에서 확인 후 등록)`
              : '') +
            (split.unlocatableCount > 0
              ? ` · 주소 없음 ${split.unlocatableCount}건(좌표 없이 복원)`
              : ''),
        });
      } catch (error) {
        if (error instanceof SafetyBackupError) {
          const reason = error.cause instanceof Error ? ` (${error.cause.message})` : '';
          toast({
            variant: 'destructive',
            description: `복원 전 백업 파일을 만들지 못해 복원을 중단했습니다. 데이터는 바뀌지 않았습니다.${reason}`,
          });
          return;
        }
        const message = error instanceof Error ? error.message : '알 수 없는 오류';
        toast({ variant: 'destructive', description: `전체 복원 실패: ${message}` });
      } finally {
        setIsBusy(false);
        resetFileInput(input ?? null);
      }
    },
    [invalidateMarkers, queryClient, supabase, toast],
  );

  return {
    mode: mode as MapMode,
    isBusy,
    exportFullExcel,
    importFullExcel,
    deleteAllBatteryMarkers,
  };
}
