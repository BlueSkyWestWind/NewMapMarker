'use client';

import { useRef } from 'react';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExcelUploadActions } from '@/features/map-marker/hooks/use-excel-upload-actions';

export function BatteryExcelSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    statusText,
    isUploading,
    pendingCount,
    uploadBatteryExcel,
    cancelPendingMarkers,
    submitPendingMarkers,
  } = useExcelUploadActions();

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-400">
        통합시설명칭(ERP), 주소, 용량(AH), 수량(Cell), 창고/국소/국사명이 포함된
        Excel 파일 업로드
      </p>
      <Button
        type="button"
        className="h-8 w-full bg-emerald-600 text-xs hover:bg-emerald-500"
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        축전지 Excel 파일 업로드
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void uploadBatteryExcel(file, event.target);
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
          <p className="text-[11px] text-slate-400">
            대기 중인 축전지:{' '}
            <strong className="text-amber-400">{pendingCount}</strong>건
          </p>
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
              DB 저장
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
