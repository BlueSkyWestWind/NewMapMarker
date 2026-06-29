'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import { useActiveMarkers } from '@/features/map-marker/hooks/use-active-markers';
import { useAuthSession } from '@/features/map-marker/hooks/use-auth-session';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { MAP_MARKER_QUERY_KEY } from '@/features/map-marker/constants/map-config';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Trash2, Save, X, Plus, Info } from 'lucide-react';
import { DEFAULT_MARKER_COLOR } from '@/features/map-marker/constants/facility-teams';

const COLOR_OPTIONS = [
  { value: '#10b981', label: '에메랄드' },
  { value: '#6366f1', label: '인디고' },
  { value: '#f43f5e', label: '로즈' },
  { value: '#f59e0b', label: '골드' },
  { value: '#8b5cf6', label: '퍼플' },
  { value: '#06b6d4', label: '시안' },
  { value: '#ec4899', label: '핑크' },
  { value: '#84cc16', label: '라임' },
  { value: '#14b8a6', label: '틸' },
  { value: '#f97316', label: '오렌지' },
];

export function MarkerEditModal() {
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
  const [batteryItems, setBatteryItems] = useState<any[]>([]);

  // 장비 스펙 목록 (다중 아이템)
  const [equipmentItems, setEquipmentItems] = useState<any[]>([]);

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

  return (
    <Dialog open={isEditOpen && isAuthenticated} onOpenChange={(open) => !open && closeAllModals()}>
      <DialogContent className="max-w-[95vw] md:max-w-[1000px] w-full bg-slate-900 border-slate-800 text-slate-100 p-6 overflow-hidden shadow-2xl rounded-2xl">
        <DialogHeader className="border-b border-slate-800 pb-4">
          <DialogTitle className="text-lg font-bold text-slate-100 flex items-center justify-between">
            <span>{selectedMarkerId ? '마커 정보 수정' : '위치 마커 등록'}</span>
            {!isAuthenticated && (
              <span className="text-xs text-rose-400 font-normal flex items-center gap-1">
                <Info className="h-3 w-3" />
                읽기전용 모드 (로그인 필요)
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-4 max-h-[50vh] overflow-y-auto px-2">
          {/* 기본 입력 폼 */}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">기본 마커 설정</h4>
            
            <div className="space-y-2">
              <Label htmlFor="marker-name" className="text-xs text-slate-300">장소 이름 *</Label>
              <Input
                id="marker-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 맛있는 카페, 거래처 A"
                className="bg-slate-950 border-slate-800 focus-visible:ring-emerald-500"
                disabled={!isAuthenticated}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="marker-lat" className="text-xs text-slate-300">위도 (Latitude)</Label>
                <Input
                  id="marker-lat"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className="bg-slate-950 border-slate-800 font-mono"
                  disabled={!isAuthenticated}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="marker-lng" className="text-xs text-slate-300">경도 (Longitude)</Label>
                <Input
                  id="marker-lng"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className="bg-slate-950 border-slate-800 font-mono"
                  disabled={!isAuthenticated}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="marker-memo" className="text-xs text-slate-300">메모 / 설명</Label>
              <Textarea
                id="marker-memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="위치에 대한 설명을 적어주세요..."
                rows={3}
                className="bg-slate-950 border-slate-800 focus-visible:ring-emerald-500 resize-none"
                disabled={!isAuthenticated}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="marker-tags" className="text-xs text-slate-300">태그 (쉼표로 구분)</Label>
              <Input
                id="marker-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="예: 카페, 거래처, 즐겨찾기"
                className="bg-slate-950 border-slate-800"
                disabled={!isAuthenticated}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-300">마커 색상</Label>
              <div className="flex flex-wrap gap-3 pt-1.5 pb-2 px-1.5">
                {COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => isAuthenticated && setColor(opt.value)}
                    style={{ backgroundColor: opt.value }}
                    className={`w-6 h-6 rounded-full transition-transform cursor-pointer flex items-center justify-center ${color === opt.value ? 'scale-125 border border-white shadow-md' : 'opacity-80 hover:opacity-100'}`}
                    title={opt.label}
                    disabled={!isAuthenticated}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* 상세 스펙 폼 (모드 분기) */}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {mode === 'equipment' ? '상세 장비 정보 (Supabase 연동)' : '축전지 다중 사양 편집'}
            </h4>

            {mode === 'equipment' ? (
              // 장비 스펙 목록 편집
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">장비 사양 리스트</span>
                  <Button
                    type="button"
                    onClick={handleAddEquipmentRow}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white h-7 text-xs px-2"
                    disabled={!isAuthenticated}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    장비 추가
                  </Button>
                </div>

                <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                  {equipmentItems.map((item, idx) => (
                    <div key={item.id} className="relative bg-slate-950/40 p-3 rounded-lg border border-slate-800 flex flex-col gap-2.5">
                      {equipmentItems.length > 1 && isAuthenticated && (
                        <button
                          type="button"
                          onClick={() => handleRemoveEquipmentRow(item.id)}
                          className="absolute top-2 right-2 text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}

                      <div className="text-[10px] font-bold text-slate-500">장비 #{idx + 1}</div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-400">통합시설코드</Label>
                          <Input
                            value={item.facilityCode}
                            onChange={(e) => handleEquipmentRowChange(item.id, 'facilityCode', e.target.value)}
                            placeholder="FAC12345"
                            className="bg-slate-950 border-slate-800 h-8 text-xs"
                            disabled={!isAuthenticated}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-400">프로젝트코드</Label>
                          <Input
                            value={item.projectCode}
                            onChange={(e) => handleEquipmentRowChange(item.id, 'projectCode', e.target.value)}
                            placeholder="PRJ-2026"
                            className="bg-slate-950 border-slate-800 h-8 text-xs"
                            disabled={!isAuthenticated}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-400">시설연도</Label>
                          <Input
                            value={item.facilityYear}
                            onChange={(e) => handleEquipmentRowChange(item.id, 'facilityYear', e.target.value)}
                            placeholder="2026"
                            className="bg-slate-950 border-slate-800 h-8 text-xs"
                            disabled={!isAuthenticated}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-400">사업구분</Label>
                          <Input
                            value={item.businessType}
                            onChange={(e) => handleEquipmentRowChange(item.id, 'businessType', e.target.value)}
                            placeholder="상용망"
                            className="bg-slate-950 border-slate-800 h-8 text-xs"
                            disabled={!isAuthenticated}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-400">국소명-최종</Label>
                        <Input
                          value={item.finalStationName}
                          onChange={(e) => handleEquipmentRowChange(item.id, 'finalStationName', e.target.value)}
                          placeholder="국소명_1-AAU"
                          className="bg-slate-950 border-slate-800 h-8 text-xs"
                          disabled={!isAuthenticated}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-400">장비분류</Label>
                          <Input
                            value={item.eqClass}
                            onChange={(e) => handleEquipmentRowChange(item.id, 'eqClass', e.target.value)}
                            placeholder="전송장비"
                            className="bg-slate-950 border-slate-800 h-8 text-xs"
                            disabled={!isAuthenticated}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-400">장비타입</Label>
                          <Input
                            value={item.eqType}
                            onChange={(e) => handleEquipmentRowChange(item.id, 'eqType', e.target.value)}
                            placeholder="MUX"
                            className="bg-slate-950 border-slate-800 h-8 text-xs"
                            disabled={!isAuthenticated}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-400">시설일</Label>
                          <Input
                            type="date"
                            value={item.installDate}
                            onChange={(e) => handleEquipmentRowChange(item.id, 'installDate', e.target.value)}
                            className="bg-slate-950 border-slate-800 h-8 text-xs"
                            disabled={!isAuthenticated}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-400">개통일</Label>
                          <Input
                            type="date"
                            value={item.openDate}
                            onChange={(e) => handleEquipmentRowChange(item.id, 'openDate', e.target.value)}
                            className="bg-slate-950 border-slate-800 h-8 text-xs"
                            disabled={!isAuthenticated}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // 축전지 스펙 목록 편집
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">배터리 사양 리스트</span>
                  <Button
                    type="button"
                    onClick={handleAddBatteryRow}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white h-7 text-xs px-2"
                    disabled={!isAuthenticated}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    사양 추가
                  </Button>
                </div>

                <div className="space-y-2.5 max-h-[40vh] overflow-y-auto pr-1">
                  {batteryItems.map((item, idx) => (
                    <div key={item.id} className="relative bg-slate-950/40 p-3 rounded-lg border border-slate-800 flex flex-col gap-2">
                      {batteryItems.length > 1 && isAuthenticated && (
                        <button
                          type="button"
                          onClick={() => handleRemoveBatteryRow(item.id)}
                          className="absolute top-2 right-2 text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}

                      <div className="text-[10px] font-bold text-slate-500">사양 #{idx + 1}</div>

                      <div className="space-y-1">
                        <Label className="text-[9px] text-slate-400">ERP 통합시설코드/명칭</Label>
                        <Input
                          value={item.erpName}
                          onChange={(e) => handleBatteryRowChange(item.id, 'erpName', e.target.value)}
                          placeholder="ERP 명칭"
                          className="bg-slate-950 border-slate-800 h-7 text-xs"
                          disabled={!isAuthenticated}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[9px] text-slate-400">용량 (AH)</Label>
                          <Input
                            type="number"
                            value={item.capacity}
                            onChange={(e) => handleBatteryRowChange(item.id, 'capacity', Number(e.target.value))}
                            className="bg-slate-950 border-slate-800 h-7 text-xs font-mono"
                            disabled={!isAuthenticated}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[9px] text-slate-400">수량 (Cell)</Label>
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => handleBatteryRowChange(item.id, 'quantity', Number(e.target.value))}
                            className="bg-slate-950 border-slate-800 h-7 text-xs font-mono"
                            disabled={!isAuthenticated}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[9px] text-slate-400">창고/국소/국사명</Label>
                        <Input
                          value={item.stationName}
                          onChange={(e) => handleBatteryRowChange(item.id, 'stationName', e.target.value)}
                          placeholder="국소명 입력"
                          className="bg-slate-950 border-slate-800 h-7 text-xs"
                          disabled={!isAuthenticated}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4 flex items-center justify-between mt-2">
          <div>
            {selectedMarkerId && isAuthenticated && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="h-9 px-4 text-xs font-medium"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                삭제
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={closeAllModals}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 h-9 px-4 text-xs border-slate-700 font-medium"
            >
              <X className="h-4 w-4 mr-1.5" />
              취소
            </Button>
            {isAuthenticated && (
              <Button
                onClick={handleSave}
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-500 text-white h-9 px-4 text-xs font-medium"
              >
                <Save className="h-4 w-4 mr-1.5" />
                {isSubmitting ? '저장 중...' : '저장'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
