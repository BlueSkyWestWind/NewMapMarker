'use client';

import { useRef } from 'react';
import { FileSpreadsheet, Loader2, Trash2, Eye, Edit, Check, ListRestart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExcelUploadActions } from '@/features/map-marker/hooks/use-excel-upload-actions';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import type { EquipmentMarker } from '@/features/map-marker/types/marker';

export function EquipmentExcelSection() {
  const erpInputRef = useRef<HTMLInputElement>(null);
  const {
    statusText,
    isUploading,
    pendingMarkers,
    stagedErpCount,
    prepareErpUpload,
    applyStagedErp,
    cancelStagedErp,
    excludeStagedMarker,
    regroupMarkerRoles,
  } = useExcelUploadActions();

  return (
    <div className="space-y-2">
      <Button
        type="button"
        className="h-8 w-full bg-indigo-600 text-xs hover:bg-indigo-500"
        disabled={isUploading}
        onClick={() => erpInputRef.current?.click()}
      >
        <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
        위치등록 업로드
      </Button>
      <input
        ref={erpInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void prepareErpUpload(file, event.target);
          }
        }}
      />

      {statusText ? (
        <div className="flex items-center gap-2 rounded-md border border-indigo-500/20 bg-indigo-500/5 px-2 py-1.5 text-[11px] text-indigo-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{statusText}</span>
        </div>
      ) : null}

      <Button
        type="button"
        variant="outline"
        className="h-8 w-full border-slate-700 bg-slate-800 text-[11px] text-slate-200 hover:bg-slate-700"
        disabled={isUploading}
        onClick={() => void regroupMarkerRoles()}
        title="1개짜리 지번은 단독으로, 여러 개는 대표/SUB로 구분을 다시 정리합니다"
      >
        <ListRestart className="mr-1.5 h-3.5 w-3.5" />
        구분 재정리 (1개 지번 → 단독)
      </Button>

      {stagedErpCount > 0 ? (
        <div className="space-y-2 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-2.5">
          <p className="text-[11px] leading-relaxed text-slate-400">
            미리보기 <strong className="text-amber-400">{stagedErpCount}</strong>건 —
            지도에서 위치를 확인하고 필요하면 마커를 드래그해 조정한 뒤 [적용]을 누르세요.
            (아직 저장되지 않음)
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 flex-1 border-rose-500/30 text-[11px] text-rose-400"
              disabled={isUploading}
              onClick={cancelStagedErp}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 flex-1 bg-amber-600 text-[11px] hover:bg-amber-500"
              disabled={isUploading}
              onClick={() => void applyStagedErp()}
            >
              <Check className="mr-1 h-3 w-3" />
              적용 (DB 저장)
            </Button>
          </div>

          <div className="mt-1 max-h-48 divide-y divide-amber-500/10 overflow-y-auto rounded border border-amber-500/20 bg-amber-950/20">
            {pendingMarkers
              .filter((m) => m.isPending)
              .map((marker) => (
                <div
                  key={marker.id}
                  className="flex items-center justify-between gap-1 p-1.5 text-[10px]"
                >
                  <div
                    className="min-w-0 flex-1 cursor-pointer hover:text-amber-300"
                    onClick={() =>
                      useMapMarkerStore.getState().setSelectedMarkerId(marker.id)
                    }
                    title="지도로 위치 확인"
                  >
                    <p className="truncate font-semibold text-amber-200">
                      {marker.name || '이름 없음'}
                    </p>
                    <p className="truncate text-[9px] text-slate-400">
                      {(marker as EquipmentMarker).jibunAddress ||
                        (marker as EquipmentMarker).roadAddress ||
                        `${marker.lat.toFixed(5)}, ${marker.lng.toFixed(5)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-slate-400 hover:text-slate-200"
                      onClick={() =>
                        useMapMarkerStore
                          .getState()
                          .setSelectedMarkerId(marker.id)
                      }
                      title="위치 확인"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-slate-400 hover:text-amber-300"
                      onClick={() =>
                        useMapMarkerStore.getState().openEditModal(marker.id)
                      }
                      title="수정"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                      disabled={isUploading}
                      onClick={() => excludeStagedMarker(marker.id)}
                      title="이 항목 제외"
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
