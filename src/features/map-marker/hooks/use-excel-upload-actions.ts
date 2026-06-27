'use client';

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  DEFAULT_MARKER_COLOR,
  PENDING_MARKER_COLOR,
  TEMP_MARKER_COLOR,
} from '@/features/map-marker/constants/facility-teams';
import { MAP_MARKER_QUERY_KEY } from '@/features/map-marker/constants/map-config';
import MapMarkerExcelManager from '@/features/map-marker/lib/excel/data-manager';
import { geocodeAddressQueue } from '@/features/map-marker/lib/geocode';
import { useAuthSession } from '@/features/map-marker/hooks/use-auth-session';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import type {
  BatteryMarker,
  EquipmentMarker,
  MarkerRecord,
} from '@/features/map-marker/types/marker';

interface ParsedExcelRow {
  id?: string;
  name?: string;
  lat?: number;
  lng?: number;
  address?: string;
  memo?: string;
  tags?: string[];
  color?: string;
  facilityCode?: string;
  projectCode?: string;
  facilityYear?: string;
  businessType?: string;
  finalStationName?: string;
  eqClass?: string;
  eqType?: string;
  installDate?: string;
  openDate?: string;
  roadAddress?: string;
  jibunAddress?: string;
}

function resetFileInput(input: HTMLInputElement | null) {
  if (input) {
    input.value = '';
  }
}

function resolveStoredMarkerColor(color: string | undefined) {
  if (!color || color === PENDING_MARKER_COLOR || color === TEMP_MARKER_COLOR) {
    return DEFAULT_MARKER_COLOR;
  }
  return color;
}

function isValidCoordinate(value: number) {
  return Number.isFinite(value);
}

function toEquipmentMarker(marker: ParsedExcelRow, isPending = true): EquipmentMarker {
  return {
    id: String(marker.id ?? `pending_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`),
    name: String(marker.name ?? ''),
    lat: Number(marker.lat),
    lng: Number(marker.lng),
    memo: String(marker.memo ?? ''),
    tags: Array.isArray(marker.tags) ? marker.tags : [],
    color: isPending ? PENDING_MARKER_COLOR : String(marker.color ?? DEFAULT_MARKER_COLOR),
    facilityTeam: '',
    roadAddress: String(marker.roadAddress ?? marker.address ?? ''),
    jibunAddress: String(marker.jibunAddress ?? ''),
    facilityCode: String(marker.facilityCode ?? ''),
    projectCode: String(marker.projectCode ?? ''),
    facilityYear: String(marker.facilityYear ?? ''),
    businessType: String(marker.businessType ?? ''),
    finalStationName: String(marker.finalStationName ?? ''),
    eqClass: String(marker.eqClass ?? ''),
    eqType: String(marker.eqType ?? ''),
    installDate: String(marker.installDate ?? ''),
    openDate: String(marker.openDate ?? ''),
    createdAt: new Date().toISOString().split('T')[0],
    isPending,
  };
}

