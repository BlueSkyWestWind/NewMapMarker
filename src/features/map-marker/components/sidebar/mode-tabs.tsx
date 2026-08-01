"use client";

import { Battery, Lock, MapPin, Server, Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapSegment } from "@/features/shell/types/segment";

interface ModeTabsProps {
  segment: MapSegment;
  onChange: (segment: MapSegment) => void;
  /** 로그인 등 조건 미충족으로 잠긴 세그먼트(선택 불가). */
  lockedSegments?: MapSegment[];
  /** 노출할 세그먼트. 마커관리는 장비·축전지 2종만 쓴다. */
  segments?: MapSegment[];
}

const SEGMENT_META: Record<
  MapSegment,
  { label: string; icon: typeof Server }
> = {
  equipment: { label: "장비", icon: Server },
  battery: { label: "축전지", icon: Battery },
  location: { label: "위치", icon: MapPin },
  converter: { label: "위치/좌표", icon: Waypoints },
};

const DEFAULT_SEGMENTS: MapSegment[] = [
  "equipment",
  "battery",
  "location",
  "converter",
];

/**
 * 도메인 세그먼트. Ver 2.0에서 최상위 탭이 아니라 패널 안 컨트롤로 내려왔다.
 *
 * 라벨이 모두 짧아 4개까지 한 줄에 들어간다. 폭 배분은 내용 길이에 맞춘다.
 * 안전장치로 `truncate`를 두되, 라벨을 늘릴 때는 폭을 다시 확인해야 한다.
 */
export function ModeTabs({
  segment,
  onChange,
  lockedSegments = [],
  segments = DEFAULT_SEGMENTS,
}: ModeTabsProps) {
  return (
    <div
      className="flex gap-1 rounded-lg border border-slate-700/60 bg-black/20 p-1"
      role="tablist"
      aria-label="데이터 도메인"
    >
      {segments.map((key) => {
        const meta = SEGMENT_META[key];
        const Icon = meta.icon;
        const isActive = segment === key;
        const isLocked = lockedSegments.includes(key);

        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={isLocked}
            title={isLocked ? "로그인 후 이용할 수 있습니다" : undefined}
            className={cn(
              // flex-auto: 남는 폭을 균등이 아니라 **내용 길이에 맞춰** 나눈다.
              // flex-1(균등 4분할)이면 긴 라벨만 자리가 모자라 잘린다.
              "flex min-w-0 flex-auto items-center justify-center gap-1 whitespace-nowrap rounded-md px-1 py-2 text-[11px] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
              isActive
                ? "bg-indigo-600 text-white shadow-glow"
                : "text-slate-400 hover:text-slate-200",
              isLocked && "cursor-not-allowed opacity-50 hover:text-slate-400",
            )}
            onClick={() => {
              if (!isLocked) onChange(key);
            }}
          >
            {isLocked ? (
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            <span className="truncate">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}
