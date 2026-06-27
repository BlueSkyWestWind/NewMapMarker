'use client';

import { useRef } from 'react';
import { Database, FileDown, FileUp, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDataBackupActions } from '@/features/map-marker/hooks/use-data-backup-actions';
import type { MapMode } from '@/features/map-marker/types/marker';

interface BackupRestoreSectionProps {
  mode: MapMode;
}

export function BackupRestoreSection({ mode }: BackupRestoreSectionProps) {
  const markersFileRef = useRef<HTMLInputElement>(null);
  const infoFileRef = useRef<HTMLInputElement>(null);
  const {
    isBusy,
    exportMarkersExcel,
    importMarkersExcel,
    exportInfoExcel,
    importInfoExcel,
    deleteAllBatteryMarkers,
  } = useDataBackupActions();

  const markerSectionTitle =
    mode === 'battery' ? '축전지 마커 (battery_markers)' : '위치 마커 (markers)';

  return (
    <div className="space-y-4">
      <div className="space-y-2 border-b border-dashed border-slate-700 pb-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
          <Database className="h-3.5 w-3.5" />
          {markerSectionTitle}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 text-[11px]"
            disabled={isBusy}
            onClick={() => void exportMarkersExcel()}
          >
            <FileDown className="mr-1 h-3 w-3" />
            백업 (Excel)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-[11px]"
            disabled={isBusy}
            onClick={() => markersFileRef.current?.click()}
          >
            <FileUp className="mr-1 h-3 w-3" />
            복원 (Excel)
          </Button>
        </div>
        <input
          ref={markersFileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void importMarkersExcel(file, event.target);
            }
          }}
        />
        {mode === 'battery' ? (
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
        ) : null}
      </div>

      {mode === 'equipment' ? (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-400">
            <Database className="h-3.5 w-3.5" />
            상세 장비 (information)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 text-[11px]"
              disabled={isBusy}
              onClick={() => void exportInfoExcel()}
            >
              <FileDown className="mr-1 h-3 w-3" />
              백업 (Excel)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-[11px]"
              disabled={isBusy}
              onClick={() => infoFileRef.current?.click()}
            >
              <FileUp className="mr-1 h-3 w-3" />
              복원 (Excel)
            </Button>
          </div>
          <input
            ref={infoFileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void importInfoExcel(file, event.target);
              }
            }}
          />
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
