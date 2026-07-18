"use client";

import { Battery, MapPin, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapMode } from "@/features/map-marker/types/marker";

interface ModeTabsProps {
  mode: MapMode;
  onChange: (mode: MapMode) => void;
}

const MODE_TABS: Array<{
  mode: MapMode;
  label: string;
  icon: typeof Server;
}> = [
  { mode: "equipment", label: "장비", icon: Server },
  { mode: "battery", label: "축전지", icon: Battery },
  { mode: "location", label: "위치", icon: MapPin },
];

export function ModeTabs({ mode, onChange }: ModeTabsProps) {
  return (
    <div className="mt-4 flex rounded-lg border border-slate-700/60 bg-black/20 p-1">
      {MODE_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = mode === tab.mode;

        return (
          <button
            key={tab.mode}
            type="button"
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-2 text-[11px] font-semibold transition-colors",
              isActive
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-slate-200",
            )}
            onClick={() => onChange(tab.mode)}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
