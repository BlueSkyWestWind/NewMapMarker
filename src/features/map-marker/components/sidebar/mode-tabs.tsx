'use client';

import { Battery, Server } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MapMode } from '@/features/map-marker/types/marker';

interface ModeTabsProps {
  mode: MapMode;
  onChange: (mode: MapMode) => void;
}

export function ModeTabs({ mode, onChange }: ModeTabsProps) {
  return (
    <div className="mt-4 flex rounded-lg border border-slate-700/60 bg-black/20 p-1">
      <button
        type="button"
        className={cn(
          'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[11px] font-semibold transition-colors',
          mode === 'equipment'
            ? 'bg-indigo-600 text-white'
            : 'text-slate-400 hover:text-slate-200',
        )}
        onClick={() => onChange('equipment')}
      >
        <Server className="h-3.5 w-3.5" />
        장비
      </button>
      <button
        type="button"
        className={cn(
          'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[11px] font-semibold transition-colors',
          mode === 'battery'
            ? 'bg-indigo-600 text-white'
            : 'text-slate-400 hover:text-slate-200',
        )}
        onClick={() => onChange('battery')}
      >
        <Battery className="h-3.5 w-3.5" />
        축전지
      </button>
    </div>
  );
}
