'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import { useMarkerList } from '@/features/map-marker/hooks/use-marker-list';
import { useAuthSession } from '@/features/map-marker/hooks/use-auth-session';
import { MAP_MARKER_QUERY_KEY } from '@/features/map-marker/constants/map-config';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_MARKER_COLOR } from '@/features/map-marker/constants/facility-teams';
import type {
  BatteryRowItem,
  EquipmentRowItem,
} from '@/features/map-marker/components/modals/marker-edit-spec-lists';
import type {
  BatteryMarker,
  EquipmentMarker,
} from '@/features/map-marker/types/marker';

/**
 * PostgREST 필터 문자열(or / in 등)에 삽입할 값을 안전하게 감싼다.
 * 콤마·괄호·점 같은 예약문자를 리터럴로 처리하도록 큰따옴표로 감싸고,
 * 값 내부의 역슬래시·큰따옴표는 백슬래시로 이스케이프한다.
 * (문자열을 직접 보간하면 필터 문법이 깨지거나 인젝션이 된다)
 */
function quotePostgrestValue(value: string): string {
  const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/** Supabase/PostgREST 오류 객체에서 사람이 읽을 메시지를 안전하게 추출한다. */
function getSupabaseErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; details?: unknown };
    if (typeof e.message === 'string' && e.message) return e.message;
    if (typeof e.details === 'string' && e.details) return e.details;
  }
  return '';
}

/**
 * 마커 편집 모달의 상태·저장·삭제 로직.
 * marker-edit-modal.tsx(뷰)에서 분리 — 폼 상태, information/battery upsert·delete를 담당한다.
 */
