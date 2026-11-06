'use client';

import dynamic from 'next/dynamic';
import { useRef } from 'react';
import { FileSpreadsheet, Loader2, ListRestart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExcelUploadActions } from '@/features/map-marker/hooks/use-excel-upload-actions';

// 업로드 중에만 필요하므로 홈 첫 로딩 번들에서 분리한다.
const ErpReviewPanel = dynamic(
  () =>
    import('@/features/map-marker/components/sidebar/erp-review-panel').then(
      (m) => m.ErpReviewPanel,
    ),
  { ssr: false },
);

export function EquipmentExcelSection() {
  const erpInputRef = useRef<HTMLInputElement>(null);
  const {
    statusText,
    isUploading,
    stagedErpUpload,
    prepareErpUpload,
    regroupMarkerRoles,
    ...reviewActions
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
        accept=".xlsx,.xls,.xlsb"
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

      {stagedErpUpload ? (
        <ErpReviewPanel
          upload={stagedErpUpload}
          isUploading={isUploading}
          actions={reviewActions}
        />
      ) : null}
    </div>
  );
}
