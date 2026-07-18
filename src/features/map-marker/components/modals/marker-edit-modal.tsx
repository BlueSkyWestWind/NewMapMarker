'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Trash2, Save, X, Info } from 'lucide-react';
import {
  BatterySpecList,
  EquipmentSpecList,
} from '@/features/map-marker/components/modals/marker-edit-spec-lists';
import { useMarkerEditForm } from '@/features/map-marker/hooks/use-marker-edit-form';

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
  const {
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
  } = useMarkerEditForm();

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
              <EquipmentSpecList
                items={equipmentItems}
                isAuthenticated={isAuthenticated}
                onAdd={handleAddEquipmentRow}
                onRemove={handleRemoveEquipmentRow}
                onChange={handleEquipmentRowChange}
              />
            ) : (
              <BatterySpecList
                items={batteryItems}
                isAuthenticated={isAuthenticated}
                onAdd={handleAddBatteryRow}
                onRemove={handleRemoveBatteryRow}
                onChange={handleBatteryRowChange}
              />
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
