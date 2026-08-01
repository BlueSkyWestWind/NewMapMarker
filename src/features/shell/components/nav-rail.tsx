"use client";

import { useEffect } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthHeader } from "@/features/map-marker/components/sidebar/auth-header";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { useHasMounted } from "@/hooks/use-has-mounted";
import { isNavAccessible, visibleNavItems } from "@/features/shell/types/nav";

interface NavRailProps {
  countSummary: string;
}

export function NavRail({ countSummary }: NavRailProps) {
  const hasMounted = useHasMounted();
  const { isAuthenticated } = useAuthSession();
  const activeNav = useMapMarkerStore((state) => state.activeNav);
  const setActiveNav = useMapMarkerStore((state) => state.setActiveNav);

  // 인증 분기는 마운트 이후에만 한다. SSR 결과와 어긋나면 하이드레이션이 깨진다.
  const authed = hasMounted && isAuthenticated;
  const items = visibleNavItems(authed);

  // 로그아웃했는데 보고 있던 메뉴가 숨김 대상이면 빈 화면이 남는다.
  // persist로 복원된 값도 여기서 함께 걸러진다.
  useEffect(() => {
    if (!hasMounted) return;
    if (!isNavAccessible(activeNav, authed)) {
      setActiveNav("dashboard");
    }
  }, [hasMounted, authed, activeNav, setActiveNav]);

  return (
    <nav
      // 768px 미만에서는 아이콘만 남긴다. 폭 값 자체는 셸이 CSS 변수로 내려 준다.
      className="flex h-full w-[var(--rail-w)] shrink-0 flex-col border-r border-slate-800 bg-slate-950/95 text-slate-100 max-md:w-14"
      aria-label="주요 메뉴"
    >
      <div className="border-b border-slate-800 px-3 py-3 max-md:px-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
          <div className="min-w-0 max-md:hidden">
            <p className="truncate text-sm font-bold leading-tight">
              MapMarker <span className="text-indigo-400">Pro</span>
            </p>
            <p
              className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-slate-500"
              title={countSummary}
            >
              {countSummary}
            </p>
          </div>
        </div>
      </div>

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.key;
          const isDisabled = !item.enabled;

          return (
            <li key={item.key}>
              <button
                type="button"
                disabled={isDisabled}
                aria-current={isActive ? "page" : undefined}
                title={isDisabled ? "준비 중입니다" : undefined}
                className={cn(
                  "flex h-10 w-full items-center gap-2 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition-colors",
                  "max-md:justify-center max-md:px-0",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                  isActive
                    ? "bg-indigo-600 text-white shadow-glow"
                    : "text-slate-400 hover:text-slate-200",
                  isDisabled && "cursor-not-allowed opacity-50 hover:text-slate-400",
                )}
                onClick={() => {
                  if (!isDisabled) setActiveNav(item.key);
                }}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="max-md:hidden">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* 잠긴 메뉴를 숨기므로 로그인 진입점이 반드시 보여야 한다. */}
      <div className="border-t border-slate-800 p-3">
        <AuthHeader />
      </div>
    </nav>
  );
}
