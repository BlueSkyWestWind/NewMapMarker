'use client';

import { useRef } from 'react';
import { FileSpreadsheet, Loader2, Trash2, Upload, Eye, Edit, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExcelUploadActions } from '@/features/map-marker/hooks/use-excel-upload-actions';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import type { EquipmentMarker } from '@/features/map-marker/types/marker';

export function EquipmentExcelSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    statusText,
    isUploading,
    pendingCount,
    pendingMarkers,
    uploadEquipmentExcel,
    cancelPendingMarkers,
    submitPendingMarkers,
    submitSinglePendingMarker,
  } = useExcelUploadActions();
  const removePendingMarkers = useMapMarkerStore((state) => state.removePendingMarkers);

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-400">
        위도/경도 또는 주소가 포함된 Excel/CSV 파일 업로드
      </p>
      <Button
        type="button"
        className="h-8 w-full bg-emerald-600 text-xs hover:bg-emerald-500"
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        Excel/CSV 파일 업로드
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void uploadEquipmentExcel(file, event.target);
          }
        }}
      />

      {statusText ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5 text-[11px] text-emerald-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{statusText}</span>
        </div>
      ) : null}

      {pendingCount > 0 ? (
        <div className="space-y-2 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-2.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>
              대기 중인 위치:{' '}
              <strong className="text-amber-400">{pendingCount}</strong>개
            </span>
            <span className="text-slate-500">확인 후 전송해 주세요.</span>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 flex-1 border-rose-500/30 text-[11px] text-rose-400"
              disabled={isUploading}
              onClick={cancelPendingMarkers}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              전체 취소
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 flex-1 bg-amber-600 text-[11px] hover:bg-amber-500"
              disabled={isUploading}
              onClick={() => void submitPendingMarkers()}
            >
              <FileSpreadsheet className="mr-1 h-3 w-3" />
              전체 전송
            </Button>
          </div>

          <div className="mt-2.5 max-h-48 overflow-y-auto rounded border border-amber-500/20 bg-amber-950/20 divide-y divide-amber-500/10">
            {pendingMarkers
              .filter((m) => m.isPending)
              .map((marker) => (
                <div key={marker.id} className="p-1.5 flex items-center justify-between gap-1 text-[10px]">
                  <div
                    className="flex-1 min-w-0 cursor-pointer hover:text-amber-300"
                    onClick={() => useMapMarkerStore.getState().setSelectedMarkerId(marker.id)}
                    title="지도로 위치 확인"
                  >
                    <p className="font-semibold truncate text-amber-200">{marker.name || '이름 없음'}</p>
                    <p className="text-slate-400 truncate text-[9px]">
                      {(marker as EquipmentMarker).roadAddress || `${marker.lat.toFixed(5)}, ${marker.lng.toFixed(5)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-slate-400 hover:text-slate-200"
                      onClick={() => useMapMarkerStore.getState().setSelectedMarkerId(marker.id)}
                      title="위치 확인"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-slate-400 hover:text-amber-300"
                      onClick={() => useMapMarkerStore.getState().openEditModal(marker.id)}
                      title="수정"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                      disabled={isUploading}
                      onClick={() => void submitSinglePendingMarker(marker.id)}
                      title="개별 등록"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      disabled={isUploading}
                      onClick={() => removePendingMarkers('equipment', [marker.id])}
                      title="취소"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
