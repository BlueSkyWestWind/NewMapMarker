"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Ellipsis, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthHeader } from "@/features/map-marker/components/sidebar/auth-header";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { PanelBody, type PanelBodyProps } from "@/features/shell/components/panel-body";
import { useShellNav } from "@/features/shell/hooks/use-shell-nav";
import {
  activeMobileTab,
  hasNavSegments,
  mobileMoreItems,
  mobileTabItems,
  SEGMENT_META,
  segmentsOfNav,
  showsMarkerSummary,
  subLabelOf,
  type MobileTabKey,
} from "@/features/shell/lib/nav-model";
import {
  nearestSheetSnap,
  nextSheetSnap,
  SHEET_FULL_GAP_PX,
  SHEET_PEEK_PX,
  sheetSnapOnNavigate,
  type SheetSnap,
} from "@/features/shell/lib/sheet-snap";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import { NAV_ITEMS, type NavKey } from "@/features/shell/types/nav";
import type { NavSubKey } from "@/features/shell/types/segment";

const SNAP_HEIGHT: Record<SheetSnap, string> = {
  peek: `${SHEET_PEEK_PX}px`,
  half: "50%",
  full: `calc(100% - ${SHEET_FULL_GAP_PX}px)`,
};

const HANDLE_LABEL: Record<SheetSnap, string> = {
  peek: "시트 절반으로 올리기",
  half: "시트 전체로 올리기",
  full: "시트 내리기",
};

/** 이만큼 움직여야 끌기로 본다. 그보다 작으면 누른 것이다. */
const DRAG_THRESHOLD_PX = 4;

interface MobileSheetProps extends PanelBodyProps {
  countSummary: string;
  segmentCounts: Partial<Record<NavSubKey, number>>;
}

/**
 * 지도 위 하단 시트. 모달이 아니라 열려 있어도 지도를 조작할 수 있다.
 * 부모(지도 영역)를 기준으로 높이를 잡으므로 `relative` 부모 안에 둔다.
 */
export function MobileSheet({ countSummary, segmentCounts, ...bodyProps }: MobileSheetProps) {
  const { activeNav, segment } = bodyProps;
  const { authed, isAdmin, pickNav, pickSegment, isSegmentLocked } = useShellNav();
  const snap = useShellStore((state) => state.sheetSnap);
  const setSnap = useShellStore((state) => state.setSheetSnap);
  const panelStep = useShellStore((state) => state.panelStep);
  const setPanelStep = useShellStore((state) => state.setPanelStep);
  const scheduleSegment = useShellStore((state) => state.scheduleSegment);
  const isMoreOpen = useShellStore((state) => state.isMoreOpen);
  const setMoreOpen = useShellStore((state) => state.setMoreOpen);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);

  // 항목을 고르거나 지도에서 찍을 때는 지도가 보여야 한다.
  useEffect(
    () =>
      useMapMarkerStore.subscribe((state, prev) => {
        const picked =
          (state.selectedMarkerId && state.selectedMarkerId !== prev.selectedMarkerId) ||
          (state.placeSearch && state.placeSearch !== prev.placeSearch) ||
          (state.mapPickMode === "place" && prev.mapPickMode !== "place");
        if (picked) setSnap("peek");
      }),
    [setSnap],
  );

  const onHandleDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startY: event.clientY,
      startHeight: sheetRef.current?.offsetHeight ?? SHEET_PEEK_PX,
      moved: false,
    };
  };

  const onHandleMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = drag.startY - event.clientY;
    if (!drag.moved && Math.abs(delta) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    const area = sheetRef.current?.parentElement?.clientHeight ?? 0;
    setDragHeight(
      Math.min(Math.max(drag.startHeight + delta, SHEET_PEEK_PX), area - SHEET_FULL_GAP_PX),
    );
  };

  const onHandleUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.moved) {
      const area = sheetRef.current?.parentElement?.clientHeight ?? 0;
      setSnap(nearestSheetSnap(drag.startHeight + (drag.startY - event.clientY), area));
    } else {
      setSnap(nextSheetSnap(snap));
    }
    setDragHeight(null);
  };

  const hasSegments = hasNavSegments(activeNav);
  const isRoot = !isMoreOpen && hasSegments && panelStep === "root";
  const isDetail = !isMoreOpen && !isRoot;
  const navLabel = NAV_ITEMS.find((item) => item.key === activeNav)?.label ?? "";
  const title = isMoreOpen
    ? "더보기"
    : hasSegments && !isRoot
      ? subLabelOf(activeNav, segment, scheduleSegment)
      : navLabel;
  const isMoreItem = mobileMoreItems(true, isAdmin).some((item) => item.key === activeNav);
  const hasBack = !isMoreOpen && ((hasSegments && !isRoot) || isMoreItem);
  const description =
    snap !== "peek" && isDetail && showsMarkerSummary(activeNav, segment) ? countSummary : "";

  const raiseIfPeek = () => {
    if (snap === "peek") setSnap("half");
  };

  return (
    <section
      ref={sheetRef}
      aria-label={title}
      className={cn(
        "absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border border-b-0 border-slate-700 bg-slate-950 text-slate-100",
        dragHeight === null && "transition-[height] duration-200 motion-reduce:transition-none",
      )}
      style={{ height: dragHeight ?? SNAP_HEIGHT[snap] }}
    >
      <button
        type="button"
        aria-label={HANDLE_LABEL[snap]}
        title={HANDLE_LABEL[snap]}
        className="flex h-6 w-full shrink-0 touch-none items-center justify-center"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragHeight(null);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          setSnap(nextSheetSnap(snap));
        }}
      >
        <span className="h-1 w-10 rounded-full bg-slate-500" />
      </button>

      <header className="flex min-h-10 shrink-0 items-center gap-1 pb-2 pl-4 pr-2">
        {hasBack ? (
          <button
            type="button"
            aria-label="뒤로"
            title="뒤로"
            className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center text-slate-300"
            onClick={() => {
              raiseIfPeek();
              if (hasSegments && !isRoot) setPanelStep("root");
              else setMoreOpen(true);
            }}
          >
            <ChevronLeft className="h-[18px] w-[18px]" aria-hidden />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-[17px] font-bold leading-tight">{title}</h1>
          {description ? (
            <p className="mt-0.5 truncate text-xs text-slate-400">{description}</p>
          ) : null}
        </div>
      </header>

      {/* 낮음에서도 내용을 언마운트하지 않는다. 업로드·조회 중인 상태가 사라지면 안 된다. */}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-slate-800",
          snap === "peek" && dragHeight === null && "hidden",
        )}
      >
        {isMoreOpen ? (
          <div className="flex flex-col gap-0.5 p-2">
            {mobileMoreItems(authed, isAdmin).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={!item.enabled}
                  title={item.enabled ? undefined : "준비 중입니다"}
                  className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    setMoreOpen(false);
                    pickNav(item.key);
                    setSnap(
                      sheetSnapOnNavigate({ nav: item.key, isSameTab: false, current: snap }),
                    );
                  }}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                </button>
              );
            })}
            <div className="mt-2 border-t border-slate-800 px-3 pt-3">
              <AuthHeader />
            </div>
          </div>
        ) : isRoot ? (
          <div className="flex flex-col gap-0.5 p-2">
            {segmentsOfNav(activeNav, isAdmin).map((key) => {
              const { label, icon: Icon } = SEGMENT_META[key];
              const locked = isSegmentLocked(key);
              const count = segmentCounts[key];
              return (
                <button
                  key={key}
                  type="button"
                  disabled={locked}
                  className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    pickSegment(activeNav, key);
                    raiseIfPeek();
                  }}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">{label}</span>
                  {locked ? <Lock className="h-4 w-4 shrink-0" aria-hidden /> : null}
                  {count !== undefined ? (
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-bold">
                      {count}
                    </span>
                  ) : null}
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-4">
            <PanelBody {...bodyProps} />
          </div>
        )}
      </div>
    </section>
  );
}

