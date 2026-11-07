"use client";

import { ChevronRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { AccountMenu } from "@/features/shell/components/account-menu";
import { useShellNav } from "@/features/shell/hooks/use-shell-nav";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import { visibleNavItems } from "@/features/shell/types/nav";
import type { NavKey } from "@/features/shell/types/nav";

interface NavRailProps {
  /** 하이드레이션 안전값. 셸이 마운트 전후를 판정해 내려 준다. */
  activeNav: NavKey;
}

/** 아이콘 레일. 메뉴 이름은 툴팁과 패널 제목으로 보여 준다. */
export function NavRail({ activeNav }: NavRailProps) {
  const { authed, isAdmin, pickNav } = useShellNav();
  const isSidebarOpen = useMapMarkerStore((state) => state.isSidebarOpen);
  const setTreeOpen = useShellStore((state) => state.setTreeOpen);

  return (
    <nav
      className="relative z-40 flex h-full w-[var(--rail-w)] shrink-0 flex-col border-r border-slate-800 bg-slate-950/95 text-slate-100"
      aria-label="주요 메뉴"
    >
      <div className="flex h-14 shrink-0 items-center justify-center">
        <MapPin className="h-[22px] w-[22px] text-emerald-400" aria-hidden />
      </div>
      <button
        type="button"
        className="absolute left-[38px] top-2.5 flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        aria-label="메뉴 전체 펼치기"
        title="메뉴 전체 펼치기"
        onClick={() => setTreeOpen(true)}
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {visibleNavItems(authed, isAdmin).map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.key && isSidebarOpen;
          return (
            <li key={item.key}>
              <button
                type="button"
                disabled={!item.enabled}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                title={item.enabled ? item.label : `${item.label} · 준비 중입니다`}
                className={cn(
                  "flex h-14 w-full items-center justify-center transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500",
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-200",
                  !item.enabled && "cursor-not-allowed opacity-50 hover:text-slate-400",
                )}
                onClick={() => pickNav(item.key)}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      <AccountMenu />
    </nav>
  );
}
