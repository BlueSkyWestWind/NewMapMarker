"use client";

import { Battery, Lock, MapPin, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapMode } from "@/features/map-marker/types/marker";

interface ModeTabsProps {
  mode: MapMode;
  onChange: (mode: MapMode) => void;
  /** 로그인 등 조건 미충족으로 잠긴 모드(선택 불가). */
  lockedModes?: MapMode[];
  /** 노출할 세그먼트. 마커관리는 위치가 없어 장비·축전지 2종만 쓴다. */
  modes?: MapMode[];
}

const MODE_META: Record<
  Exclude<MapMode, "weather">,
  { label: string; icon: typeof Server }
> = {
  equipment: { label: "장비", icon: Server },
  battery: { label: "축전지", icon: Battery },
  location: { label: "위치", icon: MapPin },
};

const DEFAULT_MODES: MapMode[] = ["equipment", "battery", "location"];

/**
 * 도메인 세그먼트. Ver 2.0에서 최상위 탭이 아니라 패널 안 컨트롤로 내려왔다.
 *
 * 「날씨&CCTV」 탭은 없어졌다 — 날씨는 대시보드로, CCTV는 독립 메뉴로 올라갔다.
 * 라벨이 전부 짧아져 폭을 균등 분할해도 줄바꿈이 생기지 않는다.
 */
export function ModeTabs({
  mode,
  onChange,
  lockedModes = [],
  modes = DEFAULT_MODES,
}: ModeTabsProps) {
  return (
    <div
      className="flex rounded-lg border border-slate-700/60 bg-black/20 p-1"
      role="tablist"
      aria-label="데이터 도메인"
    >
      {modes.map((tabMode) => {
        const meta = MODE_META[tabMode as Exclude<MapMode, "weather">];
        if (!meta) return null;

        const Icon = meta.icon;
        const isActive = mode === tabMode;
        const isLocked = lockedModes.includes(tabMode);

        return (
          <button
            key={tabMode}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={isLocked}
            title={isLocked ? "로그인 후 이용할 수 있습니다" : undefined}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md px-1 py-2 text-[11px] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
              isActive
                ? "bg-indigo-600 text-white shadow-glow"
                : "text-slate-400 hover:text-slate-200",
              isLocked && "cursor-not-allowed opacity-50 hover:text-slate-400",
            )}
            onClick={() => {
              if (!isLocked) onChange(tabMode);
            }}
          >
            {isLocked ? (
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
