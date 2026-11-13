"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Lock, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthHeader } from "@/features/map-marker/components/sidebar/auth-header";
import { useShellNav } from "@/features/shell/hooks/use-shell-nav";
import {
  filterNavTree,
  isSubActive,
  SEGMENT_META,
} from "@/features/shell/lib/nav-model";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import { visibleNavItems, type NavKey } from "@/features/shell/types/nav";
import type { MapSegment, NavSubKey } from "@/features/shell/types/segment";

interface NavTreeProps {
  /** 하이드레이션 안전값. 셸이 마운트 전후를 판정해 내려 준다. */
  activeNav: NavKey;
  segment: MapSegment;
  segmentCounts: Partial<Record<NavSubKey, number>>;
}

/** 펼친 메뉴 트리. 하위 메뉴를 누르면 옆에 상세 패널이 열린다. */
export function NavTree({ activeNav, segment, segmentCounts }: NavTreeProps) {
  const { authed, isAdmin, pickNav, pickSegment, isSegmentLocked } = useShellNav();
  const setTreeOpen = useShellStore((state) => state.setTreeOpen);
  const panelStep = useShellStore((state) => state.panelStep);
  const scheduleSegment = useShellStore((state) => state.scheduleSegment);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Partial<Record<NavKey, boolean>>>({});

  const nodes = filterNavTree(visibleNavItems(authed, isAdmin), query, isAdmin);
  const isSearching = query.trim().length > 0;

  return (
    <nav
      className="relative z-40 flex h-full w-[var(--tree-w)] shrink-0 flex-col border-r border-slate-800 bg-slate-950/95 text-slate-100"
      aria-label="주요 메뉴"
    >
      <div className="flex items-center gap-1.5 border-b border-slate-800 py-2.5 pl-3 pr-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">메뉴 검색</span>
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="메뉴 검색..."
            className="h-10 w-full rounded-lg border border-slate-700 bg-slate-800 pl-8 pr-2 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-indigo-500"
          />
        </label>
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"
          aria-label="아이콘 레일로 접기"
          title="아이콘 레일로 접기"
          onClick={() => setTreeOpen(false)}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
        {nodes.map(({ item, segments }) => {
          const Icon = item.icon;
          const hasChildren = segments.length > 0;
          const isExpanded = isSearching || !collapsed[item.key];
          const isActive = activeNav === item.key;
          return (
            <li key={item.key} className="flex flex-col gap-1">
              <button
                type="button"
                disabled={!item.enabled}
                aria-current={isActive && !hasChildren ? "page" : undefined}
                aria-expanded={hasChildren ? isExpanded : undefined}
                title={item.enabled ? undefined : "준비 중입니다"}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-semibold",
                  isActive && !hasChildren
                    ? "bg-indigo-600 text-white"
                    : "text-slate-200 hover:bg-slate-800",
                  !item.enabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
                )}
                onClick={() => {
                  if (hasChildren) {
                    setCollapsed((prev) => ({ ...prev, [item.key]: isExpanded }));
                  } else {
                    pickNav(item.key);
                  }
                }}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 whitespace-nowrap">{item.label}</span>
                {hasChildren ? (
                  isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )
                ) : null}
              </button>

              {hasChildren && isExpanded ? (
                <ul className="ml-[18px] flex flex-col gap-0.5 border-l border-slate-700 pl-2">
                  {segments.map((key) => {
                    const { label, icon: ChildIcon } = SEGMENT_META[key];
                    const locked = isSegmentLocked(key);
                    const isChildActive =
                      isActive &&
                      isSubActive(item.key, key, segment, scheduleSegment) &&
                      (item.key === "schedule" || item.key === "process" || panelStep === "detail");
                    const count = segmentCounts[key];
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          disabled={locked}
                          aria-current={isChildActive ? "page" : undefined}
                          title={locked ? "로그인 후 사용할 수 있습니다" : undefined}
                          className={cn(
                            "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-semibold",
                            isChildActive
                              ? "bg-indigo-600 text-white"
                              : "text-slate-200 hover:bg-slate-800",
                            locked && "cursor-not-allowed opacity-50 hover:bg-transparent",
                          )}
                          onClick={() => pickSegment(item.key, key)}
                        >
                          <ChildIcon className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="min-w-0 flex-1 whitespace-nowrap">{label}</span>
                          {locked ? <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                          {count !== undefined ? (
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                                isChildActive ? "bg-black/30" : "bg-slate-800",
                              )}
                            >
                              {count}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="border-t border-slate-800 p-3">
        <AuthHeader />
      </div>
    </nav>
  );
}
