'use client';

import { useRef } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExcelUploadActions } from '@/features/map-marker/hooks/use-excel-upload-actions';

export function EquipmentExcelSection() {
  const erpInputRef = useRef<HTMLInputElement>(null);
  const { statusText, isUploading, uploadErpExcel } = useExcelUploadActions();

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
            void uploadErpExcel(file, event.target);
          }
        }}
      />

      {statusText ? (
        <div className="flex items-center gap-2 rounded-md border border-indigo-500/20 bg-indigo-500/5 px-2 py-1.5 text-[11px] text-indigo-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{statusText}</span>
        </div>
      ) : null}
    </div>
  );
}
