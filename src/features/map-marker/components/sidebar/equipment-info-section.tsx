'use client';

import { useRef } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExcelUploadActions } from '@/features/map-marker/hooks/use-excel-upload-actions';

export function EquipmentInfoSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { statusText, isUploading, uploadInfoExcel } = useExcelUploadActions();

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-400">
        통합시설코드가 포함된 Excel/CSV 파일 업로드
      </p>
      <Button
        type="button"
        className="h-8 w-full bg-violet-600 text-xs hover:bg-violet-500"
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        상세장비 Excel 업로드
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void uploadInfoExcel(file, event.target);
          }
        }}
      />

      {statusText ? (
        <div className="flex items-center gap-2 rounded-md border border-violet-500/20 bg-violet-500/5 px-2 py-1.5 text-[11px] text-violet-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{statusText}</span>
        </div>
      ) : null}
    </div>
  );
}
