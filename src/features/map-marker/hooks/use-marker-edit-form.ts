'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import { useActiveMarkers } from '@/features/map-marker/hooks/use-active-markers';
import { useAuthSession } from '@/features/map-marker/hooks/use-auth-session';
import { MAP_MARKER_QUERY_KEY } from '@/features/map-marker/constants/map-config';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_MARKER_COLOR } from '@/features/map-marker/constants/facility-teams';
import type {
  BatteryRowItem,
  EquipmentRowItem,
} from '@/features/map-marker/components/modals/marker-edit-spec-lists';

/**
 * 마커 편집 모달의 상태·저장·삭제 로직.
 * marker-edit-modal.tsx(뷰)에서 분리 — 폼 상태, information/battery upsert·delete를 담당한다.
 */
export function useMarkerEditForm() {
  const isEditOpen = useMapMarkerStore((state) => state.isEditOpen);
  const selectedMarkerId = useMapMarkerStore((state) => state.selectedMarkerId);
  const closeAllModals = useMapMarkerStore((state) => state.closeAllModals);
  const mode = useMapMarkerStore((state) => state.mode);
  
  const { markers } = useActiveMarkers();
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

  // 장비 스펙 상태
  const [facilityYear, setFacilityYear] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [facilityCode, setFacilityCode] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [finalStationName, setFinalStationName] = useState('');
  const [eqClass, setEqClass] = useState('');
  const [eqType, setEqType] = useState('');
  const [installDate, setInstallDate] = useState('');
  const [openDate, setOpenDate] = useState('');

  // 축전지 스펙 목록 (다중 아이템)
  const [batteryItems, setBatteryItems] = useState<BatteryRowItem[]>([]);

  // 장비 스펙 목록 (다중 아이템)
  const [equipmentItems, setEquipmentItems] = useState<EquipmentRowItem[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isEditOpen) return;

    if (marker) {
      // 수정 모드
      setName(marker.name || '');
      setLat(String(marker.lat || ''));
      setLng(String(marker.lng || ''));
      setMemo(marker.memo || '');
      setTags((marker.tags || []).join(', '));
      setColor(marker.color || DEFAULT_MARKER_COLOR);

      if (mode === 'equipment') {
        const eq = marker as any;
        setFacilityYear(eq.facilityYear || '');
        setProjectCode(eq.projectCode || '');
        setFacilityCode(eq.facilityCode || '');
        setBusinessType(eq.businessType || '');
        setFinalStationName(eq.finalStationName || '');
        setEqClass(eq.eqClass || '');
        setEqType(eq.eqType || '');
        setInstallDate(eq.installDate ? eq.installDate.split('T')[0] : '');
        setOpenDate(eq.openDate ? eq.openDate.split('T')[0] : '');

        const fetchInfo = async () => {
          if (!supabase) return;
          try {
            const fc = eq.facilityCode || '';
            const { data, error } = await supabase
              .from('information')
              .select('*')
              .or(`facility_code.eq."${fc}",place_name.eq."${marker.name}",marker_id.eq."${marker.id}"`);
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
        const bat = marker as any;
        setBatteryItems(
          (bat.items || []).map((item: any) => ({
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
        setFacilityYear('');
        setProjectCode('');
        setFacilityCode('');
        setBusinessType('');
        setFinalStationName('');
        setEqClass('');
        setEqType('');
        setInstallDate('');
        setOpenDate('');
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

        // 2. information 테이블 upsert 및 delete 처리
        if (selectedMarkerId) {
          const currentCodes = equipmentItems.map((item) => item.facilityCode).filter(Boolean);
          let deleteQuery = supabase
            .from('information')
            .delete()
            .eq('marker_id', id);
          
          if (currentCodes.length > 0) {
            deleteQuery = deleteQuery.not('facility_code', 'in', `(${currentCodes.join(',')})`);
          }
          const { error: deleteError } = await deleteQuery;
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
            .upsert(infoPayloads, { onConflict: 'facility_code' });

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
    } catch (err: any) {
      console.error('마커 저장 오류 상세:', err.message || err.details || err);
      toast({ 
        variant: 'destructive', 
        description: `저장에 실패했습니다: ${err.message || err.details || '알 수 없는 데이터베이스 오류가 발생했습니다.'}` 
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
    } catch (err: any) {
      console.error('마커 삭제 오류:', err);
      toast({ variant: 'destructive', description: `삭제에 실패했습니다: ${err.message}` });
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