export function useExcelUploadActions() {
  const { supabase, isAuthenticated } = useAuthSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mode = useMapMarkerStore((state) => state.mode);
  const pendingMarkers =
    mode === 'equipment'
      ? useMapMarkerStore((state) => state.pendingEquipmentMarkers)
      : useMapMarkerStore((state) => state.pendingBatteryMarkers);
  const addPendingMarkers = useMapMarkerStore((state) => state.addPendingMarkers);
  const clearPendingMarkers = useMapMarkerStore((state) => state.clearPendingMarkers);
  const removePendingMarkers = useMapMarkerStore((state) => state.removePendingMarkers);
  const setFilters = useMapMarkerStore((state) => state.setFilters);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const invalidateMarkers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: MAP_MARKER_QUERY_KEY });
  }, [queryClient]);

  const uploadEquipmentExcel = useCallback(
    async (file: File, input?: HTMLInputElement | null) => {
      if (!isAuthenticated) {
        toast({
          variant: 'destructive',
          description: '엑셀 위치 업로드는 로그인 후 사용할 수 있습니다.',
        });
        resetFileInput(input ?? null);
        return;
      }

      setIsUploading(true);
      setStatusText('Excel 파일 분석 중...');

      try {
        const parsedData = (await MapMarkerExcelManager.parseExcelOrCSV(
          file,
        )) as ParsedExcelRow[];
        const withCoords = parsedData.filter(
          (item) => item.lat !== undefined && item.lng !== undefined,
        );
        const needGeocoding = parsedData.filter(
          (item) => item.lat === undefined || item.lng === undefined,
        );

        let geocodeResults: typeof parsedData = [];
        let failCount = 0;

        if (needGeocoding.length > 0) {
          setStatusText(`주소 좌표 변환 시작... (총 ${needGeocoding.length}건)`);
          const geocoded = await geocodeAddressQueue(needGeocoding, (current, total) => {
            setStatusText(`주소 좌표 변환 중... (${current}/${total})`);
          });
          geocodeResults = geocoded.results.map((item) => ({
            ...item,
            roadAddress: item.address ?? '',
            jibunAddress: '',
          }));
          failCount = geocoded.failCount;
        }

        const finalMarkers = [...withCoords, ...geocodeResults].map((marker) =>
          toEquipmentMarker(marker, true),
        );

        if (!finalMarkers.length) {
          throw new Error('가져올 수 있는 유효한 위치 데이터가 없습니다.');
        }

        const existingIds = new Set(pendingMarkers.map((marker) => marker.id));
        const newMarkers = finalMarkers.filter((marker) => !existingIds.has(marker.id));
        addPendingMarkers('equipment', newMarkers);

        let summary = `엑셀 위치 마킹 완료! 총 ${newMarkers.length}개 장소가 대기 중입니다.`;
        if (failCount > 0) {
          summary += ` (주소 찾기 실패: ${failCount}건)`;
        }
        toast({ description: summary });
      } catch (error) {
        const message = error instanceof Error ? error.message : '알 수 없는 오류';
        toast({ variant: 'destructive', description: message });
      } finally {
        setIsUploading(false);
        setStatusText(null);
        resetFileInput(input ?? null);
      }
    },
    [addPendingMarkers, isAuthenticated, pendingMarkers, toast],
  );

  const uploadInfoExcel = useCallback(
    async (file: File, input?: HTMLInputElement | null) => {
      if (!isAuthenticated || !supabase) {
        toast({
          variant: 'destructive',
          description: '상세 장비 업로드는 로그인 후 사용할 수 있습니다.',
        });
        resetFileInput(input ?? null);
        return;
      }

      setIsUploading(true);
      setStatusText('상세 장비 정보 파일 분석 중...');

      try {
        const parsedData = (await MapMarkerExcelManager.parseInfoExcel(
          file,
        )) as Record<string, unknown>[];
        if (!parsedData.length) {
          toast({ description: '업로드할 상세 장비 데이터가 없습니다.' });
          return;
        }

        const { data: markersList, error } = await supabase
          .from('markers')
          .select('id, name, facility_code');
        if (error) throw error;

        const result = await MapMarkerExcelManager.upsertInformationToSupabase(
          supabase,
          parsedData,
          markersList ?? [],
        );

        await invalidateMarkers();

        let message = `상세 장비 정보 업로드 완료 (총 ${parsedData.length}건)`;
        if (result.unlinkedCount > 0) {
          message += ` · marker_id 미연결 ${result.unlinkedCount}건`;
        }
        toast({ description: message });
      } catch (error) {
        const message = error instanceof Error ? error.message : '알 수 없는 오류';
        toast({ variant: 'destructive', description: message });
      } finally {
        setIsUploading(false);
        setStatusText(null);
        resetFileInput(input ?? null);
      }
    },
    [invalidateMarkers, isAuthenticated, supabase, toast],
  );

  const uploadBatteryExcel = useCallback(
    async (file: File, input?: HTMLInputElement | null) => {
      if (!isAuthenticated) {
        toast({
          variant: 'destructive',
          description: '축전지 엑셀 업로드는 로그인 후 사용할 수 있습니다.',
        });
        resetFileInput(input ?? null);
        return;
      }

      setIsUploading(true);
      setStatusText('축전지 Excel 파일 분석 중...');

      try {
        const parsed = (await MapMarkerExcelManager.parseBatteryExcel(
          file,
        )) as ParsedExcelRow[];
        if (!parsed.length) {
          throw new Error('가져올 수 있는 유효한 축전지 데이터가 없습니다.');
        }

        const needGeocoding = parsed.filter(
          (item) => item.lat === undefined || item.lng === undefined,
        );
        let results = parsed.filter(
          (item) => item.lat !== undefined && item.lng !== undefined,
        );

        if (needGeocoding.length > 0) {
          setStatusText(`주소 좌표 변환 중... (총 ${needGeocoding.length}건)`);
          const geocoded = await geocodeAddressQueue(needGeocoding, (current, total) => {
            setStatusText(`주소 좌표 변환 중... (${current}/${total})`);
          });
          results = [...results, ...geocoded.results];
        }

        const pendingBatteryMarkers = results.map((marker) => ({
          ...marker,
          id: String(marker.id ?? `bat_pending_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`),
          isPending: true,
          color: PENDING_MARKER_COLOR,
        })) as MarkerRecord[];

        addPendingMarkers('battery', pendingBatteryMarkers);
        toast({
          description: `축전지 ${pendingBatteryMarkers.length}건이 대기 목록에 추가되었습니다. 전체 전송으로 DB에 저장하세요.`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '알 수 없는 오류';
        toast({ variant: 'destructive', description: message });
      } finally {
        setIsUploading(false);
        setStatusText(null);
        resetFileInput(input ?? null);
      }
    },
    [addPendingMarkers, isAuthenticated, toast],
  );

  const cancelPendingMarkers = useCallback(() => {
    if (!pendingMarkers.length) return;

    const confirmed = window.confirm(
      `대기 중인 ${pendingMarkers.length}개의 위치 마킹을 모두 취소하시겠습니까?`,
    );
    if (!confirmed) return;

    clearPendingMarkers(mode);
    toast({ description: '임시 대기 마커가 모두 삭제되었습니다.' });
  }, [clearPendingMarkers, mode, pendingMarkers.length, toast]);

  const submitPendingMarkers = useCallback(
    async (isTemp = false) => {
      if (!pendingMarkers.length) return;

      if (!isTemp && !supabase) {
        toast({
          variant: 'destructive',
          description: 'Supabase가 연결되어 있지 않습니다.',
        });
        return;
      }

      setIsUploading(true);
      try {
        if (isTemp) {
          const tempMarkers = pendingMarkers.map((marker) => ({
            ...marker,
            isPending: false,
            isTemp: true,
            color: TEMP_MARKER_COLOR,
          }));
          removePendingMarkers(mode, pendingMarkers.map((marker) => marker.id));
          addPendingMarkers(mode, tempMarkers);
          toast({
            description: `대기 마커 ${tempMarkers.length}개가 임시 마커(빨간색)로 등록되었습니다.`,
          });
          return;
        }

        const currentMode = useMapMarkerStore.getState().mode;
        if (currentMode === 'battery') {
          const batteryPending = pendingMarkers as BatteryMarker[];
          const invalidCount = batteryPending.filter(
            (marker) => !isValidCoordinate(marker.lat) || !isValidCoordinate(marker.lng),
          ).length;
          if (invalidCount > 0) {
            throw new Error(
              `좌표가 없는 축전지 마커 ${invalidCount}건이 있습니다. 주소 지오코딩을 확인하세요.`,
            );
          }

          const bulkMarkers = batteryPending.map((marker) => ({
            id: marker.id,
            name: marker.name,
            lat: marker.lat,
            lng: marker.lng,
            address: marker.address ?? '',
            memo: marker.memo ?? '',
            tags: marker.tags ?? [],
            color: resolveStoredMarkerColor(marker.color),
            facility_team: marker.facilityTeam ?? '',
            created_at: new Date().toISOString(),
          }));

          const { error } = await supabase!
            .from('battery_markers')
            .insert(bulkMarkers);
          if (error) throw error;

          const bulkSpecs = batteryPending.map((marker) => ({
            marker_id: marker.id,
            erp_name: marker.memo ?? marker.name,
            capacity: marker.capacity ?? 600,
            quantity: marker.quantity ?? 12,
            station_name: marker.stationName ?? marker.name,
            created_at: new Date().toISOString(),
          }));

          if (bulkSpecs.length > 0) {
            const { error: specsError } = await supabase!
              .from('battery_specs')
              .insert(bulkSpecs);
            if (specsError) throw specsError;
          }
        } else {
          const equipmentPending = pendingMarkers as EquipmentMarker[];
          const bulkMarkers = equipmentPending.map((marker) => ({
            id: marker.id,
            name: marker.name,
            lat: marker.lat,
            lng: marker.lng,
            memo: marker.memo ?? '',
            tags: marker.tags ?? [],
            color: marker.color ?? DEFAULT_MARKER_COLOR,
            facility_team: marker.facilityTeam ?? '',
            facility_code: marker.facilityCode || null,
            road_address: marker.roadAddress ?? '',
            jibun_address: marker.jibunAddress ?? '',
            created_at: new Date().toISOString(),
          }));

          const { error: markerError } = await supabase!
            .from('markers')
            .insert(bulkMarkers);
          if (markerError) throw markerError;

          const bulkInfo = equipmentPending
            .filter((marker) => marker.facilityCode)
            .map((marker) => ({
              marker_id: marker.id,
              facility_code: marker.facilityCode,
              place_name: marker.name,
              facility_year: marker.facilityYear ?? '',
              project_code: marker.projectCode ?? '',
              business_type: marker.businessType ?? '',
              final_station_name: marker.finalStationName ?? '',
              eq_class: marker.eqClass ?? '',
              eq_type: marker.eqType ?? '',
              install_date: MapMarkerExcelManager.formatDateToYmd(
                marker.installDate ?? '',
              ),
              open_date: MapMarkerExcelManager.formatDateToYmd(marker.openDate ?? ''),
            }));

          if (bulkInfo.length > 0) {
            const { error: infoError } = await supabase!
              .from('information')
              .upsert(bulkInfo);
            if (infoError) throw infoError;
          }
        }

        clearPendingMarkers(mode);
        setFilters({
          selectedYears: new Set(),
          selectedBusinesses: new Set(),
          selectedColors: new Set(),
          selectedTags: new Set(),
          selectedCapacities: new Set(),
          selectedQuantities: new Set(),
          selectedStations: new Set(),
        });
        await invalidateMarkers();
        toast({
          description: `성공적으로 ${pendingMarkers.length}개의 위치를 Supabase에 저장했습니다.`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '알 수 없는 오류';
        toast({ variant: 'destructive', description: `일괄 등록 실패: ${message}` });
      } finally {
        setIsUploading(false);
      }
    },
    [
      addPendingMarkers,
      clearPendingMarkers,
      invalidateMarkers,
      pendingMarkers,
      removePendingMarkers,
      mode,
      setFilters,
      supabase,
      toast,
    ],
  );

  return {
    pendingCount: pendingMarkers.filter((marker) => marker.isPending).length,
    statusText,
    isUploading,
    uploadEquipmentExcel,
    uploadInfoExcel,
    uploadBatteryExcel,
    cancelPendingMarkers,
    submitPendingMarkers,
  };
}