interface MobileBottomNavProps {
  /** 하이드레이션 안전값. 셸이 마운트 전후를 판정해 내려 준다. */
  activeNav: NavKey;
}

/** 모바일 하단 메뉴. 활성 탭을 다시 누르면 시트가 내려간다. */
export function MobileBottomNav({ activeNav }: MobileBottomNavProps) {
  const { authed, isAdmin, pickNav } = useShellNav();
  const snap = useShellStore((state) => state.sheetSnap);
  const setSnap = useShellStore((state) => state.setSheetSnap);
  const isMoreOpen = useShellStore((state) => state.isMoreOpen);
  const setMoreOpen = useShellStore((state) => state.setMoreOpen);

  const activeTab = activeMobileTab(activeNav, isMoreOpen);

  const onPick = (key: MobileTabKey) => {
    const isSameTab = key === activeTab;
    setSnap(
      sheetSnapOnNavigate({
        nav: key === "more" ? activeNav : key,
        isSameTab,
        current: snap,
      }),
    );
    if (isSameTab) return;
    if (key === "more") {
      setMoreOpen(true);
      // 더보기에는 지도 없는 화면도 있지만, 목록 자체는 절반이면 충분하다.
      setSnap("half");
      return;
    }
    setMoreOpen(false);
    pickNav(key);
  };

  const tabs: Array<{ key: MobileTabKey; label: string; icon: typeof Ellipsis }> = [
    ...mobileTabItems(authed, isAdmin).map(({ key, label, icon }) => ({ key, label, icon })),
    { key: "more", label: "더보기", icon: Ellipsis },
  ];

  return (
    <nav
      aria-label="주요 메뉴"
      className="z-40 flex shrink-0 border-t border-slate-800 bg-slate-950 pb-[env(safe-area-inset-bottom)]"
    >
      {tabs.map(({ key, label, icon: Icon }) => {
        const isActive = key === activeTab;
        return (
          <button
            key={key}
            type="button"
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500",
              isActive ? "text-slate-100" : "text-slate-400",
            )}
            onClick={() => onPick(key)}
          >
            <span
              className={cn(
                "flex h-[26px] w-11 items-center justify-center rounded-full",
                isActive && "bg-indigo-600 text-white",
              )}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span className="whitespace-nowrap">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