export function useMarkerEditForm() {
  const isEditOpen = useMapMarkerStore((state) => state.isEditOpen);
  const selectedMarkerId = useMapMarkerStore((state) => state.selectedMarkerId);
  const closeAllModals = useMapMarkerStore((state) => state.closeAllModals);
  const mode = useMapMarkerStore((state) => state.mode);
  
  // 목록만 필요하다. `useActiveMarkers`를 부르면 필터 부수효과가 중복 실행된다.
  const markers = useMarkerList();
  const marker = markers.find((m) => m.id === selectedMarkerId);
  
  const { supabase, isAuthenticated } = useAuthSession();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [memo, setMemo] = useState('');
  const [tags, setTags] = useState('');
  const [color, setColor] = useState(DEFAULT_MARKER_COLOR);

  // 장비 스펙은 equipmentItems(다중 아이템)로 관리한다. (개별 스칼라 state는 사용하지 않음)

  // 축전지 스펙 목록 (다중 아이템)
  const [batteryItems, setBatteryItems] = useState<BatteryRowItem[]>([]);

  // 장비 스펙 목록 (다중 아이템)
  const [equipmentItems, setEquipmentItems] = useState<EquipmentRowItem[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // 최초 열림/대상 변경 시 1회만 폼을 초기화하기 위한 가드.
  // 백그라운드 refetch로 marker 참조만 바뀐 경우 편집 중 값이 덮어써지지 않게 한다.
  const initializedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isEditOpen) {
      initializedKeyRef.current = null;
      return;
    }

    const initKey = `${selectedMarkerId ?? '__new__'}:${mode}`;
    // 이미 이 대상으로 초기화했다면(리페치로 marker 참조만 변경) 다시 덮어쓰지 않는다.
    if (initializedKeyRef.current === initKey) return;
    // 기존 마커인데 아직 목록 로딩 전이면 초기화를 미룬다(빈 폼으로 덮어쓰기 방지).
    if (selectedMarkerId && !marker) return;
    initializedKeyRef.current = initKey;

    if (marker) {
      // 수정 모드
      setName(marker.name || '');
      setLat(String(marker.lat || ''));
      setLng(String(marker.lng || ''));
      setMemo(marker.memo || '');
      setTags((marker.tags || []).join(', '));
      setColor(marker.color || DEFAULT_MARKER_COLOR);

      if (mode === 'equipment') {
        const eq = marker as EquipmentMarker;

        const fetchInfo = async () => {
          if (!supabase) return;
          try {
            const fc = eq.facilityCode || '';
            // 값을 직접 보간하면 콤마·따옴표가 or() 필터 문법을 깨뜨리므로
            // 각 값을 이스케이프하고, 빈 값 조건은 제외해 과매칭(eq."")도 방지한다.
            const orConditions = [
              fc ? `facility_code.eq.${quotePostgrestValue(fc)}` : null,
              marker.name
                ? `place_name.eq.${quotePostgrestValue(marker.name)}`
                : null,
              marker.id ? `marker_id.eq.${quotePostgrestValue(marker.id)}` : null,
            ].filter((cond): cond is string => cond !== null);
            const { data, error } = await supabase
              .from('information')
              .select('*')
              .or(orConditions.join(','));
            if (error) throw error;

            if (data && data.length > 0) {
              setEquipmentItems(data.map((row) => ({
                id: row.facility_code || `temp_${Date.now()}_${Math.random()}`,
                facilityCode: row.facility_code || '',
                projectCode: row.project_code || '',
                facilityYear: row.facility_year || '',
                businessType: row.business_type || '',
                finalStationName: row.final_station_name || '',
                eqClass: row.eq_class || '',
                eqType: row.eq_type || '',
                installDate: row.install_date ? row.install_date.split('T')[0] : '',
                openDate: row.open_date ? row.open_date.split('T')[0] : '',
              })));
            } else {
              setEquipmentItems([{
                id: `temp_${Date.now()}`,
                facilityCode: '',
                projectCode: '',
                facilityYear: '',
                businessType: '',
                finalStationName: '',
                eqClass: '',
                eqType: '',
                installDate: '',
                openDate: '',
              }]);
            }
          } catch (err) {
            console.error('장비 정보 조회 실패:', err);
          }
        };
        fetchInfo();
      } else {
        const bat = marker as BatteryMarker;
        setBatteryItems(
          (bat.items || []).map((item) => ({
            id: item.id || `temp_${Date.now()}_${Math.random()}`,
            erpName: item.erpName || '',
            capacity: item.capacity || 600,
            quantity: item.quantity || 12,
            stationName: item.stationName || '',
          }))
        );
      }
    } else {
      // 신규 등록 모드 (일단 빈 값으로 초기화)
      setName('');
      setLat('');
      setLng('');
      setMemo('');
      setTags('');
      setColor(DEFAULT_MARKER_COLOR);

      if (mode === 'equipment') {
        setEquipmentItems([{
          id: `temp_${Date.now()}`,
          facilityCode: '',
          projectCode: '',
          facilityYear: '',
          businessType: '',
          finalStationName: '',
          eqClass: '',
          eqType: '',
          installDate: '',
          openDate: '',
        }]);
      } else {
        setBatteryItems([
          {
            id: `temp_${Date.now()}`,
            erpName: '',
            capacity: 600,
            quantity: 12,
            stationName: '',
          },
        ]);
      }
    }
  }, [isEditOpen, selectedMarkerId, marker, mode, supabase]);

  const handleAddEquipmentRow = () => {
    setEquipmentItems([
      ...equipmentItems,
      {
        id: `temp_${Date.now()}_${Math.random()}`,
        facilityCode: '',
        projectCode: '',
        facilityYear: '',
        businessType: '',
        finalStationName: '',
        eqClass: '',
        eqType: '',
        installDate: '',
        openDate: '',
      },
    ]);
  };

  const handleRemoveEquipmentRow = (id: string) => {
    setEquipmentItems(equipmentItems.filter((item) => item.id !== id));
  };

  const handleEquipmentRowChange = (id: string, key: string, value: any) => {
    setEquipmentItems(
      equipmentItems.map((item) => (item.id === id ? { ...item, [key]: value } : item))
    );
  };

  const handleAddBatteryRow = () => {
    setBatteryItems([
      ...batteryItems,
      {
        id: `temp_${Date.now()}_${Math.random()}`,
        erpName: '',
        capacity: 600,
        quantity: 12,
        stationName: '',
      },
    ]);
  };

  const handleRemoveBatteryRow = (id: string) => {
    setBatteryItems(batteryItems.filter((item) => item.id !== id));
  };

  const handleBatteryRowChange = (id: string, key: string, value: any) => {
    setBatteryItems(
      batteryItems.map((item) => (item.id === id ? { ...item, [key]: value } : item))
    );
  };

  const handleSave = async () => {
    if (!isAuthenticated || !supabase) {
      toast({
        variant: 'destructive',
        description: '저장 권한이 없습니다. 로그인이 필요합니다.',
      });
      return;
    }

    if (!name.trim()) {
      toast({ variant: 'destructive', description: '장소 이름을 입력해주세요.' });
      return;
    }

    const latitude = Number(lat);
    const longitude = Number(lng);
    if (isNaN(latitude) || isNaN(longitude)) {
      toast({ variant: 'destructive', description: '올바른 위도와 경도를 입력해주세요.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const parsedTags = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const id = selectedMarkerId || `marker_${Date.now()}`;

      if (mode === 'equipment') {
        // 1. markers 테이블 upsert
        const markerPayload = {
          id,
          name,
          lat: latitude,
          lng: longitude,
          memo,
          tags: parsedTags,
          color,
          facility_code: equipmentItems[0]?.facilityCode || '', // 대표 코드로 첫 번째 코드 기재
        };

        const { error: markerError } = await supabase
          .from('markers')
          .upsert(markerPayload);

        if (markerError) throw markerError;

        // 2. information 테이블 재작성 (기존 행 삭제 후 재삽입)
        //    facility_code 에 UNIQUE 제약이 없어 ON CONFLICT upsert 는 불가하므로,
        //    battery_specs 와 동일하게 marker_id 기준으로 전부 삭제 후 insert 한다.
        if (selectedMarkerId) {
          const { error: deleteError } = await supabase
            .from('information')
            .delete()
            .eq('marker_id', id);
          if (deleteError) throw deleteError;
        }

        const infoPayloads = equipmentItems
          .filter((item) => item.facilityCode.trim())
          .map((item) => ({
            marker_id: id,
            place_name: name,
            facility_code: item.facilityCode.trim(),
            project_code: item.projectCode,
            facility_year: item.facilityYear,
            business_type: item.businessType,
            final_station_name: item.finalStationName,
            eq_class: item.eqClass,
            eq_type: item.eqType,
            install_date: item.installDate || null,
            open_date: item.openDate || null,
          }));

        if (infoPayloads.length > 0) {
          const { error: infoError } = await supabase
            .from('information')
            .insert(infoPayloads);

          if (infoError) throw infoError;
        }
      } else {
        // 축전지 모드
        // 1. battery_markers 테이블 upsert
        const markerPayload = {
          id,
          name,
          lat: latitude,
          lng: longitude,
          memo,
          tags: parsedTags,
          color,
        };

        const { error: markerError } = await supabase
          .from('battery_markers')
          .upsert(markerPayload);

        if (markerError) throw markerError;

        // 2. battery_specs 테이블 처리 (기존 스펙 삭제 후 재삽입)
        if (selectedMarkerId) {
          const { error: deleteError } = await supabase
            .from('battery_specs')
            .delete()
            .eq('marker_id', id);
          if (deleteError) throw deleteError;
        }

        const specsPayloads = batteryItems.map((item) => ({
          marker_id: id,
          erp_name: item.erpName || '',
          capacity: Number(item.capacity || 0),
          quantity: Number(item.quantity || 0),
          station_name: item.stationName || name,
        }));

        if (specsPayloads.length > 0) {
          const { error: specsError } = await supabase
            .from('battery_specs')
            .insert(specsPayloads);

          if (specsError) throw specsError;
        }
      }

      if (marker?.isPending) {
        useMapMarkerStore.getState().removePendingMarkers(mode, [id]);
      }

      toast({ description: '마커 정보가 성공적으로 저장되었습니다.' });
      queryClient.invalidateQueries({ queryKey: MAP_MARKER_QUERY_KEY });
      closeAllModals();
    } catch (err) {
      const detail = getSupabaseErrorMessage(err);
      console.error('마커 저장 오류 상세:', detail || err);
      toast({
        variant: 'destructive',
        description: `저장에 실패했습니다: ${detail || '알 수 없는 데이터베이스 오류가 발생했습니다.'}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedMarkerId) return;

    if (marker?.isPending) {
      if (confirm('대기 마커 등록을 취소하고 목록에서 삭제하시겠습니까?')) {
        useMapMarkerStore.getState().removePendingMarkers(mode, [selectedMarkerId]);
        toast({ description: '대기 마커가 취소되었습니다.' });
        closeAllModals();
      }
      return;
    }

    if (!isAuthenticated || !supabase) {
      toast({
        variant: 'destructive',
        description: '삭제 권한이 없습니다. 로그인이 필요합니다.',
      });
      return;
    }

    if (!confirm('정말로 이 마커를 삭제하시겠습니까? 관련 상세 정보도 함께 삭제됩니다.')) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'equipment') {
        // information 데이터 삭제 (마커 ID에 연동된 상세 장비들 전부 삭제)
        await supabase.from('information').delete().eq('marker_id', selectedMarkerId);
        // markers 데이터 삭제
        const { error } = await supabase.from('markers').delete().eq('id', selectedMarkerId);
        if (error) throw error;
      } else {
        // battery_specs 삭제
        await supabase.from('battery_specs').delete().eq('marker_id', selectedMarkerId);
        // battery_markers 삭제
        const { error } = await supabase.from('battery_markers').delete().eq('id', selectedMarkerId);
        if (error) throw error;
      }

      toast({ description: '마커가 삭제되었습니다.' });
      queryClient.invalidateQueries({ queryKey: MAP_MARKER_QUERY_KEY });
      closeAllModals();
    } catch (err) {
      console.error('마커 삭제 오류:', err);
      toast({
        variant: 'destructive',
        description: `삭제에 실패했습니다: ${getSupabaseErrorMessage(err) || '알 수 없는 오류'}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    isEditOpen,
    selectedMarkerId,
    closeAllModals,
    mode,
    isAuthenticated,
    isSubmitting,
    name,
    setName,
    lat,
    setLat,
    lng,
    setLng,
    memo,
    setMemo,
    tags,
    setTags,
    color,
    setColor,
    equipmentItems,
    batteryItems,
    handleAddEquipmentRow,
    handleRemoveEquipmentRow,
    handleEquipmentRowChange,
    handleAddBatteryRow,
    handleRemoveBatteryRow,
    handleBatteryRowChange,
    handleSave,
    handleDelete,
  };
}
