'use client';

import { useRef } from 'react';
import { FileDown, FileUp, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDataBackupActions } from '@/features/map-marker/hooks/use-data-backup-actions';
import type { MapMode } from '@/features/map-marker/types/marker';

interface BackupRestoreSectionProps {
  mode: MapMode;
}

export function BackupRestoreSection({ mode }: BackupRestoreSectionProps) {
  const fullBackupFileRef = useRef<HTMLInputElement>(null);
  const {
    isBusy,
    exportFullExcel,
    importFullExcel,
    deleteAllBatteryMarkers,
  } = useDataBackupActions();

  return (
    <div className="space-y-4">
      <div className="space-y-2 border-b border-dashed border-slate-700 pb-3">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8 border border-emerald-500/40 bg-emerald-600/20 text-[11px] text-emerald-300 hover:bg-emerald-600/30"
            disabled={isBusy}
            onClick={() => void exportFullExcel()}
          >
            <FileDown className="mr-1 h-3 w-3" />
            전체 백업
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 border border-slate-600 bg-slate-800 text-[11px] text-slate-200 hover:bg-slate-700"
            disabled={isBusy}
            onClick={() => fullBackupFileRef.current?.click()}
          >
            <FileUp className="mr-1 h-3 w-3" />
            전체 복원
          </Button>
        </div>
        <input
          ref={fullBackupFileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void importFullExcel(file, event.target);
            }
          }}
        />
      </div>

      {mode === 'battery' ? (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full border-rose-500/40 text-[11px] text-rose-400 hover:bg-rose-500/10"
            disabled={isBusy}
            onClick={() => void deleteAllBatteryMarkers()}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            등록 데이터 일괄 삭제
          </Button>
        </div>
      ) : null}

      {isBusy ? (
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          처리 중...
        </div>
      ) : null}
    </div>
  );
}
